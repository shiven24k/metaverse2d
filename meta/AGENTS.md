# AGENTS.md — Metaverse 2D

## Project Overview
Multiplayer 2D pixel-space metaverse: React frontend + Express REST API + WebSocket server + PostgreSQL (via Prisma). pnpm monorepo with 5 packages.

## Architecture
- **frontend** (`apps/frontend/`, port 5173) — React SPA with Vite
- **http** (`apps/http/`, port 3000) — Express REST API (better-auth, CRUD)
- **ws** (`apps/ws/`, port 3001) — WebSocket server (real-time multiplayer)
- **db** (`packages/db/`) — Prisma client + schema

## Running
```bash
cd meta
pnpm run dev   # uses turborepo
```
Or start each service manually:
```bash
cd meta/apps/frontend && node_modules/.bin/vite --port 5173 --host
cd meta/apps/http && node_modules/.bin/tsx watch --env-file=.env src/index.ts
cd meta/apps/ws && node_modules/.bin/tsx watch --env-file=.env src/index.ts
```

## Key Fixes Made

### Infrastructure
- PostgreSQL Docker container (postgres:16, port 5432)
- Created .env files for http (DATABASE_URL, BETTER_AUTH_SECRET, CORS_ORIGIN) and ws (DATABASE_URL, BETTER_AUTH_SECRET, BETTER_AUTH_URL)
- All 9 Prisma migrations run, DB seeded (8 elements, 10 items, 3 avatars, maps)
- esbuild 0.28.0 binary mismatch: fixed by installing @esbuild/linux-x64@0.28.0 and patching main.js
- tsx binary not found: added tsx as devDependency to root, http, and ws

### Bug Fixes
- `admin.ts:55` — unawaited Promise in PUT /element/:elementId (added async/await)
- `Game.tsx:488` — wrong layer value 'ground' → 'FLOOR' (Prisma enum mismatch)
- `space.ts:88` — off-by-one bounds check > → >= for element placement
- WS User.ts emote protocol: accepts {emoji, x, y} instead of emoteId, broadcasts "emoted"
- WS User.ts interaction type: broadcasts "interacted" instead of "item-interaction"
- WS auth.ts: missing BETTER_AUTH_SECRET fallback (caused token verification failure → rapid disconnect loop)
- Game.tsx: `currentUser` position never updated locally after WS move (server excluded sender from broadcast). Fixed by updating `currentUser` state in animation completion callback.
- Game.tsx: removed unused `getImage` function (TS build error)

### Assets & Rendering
- Generated 20 real PNG image assets (replacing SVGs misnamed as .png)
- Canvas rendering: imageCache ref, preloadImages with onload→rerender, drawImageOnCanvas helper
- Editor sidebar: <img> thumbnails instead of colored divs/emoji
- Canvas uses actual space dimensions (spaceDims.width*50 × spaceDims.height*50)
- Canvas overflow: ResizeObserver + style.width/height instead of transform: scale()
- canvasToGrid: accounts for CSS size vs internal resolution ratio
- Grid lines drawn only within space bounds

### Paint Brush
- Click+drag to place elements/items continuously
- 120ms throttle, skips unchanged cells
- isAreaFree collision check
- TDZ fix: paintPlace moved after isAreaFree

## Editor Features (Implemented)

### Layer Toggle (FLOOR/WALL)
- `placementLayer` state ('FLOOR' | 'WALL')
- Toggle buttons in the "Placing" bar when an item is selected
- placeItem uses placementLayer instead of hardcoded 'FLOOR'

### Eraser Tool
- 🧹 Eraser button in editor header
- Press `E` key to toggle
- Paints over elements/items to delete them instantly
- Works with paint brush (click+drag to erase multiple)

### WS Broadcast for Placements
- Frontend sends element-placed, item-placed, element-deleted, item-deleted via WS after each HTTP call
- WS server relays to all other users in the same room
- Other clients auto-refresh via handleMessage

### Server-Side Collision Validation
- POST /space/element and POST /space/place check for overlapping elements/items
- Returns 409 Conflict on overlap
- Client-side isAreaFree remains as first-pass filter

## Recent Additions

### Selection Rectangle
- Click+drag on empty canvas space to draw a blue rubber-band selection rectangle
- All items/elements intersecting the rectangle are highlighted with purple dashed borders
- Group count shown in editor sidebar ("N items selected") with Delete all / Clear buttons
- Del/Backspace deletes all selected items
- Escape clears the selection
- Single-click on an item still works for individual selection

### Undo/Redo
- Snapshot-based: saves `{ elements, items }` state before each mutation
- Diff-based reconciliation: computes what changed and calls inverse API endpoints
- Ctrl+Z to undo, Ctrl+Shift+Z to redo
- ↩ Undo / ↪ Redo buttons in editor sidebar header, disabled when no history
- 50-action history limit, clears redo stack on new actions
- Works for: place item/element, delete item/element, move item/element, batch flush

