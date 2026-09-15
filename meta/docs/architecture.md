# Metaverse2D — Architecture

This document describes how the four deployable units of the monorepo fit together, how a request and a WebSocket message flow through the system, and how the pieces are deployed today.

---

## 1. System overview

```
                        ┌────────────────────────────────────────────────┐
                        │                Browser (SPA)                  │
                        │   React 19 + Vite on :5173                    │
                        │   canvas game · lobby · marketing pages       │
                        │   PeerManager (WebRTC: RTCPeerConnection)     │
                        └──────┬───────────────┬────────────────┬───────┘
                               │ REST (fetch)  │ WS (JSON msgs) │ WebRTC media
                               │               │                │ (peer-to-peer)
                    ┌──────────▼──────┐   ┌────▼─────┐          │
                    │ HTTP service    │   │ WS       │          │
                    │ Express :3000   │   │ service  │          │
                    │ /api/auth/*     │   │ :3001    │          │
                    │ /api/v1/*       │   │ (or same │          │
                    │ /uploads/*      │   │ process  │          │
                    │ + WS upgrade ✓  │   │ as HTTP) │          │
                    └──────────┬──────┘   └────┬─────┘          │
                               │               │                │
                               │   ┌───────────▼───────────┐    │
                               │   │  @repo/db (Prisma)     │   │
                               │   │  PostgreSQL :5432      │   │
                               │   └───────────────────────┘    │
                               │        (optional Redis for    │
                               │         USE_REDIS_ROOMS=true) │
                               └───────────────────────────────► (media never
                                                                  touches servers)
```

### The four units

| Unit | Path | Port (dev) | Role |
|------|------|-----------|------|
| **Frontend** | `meta/apps/frontend` | 5173 | React 19 SPA: canvas world, lobby, auth, marketing pages |
| **HTTP API** | `meta/apps/http` | 3000 | Express REST + better-auth + static uploads. **Also upgrades to WebSocket on the same port** |
| **WebSocket** | `meta/apps/ws` | 3001 | Standalone WS server sharing the same `User.ts` logic |
| **Database** | `meta/packages/db` | 5432 | Prisma client, schema, migrations, seed |

There is **no API gateway** — the SPA calls the HTTP service directly and opens a raw WebSocket. There is no message broker in the default path; Redis is optional (`USE_REDIS_ROOMS=true`) for horizontal WS scaling.

---

## 2. The HTTP service (`apps/http`)

`src/index.ts` wires the Express app:

1. CORS for `CORS_ORIGIN` (comma-separated), with a defensive catch-all preflight handler.
2. `app.all("/api/auth/*", toNodeHandler(auth))` — every auth route (sign-up, sign-in, OAuth, sign-out, sessions) is handled by **better-auth**.
3. `app.use("/uploads", express.static(...))` — uploaded images served statically.
4. `app.use("/api/v1", router)` — all business logic lives under `/api/v1`.
5. `attachWsServer(server)` — **the same Node HTTP server also accepts WebSocket upgrades** (see §5).

Auth details: better-auth with `bearer()` + `username()` plugins, email/password enabled, optional Google/GitHub OAuth. On sign-up a `databaseHooks.user.create.after` hook grants **2 copies of every Common-rarity item** to the new account (see `src/lib/auth.ts`).

Protected routes use two middleware (`src/middleware/`):

- `userMiddleware` — resolves the bearer token via `auth.api.getSession()`, sets `req.userId` / `req.role`, else 403.
- `adminMiddleware` — same, but additionally requires `role === "Admin"`.

---

## 3. The WebSocket service

There are **two entry points** but **one shared core**:

| Entry | How WS is attached | Default port |
|-------|--------------------|--------------|
| `apps/ws/src/index.ts` | `new WebSocketServer({ port: 3001 })` | 3001 |
| `apps/http/src/ws-server.ts` | `new WebSocketServer({ noServer: true })` attached to the Express HTTP server | 3000 |

Both construct the exact same `User` class (`apps/ws/src/User.ts`) per connection. This is why the frontend default `VITE_WS_URL` in `Game.tsx` is `ws://localhost:3000` — the HTTP process already speaks WebSocket — while the standalone `ws` app (3001) exists for when you want to split them.

The `ws` process additionally runs three background loops:

| Loop | Interval | Purpose |
|------|----------|---------|
| `npcTick` | 500 ms | Move NPCs (STATIC/PATROL/WANDER), persist positions, broadcast `npc-moved` |
| AFK detection | 30 s | Mark idle users (>180 s) with the `afk` status emote |
| Keepalive | 30 s | `socket.ping()` to defeat Cloudflare idle-timeout |

`index.ts` (ws) and `ws-server.ts` (http) have **duplicated** NPC logic today — both define their own `npcTick`, `stepToward`, etc. The HTTP copy adds blocking-cell awareness (`tryStep` + `getBlockingCells`); the ws copy has walkable-spawn recovery (`spiralFindWalkable`). They should be unified into one shared module.

---

## 4. How a REST request flows

