import { PrismaClient } from "@prisma/client";

const client = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ─── Elements ──────────────────────────────────────────────────────────────
  const grass = await client.element.upsert({
    where: { id: "el-grass" },
    update: {},
    create: { id: "el-grass", width: 1, height: 1, static: true, imageUrl: "/uploads/defaults/grass.png" },
  });

  const dirt = await client.element.upsert({
    where: { id: "el-dirt" },
    update: {},
    create: { id: "el-dirt", width: 1, height: 1, static: true, imageUrl: "/uploads/defaults/dirt.png" },
  });

  const water = await client.element.upsert({
    where: { id: "el-water" },
    update: {},
    create: { id: "el-water", width: 1, height: 1, static: true, imageUrl: "/uploads/defaults/water.png" },
  });

  const wall = await client.element.upsert({
    where: { id: "el-wall" },
    update: {},
    create: { id: "el-wall", width: 1, height: 1, static: true, imageUrl: "/uploads/defaults/wall.png" },
  });

  const path = await client.element.upsert({
    where: { id: "el-path" },
    update: {},
    create: { id: "el-path", width: 1, height: 1, static: true, imageUrl: "/uploads/defaults/path.png" },
  });

  const tree = await client.element.upsert({
    where: { id: "el-tree" },
    update: {},
    create: { id: "el-tree", width: 2, height: 2, static: false, imageUrl: "/uploads/defaults/tree.png" },
  });

  const fence = await client.element.upsert({
    where: { id: "el-fence" },
    update: {},
    create: { id: "el-fence", width: 1, height: 1, static: true, imageUrl: "/uploads/defaults/fence.png" },
  });

  const flower = await client.element.upsert({
    where: { id: "el-flower" },
    update: {},
    create: { id: "el-flower", width: 1, height: 1, static: false, imageUrl: "/uploads/defaults/flower.png" },
  });

  console.log("Elements created");

  // ─── Items ─────────────────────────────────────────────────────────────────
  const sofa = await client.item.upsert({
    where: { id: "item-sofa" },
    update: {},
    create: { id: "item-sofa", name: "Sofa", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/sofa.png", width: 2, height: 1 },
  });

  const table = await client.item.upsert({
    where: { id: "item-table" },
    update: {},
    create: { id: "item-table", name: "Table", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/table.png", width: 2, height: 1 },
  });

  const chair = await client.item.upsert({
    where: { id: "item-chair" },
    update: {},
    create: { id: "item-chair", name: "Chair", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/chair.png", width: 1, height: 1 },
  });

  const rug = await client.item.upsert({
    where: { id: "item-rug" },
    update: {},
    create: { id: "item-rug", name: "Rug", category: "Floor", rarity: "Common", imageUrl: "/uploads/defaults/rug.png", width: 3, height: 2 },
  });

  const lamp = await client.item.upsert({
    where: { id: "item-lamp" },
    update: {},
    create: { id: "item-lamp", name: "Floor Lamp", category: "Decoration", rarity: "Uncommon", imageUrl: "/uploads/defaults/lamp.png", width: 1, height: 1 },
  });

  const painting = await client.item.upsert({
    where: { id: "item-painting" },
    update: {},
    create: { id: "item-painting", name: "Painting", category: "Wall", rarity: "Uncommon", imageUrl: "/uploads/defaults/painting.png", width: 2, height: 1, isWallItem: true },
  });

  const plant = await client.item.upsert({
    where: { id: "item-plant" },
    update: {},
    create: { id: "item-plant", name: "Potted Plant", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/plant.png", width: 1, height: 1 },
  });

  const bookshelf = await client.item.upsert({
    where: { id: "item-bookshelf" },
    update: {},
    create: { id: "item-bookshelf", name: "Bookshelf", category: "Furniture", rarity: "Uncommon", imageUrl: "/uploads/defaults/bookshelf.png", width: 1, height: 2 },
  });

  const crystal = await client.item.upsert({
    where: { id: "item-crystal" },
    update: {},
    create: { id: "item-crystal", name: "Crystal", category: "Decoration", rarity: "Rare", imageUrl: "/uploads/defaults/crystal.png", width: 1, height: 1 },
  });

  const throne = await client.item.upsert({
    where: { id: "item-throne" },
    update: {},
    create: { id: "item-throne", name: "Throne", category: "Furniture", rarity: "Legacy", imageUrl: "/uploads/defaults/throne.png", width: 2, height: 2 },
  });

  console.log("Items created");

  // ─── Map ────────────────────────────────────────────────────────────────────
  const parkMap = await client.map.upsert({
    where: { id: "map-park" },
    update: {},
    create: {
      id: "map-park",
      name: "Park",
      width: 20,
      height: 20,
      thumbnail: "",
      mapElements: {
        create: [
          { elementId: grass.id, x: 0, y: 0 },
          { elementId: grass.id, x: 1, y: 0 },
          { elementId: grass.id, x: 2, y: 0 },
          { elementId: grass.id, x: 0, y: 1 },
          { elementId: path.id, x: 1, y: 1 },
          { elementId: grass.id, x: 2, y: 1 },
          { elementId: grass.id, x: 0, y: 2 },
          { elementId: grass.id, x: 1, y: 2 },
          { elementId: grass.id, x: 2, y: 2 },
          { elementId: tree.id, x: 5, y: 5 },
          { elementId: tree.id, x: 8, y: 3 },
          { elementId: flower.id, x: 3, y: 6 },
          { elementId: flower.id, x: 6, y: 8 },
        ],
      },
    },
  });

  const gardenMap = await client.map.upsert({
    where: { id: "map-garden" },
    update: {},
    create: {
      id: "map-garden",
      name: "Garden",
      width: 15,
      height: 15,
      thumbnail: "",
      mapElements: {
        create: [
          { elementId: grass.id, x: 0, y: 0 },
          { elementId: grass.id, x: 1, y: 0 },
          { elementId: grass.id, x: 2, y: 0 },
          { elementId: grass.id, x: 0, y: 1 },
          { elementId: grass.id, x: 1, y: 1 },
          { elementId: grass.id, x: 2, y: 1 },
          { elementId: grass.id, x: 0, y: 2 },
          { elementId: grass.id, x: 1, y: 2 },
          { elementId: grass.id, x: 2, y: 2 },
          { elementId: fence.id, x: 0, y: 4 },
          { elementId: fence.id, x: 1, y: 4 },
          { elementId: fence.id, x: 2, y: 4 },
          { elementId: flower.id, x: 4, y: 2 },
          { elementId: flower.id, x: 5, y: 3 },
          { elementId: tree.id, x: 6, y: 6 },
        ],
      },
    },
  });

  console.log("Maps created");

  // ─── Avatars ────────────────────────────────────────────────────────────────
  await client.avatar.upsert({
    where: { id: "avatar-default" },
    update: {},
    create: { id: "avatar-default", name: "Default", imageUrl: "/uploads/defaults/avatar-default.png" },
  });

  await client.avatar.upsert({
    where: { id: "avatar-ninja" },
    update: {},
    create: { id: "avatar-ninja", name: "Ninja", imageUrl: "/uploads/defaults/avatar-ninja.png" },
  });

  await client.avatar.upsert({
    where: { id: "avatar-wizard" },
    update: {},
    create: { id: "avatar-wizard", name: "Wizard", imageUrl: "/uploads/defaults/avatar-wizard.png" },
  });

  console.log("Avatars created");
  console.log("Seed complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await client.$disconnect();
  });
