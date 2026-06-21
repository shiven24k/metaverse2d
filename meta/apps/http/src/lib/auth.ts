import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, username } from "better-auth/plugins";
import client from "@repo/db/client";

export const auth = betterAuth({
    baseURL: process.env.API_URL ?? process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET ?? "metaverse2d-super-secret-key-change-in-prod",
    database: prismaAdapter(client, {
        provider: "postgresql",
    }),
    plugins: [
        bearer(),
        username(),
    ],
    account: {
        accountLinking: {
            enabled: true,
            trustedProviders: ['google', 'github'],
        },
        skipStateCookieCheck: true,
    },
    emailAndPassword: {
        enabled: true,
    },
    socialProviders: {
        ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? {
            google: {
                clientId: process.env.GOOGLE_CLIENT_ID,
                clientSecret: process.env.GOOGLE_CLIENT_SECRET,
            },
        } : {}),
        ...(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET ? {
            github: {
                clientId: process.env.GITHUB_CLIENT_ID,
                clientSecret: process.env.GITHUB_CLIENT_SECRET,
            },
        } : {}),
    },
    user: {
        additionalFields: {
            role: {
                type: "string",
                defaultValue: "User",
                input: false,
            },
        },
    },
    databaseHooks: {
        user: {
            create: {
                after: async (user) => {
                    const commonItems = await client.item.findMany({ where: { rarity: "Common" } });
                    for (const item of commonItems) {
                        await client.inventoryItem.upsert({
                            where: { userId_itemId: { userId: user.id, itemId: item.id } },
                            create: { userId: user.id, itemId: item.id, quantity: 2 },
                            update: {},
                        });
                    }
                },
            },
        },
    },
    trustedOrigins: [
        ...(process.env.CORS_ORIGIN?.split(",") ?? []),
        "https://metaverse2d-frontend.pages.dev",
        "http://localhost:5173",
        "http://localhost:5174",
    ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i),
});

console.log('[Auth] Google provider:', !!process.env.GOOGLE_CLIENT_ID);
console.log('[Auth] GitHub provider:', !!process.env.GITHUB_CLIENT_ID);

export type Auth = typeof auth;
