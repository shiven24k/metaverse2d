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
        { 
            urls: 'stun:stun.l.google.com:19302' 

        },
        {
            urls: "stun:stun.relay.metered.ca:80",
        },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "5fb5154d7caa476fffa59a3d",
            credential: "1ujpQgNVUvtMuscG",
        },
        {
            urls: "turn:global.relay.metered.ca:80?transport=tcp",
            username: "5fb5154d7caa476fffa59a3d",
            credential: "1ujpQgNVUvtMuscG",
        },
        {
            urls: "turn:global.relay.metered.ca:443",
            username: "5fb5154d7caa476fffa59a3d",
            credential: "1ujpQgNVUvtMuscG",
        },
        {
            urls: "turns:global.relay.metered.ca:443?transport=tcp",
            username: "5fb5154d7caa476fffa59a3d",
            credential: "1ujpQgNVUvtMuscG",
        },
    ];
    private localStream: MediaStream | null = null;
    private audioCtx: AudioContext | null = null;
    private cameraEnabled = false;
    private micEnabled = true;

    constructor(private ws: WebSocket) { }

    async init() {
        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.audioCtx = new AudioContext();
            const res = await fetch('/api/v1/turn-credentials');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data.iceServers) && data.iceServers.length > 0) {
                    this.iceServers = data.iceServers;
                }
            }
        } catch (err) {
            // fallback to STUN only
            console.warn('[PeerManager] getUserMedia failed:', err);

        }

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            this.audioCtx = new AudioContext();
        } catch (err) {
            console.warn('[PeerManager] getUserMedia failed:', err);
        }
    }

    async connect(peerId: string, mode: PeerMode = 'voice', isInitiator = true) {
        if (this.peers.has(peerId)) return;
        if (!this.localStream || !this.audioCtx) return;

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });

        this.localStream.getAudioTracks().forEach(t => pc.addTrack(t, this.localStream!));
        if (mode === 'video') {
            this.localStream.getVideoTracks().forEach(t => pc.addTrack(t, this.localStream!));
        }

        const gainNode = this.audioCtx.createGain();
        gainNode.connect(this.audioCtx.destination);

        pc.ontrack = (e) => {
            if (e.track.kind === 'audio') {
                this.audioCtx!.createMediaStreamSource(e.streams[0]).connect(gainNode);
            } else {
                window.dispatchEvent(new CustomEvent('rtc:remoteVideo', {
                    detail: { peerId, stream: e.streams[0] },
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

        if (isInitiator) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            this.ws.send(JSON.stringify({ type: 'rtc:offer', to: peerId, sdp: offer }));
        }
    }

    async handleOffer(fromId: string, sdp: RTCSessionDescriptionInit) {
        await this.connect(fromId, 'voice', false);
        const peer = this.peers.get(fromId);
        if (!peer) return;
        await peer.connection.setRemoteDescription(sdp);
        const answer = await peer.connection.createAnswer();
        await peer.connection.setLocalDescription(answer);
        this.ws.send(JSON.stringify({ type: 'rtc:answer', to: fromId, sdp: answer }));
    }

    async handleAnswer(fromId: string, sdp: RTCSessionDescriptionInit) {
        const peer = this.peers.get(fromId);
        if (peer) await peer.connection.setRemoteDescription(sdp);
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

    setProximity(voicePeers: string[], videoPeers: string[]) {
        this.proximityPeers = new Set(voicePeers);

        for (const peerId of voicePeers) {
            if (!this.peers.has(peerId)) {
                const mode = videoPeers.includes(peerId) && this.cameraEnabled ? 'video' : 'voice';
                this.connect(peerId, mode, true);
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

    toggleCamera(enabled: boolean) {
        this.cameraEnabled = enabled;
        this.localStream?.getVideoTracks().forEach(t => { t.enabled = enabled; });
    }

    getMicEnabled() { return this.micEnabled; }
    getCameraEnabled() { return this.cameraEnabled; }
    getLocalStream() { return this.localStream; }
    getConnectedPeerCount() { return this.peers.size; }

    destroy() {
        for (const peerId of [...this.peers.keys()]) this.disconnect(peerId);
        this.localStream?.getTracks().forEach(t => t.stop());
        this.localStream = null;
        this.audioCtx?.close();
        this.audioCtx = null;
    }
}
