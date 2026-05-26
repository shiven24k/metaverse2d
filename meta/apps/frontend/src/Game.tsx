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


    const [currentUser, setCurrentUser] = useState<{ x: number; y: number; userId: string } | null>(null);
    const [users, setUsers] = useState(new Map<string, { x: number; y: number; userId: string }>());
    const [connected, setConnected] = useState(false);
    const [error, setError] = useState('');

    const [inventory, setInventory] = useState<InventoryItem[]>([]);
    const [placedItems, setPlacedItems] = useState<PlacedItem[]>([]);
    const [spaceElements, setSpaceElements] = useState<SpaceElement[]>([]);
    const [editMode, setEditMode] = useState(false);

    const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
    const [selectedElement, setSelectedElement] = useState<ElementType | null>(null);
    const [elementTypes, setElementTypes] = useState<ElementType[]>([]);
    const [elementsLoading, setElementsLoading] = useState(false);
    const [placing, setPlacing] = useState(false);

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
    const [demoItemsLoading, setDemoItemsLoading] = useState(false);

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
    const [canvasScale, setCanvasScale] = useState(1);
    const canvasScaleRef = useRef(1);
    canvasScaleRef.current = canvasScale;

    const canvasToGrid = (clientX: number, clientY: number): { x: number; y: number } | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const scale = canvasScaleRef.current;
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.floor((clientX - rect.left) / 50 / scale),
            y: Math.floor((clientY - rect.top) / 50 / scale),
        };
    };

    const authHeaders = useMemo((): Record<string, string> => ({
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    }), [token]);

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
        const container = containerRef.current?.parentElement;
        if (!container) return;
        const ro = new ResizeObserver((entries) => {
            for (const entry of entries) {
                const w = entry.contentRect.width - 48;
                const s = Math.min(1, w / 2000);
                setCanvasScale(s);
            }
        });
        ro.observe(container);
        return () => ro.disconnect();
    }, []);

    const fetchElementsCatalog = useCallback(async () => {
        setElementsLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/elements`);
            const data = await res.json();
            setElementTypes(data.elements || []);
        } catch (err) {
            console.error(err);
        } finally {
            setElementsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (editMode) fetchElementsCatalog();
    }, [editMode, fetchElementsCatalog]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (editMode) {
            if (selectedPlaced && (e.key === 'Delete' || e.key === 'Backspace')) {
                if (selectedPlaced.type === 'element') deletePlacedElement(selectedPlaced.id);
                else deletePlacedItem(selectedPlaced.id);
                setSelectedPlaced(null);
            }
            if (e.key === 'Escape') {
                setSelectedPlaced(null);
                setSelectedItem(null);
                setSelectedElement(null);
            }
            return;
        }

        if (!currentUser) return;

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
        } catch (err) {
            console.error(err);
        }
    }, [spaceId]);

    const fetchInventory = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/inventory`, { headers: authHeaders });
            const data = await res.json();
            setInventory(data.inventory || []);
        } catch (err) {
            console.error(err);
        }
    }, [authHeaders]);

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
        if (interactions.length === 0) return;
        const timer = setInterval(() => {
            const now = Date.now();
            setInteractions(prev => prev.filter(e => now - e.createdAt < 3000));
        }, 200);
        return () => clearInterval(timer);
    }, [interactions.length]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleMessage = (message: any) => {
        switch (message.type) {
            case 'space-joined': {
                setCurrentUser({
                    x: message.payload.spawn.x,
                    y: message.payload.spawn.y,
                    userId: message.payload.userId,
                });
                const userMap = new Map<string, { x: number; y: number; userId: string }>();
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                message.payload.users.forEach((u: any) => {
                    userMap.set(u.userId, u);
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
                    text: message.payload.text,
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

    const handleMove = (newX: number, newY: number) => {
        if (!currentUser || !wsRef.current) return;
        wsRef.current.send(JSON.stringify({
            type: 'move',
            payload: { x: newX, y: newY, userId: currentUser.userId },
        }));
    };

    const placeItem = useCallback(async (itemId: string, x: number, y: number) => {
        setPlacing(true);
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/space/place`, {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify({ spaceId, itemId, x, y, layer: 'ground' }),
            });
            const data = await res.json();
            if (!res.ok) { setEditorError(data.message || 'Failed to place item'); return; }
            if (data.id) setSelectedPlaced({ type: 'item', id: data.id });
            await Promise.all([fetchSpace(), fetchInventory()]);
        } catch (err) {
            setEditorError('Network error placing item');
            console.error(err);
        } finally {
            setPlacing(false);
        }
    }, [spaceId, authHeaders, fetchSpace, fetchInventory]);

    const placeElement = useCallback(async (elementId: string, x: number, y: number) => {
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
            await fetchSpace();
        } catch (err) {
            setEditorError('Network error placing element');
            console.error(err);
        } finally {
            setPlacing(false);
        }
    }, [spaceId, authHeaders, fetchSpace]);

    const deletePlacedElement = useCallback(async (id: string) => {
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/space/element`, {
                method: 'DELETE',
                headers: authHeaders,
                body: JSON.stringify({ id }),
            });
            if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Failed to delete element'); return; }
            await fetchSpace();
        } catch (err) {
            setEditorError('Network error deleting element');
            console.error(err);
        }
    }, [authHeaders, fetchSpace]);

    const deletePlacedItem = useCallback(async (id: string) => {
        setEditorError('');
        try {
            const res = await fetch(`${API}/api/v1/space/placed/${id}`, {
                method: 'DELETE',
                headers: authHeaders,
            });
            if (!res.ok) { const d = await res.json(); setEditorError(d.message || 'Failed to delete item'); return; }
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

    const handleCanvasClick = async (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!editMode) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;
        if (selectedElement) {
            if (!isAreaFree(pos.x, pos.y, selectedElement.width, selectedElement.height)) return;
            await placeElement(selectedElement.id, pos.x, pos.y);
            return;
        }
        if (selectedItem) {
            if (!isAreaFree(pos.x, pos.y, selectedItem.width, selectedItem.height)) return;
            await placeItem(selectedItem.itemId, pos.x, pos.y);
            return;
        }
        const allPlaced = [
            ...spaceElements.map(e => ({ type: 'element' as const, id: e.id, x: e.x, y: e.y, w: e.element.width, h: e.element.height })),
            ...placedItems.map(p => ({ type: 'item' as const, id: p.id, x: p.x, y: p.y, w: p.item.width, h: p.item.height })),
        ];
        const found = allPlaced.find(p => pos.x >= p.x && pos.x < p.x + p.w && pos.y >= p.y && pos.y < p.y + p.h);
        setSelectedPlaced(found ? { type: found.type, id: found.id } : null);
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

    const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!editMode) return;
        const pos = canvasToGrid(e.clientX, e.clientY);
        if (!pos) return;
        const item = selectedElement || selectedItem;
        if (item) {
            setHoverPos(isAreaFree(pos.x, pos.y, item.width, item.height) ? pos : null);
        } else {
            setHoverPos(pos);
        }
    };

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

        ctx.clearRect(0, 0, 2000, 2000);

        ctx.strokeStyle = '#e5e7eb';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 2000; i += 50) {
            ctx.beginPath();
            ctx.moveTo(i, 0);
            ctx.lineTo(i, 2000);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(0, i);
            ctx.lineTo(2000, i);
            ctx.stroke();
        }

        placedItems.forEach(p => {
            const x = p.x * 50;
            const y = p.y * 50;
            const w = p.item.width * 50;
            const h = p.item.height * 50;
            ctx.fillStyle = '#fef3c7';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#d97706';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
            ctx.fillStyle = '#92400e';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(p.item.name, x + w / 2, y + h / 2 + 3);
        });

        spaceElements.forEach(e => {
            const x = e.x * 50;
            const y = e.y * 50;
            const w = e.element.width * 50;
            const h = e.element.height * 50;
            ctx.fillStyle = '#ede9fe';
            ctx.fillRect(x, y, w, h);
            ctx.strokeStyle = '#7c3aed';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, y, w, h);
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
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('You', currentUser.x * 50, currentUser.y * 50 + 40);
        }

        users.forEach(user => {
            ctx.beginPath();
            ctx.fillStyle = '#4ECDC4';
            ctx.arc(user.x * 50, user.y * 50, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('User', user.x * 50, user.y * 50 + 40);
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
    }, [currentUser, users, placedItems, spaceElements, emotes, interactions, hoverPos, selectedPlaced, selectedElement, selectedItem, editMode]);

    return (
        <div style={{ fontFamily: 'system-ui', background: '#f0f2f5', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ background: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' }}>
                <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>Arena</h1>
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
                            {editMode ? 'Select an item from the sidebar, then click a grid cell near you to place it' : 'Arrow keys to move · 1-6 for emotes'}
                        </p>
                        <div style={{ border: `1px solid ${canvasIsOver ? '#4f46e5' : '#e5e7eb'}`, borderRadius: 8, overflow: 'hidden', display: 'inline-block', transition: 'border-color 0.15s', transform: `scale(${canvasScale})`, transformOrigin: 'top left' }}>
                            <canvas
                                ref={canvasRef}
                                width={2000}
                                height={2000}
                                onClick={handleCanvasClick}
                                onContextMenu={handleCanvasContextMenu}
                                onMouseMove={handleCanvasMouseMove}
                                onMouseLeave={() => setHoverPos(null)}
                                onDragOver={e => { e.preventDefault(); setCanvasIsOver(true); }}
                                onDragLeave={() => { setCanvasIsOver(false); setHoverPos(null); }}
                                onDrop={handleCanvasDrop}
                                style={{ background: '#fff', display: 'block', cursor: editMode ? 'crosshair' : 'default' }}
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
                        {(selectedElement || selectedItem) && (
                            <div style={{ padding: '10px 16px', borderBottom: '1px solid #e5e7eb', background: '#eef2ff', fontSize: 12, color: '#4f46e5', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span>🔨</span>
                                <span>
                                    Placing: {selectedElement ? `${selectedElement.width}×${selectedElement.height} element` : `${selectedItem!.name} (${selectedItem!.width}×${selectedItem!.height})`}
                                </span>
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
                                            const colors = ['#f97316', '#8b5cf6', '#ec4899', '#14b8a6', '#f43f5e', '#06b6d4', '#84cc16', '#0ea5e9'];
                                            const hash = el.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
                                            const bg = colors[hash % colors.length];
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
                                                    <div style={{ height: 40, borderRadius: 4, background: bg, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                                        <span style={{ fontSize: 10, color: '#fff', fontWeight: 700, opacity: 0.8 }}>{el.width}×{el.height}</span>
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
                                            {inventory.filter(i => i.quantity > 0).map(item => (
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
                                                    <div style={{ fontSize: 20 }}>📦</div>
                                                    <div style={{ flex: 1 }}>
                                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#333' }}>{item.name}</p>
                                                        <p style={{ margin: '2px 0 0', fontSize: 10, color: '#888' }}>x{item.quantity} · {item.rarity}</p>
                                                    </div>
                                                </div>
                                            ))}
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
                                    {selectedPlaced ? 'Delete · Del/Backspace' : selectedElement || selectedItem ? 'Click canvas to place · Right-click to delete' : 'Select an item from above'}
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
            </div>
        </div>
    );
};

const Arena = () => <ArenaInner />;

export default Arena;
