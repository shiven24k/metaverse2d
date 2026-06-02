# Metaverse 2D — Monorepo

Multiplayer 2D pixel metaverse: React canvas frontend + Express REST API + WebSocket server + PostgreSQL. pnpm monorepo managed by Turborepo.

---

## Quick Start

```bash
cd meta

# Install all dependencies
pnpm install

# Generate Prisma client
npx prisma@6.3.1 generate --schema=packages/db/prisma/schema.prisma

# Apply all migrations (requires a running PostgreSQL instance)
psql $DATABASE_URL -f packages/db/prisma/migrations/<each>/migration.sql
# Or run them in order with a loop:
# for f in packages/db/prisma/migrations/*/migration.sql; do psql $DATABASE_URL -f "$f"; done

# Seed default data (elements, items, avatars, maps)
pnpm --filter @repo/db seed

# Generate pixel-art sprite PNGs
node scripts/generate-tiles.mjs
node scripts/generate-avatars.mjs

# Start all services concurrently
pnpm dev
```

Ports: frontend `:5173` · http `:3000` · ws `:3001`

---

## Repository Structure

```
meta/
├── apps/
│   ├── frontend/          React 19 + Vite SPA (canvas game)
│   │   └── public/
│   │       ├── tiles/     Element sprites (16–32px PNGs)
│   │       └── items/     Item sprites (16–48px PNGs)
│   ├── http/              Express REST API (port 3000)
│   │   └── uploads/defaults/  Avatars + fallback copies of sprites
│   └── ws/                WebSocket server (port 3001)
├── packages/
│   └── db/
│       ├── prisma/
│       │   ├── schema.prisma
│       │   ├── migrations/
│       │   └── seed.ts
│       └── src/client.ts
├── scripts/
│   ├── generate-tiles.mjs   Generates tile + item PNGs via @napi-rs/canvas
│   └── generate-avatars.mjs Generates character sprite sheets
├── tests/
│   ├── unit/              Pure logic tests (no DB/network)
│   └── integration/       Supertest HTTP route tests (Prisma mocked)
└── vitest.config.ts
```

---

## Authentication

