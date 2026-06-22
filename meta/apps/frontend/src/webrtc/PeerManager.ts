import { VOICE_RADIUS } from './constants';

type PeerMode = 'voice' | 'video';

interface PeerState {
    connection: RTCPeerConnection;
    mode: PeerMode;
    gainNode: GainNode;
}

export class PeerManager {
    private peers = new Map<string, PeerState>();
    private conferencePeers = new Set<string>();
    private proximityPeers = new Set<string>();
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

    constructor(private ws: WebSocket) {}

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

    async connect(peerId: string, mode: PeerMode = 'voice', isInitiator = true) {
        if (this.peers.has(peerId)) return;
        if (!this.localStream || !this.audioCtx) return;

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });

        // Add audio tracks
        this.localStream.getAudioTracks().forEach(t => pc.addTrack(t, this.localStream!));

        // Add video tracks if camera is already on
        if (this.localVideoStream) {
            this.localVideoStream.getVideoTracks().forEach(t => pc.addTrack(t, this.localVideoStream!));
        }

        const gainNode = this.audioCtx.createGain();
        gainNode.connect(this.audioCtx.destination);

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

        this.peers.set(peerId, { connection: pc, mode, gainNode });

        // onnegotiationneeded handles renegotiation when tracks are added later (e.g. camera on).
        // We use a flag so it doesn't fire during the initial setup below.
        let readyForRenegotiation = false;
        pc.onnegotiationneeded = async () => {
            if (!readyForRenegotiation) return;
            if (pc.signalingState !== 'stable') return;
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.ws.send(JSON.stringify({ type: 'rtc:offer', to: peerId, sdp: offer }));
            } catch (err) {
                // Likely a hardware encoder failure (SIGILL path, AVX/SSE4 unsupported).
                // Disconnect cleanly so the broken connection doesn't hang.
                console.warn('[PeerManager] renegotiation failed, disconnecting peer:', peerId, err);
                this.disconnect(peerId);
            }
        };

        if (isInitiator) {
            try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                this.ws.send(JSON.stringify({ type: 'rtc:offer', to: peerId, sdp: offer }));
            } catch (err) {
                console.warn('[PeerManager] initial offer failed, disconnecting peer:', peerId, err);
                this.disconnect(peerId);
                return;
            }
        }

        // Allow renegotiation after initial setup is done
        readyForRenegotiation = true;
    }

    async handleOffer(fromId: string, sdp: RTCSessionDescriptionInit) {
        if (!this.peers.has(fromId)) {
            await this.connect(fromId, 'voice', false);
        }
        const peer = this.peers.get(fromId);
        if (!peer) return;
        try {
            await peer.connection.setRemoteDescription(sdp);
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
        window.dispatchEvent(new CustomEvent('rtc:peerLeft', { detail: { peerId } }));
    }

    // Called when camera is turned on — adds video track to all active connections.
    // Each connection's onnegotiationneeded fires → new offer → answer cycle.
    // Throws if the video track itself cannot be obtained (caller should surface this to the user).
    async enableCamera(videoStream: MediaStream) {
        const videoTrack = videoStream.getVideoTracks()[0];
        if (!videoTrack) throw new Error('No video track in stream');

        this.localVideoStream = videoStream;
        this.cameraEnabled = true;

        for (const [peerId, peer] of this.peers.entries()) {
            try {
                peer.connection.addTrack(videoTrack, videoStream);
                // onnegotiationneeded fires automatically after addTrack
            } catch (err) {
                // addTrack can fail if the codec/encoder path is unsupported (SIGILL risk).
                // Disconnect this peer cleanly rather than leaving the connection broken.
                console.warn('[PeerManager] addTrack failed for peer', peerId, err);
                this.disconnect(peerId);
            }
        }
    }

    // Called when camera is turned off — removes video senders from all connections.
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

    setProximity(voicePeers: string[], videoPeers: string[]) {
        this.proximityPeers = new Set(voicePeers);

        for (const peerId of voicePeers) {
            if (!this.peers.has(peerId)) {
                const mode = videoPeers.includes(peerId) && this.cameraEnabled ? 'video' : 'voice';
                // Defer so RTCPeerConnection setup doesn't block the animation frame
                setTimeout(() => this.connect(peerId, mode, true), 0);
            }
        }

        for (const peerId of [...this.peers.keys()]) {
            if (!voicePeers.includes(peerId) && !this.conferencePeers.has(peerId)) {
                this.disconnect(peerId);
            }
        }
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
            if (!this.proximityPeers.has(peerId)) this.disconnect(peerId);
        }
        this.conferencePeers.clear();
    }

    toggleMic(enabled: boolean) {
        this.micEnabled = enabled;
        this.localStream?.getAudioTracks().forEach(t => { t.enabled = enabled; });
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
