import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

interface Space {
    id: string;
    name: string;
    dimensions: string;
    thumbnail?: string;
    createdBy?: string;
}

interface ShopItem {
    id: string;
    name: string;
    category: string;
    rarity: string;
    imageUrl: string;
    width: number;
    height: number;
}

type Tab = "all" | "mine" | "create" | "shop" | "collection" | "quests" | "neighbourhood" | "guestbook" | "creator";

interface SeasonInfo {
    id: string;
    name: string;
    theme: string;
    daysRemaining: number;
    items: { id: string; name: string; imageUrl: string }[];
}

interface CollectionItem {
    id: string;
    name: string;
    category: string;
    rarity: string;
    imageUrl: string;
    owned: boolean;
}

interface NeighbourhoodInfo {
    id: string;
    name: string;
    members: { id: string; username: string }[];
}

interface GuestbookEntry {
    id: string;
    userId: string;
    username: string;
    message: string;
    createdAt: string;
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

interface MapTemplate {
    id: string;
    name: string;
    thumbnail: string;
    dimensions: string;
}

// deterministic gradient from a string — used for space card thumbnails
function spaceGradient(name: string): string {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    const hue1 = h % 360;
    const hue2 = (hue1 + 40) % 360;
    return `linear-gradient(135deg, hsl(${hue1},55%,28%), hsl(${hue2},60%,18%))`;
}

const RARITY_COLOR: Record<string, { bg: string; text: string; label: string }> = {
    Common:   { bg: "#374151", text: "#9ca3af", label: "Common" },
    Uncommon: { bg: "#064e3b", text: "#34d399", label: "Uncommon" },
    Rare:     { bg: "#1e3a8a", text: "#60a5fa", label: "Rare" },
    Legacy:   { bg: "#3b1f6e", text: "#c084fc", label: "Legendary" },
};

const RARITY_PRICE: Record<string, number> = {
    Common: 50, Uncommon: 150, Rare: 500, Legacy: 1000,
};

export default function SpacePage() {
    const navigate = useNavigate();
    const bearerToken = useAuthStore((s) => s.token);
    const isGuest = useAuthStore((s) => s.isGuest);
    const clearAuth = useAuthStore((s) => s.clearAuth);

    const [tab, setTab] = useState<Tab>("all");
    const [allSpaces, setAllSpaces] = useState<Space[]>([]);
    const [mySpaces, setMySpaces] = useState<Space[]>([]);
    const [loadingAll, setLoadingAll] = useState(true);
    const [loadingMine, setLoadingMine] = useState(true);
    const [creating, setCreating] = useState(false);
    const [newSpaceName, setNewSpaceName] = useState("");
    const [newSpaceDims, setNewSpaceDims] = useState("20x20");
    const [error, setError] = useState("");
    const [createSuccess, setCreateSuccess] = useState("");

    const [wallet, setWallet] = useState<{ coins: number; tokens: number; stars: number } | null>(null);
    const [username, setUsername] = useState<string>("");
    const [giftStatus, setGiftStatus] = useState<{ claimed: boolean; nextClaimAt: string | null }>({ claimed: false, nextClaimAt: null });
    const [claiming, setClaiming] = useState(false);
    const [claimResult, setClaimResult] = useState<string | null>(null);
    const [shopItems, setShopItems] = useState<ShopItem[]>([]);
    const [buyingId, setBuyingId] = useState<string | null>(null);
    const [buyMsg, setBuyMsg] = useState("");

    const [season, setSeason] = useState<SeasonInfo | null>(null);
    const [collection, setCollection] = useState<CollectionItem[]>([]);
    const [loadingCollection, setLoadingCollection] = useState(false);
    const [neighbourhood, setNeighbourhood] = useState<NeighbourhoodInfo | null>(null);
    const [loadingNeighbourhood, setLoadingNeighbourhood] = useState(false);

    const [mapTemplates, setMapTemplates] = useState<MapTemplate[]>([]);
    const [selectedMap, setSelectedMap] = useState<MapTemplate | null>(null);

    const [guestbook, setGuestbook] = useState<GuestbookEntry[]>([]);
    const [guestbookLoading, setGuestbookLoading] = useState(false);
    const [gbSpaceId, setGbSpaceId] = useState("");
    const [gbMsg, setGbMsg] = useState("");
    const [gbSending, setGbSending] = useState(false);
    const [gbError, setGbError] = useState("");

    const [quests, setQuests] = useState<QuestInfo[]>([]);
    const [questsLoading, setQuestsLoading] = useState(false);
    const [_userRole, setUserRole] = useState<string | null>(null);

    const authHeaders: Record<string, string> = {
        "Content-Type": "application/json",
        ...(bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
    };

    const fetchWallet = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/wallet`, { headers: authHeaders });
            if (res.ok) setWallet(await res.json());
        } catch {}
    }, [bearerToken]);

    const fetchGiftStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/gift/status`, { headers: authHeaders });
            if (res.ok) setGiftStatus(await res.json());
        } catch {}
    }, [bearerToken]);

    const fetchSeason = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/season/current`);
            if (res.ok) { const d = await res.json(); setSeason(d.season); }
        } catch {}
    }, []);

    const fetchCollection = useCallback(async () => {
        setLoadingCollection(true);
        try {
            const res = await fetch(`${API}/api/v1/collection`, { headers: authHeaders });
            if (res.ok) { const d = await res.json(); setCollection(d.collection ?? []); }
        } catch {} finally { setLoadingCollection(false); }
    }, [bearerToken]);

    const fetchUserInfo = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/user/me`, { headers: authHeaders });
            if (res.ok) {
                const d = await res.json();
                setUserRole(d.user?.role ?? null);
                setUsername(d.user?.username ?? d.user?.name ?? "");
            }
        } catch {}
    }, [bearerToken]);

    const fetchGuestbook = useCallback(async (spaceId: string) => {
        setGuestbookLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/guestbook/${spaceId}`);
            if (res.ok) { const d = await res.json(); setGuestbook(d.messages ?? []); }
        } catch {} finally { setGuestbookLoading(false); }
    }, []);

    const fetchQuests = useCallback(async () => {
        setQuestsLoading(true);
        try {
            const res = await fetch(`${API}/api/v1/quests/active`, { headers: authHeaders });
            if (res.ok) { const d = await res.json(); setQuests(d.quests ?? []); }
        } catch {} finally { setQuestsLoading(false); }
    }, [bearerToken]);

    const fetchMaps = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/maps`);
            if (res.ok) { const d = await res.json(); setMapTemplates(d.maps ?? []); }
        } catch {}
    }, []);

    const fetchNeighbourhood = useCallback(async () => {
        setLoadingNeighbourhood(true);
        try {
            const res = await fetch(`${API}/api/v1/neighbourhood`, { headers: authHeaders });
            if (res.ok) { setNeighbourhood(await res.json()); }
        } catch {} finally { setLoadingNeighbourhood(false); }
    }, [bearerToken]);

    const fetchShop = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/shop/daily`);
            if (res.ok) { const d = await res.json(); setShopItems(d.items ?? []); }
        } catch {}
    }, []);

    const fetchAllSpaces = async () => {
        setLoadingAll(true);
        try {
            const res = await fetch(`${API}/api/v1/space/public`);
            const d = await res.json();
            setAllSpaces(d.spaces ?? []);
        } catch {} finally { setLoadingAll(false); }
    };

    const fetchMySpaces = async () => {
        setLoadingMine(true);
        try {
            const res = await fetch(`${API}/api/v1/space/all`, { credentials: "include", headers: authHeaders });
            const d = await res.json();
            setMySpaces(d.spaces ?? []);
        } catch {} finally { setLoadingMine(false); }
    };

    useEffect(() => {
        fetchAllSpaces();
        fetchMySpaces();
        fetchWallet();
        fetchGiftStatus();
        fetchShop();
        fetchSeason();
        fetchMaps();
        fetchUserInfo();
        fetchQuests();
    }, []);

    useEffect(() => {
        if (tab === "collection") fetchCollection();
        if (tab === "neighbourhood") fetchNeighbourhood();
    }, [tab]);

    const handleGuestbookPost = async (spaceId: string) => {
        if (!gbMsg.trim()) return;
        setGbSending(true); setGbError("");
        try {
            const res = await fetch(`${API}/api/v1/guestbook/${spaceId}`, {
                method: "POST", headers: authHeaders, body: JSON.stringify({ message: gbMsg.trim() }),
            });
            if (res.ok) { setGbMsg(""); fetchGuestbook(spaceId); }
            else { const d = await res.json(); setGbError(d.message ?? "Failed"); }
        } catch { setGbError("Network error"); } finally { setGbSending(false); }
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(""); setCreateSuccess(""); setCreating(true);
        try {
            const res = await fetch(`${API}/api/v1/space`, {
                method: "POST", credentials: "include", headers: authHeaders,
                body: JSON.stringify({ name: newSpaceName, dimensions: newSpaceDims, mapId: selectedMap?.id }),
            });
            if (!res.ok) { const d = await res.json(); setError(d.message ?? "Failed to create space"); return; }
            setNewSpaceName(""); setSelectedMap(null);
            setCreateSuccess(`Space "${newSpaceName}" created!`);
            await Promise.all([fetchAllSpaces(), fetchMySpaces()]);
            setTab("mine");
        } catch { setError("Failed to create space"); } finally { setCreating(false); }
    };

    const handleClaimGift = async () => {
        setClaiming(true); setClaimResult("");
        try {
            const res = await fetch(`${API}/api/v1/gift/claim`, { method: "POST", headers: authHeaders });
            if (res.ok) {
                const d = await res.json();
                setClaimResult(`+${d.coins} coins${d.item ? ` + ${d.item.name}` : ""}!`);
                fetchWallet(); fetchGiftStatus();
            } else { const d = await res.json(); setClaimResult(d.message ?? "Failed"); }
        } catch { setClaimResult("Failed to claim"); } finally { setClaiming(false); }
    };

    const handleBuy = async (itemId: string) => {
        setBuyingId(itemId); setBuyMsg("");
        try {
            const res = await fetch(`${API}/api/v1/shop/buy`, {
                method: "POST", headers: authHeaders, body: JSON.stringify({ itemId }),
            });
            const d = await res.json();
            if (res.ok) { setBuyMsg("Purchased!"); fetchWallet(); }
            else setBuyMsg(d.message ?? "Failed");
        } catch { setBuyMsg("Failed to buy"); } finally { setBuyingId(null); }
    };

    const handleSignOut = async () => {
        try {
            if (!isGuest && bearerToken) {
                await fetch(`${API}/api/auth/sign-out`, {
                    method: "POST",
                    credentials: "include",
                    headers: { Authorization: `Bearer ${bearerToken}` },
                });
            }
        } catch {}
        clearAuth();
        navigate("/login", { replace: true });
    };

    // Auto-dismiss claim result after 3 s
    useEffect(() => {
        if (!claimResult) return;
        const t = setTimeout(() => setClaimResult(null), 3000);
        return () => clearTimeout(t);
    }, [claimResult]);

    // ── sub-components ─────────────────────────────────────────────────────────

    const EmptyState = ({ icon, title, sub }: { icon: string; title: string; sub: string }) => (
        <div style={{ textAlign: "center", padding: "48px 24px" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>{icon}</div>
            <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#e2e8f0" }}>{title}</p>
            <p style={{ margin: 0, fontSize: 13, color: "#94a3b8", maxWidth: 280, marginInline: "auto" }}>{sub}</p>
        </div>
    );

    const SpaceCard = ({ space }: { space: Space }) => {
        const dims = space.dimensions?.split("x") ?? ["?", "?"];
        return (
            <div style={S.spaceCard}>
                <div style={{ ...S.spaceThumb, background: spaceGradient(space.name) }}>
                    <div style={S.spaceThumbLabel}>{space.dimensions}</div>
                </div>
                <div style={S.spaceCardBody}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <div style={S.spaceAvatar}>
                            {(space.createdBy?.[0] ?? "?").toUpperCase()}
                        </div>
                        <div style={{ minWidth: 0 }}>
                            <p style={S.spaceName}>{space.name}</p>
                            {space.createdBy && <p style={S.spaceMeta}>by {space.createdBy}</p>}
                        </div>
                        <span style={S.sizeBadge}>{dims[0]}×{dims[1]}</span>
                    </div>
                    <button style={S.joinBtn} onClick={() => navigate(`/arena?spaceId=${space.id}`)}>
                        Enter Space →
                    </button>
                </div>
            </div>
        );
    };

    const tabs: { id: Tab; label: string; icon: string }[] = [
        { id: "all",          label: "Discover",      icon: "🌍" },
        ...(isGuest ? [] : [
            { id: "mine" as Tab,         label: "My Spaces",     icon: "🏠" },
            { id: "create" as Tab,       label: "Create",        icon: "✨" },
            { id: "shop" as Tab,         label: "Shop",          icon: "🛒" },
            { id: "collection" as Tab,   label: "Collection",    icon: "📖" },
            { id: "quests" as Tab,       label: "Quests",        icon: "⚔️" },
            { id: "neighbourhood" as Tab,label: "Neighbours",    icon: "👥" },
            { id: "guestbook" as Tab,    label: "Guestbook",     icon: "📝" },
            { id: "creator" as Tab,      label: "Creator",       icon: "🎨" },
        ]),
    ];

    return (
        <div style={S.page}>
            {/* ── Header ── */}
            <header style={S.header}>
                <div style={S.headerLeft}>
                    <div style={S.logo}>
                        <span style={S.logoPx}>M2D</span>
                        <span style={S.logoText}>Metaverse 2D</span>
                    </div>
                    {!isGuest && username && (
                        <div style={S.userPill}>
                            <div style={S.userAvatar}>{username[0]?.toUpperCase()}</div>
                            <span style={S.userName}>{username}</span>
                        </div>
                    )}
                    {isGuest && <span style={S.guestBadge}>Guest</span>}
                </div>
                <div style={S.headerRight}>
                    {wallet && (
                        <div style={S.coinDisplay}>
                            <span style={{ fontSize: 16 }}>🪙</span>
                            <span style={S.coinAmount}>{wallet.coins.toLocaleString()}</span>
                        </div>
                    )}
                    {!isGuest && (
                        <button
                            onClick={handleClaimGift}
                            disabled={claiming || giftStatus.claimed}
                            style={{ ...S.giftBtn, opacity: giftStatus.claimed ? 0.55 : 1 }}
                        >
                            🎁 {claiming ? "Claiming…" : giftStatus.claimed ? "Claimed" : "Daily Gift"}
                        </button>
                    )}
                    {claimResult && (
                        <span style={{ fontSize: 12, color: claimResult.startsWith("+") ? "#4ade80" : "#f87171", fontWeight: 600 }}>
                            {claimResult}
                        </span>
                    )}
                    <button style={S.leaveBtn} onClick={handleSignOut}>
                        {isGuest ? "Leave" : "Sign Out"}
                    </button>
                </div>
            </header>

            {/* ── Guest banner ── */}
            {isGuest && (
                <div style={S.guestBanner}>
                    <span>Browsing as guest — join a space and explore, but full features need an account.</span>
                    <button onClick={() => navigate("/login")} style={S.guestSignupBtn}>Create Account</button>
                </div>
            )}

            {/* ── Season banner ── */}
            {season && (
                <div style={S.seasonBanner}>
                    <div>
                        <span style={S.seasonLabel}>Active Season</span>
                        <span style={S.seasonName}>{season.name}</span>
                        <span style={S.seasonTheme}>{season.theme}</span>
                    </div>
                    <span style={S.seasonTimer}>{season.daysRemaining}d remaining</span>
                </div>
            )}

            {/* ── Tab bar ── */}
            <nav style={S.tabBar}>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        style={{ ...S.tabBtn, ...(tab === t.id ? S.tabBtnActive : {}) }}
                        onClick={() => { setTab(t.id); setError(""); setCreateSuccess(""); setBuyMsg(""); setSelectedMap(null); }}
                    >
                        <span style={{ fontSize: 15 }}>{t.icon}</span>
                        <span>{t.label}</span>
                    </button>
                ))}
            </nav>

            {/* ── Content ── */}
            <main style={S.content}>

                {/* Discover */}
                {tab === "all" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>Discover Spaces</h2>
                        {loadingAll ? (
                            <p style={S.muted}>Loading spaces…</p>
                        ) : allSpaces.length === 0 ? (
                            <EmptyState icon="🌐" title="No spaces yet" sub="Be the first to create a space and invite friends!" />
                        ) : (
                            <div style={S.spaceGrid}>
                                {allSpaces.map(s => <SpaceCard key={s.id} space={s} />)}
                            </div>
                        )}
                    </section>
                )}

                {/* My Spaces */}
                {tab === "mine" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>My Spaces</h2>
                        {loadingMine ? (
                            <p style={S.muted}>Loading…</p>
                        ) : mySpaces.length === 0 ? (
                            <EmptyState icon="🏠" title="No spaces yet" sub="Create your first space to start building your world." />
                        ) : (
                            <div style={S.spaceGrid}>
                                {mySpaces.map(s => <SpaceCard key={s.id} space={s} />)}
                            </div>
                        )}
                    </section>
                )}

                {/* Create */}
                {tab === "create" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>Create a Space</h2>
                        {mapTemplates.length > 0 && (
                            <>
                                <p style={S.subLabel}>Choose a map template (optional)</p>
                                <div style={S.templateGrid}>
                                    <div
                                        onClick={() => { setSelectedMap(null); setNewSpaceDims("20x20"); }}
                                        style={{ ...S.templateCard, ...(selectedMap === null ? S.templateCardActive : {}) }}
                                    >
                                        <div style={S.templateThumb}>🟦</div>
                                        <p style={S.templateName}>Blank</p>
                                        <p style={S.templateDims}>Custom size</p>
                                    </div>
                                    {mapTemplates.map(tmpl => {
                                        const active = selectedMap?.id === tmpl.id;
                                        const dims = tmpl.dimensions.split("x");
                                        return (
                                            <div key={tmpl.id}
                                                onClick={() => { setSelectedMap(tmpl); setNewSpaceDims(tmpl.dimensions); }}
                                                style={{ ...S.templateCard, ...(active ? S.templateCardActive : {}) }}
                                            >
                                                <div style={S.templateThumb}>🗺️</div>
                                                <p style={S.templateName}>{tmpl.name}</p>
                                                <p style={S.templateDims}>{dims[0]} × {dims[1]}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                        <form onSubmit={handleCreate} style={S.form}>
                            <div style={S.field}>
                                <label style={S.label}>Space Name</label>
                                <input style={S.input} type="text" placeholder="My awesome space"
                                    value={newSpaceName} onChange={e => setNewSpaceName(e.target.value)} required />
                            </div>
                            <div style={S.field}>
                                <label style={S.label}>Dimensions</label>
                                <select style={S.input} value={newSpaceDims}
                                    onChange={e => setNewSpaceDims(e.target.value)} disabled={!!selectedMap}>
                                    <option value="10x10">10 × 10 — Small</option>
                                    <option value="20x20">20 × 20 — Medium</option>
                                    <option value="30x30">30 × 30 — Large</option>
                                    <option value="50x50">50 × 50 — Huge</option>
                                </select>
                                {selectedMap && <span style={S.fieldHint}>Size set by template</span>}
                            </div>
                            {error && <p style={S.errorMsg}>{error}</p>}
                            {createSuccess && <p style={S.successMsg}>{createSuccess}</p>}
                            <button style={S.primaryBtn} type="submit" disabled={creating}>
                                {creating ? "Creating…" : "✨ Create Space"}
                            </button>
                        </form>
                    </section>
                )}

                {/* Shop */}
                {tab === "shop" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>Daily Shop</h2>
                        {buyMsg && <p style={{ ...S.successMsg, marginBottom: 16 }}>{buyMsg}</p>}
                        {shopItems.length === 0 ? (
                            <EmptyState icon="🛒" title="Shop is restocking" sub="New items rotate daily. Check back soon!" />
                        ) : (
                            <div style={S.shopGrid}>
                                {shopItems.map(item => {
                                    const r = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.Common;
                                    const price = RARITY_PRICE[item.rarity] ?? 50;
                                    return (
                                        <div key={item.id} style={S.shopCard}>
                                            <div style={S.shopSprite}>
                                                <img src={`/items/${item.imageUrl.split("/").pop()}`} alt={item.name}
                                                    style={{ maxWidth: 64, maxHeight: 64, imageRendering: "pixelated" }}
                                                    onError={e => { (e.target as HTMLImageElement).src = `${API}${item.imageUrl}`; }}
                                                />
                                            </div>
                                            <p style={S.shopItemName}>{item.name}</p>
                                            <span style={{ ...S.rarityBadge, background: r.bg, color: r.text }}>{r.label}</span>
                                            <div style={S.shopPrice}>
                                                <span style={{ fontSize: 16 }}>🪙</span>
                                                <span style={S.shopPriceNum}>{price}</span>
                                            </div>
                                            <button onClick={() => handleBuy(item.id)} disabled={buyingId === item.id} style={S.buyBtn}>
                                                {buyingId === item.id ? "…" : "Buy"}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}

                {/* Collection */}
                {tab === "collection" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>Collection Book</h2>
                        {collection.length > 0 && (
                            <p style={{ ...S.muted, marginBottom: 20 }}>
                                {collection.filter(c => c.owned).length} / {collection.length} owned
                            </p>
                        )}
                        {loadingCollection ? (
                            <p style={S.muted}>Loading…</p>
                        ) : collection.length === 0 ? (
                            <EmptyState icon="📖" title="Collection is empty" sub="Buy items from the shop or earn them through quests to fill your collection." />
                        ) : (
                            <div style={S.collectionGrid}>
                                {collection.map(item => {
                                    const r = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.Common;
                                    return (
                                        <div key={item.id} style={{ ...S.collectionCard, opacity: item.owned ? 1 : 0.4 }}>
                                            <div style={S.collectionSprite}>
                                                <img src={`/items/${item.imageUrl.split("/").pop()}`} alt={item.name}
                                                    style={{ maxWidth: 48, maxHeight: 48, imageRendering: "pixelated", filter: item.owned ? "none" : "grayscale(1)" }}
                                                    onError={e => { (e.target as HTMLImageElement).src = `${API}${item.imageUrl}`; }}
                                                />
                                            </div>
                                            <p style={S.collectionName}>{item.name}</p>
                                            <span style={{ ...S.rarityBadge, background: r.bg, color: r.text, fontSize: 9 }}>{r.label}</span>
                                            {item.owned && <span style={S.ownedBadge}>✓ Owned</span>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}

                {/* Quests */}
                {tab === "quests" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>Daily Quests</h2>
                        {questsLoading ? (
                            <p style={S.muted}>Loading…</p>
                        ) : quests.length === 0 ? (
                            <EmptyState icon="⚔️" title="No active quests" sub="Join a space and start exploring to unlock daily quests and earn rewards." />
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {quests.map(q => {
                                    const pct = Math.min(100, Math.round((q.progress / q.goalCount) * 100));
                                    return (
                                        <div key={q.id} style={{ ...S.questCard, ...(q.completed ? S.questCardDone : {}) }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                                <div>
                                                    <p style={S.questTitle}>{q.title}</p>
                                                    <p style={S.questDesc}>{q.description}</p>
                                                </div>
                                                <span style={{ ...S.questReward, ...(q.completed ? S.questRewardDone : {}) }}>
                                                    {q.completed ? "✓ Done" : `${q.rewardType === "coins" ? "🪙" : "📦"} ${q.rewardValue}`}
                                                </span>
                                            </div>
                                            <div style={S.questBar}>
                                                <div style={{ ...S.questFill, width: `${pct}%`, ...(q.completed ? S.questFillDone : {}) }} />
                                            </div>
                                            <p style={S.questProgress}>{q.progress}/{q.goalCount}</p>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </section>
                )}

                {/* Guestbook */}
                {tab === "guestbook" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>Guestbook</h2>
                        <p style={S.subLabel}>Leave a message in any space's guestbook:</p>
                        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                            <select value={gbSpaceId} style={{ ...S.input, flex: 1 }}
                                onChange={e => { setGbSpaceId(e.target.value); if (e.target.value) fetchGuestbook(e.target.value); }}>
                                <option value="">Select a space…</option>
                                {allSpaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                        </div>
                        {gbSpaceId && (
                            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                                <input style={{ ...S.input, flex: 1 }} placeholder="Write a message (max 200 chars)…"
                                    maxLength={200} value={gbMsg} onChange={e => setGbMsg(e.target.value)}
                                    onKeyDown={e => { if (e.key === "Enter") handleGuestbookPost(gbSpaceId); }} />
                                <button onClick={() => handleGuestbookPost(gbSpaceId)}
                                    disabled={gbSending || !gbMsg.trim()}
                                    style={{ ...S.primaryBtn, marginTop: 0, padding: "10px 20px", flexShrink: 0 }}>
                                    {gbSending ? "…" : "Post"}
                                </button>
                            </div>
                        )}
                        {gbError && <p style={{ ...S.errorMsg, marginBottom: 12 }}>{gbError}</p>}
                        {!gbSpaceId ? (
                            <EmptyState icon="📝" title="Pick a space above" sub="Select a space from the dropdown to read and write guestbook messages." />
                        ) : guestbookLoading ? (
                            <p style={S.muted}>Loading messages…</p>
                        ) : guestbook.length === 0 ? (
                            <EmptyState icon="✍️" title="No messages yet" sub="Be the first to leave a message in this space!" />
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                {guestbook.map(entry => (
                                    <div key={entry.id} style={S.gbEntry}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                            <span style={S.gbAuthor} onClick={() => navigate(`/profile/${entry.userId}`)}>{entry.username}</span>
                                            <span style={S.gbDate}>{new Date(entry.createdAt).toLocaleDateString()}</span>
                                        </div>
                                        <p style={{ margin: 0, fontSize: 13, color: "#cbd5e1" }}>{entry.message}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>
                )}

                {/* Neighbourhood */}
                {tab === "neighbourhood" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>Neighbourhood</h2>
                        {loadingNeighbourhood ? (
                            <p style={S.muted}>Loading…</p>
                        ) : !neighbourhood ? (
                            <EmptyState icon="👥" title="No neighbourhood yet" sub="Neighbourhoods form as you connect with other players. Start exploring spaces!" />
                        ) : (
                            <>
                                <p style={{ ...S.muted, marginBottom: 16 }}>{neighbourhood.name}</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {(neighbourhood.members ?? []).map(m => (
                                        <div key={m.id} style={S.memberCard}>
                                            <div style={S.memberAvatar}>
                                                {(m.username?.[0] ?? "?").toUpperCase()}
                                            </div>
                                            <span style={S.memberName} onClick={() => navigate(`/profile/${m.id}`)}>
                                                {m.username}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </section>
                )}

                {/* Creator */}
                {tab === "creator" && (
                    <section style={S.section}>
                        <h2 style={S.sectionTitle}>Creator Studio</h2>
                        <div style={S.comingSoon}>
                            <div style={{ fontSize: 64, marginBottom: 20 }}>🎨</div>
                            <h3 style={S.comingSoonTitle}>Coming Soon</h3>
                            <p style={S.comingSoonSub}>
                                The Creator Studio will let you upload custom tile sets, design items, and submit them
                                for the community to use in their spaces.
                            </p>
                            <div style={S.comingSoonFeatures}>
                                <div style={S.featureItem}><span>🖼️</span> Custom tile sprites</div>
                                <div style={S.featureItem}><span>🧩</span> Item design tools</div>
                                <div style={S.featureItem}><span>🏪</span> Publish to the shop</div>
                                <div style={S.featureItem}><span>💰</span> Earn coins from sales</div>
                            </div>
                        </div>
                    </section>
                )}
            </main>
        </div>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const S: Record<string, React.CSSProperties> = {
    page: {
        minHeight: "100vh",
        background: "linear-gradient(160deg, #0f172a 0%, #1a1035 50%, #0f1a2e 100%)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        color: "#e2e8f0",
    },

    // ── Header ──
    header: {
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "rgba(15,23,42,0.95)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 28px",
        height: 64,
        gap: 16,
    },
    headerLeft: { display: "flex", alignItems: "center", gap: 16 },
    headerRight: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 },
    logo: { display: "flex", alignItems: "center", gap: 10 },
    logoPx: {
        background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
        color: "#fff",
        fontWeight: 900,
        fontSize: 13,
        letterSpacing: "0.1em",
        padding: "4px 8px",
        borderRadius: 6,
        fontFamily: "monospace",
    },
    logoText: {
        fontSize: 17,
        fontWeight: 700,
        color: "#f1f5f9",
        letterSpacing: "-0.3px",
        whiteSpace: "nowrap",
    },
    userPill: {
        display: "flex",
        alignItems: "center",
        gap: 8,
        background: "rgba(255,255,255,0.07)",
        borderRadius: 20,
        padding: "4px 12px 4px 4px",
    },
    userAvatar: {
        width: 26, height: 26, borderRadius: "50%",
        background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 11, fontWeight: 700, color: "#fff",
    },
    userName: { fontSize: 13, fontWeight: 600, color: "#e2e8f0" },
    guestBadge: {
        fontSize: 11, fontWeight: 600, color: "#94a3b8",
        background: "rgba(255,255,255,0.07)", borderRadius: 10, padding: "3px 10px",
    },
    coinDisplay: {
        display: "flex", alignItems: "center", gap: 6,
        background: "rgba(234,179,8,0.12)", borderRadius: 20, padding: "5px 14px",
    },
    coinAmount: { fontSize: 14, fontWeight: 700, color: "#fbbf24" },
    giftBtn: {
        padding: "7px 16px", borderRadius: 20,
        border: "none",
        background: "linear-gradient(135deg,#16a34a,#15803d)",
        color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
        boxShadow: "0 2px 8px rgba(22,163,74,0.4)",
        whiteSpace: "nowrap",
    },
    leaveBtn: {
        padding: "6px 14px", borderRadius: 8, border: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.06)", color: "#94a3b8", fontSize: 12, cursor: "pointer",
    },

    // ── Banners ──
    guestBanner: {
        padding: "10px 28px", background: "rgba(251,191,36,0.1)", borderBottom: "1px solid rgba(251,191,36,0.2)",
        display: "flex", alignItems: "center", justifyContent: "center", gap: 16,
        fontSize: 13, color: "#fcd34d",
    },
    guestSignupBtn: {
        padding: "5px 14px", borderRadius: 8, border: "none",
        background: "#fbbf24", color: "#1a1a1a", fontSize: 12, fontWeight: 700, cursor: "pointer",
    },
    seasonBanner: {
        background: "linear-gradient(135deg,rgba(99,102,241,0.2),rgba(139,92,246,0.2))",
        borderBottom: "1px solid rgba(139,92,246,0.2)",
        padding: "10px 28px", display: "flex", alignItems: "center", justifyContent: "space-between",
    },
    seasonLabel: { fontSize: 10, fontWeight: 600, color: "#a78bfa", textTransform: "uppercase", letterSpacing: "0.1em", marginRight: 10 },
    seasonName: { fontSize: 14, fontWeight: 700, color: "#e2e8f0" },
    seasonTheme: { fontSize: 12, color: "#94a3b8", marginLeft: 10 },
    seasonTimer: { fontSize: 12, color: "#a78bfa", fontWeight: 600 },

    // ── Tab bar ──
    tabBar: {
        display: "flex", gap: 6, padding: "16px 28px 0",
        overflowX: "auto", scrollbarWidth: "none",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
    },
    tabBtn: {
        display: "flex", alignItems: "center", gap: 6,
        padding: "8px 16px", borderRadius: "10px 10px 0 0",
        border: "1px solid transparent", borderBottom: "none",
        background: "rgba(255,255,255,0.04)",
        color: "#94a3b8", fontSize: 13, fontWeight: 500,
        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
        transition: "all 0.15s",
    },
    tabBtnActive: {
        background: "rgba(99,102,241,0.18)",
        border: "1px solid rgba(99,102,241,0.35)", borderBottom: "none",
        color: "#818cf8", fontWeight: 700,
    },

    // ── Content ──
    content: { maxWidth: 860, margin: "0 auto", padding: "28px 16px 60px" },
    section: {},
    sectionTitle: { margin: "0 0 20px", fontSize: 20, fontWeight: 700, color: "#f1f5f9" },
    subLabel: { margin: "0 0 12px", fontSize: 13, color: "#94a3b8" },
    muted: { color: "#94a3b8", fontSize: 13, margin: 0 },

    // ── Space cards ──
    spaceGrid: {
        display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16,
    },
    spaceCard: {
        borderRadius: 14, overflow: "hidden",
        border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.04)",
        transition: "transform 0.15s, border-color 0.15s",
    },
    spaceThumb: { height: 80, position: "relative", display: "flex", alignItems: "flex-end", padding: "0 10px 8px" },
    spaceThumbLabel: {
        fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.6)",
        background: "rgba(0,0,0,0.4)", borderRadius: 6, padding: "2px 7px",
    },
    spaceCardBody: { padding: "12px 14px 14px" },
    spaceAvatar: {
        width: 30, height: 30, borderRadius: "50%", flexShrink: 0,
        background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 12, fontWeight: 700, color: "#fff",
    },
    spaceName: { margin: 0, fontWeight: 700, fontSize: 14, color: "#f1f5f9", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    spaceMeta: { margin: "2px 0 0", fontSize: 11, color: "#94a3b8" },
    sizeBadge: {
        marginLeft: "auto", flexShrink: 0,
        fontSize: 10, fontWeight: 600, color: "#818cf8",
        background: "rgba(99,102,241,0.15)", borderRadius: 6, padding: "2px 7px",
    },
    joinBtn: {
        width: "100%", marginTop: 10,
        padding: "9px", borderRadius: 8, border: "none",
        background: "linear-gradient(135deg,#4f46e5,#6d28d9)",
        color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
        transition: "opacity 0.15s",
    },

    // ── Create form ──
    templateGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 24 },
    templateCard: {
        padding: 14, borderRadius: 12,
        border: "2px solid rgba(255,255,255,0.08)",
        background: "rgba(255,255,255,0.04)", textAlign: "center",
        cursor: "pointer", transition: "all 0.15s",
    },
    templateCardActive: { border: "2px solid #6366f1", background: "rgba(99,102,241,0.12)" },
    templateThumb: { fontSize: 28, marginBottom: 6 },
    templateName: { margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: "#e2e8f0" },
    templateDims: { margin: 0, fontSize: 10, color: "#94a3b8" },
    form: { display: "flex", flexDirection: "column", gap: 16 },
    field: { display: "flex", flexDirection: "column", gap: 6 },
    fieldHint: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
    label: { fontSize: 13, fontWeight: 600, color: "#94a3b8" },
    input: {
        padding: "10px 12px", borderRadius: 8,
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.07)", color: "#e2e8f0",
        fontSize: 14, outline: "none",
    },
    primaryBtn: {
        padding: "12px", borderRadius: 8, border: "none",
        background: "linear-gradient(135deg,#4f46e5,#6d28d9)",
        color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", marginTop: 4,
    },
    errorMsg: {
        color: "#fca5a5", fontSize: 13, margin: 0,
        padding: "8px 12px", background: "rgba(239,68,68,0.12)", borderRadius: 8,
    },
    successMsg: {
        color: "#4ade80", fontSize: 13, margin: 0,
        padding: "8px 12px", background: "rgba(74,222,128,0.1)", borderRadius: 8,
    },

    // ── Shop ──
    shopGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 16 },
    shopCard: {
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "18px 14px 14px", borderRadius: 14,
        border: "1px solid rgba(255,255,255,0.07)",
        background: "rgba(255,255,255,0.04)", textAlign: "center",
        gap: 6,
    },
    shopSprite: {
        width: 72, height: 72, background: "rgba(0,0,0,0.3)", borderRadius: 10,
        display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4,
    },
    shopItemName: { margin: 0, fontWeight: 700, fontSize: 13, color: "#e2e8f0" },
    rarityBadge: {
        fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 10,
    },
    shopPrice: { display: "flex", alignItems: "center", gap: 4, marginTop: 2 },
    shopPriceNum: { fontSize: 15, fontWeight: 700, color: "#fbbf24" },
    buyBtn: {
        width: "100%", marginTop: 4, padding: "7px", borderRadius: 7, border: "none",
        background: "#4f46e5", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer",
    },

    // ── Collection ──
    collectionGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 12 },
    collectionCard: {
        display: "flex", flexDirection: "column", alignItems: "center",
        padding: "14px 10px 10px", borderRadius: 12, textAlign: "center", gap: 4,
        border: "1px solid rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.04)",
        transition: "opacity 0.2s",
    },
    collectionSprite: {
        width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center",
        background: "rgba(0,0,0,0.3)", borderRadius: 8, marginBottom: 4,
    },
    collectionName: { margin: 0, fontSize: 11, fontWeight: 700, color: "#e2e8f0" },
    ownedBadge: { fontSize: 9, color: "#4ade80", fontWeight: 700 },

    // ── Quests ──
    questCard: {
        padding: "16px 18px", borderRadius: 12,
        border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.04)",
    },
    questCardDone: { border: "1px solid rgba(74,222,128,0.2)", background: "rgba(74,222,128,0.05)" },
    questTitle: { margin: 0, fontWeight: 700, fontSize: 14, color: "#e2e8f0" },
    questDesc: { margin: "3px 0 0", fontSize: 12, color: "#94a3b8" },
    questReward: {
        fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, flexShrink: 0,
        background: "rgba(245,158,11,0.15)", color: "#fbbf24",
    },
    questRewardDone: { background: "rgba(74,222,128,0.15)", color: "#4ade80" },
    questBar: { width: "100%", height: 6, borderRadius: 3, background: "rgba(255,255,255,0.08)", overflow: "hidden", marginTop: 10 },
    questFill: { height: "100%", borderRadius: 3, background: "#4f46e5", transition: "width 0.3s" },
    questFillDone: { background: "#4ade80" },
    questProgress: { margin: "4px 0 0", fontSize: 11, color: "#94a3b8" },

    // ── Guestbook ──
    gbEntry: {
        padding: "12px 14px", borderRadius: 10,
        border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.04)",
    },
    gbAuthor: { fontWeight: 700, fontSize: 13, color: "#818cf8", cursor: "pointer" },
    gbDate: { fontSize: 11, color: "#94a3b8" },

    // ── Neighbourhood ──
    memberCard: {
        display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
        borderRadius: 10, border: "1px solid rgba(255,255,255,0.07)", background: "rgba(255,255,255,0.04)",
    },
    memberAvatar: {
        width: 36, height: 36, borderRadius: "50%",
        background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0,
    },
    memberName: { fontSize: 14, fontWeight: 600, color: "#e2e8f0", cursor: "pointer" },

    // ── Creator coming soon ──
    comingSoon: {
        display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center",
        padding: "60px 24px",
        border: "1px dashed rgba(99,102,241,0.3)", borderRadius: 16,
        background: "rgba(99,102,241,0.04)",
    },
    comingSoonTitle: { margin: "0 0 12px", fontSize: 22, fontWeight: 700, color: "#e2e8f0" },
    comingSoonSub: { margin: "0 0 32px", fontSize: 14, color: "#94a3b8", maxWidth: 360, lineHeight: 1.6 },
    comingSoonFeatures: {
        display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 320,
    },
    featureItem: {
        display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10,
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)",
        fontSize: 13, color: "#94a3b8", fontWeight: 500,
    },
};
