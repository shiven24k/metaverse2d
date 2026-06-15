import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
const __dirname = dirname(fileURLToPath(import.meta.url));
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';

const OUT = join(__dirname, '..', 'apps', 'frontend', 'public', 'avatars');
mkdirSync(OUT, { recursive: true });

// Sprite sheet: 4 directions × 2 frames = 8 cells
// Each cell: 32×48px  →  total canvas: 128×96px
// Layout: col=direction (0=down,1=left,2=right,3=up), row=frame (0=idle,1=walk)
const CW = 32, CH = 48;

// ─── Pixel-art painter ───────────────────────────────────────────────────────
// px(ctx, x, y, color) — paint one 1×1 pixel (no sub-pixel)
function px(ctx, x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}
function rect(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), w, h);
}

// ─── Per-avatar pixel art data ───────────────────────────────────────────────
// Each character drawn as explicit pixel arrays for maximum distinctiveness.
// Format: draw functions receive (ctx, ox, oy, frame)
// ox/oy = top-left corner of the 32×48 cell

// ── Shared body builder (dir-aware) ─────────────────────────────────────────
function drawBody(ctx, ox, oy, frame, { skin, hair, shirt, pants, shoes, accessory }) {
  // We draw 4 directions via separate functions called from drawCharacter
  // This is the front-facing (down) body
  const f = frame; // 0=idle, 1=walk

  // Torso
  rect(ctx, ox+10, oy+17, 12, 13, shirt);

  // Arms
  const armLY = f === 1 ? oy+18 : oy+18;
  const armLH = f === 1 ? 11 : 10;
  const armRH = f === 1 ? 7  : 10;
  rect(ctx, ox+6,  armLY, 4, armLH, shirt); // left arm
  rect(ctx, ox+22, armLY, 4, armRH, shirt); // right arm
  rect(ctx, ox+6,  armLY+armLH, 4, 3, skin); // left hand
  rect(ctx, ox+22, armLY+armRH, 4, 3, skin); // right hand

  // Legs
  if (f === 1) {
    rect(ctx, ox+10, oy+30, 5, 10, pants); // left leg forward
    rect(ctx, ox+17, oy+30, 5, 7,  pants); // right leg back
    rect(ctx, ox+9,  oy+38, 7, 3, shoes);  // left foot
    rect(ctx, ox+17, oy+37, 6, 3, shoes);  // right foot
  } else {
    rect(ctx, ox+10, oy+30, 5, 11, pants);
    rect(ctx, ox+17, oy+30, 5, 11, pants);
    rect(ctx, ox+9,  oy+40, 7, 3, shoes);
    rect(ctx, ox+17, oy+40, 6, 3, shoes);
  }
}

function drawBodyBack(ctx, ox, oy, frame, { skin, hair, shirt, pants, shoes }) {
  const f = frame;
  rect(ctx, ox+10, oy+17, 12, 13, shirt);
  const armLH = f === 1 ? 7 : 10;
  const armRH = f === 1 ? 11 : 10;
  rect(ctx, ox+6, oy+18, 4, armLH, shirt);
  rect(ctx, ox+22, oy+18, 4, armRH, shirt);
  rect(ctx, ox+6, oy+18+armLH, 4, 3, skin);
  rect(ctx, ox+22, oy+18+armRH, 4, 3, skin);
  if (f === 1) {
    rect(ctx, ox+10, oy+30, 5, 7,  pants);
    rect(ctx, ox+17, oy+30, 5, 10, pants);
    rect(ctx, ox+10, oy+37, 6, 3, shoes);
    rect(ctx, ox+16, oy+38, 7, 3, shoes);
  } else {
    rect(ctx, ox+10, oy+30, 5, 11, pants);
    rect(ctx, ox+17, oy+30, 5, 11, pants);
    rect(ctx, ox+9,  oy+40, 7, 3, shoes);
    rect(ctx, ox+17, oy+40, 6, 3, shoes);
  }
}

