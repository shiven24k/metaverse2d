import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { useRegion, convertFromINR, formatMoney } from "./lib/currency";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface PlanDef {
    id: string;
    tier: "FREE" | "STARTER" | "PRO";
    name: string;
    priceInPaiseINR: number;
    billingPeriod: "monthly" | "yearly";
    maxSpaces: number;
    maxMembersPerSpace: number;
    maxConcurrentUsers: number;
    screenShareEnabled: boolean;
    broadcastEnabled: boolean;
}

interface CurrentPlan {
    id: string;
    tier: string;
    name: string;
    maxSpaces: number;
    maxMembersPerSpace: number;
    maxConcurrentUsers: number;
    screenShareEnabled: boolean;
    broadcastEnabled: boolean;
}

interface SubscriptionState {
    status: string;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
    razorpaySubscriptionId: string | null;
    planId: string;
}

interface InvoiceRow {
    id: string;
    amountInPaise: number;
    currency: string;
    status: string;
    paidAt: string | null;
    createdAt: string;
}

const RARITY_COLOR: Record<string, { bg: string; text: string }> = {
    FREE: { bg: "#374151", text: "#9ca3af" },
    STARTER: { bg: "#064e3b", text: "#34d399" },
    PRO: { bg: "#1e3a8a", text: "#60a5fa" },
};

