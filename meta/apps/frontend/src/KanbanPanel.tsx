import { useState, useEffect, useCallback, useRef } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

type KanbanPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

const PRIORITY_STYLE: Record<KanbanPriority, { bg: string; text: string; border: string; label: string }> = {
    LOW:    { bg: '#f3f4f6', text: '#6b7280', border: '#d1d5db', label: 'Low' },
    MEDIUM: { bg: '#eff6ff', text: '#3b82f6', border: '#bfdbfe', label: 'Medium' },
    HIGH:   { bg: '#fff7ed', text: '#f97316', border: '#fed7aa', label: 'High' },
    URGENT: { bg: '#fef2f2', text: '#ef4444', border: '#fecaca', label: 'Urgent' },
};

interface CardData {
    id: string;
    columnId: string;
    title: string;
    description: string;
    assigneeId: string | null;
    assigneeUsername: string | null;
    assigneeAvatarId: string | null;
    priority: KanbanPriority;
    dueDate: string | null;
    order: number;
}

interface ColumnData {
    id: string;
    name: string;
    order: number;
    color: string;
    cards: CardData[];
}

interface BoardData {
    id: string;
    name: string;
    columns: ColumnData[];
}

interface Comment {
    id: string;
    userId: string;
    username: string;
    content: string;
    createdAt: string;
}

interface SpaceUser {
    userId: string;
    username: string;
    avatarId?: string;
}

interface Props {
    spaceId: string;
    token: string;
    isOwner: boolean;
    currentUserId: string;
    users: SpaceUser[];
    onClose: () => void;
    refreshFlag: number;
}

function PixelMini({ avatarId, size = 22 }: { avatarId?: string | null; size?: number }) {
    const PALETTES: Record<string, { skin: string; hair: string; shirt: string }> = {
        'avatar-ceo':       { skin: '#f1c27d', hair: '#4a4a4a', shirt: '#1e3a5f' },
        'avatar-dev':       { skin: '#f1c27d', hair: '#8b4513', shirt: '#374151' },
        'avatar-designer':  { skin: '#f1c27d', hair: '#c8a400', shirt: '#7e22ce' },
        'avatar-hr':        { skin: '#f1c27d', hair: '#2d1810', shirt: '#9f1239' },
        'avatar-marketing': { skin: '#f1c27d', hair: '#b91c1c', shirt: '#f97316' },
        'avatar-intern':    { skin: '#f1c27d', hair: '#92400e', shirt: '#0ea5e9' },
        default:            { skin: '#f1c27d', hair: '#92400e', shirt: '#0ea5e9' },
    };
    const P = PALETTES[avatarId ?? 'default'] ?? PALETTES.default;
    const u = size / 8;
    return (
        <div style={{ width: size, height: size, position: 'relative', flexShrink: 0 }}>
            <div style={{ position: 'absolute', left: u*2, top: 0,     width: u*4, height: u*2,   background: P.hair }} />
            <div style={{ position: 'absolute', left: u*2, top: u*1.4, width: u*4, height: u*3,   background: P.skin }} />
            <div style={{ position: 'absolute', left: u*1.5, top: u*4, width: u*5, height: u*3,   background: P.shirt, borderRadius: 1 }} />
        </div>
    );
}

