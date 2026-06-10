import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'apps', 'frontend', 'public', 'avatars');

mkdirSync(OUT, { recursive: true });

const CW = 32, CH = 48, COLS = 4, ROWS = 2;

function head(ctx, x, y, skin, hair) {
  ctx.fillStyle = hair;
  ctx.fillRect(x + 9, y + 0, 14, 3);
  ctx.fillRect(x + 7, y + 1, 18, 3);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + 16, y + 10, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x + 6, y + 10, 20, 6);
  ctx.fillStyle = '#222';
  ctx.fillRect(x + 11, y + 8, 2, 2);
  ctx.fillRect(x + 19, y + 8, 2, 2);
  ctx.fillRect(x + 14, y + 13, 4, 1);
  ctx.fillStyle = hair;
  ctx.fillRect(x + 5, y + 3, 2, 5);
  ctx.fillRect(x + 25, y + 3, 2, 5);
}

function body(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x + 8, y, 16, 16);
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
  ctx.fillStyle = skin;
  ctx.fillRect(x + 4, y + 11 + leftSwing, 4, 3);
  ctx.fillRect(x + 24, y + 11 + rightSwing, 4, 3);
}

function drawCharacter(ctx, ox, oy, dir, frame, { skin, hair, shirt, pants, shoes }) {
  const swing = frame === 1 ? (dir === 0 || dir === 3 ? 2 : 0) : 0;
  const legOff = frame === 1 ? (dir === 0 || dir === 3 ? 2 : 0) : 0;
  if (dir === 0) {
    head(ctx, ox, oy, skin, hair);
    body(ctx, ox, oy + 12, shirt);
    arms(ctx, ox, oy + 12, skin, shirt, -swing, swing);
    legs(ctx, ox, oy + 28, pants, shoes, -legOff, legOff);
  } else if (dir === 1) {
    head(ctx, ox, oy, skin, hair);
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 4, oy + 12, 16, 16);
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 2, oy + 14, 4, 6);
    ctx.fillStyle = pants;
    ctx.fillRect(ox + 6, oy + 28, 8, 10);
    ctx.fillStyle = shoes;
    ctx.fillRect(ox + 6, oy + 36, 8, 3);
  } else if (dir === 2) {
    head(ctx, ox, oy, skin, hair);
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 12, oy + 12, 16, 16);
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 26, oy + 14, 4, 6);
    ctx.fillStyle = pants;
    ctx.fillRect(ox + 18, oy + 28, 8, 10);
    ctx.fillStyle = shoes;
    ctx.fillRect(ox + 18, oy + 36, 8, 3);
  } else {
    head(ctx, ox, oy, skin, hair);
    body(ctx, ox, oy + 12, shirt);
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 12, oy + 4, 8, 8);
    legs(ctx, ox, oy + 28, pants, shoes, -legOff, legOff);
  }
}

const AVATARS = [
  {
    id: 'avatar-ceo',
    opts: { skin: '#f0c8a0', hair: '#888888', shirt: '#1e3a5f', pants: '#1e3a5f', shoes: '#1a1a1a' },
  },
  {
    id: 'avatar-dev',
    opts: { skin: '#f0c8a0', hair: '#8b5e3c', shirt: '#374151', pants: '#1f2937', shoes: '#6b4423' },
  },
  {
    id: 'avatar-designer',
    opts: { skin: '#f0c8a0', hair: '#c8a400', shirt: '#7e22ce', pants: '#4c1d95', shoes: '#2d1b69' },
  },
  {
    id: 'avatar-hr',
    opts: { skin: '#f0c8a0', hair: '#2d1810', shirt: '#9f1239', pants: '#1f2937', shoes: '#1a1a1a' },
  },
  {
    id: 'avatar-marketing',
    opts: { skin: '#f0c8a0', hair: '#b91c1c', shirt: '#f97316', pants: '#1f2937', shoes: '#1a1a1a' },
  },
  {
    id: 'avatar-intern',
    opts: { skin: '#f0c8a0', hair: '#92400e', shirt: '#0ea5e9', pants: '#374151', shoes: '#6b4423' },
  },
];

for (const av of AVATARS) {
  const canvas = createCanvas(CW * COLS, CH * ROWS);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CW * COLS, CH * ROWS);

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 2; frame++) {
      drawCharacter(ctx, dir * CW, frame * CH, dir, frame, av.opts);
    }
  }

  const buf = canvas.toBuffer('image/png');
  writeFileSync(join(OUT, `${av.id}.png`), buf);
  console.log(`Generated ${av.id}.png (${buf.length} bytes)`);
}

console.log('All avatars generated!');