function drawBodySide(ctx, ox, oy, frame, dir, { skin, hair, shirt, pants, shoes }) {
  const f = frame;
  const facing = dir === 1 ? -1 : 1; // -1=left, 1=right
  const bx = dir === 1 ? ox+8 : ox+10;

  rect(ctx, bx, oy+17, 12, 13, shirt);

  // Front arm
  const fax = dir === 1 ? ox+5 : ox+22;
  const fay = f === 1 ? oy+17 : oy+18;
  const fah = f === 1 ? 12 : 10;
  rect(ctx, fax, fay, 3, fah, shirt);
  rect(ctx, fax, fay+fah, 3, 3, skin);

  // Legs
  if (f === 1) {
    const fl = dir === 1 ? ox+7  : ox+16;
    const bl = dir === 1 ? ox+14 : ox+9;
    rect(ctx, fl, oy+30, 5, 11, pants);
    rect(ctx, bl, oy+30, 5, 8,  pants);
    rect(ctx, fl-1, oy+39, 7, 3, shoes);
    rect(ctx, bl,   oy+36, 6, 3, shoes);
  } else {
    rect(ctx, ox+10, oy+30, 5, 11, pants);
    rect(ctx, ox+16, oy+30, 5, 11, pants);
    rect(ctx, ox+9,  oy+40, 7, 3, shoes);
    rect(ctx, ox+16, oy+40, 6, 3, shoes);
  }
}

// ─── HEAD DRAWING ────────────────────────────────────────────────────────────

function headFront(ctx, ox, oy, { skin, hair, eyeColor = '#1a1a1a', hasGlasses = false, accessory }) {
  // Hair top
  rect(ctx, ox+9,  oy+2, 14, 2, hair);
  rect(ctx, ox+8,  oy+3, 16, 3, hair);
  // Side hair
  rect(ctx, ox+7,  oy+5, 2, 6,  hair);
  rect(ctx, ox+23, oy+5, 2, 6,  hair);
  // Face
  rect(ctx, ox+9,  oy+5, 14, 10, skin);
  // Ears
  rect(ctx, ox+7,  oy+8, 2, 3, skin);
  rect(ctx, ox+23, oy+8, 2, 3, skin);
  // Eyes
  rect(ctx, ox+11, oy+9, 3, 2, eyeColor);
  rect(ctx, ox+18, oy+9, 3, 2, eyeColor);
  // Eye shine
  px(ctx, ox+12, oy+9, '#fff');
  px(ctx, ox+19, oy+9, '#fff');
  // Nose
  px(ctx, ox+15, oy+11, '#c8967a');
  px(ctx, ox+16, oy+11, '#c8967a');
  // Mouth
  rect(ctx, ox+13, oy+13, 6, 1, '#8b3a3a');
  // Neck
  rect(ctx, ox+13, oy+15, 6, 3, skin);

  if (hasGlasses) {
    // Glasses frames
    rect(ctx, ox+10, oy+8,  5, 4, '#333');
    rect(ctx, ox+17, oy+8,  5, 4, '#333');
    rect(ctx, ox+15, oy+9,  2, 1, '#333'); // bridge
    // Clear lens tint
    rect(ctx, ox+11, oy+9,  3, 2, '#a8d8f0');
    rect(ctx, ox+18, oy+9,  3, 2, '#a8d8f0');
  }
}

function headBack(ctx, ox, oy, { skin, hair }) {
  rect(ctx, ox+9,  oy+2, 14, 2, hair);
  rect(ctx, ox+8,  oy+3, 16, 9, hair);
  rect(ctx, ox+7,  oy+5, 2,  6, hair);
  rect(ctx, ox+23, oy+5, 2,  6, hair);
  // Back of head skin visible below hair
  rect(ctx, ox+9,  oy+11, 14, 4, skin);
  rect(ctx, ox+13, oy+15, 6, 3, skin); // neck
}

