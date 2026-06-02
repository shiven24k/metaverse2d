/**
 * Integration tests for critical space routes.
 * Focuses on boundary/collision bugs found in move endpoints.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('@repo/db/client');
vi.mock('../../apps/http/src/middleware/user', () => ({
    userMiddleware: (req: any, _res: any, next: any) => {
        req.userId = 'owner-id';
        next();
    },
}));

async function buildApp() {
    const { spaceRouter } = await import('../../apps/http/src/routes/v1/space');
    const app = express();
    app.use(express.json());
    app.use('/space', spaceRouter);
    return app;
}

describe('PUT /space/element/:id/move — boundary check bug', () => {
    let db: any;
    let app: express.Express;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        db = (await import('@repo/db/client')).default;
        app = await buildApp();
    });

    const mockSpaceElement = (x: number, y: number, ew = 1, eh = 1) => ({
        id: 'se1',
        spaceId: 'sp1',
        space: { id: 'sp1', creatorId: 'owner-id', width: 10, height: 10 },
        element: { width: ew, height: eh },
        x,
        y,
    });

    it('accepts valid in-bounds move for 1×1 element', async () => {
        db.spaceElements.findFirst.mockResolvedValue(mockSpaceElement(5, 5));
        db.spaceElements.findMany.mockResolvedValue([]);
        db.placedItem.findMany.mockResolvedValue([]);
        db.spaceElements.update.mockResolvedValue({});

        const res = await request(app).put('/space/element/se1/move').send({ x: 6, y: 5 });
        expect(res.status).toBe(200);
    });

    it('FIX: rejects out-of-bounds move for 3-wide element at x=9 in 10-wide space', async () => {
        // Space is 10 tiles wide (x: 0..9). A 3-wide element at x=9 would occupy x=9,10,11.
        // Fixed check: `x + ew > space.width` (9 + 3 > 10) → reject
        db.spaceElements.findFirst.mockResolvedValue(mockSpaceElement(0, 0, 3, 1));
        db.spaceElements.findMany.mockResolvedValue([]);
        db.placedItem.findMany.mockResolvedValue([]);

        const res = await request(app).put('/space/element/se1/move').send({ x: 9, y: 0 });
        expect(res.status).toBe(400); // correctly rejected after fix
    });

    it('correctly rejects a move completely outside bounds (x >= width)', async () => {
        db.spaceElements.findFirst.mockResolvedValue(mockSpaceElement(5, 5, 1, 1));
        db.spaceElements.findMany.mockResolvedValue([]);
        db.placedItem.findMany.mockResolvedValue([]);

        const res = await request(app).put('/space/element/se1/move').send({ x: 10, y: 0 });
        expect(res.status).toBe(400); // x >= width catches this case
    });

    it('rejects negative x', async () => {
        db.spaceElements.findFirst.mockResolvedValue(mockSpaceElement(5, 5));
        db.spaceElements.findMany.mockResolvedValue([]);
        db.placedItem.findMany.mockResolvedValue([]);

        const res = await request(app).put('/space/element/se1/move').send({ x: -1, y: 0 });
        expect(res.status).toBe(400);
    });

    it('returns 403 when caller is not the space owner', async () => {
        db.spaceElements.findFirst.mockResolvedValue({
            id: 'se1',
            spaceId: 'sp1',
            space: { id: 'sp1', creatorId: 'different-owner', width: 10, height: 10 },
            element: { width: 1, height: 1 },
            x: 5, y: 5,
        });

        const res = await request(app).put('/space/element/se1/move').send({ x: 6, y: 5 });
        expect(res.status).toBe(403);
    });
});

describe('DELETE /space/portal/:id', () => {
    let db: any;
    let app: express.Express;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        db = (await import('@repo/db/client')).default;
        app = await buildApp();
    });

    it('returns 403 when portal not found or not owner', async () => {
        db.spacePortal.findUnique.mockResolvedValue(null);
        const res = await request(app).delete('/space/portal/p1');
        expect(res.status).toBe(403);
    });

    it('deletes portal when owner is correct', async () => {
        db.spacePortal.findUnique.mockResolvedValue({
            id: 'p1',
            fromSpace: { creatorId: 'owner-id' },
        });
        db.spacePortal.delete.mockResolvedValue({});
        const res = await request(app).delete('/space/portal/p1');
        expect(res.status).toBe(200);
    });
});

describe('PUT /space/:spaceId/resize', () => {
    let db: any;
    let app: express.Express;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        db = (await import('@repo/db/client')).default;
        app = await buildApp();
    });

    it('returns 400 for width below minimum (4)', async () => {
        const res = await request(app).put('/space/sp1/resize').send({ width: 4, height: 20 });
        expect(res.status).toBe(400);
    });

    it('returns 400 for width above maximum (101)', async () => {
        const res = await request(app).put('/space/sp1/resize').send({ width: 101, height: 20 });
        expect(res.status).toBe(400);
    });

    it('accepts valid resize dimensions', async () => {
        db.space.findUnique.mockResolvedValue({ id: 'sp1', creatorId: 'owner-id' });
        db.space.update.mockResolvedValue({});
        const res = await request(app).put('/space/sp1/resize').send({ width: 30, height: 25 });
        expect(res.status).toBe(200);
        expect(res.body.width).toBe(30);
        expect(res.body.height).toBe(25);
    });

    it('returns 403 when space not found or not owner', async () => {
        db.space.findUnique.mockResolvedValue(null);
        const res = await request(app).put('/space/sp1/resize').send({ width: 20, height: 20 });
        expect(res.status).toBe(403);
    });
});

describe('GET /space/:spaceId', () => {
    let db: any;
    let app: express.Express;

    beforeEach(async () => {
        vi.resetModules();
        vi.clearAllMocks();
        db = (await import('@repo/db/client')).default;
        app = await buildApp();
    });

    it('returns 400 when space not found', async () => {
        db.space.findUnique.mockResolvedValue(null);
        const res = await request(app).get('/space/nonexistent');
        expect(res.status).toBe(400);
    });

    it('returns space with portals array', async () => {
        db.space.findUnique.mockResolvedValue({
            id: 'sp1',
            name: 'Test Space',
            width: 20,
            height: 20,
            elements: [],
            placedItems: [],
            fromPortals: [
                { id: 'portal1', toSpaceId: 'sp2', x: 5, y: 5, label: 'To Office' },
            ],
        });

        const res = await request(app).get('/space/sp1');
        expect(res.status).toBe(200);
        expect(res.body.portals).toHaveLength(1);
        expect(res.body.portals[0].label).toBe('To Office');
    });
});
