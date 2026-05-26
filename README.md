# Metaverse 2D

A multiplayer 2D pixel-space metaverse built with React, Express, WebSockets, and PostgreSQL.

Players can create spaces, decorate with items, chat via emotes/guestbook, complete quests, collect seasons, and build neighbourhoods — all in a shared 2D grid canvas.

## Architecture

```
metaverse2d/
├── meta/
│   ├── apps/
│   │   ├── frontend/    React + Vite + react-dnd (port 5173)
│   │   ├── http/        Express REST API (port 3000)
│   │   └── ws/          WebSocket server (port 3001)
│   └── packages/
│       └── db/          Prisma schema + migrations + seed
```

| Service | Tech | Port |
|---------|------|------|
| Frontend | React 19, Vite, react-router, Zustand | 5173 |
| HTTP API | Express, Prisma, Better Auth, Multer | 3000 |
| WebSocket | ws, ioredis (optional Redis scaling) | 3001 |
| Database | PostgreSQL | 5432 |

## Quick Start

**Prerequisites:** Node.js >= 18, pnpm, PostgreSQL running on localhost:5432.

```sh
# 1. Install dependencies
pnpm install

# 2. Set up database
cd meta/apps/http
copy .env.example .env    # edit DATABASE_URL if needed
pnpm db:migrate           # run Prisma migrations
pnpm db:seed              # seed default items, elements, maps, avatars

# 3. Start all services (from meta/)
pnpm dev                  # runs frontend :5173, http :3000, ws :3001
```

Open **http://localhost:5173**, sign up, and join a space.

## Development

### Individual service commands

```sh
cd meta/apps/frontend && pnpm dev        # Vite HMR on :5173
cd meta/apps/http && pnpm dev            # Express on :3000 (tsx watch)
cd meta/apps/ws && pnpm dev              # WebSocket on :3001 (tsx watch)
```

### Seed data

```sh
cd meta/apps/http && pnpm db:seed
```

Creates: 10 furniture items, 8 map elements (grass, wall, water, etc.), 2 map templates, 3 avatars.

### Environment variables

| Variable | Default | App |
|----------|---------|-----|
| `DATABASE_URL` | `postgresql://postgres:password@localhost:5432/metaverse` | http, ws |
| `CORS_ORIGIN` | `http://localhost:5173` | http |
| `VITE_WS_URL` | `ws://localhost:3001` | frontend |
| `VITE_API_URL` | `http://localhost:3000` | frontend |
| `USE_REDIS_ROOMS` | `false` | ws |
| `REDIS_URL` | — | ws (when USE_REDIS_ROOMS=true) |

## Features

- **Spaces** — Create and decorate grid-based rooms (10x10 to 50x50)
- **Multiplayer** — Real-time movement, emotes, and interactions via WebSocket
- **Inventory & Economy** — Daily gifts, coin shop, item placement
- **Social** — Player profiles, per-space guestbook, neighbourhood auto-assign (groups of 8)
- **Quests** — Tracked progress with coin/item rewards
- **Seasons** — Time-limited seasonal items and collection book
- **Creator Studio** — Upload images, create items (Admin), place on grid
- **Canvas Editor** — Toggle edit mode with right sidebar palette (Elements/Items tabs), place via click or native drag-and-drop, hover preview with multi-tile footprint, selection highlight, right-click delete
- **Demo mode** — "Load Demo Items" button grants sample inventory for testing placement

## Documentation

See [ROADMAP.md](./ROADMAP.md) for the full development history and upcoming plans.
