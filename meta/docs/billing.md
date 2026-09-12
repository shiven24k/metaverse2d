# SaaS Billing — Flow, Protocols & Operations

Code-grounded reference for the subscription/billing system: how a user goes from Free → paid, how access is gated, how payments are verified, how cancellation/dunning work, and what to do before going live. Written from the source under `meta/`.

**Source of truth lives in code:** `apps/http/src/routes/v1/billing.ts`, `apps/http/src/routes/v1/adminPanel.ts`, `apps/ws/src/lib/planAccess.ts`, `apps/http/src/lib/dunning.ts`, `apps/frontend/src/BillingPage.tsx`.

---

## 1. TL;DR

- Billing is **Razorpay subscription** based. Prices are stored in **INR paise** and are the only amount ever charged.
- The client **never sends a price** — only a `planId`. Limits/prices come from the `Plan` row.
- Subscription state is driven by the **Razorpay webhook** (signature-verified), not by the browser.
- Every HTTP/WS feature check reads the user's **effective plan** through one shared helper (`planAccess`), cached 60s and invalidated on billing changes.
- One subscription per user (`Subscription.ownerId @unique`).
- Currency shown in the UI is **display-only** (see `docs/frontend-service.md` §currency); charging is always INR.

---

## 2. Data model

From `packages/db/prisma/schema.prisma`:

| Model | Key fields | Notes |
|---|---|---|
| `Plan` | `tier` (FREE/STARTER/PRO), `billingPeriod` ("monthly"/"yearly"), `priceInPaiseINR`, `maxSpaces`, `maxMembersPerSpace`, `maxConcurrentUsers`, `screenShareEnabled`, `broadcastEnabled`, `razorpayPlanId?` | unique `(tier, billingPeriod)`; catalog only |
| `Subscription` | `ownerId` **unique**, `planId`, `status`, `razorpaySubscriptionId?` unique, `razorpayCustomerId?`, `currentPeriodStart/End?`, `trialEndsAt?`, `cancelAtPeriodEnd`, `graceEndsAt?` | one per user; `graceEndsAt` = dunning deadline |
| `Invoice` | `subscriptionId`, `razorpayPaymentId?` unique, `razorpayInvoiceId?` unique, `amountInPaise`, `currency`, `status`, `paidAt?` | unique ids give webhook idempotency |
| `AdminAuditLog` | `adminId`, `action`, `targetType`, `targetId`, `metadata?` | every manual override is recorded |

### Subscription status semantics

| Status | Meaning | Paid access? |
|---|---|---|
| `TRIALING` | Razorpay subscription created, **checkout not completed / not yet charged**. Not a free trial. | ❌ Free |
| `ACTIVE` | Paid and in good standing. | ✅ paid plan |
| `PAST_DUE` | A payment failed; inside the **3-day grace window** (`graceEndsAt`). | ✅ paid plan (grace) |
| `CANCELED` | Cancelled (fired at cycle end for cancel-at-period-end). | ❌ Free |
| `EXPIRED` | Dunning grace elapsed, halted, or a finite subscription ended without renewal. | ❌ Free |

> ⚠️ `TRIALING` is a **checkout-pending** state, not a free trial. There is no `trial_period_days` today (see §9).

---

## 3. End-to-end flow

```
User (browser)                HTTP API                     Razorpay
  │  POST /billing/subscribe ─►│
  │                            │ Basic-auth create subscription ─►│
  │                            │◄─ { id, short_url } ─────────────│
  │                            │ upsert Subscription (TRIALING)
  │◄─ { shortUrl } ────────────│
  │  window.location = shortUrl ───────────────────────────────►│  hosted checkout
  │                                                             │  customer pays
  │                            │◄─ webhook subscription.activated/charged
  │                            │ verify HMAC (timing-safe)
  │                            │ Invoice upsert (idempotent) + Subscription → ACTIVE
  │                            │ invalidatePlanCache(ownerId)
  │  GET /billing/plan ───────►│ returns ACTIVE plan
```

### Switching / downgrading
`POST /billing/subscribe` with a **different** plan:
1. If `ACTIVE` on the *same* plan → `409`.
2. If there is a live local sub (`TRIALING`/`ACTIVE`/`PAST_DUE`) with a `razorpaySubscriptionId` and the plan differs → the **old Razorpay sub is cancelled at period end** (`cancel_at_cycle_end: true`), then a **new** subscription is created and the local row is overwritten (status `TRIALING`, `cancelAtPeriodEnd: false`).
3. The browser is redirected to the new `short_url`.

> No proration — see §9. Downgrades currently take effect immediately (charged now) rather than at period end.

### Cancel
`POST /billing/cancel` (optional `reason` in body, logged):
- `TRIALING` → Razorpay cancel **immediately**; local `cancelAtPeriodEnd = false`.
- otherwise → `cancel_at_cycle_end: true`; local `cancelAtPeriodEnd = true`; access continues until the period ends, then the `subscription.cancelled` webhook flips it to `CANCELED`.

