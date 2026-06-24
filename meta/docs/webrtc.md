# WebRTC Implementation

OfficeVerse 2D uses WebRTC for real-time peer-to-peer audio and video. The Oracle VM WebSocket server handles signaling only — no media ever touches the server. All audio/video flows directly between browsers after negotiation.

---

## Overview

Three interaction modes exist:

| Mode | Trigger | Media |
|------|---------|-------|
| **Proximity voice** | Walk within 5 tiles of another user, then click the call button | Audio only |
| **Proximity video** | Click the video call button in the chat panel header | Audio + video |
| **Conference room** | Walk onto a conference room tile | Audio + video (mesh) |
| **Broadcast zone** | Walk onto a broadcast zone tile | One speaker → many listeners |

Proximity automatically disconnects peers when they walk out of range. Conference rooms and broadcast zones persist until the user leaves the tile or clicks Leave Call.

---

## Architecture

### Signal Flow

```
Client A (initiator)         Oracle VM WS Server         Client B (responder)
        |                            |                            |
        |── rtc:knock ─────────────> |── rtc:knock ────────────> |
        |                            |                            | (toast shown)
        |<── rtc:knock-accept ────── |<── rtc:knock-accept ───── |
        |                            |                            |
        |── rtc:offer ─────────────> |── rtc:offer ────────────> |
        |<── rtc:answer ──────────── |<── rtc:answer ──────────── |
        |── rtc:ice ───────────────> |── rtc:ice ──────────────> |
        |<── rtc:ice ─────────────── |<── rtc:ice ─────────────── |
        |                            |                            |
        |<══════════════ P2P audio/video (DTLS-SRTP) ══════════>|
```

The server finds the target user by `userId` within the same space and forwards the message. It does not inspect or buffer SDP or ICE payloads.

### Client Components

| Component | File | Responsibility |
|-----------|------|---------------|
| `PeerManager` | `apps/frontend/src/webrtc/PeerManager.ts` | All WebRTC state — connections, ICE, tracks, speaking detection |
| `Game.tsx` (ArenaInner) | `apps/frontend/src/Game.tsx` | Mounts PeerManager, wires WS messages → PM, renders video tiles, proximity check loop |
| `VoiceToolbar` | `apps/frontend/src/components/game/VoiceToolbar.tsx` | In-call HUD — mic, camera, deafen, leave call |
| `ProximityChatPanel` | `apps/frontend/src/components/game/ProximityChatPanel.tsx` | Nearby chat + knock/call buttons |
| `RemoteVideoTile` | Inline in `Game.tsx` (~line 182) | Renders one remote video stream with connection state overlay |

### Server Components

| Component | File | Responsibility |
|-----------|------|---------------|
| `User` (WS handler) | `apps/ws/src/User.ts` | Receives and relays all `rtc:*` messages; manages conference room and broadcast zone membership |
| `conferenceRooms` | `apps/ws/src/User.ts` (module-level Map) | In-memory `roomId → Set<userId>` — ephemeral, lost on restart |
| `broadcastZones` | `apps/ws/src/User.ts` (module-level Map) | In-memory `zoneId → { speakerId, listeners }` — ephemeral |

---

## WebSocket Message Types

All `rtc:*` messages are relayed verbatim by the server. Direction is from the sender's perspective.

### Client → Server (incoming to server)

