import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, username } from "better-auth/plugins";
import client from "@repo/db/client";

export const auth = betterAuth({
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
    secret: process.env.BETTER_AUTH_SECRET ?? "metaverse2d-super-secret-key-change-in-prod",
    database: prismaAdapter(client, {
        provider: "postgresql",
    }),
    plugins: [
        bearer(),
        username(),
    ],
    emailAndPassword: {
        enabled: true,
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
    trustedOrigins: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173", "http://localhost:5174"],
});

export type Auth = typeof auth;
