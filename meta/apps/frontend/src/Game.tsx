import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { ArrowLeft, BookOpen, Trophy, Pencil, Coins, Settings, Bell } from 'lucide-react';
import { KanbanPanel } from './KanbanPanel';
import { SpaceSettingsModal } from './SpaceSettingsModal';
import { useGameStore } from './store/gameStore';
import { GameDock } from './components/game/GameDock';
import { ProximityChatPanel } from './components/game/ProximityChatPanel';
import { NotificationPanel } from './components/game/NotificationPanel';
import { EMOTE_FRAMES, EMOTE_CROP, ALL_EMOTE_IDS, EMOTES } from './constants/emotes';
import type { ProximityChatMessage, AppNotification, SpaceElement, PlacedItem, SpacePortal, NPC } from './types/game';
import { PeerManager } from './webrtc/PeerManager';
import { VOICE_RADIUS, VIDEO_RADIUS } from './webrtc/constants';
import { VoiceToolbar } from './components/game/VoiceToolbar';

// ── PixelAvatar — CSS pixel art character, ported from design system ──────────


function PixelAvatar({ avatarId, size = 28, ring }: { avatarId?: string; size?: number; ring?: string }) {
    // Sheet: 256×96, 8 cols × 2 rows, each frame 32×48. Front-face idle = col 0, row 0.
    const id = avatarId ?? 'avatar-intern';
    const frameW = 32, frameH = 48;
    const scale = size / frameH;
    const displayW = frameW * scale;
    return (
        <div style={{ width: displayW, height: size, position: 'relative', flexShrink: 0, overflow: 'hidden', outline: ring ? `2px solid ${ring}` : undefined, borderRadius: ring ? 4 : 0 }}>
            <img
                src={`/avatars/${id}.png`}
                alt={id}
                style={{
                    width: 256 * scale,
                    height: 96 * scale,
                    imageRendering: 'pixelated',
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    display: 'block',
                }}
            />
        </div>
    );
}

interface DragItem { type: 'inventory-item' | 'element'; itemId?: string; elementId?: string; name?: string; width: number; height: number; imageUrl: string; }

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000';
const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const ASSETS_URL = import.meta.env.VITE_ASSETS_URL || '';

const TILE_IMAGE: Record<string, string> = {
    'el-grass':          `${ASSETS_URL}/tiles/grass.png`,
    'el-dirt':           `${ASSETS_URL}/tiles/dirt.png`,
    'el-water':          `${ASSETS_URL}/tiles/water.png`,
    'el-wall':           `${ASSETS_URL}/tiles/wall.png`,
    'el-path':           `${ASSETS_URL}/tiles/path.png`,
    'el-tree':           `${ASSETS_URL}/tiles/tree.png`,
    'el-fence':          `${ASSETS_URL}/tiles/fence.png`,
    'el-flower':         `${ASSETS_URL}/tiles/flower.png`,
    'el-sand':           `${ASSETS_URL}/tiles/sand.png`,
    'el-snow':           `${ASSETS_URL}/tiles/snow.png`,
    'el-lava':           `${ASSETS_URL}/tiles/lava.png`,
    'el-cobblestone':    `${ASSETS_URL}/tiles/cobblestone.png`,
    'el-wood-floor':     `${ASSETS_URL}/tiles/wood-floor.png`,
    'el-cave-floor':     `${ASSETS_URL}/tiles/cave-floor.png`,
    'el-bush':           `${ASSETS_URL}/tiles/bush.png`,
    'el-cactus':         `${ASSETS_URL}/tiles/cactus.png`,
    'el-rock':           `${ASSETS_URL}/tiles/rock.png`,
    'el-mushroom':       `${ASSETS_URL}/tiles/mushroom.png`,
    'el-pine-tree':      `${ASSETS_URL}/tiles/pine-tree.png`,
    'el-shallow-water':  `${ASSETS_URL}/tiles/shallow-water.png`,
    'el-waterfall':      `${ASSETS_URL}/tiles/waterfall.png`,
    'el-brick-wall':     `${ASSETS_URL}/tiles/brick-wall.png`,
    'el-window':         `${ASSETS_URL}/tiles/window.png`,
    'el-door':           `${ASSETS_URL}/tiles/door.png`,
    'el-roof':           `${ASSETS_URL}/tiles/roof.png`,
    'el-chest':          `${ASSETS_URL}/tiles/chest.png`,
    'el-office-carpet':  `${ASSETS_URL}/tiles/office-carpet.png`,
    'el-office-floor':   `${ASSETS_URL}/tiles/office-floor.png`,
    'el-glass-wall':     `${ASSETS_URL}/tiles/glass-wall.png`,
};

const ITEM_IMAGE: Record<string, string> = {
    'item-sofa':             `${ASSETS_URL}/items/sofa.png`,
    'item-table':            `${ASSETS_URL}/items/table.png`,
    'item-chair':            `${ASSETS_URL}/items/chair.png`,
    'item-rug':              `${ASSETS_URL}/items/rug.png`,
    'item-plant':            `${ASSETS_URL}/items/plant.png`,
    'item-lamp':             `${ASSETS_URL}/items/lamp.png`,
    'item-painting':         `${ASSETS_URL}/items/painting.png`,
    'item-bookshelf':        `${ASSETS_URL}/items/bookshelf.png`,
    'item-crystal':          `${ASSETS_URL}/items/crystal.png`,
    'item-throne':           `${ASSETS_URL}/items/throne.png`,
    'item-bed':              `${ASSETS_URL}/items/bed.png`,
    'item-counter':          `${ASSETS_URL}/items/counter.png`,
    'item-barrel':           `${ASSETS_URL}/items/barrel.png`,
    'item-sign':             `${ASSETS_URL}/items/sign.png`,
    'item-campfire':         `${ASSETS_URL}/items/campfire.png`,
    'item-fountain':         `${ASSETS_URL}/items/fountain.png`,
    'item-office-desk':      `${ASSETS_URL}/items/office-desk.png`,
    'item-office-chair':     `${ASSETS_URL}/items/office-chair.png`,
    'item-computer':         `${ASSETS_URL}/items/computer.png`,
    'item-whiteboard':       `${ASSETS_URL}/items/whiteboard.png`,
    'item-coffee-machine':   `${ASSETS_URL}/items/coffee-machine.png`,
    'item-filing-cabinet':   `${ASSETS_URL}/items/filing-cabinet.png`,
    'item-meeting-table':    `${ASSETS_URL}/items/meeting-table.png`,
    'item-vending-machine':  `${ASSETS_URL}/items/vending-machine.png`,
    'item-office-printer':   `${ASSETS_URL}/items/office-printer.png`,
    'item-armchair':         `${ASSETS_URL}/items/armchair.png`,
    'item-coffee-table':     `${ASSETS_URL}/items/coffee-table.png`,
    'item-copier':           `${ASSETS_URL}/items/copier.png`,
    'item-corkboard':        `${ASSETS_URL}/items/corkboard.png`,
    'item-desk-phone':       `${ASSETS_URL}/items/desk-phone.png`,
    'item-dual-monitor':     `${ASSETS_URL}/items/dual-monitor.png`,
    'item-flip-chart':       `${ASSETS_URL}/items/flip-chart.png`,
    'item-kitchen-counter':  `${ASSETS_URL}/items/kitchen-counter.png`,
    'item-laptop':           `${ASSETS_URL}/items/laptop.png`,
    'item-microwave':        `${ASSETS_URL}/items/microwave.png`,
    'item-mini-fridge':      `${ASSETS_URL}/items/mini-fridge.png`,
    'item-phone-booth':      `${ASSETS_URL}/items/phone-booth.png`,
    'item-reception-desk':   `${ASSETS_URL}/items/reception-desk.png`,
    'item-recycling-bin':    `${ASSETS_URL}/items/recycling-bin.png`,
    'item-server-rack':      `${ASSETS_URL}/items/server-rack.png`,
    'item-standing-desk':    `${ASSETS_URL}/items/standing-desk.png`,
    'item-tall-plant':       `${ASSETS_URL}/items/tall-plant.png`,
    'item-trash-bin':        `${ASSETS_URL}/items/trash-bin.png`,
    'item-wall-tv':          `${ASSETS_URL}/items/wall-tv.png`,
    'item-water-cooler':     `${ASSETS_URL}/items/water-cooler.png`,
};

const ALL_TILE_PATHS = [...Object.values(TILE_IMAGE), ...Object.values(ITEM_IMAGE)];


interface InventoryItem {
    id: string;
    itemId: string;
    name: string;
    category: string;
    rarity: string;
    imageUrl: string;
    width: number;
    height: number;
    blocking: boolean;
    quantity: number;
}

interface ElementType {
    id: string;
    imageUrl: string;
    width: number;
    height: number;
    static: boolean;
    blocking: boolean;
}

type SpaceEdge = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';


interface QuestInfo {
    id: string;
    title: string;
    description: string;
    goalCount: number;
    rewardType: string;
    rewardValue: string;
    progress: number;
    completed: boolean;
}

interface GuestbookMsg { id: string; userId: string; username: string; message: string; createdAt: string; }

interface EmoteBubble {
    userId: string;
    emoji: string;
    x: number;
    y: number;
    createdAt: number;
}



