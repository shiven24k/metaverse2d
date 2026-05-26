import { NextFunction, Request, Response } from "express";
import { auth } from "../lib/auth";
import { fromNodeHeaders } from "better-auth/node";

export const adminMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    if (session.user.role !== "Admin") {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    req.userId = session.user.id;
    req.role = "Admin";
    next();
};