### Keyboard Shortcut Hints
- Editor header shows `[E] Eraser · [Esc] Deselect · [Ctrl+Z] Undo · Click/drag to place`
- Sidebar status bar shows `Ctrl+Z Undo · Ctrl+Shift+Z Redo`

### Player Names & Interaction
- Usernames displayed above avatars (red for you, teal for others)
- Chat bubbles (`Enter` key to toggle input, type message, `Enter` to send, `Esc` to cancel)
- WS broadcasts chat to all users in the same space (4-second display)
- Click on placed items in non-edit mode to send `interact` WS message (shows floating text)
- Click on other players' avatars to show popup with "View Profile" option
- WS `join` handler now queries and broadcasts usernames + avatarId in `space-joined` and `user-joined` payloads

### Batch Placement (paint brush bundling)
- `POST /api/v1/space/element/batch` — place up to 100 elements in one request
- `POST /api/v1/space/place/batch` — place up to 50 items in one request with inventory validation
- Frontend collects paint brush strokes into a buffer, flushes every 300ms or on mouse up
- Both endpoints validate bounds, collisions, and inventory availability

### Move Tool
- `PUT /api/v1/space/element/:id/move` and `PUT /api/v1/space/placed/:id/move` — update position
- Click a selected element/item and drag to reposition
- Green dashed preview shows target position
- WS broadcasts element-moved/item-moved to other users

### In-Editor Map Creation
- "+ New Map" button in editor sidebar header
- Modal with name input, dimensions dropdown (10x10 to 50x50), and optional template picker
- Calls POST /api/v1/space then navigates to the new space
- Fetches available map templates on modal open

### Avatar Customization
- `GET /api/v1/user/avatars` — lists all 3 seeded avatars (Default, Ninja, Wizard)
- `GET /api/v1/user/me` — now returns `avatarId` field
- `POST /api/v1/user/metadata` — sets user's `avatarId` (avatar selection)
- ProfilePage: avatar picker shown when viewing your own profile (clickable thumbnails)
- Game.tsx header: **Avatar** button opens an in-game modal with all 3 characters (64x96 preview, click to select)
- WS `user-joined` / `space-joined` — include `avatarId` in payloads, stored on User class
- Canvas rendering: draws avatar image instead of colored circle (falls back to colored circle if image hasn't loaded)

### Pixel Character Sprites
- `scripts/generate-avatars.mjs` — generates 128x96 sprite sheets using `@napi-rs/canvas`
- Each avatar has 8 frames (4 directions × 2 walk frames), each 32x48 pixels
- Characters have visible head, body, arms, legs, directional facing
  - **Default**: blue shirt, brown hair, dark pants
  - **Ninja**: black suit, red headband, visible eyes only
  - **Wizard**: purple robe, pointed hat, white beard, wooden staff
- Frontend extracts frames via `ctx.drawImage(img, sx, sy, 32, 48, ...)`
- Direction-to-column mapping: 0=down, 1=left, 2=right, 3=up

### Smooth Movement & Walk Animation
- `requestAnimationFrame` loop lerps player between grid cells (150ms ease-out quad)
- `animPosRef` holds animated position, used in render instead of `currentUser.x/y`
- `facingRef` tracks direction ('down'|'up'|'left'|'right'), set per-move from delta
- `walkFrameRef` alternates 0/1 every 75ms during movement (walk cycle)
- `walkBobRef` adds 3px vertical sine-wave bounce during movement
- **Click-to-walk**: BFS pathfinding avoids obstacles (elements+items), walks tile-by-tile via `moveQueueRef`
- Arrow key cancels the queue for instant response

### CORS Fix
- `http/src/index.ts`: `CORS_ORIGIN` env var supports comma-separated origins, defaults to `[localhost:5173, localhost:5174]`
- `.env` updated to allow both ports (Vite falls back to 5174 when 5173 is busy)

## Editor Features (Implemented)
- Layer toggle (FLOOR/WALL)
- Eraser tool (E key)
- Move tool (drag selected items)
- Paint brush with batch placement
- In-editor map creation
- Undo/redo (Ctrl+Z / Ctrl+Shift+Z)
- Selection rectangle (rubber-band multi-select)
- WS broadcast for placements, deletions, moves
- Server-side collision validation
- Right-click delete, Delete/Backspace key, Escape to deselect
- Hover preview, selection highlight, auto-select new placements

## Player Interactions (Implemented)
- Usernames displayed above avatars
- Chat bubbles (Enter to type, Enter to send, 4s display)
- Click on placed items to interact (shows floating interaction text via WS)
- Click on other players to view profile
- Emotes (1-6 keys, floating emoji)
- Arrow key movement with WS sync
- Smooth movement animation + click-to-walk
- Pixel character sprites with walk cycle animation

## Known Issues / Blocked
- "Load Demo Items" is a dev/testing hack
- No guest/anonymous mode (requires auth for most features)
- WS server uses `any` types for messages
- Collision detection on the server could be more granular
- Avatar change requires page refresh or WS reconnect to see updated avatar for other users