function RemoteVideoTile({ peerId, stream, username, connectionState }: {
    peerId: string;
    stream: MediaStream;
    username?: string;
    connectionState?: RTCPeerConnectionState;
}) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const [overlayVisible, setOverlayVisible] = useState(true);
    const [overlayFading, setOverlayFading] = useState(false);

    useEffect(() => {
        const el = videoRef.current;
        if (!el || !stream) return;
        const videoTrack = stream.getVideoTracks()[0];
        const attach = () => {
            el.srcObject = stream;
            el.play().catch(err => console.warn('[VideoTile] play failed:', err));
        };
        if (videoTrack && videoTrack.readyState === 'live') {
            attach();
        } else if (videoTrack) {
            videoTrack.addEventListener('unmute', attach, { once: true });
        } else {
            attach();
        }
        return () => { el.srcObject = null; };
    }, [stream]);

    useEffect(() => {
        if (connectionState === 'connected') {
            setOverlayFading(false);
            setOverlayVisible(true);
            const fadeTimer = setTimeout(() => setOverlayFading(true), 1200);
            const hideTimer = setTimeout(() => setOverlayVisible(false), 1800);
            return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
        } else if (connectionState === 'failed' || connectionState === 'disconnected') {
            setOverlayFading(false);
            setOverlayVisible(true);
        }
    }, [connectionState]);

    const overlayLabel =
        connectionState === 'connected' ? '✓ Connected' :
        connectionState === 'failed' ? '✗ Failed' :
        connectionState === 'disconnected' ? 'Disconnected' :
        'Connecting…';

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            aspectRatio: '16/9',
            borderRadius: 8,
            overflow: 'hidden',
            background: '#111',
            border: '2px solid rgba(139,92,246,0.6)',
        }}>
            <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
            />
            {overlayVisible && connectionState && connectionState !== 'closed' && (
                <div style={{
                    position: 'absolute', inset: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: connectionState === 'failed' || connectionState === 'disconnected'
                        ? 'rgba(185,28,28,0.6)' : 'rgba(0,0,0,0.55)',
                    opacity: overlayFading ? 0 : 1,
                    transition: 'opacity 0.6s ease',
                    pointerEvents: 'none',
                }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: '#fff',
                        textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
                        {overlayLabel}
                    </span>
                </div>
            )}
            <div style={{
                position: 'absolute', bottom: 0, left: 0, right: 0,
                padding: '3px 8px',
                background: 'rgba(139,92,246,0.75)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
                <span style={{
                    fontSize: 11, fontWeight: 600, color: '#fff',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}>
                    {username || peerId.slice(0, 8)}
                </span>
                <span style={{ fontSize: 10, lineHeight: 1 }}>🎙️</span>
            </div>
        </div>
    );
}


const ArenaInner = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = useAuthStore((s) => s.token);
    const spaceId = searchParams.get('spaceId') || '';

    const isGuest = useAuthStore((s) => s.isGuest);
    const clearAuth = useAuthStore((s) => s.clearAuth);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttempts = useRef(0);
    const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const intentionalCloseRef = useRef(false);
    const spaceIdRef = useRef(spaceId);
    spaceIdRef.current = spaceId;
    const tokenRef = useRef(token);
    tokenRef.current = token;
    const [reconnecting, setReconnecting] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessageRef = useRef<(msg: any) => void>(() => {});


    const [currentUser, setCurrentUser] = useState<{ x: number; y: number; userId: string; username: string; avatarId?: string } | null>(null);
    const [users, setUsers] = useState(new Map<string, { x: number; y: number; userId: string; username: string; avatarId?: string }>());
    const usersRef = useRef(new Map<string, { x: number; y: number; userId: string; username: string; avatarId?: string }>());
    const peerManagerRef = useRef<PeerManager | null>(null);
    const currentConferenceRoomRef = useRef<string | null>(null);
    const currentBroadcastZoneRef = useRef<string | null>(null);
    const selfVideoRef = useRef<HTMLVideoElement | null>(null);
    const localVideoStreamRef = useRef<MediaStream | null>(null);
    const [micEnabled, setMicEnabled] = useState(true);
    const [cameraEnabled, setCameraEnabled] = useState(false);
    const [deafened, setDeafened] = useState(false);
    const [connectedPeers, setConnectedPeers] = useState(0);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'unknown'>('unknown');
    // Knock-to-join: incoming knock requests (other user wants to join our call)
    const [knockRequests, setKnockRequests] = useState<{ id: string; fromId: string; fromName: string; callType?: 'voice' | 'video' }[]>([]);
    // Proximity group: userIds of all currently connected proximity peers
    const [proximityGroup, setProximityGroup] = useState<string[]>([]);
    // All peers currently in voice range (connected or not)
    const [nearbyPeerIds, setNearbyPeerIds] = useState<string[]>([]);
    const [knockPendingPeerIds, setKnockPendingPeerIds] = useState<Set<string>>(new Set());
    // Live MediaStream objects must NOT live in React state — React can proxy/clone
    // objects during reconciliation, breaking the live stream reference.
    // Instead, keep the Map in a ref and drive re-renders with a plain string[] of keys.
    const remoteStreamsRef = useRef(new Map<string, MediaStream>());
    const [remotePeerIds, setRemotePeerIds] = useState<string[]>([]);
    const knockPendingPeerIdsRef = useRef<Set<string>>(new Set());
    const peerConnectionStatesRef = useRef(new Map<string, RTCPeerConnectionState>());
    const [peerConnectionStates, setPeerConnectionStates] = useState(new Map<string, RTCPeerConnectionState>());
    const rtcBufferRef = useRef<Array<{ type: string; data: unknown }>>([]);
    const speakingPeerIdsRef = useRef<Set<string>>(new Set());
    const [speakingPeerIds, setSpeakingPeerIds] = useState<Set<string>>(new Set());
    const videoPanelRef = useRef<HTMLDivElement>(null);
    const [videoPanelHeight, setVideoPanelHeight] = useState(0);
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState('');

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
    const [spaceElements, setSpaceElements] = useState<SpaceElement[]>([]);
    const [editMode, setEditMode] = useState(false);
    const [spaceDims, setSpaceDims] = useState<{ width: number; height: number }>({ width: 20, height: 20 });

    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [selectedElement, setSelectedElement] = useState<ElementType | null>(null);
    const [elementTypes, setElementTypes] = useState<ElementType[]>([]);
    const [elementsLoading, setElementsLoading] = useState(false);
    const [placing, setPlacing] = useState(false);
    const [placementLayer, setPlacementLayer] = useState<'FLOOR' | 'WALL'>('FLOOR');
    const [eraserMode, setEraserMode] = useState(false);

    const [showGuestbook, setShowGuestbook] = useState(false);
    const [gbMessages, setGbMessages] = useState<GuestbookMsg[]>([]);
    const [gbMessage, setGbMessage] = useState('');
    const [gbLoading, setGbLoading] = useState(false);
    const [spaceOwnerId, setSpaceOwnerId] = useState('');
    const spaceOwnerIdRef = useRef('');
    const [showBoard, setShowBoard] = useState(false);
    const [boardWsFlag, setBoardWsFlag] = useState(0);
    const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
    const [interactions, setInteractions] = useState<{ id: string; text: string; x: number; y: number; createdAt: number }[]>([]);
    const [showQuests, setShowQuests] = useState(false);
    const [quests, setQuests] = useState<QuestInfo[]>([]);
    const [questsLoading, setQuestsLoading] = useState(false);
    const [editorError, setEditorError] = useState('');
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
    const saveStatusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [toasts, setToasts] = useState<{ id: string; message: string; type: 'info' | 'success' | 'warning' }[]>([]);
    const addToast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'info') => {
        const id = Math.random().toString(36).slice(2);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);
    const [spaceName, setSpaceName] = useState('');
    const [walletCoins, setWalletCoins] = useState<number | null>(null);
    const [showNewMap, setShowNewMap] = useState(false);
    const [newMapName, setNewMapName] = useState('');
    const [newMapDims, setNewMapDims] = useState('20x20');
    const [newMapTemplate, setNewMapTemplate] = useState('');
    const [mapTemplates, setMapTemplates] = useState<{ id: string; name: string; dimensions: string }[]>([]);
    const [creatingMap, setCreatingMap] = useState(false);
    const [renderTick, setRenderTick] = useState(0);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [selectionRect, setSelectionRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    const [selectedPlacedGroup, setSelectedPlacedGroup] = useState<{ type: 'element' | 'item'; id: string }[]>([]);
    const [chatBubbles, setChatBubbles] = useState<{ id: string; username: string; message: string; x: number; y: number; createdAt: number }[]>([]);

    // ── Proximity chat ────────────────────────────────────────────────────────
    const [isDesktop, setIsDesktop] = useState(() => window.innerWidth >= 1024);
    const lastProximityChatAtRef = useRef<number>(0);

    const [pingsSent, setPingsSent] = useState<Set<string>>(new Set());

    const {
        proximityChatMessages, proximityChatRoomId, proximityChatMembers,
        proximityChatUnread, showProximityChat, proximityChatIsTyping,
        notifications, unreadCount, showNotifPanel, urgentBanner, notifToasts,
        activeEmotes, myActiveEmote, showEmotePicker,
    } = useGameStore();
    const [playerPopup, setPlayerPopup] = useState<{ userId: string; username: string; avatarId?: string; x: number; y: number } | null>(null);
    const [playerPopupVisible, setPlayerPopupVisible] = useState(false);
    const [showGiftModal, setShowGiftModal] = useState(false);
    const [giftTarget, setGiftTarget] = useState<{ userId: string; username: string } | null>(null);
    const [giftSending, setGiftSending] = useState(false);
    const [giftMsg, setGiftMsg] = useState("");
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [avatars, setAvatars] = useState<{ id: string; imageUrl: string; name: string }[]>([]);
    const [savingAvatar, setSavingAvatar] = useState(false);
    const [showSpaceSettings, setShowSpaceSettings] = useState(false);
    const [spaceIsPrivate, setSpaceIsPrivate] = useState(false);

    // ── Interactable objects ──────────────────────────────────────────────────
    const [interactionPopup, setInteractionPopup] = useState<{
        type: 'sign' | 'chest' | 'campfire' | 'fountain';
        title: string;
        text: string;
    } | null>(null);
    const campfireWarmUntil = useRef<number>(0);
    // Sign editing in edit mode
    const [signEditing, setSignEditing] = useState<{ placedItemId: string; text: string } | null>(null);

    // ── NPCs ─────────────────────────────────────────────────────────────────
    const [npcs, setNpcs] = useState<NPC[]>([]);
    const npcsRef = useRef<NPC[]>([]);
    const [npcDialogue, setNpcDialogue] = useState<{ npc: NPC; idx: number } | null>(null);
    // Per-NPC smooth tween: fromX/Y → toX/Y over `duration` ms
    const npcAnims = useRef<Map<string, { fromX: number; fromY: number; toX: number; toY: number; startTime: number; duration: number }>>(new Map());
    // Per-NPC facing direction (sprite column: down=0, left=1, right=2, up=3)
    const npcFacing = useRef<Map<string, number>>(new Map());

    // ── NPC editor ───────────────────────────────────────────────────────────
    const [selectedNpcId, setSelectedNpcId] = useState<string | null>(null);
    const [showNpcModal, setShowNpcModal] = useState(false);
    const [npcForm, setNpcForm] = useState<{ id?: string; name: string; sprite: string; dialogues: [string, string, string]; x: number; y: number; motionType: 'STATIC' | 'PATROL' | 'WANDER'; wanderRadius: number }>({ name: '', sprite: 'avatar-intern', dialogues: ['', '', ''], x: 0, y: 0, motionType: 'PATROL', wanderRadius: 3 });
    const [savingNpc, setSavingNpc] = useState(false);
    const [npcPickingPos, setNpcPickingPos] = useState(false);
    const npcDragRef = useRef<{ id: string } | null>(null);

    const npcPosBlocked = useMemo(() => {
        for (const e of spaceElements) {
            if (!e.element.blocking) continue;
            if (npcForm.x >= e.x && npcForm.x < e.x + e.element.width &&
                npcForm.y >= e.y && npcForm.y < e.y + e.element.height) return true;
        }
        for (const p of placedItems) {
            if (!p.item.blocking) continue;
            if (npcForm.x >= p.x && npcForm.x < p.x + p.item.width &&
                npcForm.y >= p.y && npcForm.y < p.y + p.item.height) return true;
        }
        return false;
    }, [spaceElements, placedItems, npcForm.x, npcForm.y]);

    // ── Portals ──────────────────────────────────────────────────────────────
    const [portals, setPortals] = useState<SpacePortal[]>([]);
    const portalsRef = useRef<SpacePortal[]>([]);
    const [portalTravel, setPortalTravel] = useState<SpacePortal | null>(null);
    // Editor portal form
    const [newPortalFromEdge, setNewPortalFromEdge] = useState<SpaceEdge>('NORTH');
    const [newPortalToEdge, setNewPortalToEdge] = useState<SpaceEdge>('SOUTH');
    const [newPortalToSpaceId, setNewPortalToSpaceId] = useState('');
    const [newPortalLabel, setNewPortalLabel] = useState('Portal');
    const [savingPortal, setSavingPortal] = useState(false);
    const [allSpaces, setAllSpaces] = useState<{ id: string; name: string }[]>([]);
    const [showResizeModal, setShowResizeModal] = useState(false);
    const [resizeW, setResizeW] = useState('');
    const [resizeH, setResizeH] = useState('');
    const [showExpandModal, setShowExpandModal] = useState(false);
    const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
    const [clearingAll, setClearingAll] = useState(false);
    const [spaceHeld, setSpaceHeld] = useState(false);
    useEffect(() => { portalsRef.current = portals; }, [portals]);

    // ── Activities ───────────────────────────────────────────────────────────
    type Activity = 'sitting' | 'working' | null;
    const [myActivity, setMyActivity] = useState<Activity>(null);
    const myActivityRef = useRef<Activity>(null);
    const [othersActivity, setOthersActivity] = useState<Map<string, Activity>>(new Map());
    useEffect(() => { myActivityRef.current = myActivity; }, [myActivity]);

    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
    const imageLoadFailed = useRef<Set<string>>(new Set());
    const imageLoadPending = useRef<Set<string>>(new Set());
    const rerender = useCallback(() => setRenderTick(t => t + 1), []);
    // npcsRef.current is the single source of truth for NPC positions; it is updated directly
    // on npc-moved so canvas redraws are driven by the rAF tick (rerender) rather than React
    // state changes. setNpcs / npcs state is kept only for editor-panel JSX.

    const preloadImages = useCallback((urls: string[]) => {
        urls.forEach(url => {
            if (url && !imageCache.current.has(url)) {
                const img = new Image();
                const isLocal = url.startsWith(ASSETS_URL + '/tiles/') || url.startsWith(ASSETS_URL + '/items/') || url.startsWith('/tiles/') || url.startsWith('/items/');
                const fullUrl = url.startsWith('http') ? url : (isLocal ? url : `${API}${url}`);
                img.onload = () => {
                    rerender();
                };
                img.onerror = () => {
                    console.warn('Image failed to load:', fullUrl);
                };
                img.src = fullUrl;
                imageCache.current.set(url, img);
            }
        });
    }, [rerender]);

    const preloadAvatarImage = useCallback((avatarId: string | undefined) => {
        if (!avatarId) return;
        const url = `/avatars/${avatarId}.png`;
        if (imageCache.current.has(url) || imageLoadFailed.current.has(url) || imageLoadPending.current.has(url)) return;
        imageLoadPending.current.add(url);
        const img = new Image();
        img.onload = () => {
            imageCache.current.set(url, img);
            imageLoadPending.current.delete(url);
            rerender();
        };
        img.onerror = () => {
            imageLoadPending.current.delete(url);
            imageLoadFailed.current.add(url);
            rerender();
        };
        img.src = url;
    }, [rerender]);

    const preloadEmoteImage = useCallback((avatarId: string | undefined, emoteId: string) => {
        if (!avatarId) return;
        const url = `/emotes/${avatarId.replace('avatar-', '')}/${emoteId}.png`;
        if (imageCache.current.has(url) || imageLoadFailed.current.has(url) || imageLoadPending.current.has(url)) return;
        imageLoadPending.current.add(url);
        const img = new Image();
        img.onload = () => {
            imageCache.current.set(url, img);
            imageLoadPending.current.delete(url);
            rerender();
        };
        img.onerror = () => {
            imageLoadPending.current.delete(url);
            imageLoadFailed.current.add(url);
        };
        img.src = url;
    }, [rerender]);

    // Preload all tile and item sprites once on mount
    useEffect(() => {
        preloadImages(ALL_TILE_PATHS);
    }, [preloadImages]);

    useEffect(() => {
        const aid = currentUser?.avatarId;
        if (!aid) return;
        ALL_EMOTE_IDS.forEach(id => preloadEmoteImage(aid, id));
    }, [currentUser?.avatarId, preloadEmoteImage]);

    const drawImageOnCanvas = useCallback((ctx: CanvasRenderingContext2D, url: string, x: number, y: number, w: number, h: number, fallbackColor: string, borderColor: string, label?: string) => {
        const img = imageCache.current.get(url);
        if (img) {
            try { ctx.drawImage(img, x, y, w, h); } catch {}
            ctx.strokeStyle = borderColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
            if (label) {
                ctx.fillStyle = '#374151';
                ctx.font = '10px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(label, x + w / 2, y + h / 2 + 3);
            }
            return;
        }
        ctx.fillStyle = fallbackColor;
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 1;
        ctx.strokeRect(x, y, w, h);
        if (label) {
            ctx.fillStyle = '#374151';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(label, x + w / 2, y + h / 2 + 3);
        }
    }, []);

    const draggedRef = useRef<DragItem | null>(null);
    const pendingSelectRef = useRef<{ elementId: string; x: number; y: number } | null>(null);
    const spaceElementsRef = useRef(spaceElements);
    spaceElementsRef.current = spaceElements;
    const placedItemsRef = useRef(placedItems);
    placedItemsRef.current = placedItems;
    const [canvasIsOver, setCanvasIsOver] = useState(false);
    const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);
    const [selectedPlaced, setSelectedPlaced] = useState<{ type: 'element' | 'item'; id: string } | null>(null);
    const [editorTab, setEditorTab] = useState<'elements' | 'items' | 'npcs' | 'portals'>('elements');
    const isPainting = useRef(false);
    const paintSnapshotSaved = useRef(false);
    const batchInFlightRef = useRef(false);
    const isReconcilingRef = useRef(false);
    const lastPlacedCell = useRef<{ x: number; y: number } | null>(null);
    const paintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMoving = useRef(false);
    const isSelecting = useRef(false);
    const selectStart = useRef<{ x: number; y: number } | null>(null);
    const moveTarget = useRef<{ type: 'element' | 'item'; id: string; origX: number; origY: number } | null>(null);
    const [movePreview, setMovePreview] = useState<{ x: number; y: number } | null>(null);

    const animPosRef = useRef({ x: 0, y: 0 });
    const camRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });
    const facingRef = useRef<'down' | 'up' | 'left' | 'right'>('down');
    const zoomRef = useRef(1);
    const panOffsetRef = useRef({ x: 0, y: 0 });
    const isSpaceHeld = useRef(false);
    const isPanningRef = useRef(false);
    const panStartRef = useRef({ mouseX: 0, mouseY: 0, panX: 0, panY: 0 });
    const moveAnimRef = useRef<{ fromX: number; fromY: number; toX: number; toY: number; startTime: number; duration: number } | null>(null);
    const moveQueueRef = useRef<{ x: number; y: number }[]>([]);
    const walkBobRef = useRef(0);
    const walkFrameRef = useRef(0);
    const bumpAnimRef = useRef<{ startTime: number; duration: number } | null>(null);
    // Per-remote-user animation state driven by exponential smoothing in the rAF tick.
    // Never in React state — mutated directly each frame.
    const remoteUserAnims = useRef(new Map<string, {
        targetX: number; targetY: number;   // where the server says the player is
        visualX: number; visualY: number;   // current rendered position, smoothed toward target
        facingCol: number; // 0=down 1=left 2=right 3=up  (matches local player's dirCol map)
        lastMoveTime: number;               // performance.now() of last move message
    }>());
    const lastMoveAttemptRef = useRef<number>(0);
    const pendingMoveRef = useRef<boolean>(false);
    const currentUserRef = useRef(currentUser);
    useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);
    useEffect(() => { usersRef.current = users; }, [users]);
    useEffect(() => { knockPendingPeerIdsRef.current = knockPendingPeerIds; }, [knockPendingPeerIds]);
    useEffect(() => { speakingPeerIdsRef.current = speakingPeerIds; }, [speakingPeerIds]);

    // Sync the local camera stream to the self-view <video> element.
    // The element only exists in the DOM when cameraEnabled && connectedPeers > 0, so we
    // key on both — by the time this effect fires the element is mounted and the ref is set.
    useEffect(() => {
        const el = selfVideoRef.current;
        if (!el) return;
        if (cameraEnabled && localVideoStreamRef.current) {
            el.srcObject = localVideoStreamRef.current;
            el.play().catch(() => {});
        } else {
            el.srcObject = null;
        }
    }, [cameraEnabled, connectedPeers]);

    // Track video panel height so the chat panel can shift down to make room.
    useEffect(() => {
        const el = videoPanelRef.current;
        if (!el) { setVideoPanelHeight(0); return; }
        const ro = new ResizeObserver(([entry]) => {
            setVideoPanelHeight(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
        });
        ro.observe(el);
        return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [remotePeerIds.length, cameraEnabled]);

    // Listen for remote video tracks arriving from PeerManager
    useEffect(() => {
        const onRemoteVideo = (e: Event) => {
            const { peerId, stream } = (e as CustomEvent<{ peerId: string; stream: MediaStream }>).detail;
            if (peerId === currentUserRef.current?.userId) return;
            const videoTracks = stream.getVideoTracks();
            console.log('[Game] rtc:remoteVideo for', peerId,
                'stream id:', stream.id,
                'video tracks:', videoTracks.length,
                'readyState:', videoTracks[0]?.readyState);
            if (videoTracks.length === 0 || videoTracks[0].readyState !== 'live') return;
            // Clear the onended handler on the previous stream for this peer (if any) so
            // a renegotiation-induced track-end doesn't remove the peer after the new
            // stream has already been installed.
            const prevStream = remoteStreamsRef.current.get(peerId);
            if (prevStream) {
                const prevTrack = prevStream.getVideoTracks()[0];
                if (prevTrack) prevTrack.onended = null;
            }
            remoteStreamsRef.current.set(peerId, stream);
            setRemotePeerIds([...remoteStreamsRef.current.keys()]);
            videoTracks[0].onended = () => {
                remoteStreamsRef.current.delete(peerId);
                setRemotePeerIds([...remoteStreamsRef.current.keys()]);
            };
        };
        const onPeerLeft = (e: Event) => {
            const { peerId } = (e as CustomEvent<{ peerId: string }>).detail;
            remoteStreamsRef.current.delete(peerId);
            setRemotePeerIds([...remoteStreamsRef.current.keys()]);
            peerConnectionStatesRef.current.delete(peerId);
            setPeerConnectionStates(new Map(peerConnectionStatesRef.current));
            setKnockPendingPeerIds(prev => { const next = new Set(prev); next.delete(peerId); return next; });
        };
        const onProximityGroup = (e: Event) => {
            const { members, nearbyPeers } = (e as CustomEvent<{ members: string[]; nearbyPeers: string[] }>).detail;
            setProximityGroup(members);
            setNearbyPeerIds(nearbyPeers ?? []);
        };
        const onKnockSent = (e: Event) => {
            const { peerId } = (e as CustomEvent<{ peerId: string }>).detail;
            setKnockPendingPeerIds(prev => new Set([...prev, peerId]));
        };
        const onKnockDenied = (e: Event) => {
            const { peerId } = (e as CustomEvent<{ peerId: string }>).detail;
            setKnockPendingPeerIds(prev => { const next = new Set(prev); next.delete(peerId); return next; });
            addToast('Call request denied', 'warning');
        };
        // Bug 3 fix: clear the "Requesting to join" pill when the target leaves proximity
        // before responding. Without this, knockPendingPeerIds would never be cleaned up.
        const onKnockCancelled = (e: Event) => {
            const { peerId } = (e as CustomEvent<{ peerId: string }>).detail;
            setKnockPendingPeerIds(prev => { const next = new Set(prev); next.delete(peerId); return next; });
        };
        const onPeersChanged = (e: Event) => {
            const { count } = (e as CustomEvent<{ count: number }>).detail;
            setConnectedPeers(count);
        };
        const onConnectionStateChanged = (e: Event) => {
            const { peerId, state } = (e as CustomEvent<{ peerId: string; state: RTCPeerConnectionState }>).detail;
            peerConnectionStatesRef.current.set(peerId, state);
            setPeerConnectionStates(new Map(peerConnectionStatesRef.current));
            if (state === 'closed' || state === 'disconnected' || state === 'failed') {
                remoteStreamsRef.current.delete(peerId);
                setRemotePeerIds([...remoteStreamsRef.current.keys()]);
            }
        };
        const onSpeakingState = (e: Event) => {
            const { peerId, speaking } = (e as CustomEvent<{ peerId: string; speaking: boolean }>).detail;
            setSpeakingPeerIds(prev => {
                const next = new Set(prev);
                if (speaking) next.add(peerId); else next.delete(peerId);
                return next;
            });
        };
        window.addEventListener('rtc:remoteVideo', onRemoteVideo);
        window.addEventListener('rtc:peerLeft', onPeerLeft);
        window.addEventListener('rtc:proximityGroup', onProximityGroup);
        window.addEventListener('rtc:knockSent', onKnockSent);
        window.addEventListener('rtc:knockDenied', onKnockDenied);
        window.addEventListener('rtc:knockCancelled', onKnockCancelled);
        window.addEventListener('rtc:peersChanged', onPeersChanged);
        window.addEventListener('rtc:connectionStateChanged', onConnectionStateChanged);
        window.addEventListener('rtc:speakingState', onSpeakingState);
        return () => {
            window.removeEventListener('rtc:remoteVideo', onRemoteVideo);
            window.removeEventListener('rtc:peerLeft', onPeerLeft);
            window.removeEventListener('rtc:proximityGroup', onProximityGroup);
            window.removeEventListener('rtc:knockSent', onKnockSent);
            window.removeEventListener('rtc:knockDenied', onKnockDenied);
            window.removeEventListener('rtc:knockCancelled', onKnockCancelled);
            window.removeEventListener('rtc:peersChanged', onPeersChanged);
            window.removeEventListener('rtc:connectionStateChanged', onConnectionStateChanged);
            window.removeEventListener('rtc:speakingState', onSpeakingState);
        };
    }, [addToast]);

    // Only tiles (spaceElements) and furniture (placedItems) with blocking=true block movement.
    // Other players, NPCs, and temporary objects are intentionally excluded.
    function isCellBlocked(x: number, y: number): boolean {
        for (const e of spaceElements) {
            if (!e.element.blocking) continue;
            if (x >= e.x && x < e.x + e.element.width && y >= e.y && y < e.y + e.element.height) return true;
        }
        for (const p of placedItems) {
            if (!p.item.blocking) continue;
            if (x >= p.x && x < p.x + p.item.width && y >= p.y && y < p.y + p.item.height) return true;
        }
        return false;
    }

    const runProximityCheck = useCallback((myPos?: { x: number; y: number }) => {
        const pm = peerManagerRef.current;
        const pos = myPos ?? currentUserRef.current;
        if (!pm || !pos) return;
        const voicePeers: string[] = [];
        const videoPeers: string[] = [];
        for (const [peerId, peerPos] of usersRef.current.entries()) {
            const dist = Math.hypot(peerPos.x - pos.x, peerPos.y - pos.y);
            if (dist <= VOICE_RADIUS) voicePeers.push(peerId);
            if (dist <= VIDEO_RADIUS) videoPeers.push(peerId);
        }
        pm.setProximity(voicePeers, videoPeers);
        for (const [peerId, peerPos] of usersRef.current.entries()) {
            pm.setVolume(peerId, Math.hypot(peerPos.x - pos.x, peerPos.y - pos.y));
        }
    }, []);

    const runProximityCheckRef = useRef(runProximityCheck);
    useEffect(() => { runProximityCheckRef.current = runProximityCheck; }, [runProximityCheck]);

    const checkConferenceRoom = useCallback((myPos: { x: number; y: number }) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        // Find a placed item with conferenceRoomId metadata at the player's tile
        const roomItem = placedItemsRef.current.find(p => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const roomId = (p.metadata as any)?.conferenceRoomId as string | undefined;
            if (!roomId) return false;
            return myPos.x >= p.x && myPos.x < p.x + p.item.width &&
                   myPos.y >= p.y && myPos.y < p.y + p.item.height;
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newRoomId = roomItem ? (roomItem.metadata as any).conferenceRoomId as string : null;
        if (newRoomId !== currentConferenceRoomRef.current) {
            if (currentConferenceRoomRef.current) {
                peerManagerRef.current?.leaveConference();
                ws.send(JSON.stringify({ type: 'rtc:leave-room', roomId: currentConferenceRoomRef.current }));
            }
            if (newRoomId) {
                ws.send(JSON.stringify({ type: 'rtc:join-room', roomId: newRoomId }));
            }
            currentConferenceRoomRef.current = newRoomId;
        }
    }, []);

    const checkConferenceRoomRef = useRef(checkConferenceRoom);
    useEffect(() => { checkConferenceRoomRef.current = checkConferenceRoom; }, [checkConferenceRoom]);

    const checkBroadcastZone = useCallback((myPos: { x: number; y: number }) => {
        const ws = wsRef.current;
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        const zoneItem = placedItemsRef.current.find(p => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const zoneId = (p.metadata as any)?.broadcastZoneId as string | undefined;
            if (!zoneId) return false;
            return myPos.x >= p.x && myPos.x < p.x + p.item.width &&
                   myPos.y >= p.y && myPos.y < p.y + p.item.height;
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const newZoneId = zoneItem ? (zoneItem.metadata as any).broadcastZoneId as string : null;
        if (newZoneId !== currentBroadcastZoneRef.current) {
            if (currentBroadcastZoneRef.current) {
                peerManagerRef.current?.leaveBroadcastZone();
            }
            if (newZoneId) {
                // Space owner is the speaker; everyone else is a listener
                const isSpeaker = spaceOwnerIdRef.current === currentUserRef.current?.userId;
                peerManagerRef.current?.enterBroadcastZone(newZoneId, isSpeaker);
            }
            currentBroadcastZoneRef.current = newZoneId;
        }
    }, []);

    const checkBroadcastZoneRef = useRef(checkBroadcastZone);
    useEffect(() => { checkBroadcastZoneRef.current = checkBroadcastZone; }, [checkBroadcastZone]);

    const doMove = useCallback((newX: number, newY: number) => {
        const user = currentUserRef.current;
        if (!user || !wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return false;
        const dx = newX - user.x;
        const dy = newY - user.y;
        if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
        // Client-side collision prediction — reject before animation starts so the server
        // never needs to send movement-rejected for a blocked tile (eliminates snap-back jitter).
        // Uses refs so this is always current even when doMove is called from processWalkQueue
        // where the path was computed before a blocking element was placed.
        for (const e of spaceElementsRef.current) {
            if (!e.element.blocking) continue;
            if (newX >= e.x && newX < e.x + e.element.width && newY >= e.y && newY < e.y + e.element.height) return false;
        }
        for (const p of placedItemsRef.current) {
            if (!p.item.blocking) continue;
            if (newX >= p.x && newX < p.x + p.item.width && newY >= p.y && newY < p.y + p.item.height) return false;
        }
        // Only update facing from local moves, never from server broadcasts
        if (dx < 0) facingRef.current = 'left';
        else if (dx > 0) facingRef.current = 'right';
        else if (dy < 0) facingRef.current = 'up';
        else if (dy > 0) facingRef.current = 'down';
        moveAnimRef.current = { fromX: user.x, fromY: user.y, toX: newX, toY: newY, startTime: performance.now(), duration: 150 };
        pendingMoveRef.current = true;
        lastMoveAttemptRef.current = performance.now();
        wsRef.current.send(JSON.stringify({ type: 'move', payload: { x: newX, y: newY } }));
        return true;
    }, []);

    function findPath(sx: number, sy: number, tx: number, ty: number): { x: number; y: number }[] {
        const dims = spaceDims;
        const blocked = new Set<string>();
        spaceElements.forEach(e => { if (e.element.blocking) for (let dy = 0; dy < e.element.height; dy++) for (let dx = 0; dx < e.element.width; dx++) blocked.add(`${e.x + dx},${e.y + dy}`); });
        placedItems.forEach(i => { if (i.item.blocking) for (let dy = 0; dy < i.item.height; dy++) for (let dx = 0; dx < i.item.width; dx++) blocked.add(`${i.x + dx},${i.y + dy}`); });
        if (blocked.has(`${tx},${ty}`)) return [];
        const queue: { x: number; y: number; path: { x: number; y: number }[] }[] = [{ x: sx, y: sy, path: [] }];
        const visited = new Set<string>([`${sx},${sy}`]);
        while (queue.length > 0) {
            const cur = queue.shift()!;
            if (cur.x === tx && cur.y === ty) return cur.path;
            for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
                const nx = cur.x + dx, ny = cur.y + dy;
                const key = `${nx},${ny}`;
                if (nx >= 0 && nx < dims.width && ny >= 0 && ny < dims.height && !visited.has(key) && !blocked.has(key)) {
                    visited.add(key);
                    queue.push({ x: nx, y: ny, path: [...cur.path, { x: nx, y: ny }] });
                }
            }
        }
        return [];
    }

    function processWalkQueue() {
        if (moveAnimRef.current || pendingMoveRef.current || moveQueueRef.current.length === 0) return;
        const next = moveQueueRef.current.shift()!;
        doMove(next.x, next.y);
    }

    useEffect(() => {
        let id: number;
        let lastTickTime = performance.now();
        function tick(now: number) {
            // Delta time in seconds, capped to avoid spiral-of-death after tab backgrounding
            const dt = Math.min((now - lastTickTime) / 1000, 0.1);
            lastTickTime = now;

            const anim = moveAnimRef.current;
            if (anim) {
                const t = Math.min((now - anim.startTime) / anim.duration, 1);
                const eased = t * (2 - t);
                animPosRef.current = { x: anim.fromX + (anim.toX - anim.fromX) * eased, y: anim.fromY + (anim.toY - anim.fromY) * eased };
                walkBobRef.current = t < 1 ? Math.sin(t * Math.PI) * 3 : 0;
                walkFrameRef.current = Math.floor((now - anim.startTime) / 75) % 2;
                if (t >= 1) {
                    animPosRef.current = { x: anim.toX, y: anim.toY };
                    moveAnimRef.current = null;
                    walkBobRef.current = 0;
                    walkFrameRef.current = 0;
                    currentUserRef.current = { ...currentUserRef.current!, x: anim.toX, y: anim.toY };
                    setCurrentUser(prev => prev ? { ...prev, x: anim.toX, y: anim.toY } : prev);
                    pendingMoveRef.current = false;
                    processWalkQueue();
                    runProximityCheckRef.current({ x: anim.toX, y: anim.toY });
                    checkConferenceRoomRef.current({ x: anim.toX, y: anim.toY });
                    checkBroadcastZoneRef.current({ x: anim.toX, y: anim.toY });
                }
                rerender();
            }
            // Ensure walk state is cleared whenever no animation is active
            if (!moveAnimRef.current) {
                walkBobRef.current = 0;
                walkFrameRef.current = 0;
                // Safety: if the queue has been stale for >500ms with no active animation, clear it
                if (moveQueueRef.current.length > 0 && now - lastMoveAttemptRef.current > 500) {
                    moveQueueRef.current = [];
                }
            }
            const bump = bumpAnimRef.current;
            if (bump) {
                const t = (now - bump.startTime) / bump.duration;
                if (t >= 1) { bumpAnimRef.current = null; }
                rerender();
            }
            // Drive NPC tweens
            if (npcAnims.current.size > 0) {
                let anyActive = false;
                for (const [npcId, a] of npcAnims.current) {
                    if ((now - a.startTime) < a.duration) { anyActive = true; break; }
                    npcAnims.current.delete(npcId);
                }
                if (anyActive) rerender();
            }
            // Exponential smoothing for remote user positions (k=15 → ~93% of distance
            // covered in 200ms at 60fps, independent of server move cadence).
            if (remoteUserAnims.current.size > 0) {
                const alpha = 1 - Math.exp(-15 * dt);
                let anyRemoteActive = false;
                for (const [, r] of remoteUserAnims.current) {
                    r.visualX += (r.targetX - r.visualX) * alpha;
                    r.visualY += (r.targetY - r.visualY) * alpha;
                    if (Math.abs(r.targetX - r.visualX) > 0.005 ||
                        Math.abs(r.targetY - r.visualY) > 0.005 ||
                        (now - r.lastMoveTime) < 300) {
                        anyRemoteActive = true;
                    }
                }
                if (anyRemoteActive) rerender();
            }
            // Portal edge pulse animation
            if (portalsRef.current.length > 0) rerender();
            // Knock pending pulse animation
            if (knockPendingPeerIdsRef.current.size > 0) rerender();
            // Speaking ring pulse animation
            if (speakingPeerIdsRef.current.size > 0) rerender();
            id = requestAnimationFrame(tick);
        }
        id = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(id);
    }, [rerender, setCurrentUser]);

    const authHeaders = useMemo((): Record<string, string> => ({
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }), [token]);

    const undoStackRef = useRef<{ elements: SpaceElement[]; items: PlacedItem[] }[]>([]);
    const redoStackRef = useRef<{ elements: SpaceElement[]; items: PlacedItem[] }[]>([]);
    const MAX_UNDO = 50;

    function saveUndoSnapshot() {
        const snapshot = {
            elements: spaceElementsRef.current.map(e => ({ ...e, element: { ...e.element } })),
            items: placedItemsRef.current.map(p => ({ ...p, item: { ...p.item } })),
        };
        undoStackRef.current.push(snapshot);
        if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
        redoStackRef.current = [];
        setCanUndo(true);
        setCanRedo(false);
    }

    async function reconcileState(target: { elements: SpaceElement[]; items: PlacedItem[] }) {
        if (isReconcilingRef.current) return;
        isReconcilingRef.current = true;
        // Exclude optimistic tiles — they have no server IDs and can't be diffed
        const curElements = spaceElementsRef.current.filter(e => !e.id.startsWith('_opt_'));
        const curItems = placedItemsRef.current.filter(p => !p.id.startsWith('_opt_'));
        const ops: Promise<Response>[] = [];

        for (const el of curElements) {
            if (!target.elements.find(e => e.id === el.id)) {
                ops.push(fetch(`${API}/api/v1/space/element`, { method: 'DELETE', headers: authHeaders, body: JSON.stringify({ id: el.id }) }));
            }
        }
        for (const el of target.elements) {
            if (!curElements.find(e => e.id === el.id)) {
                ops.push(fetch(`${API}/api/v1/space/element`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ spaceId, elementId: el.element.id, x: el.x, y: el.y }) }));
            }
        }
        for (const el of target.elements) {
            const cur = curElements.find(e => e.id === el.id);
            if (cur && (cur.x !== el.x || cur.y !== el.y)) {
                ops.push(fetch(`${API}/api/v1/space/element/${el.id}/move`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ x: el.x, y: el.y }) }));
            }
        }
        for (const item of curItems) {
            if (!target.items.find(i => i.id === item.id)) {
                ops.push(fetch(`${API}/api/v1/space/placed/${item.id}`, { method: 'DELETE', headers: authHeaders }));
            }
        }
        for (const item of target.items) {
            if (!curItems.find(i => i.id === item.id)) {
                ops.push(fetch(`${API}/api/v1/space/place`, { method: 'POST', headers: authHeaders, body: JSON.stringify({ spaceId, itemId: item.item.id, x: item.x, y: item.y, layer: item.layer }) }));
            }
        }
        for (const item of target.items) {
            const cur = curItems.find(i => i.id === item.id);
            if (cur && (cur.x !== item.x || cur.y !== item.y)) {
                ops.push(fetch(`${API}/api/v1/space/placed/${item.id}/move`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ x: item.x, y: item.y }) }));
            }
        }

        try {
            await Promise.all(ops);
            await Promise.all([fetchSpace(), fetchInventory()]);
        } catch (err) {
            console.error('Undo/redo reconcile error:', err);
            setEditorError('Failed to undo/redo');
        } finally {
            isReconcilingRef.current = false;
        }
    }

    function abortPendingBatch() {
        // Cancel pending timers
        if (batchFlushTimer.current) { clearTimeout(batchFlushTimer.current); batchFlushTimer.current = null; }
        if (deleteFlushTimer.current) { clearTimeout(deleteFlushTimer.current); deleteFlushTimer.current = null; }
        // Discard unsaved optimistic tiles (they have _opt_ IDs)
        const cleanEls = spaceElementsRef.current.filter(e => !e.id.startsWith('_opt_'));
        const cleanItems = placedItemsRef.current.filter(p => !p.id.startsWith('_opt_'));
        spaceElementsRef.current = cleanEls;
        placedItemsRef.current = cleanItems;
        setSpaceElements(cleanEls);
        setPlacedItems(cleanItems);
        // Clear unsent buffers
        batchBuffer.current = [];
        deleteBuffer.current = { elementIds: [], itemIds: [] };
    }

    function handleUndo() {
        if (undoStackRef.current.length === 0) return;
        if (isReconcilingRef.current) return;
        if (batchInFlightRef.current) {
            addToast('Still saving — please wait a moment', 'warning');
            return;
        }
        abortPendingBatch();
        const prev = undoStackRef.current.pop()!;
        redoStackRef.current.push({ elements: spaceElementsRef.current.map(e => ({ ...e, element: { ...e.element } })), items: placedItemsRef.current.map(p => ({ ...p, item: { ...p.item } })) });
        setCanRedo(true);
        setCanUndo(undoStackRef.current.length > 0);
        reconcileState(prev);
    }

    function handleRedo() {
        if (redoStackRef.current.length === 0) return;
        if (isReconcilingRef.current) return;
        if (batchInFlightRef.current) {
            addToast('Still saving — please wait a moment', 'warning');
            return;
        }
        abortPendingBatch();
        const next = redoStackRef.current.pop()!;
        undoStackRef.current.push({ elements: spaceElementsRef.current.map(e => ({ ...e, element: { ...e.element } })), items: placedItemsRef.current.map(p => ({ ...p, item: { ...p.item } })) });
        setCanUndo(true);
        setCanRedo(redoStackRef.current.length > 0);
        reconcileState(next);
    }

    const batchBuffer = useRef<{ type: 'element' | 'item'; id: string; x: number; y: number }[]>([]);
    const batchFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const deleteBuffer = useRef<{ elementIds: string[]; itemIds: string[] }>({ elementIds: [], itemIds: [] });
    const deleteFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Session expired / invalid token (e.g. BETTER_AUTH_SECRET rotated, stale localStorage token) —
    // surface it to the user and send them back to sign in, instead of silently dropping placements.
    const handleAuthFailure = useCallback(() => {
        batchBuffer.current = [];
        if (batchFlushTimer.current) { clearTimeout(batchFlushTimer.current); batchFlushTimer.current = null; }
        deleteBuffer.current = { elementIds: [], itemIds: [] };
        if (deleteFlushTimer.current) { clearTimeout(deleteFlushTimer.current); deleteFlushTimer.current = null; }
        addToast('Session expired, please sign in again', 'warning');
        clearAuth();
        navigate('/login');
    }, [addToast, clearAuth, navigate]);

    const flushBatch = useCallback(async () => {
        if (batchFlushTimer.current) { clearTimeout(batchFlushTimer.current); batchFlushTimer.current = null; }
        const buf = batchBuffer.current;
        if (buf.length === 0) return;
        batchBuffer.current = [];
        const elementBuf = buf.filter(b => b.type === 'element').map(b => ({ elementId: b.id, x: b.x, y: b.y }));
        const itemBuf = buf.filter(b => b.type === 'item').map(b => ({ itemId: b.id, x: b.x, y: b.y }));

        if (saveStatusTimerRef.current) { clearTimeout(saveStatusTimerRef.current); saveStatusTimerRef.current = null; }
        setSaveStatus('saving');
        batchInFlightRef.current = true;
        let requestFailed = false;

        try {
            if (elementBuf.length > 0) {
                const elementPayload = { spaceId, elements: elementBuf };
                console.log('[batch] POST /space/element/batch request:', elementPayload, 'auth header present:', !!authHeaders.Authorization);
                const res = await fetch(`${API}/api/v1/space/element/batch`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify(elementPayload),
                });
                if (res.status === 401 || res.status === 403) {
                    const d = await res.json().catch(() => ({}));
                    console.error('[batch] POST /space/element/batch auth failure:', res.status, d);
                    handleAuthFailure();
                    return;
                }
                const sentPositions = new Set(elementBuf.map(b => `${b.x},${b.y}`));
                if (res.status !== 200 && res.status !== 201) {
                    const d = await res.json().catch(() => ({}));
                    console.error('[batch] POST /space/element/batch unexpected status, full response:', res.status, d);
                    requestFailed = true;
                    setEditorError(d.message || 'Batch element placement failed');
                    // keep optimistic tiles visible, mark them so the canvas can render a red "failed to save" tint
                    spaceElementsRef.current = spaceElementsRef.current.map(e =>
                        (e.id.startsWith('_opt_') && sentPositions.has(`${e.x},${e.y}`)) ? { ...e, failedToSave: true } : e
                    );
                    setSpaceElements(spaceElementsRef.current);
                } else {
                    const data = await res.json();
                    console.log('[batch] POST /space/element/batch response:', data);
                    const created: { id: string; x: number; y: number }[] = data.elements || [];
                    const realIdByPos = new Map(created.map(c => [`${c.x},${c.y}`, c.id]));
                    spaceElementsRef.current = spaceElementsRef.current.map(e => {
                        if (e.id.startsWith('_opt_') && sentPositions.has(`${e.x},${e.y}`)) {
                            const realId = realIdByPos.get(`${e.x},${e.y}`);
                            return realId ? { ...e, id: realId, failedToSave: false } : { ...e, failedToSave: true };
                        }
                        return e;
                    });
                    setSpaceElements(spaceElementsRef.current);
                }
            }
            if (itemBuf.length > 0) {
                const res = await fetch(`${API}/api/v1/space/place/batch`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ spaceId, items: itemBuf.map(i => ({ ...i, layer: placementLayer })) }),
                });
                if (res.status === 401 || res.status === 403) {
                    const d = await res.json().catch(() => ({}));
                    console.error('[batch] POST /space/place/batch auth failure:', res.status, d);
                    handleAuthFailure();
                    return;
                }
                const sentPositions = new Set(itemBuf.map(b => `${b.x},${b.y}`));
                if (res.status !== 200 && res.status !== 201) {
                    const d = await res.json().catch(() => ({}));
                    console.error('[batch] POST /space/place/batch unexpected status, full response:', res.status, d);
                    requestFailed = true;
                    setEditorError(d.message || 'Batch item placement failed');
                    // keep optimistic tiles visible, mark them so the canvas can render a red "failed to save" tint
                    placedItemsRef.current = placedItemsRef.current.map(p =>
                        (p.id.startsWith('_opt_') && sentPositions.has(`${p.x},${p.y}`)) ? { ...p, failedToSave: true } : p
                    );
                    setPlacedItems(placedItemsRef.current);
                } else {
                    const data = await res.json();
                    console.log('[batch] POST /space/place/batch response:', data);
                    const created: { id: string; x: number; y: number }[] = data.items || [];
                    const realIdByPos = new Map(created.map(c => [`${c.x},${c.y}`, c.id]));
                    placedItemsRef.current = placedItemsRef.current.map(p => {
                        if (p.id.startsWith('_opt_') && sentPositions.has(`${p.x},${p.y}`)) {
                            const realId = realIdByPos.get(`${p.x},${p.y}`);
                            return realId ? { ...p, id: realId, failedToSave: false } : { ...p, failedToSave: true };
                        }
                        return p;
                    });
                    setPlacedItems(placedItemsRef.current);
                }
                fetchInventory();
            }
        } catch (err) {
            console.error('Batch placement error:', err);
            requestFailed = true;
            const sentElementPositions = new Set(elementBuf.map(b => `${b.x},${b.y}`));
            const sentItemPositions = new Set(itemBuf.map(b => `${b.x},${b.y}`));
            if (sentElementPositions.size > 0) {
                spaceElementsRef.current = spaceElementsRef.current.map(e =>
                    (e.id.startsWith('_opt_') && sentElementPositions.has(`${e.x},${e.y}`)) ? { ...e, failedToSave: true } : e
                );
                setSpaceElements(spaceElementsRef.current);
            }
            if (sentItemPositions.size > 0) {
                placedItemsRef.current = placedItemsRef.current.map(p =>
                    (p.id.startsWith('_opt_') && sentItemPositions.has(`${p.x},${p.y}`)) ? { ...p, failedToSave: true } : p
                );
                setPlacedItems(placedItemsRef.current);
            }
        }

        if (batchBuffer.current.length > 0) {
            flushBatch();
            return;
        }

        if (requestFailed) {
            setSaveStatus('failed');
        } else {
            setSaveStatus('saved');
            saveStatusTimerRef.current = setTimeout(() => {
                setSaveStatus('idle');
                saveStatusTimerRef.current = null;
            }, 2000);
        }
        batchInFlightRef.current = false;
    }, [spaceId, authHeaders, placementLayer, handleAuthFailure]);

    const canvasToGrid = (clientX: number, clientY: number): { x: number; y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        // Convert from CSS pixels (rect / clientX,Y space) to backing-store pixels (the space
        // offsetX/camX are computed in) — they can differ if the canvas's displayed size drifts
        // from its drawing-buffer resolution, which would otherwise shift every click off-grid.
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        const tileSize = 50 * zoomRef.current;
        return {
            x: Math.floor((canvasX - camRef.current.offsetX + camRef.current.x) / tileSize),
            y: Math.floor((canvasY - camRef.current.offsetY + camRef.current.y) / tileSize),
        };
    };

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) return;

        intentionalCloseRef.current = false;
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            setReconnecting(false);
            setError('');
            reconnectAttempts.current = 0;
            ws.send(JSON.stringify({
                type: 'join',
                payload: { spaceId: spaceIdRef.current, token: tokenRef.current || '' },
            }));
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            heartbeatRef.current = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'ping' }));
                }
            }, 25_000);
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleMessageRef.current(message);
        };

        ws.onclose = () => {
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
            }
            setConnected(false);
            if (intentionalCloseRef.current) return;
            reconnectAttempts.current++;
            const delay = Math.min(500 * Math.pow(2, reconnectAttempts.current - 1), 4_000);
            setReconnecting(true);
            setError(`Reconnecting (attempt ${reconnectAttempts.current})...`);
            setTimeout(connect, delay);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, []); // stable — reads spaceId/token via refs

    useEffect(() => {
        connect();
        return () => {
            intentionalCloseRef.current = true;
            if (heartbeatRef.current) {
                clearInterval(heartbeatRef.current);
                heartbeatRef.current = null;
            }
            wsRef.current?.close();
            wsRef.current = null;
            peerManagerRef.current?.destroy();
            peerManagerRef.current = null;
            rtcBufferRef.current = [];
            localVideoStreamRef.current?.getTracks().forEach(t => t.stop());
            localVideoStreamRef.current = null;
        };
    }, [connect]);

    useEffect(() => {
        containerRef.current?.focus();
    }, []);

    useEffect(() => {
        if (showNewMap) {
            fetch(`${API}/api/v1/maps`)
                .then(r => r.json())
                .then(d => setMapTemplates(d.maps || []))
                .catch(() => {});
        }
    }, [showNewMap]);

    useEffect(() => {
        return () => {
            if (batchFlushTimer.current) { clearTimeout(batchFlushTimer.current); }
            if (saveStatusTimerRef.current) { clearTimeout(saveStatusTimerRef.current); }
            if (deleteFlushTimer.current) { clearTimeout(deleteFlushTimer.current); }
            if (batchBuffer.current.length > 0) flushBatch();
        };
    }, [flushBatch]);

    useEffect(() => {
        const resize = () => {
            const canvas = canvasRef.current;
            const container = containerRef.current;
            if (!canvas || !container) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            if (w > 0 && h > 0 && (canvas.width !== w || canvas.height !== h)) {
                canvas.width = w;
                canvas.height = h;
                rerender();
            }
        };
        resize();
        const observer = new ResizeObserver(resize);
        if (containerRef.current) observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [rerender]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const onWheel = (e: WheelEvent) => {
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                const step = e.deltaY > 0 ? -0.1 : 0.1;
                zoomRef.current = Math.round(Math.max(0.5, Math.min(3, zoomRef.current + step)) * 10) / 10;
                panOffsetRef.current = { x: 0, y: 0 };
                rerender();
            }
        };
        canvas.addEventListener('wheel', onWheel, { passive: false });
        return () => canvas.removeEventListener('wheel', onWheel);
    }, [rerender]);

    const fetchElementsCatalog = useCallback(async () => {
        setElementsLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/elements`);
            const data = await res.json();
            setElementTypes(data.elements || []);
            preloadImages((data.elements || []).map((e: ElementType) => e.imageUrl).filter(Boolean));
        } catch (err) {
            console.error(err);
        } finally {
            setElementsLoading(false);
        }
    }, [preloadImages]);

    useEffect(() => {
        if (editMode) fetchElementsCatalog();
    }, [editMode, fetchElementsCatalog]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (
            document.activeElement instanceof HTMLInputElement ||
            document.activeElement instanceof HTMLTextAreaElement
        ) return;
        if (e.key === ' ' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            isSpaceHeld.current = true;
            setSpaceHeld(true);
            return;
        }
        if ((e.ctrlKey || e.metaKey) && e.key === '0') {
            e.preventDefault();
            zoomRef.current = 1;
            panOffsetRef.current = { x: 0, y: 0 };
            rerender();
            return;
        }
        if (editMode) {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) handleRedo();
                else handleUndo();
                return;
            }
            if (selectedPlaced && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (selectedPlaced.type === 'element') deletePlacedElement(selectedPlaced.id);
                else deletePlacedItem(selectedPlaced.id);
                setSelectedPlaced(null);
            } else if (selectedPlacedGroup.length > 0 && (e.key === 'Delete' || e.key === 'Backspace')) {
                selectedPlacedGroup.forEach(s => {
                    if (s.type === 'element') deletePlacedElement(s.id);
                    else deletePlacedItem(s.id);
                });
                setSelectedPlacedGroup([]);
            }
            if (e.key === 'Escape') {
                // Priority: delete mode → item selection → panels
                if (eraserMode) {
                    setEraserMode(false);
                    return;
                }
                if (selectedItem || selectedElement) {
                    setSelectedItem(null);
                    setSelectedElement(null);
                    return;
                }
                // Deselect placed items, cancel NPC ops, close panels
                setSelectedPlaced(null);
                setSelectedPlacedGroup([]);
                setSelectedNpcId(null);
                setNpcPickingPos(false);
                npcDragRef.current = null;
                isMoving.current = false;
                moveTarget.current = null;
                setMovePreview(null);
                setPlayerPopup(null);
                const gs = useGameStore.getState();
                if (gs.showEmotePicker) { gs.setShowEmotePicker(false); return; }
                if (gs.showProximityChat) { gs.setShowProximityChat(false); return; }
                if (gs.showNotifPanel) { gs.toggleNotifPanel(); return; }
            }
            return;
        }

        if (!currentUserRef.current) return;

        if (e.key === 'e' || e.key === 'E') {
            useGameStore.getState().toggleEmotePicker();
            return;
        }

        // Use ref for position so key presses compute correct targets even if React state is stale
        const liveUser = currentUserRef.current;
        if (!liveUser) return;
        const { x, y } = liveUser;

        if (e.key === 'f' || e.key === 'F') {
            // Sit/stand on adjacent or current office chair
            const chairItem = placedItems.find(p =>
                p.item.id === 'item-office-chair' && Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1
            );
            if (chairItem) {
                const next: Activity = myActivityRef.current === null ? 'sitting' : null;
                setMyActivity(next);
                if (wsRef.current?.readyState === WebSocket.OPEN) {
                    wsRef.current.send(JSON.stringify({ type: 'activity-changed', payload: { activity: next } }));
                }
                return;
            }
            // Coffee machine interaction
            const coffeeItem = placedItems.find(p =>
                p.item.id === 'item-coffee-machine' && Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1
            );
            if (coffeeItem) {
                setInteractionPopup({ type: 'sign', title: '☕ Coffee Machine', text: 'You grab a coffee. +10 energy boost! Now back to work.' });
                wsRef.current?.send(JSON.stringify({ type: 'status-emote', payload: { emoteId: 'coffee' } }));
                return;
            }
            // Vending machine interaction
            const vendingItem = placedItems.find(p =>
                p.item.id === 'item-vending-machine' && Math.abs(p.x - x) <= 1 && Math.abs(p.y - y) <= 1
            );
            if (vendingItem) {
                setInteractionPopup({ type: 'sign', title: '🍫 Vending Machine', text: 'You grab a snack. Yum!' });
                return;
            }
        }

        // Confirm portal travel with Enter
        if (e.key === 'Enter' && portalTravel) {
            navigate(`/arena?spaceId=${portalTravel.toSpaceId}`);
            setPortalTravel(null);
            return;
        }

        switch (e.key) {
            case 'ArrowUp':    handleMove(x, y - 1); break;
            case 'ArrowDown':  handleMove(x, y + 1); break;
            case 'ArrowLeft':  handleMove(x - 1, y); break;
            case 'ArrowRight': handleMove(x + 1, y); break;
        }
    };

    const handleKeyUp = (e: React.KeyboardEvent) => {
        if (e.key === ' ') {
            isSpaceHeld.current = false;
            setSpaceHeld(false);
            isPanningRef.current = false;
        }
    };

    const fetchPublicSpaces = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/space/public`);
            if (res.ok) {
                const d = await res.json();
                setAllSpaces((d.spaces || []).filter((s: { id: string }) => s.id !== spaceId));
            }
        } catch {}
    }, [spaceId]);

    const fetchSpace = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/space/${spaceId}`);
            const data = await res.json();
            setSpaceElements(data.elements || []);
            setPlacedItems(data.placedItems || []);
            setPortals(data.portals || []);
            if (data.name) setSpaceName(data.name);
            if (data.creatorId) { setSpaceOwnerId(data.creatorId); spaceOwnerIdRef.current = data.creatorId; }
            if (typeof data.isPrivate === 'boolean') setSpaceIsPrivate(data.isPrivate);
            if (data.dimensions) {
                const parts = data.dimensions.split('x');
                setSpaceDims({ width: parseInt(parts[0]), height: parseInt(parts[1]) });
            }
            const urls: string[] = [];
            (data.elements || []).forEach((e: SpaceElement) => { if (e.element.imageUrl) urls.push(e.element.imageUrl); });
            (data.placedItems || []).forEach((p: PlacedItem) => { if (p.item.imageUrl) urls.push(p.item.imageUrl); });
            preloadImages(urls);
        } catch (err) {
            console.error(err);
        }
    }, [spaceId, preloadImages]);

    const fetchInventory = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/inventory`, { headers: authHeaders });
            const data = await res.json();
            setInventory(data.inventory || []);
            preloadImages((data.inventory || []).map((i: InventoryItem) => i.imageUrl).filter(Boolean));
        } catch (err) {
            console.error(err);
        }
    }, [authHeaders, preloadImages]);

    const flushDeleteBatch = useCallback(async () => {
        if (deleteFlushTimer.current) { clearTimeout(deleteFlushTimer.current); deleteFlushTimer.current = null; }
        const { elementIds, itemIds } = deleteBuffer.current;
        if (elementIds.length === 0 && itemIds.length === 0) return;
        deleteBuffer.current = { elementIds: [], itemIds: [] };

        if (saveStatusTimerRef.current) { clearTimeout(saveStatusTimerRef.current); saveStatusTimerRef.current = null; }
        setSaveStatus('saving');
        let requestFailed = false;

        try {
            if (elementIds.length > 0) {
                const res = await fetch(`${API}/api/v1/space/element/batch-delete`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ spaceId, ids: elementIds }),
                });
                if (res.status === 401 || res.status === 403) { handleAuthFailure(); return; }
                if (!res.ok) requestFailed = true;
            }
            if (itemIds.length > 0) {
                const res = await fetch(`${API}/api/v1/space/placed/batch-delete`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ spaceId, ids: itemIds }),
                });
                if (res.status === 401 || res.status === 403) { handleAuthFailure(); return; }
                if (!res.ok) requestFailed = true;
            }
        } catch (err) {
            console.error('Batch delete error:', err);
            requestFailed = true;
        }

        if (deleteBuffer.current.elementIds.length > 0 || deleteBuffer.current.itemIds.length > 0) {
            flushDeleteBatch();
            return;
        }

        if (requestFailed) {
            setSaveStatus('failed');
        } else {
            fetchInventory();
            setSaveStatus('saved');
            saveStatusTimerRef.current = setTimeout(() => { setSaveStatus('idle'); saveStatusTimerRef.current = null; }, 2000);
        }
    }, [spaceId, authHeaders, handleAuthFailure, fetchInventory]);

    useEffect(() => {
        return () => {
            if (deleteFlushTimer.current) { clearTimeout(deleteFlushTimer.current); }
            const db = deleteBuffer.current;
            if (db.elementIds.length > 0 || db.itemIds.length > 0) flushDeleteBatch();
        };
    }, [flushDeleteBatch]);

    const fetchGuestbook = useCallback(async () => {
        setGbLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/guestbook/${spaceId}`);
            const data = await res.json();
            setGbMessages(data.messages || []);
        } catch (err) {
            console.error(err);
        } finally {
            setGbLoading(false);
        }
    }, [spaceId]);

    const fetchQuests = useCallback(async () => {
        setQuestsLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/quests/active`, { headers: authHeaders });
            const data = await res.json();
            setQuests(data.quests || []);
        } catch (err) {
            console.error(err);
        } finally {
            setQuestsLoading(false);
        }
    }, [authHeaders]);

    const fetchNpcs = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/space/${spaceId}/npcs`);
            if (res.ok) {
                const data = await res.json();
                // Update the ref first so the canvas draw loop sees current data immediately
                npcsRef.current = data.npcs || [];
                setNpcs(data.npcs || []);
            }
        } catch {}
    }, [spaceId]);

    const handleExpand = useCallback(async (direction: 'north' | 'south' | 'east' | 'west') => {
        const { width, height } = spaceDims;
        let newWidth = width, newHeight = height, offX = 0, offY = 0;
        if (direction === 'north') { newHeight = height + 10; offY = 10; }
        else if (direction === 'south') { newHeight = height + 10; }
        else if (direction === 'west') { newWidth = width + 10; offX = 10; }
        else if (direction === 'east') { newWidth = width + 10; }
        try {
            const res = await fetch(`${API}/api/v1/space/${spaceId}/resize`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ width: newWidth, height: newHeight, offsetX: offX, offsetY: offY }),
            });
            if (res.ok) {
                setSpaceDims({ width: newWidth, height: newHeight });
                addToast(`Expanded ${direction} (+10 tiles)`, 'success');
                fetchSpace();
            } else {
                const d = await res.json();
                addToast(d.message || 'Expand failed', 'warning');
            }
        } catch {
            addToast('Network error expanding space', 'warning');
        }
        setShowExpandModal(false);
    }, [spaceDims, spaceId, authHeaders, addToast, fetchSpace]);

    const handleClearAll = useCallback(async () => {
        setClearingAll(true);
        try {
            const res = await fetch(`${API}/api/v1/space/${spaceId}/clear`, {
                method: 'DELETE',
                headers: authHeaders,
            });
            if (res.ok) {
                batchBuffer.current = [];
                if (batchFlushTimer.current) { clearTimeout(batchFlushTimer.current); batchFlushTimer.current = null; }
                deleteBuffer.current = { elementIds: [], itemIds: [] };
                if (deleteFlushTimer.current) { clearTimeout(deleteFlushTimer.current); deleteFlushTimer.current = null; }
                undoStackRef.current = [];
                redoStackRef.current = [];
                setCanUndo(false);
                setCanRedo(false);
                setSpaceElements([]);
                setPlacedItems([]);
                addToast('Canvas cleared', 'success');
            } else {
                const d = await res.json();
                addToast(d.message || 'Clear failed', 'warning');
            }
        } catch {
            addToast('Network error clearing canvas', 'warning');
        }
        setClearingAll(false);
        setShowClearAllConfirm(false);
    }, [spaceId, authHeaders, addToast]);

    const handleCreateMap = useCallback(async () => {
        if (!newMapName.trim()) return;
        setCreatingMap(true);
        try {
            const body: Record<string, string> = { name: newMapName.trim(), dimensions: newMapDims };
            if (newMapTemplate) body.mapId = newMapTemplate;
            const res = await fetch(`${API}/api/v1/space`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!res.ok) { setEditorError(data.message || 'Failed to create map'); return; }
            setShowNewMap(false);
            setNewMapName('');
            setNewMapDims('20x20');
            setNewMapTemplate('');
            navigate(`/arena?spaceId=${data.spaceId}`, { replace: true });
        } catch (err) {
            setEditorError('Network error creating map');
            console.error(err);
        } finally {
            setCreatingMap(false);
        }
    }, [newMapName, newMapDims, newMapTemplate, authHeaders, navigate]);


    useEffect(() => {
        fetchSpace();
        fetchInventory();
        if (token) {
            fetch(`${API}/api/v1/wallet`, { headers: { Authorization: `Bearer ${token}` } })
                .then(r => r.ok ? r.json() : null)
                .then(d => { if (d?.coins != null) setWalletCoins(d.coins); })
                .catch(() => {});
        }
    }, [fetchSpace, fetchInventory]);

    useEffect(() => {
        const pending = pendingSelectRef.current;
        if (!pending) return;
        const match = spaceElements.find(
            e => e.element.id === pending.elementId && e.x === pending.x && e.y === pending.y
        );
        if (match) {
            setSelectedPlaced({ type: 'element', id: match.id });
            pendingSelectRef.current = null;
        }
    }, [spaceElements]);

    useEffect(() => {
        if (showGuestbook) fetchGuestbook();
    }, [showGuestbook, fetchGuestbook]);

    useEffect(() => {
        if (showQuests) fetchQuests();
    }, [showQuests, fetchQuests]);

    useEffect(() => {
        if (emotes.length === 0) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setEmotes(prev => prev.filter(e => now - e.createdAt < 2000));
        }, 200);
        return () => clearInterval(timer);
    }, [emotes.length]);

    useEffect(() => {
        const timer = setInterval(rerender, 2000);
        return () => clearInterval(timer);
    }, [rerender]);

    useEffect(() => {
        if (interactions.length === 0) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setInteractions(prev => prev.filter(e => now - e.createdAt < 3000));
        }, 200);
        return () => clearInterval(timer);
    }, [interactions.length]);

    useEffect(() => {
        if (chatBubbles.length === 0) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setChatBubbles(prev => prev.filter(e => now - e.createdAt < 4000));
        }, 200);
        return () => clearInterval(timer);
    }, [chatBubbles.length]);

    useEffect(() => {
        const handler = () => setIsDesktop(window.innerWidth >= 1024);
        window.addEventListener('resize', handler);
        return () => window.removeEventListener('resize', handler);
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessage = (message: any) => {
        const gs = useGameStore.getState();
        switch (message.type) {
            case 'space-joined': {
                setCurrentUser({
                    x: message.payload.spawn.x,
                    y: message.payload.spawn.y,
                    userId: message.payload.userId,
                    username: message.payload.username || 'Unknown',
                    avatarId: message.payload.avatarId,
                });
                animPosRef.current = { x: message.payload.spawn.x, y: message.payload.spawn.y };
                currentUserRef.current = { x: message.payload.spawn.x, y: message.payload.spawn.y, userId: message.payload.userId, username: message.payload.username || 'Unknown', avatarId: message.payload.avatarId };
                facingRef.current = 'down';
                moveAnimRef.current = null;
                moveQueueRef.current = [];
                pendingMoveRef.current = false;
                const userMap = new Map<string, { x: number; y: number; userId: string; username: string; avatarId?: string }>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                message.payload.users.forEach((u: any) => {
                    userMap.set(u.userId, { x: u.x, y: u.y, userId: u.userId, username: u.username || 'Unknown', avatarId: u.avatarId });
                });
                setUsers(userMap);
                usersRef.current = userMap;
                // Seed visual positions from the initial roster so smoothing starts
                // at the correct tile rather than lerping from (0,0).
                remoteUserAnims.current.clear();
                userMap.forEach(u => {
                    remoteUserAnims.current.set(u.userId, {
                        targetX: u.x, targetY: u.y,
                        visualX: u.x, visualY: u.y,
                        facingCol: 0, lastMoveTime: 0,
                    });
                });
                fetchSpace();
                fetchInventory();
                fetchNpcs();
                useGameStore.getState().setMyActiveEmote(null);
                useGameStore.getState().clearActiveEmote(message.payload.userId);
                // Init PeerManager (destroy previous if reconnecting)
                currentConferenceRoomRef.current = null;
                currentBroadcastZoneRef.current = null;
                if (wsRef.current) {
                    peerManagerRef.current?.destroy();
                    peerManagerRef.current = null; // clear stale ref while init() runs
                    const pm = new PeerManager(wsRef.current, message.payload.userId, message.payload.username ?? 'Unknown');
                    const initWithTimeout = Promise.race([
                        pm.init(),
                        new Promise<void>((_, reject) =>
                            setTimeout(() => reject(new Error('PeerManager init timeout')), 8000)
                        ),
                    ]);
                    initWithTimeout
                        .catch((err) => { console.error('[Game] PeerManager init failed or timed out:', err); })
                        .finally(() => {
                            const hasMic = pm.hasMic();
                            console.log('[Game] PeerManager ready, localStream:', hasMic);
                            setMicPermission(hasMic ? 'granted' : 'denied');
                            peerManagerRef.current = pm;
                            const buffered = rtcBufferRef.current.splice(0);
                            for (const item of buffered) {
                                const curPm = peerManagerRef.current;
                                if (!curPm) break;
                                const m = item.data as Record<string, unknown>;
                                switch (item.type) {
                                    case 'rtc:offer': curPm.handleOffer(m.from as string, m.sdp as RTCSessionDescriptionInit); break;
                                    case 'rtc:answer': curPm.handleAnswer(m.from as string, m.sdp as RTCSessionDescriptionInit); break;
                                    case 'rtc:ice': curPm.handleIce(m.from as string, m.candidate as RTCIceCandidateInit); break;
                                    case 'rtc:knock-accept': curPm.handleKnockAccepted(m.from as string); break;
                                    case 'rtc:knock-deny': curPm.handleKnockDenied(m.from as string); break;
                                }
                            }
                        });
                }
                break;
            }

            case 'user-joined': {
                const joinedUser = {
                    x: message.payload.x,
                    y: message.payload.y,
                    userId: message.payload.userId,
                    username: message.payload.username || 'Unknown',
                    avatarId: message.payload.avatarId,
                };
                usersRef.current = new Map(usersRef.current).set(message.payload.userId, joinedUser);
                setUsers(prev => {
                    const next = new Map(prev);
                    next.set(message.payload.userId, joinedUser);
                    return next;
                });
                // Seed visual position at the join tile so the smoother starts correctly.
                remoteUserAnims.current.set(message.payload.userId, {
                    targetX: joinedUser.x, targetY: joinedUser.y,
                    visualX: joinedUser.x, visualY: joinedUser.y,
                    facingCol: 0, lastMoveTime: 0,
                });
                if (message.payload.userId !== currentUserRef.current?.userId) {
                    addToast(`${message.payload.username || 'Someone'} joined`, 'info');
                }
                runProximityCheck();
                break;
            }

            case 'movement': {
                const existingUser = usersRef.current.get(message.payload.userId);
                if (existingUser) {
                    const newX = message.payload.x as number;
                    const newY = message.payload.y as number;
                    const dx = newX - existingUser.x;
                    const dy = newY - existingUser.y;

                    // Derive facing from dominant axis of movement
                    const prevAnim = remoteUserAnims.current.get(message.payload.userId);
                    let facingCol = prevAnim?.facingCol ?? 0;
                    if (Math.abs(dx) >= Math.abs(dy)) {
                        if (dx > 0) facingCol = 2;       // right
                        else if (dx < 0) facingCol = 1;  // left
                    } else {
                        if (dy > 0) facingCol = 0;       // down
                        else if (dy < 0) facingCol = 3;  // up
                    }

                    // Preserve current visual position so the smoother continues from
                    // wherever the sprite is right now — no teleport on message arrival.
                    remoteUserAnims.current.set(message.payload.userId, {
                        targetX: newX, targetY: newY,
                        visualX: prevAnim?.visualX ?? existingUser.x,
                        visualY: prevAnim?.visualY ?? existingUser.y,
                        facingCol, lastMoveTime: performance.now(),
                    });

                    const movedUser = { ...existingUser, x: newX, y: newY };
                    usersRef.current = new Map(usersRef.current).set(message.payload.userId, movedUser);
                }
                setUsers(prev => {
                    const next = new Map(prev);
                    const u = next.get(message.payload.userId);
                    if (u) {
                        u.x = message.payload.x;
                        u.y = message.payload.y;
                        next.set(message.payload.userId, u);
                    }
                    return next;
                });
                runProximityCheck();
                break;
            }

            case 'movement-rejected': {
                const rx = message.payload.x;
                const ry = message.payload.y;
                const prevX = currentUserRef.current?.x ?? rx;
                const prevY = currentUserRef.current?.y ?? ry;
                console.log('[movement-rejected] server pos:', rx, ry, '| client pos:', prevX, prevY, '| delta:', rx - prevX, ry - prevY);
                moveAnimRef.current = null;
                moveQueueRef.current = [];
                pendingMoveRef.current = false;
                walkBobRef.current = 0;
                walkFrameRef.current = 0;
                currentUserRef.current = { ...currentUserRef.current!, x: rx, y: ry };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setCurrentUser((prev: any) => ({ ...prev, x: rx, y: ry }));
                // Hard-snap visual position only for large corrections (teleport/anti-cheat).
                // For normal 1-tile rejections the visual is already close enough to avoid jitter.
                if (Math.abs(rx - prevX) > 1 || Math.abs(ry - prevY) > 1) {
                    animPosRef.current = { x: rx, y: ry };
                }
                break;
            }

            case 'user-left': {
                const leftUser = usersRef.current.get(message.payload.userId);
                const nextUsersMap = new Map(usersRef.current);
                nextUsersMap.delete(message.payload.userId);
                usersRef.current = nextUsersMap;
                remoteUserAnims.current.delete(message.payload.userId);
                setUsers(prev => {
                    const next = new Map(prev);
                    next.delete(message.payload.userId);
                    return next;
                });
                if (leftUser) addToast(`${leftUser.username} left`, 'warning');
                runProximityCheck();
                break;
            }

            case 'element-placed':
            case 'item-placed':
            case 'element-deleted':
            case 'item-deleted':
                // Skip self-originated events — the optimistic update already applied this change,
                // and reconciling here would race with (and overwrite) the in-flight batch flush.
                if (message.payload.userId !== currentUserRef.current?.userId) {
                    fetchSpace();
                    fetchInventory();
                }
                break;

            case 'element-moved':
            case 'item-moved':
                fetchSpace();
                fetchInventory();
                break;

            case 'emoted': {
                const { userId: emotedUserId, emoji: emotedEmoji } = message.payload as { userId: string; emoji: string; x: number; y: number };
                setEmotes(prev => [...prev, {
                    userId: emotedUserId,
                    emoji: emotedEmoji,
                    x: message.payload.x,
                    y: message.payload.y,
                    createdAt: Date.now(),
                }]);
                break;
            }

            case 'emote-broadcast': {
                const { userId: emoteUserId, emoteId, expiresAt } = message.payload as { userId: string; emoteId: string; expiresAt: number };
                if (!emoteId) {
                    gs.clearActiveEmote(emoteUserId);
                } else {
                    gs.setActiveEmote(emoteUserId, emoteId, expiresAt);
                }
                if (emoteId && expiresAt > 0) {
                    const delay = expiresAt - Date.now();
                    if (delay > 0) {
                        setTimeout(() => useGameStore.getState().clearActiveEmote(emoteUserId), delay);
                    }
                }
                const liveUser = currentUserRef.current;
                if (liveUser && emoteUserId === liveUser.userId) {
                    gs.setMyActiveEmote(emoteId || null);
                }
                break;
            }

            case 'interacted':
                setInteractions(prev => [...prev, {
                    id: Math.random().toString(36).slice(2),
                    text: message.payload.itemName || message.payload.text || 'Interacted',
                    x: message.payload.x,
                    y: message.payload.y,
                    createdAt: Date.now(),
                }]);
                break;

            case 'chat':
                setChatBubbles(prev => [...prev, {
                    id: Math.random().toString(36).slice(2),
                    username: message.payload.username || 'Unknown',
                    message: message.payload.message,
                    x: message.payload.x,
                    y: message.payload.y,
                    createdAt: Date.now(),
                }]);
                break;

            case 'avatar-changed':
                setUsers(prev => {
                    const next = new Map(prev);
                    const u = next.get(message.payload.userId);
                    if (u) next.set(message.payload.userId, { ...u, avatarId: message.payload.avatarId });
                    return next;
                });
                break;

            case 'gift-announce':
                addToast(`🎁 ${message.payload.fromUsername} sent ${message.payload.itemName} to ${message.payload.recipientUsername}!`, 'success');
                break;

            case 'npc-moved': {
                const { npcId, x: npcX, y: npcY, facing } = message.payload;

                const facingCol: Record<string, number> = { down: 0, left: 1, right: 2, up: 3 };
                if (facing) npcFacing.current.set(npcId, facingCol[facing] ?? 0);

                const currentNpc = npcsRef.current.find(n => n.id === npcId);
                if (currentNpc) {
                    npcAnims.current.set(npcId, {
                        fromX: currentNpc.x, fromY: currentNpc.y,
                        toX: npcX, toY: npcY,
                        startTime: performance.now(),
                        duration: 450,
                    });
                    // Update position in the ref directly — no React state update means no
                    // extra re-render mid player-animation. The rAF tick drives the canvas.
                    const idx = npcsRef.current.indexOf(currentNpc);
                    const updated = npcsRef.current.slice();
                    updated[idx] = { ...currentNpc, x: npcX, y: npcY };
                    npcsRef.current = updated;
                }
                break;
            }

            case 'activity-changed': {
                const uid = message.payload.userId;
                const act = message.payload.activity as Activity;
                if (uid) {
                    setOthersActivity(prev => {
                        const next = new Map(prev);
                        if (act === null) next.delete(uid);
                        else next.set(uid, act);
                        return next;
                    });
                }
                break;
            }

            case 'proximity-chat-message': {
                const pcm = message.payload as ProximityChatMessage;
                if (pcm.roomId === useGameStore.getState().proximityChatRoomId) {
                    gs.addProximityChatMessage(pcm);
                    lastProximityChatAtRef.current = Date.now();
                    if (!useGameStore.getState().showProximityChat) gs.incrementChatUnread();
                }
                break;
            }

            case 'chat-room-update': {
                const { roomId, members } = message.payload as { roomId: string | null; members: { userId: string; username: string }[] };
                const prevRoomId = useGameStore.getState().proximityChatRoomId;
                if (roomId !== prevRoomId) {
                    gs.setProximityChatRoom(roomId, members);
                    gs.setProximityChatMessages([]);
                    gs.resetChatUnread();
                    if (roomId !== null) gs.setShowProximityChat(true);
                } else {
                    gs.setProximityChatRoom(roomId, members);
                }
                break;
            }

            case 'chat-history': {
                const { roomId: histRoomId, messages: histMsgs } = message.payload as {
                    roomId: string;
                    messages: { id: string; senderId: string; senderName: string; content: string; isSystem: boolean; timestamp: number }[];
                };
                console.log('[ProxChat] received chat-history', histRoomId, histMsgs.length, 'messages', 'currentRoomId:', useGameStore.getState().proximityChatRoomId);
                if (histRoomId !== useGameStore.getState().proximityChatRoomId) break;
                if (histMsgs.length > 0) {
                    const divider: ProximityChatMessage = {
                        id: 'divider-history',
                        roomId: histRoomId,
                        senderId: 'system',
                        senderName: 'System',
                        content: 'Earlier messages',
                        timestamp: histMsgs[0].timestamp - 1,
                        isSystem: true,
                        isDivider: true,
                    };
                    gs.setProximityChatMessages([
                        divider,
                        ...histMsgs.map(m => ({ ...m, roomId: histRoomId })),
                    ]);
                    lastProximityChatAtRef.current = Date.now();
                } else {
                    const systemMsg: ProximityChatMessage = {
                        id: `sys-${Date.now()}`,
                        roomId: histRoomId,
                        senderId: 'system',
                        senderName: 'System',
                        content: 'You joined the conversation',
                        timestamp: Date.now(),
                        isSystem: true,
                    };
                    gs.setProximityChatMessages([systemMsg]);
                    lastProximityChatAtRef.current = Date.now();
                }
                break;
            }

            case 'notification': {
                const raw = message.payload as Omit<AppNotification, 'read'>;
                const notif: AppNotification = { ...raw, read: false };
                gs.addNotification(notif);
                if (!useGameStore.getState().showNotifPanel) gs.incrementUnreadCount();
                gs.addNotifToast(notif);
                setTimeout(() => gs.dismissToast(notif.id), 4000);
                if (notif.urgentBanner) gs.setUrgentBanner(notif);
                break;
            }

            case 'board-updated':
                setBoardWsFlag(f => f + 1);
                break;

            case 'rtc:offer':
                if (!peerManagerRef.current) { rtcBufferRef.current.push({ type: 'rtc:offer', data: message }); break; }
                peerManagerRef.current.handleOffer(message.from, message.sdp as RTCSessionDescriptionInit);
                break;

            case 'rtc:answer':
                if (!peerManagerRef.current) { rtcBufferRef.current.push({ type: 'rtc:answer', data: message }); break; }
                peerManagerRef.current.handleAnswer(message.from, message.sdp as RTCSessionDescriptionInit);
                break;

            case 'rtc:ice':
                if (!peerManagerRef.current) { rtcBufferRef.current.push({ type: 'rtc:ice', data: message }); break; }
                peerManagerRef.current.handleIce(message.from, message.candidate as RTCIceCandidateInit);
                break;

            case 'rtc:room-peers':
                for (const peerId of (message.peers as string[])) {
                    peerManagerRef.current?.joinConferencePeer(peerId);
                }
                break;

            case 'rtc:peer-left':
                peerManagerRef.current?.disconnect(message.peerId as string);
                break;

            case 'rtc:knock': {
                const knockMsg = message as { from: string; fromName: string; callType?: 'voice' | 'video' };
                const knockFromId = knockMsg.from;
                const knockFromName = knockMsg.fromName;
                const knockCallType = knockMsg.callType;
                console.log('[Game] rtc:knock received from', knockFromId, '— showing toast');
                const pm = peerManagerRef.current;
                if (!pm) { console.warn('[Game] rtc:knock: peerManagerRef is null'); break; }
                pm.handleKnock(knockFromId);
                // Always show knock toast — receiver must explicitly Accept or Deny.
                // Auto-dismiss after 15 s (treated as deny).
                const knockId = Math.random().toString(36).slice(2);
                setKnockRequests(prev => [...prev, { id: knockId, fromId: knockFromId, fromName: knockFromName, callType: knockCallType }]);
                setTimeout(() => {
                    setKnockRequests(prev => {
                        const still = prev.find(k => k.id === knockId);
                        // Use peerManagerRef.current, not the captured `pm` —
                        // pm could be a stale instance if the WS reconnected in 15 s.
                        if (still) peerManagerRef.current?.denyIncomingKnock(knockFromId);
                        return prev.filter(k => k.id !== knockId);
                    });
                }, 15000);
                break;
            }

            case 'rtc:knock-accept': {
                const acceptFrom = (message as { from: string }).from;
                setKnockPendingPeerIds(prev => { const next = new Set(prev); next.delete(acceptFrom); return next; });
                if (!peerManagerRef.current) { rtcBufferRef.current.push({ type: 'rtc:knock-accept', data: message }); break; }
                peerManagerRef.current.handleKnockAccepted(acceptFrom);
                break;
            }

            case 'rtc:knock-deny': {
                const denyFrom = (message as { from: string }).from;
                setKnockPendingPeerIds(prev => { const next = new Set(prev); next.delete(denyFrom); return next; });
                if (!peerManagerRef.current) { rtcBufferRef.current.push({ type: 'rtc:knock-deny', data: message }); break; }
                peerManagerRef.current.handleKnockDenied(denyFrom);
                break;
            }

            case 'rtc:broadcast-zone-state': {
                const bzMsg = message as { zoneId: string; speakerId: string | null; listenerIds: string[] };
                peerManagerRef.current?.handleBroadcastZoneState(bzMsg.zoneId, bzMsg.speakerId, bzMsg.listenerIds);
                break;
            }

            case 'pong':
                break;
        }
    };
    handleMessageRef.current = handleMessage;

    // Auto-dismiss interaction popup after 3 s (chest stays if no coins found)
    useEffect(() => {
        if (!interactionPopup) return;
        const t = setTimeout(() => setInteractionPopup(null), 3500);
        return () => clearTimeout(t);
    }, [interactionPopup]);

    const sendEmote = (emoteId: string) => {
        const liveUser = currentUserRef.current;
        if (!liveUser || !wsRef.current) return;
        const config = EMOTES.find(e => e.id === emoteId);
        if (!config) return;

        if (config.mode === 'status') {
            const isActive = useGameStore.getState().myActiveEmote === emoteId;
            wsRef.current.send(JSON.stringify({ type: 'status-emote', payload: { emoteId: isActive ? '' : emoteId } }));
        } else {
            // quick: temporary burst via 'emote' WS type
            wsRef.current.send(JSON.stringify({
                type: 'emote',
                payload: { emoji: config.emoji, x: liveUser.x, y: liveUser.y },
            }));
            setEmotes(prev => [...prev, {
                userId: liveUser.userId,
                emoji: config.emoji!,
                x: liveUser.x,
                y: liveUser.y,
                createdAt: Date.now(),
            }]);
            const expiresAt = Date.now() + 5000;
            useGameStore.getState().setActiveEmote(liveUser.userId, emoteId, expiresAt);
            useGameStore.getState().setMyActiveEmote(emoteId);
            setTimeout(() => {
                if (useGameStore.getState().activeEmotes.get(liveUser.userId)?.emoteId === emoteId) {
                    useGameStore.getState().clearActiveEmote(liveUser.userId);
                }
                if (useGameStore.getState().myActiveEmote === emoteId) {
                    useGameStore.getState().setMyActiveEmote(null);
                }
            }, 5000);
        }
    };

    const sendProximityChat = (text: string) => {
        const liveUser = currentUserRef.current;
        const roomId = useGameStore.getState().proximityChatRoomId;
        if (!liveUser || !wsRef.current || !text || !roomId) return;
        wsRef.current.send(JSON.stringify({ type: 'chat-message', payload: { content: text } }));
        const optimistic: ProximityChatMessage = {
            id: `opt-${Date.now()}`,
            roomId,
            senderId: liveUser.userId,
            senderName: liveUser.username,
            content: text,
            timestamp: Date.now(),
        };
        useGameStore.getState().addProximityChatMessage(optimistic);
        lastProximityChatAtRef.current = Date.now();
    };

    const handleMove = (newX: number, newY: number) => {
        if (!currentUserRef.current || !wsRef.current) return;
        if (newX < 0 || newY < 0 || newX > spaceDims.width - 1 || newY > spaceDims.height - 1) {
            bumpAnimRef.current = { startTime: performance.now(), duration: 200 };
            return;
        }
        if (isCellBlocked(newX, newY)) {
            bumpAnimRef.current = { startTime: performance.now(), duration: 200 };
            return;
        }
        // Always cancel any click-based pathfinding queue on a direct key move
        moveQueueRef.current = [];
        // If an animation is already in progress or a move is awaiting server processing,
        // don't start the next move — that causes position desync.
        if (moveAnimRef.current || pendingMoveRef.current) return;
        doMove(newX, newY);
        // Clear sitting when moving
        if (myActivityRef.current !== null) {
            setMyActivity(null);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'activity-changed', payload: { activity: null } }));
            }
        }
        // Edge-based portal detection
        const dims = spaceDims;
        let edge: SpaceEdge | null = null;
        if (newY === 0) edge = 'NORTH';
        else if (newY === dims.height - 1) edge = 'SOUTH';
        else if (newX === dims.width - 1) edge = 'EAST';
        else if (newX === 0) edge = 'WEST';
        if (edge) {
            const portal = portalsRef.current.find(p => p.fromEdge === edge);
            if (portal) setTimeout(() => setPortalTravel(portal), 300);
        }
    };

    const placeItem = useCallback(async (itemId: string, x: number, y: number) => {
        saveUndoSnapshot();
        setPlacing(true);
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/space/place`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ spaceId, itemId, x, y, layer: placementLayer }),
            });
            const data = await res.json();
            if (!res.ok) { setEditorError(data.message || 'Failed to place item'); return; }
            if (data.id) setSelectedPlaced({ type: 'item', id: data.id });
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'item-placed', payload: { spaceId, itemId, x, y } }));
            }
            await Promise.all([fetchSpace(), fetchInventory()]);
        } catch (err) {
            setEditorError('Network error placing item');
            console.error(err);
        } finally {
            setPlacing(false);
        }
    }, [spaceId, authHeaders, fetchSpace, fetchInventory, placementLayer]);

    const placeElement = useCallback(async (elementId: string, x: number, y: number) => {
        saveUndoSnapshot();
        setPlacing(true);
        setEditorError('');
        pendingSelectRef.current = { elementId, x, y };
        try {
            const res = await fetch(`${API}/api/v1/space/element`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ spaceId, elementId, x, y }),
            });
            if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Failed to place element'); return; }
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'element-placed', payload: { spaceId, elementId, x, y } }));
            }
            await fetchSpace();
        } catch (err) {
            setEditorError('Network error placing element');
            console.error(err);
        } finally {
            setPlacing(false);
        }
    }, [spaceId, authHeaders, fetchSpace]);

    const moveElement = useCallback(async (id: string, x: number, y: number) => {
        saveUndoSnapshot();
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/space/element/${id}/move`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ x, y }),
            });
            if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Failed to move element'); return; }
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'element-moved', payload: { spaceId, elementId: id, x, y } }));
            }
            await fetchSpace();
        } catch (err) {
            setEditorError('Network error moving element');
            console.error(err);
        }
    }, [authHeaders, fetchSpace]);

    const moveItem = useCallback(async (id: string, x: number, y: number) => {
        saveUndoSnapshot();
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/space/placed/${id}/move`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify({ x, y }),
            });
            if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Failed to move item'); return; }
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'item-moved', payload: { spaceId, itemId: id, x, y } }));
            }
            await Promise.all([fetchSpace(), fetchInventory()]);
        } catch (err) {
            setEditorError('Network error moving item');
            console.error(err);
        }
    }, [authHeaders, fetchSpace, fetchInventory]);

    const deletePlacedElement = useCallback(async (id: string) => {
        saveUndoSnapshot();
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/space/element`, {
                method: 'DELETE',
                headers: authHeaders,
                body: JSON.stringify({ id }),
            });
            if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Failed to delete element'); return; }
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'element-deleted', payload: { spaceId, elementId: id } }));
            }
            await fetchSpace();
        } catch (err) {
            setEditorError('Network error deleting element');
            console.error(err);
        }
    }, [authHeaders, fetchSpace]);

    const deletePlacedItem = useCallback(async (id: string) => {
        saveUndoSnapshot();
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/space/placed/${id}`, {
                method: 'DELETE',
                headers: authHeaders,
            });
            if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Failed to delete item'); return; }
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'item-deleted', payload: { spaceId, itemId: id } }));
            }
            await Promise.all([fetchSpace(), fetchInventory()]);
        } catch (err) {
            setEditorError('Network error deleting item');
            console.error(err);
        }
    }, [authHeaders, fetchSpace, fetchInventory]);

    const isAreaFree = useCallback((x: number, y: number, w: number, h: number, checkElements = true): boolean => {
        const toCheck = [
            ...placedItemsRef.current.map(p => ({ x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ...(checkElements ? spaceElementsRef.current.map(e => ({ x: e.x, y: e.y, w: e.element.width, h: e.element.height })) : []),
        ];
        return !toCheck.some(p => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
    }, []);

    const paintPlace = useCallback((pos: { x: number; y: number }) => {
        if (!editMode) return;
        if (pos.x < 0 || pos.y < 0 || pos.x >= spaceDims.width || pos.y >= spaceDims.height) return;
        if (eraserMode) {
            const allPlaced = [
                ...spaceElementsRef.current.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
                ...placedItemsRef.current.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ];
            const found = allPlaced.find(p => pos.x >= p.x && pos.x < p.x + p.w && pos.y >= p.y && pos.y < p.y + p.h);
            if (found && !found.id.startsWith('_opt_')) {
                if (!paintSnapshotSaved.current) { saveUndoSnapshot(); paintSnapshotSaved.current = true; }
                if (found.type === 'element') {
                    spaceElementsRef.current = spaceElementsRef.current.filter(e => e.id !== found.id);
                    setSpaceElements(spaceElementsRef.current);
                    deleteBuffer.current.elementIds.push(found.id);
                } else {
                    placedItemsRef.current = placedItemsRef.current.filter(p => p.id !== found.id);
                    setPlacedItems(placedItemsRef.current);
                    deleteBuffer.current.itemIds.push(found.id);
                }
                if (!deleteFlushTimer.current) {
                    deleteFlushTimer.current = setTimeout(() => flushDeleteBatch(), 500);
                }
            }
            return;
        }
        if (selectedElement) {
            if (!isAreaFree(pos.x, pos.y, selectedElement.width, selectedElement.height)) return;
            // Snapshot captured before first optimistic tile so undo restores clean state
            if (!paintSnapshotSaved.current) { saveUndoSnapshot(); paintSnapshotSaved.current = true; }
            // Optimistic: show tile immediately, server syncs in background
            const tempId = `_opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const newEntry: SpaceElement = { id: tempId, element: selectedElement, x: pos.x, y: pos.y };
            spaceElementsRef.current = [...spaceElementsRef.current, newEntry];
            setSpaceElements(spaceElementsRef.current);
            batchBuffer.current.push({ type: 'element', id: selectedElement.id, x: pos.x, y: pos.y });
            if (!batchFlushTimer.current) {
                batchFlushTimer.current = setTimeout(() => flushBatch(), 500);
            }
            return;
        }
        if (selectedItem) {
            if (!isAreaFree(pos.x, pos.y, selectedItem.width, selectedItem.height, false)) return;
            if (!paintSnapshotSaved.current) { saveUndoSnapshot(); paintSnapshotSaved.current = true; }
            const tempId = `_opt_${Date.now()}_${Math.random().toString(36).slice(2)}`;
            const newEntry: PlacedItem = {
                id: tempId,
                item: { id: selectedItem.itemId, name: selectedItem.name, imageUrl: selectedItem.imageUrl, width: selectedItem.width, height: selectedItem.height, blocking: selectedItem.blocking },
                x: pos.x,
                y: pos.y,
                layer: placementLayer,
            };
            placedItemsRef.current = [...placedItemsRef.current, newEntry];
            setPlacedItems(placedItemsRef.current);
            batchBuffer.current.push({ type: 'item', id: selectedItem.itemId, x: pos.x, y: pos.y });
            if (!batchFlushTimer.current) {
                batchFlushTimer.current = setTimeout(() => flushBatch(), 500);
            }
        }
    }, [editMode, eraserMode, selectedElement, selectedItem, placementLayer, isAreaFree, deletePlacedElement, deletePlacedItem, flushBatch, flushDeleteBatch, spaceDims]);

    const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        setCanvasIsOver(false);
        const dragItem = draggedRef.current;
        if (!dragItem) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;
        const checkEls = dragItem.type !== 'inventory-item';
        if (!isAreaFree(pos.x, pos.y, dragItem.width, dragItem.height, checkEls)) {
            setHoverPos(null);
            return;
        }
        if (dragItem.type === 'element' && dragItem.elementId) {
            placeElement(dragItem.elementId, pos.x, pos.y);
        } else if (dragItem.type === 'inventory-item' && dragItem.itemId) {
            placeItem(dragItem.itemId, pos.x, pos.y);
        }
        setHoverPos(null);
        draggedRef.current = null;
    }, [placeItem, placeElement, isAreaFree]);

    const startPaint = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (e.button === 1 || (isSpaceHeld.current && e.button === 0)) {
            e.preventDefault();
            isPanningRef.current = true;
            panStartRef.current = { mouseX: e.clientX, mouseY: e.clientY, panX: panOffsetRef.current.x, panY: panOffsetRef.current.y };
            rerender();
            return;
        }
        if (!editMode) return;
        if (e.button !== 0) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;

        // Sign editing: click a sign in edit mode to set its text
        if (!eraserMode && !selectedElement && !selectedItem) {
            const hitSign = placedItemsRef.current.find(p =>
                p.item.name.toLowerCase() === 'sign' &&
                pos.x >= p.x && pos.x < p.x + p.item.width &&
                pos.y >= p.y && pos.y < p.y + p.item.height
            );
            if (hitSign) {
                setSignEditing({ placedItemId: hitSign.id, text: hitSign.metadata?.text || '' });
                return;
            }
            // NPC drag: click on an NPC in edit mode selects it and starts drag
            const hitNpc = npcsRef.current.find(n => n.x === pos.x && n.y === pos.y);
            if (hitNpc) {
                setSelectedNpcId(hitNpc.id);
                setEditorTab('npcs');
                npcDragRef.current = { id: hitNpc.id };
                return;
            }
        }

        if (eraserMode || selectedElement || selectedItem) {
            isPainting.current = true;
            paintSnapshotSaved.current = false;
            lastPlacedCell.current = pos;
            paintPlace(pos);
        } else if (selectedPlaced) {
            const allPlaced = [
                ...spaceElements.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
                ...placedItems.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ];
            const found = allPlaced.find(p => p.id === selectedPlaced.id && p.type === selectedPlaced.type);
            if (found && pos.x >= found.x && pos.x < found.x + found.w && pos.y >= found.y && pos.y < found.y + found.h) {
                isMoving.current = true;
                moveTarget.current = { type: found.type, id: found.id, origX: found.x, origY: found.y };
                setMovePreview(pos);
            } else {
                setSelectedPlaced(found ? { type: found.type, id: found.id } : null);
            }
        } else {
            const allPlaced = [
                ...spaceElements.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
                ...placedItems.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ];
            const found = allPlaced.find(p => pos.x >= p.x && pos.x < p.x + p.w && pos.y >= p.y && pos.y < p.y + p.h);
            if (found) {
                setSelectedPlaced({ type: found.type, id: found.id });
                setSelectedPlacedGroup([]);
            } else {
                setSelectedPlaced(null);
                setSelectedPlacedGroup([]);
                isSelecting.current = true;
                selectStart.current = pos;
                setSelectionRect({ x1: pos.x, y1: pos.y, x2: pos.x, y2: pos.y });
            }
        }
    };

    const paintMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanningRef.current) {
            const canvas = canvasRef.current;
            if (!canvas) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const dx = (e.clientX - panStartRef.current.mouseX) * scaleX;
            const dy = (e.clientY - panStartRef.current.mouseY) * scaleY;
            panOffsetRef.current = { x: panStartRef.current.panX - dx, y: panStartRef.current.panY - dy };
            rerender();
            return;
        }
        if (!editMode) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;
        if (npcDragRef.current) { setHoverPos(pos); return; }
        if (isSelecting.current && selectStart.current) {
            setSelectionRect({ x1: selectStart.current.x, y1: selectStart.current.y, x2: pos.x, y2: pos.y });
            return;
        }
        const item = selectedElement || selectedItem;
        if (item) {
            setHoverPos(isAreaFree(pos.x, pos.y, item.width, item.height, !selectedItem) ? pos : null);
        } else if (eraserMode) {
            setHoverPos(pos);
        } else if (isMoving.current && moveTarget.current) {
            setMovePreview(pos);
        } else {
            setHoverPos(pos);
        }
        if (isPainting.current && (eraserMode || selectedElement || selectedItem)) {
            if (lastPlacedCell.current && lastPlacedCell.current.x === pos.x && lastPlacedCell.current.y === pos.y) return;
            if (paintTimer.current) return;
            paintTimer.current = setTimeout(() => {
                paintTimer.current = null;
            }, 120);
            lastPlacedCell.current = pos;
            paintPlace(pos);
        }
    };

    const stopPaint = () => {
        isPainting.current = false;
        lastPlacedCell.current = null;
        if (paintTimer.current) { clearTimeout(paintTimer.current); paintTimer.current = null; }
        if (batchBuffer.current.length > 0) {
            if (batchFlushTimer.current) { clearTimeout(batchFlushTimer.current); batchFlushTimer.current = null; }
            flushBatch();
        }
        const db = deleteBuffer.current;
        if (db.elementIds.length > 0 || db.itemIds.length > 0) {
            if (deleteFlushTimer.current) { clearTimeout(deleteFlushTimer.current); deleteFlushTimer.current = null; }
            flushDeleteBatch();
        }
        if (isMoving.current && moveTarget.current && movePreview) {
            const target = moveTarget.current;
            if (movePreview.x !== target.origX || movePreview.y !== target.origY) {
                if (target.type === 'element') moveElement(target.id, movePreview.x, movePreview.y);
                else moveItem(target.id, movePreview.x, movePreview.y);
            }
        }
        if (isSelecting.current && selectionRect) {
            isSelecting.current = false;
            selectStart.current = null;
            const x1 = Math.min(selectionRect.x1, selectionRect.x2);
            const y1 = Math.min(selectionRect.y1, selectionRect.y2);
            const x2 = Math.max(selectionRect.x1, selectionRect.x2);
            const y2 = Math.max(selectionRect.y1, selectionRect.y2);
            const allPlaced = [
                ...spaceElements.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
                ...placedItems.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ];
            const hit = allPlaced.filter(p => p.x < x2 && p.x + p.w > x1 && p.y < y2 && p.y + p.h > y1);
            setSelectedPlacedGroup(hit);
            if (hit.length === 1) setSelectedPlaced({ type: hit[0].type, id: hit[0].id });
            else setSelectedPlaced(null);
            setSelectionRect(null);
        }
        isMoving.current = false;
        moveTarget.current = null;
        setMovePreview(null);
    };

    const handleCanvasContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        if (!editMode) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;
        const allPlaced = [
            ...spaceElements.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
            ...placedItems.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
        ];
        const found = allPlaced.find(p => pos.x >= p.x && pos.x < p.x + p.w && pos.y >= p.y && pos.y < p.y + p.h);
        if (found) {
            if (found.type === 'element') deletePlacedElement(found.id);
            else deletePlacedItem(found.id);
        }
    };

    const handleCanvasMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (isPanningRef.current) {
            isPanningRef.current = false;
            rerender();
            return;
        }
        if (editMode) {
            if (npcPickingPos) {
                const pos = canvasToGrid(e.clientX, e.clientY);
                if (pos) {
                    setNpcForm(f => ({ ...f, x: pos.x, y: pos.y }));
                    setNpcPickingPos(false);
                    setShowNpcModal(true);
                }
                return;
            }
            if (npcDragRef.current) {
                const pos = canvasToGrid(e.clientX, e.clientY);
                const dragId = npcDragRef.current.id;
                npcDragRef.current = null;
                setHoverPos(null);
                if (pos) {
                    const npc = npcsRef.current.find(n => n.id === dragId);
                    if (npc && (npc.x !== pos.x || npc.y !== pos.y)) {
                        fetch(`${API}/api/v1/space/npc/${dragId}`, {
                            method: 'PUT', headers: authHeaders,
                            body: JSON.stringify({ x: pos.x, y: pos.y }),
                        }).then(() => fetchNpcs()).catch(() => {});
                    }
                }
                return;
            }
            stopPaint();
            return;
        }
        if (e.button !== 0) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;
        if (currentUserRef.current && wsRef.current) {
            // NPC click check
            const hitNpc = npcsRef.current.find(n => n.x === pos.x && n.y === pos.y);
            if (hitNpc) {
                setNpcDialogue({ npc: hitNpc, idx: 0 });
                return;
            }

            const allItems = [
                ...placedItems.map(p => ({ type: 'item' as const, id: p.id, itemId: p.item.id, name: p.item.name, x: p.x, y: p.y, w: p.item.width, h: p.item.height, metadata: p.metadata })),
            ];
            const hitItem = allItems.find(p => pos.x >= p.x && pos.x < p.x + p.w && pos.y >= p.y && pos.y < p.y + p.h);
            if (hitItem) {
                const nameLow = hitItem.name.toLowerCase();
                if (nameLow === 'sign') {
                    const signText = hitItem.metadata?.text || 'Welcome to my space!';
                    setInteractionPopup({ type: 'sign', title: '📋 Sign', text: signText });
                    return;
                }
                if (nameLow === 'chest') {
                    const pid = hitItem.id;
                    (async () => {
                        try {
                            const res = await fetch(`${API}/api/v1/economy/interact`, {
                                method: 'POST',
                                headers: authHeaders,
                                body: JSON.stringify({ placedItemId: pid }),
                            });
                            const data = await res.json();
                            setInteractionPopup({ type: 'chest', title: '🎁 Chest', text: data.message || 'Nothing found.' });
                        } catch {
                            setInteractionPopup({ type: 'chest', title: '🎁 Chest', text: 'Nothing found.' });
                        }
                    })();
                    return;
                }
                if (nameLow === 'campfire') {
                    setInteractionPopup({ type: 'campfire', title: '🔥 Campfire', text: 'You warm yourself by the fire. +5 mood' });
                    campfireWarmUntil.current = Date.now() + 3000;
                    return;
                }
                if (nameLow === 'fountain') {
                    setInteractionPopup({ type: 'fountain', title: '💧 Fountain', text: 'You drink from the fountain. Refreshing!' });
                    return;
                }
                // Generic interact broadcast
                wsRef.current.send(JSON.stringify({
                    type: 'interact',
                    payload: { itemId: hitItem.itemId, itemName: hitItem.name, x: pos.x, y: pos.y },
                }));
                return;
            }
            const targetUser = [...users.values()].find(u =>
                Math.abs(u.x - pos.x) === 0 && Math.abs(u.y - pos.y) === 0
            );
            if (targetUser) {
                setPlayerPopup({ userId: targetUser.userId, username: targetUser.username, avatarId: targetUser.avatarId, x: targetUser.x, y: targetUser.y });
                setPlayerPopupVisible(false);
                requestAnimationFrame(() => setPlayerPopupVisible(true));
                return;
            }
            const liveUser = currentUserRef.current;
            if (liveUser && (pos.x !== liveUser.x || pos.y !== liveUser.y)) {
                const path = findPath(liveUser.x, liveUser.y, pos.x, pos.y);
                if (path.length > 0) {
                    moveQueueRef.current = path;
                    processWalkQueue();
                }
            }
        }
    };

    const handleCanvasMouseMove = paintMove;

    const handlePostGuestbook = async () => {
        if (!gbMessage.trim()) return;
        try {
            const res = await fetch(`${API}/api/v1/guestbook/${spaceId}`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ message: gbMessage.trim() }),
            });
            if (res.ok) {
                setGbMessage('');
                fetchGuestbook();
            }
        } catch (err) {
            console.error(err);
        }
    };

    const handleSendGift = async (itemId: string) => {
        if (!giftTarget) return;
        setGiftSending(true);
        setGiftMsg("");
        try {
            const res = await fetch(`${API}/api/v1/gift/send`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ itemId, recipientId: giftTarget.userId }),
            });
            const data = await res.json();
            if (res.ok) {
                setGiftMsg(`Sent ${data.item?.name || "item"} to ${giftTarget.username}!`);
                if (wsRef.current) {
                    wsRef.current.send(JSON.stringify({ type: 'gift', payload: { itemName: data.item?.name, recipientUsername: giftTarget.username } }));
                }
                fetchInventory();
            } else {
                setGiftMsg(data.message || "Failed to send");
            }
        } catch {
            setGiftMsg("Network error");
        } finally {
            setGiftSending(false);
        }
    };

    useEffect(() => {
        const canvas = canvasRef.current;
        const container = containerRef.current;
        if (!canvas || !container) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Keep the canvas backing-store resolution in sync with its displayed (container) size.
        // If this drifts (e.g. canvas still at its default 300x150 while CSS stretches it to fill
        // the container), the world/camera math below is computed in the wrong coordinate space
        // and the world renders shifted off-canvas to the left/top.
        const cw = container.clientWidth;
        const ch = container.clientHeight;
        if (cw > 0 && ch > 0 && (canvas.width !== cw || canvas.height !== ch)) {
            canvas.width = cw;
            canvas.height = ch;
        }

        const zoom = zoomRef.current;
        const vpW = canvas.width;
        const vpH = canvas.height;
        const preWorldW = spaceDims.width * 50;
        const preWorldH = spaceDims.height * 50;
        const worldW = preWorldW * zoom;
        const worldH = preWorldH * zoom;

        // When the world fits inside the viewport, center it; otherwise clamp the camera so it
        // pans to follow the player without ever exposing space beyond the world's edges.
        const offsetX = Math.max(0, Math.floor((vpW - worldW) / 2));
        const offsetY = Math.max(0, Math.floor((vpH - worldH) / 2));
        const playerCX = (currentUser ? animPosRef.current.x : 0) * 50 * zoom + 25 * zoom;
        const playerCY = (currentUser ? animPosRef.current.y : 0) * 50 * zoom + 25 * zoom;
        // No Math.round here — rounding the camera position while animPos moves continuously
        // creates a ±0.5px oscillation every frame (the camera snaps +5 or +6px per frame
        // while the player moves +5.5px, alternating each frame → visible directional jitter).
        const baseCamX = worldW < vpW ? 0 : Math.max(0, Math.min(worldW - vpW, playerCX - vpW / 2));
        const baseCamY = worldH < vpH ? 0 : Math.max(0, Math.min(worldH - vpH, playerCY - vpH / 2));
        const camX = baseCamX + panOffsetRef.current.x;
        const camY = baseCamY + panOffsetRef.current.y;
        camRef.current = { x: camX, y: camY, offsetX, offsetY };

        ctx.clearRect(0, 0, vpW, vpH);
        ctx.fillStyle = '#9aa3b5';
        ctx.fillRect(0, 0, vpW, vpH);
        ctx.save();
        ctx.translate(offsetX - camX, offsetY - camY);
        ctx.scale(zoom, zoom);

        // Empty background — user must place tiles to fill the canvas
        ctx.fillStyle = '#f0fdf4';
        ctx.fillRect(0, 0, preWorldW, preWorldH);

        // Grid lines (subtle)
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 1 / zoom;
        for (let i = 0; i <= preWorldW; i += 50) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, preWorldH); ctx.stroke();
        }
        for (let i = 0; i <= preWorldH; i += 50) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(preWorldW, i); ctx.stroke();
        }

        spaceElements.forEach(e => {
            const x = e.x * 50;
            const y = e.y * 50;
            const w = e.element.width * 50;
            const h = e.element.height * 50;
            // Prefer frontend-hosted tile sprite, fall back to API-hosted imageUrl
            const tileUrl = TILE_IMAGE[e.element.id] || e.element.imageUrl;
            drawImageOnCanvas(ctx, tileUrl, x, y, w, h, '#ede9fe', 'rgba(0,0,0,0.15)');
            if (e.failedToSave) {
                ctx.fillStyle = 'rgba(220, 38, 38, 0.4)';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            }
        });

        placedItems.filter(p => p.layer !== 'WALL').forEach(p => {
            const x = p.x * 50;
            const y = p.y * 50;
            const w = p.item.width * 50;
            const h = p.item.height * 50;
            const itemUrl = ITEM_IMAGE[p.item.id] || p.item.imageUrl;
            drawImageOnCanvas(ctx, itemUrl, x, y, w, h, '#fef3c7', 'rgba(0,0,0,0.20)', (editMode && !selectedItem && !selectedElement) ? p.item.name : undefined);
            if (p.failedToSave) {
                ctx.fillStyle = 'rgba(220, 38, 38, 0.4)';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            }
        });

        // Edge portals — arrow indicators at map boundaries
        const portalPulse = 0.6 + 0.4 * Math.sin((performance.now() / 500) % (Math.PI * 2));
        portals.forEach(portal => {
            const W = spaceDims.width * 50;
            const H = spaceDims.height * 50;
            ctx.save();
            ctx.globalAlpha = portalPulse;
            ctx.fillStyle = '#7c3aed';
            ctx.strokeStyle = '#c4b5fd';
            ctx.lineWidth = 2;
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            const label = portal.label;
            if (portal.fromEdge === 'NORTH') {
                const cx = W / 2, cy = 18;
                ctx.beginPath(); ctx.moveTo(cx, cy - 10); ctx.lineTo(cx - 10, cy + 6); ctx.lineTo(cx + 10, cy + 6); ctx.closePath();
                ctx.fill(); ctx.stroke();
                ctx.globalAlpha = 1; ctx.fillStyle = '#5b21b6';
                ctx.fillText(`↑ ${label}`, cx, cy + 18);
            } else if (portal.fromEdge === 'SOUTH') {
                const cx = W / 2, cy = H - 18;
                ctx.beginPath(); ctx.moveTo(cx, cy + 10); ctx.lineTo(cx - 10, cy - 6); ctx.lineTo(cx + 10, cy - 6); ctx.closePath();
                ctx.fill(); ctx.stroke();
                ctx.globalAlpha = 1; ctx.fillStyle = '#5b21b6';
                ctx.fillText(`↓ ${label}`, cx, cy - 18);
            } else if (portal.fromEdge === 'EAST') {
                const cx = W - 18, cy = H / 2;
                ctx.beginPath(); ctx.moveTo(cx + 10, cy); ctx.lineTo(cx - 6, cy - 10); ctx.lineTo(cx - 6, cy + 10); ctx.closePath();
                ctx.fill(); ctx.stroke();
                ctx.globalAlpha = 1; ctx.fillStyle = '#5b21b6';
                ctx.save(); ctx.translate(cx - 20, cy); ctx.rotate(-Math.PI / 2); ctx.fillText(`→ ${label}`, 0, 0); ctx.restore();
            } else if (portal.fromEdge === 'WEST') {
                const cx = 18, cy = H / 2;
                ctx.beginPath(); ctx.moveTo(cx - 10, cy); ctx.lineTo(cx + 6, cy - 10); ctx.lineTo(cx + 6, cy + 10); ctx.closePath();
                ctx.fill(); ctx.stroke();
                ctx.globalAlpha = 1; ctx.fillStyle = '#5b21b6';
                ctx.save(); ctx.translate(cx + 20, cy); ctx.rotate(Math.PI / 2); ctx.fillText(`← ${label}`, 0, 0); ctx.restore();
            }
            ctx.restore();
        });

        if (editMode && currentUser) {
            ctx.strokeStyle = 'rgba(79, 70, 229, 0.25)';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.arc(currentUser.x * 50, currentUser.y * 50, 5 * 50, 0, Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        interactions.forEach(int => {
            const alpha = Math.max(0, 1 - (Date.now() - int.createdAt) / 3000);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = '#1f2937';
            ctx.font = '12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(int.text, int.x * 50, int.y * 50 - 40);
            ctx.globalAlpha = 1;
        });

        if (currentUser) {
            // Auto-detect working: sitting + adjacent to computer or office desk
            const curActivity = myActivityRef.current;
            let effectiveActivity: Activity = curActivity;
            if (curActivity === 'sitting') {
                const adjComputer = placedItems.find(p =>
                    (p.item.id === 'item-computer' || p.item.id === 'item-office-desk') &&
                    Math.abs(p.x - currentUser.x) <= 1 && Math.abs(p.y - currentUser.y) <= 1
                );
                if (adjComputer) effectiveActivity = 'working';
            }

            const effectiveAvatarId = currentUser.avatarId ?? 'avatar-intern';
            preloadAvatarImage(effectiveAvatarId);
            const avatarUrl = `/avatars/${effectiveAvatarId}.png`;
            const img = imageCache.current.get(avatarUrl);
            const bump = bumpAnimRef.current;
            const bumpOff = bump ? Math.sin((performance.now() - bump.startTime) / bump.duration * Math.PI * 4) * 4 * Math.max(0, 1 - (performance.now() - bump.startTime) / bump.duration) : 0;
            const cx = animPosRef.current.x * 50 + bumpOff;
            const cy = animPosRef.current.y * 50 - walkBobRef.current;
            const myStatusEmote = activeEmotes.get(currentUser.userId);
            const myEmoteId = myStatusEmote?.emoteId;
            const myEmoteUrl = myEmoteId ? `/emotes/${effectiveAvatarId.replace('avatar-', '')}/${myEmoteId}.png` : null;
            if (myEmoteId) preloadEmoteImage(effectiveAvatarId, myEmoteId);
            const myEmoteImg = myEmoteUrl ? imageCache.current.get(myEmoteUrl) : null;
            const myEmoteReady = !!(myEmoteImg && myEmoteImg.complete && myEmoteImg.naturalWidth > 0);
            if (myEmoteId === 'afk') ctx.globalAlpha = 0.6;
            if (myEmoteReady && myEmoteId) {
                const frames = EMOTE_FRAMES[myEmoteId] ?? 1;
                const frame = Math.floor(Date.now() / 200) % frames;
                const [cropX, cropY, cropW, cropH] = EMOTE_CROP[myEmoteId] ?? [16, 15, 32, 48];
                console.log('EMOTE', { src: [frame * 64 + cropX, cropY, cropW, cropH], dest: [cx - 16, cy - 24, 32, 48], sheetW: myEmoteImg!.naturalWidth });
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(myEmoteImg!, frame * 64 + cropX, cropY, cropW, cropH, cx - 16, cy - 24, 32, 48);
                ctx.imageSmoothingEnabled = true;
            } else if (img && img.complete && img.naturalWidth > 0) {
                const dirCol = { down: 0, left: 1, right: 2, up: 3 }[facingRef.current] ?? 0;
                const sx = dirCol * 32;
                const sy = walkFrameRef.current * 48;
                console.log('AVATAR', { src: [sx, sy, 32, 48], dest: [cx - 16, cy - 24, 32, 48], sheetW: img.naturalWidth });
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, sx, sy, 32, 48, cx - 16, cy - 24, 32, 48);
                ctx.imageSmoothingEnabled = true;
            } else {
                ctx.beginPath();
                ctx.fillStyle = imageLoadFailed.current.has(avatarUrl) ? '#FF6B6B' : '#6366f1';
                ctx.arc(cx, cy, 16, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((currentUser.username[0] ?? '?').toUpperCase(), cx, cy);
                ctx.textBaseline = 'alphabetic';
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(currentUser.username, cx, cy + 28);
            if (effectiveActivity) {
                ctx.font = '16px sans-serif';
                ctx.fillText(effectiveActivity === 'working' ? '💻' : '💺', cx, cy - 38);
            }
        }

        users.forEach(user => {
            const effectiveAvatarId = user.avatarId ?? 'avatar-intern';
            preloadAvatarImage(effectiveAvatarId);
            const avatarUrl = `/avatars/${effectiveAvatarId}.png`;
            const img = imageCache.current.get(avatarUrl);

            // Visual position is already smoothed by the rAF tick — just read it.
            const rAnim = remoteUserAnims.current.get(user.userId);
            let facingCol = 0, isWalking = false, bob = 0;
            const rx = rAnim?.visualX ?? user.x;
            const ry = rAnim?.visualY ?? user.y;
            if (rAnim) {
                facingCol = rAnim.facingCol;
                isWalking = (performance.now() - rAnim.lastMoveTime) < 300;
                if (isWalking) bob = Math.sin(performance.now() / 80) * 2;
            }
            const walkFrame = isWalking ? Math.floor(performance.now() / 100) % 2 : 0;
            const ux = rx * 50, uy = ry * 50;

            const userStatusEmote = activeEmotes.get(user.userId);
            const uEmoteId = userStatusEmote?.emoteId;
            const uEmoteUrl = uEmoteId ? `/emotes/${effectiveAvatarId.replace('avatar-', '')}/${uEmoteId}.png` : null;
            if (uEmoteId) preloadEmoteImage(effectiveAvatarId, uEmoteId);
            const uEmoteImg = uEmoteUrl ? imageCache.current.get(uEmoteUrl) : null;
            const uEmoteReady = !!(uEmoteImg && uEmoteImg.complete && uEmoteImg.naturalWidth > 0);
            // Speaking ring — pulsing purple arc drawn behind the avatar
            if (speakingPeerIdsRef.current.has(user.userId)) {
                ctx.beginPath();
                ctx.arc(ux, uy, 20, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(139,92,246,${0.45 + 0.45 * Math.sin(Date.now() / 200)})`;
                ctx.lineWidth = 2.5;
                ctx.stroke();
            }
            if (uEmoteId === 'afk') ctx.globalAlpha = 0.6;
            if (uEmoteReady && uEmoteId) {
                const frames = EMOTE_FRAMES[uEmoteId] ?? 1;
                const frame = Math.floor(Date.now() / 200) % frames;
                const [cropX, cropY, cropW, cropH] = EMOTE_CROP[uEmoteId] ?? [23, 18, 18, 42];
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(uEmoteImg!, frame * 64 + cropX, cropY, cropW, cropH, ux - 16, uy - 24, 32, 48);
                ctx.imageSmoothingEnabled = true;
            } else if (img && img.complete && img.naturalWidth > 0) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, facingCol * 32, walkFrame * 48, 32, 48, ux - 16, uy - 24 - bob, 32, 48);
                ctx.imageSmoothingEnabled = true;
            } else {
                ctx.beginPath();
                ctx.fillStyle = imageLoadFailed.current.has(avatarUrl) ? '#4ECDC4' : '#6366f1';
                ctx.arc(ux, uy, 16, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#fff';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((user.username[0] ?? '?').toUpperCase(), ux, uy);
                ctx.textBaseline = 'alphabetic';
            }
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#000';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(user.username, ux, uy + 28);
            // Activity emoji
            const uActivity = othersActivity.get(user.userId);
            if (uActivity) {
                ctx.font = '16px sans-serif';
                ctx.fillText(uActivity === 'working' ? '💻' : '💺', ux, uy - 38);
            }
            // 👂 proximity indicator when actively typing in proximity chat
            if (currentUser && proximityChatIsTyping) {
                const dist = Math.sqrt((user.x - currentUser.x) ** 2 + (user.y - currentUser.y) ** 2);
                if (dist <= 4) {
                    ctx.font = '14px sans-serif';
                    ctx.globalAlpha = 1;
                    ctx.fillText('👂', ux, uy - 68);
                }
            }
            // 📞 pulsing indicator above avatar while a knock is pending for this peer
            if (knockPendingPeerIdsRef.current.has(user.userId)) {
                ctx.font = '16px sans-serif';
                ctx.globalAlpha = 0.5 + 0.5 * Math.sin(Date.now() / 300);
                ctx.fillText('📞', ux, uy - 52);
                ctx.globalAlpha = 1;
            }
        });

        // Wall-layer items render after players so they appear in front
        placedItems.filter(p => p.layer === 'WALL').forEach(p => {
            const x = p.x * 50;
            const y = p.y * 50;
            const w = p.item.width * 50;
            const h = p.item.height * 50;
            const itemUrl = ITEM_IMAGE[p.item.id] || p.item.imageUrl;
            drawImageOnCanvas(ctx, itemUrl, x, y, w, h, '#fef3c7', 'rgba(0,0,0,0.20)', (editMode && !selectedItem && !selectedElement) ? p.item.name : undefined);
            if (p.failedToSave) {
                ctx.fillStyle = 'rgba(220, 38, 38, 0.4)';
                ctx.fillRect(x, y, w, h);
                ctx.strokeStyle = 'rgba(220, 38, 38, 0.9)';
                ctx.lineWidth = 2;
                ctx.strokeRect(x + 1, y + 1, w - 2, h - 2);
            }
        });

        // NPCs — smooth interpolated movement (read from ref so NPC moves don't re-render)
        npcsRef.current.forEach(npc => {
            preloadAvatarImage(npc.sprite);
            const avatarUrl = `/avatars/${npc.sprite}.png`;
            const img = imageCache.current.get(avatarUrl);

            const motionType = npc.motionType ?? 'PATROL';
            const isStatic = motionType === 'STATIC';

            // STATIC NPCs: fixed position, no tween, no animation
            let rx = npc.x, ry = npc.y, isWalking = false;
            if (!isStatic) {
                const anim = npcAnims.current.get(npc.id);
                if (anim) {
                    const t = Math.min((performance.now() - anim.startTime) / anim.duration, 1);
                    const eased = t * (2 - t);
                    rx = anim.fromX + (anim.toX - anim.fromX) * eased;
                    ry = anim.fromY + (anim.toY - anim.fromY) * eased;
                    isWalking = t < 1;
                }
            }
            const px = rx * 50;
            const py = ry * 50;

            // STATIC: always face down (col 0, frame 0); PATROL/WANDER: animated
            const dirCol  = isStatic ? 0 : (npcFacing.current.get(npc.id) ?? 0);
            const walkFrame = (!isStatic && isWalking) ? (Math.floor(performance.now() / 100) % 2) : 0;
            const bob = (!isStatic && isWalking) ? Math.sin(performance.now() / 100) * 2 : 0;

            if (img && img.complete && img.naturalWidth > 0) {
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, dirCol * 32, walkFrame * 48, 32, 48, px - 16, py - 24 - bob, 32, 48);
                ctx.imageSmoothingEnabled = true;
            } else {
                ctx.beginPath();
                ctx.fillStyle = '#FFD700';
                ctx.arc(px, py, 16, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#1a1a1a';
                ctx.font = 'bold 13px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText((npc.name[0] ?? '?').toUpperCase(), px, py);
                ctx.textBaseline = 'alphabetic';
            }
            ctx.shadowColor = 'rgba(0,0,0,0.8)';
            ctx.shadowBlur = 3;
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(npc.name, px, py + 28);
            ctx.font = '14px sans-serif';
            ctx.fillText('💬', px, py - 42);
            ctx.shadowBlur = 0;
        });

        // NPC selection highlight in edit mode
        if (editMode && selectedNpcId) {
            const selNpc = npcsRef.current.find(n => n.id === selectedNpcId);
            if (selNpc) {
                const anim = npcAnims.current.get(selNpc.id);
                let sx = selNpc.x, sy = selNpc.y;
                if (anim) {
                    const t = Math.min((performance.now() - anim.startTime) / anim.duration, 1);
                    sx = anim.fromX + (anim.toX - anim.fromX) * (t * (2 - t));
                    sy = anim.fromY + (anim.toY - anim.fromY) * (t * (2 - t));
                }
                ctx.strokeStyle = '#f59e0b';
                ctx.lineWidth = 3;
                ctx.setLineDash([5, 3]);
                ctx.beginPath();
                ctx.arc(sx * 50, sy * 50, 28, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Proximity chat: full opacity within 4 tiles, 40% for 5-10, hidden beyond 10
        chatBubbles.forEach(b => {
            const dist = currentUser
                ? Math.sqrt((b.x - currentUser.x) ** 2 + (b.y - currentUser.y) ** 2)
                : 0;
            if (dist > 10) return;
            const proximity = dist <= 4 ? 1 : 0.4;
            const fade = Math.max(0, 1 - (Date.now() - b.createdAt) / 4000);
            ctx.globalAlpha = fade * proximity;
            const fontSize = dist <= 4 ? 12 : 10;
            const text = `${b.username}: ${b.message}`;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.textAlign = 'center';
            const metrics = ctx.measureText(text);
            const pad = 6;
            const bx = b.x * 50 - metrics.width / 2 - pad;
            const by = b.y * 50 - 70;
            ctx.fillStyle = 'rgba(0,0,0,0.75)';
            ctx.beginPath();
            ctx.roundRect(bx, by, metrics.width + pad * 2, 22, 6);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.fillText(text, b.x * 50, by + 15);
            ctx.globalAlpha = 1;
        });

        // ── Proximity chat thought bubbles ──────────────────────────────────────
        const chatActiveMs = 8000;
        if (currentUser && proximityChatMembers.length > 0 && Date.now() - lastProximityChatAtRef.current < chatActiveMs) {
            const memberUserIds = proximityChatMembers.map(m => m.userId);
            const memberPositions: { x: number; y: number }[] = [{ x: currentUser.x, y: currentUser.y }];
            for (const uid of memberUserIds) {
                const u = users.get(uid);
                if (u) memberPositions.push({ x: u.x, y: u.y });
            }
            const cx = (memberPositions.reduce((s, p) => s + p.x, 0) / memberPositions.length) * 50 + 25;
            const cy = (memberPositions.reduce((s, p) => s + p.y, 0) / memberPositions.length) * 50;
            const fade = Math.max(0, 1 - (Date.now() - lastProximityChatAtRef.current) / chatActiveMs);
            ctx.globalAlpha = 0.9 * fade;
            // Main bubble
            ctx.fillStyle = 'rgba(255,255,255,0.95)';
            ctx.beginPath();
            ctx.arc(cx, cy - 38, 18, 0, Math.PI * 2);
            ctx.fill();
            // Medium dot
            ctx.beginPath();
            ctx.arc(cx + 10, cy - 16, 7, 0, Math.PI * 2);
            ctx.fill();
            // Small dot
            ctx.beginPath();
            ctx.arc(cx + 16, cy - 5, 4, 0, Math.PI * 2);
            ctx.fill();
            // "..." text
            ctx.fillStyle = '#4d495f';
            ctx.font = 'bold 13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('...', cx, cy - 33);
            ctx.globalAlpha = 1;
        }

        if (editMode && hoverPos) {
            const item = selectedElement || selectedItem;
            const w = (item ? item.width : 1) * 50;
            const h = (item ? item.height : 1) * 50;
            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(hoverPos.x * 50, hoverPos.y * 50, w, h);
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(79, 70, 229, 0.08)';
            ctx.fillRect(hoverPos.x * 50, hoverPos.y * 50, w, h);
        }

        if (editMode && selectedPlaced) {
            const found = [
                ...spaceElements.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
                ...placedItems.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ].find(p => p.id === selectedPlaced.id && p.type === selectedPlaced.type);
            if (found) {
                ctx.strokeStyle = '#4f46e5';
                ctx.lineWidth = 3;
                ctx.setLineDash([8, 4]);
                ctx.strokeRect(found.x * 50, found.y * 50, found.w * 50, found.h * 50);
                ctx.setLineDash([]);
            }
        }

        if (editMode && selectedPlacedGroup.length > 0) {
            const allPlaced = [
                ...spaceElements.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
                ...placedItems.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ];
            selectedPlacedGroup.forEach(s => {
                const found = allPlaced.find(p => p.id === s.id && p.type === s.type);
                if (found) {
                    ctx.strokeStyle = '#7c3aed';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([6, 4]);
                    ctx.strokeRect(found.x * 50, found.y * 50, found.w * 50, found.h * 50);
                    ctx.setLineDash([]);
                    ctx.fillStyle = 'rgba(124, 58, 237, 0.08)';
                    ctx.fillRect(found.x * 50, found.y * 50, found.w * 50, found.h * 50);
                }
            });
        }

        if (editMode && movePreview && moveTarget.current) {
            const target = moveTarget.current;
            const found = [
                ...spaceElements.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
                ...placedItems.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ].find(p => p.id === target.id && p.type === target.type);
            if (found) {
                ctx.strokeStyle = '#059669';
                ctx.lineWidth = 2;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(movePreview.x * 50, movePreview.y * 50, found.w * 50, found.h * 50);
                ctx.setLineDash([]);
                ctx.fillStyle = 'rgba(5, 150, 105, 0.12)';
                ctx.fillRect(movePreview.x * 50, movePreview.y * 50, found.w * 50, found.h * 50);
            }
        }

        if (editMode && selectionRect) {
            const x = Math.min(selectionRect.x1, selectionRect.x2) * 50;
            const y = Math.min(selectionRect.y1, selectionRect.y2) * 50;
            const w = Math.abs(selectionRect.x2 - selectionRect.x1) * 50;
            const h = Math.abs(selectionRect.y2 - selectionRect.y1) * 50;
            ctx.strokeStyle = '#4f46e5';
            ctx.lineWidth = 2;
            ctx.setLineDash([6, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);
            ctx.fillStyle = 'rgba(79, 70, 229, 0.1)';
            ctx.fillRect(x, y, w, h);
        }

        ctx.restore();

        // Campfire warm overlay (viewport-space, after restore)
        if (Date.now() < campfireWarmUntil.current) {
            const progress = (campfireWarmUntil.current - Date.now()) / 3000;
            ctx.globalAlpha = 0.15 * progress;
            ctx.fillStyle = '#ff6a00';
            ctx.fillRect(0, 0, vpW, vpH);
            ctx.globalAlpha = 1;
        }
    // npcs intentionally omitted — canvas reads npcsRef.current (always current) so NPC
    // position broadcasts don't trigger extra re-renders that could interrupt player animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [currentUser, users, portals, placedItems, spaceElements, interactions, hoverPos, selectedPlaced, selectedPlacedGroup, selectedElement, selectedItem, editMode, renderTick, spaceDims, movePreview, moveTarget, selectionRect, chatBubbles, myActivity, othersActivity, selectedNpcId, proximityChatMembers, proximityChatRoomId, proximityChatIsTyping]);

    return (
        <div style={{ fontFamily: 'system-ui', background: '#9aa3b5', position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden', animation: 'ovPop 0.18s cubic-bezier(.2,.8,.3,1)' }}>
            {/* ── Header (light glass bar) ── */}
            <header style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', gap: 12, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)', borderBottom: '1px solid #ecebf3', boxShadow: '0 1px 0 rgba(22,15,52,0.03)' }}>
                {/* Left: back + logo + space name + theme chip */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <button onClick={() => navigate('/lobby')} title="Back to lobby" style={{ width: 34, height: 34, borderRadius: 9, border: '1px solid #e3e1ee', background: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, color: '#4d495f' }}>
                        <ArrowLeft size={16} />
                    </button>
                    <img src="/logo.svg" alt="" style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0 }} />
                    <div style={{ width: 1, height: 24, background: '#ecebf3', flexShrink: 0 }} />
                    <h1 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#191427', letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spaceName || 'Arena'}</h1>
                    {spaceName && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#6f6b82', background: '#f4f3f9', borderRadius: 999, padding: '3px 9px', flexShrink: 0 }}>
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#6d28d9', flexShrink: 0 }} />
                            Space
                        </span>
                    )}
                </div>
                {/* Right: status + avatar stack + coins + controls */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                    {/* Connected pill */}
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: connected ? '#15a34a' : '#dc2626' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: connected ? '#15a34a' : '#dc2626', boxShadow: connected ? '0 0 0 3px #d9f3e2' : 'none' }} />
                        {connected ? 'Connected' : 'Offline'}
                    </span>
                    {/* Pixel avatar stack */}
                    {(() => {
                        const allUsers = [
                            ...(currentUser ? [{ userId: currentUser.userId, avatarId: currentUser.avatarId }] : []),
                            ...Array.from(users.values()).map(u => ({ userId: u.userId, avatarId: u.avatarId })),
                        ].slice(0, 3);
                        const total = users.size + (currentUser ? 1 : 0);
                        return (
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                <div style={{ display: 'flex' }}>
                                    {allUsers.map((u, i) => (
                                        <div key={u.userId} style={{ marginLeft: i ? -7 : 0, borderRadius: '50%', background: '#fff', padding: 2, position: 'relative', zIndex: 3 - i, border: '1.5px solid #ecebf3' }}>
                                            <PixelAvatar avatarId={u.avatarId} size={18} />
                                        </div>
                                    ))}
                                </div>
                                <span style={{ fontSize: 12.5, color: '#6f6b82', fontWeight: 600 }}>{total}</span>
                            </div>
                        );
                    })()}
                    {/* Coin balance */}
                    {walletCoins !== null && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 700, color: '#b25e09', background: '#fdf3e3', borderRadius: 999, padding: '4px 12px' }}>
                            <Coins size={14} />{walletCoins.toLocaleString()}
                        </span>
                    )}
                    {/* Bell button */}
                    <button
                        title="Notifications"
                        onClick={() => useGameStore.getState().toggleNotifPanel()}
                        style={{ position: 'relative', width: 34, height: 34, borderRadius: 9, border: '1px solid #e3e1ee', background: showNotifPanel ? '#f4f0fe' : '#fff', color: showNotifPanel ? '#6d28d9' : '#4d495f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                    >
                        <Bell size={16} />
                        {unreadCount > 0 && (
                            <span style={{ position: 'absolute', top: -4, right: -4, background: '#ef4444', color: '#fff', borderRadius: '50%', width: 16, height: 16, fontSize: 9, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #fff' }}>
                                {unreadCount > 9 ? '9+' : unreadCount}
                            </span>
                        )}
                    </button>
                    <div style={{ width: 1, height: 24, background: '#ecebf3' }} />
                    {/* Icon button group */}
                    <div style={{ display: 'flex', gap: 2, padding: 3, background: '#f4f3f9', borderRadius: 9 }}>
                        <button title="Guestbook" onClick={() => { setShowGuestbook(!showGuestbook); setShowQuests(false); }} style={{ width: 32, height: 32, borderRadius: 7, border: showGuestbook ? '1px solid #e7ddfb' : '1px solid transparent', background: showGuestbook ? '#f4f0fe' : 'transparent', color: showGuestbook ? '#5b21b6' : '#4d495f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <BookOpen size={16} />
                        </button>
                        <button title="Quests" onClick={() => { setShowQuests(!showQuests); setShowGuestbook(false); }} style={{ width: 32, height: 32, borderRadius: 7, border: showQuests ? '1px solid #e7ddfb' : '1px solid transparent', background: showQuests ? '#f4f0fe' : 'transparent', color: showQuests ? '#5b21b6' : '#4d495f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Trophy size={16} />
                        </button>
                        <button title="Board" onClick={() => setShowBoard(b => !b)} style={{ width: 32, height: 32, borderRadius: 7, border: showBoard ? '1px solid #e7ddfb' : '1px solid transparent', background: showBoard ? '#f4f0fe' : 'transparent', color: showBoard ? '#5b21b6' : '#4d495f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 15 }}>
                            📋
                        </button>
                        {!isGuest && (
                            <button title={editMode ? 'Exit Edit' : 'Edit space'} onClick={() => setEditMode(!editMode)} style={{ width: 32, height: 32, borderRadius: 7, border: editMode ? '1px solid #e7ddfb' : '1px solid transparent', background: editMode ? '#f4f0fe' : 'transparent', color: editMode ? '#5b21b6' : '#4d495f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <Pencil size={16} />
                            </button>
                        )}
                        {!isGuest && (
                            <button title="Space Settings" onClick={() => setShowSpaceSettings(true)} style={{ width: 32, height: 32, borderRadius: 7, border: showSpaceSettings ? '1px solid #e7ddfb' : '1px solid transparent', background: showSpaceSettings ? '#f4f0fe' : 'transparent', color: showSpaceSettings ? '#5b21b6' : '#4d495f', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <Settings size={16} />
                            </button>
                        )}
                    </div>
                    {!isGuest && (
                        <button onClick={() => { fetch(`${API}/api/v1/user/avatars`).then(r => r.json()).then(d => setAvatars(d.avatars || [])).catch(() => setAvatars([])); setShowAvatarPicker(true); }} style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid #e3e1ee', background: '#fff', color: '#4d495f', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                            Avatar
                        </button>
                    )}
                    <button onClick={() => navigate('/lobby')} style={{ padding: '6px 14px', borderRadius: 9, border: '1px solid #e3e1ee', background: '#fff', color: '#4d495f', cursor: 'pointer', fontSize: 13, fontWeight: 600, boxShadow: '0 1px 2px rgba(22,15,52,0.05)' }}>
                        Leave
                    </button>
                </div>
            </header>

            {/* ── Canvas area: position absolute fills the area below the header ── */}
                <div
                    ref={containerRef}
                    style={{ position: 'absolute', top: 56, left: 0, right: 0, bottom: 0, overflow: 'hidden', outline: 'none', marginLeft: !editMode && showProximityChat && isDesktop ? 292 : 0, transition: 'margin-left 0.2s ease' }}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                    onClick={() => useGameStore.getState().setShowEmotePicker(false)}
                    tabIndex={0}
                >
                    <canvas
                        ref={canvasRef}
                        onMouseDown={startPaint}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={() => { isPanningRef.current = false; stopPaint(); setHoverPos(null); }}
                        onMouseMove={handleCanvasMouseMove}
                        onContextMenu={handleCanvasContextMenu}
                        onDragOver={e => { e.preventDefault(); setCanvasIsOver(true); }}
                        onDragLeave={() => { setCanvasIsOver(false); setHoverPos(null); }}
                        onDrop={handleCanvasDrop}
                        style={{ display: 'block', width: '100%', height: '100%', cursor: isPanningRef.current ? 'grabbing' : spaceHeld ? 'grab' : editMode ? (selectedElement || selectedItem ? 'cell' : 'crosshair') : 'default', outline: canvasIsOver ? '2px solid #4f46e5' : 'none' }}
                    />

                    {/* ── Proximity Chat Panel ── */}
                    {!editMode && showProximityChat && (
                        <ProximityChatPanel
                            messages={proximityChatMessages}
                            roomId={proximityChatRoomId}
                            members={proximityChatMembers}
                            unread={proximityChatUnread}
                            onSend={sendProximityChat}
                            onClose={() => useGameStore.getState().setShowProximityChat(false)}
                            isDesktop={isDesktop}
                            currentUserId={currentUser?.userId ?? ''}
                            onTypingChange={(isTyping) => useGameStore.getState().setProximityChatIsTyping(isTyping)}
                            nearbyPeers={nearbyPeerIds.map(id => ({
                                userId: id,
                                username: usersRef.current.get(id)?.username ?? id.slice(0, 8),
                            }))}
                            pendingKnockPeerIds={knockPendingPeerIds}
                            onCallVoice={(peerId) => peerManagerRef.current?.sendKnock(peerId, 'voice')}
                            onCallVideo={async (peerId) => {
                                const pm = peerManagerRef.current;
                                if (!pm) return;
                                // Enable camera before knocking so localVideoStream is ready
                                // by the time the responder accepts and connect() runs.
                                if (!cameraEnabled) {
                                    let stream: MediaStream | null = null;
                                    try {
                                        stream = await navigator.mediaDevices.getUserMedia({ video: true });
                                        localVideoStreamRef.current = stream;
                                        if (selfVideoRef.current) selfVideoRef.current.srcObject = stream;
                                        await pm.enableCamera(stream);
                                        setCameraEnabled(true);
                                    } catch (err) {
                                        console.warn('[Video knock] camera failed, falling back to voice knock', err);
                                        stream?.getTracks().forEach(t => t.stop());
                                        pm.sendKnock(peerId, 'voice');
                                        return;
                                    }
                                }
                                pm.sendKnock(peerId, 'video');
                            }}
                            onCancelCall={(peerId) => peerManagerRef.current?.cancelKnock(peerId)}
                            topOffset={videoPanelHeight}
                        />
                    )}

                    {/* ── Knock-to-join toast stack ── */}
                    {knockRequests.length > 0 && (
                        <div style={{ position: 'absolute', top: 12, right: 12, zIndex: 300, display: 'flex', flexDirection: 'column', gap: 8 }}>
                            {knockRequests.map(req => (
                                <div key={req.id} style={{ background: '#fff', border: '1px solid #e3e1ee', borderRadius: 12, padding: '12px 16px', boxShadow: '0 8px 24px rgba(22,15,52,0.16)', minWidth: 260, display: 'flex', alignItems: 'center', gap: 12 }}>
                                    <span style={{ fontSize: 22 }}>🔔</span>
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontSize: 13, fontWeight: 700, color: '#191427' }}>{req.fromName}</div>
                                        <div style={{ fontSize: 11, color: '#6f6b82' }}>
                                            {req.callType === 'video' ? 'wants to video call you' : 'wants to voice call you'}
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button
                                            onClick={async () => {
                                                const pm = peerManagerRef.current;
                                                if (!pm) return;
                                                // For video calls, ensure camera is on before accepting
                                                if (req.callType === 'video' && !cameraEnabled) {
                                                    let stream: MediaStream | null = null;
                                                    try {
                                                        stream = await navigator.mediaDevices.getUserMedia({ video: true });
                                                        localVideoStreamRef.current = stream;
                                                        if (selfVideoRef.current) selfVideoRef.current.srcObject = stream;
                                                        await pm.enableCamera(stream);
                                                        setCameraEnabled(true);
                                                    } catch (err) {
                                                        console.warn('[Accept knock] camera failed, continuing as video without local cam', err);
                                                        stream?.getTracks().forEach(t => t.stop());
                                                    }
                                                }
                                                await pm.acceptIncomingKnock(req.fromId, req.callType ?? 'voice');
                                                setKnockRequests(prev => prev.filter(k => k.id !== req.id));
                                            }}
                                            style={{ padding: '5px 12px', borderRadius: 7, border: 'none', background: '#16a34a', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                        >Accept</button>
                                        <button
                                            onClick={() => {
                                                peerManagerRef.current?.denyIncomingKnock(req.fromId);
                                                setKnockRequests(prev => prev.filter(k => k.id !== req.id));
                                            }}
                                            style={{ padding: '5px 12px', borderRadius: 7, border: '1px solid #e3e1ee', background: '#fff', color: '#6f6b82', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
                                        >Deny</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    {/* ── Requesting to join indicator ── */}
                    {knockPendingPeerIds.size > 0 && (
                        <div style={{ position: 'absolute', bottom: 100, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.72)', color: '#fff', borderRadius: 20, padding: '6px 16px', fontSize: 12, fontWeight: 600, zIndex: 100, display: 'flex', alignItems: 'center', gap: 6, backdropFilter: 'blur(4px)', pointerEvents: 'none' }}>
                            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#facc15', flexShrink: 0 }} />
                            Requesting to join call…
                        </div>
                    )}

                    {/* ── Proximity group call overlay ── */}
                    {!editMode && proximityGroup.length > 0 && (
                        <div style={{ position: 'absolute', top: 12, left: 12, zIndex: 60, background: 'rgba(15,10,35,0.78)', borderRadius: 12, padding: '8px 14px', backdropFilter: 'blur(6px)', border: '1px solid rgba(255,255,255,0.08)' }}>
                            <div style={{ fontSize: 10, fontWeight: 700, color: '#a78bfa', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Group Call</div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                                {proximityGroup.map(peerId => {
                                    const peerUser = usersRef.current.get(peerId);
                                    return (
                                        <div key={peerId} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <PixelAvatar avatarId={peerUser?.avatarId} size={20} />
                                            <span style={{ fontSize: 12, color: '#e2e0f0', fontWeight: 600 }}>{peerUser?.username ?? peerId.slice(0, 8)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ── Floating chat bubble button (when panel is hidden) ── */}
                    {!editMode && !showProximityChat && (
                        <button
                            onClick={() => { useGameStore.getState().setShowProximityChat(true); useGameStore.getState().resetChatUnread(); }}
                            title="Nearby Chat"
                            style={{
                                position: 'fixed', bottom: 20, left: 12, zIndex: 50,
                                width: 44, height: 44, borderRadius: '50%', border: 'none',
                                background: '#6d28d9', color: '#fff', fontSize: 20, cursor: 'pointer',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                boxShadow: '0 4px 12px rgba(109,40,217,0.4)',
                            }}
                        >
                            💬
                            {proximityChatUnread > 0 && (
                                <span style={{
                                    position: 'absolute', top: -4, right: -4,
                                    background: '#ef4444', color: '#fff', borderRadius: '50%',
                                    width: 18, height: 18, fontSize: 10, fontWeight: 700,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    border: '2px solid #fff',
                                }}>{proximityChatUnread > 9 ? '9+' : proximityChatUnread}</span>
                            )}
                        </button>
                    )}

                    {/* ── Error / reconnect banner ── */}
                    {error && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '6px 20px', background: reconnecting ? '#78350f' : '#7f1d1d', color: reconnecting ? '#fde68a' : '#fca5a5', fontSize: 12, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 20 }}>
                            {error}
                            {reconnecting && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 14 }}>↻</span>}
                        </div>
                    )}

                {/* ── Zoom indicator (bottom-right) ── */}
                <div style={{ position: 'absolute', bottom: 8, right: editMode ? 292 : 8, pointerEvents: 'none', zIndex: 10, fontSize: 11, fontWeight: 600, color: '#e2e8f0', background: 'rgba(0,0,0,0.55)', padding: '3px 8px', borderRadius: 6, backdropFilter: 'blur(4px)' }}>
                    {Math.round(zoomRef.current * 100)}%
                </div>

                {/* ── Saving indicator (top-left overlay) ── */}
                {saveStatus !== 'idle' && (
                    <div style={{
                        position: 'absolute', top: 40, left: 12, zIndex: 11, pointerEvents: 'none',
                        fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 8, backdropFilter: 'blur(4px)',
                        background: saveStatus === 'saving' ? 'rgba(0,0,0,0.6)' : saveStatus === 'saved' ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)',
                        color: saveStatus === 'saving' ? '#e2e8f0' : saveStatus === 'saved' ? '#16a34a' : '#dc2626',
                    }}>
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved ✓' : 'Save failed'}
                    </div>
                )}

                {/* ── Mode hint (top-left overlay) ── */}
                {(npcPickingPos || editMode) && (
                    <div style={{ position: 'absolute', top: 8, left: 12, pointerEvents: 'none', zIndex: 10 }}>
                        <p style={{ margin: 0, fontSize: 11, color: npcPickingPos ? '#c4b5fd' : '#e2e8f0', background: 'rgba(0,0,0,0.6)', padding: '4px 10px', borderRadius: 8, backdropFilter: 'blur(4px)' }}>
                            {npcPickingPos ? '📍 Click a tile to position the NPC — [Esc] to cancel' : 'Esc deselect · Ctrl+Z undo · right-click to delete · click NPC to select/drag'}
                        </p>
                    </div>
                )}

                {/* ── Bottom dock (light pill bar) ── */}
                {!editMode && (
                    <GameDock
                        showChat={showProximityChat}
                        onToggleChat={() => {
                            const gs = useGameStore.getState();
                            gs.toggleProximityChat();
                        }}
                        chatUnread={proximityChatUnread}
                        showEmotePicker={showEmotePicker}
                        onToggleEmotePicker={() => useGameStore.getState().toggleEmotePicker()}
                        avatarId={currentUser?.avatarId ?? 'avatar-intern'}
                        activeEmote={myActiveEmote}
                        onEmote={sendEmote}
                    />
                )}

                {/* ── Interaction popup ── */}
                {interactionPopup && (
                    <div style={{ position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)', background: '#fff', border: `1px solid ${interactionPopup.type === 'chest' ? 'rgba(251,191,36,0.35)' : '#ecebf3'}`, borderRadius: 14, padding: '20px 24px', minWidth: 240, maxWidth: 320, zIndex: 200, textAlign: 'center', boxShadow: '0 24px 60px rgba(22,15,52,0.22)' }}>
                        {interactionPopup.type === 'chest' && (
                            <div style={{ width: 68, height: 68, margin: '0 auto 12px', borderRadius: 14, background: 'radial-gradient(circle at 50% 36%, #fff6e0, #fde7a8 62%, #f6c64e)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 18px rgba(246,198,78,0.4)', position: 'relative' }}>
                                <img src={`${ASSETS_URL}/tiles/chest.png`} alt="chest" style={{ width: 40, imageRendering: 'pixelated', filter: 'drop-shadow(0 2px 2px rgba(0,0,0,0.3))' }} />
                                {(['#f59e0b','#a855f7','#22c55e'] as string[]).map((c, i) => {
                                    const tops = [6, 4, 2]; const lefts = ['12%', '72%', '42%'];
                                    return <span key={i} style={{ position: 'absolute', top: tops[i], left: lefts[i], width: 5, height: 5, borderRadius: 2, background: c, transform: `rotate(${i*50}deg)` }} />;
                                })}
                            </div>
                        )}
                        <div style={{ fontSize: 15, fontWeight: 700, color: interactionPopup.type === 'chest' ? '#b25e09' : '#191427', marginBottom: 6 }}>{interactionPopup.title}</div>
                        <div style={{ fontSize: 13, color: '#6f6b82', lineHeight: 1.5 }}>{interactionPopup.text}</div>
                        {interactionPopup.type === 'chest' && <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, fontSize: 11, color: '#a3a0b3', marginTop: 8 }}>🕐 Next chest in 1 hour</div>}
                        <button onClick={() => setInteractionPopup(null)} style={{ marginTop: 12, padding: '6px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', fontSize: 12, cursor: 'pointer', fontWeight: 600, boxShadow: '0 4px 12px rgba(124,58,237,.2)' }}>
                            {interactionPopup.type === 'chest' ? 'Collect' : 'Dismiss'}
                        </button>
                    </div>
                )}

                {/* ── NPC dialogue ── */}
                {npcDialogue && <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.45)', backdropFilter: 'blur(3px)', zIndex: 1199 }} onClick={() => setNpcDialogue(null)} />}
                {npcDialogue && (() => {
                    const lines = npcDialogue.npc.dialogues.filter(Boolean);
                    const idx = npcDialogue.idx % Math.max(lines.length, 1);
                    const isLast = idx >= lines.length - 1;
                    const motionLabels: Record<string, string> = { STATIC: '🧍 Static', PATROL: '🚶 Patrol', WANDER: '🌀 Wander' };
                    return (
                        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', border: '1px solid #ecebf3', borderRadius: 16, width: 360, zIndex: 1200, boxShadow: '0 24px 60px rgba(22,15,52,0.22)', overflow: 'hidden', animation: 'ovPop 0.18s cubic-bezier(.2,.8,.3,1)' }}>
                            {/* Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 20px 14px', borderBottom: '1px solid #ecebf3' }}>
                                <div style={{ width: 46, height: 46, borderRadius: 10, background: '#f4f0fe', border: '1px solid #e7ddfb', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden', flexShrink: 0, fontSize: 28 }}>
                                    💬
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 16, fontWeight: 700, color: '#6d28d9', letterSpacing: '-0.01em' }}>{npcDialogue.npc.name}</div>
                                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, fontSize: 11, fontWeight: 600, color: '#6f6b82', background: '#f4f3f9', borderRadius: 6, padding: '2px 8px' }}>
                                        {motionLabels[npcDialogue.npc.motionType] ?? '🤖 NPC'} · NPC
                                    </div>
                                </div>
                                <button onClick={() => setNpcDialogue(null)} style={{ width: 28, height: 28, borderRadius: 8, border: '1px solid #ecebf3', background: '#f4f3f9', color: '#6f6b82', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✕</button>
                            </div>
                            {/* Body */}
                            <div style={{ padding: '18px 20px 18px' }}>
                                <p style={{ margin: '0 0 16px', fontSize: 14, color: '#4d495f', lineHeight: 1.65, minHeight: 52 }}>
                                    {lines[idx] || '…'}
                                </p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    {lines.length > 1 && lines.map((_: string, i: number) => (
                                        <span key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, background: i === idx ? '#6d28d9' : '#e3e1ee', transition: 'all 0.2s' }} />
                                    ))}
                                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                                        {!isLast
                                            ? <button onClick={() => setNpcDialogue(prev => prev ? { ...prev, idx: prev.idx + 1 } : null)} style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid #e7ddfb', background: '#f4f0fe', color: '#6d28d9', fontSize: 13, cursor: 'pointer', fontWeight: 700 }}>Next →</button>
                                            : <button onClick={() => setNpcDialogue(null)} style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Done</button>
                                        }
                                    </div>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* ── Sign editor (edit mode) ── */}
                {signEditing && <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.32)', backdropFilter: 'blur(3px)', zIndex: 1199 }} onClick={() => setSignEditing(null)} />}
                {signEditing && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', border: '1px solid #ecebf3', borderRadius: 16, padding: '22px 24px', width: 340, zIndex: 1200, boxShadow: '0 24px 60px rgba(22,15,52,0.22)' }}>
                        <div style={{ fontWeight: 700, color: '#191427', marginBottom: 14, fontSize: 15 }}>📋 Edit Sign Text</div>
                        <input autoFocus value={signEditing.text} onChange={e => setSignEditing({ ...signEditing, text: e.target.value })} onKeyDown={e => { if (e.key === 'Escape') setSignEditing(null); }} maxLength={120} placeholder="Welcome to my space!"
                            style={{ width: '100%', padding: '9px 12px', borderRadius: 10, border: '1.5px solid #e3e1ee', background: '#fff', color: '#191427', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
                            <button onClick={() => setSignEditing(null)} style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid #e3e1ee', background: '#fff', color: '#6f6b82', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                            <button onClick={async () => { try { await fetch(`${API}/api/v1/space/placed/${signEditing.placedItemId}/metadata`, { method: 'PUT', headers: authHeaders, body: JSON.stringify({ metadata: { text: signEditing.text } }) }); setPlacedItems(prev => prev.map(p => p.id === signEditing.placedItemId ? { ...p, metadata: { text: signEditing.text } } : p)); } catch {} setSignEditing(null); }}
                                style={{ padding: '7px 16px', borderRadius: 9, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 700, boxShadow: '0 4px 12px rgba(124,58,237,.25)' }}>Save</button>
                        </div>
                    </div>
                )}

                {/* ── NPC add/edit modal ── */}
                {showNpcModal && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', border: '1px solid #ecebf3', borderRadius: 14, padding: '24px 28px', width: 380, zIndex: 1200, boxShadow: '0 24px 60px rgba(22,15,52,0.22)', maxHeight: '90vh', overflowY: 'auto' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#191427', marginBottom: 16 }}>
                            {npcForm.id ? '✏️ Edit NPC' : '🤖 Add NPC'}
                        </div>

                        {/* Name — icon wrapper from components-inputs.html */}
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7c6f9c', marginBottom: 7, letterSpacing: '.02em' }}>NPC Name</label>
                        <div className="ov-input-wrap" style={{ marginBottom: 14 }}>
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <input value={npcForm.name} onChange={e => setNpcForm(f => ({ ...f, name: e.target.value }))} placeholder="Manager Mike…" />
                        </div>

                        {/* Motion type — gradient selected state from components-inputs.html */}
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7c6f9c', marginBottom: 7, letterSpacing: '.02em' }}>Motion type</label>
                        <div style={{ display: 'flex', gap: 9, marginBottom: 14 }}>
                            {([
                                { value: 'STATIC', label: 'Static',  desc: 'Stands still' },
                                { value: 'PATROL', label: 'Patrol',  desc: 'Walks a path' },
                                { value: 'WANDER', label: 'Wander',  desc: 'Roams freely' },
                            ] as const).map(opt => {
                                const on = npcForm.motionType === opt.value;
                                return (
                                    <div key={opt.value} onClick={() => setNpcForm(f => ({ ...f, motionType: opt.value }))}
                                        style={{ flex: 1, padding: '14px 8px 12px', borderRadius: 13, cursor: 'pointer', textAlign: 'center', transition: 'all .15s',
                                            border: on ? '1.5px solid transparent' : '1.5px solid #e7e2f5',
                                            background: on ? 'linear-gradient(140deg,#7c3aed,#a78bfa)' : '#fff',
                                            boxShadow: on ? '0 8px 18px rgba(124,58,237,.3)' : 'none' }}>
                                        <div style={{ fontSize: 20, marginBottom: 6 }}>{opt.value === 'STATIC' ? '🧍' : opt.value === 'PATROL' ? '🚶' : '🌀'}</div>
                                        <div style={{ fontSize: 12, fontWeight: 700, color: on ? '#fff' : '#6b6388' }}>{opt.label}</div>
                                        <div style={{ fontSize: 10, color: on ? 'rgba(255,255,255,.85)' : '#a99fc4', marginTop: 2 }}>{opt.desc}</div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Wander radius — only shown for WANDER */}
                        {npcForm.motionType === 'WANDER' && (
                            <div style={{ marginBottom: 12 }}>
                                <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#6f6b82', marginBottom: 4 }}>
                                    <span>Wander Radius</span>
                                    <span style={{ color: '#6d28d9', fontWeight: 600 }}>{npcForm.wanderRadius} tile{npcForm.wanderRadius !== 1 ? 's' : ''}</span>
                                </label>
                                <input
                                    type="range" min={1} max={8} value={npcForm.wanderRadius}
                                    onChange={e => setNpcForm(f => ({ ...f, wanderRadius: parseInt(e.target.value) }))}
                                    style={{ width: '100%', accentColor: '#6d28d9' }}
                                />
                            </div>
                        )}

                        {/* Sprite */}
                        <label style={{ display: 'block', fontSize: 11, color: '#6f6b82', marginBottom: 6 }}>Sprite</label>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                            {(['avatar-ceo', 'avatar-dev', 'avatar-designer', 'avatar-hr', 'avatar-marketing', 'avatar-intern'] as const).map(av => (
                                <div key={av} onClick={() => setNpcForm(f => ({ ...f, sprite: av }))}
                                    style={{ padding: '8px 4px 6px', borderRadius: 10, border: `2px solid ${npcForm.sprite === av ? '#6d28d9' : '#e3e1ee'}`, background: npcForm.sprite === av ? '#f4f0fe' : '#fff', cursor: 'pointer', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                                    <PixelAvatar avatarId={av} size={28} />
                                    <span style={{ fontSize: 8, fontWeight: 600, color: npcForm.sprite === av ? '#6d28d9' : '#6f6b82' }}>{av.replace('avatar-', '')}</span>
                                </div>
                            ))}
                        </div>

                        {/* Spawn position (always shown — even STATIC needs a starting point) */}
                        <label style={{ display: 'block', fontSize: 11, color: '#6f6b82', marginBottom: 4 }}>
                            {npcForm.motionType === 'WANDER' ? 'Home Position (wanders from here)' : npcForm.motionType === 'STATIC' ? 'Position' : 'Spawn Position'}
                        </label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: npcPosBlocked ? 4 : 12 }}>
                            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                <input value={npcForm.x} onChange={e => setNpcForm(f => ({ ...f, x: parseInt(e.target.value) || 0 }))} type="number" min={0} max={spaceDims.width - 1} placeholder="X" style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: `1px solid ${npcPosBlocked ? '#fca5a5' : '#ecebf3'}`, background: '#fff', color: '#191427', fontSize: 12, outline: 'none' }} />
                                <input value={npcForm.y} onChange={e => setNpcForm(f => ({ ...f, y: parseInt(e.target.value) || 0 }))} type="number" min={0} max={spaceDims.height - 1} placeholder="Y" style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: `1px solid ${npcPosBlocked ? '#fca5a5' : '#ecebf3'}`, background: '#fff', color: '#191427', fontSize: 12, outline: 'none' }} />
                            </div>
                            <button
                                onClick={() => { setNpcPickingPos(true); setShowNpcModal(false); }}
                                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e7ddfb', background: '#f4f0fe', color: '#6d28d9', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >📍 Pick</button>
                        </div>
                        {npcPosBlocked && (
                            <p style={{ margin: '0 0 12px', fontSize: 10, color: '#dc2626', fontWeight: 600 }}>
                                This tile is blocked. Choose a walkable position.
                            </p>
                        )}

                        {/* Dialogues */}
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#7c6f9c', marginBottom: 7, letterSpacing: '.02em' }}>Dialogues (up to 3)</label>
                        {([0, 1, 2] as const).map(i => (
                            <div key={i} className="ov-input-wrap" style={{ marginBottom: 9 }}>
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                                <input value={npcForm.dialogues[i]} onChange={e => { const d: [string, string, string] = [...npcForm.dialogues] as [string, string, string]; d[i] = e.target.value; setNpcForm(f => ({ ...f, dialogues: d })); }} placeholder={`Line ${i + 1}…`} />
                            </div>
                        ))}

                        {/* Buttons */}
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button
                                disabled={savingNpc || !npcForm.name.trim() || npcPosBlocked}
                                onClick={async () => {
                                    if (!npcForm.name.trim() || npcPosBlocked) return;
                                    setSavingNpc(true);
                                    const body = {
                                        name:         npcForm.name.trim(),
                                        sprite:       npcForm.sprite,
                                        dialogues:    npcForm.dialogues.filter(d => d.trim()),
                                        x:            npcForm.x,
                                        y:            npcForm.y,
                                        motionType:   npcForm.motionType,
                                        wanderRadius: npcForm.wanderRadius,
                                    };
                                    try {
                                        if (npcForm.id) {
                                            await fetch(`${API}/api/v1/space/npc/${npcForm.id}`, { method: 'PUT', headers: authHeaders, body: JSON.stringify(body) });
                                        } else {
                                            await fetch(`${API}/api/v1/space/${spaceId}/npc`, { method: 'POST', headers: authHeaders, body: JSON.stringify(body) });
                                        }
                                        fetchNpcs();
                                        setShowNpcModal(false);
                                    } catch {}
                                    setSavingNpc(false);
                                }}
                                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: savingNpc || !npcForm.name.trim() || npcPosBlocked ? '#e3e1ee' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', fontSize: 13, cursor: savingNpc || !npcForm.name.trim() || npcPosBlocked ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                            >
                                {savingNpc ? 'Saving…' : npcForm.id ? 'Save Changes' : 'Add NPC'}
                            </button>
                            <button onClick={() => setShowNpcModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ecebf3', background: '#fff', color: '#6f6b82', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {showNpcModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.28)', backdropFilter: 'blur(3px)', zIndex: 1199 }} onClick={() => setShowNpcModal(false)} />}

                {/* NPC position picking hint */}
                {npcPickingPos && (
                    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(99,102,241,0.9)', color: '#fff', padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 200, pointerEvents: 'none' }}>
                        📍 Click a tile to set NPC position
                    </div>
                )}

                {/* ── Portal travel prompt ── */}
                {portalTravel && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', border: '1px solid #e7ddfb', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '24px 28px', width: 320, zIndex: 1200, boxShadow: '0 24px 60px rgba(22,15,52,0.22)', textAlign: 'center' }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>🚪</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#6d28d9', marginBottom: 8 }}>Travel to {portalTravel.label}?</div>
                        <p style={{ margin: '0 0 6px', fontSize: 13, color: '#6f6b82' }}>You've reached the {portalTravel.fromEdge.toLowerCase()} edge.</p>
                        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#a3a0b3' }}>Press <strong>Enter</strong> to confirm</p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button
                                onClick={() => { navigate(`/arena?spaceId=${portalTravel.toSpaceId}`); setPortalTravel(null); }}
                                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: '#6d28d9', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Travel [Enter]
                            </button>
                            <button onClick={() => setPortalTravel(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #ecebf3', background: '#fff', color: '#6f6b82', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {portalTravel && <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.32)', backdropFilter: 'blur(3px)', zIndex: 1199 }} onClick={() => setPortalTravel(null)} />}

                {/* ── Space resize modal ── */}
                {showResizeModal && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', border: '1px solid #ecebf3', borderRadius: 14, padding: '24px 28px', width: 300, zIndex: 1200, boxShadow: '0 24px 60px rgba(22,15,52,0.22)' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#191427', marginBottom: 16 }}>↔ Resize Space</div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: 11, color: '#6f6b82', marginBottom: 4 }}>Width (5–100)</label>
                                <input value={resizeW} onChange={e => setResizeW(e.target.value)} placeholder={String(spaceDims.width)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ecebf3', background: '#fff', color: '#191427', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: 11, color: '#6f6b82', marginBottom: 4 }}>Height (5–100)</label>
                                <input value={resizeH} onChange={e => setResizeH(e.target.value)} placeholder={String(spaceDims.height)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid #ecebf3', background: '#fff', color: '#191427', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                onClick={async () => {
                                    const w = parseInt(resizeW) || spaceDims.width;
                                    const h = parseInt(resizeH) || spaceDims.height;
                                    try {
                                        const res = await fetch(`${API}/api/v1/space/${spaceId}/resize`, {
                                            method: 'PUT',
                                            headers: authHeaders,
                                            body: JSON.stringify({ width: w, height: h }),
                                        });
                                        if (res.ok) { setSpaceDims({ width: w, height: h }); addToast(`Space resized to ${w}×${h}`, 'success'); }
                                        else { const d = await res.json(); addToast(d.message || 'Resize failed', 'warning'); }
                                    } catch {}
                                    setShowResizeModal(false);
                                    setResizeW('');
                                    setResizeH('');
                                }}
                                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#6d28d9', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Resize
                            </button>
                            <button onClick={() => setShowResizeModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ecebf3', background: '#fff', color: '#6f6b82', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {showResizeModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.28)', backdropFilter: 'blur(3px)', zIndex: 1199 }} onClick={() => setShowResizeModal(false)} />}

                {/* ── Space expand modal ── */}
                {showExpandModal && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', border: '1px solid #ecebf3', borderRadius: 14, padding: '24px 28px', width: 300, zIndex: 1200, boxShadow: '0 24px 60px rgba(22,15,52,0.22)' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#191427', marginBottom: 6 }}>⊕ Expand Space</div>
                        <p style={{ margin: '0 0 18px', fontSize: 12, color: '#6f6b82', lineHeight: 1.5 }}>Adds 10 tiles in the chosen direction. Existing elements shift when expanding North or West.</p>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                            {(['north', 'south', 'west', 'east'] as const).map(dir => {
                                const icons: Record<string, string> = { north: '▲ North', south: '▼ South', west: '◀ West', east: '▶ East' };
                                return (
                                    <button
                                        key={dir}
                                        onClick={() => handleExpand(dir)}
                                        style={{ padding: '10px', borderRadius: 8, border: '1px solid #ecebf3', background: '#f9f8fd', color: '#059669', fontSize: 13, cursor: 'pointer', fontWeight: 700, transition: 'all 0.15s' }}
                                        onMouseEnter={e => { e.currentTarget.style.background = '#d1fae5'; e.currentTarget.style.borderColor = '#059669'; }}
                                        onMouseLeave={e => { e.currentTarget.style.background = '#f9f8fd'; e.currentTarget.style.borderColor = '#ecebf3'; }}
                                    >
                                        {icons[dir]}
                                    </button>
                                );
                            })}
                        </div>
                        <p style={{ margin: '0 0 14px', fontSize: 11, color: '#a3a0b3' }}>Current size: {spaceDims.width}×{spaceDims.height} · Max 200×200</p>
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button onClick={() => setShowExpandModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ecebf3', background: '#fff', color: '#6f6b82', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {showExpandModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.28)', backdropFilter: 'blur(3px)', zIndex: 1199 }} onClick={() => setShowExpandModal(false)} />}

                {/* ── Clear All confirmation modal ── */}
                {showClearAllConfirm && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: '#fff', border: '1px solid #ecebf3', borderRadius: 14, padding: '24px 28px', width: 340, zIndex: 1200, boxShadow: '0 24px 60px rgba(22,15,52,0.22)' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#191427', marginBottom: 8 }}>🗑️ Clear All Tiles</div>
                        <p style={{ margin: '0 0 20px', fontSize: 13, color: '#6f6b82', lineHeight: 1.5 }}>Clear all tiles from this space? This cannot be undone.</p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                onClick={handleClearAll}
                                disabled={clearingAll}
                                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: clearingAll ? 0.7 : 1 }}
                            >
                                {clearingAll ? 'Clearing…' : 'Clear All'}
                            </button>
                            <button
                                onClick={() => setShowClearAllConfirm(false)}
                                disabled={clearingAll}
                                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid #ecebf3', background: '#fff', color: '#6f6b82', fontSize: 13, cursor: 'pointer' }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
                {showClearAllConfirm && <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.28)', backdropFilter: 'blur(3px)', zIndex: 1199 }} onClick={() => !clearingAll && setShowClearAllConfirm(false)} />}

                {/* ── Player bottom-sheet popup ── */}
                {playerPopup && (
                    <>
                        {/* Backdrop */}
                        <div
                            style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.18)', zIndex: 1099 }}
                            onClick={() => setPlayerPopup(null)}
                        />
                        {/* Bottom sheet */}
                        <div style={{
                            position: 'fixed',
                            bottom: 90,
                            left: '50%',
                            transform: `translateX(-50%) translateY(${playerPopupVisible ? '0' : '24px'})`,
                            opacity: playerPopupVisible ? 1 : 0,
                            transition: 'transform 200ms ease-out, opacity 180ms ease-out',
                            width: 320,
                            background: '#fff',
                            borderRadius: 20,
                            boxShadow: '0 -4px 32px rgba(0,0,0,0.12), 0 8px 40px rgba(22,15,52,0.18)',
                            zIndex: 1100,
                            overflow: 'hidden',
                        }}>
                            {/* Drag handle */}
                            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
                                <div style={{ width: 32, height: 4, borderRadius: 2, background: '#e2e0eb' }} />
                            </div>

                            {/* Player info */}
                            <div style={{ padding: '14px 20px 0', textAlign: 'center' }}>
                                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 8 }}>
                                    <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'linear-gradient(135deg,#f4f0fe,#ede9fe)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                        <PixelAvatar avatarId={playerPopup.avatarId} size={48} />
                                    </div>
                                </div>
                                <p style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 800, color: '#191427', letterSpacing: '-0.01em' }}>{playerPopup.username}</p>
                                {playerPopup.avatarId && (() => {
                                    const ROLE: Record<string, { label: string; bg: string; color: string }> = {
                                        'avatar-ceo':       { label: 'CEO',       bg: '#fef3c7', color: '#b45309' },
                                        'avatar-dev':       { label: 'Developer', bg: '#eff6ff', color: '#1d4ed8' },
                                        'avatar-designer':  { label: 'Designer',  bg: '#f5f3ff', color: '#6d28d9' },
                                        'avatar-hr':        { label: 'HR',        bg: '#fdf2f8', color: '#be185d' },
                                        'avatar-marketing': { label: 'Marketing', bg: '#fff7ed', color: '#c2410c' },
                                        'avatar-intern':    { label: 'Intern',    bg: '#f0fdf4', color: '#166534' },
                                    };
                                    const r = ROLE[playerPopup.avatarId];
                                    return r ? (
                                        <span style={{ fontSize: 10, fontWeight: 700, color: r.color, background: r.bg, borderRadius: 20, padding: '3px 10px', letterSpacing: '0.06em', textTransform: 'uppercase' as const }}>
                                            {r.label}
                                        </span>
                                    ) : null;
                                })()}
                            </div>

                            {/* Divider */}
                            <div style={{ height: 1, background: '#f0eef8', margin: '16px 0 0' }} />

                            {/* 2×2 action grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: '14px 16px 16px' }}>
                                <button
                                    onClick={() => navigate(`/profile/${playerPopup.userId}`)}
                                    style={{ height: 44, borderRadius: 12, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    👤 View Profile
                                </button>
                                <button
                                    onClick={() => { setGiftTarget({ userId: playerPopup.userId, username: playerPopup.username }); setShowGiftModal(true); setPlayerPopup(null); }}
                                    style={{ height: 44, borderRadius: 12, border: '1.5px solid #e7ddfb', background: '#f4f0fe', color: '#6d28d9', fontSize: 13, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    🎁 Send Gift
                                </button>
                                <button
                                    onClick={() => {
                                        if (pingsSent.has(playerPopup.userId)) return;
                                        wsRef.current?.send(JSON.stringify({ type: 'ping-user', payload: { targetUserId: playerPopup.userId } }));
                                        setPingsSent(prev => new Set([...prev, playerPopup.userId]));
                                        setTimeout(() => setPingsSent(prev => { const n = new Set(prev); n.delete(playerPopup.userId); return n; }), 2000);
                                    }}
                                    style={{ height: 44, borderRadius: 12, border: '1.5px solid #fed7aa', background: '#fff7ed', color: pingsSent.has(playerPopup.userId) ? '#9a3412' : '#c2410c', fontSize: 13, fontWeight: 700, cursor: pingsSent.has(playerPopup.userId) ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    {pingsSent.has(playerPopup.userId) ? '✓ Sent!' : '👋 Ping'}
                                </button>
                                <button
                                    onClick={() => setPlayerPopup(null)}
                                    style={{ height: 44, borderRadius: 12, border: '1.5px solid #e3e1ee', background: '#f8f7ff', color: '#6f6b82', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
                                >
                                    ✕ Close
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* ── Editor sidebar (overlays canvas) ── */}
                {editMode && (
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, background: '#fff', borderLeft: '1px solid #ecebf3', display: 'flex', flexDirection: 'column', zIndex: 50 }}>
                        {/* ── Header row 1: title + undo/redo ── */}
                        <div style={{ padding: '10px 14px', borderBottom: '1px solid #ecebf3', fontWeight: 700, fontSize: 15, color: '#191427', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                            <span>Editor</span>
                            <div style={{ display: 'flex', gap: 5 }}>
                                <button
                                    onClick={handleUndo}
                                    disabled={!canUndo}
                                    title="Undo (Ctrl+Z)"
                                    style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${canUndo ? '#e3e1ee' : '#ecebf3'}`, background: canUndo ? '#fff' : '#f4f3f9', color: canUndo ? '#4d495f' : '#a3a0b3', fontSize: 11, cursor: canUndo ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                                >
                                    ↩ Undo
                                </button>
                                <button
                                    onClick={handleRedo}
                                    disabled={!canRedo}
                                    title="Redo (Ctrl+Shift+Z)"
                                    style={{ padding: '4px 9px', borderRadius: 6, border: `1px solid ${canRedo ? '#e3e1ee' : '#ecebf3'}`, background: canRedo ? '#fff' : '#f4f3f9', color: canRedo ? '#4d495f' : '#a3a0b3', fontSize: 11, cursor: canRedo ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                                >
                                    ↪ Redo
                                </button>
                            </div>
                        </div>
                        {/* ── Header row 2: tools toolbar ── */}
                        <div style={{ padding: '8px 14px', borderBottom: '1px solid #ecebf3', display: 'flex', flexWrap: 'wrap', gap: 5, flexShrink: 0 }}>
                            <button
                                onClick={() => setShowNewMap(true)}
                                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e7ddfb', background: '#f4f0fe', color: '#6d28d9', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                title="New Map"
                            >
                                + New Map
                            </button>
                            <button
                                onClick={() => { setResizeW(String(spaceDims.width)); setResizeH(String(spaceDims.height)); setShowResizeModal(true); }}
                                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e3e1ee', background: '#fff', color: '#6366f1', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                title="Resize Space"
                            >
                                ↔ Resize
                            </button>
                            <button
                                onClick={() => setShowExpandModal(true)}
                                style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid #e3e1ee', background: '#fff', color: '#059669', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                title="Expand Space"
                            >
                                ⊕ Expand
                            </button>
                            <button
                                onClick={() => { setEraserMode(m => !m); setSelectedItem(null); setSelectedElement(null); setSelectedPlaced(null); }}
                                style={{ padding: '5px 10px', borderRadius: 5, border: `2px solid ${eraserMode ? '#ef4444' : '#ecebf3'}`, background: eraserMode ? '#fef2f2' : '#fff', color: eraserMode ? '#ef4444' : '#6f6b82', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                title="Eraser (E)"
                            >
                                🧹 Eraser
                            </button>
                            <button
                                onClick={() => setShowClearAllConfirm(true)}
                                style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid #fca5a5', background: '#fff5f5', color: '#dc2626', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                title="Clear All — remove every tile from this space"
                            >
                                🗑️ Clear All
                            </button>
                            {selectedPlaced && (
                                <button
                                    onClick={() => {
                                        if (selectedPlaced.type === 'element') deletePlacedElement(selectedPlaced.id);
                                        else deletePlacedItem(selectedPlaced.id);
                                        setSelectedPlaced(null);
                                    }}
                                    style={{ padding: '5px 10px', borderRadius: 5, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                >
                                    🗑 Delete
                                </button>
                            )}
                            {selectedPlaced?.type === 'item' && (() => {
                                const pi = placedItems.find(p => p.id === selectedPlaced.id);
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const roomId = (pi?.metadata as any)?.conferenceRoomId as string | undefined;
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const bzId = (pi?.metadata as any)?.broadcastZoneId as string | undefined;
                                return (
                                    <>
                                        <button
                                            onClick={async () => {
                                                if (!pi) return;
                                                const newMeta = roomId
                                                    ? { ...(pi.metadata as object), conferenceRoomId: null }
                                                    : { ...(pi.metadata as object ?? {}), conferenceRoomId: crypto.randomUUID() };
                                                await fetch(`${API}/api/v1/space/placed/${pi.id}/metadata`, {
                                                    method: 'PUT', headers: authHeaders,
                                                    body: JSON.stringify({ metadata: newMeta }),
                                                });
                                                await fetchSpace();
                                            }}
                                            title={roomId ? `Room ID: ${roomId}` : 'Mark this item as a conference room zone'}
                                            style={{ padding: '5px 10px', borderRadius: 5, border: 'none', background: roomId ? '#7c3aed' : '#ecebf3', color: roomId ? '#fff' : '#6f6b82', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            {roomId ? '📹 Conference Room' : '+ Conf Room'}
                                        </button>
                                        <button
                                            onClick={async () => {
                                                if (!pi) return;
                                                const newMeta = bzId
                                                    ? { ...(pi.metadata as object), broadcastZoneId: null }
                                                    : { ...(pi.metadata as object ?? {}), broadcastZoneId: crypto.randomUUID() };
                                                await fetch(`${API}/api/v1/space/placed/${pi.id}/metadata`, {
                                                    method: 'PUT', headers: authHeaders,
                                                    body: JSON.stringify({ metadata: newMeta }),
                                                });
                                                await fetchSpace();
                                            }}
                                            title={bzId ? `Broadcast Zone ID: ${bzId}` : 'Mark this item as a broadcast zone (owner speaks, others listen)'}
                                            style={{ padding: '5px 10px', borderRadius: 5, border: 'none', background: bzId ? '#0369a1' : '#ecebf3', color: bzId ? '#fff' : '#6f6b82', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                        >
                                            {bzId ? '📡 Broadcast Zone' : '+ Broadcast Zone'}
                                        </button>
                                    </>
                                );
                            })()}
                        </div>
                        {selectedPlacedGroup.length > 1 && (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #ecebf3', background: '#f5f3ff', fontSize: 12, color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>☐</span>
                                <span>{selectedPlacedGroup.length} items selected</span>
                                <button
                                    onClick={() => {
                                        selectedPlacedGroup.forEach(s => {
                                            if (s.type === 'element') deletePlacedElement(s.id);
                                            else deletePlacedItem(s.id);
                                        });
                                        setSelectedPlacedGroup([]);
                                    }}
                                    style={{ marginLeft: 'auto', padding: '3px 8px', borderRadius: 4, border: 'none', background: '#ef4444', color: '#fff', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Delete all
                                </button>
                                <button
                                    onClick={() => setSelectedPlacedGroup([])}
                                    style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #e3e1ee', background: '#fff', color: '#6f6b82', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                        {eraserMode && (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #ecebf3', background: '#fef2f2', fontSize: 12, color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>🧹</span>
                                <span>Eraser — click/drag to remove elements and items</span>
                            </div>
                        )}
                        {(selectedElement || selectedItem) && (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #ecebf3', background: '#f4f0fe', fontSize: 12, color: '#6d28d9', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span>🔨</span>
                                <span>
                                    Placing: {selectedElement ? `${selectedElement.width}×${selectedElement.height} element` : `${selectedItem!.name} (${selectedItem!.width}×${selectedItem!.height})`}
                                </span>
                                {selectedItem && (
                                    <div style={{ display: 'flex', marginLeft: 'auto', gap: 4 }}>
                                        <button
                                            onClick={() => setPlacementLayer('FLOOR')}
                                            style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: placementLayer === 'FLOOR' ? '#6d28d9' : '#ecebf3', color: placementLayer === 'FLOOR' ? '#fff' : '#6f6b82', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Floor
                                        </button>
                                        <button
                                            onClick={() => setPlacementLayer('WALL')}
                                            style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: placementLayer === 'WALL' ? '#6d28d9' : '#ecebf3', color: placementLayer === 'WALL' ? '#fff' : '#6f6b82', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Wall
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div style={{ display: 'flex', borderBottom: '1px solid #ecebf3' }}>
                            {(['elements', 'items', 'npcs', 'portals'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => {
                                        setEditorTab(tab);
                                        setSelectedItem(null);
                                        setSelectedElement(null);
                                        if (tab === 'elements') fetchElementsCatalog();
                                        if (tab === 'portals') fetchPublicSpaces();
                                    }}
                                    style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${editorTab === tab ? '#6d28d9' : 'transparent'}`, background: 'none', fontWeight: 600, fontSize: 12, color: editorTab === tab ? '#6d28d9' : '#a3a0b3', cursor: 'pointer', transition: 'all 0.15s', textTransform: 'capitalize' }}
                                >
                                    {tab === 'elements' ? 'Elements' : tab === 'items' ? 'Items' : tab === 'npcs' ? 'NPCs' : 'Portals'}
                                </button>
                            ))}
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {editorTab === 'elements' && (
                                <>
                                    {elementsLoading && <p style={{ fontSize: 13, color: '#6f6b82', textAlign: 'center' }}>Loading...</p>}
                                    {!elementsLoading && elementTypes.length === 0 && (
                                        <p style={{ fontSize: 13, color: '#6f6b82', textAlign: 'center' }}>No elements available.</p>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {elementTypes.map(el => {
                                            const imgUrl = el.imageUrl.startsWith('http') ? el.imageUrl : `${API}${el.imageUrl}`;
                                            const isSelected = selectedElement?.id === el.id;
                                            return (
                                            <div
                                                key={el.id}
                                                draggable={true}
                                                onClick={() => { setSelectedElement(isSelected ? null : el); setSelectedItem(null); setEraserMode(false); }}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', 'element');
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    draggedRef.current = { type: 'element', elementId: el.id, width: el.width, height: el.height, imageUrl: el.imageUrl };
                                                }}
                                                style={{ padding: 10, borderRadius: 9, border: `2px solid ${isSelected ? '#6d28d9' : '#ecebf3'}`, background: isSelected ? '#f4f0fe' : '#fafafa', cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
                                                >
                                                    <div style={{ height: 44, borderRadius: 6, background: '#f4f3f9', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                        <img src={imgUrl} alt={el.id} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#4d495f' }}>{el.id.replace('el-', '').charAt(0).toUpperCase() + el.id.replace('el-', '').slice(1)}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: 9, color: '#a3a0b3' }}>{el.blocking ? 'block' : 'walk'}</p>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </>
                            )}
                            {editorTab === 'items' && (
                                <>
                                    {inventory.filter(i => i.quantity > 0).length === 0 ? (
                                        <div style={{ textAlign: 'center' }}>
                                            <p style={{ fontSize: 13, color: '#6f6b82' }}>No items in inventory.</p>
                                            <p style={{ fontSize: 11, color: '#a3a0b3', marginTop: 4 }}>Claim daily gifts or buy from the shop to get items.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {inventory.filter(i => i.quantity > 0).map(item => {
                                                const imgUrl = item.imageUrl.startsWith('http') ? item.imageUrl : `${API}${item.imageUrl}`;
                                                const isSelected = selectedItem?.itemId === item.itemId;
                                                return (
                                            <div
                                                key={item.id}
                                                draggable={true}
                                                onClick={() => { setSelectedItem(isSelected ? null : item); setSelectedElement(null); setEraserMode(false); }}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', 'inventory-item');
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    draggedRef.current = { type: 'inventory-item', itemId: item.itemId, name: item.name, width: item.width, height: item.height, imageUrl: item.imageUrl };
                                                }}
                                                    style={{ padding: '10px 12px', borderRadius: 9, border: `2px solid ${isSelected ? '#6d28d9' : '#ecebf3'}`, background: isSelected ? '#f4f0fe' : '#fafafa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s' }}
                                                >
                                                    <div style={{ width: 40, height: 40, borderRadius: 6, background: '#f4f3f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                                        <img src={imgUrl} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#191427', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#6f6b82' }}>x{item.quantity} · {item.rarity}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: 9, color: '#a3a0b3' }}>{item.blocking ? 'block' : 'walk'}</p>
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                            {editorTab === 'portals' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    <p style={{ margin: 0, fontSize: 11, color: '#6f6b82', lineHeight: 1.5 }}>Connect this space to another via an edge. Players walking to the edge will be prompted to travel.</p>
                                    {/* Existing portals */}
                                    {portals.length === 0 && <p style={{ fontSize: 12, color: '#a3a0b3', textAlign: 'center', margin: '4px 0' }}>No portals yet.</p>}
                                    {portals.map(p => (
                                        <div key={p.id} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid #e7ddfb', background: '#faf9ff', display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <span style={{ fontSize: 18 }}>
                                                {p.fromEdge === 'NORTH' ? '↑' : p.fromEdge === 'SOUTH' ? '↓' : p.fromEdge === 'EAST' ? '→' : '←'}
                                            </span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#5b21b6', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.label}</p>
                                                <p style={{ margin: '1px 0 0', fontSize: 10, color: '#a3a0b3' }}>{p.fromEdge} → {p.toEdge}</p>
                                            </div>
                                            <button
                                                onClick={() => {
                                                    fetch(`${API}/api/v1/space/portal/${p.id}`, { method: 'DELETE', headers: authHeaders })
                                                        .then(() => fetchSpace())
                                                        .catch(() => {});
                                                }}
                                                style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#ef4444', color: '#fff', fontSize: 10, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
                                            >Del</button>
                                        </div>
                                    ))}
                                    {/* Add portal form */}
                                    <div style={{ padding: '10px 12px', borderRadius: 9, border: '1px solid #ecebf3', background: '#f9f8fd', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#191427' }}>Add Portal</p>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: 10, color: '#6f6b82', marginBottom: 2 }}>This edge</label>
                                                <select value={newPortalFromEdge} onChange={e => setNewPortalFromEdge(e.target.value as SpaceEdge)} style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid #e3e1ee', background: '#fff', fontSize: 11, color: '#191427', outline: 'none' }}>
                                                    <option value="NORTH">↑ North</option>
                                                    <option value="SOUTH">↓ South</option>
                                                    <option value="EAST">→ East</option>
                                                    <option value="WEST">← West</option>
                                                </select>
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <label style={{ display: 'block', fontSize: 10, color: '#6f6b82', marginBottom: 2 }}>Enters at</label>
                                                <select value={newPortalToEdge} onChange={e => setNewPortalToEdge(e.target.value as SpaceEdge)} style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid #e3e1ee', background: '#fff', fontSize: 11, color: '#191427', outline: 'none' }}>
                                                    <option value="NORTH">↑ North</option>
                                                    <option value="SOUTH">↓ South</option>
                                                    <option value="EAST">→ East</option>
                                                    <option value="WEST">← West</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: 10, color: '#6f6b82', marginBottom: 2 }}>Destination space</label>
                                            <select value={newPortalToSpaceId} onChange={e => setNewPortalToSpaceId(e.target.value)} style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid #e3e1ee', background: '#fff', fontSize: 11, color: '#191427', outline: 'none' }}>
                                                <option value="">Select a space…</option>
                                                {allSpaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label style={{ display: 'block', fontSize: 10, color: '#6f6b82', marginBottom: 2 }}>Label</label>
                                            <input value={newPortalLabel} onChange={e => setNewPortalLabel(e.target.value)} placeholder="Portal" style={{ width: '100%', padding: '5px 6px', borderRadius: 6, border: '1px solid #e3e1ee', background: '#fff', fontSize: 11, color: '#191427', outline: 'none', boxSizing: 'border-box' }} />
                                        </div>
                                        <button
                                            disabled={!newPortalToSpaceId || savingPortal}
                                            onClick={async () => {
                                                if (!newPortalToSpaceId) return;
                                                setSavingPortal(true);
                                                try {
                                                    const res = await fetch(`${API}/api/v1/space/${spaceId}/portal`, {
                                                        method: 'POST',
                                                        headers: authHeaders,
                                                        body: JSON.stringify({ toSpaceId: newPortalToSpaceId, fromEdge: newPortalFromEdge, toEdge: newPortalToEdge, label: newPortalLabel || 'Portal' }),
                                                    });
                                                    if (res.ok) {
                                                        fetchSpace();
                                                        setNewPortalToSpaceId('');
                                                        setNewPortalLabel('Portal');
                                                    }
                                                } catch {} finally { setSavingPortal(false); }
                                            }}
                                            style={{ padding: '7px', borderRadius: 7, border: 'none', background: newPortalToSpaceId ? 'linear-gradient(135deg,#7c3aed,#a78bfa)' : '#e3e1ee', color: newPortalToSpaceId ? '#fff' : '#a3a0b3', fontSize: 12, cursor: newPortalToSpaceId ? 'pointer' : 'not-allowed', fontWeight: 600, opacity: savingPortal ? 0.7 : 1 }}
                                        >
                                            {savingPortal ? 'Adding…' : '+ Add Portal'}
                                        </button>
                                    </div>
                                </div>
                            )}
                            {editorTab === 'npcs' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <button
                                        onClick={() => {
                                            const cx = Math.floor(spaceDims.width / 2);
                                            const cy = Math.floor(spaceDims.height / 2);
                                            setNpcForm({ name: '', sprite: 'avatar-intern', dialogues: ['', '', ''], x: cx, y: cy, motionType: 'PATROL', wanderRadius: 3 });
                                            setShowNpcModal(true);
                                        }}
                                        style={{ padding: '8px', borderRadius: 6, border: 'none', background: '#6d28d9', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}
                                    >
                                        + Add NPC
                                    </button>
                                    {npcs.length === 0 && <p style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>No NPCs yet.</p>}
                                    {npcs.map(npc => (
                                        <div
                                            key={npc.id}
                                            onClick={() => setSelectedNpcId(selectedNpcId === npc.id ? null : npc.id)}
                                            style={{ padding: '10px 12px', borderRadius: 9, border: `2px solid ${selectedNpcId === npc.id ? '#7c3aed' : '#ecebf3'}`, background: selectedNpcId === npc.id ? '#f4f0fe' : '#f9f8fd', cursor: 'pointer', transition: 'all 0.15s' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <img
                                                    src={`/avatars/${npc.sprite}.png`}
                                                    alt={npc.sprite}
                                                    style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, background: '#ecebf3', flexShrink: 0 }}
                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#191427' }}>{npc.name}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#6f6b82' }}>({npc.x}, {npc.y}) · {npc.dialogues.length} line{npc.dialogues.length !== 1 ? 's' : ''} · <span style={{ color: npc.motionType === 'STATIC' ? '#60a5fa' : npc.motionType === 'WANDER' ? '#34d399' : '#a78bfa' }}>{(npc.motionType ?? 'PATROL').toLowerCase()}</span></p>
                                                </div>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setNpcForm({ id: npc.id, name: npc.name, sprite: npc.sprite, dialogues: [npc.dialogues[0] || '', npc.dialogues[1] || '', npc.dialogues[2] || ''], x: npc.x, y: npc.y, motionType: npc.motionType ?? 'PATROL', wanderRadius: npc.wanderRadius ?? 3 });
                                                            setShowNpcModal(true);
                                                        }}
                                                        style={{ padding: '3px 8px', borderRadius: 5, border: '1px solid #e3e1ee', background: '#fff', color: '#6d28d9', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
                                                    >Edit</button>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            if (!confirm(`Delete ${npc.name}?`)) return;
                                                            fetch(`${API}/api/v1/space/npc/${npc.id}`, { method: 'DELETE', headers: authHeaders })
                                                                .then(() => { if (selectedNpcId === npc.id) setSelectedNpcId(null); fetchNpcs(); })
                                                                .catch(() => {});
                                                        }}
                                                        style={{ padding: '3px 8px', borderRadius: 4, border: 'none', background: '#ef4444', color: '#fff', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
                                                    >Del</button>
                                                </div>
                                            </div>
                                            {selectedNpcId === npc.id && (
                                                <p style={{ margin: '6px 0 0', fontSize: 10, color: '#6f6b82', fontStyle: 'italic' }}>
                                                    Drag on canvas to reposition
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '10px 16px', borderTop: '1px solid #ecebf3', fontSize: 11 }}>
                            {editorError ? (
                                <span style={{ color: '#dc2626' }}>{editorError}</span>
                            ) : (
                                <span style={{ color: '#6f6b82' }}>
                                    {eraserMode ? '🧹 Click/drag to erase · Esc to cancel' : selectedPlacedGroup.length > 1 ? `☐ ${selectedPlacedGroup.length} items selected · Del to delete · Esc to deselect` : selectedPlaced ? 'Click/drag to move · Del to delete · Esc to deselect' : selectedElement || selectedItem ? 'Click/drag (paint brush) to place · Right-click to delete' : 'Click/drag to select items · Select an item from above'}
                                    {!eraserMode && <span style={{ marginLeft: 8 }}>· <span style={{ fontWeight: 600 }}>Ctrl+Z</span> Undo · <span style={{ fontWeight: 600 }}>Ctrl+Shift+Z</span> Redo</span>}
                                </span>
                            )}
                            {placing && <span style={{ marginLeft: 8, color: '#6d28d9' }}>Placing...</span>}
                            {hoverPos && <span style={{ marginLeft: 8, color: '#999' }}>· ({hoverPos.x}, {hoverPos.y})</span>}
                        </div>
                    </div>
                )}

                {!editMode && showGuestbook && (
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 320, background: '#fff', borderLeft: '1px solid #ecebf3', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
                        <div style={{ padding: 16, borderBottom: '1px solid #ecebf3', fontWeight: 600, fontSize: 15, color: '#191427' }}>Guestbook</div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {gbLoading ? (
                                <p style={{ fontSize: 13, color: '#6f6b82', textAlign: 'center' }}>Loading...</p>
                            ) : gbMessages.length === 0 ? (
                                <p style={{ fontSize: 13, color: '#6f6b82', textAlign: 'center' }}>No messages yet.</p>
                            ) : (
                                gbMessages.map(msg => (
                                    <div key={msg.id} style={{ marginBottom: 12, padding: 10, borderRadius: 9, background: '#f9f8fd', border: '1px solid #ecebf3' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#6d28d9', cursor: 'pointer' }} onClick={() => navigate(`/profile/${msg.userId}`)}>
                                                {msg.username}
                                            </span>
                                            <span style={{ fontSize: 10, color: '#a3a0b3' }}>{new Date(msg.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 13, color: '#4d495f' }}>{msg.message}</p>
                                    </div>
                                ))
                            )}
                        </div>
                        <div style={{ padding: 12, borderTop: '1px solid #ecebf3', display: 'flex', gap: 8 }}>
                            <input value={gbMessage} onChange={e => setGbMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostGuestbook()} placeholder="Leave a message..." maxLength={200} style={{ flex: 1, padding: '8px 12px', borderRadius: 7, border: '1px solid #e3e1ee', fontSize: 13, outline: 'none', color: '#191427' }} />
                            <button onClick={handlePostGuestbook} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Send</button>
                        </div>
                    </div>
                )}

                {!editMode && showQuests && (
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 320, background: '#fff', borderLeft: '1px solid #ecebf3', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
                        <div style={{ padding: 16, borderBottom: '1px solid #ecebf3', fontWeight: 600, fontSize: 15, color: '#191427' }}>Quests</div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {questsLoading ? (
                                <p style={{ fontSize: 13, color: '#6f6b82', textAlign: 'center' }}>Loading...</p>
                            ) : quests.length === 0 ? (
                                <p style={{ fontSize: 13, color: '#6f6b82', textAlign: 'center' }}>No active quests right now.</p>
                            ) : (
                                quests.map(q => (
                                    <div key={q.id} style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: q.completed ? '#f0fdf4' : '#f9f8fd', border: `1px solid ${q.completed ? '#bbf7d0' : '#ecebf3'}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#191427' }}>{q.title}</span>
                                            {q.completed && <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✅ Done</span>}
                                        </div>
                                        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#6f6b82' }}>{q.description}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#ecebf3', overflow: 'hidden', animation: 'ovPop 0.18s cubic-bezier(.2,.8,.3,1)' }}>
                                                <div style={{ height: '100%', width: `${Math.min(100, (q.progress / q.goalCount) * 100)}%`, borderRadius: 3, background: q.completed ? '#10b981' : '#6d28d9' }} />
                                            </div>
                                            <span style={{ fontSize: 11, color: '#6f6b82', whiteSpace: 'nowrap' }}>{q.progress}/{q.goalCount}</span>
                                        </div>
                                        <span style={{ fontSize: 11, color: '#b45309', fontWeight: 600 }}>
                                            Reward: {q.rewardType === 'coins' ? `🪙 ${q.rewardValue} coins` : `📦 ${q.rewardValue}`}
                                        </span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                )}

                {!editMode && showBoard && (
                    <KanbanPanel
                        spaceId={spaceId}
                        token={token ?? ''}
                        isOwner={!!currentUser && currentUser.userId === spaceOwnerId}
                        currentUserId={currentUser?.userId ?? ''}
                        users={[...users.values()].map(u => ({ userId: u.userId, username: u.username, avatarId: u.avatarId }))}
                        onClose={() => setShowBoard(false)}
                        refreshFlag={boardWsFlag}
                    />
                )}

                {showNewMap && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowNewMap(false)}>
                        <div style={{ background: '#fff', borderRadius: 14, padding: 28, width: 400, maxWidth: '90vw', boxShadow: '0 24px 60px rgba(22,15,52,0.18)', border: '1px solid #ecebf3' }} onClick={e => e.stopPropagation()}>
                            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#191427' }}>New Map</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#4d495f', display: 'block', marginBottom: 4 }}>Name</label>
                                    <input value={newMapName} onChange={e => setNewMapName(e.target.value)} placeholder="My New Map" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e3e1ee', fontSize: 14, outline: 'none', boxSizing: 'border-box', color: '#191427' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#4d495f', display: 'block', marginBottom: 4 }}>Dimensions</label>
                                    <select value={newMapDims} onChange={e => setNewMapDims(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e3e1ee', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box', color: '#191427' }}>
                                        <option value="10x10">10 x 10</option>
                                        <option value="20x20">20 x 20</option>
                                        <option value="30x20">30 x 20</option>
                                        <option value="30x30">30 x 30</option>
                                        <option value="50x50">50 x 50</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#4d495f', display: 'block', marginBottom: 4 }}>Template (optional)</label>
                                    <select value={newMapTemplate} onChange={e => setNewMapTemplate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #e3e1ee', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box', color: '#191427' }}>
                                        <option value="">Blank</option>
                                        {mapTemplates.map((t: any) => (
                                            <option key={t.id} value={t.id}>{t.name} ({t.dimensions})</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                                    <button onClick={() => setShowNewMap(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #e3e1ee', background: '#fff', color: '#4d495f', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                    <button onClick={handleCreateMap} disabled={creatingMap || !newMapName.trim()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: creatingMap ? '#c4b5fd' : 'linear-gradient(135deg,#7c3aed,#a78bfa)', color: '#fff', fontSize: 14, cursor: creatingMap ? 'wait' : 'pointer', fontWeight: 600 }}>{creatingMap ? 'Creating...' : 'Create'}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showSpaceSettings && (
                    <SpaceSettingsModal
                        spaceId={spaceId}
                        spaceName={spaceName}
                        isPrivate={spaceIsPrivate}
                        isOwner={!!currentUser && currentUser.userId === spaceOwnerId}
                        authHeaders={authHeaders}
                        onClose={() => setShowSpaceSettings(false)}
                        onNameChange={(n) => { setSpaceName(n); }}
                        onPrivacyChange={(v) => { setSpaceIsPrivate(v); }}
                    />
                )}

                {showAvatarPicker && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setShowAvatarPicker(false)}>
                        <div style={{ background: '#fff', borderRadius: 18, padding: '28px 32px', maxWidth: 460, width: '90%', boxShadow: '0 24px 60px rgba(22,15,52,0.22)', border: '1px solid #ecebf3' }} onClick={e => e.stopPropagation()}>
                            <h3 style={{ margin: '0 0 6px', fontSize: 18, fontWeight: 700, color: '#191427', letterSpacing: '-0.02em' }}>Choose Your Character</h3>
                            <p style={{ margin: '0 0 22px', fontSize: 13, color: '#6f6b82' }}>Pick the avatar that represents you in the world.</p>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                                {avatars.map(a => {
                                    const selected = currentUser?.avatarId === a.id;
                                    return (
                                        <button key={a.id} onClick={async () => {
                                            setSavingAvatar(true);
                                            try {
                                                const res = await fetch(`${API}/api/v1/user/metadata`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders }, body: JSON.stringify({ avatarId: a.id }) });
                                                if (res.ok) {
                                                    setCurrentUser(prev => prev ? { ...prev, avatarId: a.id } : prev);
                                                    currentUserRef.current = currentUserRef.current ? { ...currentUserRef.current, avatarId: a.id } : currentUserRef.current;
                                                    if (wsRef.current?.readyState === WebSocket.OPEN) {
                                                        wsRef.current.send(JSON.stringify({ type: 'avatar-changed', payload: { avatarId: a.id } }));
                                                    }
                                                    setShowAvatarPicker(false);
                                                }
                                            } finally { setSavingAvatar(false); }
                                        }} disabled={savingAvatar || selected}
                                        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '14px 10px 12px', borderRadius: 14, border: selected ? '2px solid #6d28d9' : '2px solid #ecebf3', background: selected ? '#f4f0fe' : '#fbfaff', cursor: selected ? 'default' : 'pointer', transition: 'all 0.15s', opacity: savingAvatar ? 0.6 : 1 }}>
                                            <div style={{ width: 52, height: 52, background: selected ? '#ede9fe' : '#f4f3f9', borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', border: selected ? '1px solid #d4b8fc' : '1px solid #e3e1ee' }}>
                                                <PixelAvatar avatarId={a.id} size={40} />
                                            </div>
                                            <img src={a.imageUrl} alt={a.name} style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }} onLoad={() => {}} />
                                            <span style={{ fontSize: 12, fontWeight: 700, color: selected ? '#5b21b6' : '#4d495f', textAlign: 'center', lineHeight: 1.2 }}>{a.name}</span>
                                            {selected && <span style={{ fontSize: 10, fontWeight: 700, color: '#6d28d9', background: '#ede9fe', borderRadius: 999, padding: '2px 8px' }}>Current</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {showGiftModal && giftTarget && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(20,15,40,0.35)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => { setShowGiftModal(false); setGiftMsg(""); }}>
                        <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 380, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(22,15,52,0.22)', border: '1px solid #ecebf3' }} onClick={e => e.stopPropagation()}>
                            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#191427' }}>Send Gift to {giftTarget.username}</h3>
                            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#6f6b82' }}>Choose an item from your inventory</p>
                            {giftMsg && (
                                <p style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 6, background: giftMsg.includes('Sent') ? '#f0fdf4' : '#fef2f2', color: giftMsg.includes('Sent') ? '#059669' : '#ef4444', fontSize: 13 }}>{giftMsg}</p>
                            )}
                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {inventory.filter(i => i.quantity > 0).length === 0 ? (
                                    <p style={{ fontSize: 13, color: '#6f6b82', textAlign: 'center' }}>No items to gift.</p>
                                ) : (
                                    inventory.filter(i => i.quantity > 0).map(item => (
                                        <button key={item.itemId} onClick={() => handleSendGift(item.itemId)} disabled={giftSending} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 9, border: '1px solid #ecebf3', background: '#f9f8fd', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', opacity: giftSending ? 0.5 : 1 }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 6, background: '#f4f3f9', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                                <img src={item.imageUrl.startsWith('http') ? item.imageUrl : `${API}${item.imageUrl}`} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#191427' }}>{item.name}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6f6b82' }}>x{item.quantity} · {item.rarity}</p>
                                            </div>
                                            <span style={{ fontSize: 12, color: '#6d28d9', fontWeight: 600 }}>Gift →</span>
                                        </button>
                                    ))
                                )}
                            </div>
                            <button onClick={() => { setShowGiftModal(false); setGiftMsg(""); }} style={{ marginTop: 12, padding: '10px', borderRadius: 8, border: '1px solid #e3e1ee', background: '#fff', color: '#4d495f', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>

                {toasts.length > 0 && (
                    <div style={{ position: 'fixed', bottom: 74, right: 16, zIndex: 5000, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end', pointerEvents: 'none' }}>
                        {toasts.map(t => {
                            // Toast spec from design system components-toasts.html:
                            // gradient icon tile + colored border + colored shadow
                            const TOAST_SPEC: Record<string, { grad: string; border: string; shadow: string; icon: string }> = {
                                success: { grad: 'linear-gradient(135deg,#34d399,#10b981)', border: '#d7f3e3', shadow: '0 8px 20px rgba(16,185,129,.18)', icon: '🪙' },
                                info:    { grad: 'linear-gradient(135deg,#7c3aed,#a78bfa)', border: '#ddd6fe', shadow: '0 8px 20px rgba(124,58,237,.18)', icon: '→' },
                                warning: { grad: 'linear-gradient(135deg,#fbbf24,#f59e0b)', border: '#fde9c8', shadow: '0 8px 20px rgba(217,119,6,.18)', icon: '⏰' },
                            };
                            const ts = TOAST_SPEC[t.type] || TOAST_SPEC.info;
                            return (
                                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 18px 11px 10px', borderRadius: 13, background: '#fff', color: '#1c1635', fontSize: 13, fontWeight: 700, border: `1px solid ${ts.border}`, boxShadow: ts.shadow, animation: 'ovSlideIn 0.22s cubic-bezier(.2,.8,.3,1)', pointerEvents: 'auto' }}>
                                    <span style={{ width: 30, height: 30, borderRadius: 9, background: ts.grad, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 15, color: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>{ts.icon}</span>
                                    {t.message}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* ── Notifications (toasts + panel + banner) ── */}
                <NotificationPanel
                    notifications={notifications}
                    showPanel={showNotifPanel}
                    notifToasts={notifToasts}
                    urgentBanner={urgentBanner}
                    onMarkRead={(id) => useGameStore.getState().markNotificationRead(id)}
                    onMarkAllRead={() => useGameStore.getState().markAllRead()}
                    onClose={() => useGameStore.getState().toggleNotifPanel()}
                    onDismissToast={(id) => useGameStore.getState().dismissToast(id)}
                    onDismissUrgentBanner={() => useGameStore.getState().setUrgentBanner(null)}
                />

                {/* Camera error toast */}
                {micPermission === 'denied' && (
                    <div
                        onClick={async () => {
                            const pm = peerManagerRef.current;
                            if (!pm) return;
                            try {
                                await pm.init();
                                setMicPermission(pm.hasMic() ? 'granted' : 'denied');
                            } catch {
                                // retry failed silently
                            }
                        }}
                        style={{
                            position: 'fixed',
                            bottom: 160,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 5000,
                            background: 'rgba(120,53,15,0.92)',
                            border: '1px solid rgba(217,119,6,0.6)',
                            borderRadius: 10,
                            padding: '10px 18px',
                            color: '#fef3c7',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                            userSelect: 'none',
                            whiteSpace: 'nowrap',
                        }}
                    >
                        🎤 Microphone access denied — voice calls unavailable. Tap to retry.
                    </div>
                )}

                {cameraError && (
                    <div
                        onClick={() => setCameraError(null)}
                        style={{
                            position: 'fixed',
                            bottom: 120,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            zIndex: 5000,
                            background: 'rgba(185,28,28,0.92)',
                            border: '1px solid rgba(239,68,68,0.6)',
                            borderRadius: 10,
                            padding: '10px 18px',
                            color: '#fef2f2',
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: 'pointer',
                            backdropFilter: 'blur(8px)',
                            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                            userSelect: 'none',
                        }}
                    >
                        {cameraError} — tap to dismiss
                    </div>
                )}

                {/* Video panel — fixed left column, above chat panel */}
                {(remotePeerIds.length > 0 || (cameraEnabled && connectedPeers > 0)) && (() => {
                    const totalTiles = remotePeerIds.length + (cameraEnabled && connectedPeers > 0 ? 1 : 0);
                    const gridCols = totalTiles <= 1 ? 1 : 2;
                    return (
                        <div
                            ref={videoPanelRef}
                            style={{
                                position: 'fixed',
                                top: 56,
                                left: 12,
                                width: 280,
                                zIndex: 4001,
                                padding: 8,
                            }}
                        >
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: gridCols === 1 ? '1fr' : '1fr 1fr',
                                gap: 4,
                            }}>
                                {cameraEnabled && connectedPeers > 0 && (
                                    <div style={{
                                        position: 'relative',
                                        width: '100%',
                                        aspectRatio: '16/9',
                                        borderRadius: 8,
                                        overflow: 'hidden',
                                        background: '#111',
                                        border: '2px solid rgba(139,92,246,0.6)',
                                    }}>
                                        <video
                                            ref={selfVideoRef}
                                            autoPlay
                                            playsInline
                                            muted
                                            style={{ width: '100%', height: '100%', objectFit: 'cover',
                                                display: 'block', transform: 'scaleX(-1)' }}
                                        />
                                        <div style={{
                                            position: 'absolute', bottom: 0, left: 0, right: 0,
                                            padding: '3px 8px',
                                            background: 'rgba(139,92,246,0.75)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        }}>
                                            <span style={{ fontSize: 11, fontWeight: 600, color: '#fff' }}>You</span>
                                            <span style={{ fontSize: 10, lineHeight: 1 }}>
                                                {micEnabled ? '🎙️' : '🔇'}
                                            </span>
                                        </div>
                                    </div>
                                )}
                                {remotePeerIds.map(peerId => {
                                    const stream = remoteStreamsRef.current.get(peerId);
                                    if (!stream) return null;
                                    return (
                                        <RemoteVideoTile
                                            key={peerId}
                                            peerId={peerId}
                                            stream={stream}
                                            username={usersRef.current.get(peerId)?.username}
                                            connectionState={peerConnectionStates.get(peerId)}
                                        />
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                <VoiceToolbar
                    micEnabled={micEnabled}
                    cameraEnabled={cameraEnabled}
                    deafened={deafened}
                    connectedPeers={connectedPeers}
                    onToggleMic={() => {
                        const next = !micEnabled;
                        setMicEnabled(next);
                        peerManagerRef.current?.toggleMic(next);
                    }}
                    onToggleDeafen={() => {
                        const next = !deafened;
                        setDeafened(next);
                        peerManagerRef.current?.setDeafen(next);
                        if (next) setMicEnabled(false);
                    }}
                    onToggleCamera={async () => {
                        const next = !cameraEnabled;
                        if (next) {
                            let stream: MediaStream | null = null;
                            try {
                                stream = await navigator.mediaDevices.getUserMedia({ video: true });
                                localVideoStreamRef.current = stream;
                                if (selfVideoRef.current) selfVideoRef.current.srcObject = stream;
                                // Adds video track to all active peer connections + triggers renegotiation.
                                // Can throw if the hardware encoder path is unsupported (SIGILL risk).
                                await peerManagerRef.current?.enableCamera(stream);
                                setCameraEnabled(true);
                                setCameraError(null);
                            } catch (err) {
                                console.warn('[Camera] failed to enable:', err);
                                // Roll back any partially acquired stream so tracks don't stay open
                                stream?.getTracks().forEach(t => t.stop());
                                localVideoStreamRef.current = null;
                                if (selfVideoRef.current) selfVideoRef.current.srcObject = null;
                                const msg = err instanceof Error && err.name === 'NotAllowedError'
                                    ? 'Camera permission denied'
                                    : 'Camera not supported on this device';
                                setCameraError(msg);
                                setTimeout(() => setCameraError(null), 5000);
                            }
                        } else {
                            peerManagerRef.current?.toggleCamera(false);
                            localVideoStreamRef.current = null;
                            if (selfVideoRef.current) selfVideoRef.current.srcObject = null;
                            remoteStreamsRef.current.clear();
                            setRemotePeerIds([]);
                            setCameraEnabled(false);
                        }
                    }}
                    onLeaveCall={() => {
                        const pm = peerManagerRef.current;
                        if (!pm) return;
                        remoteStreamsRef.current.clear();
                        setRemotePeerIds([]);
                        pm.destroy();
                        localVideoStreamRef.current?.getTracks().forEach(t => t.stop());
                        localVideoStreamRef.current = null;
                        setKnockPendingPeerIds(new Set());
                        setCameraEnabled(false);
                        setMicEnabled(true);
                        setDeafened(false);
                        setConnectedPeers(0);
                        // Re-init so proximity calls work again without a page refresh
                        const user = currentUserRef.current;
                        if (user && wsRef.current) {
                            peerManagerRef.current = null; // clear stale ref while re-init runs
                            rtcBufferRef.current = [];
                            const newPm = new PeerManager(wsRef.current, user.userId, user.username);
                            const reInitWithTimeout = Promise.race([
                                newPm.init(),
                                new Promise<void>((_, reject) =>
                                    setTimeout(() => reject(new Error('PeerManager re-init timeout')), 8000)
                                ),
                            ]);
                            reInitWithTimeout
                                .catch((err) => { console.error('[Game] PeerManager re-init failed or timed out:', err); })
                                .finally(() => {
                                    console.log('[Game] PeerManager re-init ready, localStream:', !!newPm.getLocalStream());
                                    peerManagerRef.current = newPm;
                                    const buffered = rtcBufferRef.current.splice(0);
                                    for (const item of buffered) {
                                        const curPm = peerManagerRef.current;
                                        if (!curPm) break;
                                        const m = item.data as Record<string, unknown>;
                                        switch (item.type) {
                                            case 'rtc:offer': curPm.handleOffer(m.from as string, m.sdp as RTCSessionDescriptionInit); break;
                                            case 'rtc:answer': curPm.handleAnswer(m.from as string, m.sdp as RTCSessionDescriptionInit); break;
                                            case 'rtc:ice': curPm.handleIce(m.from as string, m.candidate as RTCIceCandidateInit); break;
                                            case 'rtc:knock-accept': curPm.handleKnockAccepted(m.from as string); break;
                                            case 'rtc:knock-deny': curPm.handleKnockDenied(m.from as string); break;
                                        }
                                    }
                                });
                        }
                    }}
                />

                {/* Hidden container for HTMLAudioElement nodes — keeps them in the DOM so
                    browsers don't GC or suspend detached audio elements mid-call. */}
                <div id="rtc-audio-container" style={{ display: 'none' }} />

                <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } } @keyframes notifSlideIn { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: translateX(0); } }`}</style>
        </div>
    );
};

const Arena = () => <ArenaInner />;

export default Arena;
