import { VOICE_RADIUS } from './constants';

type PeerMode = 'voice' | 'video';

interface PeerState {
    connection: RTCPeerConnection;
    mode: PeerMode;
    audioEl: HTMLAudioElement;
    polite: boolean;
    makingOffer: boolean;
    connectionState: RTCPeerConnectionState;
    wasSpeaking: boolean;
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
    // ICE candidates that arrived before remoteDescription was set (peerId → queue)
    private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

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
    // Separate AudioContext used only for speaking detection — never in the audio playback path.
    private analyserCtx: AudioContext | null = null;
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
        } catch (err) {
            console.error('[PM] init() mic failed:', err);
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

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        // The peer with the lexicographically smaller userId is the polite peer — it
        // rolls back and defers when both sides send offers simultaneously.
        const polite = this.myUserId < peerId;

        // HTMLAudioElement for direct playback — no AudioContext in the path so there
        // is nothing to suspend and no user-gesture requirement for audio output.
        // Appended to a hidden DOM container so browsers don't GC or suspend detached elements.
        const audioEl = new Audio();
        audioEl.autoplay = true;
        audioEl.volume = 1;
        document.getElementById('rtc-audio-container')?.appendChild(audioEl);

        const peer: PeerState = { connection: pc, mode, audioEl, polite, makingOffer: false, connectionState: 'new', wasSpeaking: false };

        // Register early so a concurrent handleOffer doesn't create a duplicate PC.
        this.peers.set(peerId, peer);
        window.dispatchEvent(new CustomEvent('rtc:peersChanged', { detail: { count: this.peers.size } }));

        pc.ontrack = async (e) => {
            if (e.track.kind === 'audio') {
                if (!e.streams[0]) return;
                const p = this.peers.get(peerId);
                if (!p) return;
                p.audioEl.srcObject = e.streams[0];
                p.audioEl.muted = this.deafened;
                p.audioEl.play().catch(err => console.warn('[PM] audio play failed:', err));
                // Speaking detection via a separate AnalyserNode — never touches the playback path.
                try {
                    if (!this.analyserCtx) this.analyserCtx = new AudioContext();
                    if (this.analyserCtx.state === 'suspended') await this.analyserCtx.resume();
                    const analyser = this.analyserCtx.createAnalyser();
                    analyser.fftSize = 256;
                    this.analyserCtx.createMediaStreamSource(e.streams[0]).connect(analyser);
                    const data = new Uint8Array(analyser.frequencyBinCount);
                    const speakingCheck = setInterval(() => {
                        if (!this.peers.has(peerId)) { clearInterval(speakingCheck); return; }
                        analyser.getByteFrequencyData(data);
                        const avg = data.reduce((a, b) => a + b, 0) / data.length;
                        const speaking = avg > 15;
                        const p = this.peers.get(peerId);
                        if (p && speaking !== p.wasSpeaking) {
                            p.wasSpeaking = speaking;
                            window.dispatchEvent(new CustomEvent('rtc:speakingState', {
                                detail: { peerId, speaking },
                            }));
                        }
                    }, 100);
                } catch { /* speaking detection is non-critical */ }
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
            const p = this.peers.get(peerId);
            if (p) p.connectionState = pc.connectionState;
            window.dispatchEvent(new CustomEvent('rtc:connectionStateChanged', {
                detail: { peerId, state: pc.connectionState },
            }));
            if (pc.connectionState === 'failed') {
                console.warn('[PM] connection failed for', peerId, '— retrying in 1s');
                // Read mode before disconnect() removes the peer entry.
                const retryMode = this.peers.get(peerId)?.mode ?? 'voice';
                this.disconnect(peerId);
                setTimeout(() => {
                    if (this.proximityPeers.has(peerId) || this.conferencePeers.has(peerId)) {
                        this.connect(peerId, retryMode, true);
                    }
                }, 1000);
            }
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
                console.error('[PM] onnegotiationneeded error:', peerId, err);
                peer.makingOffer = false;
            } finally {
                peer.makingOffer = false;
            }
        };

        if (!receiveOnly) {
            // Adding tracks triggers onnegotiationneeded asynchronously.
            // localStream may be null if mic permission was denied — skip audio tracks gracefully.
            this.localStream?.getAudioTracks().forEach(t => pc.addTrack(t, this.localStream!));
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
            // Read stored callType so a video knock auto-connects with video tracks, not voice-only.
            const mode = this.pendingKnocks.get(fromId) ?? 'voice';
            await this.connect(fromId, mode, false, receiveOnly);
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
            await this.flushPendingCandidates(fromId, peer);
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
            await this.flushPendingCandidates(fromId, peer);
        } catch (err) {
            console.warn('[PeerManager] handleAnswer failed, disconnecting peer:', fromId, err);
            this.disconnect(fromId);
        }
    }

    private async flushPendingCandidates(fromId: string, peer: PeerState) {
        const pending = this.pendingCandidates.get(fromId);
        if (!pending) return;
        this.pendingCandidates.delete(fromId);
        for (const c of pending) {
            await peer.connection.addIceCandidate(c).catch(() => {});
        }
    }

    async handleIce(fromId: string, candidate: RTCIceCandidateInit) {
        const peer = this.peers.get(fromId);
        if (!peer) return;
        if (peer.connection.remoteDescription === null) {
            // remoteDescription not yet set — queue until handleOffer/handleAnswer flushes it.
            if (!this.pendingCandidates.has(fromId)) this.pendingCandidates.set(fromId, []);
            this.pendingCandidates.get(fromId)!.push(candidate);
            return;
        }
        try {
            await peer.connection.addIceCandidate(candidate);
        } catch (err) {
            console.warn('[PM] addIceCandidate failed:', err);
        }
    }

    disconnect(peerId: string) {
        const peer = this.peers.get(peerId);
        if (!peer) return;
        peer.audioEl.srcObject = null;
        peer.audioEl.pause();
        peer.audioEl.remove();
        peer.connection.close();
        this.peers.delete(peerId);
        this.pendingKnocks.delete(peerId);
        this.pendingCandidates.delete(peerId);
        window.dispatchEvent(new CustomEvent('rtc:peerLeft', { detail: { peerId } }));
        window.dispatchEvent(new CustomEvent('rtc:peersChanged', { detail: { count: this.peers.size } }));
    }

    async enableCamera(videoStream: MediaStream) {
        const videoTrack = videoStream.getVideoTracks()[0];
        if (!videoTrack) throw new Error('No video track in stream');

        this.localVideoStream = videoStream;
        this.cameraEnabled = true;

        for (const [peerId, peer] of this.peers.entries()) {
            try {
                peer.connection.addTrack(videoTrack, videoStream);
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
    // Walking into range no longer auto-initiates a call; use sendKnock() explicitly.
    setProximity(voicePeers: string[], _videoPeers: string[]) {
        this.proximityPeers = new Set(voicePeers);

        // Cancel pending knocks for peers who left range.
        for (const [peerId] of this.pendingKnocks) {
            if (!voicePeers.includes(peerId)) {
                this.pendingKnocks.delete(peerId);
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

        // Emit connected group. nearbyPeers must exclude already-connected and
        // pending-knock peers so the UI never shows call buttons for them — showing
        // those buttons is what triggers re-knocking and the infinite-loop pattern.
        const connectedGroup = voicePeers.filter(p => this.peers.has(p));
        const nearbyCallable: string[] = [];
        for (const peerId of voicePeers) {
            if (this.peers.has(peerId)) continue;
            if (this.pendingKnocks.has(peerId)) continue;
            nearbyCallable.push(peerId);
        }
        window.dispatchEvent(new CustomEvent('rtc:proximityGroup', {
            detail: { members: connectedGroup, nearbyPeers: nearbyCallable },
        }));
    }

    // Explicit call request — called by UI buttons, not proximity automation.
    sendKnock(peerId: string, callType: 'voice' | 'video') {
        const mode: PeerMode = callType === 'video' ? 'video' : 'voice';
        this.pendingKnocks.set(peerId, mode);
        this.ws.send(JSON.stringify({
            type: 'rtc:knock',
            to: peerId,
            fromName: this.myUsername,
            callType,
        }));
        window.dispatchEvent(new CustomEvent('rtc:knockSent', { detail: { peerId } }));
    }

    cancelKnock(peerId: string) {
        if (!this.pendingKnocks.has(peerId)) return;
        this.pendingKnocks.delete(peerId);
        window.dispatchEvent(new CustomEvent('rtc:knockCancelled', { detail: { peerId } }));
    }

    // Called when we receive rtc:knock from a remote peer.
    // Always returns false — the receiver must explicitly Accept or Deny via the toast.
    handleKnock(_fromId: string): false {
        return false;
    }

    async acceptIncomingKnock(fromId: string, callType: 'voice' | 'video' = 'voice') {
        // IMPORTANT: this method must NOT call sendKnock() or modify pendingKnocks in
        // any way — doing so is what caused the knock→accept→knock infinite loop.
        try {
            const mode: PeerMode = callType;

            if (mode === 'video') {
                if (!this.localVideoStream ||
                        this.localVideoStream.getVideoTracks()[0]?.readyState === 'ended') {
                    try {
                        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                        await this.enableCamera(stream);
                    } catch (err) {
                        console.warn('[PM] camera failed, continuing as video without local cam:', err);
                        // Don't fall back to voice — still connect as video so we can
                        // RECEIVE the other person's video even without sending ours.
                    }
                } else {
                    // Stream already active — connect() will add the track from localVideoStream.
                    this.cameraEnabled = true;
                }
            }

            // Connect as non-initiator before sending accept so our PC is ready when
            // the initiator's offer arrives (or our own onnegotiationneeded fires first).
            await this.connect(fromId, mode, false);
            this.ws.send(JSON.stringify({ type: 'rtc:knock-accept', to: fromId }));
        } catch (err) {
            console.error('[PM] acceptIncomingKnock FATAL:', err);
        }
    }

    denyIncomingKnock(fromId: string) {
        this.ws.send(JSON.stringify({ type: 'rtc:knock-deny', to: fromId }));
    }

    // Called when the peer we knocked accepted us.
    async handleKnockAccepted(fromId: string) {
        const mode = this.pendingKnocks.get(fromId) ?? 'voice';
        this.pendingKnocks.delete(fromId);

        const existingPeer = this.peers.get(fromId);
        if (existingPeer) {
            // handleOffer's fallback already claimed the peer slot (responder sent its offer
            // before rtc:knock-accept reached us). Don't call connect() — it would bail.
            // Instead add video tracks directly so onnegotiationneeded sends the upgrade offer.
            if (mode === 'video' && this.localVideoStream) {
                this.localVideoStream.getVideoTracks().forEach(t =>
                    existingPeer.connection.addTrack(t, this.localVideoStream!)
                );
            }
            return;
        }

        // No existing peer — claim the slot as initiator.
        // Call connect() immediately (no setTimeout) so peers.set() claims the slot
        // synchronously before any concurrent handleOffer can grab it first.
        this.connect(fromId, mode, true);
    }

    // Called when the peer we knocked denied us.
    handleKnockDenied(fromId: string) {
        this.pendingKnocks.delete(fromId);
        window.dispatchEvent(new CustomEvent('rtc:knockDenied', { detail: { peerId: fromId } }));
    }

    setVolume(peerId: string, distance: number) {
        const peer = this.peers.get(peerId);
        if (!peer) return;
        peer.audioEl.volume = Math.max(0, 1 - distance / VOICE_RADIUS);
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
            peer.audioEl.muted = deafened;
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

    getPeerConnectionState(peerId: string): RTCPeerConnectionState | null {
        return this.peers.get(peerId)?.connectionState ?? null;
    }

    hasMic(): boolean { return !!this.localStream; }
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
        this.analyserCtx?.close();
        this.analyserCtx = null;
    }
}
