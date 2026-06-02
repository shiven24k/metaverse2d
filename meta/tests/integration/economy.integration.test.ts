/**
 * Integration tests for POST /api/v1/economy/interact (chest interaction).
 * Prisma and auth middleware are mocked.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

// Mock DB before importing routes
vi.mock('@repo/db/client');
vi.mock('../../apps/http/src/middleware/user', () => ({
    userMiddleware: (req: any, _res: any, next: any) => {
        req.userId = 'test-user-id';
        next();
    },
}));

async function buildApp() {
    const { economyRouter } = await import('../../apps/http/src/routes/v1/economy');
    const app = express();
    app.use(express.json());
    app.use('/economy', economyRouter);
    return app;
}

describe('POST /economy/interact', () => {
    let db: any;
    let app: express.Express;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();

        db = (await import('@repo/db/client')).default;
        app = await buildApp();
    });

    it('returns 400 when placedItemId is missing', async () => {
        const res = await request(app).post('/economy/interact').send({});
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/placedItemId required/i);
    });

    it('returns 404 when placed item does not exist', async () => {
        db.placedItem.findUnique.mockResolvedValue(null);
        const res = await request(app).post('/economy/interact').send({ placedItemId: 'xxx' });
        expect(res.status).toBe(404);
    });

    it('returns 400 when item is not a chest', async () => {
        db.placedItem.findUnique.mockResolvedValue({
            id: 'pi1',
            item: { name: 'Sofa' },
        });
        const res = await request(app).post('/economy/interact').send({ placedItemId: 'pi1' });
        expect(res.status).toBe(400);
        expect(res.body.message).toMatch(/not a chest/i);
    });

    it('returns 429 when cooldown is active', async () => {
        const recentLastAt = new Date(Date.now() - 10 * 60 * 1000); // 10 min ago
        db.placedItem.findUnique.mockResolvedValue({
            id: 'pi1',
            item: { name: 'Chest' },
        });
        db.chestInteraction.findUnique.mockResolvedValue({
            lastAt: recentLastAt,
        });

        const res = await request(app).post('/economy/interact').send({ placedItemId: 'pi1' });
        expect(res.status).toBe(429);
        expect(res.body.cooldown).toBe(true);
        expect(res.body.message).toMatch(/resets in \d+ min/i);
    });

    it('awards coins when cooldown has expired', async () => {
        const oldLastAt = new Date(Date.now() - 90 * 60 * 1000); // 90 min ago
        db.placedItem.findUnique.mockResolvedValue({ id: 'pi1', item: { name: 'Chest' } });
        db.chestInteraction.findUnique.mockResolvedValue({ lastAt: oldLastAt });
        db.$transaction.mockImplementation(async (fn: any) => fn(db));
        db.chestInteraction.upsert.mockResolvedValue({});
        db.wallet.upsert.mockResolvedValue({ coins: 120 });

        const res = await request(app).post('/economy/interact').send({ placedItemId: 'pi1' });
        expect(res.status).toBe(200);
        expect(res.body.coins).toBeGreaterThanOrEqual(10);
        expect(res.body.coins).toBeLessThanOrEqual(25);
        expect(res.body.message).toMatch(/found \d+ coins/i);
    });

    it('awards coins on first ever interaction (no existing record)', async () => {
        db.placedItem.findUnique.mockResolvedValue({ id: 'pi1', item: { name: 'Treasure Chest' } });
        db.chestInteraction.findUnique.mockResolvedValue(null); // first time
        db.$transaction.mockImplementation(async (fn: any) => fn(db));
        db.chestInteraction.upsert.mockResolvedValue({});
        db.wallet.upsert.mockResolvedValue({ coins: 15 });

        const res = await request(app).post('/economy/interact').send({ placedItemId: 'pi1' });
        expect(res.status).toBe(200);
        expect(res.body.coins).toBeGreaterThanOrEqual(10);
    });
});
