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

## Editor Features (frontend)

- **Paint brush** — Click/drag selected element or item to paint continuously (120ms throttle)
- **Eraser** — `E` key or 🧹 button, click/drag to delete
- **Move** — Click selected element/item and drag to reposition
- **Layer toggle** — FLOOR/WALL for item placement
- **Undo/Redo** — `Ctrl+Z` / `Ctrl+Shift+Z`, snapshot-based with server sync
- **In-editor map creation** — "+ New Map" button with dimensions and templates
- **Right-click** — Delete element/item under cursor
- **WS broadcast** — Real-time sync of placements, deletions, moves to other users

## DB Commands

```sh
cd apps/http
pnpm db:migrate   # Apply Prisma migrations
pnpm db:seed      # Seed default data
pnpm db:studio    # Open Prisma Studio
```
