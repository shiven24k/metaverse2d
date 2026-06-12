import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'apps', 'frontend', 'public', 'avatars');

mkdirSync(OUT, { recursive: true });

const CW = 32, CH = 48, COLS = 4, ROWS = 2;

// ── Directional head helpers ─────────────────────────────────────────────────

// Front-facing head (down view) — both eyes visible
function headFront(ctx, x, y, skin, hair) {
  ctx.fillStyle = hair;
  ctx.fillRect(x + 9, y, 14, 3);
  ctx.fillRect(x + 7, y + 1, 18, 3);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + 16, y + 10, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x + 6, y + 10, 20, 5);
  ctx.fillStyle = '#222';
  ctx.fillRect(x + 11, y + 8, 2, 2);
  ctx.fillRect(x + 19, y + 8, 2, 2);
  ctx.fillRect(x + 14, y + 12, 4, 1);
  ctx.fillStyle = hair;
  ctx.fillRect(x + 5, y + 3, 2, 5);
  ctx.fillRect(x + 25, y + 3, 2, 5);
}

// Back-facing head (up view) — hair covers, no eyes
function headBack(ctx, x, y, skin, hair) {
  ctx.fillStyle = hair;
  ctx.fillRect(x + 9, y, 14, 3);
  ctx.fillRect(x + 7, y + 1, 18, 3);
  ctx.fillRect(x + 7, y + 3, 18, 8);
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + 16, y + 10, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x + 6, y + 10, 20, 5);
  ctx.fillStyle = hair;
  ctx.fillRect(x + 8, y + 3, 16, 8);
  ctx.fillRect(x + 5, y + 3, 2, 5);
  ctx.fillRect(x + 25, y + 3, 2, 5);
}

// Left-profile head — character faces LEFT, single eye on left side of face
function headLeft(ctx, x, y, skin, hair) {
  ctx.fillStyle = hair;
  ctx.fillRect(x + 6, y, 16, 3);
  ctx.fillRect(x + 5, y + 1, 17, 3);
  ctx.fillRect(x + 4, y + 2, 3, 7);   // side hair lock
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + 14, y + 10, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x + 4, y + 10, 20, 5);
  ctx.fillStyle = '#222';
  ctx.fillRect(x + 9, y + 7, 2, 2);   // single eye on left (face points left)
  ctx.fillRect(x + 6, y + 12, 3, 1);  // mouth on left
  ctx.fillStyle = hair;
  ctx.fillRect(x + 23, y + 3, 2, 6);  // right-side hair
}

// Right-profile head — character faces RIGHT, single eye on right side of face
function headRight(ctx, x, y, skin, hair) {
  ctx.fillStyle = hair;
  ctx.fillRect(x + 10, y, 16, 3);
  ctx.fillRect(x + 10, y + 1, 17, 3);
  ctx.fillRect(x + 25, y + 2, 3, 7);  // side hair lock
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(x + 18, y + 10, 10, Math.PI, 0);
  ctx.fill();
  ctx.fillRect(x + 8, y + 10, 20, 5);
  ctx.fillStyle = '#222';
  ctx.fillRect(x + 21, y + 7, 2, 2);  // single eye on right (face points right)
  ctx.fillRect(x + 23, y + 12, 3, 1); // mouth on right
  ctx.fillStyle = hair;
  ctx.fillRect(x + 7, y + 3, 2, 6);   // left-side hair
}

// ── Full character drawing ────────────────────────────────────────────────────
// Sprite sheet layout (256×96px):
//   col 0 (x=0)  : down   (front view)    game: facingRef='down'
//   col 1 (x=32) : left   (left profile)  game: facingRef='left'
//   col 2 (x=64) : right  (right profile) game: facingRef='right'
//   col 3 (x=96) : up     (back view)     game: facingRef='up'
//   row 0 (y=0)  : idle frame
//   row 1 (y=48) : walk frame

