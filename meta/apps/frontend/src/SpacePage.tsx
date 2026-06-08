import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore } from "./stores/authStore";
import { Compass, Home, ShoppingBag, Package, Trophy, Plus, Settings, Coins, Gift, Bell, Search, User, MessageSquare, LogIn } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://localhost:3000";
const ASSETS_URL = import.meta.env.VITE_ASSETS_URL || "";

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

    const [deleteTarget, setDeleteTarget] = useState<Space | null>(null);
    const [deletingSpace, setDeletingSpace] = useState(false);

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

    const handleDeleteSpace = async (space: Space) => {
        setDeletingSpace(true);
        try {
            const res = await fetch(`${API}/api/v1/space/${space.id}`, {
                method: "DELETE", credentials: "include", headers: authHeaders,
            });
            if (res.ok) {
                setMySpaces(prev => prev.filter(s => s.id !== space.id));
                setAllSpaces(prev => prev.filter(s => s.id !== space.id));
            }
        } catch {} finally {
            setDeletingSpace(false);
            setDeleteTarget(null);
        }
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
            <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#191427" }}>{title}</p>
            <p style={{ margin: 0, fontSize: 13, color: "#6f6b82", maxWidth: 280, marginInline: "auto" }}>{sub}</p>
        </div>
    );

    const FLOOR_TILES = ["office-floor", "cobblestone", "wood-floor", "cave-floor", "sand", "dirt", "path"];
    const FLOOR_TINTS: Record<string, string> = { "office-floor": "#8a8fa8", cobblestone: "#6b6f78", "wood-floor": "#7a5230", "cave-floor": "#2a2438", sand: "#c8a96a", dirt: "#7a5a3a", path: "#888060" };
    const SCENE_ITEMS: Record<string, { name: string; x: string; y: string; w: number; kind?: string }[]> = {
        "office-floor":[{ name: "office-desk", x: "8%",  y: "42%", w: 76 }, { name: "computer", x: "10%", y: "28%", w: 40 }, { name: "meeting-table", x: "52%", y: "42%", w: 108 }, { name: "whiteboard", x: "55%", y: "15%", w: 54 }],
        cobblestone:   [{ name: "fountain", x: "38%", y: "30%", w: 80 }, { name: "lamp", x: "10%", y: "18%", w: 36 }, { name: "sign", x: "72%", y: "40%", w: 46 }],
        "wood-floor":  [{ name: "sofa", x: "12%", y: "42%", w: 88 }, { name: "table", x: "58%", y: "40%", w: 60 }, { name: "coffee-machine", x: "74%", y: "22%", w: 50 }],
        "cave-floor":  [{ name: "chest", kind: "tiles", x: "12%", y: "44%", w: 54 }, { name: "crystal", x: "52%", y: "28%", w: 56 }, { name: "throne", x: "70%", y: "28%", w: 72 }],
        sand:          [{ name: "cactus", kind: "tiles", x: "14%", y: "22%", w: 44 }, { name: "barrel", x: "56%", y: "38%", w: 42 }, { name: "campfire", x: "38%", y: "48%", w: 48 }],
        dirt:          [{ name: "plant", x: "14%", y: "38%", w: 44 }, { name: "bookshelf", x: "62%", y: "28%", w: 56 }, { name: "rug", x: "34%", y: "46%", w: 80 }],
        path:          [{ name: "lamp", x: "10%", y: "24%", w: 36 }, { name: "painting", x: "62%", y: "22%", w: 44 }, { name: "sign", x: "36%", y: "42%", w: 46 }],
    };
    const spaceTile = (name: string) => FLOOR_TILES[Math.abs(name.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 0)) % FLOOR_TILES.length];

    // WorldPreview — floor tile repeated + sprite items placed absolutely
    const WorldPreview = ({ tile, height = 140, radius = 10 }: { tile: string; height?: number; radius?: number }) => {
        const tint = FLOOR_TINTS[tile] ?? "#555";
        const items = SCENE_ITEMS[tile] ?? [];
        return (
            <div style={{ position: "relative", height, overflow: "hidden", borderRadius: radius, imageRendering: "pixelated",
                backgroundColor: tint,
                backgroundImage: `url(${ASSETS_URL}/tiles/${tile}.png)`,
                backgroundSize: "44px 44px", backgroundRepeat: "repeat" }}>
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg,rgba(0,0,0,0.12) 0%,transparent 36%,transparent 60%,rgba(0,0,0,0.28) 100%)" }} />
                {items.map((it, i) => (
                    <img key={i} src={`${ASSETS_URL}/${it.kind ?? "items"}/${it.name}.png`} alt=""
                        style={{ position: "absolute", left: it.x, top: it.y, width: it.w, imageRendering: "pixelated", objectFit: "contain", filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.4))" }}
                    />
                ))}
            </div>
        );
    };

    const SpaceCard = ({ space, featured, onDelete }: { space: Space; featured?: boolean; onDelete?: () => void }) => {
        const [hover, setHover] = React.useState(false);
        const tile = spaceTile(space.name);
        // Derive a theme colour from the tile
        const THEME_DOT: Record<string, string> = { "wood-floor": "#d97706", "cave-floor": "#7c3aed", sand: "#d97706", cobblestone: "#6366f1", "office-floor": "#6d28d9", dirt: "#92400e", path: "#64748b" };
        const dot = THEME_DOT[tile] ?? "#6d28d9";
        const THEME_NAME: Record<string, string> = { "wood-floor": "Social", "cave-floor": "Fantasy", sand: "Desert", cobblestone: "Town", "office-floor": "Office", dirt: "Village", path: "Town" };
        const theme = THEME_NAME[tile] ?? "Space";
        // Enter button gradient matched to theme
        const BTN_GRAD: Record<string, string> = { "cave-floor": "linear-gradient(135deg,#7c3aed,#a78bfa)", sand: "linear-gradient(135deg,#fbbf24,#f59e0b)" };
        const btnGrad = hover ? (BTN_GRAD[tile] ?? "linear-gradient(135deg,#7c3aed,#a78bfa)") : "linear-gradient(135deg,#818cf8,#a78bfa)";
        const btnShadow = hover ? "0 6px 16px rgba(124,58,237,.32)" : "0 4px 12px rgba(129,140,248,.3)";
        return (
            <div onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
                style={{ background: "#fff", border: `1px solid ${hover ? "#d4d0e6" : "#ece9f7"}`, borderRadius: 16, overflow: "hidden", cursor: "pointer",
                    boxShadow: hover ? "0 12px 26px rgba(99,102,241,.18)" : "0 6px 18px rgba(99,102,241,.10)",
                    transform: hover ? "translateY(-3px)" : "none", transition: "transform 0.16s cubic-bezier(.2,.7,.3,1), box-shadow 0.16s, border-color 0.16s" }}>
                {/* Pixel-art world preview */}
                <div style={{ padding: 7, position: "relative" }}>
                    <WorldPreview tile={tile} height={featured ? 220 : 140} radius={10} />
                    {/* "N here now" presence pill — design system spec */}
                    <div style={{ position: "absolute", bottom: 15, left: 14, display: "inline-flex", alignItems: "center", gap: 5, fontSize: 10, fontWeight: 700,
                        color: "#fff", background: "rgba(16,16,30,0.45)", borderRadius: 999, padding: "3px 9px 3px 7px", backdropFilter: "blur(2px)" }}>
                        <span style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 0 3px rgba(74,222,128,0.3)" }} />
                        online
                    </div>
                    {/* Dimension badge */}
                    <div style={{ position: "absolute", top: 14, right: 14, fontSize: 10.5, fontWeight: 700, color: "#fff",
                        background: "rgba(14,12,28,0.5)", borderRadius: 6, padding: "3px 8px", backdropFilter: "blur(4px)" }}>{space.dimensions}</div>
                </div>
                {/* Card body */}
                <div style={{ padding: "13px 15px 15px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 11 }}>
                        <p style={{ margin: 0, fontWeight: 800, fontSize: 14, color: "#211c3b", letterSpacing: "-0.01em", flex: 1 }}>{space.name}</p>
                        {/* Theme chip — matches design system */}
                        <span style={{ fontSize: 10, fontWeight: 700, color: dot, background: `${dot}18`, borderRadius: 6, padding: "3px 8px" }}>{theme}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        {/* Creator avatar */}
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: `linear-gradient(135deg,#a78bfa,#818cf8)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff", flexShrink: 0 }}>
                            {(space.createdBy?.[0] ?? "?").toUpperCase()}
                        </div>
                        <span style={{ fontSize: 11, color: "#8b82a8", flex: 1 }}>by {space.createdBy ?? "unknown"}</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 700, color: hover ? "#6d28d9" : "#8b82a8", transition: "color 0.15s" }}>
                            Enter <LogIn size={13} />
                        </span>
                    </div>
                    {/* Gradient CTA button — matched to theme */}
                    <button style={{ width: "100%", padding: "9px", borderRadius: 9, border: "none", background: btnGrad, color: "#fff", fontSize: 13, fontWeight: 800, cursor: "pointer", transition: "all 0.15s", boxShadow: btnShadow }}
                        onClick={() => navigate(`/arena?spaceId=${space.id}`)}>
                        Enter Space →
                    </button>
                    {onDelete && (
                        <button
                            onClick={e => { e.stopPropagation(); onDelete(); }}
                            style={{ width: "100%", marginTop: 6, padding: "7px", borderRadius: 9, border: "1px solid #fecaca", background: "#fff5f5", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: "pointer" }}
                        >
                            🗑 Delete Space
                        </button>
                    )}
                </div>
            </div>
        );
    };

    const NAV_ITEMS = [
        { id: "all" as Tab,           label: "Discover",   Icon: Compass },
        ...(isGuest ? [] : [
            { id: "mine" as Tab,          label: "My Spaces",  Icon: Home },
            { id: "shop" as Tab,          label: "Shop",        Icon: ShoppingBag },
            { id: "collection" as Tab,    label: "Collection",  Icon: Package },
            { id: "quests" as Tab,        label: "Quests",      Icon: Trophy },
        ]),
    ];

    return (
        <div style={{ display: "flex", height: "100vh", background: "#f6f6fb", fontFamily: "system-ui,-apple-system,sans-serif", color: "#191427", overflow: "hidden" }}>

            {/* ── Sidebar ── */}
            <aside style={{ width: 248, flexShrink: 0, background: "#fff", borderRight: "1px solid #ecebf3", display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Logo */}
                <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: "linear-gradient(140deg,#6366f1,#8b5cf6 52%,#d946ef)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, boxShadow: "0 3px 8px rgba(124,58,237,.34), inset 0 1.5px 0 rgba(255,255,255,.4)" }}>
                        <img src={`${ASSETS_URL}/items/computer.png`} alt="" style={{ width: 18, imageRendering: "pixelated", filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }} />
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: "#191427", letterSpacing: "-0.02em" }}>
                        OfficeVerse <span style={{ color: "#6f6b82", fontWeight: 600 }}>2D</span>
                    </span>
                </div>

                {/* Nav */}
                <nav style={{ padding: "4px 12px", flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#a3a0b3", letterSpacing: ".08em", textTransform: "uppercase", padding: "8px 12px 6px" }}>Browse</div>
                    {NAV_ITEMS.map(n => {
                        const on = tab === n.id;
                        return (
                            <button key={n.id} onClick={() => { setTab(n.id); setError(""); setCreateSuccess(""); setBuyMsg(""); setSelectedMap(null); }}
                                style={{ display: "flex", alignItems: "center", gap: 11, padding: "9px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                                    background: on ? "#f4f0fe" : "transparent", color: on ? "#5b21b6" : "#4d495f",
                                    fontSize: 13.5, fontWeight: on ? 700 : 500, fontFamily: "system-ui,sans-serif",
                                    textAlign: "left", transition: "background .12s" }}>
                                <n.Icon size={17} strokeWidth={on ? 2.2 : 1.8} />
                                {n.label}
                            </button>
                        );
                    })}
                    {/* Extra nav for non-guests */}
                    {!isGuest && <>
                        <div style={{ height: 1, background: "#ecebf3", margin: "10px 12px" }} />
                        {[
                            { id: "neighbourhood" as Tab, label: "Neighbours" },
                            { id: "guestbook" as Tab, label: "Guestbook" },
                            { id: "creator" as Tab, label: "Creator" },
                        ].map(n => (
                            <button key={n.id} onClick={() => { setTab(n.id); setError(""); setBuyMsg(""); }}
                                style={{ display: "flex", alignItems: "center", gap: 11, padding: "8px 12px", borderRadius: 10, border: "none", cursor: "pointer",
                                    background: tab === n.id ? "#f4f0fe" : "transparent", color: tab === n.id ? "#5b21b6" : "#6f6b82",
                                    fontSize: 13, fontWeight: tab === n.id ? 700 : 500, fontFamily: "system-ui,sans-serif", textAlign: "left" }}>
                                {n.label}
                            </button>
                        ))}
                        <div style={{ height: 1, background: "#ecebf3", margin: "8px 12px" }} />
                        <button onClick={() => { setTab("create"); setError(""); setCreateSuccess(""); setBuyMsg(""); setSelectedMap(null); }}
                            style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 10, border: "1px solid #e7ddfb", cursor: "pointer",
                                background: tab === "create" ? "#f4f0fe" : "#f9f7ff", color: "#5b21b6", fontSize: 13.5, fontWeight: 600, fontFamily: "system-ui,sans-serif", textAlign: "left" }}>
                            <Plus size={16} />New space
                        </button>
                    </>}
                </nav>

                {/* User footer */}
                {!isGuest && username && (
                    <div style={{ padding: 12, borderTop: "1px solid #ecebf3" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 10 }}>
                            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(140deg,#6366f1,#8b5cf6 52%,#d946ef)", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, flexShrink: 0 }}>
                                {username[0]?.toUpperCase()}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#191427", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{username}</div>
                                {wallet && (
                                    <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11.5, color: "#b25e09", fontWeight: 600, marginTop: 1 }}>
                                        <Coins size={12} />{wallet.coins.toLocaleString()}
                                    </div>
                                )}
                            </div>
                            <button onClick={handleSignOut} title="Sign out" style={{ width: 28, height: 28, borderRadius: 8, border: "1px solid #ecebf3", background: "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#a3a0b3" }}>
                                <Settings size={15} />
                            </button>
                        </div>
                    </div>
                )}
                {isGuest && (
                    <div style={{ padding: "12px 16px", borderTop: "1px solid #ecebf3" }}>
                        <button onClick={() => navigate("/login")} style={{ width: "100%", padding: "8px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(124,58,237,.25)" }}>
                            Sign In / Create Account
                        </button>
                    </div>
                )}
            </aside>

            {/* ── Main content ── */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", height: "100%" }}>
                {/* Top bar */}
                <div style={{ height: 60, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 28px", borderBottom: "1px solid #ecebf3", background: "rgba(246,246,251,0.8)", backdropFilter: "blur(12px)" }}>
                    {/* Search — icon wrapper from components-inputs.html */}
                    <div className="ov-input-wrap" style={{ width: 280, boxShadow: "0 2px 8px rgba(99,102,241,.06)" }}>
                        <Search size={16} />
                        <input type="text" placeholder="Search spaces, people…" readOnly style={{ cursor: "default" }} />
                        <span style={{ fontSize: 11, fontWeight: 600, color: "#a99fc4", background: "#f4f3f9", border: "1px solid #ece9f7", borderRadius: 6, padding: "1px 6px", flexShrink: 0 }}>⌘K</span>
                    </div>
                    {/* Actions */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {season && <span style={{ fontSize: 12, fontWeight: 600, color: "#6d28d9", background: "#f4f0fe", borderRadius: 999, padding: "4px 12px", border: "1px solid #e7ddfb" }}>✨ {season.name}</span>}
                        {/* Daily Gift — "go" gradient from design system */}
                        {!isGuest && (
                            <button onClick={handleClaimGift} disabled={claiming || giftStatus.claimed}
                                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "7px 14px", borderRadius: 9, border: "none",
                                    background: giftStatus.claimed ? "#f4f3f9" : "linear-gradient(135deg,#34d399,#10b981)",
                                    color: giftStatus.claimed ? "#a3a0b3" : "#fff", fontSize: 13, fontWeight: 700,
                                    cursor: giftStatus.claimed ? "not-allowed" : "pointer",
                                    boxShadow: giftStatus.claimed ? "none" : "0 6px 16px rgba(16,185,129,.30)", opacity: claiming ? 0.7 : 1 }}>
                                <Gift size={15} />{claiming ? "Claiming…" : giftStatus.claimed ? "Claimed" : "Daily Gift"}
                            </button>
                        )}
                        {claimResult && <span style={{ fontSize: 12, color: claimResult.startsWith("+") ? "#15a34a" : "#dc2626", fontWeight: 700 }}>{claimResult}</span>}
                        <button style={{ width: 36, height: 36, borderRadius: 9, border: "1.5px solid #e7e2f5", background: "#fff", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#6b6388" }}>
                            <Bell size={16} />
                        </button>
                        {/* New Space — primary gradient from design system */}
                        {!isGuest && (
                            <button onClick={() => { setTab("create"); setError(""); setCreateSuccess(""); setSelectedMap(null); }}
                                style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "8px 16px", borderRadius: 11, border: "none",
                                    background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 13, fontWeight: 800,
                                    cursor: "pointer", boxShadow: "0 6px 16px rgba(124,58,237,.32)" }}>
                                <Plus size={15} />New Space
                            </button>
                        )}
                    </div>
                </div>

                {/* Guest banner */}
                {isGuest && (
                    <div style={{ padding: "8px 28px", background: "#fef3c7", borderBottom: "1px solid #f6e3c0", display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13, color: "#92400e" }}>
                        <span>Browsing as guest — join a space and explore, but full features need an account.</span>
                        <button onClick={() => navigate("/login")} style={{ padding: "4px 12px", borderRadius: 7, border: "none", background: "#b45309", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Create Account</button>
                    </div>
                )}

                {/* Scrollable content */}
                <div style={{ flex: 1, overflowY: "auto" }}>
                    <div style={{ maxWidth: 1040, margin: "0 auto", padding: "32px 28px 64px" }}>

                        {/* Discover */}
                        {tab === "all" && (
                            <>
                                <h1 style={{ margin: "0 0 4px", fontSize: 28, fontWeight: 760, color: "#191427", letterSpacing: "-0.03em" }}>Discover</h1>
                                <p style={{ margin: "0 0 28px", fontSize: 14, color: "#6f6b82" }}>Jump into a live world — or build your own.</p>
                                {loadingAll ? (
                                    <p style={{ color: "#6f6b82", fontSize: 13 }}>Loading spaces…</p>
                                ) : allSpaces.length === 0 ? (
                                    <EmptyState icon="🌐" title="No spaces yet" sub="Be the first to create a space and invite friends!" />
                                ) : (<>
                                    {/* Featured */}
                                    {allSpaces[0] && (
                                        <div style={{ display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 0, background: "#fff", border: "1px solid #ecebf3", borderRadius: 14, overflow: "hidden", boxShadow: "0 1px 2px rgba(22,15,52,0.04), 0 6px 16px rgba(22,15,52,0.06)", marginBottom: 30 }}>
                                            <div style={{ padding: 9 }}>
                                                <WorldPreview tile={spaceTile(allSpaces[0].name)} height={232} radius={10} />
                                            </div>
                                            <div style={{ padding: "26px 28px", display: "flex", flexDirection: "column", justifyContent: "center" }}>
                                                <div style={{ fontFamily: "monospace", fontSize: 9, letterSpacing: ".14em", color: "#6d28d9", marginBottom: 12, fontWeight: 700, textTransform: "uppercase" }}>Featured Space</div>
                                                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>{allSpaces[0].name}</h2>
                                                <div style={{ display: "flex", alignItems: "center", gap: 16, margin: "14px 0 20px", fontSize: 13, color: "#6f6b82" }}>
                                                    <span>{allSpaces[0].dimensions}</span>
                                                    <span>by {allSpaces[0].createdBy ?? "unknown"}</span>
                                                </div>
                                                <button onClick={() => navigate(`/arena?spaceId=${allSpaces[0].id}`)} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "10px 18px", borderRadius: 10, border: "none", background: "#6d28d9", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
                                                    → Enter Space
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                    {/* Grid */}
                                    <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#191427", letterSpacing: "-0.01em" }}>All spaces</h3>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 18 }}>
                                        {allSpaces.slice(1).map(s => <SpaceCard key={s.id} space={s} />)}
                                    </div>
                                </>)}
                            </>
                        )}

                        {/* My Spaces */}
                        {tab === "mine" && (
                            <>
                                <h1 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>My Spaces</h1>
                                {loadingMine ? <p style={{ color: "#6f6b82" }}>Loading…</p>
                                : mySpaces.length === 0 ? <EmptyState icon="🏠" title="No spaces yet" sub="Create your first space to start building your world." />
                                : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))", gap: 18 }}>{mySpaces.map(s => <SpaceCard key={s.id} space={s} onDelete={() => setDeleteTarget(s)} />)}</div>}
                            </>
                        )}

                        {/* Create */}
                        {tab === "create" && (
                            <>
                                <h1 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>Create a Space</h1>
                                {mapTemplates.length > 0 && (
                                    <>
                                        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6f6b82" }}>Choose a map template (optional)</p>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(140px,1fr))", gap: 10, marginBottom: 24 }}>
                                            <div onClick={() => { setSelectedMap(null); setNewSpaceDims("20x20"); }}
                                                style={{ padding: 14, borderRadius: 12, border: `2px solid ${selectedMap === null ? "#6d28d9" : "#e3e1ee"}`, background: selectedMap === null ? "#f4f0fe" : "#fff", textAlign: "center", cursor: "pointer" }}>
                                                <div style={{ fontSize: 28, marginBottom: 6 }}>🟦</div>
                                                <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: "#191427" }}>Blank</p>
                                                <p style={{ margin: 0, fontSize: 10, color: "#6f6b82" }}>Custom size</p>
                                            </div>
                                            {mapTemplates.map(tmpl => {
                                                const active = selectedMap?.id === tmpl.id;
                                                const dims = tmpl.dimensions.split("x");
                                                return (
                                                    <div key={tmpl.id} onClick={() => { setSelectedMap(tmpl); setNewSpaceDims(tmpl.dimensions); }}
                                                        style={{ padding: 14, borderRadius: 12, border: `2px solid ${active ? "#6d28d9" : "#e3e1ee"}`, background: active ? "#f4f0fe" : "#fff", textAlign: "center", cursor: "pointer" }}>
                                                        <div style={{ fontSize: 28, marginBottom: 6 }}>🗺️</div>
                                                        <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: "#191427" }}>{tmpl.name}</p>
                                                        <p style={{ margin: 0, fontSize: 10, color: "#6f6b82" }}>{dims[0]} × {dims[1]}</p>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </>
                                )}
                                <form onSubmit={handleCreate} style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: 420 }}>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: "#7c6f9c", letterSpacing: ".02em" }}>Space Name</label>
                                        <div className="ov-input-wrap">
                                            <User size={16} />
                                            <input type="text" placeholder="My awesome space" value={newSpaceName} onChange={e => setNewSpaceName(e.target.value)} required />
                                        </div>
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                                        <label style={{ fontSize: 11, fontWeight: 700, color: "#7c6f9c", letterSpacing: ".02em" }}>Dimensions</label>
                                        <div className="ov-input-wrap">
                                            <MessageSquare size={16} />
                                            <select value={newSpaceDims} onChange={e => setNewSpaceDims(e.target.value)} disabled={!!selectedMap}>
                                                <option value="10x10">10 × 10 — Small</option>
                                                <option value="20x20">20 × 20 — Medium</option>
                                                <option value="30x30">30 × 30 — Large</option>
                                                <option value="50x50">50 × 50 — Huge</option>
                                            </select>
                                        </div>
                                        {selectedMap && <span style={{ fontSize: 11, color: "#6f6b82" }}>Size set by template</span>}
                                    </div>
                                    {error && <p style={{ color: "#dc2626", fontSize: 13, margin: 0, padding: "8px 12px", background: "#fee2e2", borderRadius: 8 }}>{error}</p>}
                                    {createSuccess && <p style={{ color: "#15a34a", fontSize: 13, margin: 0, padding: "8px 12px", background: "#dcfce7", borderRadius: 8 }}>{createSuccess}</p>}
                                    <button style={{ padding: "12px 16px", borderRadius: 11, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 6px 16px rgba(124,58,237,.32)" }} type="submit" disabled={creating}>
                                        {creating ? "Creating…" : "✨ Create Space"}
                                    </button>
                                </form>
                            </>
                        )}

                        {/* Shop */}
                        {tab === "shop" && (
                            <>
                                <h1 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>Daily Shop</h1>
                                {buyMsg && <p style={{ color: "#15a34a", fontSize: 13, marginBottom: 16, padding: "8px 12px", background: "#dcfce7", borderRadius: 8 }}>{buyMsg}</p>}
                                {shopItems.length === 0 ? <EmptyState icon="🛒" title="Shop is restocking" sub="New items rotate daily. Check back soon!" />
                                : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(160px,1fr))", gap: 16 }}>
                                    {shopItems.map(item => {
                                        const r = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.Common;
                                        const price = RARITY_PRICE[item.rarity] ?? 50;
                                        return (
                                            <div key={item.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "18px 14px 14px", borderRadius: 14, border: "1px solid #ecebf3", background: "#fff", textAlign: "center", gap: 6, boxShadow: "0 1px 2px rgba(22,15,52,0.04)" }}>
                                                <div style={{ width: 72, height: 72, background: "#f4f3f9", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 4 }}>
                                                    <img src={`${ASSETS_URL}/items/${item.imageUrl.split("/").pop()}`} alt={item.name} style={{ maxWidth: 64, maxHeight: 64, imageRendering: "pixelated" }} onError={e => { (e.target as HTMLImageElement).src = `${API}${item.imageUrl}`; }} />
                                                </div>
                                                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#191427" }}>{item.name}</p>
                                                <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: r.bg, color: r.text }}>{r.label}</span>
                                                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                                                    <Coins size={14} style={{ color: "#b25e09" }} />
                                                    <span style={{ fontSize: 15, fontWeight: 700, color: "#b25e09" }}>{price}</span>
                                                </div>
                                                <button onClick={() => handleBuy(item.id)} disabled={buyingId === item.id} style={{ width: "100%", marginTop: 4, padding: "7px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(124,58,237,.25)" }}>
                                                    {buyingId === item.id ? "…" : "Buy"}
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>}
                            </>
                        )}

                        {/* Collection */}
                        {tab === "collection" && (
                            <>
                                <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>Collection</h1>
                                {collection.length > 0 && <p style={{ margin: "0 0 20px", fontSize: 13, color: "#6f6b82" }}>{collection.filter(c => c.owned).length} / {collection.length} owned</p>}
                                {loadingCollection ? <p style={{ color: "#6f6b82" }}>Loading…</p>
                                : collection.length === 0 ? <EmptyState icon="📦" title="Collection is empty" sub="Buy items from the shop or earn them through quests to fill your collection." />
                                : <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(120px,1fr))", gap: 12 }}>
                                    {collection.map(item => {
                                        const r = RARITY_COLOR[item.rarity] ?? RARITY_COLOR.Common;
                                        return (
                                            <div key={item.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 10px 10px", borderRadius: 12, textAlign: "center", gap: 4, border: "1px solid #ecebf3", background: "#fff", opacity: item.owned ? 1 : 0.4 }}>
                                                <div style={{ width: 56, height: 56, display: "flex", alignItems: "center", justifyContent: "center", background: "#f4f3f9", borderRadius: 8, marginBottom: 4 }}>
                                                    <img src={`${ASSETS_URL}/items/${item.imageUrl.split("/").pop()}`} alt={item.name} style={{ maxWidth: 48, maxHeight: 48, imageRendering: "pixelated", filter: item.owned ? "none" : "grayscale(1)" }} onError={e => { (e.target as HTMLImageElement).src = `${API}${item.imageUrl}`; }} />
                                                </div>
                                                <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: "#191427" }}>{item.name}</p>
                                                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 9px", borderRadius: 10, background: r.bg, color: r.text }}>{r.label}</span>
                                                {item.owned && <span style={{ fontSize: 9, color: "#15a34a", fontWeight: 700 }}>✓ Owned</span>}
                                            </div>
                                        );
                                    })}
                                </div>}
                            </>
                        )}

                        {/* Quests */}
                        {tab === "quests" && (
                            <>
                                <h1 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>Daily Quests</h1>
                                {questsLoading ? <p style={{ color: "#6f6b82" }}>Loading…</p>
                                : quests.length === 0 ? <EmptyState icon="🏆" title="No active quests" sub="Join a space and start exploring to unlock daily quests and earn rewards." />
                                : <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    {quests.map(q => {
                                        const pct = Math.min(100, Math.round((q.progress / q.goalCount) * 100));
                                        return (
                                            <div key={q.id} style={{ padding: "16px 18px", borderRadius: 12, border: q.completed ? "1px solid #bbf7d0" : "1px solid #ecebf3", background: q.completed ? "#f0fdf4" : "#fff" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                                                    <div>
                                                        <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: "#191427" }}>{q.title}</p>
                                                        <p style={{ margin: "3px 0 0", fontSize: 12, color: "#6f6b82" }}>{q.description}</p>
                                                    </div>
                                                    <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 10, flexShrink: 0, background: q.completed ? "#dcfce7" : "#fef3c7", color: q.completed ? "#15a34a" : "#b25e09" }}>
                                                        {q.completed ? "✓ Done" : `${q.rewardType === "coins" ? "🪙" : "📦"} ${q.rewardValue}`}
                                                    </span>
                                                </div>
                                                <div style={{ width: "100%", height: 6, borderRadius: 3, background: "#f4f3f9", overflow: "hidden" }}>
                                                    <div style={{ height: "100%", borderRadius: 3, background: q.completed ? "#15a34a" : "#6d28d9", width: `${pct}%`, transition: "width 0.3s" }} />
                                                </div>
                                                <p style={{ margin: "4px 0 0", fontSize: 11, color: "#a3a0b3" }}>{q.progress}/{q.goalCount}</p>
                                            </div>
                                        );
                                    })}
                                </div>}
                            </>
                        )}

                        {/* Guestbook */}
                        {tab === "guestbook" && (
                            <>
                                <h1 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>Guestbook</h1>
                                <p style={{ margin: "0 0 12px", fontSize: 13, color: "#6f6b82" }}>Leave a message in any space's guestbook:</p>
                                <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
                                    <select value={gbSpaceId} style={{ flex: 1, padding: "10px 12px", borderRadius: 11, border: "1.5px solid #e3e1ee", background: "#fff", color: "#191427", fontSize: 14, outline: "none" }}
                                        onChange={e => { setGbSpaceId(e.target.value); if (e.target.value) fetchGuestbook(e.target.value); }}>
                                        <option value="">Select a space…</option>
                                        {allSpaces.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                {gbSpaceId && (
                                    <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                                        <input style={{ flex: 1, padding: "10px 12px", borderRadius: 11, border: "1.5px solid #e3e1ee", background: "#fff", color: "#191427", fontSize: 14, outline: "none" }} placeholder="Write a message (max 200 chars)…" maxLength={200} value={gbMsg} onChange={e => setGbMsg(e.target.value)} onKeyDown={e => { if (e.key === "Enter") handleGuestbookPost(gbSpaceId); }} />
                                        <button onClick={() => handleGuestbookPost(gbSpaceId)} disabled={gbSending || !gbMsg.trim()} style={{ padding: "10px 20px", borderRadius: 11, border: "none", background: "linear-gradient(135deg,#7c3aed,#a78bfa)", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0, boxShadow: "0 4px 12px rgba(124,58,237,.25)" }}>{gbSending ? "…" : "Post"}</button>
                                    </div>
                                )}
                                {gbError && <p style={{ color: "#dc2626", fontSize: 13, marginBottom: 12, padding: "8px 12px", background: "#fee2e2", borderRadius: 8 }}>{gbError}</p>}
                                {!gbSpaceId ? <EmptyState icon="📝" title="Pick a space above" sub="Select a space from the dropdown to read and write guestbook messages." />
                                : guestbookLoading ? <p style={{ color: "#6f6b82" }}>Loading messages…</p>
                                : guestbook.length === 0 ? <EmptyState icon="✍️" title="No messages yet" sub="Be the first to leave a message in this space!" />
                                : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {guestbook.map(entry => (
                                        <div key={entry.id} style={{ padding: "12px 14px", borderRadius: 10, border: "1px solid #ecebf3", background: "#fff" }}>
                                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                                                <span style={{ fontWeight: 700, fontSize: 13, color: "#6d28d9", cursor: "pointer" }} onClick={() => navigate(`/profile/${entry.userId}`)}>{entry.username}</span>
                                                <span style={{ fontSize: 11, color: "#a3a0b3" }}>{new Date(entry.createdAt).toLocaleDateString()}</span>
                                            </div>
                                            <p style={{ margin: 0, fontSize: 13, color: "#4d495f" }}>{entry.message}</p>
                                        </div>
                                    ))}
                                </div>}
                            </>
                        )}

                        {/* Neighbourhood */}
                        {tab === "neighbourhood" && (
                            <>
                                <h1 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>Neighbourhood</h1>
                                {loadingNeighbourhood ? <p style={{ color: "#6f6b82" }}>Loading…</p>
                                : !neighbourhood ? <EmptyState icon="👥" title="No neighbourhood yet" sub="Neighbourhoods form as you connect with other players. Start exploring spaces!" />
                                : <>
                                    <p style={{ margin: "0 0 16px", fontSize: 13, color: "#6f6b82" }}>{neighbourhood.name}</p>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                        {(neighbourhood.members ?? []).map(m => (
                                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 10, border: "1px solid #ecebf3", background: "#fff" }}>
                                                <div style={{ width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(140deg,#6366f1,#8b5cf6)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0 }}>{(m.username?.[0] ?? "?").toUpperCase()}</div>
                                                <span style={{ fontSize: 14, fontWeight: 600, color: "#191427", cursor: "pointer" }} onClick={() => navigate(`/profile/${m.id}`)}>{m.username}</span>
                                            </div>
                                        ))}
                                    </div>
                                </>}
                            </>
                        )}

                        {/* Creator */}
                        {tab === "creator" && (
                            <>
                                <h1 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 750, color: "#191427", letterSpacing: "-0.03em" }}>Creator Studio</h1>
                                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "60px 24px", border: "1.5px dashed #d4d0e6", borderRadius: 16, background: "#fbfaff" }}>
                                    <div style={{ fontSize: 64, marginBottom: 20 }}>🎨</div>
                                    <h3 style={{ margin: "0 0 12px", fontSize: 22, fontWeight: 700, color: "#191427" }}>Coming Soon</h3>
                                    <p style={{ margin: "0 0 32px", fontSize: 14, color: "#6f6b82", maxWidth: 360, lineHeight: 1.6 }}>Upload custom tile sets, design items, and submit them for the community to use.</p>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, width: "100%", maxWidth: 320 }}>
                                        {["🖼️ Custom tile sprites", "🧩 Item design tools", "🏪 Publish to the shop", "💰 Earn coins from sales"].map(f => (
                                            <div key={f} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 10, background: "#fff", border: "1px solid #ecebf3", fontSize: 13, color: "#6f6b82", fontWeight: 500 }}>{f}</div>
                                        ))}
                                    </div>
                                </div>
                            </>
                        )}

                    </div>
                </div>
            </div>

            {/* ── Delete Space confirmation dialog ── */}
            {deleteTarget && (
                <>
                    <div style={{ position: "fixed", inset: 0, background: "rgba(20,15,40,0.4)", backdropFilter: "blur(3px)", zIndex: 1199 }} onClick={() => !deletingSpace && setDeleteTarget(null)} />
                    <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "#fff", border: "1px solid #ecebf3", borderRadius: 14, padding: "28px 28px 24px", width: 360, zIndex: 1200, boxShadow: "0 24px 60px rgba(22,15,52,0.22)" }}>
                        <p style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: "#191427" }}>Delete Space</p>
                        <p style={{ margin: "0 0 24px", fontSize: 13, color: "#6f6b82", lineHeight: 1.5 }}>
                            Are you sure you want to delete <strong>{deleteTarget.name}</strong>? This cannot be undone.
                        </p>
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                            <button
                                onClick={() => handleDeleteSpace(deleteTarget)}
                                disabled={deletingSpace}
                                style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: "#dc2626", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer", opacity: deletingSpace ? 0.7 : 1 }}
                            >
                                {deletingSpace ? "Deleting…" : "Delete"}
                            </button>
                            <button
                                onClick={() => setDeleteTarget(null)}
                                disabled={deletingSpace}
                                style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid #ecebf3", background: "#fff", color: "#6f6b82", fontSize: 13, cursor: "pointer" }}
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
