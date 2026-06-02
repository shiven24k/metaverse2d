import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['tests/**/*.test.ts', 'apps/*/src/**/*.test.ts', 'apps/*/src/__tests__/**/*.ts'],
        alias: {
            '@repo/db/client': path.resolve(__dirname, 'tests/__mocks__/db.ts'),
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
        },
    },
});