Uses [better-auth](https://better-auth.vercel.app) with the `bearer()` plugin. All protected endpoints require `Authorization: Bearer <token>`.

| Action | Endpoint | Notes |
|--------|----------|-------|
| Sign up | `POST /api/auth/sign-up/email` | Returns token in `set-auth-token` header |
| Sign in | `POST /api/auth/sign-in/email` | Returns token in `set-auth-token` header |
| Sign out | `POST /api/auth/sign-out` | Requires `Authorization: Bearer` header |

Guest mode: connect to the WebSocket with an empty `token` field to join as a read-only guest.

---

## API Reference

### Spaces

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/space/public` | — | All spaces (browsing) |
| GET | `/api/v1/space/all` | ✓ | Spaces owned by current user |
| GET | `/api/v1/space/:id` | — | Space data: elements, placed items, portals |
| POST | `/api/v1/space` | ✓ | Create space (auto-seeds 3 default NPCs) |
| DELETE | `/api/v1/space/:id` | ✓ owner | Delete space |
| PUT | `/api/v1/space/:id/resize` | ✓ owner | Resize space (5–100 tiles per dimension) |

### Elements (tiles placed in spaces)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/elements` | — | All element types |
| POST | `/api/v1/space/element` | ✓ owner | Place element |
| POST | `/api/v1/space/element/batch` | ✓ owner | Batch place up to 100 elements |
| PUT | `/api/v1/space/element/:id/move` | ✓ owner | Move element (validates full footprint bounds) |
| DELETE | `/api/v1/space/element` | ✓ owner | Delete element by `{ id }` |

### Items (furniture/objects placed in spaces)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/space/place` | ✓ owner | Place item from inventory |
| POST | `/api/v1/space/place/batch` | ✓ owner | Batch place up to 50 items |
| PUT | `/api/v1/space/placed/:id/move` | ✓ owner | Move placed item (validates full footprint bounds) |
| PUT | `/api/v1/space/placed/:id/metadata` | ✓ owner | Update item metadata (e.g. sign text) |
| DELETE | `/api/v1/space/placed/:id` | ✓ owner | Remove item (returns to inventory) |

### Portals

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/v1/space/:id/portal` | ✓ owner | Create portal: `{ toSpaceId, x, y, label }` |
| DELETE | `/api/v1/space/portal/:id` | ✓ owner | Delete portal |

Portals appear in the `GET /api/v1/space/:id` response under the `portals` array.

### NPCs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/space/:id/npcs` | — | List NPCs in a space |
| POST | `/api/v1/space/:id/npc` | ✓ owner | Create NPC |
| PUT | `/api/v1/space/npc/:id` | ✓ owner | Update NPC (name, sprite, dialogues, position, motionType, wanderRadius) |
| DELETE | `/api/v1/space/npc/:id` | ✓ owner | Delete NPC |

**NPC body fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | `"New NPC"` | Display name |
| `sprite` | string | `"avatar-default"` | Avatar ID (`avatar-default`, `avatar-ninja`, `avatar-wizard`) |
| `dialogues` | string[] | `[]` | Up to 3 dialogue lines |
| `x`, `y` | number | space center | Spawn / home position |
| `patrolPath` | `{x,y}[]` | `[]` | Waypoints for PATROL motion |
| `motionType` | `STATIC\|PATROL\|WANDER` | `PATROL` | Movement behaviour |
| `wanderRadius` | number 1–10 | `3` | Tile radius from home for WANDER |

### Inventory & Economy

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/inventory` | ✓ | User's inventory |
| GET | `/api/v1/wallet` | ✓ | Wallet balance (coins, tokens, stars) |
| POST | `/api/v1/economy/interact` | ✓ | Interact with a chest (1-hour cooldown, awards 10–25 coins) |

### Shop & Gifts

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/shop/daily` | — | 3 daily rotating items (deterministic seed) |
| POST | `/api/v1/shop/buy` | ✓ | Buy item: `{ itemId }` |
| GET | `/api/v1/gift/status` | ✓ | Whether daily gift is available |
| POST | `/api/v1/gift/claim` | ✓ | Claim daily gift (50 coins + random Common item; streak milestones grant Rare/Legacy) |
| POST | `/api/v1/gift/send` | ✓ | Gift an item to another user: `{ itemId, recipientId }` |

### User & Avatars

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/user/me` | ✓ | Current user profile + avatarId |
| POST | `/api/v1/user/metadata` | ✓ | Update avatarId |
| GET | `/api/v1/user/avatars` | — | All available avatars |
| GET | `/api/v1/avatars` | — | Same (v1 alias) |

### Other

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/maps` | — | Map templates |
| GET | `/api/v1/guestbook/:spaceId` | — | Guestbook messages |
| POST | `/api/v1/guestbook/:spaceId` | ✓ | Post guestbook message |
| GET | `/api/v1/quests/active` | ✓ | Active weekly quests with progress |

---

## WebSocket Protocol

Connect to `ws://localhost:3001`. First message must be `join`.

### Client → Server

```jsonc
// Join a space (token is optional; omit for guest mode)
{ "type": "join", "payload": { "spaceId": "...", "token": "..." } }

// Move one tile (server validates adjacency and rejects invalid moves)
{ "type": "move", "payload": { "x": 5, "y": 3 } }

// Send a proximity chat message (visible to players within 10 tiles)
{ "type": "chat", "payload": { "message": "Hello!", "x": 5, "y": 3 } }

// Emote (emoji popped above avatar)
{ "type": "emote", "payload": { "emoji": "👋", "x": 5, "y": 3 } }

// Interact with a placed item (broadcasts "interacted" to room)
{ "type": "interact", "payload": { "itemId": "...", "itemName": "...", "x": 5, "y": 3 } }

// Change avatar (broadcasts to room)
{ "type": "avatar-changed", "payload": { "avatarId": "avatar-ninja" } }

// Broadcast sitting or working activity
{ "type": "activity-changed", "payload": { "activity": "sitting" | "working" | null } }

// Editor relay (broadcast to other editors in the room)
{ "type": "element-placed" | "item-placed" | "element-deleted" | "item-deleted" | "element-moved" | "item-moved",
  "payload": { ... } }

// Gift announcement
{ "type": "gift", "payload": { "itemName": "...", "recipientUsername": "..." } }
```

### Server → Client

```jsonc
{ "type": "space-joined",    "payload": { "spawn": {"x":0,"y":0}, "userId": "...", "username": "...", "avatarId": "...", "users": [...] } }
{ "type": "user-joined",     "payload": { "userId": "...", "x": 0, "y": 0, "username": "...", "avatarId": "..." } }
{ "type": "user-left",       "payload": { "userId": "..." } }
{ "type": "movement",        "payload": { "userId": "...", "x": 5, "y": 3 } }
{ "type": "movement-rejected","payload": { "x": 0, "y": 0 } }
{ "type": "chat",            "payload": { "userId": "...", "username": "...", "message": "...", "x": 5, "y": 3 } }
{ "type": "emoted",          "payload": { "userId": "...", "emoji": "👋", "x": 5, "y": 3 } }
{ "type": "interacted",      "payload": { "userId": "...", "itemId": "...", "itemName": "...", "x": 5, "y": 3 } }
{ "type": "avatar-changed",  "payload": { "userId": "...", "avatarId": "..." } }
{ "type": "activity-changed","payload": { "userId": "...", "activity": "sitting" | "working" | null } }
{ "type": "npc-moved",       "payload": { "npcId": "...", "x": 3, "y": 4, "facing": "right" } }
{ "type": "gift-announce",   "payload": { "fromUsername": "...", "itemName": "...", "recipientUsername": "..." } }
```

---

## In-Game Controls

### Movement
| Input | Action |
|-------|--------|
| Arrow keys | Move one tile per press |
| Click tile | Click-to-walk (BFS pathfinding around obstacles) |
| `F` | Interact with adjacent item (sit, coffee, vending machine, portal) |

Movement is validated server-side (adjacent tiles only). Clients receive a `movement-rejected` if the server disagrees.

### Chat & Emotes
| Input | Action |
|-------|--------|
| `Enter` | Toggle chat input |
| `1`–`6` | Trigger emote (👋 💃 🧘 😴 🎉 ❤️) |
| Chat bubble | Visible for 4 seconds; proximity-fades beyond 4 tiles, hidden beyond 10 |

### Activities
| Action | How | Effect |
|--------|-----|--------|
| Sit | Press `F` near an Office Chair | 💺 shown above avatar, broadcast to room |
| Work | Sit + be adjacent to Computer or Office Desk | 💺 → 💻 auto-upgrade |
| Stand | Press `F` again near a chair, or move | Clears activity |

### Interactable Items
| Item | Interaction | Effect |
|------|-------------|--------|
| Sign | Click | Shows sign text popup |
| Chest | Click | Awards 10–25 coins (1-hour cooldown) |
| Campfire | Click | Warm glow overlay for 3 seconds |
| Fountain | Click | Flavor text popup |
| Coffee Machine | Press `F` nearby | Energy boost popup |
| Vending Machine | Press `F` nearby | Snack popup |

### Portals
- Stand on a portal tile then press `F` → travel prompt appears → click **Travel**
- Portal tiles shimmer with an animated purple glow on the canvas

---

## Editor Mode

Activate by clicking **Edit** in the header (owner only). Press **Exit Edit** to return to explore mode.

### Toolbar buttons

| Button | Shortcut | Function |
|--------|----------|----------|
| ↩ Undo | `Ctrl+Z` | Revert last change (50-step history) |
| ↪ Redo | `Ctrl+Shift+Z` | Re-apply undone change |
| + New Map | — | Create a new space (name + dimensions) |
| ↔ Resize | — | Change space width/height (5–100) |
| 🌀 Portal | — | Click canvas to place a portal at any tile |
| 🧹 Eraser | `E` | Click/drag to erase elements and items |
| Delete | `Del` / `Backspace` | Delete the currently selected item |

### Sidebar tabs

**Elements** — tile sprites (floor, walls, nature, office). Click or drag to paint.

**Items** — furniture from inventory. Click or drag. Use Floor/Wall layer toggle.

**NPCs** — list of NPCs in this space.
- **Add NPC** — opens modal (name, sprite, motion type, position, dialogues)
- **Edit** — re-opens modal pre-filled
- **Del** — deletes NPC (confirmation required)
- Clicking an NPC row selects it (amber highlight ring on canvas)
- Dragging a selected NPC on canvas repositions it

### NPC Motion Types (editor modal)

| Type | Icon | Behaviour |
|------|------|-----------|
| Static | 🧍 | Stands still at spawn, no movement |
| Patrol | 🚶 | Walks between patrol path waypoints (one tile per 500 ms tick) |
| Wander | 🌀 | Roams randomly within `wanderRadius` tiles of home position |

### Canvas interactions

| Action | Edit mode | Explore mode |
|--------|-----------|--------------|
| Left-click | Place selected / select item | Click-to-walk / interact with item |
| Left-drag | Paint brush (place repeatedly) | Walk to destination |
| Right-click | Delete element or item under cursor; delete portal | — |
| Drag selected item | Move item to new position | — |
| Click NPC | Select NPC (amber ring), switch to NPCs tab | Open dialogue popup |
| Drag NPC | Reposition NPC, saves to server | — |
| Rubber-band drag | Multi-select elements+items | — |
| `Esc` | Deselect everything | Close chat |
| `E` | Toggle eraser | — |
| `Ctrl+Z` | Undo | — |

---

## Assets

### Tiles (elements — placed as floor/wall decoration)
Generated by `node scripts/generate-tiles.mjs` into `apps/frontend/public/tiles/` and `apps/http/uploads/defaults/`.

| Category | IDs |
|----------|-----|
| Ground | `el-grass`, `el-dirt`, `el-sand`, `el-snow`, `el-cobblestone`, `el-path` |
| Water | `el-water`, `el-shallow-water`, `el-waterfall` |
| Nature | `el-tree`, `el-pine-tree`, `el-flower`, `el-bush`, `el-cactus`, `el-rock`, `el-mushroom` |
| Structures | `el-wall`, `el-brick-wall`, `el-fence`, `el-window`, `el-door`, `el-roof` |
| Floors | `el-wood-floor`, `el-cave-floor`, `el-lava` |
| Office | `el-office-carpet`, `el-office-floor`, `el-glass-wall` |
| Special | `el-chest` |

### Items (furniture — placed from inventory)
| Category | IDs |
|----------|-----|
| Furniture | `item-sofa`, `item-table`, `item-chair`, `item-rug`, `item-bed`, `item-bookshelf`, `item-throne` |
| Decoration | `item-plant`, `item-lamp`, `item-painting`, `item-crystal`, `item-barrel`, `item-counter` |
| Interactive | `item-sign`, `item-campfire`, `item-fountain` |
| Economy | `item-chest` (awards coins on click) |
| Office | `item-office-desk`, `item-office-chair`, `item-computer`, `item-whiteboard`, `item-coffee-machine`, `item-filing-cabinet`, `item-meeting-table`, `item-vending-machine`, `item-office-printer` |

### Avatars / Character Sprites
Three sprite sheets generated by `node scripts/generate-avatars.mjs`:

| ID | Character |
|----|-----------|
| `avatar-default` | Blue shirt, brown hair |
| `avatar-ninja` | Black suit, red headband |
| `avatar-wizard` | Purple robe, pointed hat, white beard |

Each sheet is 128×96 px (4 directions × 2 walk frames, 32×48 px per frame). Direction column mapping: 0=down, 1=left, 2=right, 3=up.

---

## Database

### Applying Migrations

Migrations are plain SQL files in `packages/db/prisma/migrations/`. Apply in order:

```bash
# All in one (bash)
for f in packages/db/prisma/migrations/*/migration.sql; do psql "$DATABASE_URL" -f "$f"; done

# Or individually with prisma db execute (Prisma 6.x)
cd packages/db
DATABASE_URL=... npx prisma@6.3.1 db execute --file prisma/migrations/<dir>/migration.sql --schema prisma/schema.prisma
```

After any schema change, regenerate the client:

```bash
npx prisma@6.3.1 generate --schema=packages/db/prisma/schema.prisma
```

### Seeding

```bash
pnpm --filter @repo/db seed
```

Seeds: all element types, all item types, 3 avatars, 2 map templates, and office NPCs for every existing space (if none yet).

### Key Models

| Model | Purpose |
|-------|---------|
| `User` | Auth accounts, profile, avatarId |
| `Space` | 2D canvas (width × height) owned by a user |
| `spaceElements` | Tile elements placed in a space |
| `PlacedItem` | Items placed in a space (with optional `metadata` JSON) |
| `NPC` | Non-player characters in a space (`motionType`, `wanderRadius`, `patrolPath`) |
| `SpacePortal` | Portal linking two spaces |
| `Item` | Item catalogue |
| `InventoryItem` | User's item inventory |
| `Wallet` | User's coin/token/star balance |
| `DailyGift` | Daily claim tracker (streak + last claim) |
| `ChestInteraction` | Per-user per-chest cooldown tracking |

---

## Testing

```bash
# Run all tests (no DB required — Prisma mocked)
pnpm test           # vitest run
node_modules/.bin/vitest run --reporter=verbose

# Run in watch mode
node_modules/.bin/vitest
```

134 tests across 10 files:

| File | Coverage |
|------|---------|
| `tests/unit/roomManager.test.ts` | RoomManager add/remove/broadcast |
| `tests/unit/movement.test.ts` | WS movement validation + bounds bug docs |
| `tests/unit/gift.test.ts` | Daily gift cooldown + streak milestones |
| `tests/unit/economy.test.ts` | Chest cooldown, coin range, TOCTOU docs |
| `tests/unit/shop.test.ts` | Item price tiers, balance check, daily seed |
| `tests/unit/spaceCollision.test.ts` | AABB overlap, boundary, batch placement |
| `tests/unit/npcTick.test.ts` | stepToward, patrol index clamping |
| `tests/integration/economy.integration.test.ts` | POST /economy/interact |
| `tests/integration/gift.integration.test.ts` | GET/POST /gift/status,claim,send |
| `tests/integration/space.integration.test.ts` | PUT move, DELETE portal, PUT resize, GET space |

---

## Commands

```bash
pnpm dev              # Start all services (Turborepo)
pnpm build            # Type-check + build all packages
pnpm test             # Run test suite (vitest)
pnpm lint             # ESLint

# DB
npx prisma@6.3.1 generate --schema=packages/db/prisma/schema.prisma
pnpm --filter @repo/db seed

# Sprites
node scripts/generate-tiles.mjs     # Regenerate tile + item PNGs
node scripts/generate-avatars.mjs   # Regenerate avatar sprite sheets
```

---

## Environment Variables

Create `.env` files (not committed):

**`apps/http/.env`**
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/metaverse
CORS_ORIGIN=http://localhost:5173,http://localhost:5174
BETTER_AUTH_URL=http://localhost:3000
BETTER_AUTH_SECRET=<strong-secret>
```

**`apps/ws/.env`**
```
DATABASE_URL=postgresql://postgres:password@localhost:5432/metaverse
BETTER_AUTH_SECRET=<same-as-http>
BETTER_AUTH_URL=http://localhost:3000
```

**`apps/frontend/.env`** (optional, Vite dev server)
```
VITE_API_URL=http://localhost:3000
VITE_WS_URL=ws://localhost:3001
```
