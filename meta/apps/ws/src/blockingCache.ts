import client from "@repo/db/client";

interface CacheEntry {
    cells: Set<string>;
    fetchedAt: number;
}

const cache = new Map<string, CacheEntry>();
const TTL = 10_000;

export async function getBlockingCells(spaceId: string): Promise<Set<string>> {
    const entry = cache.get(spaceId);
    if (entry && Date.now() - entry.fetchedAt < TTL) return entry.cells;

    const [elements, items] = await Promise.all([
        client.spaceElements.findMany({
            where: { spaceId },
            select: { x: true, y: true, element: { select: { blocking: true, width: true, height: true } } },
        }),
        client.placedItem.findMany({
            where: { spaceId },
            select: { x: true, y: true, item: { select: { blocking: true, width: true, height: true } } },
        }),
    ]);

    const cells = new Set<string>();
    for (const e of elements) {
        if (!e.element.blocking) continue;
        for (let dy = 0; dy < e.element.height; dy++)
            for (let dx = 0; dx < e.element.width; dx++)
                cells.add(`${e.x + dx},${e.y + dy}`);
    }
    for (const p of items) {
        if (!p.item.blocking) continue;
        for (let dy = 0; dy < p.item.height; dy++)
            for (let dx = 0; dx < p.item.width; dx++)
                cells.add(`${p.x + dx},${p.y + dy}`);
    }

    cache.set(spaceId, { cells, fetchedAt: Date.now() });
    return cells;
}

export function invalidateBlockingCache(spaceId: string): void {
    cache.delete(spaceId);
}