| Type | Key fields | Description |
|------|-----------|-------------|
| `rtc:offer` | `to: string`, `sdp: RTCSessionDescriptionInit` | SDP offer — relayed to `to` with `from` set to sender's userId |
| `rtc:answer` | `to: string`, `sdp: RTCSessionDescriptionInit` | SDP answer — relayed to `to` |
| `rtc:ice` | `to: string`, `candidate: RTCIceCandidateInit` | ICE candidate — relayed to `to` |
| `rtc:knock` | `to: string`, `fromName: string`, `callType?: 'voice'\|'video'` | Call request — relayed to `to` with caller's userId as `from` |
| `rtc:knock-accept` | `to: string` | Accept a received knock — relayed to `to` |
| `rtc:knock-deny` | `to: string` | Deny a received knock — relayed to `to` |
| `rtc:join-room` | `roomId: string` | Join a conference room — server returns `rtc:room-peers` with existing member IDs |
| `rtc:leave-room` | `roomId: string` | Leave a conference room |
| `rtc:broadcast-zone-join` | `zoneId: string`, `isSpeaker: boolean` | Join a broadcast zone as speaker or listener |
| `rtc:broadcast-zone-leave` | `zoneId: string` | Leave a broadcast zone |

### Server → Client (outgoing to client)

| Type | Key fields | Description |
|------|-----------|-------------|
| `rtc:offer` | `from: string`, `sdp: RTCSessionDescriptionInit` | Forwarded SDP offer from `from` |
| `rtc:answer` | `from: string`, `sdp: RTCSessionDescriptionInit` | Forwarded SDP answer from `from` |
| `rtc:ice` | `from: string`, `candidate: RTCIceCandidateInit` | Forwarded ICE candidate from `from` |
| `rtc:knock` | `from: string`, `fromName: string`, `callType?: 'voice'\|'video'` | Incoming call request — triggers toast UI |
| `rtc:knock-accept` | `from: string` | The peer we knocked accepted |
| `rtc:knock-deny` | `from: string` | The peer we knocked denied |
| `rtc:room-peers` | `roomId: string`, `peers: string[]` | Conference room existing members — client connects to each |
| `rtc:peer-left` | `peerId: string` | A conference room member disconnected (sent to remaining members) |
| `rtc:broadcast-zone-state` | `zoneId: string`, `speakerId: string\|null`, `listenerIds: string[]` | Current zone membership — sent to all zone members on any change |

---

## Feature Reference

### 1. Proximity Voice

**Trigger:** Another user walks within `VOICE_RADIUS = 5` tiles. A call button appears in `ProximityChatPanel`. The user must explicitly click it — proximity alone does not auto-connect.

**Under the hood:**
1. Each player move triggers `runProximityCheck()` in `Game.tsx`.
2. All users within 5 tiles are collected as `voicePeers`.
3. `pm.setProximity(voicePeers, videoPeers)` is called every animation frame.
4. `setProximity` emits `rtc:proximityGroup` with `nearbyPeers` (in range, not yet connected) and `members` (already connected). The UI displays call buttons for `nearbyPeers`.
5. User clicks the mic button → `pm.sendKnock(peerId, 'voice')` → knock flow begins (see below).
6. After connection: `setVolume(peerId, distance)` is called each frame to attenuate `audioEl.volume` linearly: `max(0, 1 - distance / VOICE_RADIUS)`.
7. When either user walks out of range, `setProximity` drops that peer from `proximityPeers`. If the peer is not in a conference room or broadcast zone, `disconnect(peerId)` is called.

**Edge cases:**
- If a user walks out of range while a knock is pending, the pending knock is cancelled and `rtc:knockCancelled` is dispatched.
- Peers in a conference room or broadcast zone are exempt from proximity-based disconnection.

---

### 2. Proximity Video

**Trigger:** User clicks the video call button (📹) in `ProximityChatPanel` header when exactly one other user is nearby.

**Under the hood:**
1. `pm.sendKnock(peerId, 'video')` — same knock flow as voice, but `callType: 'video'`.
2. When the knock is accepted, `acceptIncomingKnock(fromId, 'video')` is called on the receiver.
3. If no camera is active, `getUserMedia({ video: true })` is called. Camera failure is non-fatal: the connection still opens as `'video'` mode so the accepting user can at least receive the caller's video.
4. The local video track is added via `enableCamera(stream)` which calls `addTrack` on all existing `RTCPeerConnection`s and on new ones via `connect()`.
5. `ontrack` for video kind dispatches `rtc:remoteVideo { peerId, stream }` → `Game.tsx` adds stream to `remoteStreamsRef` → `RemoteVideoTile` renders.

