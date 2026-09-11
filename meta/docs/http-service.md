# HTTP Service — `apps/http`

The HTTP service is an Express REST API (port 3000) that also serves uploaded files and — because it calls `attachWsServer()` — doubles as a WebSocket endpoint on the same port.

```
meta/apps/http/
├── src/
│   ├── index.ts          Express bootstrap (CORS, auth, /uploads, /api/v1, WS attach)
│   ├── config.ts         (legacy JWT_PASSWORD constant — unused by current auth)
│   ├── scrypt.ts         Legacy scrypt helpers (superseded by better-auth)
│   ├── ws-server.ts      WS upgrade handling + NPC tick (shares ws/src/User.ts)
│   ├── lib/auth.ts       better-auth instance (bearer + username + OAuth + hooks)
│   ├── middleware/
│   │   ├── user.ts       userMiddleware  → sets req.userId / req.role / req.platformRole
│   │   ├── admin.ts      adminMiddleware → requires role === "Admin"
│   │   └── requirePlatformAdmin.ts   gates on req.platformRole === "PLATFORM_ADMIN"
│   ├── routes/v1/        All business routes (23 files)
│   └── types/index.ts    zod schemas + Express Request augmentation
└── uploads/              runtime dir: uploaded images (served at /uploads/*)
```

---

## 1. Bootstrap (`src/index.ts`)

1. `cors` with `CORS_ORIGIN` (comma-separated origins, default localhost:5173/5174), `credentials: true`, exposes `set-auth-token` and `set-cookie`.
2. Explicit `OPTIONS` handlers so browsers never see a 4xx/5xx on preflight.
3. `app.all("/api/auth/*", toNodeHandler(auth))` — better-auth owns everything under `/api/auth`.
4. `app.use(express.json())`.
5. `app.use("/uploads", express.static(path.join(process.cwd(), "uploads")))`.
6. `app.use("/api/v1", router)`.
7. `http.createServer(app)` + `attachWsServer(server)` — WebSocket upgrade handling on the same port.

`src/index.ts` also defines the route group mount table:

```
/api/v1/items           itemRouter      /api/v1/admin        adminRouter + adminBanRouter
/api/v1/inventory       inventoryRouter /api/v1/season       seasonRouter
/api/v1/wallet          walletRouter    /api/v1/collection   collectionRouter
/api/v1/gift            giftRouter      /api/v1/neighbourhood neighbourhoodRouter
/api/v1/shop            shopRouter      /api/v1/billing      billingRouter
/api/v1/user            userRouter      /api/v1/maps         mapsRouter
/api/v1/player          playerRouter    /api/v1/upload       uploadRouter
/api/v1/guestbook       guestbookRouter /api/v1/economy      economyRouter
/api/v1/quests          questRouter     /api/v1/board        boardRouter
/api/v1/report          reportRouter    /api/v1/invite       inviteRouter
/api/v1/space           spaceRouter     / (turn)             turnRouter
```

`/api/v1` itself exposes two ad-hoc read-only endpoints:
- `GET /api/v1/elements` — all element types (id, imageUrl, width, height, static, blocking).
- `GET /api/v1/avatars` — all avatars (id, imageUrl, name).

---

## 2. Authentication (`src/lib/auth.ts`)

Configured with the **bearer** and **username** plugins and email/password enabled:

```ts
betterAuth({
  database: prismaAdapter(client, { provider: "postgresql" }),
  plugins: [bearer(), username()],
  account: { accountLinking: { enabled: true, trustedProviders: ['google','github'] }, skipStateCookieCheck: true },
  emailAndPassword: { enabled: true },
  socialProviders: { google?, github? },   // only if env creds present
  user: { additionalFields: { role: { type: "string", defaultValue: "User", input: false } } },
  databaseHooks: {
    user: { create: { after: grantCommonItemsToNewUser } },
  },
})
```

