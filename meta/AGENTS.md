# AGENTS.md — Metaverse 2D

Technical reference for AI agents working in this codebase. Covers architecture, data flow, known bugs, and everything needed to avoid re-deriving context from scratch.

---

## Architecture

```
meta/
├── apps/frontend/   React 19 + Vite SPA  (port 5173)
├── apps/http/       Express REST API      (port 3000)
├── apps/ws/         WebSocket server      (port 3001)
└── packages/db/     Prisma 6.3.1 + PostgreSQL
```

**Auth**: better-auth with the `bearer()` plugin. All protected endpoints require `Authorization: Bearer <token>`. The WS server validates tokens by calling `auth.api.getSession()` from `@better-auth/core`. Token is returned in the `set-auth-token` response header on sign-up/sign-in.

**Build**: esbuild bundles `http` and `ws` into `dist/index.js`. These bundles **cannot find the Prisma native engine** at runtime — always start services in **dev mode** with `tsx watch`:
```bash
node_modules/.bin/tsx --env-file=apps/http/.env apps/http/src/index.ts
node_modules/.bin/tsx --env-file=apps/ws/.env  apps/ws/src/index.ts
```

**Prisma version**: The project uses `@prisma/client@6.3.1`. Regenerate the client after any schema change:
```bash
npx prisma@6.3.1 generate --schema=packages/db/prisma/schema.prisma
```
The globally-installed Prisma (if 7.x) will reject `url = env(...)` in the datasource. Always use the project-pinned version `prisma@6.3.1`.

**Migrations**: No `prisma migrate dev` — plain SQL files in `packages/db/prisma/migrations/<timestamp>_<name>/migration.sql`. Apply manually via `psql` or `prisma db execute`.

---

## Database Schema Summary

| Model | Key fields | Notes |
|-------|-----------|-------|
| `User` | id, email, username, avatarId, role | role = Admin\|User |
| `Session` | token, userId, expiresAt | better-auth managed |
| `Space` | id, width, height, creatorId | has fromPortals, toPortals relations |
| `spaceElements` | spaceId, elementId, x, y | tiles placed in a space |
| `Element` | id, imageUrl, width, height, blocking | catalogue; IDs like `el-grass` |
| `PlacedItem` | spaceId, itemId, x, y, layer, metadata | `metadata Json?` holds sign text etc. |
| `Item` | id, name, category, rarity, imageUrl, width, height | IDs like `item-office-desk` |
| `InventoryItem` | userId, itemId, quantity | unique(userId, itemId) |
| `Wallet` | userId, coins, tokens, stars | |
| `NPC` | spaceId, name, sprite, dialogues[], x, y, patrolPath, motionType, wanderRadius | motionType = NPCMotion enum |
| `NPCMotion` (enum) | STATIC, PATROL, WANDER | |
| `SpacePortal` | fromSpaceId, toSpaceId, x, y, label | cascade delete from both Space relations |
| `DailyGift` | userId, lastClaim, streak | one per user |
| `ChestInteraction` | userId, placedItemId, lastAt | unique(userId, placedItemId) |
| `BannedUser` | userId, reason | WS join rejects banned users |

---

## HTTP Routes (`apps/http/src/routes/v1/`)

Route registration order matters in Express. Static paths must be registered before dynamic `/:param` paths.

### `space.ts` — route ordering (critical)

```
GET  /public                 ← static
GET  /all                    ← static
DELETE /element              ← static
POST /element                ← static
POST /                       ← static
POST /element/batch          ← static
POST /place/batch            ← static
POST /place                  ← static
DELETE /placed/:id           ← semi-static (literal "placed")
PUT  /placed/:id/metadata    ← semi-static
PUT  /placed/:id/move        ← semi-static
PUT  /element/:id/move       ← semi-static
GET  /:spaceId/npcs          ← dynamic (NPC read)
POST /:spaceId/npc           ← dynamic (NPC create)
PUT  /npc/:id                ← must come BEFORE /:spaceId routes
DELETE /npc/:id              ← must come BEFORE /:spaceId routes
DELETE /portal/:id           ← must come BEFORE /:spaceId routes
POST /:spaceId/portal        ← dynamic
PUT  /:spaceId/resize        ← dynamic
DELETE /:spaceId             ← last dynamic (owner delete)
GET  /:spaceId               ← last dynamic (public read)
```

