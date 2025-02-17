import z from 'zod';
//signup
export const SignupSchema = z.object({
    username: z.string().email(),
    password: z.string().min(6),
    type: z.enum(['user', 'admin']),
    });
//signin
export const SigninSchema = z.object({
    username: z.string().email(),
    password: z.string().min(6),
    });
//update metadata
export const UpdateMetadataSchema = z.object({
    avatatid: z.string().uuid(),
    });
//create spacew
export const CreateSpaceSchema = z.object({
    name: z.string(),
    dimensions: z.string().regex(/^[0-9]{1,4}x[0-9]{1,4}$/), //regular expression

    mapId : z.string().uuid(),
    });
//add element
export const AddElemenntSchema = z.object({
    spaceId: z.string().uuid(),
    elementId: z.string().uuid(),
    x: z.number(),
    y: z.number(),
    });

//delete element
export const DeleteElementSchema = z.object({
    id: z.string(),
})
    
//create element
export const CreateElementSchema = z.object({
    imageURL: z.string().url(),
    width: z.number(),
    height: z.number(),
    static: z.boolean(),
    });
//update element
export const UpdateElementSchema = z.object({
    imageURL: z.string().url(),
});
//create avatar
export const CreateAvatarSchema = z.object({
    name: z.string(),
    imageURL: z.string().url(),
    });
//create map
export const CreateMapSchema = z.object({
    thumbnail: z.string(),
    dimensions: z.string().regex(/^[0-9]{1,4}x[0-9]{1,4}$/), //regular expression
    defaultElements: z.array(z.object({
        elementId:z.string().uuid(),
        x: z.number(),
        y: z.number(),
    })),
});

