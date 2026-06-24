# WebRTC — Developer Notes

Patch history and architecture reference for the OfficeVerse 2D real-time audio/video system.

---

## Files

| File | Role |
|------|------|
| `apps/frontend/src/webrtc/PeerManager.ts` | All WebRTC logic — connections, signaling, audio, speaking detection |
| `apps/frontend/src/webrtc/constants.ts` | `VOICE_RADIUS`, `VIDEO_RADIUS`, `BROADCAST_RADIUS` |
| `apps/frontend/src/Game.tsx` | Mounts PeerManager, wires WS messages → PM methods, renders video tiles |
| `apps/frontend/src/components/game/VoiceToolbar.tsx` | In-call HUD (mic, camera, deafen, leave) |
| `apps/frontend/src/components/game/ProximityChatPanel.tsx` | Nearby chat + knock buttons |
| `apps/ws/src/User.ts` | Server-side relay — forwards RTC signaling messages between clients |
| `apps/ws/src/types.ts` | TypeScript types for all WS messages |

---

## Architecture

```
Client A                  WS Server              Client B
   |                          |                      |
   |-- rtc:knock -----------> |-- rtc:knock -------> |
   |<- rtc:knock-accept ----- |<- rtc:knock-accept - |
   |                          |                      |
   |-- rtc:offer -----------> |-- rtc:offer -------> |
   |<- rtc:answer ----------- |<- rtc:answer ------- |
   |-- rtc:ice ------------> |-- rtc:ice ----------> |
   |                          |                      |
   |<======= P2P media (DTLS/SRTP, no server) ======>|
```

The server **never touches media** — it only relays SDP and ICE messages. All audio/video flows peer-to-peer after negotiation.

---

## ICE / TURN

Hardcoded in `PeerManager.iceServers` (STUN + Metered TURN). On `init()`, attempts to override with fresh credentials from `/api/v1/turn-credentials`. Falls back silently to hardcoded values on failure.

```
stun:stun.l.google.com:19302
stun:stun.relay.metered.ca:80
turn:global.relay.metered.ca:80       (UDP)
turn:global.relay.metered.ca:80?tcp   (TCP)
turn:global.relay.metered.ca:443
turns:global.relay.metered.ca:443?tcp (TLS)
```

---

## Perfect Negotiation

Uses the [Perfect Negotiation pattern](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation).

- **Polite peer**: `myUserId < peerId` (lexicographic). Rolls back its own pending offer when a collision occurs.
- **Impolite peer**: ignores colliding incoming offers.
- `makingOffer` flag prevents race between `onnegotiationneeded` and `handleOffer`.

This means the `isInitiator` argument to `connect()` has no effect on the polite/impolite role — role is always determined by userId comparison.

---

## Connection Lifecycle

```
connect(peerId, mode)
  → new RTCPeerConnection
  → new Audio() appended to #rtc-audio-container
  → peers.set(peerId, ...)         ← slot claimed synchronously
  → localStream tracks addTrack'd  ← triggers onnegotiationneeded
  → onnegotiationneeded fires
      → createOffer → setLocalDescription → ws send rtc:offer

Remote peer receives rtc:offer
  → handleOffer → connect() if no slot yet → setRemoteDescription → createAnswer → ws send rtc:answer

Initiator receives rtc:answer
  → handleAnswer → setRemoteDescription

Both sides exchange rtc:ice candidates
  → handleIce → addIceCandidate
  → candidates that arrive before remoteDescription is set are queued in pendingCandidates, flushed in handleOffer/handleAnswer

pc.ontrack fires (audio)
  → audioEl.srcObject = stream  → audioEl.play()
  → speaking detection setInterval started

pc.ontrack fires (video)
  → window.dispatchEvent('rtc:remoteVideo', { peerId, stream })
  → Game.tsx adds stream to remoteStreamsRef → setRemotePeerIds → RemoteVideoTile rendered

pc.onconnectionstatechange
  → 'failed'       → disconnect + retry after 1s (if still in proximity/conference)
  → 'disconnected' → disconnect (cleans up tile via rtc:peerLeft)
  → 'closed'       → disconnect (cleans up tile via rtc:peerLeft)
```

---

## Audio Pipeline

**Key design decision:** Audio uses `HTMLAudioElement`, NOT `AudioContext`, for playback.

`AudioContext` is suspended by browsers on page load until a user gesture. Using it for playback caused silent audio on join. Fix: one `HTMLAudioElement` per peer, appended to a hidden `#rtc-audio-container` div so browsers don't GC or suspend detached elements.

```
ontrack (audio)
  → peer.audioEl.srcObject = e.streams[0]
  → peer.audioEl.play()
  → peer.audioEl.volume = 0..1   (set by setVolume() each rAF based on distance)
  → peer.audioEl.muted = deafened (set by setDeafen())
```

