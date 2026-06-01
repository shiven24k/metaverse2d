import { WebSocketServer } from 'ws';
import { User } from './User';
import { getRoomManager } from './getRoomManager';
import client from '@repo/db/client';

const wss = new WebSocketServer({ port: 3001 });

wss.on('connection', function connection(ws) {
  let user = new User(ws);
  ws.on('error', console.error);

  ws.on('close', () => {
    user?.destroy();
  });
});

// ─── NPC movement ticker ──────────────────────────────────────────────────────
const npcState = new Map<string, { x: number; y: number; patrolIndex: number }>();

async function npcTick() {
    const rooms = getRoomManager().rooms;
    if (rooms.size === 0) return;

    for (const [spaceId, users] of rooms) {
        if (users.length === 0) continue;

        const npcs = await client.nPC.findMany({ where: { spaceId } });
        for (const npc of npcs) {
            const state = npcState.get(npc.id) ?? { x: npc.x, y: npc.y, patrolIndex: 0 };
            const patrol = npc.patrolPath as { x: number; y: number }[];

            if (patrol.length > 1) {
                const nextIdx = (state.patrolIndex + 1) % patrol.length;
                state.x = patrol[nextIdx].x;
                state.y = patrol[nextIdx].y;
                state.patrolIndex = nextIdx;
                npcState.set(npc.id, state);

                getRoomManager().broadcastToRoom(
                    { type: 'npc-moved', payload: { npcId: npc.id, x: state.x, y: state.y } },
                    spaceId
                );
            }
        }
    }
}

setInterval(npcTick, 2000);
