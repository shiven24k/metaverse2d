# WebSocket Service — `apps/ws`

The WebSocket service is the real-time backbone of the game: room membership, movement, chat, emotes, interactions, editor sync, notifications, and WebRTC signaling. The core `User` class is **shared** with the HTTP service (via `attachWsServer`), so this doc applies to both the standalone `ws` app (port 3001) and the WS endpoint on the HTTP server (port 3000).

```
meta/apps/ws/src/
├── index.ts               Standalone WS bootstrap + NPC tick + AFK detection + keepalive
├── User.ts                Per-connection class — all message handling (shared with http)
├── types.ts               Incoming/Outgoing message unions
├── RoomManager.ts         In-memory room registry (singleton)
├── RedisRoomManager.ts    Redis pub/sub room registry (USE_REDIS_ROOMS=true)
├── getRoomManager.ts      Env-driven factory: Redis ↔ memory
├── blockingCache.ts       TTL-cached set of blocking cells per space
├── proximityChatManager.ts Proximity chat room keys + message persistence
├── lib/auth.ts            better-auth instance for token validation
├── lib/planAccess.ts      Shared SaaS plan gating (see §5.5)
└── config.ts              (legacy constant, unused)
```

---

## 1. Connection lifecycle

1. `wss.on("connection")` creates a `User(ws)` — 10-char random socket id, `isGuest = false`.
2. The client **must** send a `join` message first (with `spaceId` + optional `token`).
3. `ws.on("close")` calls `user.destroy()` which cleans up rooms, conference zones, proximity peers, and broadcasts `user-left`.

### `join` processing (`User.ts` `case "join"`)

1. **Re-join guard**: if the socket already had a `spaceId`, remove it from the old room first (prevents ghosts).
2. **Identity**:
   - No token → guest identity: `userId = guest-<id>`, username `Guest-XXXX`, avatar `avatar-intern`.
   - Token → `auth.api.getSession({ authorization: Bearer <token> })`; invalid/expired → `failWith("unauthorized")` then close (client stops reconnecting and shows the error).
3. **Ban check** — `BannedUser.findUnique` → `failWith("banned")`.
4. **Access check** — if `space.visibility !== 'PUBLIC'`, the user must be an existing `SpaceMember` (re-checked on **every** join/reconnect), else `failWith("forbidden")`. Guests are always forbidden on non-PUBLIC spaces. PUBLIC spaces allow anyone (guests included) to join without a membership row.
5. **Stale-session eviction** — if another socket with the same `userId` is still in the room array, it is removed (and its `spaceId` cleared) so a reconnect doesn't show a duplicate avatar.
6. Spawn at a random cell, snapped to the **nearest walkable cell** (`findNearestWalkable` via the blocking cache).
7. Send `space-joined` (spawn, userId, username, avatarId, roster of other users), broadcast `user-joined` + a `notification`, then `broadcastRoomUpdates` (proximity chat room recalculation).

### `destroy()` (disconnect)

Guarded by `if (!this.spaceId) return` (socket closed before joining). Then:
1. Leave conference rooms, notify remaining members via `rtc:peer-left`.
2. Send `rtc:peer-left` to all proximity peers.
3. Clean up broadcast zones (speaker or listener paths).
4. Broadcast `user-left` + a `notification`.
5. `removeUser` + recompute proximity chat rooms.

`forceKick(message)` (used by member revocation in the HTTP route) sends an `error` (`forbidden`) then closes the socket — the close handler runs `destroy()`, so the removed member leaves the room immediately, not on their next reconnect.

---

## 2. Incoming message reference (Client → Server)

| Type | Payload | Behaviour |
|------|---------|-----------|
| `join` | `{ spaceId, token }` | Full join flow above |
| `move` | `{ x, y }` | Enqueued on `lastMove` chain → `processMove` (§3) |
| `emote` | `{ emoji, x, y }` | Broadcast `emoted` (floating emoji burst) |
| `status-emote` | `{ emoteId }` | Persistent overlay (`coffee/tea/yawn/stretch/afk/brb/''`); afk/brb persist, others expire in 5 s → broadcast `emote-broadcast` |
| `chat` | `{ message, x, y }` | Broadcast `chat` (legacy whole-room chat bubble) |
| `chat-message` | `{ content }` | **Proximity chat** (§4) — only nearby users receive it |
| `interact` | `{ itemId, itemName, x, y }` | Broadcast `interacted` (item interaction FX) |
| `avatar-changed` | `{ avatarId }` | Update `this.avatarId`, broadcast `avatar-changed` |
| `activity-changed` | `{ activity }` | `'sitting' \| 'working' \| null` → broadcast |
| `gift` | `{ itemName, recipientUsername }` | Broadcast `gift-announce` |
| `element-placed / item-placed / element-deleted / item-deleted / element-moved / item-moved` | `Record<string, unknown>` | Editor relay: invalidate blocking cache for the space, broadcast with `userId` attached |
| `ping` | — | Reply `pong` |
| `announcement` | `{ title, message, priority }` | **Admin only** — broadcast `notification` to the room (`urgentBanner` when priority = urgent) |
| `ping-user` | `{ targetUserId }` | Send `notification` to target + confirmation to sender |
| `notification-read` | `{ notificationId }` | No-op (client-side read tracking) |
| `rtc:offer / rtc:answer / rtc:ice` | `{ to, sdp?/candidate? }` | Relay verbatim to the target user in the same space |
| `rtc:knock` | `{ to, fromName, callType }` | Relay knock to target (includes `callType` — this field was previously stripped; bug fixed) |
| `rtc:knock-accept / rtc:knock-deny` | `{ to }` | Relay to target |
| `rtc:join-room` | `{ roomId }` | Add to `conferenceRooms`, reply `rtc:room-peers` with existing members |
| `rtc:leave-room` | `{ roomId }` | Remove from conference room |
| `rtc:broadcast-zone-join` | `{ zoneId, isSpeaker }` | **Plan-gated** (Pro): soft-deny with a toast notification if `broadcastEnabled` is false; otherwise add to `broadcastZones` as speaker or listener; push `rtc:broadcast-zone-state` to all affected users |
| `rtc:broadcast-zone-leave` | `{ zoneId }` | Remove from zone; notify speaker/listeners |

