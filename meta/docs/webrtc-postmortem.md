# WebRTC Implementation Postmortem

OfficeVerse 2D shipped a full peer-to-peer audio/video system on top of an Oracle VM WebSocket signaling server. This document is a retrospective of what was built, how the architecture evolved, and every significant bug that was encountered and fixed during development.

---

## What Was Built

| Feature | Description |
|---------|-------------|
| **Proximity voice** | Automatic voice connection when users walk within 5 tiles and click the call button. Volume attenuates linearly to zero at range boundary. |
| **Proximity video** | Explicit knock-to-join video call with nearby users. Camera acquired on accept; camera failure is non-fatal (remote video still received). |
| **Conference rooms** | Walk-on tile triggers full-mesh audio+video calls with all room occupants simultaneously. |
| **Broadcast zones** | One speaker streams to many listeners. Listeners are receive-only; speaker connects to each listener individually. |
| **Knock-to-join** | Explicit call request flow (knock → toast → Accept/Deny) used for all proximity and video calls. Auto-deny after 15 seconds. |
| **Group calls** | 3+ users in proximity can join a group call via a single-click group call button. Full mesh, no MCU/SFU. |
| **Discord-style voice toolbar** | Fixed HUD with mic mute, camera toggle, deafen, and Leave Call. Shows connected peer count. |
| **Speaking indicators** | Pulsing purple ring on the canvas around speaking avatars, driven by per-peer `AnalyserNode` frequency analysis at 100ms intervals. |
| **Self-view tile** | Mirror-flipped local camera preview, shown only when camera is on and at least one peer is connected. |
| **Draggable remote video tiles** | Grid of remote video tiles, fixed to the top-left corner, with connection state overlay (Connecting / Connected / Failed). |

---

## Architecture

### Signal path

```
Client A (initiator)        Oracle VM WS         Client B (responder)
        |                        |                        |
        |── rtc:knock ─────────> |── rtc:knock ─────────> |
        |                        |                        | (toast shown)
        |<── rtc:knock-accept ── |<── rtc:knock-accept ── |
        |                        |                        |
        |── rtc:offer ─────────> |── rtc:offer ─────────> |
        |<── rtc:answer ──────── |<── rtc:answer ──────── |
        |── rtc:ice ───────────> |── rtc:ice ───────────> |
        |                        |                        |
        |<══════ P2P audio/video (DTLS-SRTP, server never touches media) ══════>|
```

The WS server never inspects or buffers SDP or ICE payloads. It finds the target user by `userId` in the space's user list and forwards the message verbatim.

### ICE infrastructure

- Primary STUN: `stun.l.google.com:19302` (Google)
- Secondary STUN: `stun.relay.metered.ca:80` (Metered)
- TURN relay: Metered global relay — UDP 80, TCP 80, TLS 443, TURNS/TLS 443 — hardcoded in `PeerManager.iceServers` with runtime override from `/api/v1/turn-credentials`

### Audio pipeline

One `HTMLAudioElement` per peer, appended to a hidden `#rtc-audio-container` div, with `autoplay = true`. Volume set each animation frame by distance via `setVolume(peerId, distance)`. Audio playback never touches `AudioContext`. A separate `AudioContext` (`analyserCtx`) exists solely for speaking detection and is never in the playback path.

### Perfect negotiation

Polite/impolite role is determined by `myUserId < peerId` (lexicographic). The polite peer rolls back its own pending offer when a collision occurs; the impolite peer ignores the colliding incoming offer. The `_isInitiator` argument to `connect()` has no effect on role assignment — it exists only as documentation of intent.

### React/PeerManager boundary

`PeerManager` is a plain class. All RTC state lives inside it. React's `Game.tsx` mounts one `PeerManager` instance via `useRef`, routes incoming WS messages to it, and listens for `window.dispatchEvent` custom events (`rtc:remoteVideo`, `rtc:peerLeft`, `rtc:peersChanged`, `rtc:connectionStateChanged`, `rtc:speakingState`, `rtc:proximityGroup`, `rtc:knockSent`, `rtc:knockDenied`, `rtc:knockCancelled`) to update React state for UI rendering. Live `MediaStream` objects are stored in `remoteStreamsRef` (a `useRef` Map) to avoid React proxying them; `remotePeerIds` (state, `string[]`) is derived from the Map keys to trigger re-renders.

---

## Major Bugs Encountered and Fixed

### 1. One-way video — perfect negotiation / polite-impolite collision