`disconnect()` always calls:
```typescript
peer.audioEl.srcObject = null;
peer.audioEl.pause();
peer.audioEl.remove();   // removes from #rtc-audio-container
```

---

## Speaking Detection

A **separate** `AudioContext` (`analyserCtx`) is used only for the speaking indicator — it is never in the playback path.

```
ontrack (audio)
  → analyserCtx.resume() (awaited — important: context may start suspended)
  → createMediaStreamSource(stream).connect(analyser)
  → setInterval 100ms:
      getByteFrequencyData → avg frequency
      avg > 15 → speaking = true
      only dispatches 'rtc:speakingState' when speaking state changes  ← avoids 10Hz re-renders
```

Game.tsx listens for `rtc:speakingState` and draws a pulsing purple ring around the avatar on the canvas.

`analyserCtx` is closed in `destroy()`.

---

## Video Pipeline

Video is never auto-connected by proximity. It requires an explicit knock.

```
User clicks video call button
  → sendKnock(peerId, 'video')
  → ws rtc:knock { callType: 'video' }

Remote receives rtc:knock
  → toast shown with Accept/Deny

Remote accepts
  → acceptIncomingKnock(fromId, 'video')
      → getUserMedia({ video: true }) if no active camera
      → connect(fromId, 'video', false)
      → ws rtc:knock-accept

Initiator receives rtc:knock-accept
  → handleKnockAccepted(fromId)
      → connect(fromId, 'video', true)  ← impolite peer, sends the offer
```

Video tracks are added in `connect()` from `localVideoStream` if available. Camera can be toggled mid-call via `enableCamera()` / `disableCamera()`.

Video tiles render in Game.tsx at fixed position `top:56, left:12, width:280`. Component: `RemoteVideoTile` (defined inline in Game.tsx, not a separate file).

`remoteStreamsRef` (Map, not state) is the source of truth for live streams. `remotePeerIds` (state, string[]) is derived from it to trigger React re-renders without proxying live MediaStream objects.

---

## Proximity System

```
constants.ts:
  VOICE_RADIUS = 5    tiles  → auto voice range
  VIDEO_RADIUS = 3    tiles  → computed but currently unused (video is knock-only)
  BROADCAST_RADIUS = 15 tiles
```

`runProximityCheck()` runs on every player movement (rAF loop). Calls `setProximity(voicePeers, videoPeers)`.

`setProximity()`:
- Updates `proximityPeers` set
- Cancels pending knocks for peers who left range (dispatches `rtc:knockCancelled`)
- Disconnects peers no longer in any active set (proximity, conference, broadcast)
- Emits `rtc:proximityGroup` with `{ members: connectedGroup, nearbyPeers: callable }`

Walking into range does **not** auto-start a call. Call buttons appear in ProximityChatPanel; the user must explicitly knock.

---

## Knock Flow (Detail)

```
Sender:
  sendKnock(peerId, callType)
    pendingKnocks.set(peerId, mode)
    ws → rtc:knock { to, fromName, callType }
    dispatch 'rtc:knockSent'

Server (User.ts):
  Relays rtc:knock { from, fromName, callType } to target

Receiver (Game.tsx):
  handleKnock(fromId) → no-op (vestigial PM method)
  Show toast via setKnockRequests
  Auto-deny after 15s if not responded to
  Accept → acceptIncomingKnock(fromId, callType)
  Deny  → denyIncomingKnock(fromId) → ws rtc:knock-deny

Server relays rtc:knock-accept / rtc:knock-deny back to sender

Sender receives rtc:knock-accept:
  handleKnockAccepted(fromId)
    pendingKnocks.delete(fromId)
    connect(fromId, mode, true)   ← no-op if slot already claimed by handleOffer

Sender receives rtc:knock-deny:
  handleKnockDenied(fromId)
    dispatch 'rtc:knockDenied'
```

**Critical invariant:** `acceptIncomingKnock` must never call `sendKnock()` or modify `pendingKnocks`. Doing so caused an infinite knock→accept→knock loop.

---

## Conference Rooms

Server sends `rtc:room-peers` when a user joins a conference room. Game.tsx calls `joinConferencePeer(peerId)` for each peer ID.

```
joinConferencePeer(peerId)
  conferencePeers.add(peerId)
  connect(peerId, 'video', true)   ← hardcoded video mode

leaveConference()
  disconnects all conference peers not in proximity/broadcast
  conferencePeers.clear()
```

Conference peers are exempt from proximity-based disconnection.

---

## Broadcast Zones

One speaker, many listeners. Speaker sends media; listeners are receive-only.

```
enterBroadcastZone(zoneId, isSpeaker)
  → ws rtc:broadcast-zone-join

handleBroadcastZoneState(zoneId, speakerId, listenerIds)
  speaker:  connect to each listenerId (normal, both tracks)
  listener: connect to speakerId (receiveOnly=true — no local tracks added)

leaveBroadcastZone()
  → ws rtc:broadcast-zone-leave
  → disconnect all broadcastPeers not in proximity/conference
```

