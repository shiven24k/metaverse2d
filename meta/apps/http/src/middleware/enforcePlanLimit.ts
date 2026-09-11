import { NextFunction, Request, Response } from "express";
import { getEffectivePlan, getSpaceCount, withRetry } from "../../../ws/src/lib/planAccess";

type PlanLimitKey =
    | "maxSpaces"
    | "maxMembersPerSpace"
    | "maxConcurrentUsers"
    | "screenShareEnabled"
    | "broadcastEnabled";

const NUMERIC_USAGE: Record<string, (userId: string) => Promise<number>> = {
    maxSpaces: (userId) => withRetry(() => getSpaceCount(userId)),
    // maxMembersPerSpace / maxConcurrentUsers have no HTTP-side usage yet
    // (members join via invites, concurrent users is enforced on WS join).
};

/**
 * Central plan gate. Must run AFTER userMiddleware (needs req.userId).
 * Boolean limits → 403 if the plan disables the feature.
 * Numeric limits  → 403 if current usage >= the plan cap.
 * Users without an ACTIVE subscription get FREE defaults (from planAccess).
 */
export function enforcePlanLimit(limitKey: PlanLimitKey) {
    return async (req: Request, res: Response, next: NextFunction) => {
        if (!req.userId) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const plan = await getEffectivePlan(req.userId);
        const value = plan[limitKey] as boolean | number;

        if (typeof value === "boolean") {
            if (!value) {
                res.status(403).json({ error: "Upgrade required", feature: limitKey });
                return;
            }
        } else {
            const usageFn = NUMERIC_USAGE[limitKey];
            const current = usageFn ? await usageFn(req.userId) : 0;
            if (current >= value) {
                res.status(403).json({ error: "Plan limit reached", feature: limitKey });
                return;
            }
        }

        next();
    };
}