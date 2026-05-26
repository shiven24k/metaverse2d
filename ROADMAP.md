# Metaverse2D — Full Development Roadmap

> Last updated: May 23, 2026  
> Stack: React + Vite (frontend) · Express (HTTP :3000) · ws (WebSocket :3001) · PostgreSQL + Prisma · pnpm monorepo

---

## Phase Overview

| Phase | Name | Duration | Goal |
|---|---|---|---|
| 0 | Foundation | ✅ Done | Monorepo, DB, basic arena working |
| 1 | Playable Core | ✅ Done | Login UI, React Router, Zustand, arena fixes |
| 2 | Inventory & Economy | ✅ Done | Items, coins, wallet, shop, placement |
| 3 | Social Layer | ✅ Done | Profiles, guestbook, emotes, quests, reports |
| 4 | Retention Loop | ✅ Done | Seasons, collections, streak milestones, neighbourhood, billing scaffold |
| 5 | Scale & Polish | Month 4+ | Redis WS scaling, CDN, mobile, creator marketplace |

---

## Phase 0 — Foundation ✅ Complete

**What was built:**
- pnpm monorepo with 3 apps (frontend, http, ws) + shared `@repo/db` package
- PostgreSQL schema: User, Space, spaceElements, Element, Map, MapElements, Avatar
- JWT auth (signup/signin) with scrypt password hashing
- Role-based access: Admin / User
- REST API: spaces CRUD, elements, avatars, admin routes
- WebSocket server: join room, move, broadcast, disconnect
- Canvas-based 2D arena (2000×2000, 50px grid)
- Arrow-key movement with server-side 1-step validation

