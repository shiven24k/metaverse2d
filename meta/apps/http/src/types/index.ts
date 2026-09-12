import z from "zod";

export const SignupSchema = z.object({
    username: z.string(),
    password: z.string(),
    type: z.enum(["user", "admin"]),
})

export const SigninSchema = z.object({
    username: z.string(),
    password: z.string(),
})

export const UpdateMetadataSchema = z.object({
    avatarId: z.string().optional(),
    displayUsername: z.string().min(1).max(50).optional(),
})

export const UpdateUsernameSchema = z.object({
    username: z.string()
        .min(3, "Username must be at least 3 characters")
        .max(20, "Username must be at most 20 characters")
        .regex(/^[a-zA-Z0-9_]+$/, "Username can only contain letters, numbers and underscores"),
})

export const CreateSpaceSchema = z.object({
    name: z.string(),
    dimensions: z.string().regex(/^[0-9]{1,4}x[0-9]{1,4}$/),
    mapId: z.string().optional(),
})

export const DeleteElementSchema = z.object({
    id: z.string(),
})

export const AddElementSchema = z.object({
    spaceId: z.string(),
    elementId: z.string(),
    x: z.number(),
    y: z.number(),
})

export const BatchAddElementSchema = z.object({
    spaceId: z.string(),
    elements: z.array(z.object({
        elementId: z.string(),
        x: z.number(),
        y: z.number(),
    })).min(1).max(100),
})

export const BatchPlaceItemSchema = z.object({
    spaceId: z.string(),
    items: z.array(z.object({
        itemId: z.string(),
        x: z.number(),
        y: z.number(),
        layer: z.enum(["FLOOR", "WALL"]).optional(),
    })).min(1).max(50),
})


export const BatchDeleteElementSchema = z.object({
    spaceId: z.string(),
    ids: z.array(z.string()).min(1).max(200),
});

export const BatchDeleteItemSchema = z.object({
    spaceId: z.string(),
    ids: z.array(z.string()).min(1).max(200),
});

export const CreateElementSchema = z.object({
    imageUrl: z.string(),
    width: z.number(),
    height: z.number(),
    static: z.boolean(),
    blocking: z.boolean().optional(),
})

export const UpdateElementSchema = z.object({
    imageUrl: z.string(),
})

export const CreateAvatarSchema = z.object({
    name: z.string(),
    imageUrl: z.string(),
})

export const CreateMapSchema = z.object({
    thumbnail: z.string(),
    dimensions: z.string().regex(/^[0-9]{1,4}x[0-9]{1,4}$/),
    name: z.string(),
    defaultElements: z.array(z.object({
        elementId: z.string(),
        x: z.number(),  
        y: z.number(),
    }))
})


export const CreateItemSchema = z.object({
    name: z.string(),
    category: z.string(),
    rarity: z.string(),
    imageUrl: z.string(),
    width: z.number(),
    height: z.number(),
    isWallItem: z.boolean().optional(),
    blocking: z.boolean().optional(),
    season: z.string().optional(),
})

export const ResizeSpaceSchema = z.object({
    width: z.number().int().min(5).max(200),
    height: z.number().int().min(5).max(200),
    offsetX: z.number().int().optional(),
    offsetY: z.number().int().optional(),
});

export const CreateInviteSchema = z.object({
    expiresInDays: z.number().int().min(1).max(30).optional(),
    maxUses: z.number().int().min(1).max(1000).optional(),
});

export const MoveCardSchema = z.object({
    columnId: z.string().min(1),
    order: z.number().int().min(0),
});

export const CreateCardCommentSchema = z.object({
    content: z.string().min(1).max(2000),
});

declare global {
    namespace Express {
      export interface Request {
        role?: "Admin" | "User";
        platformRole?: "USER" | "PLATFORM_ADMIN";
        userId?: string;
        rawBody?: Buffer;
      }
    }
}