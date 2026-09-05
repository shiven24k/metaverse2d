# Database Package — `packages/db`

The shared Prisma + PostgreSQL package. Every service (`http`, `ws`) imports the client from `@repo/db/client`. Schema lives in `prisma/schema.prisma`; migrations are plain SQL; seeding is idempotent.

```
meta/packages/db/
├── src/
│   └── index.ts           re-exports PrismaClient (used as @repo/db/client)
├── prisma/
│   ├── schema.prisma      All models + enums
│   ├── seed.ts            Idempotent seed (upserts)
│   └── migrations/        Plain SQL migrations, applied manually
└── package.json
```

---

## 1. Working with it

```bash
# Regenerate the client after any schema change (pin the version!)
npx prisma@6.3.1 generate --schema=packages/db/prisma/schema.prisma

# Apply a migration (plain SQL — no `prisma migrate dev`)
psql "$DATABASE_URL" -f packages/db/prisma/migrations/<dir>/migration.sql
# or
DATABASE_URL=... npx prisma@6.3.1 db execute --file <dir>/migration.sql --schema prisma/schema.prisma

# Seed
pnpm --filter @repo/db seed
```

> ⚠️ The globally-installed Prisma (if 7.x) rejects `url = env(...)`. Always use the project-pinned **prisma@6.3.1**.

---

## 2. Model reference

### Auth / user domain
| Model | Purpose | Notable fields |
|-------|---------|----------------|
| `User` | Player account | `username` (unique, optional), `name`, `email`, `password?`, `avatarId?`, `role` (`Role`), `displayUsername?`, `image?`, `supporter` |
| `Session` | better-auth session | `token` (unique), `expiresAt`, `userId` |
| `Account` | better-auth OAuth accounts | `providerId`, `accountId`, tokens |
| `Verification` | better-auth email verification | `identifier`, `value`, `expiresAt` |

### Spaces & world
| Model | Purpose | Notable fields |
|-------|---------|----------------|
| `Space` | A 2D world | `width`, `height`, `name`, `thumbnail?`, `isPrivate`, `creatorId`; relations: `elements`, `placedItems`, `npcs`, `fromPortals/toPortals`, `kanbanBoard`, `members`, `invites`, `guestbook` |
| `spaceElements` | Tiles placed in a space | `spaceId`, `elementId`, `x`, `y` |
| `Element` | Element type catalogue | `width`, `height`, `static`, `imageUrl`, `blocking` |
| `Map` / `MapElements` | Map templates for space creation | template `width/height/name/thumbnail` + default elements |
| `Avatar` | Avatar definitions | `imageUrl`, `name` |
| `PlacedItem` | An item placed in a space | `x`, `y`, `layer` (`FLOOR/WALL`), `metadata Json?` (sign text etc.) |
| `NPC` | Non-player characters | `sprite`, `dialogues[]`, `x/y`, `patrolPath Json`, `motionType` (`NPCMotion`), `wanderRadius` |
| `SpacePortal` | Edge-to-edge link between spaces | `fromSpaceId`, `toSpaceId`, `fromEdge/toEdge` (`SpaceEdge`), `label` |
| `SpaceMember` | Membership of a space (owner/member) | `role` (`SpaceMemberRole`), unique `(spaceId, userId)` |
| `SpaceInvite` | Invite links for private spaces | `token` (unique), `expiresAt?`, `maxUses?`, `useCount` |

### Inventory & economy
| Model | Purpose | Notable fields |
|-------|---------|----------------|
| `Item` | Item catalogue | `category`, `rarity`, `width/height`, `isWallItem`, `blocking`, `season?` |
| `InventoryItem` | User's owned items | `quantity`, unique `(userId, itemId)` |
| `Wallet` | Currency | `coins`, `tokens`, `stars` (one per user) |
| `DailyGift` | Daily-claim tracker | `lastClaim`, `streak` (one per user) |
| `ChestInteraction` | Chest cooldown | `lastAt`, unique `(userId, placedItemId)` |

