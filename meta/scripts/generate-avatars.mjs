import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'apps', 'http', 'uploads', 'defaults');

mkdirSync(OUT, { recursive: true });

const CW = 32, CH = 48, COLS = 4, ROWS = 2;

function head(ctx, x, y, skin, hair) {
  // Hair top
  ctx.fillStyle = hair;
  ctx.fillRect(x + 9, y + 0, 14, 3);
  ctx.fillRect(x + 7, y + 1, 18, 3);
  // Head circle (skin)
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + 16, y + 10, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x + 6, y + 10, 20, 6);
  // Eyes
  ctx.fillStyle = '#222';
  ctx.fillRect(x + 11, y + 8, 2, 2);
  ctx.fillRect(x + 19, y + 8, 2, 2);
  // Mouth
  ctx.fillRect(x + 14, y + 13, 4, 1);
  // Hair sides
  ctx.fillStyle = hair;
  ctx.fillRect(x + 5, y + 3, 2, 5);
  ctx.fillRect(x + 25, y + 3, 2, 5);
}

function body(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x + 8, y, 16, 16);
  // Collar
  ctx.fillStyle = '#ddd';
  ctx.fillRect(x + 10, y, 12, 2);
}

function legs(ctx, x, y, pants, shoes, leftOff, rightOff) {
  ctx.fillStyle = pants;
  ctx.fillRect(x + 8, y + leftOff, 6, 10);
  ctx.fillRect(x + 18, y + rightOff, 6, 10);
  ctx.fillStyle = shoes;
  ctx.fillRect(x + 8, y + 8 + leftOff, 6, 3);
  ctx.fillRect(x + 18, y + 8 + rightOff, 6, 3);
}

function arms(ctx, x, y, skin, shirt, leftSwing, rightSwing) {
  ctx.fillStyle = shirt;
  ctx.fillRect(x + 4, y + 2, 4, 10 + leftSwing);
  ctx.fillRect(x + 24, y + 2, 4, 10 + rightSwing);
  // Hands
  ctx.fillStyle = skin;
  ctx.fillRect(x + 4, y + 11 + leftSwing, 4, 3);
  ctx.fillRect(x + 24, y + 11 + rightSwing, 4, 3);
}

function drawDefault(ctx, ox, oy, dir, frame) {
  const skin = '#f0c8a0', hair = '#8b5e3c', shirt = '#4488cc';
  const pants = '#334466', shoes = '#6b4423';
  const swing = frame === 1 ? (dir === 0 || dir === 3 ? 2 : 0) : 0;
  const legOff = frame === 1 ? (dir === 0 || dir === 3 ? 2 : 0) : 0;
  if (dir === 0) { // down
    head(ctx, ox, oy, skin, hair);
    body(ctx, ox, oy + 12, shirt);
    arms(ctx, ox, oy + 12, skin, shirt, -swing, swing);
    legs(ctx, ox, oy + 28, pants, shoes, -legOff, legOff);
  } else if (dir === 1) { // left
    head(ctx, ox, oy, skin, hair);
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 4, oy + 12, 16, 16);
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 2, oy + 14, 4, 6);
    ctx.fillStyle = pants;
    ctx.fillRect(ox + 6, oy + 28, 8, 10);
    ctx.fillStyle = shoes;
    ctx.fillRect(ox + 6, oy + 36, 8, 3);
  } else if (dir === 2) { // right
    head(ctx, ox, oy, skin, hair);
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 12, oy + 12, 16, 16);
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 26, oy + 14, 4, 6);
    ctx.fillStyle = pants;
    ctx.fillRect(ox + 18, oy + 28, 8, 10);
    ctx.fillStyle = shoes;
    ctx.fillRect(ox + 18, oy + 36, 8, 3);
  } else { // up
    head(ctx, ox, oy, skin, hair);
    body(ctx, ox, oy + 12, shirt);
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 12, oy + 4, 8, 8);
    legs(ctx, ox, oy + 28, pants, shoes, -legOff, legOff);
  }
}

