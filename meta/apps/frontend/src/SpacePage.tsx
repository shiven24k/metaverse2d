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

type Tab = "all" | "mine" | "create" | "shop" | "collection" | "neighbourhood" | "creator";

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

interface MapTemplate {
    id: string;
    name: string;
    thumbnail: string;
    dimensions: string;
}

export default function SpacePage() {
    const navigate = useNavigate();
    const bearerToken = useAuthStore((s) => s.token);
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
    const [giftStatus, setGiftStatus] = useState<{ claimed: boolean; nextClaimAt: string | null }>({ claimed: false, nextClaimAt: null });
    const [claiming, setClaiming] = useState(false);
    const [claimResult, setClaimResult] = useState("");
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

    const [uploading, setUploading] = useState(false);
    const [uploadedUrl, setUploadedUrl] = useState("");
    const [uploadError, setUploadError] = useState("");
    const [userRole, setUserRole] = useState<string | null>(null);
    const [newItemName, setNewItemName] = useState("");
    const [newItemCategory, setNewItemCategory] = useState("Furniture");
    const [newItemRarity, setNewItemRarity] = useState("Common");
    const [newItemWidth, setNewItemWidth] = useState(1);
    const [newItemHeight, setNewItemHeight] = useState(1);
    const [creatingItem, setCreatingItem] = useState(false);
    const [createItemMsg, setCreateItemMsg] = useState("");

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
            if (res.ok) {
                const data = await res.json();
                setSeason(data.season);
            }
        } catch {}
    }, []);

    const fetchCollection = useCallback(async () => {
        setLoadingCollection(true);
        try {
            const res = await fetch(`${API}/api/v1/collection`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setCollection(data.collection ?? []);
            }
        } catch {} finally {
            setLoadingCollection(false);
        }
    }, [bearerToken]);

    const fetchUserRole = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/user/me`, { headers: authHeaders });
            if (res.ok) {
                const data = await res.json();
                setUserRole(data.user?.role ?? null);
            }
        } catch {}
    }, [bearerToken]);

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setUploadError("");
        setUploadedUrl("");
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await fetch(`${API}/api/v1/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${bearerToken}` },
                body: formData,
            });
            const data = await res.json();
            if (res.ok) {
                setUploadedUrl(`${API}${data.url}`);
            } else {
                setUploadError(data.message ?? "Upload failed");
            }
        } catch {
            setUploadError("Upload failed");
        } finally {
            setUploading(false);
        }
    };

    const handleCreateItem = async () => {
        if (!uploadedUrl || !newItemName) return;
        setCreatingItem(true);
        setCreateItemMsg("");
        try {
            const res = await fetch(`${API}/api/v1/admin/item`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({
                    name: newItemName,
                    category: newItemCategory,
                    rarity: newItemRarity,
                    imageUrl: uploadedUrl,
                    width: newItemWidth,
                    height: newItemHeight,
                }),
            });
            const data = await res.json();
            if (res.ok) {
                setCreateItemMsg(`Item "${newItemName}" created!`);
                setNewItemName("");
                setUploadedUrl("");
            } else {
                setCreateItemMsg(data.message ?? "Failed");
            }
        } catch {
            setCreateItemMsg("Failed to create item");
        } finally {
            setCreatingItem(false);
        }
    };

    const fetchMaps = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/maps`);
            if (res.ok) {
                const data = await res.json();
                setMapTemplates(data.maps ?? []);
            }
        } catch {}
    }, []);

    const fetchNeighbourhood = useCallback(async () => {
        setLoadingNeighbourhood(true);
        try {
            const res = await fetch(`${API}/api/v1/neighbourhood`, { headers: authHeaders });
            if (res.ok) {
                setNeighbourhood(await res.json());
            }
        } catch {} finally {
            setLoadingNeighbourhood(false);
        }
    }, [bearerToken]);

    const fetchShop = useCallback(async () => {
        try {
            const res = await fetch(`${API}/api/v1/shop/daily`);
            if (res.ok) {
                const data = await res.json();
                setShopItems(data.items ?? []);
            }
        } catch {}
    }, []);

    const fetchAllSpaces = async () => {
        setLoadingAll(true);
        try {
            const res = await fetch(`${API}/api/v1/space/public`);
            const data = await res.json();
            setAllSpaces(data.spaces ?? []);
        } catch {
        } finally {
            setLoadingAll(false);
        }
    };

    const fetchMySpaces = async () => {
        setLoadingMine(true);
        try {
            const res = await fetch(`${API}/api/v1/space/all`, {
                credentials: "include",
                headers: authHeaders,
            });
            const data = await res.json();
            setMySpaces(data.spaces ?? []);
        } catch {
        } finally {
            setLoadingMine(false);
        }
    };

    useEffect(() => {
        fetchAllSpaces();
        fetchMySpaces();
        fetchWallet();
        fetchGiftStatus();
        fetchShop();
        fetchSeason();
        fetchMaps();
        fetchUserRole();
    }, []);

    useEffect(() => {
        if (tab === "collection") fetchCollection();
        if (tab === "neighbourhood") fetchNeighbourhood();
    }, [tab]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setCreateSuccess("");
        setCreating(true);
        try {
            const res = await fetch(`${API}/api/v1/space`, {
                method: "POST",
                credentials: "include",
                headers: authHeaders,
                body: JSON.stringify({
                    name: newSpaceName,
                    dimensions: newSpaceDims,
                    mapId: selectedMap?.id,
                }),
            });
            if (!res.ok) {
                const d = await res.json();
                setError(d.message ?? "Failed to create space");
                return;
            }
            setNewSpaceName("");
            setSelectedMap(null);
            setCreateSuccess(`Space "${newSpaceName}" created!`);
            await Promise.all([fetchAllSpaces(), fetchMySpaces()]);
            setTab("mine");
        } catch {
            setError("Failed to create space");
        } finally {
            setCreating(false);
        }
    };

    const handleClaimGift = async () => {
        setClaiming(true);
        setClaimResult("");
        try {
            const res = await fetch(`${API}/api/v1/gift/claim`, {
                method: "POST",
                headers: authHeaders,
            });
            if (res.ok) {
                const data = await res.json();
                setClaimResult(`Claimed! +${data.coins} coins${data.item ? ` + ${data.item.name}` : ""}`);
                fetchWallet();
                fetchGiftStatus();
            } else {
                const d = await res.json();
                setClaimResult(d.message ?? "Failed");
            }
        } catch {
            setClaimResult("Failed to claim");
        } finally {
            setClaiming(false);
        }
    };

    const handleBuy = async (itemId: string) => {
        setBuyingId(itemId);
        setBuyMsg("");
        try {
            const res = await fetch(`${API}/api/v1/shop/buy`, {
                method: "POST",
                headers: authHeaders,
                body: JSON.stringify({ itemId }),
            });
            const data = await res.json();
            if (res.ok) {
                setBuyMsg(`Purchased!`);
                fetchWallet();
            } else {
                setBuyMsg(data.message ?? "Failed");
            }
        } catch {
            setBuyMsg("Failed to buy");
        } finally {
            setBuyingId(null);
        }
    };

    const handleSignOut = async () => {
        await fetch(`${API}/api/auth/sign-out`, {
            method: "POST",
            credentials: "include",
        });
        clearAuth();
        navigate("/login", { replace: true });
    };

    const SpaceCard = ({ space }: { space: Space }) => (
        <div style={styles.spaceItem}>
            <div>
                <p style={styles.spaceName}>{space.name}</p>
                <p style={styles.spaceMeta}>
                    {space.dimensions}
                    {space.createdBy && <span> · by {space.createdBy}</span>}
                </p>
            </div>
            <button style={styles.joinBtn} onClick={() => navigate(`/arena?spaceId=${space.id}`)}>
                Join →
            </button>
        </div>
    );

    const rarityPrice = (r: string) => r === "Common" ? 50 : r === "Uncommon" ? 150 : r === "Rare" ? 500 : 100;

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
                    <h1 style={styles.title}>Metaverse 2D</h1>
                    {wallet && (
                        <span style={{ fontSize: 14, color: "#555", fontWeight: 600 }}>
                            🪙 {wallet.coins}
                        </span>
                    )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <button
                            onClick={handleClaimGift}
                            disabled={claiming || giftStatus.claimed}
                            style={{
                                ...styles.giftBtn,
                                opacity: giftStatus.claimed ? 0.5 : 1,
                                cursor: giftStatus.claimed ? "not-allowed" : "pointer",
                            }}
                        >
                            {claiming ? "..." : giftStatus.claimed ? "🎁 Claimed" : "🎁 Daily Gift"}
                        </button>
                    </div>
                    <button style={styles.signOutBtn} onClick={handleSignOut}>
                        Sign Out
                    </button>
                </div>
            </div>
            {claimResult && (
                <div style={{ padding: "8px 32px", background: "#f0fdf4", color: "#059669", fontSize: 13, textAlign: "center" }}>
                    {claimResult}
                </div>
            )}

            {season && (
                <div style={{ background: "linear-gradient(135deg, #1a1a2e, #16213e)", padding: "12px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", color: "#fff" }}>
                    <div>
                        <span style={{ fontSize: 12, opacity: 0.7 }}>Season</span>
                        <span style={{ marginLeft: 8, fontWeight: 700, fontSize: 15 }}>{season.name}</span>
                        <span style={{ marginLeft: 12, fontSize: 12, opacity: 0.7 }}>{season.theme}</span>
                    </div>
                    <span style={{ fontSize: 13, opacity: 0.8 }}>{season.daysRemaining} day{season.daysRemaining !== 1 ? "s" : ""} remaining</span>
                </div>
            )}

            <div style={styles.tabBar}>
                <div style={styles.tabGroup}>
                    {(["all", "mine", "create", "shop", "collection", "neighbourhood", "creator"] as Tab[]).map((t) => (
                        <button
                            key={t}
                            style={{ ...styles.tabBtn, ...(tab === t ? styles.tabBtnActive : {}) }}
                            onClick={() => { setTab(t); setError(""); setCreateSuccess(""); setBuyMsg(""); setSelectedMap(null); }}
                        >
                            {t === "all" ? "All Spaces" : t === "mine" ? "My Spaces" : t === "create" ? "Create" : t === "shop" ? "Shop" : t === "collection" ? "Collection" : t === "neighbourhood" ? "Neighbourhood" : "Creator"}
                        </button>
                    ))}
                </div>
            </div>

            <div style={styles.content}>
                {tab === "all" && (
                    <div style={styles.card}>
                        <h2 style={styles.cardTitle}>All Spaces</h2>
                        {loadingAll ? (
                            <p style={styles.muted}>Loading...</p>
                        ) : allSpaces.length === 0 ? (
                            <p style={styles.muted}>No spaces yet. Be the first to create one!</p>
                        ) : (
                            <div style={styles.spaceList}>
                                {allSpaces.map((s) => <SpaceCard key={s.id} space={s} />)}
                            </div>
                        )}
                    </div>
                )}

                {tab === "mine" && (
                    <div style={styles.card}>
                        <h2 style={styles.cardTitle}>My Spaces</h2>
                        {loadingMine ? (
                            <p style={styles.muted}>Loading...</p>
                        ) : mySpaces.length === 0 ? (
                            <p style={styles.muted}>You haven't created any spaces yet.</p>
                        ) : (
                            <div style={styles.spaceList}>
                                {mySpaces.map((s) => <SpaceCard key={s.id} space={s} />)}
                            </div>
                        )}
                    </div>
                )}

                {tab === "create" && (
                    <div style={styles.card}>
                        <h2 style={styles.cardTitle}>Create a Space</h2>

                        {mapTemplates.length > 0 && (
                            <>
                                <p style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>Pick a map template (optional):</p>
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
                                    <div
                                        onClick={() => { setSelectedMap(null); setNewSpaceDims("20x20"); }}
                                        style={{
                                            padding: 12,
                                            borderRadius: 10,
                                            border: `2px solid ${!selectedMap ? "#4f46e5" : "#e5e7eb"}`,
                                            background: !selectedMap ? "#eef2ff" : "#fafafa",
                                            textAlign: "center",
                                            cursor: "pointer",
                                            transition: "all 0.15s",
                                        }}
                                    >
                                        <div style={{ fontSize: 28, marginBottom: 4 }}>🟦</div>
                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#333" }}>Blank</p>
                                        <p style={{ margin: "2px 0 0", fontSize: 10, color: "#888" }}>Custom size</p>
                                    </div>
                                    {mapTemplates.map((tmpl) => {
                                        const isSelected = selectedMap?.id === tmpl.id;
                                        const dims = tmpl.dimensions.split("x");
                                        return (
                                            <div
                                                key={tmpl.id}
                                                onClick={() => { setSelectedMap(tmpl); setNewSpaceDims(tmpl.dimensions); }}
                                                style={{
                                                    padding: 12,
                                                    borderRadius: 10,
                                                    border: `2px solid ${isSelected ? "#4f46e5" : "#e5e7eb"}`,
                                                    background: isSelected ? "#eef2ff" : "#fafafa",
                                                    textAlign: "center",
                                                    cursor: "pointer",
                                                    transition: "all 0.15s",
                                                }}
                                            >
                                                <div style={{
                                                    width: "100%",
                                                    height: 50,
                                                    background: "#e5e7eb",
                                                    borderRadius: 6,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: 22,
                                                    color: "#999",
                                                    marginBottom: 6,
                                                }}>
                                                    🗺️
                                                </div>
                                                <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#333" }}>{tmpl.name}</p>
                                                <p style={{ margin: "2px 0 0", fontSize: 10, color: "#888" }}>{dims[0]} × {dims[1]}</p>
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}

                        <form onSubmit={handleCreate} style={styles.form}>
                            <div style={styles.field}>
                                <label style={styles.label}>Space Name</label>
                                <input
                                    style={styles.input}
                                    type="text"
                                    placeholder="My awesome space"
                                    value={newSpaceName}
                                    onChange={(e) => setNewSpaceName(e.target.value)}
                                    required
                                />
                            </div>
                            <div style={styles.field}>
                                <label style={styles.label}>Dimensions</label>
                                <select
                                    style={styles.input}
                                    value={newSpaceDims}
                                    onChange={(e) => setNewSpaceDims(e.target.value)}
                                    disabled={!!selectedMap}
                                >
                                    <option value="10x10">10 × 10 (small)</option>
                                    <option value="20x20">20 × 20 (medium)</option>
                                    <option value="30x30">30 × 30 (large)</option>
                                    <option value="50x50">50 × 50 (huge)</option>
                                </select>
                                {selectedMap && <span style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Dimensions set by map template</span>}
                            </div>
                            {error && <p style={styles.error}>{error}</p>}
                            {createSuccess && <p style={styles.success}>{createSuccess}</p>}
                            <button style={styles.button} type="submit" disabled={creating}>
                                {creating ? "Creating..." : "Create Space"}
                            </button>
                        </form>
                    </div>
                )}

                {tab === "shop" && (
                    <div style={styles.card}>
                        <h2 style={styles.cardTitle}>Daily Shop</h2>
                        {buyMsg && (
                            <p style={{ ...styles.success, marginBottom: 12 }}>{buyMsg}</p>
                        )}
                        {shopItems.length === 0 ? (
                            <p style={styles.muted}>No items in the shop today.</p>
                        ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
                                {shopItems.map((item) => (
                                    <div key={item.id} style={styles.shopItem}>
                                        <div style={{
                                            width: "100%",
                                            height: 80,
                                            background: "#f3f4f6",
                                            borderRadius: 8,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 24,
                                            color: "#999",
                                        }}>
                                            📦
                                        </div>
                                        <p style={{ margin: "8px 0 2px", fontWeight: 600, fontSize: 14 }}>{item.name}</p>
                                        <p style={{ margin: 0, fontSize: 12, color: "#888" }}>{item.rarity}</p>
                                        <p style={{ margin: "4px 0", fontSize: 13, fontWeight: 600, color: "#b45309" }}>
                                            🪙 {rarityPrice(item.rarity)}
                                        </p>
                                        <button
                                            onClick={() => handleBuy(item.id)}
                                            disabled={buyingId === item.id}
                                            style={styles.buyBtn}
                                        >
                                            {buyingId === item.id ? "..." : "Buy"}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {tab === "collection" && (
                    <div style={styles.card}>
                        <h2 style={styles.cardTitle}>Collection Book</h2>
                        {loadingCollection ? (
                            <p style={styles.muted}>Loading...</p>
                        ) : collection.length === 0 ? (
                            <p style={styles.muted}>No items exist yet.</p>
                        ) : (
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                                {collection.map((item) => (
                                    <div key={item.id} style={{
                                        padding: 12,
                                        borderRadius: 10,
                                        border: `1px solid ${item.owned ? "#d1d5db" : "#e5e7eb"}`,
                                        background: item.owned ? "#fafafa" : "#f9f9f9",
                                        textAlign: "center",
                                        opacity: item.owned ? 1 : 0.4,
                                        transition: "opacity 0.15s",
                                    }}>
                                        <div style={{
                                            width: "100%",
                                            height: 60,
                                            background: "#f3f4f6",
                                            borderRadius: 6,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontSize: 20,
                                            color: "#999",
                                            marginBottom: 6,
                                        }}>
                                            📦
                                        </div>
                                        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#333" }}>{item.name}</p>
                                        <p style={{ margin: "2px 0 0", fontSize: 10, color: "#888" }}>{item.rarity}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {tab === "neighbourhood" && (
                    <div style={styles.card}>
                        <h2 style={styles.cardTitle}>Neighbourhood</h2>
                        {loadingNeighbourhood ? (
                            <p style={styles.muted}>Loading...</p>
                        ) : neighbourhood ? (
                            <>
                                <p style={{ fontSize: 13, color: "#888", marginBottom: 16 }}>{neighbourhood.name}</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {neighbourhood.members.map((m) => (
                                        <div key={m.id} style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 10,
                                            padding: "10px 14px",
                                            borderRadius: 8,
                                            border: "1px solid #e5e7eb",
                                            background: "#fafafa",
                                        }}>
                                            <div style={{
                                                width: 32,
                                                height: 32,
                                                borderRadius: "50%",
                                                background: "#4f46e5",
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                color: "#fff",
                                                fontSize: 12,
                                                fontWeight: 700,
                                            }}>
                                                {m.username?.[0]?.toUpperCase() || "?"}
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: "#333", cursor: "pointer" }} onClick={() => navigate(`/profile/${m.id}`)}>
                                                {m.username}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </>
                        ) : (
                            <p style={styles.muted}>Could not load neighbourhood.</p>
                        )}
                    </div>
                )}

                {tab === "creator" && (
                    <div style={styles.card}>
                        <h2 style={styles.cardTitle}>Creator Studio</h2>

                        <div style={{ marginBottom: 24 }}>
                            <p style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>Upload an image asset:</p>
                            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <input
                                    type="file"
                                    accept=".png,.jpg,.jpeg,.gif,.webp,.svg"
                                    onChange={handleUpload}
                                    disabled={uploading}
                                    style={{ fontSize: 13, flex: 1 }}
                                />
                                {uploading && <span style={{ fontSize: 13, color: "#888" }}>Uploading...</span>}
                            </div>
                            {uploadError && <p style={{ ...styles.error, marginTop: 8 }}>{uploadError}</p>}
                            {uploadedUrl && (
                                <div style={{ marginTop: 10, padding: 10, borderRadius: 8, background: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                                    <p style={{ margin: "0 0 4px", fontSize: 12, color: "#059669", fontWeight: 600 }}>Uploaded!</p>
                                    <p style={{ margin: 0, fontSize: 11, color: "#333", wordBreak: "break-all" }}>{uploadedUrl}</p>
                                </div>
                            )}
                        </div>

                        {userRole === "Admin" && uploadedUrl && (
                            <>
                                <hr style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "0 0 20px" }} />
                                <p style={{ fontSize: 13, color: "#888", marginBottom: 10 }}>Create a new item from uploaded image (Admin):</p>
                                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                                        <div style={styles.field}>
                                            <label style={styles.label}>Name</label>
                                            <input style={styles.input} value={newItemName} onChange={e => setNewItemName(e.target.value)} placeholder="Item name" />
                                        </div>
                                        <div style={styles.field}>
                                            <label style={styles.label}>Category</label>
                                            <select style={styles.input} value={newItemCategory} onChange={e => setNewItemCategory(e.target.value)}>
                                                <option>Furniture</option>
                                                <option>Decoration</option>
                                                <option>Wall</option>
                                                <option>Floor</option>
                                            </select>
                                        </div>
                                        <div style={styles.field}>
                                            <label style={styles.label}>Rarity</label>
                                            <select style={styles.input} value={newItemRarity} onChange={e => setNewItemRarity(e.target.value)}>
                                                <option>Common</option>
                                                <option>Uncommon</option>
                                                <option>Rare</option>
                                                <option>Legacy</option>
                                            </select>
                                        </div>
                                        <div style={{ display: "flex", gap: 8 }}>
                                            <div style={{ ...styles.field, flex: 1 }}>
                                                <label style={styles.label}>W</label>
                                                <input style={styles.input} type="number" min={1} max={10} value={newItemWidth} onChange={e => setNewItemWidth(parseInt(e.target.value) || 1)} />
                                            </div>
                                            <div style={{ ...styles.field, flex: 1 }}>
                                                <label style={styles.label}>H</label>
                                                <input style={styles.input} type="number" min={1} max={10} value={newItemHeight} onChange={e => setNewItemHeight(parseInt(e.target.value) || 1)} />
                                            </div>
                                        </div>
                                    </div>
                                    {createItemMsg && <p style={{ ...styles.success, marginTop: 4 }}>{createItemMsg}</p>}
                                    <button style={styles.button} onClick={handleCreateItem} disabled={creatingItem || !newItemName}>
                                        {creatingItem ? "Creating..." : "Create Item"}
                                    </button>
                                </div>
                            </>
                        )}

                        {userRole !== "Admin" && (
                            <p style={{ fontSize: 13, color: "#888", marginTop: 16 }}>
                                Upload assets and submit them for admin approval. (Coming soon)
                            </p>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        minHeight: "100vh",
        background: "#f0f2f5",
        fontFamily: "system-ui, sans-serif",
    },
    header: {
        background: "#fff",
        padding: "16px 32px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    },
    title: {
        margin: 0,
        fontSize: 22,
        fontWeight: 700,
        color: "#1a1a2e",
    },
    signOutBtn: {
        padding: "6px 14px",
        borderRadius: 6,
        border: "1px solid #d1d5db",
        background: "#fff",
        cursor: "pointer",
        fontSize: 13,
        color: "#333",
    },
    giftBtn: {
        padding: "6px 14px",
        borderRadius: 6,
        border: "1px solid #d1d5db",
        background: "#fff",
        fontSize: 13,
        color: "#333",
    },
    tabBar: {
        background: "#fff",
        borderBottom: "1px solid #e5e7eb",
        padding: "0 32px",
    },
    tabGroup: {
        display: "flex",
        gap: 4,
    },
    tabBtn: {
        padding: "14px 20px",
        border: "none",
        borderBottom: "2px solid transparent",
        background: "none",
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 500,
        color: "#666",
        transition: "all 0.15s",
    },
    tabBtnActive: {
        color: "#4f46e5",
        borderBottomColor: "#4f46e5",
        fontWeight: 600,
    },
    content: {
        maxWidth: 720,
        margin: "32px auto",
        padding: "0 16px",
    },
    card: {
        background: "#fff",
        borderRadius: 12,
        padding: "28px 32px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
    },
    cardTitle: {
        margin: "0 0 20px",
        fontSize: 18,
        fontWeight: 600,
        color: "#1a1a2e",
    },
    form: {
        display: "flex",
        flexDirection: "column",
        gap: 16,
    },
    field: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
    },
    label: {
        fontSize: 13,
        fontWeight: 600,
        color: "#444",
    },
    input: {
        padding: "10px 12px",
        borderRadius: 8,
        border: "1px solid #d1d5db",
        fontSize: 14,
        outline: "none",
        background: "#fff",
    },
    button: {
        padding: "12px",
        borderRadius: 8,
        border: "none",
        background: "#4f46e5",
        color: "#fff",
        fontSize: 14,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 4,
    },
    buyBtn: {
        padding: "6px 16px",
        borderRadius: 6,
        border: "none",
        background: "#4f46e5",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        width: "100%",
    },
    error: {
        color: "#ef4444",
        fontSize: 13,
        margin: 0,
        padding: "8px 12px",
        background: "#fef2f2",
        borderRadius: 6,
    },
    success: {
        color: "#059669",
        fontSize: 13,
        margin: 0,
        padding: "8px 12px",
        background: "#ecfdf5",
        borderRadius: 6,
    },
    muted: {
        color: "#888",
        fontSize: 14,
        margin: 0,
    },
    spaceList: {
        display: "flex",
        flexDirection: "column",
        gap: 10,
    },
    spaceItem: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "14px 16px",
        borderRadius: 8,
        border: "1px solid #e5e7eb",
        background: "#fafafa",
        transition: "border-color 0.15s",
    },
    spaceName: {
        margin: 0,
        fontWeight: 600,
        fontSize: 15,
        color: "#1a1a2e",
    },
    spaceMeta: {
        margin: "3px 0 0",
        fontSize: 12,
        color: "#888",
    },
    joinBtn: {
        padding: "8px 18px",
        borderRadius: 6,
        border: "none",
        background: "#4f46e5",
        color: "#fff",
        fontSize: 13,
        fontWeight: 600,
        cursor: "pointer",
        whiteSpace: "nowrap",
    },
    shopItem: {
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: 16,
        borderRadius: 10,
        border: "1px solid #e5e7eb",
        background: "#fafafa",
        textAlign: "center",
    },
};