`receiveOnly=true` in `connect()` skips `addTrack` calls. `handleOffer` detects broadcast listener mode via `broadcastMode === 'listener' && fromId === broadcastSpeakerId` and also skips track addition.

---

## RTC Message Buffering (init race fix)

`peerManagerRef.current` is null for up to 8 seconds after WS connect while `pm.init()` runs (mic permission prompt). Incoming `rtc:offer/answer/ice/knock-accept/knock-deny` messages during this window are buffered in `rtcBufferRef` (Game.tsx) and flushed after `.finally()` assigns the new PM instance.

Buffer is cleared (not flushed) on:
- WS disconnect / component unmount
- `onLeaveCall` before re-init (stale messages from the old call must not replay)

---

## Custom Events (window)

| Event | Detail | Emitted by | Consumed by |
|-------|--------|------------|-------------|
| `rtc:remoteVideo` | `{ peerId, stream }` | PeerManager | Game.tsx → remoteStreamsRef |
| `rtc:peerLeft` | `{ peerId }` | PeerManager.disconnect() | Game.tsx → clears tile/state |
| `rtc:peersChanged` | `{ count }` | PeerManager | Game.tsx → setConnectedPeers |
| `rtc:connectionStateChanged` | `{ peerId, state }` | PeerManager | Game.tsx → peerConnectionStatesRef |
| `rtc:speakingState` | `{ peerId, speaking }` | PeerManager | Game.tsx → canvas ring |
| `rtc:proximityGroup` | `{ members, nearbyPeers }` | PeerManager.setProximity | Game.tsx → setProximityGroup/setNearbyPeerIds |
| `rtc:knockSent` | `{ peerId }` | PeerManager.sendKnock | Game.tsx → setKnockPendingPeerIds |
| `rtc:knockDenied` | `{ peerId }` | PeerManager.handleKnockDenied | Game.tsx → toast |
| `rtc:knockCancelled` | `{ peerId }` | PeerManager.setProximity / cancelKnock | Game.tsx → setKnockPendingPeerIds |

---

## PeerManager Public API

```typescript
init(): Promise<void>                              // getUserMedia + TURN credentials fetch
connect(peerId, mode, _isInitiator?, receiveOnly?) // open RTCPeerConnection
disconnect(peerId)                                 // close + DOM cleanup + dispatch peerLeft
handleOffer(fromId, sdp)                          // perfect negotiation offer handler
handleAnswer(fromId, sdp)                         // set remote answer
handleIce(fromId, candidate)                      // add ICE candidate (queued if early)
sendKnock(peerId, callType)                       // send knock to peer
cancelKnock(peerId)                               // cancel pending knock
acceptIncomingKnock(fromId, callType)             // accept received knock
denyIncomingKnock(fromId)                         // deny received knock
handleKnockAccepted(fromId)                       // called when our knock is accepted
handleKnockDenied(fromId)                         // called when our knock is denied
setProximity(voicePeers, _videoPeers)             // update proximity peers, prune stale
setVolume(peerId, distance)                        // attenuate audioEl.volume by distance
toggleMic(enabled)                                // mute/unmute local audio track
setDeafen(deafened)                               // mute all audioEl + toggleMic(false)
enableCamera(videoStream)                          // add video track to all connections
disableCamera()                                    // remove video senders + stop tracks
joinConferencePeer(peerId)                        // connect to conference room member
leaveConference()                                 // disconnect conference peers
enterBroadcastZone(zoneId, isSpeaker)            // join broadcast zone
handleBroadcastZoneState(zoneId, speakerId, listenerIds)
leaveBroadcastZone()
destroy()                                          // close all peers + stop all tracks
```

---

## Patch Log

| Commit | Description |
|--------|-------------|
| `fc41d4d` | Fix TS6133: rename `isInitiator` → `_isInitiator` (unused param) |
| `e4256ec` | Fix speaking detection perf: only dispatch on state change; `await analyserCtx.resume()`; buffer RTC msgs during init; fix VoiceToolbar label |
| `ce6f7f6` | Clear video tile on `disconnected`/`closed` connection state |

---

## Known Limitations / Non-Issues

- **`VIDEO_RADIUS` is dead code** — `setProximity` ignores `_videoPeers`. Video is knock-only. The constant and `videoPeers` array in Game.tsx can be removed if proximity-auto-video is never implemented.
- **`handleKnock()` is a no-op** — all incoming knock handling is in Game.tsx. The PeerManager method exists only for call-site symmetry.
- **Conference room always connects as `'video'`** — `joinConferencePeer` hardcodes `'video'` mode regardless of whether camera is active. Peers without cameras will still open a video-capable connection (no tracks sent until camera is enabled).
- **Speaking detection rate**: `setInterval(100ms)` per connected peer. With the on-change dispatch fix, React only re-renders when a peer starts or stops speaking, not at 10Hz continuously.
