# Frontend Service — `apps/frontend`

The frontend is a React 19 + Vite SPA. It contains the 2D canvas game (`Game.tsx`, ~5,400 lines), the lobby (`SpacePage.tsx`), auth (`AuthPage.tsx`), public profiles, invite joining, and a marketing site — all in one bundle.

```
meta/apps/frontend/src/
├── main.tsx                    React root + BrowserRouter
├── App.tsx                     Route table + OAuth callback page
├── Game.tsx                    The arena: canvas render loop, WS client, WebRTC, editor
├── SpacePage.tsx               The lobby (Discover / My Spaces / Shop / Collection / Quests / Neighbourhood / Guestbook / Creator)
├── AuthPage.tsx                Sign-in / sign-up / OAuth / guest
├── JoinPage.tsx                Invite-link landing
├── ProfilePage.tsx             Public player profile
├── KanbanPanel.tsx             Per-space kanban board UI (space owner tool)
├── SpaceSettingsModal.tsx      Rename / privacy / members / invite / delete
├── stores/authStore.ts         Zustand: token + guest + cross-tab sync
├── store/gameStore.ts          Zustand: proximity chat + notifications + emotes
├── lib/auth-client.ts          better-auth React client (signIn, signOut, useSession)
├── constants/emotes.ts         Status + quick emote catalog
├── types/game.ts               Shared TS types (SpaceElement, PlacedItem, NPC, portal…)
├── webrtc/
│   ├── PeerManager.ts          All WebRTC state (connections, ICE, tracks, speaking)
│   ├── constants.ts            VOICE_RADIUS=5, VIDEO_RADIUS=3, BROADCAST_RADIUS=15
│   └── WEBRTC.md               Dev-notes copy — lags docs/webrtc.md (see docs index)
├── components/
│   ├── ProtectedRoute.tsx      Auth guard (validates token before render)
│   ├── ErrorBoundary.tsx
│   └── game/                   GameDock, ProximityChatPanel, NotificationPanel,
│                               VoiceToolbar, EmotePicker, ConferenceMeetingGrid
└── marketing/                  HomePage (animated pixel-canvas hero with wandering
                                office "agents" + hover dialogue), AboutPage,
                                PricingPage, ContactPage + MarketingNav/Footer

Repo-level files: `vite.config.ts` (Vite build config), `vite-env.d.ts` (Vite ambient types),
`eslint.config.js` (flat ESLint config), `index.html` (SPA entry).
```

---

## 1. Routing (`App.tsx`)

| Path | Component | Access |
|------|-----------|--------|
| `/` | HomePage | public |
| `/about`, `/pricing`, `/contact` | Marketing pages | public |
| `/login` | AuthPage | public |
| `/join/:token` | JoinPage (invite) | public |
| `/auth/callback` | OAuthCallbackPage | public (cookie → token exchange) |
| `/lobby` | SpacePage | `ProtectedRoute` |
| `/arena` | Game (`Arena`) | `ProtectedRoute` (spaceId via `?spaceId=`) |
| `/profile/:userId` | ProfilePage | `ProtectedRoute` |
| `*` | redirect `/` | — |

**`ProtectedRoute`** validates the stored token against `GET /api/v1/user/me` **before** rendering children — a stale/revoked token triggers `clearAuth()` + redirect instead of a burst of 403s. Guests (`isGuest`) bypass validation but cannot reach private areas.

**`OAuthCallbackPage`** calls `GET /api/v1/user/token` with `credentials: "include"` to exchange the cookie session for a bearer token, then stores it and routes to `/lobby`.

---

## 2. State management (Zustand)

### `authStore` — token + session
- `token` from `localStorage["metaverse_token"]`, `isGuest` from `localStorage["metaverse_guest"]`.
- `setAuth(token)` / `setGuest()` / `clearAuth()` keep both in sync.
- **Cross-tab sync**: a `storage` event listener updates the store when another tab signs in/out, preventing stale-token calls.

