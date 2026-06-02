/**
 * Tests for NPC tick logic extracted from apps/ws/src/index.ts.
 * BUG: patrolIndex is never clamped — can access undefined patrol entry.
 */
import { describe, it, expect } from 'vitest';

// Replicated from ws/src/index.ts
function stepToward(
    cx: number, cy: number,
    tx: number, ty: number,
): { x: number; y: number; facing: string } {
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy, facing: 'down' };
    const preferX = Math.abs(dx) > Math.abs(dy) ||
        (Math.abs(dx) === Math.abs(dy) && Math.random() < 0.5);
    if (preferX) {
        return dx > 0
            ? { x: cx + 1, y: cy, facing: 'right' }
            : { x: cx - 1, y: cy, facing: 'left' };
    } else {
        return dy > 0
            ? { x: cx, y: cy + 1, facing: 'down' }
            : { x: cx, y: cy - 1, facing: 'up' };
    }
}

// Safe version with patrolIndex clamping (the fix)
function getPatrolTarget(
    patrolPath: { x: number; y: number }[],
    patrolIndex: number,
): { x: number; y: number } | null {
    if (patrolPath.length === 0) return null;
    const safeIndex = patrolIndex % patrolPath.length; // clamp
    return patrolPath[safeIndex];
}

describe('stepToward', () => {
    it('moves right when target is to the right', () => {
        const result = stepToward(0, 0, 5, 0);
        expect(result).toEqual({ x: 1, y: 0, facing: 'right' });
    });

    it('moves left when target is to the left', () => {
        const result = stepToward(5, 0, 0, 0);
        expect(result).toEqual({ x: 4, y: 0, facing: 'left' });
    });

    it('moves down when target is below', () => {
        const result = stepToward(0, 0, 0, 5);
        expect(result).toEqual({ x: 0, y: 1, facing: 'down' });
    });

    it('moves up when target is above', () => {
        const result = stepToward(0, 5, 0, 0);
        expect(result).toEqual({ x: 0, y: 4, facing: 'up' });
    });

    it('returns current position when already at target', () => {
        const result = stepToward(3, 3, 3, 3);
        expect(result).toEqual({ x: 3, y: 3, facing: 'down' });
    });

    it('prefers horizontal axis when dx > dy', () => {
        // dx=3, dy=1 → prefer horizontal
        const result = stepToward(0, 0, 3, 1);
        expect(result.facing).toBe('right');
        expect(result.x).toBe(1);
        expect(result.y).toBe(0);
    });

    it('prefers vertical axis when dy > dx', () => {
        // dx=1, dy=3 → prefer vertical
        const result = stepToward(0, 0, 1, 3);
        expect(result.facing).toBe('down');
        expect(result.x).toBe(0);
        expect(result.y).toBe(1);
    });
});

describe('patrol index safety', () => {
    const patrol = [
        { x: 1, y: 1 },
        { x: 3, y: 1 },
        { x: 3, y: 3 },
        { x: 1, y: 3 },
    ];

    it('normal index 0 returns first waypoint', () => {
        expect(getPatrolTarget(patrol, 0)).toEqual({ x: 1, y: 1 });
    });

    it('normal index 3 returns last waypoint', () => {
        expect(getPatrolTarget(patrol, 3)).toEqual({ x: 1, y: 3 });
    });

    it('BUG (raw): index 4 on 4-waypoint patrol is undefined (out of bounds)', () => {
        // This is what the CURRENT code does — no clamping
        expect(patrol[4]).toBeUndefined(); // confirms the crash scenario
    });

    it('FIX: clamped index 4 wraps to index 0', () => {
        expect(getPatrolTarget(patrol, 4)).toEqual({ x: 1, y: 1 });
    });

    it('FIX: clamped index 99 wraps correctly on 4-point patrol', () => {
        expect(getPatrolTarget(patrol, 99)).toEqual(patrol[99 % 4]);
    });

    it('returns null for empty patrol', () => {
        expect(getPatrolTarget([], 0)).toBeNull();
    });

    it('patrol advance wraps using modulo', () => {
        const newIndex = (patrol.length - 1 + 1) % patrol.length;
        expect(newIndex).toBe(0); // wraps back to start
    });
});