### Dunning
`lib/dunning.ts` runs **on boot + hourly**: finds `PAST_DUE` subs whose `graceEndsAt <= now` (or null legacy rows) → sets `EXPIRED` (gating → Free), invalidates cache, and emails the owner. The webhook sets `graceEndsAt = now + 3d` on `payment.failed` and clears it on `activated`/`charged`/re-subscribe.

---

## 4. Endpoints

### Public (no session)
| Endpoint | Purpose |
|---|---|
| `GET /api/v1/billing/plans` | Plan catalog (excludes `razorpayPlanId`). |
| `GET /api/v1/billing/region` | Display-currency from IP (`CF-IPCountry` → `X-Country-Code` → optional `ipwho.is` → INR). Display-only. |
| `GET /api/v1/billing/health` | Config flags: `razorpayConfigured`, `razorpayWebhookConfigured`, `resendConfigured`, `plansMissingRazorpayIds`. Drives the UI warning banner. |

### Authenticated (`userMiddleware` → Bearer session)
| Endpoint | Purpose |
|---|---|
| `GET /billing/plan` | Effective plan + subscription row (drives the UI). |
| `GET /billing/invoices` | User's invoices (newest 20). |
| `POST /billing/subscribe` | `{ planId }`. Rejects FREE, requires `razorpayPlanId`, serialized per-user (429 if a change is in flight), handles switching. Returns `{ subscriptionId, shortUrl, ... }`. |
| `POST /billing/cancel` | `{ reason? }` self-service cancel (see §3). |

### Webhook (no session — signature only)
`POST /billing/webhook` — verified with `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET` using **`crypto.timingSafeEqual`**. Invalid/unsigned → **400** (so Razorpay retries). Unknown subscription ids are **200-acked** (stop retrying).

| Event | Effect |
|---|---|
| `subscription.activated` | → `ACTIVE`, clears grace, sets period. |
| `subscription.charged` | Invoice row (idempotent, `P2002`-safe) → `ACTIVE`, extends period, clears grace. |
| `payment.failed` | → `PAST_DUE`, `graceEndsAt = now + 3d`, emails owner. |
| `subscription.cancelled` | → `CANCELED`. |
| `subscription.halted` | → `EXPIRED` (repeated failures). |
| `subscription.completed` | Tries **auto-renewal** (new subscription + email with pay link) for paid plans; else → `EXPIRED`. |

Every state change calls `invalidatePlanCache(ownerId)` so gating reflects immediately.

---

## 5. Plan gating map

One helper: `apps/ws/src/lib/planAccess.ts::getEffectivePlan(userId)` — returns the paid plan for `ACTIVE` **and `PAST_DUE`**, else FREE defaults. 60s cache; `withRetry` on Prisma `P2024`.

FREE defaults (when no FREE row overrides): `maxSpaces 1`, `maxMembersPerSpace 10`, `maxConcurrentUsers 10`, no screen share, no broadcast.

| Limit | Enforced at | Mechanism |
|---|---|---|
| `maxSpaces` | `POST /space` | `enforcePlanLimit("maxSpaces")` → 403 |
| `maxConcurrentUsers` | WS `join` (after stale eviction) | `failWith("forbidden")` toast |
| `broadcastEnabled` | WS `rtc:broadcast-zone-join`; `PUT /placed/:id/metadata` broadcast zone | soft-deny toast / 403 |
| `screenShareEnabled` | WebRTC screen-share path | plan flag |
| `maxMembersPerSpace` | `POST /invite/:token/join`; access-request **approve** | counts members vs owner's plan → 403 |

---

## 6. Admin panel

`apps/http/src/routes/v1/adminPanel.ts`, mounted at `/api/v1/admin/panel/*`, gated by `userMiddleware` + `requirePlatformAdmin` (`platformRole === "PLATFORM_ADMIN"`).

| Endpoint | Purpose |
|---|---|
| `GET /panel/summary` | Counts, **MRR**, **total revenue**, paid invoices, failed invoices, live rooms/users. |
| `GET /panel/users` | Search users; shows plan/status. |
| `GET /panel/subscriptions` | Filter by status; **customer email, paid-invoice count, revenue per customer**. |
| `POST /panel/subscriptions/:id/override` | Manual `planId`/`status` change → writes `AdminAuditLog` + invalidates cache. |
| `GET /panel/invoices` / `spaces` / `audit` | Tables. |

Frontend: `apps/frontend/src/AdminPanelPage.tsx` at `/admin` (shows "Admin access required" on 403).

---

## 7. Security protocols