Key behaviours:
- **Token delivery**: sign-in/sign-up return the bearer token in the `set-auth-token` response header (client reads `res.headers.get("set-auth-token")`). `Authorization: Bearer <token>` authenticates all subsequent calls.
- **New-user bonus**: `databaseHooks.user.create.after` grants **2 × every Common-rarity item** to the new inventory.
- **OAuth**: Google/GitHub enabled only when their env vars are set. The frontend exchanges the resulting cookie session for a bearer token via `GET /api/v1/user/token`.
- **`platformRole`** (`USER`/`PLATFORM_ADMIN`) is a second `additionalFields` entry mirroring `role`. Both are read-only (`input: false`), carried on the session user, and exposed by the middleware as `req.platformRole`. Use `requirePlatformAdmin` for global admin routes (see below); `role = "Admin"` remains the legacy content-admin gate.

The two middleware wrap every protected route:

| Middleware | Success sets | Failure |
|------------|--------------|---------|
| `userMiddleware` | `req.userId`, `req.role`, `req.platformRole` | 403 `{ message: "Unauthorized" }` |
| `adminMiddleware` | `req.userId`, `req.role = "Admin"`, `req.platformRole` | 403 unless `role === "Admin"` |
| `requirePlatformAdmin` | — (reads `req.platformRole`) | 403 unless `PLATFORM_ADMIN` |
| `enforcePlanLimit(key)` | — (reads `req.userId`; must run after `userMiddleware`) | 403 `Upgrade required` / `Plan limit reached` |

`requirePlatformAdmin` is the **platform-level** admin gate (SaaS). It is distinct from both `adminMiddleware` (legacy content admin) and the Space-level `OWNER`/`MEMBER` RBAC. No route currently uses it — it ships ready for the future admin panel.

`enforcePlanLimit` is the central plan gate (see §3.20). `screenShareEnabled` is gate-ready but no screen-share feature exists yet; `maxMembersPerSpace`/`maxConcurrentUsers` numeric limits are enforced on the WS side (join), not HTTP.

---

## 3. Route groups (behaviour, not just endpoints)

### 3.1 Spaces — `routes/v1/space.ts` (largest file, ~1085 lines)

Route **ordering matters**: static paths are registered before dynamic `/:spaceId` routes; `PUT/DELETE /npc/:id` and `DELETE /portal/:id` must come before the dynamic segment so they don't get swallowed.

| Endpoint | Auth | Behaviour |
|----------|------|-----------|
| `GET /space/public` | — | Discoverable spaces (`visibility` = PUBLIC or INVITE_ONLY) with creator name, ordered by name |
| `GET /space/all` | ✓ | Spaces owned by `req.userId` |
| `GET /space/joined` | ✓ | Spaces the user joined via invite (`SpaceMember.role = MEMBER`) |
| `POST /space` | ✓ | Create blank (parses `dimensions` like `20x20`) **or** from a `mapId` template. In a `$transaction`: create space → seed default NPCs → add OWNER `SpaceMember`. **Gated by `enforcePlanLimit("maxSpaces")`**. New spaces default to `visibility: PRIVATE` |
| `PUT /space/:id` | ✓ owner | Update name / `visibility` (or legacy `isPrivate` boolean → mapped to PRIVATE/PUBLIC) |
| `DELETE /space/:spaceId` | ✓ owner | Cascade-delete spaceElements + space |
| `DELETE /space/:spaceId/clear` | ✓ owner | Delete all elements + placedItems (items returned to inventory), keep the space |
| `PUT /space/:spaceId/resize` | ✓ owner | Change width/height (5–200) and optionally shift all content by `offsetX/offsetY` |
| `GET /space/:spaceId` | — | Full space payload: elements (with element types), placedItems (with item types + layer + metadata), portals |

**Element placement** (`POST /element`, `POST /element/batch`, `PUT /element/:id/move`, `DELETE /element`, batch delete):
- Footprint-aware bounds check: `x + element.width > space.width` is rejected (not just `x >= width`).
- Elements layer freely — placing a tree on grass never removes what's below.
- Batch endpoints are lenient: invalid items are skipped, valid ones created via `createManyAndReturn`.