---

## 3. Movement validation — `processMove`

```ts
const xDisp = Math.abs(this.x - moveX);
const yDisp = Math.abs(this.y - moveY);
// accept only if exactly one tile of movement (1,0) or (0,1)
```

If adjacent:
1. Check the **blocking cache** (`getBlockingCells(spaceId)`) — if the target cell is blocked → `movement-rejected`.
2. Update `this.x/y`, bump `lastActivityAt`, clear the `afk` emote if present.
3. Broadcast `movement` (with `userId`) to the room.
4. `broadcastRoomUpdates(spaceId)` — recompute proximity chat membership for everyone.

Otherwise → `movement-rejected` with the current position.

**Serialisation**: incoming `move` messages are chained:

```ts
this.lastMove = this.lastMove.then(() => this.processMove(x, y)).catch(() => {});
```

This prevents two concurrent moves from racing against the async `getBlockingCells` call and reading stale `x/y`.

> ⚠️ Known gap (documented in AGENTS.md): **no space-boundary check** — a user could move to negative coordinates or beyond `width/height` (the blocking cache only covers cells with blocking tiles, and empty cells beyond the map edge are not in it). The fix is a `newX/y` bounds check.

---

## 4. Proximity chat

Managed by `proximityChatManager.ts` + the `chat-message` / `chat-room-update` / `chat-history` flow in `User.ts`.

- **Range**: `PROXIMITY_PX = 150`, `TILE_PX = 50` → players within **3 tiles** are "nearby".
- **Room key**: `sha256(sortedPlayerIds.join(',')).slice(0,16)` — deterministic per participant set.
- **Sending** (`chat-message`): compute nearby users → compute roomKey → `saveMessage` to Postgres (fire-and-forget) → broadcast `proximity-chat-message` to nearby users. If the DB write fails, it still broadcasts with a random id.
- **History** (`broadcastRoomUpdates`): every user gets a `chat-room-update` with their current room + member list. When a user's `roomKey` changes, the server sends `chat-history` (last 50 persisted messages) — reset to empty on failure.
- **Persistence**: `ProximityRoom` (unique roomKey) + `ProximityChatMessage` rows, trimmed to the newest 50 per room.

---

## 5. NPC simulation (`npcTick`, every 500 ms)

Runs only for **rooms that have users**. For each space:

1. Load `space` (width/height) + all NPCs.
2. Load the blocking-cell cache.
3. For each NPC, keep an in-memory `NpcState` (`{ x, y, patrolIndex, idleCountdown, wanderTarget, wanderCooldown }`):
   - **STATIC** → skip.
   - **Idle countdown** > 0 → decrement, skip.
   - **WANDER** → pick a random target within `wanderRadius` of its DB home position; step one tile toward it (`stepToward` prefers the larger delta axis, random tie-break); 10% chance to pause. Positions are persisted to the DB (fire-and-forget) and broadcast as `npc-moved`.
   - **PATROL** → clamp `patrolIndex % patrol.length`, step toward the current waypoint, advance on arrival; auto-generates a square patrol if `patrolPath` has < 2 points; 15% random idle chance.

`blockingCache.ts` caches blocking cells per space for 10 s (invalidated immediately by editor relay messages), so NPC movement doesn't hammer the DB.

> The HTTP copy of this ticker (`apps/http/src/ws-server.ts`) is functionally similar but adds `tryStep` (blocking-aware stepping with perpendicular fallbacks). Both should eventually be merged.

---

## 5.5 Plan gating (SaaS)

`lib/planAccess.ts` is the shared gating helper (also imported by HTTP):

