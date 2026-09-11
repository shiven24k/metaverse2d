import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

type Tab = "summary" | "users" | "subscriptions" | "invoices" | "spaces" | "audit";

interface Summary {
    userCount: number;
    adminCount: number;
    spaceCount: number;
    mrrPaise: number;
    activeSubscriptionCount: number;
    subsByStatus: Record<string, number>;
    failedInvoices: number;
    liveRooms: number;
    liveUsers: number;
}

interface UserRow {
    id: string;
    name: string;
    username: string | null;
    email: string;
    platformRole: string;
    role: string;
    createdAt: string;
    subscription: { status: string; plan: { tier: string } } | null;
}

interface SubRow {
    id: string;
    status: string;
    cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
    planId: string;
    owner: { name: string; username: string | null; email: string };
    plan: { tier: string; name: string };
}

interface InvoiceRow {
    id: string;
    amountInPaise: number;
    currency: string;
    status: string;
    paidAt: string | null;
    createdAt: string;
    subscription: { owner: { name: string; username: string | null; email: string } };
}

interface SpaceRow {
    id: string;
    name: string;
    width: number;
    height: number;
    creator: { name: string; username: string | null };
    _count: { members: number; elements: number; placedItems: number; npcs: number };
}

interface AuditRow {
    id: string;
    adminId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: unknown;
    createdAt: string;
}

interface PlanOpt { id: string; tier: string; name: string }

const STATUS_PILL: Record<string, string> = {
    ACTIVE: "#dcfce7",
    TRIALING: "#e0f2fe",
    PAST_DUE: "#fef3c7",
    CANCELED: "#f3f4f6",
    EXPIRED: "#fee2e2",
};