**Item placement** (`POST /place`, `POST /place/batch`, `PUT /placed/:id/move`, `PUT /placed/:id/metadata`, `DELETE /placed/:id`, batch delete):
- Placement **deducts 1 from inventory**; deletion **returns it to inventory** (upsert, transactional).
- AABB overlap check against existing placed items → `409` on collision.
- Batch placement also validates inventory quantity for repeated itemIds.
- `metadata` JSON lets editors store data like sign text.
- Writing `metadata.broadcastZoneId` is **gated**: 403 unless the user's plan has `broadcastEnabled` (Pro).

**NPC routes**: `GET /:spaceId/npcs`, `POST /:spaceId/npc`, `PUT /npc/:id`, `DELETE /npc/:id`.
- Creation defaults: name `"New NPC"`, sprite `"avatar-intern"`, motionType `PATROL`, wanderRadius clamped 1–10.
- NPCs can't be placed on blocking tiles (`isPositionBlocked`).
- Every new space auto-seeds **3 default office NPCs** (Manager Mike, Dev Dana, HR Helen) with patrol paths scaled to space dimensions (`makeDefaultNpcs`).

**Portal routes**: `POST /:spaceId/portal` (validates `toSpaceId`, `fromEdge/toEdge` ∈ NORTH/SOUTH/EAST/WEST, label), `DELETE /portal/:id`.

**Board routes** (also in `space.ts`): `GET/POST /:spaceId/board` — create board with 4 default columns (To Do / In Progress / In Review / Done); one board per space.

