# Metaverse2D — Technical Documentation

Detailed, code-grounded documentation for every service in the Metaverse2D monorepo. These docs are written directly from the source under `meta/` and are kept separate from the marketing-style READMEs so engineers and AI agents can rely on them.

## Where the app is right now

**Status snapshot (Sept 2026):** the project has moved well past the READMEs at the repo root and `meta/README.md`. Those files document Phases 0–4, but the code now also contains:

- **WebRTC voice/video** — proximity voice, proximity video, conference rooms (full mesh), broadcast zones (one speaker → many listeners), knock-to-join calls, speaking indicators, draggable video tiles. See [webrtc.md](./webrtc.md) and [webrtc-postmortem.md](./webrtc-postmortem.md).
- **Proximity chat** — messages only reach players within ~3 tiles (150px / 50px tile), persisted per room key, history replay on join.
- **In-app notifications** — join/leave toasts, admin announcements, user pings, urgent banners.
- **Status emotes** — persistent AFK/BRB/coffee/tea/yawn/stretch overlays (in addition to the quick emoji burst emotes).
- **NPCs** — three motion types (STATIC / PATROL / WANDER), patrol paths, wander radius, dialogues; every new space auto-seeds 3 office NPCs (the seed script backfills 6 into pre-existing spaces).
- **Portals** — edge-to-edge links between spaces with `F`-to-travel and an animated canvas shimmer.
- **Spaces v2** — privacy (private spaces + invite links), space members, space resize, `clear` (wipe content but keep the space), per-space **Kanban board** with columns, cards, assignees, priorities, due dates and comments.
- **Space access isolation** — `Space.visibility` (PRIVATE/INVITE_ONLY/PUBLIC, default PRIVATE) replaces `isPrivate`; every WS join/reconnect re-checks `SpaceMember` server-side; owner-approved **access requests via signed email links** (`ACCESS_DECISION_SECRET`, partial pending-unique index); **member removal force-closes the live WS socket**.
- **Chest economy** — placed chest items award 10–25 coins with a 1-hour per-chest cooldown.
- **TURN credentials endpoint** — `GET /api/v1/turn-credentials` dynamically proxies Metered TURN creds to the WebRTC client.
- **Guest mode** — browse/join without an account (read-only WS identity, no saves).
- **SaaS billing foundation** — `PlatformRole`, `Plan`, `Subscription`, `Invoice`, `AdminAuditLog` models + `platformRole` session field + `requirePlatformAdmin` middleware + 6 seeded plan rows. **Step 2 wired**: Razorpay `POST /billing/subscribe` + signature-verified `POST /billing/webhook` (dependency-free, env-gated via `RAZORPAY_*`). **Step 3 wired**: plan gating (`planAccess` + `enforcePlanLimit`) enforcing `maxSpaces` (space create), `maxConcurrentUsers` (WS join) and `broadcastEnabled` (WS zone join + metadata write). **Step 4 wired**: self-service `/billing` page (current plan, plans grid, Razorpay checkout redirect, cancel, invoices) + backend `GET /billing/plans|plan|invoices`, `POST /billing/cancel`, and webhook cache invalidation. **Step 5 wired**: platform-admin panel (`/admin`, gated by `requirePlatformAdmin`) — summary/MRR, users, subscriptions + override (→ `AdminAuditLog`), invoices, spaces, audit. **Step 6 wired**: dunning (`Subscription.graceEndsAt`, hourly auto-downgrade of expired-grace PAST_DUE subs → Free + cache invalidation) and Resend transactional email on payment failure/downgrade (`RESEND_API_KEY`).
- **Marketing site** — `/`, `/about`, `/pricing`, `/contact` pages served by the same SPA.
- **OAuth** — optional Google / GitHub social sign-in wired through better-auth.

Current phase on the [ROADMAP](../ROADMAP.md): **Phase 5 (Scale & Polish) in progress**.

## Document index

| Document | Covers |
|---|---|
| [architecture.md](./architecture.md) | System overview: the 4 deployable units, ports, request lifecycle, WS protocol overview, WebRTC signaling, deployment topology (`deploy/` + pm2), tests, shared packages |
| [http-service.md](./http-service.md) | The **HTTP REST service** (`apps/http`) — server bootstrap, auth, every route group, middleware, uploads, the in-process WS bridge |
| [ws-service.md](./ws-service.md) | The **WebSocket service** (`apps/ws` + the shared `User.ts`) — connection lifecycle, every message type, movement validation, NPC tick, proximity chat, conference rooms, broadcast zones, Redis scaling |
| [frontend-service.md](./frontend-service.md) | The **React frontend** (`apps/frontend`) — routing, stores, the canvas game loop, movement/click-to-walk, the editor, activities, emotes, notifications, proximity chat UI, WebRTC client (`PeerManager`) |
| [database.md](./database.md) | The **shared DB package** (`packages/db`) — Prisma schema, every model, migrations workflow, seed data |
| [webrtc.md](./webrtc.md) | WebRTC feature reference (signaling, PeerManager API, ICE/TURN, audio pipeline) |
| [webrtc-postmortem.md](./webrtc-postmortem.md) | Retrospective of WebRTC bugs and the fixes that shipped |

## Reading guide

- Want the 30-second mental model? → [architecture.md](./architecture.md)
- Building/editing an HTTP endpoint? → [http-service.md](./http-service.md)
- Building/editing a WS message? → [ws-service.md](./ws-service.md)
- Changing something in the canvas game or UI? → [frontend-service.md](./frontend-service.md)
- Adding a DB model or migration? → [database.md](./database.md) then `AGENTS.md` at `meta/AGENTS.md`

## A note on the embedded WebRTC dev-notes

There is also a **developer-notes copy inside the frontend source**: `apps/frontend/src/webrtc/WEBRTC.md`. Treat `docs/webrtc.md` (canonical) and `docs/webrtc-postmortem.md` as the source of truth — the embedded copy predates them and is **out of date in places** (e.g. it still describes `disableCamera()` as `removeTrack` + `track.stop()`, which the code replaced with `toggleCamera()` / `track.enabled`, and lists video tiles at 280px wide when `RemoteVideoTile` is 140×80).

## Keeping docs honest

These docs were generated by reading the source. When you change code, update the matching doc. The rule of thumb used here: **document behaviour, not just endpoints** — each section explains *why* the code does what it does, with `file:line` pointers where helpful.