function headLeft(ctx, ox, oy, { skin, hair, eyeColor = '#1a1a1a', hasGlasses = false }) {
  // Hair
  rect(ctx, ox+8,  oy+2, 14, 2, hair);
  rect(ctx, ox+7,  oy+3, 15, 3, hair);
  rect(ctx, ox+6,  oy+4, 3,  8, hair); // back hair
  // Face
  rect(ctx, ox+9,  oy+5, 12, 10, skin);
  // Ear (on right side = back of head when facing left)
  rect(ctx, ox+21, oy+8, 2, 3, skin);
  // Eye (left profile = one eye visible on right side of face)
  rect(ctx, ox+17, oy+9, 3, 2, eyeColor);
  px(ctx, ox+18, oy+9, '#fff');
  // Nose tip
  px(ctx, ox+9, oy+11, '#c8967a');
  // Mouth
  rect(ctx, ox+10, oy+13, 4, 1, '#8b3a3a');
  // Neck
  rect(ctx, ox+12, oy+15, 6, 3, skin);

  if (hasGlasses) {
    rect(ctx, ox+15, oy+8, 5, 4, '#333');
    rect(ctx, ox+16, oy+9, 3, 2, '#a8d8f0');
  }
}

function headRight(ctx, ox, oy, { skin, hair, eyeColor = '#1a1a1a', hasGlasses = false }) {
  // Hair
  rect(ctx, ox+10, oy+2, 14, 2, hair);
  rect(ctx, ox+10, oy+3, 15, 3, hair);
  rect(ctx, ox+23, oy+4, 3,  8, hair); // back hair
  // Face
  rect(ctx, ox+11, oy+5, 12, 10, skin);
  // Ear
  rect(ctx, ox+9,  oy+8, 2, 3, skin);
  // Eye
  rect(ctx, ox+12, oy+9, 3, 2, eyeColor);
  px(ctx, ox+13, oy+9, '#fff');
  // Nose
  px(ctx, ox+22, oy+11, '#c8967a');
  // Mouth
  rect(ctx, ox+18, oy+13, 4, 1, '#8b3a3a');
  // Neck
  rect(ctx, ox+14, oy+15, 6, 3, skin);

  if (hasGlasses) {
    rect(ctx, ox+12, oy+8, 5, 4, '#333');
    rect(ctx, ox+13, oy+9, 3, 2, '#a8d8f0');
  }
}

// ─── ACCESSORIES (drawn on top after body+head) ──────────────────────────────

function drawAccessory(ctx, ox, oy, dir, frame, type, colors) {
  if (type === 'tie') {
    // CEO: tie visible from front/slightly sides
    if (dir === 0 || dir === 3) {
      rect(ctx, ox+15, oy+18, 3, 10, '#8b0000');
      rect(ctx, ox+14, oy+18, 5, 3,  '#8b0000'); // knot
    }
  } else if (type === 'headphones') {
    // Dev: headphones over ears
    if (dir === 0) {
      rect(ctx, ox+7,  oy+4, 18, 2, '#222');
      rect(ctx, ox+7,  oy+6, 3,  4, '#222');
      rect(ctx, ox+22, oy+6, 3,  4, '#222');
      rect(ctx, ox+6,  oy+8, 4,  4, '#f97316'); // left cup
      rect(ctx, ox+22, oy+8, 4,  4, '#f97316'); // right cup
    } else if (dir === 1) {
      rect(ctx, ox+8,  oy+4, 12, 2, '#222');
      rect(ctx, ox+20, oy+6, 3,  5, '#f97316');
    } else if (dir === 2) {
      rect(ctx, ox+12, oy+4, 12, 2, '#222');
      rect(ctx, ox+9,  oy+6, 3,  5, '#f97316');
    } else {
      rect(ctx, ox+7,  oy+4, 18, 2, '#222');
      rect(ctx, ox+7,  oy+6, 3,  4, '#f97316');
      rect(ctx, ox+22, oy+6, 3,  4, '#f97316');
    }
  } else if (type === 'beret') {
    // Designer: beret tilted
    if (dir === 0 || dir === 3) {
      rect(ctx, ox+8,  oy+1, 16, 4, colors.hair);
      rect(ctx, ox+9,  oy+0, 12, 3, '#6d28d9');
      rect(ctx, ox+20, oy+0, 6,  2, '#6d28d9'); // tilt
    } else if (dir === 1) {
      rect(ctx, ox+7,  oy+1, 14, 4, colors.hair);
      rect(ctx, ox+8,  oy+0, 10, 3, '#6d28d9');
    } else {
      rect(ctx, ox+11, oy+1, 14, 4, colors.hair);
      rect(ctx, ox+14, oy+0, 10, 3, '#6d28d9');
      rect(ctx, ox+11, oy+0, 4,  2, '#6d28d9');
    }
  } else if (type === 'ponytail') {
    // HR: ponytail
    if (dir === 3) {
      rect(ctx, ox+20, oy+8, 3, 10, colors.hair);
      rect(ctx, ox+21, oy+16, 2, 5, colors.hair);
    } else if (dir === 1) {
      rect(ctx, ox+20, oy+6, 3, 8, colors.hair);
    } else if (dir === 2) {
      rect(ctx, ox+9,  oy+6, 3, 8, colors.hair);
    }
  }
}