**Edge cases:**
- Camera already active: `connect()` picks up `localVideoStream` tracks automatically.
- Camera `NotReadableError` (e.g. camera in use by another app): connection still opens as video-mode; local video tracks just aren't sent.
- Disabling camera mid-call: `disableCamera()` removes video senders from all `RTCPeerConnection`s via `removeTrack`.

---

### 3. Conference Rooms

**Trigger:** Walking onto a conference room tile in the map. `Game.tsx` sends `rtc:join-room` to the server.

**Under the hood:**
1. Server adds userId to the in-memory `conferenceRooms` map and returns `rtc:room-peers` with all existing member IDs.
2. `Game.tsx` calls `pm.joinConferencePeer(peerId)` for each ID in the list.
3. `joinConferencePeer` calls `connect(peerId, 'video', true)` — always video mode.
4. Conference peers are stored in `conferencePeers` set and are exempt from proximity disconnection.
5. Walking off the tile or clicking Leave Call → `pm.leaveConference()` + `rtc:leave-room` to server.
6. If a conference member disconnects from WebSocket, the server sends `rtc:peer-left` to all remaining members → `pm.disconnect(peerId)` → video tile cleared.

**Mesh topology:** Every member connects to every other member directly (full mesh). Recommended max: 6 peers (15 connections total). Beyond that, CPU and bandwidth degrade significantly.

---

### 4. Broadcast Zones

**Trigger:** Walking onto a broadcast zone tile. `Game.tsx` determines if the user is the speaker (only one speaker per zone) and calls `pm.enterBroadcastZone(zoneId, isSpeaker)`.

**Under the hood:**

*Speaker path:*
1. Server sets `zone.speakerId = userId` and sends `rtc:broadcast-zone-state` to speaker and all existing listeners.
2. `handleBroadcastZoneState` on the speaker calls `connect(listenerId, 'video', true, false)` for each listener — normal bidirectional connection, speaker sends media.

*Listener path:*
1. Server adds listener to `zone.listeners` and sends `rtc:broadcast-zone-state` to listener and speaker.
2. `handleBroadcastZoneState` on the listener calls `connect(speakerId, 'video', false, true)` — `receiveOnly=true` skips `addTrack`, so listener sends no media.
3. `handleOffer` detects `broadcastMode === 'listener' && fromId === broadcastSpeakerId` and also skips `addTrack` for offers arriving before the proactive connection is set up.

*Cleanup:*
- Speaker leaves → server sends `rtc:broadcast-zone-state { speakerId: null }` to all listeners → listener disconnects.
- Listener leaves → server notifies speaker with updated `listenerIds` → speaker disconnects that listener.

---

### 5. Knock-to-Join (Explicit Call Request)

The knock flow is the gating mechanism for all proximity and video calls.

```
Sender                          Server                         Receiver
  |                               |                               |
  | sendKnock(peerId, callType)   |                               |
  |── rtc:knock { to, fromName, callType } ──────────────────────>|
  |   pendingKnocks.set(peerId)   |                               | (toast: Accept / Deny)
  |                               |                               |
  |                               |         [Accept clicked]      |
  |                               |   acceptIncomingKnock()       |
  |                               |   connect(fromId, mode, false)|
  |<── rtc:knock-accept ──────────────────────────────────────────|
  |                               |                               |
  | handleKnockAccepted()         |                               |
  | connect(fromId, mode, true)   |                               |
  |── rtc:offer ─────────────────────────────────────────────────>|
  |<── rtc:answer ────────────────────────────────────────────────|
  |<══════ P2P media ════════════════════════════════════════════>|
```

**Deny path:** Receiver clicks Deny → `denyIncomingKnock(fromId)` → `rtc:knock-deny` → sender's `handleKnockDenied` dispatches `rtc:knockDenied` (Game.tsx shows a toast).

