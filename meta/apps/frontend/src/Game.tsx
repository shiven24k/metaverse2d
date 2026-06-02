import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

interface DragItem { type: 'inventory-item' | 'element'; itemId?: string; elementId?: string; name?: string; width: number; height: number; imageUrl: string; }

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const MAX_RECONNECT_DELAY_MS = 30_000;

// Frontend-hosted pixel art sprites (Vite public folder, no API prefix)
const TILE_IMAGE: Record<string, string> = {
    'el-grass':          '/tiles/grass.png',
    'el-dirt':           '/tiles/dirt.png',
    'el-water':          '/tiles/water.png',
    'el-wall':           '/tiles/wall.png',
    'el-path':           '/tiles/path.png',
    'el-tree':           '/tiles/tree.png',
    'el-fence':          '/tiles/fence.png',
    'el-flower':         '/tiles/flower.png',
    'el-sand':           '/tiles/sand.png',
    'el-snow':           '/tiles/snow.png',
    'el-lava':           '/tiles/lava.png',
    'el-cobblestone':    '/tiles/cobblestone.png',
    'el-wood-floor':     '/tiles/wood-floor.png',
    'el-cave-floor':     '/tiles/cave-floor.png',
    'el-bush':           '/tiles/bush.png',
    'el-cactus':         '/tiles/cactus.png',
    'el-rock':           '/tiles/rock.png',
    'el-mushroom':       '/tiles/mushroom.png',
    'el-pine-tree':      '/tiles/pine-tree.png',
    'el-shallow-water':  '/tiles/shallow-water.png',
    'el-waterfall':      '/tiles/waterfall.png',
    'el-brick-wall':     '/tiles/brick-wall.png',
    'el-window':         '/tiles/window.png',
    'el-door':           '/tiles/door.png',
    'el-roof':           '/tiles/roof.png',
    'el-chest':          '/tiles/chest.png',
    'el-office-carpet':  '/tiles/office-carpet.png',
    'el-office-floor':   '/tiles/office-floor.png',
    'el-glass-wall':     '/tiles/glass-wall.png',
};

const ITEM_IMAGE: Record<string, string> = {
    'item-sofa':             '/items/sofa.png',
    'item-table':            '/items/table.png',
    'item-chair':            '/items/chair.png',
    'item-rug':              '/items/rug.png',
    'item-plant':            '/items/plant.png',
    'item-lamp':             '/items/lamp.png',
    'item-painting':         '/items/painting.png',
    'item-bookshelf':        '/items/bookshelf.png',
    'item-crystal':          '/items/crystal.png',
    'item-throne':           '/items/throne.png',
    'item-bed':              '/items/bed.png',
    'item-counter':          '/items/counter.png',
    'item-barrel':           '/items/barrel.png',
    'item-sign':             '/items/sign.png',
    'item-campfire':         '/items/campfire.png',
    'item-fountain':         '/items/fountain.png',
    'item-office-desk':      '/items/office-desk.png',
    'item-office-chair':     '/items/office-chair.png',
    'item-computer':         '/items/computer.png',
    'item-whiteboard':       '/items/whiteboard.png',
    'item-coffee-machine':   '/items/coffee-machine.png',
    'item-filing-cabinet':   '/items/filing-cabinet.png',
    'item-meeting-table':    '/items/meeting-table.png',
    'item-vending-machine':  '/items/vending-machine.png',
    'item-office-printer':   '/items/office-printer.png',
};

const ALL_TILE_PATHS = [...Object.values(TILE_IMAGE), ...Object.values(ITEM_IMAGE)];

const EMOTES = ['👋', '💃', '🧘', '😴', '🎉', '❤️'];

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

interface SpaceElement {
    id: string;
    element: { id: string; imageUrl: string; width: number; height: number; static: boolean; blocking: boolean };
    x: number;
    y: number;
}

interface ElementType {
    id: string;
    imageUrl: string;
    width: number;
    height: number;
    static: boolean;
    blocking: boolean;
}

interface PlacedItem {
    id: string;
    item: { id: string; name: string; imageUrl: string; width: number; height: number; blocking: boolean };
    x: number;
    y: number;
    layer: string;
    metadata?: { text?: string } | null;
}

interface SpacePortal {
    id: string;
    toSpaceId: string;
    x: number;
    y: number;
    label: string;
}

interface NPC {
    id: string;
    name: string;
    sprite: string;
    dialogues: string[];
    x: number;
    y: number;
}


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



