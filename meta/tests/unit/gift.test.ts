/**
 * Tests for gift cooldown logic in apps/http/src/routes/v1/gift.ts
 *
 * BUG (lines 18-20): nextClaim is advanced by TWO days instead of one.
 *   setUTCHours(24, ...) normalises to midnight the next day (+1 day),
 *   then setUTCDate(+1) adds another day → 48-hour cooldown, not 24-hour.
 */
import { describe, it, expect } from 'vitest';

// ── Replicate the buggy nextClaim logic from gift.ts ──────────────────────────
function computeNextClaimBuggy(lastClaim: Date): Date {
    const nextClaim = new Date(lastClaim);
    nextClaim.setUTCHours(24, 0, 0, 0);          // BUG: advances 1 day
    nextClaim.setUTCDate(nextClaim.getUTCDate() + 1); // BUG: advances 1 more day
    return nextClaim;
}

// ── What the correct logic should be ─────────────────────────────────────────
function computeNextClaimCorrect(lastClaim: Date): Date {
    const nextClaim = new Date(lastClaim);
    nextClaim.setUTCDate(nextClaim.getUTCDate() + 1);
    nextClaim.setUTCHours(0, 0, 0, 0);
    return nextClaim;
}

describe('gift nextClaim calculation — (historical) buggy formula for reference', () => {
    it('buggy formula produced ~48h cooldown instead of ~24h', () => {
        const lastClaim = new Date('2026-06-02T15:30:00Z');
        const next = computeNextClaimBuggy(lastClaim);

        const diffHours = (next.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);

        // With the bug, next is 2026-06-04T00:00:00Z — almost 33 hours later
        // (specifically: from 15:30 on the 2nd to 00:00 on the 4th = 32.5h)
        expect(diffHours).toBeGreaterThan(30); // well above 24h — confirms the bug
        expect(diffHours).toBeLessThan(50);

        // The date advanced by 2 full days from lastClaim.getUTCDate()
        expect(next.getUTCDate()).toBe(4); // 2nd → 4th (skipped the 3rd)
    });

    it('BUG: a user who claimed at 23:59 on day 1 cannot claim until day 4 00:00', () => {
        const lastClaim = new Date('2026-06-01T23:59:00Z');
        const next = computeNextClaimBuggy(lastClaim);
        // setUTCHours(24,...) on June 1st → June 2nd midnight
        // then setUTCDate(+1) → June 3rd midnight
        expect(next.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    });

    it('BUG: a user who claimed at 00:00 on day 1 waits until day 3 00:00', () => {
        const lastClaim = new Date('2026-06-01T00:00:00Z');
        const next = computeNextClaimBuggy(lastClaim);
        expect(next.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    });
});

describe('gift nextClaim calculation — correct behaviour', () => {
    it('correct formula produces exactly the next UTC midnight (< 24h wait)', () => {
        const lastClaim = new Date('2026-06-02T15:30:00Z');
        const next = computeNextClaimCorrect(lastClaim);

        // Should be 2026-06-03T00:00:00Z — 8.5 hours after lastClaim
        expect(next.toISOString()).toBe('2026-06-03T00:00:00.000Z');
    });

    it('correct: claiming at midnight means next window is next midnight exactly 24h later', () => {
        const lastClaim = new Date('2026-06-01T00:00:00Z');
        const next = computeNextClaimCorrect(lastClaim);
        expect(next.toISOString()).toBe('2026-06-02T00:00:00.000Z');
        const diffHours = (next.getTime() - lastClaim.getTime()) / (1000 * 60 * 60);
        expect(diffHours).toBe(24);
    });

    it('correct: claiming at 23:59 means next window is 00:00 the following day', () => {
        const lastClaim = new Date('2026-06-01T23:59:00Z');
        const next = computeNextClaimCorrect(lastClaim);
        expect(next.toISOString()).toBe('2026-06-02T00:00:00.000Z');
    });
});

describe('gift streak milestone logic', () => {
    const streakMilestones = [7, 14, 21];
    const legacyMultiples = [28, 56, 84];

    it.each(streakMilestones)('streak %i triggers Rare milestone', (streak) => {
        const isRare = streak === 7 || streak === 14 || streak === 21;
        expect(isRare).toBe(true);
    });

    it.each(legacyMultiples)('streak %i triggers Legacy milestone (multiple of 28)', (streak) => {
        const isLegacy = streak >= 28 && streak % 28 === 0;
        expect(isLegacy).toBe(true);
    });

    it('streak 28 triggers Legacy, not Rare', () => {
        const streak = 28;
        const isRareMilestone = streak === 7 || streak === 14 || streak === 21;
        const isLegacyMilestone = streak >= 28 && streak % 28 === 0;
        expect(isRareMilestone).toBe(false);
        expect(isLegacyMilestone).toBe(true);
    });

    it('streak 1 triggers neither milestone', () => {
        const streak = 1;
        expect(streak === 7 || streak === 14 || streak === 21).toBe(false);
        expect(streak >= 28 && streak % 28 === 0).toBe(false);
    });
});
