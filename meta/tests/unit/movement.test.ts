/**
 * Tests for WS movement validation logic extracted from User.ts.
 *
 * BUG: The server accepts moves to negative coordinates or beyond space
 *      dimensions — only ±1 displacement is validated, not boundary.
 */
import { describe, it, expect } from 'vitest';

// Replicate server-side movement validation from User.ts (lines 246-264)
function isValidMove(fromX: number, fromY: number, toX: number, toY: number): boolean {
    const xDisplacement = Math.abs(fromX - toX);
    const yDisplacement = Math.abs(fromY - toY);
    return (
        (xDisplacement === 1 && yDisplacement === 0) ||
        (xDisplacement === 0 && yDisplacement === 1)
    );
}

// Boundary-aware version (the fix that should exist)
function isValidMoveWithBounds(
    fromX: number, fromY: number,
    toX: number, toY: number,
    width: number, height: number,
): boolean {
    if (!isValidMove(fromX, fromY, toX, toY)) return false;
    return toX >= 0 && toY >= 0 && toX < width && toY < height;
}

describe('movement validation (current — no bounds check)', () => {
    it('accepts adjacent right', ()   => expect(isValidMove(5, 5, 6, 5)).toBe(true));
    it('accepts adjacent left',  ()   => expect(isValidMove(5, 5, 4, 5)).toBe(true));
    it('accepts adjacent down',  ()   => expect(isValidMove(5, 5, 5, 6)).toBe(true));
    it('accepts adjacent up',    ()   => expect(isValidMove(5, 5, 5, 4)).toBe(true));

    it('rejects diagonal',       ()   => expect(isValidMove(5, 5, 6, 6)).toBe(false));
    it('rejects teleport',       ()   => expect(isValidMove(5, 5, 10, 5)).toBe(false));
    it('rejects same position',  ()   => expect(isValidMove(5, 5, 5, 5)).toBe(false));

    // ── BUG: These pass server validation but result in out-of-bounds position ──
    it('BUG: accepts move to x=-1 (no lower bound check)', () => {
        expect(isValidMove(0, 5, -1, 5)).toBe(true); // server says OK!
    });

    it('BUG: accepts move to y=-1 (no lower bound check)', () => {
        expect(isValidMove(5, 0, 5, -1)).toBe(true); // server says OK!
    });

    it('BUG: accepts move beyond width (no upper bound check)', () => {
        const spaceWidth = 20;
        // player is at the last column (x=19), moves right → x=20 which is out
        expect(isValidMove(19, 5, 20, 5)).toBe(true); // server says OK!
    });

    it('BUG: accepts move beyond height (no upper bound check)', () => {
        expect(isValidMove(5, 19, 5, 20)).toBe(true); // server says OK!
    });
});

describe('movement validation (fixed — with bounds check)', () => {
    const W = 20, H = 20;

    it('accepts valid move within bounds',   () => expect(isValidMoveWithBounds(5, 5, 6, 5, W, H)).toBe(true));
    it('rejects move to x=-1',               () => expect(isValidMoveWithBounds(0, 5, -1, 5, W, H)).toBe(false));
    it('rejects move to y=-1',               () => expect(isValidMoveWithBounds(5, 0, 5, -1, W, H)).toBe(false));
    it('rejects move beyond width',          () => expect(isValidMoveWithBounds(19, 5, 20, 5, W, H)).toBe(false));
    it('rejects move beyond height',         () => expect(isValidMoveWithBounds(5, 19, 5, 20, W, H)).toBe(false));
    it('accepts move to top-left corner',    () => expect(isValidMoveWithBounds(1, 0, 0, 0, W, H)).toBe(true));
    it('accepts move to bottom-right corner',() => expect(isValidMoveWithBounds(18, 19, 19, 19, W, H)).toBe(true));
});
