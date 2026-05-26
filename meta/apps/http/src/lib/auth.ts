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
    trustedOrigins: ["http://localhost:5173"],
});

export type Auth = typeof auth;