`GET /:spaceId` response shape (includes portals):
```json
{
  "name": "...",
  "dimensions": "20x20",
  "elements": [ { "id": "se1", "element": {...}, "x": 0, "y": 0 } ],
  "placedItems": [ { "id": "pi1", "item": {...}, "x": 0, "y": 0, "layer": "FLOOR", "metadata": null } ],
  "portals": [ { "id": "p1", "toSpaceId": "...", "x": 5, "y": 5, "label": "Portal" } ]
}
```

### NPC auto-seed
`POST /space` calls `client.nPC.createMany(makeDefaultNpcs(spaceId, w, h))` immediately after creating the space. `makeDefaultNpcs()` generates Manager Mike (PATROL), Dev Dana (PATROL), HR Helen (PATROL) with patrol paths scaled to space dimensions. This applies to both blank-space creation and map-template creation.

### Validation helpers in space.ts
- `VALID_MOTION_TYPES = new Set(['STATIC','PATROL','WANDER'])` guards NPC create/update
- Element/item **move** endpoints now check `x + w > spaceWidth` (footprint-aware), not just `x >= spaceWidth`

---

## WebSocket Server (`apps/ws/src/`)

### `RoomManager` (singleton)
```typescript
rooms: Map<spaceId, User[]>

addUser(spaceId, user)         // append
removeUser(user, spaceId)      // filter by user.id
broadcast(msg, sender, roomId) // all except sender
broadcastToRoom(msg, roomId)   // everyone including sender
```

### `User` class
- `id`: random 10-char string (session-level, not DB userId)
- `userId`: DB user id (set after join)
- `spaceId`: set after `join` message; guards destroy() safety
- `isGuest`: true when no token supplied

**Re-join guard** (prevents ghost users):
```typescript
case "join": {
    if (this.spaceId) {
        getRoomManager().removeUser(this, this.spaceId);
        this.spaceId = undefined;
    }
    // ... proceed with new join
```

**destroy() guard** (prevents crash on never-joined disconnect):
```typescript
destroy() {
    if (!this.spaceId) return;
    // broadcast user-left + removeUser
```

**Movement validation** (server-side, adjacent tiles only):
```typescript
const xDisp = Math.abs(this.x - moveX);
const yDisp = Math.abs(this.y - moveY);
if ((xDisp === 1 && yDisp === 0) || (xDisp === 0 && yDisp === 1)) {
    // accept
} else {
    this.send({ type: "movement-rejected", payload: { x: this.x, y: this.y } });
}
```

⚠️ **Known gap**: No space boundary check on movement (user can move to negative coords or beyond width/height). Fix: add `newX >= 0 && newY >= 0 && newX < space.width && newY < space.height`.

### NPC Tick (`index.ts`)

Runs every 500ms (`setInterval(npcTick, 500)`).

```
For each active room:
  Fetch space (width, height) once
  Fetch all NPCs for the space
  For each NPC:
    STATIC → skip
    idle countdown > 0 → decrement, skip
    WANDER → pick destination within wanderRadius of npc.x,npc.y (DB home);
              stepToward() one tile; broadcast npc-moved
    PATROL → clamp patrolIndex % patrol.length;
              stepToward() toward current waypoint;
              advance index when at waypoint; broadcast npc-moved
```

`NpcState` (in-memory, keyed by `npc.id`):
```typescript
{
    x, y,              // current position
    patrolIndex,       // current waypoint index (PATROL)
    idleCountdown,     // ticks to stay idle
    wanderTarget,      // { x, y } | null (WANDER)
    wanderCooldown,    // ticks until next destination pick (WANDER)
}
```

`stepToward(cx,cy,tx,ty)` prefers the axis with larger delta, with random tie-break.

---

## Frontend (`apps/frontend/src/Game.tsx`)

### Key constants

```typescript
WS_URL  = import.meta.env.VITE_WS_URL  || 'ws://localhost:3001'
API     = import.meta.env.VITE_API_URL  || 'http://localhost:3000'
TILE_SIZE = 50  // canvas pixels per tile
```

