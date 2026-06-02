// Shared Prisma client mock — individual tests override methods via vi.mocked()
import { vi } from 'vitest';

const client = {
    space: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
    },
    spaceElements: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        deleteMany: vi.fn(),
    },
    element: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
    },
    placedItem: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        createMany: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
        upsert: vi.fn(),
    },
    item: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
    },
    inventoryItem: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
        upsert: vi.fn(),
        delete: vi.fn(),
    },
    wallet: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        upsert: vi.fn(),
    },
    user: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
    },
    bannedUser: {
        findUnique: vi.fn(),
    },
    dailyGift: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
    },
    chestInteraction: {
        findUnique: vi.fn(),
        create: vi.fn(),
        upsert: vi.fn(),
    },
    spacePortal: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        delete: vi.fn(),
    },
    nPC: {
        findMany: vi.fn(),
        count: vi.fn(),
        createMany: vi.fn(),
    },
    guestbookEntry: {
        findMany: vi.fn(),
        create: vi.fn(),
    },
    report: {
        create: vi.fn(),
        findMany: vi.fn(),
    },
    avatar: {
        findMany: vi.fn(),
    },
    $transaction: vi.fn(async (fn: (tx: typeof client) => Promise<unknown>) => fn(client)),
};

export default client;
