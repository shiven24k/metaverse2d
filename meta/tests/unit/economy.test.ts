/**
 * Tests for economy/chest interaction logic.
 * Covers: cooldown calculation, coin range, TOCTOU race window documentation.
 */
import { describe, it, expect } from 'vitest';

// ── Cooldown logic (replicated from economy.ts lines 35-40) ──────────────────
function isCooldownActive(lastAt: Date, nowMs = Date.now()): { active: boolean; minLeft?: number } {
    const cooldownEnd = new Date(lastAt.getTime() + 60 * 60 * 1000); // 1 hour
    if (nowMs < cooldownEnd.getTime()) {
        const minLeft = Math.ceil((cooldownEnd.getTime() - nowMs) / 60_000);
        return { active: true, minLeft };
    }
    return { active: false };
}

// ── Coin range logic (replicated from economy.ts line 43) ────────────────────
function rollCoins(): number {
    return Math.floor(Math.random() * 16) + 10; // 10–25
}

describe('chest cooldown', () => {
    it('cooldown is active immediately after interaction', () => {
        const lastAt = new Date();
        const result = isCooldownActive(lastAt);
        expect(result.active).toBe(true);
        expect(result.minLeft).toBeGreaterThan(59);
        expect(result.minLeft).toBeLessThanOrEqual(60);
    });

    it('cooldown is active 59 minutes later', () => {
        const lastAt = new Date(Date.now() - 59 * 60 * 1000);
        const result = isCooldownActive(lastAt);
        expect(result.active).toBe(true);
        expect(result.minLeft).toBe(1);
    });

    it('cooldown is inactive exactly 1 hour later', () => {
        const lastAt = new Date(Date.now() - 60 * 60 * 1000);
        const result = isCooldownActive(lastAt);
        expect(result.active).toBe(false);
    });

    it('cooldown is inactive more than 1 hour later', () => {
        const lastAt = new Date(Date.now() - 90 * 60 * 1000);
        expect(isCooldownActive(lastAt).active).toBe(false);
    });

    it('returns correct minLeft at 30 minutes remaining', () => {
        const lastAt = new Date(Date.now() - 30 * 60 * 1000);
        const result = isCooldownActive(lastAt);
        expect(result.active).toBe(true);
        expect(result.minLeft).toBe(30);
    });
});

describe('coin roll range', () => {
    it('coins are always between 10 and 25 inclusive', () => {
        for (let i = 0; i < 1000; i++) {
            const coins = rollCoins();
            expect(coins).toBeGreaterThanOrEqual(10);
            expect(coins).toBeLessThanOrEqual(25);
        }
    });

    it('coins are always integers', () => {
        for (let i = 0; i < 100; i++) {
            expect(Number.isInteger(rollCoins())).toBe(true);
        }
    });
});

describe('TOCTOU race condition (documented)', () => {
    /**
     * BUG: The cooldown check (economy.ts:30-41) reads `chestInteraction`
     * outside the transaction. Two concurrent requests that arrive when the
     * cooldown is just expiring will BOTH read `existing.lastAt` showing
     * the cooldown expired, BOTH pass the guard, and BOTH execute the
     * transaction → double coins awarded, cooldown reset twice.
     *
     * Fix: move the findUnique + cooldown check INSIDE the $transaction,
     * or use a SELECT ... FOR UPDATE / serializable isolation.
     */
    it('documents the race: two concurrent checks on expired cooldown both see active=false', () => {
        const lastAt = new Date(Date.now() - 61 * 60 * 1000); // 61 min ago, expired

        // Both concurrent requests read the same stale `lastAt`
        const check1 = isCooldownActive(lastAt);
        const check2 = isCooldownActive(lastAt);

        // Both pass — double-claim is possible
        expect(check1.active).toBe(false);
        expect(check2.active).toBe(false);
        // → both will proceed to upsert + wallet increment
    });
});
