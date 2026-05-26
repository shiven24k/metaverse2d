# Metaverse 2D — Frontend

React 19 + Vite + react-router + Zustand.

## Routes

| Path | Page |
|------|------|
| `/login` | Auth (sign-in / sign-up) |
| `/lobby` | Space list, shop, collection, creator studio |
| `/arena?spaceId=...` | 2D multiplayer canvas with editor |
| `/profile/:userId` | Player profile |

## Environment

| Variable | Default |
|----------|---------|
| `VITE_API_URL` | `http://localhost:3000` |
| `VITE_WS_URL` | `ws://localhost:3001` |

## Commands

```sh
pnpm dev     # Vite dev server with HMR
pnpm build   # tsc + vite build
pnpm lint    # ESLint
```
