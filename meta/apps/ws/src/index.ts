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
    idleCountdown: number;
    wanderTarget: { x: number; y: number } | null;
    wanderCooldown: number;
}

const npcState = new Map<string, NpcState>();

/** Parse the Json patrolPath field regardless of whether Prisma returns it as
 *  a parsed array or as a raw JSON string (can happen with some Prisma configs). */
function parsePatrolPath(raw: unknown): { x: number; y: number }[] {
    try {
        if (Array.isArray(raw)) return raw as { x: number; y: number }[];
        if (typeof raw === 'string' && raw.trim().length > 0) return JSON.parse(raw);
    } catch {
        console.warn('[NPC] Failed to parse patrolPath:', raw);
    }
    return [];
}

/** Generate a simple 4-point square patrol when an NPC has none configured. */
function defaultPatrol(
    cx: number, cy: number,
    spaceW: number, spaceH: number,
    radius = 2,
): { x: number; y: number }[] {
    const clampX = (x: number) => Math.max(0, Math.min(spaceW - 1, x));
    const clampY = (y: number) => Math.max(0, Math.min(spaceH - 1, y));
    return [
        { x: clampX(cx - radius), y: clampY(cy - radius) },
        { x: clampX(cx + radius), y: clampY(cy - radius) },
        { x: clampX(cx + radius), y: clampY(cy + radius) },
        { x: clampX(cx - radius), y: clampY(cy + radius) },
    ];
}

function stepToward(cx: number, cy: number, tx: number, ty: number): { x: number; y: number; facing: string } {
    const dx = tx - cx;
    const dy = ty - cy;
    if (dx === 0 && dy === 0) return { x: cx, y: cy, facing: 'down' };
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

        const space = await client.space.findUnique({
            where: { id: spaceId },
            select: { width: true, height: true },
        });
        if (!space) continue;

        const npcs = await client.nPC.findMany({ where: { spaceId } });
        console.log(`[NPC tick] space=${spaceId} npcs=${npcs.length}`);

        for (const npc of npcs) {
            const state: NpcState = npcState.get(npc.id) ?? {
                x: npc.x, y: npc.y,
                patrolIndex: 0, idleCountdown: 0,
                wanderTarget: null, wanderCooldown: 0,
            };

            const motionType = (npc.motionType as string) ?? 'PATROL';

            // ── STATIC ──────────────────────────────────────────────────────
            if (motionType === 'STATIC') {
                npcState.set(npc.id, state);
                continue;
            }

            // ── Shared idle cooldown ─────────────────────────────────────────
            if (state.idleCountdown > 0) {
                state.idleCountdown--;
                npcState.set(npc.id, state);
                continue;
            }

            // ── WANDER ──────────────────────────────────────────────────────
            if (motionType === 'WANDER') {
                const radius = typeof npc.wanderRadius === 'number' ? npc.wanderRadius : 3;

                if (!state.wanderTarget || state.wanderCooldown <= 0) {
                    let target: { x: number; y: number } | null = null;
                    for (let attempt = 0; attempt < 12; attempt++) {
                        const dx = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
                        const dy = Math.floor(Math.random() * (radius * 2 + 1)) - radius;
                        const nx = Math.max(0, Math.min(space.width  - 1, npc.x + dx));
                        const ny = Math.max(0, Math.min(space.height - 1, npc.y + dy));
                        if (nx !== state.x || ny !== state.y) { target = { x: nx, y: ny }; break; }
                    }
                    state.wanderTarget   = target ?? { x: npc.x, y: npc.y };
                    state.wanderCooldown = 8 + Math.floor(Math.random() * 4);
                }

                state.wanderCooldown--;

                const tgt = state.wanderTarget;
                if (tgt.x === state.x && tgt.y === state.y) {
                    state.wanderTarget   = null;
                    state.wanderCooldown = 0;
                    state.idleCountdown  = Math.floor(Math.random() * 4) + 2;
                    npcState.set(npc.id, state);
                    continue;
                }

                if (Math.random() < 0.10) {
                    state.idleCountdown = 1;
                    npcState.set(npc.id, state);
                    continue;
                }

                const step = stepToward(state.x, state.y, tgt.x, tgt.y);
                state.x = step.x;
                state.y = step.y;
                npcState.set(npc.id, state);
                // Persist to DB (fire-and-forget) so reconnecting clients see current position
                client.nPC.update({ where: { id: npc.id }, data: { x: state.x, y: state.y } })
                    .catch(e => console.warn('[NPC] DB update failed:', (e as Error).message));
                console.log(`[NPC] ${npc.name} wander → (${state.x}, ${state.y})`);
                getRoomManager().broadcastToRoom(
                    { type: 'npc-moved', payload: { npcId: npc.id, x: state.x, y: state.y, facing: step.facing } },
                    spaceId
                );
                continue;
            }

            // ── PATROL ───────────────────────────────────────────────────────
            // Defensively parse patrolPath — Prisma Json can return string or array
            let patrol = parsePatrolPath(npc.patrolPath);
            console.log(`[NPC] ${npc.name} patrolPath length=${patrol.length}, state=(${state.x},${state.y}), patrolIndex=${state.patrolIndex}`);

            // No waypoints configured: auto-generate a default square patrol so the
            // NPC moves even when created via the editor without an explicit path.
            if (patrol.length < 2) {
                patrol = defaultPatrol(npc.x, npc.y, space.width, space.height);
                console.log(`[NPC] ${npc.name} auto-generated patrol (${patrol.length} pts)`);
            }

            // Random idle: ~15% chance to pause for 1–3 ticks
            if (Math.random() < 0.15) {
                state.idleCountdown = Math.floor(Math.random() * 3) + 1;
                npcState.set(npc.id, state);
                continue;
            }

            // Clamp patrolIndex in case patrol was shortened after state was cached
            state.patrolIndex = state.patrolIndex % patrol.length;
            const target = patrol[state.patrolIndex];
            const atTarget = state.x === target.x && state.y === target.y;

            if (atTarget) {
                if (Math.random() < 0.3) {
                    state.idleCountdown = 1;
                }
                state.patrolIndex = (state.patrolIndex + 1) % patrol.length;
                npcState.set(npc.id, state);
                console.log(`[NPC] ${npc.name} reached waypoint, next index=${state.patrolIndex}`);
                continue;
            }

            const step = stepToward(state.x, state.y, target.x, target.y);
            state.x = step.x;
            state.y = step.y;
            npcState.set(npc.id, state);
            // Persist to DB (fire-and-forget) so reconnecting clients see current position
            client.nPC.update({ where: { id: npc.id }, data: { x: state.x, y: state.y } })
                .catch(e => console.warn('[NPC] DB update failed:', (e as Error).message));
            console.log(`[NPC] ${npc.name} patrol → (${state.x}, ${state.y}) facing=${step.facing}, broadcasting npc-moved`);
            getRoomManager().broadcastToRoom(
                { type: 'npc-moved', payload: { npcId: npc.id, x: state.x, y: state.y, facing: step.facing } },
                spaceId
            );
        }
    }
}

// 500 ms per step — natural walking pace
setInterval(npcTick, 500);