function drawCharacter(ctx, ox, oy, dir, frame, { skin, hair, shirt, pants, shoes }) {
  if (dir === 0) {
    // ── DOWN (front view) ────────────────────────────────────────────────────
    headFront(ctx, ox, oy, skin, hair);
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 8, oy + 14, 16, 15);
    if (frame === 1) {
      // Walk: left arm swings forward (longer), right arm pulls back (shorter)
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 4, oy + 15, 4, 14);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 4, oy + 28, 4, 3);
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 24, oy + 15, 4, 9);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 24, oy + 23, 4, 3);
      // Legs: one forward (raised + shifted left), one back (lower + shifted right)
      ctx.fillStyle = pants;
      ctx.fillRect(ox + 7, oy + 27, 6, 12);
      ctx.fillRect(ox + 19, oy + 31, 6, 8);
      ctx.fillStyle = shoes;
      ctx.fillRect(ox + 7, oy + 37, 7, 3);
      ctx.fillRect(ox + 19, oy + 37, 6, 3);
    } else {
      // Idle: symmetric
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 4, oy + 15, 4, 11);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 4, oy + 25, 4, 3);
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 24, oy + 15, 4, 11);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 24, oy + 25, 4, 3);
      ctx.fillStyle = pants;
      ctx.fillRect(ox + 8, oy + 29, 6, 11);
      ctx.fillRect(ox + 18, oy + 29, 6, 11);
      ctx.fillStyle = shoes;
      ctx.fillRect(ox + 8, oy + 38, 6, 3);
      ctx.fillRect(ox + 18, oy + 38, 6, 3);
    }

  } else if (dir === 1) {
    // ── LEFT profile ─────────────────────────────────────────────────────────
    headLeft(ctx, ox, oy, skin, hair);
    // Body slightly left-shifted so forward arm does not overlap
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 6, oy + 14, 16, 15);
    if (frame === 1) {
      // Walk: arm extends forward (left), legs stride (front-left, back-right)
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 2, oy + 15, 4, 14);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 2, oy + 28, 4, 3);
      ctx.fillStyle = pants;
      ctx.fillRect(ox + 5, oy + 29, 6, 11);   // front leg (extended left)
      ctx.fillRect(ox + 14, oy + 29, 6, 11);  // back leg (right)
      ctx.fillStyle = shoes;
      ctx.fillRect(ox + 4, oy + 38, 7, 3);    // front foot (more left)
      ctx.fillRect(ox + 14, oy + 38, 6, 3);   // back foot
    } else {
      // Idle: arm at rest, legs close together
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 3, oy + 15, 4, 11);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 3, oy + 25, 4, 3);
      ctx.fillStyle = pants;
      ctx.fillRect(ox + 8, oy + 29, 6, 11);
      ctx.fillRect(ox + 15, oy + 29, 6, 11);
      ctx.fillStyle = shoes;
      ctx.fillRect(ox + 8, oy + 38, 6, 3);
      ctx.fillRect(ox + 15, oy + 38, 6, 3);
    }

  } else if (dir === 2) {
    // ── RIGHT profile (exact mirror of left) ─────────────────────────────────
    headRight(ctx, ox, oy, skin, hair);
    // Body slightly right-shifted
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 10, oy + 14, 16, 15);
    if (frame === 1) {
      // Walk: arm extends forward (right), legs stride (front-right, back-left)
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 26, oy + 15, 4, 14);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 26, oy + 28, 4, 3);
      ctx.fillStyle = pants;
      ctx.fillRect(ox + 21, oy + 29, 6, 11);  // front leg (extended right)
      ctx.fillRect(ox + 12, oy + 29, 6, 11);  // back leg (left)
      ctx.fillStyle = shoes;
      ctx.fillRect(ox + 21, oy + 38, 7, 3);   // front foot (more right)
      ctx.fillRect(ox + 12, oy + 38, 6, 3);   // back foot
    } else {
      // Idle: arm at rest, legs close together
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 25, oy + 15, 4, 11);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 25, oy + 25, 4, 3);
      ctx.fillStyle = pants;
      ctx.fillRect(ox + 11, oy + 29, 6, 11);
      ctx.fillRect(ox + 18, oy + 29, 6, 11);
      ctx.fillStyle = shoes;
      ctx.fillRect(ox + 11, oy + 38, 6, 3);
      ctx.fillRect(ox + 18, oy + 38, 6, 3);
    }

  } else {
    // ── UP (back view) ───────────────────────────────────────────────────────
    headBack(ctx, ox, oy, skin, hair);
    ctx.fillStyle = shirt;
    ctx.fillRect(ox + 8, oy + 14, 16, 15);
    if (frame === 1) {
      // Walk: right arm swings forward (opposite to DOWN), legs stride
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 24, oy + 15, 4, 14);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 24, oy + 28, 4, 3);
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 4, oy + 15, 4, 9);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 4, oy + 23, 4, 3);
      ctx.fillStyle = pants;
      ctx.fillRect(ox + 7, oy + 27, 6, 12);
      ctx.fillRect(ox + 19, oy + 31, 6, 8);
      ctx.fillStyle = shoes;
      ctx.fillRect(ox + 7, oy + 37, 7, 3);
      ctx.fillRect(ox + 19, oy + 37, 6, 3);
    } else {
      // Idle: symmetric back view
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 4, oy + 15, 4, 11);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 4, oy + 25, 4, 3);
      ctx.fillStyle = shirt;
      ctx.fillRect(ox + 24, oy + 15, 4, 11);
      ctx.fillStyle = skin;
      ctx.fillRect(ox + 24, oy + 25, 4, 3);
      ctx.fillStyle = pants;
      ctx.fillRect(ox + 8, oy + 29, 6, 11);
      ctx.fillRect(ox + 18, oy + 29, 6, 11);
      ctx.fillStyle = shoes;
      ctx.fillRect(ox + 8, oy + 38, 6, 3);
      ctx.fillRect(ox + 18, oy + 38, 6, 3);
    }
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
