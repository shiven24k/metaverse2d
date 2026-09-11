import client from "@repo/db/client";
import { sendEmail } from "./email";
import { invalidatePlanCache } from "../../../ws/src/lib/planAccess";

export const GRACE_DAYS = 3;
export const GRACE_DAYS_MS = GRACE_DAYS * 24 * 60 * 60 * 1000;

const APP_URL = process.env.APP_URL ?? "http://localhost:5173";

/**
 * Dunning: find PAST_DUE subscriptions whose grace period has ended and
 * downgrade them to Free (status → EXPIRED, which gating treats as Free).
 * Runs on boot and then on a timer — see startDunningTicker().
 */
export async function runDunning(): Promise<void> {
    const now = new Date();
    const expired = await client.subscription.findMany({
        where: {
            status: "PAST_DUE",
            OR: [{ graceEndsAt: { lte: now } }, { graceEndsAt: null }], // null = pre-grace legacy rows
        },
        include: { owner: { select: { email: true, name: true } } },
    });

    for (const sub of expired) {
        await client.subscription.update({
            where: { id: sub.id },
            data: { status: "EXPIRED" },
        });
        invalidatePlanCache(sub.ownerId);
        console.log(`[dunning] downgraded subscription ${sub.id} (${sub.owner.email}) to Free — grace ended`);

        if (sub.owner.email) {
            await sendEmail(
                sub.owner.email,
                "Your subscription has been downgraded to Free",
                `<p>Hi ${sub.owner.name},</p>` +
                    `<p>Your payment failed and the ${GRACE_DAYS}-day grace period has ended, so you've been moved to the Free plan. Your spaces and items are safe.</p>` +
                    `<p>Upgrade anytime: <a href="${APP_URL}/billing">${APP_URL}/billing</a></p>`
            );
        }
    }
}

export function startDunningTicker(intervalMs = 60 * 60 * 1000): NodeJS.Timeout {
    runDunning().catch((err) => console.error("[dunning] initial run error:", err));
    return setInterval(() => {
        runDunning().catch((err) => console.error("[dunning] tick error:", err));
    }, intervalMs);
}