/**
 * Integration tests for gift routes.
 * Covers: status, claim, send — mocked Prisma.
 * Documents the double-nextClaim bug and milestoneItem scope bug.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@repo/db/client');
vi.mock('../../apps/http/src/middleware/user', () => ({
    userMiddleware: (req: any, _res: any, next: any) => {
        req.userId = 'user-abc';
        next();
    },
}));

async function buildApp() {
    const { giftRouter } = await import('../../apps/http/src/routes/v1/gift');
    const app = express();
    app.use(express.json());
    app.use('/gift', giftRouter);
    return app;
}

describe('GET /gift/status', () => {
    let db: any;
    let app: express.Express;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        db = (await import('@repo/db/client')).default;
        app = await buildApp();
    });

    it('returns claimed=false when no gift record exists', async () => {
        db.dailyGift.findUnique.mockResolvedValue(null);
        const res = await request(app).get('/gift/status');
        expect(res.status).toBe(200);
        expect(res.body.claimed).toBe(false);
    });

    it('returns claimed=true when gift was recently claimed', async () => {
        db.dailyGift.findUnique.mockResolvedValue({
            lastClaim: new Date(), // just now
        });
        const res = await request(app).get('/gift/status');
        expect(res.status).toBe(200);
        expect(res.body.claimed).toBe(true);
        expect(res.body.nextClaimAt).toBeTruthy();
    });

    it('FIX: nextClaimAt is at most 24h in the future', async () => {
        const now = new Date();
        db.dailyGift.findUnique.mockResolvedValue({ lastClaim: now });
        const res = await request(app).get('/gift/status');

        const nextClaimAt = new Date(res.body.nextClaimAt);
        const diffHours = (nextClaimAt.getTime() - now.getTime()) / (1000 * 60 * 60);

        // After fix: nextClaimAt is the next UTC midnight — always ≤24h away
        expect(diffHours).toBeLessThanOrEqual(24);
        expect(diffHours).toBeGreaterThan(0);
    });

    it('returns claimed=false when nextClaim has passed', async () => {
        // Simulate a claim from 3 days ago — even with the bug it should be expired
        db.dailyGift.findUnique.mockResolvedValue({
            lastClaim: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        });
        const res = await request(app).get('/gift/status');
        expect(res.body.claimed).toBe(false);
    });
});

describe('POST /gift/claim', () => {
    let db: any;
    let app: express.Express;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        db = (await import('@repo/db/client')).default;
        app = await buildApp();
    });

    it('returns 400 when gift already claimed today', async () => {
        db.dailyGift.findUnique.mockResolvedValue({
            lastClaim: new Date(), // just claimed
        });
        const res = await request(app).post('/gift/claim');
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/already claimed/i);
    });

    it('grants coins and item on first claim', async () => {
        db.dailyGift.findUnique.mockResolvedValue(null); // never claimed
        db.item.findMany.mockResolvedValue([
            { id: 'item-sofa', name: 'Sofa', rarity: 'Common' },
        ]);
        db.$transaction.mockImplementation(async (fn: any) => fn(db));
        db.dailyGift.upsert.mockResolvedValue({ userId: 'user-abc', streak: 1 });
        db.wallet.upsert.mockResolvedValue({ coins: 50 }); // fixed: uses upsert not find+create+update
        db.item.findFirst.mockResolvedValue(null); // no milestone
        db.inventoryItem.upsert.mockResolvedValue({});

        const res = await request(app).post('/gift/claim');
        expect(res.status).toBe(200);
        expect(res.body.coins).toBe(50);
        expect(res.body.streak).toBe(1);
        expect(res.body.milestone).toBeNull();
    });
});

describe('POST /gift/send', () => {
    let db: any;
    let app: express.Express;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        db = (await import('@repo/db/client')).default;
        app = await buildApp();
    });

    it('returns 400 when itemId is missing', async () => {
        const res = await request(app).post('/gift/send').send({ recipientId: 'r1' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when recipientId is missing', async () => {
        const res = await request(app).post('/gift/send').send({ itemId: 'i1' });
        expect(res.status).toBe(400);
    });

    it('returns 400 when gifting to yourself', async () => {
        const res = await request(app).post('/gift/send').send({ itemId: 'i1', recipientId: 'user-abc' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/yourself/i);
    });

    it('returns 404 when recipient does not exist', async () => {
        db.user.findUnique.mockResolvedValue(null);
        const res = await request(app).post('/gift/send').send({ itemId: 'i1', recipientId: 'ghost' });
        expect(res.status).toBe(404);
    });

    it('returns 400 when sender does not own item', async () => {
        db.user.findUnique.mockResolvedValue({ id: 'r1' });
        db.inventoryItem.findUnique.mockResolvedValue(null);
        const res = await request(app).post('/gift/send').send({ itemId: 'i1', recipientId: 'r1' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/don't own/i);
    });

    it('successfully transfers item', async () => {
        db.user.findUnique.mockResolvedValue({ id: 'r1' });
        db.inventoryItem.findUnique.mockResolvedValue({ quantity: 1 });
        db.item.findUnique.mockResolvedValue({ id: 'i1', name: 'Sofa' });
        db.$transaction.mockImplementation(async (fn: any) => fn(db));
        db.inventoryItem.update.mockResolvedValue({});
        db.inventoryItem.upsert.mockResolvedValue({});

        const res = await request(app).post('/gift/send').send({ itemId: 'i1', recipientId: 'r1' });
        expect(res.status).toBe(200);
        expect(res.body.message).toMatch(/gifted/i);
    });
});
