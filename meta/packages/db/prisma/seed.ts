import { PrismaClient } from "@prisma/client";

const client = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // ─── Elements ──────────────────────────────────────────────────────────────
  const grass = await client.element.upsert({
    where: { id: "el-grass" },
    update: { imageUrl: "/uploads/defaults/grass.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-grass", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/grass.png" },
  });

  const dirt = await client.element.upsert({
    where: { id: "el-dirt" },
    update: { imageUrl: "/uploads/defaults/dirt.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-dirt", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/dirt.png" },
  });

  const water = await client.element.upsert({
    where: { id: "el-water" },
    update: { imageUrl: "/uploads/defaults/water.png", width: 1, height: 1, static: true, blocking: true },
    create: { id: "el-water", width: 1, height: 1, static: true, blocking: true, imageUrl: "/uploads/defaults/water.png" },
  });

  const wall = await client.element.upsert({
    where: { id: "el-wall" },
    update: { imageUrl: "/uploads/defaults/wall.png", width: 1, height: 1, static: true, blocking: true },
    create: { id: "el-wall", width: 1, height: 1, static: true, blocking: true, imageUrl: "/uploads/defaults/wall.png" },
  });

  const path = await client.element.upsert({
    where: { id: "el-path" },
    update: { imageUrl: "/uploads/defaults/path.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-path", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/path.png" },
  });

  const tree = await client.element.upsert({
    where: { id: "el-tree" },
    update: { imageUrl: "/uploads/defaults/tree.png", width: 2, height: 2, static: false, blocking: true },
    create: { id: "el-tree", width: 2, height: 2, static: false, blocking: true, imageUrl: "/uploads/defaults/tree.png" },
  });

  const fence = await client.element.upsert({
    where: { id: "el-fence" },
    update: { imageUrl: "/uploads/defaults/fence.png", width: 1, height: 1, static: true, blocking: true },
    create: { id: "el-fence", width: 1, height: 1, static: true, blocking: true, imageUrl: "/uploads/defaults/fence.png" },
  });

  const flower = await client.element.upsert({
    where: { id: "el-flower" },
    update: { imageUrl: "/uploads/defaults/flower.png", width: 1, height: 1, static: false, blocking: false },
    create: { id: "el-flower", width: 1, height: 1, static: false, blocking: false, imageUrl: "/uploads/defaults/flower.png" },
  });

  // ── New floor/ground tiles ──────────────────────────────────────────────────
  await client.element.upsert({
    where: { id: "el-sand" },
    update: { imageUrl: "/uploads/defaults/sand.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-sand", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/sand.png" },
  });
  await client.element.upsert({
    where: { id: "el-snow" },
    update: { imageUrl: "/uploads/defaults/snow.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-snow", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/snow.png" },
  });
  await client.element.upsert({
    where: { id: "el-lava" },
    update: { imageUrl: "/uploads/defaults/lava.png", width: 1, height: 1, static: true, blocking: true },
    create: { id: "el-lava", width: 1, height: 1, static: true, blocking: true, imageUrl: "/uploads/defaults/lava.png" },
  });
  await client.element.upsert({
    where: { id: "el-cobblestone" },
    update: { imageUrl: "/uploads/defaults/cobblestone.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-cobblestone", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/cobblestone.png" },
  });
  await client.element.upsert({
    where: { id: "el-wood-floor" },
    update: { imageUrl: "/uploads/defaults/wood-floor.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-wood-floor", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/wood-floor.png" },
  });
  await client.element.upsert({
    where: { id: "el-cave-floor" },
    update: { imageUrl: "/uploads/defaults/cave-floor.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-cave-floor", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/cave-floor.png" },
  });

  // ── New nature tiles ────────────────────────────────────────────────────────
  await client.element.upsert({
    where: { id: "el-bush" },
    update: { imageUrl: "/uploads/defaults/bush.png", width: 1, height: 1, static: false, blocking: true },
    create: { id: "el-bush", width: 1, height: 1, static: false, blocking: true, imageUrl: "/uploads/defaults/bush.png" },
  });
  await client.element.upsert({
    where: { id: "el-cactus" },
    update: { imageUrl: "/uploads/defaults/cactus.png", width: 1, height: 1, static: false, blocking: true },
    create: { id: "el-cactus", width: 1, height: 1, static: false, blocking: true, imageUrl: "/uploads/defaults/cactus.png" },
  });
  await client.element.upsert({
    where: { id: "el-rock" },
    update: { imageUrl: "/uploads/defaults/rock.png", width: 1, height: 1, static: false, blocking: true },
    create: { id: "el-rock", width: 1, height: 1, static: false, blocking: true, imageUrl: "/uploads/defaults/rock.png" },
  });
  await client.element.upsert({
    where: { id: "el-mushroom" },
    update: { imageUrl: "/uploads/defaults/mushroom.png", width: 1, height: 1, static: false, blocking: true },
    create: { id: "el-mushroom", width: 1, height: 1, static: false, blocking: true, imageUrl: "/uploads/defaults/mushroom.png" },
  });
  await client.element.upsert({
    where: { id: "el-pine-tree" },
    update: { imageUrl: "/uploads/defaults/pine-tree.png", width: 2, height: 2, static: false, blocking: true },
    create: { id: "el-pine-tree", width: 2, height: 2, static: false, blocking: true, imageUrl: "/uploads/defaults/pine-tree.png" },
  });

  // ── New water variants ──────────────────────────────────────────────────────
  await client.element.upsert({
    where: { id: "el-shallow-water" },
    update: { imageUrl: "/uploads/defaults/shallow-water.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-shallow-water", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/shallow-water.png" },
  });
  await client.element.upsert({
    where: { id: "el-waterfall" },
    update: { imageUrl: "/uploads/defaults/waterfall.png", width: 1, height: 2, static: true, blocking: true },
    create: { id: "el-waterfall", width: 1, height: 2, static: true, blocking: true, imageUrl: "/uploads/defaults/waterfall.png" },
  });

  // ── New structure tiles ─────────────────────────────────────────────────────
  await client.element.upsert({
    where: { id: "el-brick-wall" },
    update: { imageUrl: "/uploads/defaults/brick-wall.png", width: 1, height: 1, static: true, blocking: true },
    create: { id: "el-brick-wall", width: 1, height: 1, static: true, blocking: true, imageUrl: "/uploads/defaults/brick-wall.png" },
  });
  await client.element.upsert({
    where: { id: "el-window" },
    update: { imageUrl: "/uploads/defaults/window.png", width: 1, height: 1, static: true, blocking: true },
    create: { id: "el-window", width: 1, height: 1, static: true, blocking: true, imageUrl: "/uploads/defaults/window.png" },
  });
  await client.element.upsert({
    where: { id: "el-door" },
    update: { imageUrl: "/uploads/defaults/door.png", width: 1, height: 2, static: false, blocking: false },
    create: { id: "el-door", width: 1, height: 2, static: false, blocking: false, imageUrl: "/uploads/defaults/door.png" },
  });
  await client.element.upsert({
    where: { id: "el-roof" },
    update: { imageUrl: "/uploads/defaults/roof.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-roof", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/roof.png" },
  });
  await client.element.upsert({
    where: { id: "el-chest" },
    update: { imageUrl: "/uploads/defaults/chest.png", width: 1, height: 1, static: false, blocking: true },
    create: { id: "el-chest", width: 1, height: 1, static: false, blocking: true, imageUrl: "/uploads/defaults/chest.png" },
  });

  // ── Office tiles ────────────────────────────────────────────────────────────
  await client.element.upsert({
    where: { id: "el-office-carpet" },
    update: { imageUrl: "/uploads/defaults/office-carpet.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-office-carpet", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/office-carpet.png" },
  });
  await client.element.upsert({
    where: { id: "el-office-floor" },
    update: { imageUrl: "/uploads/defaults/office-floor.png", width: 1, height: 1, static: true, blocking: false },
    create: { id: "el-office-floor", width: 1, height: 1, static: true, blocking: false, imageUrl: "/uploads/defaults/office-floor.png" },
  });
  await client.element.upsert({
    where: { id: "el-glass-wall" },
    update: { imageUrl: "/uploads/defaults/glass-wall.png", width: 1, height: 1, static: true, blocking: true },
    create: { id: "el-glass-wall", width: 1, height: 1, static: true, blocking: true, imageUrl: "/uploads/defaults/glass-wall.png" },
  });

  console.log("Elements created");

  // ─── Items ─────────────────────────────────────────────────────────────────
  const sofa = await client.item.upsert({
    where: { id: "item-sofa" },
    update: { name: "Sofa", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/sofa.png", width: 2, height: 1, blocking: true },
    create: { id: "item-sofa", name: "Sofa", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/sofa.png", width: 2, height: 1, blocking: true },
  });

  const table = await client.item.upsert({
    where: { id: "item-table" },
    update: { name: "Table", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/table.png", width: 2, height: 1, blocking: true },
    create: { id: "item-table", name: "Table", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/table.png", width: 2, height: 1, blocking: true },
  });

  const chair = await client.item.upsert({
    where: { id: "item-chair" },
    update: { name: "Chair", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/chair.png", width: 1, height: 1, blocking: true },
    create: { id: "item-chair", name: "Chair", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/chair.png", width: 1, height: 1, blocking: true },
  });

  const rug = await client.item.upsert({
    where: { id: "item-rug" },
    update: { name: "Rug", category: "Floor", rarity: "Common", imageUrl: "/uploads/defaults/rug.png", width: 3, height: 2, blocking: false },
    create: { id: "item-rug", name: "Rug", category: "Floor", rarity: "Common", imageUrl: "/uploads/defaults/rug.png", width: 3, height: 2, blocking: false },
  });

  const lamp = await client.item.upsert({
    where: { id: "item-lamp" },
    update: { name: "Floor Lamp", category: "Decoration", rarity: "Uncommon", imageUrl: "/uploads/defaults/lamp.png", width: 1, height: 1, blocking: true },
    create: { id: "item-lamp", name: "Floor Lamp", category: "Decoration", rarity: "Uncommon", imageUrl: "/uploads/defaults/lamp.png", width: 1, height: 1, blocking: true },
  });

  const painting = await client.item.upsert({
    where: { id: "item-painting" },
    update: { name: "Painting", category: "Wall", rarity: "Uncommon", imageUrl: "/uploads/defaults/painting.png", width: 2, height: 1, isWallItem: true, blocking: false },
    create: { id: "item-painting", name: "Painting", category: "Wall", rarity: "Uncommon", imageUrl: "/uploads/defaults/painting.png", width: 2, height: 1, isWallItem: true, blocking: false },
  });

  const plant = await client.item.upsert({
    where: { id: "item-plant" },
    update: { name: "Potted Plant", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/plant.png", width: 1, height: 1, blocking: true },
    create: { id: "item-plant", name: "Potted Plant", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/plant.png", width: 1, height: 1, blocking: true },
  });

  const bookshelf = await client.item.upsert({
    where: { id: "item-bookshelf" },
    update: { name: "Bookshelf", category: "Furniture", rarity: "Uncommon", imageUrl: "/uploads/defaults/bookshelf.png", width: 1, height: 2, blocking: true },
    create: { id: "item-bookshelf", name: "Bookshelf", category: "Furniture", rarity: "Uncommon", imageUrl: "/uploads/defaults/bookshelf.png", width: 1, height: 2, blocking: true },
  });

  const crystal = await client.item.upsert({
    where: { id: "item-crystal" },
    update: { name: "Crystal", category: "Decoration", rarity: "Rare", imageUrl: "/uploads/defaults/crystal.png", width: 1, height: 1, blocking: false },
    create: { id: "item-crystal", name: "Crystal", category: "Decoration", rarity: "Rare", imageUrl: "/uploads/defaults/crystal.png", width: 1, height: 1, blocking: false },
  });

  const throne = await client.item.upsert({
    where: { id: "item-throne" },
    update: { name: "Throne", category: "Furniture", rarity: "Legacy", imageUrl: "/uploads/defaults/throne.png", width: 2, height: 2, blocking: true },
    create: { id: "item-throne", name: "Throne", category: "Furniture", rarity: "Legacy", imageUrl: "/uploads/defaults/throne.png", width: 2, height: 2, blocking: true },
  });

  // ── New items ───────────────────────────────────────────────────────────────
  await client.item.upsert({
    where: { id: "item-bed" },
    update: { name: "Bed", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/bed.png", width: 2, height: 1, blocking: true },
    create: { id: "item-bed", name: "Bed", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/bed.png", width: 2, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-counter" },
    update: { name: "Counter", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/counter.png", width: 2, height: 1, blocking: true },
    create: { id: "item-counter", name: "Counter", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/counter.png", width: 2, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-barrel" },
    update: { name: "Barrel", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/barrel.png", width: 1, height: 1, blocking: true },
    create: { id: "item-barrel", name: "Barrel", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/barrel.png", width: 1, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-sign" },
    update: { name: "Sign", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/sign.png", width: 1, height: 1, blocking: false },
    create: { id: "item-sign", name: "Sign", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/sign.png", width: 1, height: 1, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-campfire" },
    update: { name: "Campfire", category: "Decoration", rarity: "Uncommon", imageUrl: "/uploads/defaults/campfire.png", width: 1, height: 1, blocking: false },
    create: { id: "item-campfire", name: "Campfire", category: "Decoration", rarity: "Uncommon", imageUrl: "/uploads/defaults/campfire.png", width: 1, height: 1, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-fountain" },
    update: { name: "Fountain", category: "Decoration", rarity: "Rare", imageUrl: "/uploads/defaults/fountain.png", width: 2, height: 2, blocking: true },
    create: { id: "item-fountain", name: "Fountain", category: "Decoration", rarity: "Rare", imageUrl: "/uploads/defaults/fountain.png", width: 2, height: 2, blocking: true },
  });

  // ── Office items ────────────────────────────────────────────────────────────
  await client.item.upsert({
    where: { id: "item-office-desk" },
    update: { name: "Office Desk", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/office-desk.png", width: 2, height: 1, blocking: true },
    create: { id: "item-office-desk", name: "Office Desk", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/office-desk.png", width: 2, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-office-chair" },
    update: { name: "Office Chair", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/office-chair.png", width: 1, height: 1, blocking: false },
    create: { id: "item-office-chair", name: "Office Chair", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/office-chair.png", width: 1, height: 1, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-computer" },
    update: { name: "Computer", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/computer.png", width: 1, height: 1, blocking: true },
    create: { id: "item-computer", name: "Computer", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/computer.png", width: 1, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-whiteboard" },
    update: { name: "Whiteboard", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/whiteboard.png", width: 2, height: 1, isWallItem: true, blocking: false },
    create: { id: "item-whiteboard", name: "Whiteboard", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/whiteboard.png", width: 2, height: 1, isWallItem: true, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-coffee-machine" },
    update: { name: "Coffee Machine", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/coffee-machine.png", width: 1, height: 1, blocking: true },
    create: { id: "item-coffee-machine", name: "Coffee Machine", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/coffee-machine.png", width: 1, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-filing-cabinet" },
    update: { name: "Filing Cabinet", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/filing-cabinet.png", width: 1, height: 2, blocking: true },
    create: { id: "item-filing-cabinet", name: "Filing Cabinet", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/filing-cabinet.png", width: 1, height: 2, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-meeting-table" },
    update: { name: "Meeting Table", category: "Office", rarity: "Rare", imageUrl: "/uploads/defaults/meeting-table.png", width: 3, height: 2, blocking: true },
    create: { id: "item-meeting-table", name: "Meeting Table", category: "Office", rarity: "Rare", imageUrl: "/uploads/defaults/meeting-table.png", width: 3, height: 2, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-vending-machine" },
    update: { name: "Vending Machine", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/vending-machine.png", width: 1, height: 2, blocking: true },
    create: { id: "item-vending-machine", name: "Vending Machine", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/vending-machine.png", width: 1, height: 2, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-office-printer" },
    update: { name: "Printer", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/office-printer.png", width: 1, height: 1, blocking: true },
    create: { id: "item-office-printer", name: "Printer", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/office-printer.png", width: 1, height: 1, blocking: true },
  });

  // ── Extended items ──────────────────────────────────────────────────────────
  await client.item.upsert({
    where: { id: "item-armchair" },
    update: { name: "Armchair", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/armchair.png", width: 1, height: 1, blocking: true },
    create: { id: "item-armchair", name: "Armchair", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/armchair.png", width: 1, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-coffee-table" },
    update: { name: "Coffee Table", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/coffee-table.png", width: 2, height: 1, blocking: true },
    create: { id: "item-coffee-table", name: "Coffee Table", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/coffee-table.png", width: 2, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-kitchen-counter" },
    update: { name: "Kitchen Counter", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/kitchen-counter.png", width: 2, height: 1, blocking: true },
    create: { id: "item-kitchen-counter", name: "Kitchen Counter", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/kitchen-counter.png", width: 2, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-microwave" },
    update: { name: "Microwave", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/microwave.png", width: 1, height: 1, blocking: true },
    create: { id: "item-microwave", name: "Microwave", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/microwave.png", width: 1, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-mini-fridge" },
    update: { name: "Mini Fridge", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/mini-fridge.png", width: 1, height: 1, blocking: true },
    create: { id: "item-mini-fridge", name: "Mini Fridge", category: "Furniture", rarity: "Common", imageUrl: "/uploads/defaults/mini-fridge.png", width: 1, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-tall-plant" },
    update: { name: "Tall Plant", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/tall-plant.png", width: 1, height: 1, blocking: true },
    create: { id: "item-tall-plant", name: "Tall Plant", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/tall-plant.png", width: 1, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-trash-bin" },
    update: { name: "Trash Bin", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/trash-bin.png", width: 1, height: 1, blocking: false },
    create: { id: "item-trash-bin", name: "Trash Bin", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/trash-bin.png", width: 1, height: 1, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-recycling-bin" },
    update: { name: "Recycling Bin", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/recycling-bin.png", width: 1, height: 1, blocking: false },
    create: { id: "item-recycling-bin", name: "Recycling Bin", category: "Decoration", rarity: "Common", imageUrl: "/uploads/defaults/recycling-bin.png", width: 1, height: 1, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-phone-booth" },
    update: { name: "Phone Booth", category: "Decoration", rarity: "Uncommon", imageUrl: "/uploads/defaults/phone-booth.png", width: 1, height: 2, blocking: true },
    create: { id: "item-phone-booth", name: "Phone Booth", category: "Decoration", rarity: "Uncommon", imageUrl: "/uploads/defaults/phone-booth.png", width: 1, height: 2, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-copier" },
    update: { name: "Copier", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/copier.png", width: 1, height: 1, blocking: true },
    create: { id: "item-copier", name: "Copier", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/copier.png", width: 1, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-corkboard" },
    update: { name: "Corkboard", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/corkboard.png", width: 2, height: 1, isWallItem: true, blocking: false },
    create: { id: "item-corkboard", name: "Corkboard", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/corkboard.png", width: 2, height: 1, isWallItem: true, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-desk-phone" },
    update: { name: "Desk Phone", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/desk-phone.png", width: 1, height: 1, blocking: false },
    create: { id: "item-desk-phone", name: "Desk Phone", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/desk-phone.png", width: 1, height: 1, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-dual-monitor" },
    update: { name: "Dual Monitor", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/dual-monitor.png", width: 2, height: 1, blocking: false },
    create: { id: "item-dual-monitor", name: "Dual Monitor", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/dual-monitor.png", width: 2, height: 1, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-flip-chart" },
    update: { name: "Flip Chart", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/flip-chart.png", width: 1, height: 2, blocking: true },
    create: { id: "item-flip-chart", name: "Flip Chart", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/flip-chart.png", width: 1, height: 2, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-laptop" },
    update: { name: "Laptop", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/laptop.png", width: 1, height: 1, blocking: false },
    create: { id: "item-laptop", name: "Laptop", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/laptop.png", width: 1, height: 1, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-reception-desk" },
    update: { name: "Reception Desk", category: "Office", rarity: "Rare", imageUrl: "/uploads/defaults/reception-desk.png", width: 3, height: 1, blocking: true },
    create: { id: "item-reception-desk", name: "Reception Desk", category: "Office", rarity: "Rare", imageUrl: "/uploads/defaults/reception-desk.png", width: 3, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-server-rack" },
    update: { name: "Server Rack", category: "Office", rarity: "Rare", imageUrl: "/uploads/defaults/server-rack.png", width: 1, height: 2, blocking: true },
    create: { id: "item-server-rack", name: "Server Rack", category: "Office", rarity: "Rare", imageUrl: "/uploads/defaults/server-rack.png", width: 1, height: 2, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-standing-desk" },
    update: { name: "Standing Desk", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/standing-desk.png", width: 2, height: 1, blocking: true },
    create: { id: "item-standing-desk", name: "Standing Desk", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/standing-desk.png", width: 2, height: 1, blocking: true },
  });
  await client.item.upsert({
    where: { id: "item-wall-tv" },
    update: { name: "Wall TV", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/wall-tv.png", width: 2, height: 1, isWallItem: true, blocking: false },
    create: { id: "item-wall-tv", name: "Wall TV", category: "Office", rarity: "Uncommon", imageUrl: "/uploads/defaults/wall-tv.png", width: 2, height: 1, isWallItem: true, blocking: false },
  });
  await client.item.upsert({
    where: { id: "item-water-cooler" },
    update: { name: "Water Cooler", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/water-cooler.png", width: 1, height: 1, blocking: true },
    create: { id: "item-water-cooler", name: "Water Cooler", category: "Office", rarity: "Common", imageUrl: "/uploads/defaults/water-cooler.png", width: 1, height: 1, blocking: true },
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
    update: { name: "Default", imageUrl: "/uploads/defaults/avatar-default.png" },
    create: { id: "avatar-default", name: "Default", imageUrl: "/uploads/defaults/avatar-default.png" },
  });

  await client.avatar.upsert({
    where: { id: "avatar-ninja" },
    update: { name: "Ninja", imageUrl: "/uploads/defaults/avatar-ninja.png" },
    create: { id: "avatar-ninja", name: "Ninja", imageUrl: "/uploads/defaults/avatar-ninja.png" },
  });

  await client.avatar.upsert({
    where: { id: "avatar-wizard" },
    update: { name: "Wizard", imageUrl: "/uploads/defaults/avatar-wizard.png" },
    create: { id: "avatar-wizard", name: "Wizard", imageUrl: "/uploads/defaults/avatar-wizard.png" },
  });

  console.log("Avatars created");

  // ─── NPCs: seed 3 office NPCs into every space that has none ─────────────────
  const spaces = await client.space.findMany({ select: { id: true, width: true, height: true } });
  for (const space of spaces) {
    const existing = await client.nPC.count({ where: { spaceId: space.id } });
    if (existing > 0) continue;

    const w = space.width;
    const h = space.height;
    const cx = Math.floor(w / 2);
    const cy = Math.floor(h / 2);

    await client.nPC.createMany({
      data: [
        {
          spaceId: space.id,
          name: "Manager Mike",
          sprite: "avatar-default",
          dialogues: [
            "Good morning! The Q3 report is due by EOD.",
            "Have you checked your emails today? We have a 10am standup.",
            "Great work on that last sprint. Keep it up, team!",
          ],
          x: Math.max(1, cx - 3),
          y: Math.max(1, cy - 3),
          patrolPath: [
            { x: Math.max(1, cx - 3), y: Math.max(1, cy - 3) },
            { x: Math.min(w - 2, cx - 1), y: Math.max(1, cy - 3) },
            { x: Math.min(w - 2, cx - 1), y: Math.min(h - 2, cy - 1) },
            { x: Math.max(1, cx - 3), y: Math.min(h - 2, cy - 1) },
          ],
        },
        {
          spaceId: space.id,
          name: "Dev Dana",
          sprite: "avatar-ninja",
          dialogues: [
            "I'm in the zone — just pushed a fix for the auth bug!",
            "Has anyone reviewed my PR? It's been sitting for two days...",
            "Pro tip: press F near an Office Chair to sit and work!",
          ],
          x: Math.min(w - 2, cx + 3),
          y: Math.max(1, cy - 2),
          patrolPath: [
            { x: Math.min(w - 2, cx + 3), y: Math.max(1, cy - 2) },
            { x: Math.min(w - 2, cx + 5), y: Math.max(1, cy - 2) },
            { x: Math.min(w - 2, cx + 5), y: Math.min(h - 2, cy + 2) },
            { x: Math.min(w - 2, cx + 3), y: Math.min(h - 2, cy + 2) },
          ],
        },
        {
          spaceId: space.id,
          name: "HR Helen",
          sprite: "avatar-wizard",
          dialogues: [
            "Don't forget to log your hours in the time tracker!",
            "PTO requests must be submitted two weeks in advance.",
            "We're hosting a team lunch on Friday — RSVP in Slack!",
          ],
          x: Math.max(1, cx - 1),
          y: Math.min(h - 2, cy + 4),
          patrolPath: [
            { x: Math.max(1, cx - 1), y: Math.min(h - 2, cy + 4) },
            { x: Math.min(w - 2, cx + 2), y: Math.min(h - 2, cy + 4) },
            { x: Math.min(w - 2, cx + 2), y: Math.min(h - 2, cy + 6) },
            { x: Math.max(1, cx - 1), y: Math.min(h - 2, cy + 6) },
          ],
        },
      ],
    });
  }
  console.log("NPCs seeded");

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