export function KanbanPanel({ spaceId, token, isOwner, currentUserId, users, onClose, refreshFlag }: Props) {
    const authHeaders = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

    const [board, setBoard] = useState<BoardData | null>(null);
    const [loading, setLoading] = useState(true);
    const [boardName, setBoardName] = useState('Office Board');
    const [creating, setCreating] = useState(false);

    // Card detail
    const [selectedCard, setSelectedCard] = useState<CardData | null>(null);
    const [editTitle, setEditTitle] = useState('');
    const [editDesc, setEditDesc] = useState('');
    const [editAssignee, setEditAssignee] = useState<string | null>(null);
    const [editPriority, setEditPriority] = useState<KanbanPriority>('MEDIUM');
    const [editDue, setEditDue] = useState('');
    const [savingCard, setSavingCard] = useState(false);
    const [comments, setComments] = useState<Comment[]>([]);
    const [commentsLoading, setCommentsLoading] = useState(false);
    const [newComment, setNewComment] = useState('');

    // Add card inline
    const [addingToCol, setAddingToCol] = useState<string | null>(null);
    const [newCardTitle, setNewCardTitle] = useState('');

    // Add column
    const [addingCol, setAddingCol] = useState(false);
    const [newColName, setNewColName] = useState('');

    // Drag and drop
    const dragCardIdRef = useRef<string | null>(null);
    const dragSrcColRef = useRef<string | null>(null);
    const [dropTarget, setDropTarget] = useState<{ columnId: string; index: number } | null>(null);

    const fetchBoard = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/space/${spaceId}/board`);
            if (res.status === 404) { setBoard(null); return; }
            const data = await res.json();
            setBoard(data.board ?? null);
        } catch { setBoard(null); }
        finally { setLoading(false); }
    }, [spaceId]);

    useEffect(() => { fetchBoard(); }, [fetchBoard, refreshFlag]);

    const fetchComments = useCallback(async (cardId: string) => {
        setCommentsLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/board/card/${cardId}/comments`, { headers: authHeaders });
            const data = await res.json();
            setComments(data.comments ?? []);
        } finally { setCommentsLoading(false); }
    }, [token]);

    const openCard = (card: CardData) => {
        setSelectedCard(card);
        setEditTitle(card.title);
        setEditDesc(card.description);
        setEditAssignee(card.assigneeId);
        setEditPriority(card.priority);
        setEditDue(card.dueDate ? card.dueDate.substring(0, 10) : '');
        fetchComments(card.id);
    };

    const handleCreateBoard = async () => {
        if (!boardName.trim()) return;
        setCreating(true);
        try {
            const res = await fetch(`${API}/api/v1/space/${spaceId}/board`, {
                method: 'POST', headers: authHeaders,
                body: JSON.stringify({ name: boardName.trim() }),
            });
            if (res.ok) { setBoardName(''); fetchBoard(); }
        } finally { setCreating(false); }
    };

    const handleAddCard = async (colId: string) => {
        if (!newCardTitle.trim()) return;
        await fetch(`${API}/api/v1/board/column/${colId}/card`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ title: newCardTitle.trim() }),
        });
        setAddingToCol(null);
        setNewCardTitle('');
        fetchBoard();
    };

    const handleAddColumn = async () => {
        if (!newColName.trim() || !board) return;
        await fetch(`${API}/api/v1/board/${board.id}/column`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ name: newColName.trim() }),
        });
        setAddingCol(false);
        setNewColName('');
        fetchBoard();
    };

    const handleDeleteColumn = async (colId: string) => {
        if (!confirm('Delete this column and all its cards?')) return;
        await fetch(`${API}/api/v1/board/column/${colId}`, { method: 'DELETE', headers: authHeaders });
        fetchBoard();
    };

    const handleSaveCard = async () => {
        if (!selectedCard) return;
        setSavingCard(true);
        try {
            await fetch(`${API}/api/v1/board/card/${selectedCard.id}`, {
                method: 'PUT', headers: authHeaders,
                body: JSON.stringify({
                    title: editTitle,
                    description: editDesc,
                    assigneeId: editAssignee,
                    priority: editPriority,
                    dueDate: editDue || null,
                }),
            });
            setSelectedCard(null);
            fetchBoard();
        } finally { setSavingCard(false); }
    };

    const handleDeleteCard = async (cardId: string) => {
        if (!confirm('Delete this card?')) return;
        await fetch(`${API}/api/v1/board/card/${cardId}`, { method: 'DELETE', headers: authHeaders });
        setSelectedCard(null);
        fetchBoard();
    };

    const handleAddComment = async () => {
        if (!selectedCard || !newComment.trim()) return;
        await fetch(`${API}/api/v1/board/card/${selectedCard.id}/comment`, {
            method: 'POST', headers: authHeaders,
            body: JSON.stringify({ content: newComment.trim() }),
        });
        setNewComment('');
        fetchComments(selectedCard.id);
    };

    // Drag-and-drop handlers
    const handleDragStart = (cardId: string, colId: string) => {
        dragCardIdRef.current = cardId;
        dragSrcColRef.current = colId;
    };

    const handleDragOver = (e: React.DragEvent, colId: string, index: number) => {
        e.preventDefault();
        setDropTarget({ columnId: colId, index });
    };

    const handleDrop = async (e: React.DragEvent, targetColId: string, targetIndex: number) => {
        e.preventDefault();
        const cardId = dragCardIdRef.current;
        if (!cardId) return;
        dragCardIdRef.current = null;
        dragSrcColRef.current = null;
        setDropTarget(null);

        // Optimistic update
        setBoard(prev => {
            if (!prev) return prev;
            let moved: CardData | null = null;
            const stripped = prev.columns.map(col => ({
                ...col,
                cards: col.cards.filter(c => { if (c.id === cardId) { moved = c; return false; } return true; }),
            }));
            if (!moved) return prev;
            const m = moved as CardData;
            return {
                ...prev,
                columns: stripped.map(col => {
                    if (col.id !== targetColId) return col;
                    const cards = [...col.cards];
                    cards.splice(targetIndex, 0, { ...m, columnId: targetColId });
                    return { ...col, cards };
                }),
            };
        });

        await fetch(`${API}/api/v1/board/card/${cardId}/move`, {
            method: 'PUT', headers: authHeaders,
            body: JSON.stringify({ columnId: targetColId, order: targetIndex }),
        });
    };

    const handleDragEnd = () => {
        dragCardIdRef.current = null;
        dragSrcColRef.current = null;
        setDropTarget(null);
    };

    const isOverdue = (dueDate: string | null) => {
        if (!dueDate) return false;
        return new Date(dueDate) < new Date();
    };

    const formatDate = (iso: string) => {
        const d = new Date(iso);
        return `${d.getMonth() + 1}/${d.getDate()}`;
    };

    if (loading) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 16, padding: 40, fontSize: 15, color: '#555' }}>Loading board…</div>
            </div>
        );
    }

    if (!board) {
        return (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ background: '#fff', borderRadius: 16, padding: 36, maxWidth: 400, width: '90%', boxShadow: '0 8px 40px rgba(0,0,0,0.15)' }}>
                    <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 700, color: '#1a1a2e' }}>📋 Kanban Board</h2>
                    <p style={{ margin: '0 0 20px', fontSize: 13, color: '#888' }}>
                        {isOwner ? 'No board for this space yet. Create one to get started.' : 'This space has no Kanban board yet.'}
                    </p>
                    {isOwner && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <input
                                value={boardName}
                                onChange={e => setBoardName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreateBoard()}
                                placeholder="Board name"
                                style={{ flex: 1, padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 14, outline: 'none' }}
                            />
                            <button onClick={handleCreateBoard} disabled={creating} style={{ padding: '10px 18px', borderRadius: 8, border: 'none', background: '#6366f1', color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
                                {creating ? '...' : 'Create'}
                            </button>
                        </div>
                    )}
                    <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: '10px', borderRadius: 8, border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: 14, cursor: 'pointer' }}>Close</button>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* Full-screen board overlay */}
            <div style={{ position: 'fixed', inset: 0, background: '#f1f5f9', zIndex: 500, display: 'flex', flexDirection: 'column' }}>
                {/* Header */}
                <div style={{ height: 52, background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 12, flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <span style={{ fontSize: 18, fontWeight: 700, color: '#1e293b', flex: 1 }}>📋 {board.name}</span>
                    <button onClick={onClose} style={{ padding: '6px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', color: '#64748b', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>✕ Close</button>
                </div>

                {/* Columns scroll area */}
                <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', display: 'flex', gap: 14, padding: '16px 20px', alignItems: 'flex-start' }}>
                    {board.columns.map((col) => (
                        <div
                            key={col.id}
                            style={{ width: 280, minWidth: 280, display: 'flex', flexDirection: 'column', background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', maxHeight: 'calc(100vh - 120px)' }}
                            onDragOver={e => e.preventDefault()}
                        >
                            {/* Column header */}
                            <div style={{ padding: '12px 14px 10px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '2px solid ' + col.color, borderRadius: '12px 12px 0 0' }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: col.color, flexShrink: 0 }} />
                                <span style={{ fontWeight: 700, fontSize: 13, color: '#1e293b', flex: 1 }}>{col.name}</span>
                                <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, background: '#e2e8f0', borderRadius: 999, padding: '1px 7px' }}>{col.cards.length}</span>
                                {isOwner && (
                                    <button onClick={() => handleDeleteColumn(col.id)} style={{ width: 22, height: 22, borderRadius: 5, border: 'none', background: 'transparent', color: '#cbd5e1', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }} title="Delete column">×</button>
                                )}
                            </div>

                            {/* Cards */}
                            <div
                                style={{ flex: 1, overflowY: 'auto', padding: '8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}
                                onDragOver={e => { e.preventDefault(); if (col.cards.length === 0) setDropTarget({ columnId: col.id, index: 0 }); }}
                                onDrop={e => handleDrop(e, col.id, col.cards.length)}
                            >
                                {col.cards.length === 0 && (
                                    <div
                                        onDragOver={e => { e.preventDefault(); setDropTarget({ columnId: col.id, index: 0 }); }}
                                        onDrop={e => handleDrop(e, col.id, 0)}
                                        style={{ height: 60, borderRadius: 8, border: `2px dashed ${dropTarget?.columnId === col.id ? col.color : '#cbd5e1'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: '#94a3b8', transition: 'border-color 0.15s' }}
                                    >
                                        Drop cards here
                                    </div>
                                )}
                                {col.cards.map((card, idx) => (
                                    <div key={card.id}>
                                        {/* Drop zone above card */}
                                        <div
                                            style={{ height: dropTarget?.columnId === col.id && dropTarget?.index === idx ? 6 : 2, background: dropTarget?.columnId === col.id && dropTarget?.index === idx ? col.color : 'transparent', borderRadius: 3, margin: '1px 0', transition: 'all 0.1s' }}
                                            onDragOver={e => handleDragOver(e, col.id, idx)}
                                            onDrop={e => handleDrop(e, col.id, idx)}
                                        />
                                        <div
                                            draggable
                                            onDragStart={() => handleDragStart(card.id, col.id)}
                                            onDragEnd={handleDragEnd}
                                            onClick={() => openCard(card)}
                                            style={{ padding: '10px 12px', borderRadius: 8, background: '#fff', border: '1px solid #e2e8f0', cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.04)', transition: 'box-shadow 0.15s', userSelect: 'none' }}
                                        >
                                            <div style={{ fontSize: 13, fontWeight: 600, color: '#1e293b', lineHeight: 1.4, marginBottom: 8 }}>{card.title}</div>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 999, background: PRIORITY_STYLE[card.priority].bg, color: PRIORITY_STYLE[card.priority].text, border: `1px solid ${PRIORITY_STYLE[card.priority].border}` }}>
                                                    {PRIORITY_STYLE[card.priority].label}
                                                </span>
                                                {card.dueDate && (
                                                    <span style={{ fontSize: 10, color: isOverdue(card.dueDate) ? '#ef4444' : '#64748b', fontWeight: 600 }}>
                                                        📅 {formatDate(card.dueDate)}
                                                    </span>
                                                )}
                                                {card.assigneeId && (
                                                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                        <PixelMini avatarId={card.assigneeAvatarId} size={18} />
                                                        <span style={{ fontSize: 10, color: '#64748b', maxWidth: 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {card.assigneeUsername}
                                                        </span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {/* Drop zone at bottom */}
                                <div
                                    style={{ height: dropTarget?.columnId === col.id && dropTarget?.index === col.cards.length ? 6 : 2, background: dropTarget?.columnId === col.id && dropTarget?.index === col.cards.length ? col.color : 'transparent', borderRadius: 3, margin: '1px 0', transition: 'all 0.1s' }}
                                    onDragOver={e => handleDragOver(e, col.id, col.cards.length)}
                                    onDrop={e => handleDrop(e, col.id, col.cards.length)}
                                />
                            </div>

                            {/* Add card */}
                            <div style={{ padding: '8px 10px', borderTop: '1px solid #e2e8f0' }}>
                                {addingToCol === col.id ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                        <input
                                            autoFocus
                                            value={newCardTitle}
                                            onChange={e => setNewCardTitle(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') handleAddCard(col.id); if (e.key === 'Escape') { setAddingToCol(null); setNewCardTitle(''); } }}
                                            placeholder="Card title..."
                                            style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                                        />
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => handleAddCard(col.id)} style={{ flex: 1, padding: '6px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                                            <button onClick={() => { setAddingToCol(null); setNewCardTitle(''); }} style={{ flex: 1, padding: '6px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                                        </div>
                                    </div>
                                ) : (
                                    <button onClick={() => { setAddingToCol(col.id); setNewCardTitle(''); }} style={{ width: '100%', padding: '7px', borderRadius: 7, border: '1px dashed #cbd5e1', background: 'transparent', color: '#94a3b8', fontSize: 12, cursor: 'pointer', fontWeight: 500, textAlign: 'left' }}>
                                        + Add card
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}

                    {/* Add column */}
                    {isOwner && (
                        <div style={{ width: 260, minWidth: 260, flexShrink: 0 }}>
                            {addingCol ? (
                                <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid #e2e8f0', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                                    <input
                                        autoFocus
                                        value={newColName}
                                        onChange={e => setNewColName(e.target.value)}
                                        onKeyDown={e => { if (e.key === 'Enter') handleAddColumn(); if (e.key === 'Escape') { setAddingCol(false); setNewColName(''); } }}
                                        placeholder="Column name..."
                                        style={{ padding: '8px 10px', borderRadius: 7, border: '1px solid #cbd5e1', fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box' }}
                                    />
                                    <div style={{ display: 'flex', gap: 6 }}>
                                        <button onClick={handleAddColumn} style={{ flex: 1, padding: '7px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Add Column</button>
                                        <button onClick={() => { setAddingCol(false); setNewColName(''); }} style={{ flex: 1, padding: '7px', borderRadius: 7, border: '1px solid #d1d5db', background: '#fff', color: '#555', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
                                    </div>
                                </div>
                            ) : (
                                <button onClick={() => setAddingCol(true)} style={{ width: '100%', padding: '14px', borderRadius: 12, border: '2px dashed #cbd5e1', background: 'transparent', color: '#94a3b8', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                                    + Add Column
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Card detail modal */}
            {selectedCard && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={() => setSelectedCard(null)}>
                    <div style={{ background: '#fff', borderRadius: 14, width: '100%', maxWidth: 580, maxHeight: '90vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden' }} onClick={e => e.stopPropagation()}>
                        {/* Modal header */}
                        <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                            <input
                                value={editTitle}
                                onChange={e => setEditTitle(e.target.value)}
                                style={{ flex: 1, fontSize: 16, fontWeight: 700, color: '#1e293b', border: 'none', outline: 'none', padding: 0, background: 'transparent' }}
                            />
                            {(isOwner || selectedCard.assigneeId === currentUserId) && (
                                <button onClick={() => handleDeleteCard(selectedCard.id)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#ef4444', fontSize: 12, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>Delete</button>
                            )}
                            <button onClick={() => setSelectedCard(null)} style={{ width: 28, height: 28, borderRadius: 6, border: 'none', background: '#f1f5f9', color: '#64748b', fontSize: 16, cursor: 'pointer', flexShrink: 0 }}>×</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
                            {/* Priority + Due date + Assignee row */}
                            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority</label>
                                    <select value={editPriority} onChange={e => setEditPriority(e.target.value as KanbanPriority)} style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}>
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="URGENT">Urgent</option>
                                    </select>
                                </div>
                                <div style={{ flex: '1 1 140px' }}>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Due Date</label>
                                    <input type="date" value={editDue} onChange={e => setEditDue(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
                                </div>
                                <div style={{ flex: '1 1 160px' }}>
                                    <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Assignee</label>
                                    <select value={editAssignee ?? ''} onChange={e => setEditAssignee(e.target.value || null)} style={{ width: '100%', padding: '7px 10px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, background: '#fff', outline: 'none', cursor: 'pointer' }}>
                                        <option value="">Unassigned</option>
                                        {users.map(u => (
                                            <option key={u.userId} value={u.userId}>{u.username}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            {/* Description */}
                            <div>
                                <label style={{ fontSize: 11, fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Description</label>
                                <textarea
                                    value={editDesc}
                                    onChange={e => setEditDesc(e.target.value)}
                                    rows={4}
                                    placeholder="Add a description..."
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit', lineHeight: 1.5 }}
                                />
                            </div>

                            {/* Save button */}
                            <button onClick={handleSaveCard} disabled={savingCard} style={{ padding: '10px', borderRadius: 8, border: 'none', background: savingCard ? '#a5b4fc' : '#6366f1', color: '#fff', fontWeight: 700, fontSize: 14, cursor: savingCard ? 'wait' : 'pointer' }}>
                                {savingCard ? 'Saving…' : 'Save Changes'}
                            </button>

                            {/* Comments */}
                            <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Comments</div>
                                {commentsLoading ? (
                                    <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>Loading…</p>
                                ) : comments.length === 0 ? (
                                    <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center' }}>No comments yet.</p>
                                ) : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                                        {comments.map(c => (
                                            <div key={c.id} style={{ padding: '10px 12px', borderRadius: 8, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
                                                <div style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'center' }}>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: '#4f46e5' }}>{c.username}</span>
                                                    <span style={{ fontSize: 10, color: '#94a3b8' }}>{new Date(c.createdAt).toLocaleDateString()}</span>
                                                </div>
                                                <p style={{ margin: 0, fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{c.content}</p>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                <div style={{ display: 'flex', gap: 8 }}>
                                    <input
                                        value={newComment}
                                        onChange={e => setNewComment(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && handleAddComment()}
                                        placeholder="Add a comment..."
                                        style={{ flex: 1, padding: '8px 12px', borderRadius: 7, border: '1px solid #d1d5db', fontSize: 13, outline: 'none' }}
                                    />
                                    <button onClick={handleAddComment} style={{ padding: '8px 14px', borderRadius: 7, border: 'none', background: '#6366f1', color: '#fff', fontSize: 13, cursor: 'pointer', fontWeight: 600 }}>Post</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
