# Metaverse 2D — Monorepo

This is the monorepo root, managed by [Turborepo](https://turbo.build/repo). It contains all services for the Metaverse 2D project.

See [../README.md](../README.md) for project overview, quick start, and development guide.

## Structure

```
meta/
├── apps/
│   ├── frontend/    React + Vite (port 5173)
│   ├── http/        Express REST API (port 3000)
│   └── ws/          WebSocket server (port 3001)
├── packages/
│   └── db/          Prisma schema, migrations, seed
└── turbo.json
```

## Commands

```sh
pnpm dev          # Run all apps concurrently
pnpm build        # Type-check + build all apps
pnpm lint         # ESLint on all apps
```

## Auth

Uses [better-auth](https://better-auth.vercel.app) with email+password and Bearer tokens.

| Action | Endpoint |
|--------|----------|
| Sign up | `POST /api/auth/sign-up/email` |
| Sign in | `POST /api/auth/sign-in/email` |
| Auth header | `Authorization: Bearer <token>` |

Token is returned in the `set-auth-token` response header.

## API Endpoints

### Spaces
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/space/:id` | Get space with elements and items |
| POST | `/api/v1/space` | Create new space |
| POST | `/api/v1/space/element` | Place element (auth) |
| POST | `/api/v1/space/element/batch` | Batch place elements (auth, max 100) |
| PUT | `/api/v1/space/element/:id/move` | Move element (auth) |
| DELETE | `/api/v1/space/element` | Delete element (auth) |
| POST | `/api/v1/space/place` | Place item from inventory (auth) |
| POST | `/api/v1/space/place/batch` | Batch place items (auth, max 50) |
| PUT | `/api/v1/space/placed/:id/move` | Move placed item (auth) |
| DELETE | `/api/v1/space/placed/:id` | Delete placed item (auth) |

### Other
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/elements` | List all element types |
| GET | `/api/v1/inventory` | Get user's inventory (auth) |
| POST | `/api/v1/inventory/demo` | Add demo items (auth, dev only) |
| GET | `/api/v1/maps` | List map templates |
| GET | `/api/v1/user/me` | Get current user profile (auth, includes avatarId) |
| GET | `/api/v1/user/avatars` | List all available avatars |
| POST | `/api/v1/user/metadata` | Set user's avatarId (auth) |

## In-Game Controls (frontend)

### Movement
- **Arrow keys** — Move character one cell per press
- **Click on empty ground** — Click-to-walk: BFS pathfinding, walks tile-by-tile around obstacles
- **Smooth animation** — 150ms ease-out lerp between cells, direction-facing sprites, walk cycle
- **3px walk bob** — Vertical bounce during movement

### Avatar Customization
- **Avatar button** — In header bar (between Edit and Chat), opens a modal to pick character
- **3 characters** — Default (blue shirt), Ninja (black suit + headband), Wizard (purple robe + staff)
- **Pixel sprite sheets** — Each character has 4-direction sprites with 2-frame walk cycle (32x48 per frame)
- Sprites regenerated via `node scripts/generate-avatars.mjs` (uses `@napi-rs/canvas`)

### Player Interactions
- **Chat** — Enter to open input, Enter to send, Esc to cancel (4-second bubble display)
- **Emotes** — Keys 1-6, floating emoji above character
- **Item interaction** — Click placed items in explore mode → floating text + WS broadcast
- **Player click** — Click another player → popup with "View Profile"
- **Usernames** — Displayed above avatars at all times

### Editor Features (frontend)
- **Paint brush** — Click/drag selected element or item to paint continuously (120ms throttle)
- **Eraser** — `E` key or 🧹 button, click/drag to delete
- **Move tool** — Click selected element/item and drag to reposition (green dashed preview)
- **Layer toggle** — FLOOR/WALL for item placement
- **Selection rectangle** — Click+drag empty space for rubber-band multi-select, purple dashed highlights
- **Undo/Redo** — `Ctrl+Z` / `Ctrl+Shift+Z`, snapshot-based with diff reconciliation & API sync
- **In-editor map creation** — "+ New Map" button with dimensions drop-down and template picker
- **Right-click** — Delete element/item under cursor
- **Delete/Backspace** — Delete selected items (single or group)
- **Escape** — Deselect / clear selection rectangle
- **WS broadcast** — Real-time sync of placements, deletions, moves to other users

## DB Commands

```sh
cd apps/http
pnpm db:migrate   # Apply Prisma migrations
pnpm db:seed      # Seed default data
pnpm db:studio    # Open Prisma Studio
```