**Symptom:** One side could see the other's video but not vice versa. Sometimes both sides showed only their own camera preview. The call appeared connected (no errors in console) but the remote stream never arrived.

**Root cause:** Both sides called `connect()` and immediately tried to create an offer via `onnegotiationneeded`. When both offers crossed in flight, the naive handler on each side set the remote description on top of its own pending local description, leaving the signaling state machine in a corrupted state. The `RTCPeerConnection` would silently enter a bad state and stop exchanging tracks.

**Fix:** Implemented the W3C Perfect Negotiation pattern. The peer with the lexicographically smaller `userId` is designated the *polite* peer. When a collision is detected (`makingOffer === true || signalingState !== 'stable'`), the polite peer rolls back its own pending offer with `setLocalDescription({ type: 'rollback' })` in parallel with accepting the remote offer. The impolite peer ignores the colliding incoming offer entirely. This makes simultaneous offers deterministically resolve without either side needing to know who initiated.

---

### 2. Audio silence — `AudioContext` suspended on page load

**Symptom:** Peers connected (ICE succeeded, `connectionState === 'connected'`) but no audio was audible. The issue was consistent on first join and intermittent on subsequent connections.

**Root cause:** The initial implementation routed remote audio through an `AudioContext` created on module load. Browsers (Chrome, Firefox, Safari) suspend `AudioContext` by default on page load until a user gesture (click, keypress, touch) occurs. Since `PeerManager` was instantiated in a `useEffect` during page load — before the user had interacted with the UI — the `AudioContext` was in `suspended` state when `ontrack` fired and tried to play audio.

**Fix:** Replaced the `AudioContext` playback path entirely with one `HTMLAudioElement` per peer (`new Audio()`), setting `srcObject` directly on `ontrack`. `HTMLAudioElement` with `autoplay = true` does not require a prior user gesture when the stream comes from a WebRTC track established after a user gesture (the knock/accept flow). Elements are appended to a hidden `#rtc-audio-container` div; this prevents Chrome 120+ and Safari from garbage-collecting or suspending detached audio nodes during a long call. A separate `AudioContext` was retained only for the speaking detection `AnalyserNode`, which is non-critical and recovers gracefully from suspension.

---

### 3. Knock infinite loop — both sides re-knocking after accept

**Symptom:** After one user accepted a call, both sides immediately received a new incoming knock toast. Accepting it again triggered another knock. The call would never establish; instead both clients spun in an accept→knock→accept loop until the user gave up.

**Root cause:** The first implementation of `acceptIncomingKnock` called `sendKnock(fromId, mode)` internally to "confirm" the connection intent. `sendKnock` wrote to `pendingKnocks` and sent `rtc:knock` back to the original caller. The original caller received the incoming knock, called `acceptIncomingKnock`, which again called `sendKnock` — infinite loop.

**Fix:** `acceptIncomingKnock` was refactored to never call `sendKnock` or touch `pendingKnocks`. Its sole job is to (optionally) acquire camera, call `connect(fromId, mode, false)` to open the peer connection slot as non-initiator, and send `rtc:knock-accept`. This invariant is preserved: the receiver never echoes a knock back. This constraint is documented prominently in both the code and the developer notes because violations are easy to re-introduce.

---

### 4. `callType` stripped by server — video knock arriving as voice

**Symptom:** Clicking the video call button triggered the knock flow correctly on the sender side (`callType: 'video'` was logged in the browser). But the receiver's toast showed "wants to voice call you" and accepted calls connected audio-only.

**Root cause:** The WS server's `rtc:knock` relay handler in `User.ts` forwarded `{ type, from, fromName }` but did not include `callType` in the forwarded object. The field was silently dropped.

**Fix:** Added `callType: parsedData.callType` to the forwarded message in `User.ts`. A one-line change, but it required tracing the full signal path from sender browser → WS relay → receiver browser to find the gap.

---

### 5. PeerManager init race — null ref during 8-second init window

**Symptom:** If a remote user sent an offer, answer, ICE candidate, or knock-accept during the first few seconds after page load, the messages were silently dropped. The connection would never complete even though both sides appeared to be signaling. Affected users saw each other's avatars but heard nothing.

**Root cause:** `PeerManager.init()` is async — it requests mic permission (up to user response time) and fetches TURN credentials (network round trip). During this window, `peerManagerRef.current` in `Game.tsx` was `null`. The WS message handler called `peerManagerRef.current?.handleOffer(...)` via optional chaining, which silently no-ops when the ref is null. An 8-second timeout was imposed on init to prevent a permission prompt from hanging forever, but this meant the window was always at least a few hundred milliseconds long.