**Auto-deny:** If the receiver doesn't respond in 15 seconds, Game.tsx auto-calls `denyIncomingKnock`.

**Critical invariant:** `acceptIncomingKnock` must never call `sendKnock()` or write to `pendingKnocks`. Doing so triggers a knock→accept→knock→accept infinite loop. The receiver connects silently and only sends `rtc:knock-accept` back.

**Race condition:** Both sides may create an `RTCPeerConnection` slot before the other's offer arrives. `handleOffer` guards with `if (!this.peers.has(fromId)) await connect(...)` — the slot is claimed synchronously via `peers.set()` at the top of `connect()`, so no duplicates occur.

---

### 6. Group Calls (3+ Users in Proximity)

Group calls are full mesh — each user connects to every other user individually. The `ProximityChatPanel` shows a group call button (📞) when 2+ users are nearby. Clicking it calls `sendKnock` to each callable peer in sequence.

Each pair negotiates independently. There is no MCU or SFU — all media flows peer-to-peer.

---

## PeerManager API

### Lifecycle

| Method | Description |
|--------|-------------|
| `init()` | Request mic via `getUserMedia({ audio: true })`. Fetch fresh TURN credentials from `/api/v1/turn-credentials`. Both failures are non-fatal. |
| `destroy()` | Disconnect all peers, stop all local tracks, close `AudioContext`. Called on WS disconnect and Leave Call. |

### Connection

| Method | Description |
|--------|-------------|
| `connect(peerId, mode, _isInitiator?, receiveOnly?)` | Open an `RTCPeerConnection`, register it in `peers`, add local tracks (unless `receiveOnly`). `_isInitiator` is unused — polite/impolite role is determined by `myUserId < peerId`. |
| `disconnect(peerId)` | Null + pause + remove the `HTMLAudioElement`, close the PC, delete from `peers`. Dispatches `rtc:peerLeft` and `rtc:peersChanged`. |

### Signaling

| Method | Description |
|--------|-------------|
| `handleOffer(fromId, sdp)` | Perfect negotiation offer handler. Creates peer slot if missing. Handles rollback for polite peer on collision. |
| `handleAnswer(fromId, sdp)` | Set remote description and flush queued ICE candidates. |
| `handleIce(fromId, candidate)` | Add ICE candidate. Queues it in `pendingCandidates` if `remoteDescription` is not yet set. |

### Proximity

| Method | Description |
|--------|-------------|
| `setProximity(voicePeers, _videoPeers)` | Update `proximityPeers`. Cancel pending knocks for out-of-range peers. Disconnect peers no longer in proximity, conference, or broadcast. Emit `rtc:proximityGroup`. |
| `setVolume(peerId, distance)` | Set `audioEl.volume = max(0, 1 - distance / VOICE_RADIUS)`. Called each animation frame. |

### Knock

| Method | Description |
|--------|-------------|
| `sendKnock(peerId, callType)` | Send `rtc:knock`, record in `pendingKnocks`, dispatch `rtc:knockSent`. |
| `cancelKnock(peerId)` | Remove from `pendingKnocks`, dispatch `rtc:knockCancelled`. |
| `handleKnock(_fromId)` | No-op — returns `false`. All incoming knock UI is handled in `Game.tsx`. |
| `acceptIncomingKnock(fromId, callType)` | Open camera if needed, call `connect(fromId, mode, false)`, send `rtc:knock-accept`. |
| `denyIncomingKnock(fromId)` | Send `rtc:knock-deny`. |
| `handleKnockAccepted(fromId)` | Read mode from `pendingKnocks`, call `connect(fromId, mode, true)` as initiator. If slot already exists (race), add video tracks directly. |
| `handleKnockDenied(fromId)` | Remove from `pendingKnocks`, dispatch `rtc:knockDenied`. |

### Media controls