- `getEffectivePlan(userId)` → ACTIVE-plan limits or FREE defaults; **60 s in-memory cache**; **P2024 retry + explicit logging** (a silent failure here could wrongly block a paying user).
- Wired enforcement points:
  - **`join` room capacity** — after stale-session eviction, if `roomCount >= plan.maxConcurrentUsers` the join is rejected with `failWith("forbidden", "This space is full (N concurrent users on the TIER plan)")` (client stops reconnecting and shows the banner).
  - **`rtc:broadcast-zone-join`** — if `!plan.broadcastEnabled`, the join is **soft-denied** with a `notification` toast (not a socket kill).
- Cache invalidation: `invalidatePlanCache(userId)` should be called after billing changes (webhooks) so gates reflect upgrades immediately.

---

## 6. Conference rooms & broadcast zones (WebRTC)

Both live in **module-level Maps** inside `User.ts` — in-memory and ephemeral.

```ts
conferenceRooms = Map<roomId, Set<userId>>
broadcastZones  = Map<zoneId, { speakerId: string | null, listeners: Set<string> }>
```

- `rtc:join-room` adds the user and returns existing members so the client can connect to each (full mesh). On disconnect, remaining members get `rtc:peer-left`.
- Broadcast zones: exactly **one speaker** per zone. Speaker joins → all listeners notified with `rtc:broadcast-zone-state`; the client then builds receive-only connections. Leaving updates everyone; an empty zone is deleted.
- The server **never inspects SDP/ICE** — it only routes `rtc:*` messages between users in the same room.

See [webrtc.md](./webrtc.md) for the full signaling flow and PeerManager API.

---

## 7. Room managers & horizontal scaling

`getRoomManager()` returns either the in-memory `RoomManager` (default) or `RedisRoomManager` when `USE_REDIS_ROOMS === "true"`.

### `RoomManager` (memory)
```ts
rooms: Map<spaceId, User[]>
addUser / removeUser / broadcast(msg, sender, roomId)  // everyone except sender
broadcastToRoom(msg, roomId)                            // everyone including sender
```

### `RedisRoomManager` (pub/sub)
- Two Redis connections (`pub` + `sub`); a random `instanceId` identifies this process.
- `addUser` subscribes to `room:<spaceId>`; `removeUser` unsubscribes when the last local user leaves.
- `broadcast` sends locally (except sender) **and** publishes to Redis with `_senderUserId` + `_instanceId`. Other instances' subscribers drop messages from their own `_instanceId` and from the sender (matched by `userId`), then relay to their local users.
- This gives horizontal scaling across multiple WS instances with no client changes.

---

## 8. Outgoing message reference (Server → Client)

| Type | Payload |
|------|---------|
| `space-joined` | `{ spawn, userId, username, avatarId, users[] }` |
| `user-joined` / `user-left` | `{ userId, ... }` |
| `movement` | `{ userId, x, y }` |
| `movement-rejected` | `{ x, y }` (server's last known position) |
| `emoted` | `{ userId, emoji, x, y }` |
| `emote-broadcast` | `{ userId, emoteId, expiresAt }` (status overlays; `expiresAt: 0` = persistent) |
| `chat` | `{ userId, username, message, x, y }` (room-wide bubble) |
| `interacted` | `{ userId, itemId, itemName, x, y }` |
| `avatar-changed` | `{ userId, avatarId }` |
| `activity-changed` | `{ userId, activity }` |
| `gift-announce` | `{ fromUsername, itemName, recipientUsername }` |
| `npc-moved` | `{ npcId, x, y, facing }` |
| `notification` | `{ id, notifType, title, message, priority, fromUserId?, fromUserName?, timestamp, urgentBanner? }` |
| `proximity-chat-message` | `{ id, roomId, senderId, senderName, content, timestamp }` |
| `chat-room-update` | `{ roomId, members[] }` |
| `chat-history` | `{ roomId, messages[] }` |
| `board-updated` | `{ spaceId }` (from HTTP board routes) |
| `error` | `{ code, message, canRequestAccess?, spaceId? }` before close (`unauthorized/banned/forbidden/not-found`); `canRequestAccess` is set on join denial for an authenticated non-member so the client can offer to request access |
| `pong` | — |
| `rtc:offer/answer/ice` | `{ from, sdp?/candidate? }` |
| `rtc:knock` | `{ from, fromName, callType }` |
| `rtc:knock-accept/deny` | `{ from }` |
| `rtc:room-peers` | `{ roomId, peers[] }` |
| `rtc:peer-left` | `{ peerId }` |
| `rtc:broadcast-zone-state` | `{ zoneId, speakerId, listenerIds[] }` |

---

## 9. Background loops in `index.ts`

| Loop | Period | What it does |
|------|--------|--------------|
| AFK detection | 30 s | Any user idle > 180 s (no moves/chat) and not already AFK → set `currentEmote = 'afk'`, broadcast `emote-broadcast` with `expiresAt: 0` |
| NPC tick | 500 ms | §5 |
| Keepalive | 30 s | `socket.ping()` on every open socket (defeats Cloudflare's ~100 s idle drop) |