- **Webhook authenticity** — HMAC-SHA256 over the **raw body** (`express.json({ verify })` captures `req.rawBody` only for `/billing/webhook`); **timing-safe** compare; fail closed with 400.
- **No secrets from the client** — `razorpayPlanId` is never returned; Razorpay calls use server-side Basic auth.
- **Server-side price/limits** — client sends `planId` only.
- **Idempotency** — Invoice unique `razorpayPaymentId`/`razorpayInvoiceId`; duplicate webhooks are no-ops.
- **Double-charge guard** — per-user in-process lock on `subscribe` → 429.
- **Authz** — session Bearer (`userMiddleware`); admin routes additionally require `PLATFORM_ADMIN`.
- **Grace correctness** — `PAST_DUE` keeps access until dunning downgrades (fixed; was previously instant-Free).
- **EMail** — Resend, env-gated no-op when unset; never throws into billing flows.

---

## 8. Going live — checklist

**Database**
1. Apply migrations (billing schema `20260905000000`, grace period `20260905000002`, …).
2. Seed the catalog: `pnpm --filter @repo/db seed` (upserts FREE/STARTER/PRO × monthly/yearly).

**Razorpay**
3. Create a Razorpay **Plan** for each paid catalog row, then map the ids without needing `psql`:
   ```bash
   pnpm --filter @repo/db set-plan-ids \
     STARTER monthly plan_XXXX \
     STARTER yearly  plan_YYYY \
     PRO     monthly plan_ZZZZ \
     PRO     yearly  plan_WWWW
   ```
   `GET /billing/health` reports how many are still missing.
4. Set the API keys on the **API server** (`apps/http/.env`): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`.
5. In the Razorpay dashboard, point the webhook at `https://<api-host>/api/v1/billing/webhook` and select the subscription events in §4.

**App**
6. `APP_URL=https://<frontend-host>` (email links), `CORS_ORIGIN=https://<frontend-host>` (browser origin).
7. `RESEND_API_KEY` / `RESEND_FROM` for transactional email.
8. Promote at least one admin: `pnpm --filter @repo/db set-platform-admin you@example.com` → ⭐ Admin appears in the lobby.
9. Optional: `GEOIP_FALLBACK=true` if not behind Cloudflare (for display currency).

**Verify**
- `GET /billing/health` → `razorpayConfigured: true`, `plansMissingRazorpayIds: 0`.
- `GET /billing/plans` → non-empty.
- Click Upgrade on `/billing` → Razorpay checkout; after paying, `/billing/plan` shows `ACTIVE`.

---

## 9. Known gaps / roadmap

Not yet implemented (documented so behavior isn't mistaken for a bug):

| Gap | Impact |
|---|---|
| **No proration** | Upgrades charge full new price now; the old sub runs to period end (brief double coverage). Downgrades charge immediately instead of at period end. |
| **No real trial** | `TRIALING` ≠ free trial; no `trial_period_days`. |
| **No reactivate / undo-cancel** | Razorpay can't resume a cancel-at-cycle-end sub; needs a re-subscribe flow. |
| **No rate limiting** | `/subscribe`, `/cancel`, `/webhook` are unthrottled. |
| **No webhook event log** | Only signature verification; raw events aren't persisted for replay/debug. |
| **No tax/GST, billing address, invoice PDF** | Only invoice rows are stored. |
| **`userMiddleware` returns 403** for unauthenticated | Convention is 401 (frontend handles both). |
| **Subscribe lock is single-node** | In-memory Set; multi-instance needs Redis/DB lock. |
| **`payment.failed` needs the subscription entity** | Some Razorpay payloads omit it → a missed `PAST_DUE`. |
| **No customer portal / update card** | Payment method changes go through Razorpay's hosted flow only. |

Recent correctness fixes (do not revert): PAST_DUE grace access, timing-safe webhook compare, FREE-plan checkout rejection, per-user subscribe lock, invoice `P2002` guard, `maxMembersPerSpace` enforcement.

---

## 10. File map

| File | Role |
|---|---|
| `apps/http/src/routes/v1/billing.ts` | Plans/region/health, subscribe, cancel, webhook, helpers |
| `apps/http/src/routes/v1/adminPanel.ts` | Admin panel endpoints + override audit |
| `apps/http/src/lib/dunning.ts` | Grace-period downgrade scheduler |
| `apps/http/src/lib/email.ts` | Resend transactional email (env-gated) |
| `apps/http/src/lib/currency.ts`, `lib/geo.ts` | Display-currency + IP region resolution |
| `apps/http/src/middleware/enforcePlanLimit.ts` | HTTP numeric/boolean plan gate |
| `apps/http/src/middleware/requirePlatformAdmin.ts` | `PLATFORM_ADMIN` gate |
| `apps/ws/src/lib/planAccess.ts` | Shared effective-plan cache + gating helpers |
| `apps/ws/src/User.ts` | WS-side gates (concurrent users, broadcast zones) |
| `apps/frontend/src/BillingPage.tsx` | `/billing` UI (plans, upgrade/switch, cancel modal, invoices, health banner) |
| `apps/frontend/src/AdminPanelPage.tsx` | `/admin` panel UI |
| `apps/frontend/src/lib/currency.ts` | `useRegion`, conversion/formatting, manual override |
| `packages/db/prisma/schema.prisma` | `Plan` / `Subscription` / `Invoice` / `AdminAuditLog` |
