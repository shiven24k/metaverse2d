import 'dotenv/config';
import http from 'http';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { toNodeHandler } from 'better-auth/node';
import { router } from './routes/v1';
import { auth } from './lib/auth';
import { attachWsServer } from './ws-server';

const app = express();

const PORT = parseInt(process.env.PORT || '3000', 10);
const corsOrigins = process.env.CORS_ORIGIN?.split(",") ?? ["http://localhost:5173", "http://localhost:5174"];
const corsOptions: cors.CorsOptions = {
    origin: corsOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["set-cookie", "set-auth-token"],
    optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));

// Handle preflight for all routes explicitly before any route handler runs.
app.options("*", cors(corsOptions));

// Intercept preflight for auth routes so toNodeHandler never sees OPTIONS requests.
app.options("/api/auth/*", cors(corsOptions));

app.all("/api/auth/*", toNodeHandler(auth));
console.log('[Auth] better-auth mounted at /api/auth/*');

app.use(express.json());

app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

app.use("/api/v1", router);

const server = http.createServer(app);
attachWsServer(server);

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT} (HTTP + WS)`);
});