// ─── MAIN DRAW ───────────────────────────────────────────────────────────────

function drawCharacter(ctx, ox, oy, dir, frame, av) {
  const headOpts = {
    skin: av.skin,
    hair: av.hair,
    eyeColor: av.eyeColor || '#1a1a1a',
    hasGlasses: av.hasGlasses || false,
  };

  if (dir === 0) {
    drawBody(ctx, ox, oy, frame, av);
    headFront(ctx, ox, oy, headOpts);
  } else if (dir === 1) {
    drawBodySide(ctx, ox, oy, frame, 1, av);
    headLeft(ctx, ox, oy, headOpts);
  } else if (dir === 2) {
    drawBodySide(ctx, ox, oy, frame, 2, av);
    headRight(ctx, ox, oy, headOpts);
  } else {
    drawBodyBack(ctx, ox, oy, frame, av);
    headBack(ctx, ox, oy, headOpts);
  }

  drawAccessory(ctx, ox, oy, dir, frame, av.accessory, av);
}

// ─── AVATAR DEFINITIONS ──────────────────────────────────────────────────────

const AVATARS = [
  {
    id: 'avatar-ceo',
    skin: '#f5d5b0', hair: '#2c1810', eyeColor: '#2c4a8a',
    shirt: '#1e3a5f', pants: '#1e3a5f', shoes: '#0a0a0a',
    accessory: 'tie',
    hasGlasses: false,
  },
  {
    id: 'avatar-dev',
    skin: '#f0c8a0', hair: '#8b5e3c', eyeColor: '#2d5a27',
    shirt: '#374151', pants: '#1f2937', shoes: '#6b4423',
    accessory: 'headphones',
    hasGlasses: true,
  },
  {
    id: 'avatar-designer',
    skin: '#ffe0bd', hair: '#c8a400', eyeColor: '#7e22ce',
    shirt: '#7e22ce', pants: '#4c1d95', shoes: '#2d1b69',
    accessory: 'beret',
    hasGlasses: false,
  },
  {
    id: 'avatar-hr',
    skin: '#f5cba7', hair: '#1a0a00', eyeColor: '#7c3238',
    shirt: '#9f1239', pants: '#374151', shoes: '#1a1a1a',
    accessory: 'ponytail',
    hasGlasses: false,
  },
  {
    id: 'avatar-marketing',
    skin: '#fde8c8', hair: '#b91c1c', eyeColor: '#1a1a1a',
    shirt: '#ea580c', pants: '#1f2937', shoes: '#1a1a1a',
    accessory: 'none',
    hasGlasses: false,
  },
  {
    id: 'avatar-intern',
    skin: '#f0c8a0', hair: '#92400e', eyeColor: '#1a1a1a',
    shirt: '#0ea5e9', pants: '#374151', shoes: '#6b4423',
    accessory: 'none',
    hasGlasses: false,
  },
];

// ─── GENERATE ────────────────────────────────────────────────────────────────

for (const av of AVATARS) {
  const canvas = createCanvas(CW * 4, CH * 2);
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, CW * 4, CH * 2);

  for (let dir = 0; dir < 4; dir++) {
    for (let frame = 0; frame < 2; frame++) {
      drawCharacter(ctx, dir * CW, frame * CH, dir, frame, av);
    }
  }

  const buf = canvas.toBuffer('image/png');
  writeFileSync(`${OUT}/${av.id}.png`, buf);
  console.log(`✓ ${av.id}.png  (${buf.length} bytes)`);
}

console.log('\nDone! Check /home/avatar-test/out/');