export default function AdminPanelPage() {
    const navigate = useNavigate();
    const token = useAuthStore((s) => s.token);
    const clearAuth = useAuthStore((s) => s.clearAuth);
    const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const [tab, setTab] = useState<Tab>("summary");
    const [forbidden, setForbidden] = useState(false);
    const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);

    const [summary, setSummary] = useState<Summary | null>(null);
    const [users, setUsers] = useState<UserRow[]>([]);
    const [search, setSearch] = useState("");
    const [subs, setSubs] = useState<SubRow[]>([]);
    const [subStatusFilter, setSubStatusFilter] = useState("");
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [invStatusFilter, setInvStatusFilter] = useState("");
    const [spaces, setSpaces] = useState<SpaceRow[]>([]);
    const [audit, setAudit] = useState<AuditRow[]>([]);
    const [plans, setPlans] = useState<PlanOpt[]>([]);

    // Override modal
    const [overrideSub, setOverrideSub] = useState<SubRow | null>(null);
    const [overrideStatus, setOverrideStatus] = useState("ACTIVE");
    const [overridePlan, setOverridePlan] = useState("");
    const [overrideBusy, setOverrideBusy] = useState(false);

    const handleAuthFailure = useCallback(() => {
        clearAuth();
        navigate("/login");
    }, [clearAuth, navigate]);

    const get = useCallback(async (path: string, opts?: RequestInit) => {
        const res = await fetch(`${API}${path}`, opts ?? { headers: authHeaders });
        if (res.status === 401 || res.status === 403) {
            // A 403 on /admin/* means "not a platform admin" — show the gate,
            // don't wipe the session (a normal user can still use the app).
            setForbidden(true);
            return null;
        }
        return res.ok ? await res.json() : null;
    }, [authHeaders]);

    const fetchSummary = useCallback(async () => {
        const d = await get("/api/v1/admin/panel/summary");
        if (d) setSummary(d);
    }, [get]);

    const fetchUsers = useCallback(async () => {
        const q = search ? `?search=${encodeURIComponent(search)}` : "";
        const d = await get(`/api/v1/admin/panel/users${q}`);
        if (d) setUsers(d.users ?? []);
    }, [get, search]);

    const fetchSubs = useCallback(async () => {
        const q = subStatusFilter ? `?status=${subStatusFilter}` : "";
        const d = await get(`/api/v1/admin/panel/subscriptions${q}`);
        if (d) setSubs(d.subscriptions ?? []);
    }, [get, subStatusFilter]);

    const fetchInvoices = useCallback(async () => {
        const q = invStatusFilter ? `?status=${invStatusFilter}` : "";
        const d = await get(`/api/v1/admin/panel/invoices${q}`);
        if (d) setInvoices(d.invoices ?? []);
    }, [get, invStatusFilter]);

    const fetchSpaces = useCallback(async () => {
        const d = await get("/api/v1/admin/panel/spaces");
        if (d) setSpaces(d.spaces ?? []);
    }, [get]);

    const fetchAudit = useCallback(async () => {
        const d = await get("/api/v1/admin/panel/audit");
        if (d) setAudit(d.logs ?? []);
    }, [get]);

    useEffect(() => {
        (async () => {
            const plansRes = await fetch(`${API}/api/v1/billing/plans`);
            if (plansRes.ok) {
                const d = await plansRes.json();
                setPlans((d.plans ?? []).map((p: PlanOpt) => ({ id: p.id, tier: p.tier, name: p.name })));
            }
        })();
    }, []);

    useEffect(() => { fetchSummary(); }, [fetchSummary]);
    useEffect(() => { if (tab === "users") fetchUsers(); }, [tab, fetchUsers]);
    useEffect(() => { if (tab === "subscriptions") fetchSubs(); }, [tab, fetchSubs]);
    useEffect(() => { if (tab === "invoices") fetchInvoices(); }, [tab, fetchInvoices]);
    useEffect(() => { if (tab === "spaces") fetchSpaces(); }, [tab, fetchSpaces]);
    useEffect(() => { if (tab === "audit") fetchAudit(); }, [tab, fetchAudit]);

    const openOverride = (s: SubRow) => {
        setOverrideSub(s);
        setOverrideStatus(s.status);
        setOverridePlan(s.planId);
    };

    const applyOverride = async () => {
        if (!overrideSub) return;
        setOverrideBusy(true);
        setMsg(null);
        try {
            const res = await fetch(`${API}/api/v1/admin/panel/subscriptions/${overrideSub.id}/override`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ status: overrideStatus, planId: overridePlan }),
            });
            if (res.status === 401 || res.status === 403) { handleAuthFailure(); return; }
            const d = await res.json();
            setMsg({ text: res.ok ? "Override applied" : (d.message ?? "Override failed"), isError: !res.ok });
            setOverrideSub(null);
            fetchSubs();
            fetchSummary();
        } catch {
            setMsg({ text: "Network error", isError: true });
        } finally {
            setOverrideBusy(false);
        }
    };

    const pill = (status: string) => (
        <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: STATUS_PILL[status] ?? "#f3f4f6", color: status === "ACTIVE" ? "#15a34a" : status === "PAST_DUE" ? "#b25e09" : "#6b7280" }}>
            {status}
        </span>
    );

    if (forbidden) {
        return (
            <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f6f6fb", fontFamily: "system-ui" }}>
                <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #ecebf3", padding: "40px 36px", textAlign: "center", maxWidth: 420 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
                    <h2 style={{ margin: "0 0 8px", fontSize: 18, fontWeight: 700, color: "#191427" }}>Admin access required</h2>
                    <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6f6b82" }}>Only PLATFORM_ADMIN users can open the admin panel.</p>
                    <button onClick={() => navigate(-1)} style={{ padding: "10px 24px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Go back</button>
                </div>
            </div>
        );
    }

    const TAB_LIST: { id: Tab; label: string }[] = [
        { id: "summary", label: "Summary" },
        { id: "users", label: "Users" },
        { id: "subscriptions", label: "Subscriptions" },
        { id: "invoices", label: "Invoices" },
        { id: "spaces", label: "Spaces" },
        { id: "audit", label: "Audit" },
    ];

    const th: React.CSSProperties = { textAlign: "left", padding: "8px 12px", fontSize: 11, color: "#6f6b82", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid #ecebf3" };
    const td: React.CSSProperties = { padding: "8px 12px", fontSize: 12.5, borderBottom: "1px solid #f3f2f9" };

    return (
        <div style={{ minHeight: "100vh", background: "#f6f6fb", fontFamily: "system-ui,-apple-system,sans-serif", color: "#191427" }}>
            <div style={{ padding: "14px 24px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #ecebf3", display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => navigate(-1)} style={{ padding: "7px 16px", borderRadius: 9, border: "1.5px solid #e3e1ee", background: "#fff", color: "#4d495f", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>← Back</button>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Admin Panel</h1>
                <div style={{ marginLeft: "auto", display: "flex", gap: 4, background: "#f4f3f9", borderRadius: 9, padding: 3 }}>
                    {TAB_LIST.map(t => (
                        <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "6px 13px", border: "none", borderRadius: 7, background: tab === t.id ? "linear-gradient(135deg,#7c3aed,#a78bfa)" : "transparent", color: tab === t.id ? "#fff" : "#6f6b82", fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>{t.label}</button>
                    ))}
                </div>
            </div>

            <div style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 24px 72px" }}>
                {msg && (
                    <div style={{ marginBottom: 14, padding: "10px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, background: msg.isError ? "#fee2e2" : "#dcfce7", color: msg.isError ? "#dc2626" : "#15a34a" }}>{msg.text}</div>
                )}

                {tab === "summary" && summary && (
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 12 }}>
                        {[
                            ["Users", summary.userCount],
                            ["Admins", summary.adminCount],
                            ["Active subs", summary.activeSubscriptionCount],
                            ["MRR / mo", `₹${(summary.mrrPaise / 100).toLocaleString("en-IN")}`],
                            ["Total spaces", summary.spaceCount],
                            ["Live rooms", summary.liveRooms],
                            ["Live users", summary.liveUsers],
                            ["Failed invoices", summary.failedInvoices],
                        ].map(([label, value]) => (
                            <div key={label as string} style={{ background: "#fff", borderRadius: 14, border: "1px solid #ecebf3", padding: "16px 18px" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6b82", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{label}</div>
                                <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
                            </div>
                        ))}
                        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ecebf3", padding: "16px 18px" }}>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#6f6b82", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>Subscriptions by status</div>
                            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {Object.entries(summary.subsByStatus).map(([k, v]) => (
                                    <span key={k} style={{ fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 10, background: STATUS_PILL[k] ?? "#f3f4f6", color: "#374151" }}>{k}: {v}</span>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {tab === "users" && (
                    <div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name / username / email…" style={{ flex: 1, padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e3e1ee", fontSize: 13, outline: "none" }} />
                            <button onClick={fetchUsers} style={{ padding: "9px 18px", borderRadius: 9, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Search</button>
                        </div>
                        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ecebf3", overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Role</th><th style={th}>Plan / Status</th><th style={th}>Joined</th></tr></thead>
                                <tbody>
                                    {users.map(u => (
                                        <tr key={u.id}>
                                            <td style={td}>{u.name}{u.username ? ` (@${u.username})` : ""}</td>
                                            <td style={td}>{u.email}</td>
                                            <td style={td}>{u.platformRole === "PLATFORM_ADMIN" ? "⭐ PLATFORM_ADMIN" : "User"}</td>
                                            <td style={td}>{u.subscription ? `${u.subscription.plan.tier} · ${pill(u.subscription.status)}` : "—"}</td>
                                            <td style={td}>{new Date(u.createdAt).toLocaleDateString()}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {tab === "subscriptions" && (
                    <div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Filter status:</span>
                            <select value={subStatusFilter} onChange={e => setSubStatusFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1.5px solid #e3e1ee", fontSize: 13, outline: "none" }}>
                                <option value="">All</option>
                                {["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ecebf3", overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr><th style={th}>Owner</th><th style={th}>Plan</th><th style={th}>Status</th><th style={th}>Period end</th><th style={th}>Cancel@end</th><th style={th}></th></tr></thead>
                                <tbody>
                                    {subs.map(s => (
                                        <tr key={s.id}>
                                            <td style={td}>{s.owner.name}{s.owner.username ? ` (@${s.owner.username})` : ""}</td>
                                            <td style={td}>{s.plan.tier} ({s.plan.name})</td>
                                            <td style={td}>{pill(s.status)}</td>
                                            <td style={td}>{s.currentPeriodEnd ? new Date(s.currentPeriodEnd).toLocaleDateString() : "—"}</td>
                                            <td style={td}>{s.cancelAtPeriodEnd ? "✓" : "—"}</td>
                                            <td style={td}><button onClick={() => openOverride(s)} style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid #e7ddfb", background: "#f4f0fe", color: "#6d28d9", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Override</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {tab === "invoices" && (
                    <div>
                        <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                            <span style={{ fontSize: 13, fontWeight: 600 }}>Filter status:</span>
                            <select value={invStatusFilter} onChange={e => setInvStatusFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 9, border: "1.5px solid #e3e1ee", fontSize: 13, outline: "none" }}>
                                <option value="">All</option>
                                {["paid", "failed", "pending", "refunded"].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ecebf3", overflow: "hidden" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <thead><tr><th style={th}>Date</th><th style={th}>User</th><th style={th}>Amount</th><th style={th}>Status</th></tr></thead>
                                <tbody>
                                    {invoices.map(inv => (
                                        <tr key={inv.id}>
                                            <td style={td}>{new Date(inv.createdAt).toLocaleDateString()}</td>
                                            <td style={td}>{inv.subscription.owner.name}{inv.subscription.owner.username ? ` (@${inv.subscription.owner.username})` : ""}</td>
                                            <td style={td}>{inv.currency} {(inv.amountInPaise / 100).toFixed(2)}</td>
                                            <td style={td}>{pill(inv.status)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {tab === "spaces" && (
                    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ecebf3", overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr><th style={th}>Name</th><th style={th}>Creator</th><th style={th}>Size</th><th style={th}>Members</th><th style={th}>Elements</th><th style={th}>Items</th><th style={th}>NPCs</th></tr></thead>
                            <tbody>
                                {spaces.map(s => (
                                    <tr key={s.id}>
                                        <td style={td}>{s.name}</td>
                                        <td style={td}>{s.creator.name}{s.creator.username ? ` (@${s.creator.username})` : ""}</td>
                                        <td style={td}>{s.width}×{s.height}</td>
                                        <td style={td}>{s._count.members}</td>
                                        <td style={td}>{s._count.elements}</td>
                                        <td style={td}>{s._count.placedItems}</td>
                                        <td style={td}>{s._count.npcs}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {tab === "audit" && (
                    <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #ecebf3", overflow: "hidden" }}>
                        <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead><tr><th style={th}>Time</th><th style={th}>Admin</th><th style={th}>Action</th><th style={th}>Target</th><th style={th}>Metadata</th></tr></thead>
                            <tbody>
                                {audit.map(l => (
                                    <tr key={l.id}>
                                        <td style={td}>{new Date(l.createdAt).toLocaleString()}</td>
                                        <td style={td}>{l.adminId.slice(0, 8)}</td>
                                        <td style={td}>{l.action}</td>
                                        <td style={td}>{l.targetType} · {l.targetId.slice(0, 8)}</td>
                                        <td style={td}><code style={{ fontSize: 11 }}>{JSON.stringify(l.metadata)}</code></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Override modal */}
            {overrideSub && (
                <>
                    <div style={{ position: "fixed", inset: 0, background: "rgba(20,15,40,0.4)", zIndex: 1199 }} onClick={() => setOverrideSub(null)} />
                    <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", border: "1px solid #ecebf3", borderRadius: 14, padding: "24px 26px", width: 360, zIndex: 1200 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>Override subscription</div>
                        <div style={{ fontSize: 12, color: "#6f6b82", marginBottom: 14 }}>
                            {overrideSub.owner.name} · {overrideSub.plan.tier} · currently {overrideSub.status}
                        </div>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6f6b82", marginBottom: 5 }}>Status</label>
                        <select value={overrideStatus} onChange={e => setOverrideStatus(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e3e1ee", fontSize: 13, marginBottom: 14, outline: "none" }}>
                            {["TRIALING", "ACTIVE", "PAST_DUE", "CANCELED", "EXPIRED"].map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#6f6b82", marginBottom: 5 }}>Plan</label>
                        <select value={overridePlan} onChange={e => setOverridePlan(e.target.value)} style={{ width: "100%", padding: "9px 12px", borderRadius: 9, border: "1.5px solid #e3e1ee", fontSize: 13, marginBottom: 18, outline: "none" }}>
                            <option value="">— keep current —</option>
                            {plans.map(p => <option key={p.id} value={p.id}>{p.tier} ({p.name})</option>)}
                        </select>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button onClick={() => setOverrideSub(null)} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ecebf3", background: "#fff", color: "#6f6b82", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                            <button onClick={applyOverride} disabled={overrideBusy} style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: overrideBusy ? "#c4b5fd" : "#6d28d9", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>{overrideBusy ? "Applying…" : "Apply"}</button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}