```
Browser                        Express (:3000)                Prisma / PostgreSQL
   │  POST /api/v1/shop/buy       │                                │
   │  Authorization: Bearer ...   │                                │
   │─────────────────────────────>│  shopRouter (v1/shop.ts)       │
   │                              │  userMiddleware                │
   │                              │   └ auth.api.getSession()      │
   │                              │   └ req.userId / req.role      │
   │                              │  validate body / find item      │
   │                              │  wallet balance check           │
   │                              │  $transaction:                 │
   │                              │   └ wallet.update ────────────>│
   │                              │   └ inventoryItem.upsert ─────>│
   │<──────────── 200 {message} ──│                                │
```

Every authenticated endpoint is: **middleware → validate (zod or manual) → ownership check → single or transactional write → JSON response**. Ownership checks are pervasive — most space-scoped mutations require `space.creatorId === req.userId`.

---

## 5. How a WebSocket message flows

```
Browser                          WS server                          Other browsers
   │  { "type": "move",          │                                     │
   │    "payload": {x,y} }       │                                     │
   │─────────────────────────────>│  User.processMove()                 │
   │                              │   adjacency + bounds check            │
   │                              │   blocking-cell check (cache)       │
   │                              │   update this.x/y                   │
   │                              │  broadcast {movement} ─────────────>│
   │<── "movement-rejected" (or)  │                                     │
```

Message dispatch is a `switch (parsedData.type)` in `User.ts`. Each `User` belongs to exactly one room (`spaceId`), tracked in a `RoomManager` (`Map<spaceId, User[]>`). Movement is **serialised** — incoming `move` messages are chained on `this.lastMove` so concurrent messages can't read stale `x/y`.

### RTC signaling path (server is a dumb relay)

`rtc:offer / rtc:answer / rtc:ice` are forwarded verbatim to the peer found by `userId` in the same room. `rtc:knock` / `rtc:knock-accept` / `rtc:knock-deny` likewise. **Media never touches the server** — after negotiation, browsers talk peer-to-peer via STUN/TURN.

Conference rooms and broadcast zones are **in-memory** (`conferenceRooms`, `broadcastZones` module maps in `User.ts`) — ephemeral, lost on restart. Proximity chat is backed by Postgres (`ProximityRoom` / `ProximityChatMessage`).

---

## 6. Data & state summary

| Concern | Where it lives |
|---------|----------------|
| Users, sessions, spaces, items, inventory, wallet, gifts, quests, reports, bans, seasons, neighbourhoods, NPCs, portals, members, invites, kanban, proximity chat | PostgreSQL via Prisma |
| Live room membership, positions | `RoomManager` memory (or Redis pub/sub when `USE_REDIS_ROOMS=true`) |
| Conference rooms, broadcast zones | module-level `Map`s in `User.ts` (in-memory) |
| WebRTC peer connections | `PeerManager` per browser (never a server) |
| Uploaded files | `apps/http/uploads/` served at `/uploads/*` |

---

## 7. Deployment topology

The repo ships a full production deployment kit under `meta/deploy/` plus a pm2 config at `meta/ecosystem.config.js`. Two frontend hosting paths are referenced (nginx static hosting **or** Cloudflare Pages — both are in the CORS allowlist).

### `meta/deploy/` — the deployment assets

