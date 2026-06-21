import { Router } from "express";
import path from "path";
import multer from "multer";
import { UpdateMetadataSchema, UpdateUsernameSchema } from "../../types";
import client from "@repo/db/client";
import { userMiddleware } from "../../middleware/user";
import { auth } from "../../lib/auth";
import { fromNodeHeaders } from "better-auth/node";

export const userRouter = Router();

const avatarStorage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        const uploadsDir = path.join(process.cwd(), "uploads");
        cb(null, uploadsDir);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `avatar-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
});

const avatarUpload = multer({
    storage: avatarStorage,
    limits: { fileSize: 4 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        const allowed = [".png", ".jpg", ".jpeg", ".webp", ".gif"];
        if (allowed.includes(path.extname(file.originalname).toLowerCase())) {
            cb(null, true);
        } else {
            cb(new Error("Only image files (png, jpg, jpeg, webp, gif) are allowed"));
        }
    },
});

userRouter.get("/me", userMiddleware, async (req, res) => {
    const user = await client.user.findUnique({
        where: { id: req.userId },
        select: { id: true, username: true, name: true, role: true, email: true, avatarId: true, displayUsername: true, image: true },
    });
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }
    res.json({ user });
});

userRouter.post("/metadata", userMiddleware, async (req, res) => {
    const parsed = UpdateMetadataSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation failed" });
        return;
    }
    try {
        const data: Record<string, unknown> = {};
        if (parsed.data.avatarId !== undefined) data.avatarId = parsed.data.avatarId;
        if (parsed.data.displayUsername !== undefined) data.displayUsername = parsed.data.displayUsername;
        if (Object.keys(data).length === 0) {
            res.status(400).json({ message: "Nothing to update" });
            return;
        }
        await client.user.update({ where: { id: req.userId }, data });
        res.json({ message: "Updated" });
    } catch {
        res.status(500).json({ message: "Internal server error" });
    }
});

userRouter.post("/username", userMiddleware, async (req, res) => {
    const parsed = UpdateUsernameSchema.safeParse(req.body);
    if (!parsed.success) {
        res.status(400).json({ message: parsed.error.issues[0]?.message ?? "Validation failed" });
        return;
    }
    const { username } = parsed.data;
    const existing = await client.user.findFirst({
        where: { username, NOT: { id: req.userId } },
    });
    if (existing) {
        res.status(409).json({ message: "Username already taken" });
        return;
    }
    try {
        await client.user.update({ where: { id: req.userId }, data: { username } });
        res.json({ message: "Username updated" });
    } catch {
        res.status(500).json({ message: "Internal server error" });
    }
});

userRouter.get("/check-username", async (req, res) => {
    const { username } = req.query as { username?: string };
    if (!username || username.length < 3 || username.length > 20) {
        res.status(400).json({ available: false, message: "Username must be 3–20 characters" });
        return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        res.status(400).json({ available: false, message: "Letters, numbers and underscores only" });
        return;
    }
    const existing = await client.user.findFirst({ where: { username } });
    res.json({ available: !existing });
});

userRouter.post("/avatar", userMiddleware, (req, res) => {
    avatarUpload.single("file")(req, res, async (err) => {
        if (err) {
            res.status(400).json({ message: err.message });
            return;
        }
        if (!req.file) {
            res.status(400).json({ message: "No file provided" });
            return;
        }
        const url = `/uploads/${req.file.filename}`;
        try {
            await client.user.update({ where: { id: req.userId }, data: { image: url } });
            res.json({ url });
        } catch {
            res.status(500).json({ message: "Failed to save avatar" });
        }
    });
});

// Exchange active cookie session → bearer token (used after OAuth redirect)
userRouter.get("/token", async (req, res) => {
    try {
        const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
        if (!session) {
            res.status(403).json({ message: "No active session" });
            return;
        }
        res.json({ token: session.session.token, userId: session.user.id });
    } catch {
        res.status(500).json({ message: "Internal server error" });
    }
});

userRouter.get("/avatars", async (_req, res) => {
    const avatars = await client.avatar.findMany();
    res.json({ avatars });
});

userRouter.get("/metadata/bulk", async (req, res) => {
    const userIdString = (req.query.ids ?? "[]") as string;
    const userIds = userIdString.slice(1, userIdString.length - 1).split(",");
    const metadata = await client.user.findMany({
        where: { id: { in: userIds } },
        select: { avatar: true, id: true },
    });
    res.json({ avatars: metadata.map(m => ({ userId: m.id, avatar: m.avatar })) });
});
