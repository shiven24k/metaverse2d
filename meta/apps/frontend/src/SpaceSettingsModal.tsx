import { useEffect, useState, useCallback } from "react";
import { Copy, RefreshCw, Trash2, X } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";
const INVITE_BASE = "https://metaverse2d-frontend.pages.dev/join";

interface Member {
    id: string;
    userId: string;
    name: string;
    avatarId?: string;
    role: "OWNER" | "MEMBER";
    joinedAt: string;
}

interface Props {
    spaceId: string;
    spaceName: string;
    isPrivate: boolean;
    isOwner: boolean;
    authHeaders: Record<string, string>;
    onClose: () => void;
    onNameChange: (name: string) => void;
}

export function SpaceSettingsModal({ spaceId, spaceName, isPrivate, isOwner, authHeaders, onClose, onNameChange }: Props) {
    const [name, setName] = useState(spaceName);
    const [privacy, setPrivacy] = useState(isPrivate);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState("");

    const [members, setMembers] = useState<Member[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    const [inviteToken, setInviteToken] = useState<string | null>(null);
    const [generatingInvite, setGeneratingInvite] = useState(false);
    const [copied, setCopied] = useState(false);

    const fetchMembers = useCallback(async () => {
        if (!isOwner) return;
        setLoadingMembers(true);
        try {
            const r = await fetch(`${API}/api/v1/space/${spaceId}/members`, { headers: authHeaders });
            if (r.ok) { const d = await r.json(); setMembers(d.members ?? []); }
        } catch {} finally { setLoadingMembers(false); }
    }, [spaceId, authHeaders, isOwner]);

    useEffect(() => { fetchMembers(); }, [fetchMembers]);

    const handleSave = async () => {
        setSaving(true); setSaveMsg("");
        try {
            const r = await fetch(`${API}/api/v1/space/${spaceId}`, {
                method: "PUT",
                headers: authHeaders,
                body: JSON.stringify({ name: name.trim() || spaceName, isPrivate: privacy }),
            });
            if (r.ok) {
                const d = await r.json();
                onNameChange(d.name);
                setSaveMsg("Saved!");
                setTimeout(() => setSaveMsg(""), 2000);
            } else {
                const d = await r.json();
                setSaveMsg(d.message ?? "Failed to save");
            }
        } catch { setSaveMsg("Failed to save"); } finally { setSaving(false); }
    };

    const generateInvite = async () => {
        setGeneratingInvite(true);
        try {
            const r = await fetch(`${API}/api/v1/space/${spaceId}/invite`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({}),
            });
            if (r.ok) { const d = await r.json(); setInviteToken(d.token); }
        } catch {} finally { setGeneratingInvite(false); }
    };

    const copyInviteLink = async () => {
        if (!inviteToken) return;
        await navigator.clipboard.writeText(`${INVITE_BASE}/${inviteToken}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const removeMember = async (userId: string) => {
        await fetch(`${API}/api/v1/space/${spaceId}/member/${userId}`, {
            method: "DELETE",
            headers: authHeaders,
        });
        setMembers(prev => prev.filter(m => m.userId !== userId));
    };

    const inviteLink = inviteToken ? `${INVITE_BASE}/${inviteToken}` : null;

    return (
        <>
            <div style={{ position: "fixed", inset: 0, background: "rgba(20,15,40,0.45)", backdropFilter: "blur(3px)", zIndex: 1199 }} onClick={onClose} />
            <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", border: "1px solid #ecebf3", borderRadius: 16, padding: "28px", width: 460, zIndex: 1200, boxShadow: "0 24px 60px rgba(22,15,52,0.22)", maxHeight: "90vh", overflowY: "auto" }}>
                {/* Header */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#191427" }}>Space Settings</h2>
                    <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: "1px solid #ecebf3", background: "#f4f3f9", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6f6b82" }}>
                        <X size={15} />
                    </button>
                </div>

                {/* Space name */}
                <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#7c6f9c", letterSpacing: ".05em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>Space Name</label>
                    <input
                        value={name}
                        onChange={e => setName(e.target.value)}
                        disabled={!isOwner}
                        style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e3e1ee", fontSize: 14, color: "#191427", outline: "none", boxSizing: "border-box", background: isOwner ? "#fff" : "#f9f8fd" }}
                    />
                </div>

                {/* Privacy toggle */}
                <div style={{ marginBottom: 24 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "#7c6f9c", letterSpacing: ".05em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Privacy</label>
                    <div style={{ display: "flex", gap: 8 }}>
                        {(["public", "private"] as const).map(opt => {
                            const active = opt === "private" ? privacy : !privacy;
                            return (
                                <button key={opt} onClick={() => isOwner && setPrivacy(opt === "private")} disabled={!isOwner}
                                    style={{ flex: 1, padding: "9px", borderRadius: 9, border: `1.5px solid ${active ? "#7c3aed" : "#e3e1ee"}`, background: active ? "#f4f0fe" : "#fff", color: active ? "#5b21b6" : "#6f6b82", fontSize: 13, fontWeight: active ? 700 : 500, cursor: isOwner ? "pointer" : "default" }}>
                                    {opt === "public" ? "🌐 Public" : "🔒 Private"}
                                </button>
                            );
                        })}
                    </div>
                    <p style={{ margin: "6px 0 0", fontSize: 12, color: "#a3a0b3" }}>
                        {privacy ? "Only invited members can enter this space." : "Anyone can discover and join this space."}
                    </p>
                </div>

                {/* Save button */}
                {isOwner && (
                    <div style={{ marginBottom: 24 }}>
                        <button onClick={handleSave} disabled={saving}
                            style={{ padding: "9px 20px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: saving ? 0.7 : 1 }}>
                            {saving ? "Saving…" : "Save Changes"}
                        </button>
                        {saveMsg && <span style={{ marginLeft: 10, fontSize: 12, color: saveMsg === "Saved!" ? "#15a34a" : "#dc2626", fontWeight: 600 }}>{saveMsg}</span>}
                    </div>
                )}

                {/* Invite link (private spaces only, owner only) */}
                {isOwner && privacy && (
                    <>
                        <div style={{ height: 1, background: "#ecebf3", marginBottom: 20 }} />
                        <div style={{ marginBottom: 20 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "#7c6f9c", letterSpacing: ".05em", textTransform: "uppercase", display: "block", marginBottom: 8 }}>Invite Link</label>
                            {inviteLink ? (
                                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                    <input readOnly value={inviteLink} style={{ flex: 1, padding: "8px 10px", borderRadius: 8, border: "1.5px solid #e3e1ee", fontSize: 12, color: "#4d495f", background: "#f9f8fd", outline: "none" }} />
                                    <button onClick={copyInviteLink} title="Copy link" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #e3e1ee", background: copied ? "#dcfce7" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: copied ? "#15a34a" : "#6f6b82", flexShrink: 0 }}>
                                        <Copy size={14} />
                                    </button>
                                    <button onClick={generateInvite} disabled={generatingInvite} title="Generate new link" style={{ width: 34, height: 34, borderRadius: 8, border: "1px solid #e3e1ee", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6f6b82", flexShrink: 0 }}>
                                        <RefreshCw size={14} />
                                    </button>
                                </div>
                            ) : (
                                <button onClick={generateInvite} disabled={generatingInvite}
                                    style={{ padding: "8px 16px", borderRadius: 8, border: "1px solid #e7ddfb", background: "#f4f0fe", color: "#5b21b6", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                    {generatingInvite ? "Generating…" : "Generate Invite Link"}
                                </button>
                            )}
                        </div>
                    </>
                )}

                {/* Member list */}
                {isOwner && (
                    <>
                        <div style={{ height: 1, background: "#ecebf3", marginBottom: 20 }} />
                        <label style={{ fontSize: 11, fontWeight: 700, color: "#7c6f9c", letterSpacing: ".05em", textTransform: "uppercase", display: "block", marginBottom: 10 }}>Members</label>
                        {loadingMembers ? (
                            <p style={{ color: "#a3a0b3", fontSize: 13 }}>Loading…</p>
                        ) : members.length === 0 ? (
                            <p style={{ color: "#a3a0b3", fontSize: 13 }}>No members yet.</p>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {members.map(m => (
                                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 9, border: "1px solid #ecebf3", background: "#fafafa" }}>
                                        <div style={{ width: 30, height: 30, borderRadius: "50%", background: "linear-gradient(135deg,#6366f1,#a78bfa)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                                            {(m.name?.[0] ?? "?").toUpperCase()}
                                        </div>
                                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: "#191427" }}>{m.name}</span>
                                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 6, background: m.role === "OWNER" ? "#fef3c7" : "#f4f3f9", color: m.role === "OWNER" ? "#b25e09" : "#6f6b82" }}>
                                            {m.role}
                                        </span>
                                        {m.role !== "OWNER" && (
                                            <button onClick={() => removeMember(m.userId)} title="Remove member" style={{ width: 26, height: 26, borderRadius: 6, border: "1px solid #fecaca", background: "#fff5f5", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#dc2626", flexShrink: 0 }}>
                                                <Trash2 size={12} />
                                            </button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}
