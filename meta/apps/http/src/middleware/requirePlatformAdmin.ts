import { NextFunction, Request, Response } from "express";

/**
 * Gates a route to platform admins only (global SaaS role).
 * Set by userMiddleware/adminMiddleware from the better-auth session
 * `platformRole` additionalField — distinct from the Space-level OWNER/MEMBER
 * RBAC, and distinct from the legacy `role = "Admin"` content-admin flag.
 */
export const requirePlatformAdmin = (req: Request, res: Response, next: NextFunction) => {
    if (req.platformRole !== "PLATFORM_ADMIN") {
        res.status(403).json({ error: "Forbidden" });
        return;
    }
    next();
};