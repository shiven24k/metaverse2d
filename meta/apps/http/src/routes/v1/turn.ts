import { Router } from 'express';
import { userMiddleware } from '../../middleware/user';

export const turnRouter = Router();

turnRouter.get('/turn-credentials', userMiddleware, async (_req, res) => {
    try {
        const appName = process.env.METERED_APP_NAME;
        const apiKey = process.env.METERED_API_KEY;
        if (!appName || !apiKey) throw new Error('TURN not configured');

        const response = await fetch(
            `https://${appName}.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
        );
        const iceServers = await response.json();
        res.json({ iceServers });
    } catch {
        res.json({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
    }
});