**Fix:** Introduced `rtcBufferRef` in `Game.tsx` — a `{ type, data }[]` array. When a RTC-related WS message arrives and `peerManagerRef.current` is null, the message is pushed to the buffer instead of dropped. In the `.finally()` callback after `pm.init()` completes, the buffer is spliced and each message is replayed against the now-live PM. The buffer is cleared (not flushed) on WS disconnect, component unmount, and before `onLeaveCall` re-init to prevent stale messages from a previous session from replaying in a new one.

---

### 6. Duplicate player on reconnect — stale session in server roster

**Symptom:** After a page refresh, two copies of the refreshing user's avatar appeared on screen for other participants. One copy was static (the old session's last known position); the other was the newly connected user. The duplicate disappeared after a few seconds when the old WebSocket timed out.

**Root cause:** On page reload, the browser closes the old WebSocket and opens a new one. The server creates a new `User` object for the new socket. The old `User` object is still in the space's room array (a `Map<spaceId, User[]>` in `RoomManager`) until its `destroy()` method is called when the old socket closes. During the gap between the new join and the old disconnect, two entries existed in the room array with the same `userId` but different socket-level `id`s. The `space-joined` roster payload was built from the full array filtered only by socket `id !== this.id`, so the stale entry with the same `userId` but a different socket `id` passed the filter and appeared in the roster sent to the reconnecting user — causing them to see themselves as another player.