function drawNinja(ctx, ox, oy, dir, frame) {
  const skin = '#f0c8a0', suit = '#1a1a2e', band = '#cc3333';
  const legOff = frame === 1 ? (dir === 0 || dir === 3 ? 2 : 0) : 0;
  if (dir === 0) {
    // Head covered
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.arc(ox + 16, oy + 10, 10, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(ox + 6, oy + 10, 20, 4);
    // Eyes visible
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox + 10, oy + 7, 4, 3);
    ctx.fillRect(ox + 18, oy + 7, 4, 3);
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 11, oy + 8, 2, 2);
    ctx.fillRect(ox + 19, oy + 8, 2, 2);
    // Headband
    ctx.fillStyle = band;
    ctx.fillRect(ox + 6, oy + 4, 20, 2);
    ctx.fillRect(ox + 24, oy + 3, 4, 4);
    // Body
    ctx.fillStyle = suit;
    ctx.fillRect(ox + 8, oy + 12, 16, 16);
    ctx.fillStyle = band;
    ctx.fillRect(ox + 10, oy + 22, 12, 2);
    // Legs
    ctx.fillStyle = suit;
    ctx.fillRect(ox + 8, oy + 28, 6, 10);
    ctx.fillRect(ox + 18, oy + 28, 6, 10);
    // Shoes
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 8, oy + 36, 6, 3);
    ctx.fillRect(ox + 18, oy + 36, 6, 3);
  } else if (dir === 1) {
    // Left - simplified side view
    ctx.fillStyle = suit;
    ctx.fillRect(ox + 2, oy + 2, 16, 12);
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox + 4, oy + 7, 4, 3);
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 5, oy + 8, 2, 2);
    ctx.fillStyle = band;
    ctx.fillRect(ox + 2, oy + 4, 2, 2);
    ctx.fillRect(ox, oy + 3, 4, 2);
    ctx.fillStyle = suit;
    ctx.fillRect(ox + 2, oy + 14, 16, 16);
    ctx.fillRect(ox + 4, oy + 28, 8, 10);
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 4, oy + 36, 8, 3);
  } else if (dir === 2) {
    // Right - mirrored
    ctx.fillStyle = suit;
    ctx.fillRect(ox + 14, oy + 2, 16, 12);
    ctx.fillStyle = '#fff';
    ctx.fillRect(ox + 24, oy + 7, 4, 3);
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 25, oy + 8, 2, 2);
    ctx.fillStyle = band;
    ctx.fillRect(ox + 28, oy + 4, 2, 2);
    ctx.fillRect(ox + 28, oy + 3, 4, 2);
    ctx.fillStyle = suit;
    ctx.fillRect(ox + 14, oy + 14, 16, 16);
    ctx.fillRect(ox + 20, oy + 28, 8, 10);
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 20, oy + 36, 8, 3);
  } else {
    ctx.fillStyle = suit;
    ctx.beginPath();
    ctx.arc(ox + 16, oy + 10, 10, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(ox + 6, oy + 10, 20, 6);
    ctx.fillStyle = suit;
    ctx.fillRect(ox + 8, oy + 12, 16, 16);
    ctx.fillStyle = band;
    ctx.fillRect(ox + 10, oy + 22, 12, 2);
    ctx.fillStyle = suit;
    ctx.fillRect(ox + 8, oy + 28, 6, 10);
    ctx.fillRect(ox + 18, oy + 28, 6, 10);
  }
}