export default function BillingPage() {
    const navigate = useNavigate();
    const token = useAuthStore((s) => s.token);
    const clearAuth = useAuthStore((s) => s.clearAuth);

    const { currency, locale, rates, setOverride } = useRegion();

    const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    const [current, setCurrent] = useState<{ plan: CurrentPlan; subscription: SubscriptionState | null } | null>(null);
    const [plans, setPlans] = useState<PlanDef[]>([]);
    const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
    const [period, setPeriod] = useState<"monthly" | "yearly">("monthly");
    const [loading, setLoading] = useState(true);
    const [plansError, setPlansError] = useState<string | null>(null);
    const [msg, setMsg] = useState<{ text: string; isError: boolean } | null>(null);
    const [busy, setBusy] = useState(false);

    const handleAuthFailure = useCallback(() => {
        clearAuth();
        navigate("/login");
    }, [clearAuth, navigate]);

    const fetchAll = useCallback(async () => {
        setPlansError(null);
        try {
            const [planRes, plansRes, invRes] = await Promise.all([
                fetch(`${API}/api/v1/billing/plan`, { headers: authHeaders }),
                fetch(`${API}/api/v1/billing/plans`),
                fetch(`${API}/api/v1/billing/invoices`, { headers: authHeaders }),
            ]);
            if (planRes.status === 401 || planRes.status === 403) { handleAuthFailure(); return; }
            if (planRes.ok) setCurrent(await planRes.json());
            if (plansRes.ok) {
                const d = await plansRes.json();
                setPlans(d.plans ?? []);
            } else {
                setPlansError(`Couldn't load plans (HTTP ${plansRes.status})`);
            }
            if (invRes.ok) {
                const d = await invRes.json();
                setInvoices(d.invoices ?? []);
            }
        } catch {
            setPlansError("Couldn't load plans. Make sure the API is reachable.");
        } finally {
            setLoading(false);
        }
    }, [authHeaders, handleAuthFailure]);

    useEffect(() => { fetchAll(); }, [fetchAll]);

    const handleUpgrade = async (planId: string) => {
        setBusy(true);
        setMsg(null);
        try {
            const res = await fetch(`${API}/api/v1/billing/subscribe`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ planId }),
            });
            if (res.status === 401 || res.status === 403) { handleAuthFailure(); return; }
            const d = await res.json();
            if (res.ok && d.shortUrl) {
                // Razorpay hosted checkout handles the payment; the webhook
                // flips the subscription status, and we refresh on return.
                window.location.href = d.shortUrl;
                return;
            }
            setMsg({ text: d.message ?? "Failed to start subscription", isError: true });
        } catch {
            setMsg({ text: "Network error starting subscription", isError: true });
        } finally {
            setBusy(false);
        }
    };

    const handleCancel = async () => {
        const status = current?.subscription?.status;
        const confirmMsg = status === "TRIALING"
            ? "Cancel your trial? Your plan downgrades to Free right away."
            : "Cancel your subscription? It stays active until the end of the current period.";
        if (!window.confirm(confirmMsg)) return;
        setBusy(true);
        setMsg(null);
        try {
            const res = await fetch(`${API}/api/v1/billing/cancel`, {
                method: "POST",
                headers: authHeaders,
            });
            const d = await res.json();
            setMsg({ text: d.message ?? "Cancel request failed", isError: !res.ok });
            fetchAll();
        } catch {
            setMsg({ text: "Network error cancelling subscription", isError: true });
        } finally {
            setBusy(false);
        }
    };

    const formatPrice = (paise: number, periodKey: string) => {
        if (paise === 0) return "Free";
        const suffix = periodKey === "yearly" ? "/yr" : "/mo";
        const inr = `₹${(paise / 100).toLocaleString("en-IN")}`;
        if (currency === "INR") return `${inr}${suffix}`;
        const local = formatMoney(convertFromINR(paise, currency, rates), currency, locale);
        return `${local}${suffix}`;
    };

    const formatBilledNote = (paise: number, periodKey: string) => {
        if (paise === 0 || currency === "INR") return null;
        const inr = `₹${(paise / 100).toLocaleString("en-IN")}`;
        return `billed ${inr} INR${periodKey === "yearly" ? "/yr" : "/mo"}`;
    };

    const currencyOptions = Object.keys(rates).sort();

    const visiblePlans = plans.filter(p => p.billingPeriod === period);
    const activePlanId = current?.subscription?.planId;
    const tierRank: Record<string, number> = { FREE: 0, STARTER: 1, PRO: 2 };
    const currentTier = current?.plan.tier ?? "FREE";
    const onFree = currentTier === "FREE";
    const nextTierName = currentTier === "FREE" ? "Starter" : currentTier === "STARTER" ? "Pro" : null;

    return (
        <div style={{ minHeight: "100vh", background: "#f6f6fb", fontFamily: "system-ui,-apple-system,sans-serif", color: "#191427" }}>
            <div style={{ padding: "14px 24px", background: "rgba(255,255,255,0.85)", backdropFilter: "blur(12px)", borderBottom: "1px solid #ecebf3", display: "flex", alignItems: "center", gap: 12 }}>
                <button onClick={() => navigate(-1)} style={{ padding: "7px 16px", borderRadius: 9, border: "1.5px solid #e3e1ee", background: "#fff", color: "#4d495f", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>← Back</button>
                <h1 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Billing</h1>
            </div>

            <div style={{ maxWidth: 900, margin: "0 auto", padding: "28px 24px 72px", display: "flex", flexDirection: "column", gap: 20 }}>
                {loading ? <p style={{ color: "#6f6b82" }}>Loading…</p> : (
                    <>
                        {/* Current plan */}
                        {current && (
                            <div style={{ background: "#fff", borderRadius: 16, border: "1px solid #ecebf3", padding: "20px 24px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                                    <div>
                                        <div style={{ fontSize: 12, color: "#6f6b82", fontWeight: 600, marginBottom: 2 }}>Current plan</div>
                                        <div style={{ fontSize: 20, fontWeight: 800 }}>
                                            {current.plan.name}
                                            {current.subscription && (
                                                <span style={{ fontSize: 11, fontWeight: 700, marginLeft: 8, padding: "2px 9px", borderRadius: 10, background: current.subscription.status === "ACTIVE" ? "#dcfce7" : "#fef3c7", color: current.subscription.status === "ACTIVE" ? "#15a34a" : "#b25e09" }}>
                                                    {current.subscription.status}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
                                        {current.subscription && ["ACTIVE", "TRIALING", "PAST_DUE"].includes(current.subscription.status) && (
                                            <button onClick={handleCancel} disabled={busy || current.subscription.cancelAtPeriodEnd}
                                                style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid #fecaca", background: "#fff5f5", color: "#dc2626", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                                {current.subscription.cancelAtPeriodEnd ? "Cancels at period end" : busy ? "…" : current.subscription.status === "TRIALING" ? "Cancel trial" : "Cancel subscription"}
                                            </button>
                                        )}
                                    </div>
                                </div>
                                {current.subscription?.currentPeriodEnd && (
                                    <div style={{ fontSize: 12, color: "#6f6b82", marginTop: 8 }}>
                                        Period ends {new Date(current.subscription.currentPeriodEnd).toLocaleDateString()}
                                    </div>
                                )}
                                <div style={{ fontSize: 12, color: "#a3a0b3", marginTop: 8, lineHeight: 1.6 }}>
                                    {current.plan.maxSpaces >= 100000 ? "Unlimited spaces" : `${current.plan.maxSpaces} space${current.plan.maxSpaces > 1 ? "s" : ""}`}
                                    {" · "}{current.plan.maxConcurrentUsers} concurrent users/space
                                    {current.plan.broadcastEnabled ? " · Broadcast zones ✓" : " · Broadcast zones ✗"}
                                    {current.plan.screenShareEnabled ? " · Screen share ✓" : " · Screen share ✗"}
                                </div>
                                {nextTierName && (
                                    <button onClick={() => document.getElementById("plans-grid")?.scrollIntoView({ behavior: "smooth" })}
                                        style={{ marginTop: 16, padding: "11px 18px", borderRadius: 10, border: "none", cursor: "pointer", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 14, fontWeight: 700 }}>
                                        {onFree ? `Upgrade from Free to ${nextTierName}` : `Upgrade to ${nextTierName}`} →
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Period toggle + plans */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 15, fontWeight: 700 }}>Choose a plan</span>
                            <span style={{ fontSize: 12, color: "#a3a0b3" }}>{onFree ? "You're on Free — pick a paid plan to unlock more." : `You're on ${currentTier}.`}</span>
                            <div style={{ display: "flex", background: "#f4f3f9", border: "1px solid #ecebf3", borderRadius: 9, padding: 3 }}>
                                {(["monthly", "yearly"] as const).map(p => (
                                    <button key={p} onClick={() => setPeriod(p)}
                                        style={{ padding: "6px 14px", border: "none", borderRadius: 7, background: period === p ? "linear-gradient(135deg,#7c3aed,#a78bfa)" : "transparent", color: period === p ? "#fff" : "#6f6b82", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                                        {p === "monthly" ? "Monthly" : "Yearly (−20%)"}
                                    </button>
                                ))}
                            </div>
                            <span style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#6f6b82" }}>
                                Currency
                                <select
                                    value={currency}
                                    onChange={(e) => setOverride(e.target.value === "INR" ? null : e.target.value)}
                                    style={{ padding: "6px 10px", borderRadius: 8, border: "1.5px solid #e3e1ee", background: "#fff", color: "#191427", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
                                >
                                    {currencyOptions.map(c => (
                                        <option key={c} value={c}>{c}</option>
                                    ))}
                                </select>
                            </span>
                        </div>

                        {msg && (
                            <div style={{ padding: "10px 14px", borderRadius: 9, fontSize: 13, fontWeight: 600, background: msg.isError ? "#fee2e2" : "#dcfce7", color: msg.isError ? "#dc2626" : "#15a34a" }}>{msg.text}</div>
                        )}

                        {plansError && (
                            <div style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #fecaca", background: "#fff5f5", color: "#dc2626", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                                {plansError}
                                <button onClick={() => fetchAll()} style={{ marginLeft: "auto", padding: "6px 14px", borderRadius: 8, border: "none", cursor: "pointer", background: "#dc2626", color: "#fff", fontSize: 12, fontWeight: 700 }}>Retry</button>
                            </div>
                        )}

                        <div id="plans-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(240px,1fr))", gap: 14 }}>
                            {visiblePlans.map(p => {
                                const r = RARITY_COLOR[p.tier] ?? RARITY_COLOR.FREE;
                                const isCurrent = activePlanId === p.id;
                                const isFree = p.tier === "FREE";
                                const rank = tierRank[p.tier] ?? 0;
                                const curRank = tierRank[currentTier] ?? 0;
                                const actionLabel = isCurrent || isFree ? "Free" : rank > curRank ? "Upgrade" : rank < curRank ? "Downgrade" : "Upgrade";
                                return (
                                    <div key={p.id} style={{ background: "#fff", borderRadius: 16, border: `2px solid ${isCurrent ? "#6d28d9" : "#ecebf3"}`, padding: "18px 18px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <span style={{ fontSize: 15, fontWeight: 800 }}>{p.name}</span>
                                            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: r.bg, color: r.text }}>{p.tier}</span>
                                        </div>
                                        <div style={{ fontSize: 22, fontWeight: 800 }}>{formatPrice(p.priceInPaiseINR, p.billingPeriod)}</div>
                                        {formatBilledNote(p.priceInPaiseINR, p.billingPeriod) && (
                                            <div style={{ fontSize: 11, color: "#a3a0b3", marginTop: -6 }}>{formatBilledNote(p.priceInPaiseINR, p.billingPeriod)}</div>
                                        )}
                                        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#6f6b82", lineHeight: 1.8 }}>
                                            <li>{p.maxSpaces >= 100000 ? "Unlimited spaces" : `${p.maxSpaces} space${p.maxSpaces > 1 ? "s" : ""}`}</li>
                                            <li>{p.maxConcurrentUsers} concurrent users/space</li>
                                            <li>{p.broadcastEnabled ? "Broadcast / cinema zones" : "No broadcast zones"}</li>
                                            <li>{p.screenShareEnabled ? "Screen share" : "No screen share"}</li>
                                        </ul>
                                        {isCurrent ? (
                                            <div style={{ padding: "9px", borderRadius: 9, textAlign: "center", background: "#f4f0fe", color: "#6d28d9", fontSize: 13, fontWeight: 700 }}>✓ Current</div>
                                        ) : (
                                            <button onClick={() => handleUpgrade(p.id)} disabled={busy || isFree}
                                                style={{ padding: "9px", borderRadius: 9, border: "none", background: isFree ? "#e3e1ee" : "linear-gradient(135deg,#7c3aed,#a78bfa)", color: isFree ? "#a3a0b3" : "#fff", fontSize: 13, fontWeight: 700, cursor: isFree ? "not-allowed" : "pointer" }}>
                                                {isFree ? "Free" : busy ? "Starting…" : actionLabel}
                                            </button>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Invoices */}
                        <div>
                            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>Invoices</div>
                            {invoices.length === 0 ? (
                                <p style={{ fontSize: 13, color: "#a3a0b3" }}>No invoices yet.</p>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    {invoices.map(inv => (
                                        <div key={inv.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 9, border: "1px solid #ecebf3", background: "#fff", fontSize: 13 }}>
                                            <span style={{ flex: 1, fontWeight: 600 }}>{inv.currency} {(inv.amountInPaise / 100).toFixed(2)}</span>
                                            <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 8, background: inv.status === "paid" ? "#dcfce7" : "#fef3c7", color: inv.status === "paid" ? "#15a34a" : "#b25e09", textTransform: "capitalize" }}>{inv.status}</span>
                                            <span style={{ fontSize: 11, color: "#a3a0b3" }}>{new Date(inv.createdAt).toLocaleDateString()}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}