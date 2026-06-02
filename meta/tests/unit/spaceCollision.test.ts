/**
 * Tests for space collision detection (AABB overlap check used across
 * POST /space/element, POST /space/place, and their batch equivalents).
 */
import { describe, it, expect } from 'vitest';

// Replicate the AABB overlap check used in space.ts
function overlaps(
    ax: number, ay: number, aw: number, ah: number,
    bx: number, by: number, bw: number, bh: number,
): boolean {
    return ax < bx + bw && ax + aw > bx &&
           ay < by + bh && ay + ah > by;
}

// Replicate boundary check from space.ts
function isOutOfBounds(x: number, y: number, w: number, h: number, spaceW: number, spaceH: number): boolean {
    return x < 0 || y < 0 || x + w > spaceW || y + h > spaceH;
}

describe('AABB overlap detection', () => {
    it('detects direct overlap (same position)', () =>
        expect(overlaps(0, 0, 2, 2, 0, 0, 2, 2)).toBe(true));

    it('detects partial overlap (shifted right by 1)', () =>
        expect(overlaps(0, 0, 2, 2, 1, 0, 2, 2)).toBe(true));

    it('detects partial overlap (shifted diagonally)', () =>
        expect(overlaps(0, 0, 2, 2, 1, 1, 2, 2)).toBe(true));

    it('no overlap when A is directly to the right of B', () =>
        expect(overlaps(0, 0, 2, 2, 2, 0, 2, 2)).toBe(false)); // touching but not overlapping

    it('no overlap when A is directly below B', () =>
        expect(overlaps(0, 0, 2, 2, 0, 2, 2, 2)).toBe(false));

    it('no overlap when far apart', () =>
        expect(overlaps(0, 0, 1, 1, 10, 10, 1, 1)).toBe(false));

    it('1×1 tiles adjacent do not overlap', () =>
        expect(overlaps(3, 3, 1, 1, 4, 3, 1, 1)).toBe(false));

    it('1×1 tiles at same position overlap', () =>
        expect(overlaps(3, 3, 1, 1, 3, 3, 1, 1)).toBe(true));

    it('2×1 item overlaps 1×2 item when crossing corner', () =>
        expect(overlaps(0, 0, 2, 1, 1, 0, 1, 2)).toBe(true));
});

describe('space boundary check', () => {
    const W = 20, H = 20;

    it('1×1 at (0,0) is in bounds',          () => expect(isOutOfBounds(0, 0, 1, 1, W, H)).toBe(false));
    it('1×1 at (19,19) is in bounds',         () => expect(isOutOfBounds(19, 19, 1, 1, W, H)).toBe(false));
    it('2×2 at (18,18) is in bounds',         () => expect(isOutOfBounds(18, 18, 2, 2, W, H)).toBe(false));
    it('2×2 at (19,19) is out of bounds',     () => expect(isOutOfBounds(19, 19, 2, 2, W, H)).toBe(true));
    it('1×1 at (-1,0) is out of bounds',      () => expect(isOutOfBounds(-1, 0, 1, 1, W, H)).toBe(true));
    it('1×1 at (0,-1) is out of bounds',      () => expect(isOutOfBounds(0, -1, 1, 1, W, H)).toBe(true));
    it('1×1 at (20,0) is out of bounds',      () => expect(isOutOfBounds(20, 0, 1, 1, W, H)).toBe(true));
    it('1×1 at (0,20) is out of bounds',      () => expect(isOutOfBounds(0, 20, 1, 1, W, H)).toBe(true));

    it('places element at last valid column (x=19, w=1)', () =>
        expect(isOutOfBounds(19, 5, 1, 1, W, H)).toBe(false));

    it('rejects element 1 past the edge (x=19, w=2)', () =>
        expect(isOutOfBounds(19, 5, 2, 1, W, H)).toBe(true));
});

describe('batch element placement — within-batch collision tracking', () => {
    // Simulates the batch loop from spaceRouter POST /element/batch
    function batchPlace(
        existing: { x: number; y: number; w: number; h: number }[],
        toAdd: { x: number; y: number; w: number; h: number }[],
        spaceW: number, spaceH: number,
    ): { x: number; y: number; w: number; h: number }[] {
        const placed: { x: number; y: number; w: number; h: number }[] = [];
        const running = [...existing];

        for (const el of toAdd) {
            if (isOutOfBounds(el.x, el.y, el.w, el.h, spaceW, spaceH)) continue;
            const collides = running.some(r => overlaps(el.x, el.y, el.w, el.h, r.x, r.y, r.w, r.h));
            if (collides) continue;
            placed.push(el);
            running.push(el); // track newly placed elements for later iterations
        }
        return placed;
    }

    it('places non-overlapping elements in a batch', () => {
        const result = batchPlace([], [
            { x: 0, y: 0, w: 1, h: 1 },
            { x: 2, y: 0, w: 1, h: 1 },
        ], 20, 20);
        expect(result).toHaveLength(2);
    });

    it('skips second element when it overlaps the first in the same batch', () => {
        const result = batchPlace([], [
            { x: 0, y: 0, w: 2, h: 2 },
            { x: 1, y: 1, w: 2, h: 2 }, // overlaps the first
        ], 20, 20);
        expect(result).toHaveLength(1);
        expect(result[0].x).toBe(0);
    });

    it('skips elements out of bounds', () => {
        const result = batchPlace([], [
            { x: 19, y: 19, w: 2, h: 2 }, // out of bounds (20×20 space)
        ], 20, 20);
        expect(result).toHaveLength(0);
    });

    it('existing elements block new placements', () => {
        const existing = [{ x: 5, y: 5, w: 2, h: 2 }];
        const result = batchPlace(existing, [
            { x: 5, y: 5, w: 1, h: 1 }, // overlaps existing
        ], 20, 20);
        expect(result).toHaveLength(0);
    });
});