### `gameStore` — live UI state
- **Proximity chat**: messages, `roomId`, members, unread count, panel visibility, typing state.
- **Notifications**: list (capped at 50), unread count, urgent banner, toasts (capped at 3), panel visibility.
- **Emotes**: `activeEmotes` map (userId → emoteId + expiry), my current emote, picker visibility.

---

## 3. The game (`Game.tsx`)

### Constants & asset maps
```ts
WS_URL   = VITE_WS_URL   || 'ws://localhost:3000'   // note: HTTP port — see architecture doc
API      = VITE_API_URL  || 'http://localhost:3000'
TILE_SIZE = 50            // canvas pixels per tile
```
- `TILE_IMAGE` / `ITEM_IMAGE`: element/item id → `/tiles/<name>.png` / `/items/<name>.png` (served by Vite, or `VITE_ASSETS_URL`). Sprites fall back to `element.imageUrl` (HTTP server's `/uploads/defaults/`).
- Sprites/avatars/emotes are preloaded into an `imageCache` ref Map (`preloadImages`, `preloadAvatarImage`, `preloadEmoteImage`); `rerender()` bumps `renderTick` to repaint when images arrive.

### Canvas & camera
- Backing store is synced to the container via a `ResizeObserver`; `canvasToGrid()` converts CSS pixels → backing-store pixels → tile coords (respecting `zoomRef` + camera pan).
- Camera math: `worldW = width*50*zoom`; when the world is smaller than the viewport it's centered (`offsetX/Y`), otherwise clamped to follow the player (`camX = clamp(playerCX - vpW/2, 0, worldW - vpW)`). No `Math.round` on the camera — it caused ±0.5px jitter.
- **Zoom/pan**: `Ctrl+wheel` zooms 0.5×–3×, `Space`+drag pans (`panOffsetRef`), `Ctrl+0` resets.
- Paint order: background `#f0fdf4` → grid lines → **elements** → **FLOOR-layer items** → edge-portal arrows → interaction texts → **players** → **WALL-layer items** (in front of avatars) → **NPCs** → chat bubbles → editor overlays. `drawImageOnCanvas` falls back to a colored rect + dashed border when the sprite isn't loaded; `failedToSave` tiles get a red tint.

### Animation system (single `requestAnimationFrame` loop)
- **Player tween** (`moveAnimRef`): 150 ms, ease-out quad `t*(2-t)`; `walkBobRef` is a 3px sine bob, `walkFrameRef` alternates at 75 ms. On completion it commits `currentUser`, then fires `processWalkQueue()`, `runProximityCheck()`, `checkConferenceRoom()`, `checkBroadcastZone()`.
- **Remote users** (`remoteUserAnims` ref): **exponential smoothing** — `alpha = 1 - exp(-15*dt)`, so sprites glide toward the server-reported tile independent of move cadence. `facingCol` is derived from the dominant move axis; walking is detected from a 300 ms "last move" window.
- **NPC tween** (`npcAnims`): 450 ms per `npc-moved`, driven off `npcsRef` (never React state, so NPC moves don't trigger re-renders).
- Extra per-frame triggers: portal pulse, pending-knock 📞 pulse, speaking-ring pulse.

### Movement & interaction input
- Arrow keys call `handleMove` (1 tile, cancels the click-walk queue, clears `sitting`, does **edge-portal detection**: stepping to the map edge with a matching `fromEdge` portal opens the travel prompt after 300 ms). Blocked/out-of-bounds moves play a 200 ms `bumpAnimRef`.
- Click-to-walk: `findPath()` is **BFS** over the 4-neighborhood avoiding `blocking` elements/items → `moveQueueRef` fed into `processWalkQueue`.
- `doMove` does **client-side collision prediction** (using refs, so it stays current) before animating — the server's `movement-rejected` then only hard-snaps for corrections > 1 tile (anti-cheat/teleport), avoiding snap-back jitter.
- `F` near an office chair toggles `sitting` (`activity-changed` WS); near a coffee machine → +10 energy popup + `status-emote: coffee`; near a vending machine → snack popup. `F`-traveling is handled via the portal prompt + `Enter`.
- Explore-mode canvas click order: NPC → dialogue popup; placed item → **interaction popup** (sign shows `metadata.text`, chest calls `POST /economy/interact`, campfire triggers a 3 s warm overlay, fountain flavor text; everything else broadcasts `interact`); another player on the same tile → **bottom-sheet popup** (View Profile / Send Gift / Ping / Close); empty tile → click-to-walk.

### WS client
- `connect()` opens the socket, sends `join {spaceId, token}` on open, then **pings every 25 s** (matches the server keepalive). Reconnect uses exponential backoff `min(500*2^(n-1), 4000)` with a banner; `intentionalCloseRef` suppresses reconnect on unmount/sign-out.
- `handleMessage` is stored in `handleMessageRef.current` (a ref, not a closure) to avoid stale-state bugs; `ws.onmessage` calls the ref.
- `space-joined` seeds the roster + `remoteUserAnims`, then **constructs the `PeerManager`** with an 8-second `init()` timeout; buffered `rtc:*` messages are flushed in `.finally()`. `error` with code `unauthorized`/`banned` closes the socket and routes to sign-in.

### Editor (owner only)
`startPaint` / `paintMove` / `stopPaint` drive the whole editor; `handleCanvasMouseUp` finalizes NPC position-picking, NPC drags (`PUT /npc/:id`), and otherwise calls `stopPaint()`.

- **Optimistic editing**: paints insert `_opt_`-prefixed tiles immediately, buffered in `batchBuffer`/`deleteBuffer` and flushed to the **batch endpoints** after **500 ms** (or on mouse-up/unmount). `flushBatch` reconciles the optimistic ids against the server response and marks survivors as `failedToSave` (red tint) on error. Auth failures abort buffers and route to `/login`.
- **Eraser** (`E` in the old READMEs was stale — the eraser is **sidebar-button only**; `E` toggles the emote picker in explore mode) → click/drag queues into `deleteBuffer`, flushed via `element/batch-delete` + `placed/batch-delete`.
- **Move tool**: drag a selected tile → green dashed `movePreview`; on mouse-up calls `element/:id/move` or `placed/:id/move`. **Multi-select** via rubber-band → group delete bar.
- **Undo/redo**: `saveUndoSnapshot()` pushes a deep snapshot (max 50); `reconcileState()` diffs current vs. target and fires the **inverse API calls** (delete-missing, create-new, move-changed), then refetches space+inventory.
- **NPC editor**: modal (name, sprite grid, motion type cards, wander-radius slider for WANDER, x/y or 📍 pick-on-canvas with blocked-tile validation, 3 dialogue lines); rows in the NPCs tab select (amber ring) and drag-to-reposition.
- **Portal tool**: list existing portals (delete), and a create form (from-edge, to-edge, destination space, label) → `POST /:spaceId/portal`.
- **Conference room & broadcast zone marking**: with an item selected, the sidebar has **+ Conf Room** / **+ Broadcast Zone** buttons that write `metadata.conferenceRoomId` / `metadata.broadcastZoneId` (uuid) via `PUT /placed/:id/metadata`. Walking onto an item bearing that metadata triggers `rtc:join-room` (or the zone join) — see below.
- **Space management**: New Map modal (name/dims/template), Resize modal (5–100 in the UI), Expand modal (+10 tiles in a direction, shifting content via `offsetX/Y`), Clear All (wipes tiles, returns items to inventory), Space Settings modal (name/privacy/invite/members).

### Conference rooms, broadcast zones & video UI
- After every local move the rAF tick calls `checkConferenceRoom` / `checkBroadcastZone`: they find a placed item under the player whose `metadata` carries a room/zone id, and on change send `rtc:join-room` / `rtc:broadcast-zone-join` (space **owner is the speaker** for broadcast zones). Leaving the tile sends `rtc:leave-room` / `leaveBroadcastZone`.
- `rtc:room-peers` → `pm.joinConferencePeer()` per peer → full mesh; the canvas shrinks to a **240×150 PiP** with a `2D WORLD` label and a full-screen `ConferenceMeetingGrid` (16:9 tiles, initials avatar fallback, speaking dot, connecting overlay, name+mute row, docked toolbar) takes over.
- Outside conference rooms, video appears as **140×80 tiles** centered at the top of the canvas: a mirrored self-view (when camera on + ≥1 peer) plus one `RemoteVideoTile` per peer (connection-state overlay).
- Hidden `<video>` elements (`avatarVideoElsRef`, `localAvatarVideoElRef`) are still created to hold streams, but **canvas camera bubbles were removed** (see `webrtc-postmortem` git history) — these refs are now vestigial scaffolding.

### Interactable items
Click a placed item in explore mode → floating text + WS `interact`. Chests award coins via `POST /economy/interact`. Portals: stand on edge + `F`/Enter → travel prompt. Signs read `metadata.text`.

### Notifications & emotes
- `notification` messages → store → toast/panel/banner; `ping-user`, announcements, join/leave all route here.
- `emote-broadcast` drives persistent status overlays (AFK/BRB/coffee/…); `emoted` drives 2-second floating emoji bursts. `EMOTE_FRAMES`/`EMOTE_CROP` map each emote to a sprite frame and 32×48 crop. AFK renders the avatar at 60% alpha; a pulsing 📞 shows above avatars with a pending knock; a 👂 shows when a nearby user is typing in proximity chat.

### In-arena side panels & HUD
- **Guestbook** / **Quests** sidebars (header icons), **Kanban** (`KanbanPanel`, refreshed via `board-updated` WS), **Avatar picker** (POST `user/metadata` + `avatar-changed` WS), **Send Gift** modal (POST `gift/send` + `gift` WS announce), **GameDock** (emote + chat + hints), **VoiceToolbar** (mic/deafen/camera/leave), mic-permission retry banner, camera-error banner, save-status indicator, zoom indicator, and a toast stack.

### Kanban panel (`KanbanPanel.tsx`)
Full board editor (owner): create board, add/rename/delete columns, add/edit/move/delete cards (owner or assignee), assignees (from live space users), priority (LOW→URGENT), due dates (overdue highlight), comments; card drag-and-drop does an **optimistic reorder** then `PUT card/:id/move`. Refreshes on `board-updated` WS messages.

---

## 4. WebRTC client (`webrtc/PeerManager.ts`)

`PeerManager` is a **plain class** — no React state for live media. Game.tsx mounts one instance in a `useRef`, routes `rtc:*` WS messages to it, and listens for `window.dispatchEvent` custom events to update React UI:

| Event | Fired when |
|-------|-----------|
| `rtc:remoteVideo` | A video track arrives → store stream in `remoteStreamsRef` |
| `rtc:peerLeft` | Peer disconnected / dropped |
| `rtc:peersChanged` | Connected peer count changes |
| `rtc:connectionStateChanged` | `connectionState` flips (drives tile overlays + auto-retry) |
| `rtc:speakingState` | AnalyserNode detects speech on/off → pulsing ring on avatar |
| `rtc:proximityGroup` | Nearby/members lists change → call buttons |
| `rtc:knockSent/Denied/Cancelled` | Knock flow UI updates |

### Key mechanics
- **Perfect negotiation**: polite/impolite determined by `myUserId < peerId`; collisions resolved with `setLocalDescription({type:'rollback'})` (polite) or ignore (impolite).
- **Audio**: one `HTMLAudioElement` per peer (appended to hidden `#rtc-audio-container`) — avoids the `AudioContext` autoplay-suspension bug. A separate `AudioContext` + `AnalyserNode` is used **only** for speaking detection (100 ms interval, `avg > 15` threshold).
- **Volume attenuation**: `setVolume(peerId, distance)` → `max(0, 1 - distance/VOICE_RADIUS)` each animation frame.
- **ICE**: `pendingCandidates` queues candidates until `remoteDescription` is set. Fresh TURN creds fetched from `/api/v1/turn-credentials` on `init()`; hardcoded Metered/Google fallback otherwise.
- **Proximity**: `setProximity(voicePeers, videoPeers)` each frame — cancels stale knocks, disconnects peers in no active set (proximity/conference/broadcast are the exemption sets), emits `rtc:proximityGroup`.
- **Knock flow**: `sendKnock` → `rtc:knock` → receiver toast (Accept/Deny; auto-deny after 15 s) → `rtc:knock-accept` → `connect()`. `acceptIncomingKnock` **never** calls `sendKnock` (that caused the knock-loop bug).
- **Conference rooms**: `joinConferencePeer` → `connect(peerId, 'video', true)` full mesh; exempt from proximity disconnect.
- **Broadcast zones**: speaker connects to each listener; listeners create receive-only connections (`receiveOnly=true`, no `addTrack`).
- **Camera**: `enableCamera` uses `replaceTrack` when a video sender exists; `toggleCamera` toggles `track.enabled` (**never** `track.stop()` mid-call — that permanently kills the track).

### `rtcBufferRef` (init race fix)
`PeerManager.init()` takes up to ~8 s (mic permission + TURN fetch). Any `rtc:*` message arriving while `peerManagerRef.current` is null is buffered and **flushed in order** after init. The buffer is cleared (not flushed) on disconnect/unmount/leave-call so stale messages never replay.

### UI components
- `VoiceToolbar` — mic / camera / deafen / leave + connected peer count.
- `ProximityChatPanel` — nearby chat + knock/call buttons (voice call, video call, group call).
- `RemoteVideoTile` — 140×80 tile with connection overlay ("Connecting… / ✓ Connected / ✗ Failed").
- `ConferenceMeetingGrid` — grid of meeting participants with controls.
- `GameDock`, `EmotePicker`, `NotificationPanel` — HUD accessories.

---

## 5. Lobby (`SpacePage.tsx`)

Tabs: **Discover** (public spaces), **My Spaces** (+ joined spaces), **Create** (blank or map template), **Shop** (3 daily items, price by rarity), **Collection** (catalog + owned flags), **Quests**, **Neighbourhood**, **Guestbook**, **Creator** — note: the Creator tab is currently a **"Coming Soon" placeholder** (custom sprites/item tools/publishing cards); the `POST /api/v1/upload` endpoint exists but isn't wired to this UI yet (it's used by admin item creation).

- Space cards render a deterministic **pixel-art world preview** (floor tile texture + absolutely-positioned sprites derived from the space name).
- Header: search (decorative), season badge, **Daily Gift** claim button, bell, **New Space**.
- All protected fetches watch for 401/403 and route to `clearAuth()` + `/login` via a single `handleAuthFailure` guard.
- Guest mode shows a banner; non-guests get shop/collection/quests/neighbourhood/guestbook/creator.

---

## 6. Auth page (`AuthPage.tsx`)

- Sign-in / sign-up tabs with live validation (email regex, 8+ char password, username 3–20 alnum+underscore, password strength meter).
- Sign-up then immediately signs in; token read from the `set-auth-token` header.
- OAuth buttons call better-auth's `POST /api/auth/sign-in/social` and redirect to the provider; the `/auth/callback` page finishes the exchange.
- **Browse as Guest** → `setGuest()` → lobby (read-only).

---

## 6b. Other pages

- **`JoinPage.tsx`** (`/join/:token`) — loads the invite via `GET /api/v1/invite/:token` (space name, dimensions, member count). Guests / unauthenticated users are sent to login with `?redirect=/join/<token>`; signed-in users join via `POST /api/v1/invite/:token/join` then enter `/arena?spaceId=`.
- **`ProfilePage.tsx`** (`/profile/:userId`) — loads the public profile via `GET /api/v1/player/:userId` plus the avatar catalog. On **your own** profile it also lets you change avatar (`POST /user/metadata`), display name (`POST /user/metadata`), username (`POST /user/username` with live availability check), and upload a profile photo (`POST /user/avatar`).
- **`ProtectedRoute.tsx`** — see §1; **`ErrorBoundary.tsx`** wraps the lobby, arena, and app root.

---

## 7. Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `VITE_API_URL` | `http://localhost:3000` | REST + auth base URL |
| `VITE_WS_URL` | `ws://localhost:3000` | WebSocket URL (defaults to the HTTP port because that process also serves WS) |
| `VITE_ASSETS_URL` | `''` | CDN prefix for `/tiles`, `/items`, `/avatars` sprites |