**Fix:** In `User.ts`'s `join` handler, before calling `getRoomManager().addUser(spaceId, this)`, the room array is scanned for any entry with `u.userId === this.userId && u.id !== this.id`. If found, the stale entry's `spaceId` is set to `undefined` (accessible within the class body since TypeScript's `private` modifier is class-scoped, not instance-scoped) and the entry is spliced out of the array. Clearing `spaceId` prevents the stale entry's eventual `destroy()` call from broadcasting a spurious `user-left` that would remove the newly reconnected user from other clients' views. The `space-joined` roster filter was also updated to additionally exclude `u.userId === this.userId` as a belt-and-suspenders guard.

---

### 7. Black self-view — `useEffect` deps missing, `srcObject` timing

**Symptom:** After enabling the camera and joining a call, the local "You" self-view tile rendered but showed a black rectangle. The remote participant could see the local user's video. The self-view only recovered if the user toggled the camera off and back on.

**Root cause:** Two independent issues combined. First, the `useEffect` that assigned `localVideoStreamRef.current` to `selfVideoRef.current.srcObject` had `[cameraEnabled]` in its dependency array. When `connectedPeers` went from 0 to 1 (first peer joined), the self-view tile mounted for the first time — but `cameraEnabled` hadn't changed, so the effect did not re-fire and the stream was never attached to the newly mounted `<video>` element. Second, in some timing sequences, `selfVideoRef.current.srcObject = stream` was called before the element was rendered into the DOM, making the assignment a no-op.

**Fix:** Added `connectedPeers` to the `useEffect` dependency array, ensuring the effect re-fires whenever the tile mounts or unmounts. Tightened the attach condition to `cameraEnabled && localVideoStreamRef.current` so no attempt is made when the stream is unavailable. The `RemoteVideoTile`'s stream attachment was also hardened with a live-track readiness check: if `videoTrack.readyState !== 'live'` at mount time, attachment is deferred until the track's `unmute` event fires.

---

### 8. Video tile not disappearing — incomplete `onconnectionstatechange` cleanup

**Symptom:** After a peer left the call or walked out of proximity range, their video tile sometimes stayed on screen indefinitely. The audio stopped (the peer's audio element was cleaned up correctly) but the video `<div>` persisted, showing a frozen frame.

**Root cause:** The `onConnectionStateChanged` handler in `Game.tsx` only deleted the peer from `remoteStreamsRef` when `state === 'closed'`. However, `RTCPeerConnection` does not always transition through `closed` — it can go directly to `disconnected` or `failed` when the remote side drops abruptly (process killed, network cut, page crash). In these cases the tile cleanup path was never reached. The `track.onended` handler on the video track was also not firing reliably in all browsers when the connection dropped non-gracefully.

**Fix:** Extended the cleanup condition to `state === 'closed' || state === 'disconnected' || state === 'failed'`. Additionally, the `disconnect()` method in `PeerManager` was updated to null all PC event handler properties (`ontrack`, `onicecandidate`, `onnegotiationneeded`, `onconnectionstatechange`, `oniceconnectionstatechange`) before calling `pc.close()`. This prevents any stale callbacks from firing on the closed PC and re-entering the cleanup path with stale state.

---

### 9. Camera toggle breaking the connection — `track.stop()` on toggle

**Symptom:** Toggling the camera off and then back on mid-call left the remote peer's view black. The local user could see their own self-view again, but the remote peer never received the new video track. Network tab showed a renegotiation offer being sent, but it was either rejected or the remote peer's `ontrack` didn't fire.

**Root cause:** `disableCamera()` called `track.stop()` on the video track, which permanently terminates the track and its associated hardware capture. It also called `pc.removeTrack(videoSender)` on every peer connection, removing the sender entirely. When the camera was re-enabled, `enableCamera(newStream)` called `addTrack(newTrack)` — but adding a track to a connection that previously had a sender removed can fail silently or produce a second sender, and `onnegotiationneeded` sometimes did not fire reliably after `removeTrack` + `addTrack` in sequence.

**Fix:** Replaced the toggle-off path with `toggleCamera(false)`, a new `PeerManager` method that sets `track.enabled = false` without stopping the track or removing the sender. The sender remains alive in the `RTCPeerConnection`. On re-enable, `enableCamera(newStream)` uses `replaceTrack(existingSender, newTrack)` when a video sender already exists — `replaceTrack` does not trigger renegotiation, making the switch seamless. `track.stop()` is now only called in `destroy()` (full cleanup) and inside `enableCamera` when genuinely replacing an old stream with a new one.

---

### 10. `makingOffer` stuck — no guard in `onnegotiationneeded`

**Symptom:** After certain sequences (rapid track add/remove, or connection failure + retry), subsequent renegotiations silently failed. Adding a video track mid-call triggered `onnegotiationneeded` but no offer was sent. The call continued audio-only with no error in the console.

**Root cause:** The original `onnegotiationneeded` handler set `peer.makingOffer = true` and then proceeded with `createOffer`. If two renegotiations were triggered in rapid succession (e.g. adding audio and video tracks in the same tick), the second firing saw `makingOffer === true` but had no early-return guard — it would re-enter and try to call `createOffer` while the first was still in flight, corrupting the signaling state. Additionally, the handler captured `peer` from the `connect()` closure; after a `disconnect()` + `connect()` cycle for the same peer, the closure held a reference to the *old* `PeerState` object that had been deleted from the `peers` map.

**Fix:** Added `const peer = this.peers.get(peerId); if (!peer) return;` at the top of the handler to always do a fresh lookup rather than relying on the closure. Added `if (peer.makingOffer) return;` as an explicit guard before setting the flag. Replaced `createOffer()` + `setLocalDescription(offer)` with the modern `await pc.setLocalDescription()` (no arguments), which lets the browser internally create and set the optimal description type without a separate `createOffer` call. `makingOffer` is reset in `finally` to guarantee cleanup even on error.

---

### 11. Voice call opening camera — `acceptIncomingKnock` not gating on `callType`

**Symptom:** Accepting a voice call (mic icon, no camera) triggered the browser's camera permission prompt and briefly turned on the camera indicator LED before the call connected. On some devices this caused a `NotReadableError` if the camera was in use, and the call failed entirely.

**Root cause:** `acceptIncomingKnock` entered a `if (mode === 'video')` branch that called `getUserMedia({ video: true })` even when the call was voice-only, because the `else` branch — `this.cameraEnabled = true` — was only reached when `localVideoStream` already existed. If `localVideoStream` was null (no active camera session), it unconditionally tried to acquire the camera regardless of whether the incoming call was voice or video mode.

**Fix:** Simplified `acceptIncomingKnock` to a clean conditional: camera acquisition only runs when `callType === 'video' && !this.localVideoStream`. Voice calls skip the block entirely and go straight to `connect()`. Removed the outer `try/catch` wrapper that had been masking errors from the inner camera acquisition path. The `Game.tsx` Accept button handler already correctly gates `getUserMedia({ video: true })` behind `req.callType === 'video'`, so the PM's check serves only as a fallback for cases where the UI's camera setup failed.

---

### 12. Knock-accept race — duplicate video senders on simultaneous connect

**Symptom:** In video calls, occasional `InvalidStateError: sender already in use` errors appeared in the console. The call would establish but video was sometimes not sent correctly. More commonly, `onnegotiationneeded` would fire twice in rapid succession, sending two upgrade offers.

**Root cause:** Both sides of a video knock call `connect()` as part of their respective accept paths: the receiver calls `connect(fromId, false)` in `acceptIncomingKnock`, and the initiator calls `connect(fromId, true)` in `handleKnockAccepted`. Due to the async timing of WS message delivery, `handleOffer` on the initiator side sometimes created the peer slot *before* `handleKnockAccepted` ran. `handleKnockAccepted` then checked `peers.has(fromId)`, found the slot, and entered the "peer already exists" branch — which unconditionally called `addTrack` for the video track without checking if a video sender was already present. The sender had already been added by the `connect()` call inside `handleOffer`, resulting in two video senders.

**Fix:** Added a `hasVideo` check in the existing-peer branch of `handleKnockAccepted`: `const hasVideo = senders.some(s => s.track?.kind === 'video')`. Video tracks are only added via `addTrack` if no video sender already exists. Added `await` to the `this.connect(fromId, mode, true)` call in the no-existing-peer branch to ensure the slot is fully established before the method returns.

---

### 13. Audio element ghost callbacks — stale `onconnectionstatechange` after `close()`

**Symptom:** After `disconnect()` was called, the connection state change handler continued to fire from the closed `RTCPeerConnection`. This caused `disconnect()` to be called recursively (the `'disconnected'` handler calling `disconnect()` on a peer already removed from the map), and occasionally dispatched spurious `rtc:peerLeft` events, clearing video tiles for peers that were still active.

**Root cause:** `peer.connection.close()` transitions the PC to `'closed'` state, which fires `onconnectionstatechange` with `state === 'closed'`. The handler was not nulled before `close()` was called, so it executed after the peer had already been removed from the `peers` map. The handler then tried to call `disconnect()` again (the `'closed'` cleanup path), which was a no-op (peer not in map), but the `rtc:peerLeft` dispatch had already fired with the stale `peerId`. If the sequence `'disconnected'` → `'closed'` fired back-to-back, `rtc:peerLeft` was dispatched twice for the same peer.

**Fix:** In `disconnect()`, all PC event handler properties are explicitly nulled before `pc.close()` is called: `pc.ontrack = null`, `pc.onicecandidate = null`, `pc.onnegotiationneeded = null`, `pc.onconnectionstatechange = null`, `pc.oniceconnectionstatechange = null`. The audio element cleanup order was also fixed to `pause()` → `srcObject = null` → `remove()` (was `srcObject = null` → `pause()` → `remove()`, which could cause a brief resume attempt when srcObject was cleared on a playing element).

---

## Lessons Learned

**WebRTC state machines are unforgiving.** `RTCPeerConnection` has a strict signaling state machine. Any operation out of sequence (setting remote description while in wrong state, adding ICE candidates before remote description, calling `createOffer` while `makingOffer` is true) produces silent failures or cryptic `InvalidStateError`s. The solution is disciplined state tracking — the `makingOffer` flag, `pendingCandidates` queue, and `peers.has()` guard before `connect()` are all load-bearing.

**Test with real devices and real networks early.** Most of the bugs above only manifested with two real browsers on separate machines or networks. Same-machine testing masks ICE negotiation issues (loopback always succeeds via host candidates), timing issues (same-machine latency is microseconds, not milliseconds), and camera hardware conflicts.

**The signaling server is a silent kill zone.** A one-field omission (`callType` stripped in relay) caused the video/voice distinction to be lost for the entire call setup. Any field that the server forwards verbatim should be forwarded as `...parsedPayload` or verified explicitly in a type definition. The server code should be treated with the same scrutiny as the client code.

**`track.stop()` is a one-way door.** Stopping a media track permanently terminates it. There is no resume. Any feature that needs to toggle media on/off (camera, mic) should use `track.enabled = false/true`. `track.stop()` is appropriate only for final cleanup (`destroy()`). Conflating the two causes connection-breaking renegotiations and camera LED confusion.

**React refs, not React state, for live media objects.** Storing `MediaStream` in React state causes React to proxy the object, which breaks `srcObject` assignment (browsers check the object identity of `srcObject`, and a Proxy wrapper fails the internal `instanceof MediaStream` check in some engines). All live streams are stored in plain `useRef` Maps; React state holds only derived primitive values (peer ID lists, counts) that safely trigger re-renders.

**Server-side deduplication beats client-side filtering.** The duplicate player bug was initially approached by filtering `userId === currentUser.userId` on the client in every message handler. The correct fix was evicting the stale session server-side in `User.ts` before the roster is built, so the client receives a clean payload and no special-casing is needed in any message handler. Server state is authoritative; clients should not need to compensate for server inconsistency.
