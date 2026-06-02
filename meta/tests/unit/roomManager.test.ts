import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RoomManager } from '../../apps/ws/src/RoomManager';

// Minimal User stub
function makeUser(id: string, userId = `user-${id}`) {
    return {
        id,
        userId,
        username: `User${id}`,
        x: 0,
        y: 0,
        isGuest: false,
        send: vi.fn(),
    } as any;
}

describe('RoomManager', () => {
    let rm: RoomManager;

    beforeEach(() => {
        // Reset singleton between tests
        (RoomManager as any).instance = undefined;
        rm = RoomManager.getInstance();
    });

    describe('getInstance', () => {
        it('returns the same instance on repeated calls', () => {
            const a = RoomManager.getInstance();
            const b = RoomManager.getInstance();
            expect(a).toBe(b);
        });
    });

    describe('addUser / removeUser', () => {
        it('adds a user to a new room', () => {
            const u = makeUser('a');
            rm.addUser('space1', u);
            expect(rm.rooms.get('space1')).toHaveLength(1);
        });

        it('adds multiple users to the same room', () => {
            rm.addUser('space1', makeUser('a'));
            rm.addUser('space1', makeUser('b'));
            expect(rm.rooms.get('space1')).toHaveLength(2);
        });

        it('removes the correct user', () => {
            const a = makeUser('a');
            const b = makeUser('b');
            rm.addUser('space1', a);
            rm.addUser('space1', b);
            rm.removeUser(a, 'space1');
            const remaining = rm.rooms.get('space1')!;
            expect(remaining).toHaveLength(1);
            expect(remaining[0].id).toBe('b');
        });

        it('removeUser on non-existent room does not throw', () => {
            expect(() => rm.removeUser(makeUser('x'), 'nonexistent')).not.toThrow();
        });

        it('removeUser on a user not in the room leaves room unchanged', () => {
            const a = makeUser('a');
            const b = makeUser('b');
            rm.addUser('space1', a);
            rm.removeUser(b, 'space1'); // b was never added
            expect(rm.rooms.get('space1')).toHaveLength(1);
        });
    });

    describe('broadcast', () => {
        it('sends to all users except the sender', () => {
            const sender = makeUser('sender');
            const peer1  = makeUser('peer1');
            const peer2  = makeUser('peer2');
            rm.addUser('space1', sender);
            rm.addUser('space1', peer1);
            rm.addUser('space1', peer2);

            const msg = { type: 'movement', payload: { userId: 'sender', x: 1, y: 1 } } as any;
            rm.broadcast(msg, sender, 'space1');

            expect(sender.send).not.toHaveBeenCalled();
            // RoomManager.broadcast calls u.send(message) — User.send() does the JSON.stringify
            expect(peer1.send).toHaveBeenCalledWith(msg);
            expect(peer2.send).toHaveBeenCalledWith(msg);
        });

        it('does not throw for an empty/missing room', () => {
            const u = makeUser('x');
            expect(() => rm.broadcast({ type: 'movement', payload: { x: 0, y: 0 } } as any, u, 'ghost')).not.toThrow();
        });

        it('sends to nobody when sender is the only user', () => {
            const u = makeUser('solo');
            rm.addUser('space1', u);
            rm.broadcast({ type: 'movement', payload: { x: 1, y: 1 } } as any, u, 'space1');
            expect(u.send).not.toHaveBeenCalled();
        });
    });

    describe('broadcastToRoom', () => {
        it('sends to ALL users including the implicit sender', () => {
            const a = makeUser('a');
            const b = makeUser('b');
            rm.addUser('space1', a);
            rm.addUser('space1', b);

            const msg = { type: 'npc-moved', payload: { npcId: 'n1', x: 3, y: 4 } } as any;
            rm.broadcastToRoom(msg, 'space1');

            expect(a.send).toHaveBeenCalledWith(msg);
            expect(b.send).toHaveBeenCalledWith(msg);
        });

        it('does not throw for a missing room', () => {
            expect(() => rm.broadcastToRoom({ type: 'npc-moved', payload: {} } as any, 'ghost')).not.toThrow();
        });
    });

    describe('isolation between spaces', () => {
        it('adding to space1 does not affect space2', () => {
            rm.addUser('space1', makeUser('a'));
            rm.addUser('space2', makeUser('b'));
            expect(rm.rooms.get('space1')).toHaveLength(1);
            expect(rm.rooms.get('space2')).toHaveLength(1);
        });

        it('broadcast to space1 does not reach space2 users', () => {
            const sender = makeUser('s');
            const other  = makeUser('o');
            rm.addUser('space1', sender);
            rm.addUser('space2', other);
            rm.broadcast({ type: 'movement', payload: { x: 0, y: 0 } } as any, sender, 'space1');
            expect(other.send).not.toHaveBeenCalled();
        });
    });
});
