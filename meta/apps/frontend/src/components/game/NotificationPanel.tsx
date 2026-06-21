import { Bell } from 'lucide-react';
import type { AppNotification } from '../../types/game';

interface NotificationPanelProps {
    notifications: AppNotification[];
    showPanel: boolean;
    notifToasts: AppNotification[];
    urgentBanner: AppNotification | null;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClose: () => void;
    onDismissToast: (id: string) => void;
    onDismissUrgentBanner: () => void;
}

export function NotificationPanel({
    notifications, showPanel, notifToasts, urgentBanner,
    onMarkRead, onMarkAllRead, onClose, onDismissToast, onDismissUrgentBanner,
}: NotificationPanelProps) {
    return (
        <>
            {/* Toast stack (top-right) */}
            {notifToasts.length > 0 && (
                <div style={{ position: 'fixed', top: 64, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, width: 300, pointerEvents: 'none' }}>
                    {notifToasts.map((t) => {
                        const borderColor = t.notifType === 'announcement' ? '#6d28d9' : t.notifType === 'ping' ? '#f97316' : t.notifType === 'user-joined' ? '#10b981' : '#6b7280';
                        const icon = t.notifType === 'announcement' ? '📢' : t.notifType === 'ping' ? '👋' : t.notifType === 'user-joined' ? '✅' : '🚶';
                        return (
                            <div key={t.id} style={{ background: '#fff', borderRadius: 10, border: '1px solid #e5e7eb', borderLeft: `4px solid ${borderColor}`, boxShadow: '0 4px 16px rgba(0,0,0,0.1)', padding: '10px 12px', display: 'flex', alignItems: 'flex-start', gap: 10, animation: 'notifSlideIn 0.2s ease', pointerEvents: 'auto' }}>
                                <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, color: '#111', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</div>
                                    {t.message && <div style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.message}</div>}
                                </div>
                                <button onClick={() => onDismissToast(t.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Notification panel */}
            {showPanel && (
                <div style={{ position: 'fixed', top: 56, right: 12, width: 300, height: 'calc(100vh - 80px)', zIndex: 200, display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: 16, border: '1px solid #e5e7eb', boxShadow: '0 4px 20px rgba(0,0,0,0.08)' }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#111', flex: 1 }}>Notifications</span>
                        {notifications.some((n) => !n.read) && (
                            <button onClick={onMarkAllRead} style={{ fontSize: 11, color: '#6d28d9', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500, padding: 0 }}>Mark all read</button>
                        )}
                        <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, border: 'none', background: '#f3f4f6', color: '#6b7280', fontSize: 13, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto' }}>
                        {notifications.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 8, color: '#9ca3af' }}>
                                <Bell size={32} strokeWidth={1.2} />
                                <span style={{ fontSize: 13 }}>No notifications yet</span>
                            </div>
                        ) : notifications.map((n) => {
                            const borderColor = n.notifType === 'announcement' ? '#6d28d9' : n.notifType === 'ping' ? '#f97316' : n.notifType === 'user-joined' ? '#10b981' : '#6b7280';
                            const icon = n.notifType === 'announcement' ? '📢' : n.notifType === 'ping' ? '👋' : n.notifType === 'user-joined' ? '✅' : '🚶';
                            const diff = Date.now() - n.timestamp;
                            const rel = diff < 60000 ? 'just now' : diff < 3600000 ? `${Math.floor(diff / 60000)}m ago` : `${Math.floor(diff / 3600000)}h ago`;
                            return (
                                <div
                                    key={n.id}
                                    onClick={() => onMarkRead(n.id)}
                                    style={{ padding: '10px 14px', borderBottom: '1px solid #f5f5f5', display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer', background: n.read ? '#fff' : '#fafafa', borderLeft: n.read ? 'none' : `3px solid ${borderColor}` }}
                                >
                                    <span style={{ fontSize: 16, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 13, fontWeight: n.read ? 400 : 600, color: '#111', marginBottom: 2 }}>{n.title}</div>
                                        {n.message && <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 3 }}>{n.message}</div>}
                                        <div style={{ fontSize: 10, color: '#9ca3af' }}>{rel}</div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Urgent banner */}
            {urgentBanner && (
                <div style={{ position: 'fixed', top: 48, left: 0, right: 0, zIndex: 10000, background: 'linear-gradient(135deg,#6d28d9,#4f46e5)', color: '#fff', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: '0 0 0 3px rgba(109,40,217,0.4), 0 4px 20px rgba(109,40,217,0.4)' }}>
                    <span style={{ fontSize: 20, flexShrink: 0 }}>📢</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{urgentBanner.title}</div>
                        {urgentBanner.message && <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>{urgentBanner.message}</div>}
                    </div>
                    <button onClick={onDismissUrgentBanner} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', width: 28, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>×</button>
                </div>
            )}
        </>
    );
}