**Bugs fixed in this phase:**
- `space-joined` now sends `{userId, x, y}` for each existing user (was sending `{id}` only)
- `movement` broadcast now includes `userId` (was missing — other clients couldn't identify who moved)
- `jwt.verify` crash on empty token wrapped in try-catch — server no longer dies on bad connections
- CORS added to HTTP server (configurable via `CORS_ORIGIN` env var)
- `--env-file=.env` added to both server start scripts

**Known remaining issues going into Phase 1:**
- No login UI — token must be pasted into URL manually
- WS URL hardcoded to `ws://localhost:3001` in Game.tsx
- No `tabIndex` auto-focus on canvas (user must click before arrow keys work)
- Avatar doesn't render until first movement (spawn position shows correctly but no dot until move)

---

## Phase 1 — Playable Core ✅ Complete

**Duration:** Week 1–2  
**Goal:** Anyone can open the app, create an account, and walk around a space — no manual token pasting.

**What was built:**
- AuthPage with sign-in/sign-up tabs, calls Better Auth endpoints, stores token in Zustand + localStorage
- React Router with `/login`, `/lobby`, `/arena` — protected route wrapper redirects to `/login`
- Zustand stores: `authStore` (token, userId, role) + `gameStore` (currentUser, users Map, wsStatus)
- Arena reads WS URL from `VITE_WS_URL` env var (fallback `ws://localhost:3001`)
- Token read from localStorage, auto-redirect to lobby if token exists
- Canvas auto-focuses on mount via ref
- Avatar renders at spawn position immediately on `space-joined`
- WS reconnect logic: 3 retries with exponential backoff, error banner on failure
- Space delete button with confirmation (via existing DELETE /space/:spaceId)

### Deliverable ✅
A friend can visit the URL, sign up, create a space, and walk around — without any manual token work.

---

## Phase 2 — Inventory & Economy ✅ Complete

**Duration:** Week 3–4  
**Goal:** Players can collect items, earn coins, and place furniture in their apartment.

**What was built:**
- Prisma models: Item, InventoryItem, PlacedItem, DailyGift, Wallet + migration
- `GET /api/v1/items` — public catalog
- `GET /api/v1/inventory` — user's owned items (auth)
- `POST /api/v1/admin/item` — create item (admin)
- `GET /api/v1/gift/status` + `POST /api/v1/gift/claim` — daily gift, 1 Common item + 50 coins
- Gift claim button on lobby, greyed out when claimed
- `GET /api/v1/shop/daily` — 3 rotating items (seeded by date)
- `POST /api/v1/shop/buy` — deduct coins, add to inventory
- Shop panel UI in lobby — grid of items with coin price
- `POST /api/v1/space/place` + `DELETE /api/v1/space/placed/:id` — placement CRUD
- `GET /api/v1/space/:spaceId` now returns `placedItems`
- Edit mode toggle in Arena: inventory tray → click grid cell to place
- Placed items render as colored rectangles on canvas
- `GET /api/v1/wallet` — coins/tokens/stars (auto-created on first access)
- Coin balance shown in lobby header

### Deliverable ✅
Players have an inventory, earn coins by playing, claim a daily gift, buy items from the shop, and place them in their space.

---

## Phase 3 — Social Layer ✅ Complete

**Duration:** Month 2  
**Goal:** Players can express themselves, interact with others, and have reasons to visit other spaces.

**What was built:**
- `GET /api/v1/player/:userId` — public profile (username, avatar, space count, join date)
- Profile page at `/profile/:userId` with clickable usernames throughout the app
- GuestbookEntry model + `GET/POST/DELETE /api/v1/guestbook/:spaceId` — max 200 chars, owner/author can delete
- Guestbook sidebar panel in Arena UI — button toggles panel, shows last 20 messages, inline post
- Emotes via WS protocol: inbound `{ type: "emote", payload: { emoteId } }`, broadcast to room
- 6 starter emotes (👋💃🧘😴🎉❤️) with emoji hotbar (click or press 1–6)
- Emotes render as floating emoji above avatar for 2 seconds with fade-out
- Quest + QuestProgress models in Prisma
- `GET /api/v1/quests/active` + `POST /api/v1/quests/progress` — progress tracking with coin/item rewards on completion
- `GET /api/v1/space/public` already lists all spaces (public by default)
- Report + BannedUser models in Prisma
- `POST /api/v1/report` + `GET /api/v1/admin/reports` — user reporting and moderation queue
- `POST /api/v1/admin/ban/:userId` + `POST /api/v1/admin/unban/:userId`
- WS server checks `BannedUser` on join, closes connection if banned

### Deliverable ✅
Players have profiles, can visit each other's spaces, leave guestbook notes, do emotes together, and complete weekly quests.

---

## Phase 4 — Retention Loop ✅ Complete

**Duration:** Month 3  
**Goal:** Players have reasons to return every day and every week, long-term.

**What was built:**
- Season + SeasonalItem Prisma models
- `GET /api/v1/season/current` — current season with days remaining
- `POST /api/v1/admin/season` — create new season with item associations
- `GET /api/v1/collection` — full item catalog with `owned: bool` per user
- Streak milestones in daily gift: 7/14/21-day → Rare item, 28-day → Legacy item
- Streak counter tracked in DailyGift model (pauses on miss, resumes)
- Neighbourhood + NeighbourhoodMember Prisma models
- `GET /api/v1/neighbourhood` — auto-assigns on first access (groups of 8), returns members
- `User.supporter` boolean field
- `POST /api/v1/billing/subscribe` + webhook scaffold (requires Stripe keys)
- Space.thumbnail field already exists in schema

### Deliverable ✅
Players have a daily reason to log in (gift + streak), a weekly reason (quests + seasonal progress), a long-term reason (collection book completion), and an optional way to support the project.

---

## Phase 5 — Scale & Polish
**Duration:** Month 4+  
**Goal:** Handle real user load, go mobile, open creator tools.

### 5.1 WebSocket Horizontal Scaling ✅
**Problem:** Current `RoomManager` is in-process memory — breaks with multiple WS server instances.

**Solution:**
- [x] Install `ioredis`
- [x] Create `RedisRoomManager` that publishes/subscribes to `room:{spaceId}` channels
- [x] Each WS server subscribes to rooms its connected users are in
- [x] Swap via `USE_REDIS_ROOMS=true` env flag — no change to `User.ts` or client code
- [ ] Test with 2 WS instances behind Nginx upstream

### 5.2 CDN for Assets
- [ ] Set up Cloudflare R2 (S3-compatible, free egress)
- [ ] All item/avatar images uploaded to R2, served via CDN URL
- [ ] Image upload endpoint: `POST /api/v1/admin/upload` → returns CDN URL
- [ ] Zero origin hits for any media request

### 5.3 Performance
- [ ] Add connection pooling via PgBouncer (DB)
- [ ] Add read replica for space/item queries (read-heavy)
- [ ] Redis cache for: daily shop rotation, season info, public space list (5-min TTL)
- [ ] WS heartbeat: disconnect idle connections after 5 minutes
- [ ] Room player cap: 20 users per space (already validated, document and enforce)

### 5.4 Mobile Web
- [ ] Touch controls: D-pad overlay on canvas for mobile
- [ ] Pinch-to-zoom on canvas
- [ ] Responsive layout — UI panels slide in from bottom on mobile
- [ ] PWA manifest + service worker for "Add to Home Screen"
- [ ] Test on iOS Safari and Android Chrome

### 5.5 Creator Mode — Uploads & Studio (MVP) ✅
- [x] `GET /api/v1/maps` — public endpoint listing map templates (name, thumbnail, dimensions)
- [x] Map template picker in "Create" tab — select a template to auto-populate space with elements
- [x] Element rendering on canvas — background tiles drawn before placedItems with muted colors
- [x] Create space with `mapId` — existing endpoint already handles template-based creation
- [x] `POST /api/v1/upload` — multipart file upload (png, jpg, gif, webp, svg), stored in `uploads/`, served as static files
- [x] `GET /api/v1/user/me` — returns current user info (id, username, role, email)
- [x] Creator Studio tab in lobby — file picker + upload + preview of uploaded URL
- [x] Admin item creation from uploaded image — name, category, rarity, width/height form
- [ ] User item submissions with admin moderation queue
- [ ] Approved items listed in marketplace, priced in Stars by creator
- [ ] Platform takes 20% cut on each purchase
- [ ] Image upload: hash check against known-bad content before storing

### 5.6 Monitoring & Ops
- [ ] Grafana + Prometheus: HTTP p95 latency, WS connection count, DB query time
- [ ] Sentry for frontend error tracking
- [ ] Automated DB backups: daily snapshot, 30-day retention
- [ ] Uptime monitoring: alert if any service is down > 2 minutes
- [ ] Deployment: Dockerfile for each app, docker-compose for local, Fly.io or Railway for prod

---

## Environment Variables Reference

| Variable | App | Value |
|---|---|---|
| `DATABASE_URL` | http, ws, db | `postgresql://postgres:password@localhost:5432/metaverse` |
| `CORS_ORIGIN` | http | `http://localhost:5173` (dev) / your domain (prod) |
| `VITE_WS_URL` | frontend | `ws://localhost:3001` (dev) / `wss://your-domain` (prod) |
| `VITE_API_URL` | frontend | `http://localhost:3000` (dev) / your domain (prod) |
| `STRIPE_SECRET_KEY` | http | Phase 4 |
| `STRIPE_WEBHOOK_SECRET` | http | Phase 4 |
| `REDIS_URL` | ws | Phase 5 |
| `R2_BUCKET_URL` | http | Phase 5 |

---

## Current Status Snapshot (May 2026)

```
✅ PostgreSQL running (Docker)
✅ All 9 migrations applied
✅ HTTP server running on :3000
✅ WS server running on :3001
✅ Frontend running on :5173
✅ Signup / Signin working
✅ React Router with auth guards
✅ Zustand state management
✅ Space creation & deletion
✅ Multiplayer movement
✅ CORS configured
✅ Item catalog + inventory API
✅ Daily gift system + shop + wallet
✅ Apartment placement (edit mode in Arena)
✅ Player profiles with avatar & space count
✅ Guestbook per space (post/read/delete)
✅ Emotes (6 emoji, WS broadcast, fade animation)
✅ Quest system (progress + rewards)
✅ Reporting & admin moderation
✅ Ban system (WS + API)
✅ Seasonal system (create + current)
✅ Collection book (catalog with owned flag)
✅ Streak milestones (7-day rare, 28-day legacy)
✅ Neighbourhood auto-assign groups of 8
✅ Billing scaffold (Stripe-ready)
✅ RedisRoomManager (ioredis pub/sub, USE_REDIS_ROOMS env toggle)
✅ Map templates + element rendering on canvas
✅ File upload + Creator Studio tab (asset upload + admin item creation)
✅ Interactive items — click placed items in view mode to trigger ✨ on canvas
✅ Element placement in Arena edit mode — toggle Items/Elements, place predefined elements on grid
✅ Seed script — 10 items, 8 elements, 2 map templates, 3 avatars pre-loaded
✅ Native HTML5 DnD (replaced react-dnd — bundle 316 KB → 272 KB)
✅ Right sidebar editor (280px) with Elements/Items tabs instead of bottom tray
✅ Hover preview & selection highlight (dashed border) on canvas
✅ Right-click delete + Delete/Backspace keyboard shortcut in edit mode
✅ Escape to clear selection, click-to-place with overlap checking
✅ Auto-select newly placed elements/items
✅ Canvas ResizeObserver for responsive auto-scale
✅ POST /api/v1/inventory/demo — one-click demo inventory grant
✅ API error messages displayed in editor sidebar footer
⬜ No mobile support
```