| Method | Description |
|--------|-------------|
| `toggleMic(enabled)` | Enable/disable all audio tracks on `localStream`. |
| `setDeafen(deafened)` | Mute all `audioEl` instances + auto-mute mic. |
| `enableCamera(videoStream)` | Store `localVideoStream`, call `addTrack` on all active PCs. `onnegotiationneeded` fires and sends upgrade offer to each peer. |
| `disableCamera()` | Stop video tracks, call `removeTrack` on all video senders across all PCs. |

### Conference / Broadcast

| Method | Description |
|--------|-------------|
| `joinConferencePeer(peerId)` | Add to `conferencePeers`, call `connect(peerId, 'video', true)`. |
| `leaveConference()` | Disconnect all conference peers not in proximity/broadcast, clear `conferencePeers`. |
| `enterBroadcastZone(zoneId, isSpeaker)` | Set mode, send `rtc:broadcast-zone-join`. |
| `handleBroadcastZoneState(zoneId, speakerId, listenerIds)` | Speaker: connect to new listeners. Listener: connect to speaker (receive-only). |
| `leaveBroadcastZone()` | Send `rtc:broadcast-zone-leave`, disconnect all broadcast peers not in other sets. |

### State accessors

| Method | Returns |
|--------|---------|
| `hasMic()` | `true` if `localStream` is non-null (mic permission granted) |
| `getMicEnabled()` | Current mic mute state |
| `getCameraEnabled()` | Current camera state |
| `getLocalStream()` | The mic `MediaStream` (never the video stream) |
| `getConnectedPeerCount()` | `peers.size` — number of active `RTCPeerConnection`s |
| `getPeerConnectionState(peerId)` | `RTCPeerConnectionState` for one peer |
| `isPendingKnock(peerId)` | `true` if waiting for this peer's knock response |
| `getProximityConnectedCount()` | Number of proximity peers with active connections |
| `getDeafened()` | Current deafen state |

---

## ICE Configuration

### Current Servers

```typescript
{ urls: 'stun:stun.l.google.com:19302' }           // Google STUN (primary)
{ urls: 'stun:stun.relay.metered.ca:80' }           // Metered STUN

{ urls: 'turn:global.relay.metered.ca:80',           // Metered TURN UDP
  username: '5fb5154d7caa476fffa59a3d',
  credential: '1ujpQgNVUvtMuscG' }

{ urls: 'turn:global.relay.metered.ca:80?transport=tcp',  // Metered TURN TCP
  username: '...', credential: '...' }

{ urls: 'turn:global.relay.metered.ca:443',          // Metered TURN TLS
  username: '...', credential: '...' }

{ urls: 'turns:global.relay.metered.ca:443?transport=tcp', // Metered TURNS/TLS
  username: '...', credential: '...' }
```

These are hardcoded as fallback in `PeerManager.iceServers`. On every `init()` call, fresh credentials are fetched from `/api/v1/turn-credentials`. If the fetch succeeds and returns a non-empty `iceServers` array, it replaces the hardcoded values for that PeerManager instance.

### Updating Credentials

