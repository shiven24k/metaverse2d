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
| `Subscription` | `ownerId` **unique**, `planId`, `status`, `razorpaySubscriptionId?` unique, `razorpayCustomerId?`, `currentPeriodStart/End?`, `trialEndsAt?`, `cancelAtPeriodEnd`, `graceEndsAt?`, **`pendingPlanId?`, `pendingRazorpaySubscriptionId?` unique, `pendingShortUrl?`** | one per user; `graceEndsAt` = dunning deadline; `pending*` = an in-flight checkout whose payment hasn't been confirmed yet (the current `planId`/`status` are left untouched until it is) |
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

Checkout runs in a **Razorpay modal on the app's own page** (`checkout.js`), so the user is never redirected to `api.razorpay.com` and can't get "stuck" there. Payment is confirmed **synchronously** via `POST /billing/verify` (which asks Razorpay's API directly); the webhook remains the async backup that also records the Invoice row.

```
User (browser)                HTTP API                     Razorpay
  │  POST /billing/subscribe ─►│
  │                            │ Basic-auth create subscription ─►│
  │                            │◄─ { id, short_url } ─────────────│
  │                            │ upsert/update Subscription with
  │                            │   pendingPlanId + pendingRazorpaySubscriptionId
  │◄─ { subscriptionId } ──────│   (current planId/status untouched)
  │  open Razorpay modal ─────────────────────────────────────────►│
  │  (keyId from /billing/health)  customer pays                   │
  │  handler: POST /billing/verify { paymentId } ─►│
  │                            │ GET /subscriptions/:id (+ payment)
  │                            │ activatePendingPlan → ACTIVE
  │                            │ invalidatePlanCache(ownerId)
  │  GET /billing/plan ───────►│ returns ACTIVE plan
  │                            │ (webhook subscription.activated / charged
  │                            │  is the async backup + Invoice recorder)
```

### Switching / downgrading
`POST /billing/subscribe`:
1. If the requested plan is already the current plan in `ACTIVE`/`PAST_DUE`, or is already the pending plan → `409` (prevents duplicate Razorpay subscriptions).
2. If there is an abandoned **pending checkout** already, that Razorpay sub is cancelled immediately.
3. If there is a live sub on a **different** plan (`ACTIVE`/`PAST_DUE`), the old Razorpay sub is cancelled at `cancel_at_cycle_end: true` (the customer keeps paid access until the new payment confirms), then a new pending checkout is created.
4. The local row keeps the CURRENT `planId`/`status` — only the `pending*` fields change. The plan flips to the new one when `POST /billing/verify` or the webhook confirms payment.

> No proration — see §9. Downgrades take effect on webhook/verify confirmation.

### Cancel
`POST /billing/cancel` (optional `reason` in body, logged):
- **pending checkout** → Razorpay sub cancelled immediately; the `pending*` fields are cleared (current plan untouched).
- `TRIALING` (legacy) → Razorpay cancel **immediately**; local status set to `CANCELED` right away.
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
| `GET /api/v1/billing/health` | Config flags: `razorpayConfigured`, `razorpayWebhookConfigured`, `resendConfigured`, `plansMissingRazorpayIds`, and the **public `razorpayKeyId`** (used to init the checkout modal — key ids are safe to expose; the secret never leaves the server). Drives the UI warning banner. |

### Authenticated (`userMiddleware` → Bearer session)
| Endpoint | Purpose |
|---|---|
| `GET /billing/plan` | Effective plan + subscription row (drives the UI). |
| `GET /billing/invoices` | User's invoices (newest 20). |
| `POST /billing/subscribe` | `{ planId }`. Rejects FREE, requires `razorpayPlanId`, serialized per-user (429 if a change is in flight), handles switching. Returns `{ subscriptionId, shortUrl, pendingPlan, ... }` — the app opens the Razorpay checkout modal with `subscriptionId` (hosted `shortUrl` is only the fallback). |
| `POST /billing/cancel` | `{ reason? }` self-service cancel (see §3). |
| `POST /billing/verify` | `{ paymentId? }` — fetches `GET /subscriptions/:id` directly from Razorpay: `active` → **activates the pending plan immediately** (+ records the paid Invoice from `paymentId` when captured); dead states (`cancelled/expired/halted/completed`) → clears the pending fields; still-pending → returns `{ verified: false, status }`. Called after the checkout modal reports success and when returning to `/billing` with a pending card, so the plan flips **even if the webhook is delayed or unconfigured**. If Razorpay reports `active` but no pending plan row exists, it returns **409** (instead of a fabricated success). |

### Webhook (no session — signature only)
`POST /billing/webhook` — verified with `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET` using **`crypto.timingSafeEqual`**. Invalid/unsigned/malformed → **400** (so Razorpay retries). Unknown subscription ids are **200-acked** (stop retrying). Processing failures (DB errors, etc.) → **500** so Razorpay retries the event. The switch handles `subscription.activated/charged/cancelled/halted/completed`, `payment.captured/authorized/failed`, and `invoice.paid/payment_failed`; `subscription.pending/authenticated/updated` are acknowledged no-ops; any other event is logged (`[billing] unhandled webhook event`).

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

FREE defaults (when no FREE row overrides): `maxSpaces 1`, `maxMembersPerSpace 5`, `maxConcurrentUsers 5`, no screen share, no broadcast.

**Whose plan is checked?** Space-scoped limits (room capacity, broadcast zones) gate on the **space owner's** plan — the owner bought those seats/features for their space, so guests and Free members must not shrink a paid owner's room. User-level features (screen share) gate on the **user's own** plan.

| Limit | Enforced at | Mechanism |
|---|---|---|
| `maxSpaces` | `POST /space` | `enforcePlanLimit("maxSpaces")` → 403 (own plan) |
| `maxConcurrentUsers` | WS `join` (after stale eviction) | checks **owner's** plan → `failWith("forbidden")` toast |
| `broadcastEnabled` | WS `rtc:broadcast-zone-join`; `PUT /placed/:id/metadata` broadcast zone | **owner's** plan; soft-deny toast / 403 (a Pro owner's Free members CAN listen in their cinema hall) |
| `screenShareEnabled` | WS `rtc:screen-share` relay gate + client UI button | **sharer's own** plan; denied → toast, no relay |
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
- Click Upgrade on `/billing` → Razorpay **checkout modal** on the app's page; after paying, the modal handler calls `POST /billing/verify` and `/billing/plan` shows `ACTIVE` immediately (webhook is the async backup). Landing back on a "Pending checkout" card → click **"I've paid — verify"** (auto-runs once on load too).

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
| **No customer portal / update card** | Payment method changes go through Razorpay's hosted flow only. |
| **Frontend polling during TRIALING/PAST_DUE** | BillingPage polls every 5s while checkout is pending/past-due to reflect webhook state without a manual refresh. |

Recent correctness fixes (do not revert): PAST_DUE grace access, timing-safe webhook compare, FREE-plan checkout rejection, per-user subscribe lock, invoice `P2002` guard, `maxMembersPerSpace` enforcement, **checkout modal + `POST /billing/verify`** (no hosted-page redirect, plan activates without the webhook), **owner-plan gates** for `maxConcurrentUsers`/broadcast zones, **screen share (STARTER+)**, **webhook try/catch + unhandled-event logging + payment/invoice event handling**, and **progress UI on the billing page** (verify spinner, "still processing" messaging, missing-webhook banner, `razorpayWebhookConfigured` surfaced).

---

## 10. File map

| File | Role |
|---|---|
| `apps/http/src/routes/v1/billing.ts` | Plans/region/health, subscribe, cancel, **verify**, webhook, helpers |
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
