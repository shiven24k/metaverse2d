import { VOICE_RADIUS } from './constants';

type PeerMode = 'voice' | 'video';

interface PeerState {
    connection: RTCPeerConnection;
    mode: PeerMode;
    gainNode: GainNode;
    polite: boolean;
    makingOffer: boolean;
}

export class PeerManager {
    private peers = new Map<string, PeerState>();
    private conferencePeers = new Set<string>();
    private proximityPeers = new Set<string>();
    private broadcastPeers = new Set<string>();
    private broadcastMode: 'speaker' | 'listener' | null = null;
    private broadcastSpeakerId: string | null = null;
    private currentBroadcastZoneId: string | null = null;
    // Knocks sent by this peer, waiting for a response (peerId → desired mode)
    private pendingKnocks = new Map<string, PeerMode>();

    private iceServers: RTCIceServer[] = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun.relay.metered.ca:80' },
        {
            urls: 'turn:global.relay.metered.ca:80',
            username: '5fb5154d7caa476fffa59a3d',
            credential: '1ujpQgNVUvtMuscG',
        },
        {
            urls: 'turn:global.relay.metered.ca:80?transport=tcp',
            username: '5fb5154d7caa476fffa59a3d',
            credential: '1ujpQgNVUvtMuscG',
        },
        {
            urls: 'turn:global.relay.metered.ca:443',
            username: '5fb5154d7caa476fffa59a3d',
            credential: '1ujpQgNVUvtMuscG',
        },
        {
            urls: 'turns:global.relay.metered.ca:443?transport=tcp',
            username: '5fb5154d7caa476fffa59a3d',
            credential: '1ujpQgNVUvtMuscG',
        },
    ];
    private localStream: MediaStream | null = null;
    private localVideoStream: MediaStream | null = null;
    private audioCtx: AudioContext | null = null;
    private cameraEnabled = false;
    private micEnabled = true;
    private deafened = false;

    constructor(
        private ws: WebSocket,
        private myUserId: string,
        private myUsername: string,
    ) {}

    async init() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.audioCtx = new AudioContext();
        } catch (err) {
            console.warn('[PeerManager] getUserMedia failed — voice disabled:', err);
        }

        try {
            const res = await fetch('/api/v1/turn-credentials');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
                    this.iceServers = data.iceServers;
                }
            }
        } catch {
            // keep hardcoded fallback iceServers
        }
    }

    // receiveOnly=true is used for broadcast listeners: connection is created but no
    // local tracks are added, so only the speaker's tracks flow in.
    async connect(peerId: string, mode: PeerMode = 'voice', _isInitiator = true, receiveOnly = false) {
        if (this.peers.has(peerId)) return;
        if (!this.localStream || !this.audioCtx) return;

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        // The peer with the lexicographically smaller userId is the polite peer — it
        // rolls back and defers when both sides send offers simultaneously.
        const polite = this.myUserId < peerId;

        const gainNode = this.audioCtx.createGain();
        gainNode.connect(this.audioCtx.destination);

        const peer: PeerState = { connection: pc, mode, gainNode, polite, makingOffer: false };

        // Register early so a concurrent handleOffer doesn't create a duplicate PC.
        this.peers.set(peerId, peer);

        pc.ontrack = (e) => {
            console.log('[PeerManager] ontrack from', peerId, '| kind:', e.track.kind, '| readyState:', e.track.readyState, '| streams:', e.streams.length);
            if (e.track.kind === 'audio') {
                this.audioCtx!.createMediaStreamSource(e.streams[0]).connect(gainNode);
            } else {
                const stream = e.streams[0];
                if (!stream) {
                    console.warn('[PeerManager] ontrack: video track arrived with no stream, skipping');
                    return;
                }
                window.dispatchEvent(new CustomEvent('rtc:remoteVideo', {
                    detail: { peerId, stream },
                }));
            }
        };

        pc.onicecandidate = (e) => {
            if (e.candidate) {
                this.ws.send(JSON.stringify({ type: 'rtc:ice', to: peerId, candidate: e.candidate }));
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed') this.disconnect(peerId);
        };

        // Perfect negotiation: this handler fires whenever renegotiation is needed
        // (e.g. after addTrack). The makingOffer flag lets handleOffer detect collisions.
        pc.onnegotiationneeded = async () => {
            try {
                peer.makingOffer = true;
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.ws.send(JSON.stringify({ type: 'rtc:offer', to: peerId, sdp: offer }));
            } catch (err) {
                console.warn('[PeerManager] onnegotiationneeded failed:', peerId, err);
            } finally {
                peer.makingOffer = false;
            }
        };

        if (!receiveOnly) {
            // Adding tracks triggers onnegotiationneeded asynchronously.
            // For the initiator this sends the first offer; for the non-initiator it
            // may trigger a second offer later (handled by perfect negotiation).
            this.localStream.getAudioTracks().forEach(t => pc.addTrack(t, this.localStream!));
            if (this.localVideoStream) {
                this.localVideoStream.getVideoTracks().forEach(t => pc.addTrack(t, this.localVideoStream!));
            }
        }
        // receiveOnly (broadcast listener): no local tracks added; speaker sends the offer.
    }

    // Perfect negotiation offer handler — handles collision via polite/impolite roles.
    async handleOffer(fromId: string, sdp: RTCSessionDescriptionInit) {
        // If this offer comes from the broadcast speaker and we're a listener, don't add
        // local tracks (receive-only connection).
        const receiveOnly = this.broadcastMode === 'listener' && fromId === this.broadcastSpeakerId;

        if (!this.peers.has(fromId)) {
            await this.connect(fromId, 'voice', false, receiveOnly);
        }
        const peer = this.peers.get(fromId);
        if (!peer) return;

        const offerCollision = peer.makingOffer || peer.connection.signalingState !== 'stable';
        // Impolite peer ignores colliding offers; polite peer rolls back and accepts.
        const ignoreOffer = !peer.polite && offerCollision;
        if (ignoreOffer) return;

        try {
            if (offerCollision) {
                // Polite peer: rollback own pending offer, then accept the remote one.
                await Promise.all([
                    peer.connection.setLocalDescription({ type: 'rollback' }),
                    peer.connection.setRemoteDescription(sdp),
                ]);
            } else {
                await peer.connection.setRemoteDescription(sdp);
            }
            const answer = await peer.connection.createAnswer();
            await peer.connection.setLocalDescription(answer);
            this.ws.send(JSON.stringify({ type: 'rtc:answer', to: fromId, sdp: answer }));
        } catch (err) {
            console.warn('[PeerManager] handleOffer failed, disconnecting peer:', fromId, err);
            this.disconnect(fromId);
        }
    }

    async handleAnswer(fromId: string, sdp: RTCSessionDescriptionInit) {
        const peer = this.peers.get(fromId);
        if (!peer) return;
        try {
            await peer.connection.setRemoteDescription(sdp);
        } catch (err) {
            console.warn('[PeerManager] handleAnswer failed, disconnecting peer:', fromId, err);
            this.disconnect(fromId);
        }
    }

    async handleIce(fromId: string, candidate: RTCIceCandidateInit) {
        const peer = this.peers.get(fromId);
        if (peer) {
            try {
                await peer.connection.addIceCandidate(candidate);
            } catch (err) {
                console.warn('[PeerManager] addIceCandidate failed:', err);
            }
        }
    }

    disconnect(peerId: string) {
        const peer = this.peers.get(peerId);
        if (!peer) return;
        peer.connection.close();
        this.peers.delete(peerId);
        this.pendingKnocks.delete(peerId);
        window.dispatchEvent(new CustomEvent('rtc:peerLeft', { detail: { peerId } }));
    }

    async enableCamera(videoStream: MediaStream) {
        const videoTrack = videoStream.getVideoTracks()[0];
        if (!videoTrack) throw new Error('No video track in stream');

        this.localVideoStream = videoStream;
        this.cameraEnabled = true;

        for (const [peerId, peer] of this.peers.entries()) {
            try {
                peer.connection.addTrack(videoTrack, videoStream);
                // onnegotiationneeded fires automatically — perfect negotiation handles any collision
            } catch (err) {
                console.warn('[PeerManager] addTrack failed for peer', peerId, err);
                this.disconnect(peerId);
            }
        }
    }

    disableCamera() {
        this.cameraEnabled = false;
        this.localVideoStream?.getTracks().forEach(t => t.stop());
        this.localVideoStream = null;
        for (const [, peer] of this.peers.entries()) {
            const senders = peer.connection.getSenders();
            const videoSender = senders.find(s => s.track?.kind === 'video');
            if (videoSender) peer.connection.removeTrack(videoSender);
        }
    }

    // Called every animation frame with the current proximity peer lists.
    // Uses knock-to-join: the polite peer (smaller userId) sends rtc:knock; the
    // receiver auto-accepts if they have no active proximity connections, otherwise
    // shows a toast. On accept, the knocker calls connect() normally.
    setProximity(voicePeers: string[], videoPeers: string[]) {
        const prevProximityPeers = this.proximityPeers;
        this.proximityPeers = new Set(voicePeers);

        for (const peerId of voicePeers) {
            if (this.peers.has(peerId) || this.pendingKnocks.has(peerId)) continue;

            const justEnteredRange = !prevProximityPeers.has(peerId);
            if (!justEnteredRange) continue;

            const mode: PeerMode = videoPeers.includes(peerId) && this.cameraEnabled ? 'video' : 'voice';

            // Only the polite peer (smaller userId) initiates the knock to avoid
            // both sides knocking simultaneously.
            if (this.myUserId < peerId) {
                this.pendingKnocks.set(peerId, mode);
                this.ws.send(JSON.stringify({
                    type: 'rtc:knock',
                    to: peerId,
                    fromName: this.myUsername,
                }));
                window.dispatchEvent(new CustomEvent('rtc:knockSent', { detail: { peerId } }));
            }
            // Impolite peer waits for the polite peer's knock to arrive.
        }

        // Cancel pending knocks for peers who left range, and clear the sender-side UI.
        for (const [peerId] of this.pendingKnocks) {
            if (!voicePeers.includes(peerId)) {
                this.pendingKnocks.delete(peerId);
                // Bug 3 fix: without this event the "Requesting to join" pill in Game.tsx
                // would stay visible forever when B moves away before responding.
                window.dispatchEvent(new CustomEvent('rtc:knockCancelled', { detail: { peerId } }));
            }
        }

        // Disconnect peers no longer in any active set.
        for (const peerId of [...this.peers.keys()]) {
            if (
                !voicePeers.includes(peerId) &&
                !this.conferencePeers.has(peerId) &&
                !this.broadcastPeers.has(peerId)
            ) {
                this.disconnect(peerId);
            }
        }

        // Emit the current group (connected proximity peers) so the UI can show it.
        const connectedGroup = voicePeers.filter(p => this.peers.has(p));
        window.dispatchEvent(new CustomEvent('rtc:proximityGroup', {
            detail: { members: connectedGroup },
        }));
    }

    // Called when we receive rtc:knock from a remote peer.
    // Always returns false — the receiver must explicitly Accept or Deny via the toast.
    handleKnock(fromId: string): false {
        console.log('[PeerManager] handleKnock from', fromId);
        return false;
    }

    acceptIncomingKnock(fromId: string) {
        this.ws.send(JSON.stringify({ type: 'rtc:knock-accept', to: fromId }));
    }

    denyIncomingKnock(fromId: string) {
        this.ws.send(JSON.stringify({ type: 'rtc:knock-deny', to: fromId }));
    }

    // Called when the peer we knocked accepted us.
    handleKnockAccepted(fromId: string) {
        // Bug 2 fix: if setProximity cleaned up pendingKnocks while the accept was in-flight
        // (B briefly fell out of voicePeers for one frame), mode would be undefined and the
        // call would never start. Fall back to 'voice' so we always connect on accept.
        const mode = this.pendingKnocks.get(fromId) ?? 'voice';
        this.pendingKnocks.delete(fromId);
        console.log('[PeerManager] handleKnockAccepted from', fromId, '| connecting as', mode);
        // Defer so the accept message's WS callback stack clears first.
        setTimeout(() => this.connect(fromId, mode, true), 0);
    }

    // Called when the peer we knocked denied us.
    handleKnockDenied(fromId: string) {
        this.pendingKnocks.delete(fromId);
        window.dispatchEvent(new CustomEvent('rtc:knockDenied', { detail: { peerId: fromId } }));
    }

    setVolume(peerId: string, distance: number) {
        const peer = this.peers.get(peerId);
        if (!peer || !this.audioCtx) return;
        const gain = Math.max(0, 1 - distance / VOICE_RADIUS);
        peer.gainNode.gain.setTargetAtTime(gain, this.audioCtx.currentTime, 0.1);
    }

    joinConferencePeer(peerId: string) {
        this.conferencePeers.add(peerId);
        if (!this.peers.has(peerId)) this.connect(peerId, 'video', true);
    }

    leaveConference() {
        for (const peerId of this.conferencePeers) {
            if (!this.proximityPeers.has(peerId) && !this.broadcastPeers.has(peerId)) {
                this.disconnect(peerId);
            }
        }
        this.conferencePeers.clear();
    }

    // Enters a broadcast zone.
    // Speaker connects to all current listeners; listener waits for the speaker's offer
    // (receive-only connection created proactively so handleOffer skips addTrack).
    enterBroadcastZone(zoneId: string, isSpeaker: boolean) {
        this.broadcastMode = isSpeaker ? 'speaker' : 'listener';
        this.currentBroadcastZoneId = zoneId;
        this.ws.send(JSON.stringify({ type: 'rtc:broadcast-zone-join', zoneId, isSpeaker }));
    }

    // Called when the server sends back the zone state (on join, or when membership changes).
    handleBroadcastZoneState(_zoneId: string, speakerId: string | null, listenerIds: string[]) {
        if (this.broadcastMode === 'speaker') {
            // Connect to any new listeners.
            for (const listenerId of listenerIds) {
                if (!this.broadcastPeers.has(listenerId)) {
                    this.broadcastPeers.add(listenerId);
                    setTimeout(() => this.connect(listenerId, 'video', true, false), 0);
                }
            }
            // Disconnect listeners who left the zone.
            for (const peerId of [...this.broadcastPeers]) {
                if (!listenerIds.includes(peerId)) {
                    this.broadcastPeers.delete(peerId);
                    if (!this.proximityPeers.has(peerId) && !this.conferencePeers.has(peerId)) {
                        this.disconnect(peerId);
                    }
                }
            }
        } else if (this.broadcastMode === 'listener') {
            if (speakerId && speakerId !== this.broadcastSpeakerId) {
                this.broadcastSpeakerId = speakerId;
                if (!this.broadcastPeers.has(speakerId)) {
                    this.broadcastPeers.add(speakerId);
                    // Pre-create receive-only connection so handleOffer skips addTrack.
                    setTimeout(() => this.connect(speakerId, 'video', false, true), 0);
                }
            } else if (!speakerId && this.broadcastSpeakerId) {
                const oldSpeakerId = this.broadcastSpeakerId;
                this.broadcastSpeakerId = null;
                this.broadcastPeers.delete(oldSpeakerId);
                if (!this.proximityPeers.has(oldSpeakerId) && !this.conferencePeers.has(oldSpeakerId)) {
                    this.disconnect(oldSpeakerId);
                }
            }
        }
    }

    leaveBroadcastZone() {
        if (!this.currentBroadcastZoneId) return;
        this.ws.send(JSON.stringify({ type: 'rtc:broadcast-zone-leave', zoneId: this.currentBroadcastZoneId }));
        for (const peerId of [...this.broadcastPeers]) {
            this.broadcastPeers.delete(peerId);
            if (!this.proximityPeers.has(peerId) && !this.conferencePeers.has(peerId)) {
                this.disconnect(peerId);
            }
        }
        this.broadcastMode = null;
        this.broadcastSpeakerId = null;
        this.currentBroadcastZoneId = null;
    }

    toggleMic(enabled: boolean) {
        this.micEnabled = enabled;
        this.localStream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
    }

    setDeafen(deafened: boolean) {
        this.deafened = deafened;
        for (const peer of this.peers.values()) {
            peer.gainNode.gain.setTargetAtTime(
                deafened ? 0 : 1,
                this.audioCtx!.currentTime,
                0.1
            );
        }
        if (deafened) this.toggleMic(false);
    }

    getDeafened() { return this.deafened; }

    // Returns true if this peer is a pending knock sender (shows "Requesting..." UI).
    isPendingKnock(peerId: string): boolean {
        return this.pendingKnocks.has(peerId);
    }

    // Number of proximity peers that have an active connection (for auto-accept logic).
    getProximityConnectedCount(): number {
        return [...this.proximityPeers].filter(p => this.peers.has(p)).length;
    }

    getMicEnabled() { return this.micEnabled; }
    getCameraEnabled() { return this.cameraEnabled; }
    getLocalStream() { return this.localStream; }
    getConnectedPeerCount() { return this.peers.size; }

    destroy() {
        for (const peerId of [...this.peers.keys()]) this.disconnect(peerId);
        this.localStream?.getTracks().forEach(t => t.stop());
        this.localVideoStream?.getTracks().forEach(t => t.stop());
        this.localStream = null;
        this.localVideoStream = null;
        this.audioCtx?.close();
        this.audioCtx = null;
    }
}
