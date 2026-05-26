import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { bearer, username } from "better-auth/plugins";
import client from "@repo/db/client";

export const auth = betterAuth({
    database: prismaAdapter(client, {
        provider: "postgresql",
    }),
    plugins: [bearer(), username()],
    emailAndPassword: { enabled: true },
    secret: process.env.BETTER_AUTH_SECRET,
    baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
});
