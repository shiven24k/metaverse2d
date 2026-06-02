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
interface NpcState {
    x: number;
    y: number;
    patrolIndex: number;
    idleCountdown: number;  // ticks remaining to stay idle
}

const npcState = new Map<string, NpcState>();

function stepToward(cx: number, cy: number, tx: number, ty: number): { x: number; y: number; facing: string } {
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy, facing: 'down' };
    // Prefer the axis with larger delta; add slight randomness to vary paths
    const preferX = Math.abs(dx) > Math.abs(dy) || (Math.abs(dx) === Math.abs(dy) && Math.random() < 0.5);
    if (preferX) {
        return dx > 0
            ? { x: cx + 1, y: cy, facing: 'right' }
            : { x: cx - 1, y: cy, facing: 'left' };
    } else {
        return dy > 0
            ? { x: cx, y: cy + 1, facing: 'down' }
            : { x: cx, y: cy - 1, facing: 'up' };
    }
}

async function npcTick() {
    const rooms = getRoomManager().rooms;
    if (rooms.size === 0) return;

    for (const [spaceId, users] of rooms) {
        if (users.length === 0) continue;

        const npcs = await client.nPC.findMany({ where: { spaceId } });
        for (const npc of npcs) {
            const state: NpcState = npcState.get(npc.id) ?? {
                x: npc.x, y: npc.y, patrolIndex: 0, idleCountdown: 0,
            };
            const patrol = npc.patrolPath as { x: number; y: number }[];
            if (patrol.length < 2) continue;

            // Random idle: ~15% chance to pause for 1–3 ticks
            if (state.idleCountdown > 0) {
                state.idleCountdown--;
                npcState.set(npc.id, state);
                continue;
            }
            if (Math.random() < 0.15) {
                state.idleCountdown = Math.floor(Math.random() * 3) + 1;
                npcState.set(npc.id, state);
                continue;
            }

            // Clamp patrolIndex in case patrol was shortened in DB after state was cached
            state.patrolIndex = state.patrolIndex % patrol.length;
            const target = patrol[state.patrolIndex];
            const atTarget = state.x === target.x && state.y === target.y;

            if (atTarget) {
                // Advance to next waypoint — brief pause at corners (~30% chance)
                if (Math.random() < 0.3) {
                    state.idleCountdown = 1;
                }
                state.patrolIndex = (state.patrolIndex + 1) % patrol.length;
                npcState.set(npc.id, state);
                continue;
            }

            // Take one step toward current target waypoint
            const step = stepToward(state.x, state.y, target.x, target.y);
            state.x = step.x;
            state.y = step.y;
            npcState.set(npc.id, state);

            getRoomManager().broadcastToRoom(
                { type: 'npc-moved', payload: { npcId: npc.id, x: state.x, y: state.y, facing: step.facing } },
                spaceId
            );
        }
    }
}

// 500 ms per step — natural walking pace
setInterval(npcTick, 500);
