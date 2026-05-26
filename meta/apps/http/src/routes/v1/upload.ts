import { Router } from "express";
import multer from "multer";
import path from "path";
import { userMiddleware } from "../../middleware/user";

const UPLOADS_DIR = path.join(process.cwd(), "uploads");
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (_req, file, cb) => {
        const ext = path.extname(file.originalname);
        const name = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}${ext}`;
        cb(null, name);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        const allowed = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) {
            cb(null, true);
        } else {
            cb(new Error("Only image files (png, jpg, gif, webp, svg) are allowed"));
        }
    },
});

export const uploadRouter = Router();

uploadRouter.post("/", userMiddleware, (req, res) => {
    upload.single("file")(req, res, (err) => {
        if (err) {
            if (err instanceof multer.MulterError) {
                res.status(400).json({ message: err.message });
                return;
            }
            res.status(400).json({ message: err.message });
            return;
        }

        if (!req.file) {
            res.status(400).json({ message: "No file provided" });
            return;
        }

        const url = `/uploads/${req.file.filename}`;
        res.json({ url });
    });
});
