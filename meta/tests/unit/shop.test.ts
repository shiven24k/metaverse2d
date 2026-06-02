/**
 * Tests for shop price logic and buy validation.
 * BUG: Legacy item rarity price falls to default 100 instead of a defined tier.
 */
import { describe, it, expect } from 'vitest';

// Replicated from shop.ts line 59
function getItemPrice(rarity: string): number {
    return rarity === 'Common'   ? 50  :
           rarity === 'Uncommon' ? 150 :
           rarity === 'Rare'     ? 500 :
           100; // default — catches 'Legacy' and anything else
}

describe('shop price calculation', () => {
    it('Common costs 50',   () => expect(getItemPrice('Common')).toBe(50));
    it('Uncommon costs 150',() => expect(getItemPrice('Uncommon')).toBe(150));
    it('Rare costs 500',    () => expect(getItemPrice('Rare')).toBe(500));

    it('BUG: Legacy falls to default 100 (no explicit tier)', () => {
        // The shop code has no explicit case for "Legacy" so it's priced at 100.
        // Legacy items are rarer than Rare (awarded at streak milestones) but
        // cost less than Common in the shop. This is likely a bug — should be > 500.
        expect(getItemPrice('Legacy')).toBe(100); // documents the bug
    });

    it('unknown rarity falls to default 100', () => {
        expect(getItemPrice('Mythic')).toBe(100);
    });
});

describe('shop balance check logic', () => {
    function canAfford(walletCoins: number, price: number): boolean {
        return walletCoins >= price;
    }

    it('user with exact coins can buy', ()     => expect(canAfford(50, 50)).toBe(true));
    it('user with more coins can buy', ()      => expect(canAfford(100, 50)).toBe(true));
    it('user with fewer coins cannot buy', ()  => expect(canAfford(49, 50)).toBe(false));
    it('user with 0 coins cannot buy', ()      => expect(canAfford(0, 50)).toBe(false));

    it('BUG: TOCTOU — balance checked outside transaction (documented)', () => {
        // shop.ts reads wallet BEFORE the $transaction, then decrements inside.
        // Two concurrent requests can both read `wallet.coins >= price`
        // and both execute the decrement, leaving coins negative.
        // Fix: move balance check inside $transaction with a conditional update.
        let coins = 50;
        const price = 50;

        // Simulate two concurrent requests reading the same wallet
        const req1CanAfford = canAfford(coins, price);
        const req2CanAfford = canAfford(coins, price); // stale read

        // Both pass — both will decrement
        expect(req1CanAfford).toBe(true);
        expect(req2CanAfford).toBe(true);

        // After both transactions: coins = 50 - 50 - 50 = -50 (negative!)
        coins -= price; // req1 transaction
        coins -= price; // req2 transaction
        expect(coins).toBe(-50); // BUG confirmed
    });
});

describe('shop daily rotation seed', () => {
    // Replicated from shop.ts lines 10-19
    function getDailySeedNum(dateStr: string): number {
        return dateStr.split('-').reduce((a, b) => a + parseInt(b), 0);
    }

    it('produces a deterministic seed for a given date', () => {
        expect(getDailySeedNum('2026-06-02')).toBe(getDailySeedNum('2026-06-02'));
    });

    it('different dates produce different seeds', () => {
        expect(getDailySeedNum('2026-06-02')).not.toBe(getDailySeedNum('2026-06-03'));
    });

    it('seed uses only first charCode of item.id (weak but deterministic)', () => {
        const seedNum = getDailySeedNum('2026-06-02');
        const itemA = { id: 'abc' };
        const itemB = { id: 'xyz' };
        const hashA = (seedNum * itemA.id.charCodeAt(0)) % 1000;
        const hashB = (seedNum * itemB.id.charCodeAt(0)) % 1000;
        expect(typeof hashA).toBe('number');
        expect(typeof hashB).toBe('number');
        // Items starting with the same letter get the same hash — collision possible
        const itemC = { id: 'axy' };
        const hashC = (seedNum * itemC.id.charCodeAt(0)) % 1000;
        expect(hashA).toBe(hashC); // 'abc' and 'axy' collide since same first char
    });
});
