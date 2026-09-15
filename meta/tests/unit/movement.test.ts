/**
 * Tests for WS movement validation logic extracted from User.ts.
 *
 * The server now validates: adjacency (±1), integer coords, and space
 * boundaries — moves to negative coords or beyond width/height are rejected
 * (previously only adjacency was checked, so players could reach x=-1 etc).
 */
import { describe, it, expect } from 'vitest';

// Replicate server-side movement validation from User.ts processMove()
function isValidMove(
    fromX: number, fromY: number,
    toX: number, toY: number,
    width?: number, height?: number,
): boolean {
    if (!Number.isInteger(toX) || !Number.isInteger(toY)) return false;
    if (toX < 0 || toY < 0) return false;
    if (width !== undefined && toX >= width) return false;
    if (height !== undefined && toY >= height) return false;
    const xDisplacement = Math.abs(fromX - toX);
    const yDisplacement = Math.abs(fromY - toY);
    return (
        (xDisplacement === 1 && yDisplacement === 0) ||
        (xDisplacement === 0 && yDisplacement === 1)
    );
}

describe('movement validation (fixed — adjacency + bounds)', () => {
    const W = 20, H = 20;

    it('accepts adjacent right/left/down/up', () => {
        expect(isValidMove(5, 5, 6, 5, W, H)).toBe(true);
        expect(isValidMove(5, 5, 4, 5, W, H)).toBe(true);
        expect(isValidMove(5, 5, 5, 6, W, H)).toBe(true);
        expect(isValidMove(5, 5, 5, 4, W, H)).toBe(true);
    });

    it('rejects diagonal / teleport / same position', () => {
        expect(isValidMove(5, 5, 6, 6, W, H)).toBe(false);
        expect(isValidMove(5, 5, 10, 5, W, H)).toBe(false);
        expect(isValidMove(5, 5, 5, 5, W, H)).toBe(false);
    });

    it('rejects move to x=-1 (lower bound)', () => {
        expect(isValidMove(0, 5, -1, 5, W, H)).toBe(false);
    });

    it('rejects move to y=-1 (lower bound)', () => {
        expect(isValidMove(5, 0, 5, -1, W, H)).toBe(false);
    });

    it('rejects move beyond width (x=20 in a 20-wide space)', () => {
        expect(isValidMove(19, 5, 20, 5, W, H)).toBe(false);
    });

    it('rejects move beyond height (y=20 in a 20-tall space)', () => {
        expect(isValidMove(5, 19, 5, 20, W, H)).toBe(false);
    });

    it('rejects non-integer coords', () => {
        expect(isValidMove(5, 5, 5.5, 5, W, H)).toBe(false);
        expect(isValidMove(5, 5, NaN, 5, W, H)).toBe(false);
    });

    it('accepts move to top-left corner', () => {
        expect(isValidMove(1, 0, 0, 0, W, H)).toBe(true);
    });

    it('accepts move to bottom-right corner', () => {
        expect(isValidMove(18, 19, 19, 19, W, H)).toBe(true);
    });

    it('defensive: without known dimensions, negative moves still rejected', () => {
        expect(isValidMove(0, 5, -1, 5)).toBe(false);
        expect(isValidMove(5, 5, 6, 5)).toBe(true);
    });
});