**Tile/item sprite lookup**: `TILE_IMAGE[elementId]` → `/tiles/<name>.png` (served by Vite). Falls back to `element.imageUrl` (which points to the HTTP server's `/uploads/defaults/`).

### Canvas coordinate system

```
worldW = spaceDims.width  * 50
worldH = spaceDims.height * 50
camX   = clamp(playerCenterX - vpW/2, 0, worldW - vpW)
camY   = clamp(playerCenterY - vpH/2, 0, worldH - vpH)
ctx.translate(offsetX - camX, offsetY - camY)  // inside ctx.save()/restore()
```

`canvasToGrid(clientX, clientY)` converts screen coords back to tile coords accounting for camera offset.

### Animation system

All movement uses a `requestAnimationFrame` loop in a `useEffect`:
- **Player tween**: `moveAnimRef` (fromX/Y → toX/Y, 150ms ease-out quad). Position stored in `animPosRef`. After tween, processes `moveQueueRef` (click-to-walk queue).
- **NPC tween**: `npcAnims` Map (per-npc, 450ms). `npcFacing` Map (sprite column).
- **Portal shimmer**: `portalsRef.current.length > 0` → always rerenders every RAF frame while portals exist.

### WS message handler

`handleMessage` is assigned to `handleMessageRef.current` (a ref) to avoid stale closures. The actual WS `onmessage` calls `handleMessageRef.current(data)`.

### Edit mode interactions (startPaint / paintMove / stopPaint)

`startPaint` checks in order:
1. Sign click → `setSignEditing`
2. NPC click → `setSelectedNpcId`, `npcDragRef.current = { id }`
3. `eraserMode || selectedElement || selectedItem` → start paint
4. `selectedPlaced` + on-item hit → start move (`isMoving`)
5. Else → start selection rect (`isSelecting`)

`handleCanvasMouseUp` (edit mode) checks in order:
1. `portalPlacingMode` → open portal creation modal
2. `npcPickingPos` → set form position, re-open NPC modal
3. `npcDragRef.current` → finalize NPC drag (PUT /npc/:id if position changed)
4. Else → `stopPaint()` (handles move finalization and selection)

### State inventory (NPC-related)

```typescript
npcs: NPC[]                  // current space NPCs (fetched from /npcs)
npcsRef: Ref<NPC[]>          // always-current ref for event handlers
selectedNpcId: string|null   // which NPC is highlighted in editor
npcDragRef: Ref<{id}|null>   // NPC being dragged (not state, to avoid re-renders)
npcPickingPos: boolean        // "click on map" position-picking mode
showNpcModal: boolean
npcForm: {
  id?, name, sprite,
  dialogues: [string,string,string],
  x, y,
  motionType: 'STATIC'|'PATROL'|'WANDER',
  wanderRadius: number
}
```

### NPC rendering

```typescript
const isStatic = npc.motionType === 'STATIC';
// STATIC: fixed position (npc.x, npc.y), no tween, dirCol=0, walkFrame=0, bob=0
// PATROL/WANDER: interpolated from npcAnims tween
const dirCol    = isStatic ? 0 : (npcFacing.current.get(npc.id) ?? 0);
const walkFrame = (!isStatic && isWalking) ? (Math.floor(t / 100) % 2) : 0;
const bob       = (!isStatic && isWalking) ? Math.sin(t / 100) * 2 : 0;
ctx.drawImage(img, dirCol*32, walkFrame*48, 32, 48, px-16, py-24-bob, 32, 48);
```

### Activity system

- `myActivity`: `'sitting' | 'working' | null` — local state
- `othersActivity`: `Map<userId, Activity>` — received via `activity-changed` WS
- **Auto-upgrade**: if `myActivity === 'sitting'` AND player is adjacent to `item-computer` or `item-office-desk`, render as `'working'`
- Press `F` near an `item-office-chair` → toggles sitting; broadcasts `activity-changed`
- Moving clears the activity

### Portal rendering (canvas)

```typescript
const portalPhase = (performance.now() / 600) % (Math.PI * 2);
const pulse = 0.55 + 0.3 * Math.sin(portalPhase);
// draws purple gradient rounded rect with 🌀 and label text
```

Portals are stored in `portals` state (fetched as part of `fetchSpace()` from `GET /space/:id`).

---

## Sprite Generation

### `scripts/generate-tiles.mjs`
Writes PNGs to both `apps/frontend/public/tiles/` and `apps/frontend/public/items/` (served by Vite), AND to `apps/http/uploads/defaults/` (served by HTTP).

All drawing uses four pixel helpers: `px(ctx,x,y,color)`, `rect(...)`, `hline(...)`, `vline(...)`.

Sizes: tiles are 16×16 (1×1 tile), some elements are 32×32 (2×2 tile). Items vary (e.g. `meeting-table` is 48×32 = 3×2 tiles).

To add a new sprite: define a drawing function, add `{ name, w, h, fn }` to TILES or ITEMS array, then `node scripts/generate-tiles.mjs`.

### `scripts/generate-avatars.mjs`
Writes 128×96 sprite sheets to `apps/http/uploads/defaults/avatar-*.png`.

---

## Known Bugs & Mitigations

| Location | Bug | Status |
|----------|-----|--------|
| `ws/User.ts:243` | No space-boundary check on movement (can go to x=-1, y=-1) | **Open** — server validates adjacency but not bounds |
| `ws/User.ts` | No deduplication if two `join` messages arrive concurrently (async gap) | **Mitigated** — synchronous re-join guard added, but race during auth await remains |
| `shop.ts:50` | Balance check outside transaction (TOCTOU) | **Open** — concurrent buys can go negative |
| `gift.ts:56` | Claim check outside transaction (TOCTOU) | **Open** — concurrent claims could double-grant |

**Fixed bugs (do not revert):**
- `gift.ts`: `setUTCHours(24,...)` + `setUTCDate(+1)` → double advance (was 48h lockout). Fixed to `setUTCDate(+1)` + `setUTCHours(0,0,0,0)`.
- `gift.ts`: `milestoneItem` declared inside `$transaction` callback, used outside → `ReferenceError`. Fixed to return from transaction as tuple.
- `gift.ts`: `wallet.coins + 50` non-atomic. Fixed to `{ coins: { increment: 50 } }` upsert.
- `economy.ts`: cooldown check outside transaction. Fixed: check moved inside `$transaction`, throws typed error caught outside.
- `space.ts`: move boundary used `x >= width` ignoring element footprint. Fixed to `x + ew > width`.
- `ws/index.ts`: NPC patrolIndex not clamped before array access. Fixed: `state.patrolIndex % patrol.length`.
- `ws/User.ts`: `destroy()` called before `spaceId` set. Fixed with `if (!this.spaceId) return` guard.
- `ws/User.ts`: second `join` added user to new room without removing from old room (ghost). Fixed with re-join cleanup block.

---

## Tests

```bash
node_modules/.bin/vitest run    # 134 tests, ~900ms
```

Mock infrastructure: `tests/__mocks__/db.ts` — a full `vi.fn()` stub of the Prisma client. Imported via `vitest.config.ts` alias `@repo/db/client → tests/__mocks__/db.ts`.

Integration tests use `supertest` + `express` with the actual route handlers. Auth middleware is mocked to inject `req.userId = 'test-user-id'`.

Tests document expected-but-open bugs (e.g. movement bounds, TOCTOU races) as passing `expect` assertions that describe the current (buggy) behavior, so regressions on fixes are immediately visible.

---

## Seed Data

`packages/db/prisma/seed.ts` is idempotent (uses `upsert`). Run with:
```bash
pnpm --filter @repo/db seed
```

Seeds (in order):
1. All element types (`el-grass` through `el-glass-wall`)
2. All item types (`item-sofa` through `item-office-printer`)
3. 2 map templates (Park 20×20, Garden 15×15)
4. 3 avatars (`avatar-default`, `avatar-ninja`, `avatar-wizard`)
5. Office NPCs for each existing space with 0 NPCs (Manager Mike, Dev Dana, HR Helen)

New spaces created via the API automatically receive the same 3 NPCs via `makeDefaultNpcs()` in `space.ts`.

---

## Adding a New Feature Checklist

1. **Schema change** → edit `schema.prisma`, write `migration.sql`, run `npx prisma@6.3.1 generate`
2. **HTTP endpoint** → add to correct route file, respect static-before-dynamic ordering in `space.ts`
3. **WS message** → add types to `types.ts` (both Incoming and Outgoing unions), handle in `User.ts`
4. **Frontend state** → add to Game.tsx near related state, update canvas `useEffect` deps array
5. **Sprites** → add drawing function + array entry to `generate-tiles.mjs`, run `node scripts/generate-tiles.mjs`, add to `TILE_IMAGE` or `ITEM_IMAGE` maps in Game.tsx, add to seed.ts
6. **Tests** → add unit tests for pure logic, integration tests for HTTP routes
7. **Docs** → update `README.md` (API table, controls) and `AGENTS.md` (schema, technical notes)
