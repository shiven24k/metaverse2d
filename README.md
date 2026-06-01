# Metaverse 2D

A multiplayer 2D pixel-space metaverse built with React, Express, WebSockets, and PostgreSQL.

Players create spaces, decorate with furniture, walk around together, chat, do emotes, complete quests, collect seasonal items, and build neighbourhoods — all in a shared 2D grid canvas.

---

## Table of Contents

- [Architecture](#architecture)
- [Quick Start](#quick-start)
- [Auth](#auth)
- [API Reference](#api-reference)
- [WebSocket Protocol](#websocket-protocol)
- [In-Game Controls](#in-game-controls)
- [Canvas Editor](#canvas-editor)
- [Avatar System](#avatar-system)
- [Development Guide](#development-guide)
- [Environment Variables](#environment-variables)
- [Features Status](#features-status)
- [Known Issues](#known-issues)
- [Roadmap](#roadmap)

---

## Architecture

```
metaverse2d/
├── meta/
│   ├── apps/
│   │   ├── frontend/    React 19 + Vite (port 5173)
│   │   ├── http/        Express REST API (port 3000)
│   │   └── ws/          WebSocket server (port 3001)
│   └── packages/
│       └── db/          Prisma schema + migrations + seed
```

| Service | Tech | Port |
|---------|------|------|
| Frontend | React 19, Vite, React Router, Zustand | 5173 |
| HTTP API | Express, Prisma, Better Auth, Multer | 3000 |
| WebSocket | ws, ioredis (optional Redis scaling) | 3001 |
| Database | PostgreSQL | 5432 |

---

## Quick Start

**Prerequisites:** Node.js >= 18, pnpm, PostgreSQL running on `localhost:5432`.

```sh
# 1. Install dependencies (from repo root)
pnpm install

# 2. Set up database
cd meta/apps/http
cp .env.example .env      # edit DATABASE_URL if needed
pnpm db:migrate           # run Prisma migrations
pnpm db:seed              # seed items, elements, maps, avatars

# 3. Start all services (from meta/)
cd ../..
pnpm dev                  # runs frontend :5173, http :3000, ws :3001
```

Open **http://localhost:5173**, sign up, and join a space.

---

## Auth

Uses [better-auth](https://better-auth.vercel.app) with email + password and Bearer tokens.

| Action | Endpoint |
|--------|----------|
| Sign up | `POST /api/auth/sign-up/email` |
| Sign in | `POST /api/auth/sign-in/email` |
| Auth header | `Authorization: Bearer <token>` |

The token is returned in the `set-auth-token` response header on sign-in.

---

## API Reference

### Spaces

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/space/:id` | — | Get space with elements and placed items |
| POST | `/api/v1/space` | yes | Create a new space |
| DELETE | `/api/v1/space/:id` | yes | Delete a space |
| GET | `/api/v1/space/public` | — | List all public spaces |
| POST | `/api/v1/space/element` | yes | Place a single element |
| POST | `/api/v1/space/element/batch` | yes | Batch-place elements (max 100) |
| PUT | `/api/v1/space/element/:id/move` | yes | Move an element |
| DELETE | `/api/v1/space/element` | yes | Delete an element |
| POST | `/api/v1/space/place` | yes | Place item from inventory |
| POST | `/api/v1/space/place/batch` | yes | Batch-place items (max 50) |
| PUT | `/api/v1/space/placed/:id/move` | yes | Move a placed item |
| DELETE | `/api/v1/space/placed/:id` | yes | Delete a placed item |

### Items & Inventory

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/items` | — | Full item catalog |
| GET | `/api/v1/inventory` | yes | User's owned items |
| POST | `/api/v1/inventory/demo` | yes | Grant demo inventory (dev only) |
| GET | `/api/v1/elements` | — | List all element types |

### Economy

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/wallet` | yes | Coin/token/star balances |
| GET | `/api/v1/gift/status` | yes | Daily gift status |
| POST | `/api/v1/gift/claim` | yes | Claim daily gift (1 item + 50 coins) |
| GET | `/api/v1/shop/daily` | — | 3 rotating daily shop items |
| POST | `/api/v1/shop/buy` | yes | Buy an item (deducts coins) |

### Social

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/player/:userId` | — | Public player profile |
| GET | `/api/v1/guestbook/:spaceId` | — | Last 20 guestbook entries |
| POST | `/api/v1/guestbook/:spaceId` | yes | Post a guestbook entry (max 200 chars) |
| DELETE | `/api/v1/guestbook/:entryId` | yes | Delete an entry (owner or author) |
| GET | `/api/v1/quests/active` | yes | Active quests with progress |
| POST | `/api/v1/quests/progress` | yes | Update quest progress |
| POST | `/api/v1/report` | yes | Report a user |
| GET | `/api/v1/neighbourhood` | yes | Get/auto-join neighbourhood (groups of 8) |

### Seasons & Collection

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/season/current` | — | Current season with days remaining |
| GET | `/api/v1/collection` | yes | Full catalog with `owned: bool` per item |

### User & Avatars

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/user/me` | yes | Current user (id, username, role, email, avatarId) |
| GET | `/api/v1/user/avatars` | — | List all available avatars |
| POST | `/api/v1/user/metadata` | yes | Set user's avatarId |

### Maps & Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/maps` | — | List map templates |
| POST | `/api/v1/upload` | yes | Upload image (png, jpg, gif, webp, svg) |

### Admin

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/admin/item` | admin | Create a new item |
| POST | `/api/v1/admin/element` | admin | Create a new element type |
| PUT | `/api/v1/admin/element/:elementId` | admin | Update an element |
| GET | `/api/v1/admin/reports` | admin | View user reports |
| POST | `/api/v1/admin/ban/:userId` | admin | Ban a user |
| POST | `/api/v1/admin/unban/:userId` | admin | Unban a user |
| POST | `/api/v1/admin/season` | admin | Create a new season |

### Billing (Stripe scaffold)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/billing/subscribe` | yes | Start a subscription (requires Stripe keys) |

---

## WebSocket Protocol

Connect to `ws://localhost:3001` with `?token=<bearer_token>&spaceId=<id>`.

### Client → Server

| `type` | Payload | Description |
|--------|---------|-------------|
| `move` | `{ x, y }` | Move to grid cell |
| `emote` | `{ emoji, x, y }` | Trigger an emote |
| `chat` | `{ message }` | Send a chat message |
| `interact` | `{ itemId }` | Interact with a placed item |
| `element-placed` | `{ element }` | Broadcast element placement to room |
| `item-placed` | `{ item }` | Broadcast item placement to room |
| `element-deleted` | `{ elementId }` | Broadcast element deletion |
| `item-deleted` | `{ placedItemId }` | Broadcast item deletion |
| `element-moved` | `{ elementId, x, y }` | Broadcast element move |
| `item-moved` | `{ placedItemId, x, y }` | Broadcast item move |

### Server → Client

| `type` | Payload | Description |
|--------|---------|-------------|
| `space-joined` | `{ users: [{userId, x, y, username, avatarId}] }` | Initial state on join |
| `user-joined` | `{ userId, x, y, username, avatarId }` | New user arrived |
| `user-left` | `{ userId }` | User disconnected |
| `movement` | `{ userId, x, y }` | User moved |
| `emoted` | `{ userId, emoji, x, y }` | User emoted |
| `chat` | `{ userId, message }` | Chat message |
| `interacted` | `{ userId, itemId }` | Item interaction |
| `element-placed` / `item-placed` / `element-deleted` / `item-deleted` / `element-moved` / `item-moved` | varies | Editor sync relay |

---

## In-Game Controls

### Movement

| Input | Action |
|-------|--------|
| Arrow keys | Move one cell per press |
| Click ground | Click-to-walk via BFS pathfinding around obstacles |

Movement uses a 150ms ease-out lerp animation between cells, direction-facing sprites, a 2-frame walk cycle, and a 3px vertical bob during movement.

### Communication

| Input | Action |
|-------|--------|
| `Enter` | Open chat input |
| `Enter` (while typing) | Send message (4-second bubble) |
| `Esc` (while typing) | Cancel chat |
| `1`–`6` | Trigger emote (👋 💃 🧘 😴 🎉 ❤️) |

### Interaction

| Input | Action |
|-------|--------|
| Click placed item (explore mode) | Show floating text + WS broadcast |
| Click another player | Popup with "View Profile" |

---

## Canvas Editor

Activate edit mode via the **Edit** button in the header.

### Tools

| Tool | How to activate | Behaviour |
|------|----------------|-----------|
| Paint brush | Select any element/item | Click or drag to place continuously (120ms throttle) |
| Eraser | `E` key or 🧹 button | Click or drag to delete elements/items |
| Move tool | Click a selected element/item, then drag | Repositions it with a green dashed preview |

### Selection

| Input | Action |
|-------|--------|
| Click element/item | Select it |
| Click+drag on empty canvas | Rubber-band multi-select (purple dashed highlight) |
| `Delete` / `Backspace` | Delete selected item(s) |
| `Esc` | Deselect / clear selection rectangle |
| Right-click | Delete element/item under cursor |

### History

| Input | Action |
|-------|--------|
| `Ctrl+Z` | Undo (snapshot-based, 50-action history) |
| `Ctrl+Shift+Z` | Redo |

Undo/redo uses diff-based reconciliation — computes what changed and calls inverse API endpoints to keep server state in sync.

### Other

- **Layer toggle** — FLOOR / WALL for item placement
- **+ New Map button** — Opens modal with name, dimensions (10×10 to 50×50), and template picker
- **WS broadcast** — All placements, deletions, and moves are relayed to other users in the room in real time
- **Server-side collision validation** — Returns 409 on overlap; client-side `isAreaFree` is a first-pass filter
- **Batch placement** — Paint brush strokes are buffered and flushed every 300ms (or on mouse-up) via batch endpoints

### Keyboard shortcut hint bar

```
[E] Eraser · [Esc] Deselect · [Ctrl+Z] Undo · Click/drag to place
```

---

## Avatar System

Three pixel character sprites, each a 128×96 sprite sheet (4 directions × 2 walk frames, 32×48 per frame).

| Avatar | Description |
|--------|-------------|
| Default | Blue shirt, brown hair, dark pants |
| Ninja | Black suit, red headband, visible eyes only |
| Wizard | Purple robe, pointed hat, white beard, wooden staff |

Direction-to-column mapping: `0=down, 1=left, 2=right, 3=up`.

To regenerate sprite sheets:
```sh
node scripts/generate-avatars.mjs   # requires @napi-rs/canvas
```

Avatar selection is available via the **Avatar** button in the game header, and also on the profile page when viewing your own profile. The chosen `avatarId` is stored on the user record and broadcast to other players on join.

---

## Development Guide

### Run all services

```sh
cd meta
pnpm dev          # turborepo — runs frontend, http, ws concurrently
pnpm build        # type-check + build all apps
pnpm lint         # ESLint on all apps
```

### Run individual services

```sh
cd meta/apps/frontend && pnpm dev   # Vite HMR on :5173
cd meta/apps/http     && pnpm dev   # Express on :3000 (tsx watch)
cd meta/apps/ws       && pnpm dev   # WebSocket on :3001 (tsx watch)
```

### Database commands (from `meta/apps/http`)

```sh
pnpm db:migrate   # apply Prisma migrations
pnpm db:seed      # seed default data (10 items, 8 elements, 2 maps, 3 avatars)
pnpm db:studio    # open Prisma Studio
```

### Seed data summary

- **Items (10):** furniture — bed, desk, lamp, bookshelf, plant, sofa, table, chair, rug, mirror
- **Elements (8):** grass, wall, water, sand, stone, wood floor, lava, ice
- **Map templates (2):** Starter Room, Garden
- **Avatars (3):** Default, Ninja, Wizard

---

## Environment Variables

| Variable | Default | App |
|----------|---------|-----|
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/metaverse` | http, ws |
| `BETTER_AUTH_SECRET` | — | http, ws |
| `CORS_ORIGIN` | `http://localhost:5173,http://localhost:5174` | http |
| `VITE_WS_URL` | `ws://localhost:3001` | frontend |
| `VITE_API_URL` | `http://localhost:3000` | frontend |
| `USE_REDIS_ROOMS` | `false` | ws |
| `REDIS_URL` | — | ws (when `USE_REDIS_ROOMS=true`) |
| `STRIPE_SECRET_KEY` | — | http (Phase 4) |
| `STRIPE_WEBHOOK_SECRET` | — | http (Phase 4) |

`CORS_ORIGIN` accepts comma-separated origins (Vite falls back to port 5174 when 5173 is busy).

---

## Features Status

```
Core
✅ PostgreSQL + Prisma (9 migrations)
✅ Better Auth — email/password, Bearer tokens
✅ Role-based access (Admin / User)
✅ React Router with auth guards
✅ Zustand — authStore + gameStore
✅ Turborepo monorepo

Multiplayer
✅ WebSocket — join, move, emotes, chat, interact
✅ WS reconnect with 3-retry exponential backoff
✅ Smooth movement animation (lerp + walk cycle + click-to-walk BFS)
✅ Pixel avatar sprites — 3 characters, 4 directions, 2-frame walk
✅ Username labels above avatars
✅ RedisRoomManager — horizontal WS scaling (USE_REDIS_ROOMS=true)

Spaces & Editor
✅ Create / delete spaces (10×10 to 50×50)
✅ Map templates with element pre-population
✅ Canvas editor — paint brush, eraser, move tool, layer toggle
✅ Batch placement (100 elements / 50 items per request)
✅ Undo/redo (50-step, diff-based API sync)
✅ Rubber-band multi-select, Delete/Backspace group delete
✅ Server-side collision validation
✅ WS real-time editor sync to other users
✅ In-editor map creation modal

Economy
✅ Wallet (coins, tokens, stars)
✅ Daily gift — 1 item + 50 coins, streak milestones (7/14/21-day Rare, 28-day Legacy)
✅ Daily rotating shop (3 items)
✅ Inventory — item ownership + placement CRUD

Social
✅ Public player profiles
✅ Per-space guestbook (post/read/delete, 200-char limit)
✅ 6 emotes (1–6 keys, floating emoji, WS broadcast)
✅ Chat bubbles (Enter to type/send, 4-second display)
✅ Quest system — progress tracking + coin/item rewards
✅ User reporting + admin moderation queue
✅ Ban/unban system (checked on WS join)
✅ Neighbourhood auto-assign (groups of 8)

Retention
✅ Seasonal system — time-limited items, current season API
✅ Collection book — full catalog with owned flag per user
✅ Billing scaffold (Stripe-ready, subscribe endpoint)

Creator / Admin
✅ File upload (png, jpg, gif, webp, svg) — stored in uploads/, served as static files
✅ Creator Studio tab — upload + preview in lobby
✅ Admin item creation from uploaded image
✅ Admin element management (create/update)

Pending
⬜ Mobile / touch controls
⬜ CDN (Cloudflare R2) for assets
⬜ User item submissions + marketplace
⬜ PgBouncer connection pooling
⬜ Grafana / Sentry observability
⬜ Docker + deployment config
```

---

## Known Issues

- Avatar change requires a page refresh or WS reconnect for other users to see the update.
- No guest/anonymous mode — most features require auth.
- "Load Demo Items" (`POST /api/v1/inventory/demo`) is a dev/testing shortcut, not intended for production.
- WS server uses `any` types for message payloads — no runtime schema validation.
- Server-side collision detection is grid-cell-level only (no sub-tile precision).

---

## Roadmap

See [ROADMAP.md](./ROADMAP.md) for the full phase-by-phase development history and upcoming plans.

| Phase | Name | Status |
|-------|------|--------|
| 0 | Foundation — monorepo, DB, basic arena | ✅ Done |
| 1 | Playable Core — login UI, React Router, Zustand | ✅ Done |
| 2 | Inventory & Economy — items, coins, shop, placement | ✅ Done |
| 3 | Social Layer — profiles, guestbook, emotes, quests | ✅ Done |
| 4 | Retention Loop — seasons, streaks, neighbourhood, billing | ✅ Done |
| 5 | Scale & Polish — Redis WS, CDN, mobile, marketplace | In progress |