function drawWizard(ctx, ox, oy, dir, frame) {
  const skin = '#f0c8a0', hair = '#ccc', robe = '#7c3aed', hat = '#7c3aed';
  const legOff = frame === 1 ? (dir === 0 || dir === 3 ? 2 : 0) : 0;
  if (dir === 0) {
    // Hat
    ctx.fillStyle = hat;
    ctx.fillRect(ox + 11, oy, 10, 3);
    ctx.fillRect(ox + 13, oy + 1, 6, 6);
    ctx.fillRect(ox + 10, oy + 5, 12, 2);
    // Hair
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 6, oy + 4, 4, 3);
    ctx.fillRect(ox + 22, oy + 4, 4, 3);
    ctx.fillRect(ox + 8, oy + 6, 16, 2);
    // Head
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(ox + 16, oy + 10, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(ox + 8, oy + 10, 16, 4);
    // Beard
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 11, oy + 13, 10, 5);
    // Eyes
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 12, oy + 8, 2, 2);
    ctx.fillRect(ox + 18, oy + 8, 2, 2);
    // Robe
    ctx.fillStyle = robe;
    ctx.fillRect(ox + 6, oy + 14, 20, 18);
    ctx.fillRect(ox + 10, oy + 30, 12, 4);
    // Belt
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(ox + 9, oy + 26, 14, 2);
    // Staff
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(ox + 26, oy + 16, 2, 18);
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.arc(ox + 27, oy + 16, 3, 0, Math.PI * 2);
    ctx.fill();
    // Legs barely visible
    ctx.fillStyle = '#6b21a8';
    ctx.fillRect(ox + 9, oy + 32, 5, 6);
    ctx.fillRect(ox + 18, oy + 32, 5, 6);
  } else if (dir === 1) {
    ctx.fillStyle = hat;
    ctx.fillRect(ox + 10, oy, 6, 3);
    ctx.fillRect(ox + 12, oy, 3, 7);
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 4, oy + 5, 8, 2);
    ctx.fillRect(ox + 15, oy + 5, 4, 2);
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 4, oy + 4, 8, 8);
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 6, oy + 6, 2, 2);
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 4, oy + 11, 8, 4);
    ctx.fillStyle = robe;
    ctx.fillRect(ox + 2, oy + 14, 18, 18);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(ox + 2, oy + 24, 4, 2);
    ctx.fillStyle = '#6b21a8';
    ctx.fillRect(ox + 4, oy + 32, 6, 6);
  } else if (dir === 2) {
    ctx.fillStyle = hat;
    ctx.fillRect(ox + 16, oy, 6, 3);
    ctx.fillRect(ox + 17, oy, 3, 7);
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 20, oy + 5, 8, 2);
    ctx.fillRect(ox + 13, oy + 5, 4, 2);
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 20, oy + 4, 8, 8);
    ctx.fillStyle = '#222';
    ctx.fillRect(ox + 24, oy + 6, 2, 2);
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 20, oy + 11, 8, 4);
    ctx.fillStyle = robe;
    ctx.fillRect(ox + 12, oy + 14, 18, 18);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(ox + 26, oy + 24, 4, 2);
    ctx.fillStyle = '#6b21a8';
    ctx.fillRect(ox + 22, oy + 32, 6, 6);
  } else {
    ctx.fillStyle = hat;
    ctx.fillRect(ox + 11, oy, 10, 3);
    ctx.fillRect(ox + 13, oy + 1, 6, 6);
    ctx.fillRect(ox + 10, oy + 5, 12, 2);
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 6, oy + 4, 20, 3);
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(ox + 16, oy + 8, 8, Math.PI, 0);
    ctx.fill();
    ctx.fillRect(ox + 8, oy + 8, 16, 4);
    ctx.fillStyle = robe;
    ctx.fillRect(ox + 6, oy + 12, 20, 20);
    ctx.fillStyle = '#fbbf24';
    ctx.fillRect(ox + 8, oy + 24, 16, 2);
    ctx.fillStyle = '#6b21a8';
    ctx.fillRect(ox + 10, oy + 30, 12, 6);
  }
}

const AVATARS = [
  { id: 'avatar-default', draw: drawDefault },
  { id: 'avatar-ninja', draw: drawNinja },
  { id: 'avatar-wizard', draw: drawWizard },
];

for (const av of AVATARS) {
  const canvas = createCanvas(CW * COLS, CH * ROWS);
  const ctx = canvas.getContext('2d');

  // Transparent background
  ctx.clearRect(0, 0, CW * COLS, CH * ROWS);

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 2; frame++) {
      const ox = dir * CW;
      const oy = frame * CH;
      av.draw(ctx, ox, oy, dir, frame);
    }
  }

  const buf = canvas.toBuffer('image/png');
  writeFileSync(join(OUT, `${av.id}.png`), buf);
  console.log(`Generated ${av.id}.png (${buf.length} bytes)`);
}

console.log('All avatars generated!');