**Invite/member routes**: `POST /:spaceId/invite` (owner, returns `token`, optional `expiresInDays`/`maxUses`), `GET /:spaceId/members`, `DELETE /:spaceId/member/:userId` (also **force-closes the removed member's live WS socket** via `getRoomManager` → `forceKick`).

**Access-request routes (email approval)**:
- `POST /:spaceId/access-request` (auth) — non-member requests to join. Already a member → `{ alreadyMember: true }`; PUBLIC space → `{ autoApproved: true }`; else dedupes existing PENDING, creates `AccessRequest` (`expiresAt = now + 7d`), and **emails the owner** with signed Approve/Deny links. Rate-capped at 10 requests/user/day. Requires `ACCESS_DECISION_SECRET`.
- `GET /space/access-request/decide?token=` (public, no session) — verifies the **JWT decision token** (`{ arId, decision }`, secret `ACCESS_DECISION_SECRET`), rejects already-decided (`410`) or expired (`410` + marks EXPIRED), then approves (creates `SpaceMember` MEMBER + emails requester) or denies. Returns a plain HTML page.
- The token binds `arId` only — it can never decide a different request.

### 3.2 Items & Inventory — `routes/v1/item.ts`

- `GET /items` — full catalog (id, name, category, rarity, imageUrl, size, isWallItem, blocking, season), newest first.
- `GET /inventory` — the user's `InventoryItem` rows joined with item data (includes `quantity`).

### 3.3 Wallet — `routes/v1/wallet.ts`

- `GET /wallet` — coins/tokens/stars; **auto-creates** the wallet row on first access.

### 3.4 Daily Gift — `routes/v1/gift.ts`

- `GET /gift/status` — `claimed` + `nextClaimAt`. The next-claim window is computed as **next UTC midnight after `lastClaim`** (`setUTCDate(+1)` + `setUTCHours(0,0,0,0)` — the double-advance bug was fixed here).
- `POST /gift/claim` — in one `$transaction`: upsert DailyGift (increment streak) → +50 coins → random Common item → **streak milestone** items at 7/14/21 days (Rare) and every 28 (Legacy). Returns coins + item + milestone + streak.
- `POST /gift/send` — transfer 1 inventory item to another user (decrement sender, upsert receiver).

> ⚠️ Open issue (from AGENTS.md): the pre-check in `claim` happens outside the transaction — concurrent claims could theoretically double-grant. The cooldown **check itself** is not wrapped; only the grant is.

### 3.5 Shop — `routes/v1/shop.ts`

- `GET /shop/daily` — deterministic **3-item rotation** seeded by the UTC date string (`seedNum * id.charCodeAt(0) % 1000` sort).
- `POST /shop/buy` — price by rarity: Common 50, Uncommon 150, Rare 500, Legacy 1000. Deducts coins + upserts inventory in a transaction.
  > ⚠️ Open issue: the balance check (`wallet.coins < price`) happens before the transaction (TOCTOU).

### 3.6 Users — `routes/v1/user.ts`

- `GET /user/me` — id, username, name, role, platformRole, email, avatarId, displayUsername, image.
- `POST /user/metadata` — update `avatarId` and/or `displayUsername` (zod).
- `POST /user/username` — update username (3–20 alnum+underscore), 409 if taken.
- `GET /user/check-username` — availability check.
- `POST /user/avatar` — multer upload (png/jpg/jpeg/webp/gif ≤ 4MB) → saves to `uploads/avatar-<ts>-<rand>.<ext>`, sets `user.image`.
- `GET /user/token` — **exchanges the OAuth cookie session for a bearer token** (`{ token, userId }`); used by the `/auth/callback` page.
- `GET /user/avatars` — all avatars.
- `GET /user/metadata/bulk?ids=a,b,c` — batch avatar lookup for rendering other players.

### 3.7 Player profiles — `routes/v1/player.ts`

- `GET /player/:userId` — public profile: username, displayUsername, avatar, image, `spaceCount` (aggregated), createdAt.

### 3.8 Guestbook — `routes/v1/guestbook.ts`

- `GET /guestbook/:spaceId` — last 20 messages, newest first, with author username.
- `POST /guestbook/:spaceId` — message ≤ 200 chars.
- `DELETE /guestbook/:id` — allowed for the **author or the space owner**.

### 3.9 Quests — `routes/v1/quest.ts`

- `GET /quests/active` — quests for `week: 1` joined with the user's progress (`progress`, `completed`).
- `POST /quests/progress` — increment progress (upsert); on reaching `goalCount` mark `completedAt` and grant the reward (`coins` → wallet increment, `item` → inventory upsert).

### 3.10 Reports & moderation — `routes/v1/report.ts`, `routes/v1/adminBan.ts`

- `POST /report` — create report (reporter, optional targetUser/message, reason).
- `GET /report` — admin-only: unresolved reports, newest first.
- `POST /admin/ban/:userId` / `POST /admin/unban/:userId` — admin-only, upsert/delete `BannedUser`. The WS server checks this table on join and rejects banned users.

### 3.11 Seasons & Collection — `routes/v1/season.ts`, `routes/v1/collection.ts`

- `GET /season/current` — active season (`startDate <= now <= endDate`) with `daysRemaining` and linked items.
- `GET /collection` — full catalog sorted by category/rarity with a per-user `owned` flag (`quantity > 0`).

### 3.12 Neighbourhood — `routes/v1/neighbourhood.ts`

- `GET /neighbourhood` — **auto-assigns** the user to a group of 8 on first access: `hoodIndex = floor(memberCount / 8)`, naming `Neighbourhood #N`. Returns the neighbourhood with member usernames.

### 3.13 Billing (Razorpay) — `routes/v1/billing.ts`

- `GET /billing/plans` — public plan catalog (id, tier, name, price, billingPeriod, limits).
- `GET /billing/plan` — current user's **effective plan** (via `getEffectivePlan`) + subscription row (`status`, `currentPeriodEnd`, `cancelAtPeriodEnd`). Drives the billing UI.
- `GET /billing/invoices` — the user's invoices, newest 20.
- `POST /billing/subscribe` — `userMiddleware`. Looks up the requested `Plan` by id, requires `plan.razorpayPlanId` to be set, and creates a **Razorpay subscription** via their REST API (Basic auth, `fetch` — no npm SDK). Upserts the local `Subscription` (ownerId unique) as `TRIALING` and returns `{ subscriptionId, shortUrl, localSubscriptionId, plan }`. Returns `409` if the user already has an `ACTIVE` subscription, `503` if `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are unset (graceful, like `turn.ts`).
- `POST /billing/cancel` — self-service cancel-at-period-end (immediate for TRIALING) via Razorpay's cancel endpoint; sets `cancelAtPeriodEnd` and clears the plan cache.
- `POST /billing/webhook` — **no session middleware** (Razorpay hits it directly; the `index.ts` json `verify` captures `req.rawBody`). Authenticated solely by the **Razorpay HMAC-SHA256 signature** (`X-Razorpay-Signature` vs `crypto.createHmac('sha256', RAZORPAY_WEBHOOK_SECRET).update(rawBody)`). Invalid/unsigned → **400** (so Razorpay retries). Handles `subscription.activated` (→ ACTIVE + period, clears grace), `subscription.charged` (→ Invoice row, idempotent via `razorpayPaymentId` unique + extends period + clears grace), `payment.failed` (→ **PAST_DUE + `graceEndsAt = now + 3d`** + emails the owner), `subscription.cancelled` (→ CANCELED), `subscription.halted`/`completed` (→ EXPIRED). Unknown subscription ids are 200-acked so Razorpay stops retrying. On any state change it calls `invalidatePlanCache(ownerId)` so gating reflects immediately.

### Dunning — `lib/dunning.ts` (wired in `index.ts`)

`runDunning()` runs on boot and hourly: finds PAST_DUE subscriptions whose `graceEndsAt <= now` (or null — legacy rows) and **downgrades them to Free** (status → EXPIRED, which gating treats as Free), then `invalidatePlanCache(ownerId)` + emails the owner. `lib/email.ts` is a dependency-free **Resend** client (`RESEND_API_KEY`/`RESEND_FROM`), a graceful no-op when unset.

**Env vars:** `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM`, `APP_URL`. Until `Plan.razorpayPlanId` is populated (via the Razorpay dashboard or API), subscribe returns a helpful 400 — nothing goes live by accident.

### 3.14 Maps & uploads — `routes/v1/maps.ts`, `routes/v1/upload.ts`

- `GET /maps` — map templates (id, name, thumbnail, dimensions).
- `POST /upload` — multer single-file upload (png/jpg/jpeg/gif/webp/svg ≤ 5MB) → `uploads/<ts>-<rand>.<ext>` → returns `{ url: "/uploads/..." }`. Currently consumed by **admin item creation** (the lobby "Creator Studio" tab is a Coming-Soon placeholder and doesn't call it yet).

### 3.15 Economy / chests — `routes/v1/economy.ts`

- `POST /economy/interact` — only works on items whose name contains **"chest"**. Awards `10 + floor(rand()*16)` coins (10–25). Cooldown is **inside** the transaction (checked via `ChestInteraction.lastAt + 1h`) → 429 with minutes remaining. The TOCTOU fix lives here.

### 3.16 Kanban board — `routes/v1/board.ts`

- Columns: `POST /board/:boardId/column`, `PUT /board/column/:id`, `DELETE /board/column/:id` (owner only).
- Cards: `POST /board/column/:columnId/card`, `PUT /board/card/:id` (owner **or assignee**), `PUT /board/card/:id/move` (renumbers siblings in a transaction, validates same board), `DELETE /board/card/:id` (owner).
- Comments: `POST /board/card/:id/comment`, `GET /board/card/:id/comments`.
- **Real-time**: every mutation calls `broadcastBoardUpdate(spaceId)` → `getRoomManager().broadcastToRoom({ type: "board-updated" })`, so open canvases refresh the board live.

### 3.17 Invites — `routes/v1/invite.ts`

- `GET /invite/:token` — public: validates token, expiry, `useCount < maxUses`; returns space info.
- `POST /invite/:token/join` — auth: in a transaction, upsert `SpaceMember` (role MEMBER) and increment `useCount`.

### 3.18 TURN credentials — `routes/v1/turn.ts`

- `GET /turn-credentials` — proxies Metered's REST API (`https://<app>.metered.live/api/v1/turn/credentials?apiKey=...`) when env vars exist; falls back to a Google STUN server otherwise. The WebRTC client calls this on every `PeerManager.init()`.

### 3.19 Admin content — `routes/v1/admin.ts`

Admin-only:
- `POST /admin/item` — create item (also grants 1 to the creating admin's inventory).
- `POST /admin/element` / `PUT /admin/element/:elementId` — create/update element types.
- `POST /admin/avatar` — create avatar.
- `POST /admin/map` — create map template with `defaultElements`.
- `POST /admin/season` — create season with linked itemIds.

### 3.20 Plan gating — `middleware/enforcePlanLimit.ts` + `ws/src/lib/planAccess.ts`

The **shared gating layer** lives in `ws/src/lib/planAccess.ts` (imported by http too — the established cross-import pattern):

- `getEffectivePlan(userId)` → the user's ACTIVE-plan limits, else seeded FREE defaults. Lookups are **cached 60s in-memory** and retried on Prisma **P2024** (Neon pool timeout) with backoff + explicit logging.
- `isBroadcastAllowed` / `isScreenShareAllowed` / `getSpaceCount` / `invalidatePlanCache` helpers.

`enforcePlanLimit(key)` middleware: boolean keys → 403 if the plan disables the feature; numeric keys → 403 if current usage ≥ the cap. Currently wired to:

| Gate | Where |
|------|-------|
| `maxSpaces` | `POST /space` (HTTP, via `enforcePlanLimit`) |
| `maxConcurrentUsers` | WS `join` (room capacity) |
| `broadcastEnabled` | WS `rtc:broadcast-zone-join` (soft toast deny) + `PUT /placed/:id/metadata` when setting `broadcastZoneId` |
| `screenShareEnabled` | gate-ready, feature not built yet |

### 3.21 Platform admin panel — `routes/v1/adminPanel.ts`

All `/admin/panel/*` routes run `userMiddleware` **then** `requirePlatformAdmin` (a plain user hitting them gets 403 → the frontend shows the admin gate). Plain tables/forms per the plan:

| Endpoint | Purpose |
|----------|---------|
| `GET /admin/panel/summary` | MRR (monthly-equivalent paise), user/admin/space counts, active subs, `subsByStatus`, failed-invoice count, **live room + user counts** (via `getRoomManager` — the HTTP process hosts the WS) |
| `GET /admin/panel/users?search=` | Users (name/username/email contains), with sub status + plan tier |
| `GET /admin/panel/subscriptions?status=` | Subs + owner + plan; filter by status (esp. `PAST_DUE`) |
| `POST /admin/panel/subscriptions/:id/override` | Manual plan/status override → `AdminAuditLog` + `invalidatePlanCache(ownerId)` |
| `GET /admin/panel/invoices?status=` | Invoices + owner; watch `failed` |
| `GET /admin/panel/spaces` | Spaces + creator + `_count` (members/elements/placedItems/NPCs) |
| `GET /admin/panel/audit` | AdminAuditLog trail |

---

## 4. Shared conventions & gotchas

- **Zod schemas** (`src/types/index.ts`) define request bodies for the main routes; many routes still hand-validate. `BatchAddElementSchema` caps at 100 elements, `BatchPlaceItemSchema` at 50 items.
- **Ownership rule**: nearly every mutation checks `space.creatorId === req.userId` before touching data.
- **Transactions**: any operation that both writes inventory/wallet AND creates/deletes placed content is wrapped in `client.$transaction`.
- **`req.userId` / `req.role`** are typed onto Express via `declare global` in `types/index.ts`.
- **Static-before-dynamic**: in `space.ts`, `/public`, `/all`, `/element`, `/place`, `/npc/:id`, `/portal/:id` must stay above `/:spaceId` routes — reordering them silently breaks the API.