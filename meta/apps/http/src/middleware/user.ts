import { NextFunction, Request, Response } from "express";
import { auth } from "../lib/auth";
import { fromNodeHeaders } from "better-auth/node";

export const userMiddleware = async (req: Request, res: Response, next: NextFunction) => {
    const session = await auth.api.getSession({
        headers: fromNodeHeaders(req.headers),
    });

    if (!session) {
        res.status(403).json({ message: "Unauthorized" });
        return;
    }

    req.userId = session.user.id;
    req.role = session.user.role as "Admin" | "User";
    next();
};