const ArenaInner = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const token = useAuthStore((s) => s.token);
    const spaceId = searchParams.get('spaceId') || '';

    const isGuest = useAuthStore((s) => s.isGuest);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttempts = useRef(0);
    const [reconnecting, setReconnecting] = useState(false);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessageRef = useRef<(msg: any) => void>(() => {});


    const [currentUser, setCurrentUser] = useState<{ x: number; y: number; userId: string; username: string; avatarId?: string } | null>(null);
    const [users, setUsers] = useState(new Map<string, { x: number; y: number; userId: string; username: string; avatarId?: string }>());
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
    const [emotes, setEmotes] = useState<EmoteBubble[]>([]);
    const [interactions, setInteractions] = useState<{ id: string; text: string; x: number; y: number; createdAt: number }[]>([]);
    const [showQuests, setShowQuests] = useState(false);
    const [quests, setQuests] = useState<QuestInfo[]>([]);
    const [questsLoading, setQuestsLoading] = useState(false);
    const [editorError, setEditorError] = useState('');
    const [toasts, setToasts] = useState<{ id: string; message: string; type: 'info' | 'success' | 'warning' }[]>([]);
    const [spaceName, setSpaceName] = useState('');
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
    const [chatInput, setChatInput] = useState('');
    const [showChatInput, setShowChatInput] = useState(false);
    const [showEmotePalette, setShowEmotePalette] = useState(false);
    const [playerPopup, setPlayerPopup] = useState<{ userId: string; username: string; x: number; y: number } | null>(null);
    const [showGiftModal, setShowGiftModal] = useState(false);
    const [giftTarget, setGiftTarget] = useState<{ userId: string; username: string } | null>(null);
    const [giftSending, setGiftSending] = useState(false);
    const [giftMsg, setGiftMsg] = useState("");
    const [showAvatarPicker, setShowAvatarPicker] = useState(false);
    const [avatars, setAvatars] = useState<{ id: string; imageUrl: string; name: string }[]>([]);
    const [savingAvatar, setSavingAvatar] = useState(false);

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
    const [npcForm, setNpcForm] = useState<{ id?: string; name: string; sprite: string; dialogues: [string, string, string]; x: number; y: number }>({ name: '', sprite: 'avatar-default', dialogues: ['', '', ''], x: 0, y: 0 });
    const [savingNpc, setSavingNpc] = useState(false);
    const [npcPickingPos, setNpcPickingPos] = useState(false);
    const npcDragRef = useRef<{ id: string } | null>(null);

    // ── Portals ──────────────────────────────────────────────────────────────
    const [portals, setPortals] = useState<SpacePortal[]>([]);
    const portalsRef = useRef<SpacePortal[]>([]);
    const [portalTravel, setPortalTravel] = useState<SpacePortal | null>(null);
    const [showPortalModal, setShowPortalModal] = useState(false);
    const [newPortalPos, setNewPortalPos] = useState<{ x: number; y: number } | null>(null);
    const [newPortalTarget, setNewPortalTarget] = useState('');
    const [newPortalLabel, setNewPortalLabel] = useState('Portal');
    const [portalPlacingMode, setPortalPlacingMode] = useState(false);
    const [showResizeModal, setShowResizeModal] = useState(false);
    const [resizeW, setResizeW] = useState('');
    const [resizeH, setResizeH] = useState('');
    useEffect(() => { portalsRef.current = portals; }, [portals]);

    // ── Activities ───────────────────────────────────────────────────────────
    type Activity = 'sitting' | 'working' | null;
    const [myActivity, setMyActivity] = useState<Activity>(null);
    const myActivityRef = useRef<Activity>(null);
    const [othersActivity, setOthersActivity] = useState<Map<string, Activity>>(new Map());
    useEffect(() => { myActivityRef.current = myActivity; }, [myActivity]);

    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
    const rerender = useCallback(() => setRenderTick(t => t + 1), []);
    useEffect(() => { npcsRef.current = npcs; }, [npcs]);

    const preloadImages = useCallback((urls: string[]) => {
        urls.forEach(url => {
            if (url && !imageCache.current.has(url)) {
                const img = new Image();
                // Tiles and items are frontend-hosted (Vite public/), not proxied through API
                const isLocal = url.startsWith('/tiles/') || url.startsWith('/items/');
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
        const url = `${API}/uploads/defaults/${avatarId}.png`;
        if (!imageCache.current.has(url)) {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                imageCache.current.set(url, img);
                rerender();
            };
            img.src = url;
        }
    }, [rerender]);

    // Preload all tile and item sprites once on mount
    useEffect(() => {
        preloadImages(ALL_TILE_PATHS);
    }, [preloadImages]);

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
    const [editorTab, setEditorTab] = useState<'elements' | 'items' | 'npcs'>('elements');
    const isPainting = useRef(false);
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
    const moveAnimRef = useRef<{ fromX: number; fromY: number; toX: number; toY: number; startTime: number; duration: number } | null>(null);
    const moveQueueRef = useRef<{ x: number; y: number }[]>([]);
    const walkBobRef = useRef(0);
    const walkFrameRef = useRef(0);
    const bumpAnimRef = useRef<{ startTime: number; duration: number } | null>(null);
    const currentUserRef = useRef(currentUser);
    useEffect(() => { currentUserRef.current = currentUser; }, [currentUser]);

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

    const doMove = useCallback((newX: number, newY: number) => {
        const user = currentUserRef.current;
        if (!user || !wsRef.current) return false;
        const dx = newX - user.x;
        const dy = newY - user.y;
        if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
        if (dx < 0) facingRef.current = 'left';
        else if (dx > 0) facingRef.current = 'right';
        else if (dy < 0) facingRef.current = 'up';
        else if (dy > 0) facingRef.current = 'down';
        moveAnimRef.current = { fromX: user.x, fromY: user.y, toX: newX, toY: newY, startTime: performance.now(), duration: 150 };
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
        if (moveAnimRef.current || moveQueueRef.current.length === 0) return;
        const next = moveQueueRef.current.shift()!;
        doMove(next.x, next.y);
    }

    useEffect(() => {
        let id: number;
        function tick() {
            const anim = moveAnimRef.current;
            if (anim) {
                const t = Math.min((performance.now() - anim.startTime) / anim.duration, 1);
                const eased = t * (2 - t);
                animPosRef.current = { x: anim.fromX + (anim.toX - anim.fromX) * eased, y: anim.fromY + (anim.toY - anim.fromY) * eased };
                walkBobRef.current = t < 1 ? Math.sin(t * Math.PI) * 3 : 0;
                walkFrameRef.current = Math.floor((performance.now() - anim.startTime) / 75) % 2;
                if (t >= 1) {
                    animPosRef.current = { x: anim.toX, y: anim.toY };
                    moveAnimRef.current = null;
                    walkBobRef.current = 0;
                    walkFrameRef.current = 0;
                    currentUserRef.current = { ...currentUserRef.current!, x: anim.toX, y: anim.toY };
                    setCurrentUser(prev => prev ? { ...prev, x: anim.toX, y: anim.toY } : prev);
                    processWalkQueue();
                }
                rerender();
            }
            const bump = bumpAnimRef.current;
            if (bump) {
                const t = (performance.now() - bump.startTime) / bump.duration;
                if (t >= 1) { bumpAnimRef.current = null; }
                rerender();
            }
            // Drive NPC tweens
            if (npcAnims.current.size > 0) {
                let anyActive = false;
                for (const [npcId, a] of npcAnims.current) {
                    if ((performance.now() - a.startTime) < a.duration) { anyActive = true; break; }
                    npcAnims.current.delete(npcId);
                }
                if (anyActive) rerender();
            }
            // Portal shimmer animation
            if (portalsRef.current.length > 0) rerender();
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
        const curElements = spaceElementsRef.current;
        const curItems = placedItemsRef.current;
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
        }
    }

    function handleUndo() {
        if (undoStackRef.current.length === 0) return;
        const prev = undoStackRef.current.pop()!;
        redoStackRef.current.push({ elements: spaceElementsRef.current.map(e => ({ ...e, element: { ...e.element } })), items: placedItemsRef.current.map(p => ({ ...p, item: { ...p.item } })) });
        setCanRedo(true);
        setCanUndo(undoStackRef.current.length > 0);
        reconcileState(prev);
    }

    function handleRedo() {
        if (redoStackRef.current.length === 0) return;
        const next = redoStackRef.current.pop()!;
        undoStackRef.current.push({ elements: spaceElementsRef.current.map(e => ({ ...e, element: { ...e.element } })), items: placedItemsRef.current.map(p => ({ ...p, item: { ...p.item } })) });
        setCanUndo(true);
        setCanRedo(redoStackRef.current.length > 0);
        reconcileState(next);
    }

    const batchBuffer = useRef<{ type: 'element' | 'item'; id: string; x: number; y: number }[]>([]);
    const batchFlushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const flushBatch = useCallback(async () => {
        saveUndoSnapshot();
        if (batchFlushTimer.current) { clearTimeout(batchFlushTimer.current); batchFlushTimer.current = null; }
        const buf = batchBuffer.current;
        if (buf.length === 0) return;
        batchBuffer.current = [];
        const elementBuf = buf.filter(b => b.type === 'element').map(b => ({ elementId: b.id, x: b.x, y: b.y }));
        const itemBuf = buf.filter(b => b.type === 'item').map(b => ({ itemId: b.id, x: b.x, y: b.y }));
        try {
            if (elementBuf.length > 0) {
                const res = await fetch(`${API}/api/v1/space/element/batch`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ spaceId, elements: elementBuf }),
                });
                if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Batch element placement failed'); }
            }
            if (itemBuf.length > 0) {
                const res = await fetch(`${API}/api/v1/space/place/batch`, {
                    method: 'POST',
                    headers: authHeaders,
                    body: JSON.stringify({ spaceId, items: itemBuf.map(i => ({ ...i, layer: placementLayer })) }),
                });
                if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Batch item placement failed'); }
            }
            await Promise.all([fetchSpace(), itemBuf.length > 0 ? fetchInventory() : Promise.resolve()]);
        } catch (err) {
            console.error('Batch placement error:', err);
        }
        if (batchBuffer.current.length > 0) {
            flushBatch();
        }
    }, [spaceId, authHeaders, placementLayer]);

    const canvasToGrid = (clientX: number, clientY: number): { x: number; y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const rect = canvas.getBoundingClientRect();
        const canvasX = clientX - rect.left;
        const canvasY = clientY - rect.top;
        return {
            x: Math.floor((canvasX - camRef.current.offsetX + camRef.current.x) / 50),
            y: Math.floor((canvasY - camRef.current.offsetY + camRef.current.y) / 50),
        };
    };

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            setReconnecting(false);
            setError('');
            reconnectAttempts.current = 0;
            ws.send(JSON.stringify({
                type: 'join',
                payload: { spaceId, token: token || '' },
            }));
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleMessageRef.current(message);
        };

        ws.onclose = () => {
            setConnected(false);
            reconnectAttempts.current++;
            const delay = Math.min(1000 * reconnectAttempts.current, MAX_RECONNECT_DELAY_MS);
            setReconnecting(true);
            setError(`Reconnecting (attempt ${reconnectAttempts.current})...`);
            setTimeout(connect, delay);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, [spaceId, token]);

    useEffect(() => {
        connect();
        return () => {
            wsRef.current?.close();
            wsRef.current = null;
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
            if (batchBuffer.current.length > 0) {
                flushBatch();
            }
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
                setSelectedPlaced(null);
                setSelectedPlacedGroup([]);
                setSelectedItem(null);
                setSelectedElement(null);
                setEraserMode(false);
                setPortalPlacingMode(false);
                setSelectedNpcId(null);
                setNpcPickingPos(false);
                npcDragRef.current = null;
                isMoving.current = false;
                moveTarget.current = null;
                setMovePreview(null);
                setPlayerPopup(null);
                setShowChatInput(false);
                setChatInput('');
                setShowEmotePalette(false);
            }
            return;
        }

        if (!currentUser) return;

        if (e.key === 'Enter' && !editMode) {
            setShowChatInput(m => !m);
            if (!showChatInput) setChatInput('');
            return;
        }

        if (e.key >= '1' && e.key <= '6') {
            sendEmote(parseInt(e.key));
            return;
        }

        const { x, y } = currentUser;

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
            // Step on portal
            const portalHere = portalsRef.current.find(p => p.x === x && p.y === y);
            if (portalHere) {
                setPortalTravel(portalHere);
                return;
            }
        }

        switch (e.key) {
            case 'ArrowUp':    handleMove(x, y - 1); break;
            case 'ArrowDown':  handleMove(x, y + 1); break;
            case 'ArrowLeft':  handleMove(x - 1, y); break;
            case 'ArrowRight': handleMove(x + 1, y); break;
        }
    };

    const fetchSpace = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/space/${spaceId}`);
            const data = await res.json();
            setSpaceElements(data.elements || []);
            setPlacedItems(data.placedItems || []);
            setPortals(data.portals || []);
            if (data.name) setSpaceName(data.name);
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
                setNpcs(data.npcs || []);
            }
        } catch {}
    }, [spaceId]);

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

    const addToast = useCallback((message: string, type: 'info' | 'success' | 'warning' = 'info') => {
        const id = Math.random().toString(36).slice(2);
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    }, []);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessage = (message: any) => {
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
                const userMap = new Map<string, { x: number; y: number; userId: string; username: string; avatarId?: string }>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                message.payload.users.forEach((u: any) => {
                    userMap.set(u.userId, { x: u.x, y: u.y, userId: u.userId, username: u.username || 'Unknown', avatarId: u.avatarId });
                });
                setUsers(userMap);
                fetchSpace();
                fetchInventory();
                fetchNpcs();
                break;
            }

            case 'user-joined':
                setUsers(prev => {
                    const next = new Map(prev);
                    next.set(message.payload.userId, {
                        x: message.payload.x,
                        y: message.payload.y,
                        userId: message.payload.userId,
                        username: message.payload.username || 'Unknown',
                        avatarId: message.payload.avatarId,
                    });
                    return next;
                });
                if (message.payload.userId !== currentUserRef.current?.userId) {
                    addToast(`${message.payload.username || 'Someone'} joined`, 'info');
                }
                break;

            case 'movement':
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
                break;

            case 'movement-rejected':
                moveAnimRef.current = null;
                moveQueueRef.current = [];
                const rx = message.payload.x;
                const ry = message.payload.y;
                animPosRef.current = { x: rx, y: ry };
                walkBobRef.current = 0;
                currentUserRef.current = { ...currentUserRef.current!, x: rx, y: ry };
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setCurrentUser((prev: any) => ({ ...prev, x: rx, y: ry }));
                break;

            case 'user-left': {
                const leftUser = users.get(message.payload.userId);
                setUsers(prev => {
                    const next = new Map(prev);
                    next.delete(message.payload.userId);
                    return next;
                });
                if (leftUser) addToast(`${leftUser.username} left`, 'warning');
                break;
            }

            case 'element-placed':
            case 'item-placed':
            case 'element-deleted':
            case 'item-deleted':
            case 'element-moved':
            case 'item-moved':
                fetchSpace();
                fetchInventory();
                break;

            case 'emoted':
                setEmotes(prev => [...prev, {
                    userId: message.payload.userId,
                    emoji: message.payload.emoji,
                    x: message.payload.x,
                    y: message.payload.y,
                    createdAt: Date.now(),
                }]);
                break;

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
                const facingCol: Record<string, number> = { down: 0, left: 1, right: 2, up: 3 };
                if (message.payload.facing) {
                    npcFacing.current.set(message.payload.npcId, facingCol[message.payload.facing] ?? 0);
                }
                setNpcs(prev => {
                    const npc = prev.find(n => n.id === message.payload.npcId);
                    if (npc) {
                        npcAnims.current.set(npc.id, {
                            fromX: npc.x, fromY: npc.y,
                            toX: message.payload.x, toY: message.payload.y,
                            startTime: performance.now(),
                            duration: 450,
                        });
                    }
                    return prev.map(n =>
                        n.id === message.payload.npcId
                            ? { ...n, x: message.payload.x, y: message.payload.y }
                            : n
                    );
                });
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
        }
    };
    handleMessageRef.current = handleMessage;

    // Auto-dismiss interaction popup after 3 s (chest stays if no coins found)
    useEffect(() => {
        if (!interactionPopup) return;
        const t = setTimeout(() => setInteractionPopup(null), 3500);
        return () => clearTimeout(t);
    }, [interactionPopup]);

    const sendEmote = (emoteIndex: number) => {
        if (!currentUser || !wsRef.current) return;
        const emoji = EMOTES[emoteIndex - 1] || EMOTES[0];
        wsRef.current.send(JSON.stringify({
            type: 'emote',
            payload: { emoji, x: currentUser.x, y: currentUser.y },
        }));
        setEmotes(prev => [...prev, {
            userId: currentUser.userId,
            emoji,
            x: currentUser.x,
            y: currentUser.y,
            createdAt: Date.now(),
        }]);
    };

    const sendChat = () => {
        if (!currentUser || !wsRef.current || !chatInput.trim()) return;
        wsRef.current.send(JSON.stringify({
            type: 'chat',
            payload: { message: chatInput.trim(), x: currentUser.x, y: currentUser.y },
        }));
        setChatBubbles(prev => [...prev, {
            id: Math.random().toString(36).slice(2),
            username: currentUser.username,
            message: chatInput.trim(),
            x: currentUser.x,
            y: currentUser.y,
            createdAt: Date.now(),
        }]);
        setChatInput('');
        setShowChatInput(false);
    };

    const handleMove = (newX: number, newY: number) => {
        if (!currentUser || !wsRef.current) return;
        if (isCellBlocked(newX, newY)) {
            bumpAnimRef.current = { startTime: performance.now(), duration: 200 };
            return;
        }
        moveQueueRef.current = [];
        doMove(newX, newY);
        // Clear sitting when moving
        if (myActivityRef.current !== null) {
            setMyActivity(null);
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: 'activity-changed', payload: { activity: null } }));
            }
        }
        // Check portal
        const portal = portalsRef.current.find(p => p.x === newX && p.y === newY);
        if (portal) setTimeout(() => setPortalTravel(portal), 300);
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

    const isAreaFree = useCallback((x: number, y: number, w: number, h: number): boolean => {
        const allPlaced = [
            ...placedItemsRef.current.map(p => ({ x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ...spaceElementsRef.current.map(e => ({ x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
        ];
        return !allPlaced.some(p => x < p.x + p.w && x + w > p.x && y < p.y + p.h && y + h > p.y);
    }, []);

    const paintPlace = useCallback((pos: { x: number; y: number }) => {
        if (!editMode) return;
        if (eraserMode) {
            const allPlaced = [
                ...spaceElementsRef.current.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
                ...placedItemsRef.current.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ];
            const found = allPlaced.find(p => pos.x >= p.x && pos.x < p.x + p.w && pos.y >= p.y && pos.y < p.y + p.h);
            if (found) {
                if (found.type === 'element') deletePlacedElement(found.id);
                else deletePlacedItem(found.id);
            }
            return;
        }
        if (selectedElement) {
            if (!isAreaFree(pos.x, pos.y, selectedElement.width, selectedElement.height)) return;
            batchBuffer.current.push({ type: 'element', id: selectedElement.id, x: pos.x, y: pos.y });
            if (!batchFlushTimer.current) {
                batchFlushTimer.current = setTimeout(() => flushBatch(), 300);
            }
            return;
        }
        if (selectedItem) {
            if (!isAreaFree(pos.x, pos.y, selectedItem.width, selectedItem.height)) return;
            batchBuffer.current.push({ type: 'item', id: selectedItem.itemId, x: pos.x, y: pos.y });
            if (!batchFlushTimer.current) {
                batchFlushTimer.current = setTimeout(() => flushBatch(), 300);
            }
        }
    }, [editMode, eraserMode, selectedElement, selectedItem, isAreaFree, deletePlacedElement, deletePlacedItem, flushBatch]);

    const handleCanvasDrop = useCallback((e: React.DragEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        setCanvasIsOver(false);
        const dragItem = draggedRef.current;
        if (!dragItem) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;
        if (!isAreaFree(pos.x, pos.y, dragItem.width, dragItem.height)) {
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
            setHoverPos(isAreaFree(pos.x, pos.y, item.width, item.height) ? pos : null);
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
        // Right-click on existing portal: delete it
        const hitPortal = portalsRef.current.find(p => p.x === pos.x && p.y === pos.y);
        if (hitPortal) {
            fetch(`${API}/api/v1/space/portal/${hitPortal.id}`, { method: 'DELETE', headers: authHeaders })
                .then(() => fetchSpace())
                .catch(() => {});
            return;
        }
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
        if (editMode) {
            if (portalPlacingMode) {
                const pos = canvasToGrid(e.clientX, e.clientY);
                if (pos) { setNewPortalPos(pos); setShowPortalModal(true); setPortalPlacingMode(false); }
                return;
            }
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
        if (currentUser && wsRef.current) {
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
                setPlayerPopup({ userId: targetUser.userId, username: targetUser.username, x: targetUser.x, y: targetUser.y });
                return;
            }
            if (pos.x !== currentUser.x || pos.y !== currentUser.y) {
                const path = findPath(currentUser.x, currentUser.y, pos.x, pos.y);
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
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const vpW = canvas.width;
        const vpH = canvas.height;
        const worldW = spaceDims.width * 50;
        const worldH = spaceDims.height * 50;

        // When the world fits inside the viewport, center it; otherwise pan to follow player.
        const offsetX = worldW < vpW ? Math.floor((vpW - worldW) / 2) : 0;
        const offsetY = worldH < vpH ? Math.floor((vpH - worldH) / 2) : 0;
        const playerCX = (currentUser ? animPosRef.current.x : 0) * 50 + 25;
        const playerCY = (currentUser ? animPosRef.current.y : 0) * 50 + 25;
        const camX = worldW < vpW ? 0 : Math.round(Math.max(0, Math.min(worldW - vpW, playerCX - vpW / 2)));
        const camY = worldH < vpH ? 0 : Math.round(Math.max(0, Math.min(worldH - vpH, playerCY - vpH / 2)));
        camRef.current = { x: camX, y: camY, offsetX, offsetY };

        ctx.clearRect(0, 0, vpW, vpH);
        ctx.fillStyle = '#1a2e1a';
        ctx.fillRect(0, 0, vpW, vpH);
        ctx.save();
        ctx.translate(offsetX - camX, offsetY - camY);

        // Background: tile grass sprite across all cells, fallback to solid color
        const grassImg = imageCache.current.get('/tiles/grass.png');
        if (grassImg) {
            for (let gy = 0; gy < spaceDims.height; gy++) {
                for (let gx = 0; gx < spaceDims.width; gx++) {
                    try { ctx.drawImage(grassImg, gx * 50, gy * 50, 50, 50); } catch {}
                }
            }
        } else {
            ctx.fillStyle = '#f0fdf4';
            ctx.fillRect(0, 0, worldW, worldH);
        }

        // Grid lines (subtle, on top of grass)
        ctx.strokeStyle = 'rgba(0,0,0,0.10)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= worldW; i += 50) {
            ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, worldH); ctx.stroke();
        }
        for (let i = 0; i <= worldH; i += 50) {
            ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(worldW, i); ctx.stroke();
        }

        spaceElements.forEach(e => {
            const x = e.x * 50;
            const y = e.y * 50;
            const w = e.element.width * 50;
            const h = e.element.height * 50;
            // Prefer frontend-hosted tile sprite, fall back to API-hosted imageUrl
            const tileUrl = TILE_IMAGE[e.element.id] || e.element.imageUrl;
            drawImageOnCanvas(ctx, tileUrl, x, y, w, h, '#ede9fe', 'rgba(0,0,0,0.15)');
        });

        placedItems.forEach(p => {
            const x = p.x * 50;
            const y = p.y * 50;
            const w = p.item.width * 50;
            const h = p.item.height * 50;
            const itemUrl = ITEM_IMAGE[p.item.id] || p.item.imageUrl;
            drawImageOnCanvas(ctx, itemUrl, x, y, w, h, '#fef3c7', 'rgba(0,0,0,0.20)', editMode ? p.item.name : undefined);
        });

        // Portals — animated shimmering gate
        const portalPhase = (performance.now() / 600) % (Math.PI * 2);
        portals.forEach(portal => {
            const px = portal.x * 50;
            const py = portal.y * 50;
            const pulse = 0.55 + 0.3 * Math.sin(portalPhase);
            ctx.save();
            ctx.globalAlpha = pulse;
            const grad = ctx.createLinearGradient(px, py, px + 50, py + 50);
            grad.addColorStop(0, '#7c3aed');
            grad.addColorStop(0.5, '#4f46e5');
            grad.addColorStop(1, '#06b6d4');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.roundRect(px + 4, py + 4, 42, 42, 8);
            ctx.fill();
            ctx.globalAlpha = 0.9;
            ctx.strokeStyle = '#c4b5fd';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(portal.label, px + 25, py + 28);
            ctx.font = '18px sans-serif';
            ctx.fillText('🌀', px + 25, py + 16);
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

        emotes.forEach(em => {
            ctx.font = '24px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(em.emoji, em.x * 50, em.y * 50 - 30);
        });

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

            preloadAvatarImage(currentUser.avatarId);
            const avatarUrl = currentUser.avatarId ? `${API}/uploads/defaults/${currentUser.avatarId}.png` : '';
            const img = avatarUrl ? imageCache.current.get(avatarUrl) : null;
            const bump = bumpAnimRef.current;
            const bumpOff = bump ? Math.sin((performance.now() - bump.startTime) / bump.duration * Math.PI * 4) * 4 * Math.max(0, 1 - (performance.now() - bump.startTime) / bump.duration) : 0;
            const cx = animPosRef.current.x * 50 + bumpOff;
            const cy = animPosRef.current.y * 50 - walkBobRef.current;
            if (img) {
                const dirCol = { down: 0, left: 1, right: 2, up: 3 }[facingRef.current] ?? 0;
                const sx = dirCol * 32;
                const sy = walkFrameRef.current * 48;
                ctx.drawImage(img, sx, sy, 32, 48, cx - 16, cy - 24, 32, 48);
            } else {
                ctx.beginPath();
                ctx.fillStyle = '#FF6B6B';
                ctx.arc(cx, cy, 20, 0, Math.PI * 2);
                ctx.fill();
            }
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
            preloadAvatarImage(user.avatarId);
            const avatarUrl = user.avatarId ? `${API}/uploads/defaults/${user.avatarId}.png` : '';
            const img = avatarUrl ? imageCache.current.get(avatarUrl) : null;
            if (img) {
                ctx.drawImage(img, 0, 0, 32, 48, user.x * 50 - 16, user.y * 50 - 24, 32, 48);
            } else {
                ctx.beginPath();
                ctx.fillStyle = '#4ECDC4';
                ctx.arc(user.x * 50, user.y * 50, 20, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.fillStyle = '#000';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(user.username, user.x * 50, user.y * 50 + 28);
            // Activity emoji
            const uActivity = othersActivity.get(user.userId);
            if (uActivity) {
                ctx.font = '16px sans-serif';
                ctx.fillText(uActivity === 'working' ? '💻' : '💺', user.x * 50, user.y * 50 - 38);
            }
            // 👂 proximity indicator when we're typing a chat message
            if (currentUser && showChatInput) {
                const dist = Math.sqrt((user.x - currentUser.x) ** 2 + (user.y - currentUser.y) ** 2);
                if (dist <= 4) {
                    ctx.font = '14px sans-serif';
                    ctx.globalAlpha = 1;
                    ctx.fillText('👂', user.x * 50, user.y * 50 - 52);
                }
            }
        });

        // NPCs — smooth interpolated movement
        npcs.forEach(npc => {
            preloadAvatarImage(npc.sprite);
            const avatarUrl = `${API}/uploads/defaults/${npc.sprite}.png`;
            const img = imageCache.current.get(avatarUrl);

            // Interpolate position from tween
            const anim = npcAnims.current.get(npc.id);
            let rx = npc.x, ry = npc.y;
            let isWalking = false;
            if (anim) {
                const t = Math.min((performance.now() - anim.startTime) / anim.duration, 1);
                const eased = t * (2 - t);
                rx = anim.fromX + (anim.toX - anim.fromX) * eased;
                ry = anim.fromY + (anim.toY - anim.fromY) * eased;
                isWalking = t < 1;
            }
            const px = rx * 50;
            const py = ry * 50;

            // Sprite facing column and walk frame
            const dirCol = npcFacing.current.get(npc.id) ?? 0;
            const walkFrame = isWalking ? (Math.floor(performance.now() / 100) % 2) : 0;
            const bob = isWalking ? Math.sin(performance.now() / 100) * 2 : 0;

            if (img) {
                ctx.drawImage(img, dirCol * 32, walkFrame * 48, 32, 48, px - 16, py - 24 - bob, 32, 48);
            } else {
                ctx.beginPath();
                ctx.fillStyle = '#FFD700';
                ctx.arc(px, py, 20, 0, Math.PI * 2);
                ctx.fill();
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
            const selNpc = npcs.find(n => n.id === selectedNpcId);
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
    }, [currentUser, users, npcs, portals, placedItems, spaceElements, emotes, interactions, hoverPos, selectedPlaced, selectedPlacedGroup, selectedElement, selectedItem, editMode, renderTick, spaceDims, movePreview, moveTarget, selectionRect, chatBubbles, showChatInput, myActivity, othersActivity, selectedNpcId]);

    return (
        <div style={{ fontFamily: 'system-ui', background: '#0a0a14', position: 'fixed', inset: 0, width: '100vw', height: '100vh', overflow: 'hidden' }}>
            {/* ── Header ── */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 52, background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', zIndex: 10, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                <h1 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: '#fff', letterSpacing: '-0.3px' }}>{spaceName || 'Arena'}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 12, color: connected ? '#4ade80' : '#f87171', fontWeight: 600 }}>
                        {connected ? '● Connected' : '○ Offline'}
                    </span>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', padding: '2px 8px', background: 'rgba(255,255,255,0.07)', borderRadius: 10, marginRight: 4 }}>
                        {users.size + (currentUser ? 1 : 0)} online
                    </span>
                    <button onClick={() => { setShowGuestbook(!showGuestbook); setShowQuests(false); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: showGuestbook ? '#4f46e5' : 'rgba(255,255,255,0.07)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        Guestbook
                    </button>
                    <button onClick={() => { setShowQuests(!showQuests); setShowGuestbook(false); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: showQuests ? '#4f46e5' : 'rgba(255,255,255,0.07)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                        Quests
                    </button>
                    {!isGuest && (
                        <button onClick={() => setEditMode(!editMode)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: editMode ? '#4f46e5' : 'rgba(255,255,255,0.07)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            {editMode ? 'Exit Edit' : 'Edit'}
                        </button>
                    )}
                    {!isGuest && (
                        <button onClick={() => { fetch(`${API}/api/v1/user/avatars`).then(r => r.json()).then(d => setAvatars(d.avatars || [])).catch(() => setAvatars([])); setShowAvatarPicker(true); }} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                            Avatar
                        </button>
                    )}
                    {!editMode && (
                        <button onClick={() => setShowChatInput(!showChatInput)} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: showChatInput ? '#4f46e5' : 'rgba(255,255,255,0.07)', color: '#fff', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                            Chat
                        </button>
                    )}
                    <button onClick={() => navigate('/lobby')} style={{ padding: '5px 12px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.07)', color: '#fff', cursor: 'pointer', fontSize: 12 }}>
                        ← Leave
                    </button>
                </div>
            </div>

            {/* ── Canvas area: position absolute fills the area below the header ── */}
                <div
                    ref={containerRef}
                    style={{ position: 'absolute', top: 52, left: 0, right: 0, bottom: 0, overflow: 'hidden', outline: 'none' }}
                    onKeyDown={handleKeyDown}
                    onClick={() => setShowEmotePalette(false)}
                    tabIndex={0}
                >
                    <canvas
                        ref={canvasRef}
                        onMouseDown={startPaint}
                        onMouseUp={handleCanvasMouseUp}
                        onMouseLeave={() => { stopPaint(); setHoverPos(null); }}
                        onMouseMove={handleCanvasMouseMove}
                        onContextMenu={handleCanvasContextMenu}
                        onDragOver={e => { e.preventDefault(); setCanvasIsOver(true); }}
                        onDragLeave={() => { setCanvasIsOver(false); setHoverPos(null); }}
                        onDrop={handleCanvasDrop}
                        style={{ display: 'block', width: '100%', height: '100%', cursor: editMode ? (selectedElement || selectedItem ? 'cell' : 'crosshair') : 'default', outline: canvasIsOver ? '2px solid #4f46e5' : 'none' }}
                    />

                    {/* ── Error / reconnect banner ── */}
                    {error && (
                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '6px 20px', background: reconnecting ? '#78350f' : '#7f1d1d', color: reconnecting ? '#fde68a' : '#fca5a5', fontSize: 12, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, zIndex: 20 }}>
                            {error}
                            {reconnecting && <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite', fontSize: 14 }}>↻</span>}
                        </div>
                    )}

                {/* Hint text overlay */}
                <div style={{ position: 'absolute', top: 8, left: 12, pointerEvents: 'none', zIndex: 10 }}>
                    <p style={{ margin: 0, fontSize: 11, color: portalPlacingMode || npcPickingPos ? '#c4b5fd' : 'rgba(255,255,255,0.7)', background: 'rgba(0,0,0,0.5)', padding: '3px 10px', borderRadius: 6 }}>
                        {portalPlacingMode ? '🌀 Click a tile to place a portal — [Esc] to cancel' : npcPickingPos ? '📍 Click a tile to position the NPC — [Esc] to cancel' : editMode ? 'Esc deselect · Ctrl+Z undo · right-click portal to delete · click NPC to select/drag' : 'Arrow keys or click to move · [F] Interact/Sit · 1-6 emotes · Enter chat'}
                    </p>
                </div>

                {/* Chat input */}
                {!editMode && showChatInput && (
                    <div style={{ position: 'absolute', bottom: 56, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 50 }}>
                        <input
                            value={chatInput}
                            onChange={e => setChatInput(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') sendChat(); if (e.key === 'Escape') { setShowChatInput(false); setChatInput(''); } }}
                            placeholder="Type a message..."
                            autoFocus
                            maxLength={100}
                            style={{ width: 280, padding: '8px 12px', borderRadius: 6, border: '1px solid #4f46e5', fontSize: 13, outline: 'none', background: 'rgba(10,10,20,0.9)', color: '#fff' }}
                        />
                        <button onClick={sendChat} disabled={!chatInput.trim()} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: chatInput.trim() ? '#4f46e5' : '#374151', color: '#fff', fontSize: 13, cursor: chatInput.trim() ? 'pointer' : 'not-allowed', fontWeight: 600 }}>Send</button>
                    </div>
                )}

                {/* Emote toolbar */}
                {!editMode && (
                    <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', gap: 6, zIndex: 50 }}>
                        <div style={{ position: 'relative' }}>
                            <button
                                onClick={() => setShowEmotePalette(!showEmotePalette)}
                                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: showEmotePalette ? '#4f46e5' : 'rgba(0,0,0,0.65)', cursor: 'pointer', fontSize: 14, lineHeight: 1, color: '#fff', fontWeight: 600 }}
                                title="Emotes"
                            >
                                😊 ▾
                            </button>
                            {showEmotePalette && (
                                <div style={{ position: 'absolute', bottom: '100%', left: 0, marginBottom: 6, display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, padding: 8, borderRadius: 10, background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 20px rgba(0,0,0,0.5)', zIndex: 100 }}>
                                    {EMOTES.map((emoji, i) => (
                                        <button key={i} onClick={() => { sendEmote(i + 1); setShowEmotePalette(false); }} style={{ padding: 8, borderRadius: 6, border: 'none', background: 'rgba(255,255,255,0.08)', cursor: 'pointer', fontSize: 22, lineHeight: 1, transition: 'transform 0.1s' }}
                                            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.2)')}
                                            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                                        >
                                            {emoji}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                            {EMOTES.slice(0, 3).map((emoji, i) => (
                                <button key={i} onClick={() => sendEmote(i + 1)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(0,0,0,0.65)', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
                                    {emoji}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Player popup */}
                {/* ── Interaction popup ── */}
                {interactionPopup && (
                    <div style={{ position: 'absolute', top: '18%', left: '50%', transform: 'translateX(-50%)', background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(8px)', borderRadius: 12, padding: '14px 20px', minWidth: 220, maxWidth: 320, zIndex: 200, textAlign: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 6 }}>{interactionPopup.title}</div>
                        <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5 }}>{interactionPopup.text}</div>
                        <button onClick={() => setInteractionPopup(null)} style={{ marginTop: 10, padding: '4px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: 11, cursor: 'pointer' }}>Dismiss</button>
                    </div>
                )}

                {/* ── NPC dialogue ── */}
                {npcDialogue && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,200,0,0.25)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '24px 28px', width: 340, zIndex: 1200, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                            <span style={{ fontSize: 22 }}>💬</span>
                            <span style={{ fontSize: 17, fontWeight: 700, color: '#FFD700' }}>{npcDialogue.npc.name}</span>
                        </div>
                        <p style={{ margin: '0 0 16px', fontSize: 14, color: '#e2e8f0', lineHeight: 1.6, minHeight: 48 }}>
                            {npcDialogue.npc.dialogues[npcDialogue.idx % npcDialogue.npc.dialogues.length]}
                        </p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            {npcDialogue.npc.dialogues.length > 1 && (
                                <button onClick={() => setNpcDialogue(prev => prev ? { ...prev, idx: prev.idx + 1 } : null)} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid rgba(255,200,0,0.3)', background: 'rgba(255,200,0,0.1)', color: '#FFD700', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>
                                    Next →
                                </button>
                            )}
                            <button onClick={() => setNpcDialogue(null)} style={{ padding: '7px 16px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Close</button>
                        </div>
                    </div>
                )}
                {npcDialogue && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1199 }} onClick={() => setNpcDialogue(null)} />}

                {/* ── Sign editor (edit mode) ── */}
                {signEditing && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, padding: '20px 24px', width: 320, zIndex: 1200, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>📋 Edit Sign Text</div>
                        <input
                            autoFocus
                            value={signEditing.text}
                            onChange={e => setSignEditing({ ...signEditing, text: e.target.value })}
                            onKeyDown={e => { if (e.key === 'Escape') setSignEditing(null); }}
                            maxLength={120}
                            placeholder="Welcome to my space!"
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                        />
                        <div style={{ display: 'flex', gap: 8, marginTop: 12, justifyContent: 'flex-end' }}>
                            <button
                                onClick={async () => {
                                    try {
                                        await fetch(`${API}/api/v1/space/placed/${signEditing.placedItemId}/metadata`, {
                                            method: 'PUT',
                                            headers: authHeaders,
                                            body: JSON.stringify({ metadata: { text: signEditing.text } }),
                                        });
                                        setPlacedItems(prev => prev.map(p =>
                                            p.id === signEditing.placedItemId ? { ...p, metadata: { text: signEditing.text } } : p
                                        ));
                                    } catch {}
                                    setSignEditing(null);
                                }}
                                style={{ padding: '7px 16px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Save
                            </button>
                            <button onClick={() => setSignEditing(null)} style={{ padding: '7px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {signEditing && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1199 }} onClick={() => setSignEditing(null)} />}

                {/* ── NPC add/edit modal ── */}
                {showNpcModal && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '24px 28px', width: 360, zIndex: 1200, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>
                            {npcForm.id ? '✏️ Edit NPC' : '🤖 Add NPC'}
                        </div>
                        <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Name</label>
                        <input
                            value={npcForm.name}
                            onChange={e => setNpcForm(f => ({ ...f, name: e.target.value }))}
                            placeholder="NPC name..."
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
                        />
                        <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Sprite</label>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                            {(['avatar-default', 'avatar-ninja', 'avatar-wizard'] as const).map(av => (
                                <div
                                    key={av}
                                    onClick={() => setNpcForm(f => ({ ...f, sprite: av }))}
                                    style={{ flex: 1, padding: '8px 4px', borderRadius: 8, border: `2px solid ${npcForm.sprite === av ? '#6366f1' : 'rgba(255,255,255,0.1)'}`, background: npcForm.sprite === av ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.04)', cursor: 'pointer', textAlign: 'center' }}
                                >
                                    <img src={`${API}/uploads/defaults/${av}.png`} alt={av} style={{ width: 32, height: 32, objectFit: 'cover', display: 'block', margin: '0 auto 4px' }} onError={e => { (e.target as HTMLImageElement).style.opacity = '0'; }} />
                                    <span style={{ fontSize: 9, color: '#94a3b8' }}>{av.replace('avatar-', '')}</span>
                                </div>
                            ))}
                        </div>
                        <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Position</label>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
                            <div style={{ display: 'flex', gap: 4, flex: 1 }}>
                                <input value={npcForm.x} onChange={e => setNpcForm(f => ({ ...f, x: parseInt(e.target.value) || 0 }))} type="number" min={0} max={spaceDims.width - 1} placeholder="X" style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 12, outline: 'none' }} />
                                <input value={npcForm.y} onChange={e => setNpcForm(f => ({ ...f, y: parseInt(e.target.value) || 0 }))} type="number" min={0} max={spaceDims.height - 1} placeholder="Y" style={{ flex: 1, padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 12, outline: 'none' }} />
                            </div>
                            <button
                                onClick={() => { setNpcPickingPos(true); setShowNpcModal(false); }}
                                style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid rgba(99,102,241,0.4)', background: 'rgba(99,102,241,0.1)', color: '#818cf8', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}
                            >📍 Pick</button>
                        </div>
                        <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Dialogues (up to 3)</label>
                        {([0, 1, 2] as const).map(i => (
                            <input
                                key={i}
                                value={npcForm.dialogues[i]}
                                onChange={e => {
                                    const d: [string, string, string] = [...npcForm.dialogues] as [string, string, string];
                                    d[i] = e.target.value;
                                    setNpcForm(f => ({ ...f, dialogues: d }));
                                }}
                                placeholder={`Line ${i + 1}...`}
                                style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 12, outline: 'none', boxSizing: 'border-box', marginBottom: 6 }}
                            />
                        ))}
                        <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                            <button
                                disabled={savingNpc || !npcForm.name.trim()}
                                onClick={async () => {
                                    if (!npcForm.name.trim()) return;
                                    setSavingNpc(true);
                                    const body = {
                                        name: npcForm.name.trim(),
                                        sprite: npcForm.sprite,
                                        dialogues: npcForm.dialogues.filter(d => d.trim()),
                                        x: npcForm.x,
                                        y: npcForm.y,
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
                                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: savingNpc || !npcForm.name.trim() ? '#374151' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, cursor: savingNpc || !npcForm.name.trim() ? 'not-allowed' : 'pointer', fontWeight: 600 }}
                            >
                                {savingNpc ? 'Saving…' : npcForm.id ? 'Save Changes' : 'Add NPC'}
                            </button>
                            <button onClick={() => setShowNpcModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {showNpcModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1199 }} onClick={() => setShowNpcModal(false)} />}

                {/* NPC position picking hint */}
                {npcPickingPos && (
                    <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(99,102,241,0.9)', color: '#fff', padding: '6px 16px', borderRadius: 20, fontSize: 12, fontWeight: 600, zIndex: 200, pointerEvents: 'none' }}>
                        📍 Click a tile to set NPC position
                    </div>
                )}

                {/* ── Portal travel prompt ── */}
                {portalTravel && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(124,58,237,0.4)', backdropFilter: 'blur(10px)', borderRadius: 14, padding: '24px 28px', width: 320, zIndex: 1200, boxShadow: '0 8px 40px rgba(0,0,0,0.5)', textAlign: 'center' }}>
                        <div style={{ fontSize: 32, marginBottom: 10 }}>🌀</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#c4b5fd', marginBottom: 8 }}>Portal — {portalTravel.label}</div>
                        <p style={{ margin: '0 0 18px', fontSize: 14, color: '#94a3b8' }}>Travel to another space?</p>
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                            <button
                                onClick={() => { navigate(`/arena?spaceId=${portalTravel.toSpaceId}`); setPortalTravel(null); }}
                                style={{ padding: '8px 20px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Travel
                            </button>
                            <button onClick={() => setPortalTravel(null)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: 14, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {portalTravel && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1199 }} onClick={() => setPortalTravel(null)} />}

                {/* ── Portal creation modal ── */}
                {showPortalModal && newPortalPos && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(124,58,237,0.3)', borderRadius: 14, padding: '24px 28px', width: 340, zIndex: 1200, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#c4b5fd', marginBottom: 16 }}>🌀 Create Portal at ({newPortalPos.x}, {newPortalPos.y})</div>
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Destination Space ID</label>
                        <input
                            value={newPortalTarget}
                            onChange={e => setNewPortalTarget(e.target.value)}
                            placeholder="Paste space ID..."
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }}
                        />
                        <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>Label</label>
                        <input
                            value={newPortalLabel}
                            onChange={e => setNewPortalLabel(e.target.value)}
                            placeholder="Portal"
                            style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
                        />
                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button
                                onClick={async () => {
                                    if (!newPortalTarget.trim()) return;
                                    try {
                                        await fetch(`${API}/api/v1/space/${spaceId}/portal`, {
                                            method: 'POST',
                                            headers: authHeaders,
                                            body: JSON.stringify({ toSpaceId: newPortalTarget.trim(), x: newPortalPos.x, y: newPortalPos.y, label: newPortalLabel || 'Portal' }),
                                        });
                                        fetchSpace();
                                    } catch {}
                                    setShowPortalModal(false);
                                    setNewPortalTarget('');
                                    setNewPortalLabel('Portal');
                                }}
                                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#7c3aed,#4f46e5)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Create
                            </button>
                            <button onClick={() => setShowPortalModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {showPortalModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1199 }} onClick={() => setShowPortalModal(false)} />}

                {/* ── Space resize modal ── */}
                {showResizeModal && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', background: 'rgba(15,23,42,0.97)', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 14, padding: '24px 28px', width: 300, zIndex: 1200, boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 16 }}>↔ Resize Space</div>
                        <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Width (5–100)</label>
                                <input value={resizeW} onChange={e => setResizeW(e.target.value)} placeholder={String(spaceDims.width)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                            </div>
                            <div style={{ flex: 1 }}>
                                <label style={{ display: 'block', fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>Height (5–100)</label>
                                <input value={resizeH} onChange={e => setResizeH(e.target.value)} placeholder={String(spaceDims.height)} style={{ width: '100%', padding: '8px 10px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.08)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
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
                                style={{ padding: '8px 18px', borderRadius: 8, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}
                            >
                                Resize
                            </button>
                            <button onClick={() => setShowResizeModal(false)} style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.12)', background: 'transparent', color: '#94a3b8', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
                        </div>
                    </div>
                )}
                {showResizeModal && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 1199 }} onClick={() => setShowResizeModal(false)} />}

                {playerPopup && (
                    <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.15)', zIndex: 1100, textAlign: 'center' }}>
                        <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 16px' }}>{playerPopup.username}</p>
                        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                            <button onClick={() => navigate(`/profile/${playerPopup.userId}`)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>View Profile</button>
                            <button onClick={() => { setGiftTarget({ userId: playerPopup.userId, username: playerPopup.username }); setShowGiftModal(true); setPlayerPopup(null); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#333', fontSize: 13, cursor: 'pointer' }}>Send Gift</button>
                            <button onClick={() => { setPlayerPopup(null); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#333', fontSize: 13, cursor: 'pointer' }}>Close</button>
                        </div>
                    </div>
                )}
                {playerPopup && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1099 }} onClick={() => setPlayerPopup(null)} />}

                {/* ── Editor sidebar (overlays canvas) ── */}
                {editMode && (
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 280, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
                        <div style={{ padding: '14px 16px', borderBottom: '1px solid #e5e7eb', fontWeight: 700, fontSize: 15, color: '#1a1a2e', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span>Editor</span>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button
                                    onClick={handleUndo}
                                    disabled={!canUndo}
                                    title="Undo (Ctrl+Z)"
                                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: canUndo ? '#fff' : '#f3f4f6', color: canUndo ? '#333' : '#bbb', fontSize: 11, cursor: canUndo ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                                >
                                    ↩ Undo
                                </button>
                                <button
                                    onClick={handleRedo}
                                    disabled={!canRedo}
                                    title="Redo (Ctrl+Shift+Z)"
                                    style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: canRedo ? '#fff' : '#f3f4f6', color: canRedo ? '#333' : '#bbb', fontSize: 11, cursor: canRedo ? 'pointer' : 'not-allowed', fontWeight: 600 }}
                                >
                                    ↪ Redo
                                </button>
                                <button
                                    onClick={() => setShowNewMap(true)}
                                    style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', color: '#4f46e5', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                    title="New Map"
                                >
                                    + New Map
                                </button>
                                <button
                                    onClick={() => { setResizeW(String(spaceDims.width)); setResizeH(String(spaceDims.height)); setShowResizeModal(true); }}
                                    style={{ padding: '4px 10px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', color: '#6366f1', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                    title="Resize Space"
                                >
                                    ↔ Resize
                                </button>
                                <button
                                    onClick={() => { setEraserMode(m => !m); setSelectedItem(null); setSelectedElement(null); setSelectedPlaced(null); }}
                                    style={{ padding: '4px 10px', borderRadius: 4, border: `2px solid ${eraserMode ? '#ef4444' : '#d1d5db'}`, background: eraserMode ? '#fef2f2' : '#fff', color: eraserMode ? '#ef4444' : '#666', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                    title="Eraser (E)"
                                >
                                    🧹 Eraser
                                </button>
                                <button
                                    onClick={() => { setPortalPlacingMode(m => !m); setEraserMode(false); setSelectedItem(null); setSelectedElement(null); }}
                                    style={{ padding: '4px 10px', borderRadius: 4, border: `2px solid ${portalPlacingMode ? '#7c3aed' : '#d1d5db'}`, background: portalPlacingMode ? '#f5f3ff' : '#fff', color: '#7c3aed', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                    title="Click canvas to place a portal"
                                >
                                    🌀 Portal
                                </button>
                                {selectedPlaced && (
                                    <button
                                        onClick={() => {
                                            if (selectedPlaced.type === 'element') deletePlacedElement(selectedPlaced.id);
                                            else deletePlacedItem(selectedPlaced.id);
                                            setSelectedPlaced(null);
                                        }}
                                        style={{ padding: '4px 10px', borderRadius: 4, border: 'none', background: '#ef4444', color: '#fff', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                    >
                                        Delete
                                    </button>
                                )}
                            </div>
                        </div>
                        {selectedPlacedGroup.length > 1 && (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#f5f3ff', fontSize: 12, color: '#7c3aed', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
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
                                    style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', color: '#666', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
                                >
                                    Clear
                                </button>
                            </div>
                        )}
                        {eraserMode && (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#fef2f2', fontSize: 12, color: '#ef4444', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>🧹</span>
                                <span>Eraser — click/drag to remove elements and items</span>
                            </div>
                        )}
                        {(selectedElement || selectedItem) && (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#eef2ff', fontSize: 12, color: '#4f46e5', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                <span>🔨</span>
                                <span>
                                    Placing: {selectedElement ? `${selectedElement.width}×${selectedElement.height} element` : `${selectedItem!.name} (${selectedItem!.width}×${selectedItem!.height})`}
                                </span>
                                {selectedItem && (
                                    <div style={{ display: 'flex', marginLeft: 'auto', gap: 4 }}>
                                        <button
                                            onClick={() => setPlacementLayer('FLOOR')}
                                            style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: placementLayer === 'FLOOR' ? '#4f46e5' : '#e5e7eb', color: placementLayer === 'FLOOR' ? '#fff' : '#666', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Floor
                                        </button>
                                        <button
                                            onClick={() => setPlacementLayer('WALL')}
                                            style={{ padding: '2px 8px', borderRadius: 4, border: 'none', background: placementLayer === 'WALL' ? '#4f46e5' : '#e5e7eb', color: placementLayer === 'WALL' ? '#fff' : '#666', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}
                                        >
                                            Wall
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}
                        <div style={{ display: 'flex', borderBottom: '1px solid #e5e7eb' }}>
                            <button
                                onClick={() => { setEditorTab('elements'); setSelectedItem(null); setSelectedElement(null); fetchElementsCatalog(); }}
                                style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${editorTab === 'elements' ? '#4f46e5' : 'transparent'}`, background: 'none', fontWeight: 600, fontSize: 12, color: editorTab === 'elements' ? '#4f46e5' : '#888', cursor: 'pointer', transition: 'all 0.15s' }}
                            >
                                Elements
                            </button>
                            <button
                                onClick={() => { setEditorTab('items'); setSelectedItem(null); setSelectedElement(null); }}
                                style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${editorTab === 'items' ? '#4f46e5' : 'transparent'}`, background: 'none', fontWeight: 600, fontSize: 12, color: editorTab === 'items' ? '#4f46e5' : '#888', cursor: 'pointer', transition: 'all 0.15s' }}
                            >
                                Items
                            </button>
                            <button
                                onClick={() => { setEditorTab('npcs'); setSelectedItem(null); setSelectedElement(null); }}
                                style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${editorTab === 'npcs' ? '#4f46e5' : 'transparent'}`, background: 'none', fontWeight: 600, fontSize: 12, color: editorTab === 'npcs' ? '#4f46e5' : '#888', cursor: 'pointer', transition: 'all 0.15s' }}
                            >
                                NPCs
                            </button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {editorTab === 'elements' && (
                                <>
                                    {elementsLoading && <p style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>Loading...</p>}
                                    {!elementsLoading && elementTypes.length === 0 && (
                                        <p style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>No elements available.</p>
                                    )}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                                        {elementTypes.map(el => {
                                            const imgUrl = el.imageUrl.startsWith('http') ? el.imageUrl : `${API}${el.imageUrl}`;
                                            return (
                                            <div
                                                key={el.id}
                                                draggable={true}
                                                onClick={() => setSelectedElement(selectedElement?.id === el.id ? null : el)}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', 'element');
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    draggedRef.current = { type: 'element', elementId: el.id, width: el.width, height: el.height, imageUrl: el.imageUrl };
                                                }}
                                                style={{ padding: 10, borderRadius: 8, border: `2px solid ${selectedElement?.id === el.id ? '#4f46e5' : '#e5e7eb'}`, background: '#fafafa', cursor: 'pointer', textAlign: 'center', transition: 'border-color 0.15s' }}
                                                >
                                                    <div style={{ height: 44, borderRadius: 4, background: '#f3f4f6', marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                                                        <img src={imgUrl} alt={el.id} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                    </div>
                                                    <p style={{ margin: 0, fontSize: 11, fontWeight: 600, color: '#333' }}>{el.id.replace('el-', '').charAt(0).toUpperCase() + el.id.replace('el-', '').slice(1)}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: 9, color: '#999' }}>{el.blocking ? 'block' : 'walk'}</p>
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
                                            <p style={{ fontSize: 13, color: '#888' }}>No items in inventory.</p>
                                            <p style={{ fontSize: 11, color: '#aaa', marginTop: 4 }}>Claim daily gifts or buy from the shop to get items.</p>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                            {inventory.filter(i => i.quantity > 0).map(item => {
                                                const imgUrl = item.imageUrl.startsWith('http') ? item.imageUrl : `${API}${item.imageUrl}`;
                                                return (
                                            <div
                                                key={item.id}
                                                draggable={true}
                                                onClick={() => setSelectedItem(selectedItem?.itemId === item.itemId ? null : item)}
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData('text/plain', 'inventory-item');
                                                    e.dataTransfer.effectAllowed = 'move';
                                                    draggedRef.current = { type: 'inventory-item', itemId: item.itemId, name: item.name, width: item.width, height: item.height, imageUrl: item.imageUrl };
                                                }}
                                                    style={{ padding: '10px 12px', borderRadius: 8, border: `2px solid ${selectedItem?.itemId === item.itemId ? '#4f46e5' : '#e5e7eb'}`, background: '#fafafa', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, transition: 'border-color 0.15s' }}
                                                >
                                                    <div style={{ width: 40, height: 40, borderRadius: 4, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                                        <img src={imgUrl} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                                    </div>
                                                    <div style={{ flex: 1, minWidth: 0 }}>
                                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#888' }}>x{item.quantity} · {item.rarity}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: 9, color: '#999' }}>{item.blocking ? 'block' : 'walk'}</p>
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
                            )}
                            {editorTab === 'npcs' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <button
                                        onClick={() => {
                                            const cx = Math.floor(spaceDims.width / 2);
                                            const cy = Math.floor(spaceDims.height / 2);
                                            setNpcForm({ name: '', sprite: 'avatar-default', dialogues: ['', '', ''], x: cx, y: cy });
                                            setShowNpcModal(true);
                                        }}
                                        style={{ padding: '8px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600, marginBottom: 4 }}
                                    >
                                        + Add NPC
                                    </button>
                                    {npcs.length === 0 && <p style={{ fontSize: 12, color: '#999', textAlign: 'center' }}>No NPCs yet.</p>}
                                    {npcs.map(npc => (
                                        <div
                                            key={npc.id}
                                            onClick={() => setSelectedNpcId(selectedNpcId === npc.id ? null : npc.id)}
                                            style={{ padding: '10px 12px', borderRadius: 8, border: `2px solid ${selectedNpcId === npc.id ? '#f59e0b' : '#e5e7eb'}`, background: selectedNpcId === npc.id ? '#fffbeb' : '#fafafa', cursor: 'pointer', transition: 'all 0.15s' }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <img
                                                    src={`${API}/uploads/defaults/${npc.sprite}.png`}
                                                    alt={npc.sprite}
                                                    style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, background: '#e5e7eb', flexShrink: 0 }}
                                                    onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                />
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#333' }}>{npc.name}</p>
                                                    <p style={{ margin: '2px 0 0', fontSize: 10, color: '#888' }}>({npc.x}, {npc.y}) · {npc.dialogues.length} line{npc.dialogues.length !== 1 ? 's' : ''}</p>
                                                </div>
                                                <div style={{ display: 'flex', gap: 4 }}>
                                                    <button
                                                        onClick={e => {
                                                            e.stopPropagation();
                                                            setNpcForm({ id: npc.id, name: npc.name, sprite: npc.sprite, dialogues: [npc.dialogues[0] || '', npc.dialogues[1] || '', npc.dialogues[2] || ''], x: npc.x, y: npc.y });
                                                            setShowNpcModal(true);
                                                        }}
                                                        style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid #d1d5db', background: '#fff', color: '#4f46e5', fontSize: 10, cursor: 'pointer', fontWeight: 600 }}
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
                                                <p style={{ margin: '6px 0 0', fontSize: 10, color: '#6b7280', fontStyle: 'italic' }}>
                                                    Drag on canvas to reposition
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div style={{ padding: '10px 16px', borderTop: '1px solid #e5e7eb', fontSize: 11 }}>
                            {editorError ? (
                                <span style={{ color: '#dc2626' }}>{editorError}</span>
                            ) : (
                                <span style={{ color: '#888' }}>
                                    {eraserMode ? '🧹 Click/drag to erase · Esc to cancel' : selectedPlacedGroup.length > 1 ? `☐ ${selectedPlacedGroup.length} items selected · Del to delete · Esc to deselect` : selectedPlaced ? 'Click/drag to move · Del to delete · Esc to deselect' : selectedElement || selectedItem ? 'Click/drag (paint brush) to place · Right-click to delete' : 'Click/drag to select items · Select an item from above'}
                                    {!eraserMode && <span style={{ marginLeft: 8 }}>· <span style={{ fontWeight: 600 }}>Ctrl+Z</span> Undo · <span style={{ fontWeight: 600 }}>Ctrl+Shift+Z</span> Redo</span>}
                                </span>
                            )}
                            {placing && <span style={{ marginLeft: 8, color: '#4f46e5' }}>Placing...</span>}
                            {hoverPos && <span style={{ marginLeft: 8, color: '#999' }}>· ({hoverPos.x}, {hoverPos.y})</span>}
                        </div>
                    </div>
                )}

                {!editMode && showGuestbook && (
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 320, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
                        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 15 }}>Guestbook</div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {gbLoading ? (
                                <p style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>Loading...</p>
                            ) : gbMessages.length === 0 ? (
                                <p style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>No messages yet.</p>
                            ) : (
                                gbMessages.map(msg => (
                                    <div key={msg.id} style={{ marginBottom: 12, padding: 10, borderRadius: 8, background: '#f9fafb' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: '#4f46e5', cursor: 'pointer' }} onClick={() => navigate(`/profile/${msg.userId}`)}>
                                                {msg.username}
                                            </span>
                                            <span style={{ fontSize: 10, color: '#aaa' }}>{new Date(msg.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 13, color: '#333' }}>{msg.message}</p>
                                    </div>
                                ))
                            )}
                        </div>
                        <div style={{ padding: 12, borderTop: '1px solid #e5e7eb', display: 'flex', gap: 8 }}>
                            <input value={gbMessage} onChange={e => setGbMessage(e.target.value)} onKeyDown={e => e.key === 'Enter' && handlePostGuestbook()} placeholder="Leave a message..." maxLength={200} style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, outline: 'none' }} />
                            <button onClick={handlePostGuestbook} style={{ padding: '8px 14px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, cursor: 'pointer' }}>Send</button>
                        </div>
                    </div>
                )}

                {!editMode && showQuests && (
                    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 320, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', zIndex: 100 }}>
                        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', fontWeight: 600, fontSize: 15 }}>Quests</div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: 12 }}>
                            {questsLoading ? (
                                <p style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>Loading...</p>
                            ) : quests.length === 0 ? (
                                <p style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>No active quests right now.</p>
                            ) : (
                                quests.map(q => (
                                    <div key={q.id} style={{ marginBottom: 16, padding: 14, borderRadius: 10, background: q.completed ? '#f0fdf4' : '#f9fafb', border: `1px solid ${q.completed ? '#bbf7d0' : '#e5e7eb'}` }}>
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>{q.title}</span>
                                            {q.completed && <span style={{ fontSize: 11, color: '#059669', fontWeight: 600 }}>✅ Done</span>}
                                        </div>
                                        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#666' }}>{q.description}</p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                            <div style={{ flex: 1, height: 6, borderRadius: 3, background: '#e5e7eb', overflow: 'hidden' }}>
                                                <div style={{ height: '100%', width: `${Math.min(100, (q.progress / q.goalCount) * 100)}%`, borderRadius: 3, background: q.completed ? '#10b981' : '#4f46e5' }} />
                                            </div>
                                            <span style={{ fontSize: 11, color: '#888', whiteSpace: 'nowrap' }}>{q.progress}/{q.goalCount}</span>
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

                {showNewMap && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowNewMap(false)}>
                        <div style={{ background: '#fff', borderRadius: 12, padding: 28, width: 400, maxWidth: '90vw', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
                            <h2 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 700, color: '#1a1a2e' }}>New Map</h2>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#333', display: 'block', marginBottom: 4 }}>Name</label>
                                    <input value={newMapName} onChange={e => setNewMapName(e.target.value)} placeholder="My New Map" style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#333', display: 'block', marginBottom: 4 }}>Dimensions</label>
                                    <select value={newMapDims} onChange={e => setNewMapDims(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                                        <option value="10x10">10 x 10</option>
                                        <option value="20x20">20 x 20</option>
                                        <option value="30x20">30 x 20</option>
                                        <option value="30x30">30 x 30</option>
                                        <option value="50x50">50 x 50</option>
                                    </select>
                                </div>
                                <div>
                                    <label style={{ fontSize: 12, fontWeight: 600, color: '#333', display: 'block', marginBottom: 4 }}>Template (optional)</label>
                                    <select value={newMapTemplate} onChange={e => setNewMapTemplate(e.target.value)} style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box' }}>
                                        <option value="">Blank</option>
                                        {mapTemplates.map((t: any) => (
                                            <option key={t.id} value={t.id}>{t.name} ({t.dimensions})</option>
                                        ))}
                                    </select>
                                </div>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 8 }}>
                                    <button onClick={() => setShowNewMap(false)} style={{ padding: '10px 20px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#333', fontSize: 14, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                                    <button onClick={handleCreateMap} disabled={creatingMap || !newMapName.trim()} style={{ padding: '10px 20px', borderRadius: 8, border: 'none', background: creatingMap ? '#a5b4fc' : '#4f46e5', color: '#fff', fontSize: 14, cursor: creatingMap ? 'wait' : 'pointer', fontWeight: 600 }}>{creatingMap ? 'Creating...' : 'Create'}</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {showAvatarPicker && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => setShowAvatarPicker(false)}>
                        <div style={{ background: '#fff', borderRadius: 16, padding: 28, maxWidth: 400, width: '90%', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
                            <h3 style={{ margin: '0 0 16px', fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>Choose Your Character</h3>
                            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
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
                                        }} disabled={savingAvatar || selected} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: 16, borderRadius: 12, border: selected ? '2px solid #4f46e5' : '2px solid #e5e7eb', background: selected ? '#eef2ff' : '#fff', cursor: 'pointer', transition: 'all 0.15s', opacity: savingAvatar ? 0.6 : 1 }} >
                                            <img src={`${API}${a.imageUrl}`} alt={a.name} style={{ width: 64, height: 96, imageRendering: 'pixelated' }} />
                                            <span style={{ fontSize: 13, fontWeight: 600, color: selected ? '#4f46e5' : '#333' }}>{a.name}</span>
                                            {selected && <span style={{ fontSize: 11, color: '#4f46e5' }}>Current</span>}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                )}

                {showGiftModal && giftTarget && (
                    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }} onClick={() => { setShowGiftModal(false); setGiftMsg(""); }}>
                        <div style={{ background: '#fff', borderRadius: 16, padding: 24, maxWidth: 380, width: '90%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }} onClick={e => e.stopPropagation()}>
                            <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: '#1a1a2e' }}>Send Gift to {giftTarget.username}</h3>
                            <p style={{ margin: '0 0 16px', fontSize: 13, color: '#888' }}>Choose an item from your inventory</p>
                            {giftMsg && (
                                <p style={{ margin: '0 0 12px', padding: '8px 12px', borderRadius: 6, background: giftMsg.includes('Sent') ? '#f0fdf4' : '#fef2f2', color: giftMsg.includes('Sent') ? '#059669' : '#ef4444', fontSize: 13 }}>{giftMsg}</p>
                            )}
                            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                                {inventory.filter(i => i.quantity > 0).length === 0 ? (
                                    <p style={{ fontSize: 13, color: '#888', textAlign: 'center' }}>No items to gift.</p>
                                ) : (
                                    inventory.filter(i => i.quantity > 0).map(item => (
                                        <button key={item.itemId} onClick={() => handleSendGift(item.itemId)} disabled={giftSending} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fafafa', cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s', opacity: giftSending ? 0.5 : 1 }}>
                                            <div style={{ width: 36, height: 36, borderRadius: 4, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                                                <img src={item.imageUrl.startsWith('http') ? item.imageUrl : `${API}${item.imageUrl}`} alt={item.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                                            </div>
                                            <div style={{ flex: 1 }}>
                                                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#333' }}>{item.name}</p>
                                                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#888' }}>x{item.quantity} · {item.rarity}</p>
                                            </div>
                                            <span style={{ fontSize: 12, color: '#4f46e5', fontWeight: 600 }}>Gift →</span>
                                        </button>
                                    ))
                                )}
                            </div>
                            <button onClick={() => { setShowGiftModal(false); setGiftMsg(""); }} style={{ marginTop: 12, padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#333', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Cancel</button>
                        </div>
                    </div>
                )}
            </div>

                {toasts.length > 0 && (
                    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 5000, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
                        {toasts.map(t => (
                            <div key={t.id} style={{
                                padding: '10px 18px',
                                borderRadius: 8,
                                background: t.type === 'success' ? '#059669' : t.type === 'warning' ? '#d97706' : '#4f46e5',
                                color: '#fff',
                                fontSize: 13,
                                fontWeight: 500,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                animation: 'slideIn 0.2s ease-out',
                                pointerEvents: 'auto',
                            }}>
                                {t.message}
                            </div>
                        ))}
                    </div>
                )}

                <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } } @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
    );
};

const Arena = () => <ArenaInner />;

export default Arena;
