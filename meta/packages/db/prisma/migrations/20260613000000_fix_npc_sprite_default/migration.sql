-- Change the NPC sprite column default from the invalid "avatar-default" to "avatar-intern"
ALTER TABLE "NPC" ALTER COLUMN "sprite" SET DEFAULT 'avatar-intern';

-- Backfill any existing NPCs whose sprite is not one of the six valid avatar assets.
-- This covers NPCs seeded before the fix (avatar-default, avatar-ninja, avatar-wizard, etc.).
UPDATE "NPC"
SET sprite = CASE
    WHEN name ILIKE '%manager%' OR name ILIKE '%ceo%' THEN 'avatar-ceo'
    WHEN name ILIKE '%dev%'    OR name ILIKE '%dana%' THEN 'avatar-dev'
    WHEN name ILIKE '%hr%'     OR name ILIKE '%helen%' THEN 'avatar-hr'
    ELSE 'avatar-intern'
END
WHERE sprite NOT IN ('avatar-ceo','avatar-dev','avatar-designer','avatar-hr','avatar-marketing','avatar-intern');
