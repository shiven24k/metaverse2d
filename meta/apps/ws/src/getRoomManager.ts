import { RoomManager } from "./RoomManager";
import { RedisRoomManager } from "./RedisRoomManager";

const useRedis = process.env.USE_REDIS_ROOMS === "true";

export function getRoomManager(): RoomManager | RedisRoomManager {
    return useRedis ? RedisRoomManager.getInstance() : RoomManager.getInstance();
}
