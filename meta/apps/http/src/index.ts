import express from 'express';
import cors from 'cors';
import path from 'path';
import { toNodeHandler } from 'better-auth/node';
import { router } from './routes/v1';
import { auth } from './lib/auth';

const app = express();

const corsOptions = {
    origin: process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173", "http://localhost:5174"],
    credentials: true,
};

// Apply CORS globally — must be before all route handlers
app.use(cors(corsOptions));

// Handle preflight for all routes
app.options("*", cors(corsOptions));

// Better Auth handles all /api/auth/* routes (before express.json())
app.all("/api/auth/*", toNodeHandler(auth));

app.use(express.json());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/v1", router);

app.listen(3000, () => {
    console.log("Server is running on http://localhost:3000");
});
