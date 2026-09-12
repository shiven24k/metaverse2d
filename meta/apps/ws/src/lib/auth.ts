import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, username } from "better-auth/plugins";
import client from "@repo/db/client";

function getBetterAuthSecret(): string {
    const secret = process.env.BETTER_AUTH_SECRET;
    if (secret) return secret;
    if (process.env.NODE_ENV === "production") {
        throw new Error("BETTER_AUTH_SECRET is required in production");
    }
    console.warn("[Auth] BETTER_AUTH_SECRET not set; using dev-only fallback. Set a strong secret in production.");
    return "metaverse2d-super-secret-key-change-in-prod";
}

export const auth = betterAuth({
    database: prismaAdapter(client, {
        provider: "postgresql",
    }),
    plugins: [bearer(), username()],
    emailAndPassword: { enabled: true },
    secret: getBetterAuthSecret(),
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
});
