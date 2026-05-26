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

## DB Commands

```sh
cd apps/http
pnpm db:migrate   # Apply Prisma migrations
pnpm db:seed      # Seed default data
pnpm db:studio    # Open Prisma Studio
```