1. Log into [dashboard.metered.ca](https://dashboard.metered.ca)
2. Navigate to your TURN server → **API Keys**
3. Copy the new `username` and `credential`
4. Update hardcoded values in `PeerManager.ts` lines 31–50
5. Optionally wire up `/api/v1/turn-credentials` to return dynamic credentials from Metered's REST API so the frontend always gets fresh ones without a redeploy

### Metered Free Tier

The free plan includes **500 MB of TURN relay traffic per month**. TURN is only used when direct P2P fails (symmetric NAT, restrictive firewalls). Most connections succeed via STUN. Monitor usage in the Metered dashboard; upgrade to a paid plan or self-host Coturn on the Oracle VM if the limit is regularly hit.

---

## Audio Implementation Detail

**Why `HTMLAudioElement` instead of `AudioContext`?**

`AudioContext` is suspended by browsers on page load until a user gesture (click, keypress). Using it for playback caused silent audio on join — peers connected but no sound came through. Using `HTMLAudioElement` avoids this entirely: autoplay with a user-gesture-granted stream works in all major browsers.

Each peer gets its own `new Audio()` element, appended to a hidden `#rtc-audio-container` div:

```typescript
const audioEl = new Audio();
audioEl.autoplay = true;
audioEl.volume = 1;
document.getElementById('rtc-audio-container')?.appendChild(audioEl);
```

Appending to the DOM prevents Chrome 120+ and Safari from GCing or suspending detached audio elements during a call.

A separate `AudioContext` (`analyserCtx`) is used **only** for speaking detection — it reads frequency data from the remote stream via `AnalyserNode` every 100ms and dispatches `rtc:speakingState` when the speaking state flips. It is never in the audio playback path.

---

## RTC Message Buffering (Init Race Fix)

`PeerManager.init()` takes up to 8 seconds (mic permission prompt + TURN fetch). During this window, `peerManagerRef.current` is null in `Game.tsx`. Any `rtc:offer/answer/ice/knock-accept/knock-deny` arriving during init would silently be dropped via optional chaining.

Fix: `rtcBufferRef` in `Game.tsx` collects these messages while `peerManagerRef.current` is null. After `.finally()` assigns the new PM instance, the buffer is flushed in order.

The buffer is **cleared** (not flushed) on:
- WS disconnect / component unmount — stale messages from an old session must not replay
- `onLeaveCall` before re-init — messages from the ended call must not replay in the new PM

---

## Known Limitations

### Same-machine testing (camera conflict)

When two browser tabs on the same machine both request camera access, Chrome often returns `NotReadableError` for the second tab. This is an OS-level camera lock, not a WebRTC bug. Solutions:
- Use two different physical machines or devices for camera testing
- Use a virtual camera (OBS Virtual Camera) which can be shared between tabs
- One tab voice-only, one tab video — the voice-only tab won't request camera

### Metered TURN free tier (500 MB/month)

TURN relay is a fallback for peers behind symmetric NAT. Most connections go direct via STUN. If you're consistently hitting the limit, check the Metered dashboard for usage breakdown. Consider:
- Self-hosting Coturn on the existing Oracle VM (`apt install coturn`)
- Upgrading to Metered paid tier

### Conference room mesh limit

Full mesh means n(n-1)/2 connections for n peers:

| Peers | Connections |
|-------|------------|
| 2 | 1 |
| 4 | 6 |
| 6 | 15 |
| 8 | 28 |

Recommend capping conference rooms at 6 users in the map editor. Beyond that, CPU encoding overhead causes audio/video degradation on mid-range machines.

### AudioContext user gesture requirement

The speaking-detection `AudioContext` (`analyserCtx`) may start in `suspended` state if it was created before a user gesture. `connect()` calls `await analyserCtx.resume()` before `createMediaStreamSource`. This is a best-effort resume — if the browser rejects it, speaking detection silently fails (non-critical path). Audio playback is unaffected.

---

## Deployment

### Frontend

Cloudflare Pages auto-deploys on push to `main`. No special configuration needed for WebRTC — all signaling goes through the existing WS URL configured in `VITE_WS_URL`.

### Backend (WS server)

The WS server runs on the Oracle VM under pm2.

```bash
# After changes to apps/ws/src/
pnpm --filter http build
pm2 restart metaverse2d --update-env
```

No TURN server ports need to be opened on the Oracle VM firewall — Metered's TURN is external. If you self-host Coturn later, open UDP 3478 and TCP 3478/5349.

### Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `VITE_WS_URL` | Frontend `.env` | WebSocket server URL, e.g. `wss://your-domain:3000` |
| `VITE_API_URL` | Frontend `.env` | HTTP API base URL |

TURN credentials are currently hardcoded in `PeerManager.ts`. To serve them dynamically, implement `GET /api/v1/turn-credentials` returning `{ iceServers: [...] }` using the Metered API or your Coturn credentials.