### Social / retention
| Model | Purpose | Notable fields |
|-------|---------|----------------|
| `GuestbookEntry` | Per-space guestbook | `message`, `spaceId`, `userId` |
| `Quest` / `QuestProgress` | Weekly quests + progress | `goalCount`, `rewardType/rewardValue`, `week`; unique `(userId, questId)` |
| `Report` | Moderation queue | `reporterId`, `targetUserId?`, `targetMessageId?`, `reason`, `resolved` |
| `BannedUser` | Ban list | `reason`, unique `userId` |
| `Season` / `SeasonalItem` | Time-limited content | `startDate/endDate`, `theme`; unique `(seasonId, itemId)` |
| `Neighbourhood` / `NeighbourhoodMember` | Auto-assigned groups of 8 | unique `userId` on member |

### Office / teamwork
| Model | Purpose | Notable fields |
|-------|---------|----------------|
| `KanbanBoard` | One per space | `name`, unique `spaceId` |
| `KanbanColumn` | Board column | `name`, `order`, `color` |
| `KanbanCard` | Task card | `title`, `description`, `assigneeId?`, `priority` (`KanbanPriority`), `dueDate?`, `order` |
| `KanbanComment` | Card comment | `content`, `cardId`, `userId` |

### Proximity chat
| Model | Purpose | Notable fields |
|-------|---------|----------------|
| `ProximityRoom` | One per deterministic room key | `roomKey` (unique), `spaceId` |
| `ProximityChatMessage` | Persisted nearby chat | `senderId`, `senderName`, `content`, `isSystem`, `roomId` |

### Enums
`Role` (Admin/User) · `SpaceMemberRole` (OWNER/MEMBER) · `NPCMotion` (STATIC/PATROL/WANDER) · `SpaceEdge` (NORTH/SOUTH/EAST/WEST) · `Layer` (FLOOR/WALL) · `KanbanPriority` (LOW/MEDIUM/HIGH/URGENT)

---

## 3. Migration history (by date)

| Migration | What it added |
|-----------|---------------|
| `20250215133514_init` | Initial schema |
| `20250217060958` | Password non-unique |
| `20250217064043` | avatarId optional |
| `20250218050510` | Required fields: `Element.static`, `Map.thumbnail`, `Space.height` NOT NULL |
| `20260522151421` | better-auth tables (Session/Account/Verification) |
| `20260522151651` | Username plugin fields |
| `20260523132801` | Inventory + wallet models |
| `20260523144125` | Phase 3 social models (guestbook, quests, reports) |
| `20260523144730` | Phase 4 models (seasons, neighbourhoods, daily gift, banned users) |
| `20260529181930` | `blocking` field on elements/items |
| `20260601192255` | NPC metadata + chest interaction |
| `20260602000000` | Space portal |
| `20260603000000` | NPC motion (STATIC/PATROL/WANDER + patrolPath) |
| `20260608183137` | Edge portals (fromEdge/toEdge) |
| `20260609000000` | Kanban board |
| `20260609165524` | Space privacy + members |
| `20260613000000` | NPC sprite default fix |
| `20260617000000` | Proximity chat |

---

## 4. Seed data (`prisma/seed.ts`)

Idempotent (`upsert` by fixed id). Seeds in order:

1. **Elements** — grass, dirt, water, wall, path, tree, fence, flower + sand, snow, lava, cobblestone, wood-floor, cave-floor, bush, cactus, rock, mushroom, pine-tree, shallow-water, waterfall, brick-wall, window, door, roof, chest, office-carpet, office-floor, glass-wall.
2. **Items** — furniture, decor, office equipment, interactive items (sign, campfire, fountain), economy chest. Rarities Common → Legacy.
3. **Map templates** — Park (20×20), Garden (15×15).
4. **Avatars** — CEO, Developer, Designer, HR Manager, Marketing, Intern.
5. **Office NPCs** — for every existing space with 0 NPCs: Manager Mike, Dev Dana, HR Helen, Explorer Erik, Guide Bob, Merchant Maya (all PATROL with scaled waypoints).

New spaces created via the API get **3** of these NPCs automatically (`makeDefaultNpcs` in `space.ts`), so seeding only backfills pre-existing spaces.