| File | What it does |
|------|--------------|
| `deploy.sh` | One-shot deploy script (Oracle VM): creates 2 GB swap on first run → installs pm2 → `pnpm install --frozen-lockfile` → `prisma generate` → applies every migration via a `psql` loop → `db seed` → builds `http` **and** `frontend` → `pm2 startOrRestart ecosystem.config.js --env production` |
| `nginx.conf` | Two server blocks. **`api.*`**: proxies *all* traffic (REST **and** WS upgrades — `Upgrade`/`Connection` headers + 86,400 s read timeout) to the single Node process on `127.0.0.1:3000`. **Frontend domain**: serves `apps/frontend/dist` statically with 30-day immutable caching for images, 7-day for JS/CSS, and an SPA `try_files ... /index.html` fallback |
| `backend.service` | Alternative **systemd** unit: runs `node dist/index.js` for the HTTP API on :3000 (`EnvironmentFile=apps/http/.env`, `Restart=always`) |
| `ws.service` | Alternative **systemd** unit: runs the standalone WebSocket app (`apps/ws/dist/index.js`) on :3001 |
| `setup-swap.sh` | Creates a persistent 2 GB swapfile (Oracle free-tier VMs are RAM-poor) |
| `upload-to-r2.sh` | **Phase-5 CDN**: regenerates sprites, then `aws s3 sync`s `frontend/public/tiles`, `frontend/public/items`, and `http/uploads/defaults` to a Cloudflare R2 bucket (`R2_ENDPOINT` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` env vars). After upload, builds point at the bucket via `VITE_ASSETS_URL` |

### `ecosystem.config.js` — pm2 (primary path)

A single pm2 app named **`metaverse2d`** running `apps/http/dist/index.js` (the **combined** HTTP + WebSocket process, `PORT=3000`, 1 instance, 800 MB memory-restart). Production env shows: Neon Postgres (`...neon.tech?sslmode=require`), `CORS_ORIGIN` including both the nginx domain (`https://officeverse.shivenco.com`) and Cloudflare Pages (`https://metaverse2d-frontend.pages.dev`), and `BETTER_AUTH_URL` pointed at the `api.*` subdomain.

> **Note:** nginx only proxies to :3000 — the standalone WS app (:3001, `ws.service`) is the **alternative** split-WS deployment, not the default nginx path.

- **Frontend hosting**: two options exist in the repo — nginx static hosting of `apps/frontend/dist` (from `nginx.conf` + `deploy.sh`) or Cloudflare Pages auto-deploy on push to `main` (per `webrtc.md`). Both origins are in the CORS allowlist.
- **Database**: PostgreSQL (Neon in prod). Migrations are plain SQL files applied with a `psql` loop / `prisma db execute`.
- **TURN**: Metered (external) — hardcoded fallback in `PeerManager.ts` plus a dynamic endpoint `GET /api/v1/turn-credentials` that proxies Metered's REST API when `METERED_APP_NAME` + `METERED_API_KEY` are set.

### Ports & environment variables (summary)

| Variable | Default | Used by |
|----------|---------|---------|
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/metaverse` | http, ws, db |
| `BETTER_AUTH_SECRET` | dev fallback hardcoded | http, ws |
| `BETTER_AUTH_URL` / `API_URL` | `http://localhost:3000` | http, ws |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:5174` | http |
| `VITE_API_URL` | `http://localhost:3000` | frontend |
| `VITE_WS_URL` | `ws://localhost:3000` (see §3) | frontend |
| `USE_REDIS_ROOMS` | `false` | ws |
| `REDIS_URL` | `redis://localhost:6379` | ws |
| `METERED_APP_NAME` / `METERED_API_KEY` | — | http (turn-credentials) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | — | http (billing subscribe) |
| `RAZORPAY_WEBHOOK_SECRET` | — | http (billing webhook signature) |
| `GEOIP_FALLBACK` | unset | http (`true` = enable `ipwho.is` country lookup for display currency when not behind Cloudflare) |
| `RESEND_API_KEY` / `RESEND_FROM` | — | http (transactional email / dunning) |
| `ACCESS_DECISION_SECRET` | — | http (signed access-request approve/deny links) |
| `APP_URL` | `http://localhost:5173` | http (email links, dunning) |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | — | http (OAuth) |

---

## 8. Command reference

```bash
cd meta
pnpm install                    # workspace install
npx prisma@6.3.1 generate --schema=packages/db/prisma/schema.prisma
pnpm --filter @repo/db seed     # elements, items, maps, avatars, NPCs
node scripts/generate-tiles.mjs # sprite PNGs
node scripts/generate-avatars.mjs

pnpm dev                        # turbo: frontend :5173 + http :3000 + ws :3001
pnpm build                      # type-check + build all
pnpm test                       # vitest (Prisma mocked)
```

> **Build caveat (from AGENTS.md):** the esbuild bundles cannot find the Prisma native engine at runtime. Run services in **dev mode** (`tsx watch`). The HTTP app *is* reachable in prod as a single Node process because `attachWsServer` shares the same server object.

---

## 9. Tests & shared packages

### Tests (`meta/tests/`, vitest)

Prisma is **mocked** (`tests/__mocks__/db.ts` aliased to `@repo/db/client`), so `pnpm test` needs no database. The vitest runner config lives at `meta/vitest.config.ts` (aliases `@repo/db/client` → the mock).

- `tests/unit/` — pure-logic tests: `roomManager` (add/remove/broadcast), `movement` (adjacency + bounds + integer validation), `gift` (cooldown + streak milestones + atomic claim), `economy` (chest cooldown/TOCTOU), `shop` (pricing + daily seed + atomic debit), `spaceCollision` (AABB/boundary/batch), `npcTick` (stepToward + patrol index clamp).
- `tests/integration/` — supertest against the real Express route handlers with auth middleware mocked: `economy.integration.test.ts` (chest interact), `gift.integration.test.ts` (status/claim/send), `space.integration.test.ts` (move/portal/resize/get).
- `tests/__mocks__/db.ts` — the `vi.fn()` Prisma stub.

Tests assert the current behaviour — including the movement-bounds, join-race, and shop/gift TOCTOU fixes — so a regression on any of those surfaces immediately as a failing test.

### Shared packages (`meta/packages/`)

| Package | Contents |
|---------|----------|
| `packages/db` | Prisma client + schema + migrations + seed (see [database.md](./database.md)) |
| `packages/ui` | Turbo-scaffold React components (`button`, `card`, `code`) — **not used by the frontend** |
| `packages/eslint-config` | ESLint presets (`base`, `next`, `react-internal`) |
| `packages/typescript-config` | TS config presets (`base`, `nextjs`, `react-library`) |

The `ui`, `eslint-config`, and `typescript-config` packages are leftover Turborepo scaffolding — the frontend does not import `@repo/ui`, and the apps mostly rely on their own `tsconfig.json`/`eslint.config.js`. Only `packages/db` is load-bearing.