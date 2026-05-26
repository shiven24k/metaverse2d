import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';

interface DragItem { type: 'inventory-item' | 'element'; itemId?: string; elementId?: string; name?: string; width: number; height: number; imageUrl: string; }

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';
const MAX_RECONNECT_ATTEMPTS = 3;

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
    quantity: number;
}

interface SpaceElement {
    id: string;
    element: { id: string; imageUrl: string; width: number; height: number; static: boolean };
    x: number;
    y: number;
}

interface ElementType {
    id: string;
    imageUrl: string;
    width: number;
    height: number;
    static: boolean;
}

interface PlacedItem {
    id: string;
    item: { id: string; name: string; imageUrl: string; width: number; height: number };
    x: number;
    y: number;
    layer: string;
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

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttempts = useRef(0);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessageRef = useRef<(msg: any) => void>(() => {});


    const [currentUser, setCurrentUser] = useState<{ x: number; y: number; userId: string; username: string } | null>(null);
    const [users, setUsers] = useState(new Map<string, { x: number; y: number; userId: string; username: string }>());
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
    const [spaceName, setSpaceName] = useState('');
    const [showNewMap, setShowNewMap] = useState(false);
    const [newMapName, setNewMapName] = useState('');
    const [newMapDims, setNewMapDims] = useState('20x20');
    const [newMapTemplate, setNewMapTemplate] = useState('');
    const [mapTemplates, setMapTemplates] = useState<{ id: string; name: string; dimensions: string }[]>([]);
    const [creatingMap, setCreatingMap] = useState(false);
    const [demoItemsLoading, setDemoItemsLoading] = useState(false);
    const [renderTick, setRenderTick] = useState(0);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const [selectionRect, setSelectionRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
    const [selectedPlacedGroup, setSelectedPlacedGroup] = useState<{ type: 'element' | 'item'; id: string }[]>([]);
    const [chatBubbles, setChatBubbles] = useState<{ id: string; username: string; message: string; x: number; y: number; createdAt: number }[]>([]);
    const [chatInput, setChatInput] = useState('');
    const [showChatInput, setShowChatInput] = useState(false);
    const [playerPopup, setPlayerPopup] = useState<{ userId: string; username: string; x: number; y: number } | null>(null);

    const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
    const rerender = useCallback(() => setRenderTick(t => t + 1), []);

    const getImage = useCallback((url: string): HTMLImageElement => {
        if (!url) {
            const fallback = new Image();
            return fallback;
        }
        const cached = imageCache.current.get(url);
        if (cached) return cached;
        const img = new Image();
        img.src = url.startsWith('http') ? url : `${API}${url}`;
        imageCache.current.set(url, img);
        return img;
    }, []);

    const preloadImages = useCallback((urls: string[]) => {
        urls.forEach(url => {
            if (url && !imageCache.current.has(url)) {
                const img = new Image();
                const fullUrl = url.startsWith('http') ? url : `${API}${url}`;
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
    const [editorTab, setEditorTab] = useState<'elements' | 'items'>('elements');
    const isPainting = useRef(false);
    const lastPlacedCell = useRef<{ x: number; y: number } | null>(null);
    const paintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const isMoving = useRef(false);
    const isSelecting = useRef(false);
    const selectStart = useRef<{ x: number; y: number } | null>(null);
    const moveTarget = useRef<{ type: 'element' | 'item'; id: string; origX: number; origY: number } | null>(null);
    const [movePreview, setMovePreview] = useState<{ x: number; y: number } | null>(null);

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
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const canvasX = (clientX - rect.left) * scaleX;
        const canvasY = (clientY - rect.top) * scaleY;
        return {
            x: Math.floor(canvasX / 50),
            y: Math.floor(canvasY / 50),
        };
    };

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            setError('');
            reconnectAttempts.current = 0;
            ws.send(JSON.stringify({
                type: 'join',
                payload: { spaceId, token },
            }));
        };

        ws.onmessage = (event) => {
            const message = JSON.parse(event.data);
            handleMessageRef.current(message);
        };

        ws.onclose = () => {
            setConnected(false);
            if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
                reconnectAttempts.current++;
                setTimeout(connect, 1000 * reconnectAttempts.current);
            } else {
                setError('Connection lost. Please refresh to reconnect.');
            }
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
            const parent = container.parentElement;
            if (!parent) return;
            const availW = parent.clientWidth - 48;
            const availH = parent.clientHeight - 48;
            const aspect = canvas.width / canvas.height;
            let cssW: number, cssH: number;
            if (availW / availH > aspect) {
                cssH = Math.max(200, Math.min(availH, 800));
                cssW = cssH * aspect;
            } else {
                cssW = Math.max(200, Math.min(availW, 1200));
                cssH = cssW / aspect;
            }
            canvas.style.width = `${Math.floor(cssW)}px`;
            canvas.style.height = `${Math.floor(cssH)}px`;
        };
        resize();
        const observer = new ResizeObserver(resize);
        const parent = containerRef.current?.parentElement;
        if (parent) observer.observe(parent);
        return () => observer.disconnect();
    }, [spaceDims]);

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
                isMoving.current = false;
                moveTarget.current = null;
                setMovePreview(null);
                setPlayerPopup(null);
                setShowChatInput(false);
                setChatInput('');
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

    const fetchDemoItems = useCallback(async () => {
        setDemoItemsLoading(true);
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/inventory/demo`, { method: 'POST', headers: authHeaders });
            if (!res.ok) {
                const data = await res.json();
                setEditorError(data.message || 'Failed to add demo items');
                return;
            }
            await fetchInventory();
        } catch (err) {
            console.error(err);
            setEditorError('Failed to add demo items');
        } finally {
            setDemoItemsLoading(false);
        }
    }, [authHeaders]);

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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessage = (message: any) => {
        switch (message.type) {
            case 'space-joined': {
                setCurrentUser({
                    x: message.payload.spawn.x,
                    y: message.payload.spawn.y,
                    userId: message.payload.userId,
                    username: message.payload.username || 'Unknown',
                });
                const userMap = new Map<string, { x: number; y: number; userId: string; username: string }>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                message.payload.users.forEach((u: any) => {
                    userMap.set(u.userId, { x: u.x, y: u.y, userId: u.userId, username: u.username || 'Unknown' });
                });
                setUsers(userMap);
                fetchSpace();
                fetchInventory();
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
                    });
                    return next;
                });
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
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                setCurrentUser((prev: any) => ({
                    ...prev,
                    x: message.payload.x,
                    y: message.payload.y,
                }));
                break;

            case 'user-left':
                setUsers(prev => {
                    const next = new Map(prev);
                    next.delete(message.payload.userId);
                    return next;
                });
                break;

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
        }
    };
    handleMessageRef.current = handleMessage;

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
        wsRef.current.send(JSON.stringify({
            type: 'move',
            payload: { x: newX, y: newY, userId: currentUser.userId },
        }));
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
        if (editMode) { stopPaint(); return; }
        if (e.button !== 0) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;
        if (currentUser && wsRef.current) {
            const allItems = [
                ...placedItems.map(p => ({ type: 'item' as const, id: p.id, itemId: p.item.id, name: p.item.name, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
            ];
            const hitItem = allItems.find(p => pos.x >= p.x && pos.x < p.x + p.w && pos.y >= p.y && pos.y < p.y + p.h);
            if (hitItem) {
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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const cw = canvas.width;
        const ch = canvas.height;

        ctx.clearRect(0, 0, cw, ch);

        ctx.fillStyle = '#f0fdf4';
        ctx.fillRect(0, 0, cw, ch);

        ctx.strokeStyle = '#d1d5db';
        ctx.lineWidth = 1;
        for (let i = 0; i <= cw; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, ch);
            ctx.stroke();
        }
        for (let i = 0; i <= ch; i += 50) {
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(cw, i);
            ctx.stroke();
        }

        spaceElements.forEach(e => {
            const x = e.x * 50;
            const y = e.y * 50;
            const w = e.element.width * 50;
            const h = e.element.height * 50;
            drawImageOnCanvas(ctx, e.element.imageUrl, x, y, w, h, '#ede9fe', '#7c3aed');
        });

        placedItems.forEach(p => {
            const x = p.x * 50;
            const y = p.y * 50;
            const w = p.item.width * 50;
            const h = p.item.height * 50;
            drawImageOnCanvas(ctx, p.item.imageUrl, x, y, w, h, '#fef3c7', '#d97706', p.item.name);
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
            ctx.beginPath();
            ctx.fillStyle = '#FF6B6B';
            ctx.arc(currentUser.x * 50, currentUser.y * 50, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(currentUser.username, currentUser.x * 50, currentUser.y * 50 + 45);
        }

        users.forEach(user => {
            ctx.beginPath();
            ctx.fillStyle = '#4ECDC4';
            ctx.arc(user.x * 50, user.y * 50, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = 'bold 11px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(user.username, user.x * 50, user.y * 50 + 45);
        });

        chatBubbles.forEach(b => {
            const alpha = Math.max(0, 1 - (Date.now() - b.createdAt) / 4000);
            ctx.globalAlpha = alpha;
            const text = `${b.username}: ${b.message}`;
            ctx.font = '12px sans-serif';
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
    }, [currentUser, users, placedItems, spaceElements, emotes, interactions, hoverPos, selectedPlaced, selectedPlacedGroup, selectedElement, selectedItem, editMode, renderTick, spaceDims, movePreview, moveTarget, selectionRect, chatBubbles]);

    return (
        <div style={{ fontFamily: 'system-ui', background: '#f0f2f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>{spaceName || 'Arena'}</h1>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <span style={{ fontSize: 13, color: connected ? '#10b981' : '#ef4444' }}>
                        {connected ? '● Connected' : '○ Disconnected'}
                    </span>
                    <span style={{ fontSize: 13, color: '#555' }}>
                        Users: {users.size + (currentUser ? 1 : 0)}
                    </span>
                    <button onClick={() => { setShowGuestbook(!showGuestbook); setShowQuests(false); }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: showGuestbook ? '#4f46e5' : '#fff', color: showGuestbook ? '#fff' : '#333', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {showGuestbook ? 'Close' : 'Guestbook'}
                    </button>
                    <button onClick={() => { setShowQuests(!showQuests); setShowGuestbook(false); }} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: showQuests ? '#4f46e5' : '#fff', color: showQuests ? '#fff' : '#333', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {showQuests ? 'Close' : 'Quests'}
                    </button>
                    <button onClick={() => setEditMode(!editMode)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: editMode ? '#4f46e5' : '#fff', color: editMode ? '#fff' : '#333', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                        {editMode ? 'Exit Edit' : 'Edit'}
                    </button>
                    {!editMode && (
                        <button onClick={() => setShowChatInput(!showChatInput)} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: showChatInput ? '#4f46e5' : '#fff', color: showChatInput ? '#fff' : '#333', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                            Chat
                        </button>
                    )}
                    <button onClick={() => navigate('/lobby')} style={{ padding: '6px 14px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 13 }}>
                        ← Leave
                    </button>
                </div>
            </div>

            {error && (
                <div style={{ padding: '8px 24px', background: '#fef2f2', color: '#dc2626', fontSize: 13, textAlign: 'center' }}>{error}</div>
            )}

            <div style={{ flex: 1, overflow: 'auto', display: 'flex' }}>
                <div style={{ flex: 1 }}>
                    <div ref={containerRef} style={{ padding: 24, outline: 'none' }} onKeyDown={handleKeyDown} tabIndex={0}>
                        <p style={{ margin: '0 0 12px', fontSize: 13, color: '#666' }}>
                            {editMode ? '[E] Eraser · [Esc] Deselect · [Ctrl+Z] Undo · Click/drag to place' : 'Arrow keys to move · 1-6 for emotes · Enter to chat · Click items to interact'}
                        </p>
                        {!editMode && showChatInput && (
                            <div style={{ marginBottom: 12, display: 'flex', gap: 8 }}>
                                <input
                                    value={chatInput}
                                    onChange={e => setChatInput(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') sendChat(); if (e.key === 'Escape') { setShowChatInput(false); setChatInput(''); } }}
                                    placeholder="Type a message..."
                                    autoFocus
                                    maxLength={100}
                                    style={{ flex: 1, padding: '8px 12px', borderRadius: 6, border: '1px solid #4f46e5', fontSize: 13, outline: 'none' }}
                                />
                                <button onClick={sendChat} disabled={!chatInput.trim()} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: chatInput.trim() ? '#4f46e5' : '#d1d5db', color: '#fff', fontSize: 13, cursor: chatInput.trim() ? 'pointer' : 'not-allowed', fontWeight: 600 }}>Send</button>
                            </div>
                        )}
                        {playerPopup && (
                            <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', background: '#fff', borderRadius: 12, padding: 24, boxShadow: '0 8px 40px rgba(0,0,0,0.15)', zIndex: 1100, textAlign: 'center' }}>
                                <p style={{ fontSize: 16, fontWeight: 700, color: '#1a1a2e', margin: '0 0 16px' }}>{playerPopup.username}</p>
                                <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                    <button onClick={() => navigate(`/profile/${playerPopup.userId}`)} style={{ padding: '8px 16px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>View Profile</button>
                                    <button onClick={() => { setPlayerPopup(null); }} style={{ padding: '8px 16px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#333', fontSize: 13, cursor: 'pointer' }}>Close</button>
                                </div>
                            </div>
                        )}
                        {playerPopup && <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.2)', zIndex: 1099 }} onClick={() => setPlayerPopup(null)} />}
                        <div style={{ borderRadius: 8, overflow: 'hidden', display: 'inline-block' }}>
                            <canvas
                                ref={canvasRef}
                                width={spaceDims.width * 50}
                                height={spaceDims.height * 50}
                                onMouseDown={startPaint}
                                onMouseUp={handleCanvasMouseUp}
                                onMouseLeave={() => { stopPaint(); setHoverPos(null); }}
                                onMouseMove={handleCanvasMouseMove}
                                onContextMenu={handleCanvasContextMenu}
                                onDragOver={e => { e.preventDefault(); setCanvasIsOver(true); }}
                                onDragLeave={() => { setCanvasIsOver(false); setHoverPos(null); }}
                                onDrop={handleCanvasDrop}
                                style={{ background: '#fff', display: 'block', cursor: editMode ? (selectedElement || selectedItem ? 'cell' : 'crosshair') : 'default', border: `1px solid ${canvasIsOver ? '#4f46e5' : '#e5e7eb'}`, transition: 'border-color 0.15s' }}
                            />
                        </div>
                        {!editMode && (
                            <div style={{ marginTop: 12, display: 'flex', gap: 6 }}>
                                {EMOTES.map((emoji, i) => (
                                    <button key={i} onClick={() => sendEmote(i + 1)} style={{ padding: '6px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}>
                                        {emoji}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {editMode && (
                    <div style={{ width: 280, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
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
                                    onClick={() => { setEraserMode(m => !m); setSelectedItem(null); setSelectedElement(null); setSelectedPlaced(null); }}
                                    style={{ padding: '4px 10px', borderRadius: 4, border: `2px solid ${eraserMode ? '#ef4444' : '#d1d5db'}`, background: eraserMode ? '#fef2f2' : '#fff', color: eraserMode ? '#ef4444' : '#666', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                                    title="Eraser (E)"
                                >
                                    🧹 Eraser
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
                                style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${editorTab === 'elements' ? '#4f46e5' : 'transparent'}`, background: 'none', fontWeight: 600, fontSize: 13, color: editorTab === 'elements' ? '#4f46e5' : '#888', cursor: 'pointer', transition: 'all 0.15s' }}
                            >
                                Elements
                            </button>
                            <button
                                onClick={() => { setEditorTab('items'); setSelectedItem(null); setSelectedElement(null); }}
                                style={{ flex: 1, padding: '10px 0', border: 'none', borderBottom: `2px solid ${editorTab === 'items' ? '#4f46e5' : 'transparent'}`, background: 'none', fontWeight: 600, fontSize: 13, color: editorTab === 'items' ? '#4f46e5' : '#888', cursor: 'pointer', transition: 'all 0.15s' }}
                            >
                                Items
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
                                                    <p style={{ margin: '2px 0 0', fontSize: 9, color: '#999' }}>{el.static ? 'static' : 'deco'}</p>
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
                                            <button
                                                onClick={fetchDemoItems}
                                                disabled={demoItemsLoading}
                                                style={{ marginTop: 8, padding: '8px 16px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', fontSize: 12, cursor: demoItemsLoading ? 'wait' : 'pointer', fontWeight: 600 }}
                                            >
                                                {demoItemsLoading ? 'Adding...' : 'Load Demo Items'}
                                            </button>
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
                                                    </div>
                                                </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </>
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
                    <div style={{ width: 320, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
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
                    <div style={{ width: 320, background: '#fff', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column' }}>
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
            </div>
        </div>
    );
};

const Arena = () => <ArenaInner />;

export default Arena;
