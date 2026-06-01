import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TILES_OUT = join(ROOT, 'apps', 'frontend', 'public', 'tiles');
const ITEMS_OUT = join(ROOT, 'apps', 'frontend', 'public', 'items');
const HTTP_OUT  = join(ROOT, 'apps', 'http', 'uploads', 'defaults');

mkdirSync(TILES_OUT, { recursive: true });
mkdirSync(ITEMS_OUT, { recursive: true });
mkdirSync(HTTP_OUT,  { recursive: true });

// ─── Pixel helpers ──────────────────────────────────────────────────────────

function px(ctx, x, y, color) { ctx.fillStyle = color; ctx.fillRect(x, y, 1, 1); }
function rect(ctx, x, y, w, h, color) { ctx.fillStyle = color; ctx.fillRect(x, y, w, h); }
function hline(ctx, y, x1, x2, color) { ctx.fillStyle = color; ctx.fillRect(x1, y, x2 - x1, 1); }
function vline(ctx, x, y1, y2, color) { ctx.fillStyle = color; ctx.fillRect(x, y1, 1, y2 - y1); }

// ─── TILE sprites (16×16 unless noted) ───────────────────────────────────────

function grass(ctx, ox = 0, oy = 0) {
    const C = { base: '#5a9e3a', l1: '#6db84a', l2: '#7ecf5a', d1: '#4a7e2a', d2: '#3a6020' };
    rect(ctx, ox, oy, 16, 16, C.base);
    for (const [x,y] of [[0,0],[4,2],[8,4],[12,0],[2,6],[6,8],[10,6],[14,8],[1,12],[5,10],[9,14],[13,12],[3,14],[7,12],[11,10],[15,14]])
        px(ctx, ox+x, oy+y, C.d1);
    for (const [x,y] of [[1,1],[5,3],[9,5],[13,1],[3,7],[7,9],[11,7],[15,9],[2,13],[6,11],[10,15],[14,13]])
        px(ctx, ox+x, oy+y, C.l1);
    for (const [x,y] of [[1,2],[5,4],[9,6],[13,2],[7,10],[11,8],[3,12],[15,14]])
        px(ctx, ox+x, oy+y, C.l2);
    for (const [x,y] of [[4,3],[8,5],[12,1],[2,7],[6,9],[10,7],[14,9]])
        px(ctx, ox+x, oy+y, C.d2);
}

function dirt(ctx, ox = 0, oy = 0) {
    const C = { base: '#9b6640', l: '#b8845a', h: '#cfa070', d: '#7a4a28', s: '#c8906a' };
    rect(ctx, ox, oy, 16, 16, C.base);
    for (const [x,y] of [[1,1],[5,2],[9,0],[13,3],[2,5],[6,6],[10,4],[14,7],[0,9],[4,10],[8,8],[12,11],[3,13],[7,14],[11,12],[15,15]])
        px(ctx, ox+x, oy+y, C.l);
    for (const [x,y] of [[2,2],[6,3],[10,1],[14,4],[3,7],[7,8],[11,6],[15,9],[1,11],[5,12],[9,10],[13,13]])
        px(ctx, ox+x, oy+y, C.d);
    for (const [x,y] of [[0,0],[4,1],[8,2],[12,0],[3,4],[7,5],[11,3],[15,6],[2,8],[6,9],[10,7],[14,10],[1,12],[5,13],[9,11],[13,14]])
        px(ctx, ox+x, oy+y, C.s);
    for (const [x,y] of [[1,2],[9,1],[3,6],[11,5],[5,10],[13,9],[7,14],[15,13]])
        px(ctx, ox+x, oy+y, C.h);
}

function water(ctx, ox = 0, oy = 0) {
    const C = { base: '#2b6cb0', mid: '#3a7ed4', light: '#5a9ee8', foam: '#9dd4f8', deep: '#1a4a80', white: '#d0ecff' };
    rect(ctx, ox, oy, 16, 16, C.base);
    for (const x of [0,4,8,12]) { px(ctx, ox+x, oy+3, C.deep); px(ctx, ox+x, oy+9, C.deep); }
    hline(ctx, oy+2, ox+1, ox+4, C.mid); hline(ctx, oy+2, ox+5, ox+8, C.light);
    hline(ctx, oy+2, ox+9, ox+12, C.mid); hline(ctx, oy+2, ox+13, ox+16, C.light);
    px(ctx, ox+0, oy+2, C.foam); px(ctx, ox+4, oy+2, C.foam); px(ctx, ox+8, oy+2, C.foam); px(ctx, ox+12, oy+2, C.foam);
    px(ctx, ox+2, oy+1, C.white); px(ctx, ox+6, oy+1, C.white); px(ctx, ox+10, oy+1, C.white); px(ctx, ox+14, oy+1, C.white);
    hline(ctx, oy+7, ox+3, ox+6, C.mid); hline(ctx, oy+7, ox+7, ox+10, C.light);
    hline(ctx, oy+7, ox+11, ox+14, C.mid);
    px(ctx, ox+2, oy+7, C.foam); px(ctx, ox+6, oy+7, C.foam); px(ctx, ox+10, oy+7, C.foam); px(ctx, ox+14, oy+7, C.foam);
    px(ctx, ox+4, oy+6, C.white); px(ctx, ox+8, oy+6, C.white); px(ctx, ox+12, oy+6, C.white);
    hline(ctx, oy+12, ox+1, ox+4, C.mid); hline(ctx, oy+12, ox+5, ox+8, C.light);
    hline(ctx, oy+12, ox+9, ox+12, C.mid); hline(ctx, oy+12, ox+13, ox+16, C.light);
    px(ctx, ox+0, oy+12, C.foam); px(ctx, ox+4, oy+12, C.foam); px(ctx, ox+8, oy+12, C.foam); px(ctx, ox+12, oy+12, C.foam);
    px(ctx, ox+2, oy+11, C.white); px(ctx, ox+6, oy+11, C.white); px(ctx, ox+10, oy+11, C.white); px(ctx, ox+14, oy+11, C.white);
}

function wall(ctx, ox = 0, oy = 0) {
    const C = { stone: '#8a8888', l: '#aaaaaa', d: '#5e5c5c', h: '#cccccc', m: '#4a4848' };
    rect(ctx, ox, oy, 16, 16, C.stone);
    hline(ctx, oy+0, ox, ox+16, C.m); hline(ctx, oy+5, ox, ox+16, C.m); hline(ctx, oy+6, ox, ox+16, C.m);
    hline(ctx, oy+11, ox, ox+16, C.m); hline(ctx, oy+12, ox, ox+16, C.m); hline(ctx, oy+15, ox, ox+16, C.m);
    for (let y = 1; y <= 4; y++) { px(ctx, ox+0, oy+y, C.m); px(ctx, ox+8, oy+y, C.m); px(ctx, ox+15, oy+y, C.m); }
    for (let y = 7; y <= 10; y++) { px(ctx, ox+0, oy+y, C.m); px(ctx, ox+4, oy+y, C.m); px(ctx, ox+12, oy+y, C.m); px(ctx, ox+15, oy+y, C.m); }
    for (let y = 13; y <= 14; y++) { px(ctx, ox+0, oy+y, C.m); px(ctx, ox+8, oy+y, C.m); px(ctx, ox+15, oy+y, C.m); }
    for (const [x,y] of [[1,1],[9,1],[5,7],[13,7],[1,13],[9,13]]) { px(ctx, ox+x, oy+y, C.h); px(ctx, ox+x+1, oy+y, C.h); px(ctx, ox+x, oy+y+1, C.l); }
    for (const [x,y] of [[7,4],[15,4],[3,10],[11,10],[7,14],[15,14]]) px(ctx, ox+x, oy+y, C.d);
}

function path(ctx, ox = 0, oy = 0) {
    const C = { base: '#c8b49a', l: '#deccb0', d: '#a09070', m: '#7a6850', h: '#e8d8c0' };
    rect(ctx, ox, oy, 16, 16, C.base);
    hline(ctx, oy+5, ox, ox+16, C.m); hline(ctx, oy+6, ox, ox+16, C.m);
    hline(ctx, oy+11, ox, ox+16, C.m); hline(ctx, oy+12, ox, ox+16, C.m);
    for (let y = 0; y <= 4; y++) { px(ctx, ox+7, oy+y, C.m); px(ctx, ox+14, oy+y, C.m); }
    for (let y = 7; y <= 10; y++) { px(ctx, ox+3, oy+y, C.m); px(ctx, ox+10, oy+y, C.m); }
    for (let y = 13; y <= 15; y++) { px(ctx, ox+7, oy+y, C.m); px(ctx, ox+14, oy+y, C.m); }
    for (const [x,y] of [[1,1],[8,1],[2,7],[5,7],[1,13],[8,13]]) { px(ctx, ox+x, oy+y, C.h); px(ctx, ox+x+1, oy+y, C.l); }
    for (const [x,y] of [[6,4],[13,4],[2,10],[9,10],[6,14],[13,14]]) px(ctx, ox+x, oy+y, C.d);
}

function fence(ctx, ox = 0, oy = 0) {
    grass(ctx, ox, oy);
    const C = { post: '#8b5a2b', rail: '#a06830', sh: '#6b3a10', hi: '#c87840' };
    for (let y = 0; y < 16; y++) { px(ctx, ox+7, oy+y, C.post); px(ctx, ox+8, oy+y, C.post); px(ctx, ox+9, oy+y, C.sh); }
    px(ctx, ox+7, oy+0, C.hi); px(ctx, ox+8, oy+0, C.hi);
    hline(ctx, oy+3, ox, ox+16, C.hi); hline(ctx, oy+4, ox, ox+16, C.rail); hline(ctx, oy+5, ox, ox+16, C.sh);
    hline(ctx, oy+9, ox, ox+16, C.hi); hline(ctx, oy+10, ox, ox+16, C.rail); hline(ctx, oy+11, ox, ox+16, C.sh);
    for (const y of [3,4,5,9,10,11]) { px(ctx, ox+7, oy+y, C.post); px(ctx, ox+8, oy+y, C.post); px(ctx, ox+9, oy+y, C.sh); }
}

function flower(ctx, ox = 0, oy = 0) {
    grass(ctx, ox, oy);
    const S = '#3a7a1a', L = '#4a9a2a';
    px(ctx, ox+2, oy+10, S); px(ctx, ox+2, oy+9, S); px(ctx, ox+1, oy+9, L);
    px(ctx, ox+2, oy+7, '#ff6666'); px(ctx, ox+1, oy+8, '#ff6666'); px(ctx, ox+3, oy+8, '#ff6666'); px(ctx, ox+2, oy+8, '#ffdd00');
    px(ctx, ox+11, oy+11, S); px(ctx, ox+11, oy+10, S); px(ctx, ox+12, oy+10, L);
    px(ctx, ox+11, oy+8, '#ffee44'); px(ctx, ox+10, oy+9, '#ffee44'); px(ctx, ox+12, oy+9, '#ffee44'); px(ctx, ox+11, oy+9, '#ffffff');
    px(ctx, ox+6, oy+6, S); px(ctx, ox+6, oy+5, S); px(ctx, ox+5, oy+5, L);
    px(ctx, ox+6, oy+3, '#ff88cc'); px(ctx, ox+5, oy+4, '#ff88cc'); px(ctx, ox+7, oy+4, '#ff88cc'); px(ctx, ox+6, oy+4, '#ff44aa');
}

// tree – 32×32 (2×2 tile)
function tree(ctx, ox = 0, oy = 0) {
    const G = { g1: '#5a9e3a', g2: '#4a7e2a' };
    const C = { c1: '#2a7a1a', c2: '#1a5a0a', c3: '#3a9a2a', ch: '#4ab83a', cs: '#0e3a08' };
    const T = { t: '#7a5030', td: '#4a2a10', th: '#9a7050' };
    for (let y = 20; y < 32; y++) for (let x = 0; x < 32; x++) px(ctx, ox+x, oy+y, (x^y)&1 ? G.g2 : G.g1);
    rect(ctx, ox+12, oy+18, 8, 10, T.t);
    for (let y = 18; y < 28; y++) { px(ctx, ox+12, oy+y, T.th); px(ctx, ox+18, oy+y, T.td); px(ctx, ox+19, oy+y, T.td); }
    for (let y = 19; y < 28; y += 3) { px(ctx, ox+14, oy+y, T.td); px(ctx, ox+16, oy+y, T.td); }
    for (let y = 12; y < 21; y++) for (let x = 4; x < 28; x++) { const dx=x-16,dy=y-17; if(dx*dx+dy*dy<=112) px(ctx,ox+x,oy+y,(dx+dy)%3===0?C.c2:C.c1); }
    for (let y = 5; y < 15; y++) for (let x = 7; x < 25; x++) { const dx=x-16,dy=y-10; if(dx*dx+dy*dy<=72) px(ctx,ox+x,oy+y,(dx+dy)%3===0?C.c2:C.c3); }
    for (let y = 1; y < 9; y++) for (let x = 10; x < 22; x++) { const dx=x-16,dy=y-5; if(dx*dx+dy*dy<=32) px(ctx,ox+x,oy+y,C.c2); }
    for (let x = 6; x < 26; x++) { px(ctx, ox+x, oy+20, C.cs); px(ctx, ox+x, oy+21, C.cs); }
    for (const [x,y] of [[11,3],[15,2],[19,4],[23,7],[9,9],[24,10],[8,14],[25,14]]) px(ctx, ox+x, oy+y, C.ch);
}

// ── New floor/ground tiles ────────────────────────────────────────────────────

function sand(ctx, ox = 0, oy = 0) {
    const C = { base: '#d4a84b', l: '#e8c06a', d: '#b88830', s: '#c09040', h: '#f0d080' };
    rect(ctx, ox, oy, 16, 16, C.base);
    // grain dots scattered
    for (const [x,y] of [[1,1],[4,3],[7,0],[11,2],[14,4],[2,7],[5,5],[9,8],[13,6],[0,11],[3,9],[6,12],[10,10],[15,13],[8,14],[12,15],[1,14],[4,12]])
        px(ctx, ox+x, oy+y, C.d);
    for (const [x,y] of [[2,2],[6,4],[10,1],[14,0],[3,8],[7,6],[11,9],[15,7],[1,13],[5,11],[9,15],[13,12]])
        px(ctx, ox+x, oy+y, C.s);
    for (const [x,y] of [[3,1],[8,3],[13,5],[2,9],[7,11],[12,13]])
        px(ctx, ox+x, oy+y, C.h);
}

function snow(ctx, ox = 0, oy = 0) {
    const C = { base: '#ddeeff', mid: '#c8e0f8', shadow: '#a8c8e8', hi: '#ffffff', sparkle: '#88bbdd' };
    rect(ctx, ox, oy, 16, 16, C.base);
    // subtle dips
    for (const [x,y] of [[0,2],[4,5],[8,1],[12,4],[2,9],[6,7],[10,11],[14,8],[1,13],[5,15],[9,12],[13,14]])
        px(ctx, ox+x, oy+y, C.mid);
    for (const [x,y] of [[1,3],[5,6],[9,2],[13,5],[3,10],[7,8],[11,12],[15,9]])
        px(ctx, ox+x, oy+y, C.shadow);
    // sparkle highlights (cross shape)
    for (const [x,y] of [[3,3],[11,11],[7,14],[14,2]]) {
        px(ctx, ox+x, oy+y, C.hi);
        if (x>0) px(ctx, ox+x-1, oy+y, C.sparkle);
        if (x<15) px(ctx, ox+x+1, oy+y, C.sparkle);
        if (y>0) px(ctx, ox+x, oy+y-1, C.sparkle);
        if (y<15) px(ctx, ox+x, oy+y+1, C.sparkle);
    }
}

function lava(ctx, ox = 0, oy = 0) {
    const C = { base: '#c0300a', bright: '#f06020', crack: '#ff9900', glow: '#ffcc44', dark: '#7a1500' };
    rect(ctx, ox, oy, 16, 16, C.base);
    // dark bubbling patches
    for (const [x,y] of [[0,0],[3,2],[7,1],[11,3],[15,0],[1,6],[5,4],[9,7],[13,5],[0,10],[4,9],[8,11],[12,8],[15,12],[2,14],[6,13],[10,15],[14,14]])
        px(ctx, ox+x, oy+y, C.dark);
    // bright crack lines
    for (const [x,y] of [[2,3],[3,4],[4,5],[5,4],[6,3],[8,8],[9,9],[10,10],[11,9],[12,8]])
        px(ctx, ox+x, oy+y, C.crack);
    // glow dots
    for (const [x,y] of [[3,3],[5,5],[9,9],[11,11]]) px(ctx, ox+x, oy+y, C.glow);
    // bright streaks
    for (const [x,y] of [[1,2],[6,5],[10,8],[14,13],[2,12],[7,10]])
        px(ctx, ox+x, oy+y, C.bright);
}

function cobblestone(ctx, ox = 0, oy = 0) {
    const C = { base: '#666666', l: '#888888', d: '#444444', h: '#aaaaaa', m: '#333333' };
    rect(ctx, ox, oy, 16, 16, C.base);
    // mortar grid (irregular)
    for (const y of [0,5,6,11,12,15]) hline(ctx, oy+y, ox, ox+16, C.m);
    // random stone shapes via vertical mortars (staggered)
    for (let y=1;y<=4;y++) { px(ctx,ox+0,oy+y,C.m); px(ctx,ox+9,oy+y,C.m); px(ctx,ox+15,oy+y,C.m); }
    for (let y=7;y<=10;y++) { px(ctx,ox+0,oy+y,C.m); px(ctx,ox+5,oy+y,C.m); px(ctx,ox+11,oy+y,C.m); px(ctx,ox+15,oy+y,C.m); }
    for (let y=13;y<=14;y++) { px(ctx,ox+0,oy+y,C.m); px(ctx,ox+7,oy+y,C.m); px(ctx,ox+13,oy+y,C.m); px(ctx,ox+15,oy+y,C.m); }
    // stone highlights
    for (const [x,y] of [[1,1],[10,1],[6,7],[12,7],[1,13],[8,13]]) { px(ctx,ox+x,oy+y,C.h); px(ctx,ox+x+1,oy+y,C.l); }
    for (const [x,y] of [[8,4],[4,10],[10,10],[6,14]]) px(ctx,ox+x,oy+y,C.d);
}

function woodFloor(ctx, ox = 0, oy = 0) {
    const C = { base: '#a0622a', l: '#c07a38', d: '#7a4418', grain: '#8a5220', hi: '#d08840' };
    rect(ctx, ox, oy, 16, 16, C.base);
    // plank dividers (horizontal)
    hline(ctx, oy+5,  ox, ox+16, C.d);
    hline(ctx, oy+6,  ox, ox+16, C.grain);
    hline(ctx, oy+11, ox, ox+16, C.d);
    hline(ctx, oy+12, ox, ox+16, C.grain);
    // vertical plank seams (offset each row)
    for (let y=0;y<=4;y++) { px(ctx,ox+8,oy+y,C.d); }
    for (let y=7;y<=10;y++) { px(ctx,ox+4,oy+y,C.d); px(ctx,ox+12,oy+y,C.d); }
    for (let y=13;y<=15;y++) { px(ctx,ox+8,oy+y,C.d); }
    // grain lines
    for (const [x,y] of [[2,1],[5,2],[3,3],[10,8],[13,9],[11,10],[2,13],[6,14]]) px(ctx,ox+x,oy+y,C.grain);
    // highlights (top of each plank)
    hline(ctx, oy+0, ox, ox+16, C.hi);
    hline(ctx, oy+7, ox, ox+16, C.hi);
    hline(ctx, oy+13, ox, ox+16, C.hi);
}

function caveFloor(ctx, ox = 0, oy = 0) {
    const C = { base: '#4a4030', l: '#5e5242', d: '#302818', rock: '#3a3428', h: '#6a6050' };
    rect(ctx, ox, oy, 16, 16, C.base);
    for (const [x,y] of [[1,1],[4,3],[8,0],[12,2],[15,4],[2,6],[6,5],[10,7],[14,6],[0,10],[3,9],[7,11],[11,8],[15,10],[1,13],[5,12],[9,14],[13,15]])
        px(ctx, ox+x, oy+y, C.d);
    for (const [x,y] of [[2,2],[6,4],[10,1],[14,3],[3,7],[7,6],[11,9],[0,12],[4,11],[8,13],[12,10]])
        px(ctx, ox+x, oy+y, C.rock);
    for (const [x,y] of [[3,0],[9,3],[5,8],[13,11],[7,15]])
        px(ctx, ox+x, oy+y, C.h);
}

// ── Nature tiles ──────────────────────────────────────────────────────────────

function bush(ctx, ox = 0, oy = 0) {
    grass(ctx, ox, oy);
    const C = { d: '#1e6010', m: '#2e8020', l: '#40a030', hi: '#58c040' };
    // rounded bush shape
    for (let y = 3; y < 14; y++) for (let x = 1; x < 15; x++) {
        const dx = x - 8, dy = y - 9;
        const r = 6 - Math.abs(dy) * 0.3;
        if (Math.abs(dx) <= r) px(ctx, ox+x, oy+y, (dx+dy)%3===0 ? C.d : (dx+dy)%3===1 ? C.m : C.l);
    }
    for (const [x,y] of [[5,4],[9,3],[12,5],[4,7],[11,7]]) px(ctx, ox+x, oy+y, C.hi);
}

function cactus(ctx, ox = 0, oy = 0) {
    sand(ctx, ox, oy);
    const C = { body: '#4a8830', d: '#2e5a1a', hi: '#70b848', spine: '#c8d0a0' };
    // main trunk
    rect(ctx, ox+6, oy+3, 4, 12, C.body);
    px(ctx, ox+6, oy+3, C.hi); px(ctx, ox+6, oy+4, C.hi);
    for (let y=3;y<15;y++) px(ctx, ox+9, oy+y, C.d);
    // left arm
    rect(ctx, ox+3, oy+7, 3, 3, C.body);
    rect(ctx, ox+3, oy+5, 2, 3, C.body);
    px(ctx, ox+3, oy+5, C.hi); for (let x=3;x<6;x++) px(ctx, ox+x, oy+9, C.d);
    // right arm
    rect(ctx, ox+10, oy+6, 3, 3, C.body);
    rect(ctx, ox+11, oy+4, 2, 3, C.body);
    px(ctx, ox+11, oy+4, C.hi); for (let x=10;x<13;x++) px(ctx, ox+x, oy+8, C.d);
    // spines
    for (const [x,y] of [[5,5],[5,9],[10,6],[10,10],[7,3]]) px(ctx, ox+x, oy+y, C.spine);
}

function rock(ctx, ox = 0, oy = 0) {
    grass(ctx, ox, oy);
    const C = { body: '#808080', l: '#a0a0a0', d: '#505050', hi: '#c0c0c0', sh: '#303030' };
    for (let y = 4; y < 14; y++) for (let x = 2; x < 14; x++) {
        const dx = x - 8, dy = y - 9;
        if (dx*dx*0.7 + dy*dy <= 26) px(ctx, ox+x, oy+y, dy < -1 ? C.l : dy > 2 ? C.d : C.body);
    }
    // shadow under rock
    for (let x = 4; x < 13; x++) { px(ctx, ox+x, oy+13, C.sh); px(ctx, ox+x+1, oy+14, C.sh); }
    // highlight top-left
    for (const [x,y] of [[4,5],[5,4],[6,4],[7,4],[5,5]]) px(ctx, ox+x, oy+y, C.hi);
}

function mushroom(ctx, ox = 0, oy = 0) {
    grass(ctx, ox, oy);
    const C = { cap: '#c03020', spots: '#f0d0c0', stem: '#d4c0a0', sd: '#a89070', sh: '#e8e0c8' };
    // stem
    rect(ctx, ox+5, oy+10, 6, 5, C.stem);
    px(ctx, ox+5, oy+10, C.sh); px(ctx, ox+5, oy+11, C.sh);
    for (let y=10;y<15;y++) px(ctx, ox+10, oy+y, C.sd);
    // cap
    for (let y = 3; y < 11; y++) for (let x = 1; x < 15; x++) {
        const dx = x - 8, dy = y - 7;
        if (dx*dx + dy*dy*1.3 <= 38) px(ctx, ox+x, oy+y, C.cap);
    }
    // white spots
    for (const [x,y] of [[5,5],[10,4],[7,7],[12,6],[4,8],[11,8]]) {
        px(ctx, ox+x, oy+y, C.spots); px(ctx, ox+x+1, oy+y, C.spots);
    }
}

// pine-tree – 32×32 (2×2)
function pineTree(ctx, ox = 0, oy = 0) {
    const G = { g1: '#c8dde8', g2: '#b0ccd8' }; // snow ground
    const C = { c1: '#1a4a1a', c2: '#0e300e', c3: '#265a20', hi: '#38762e', snow: '#ddeeff' };
    const T = { t: '#5a3818', d: '#3a2008' };
    // snow ground
    for (let y=24;y<32;y++) for (let x=0;x<32;x++) px(ctx,ox+x,oy+y,(x^y)&1?G.g2:G.g1);
    // trunk
    rect(ctx, ox+13, oy+22, 6, 8, T.t);
    for (let y=22;y<30;y++) { px(ctx,ox+13,oy+y,'#7a5030'); px(ctx,ox+18,oy+y,T.d); }
    // three tiers (bottom to top)
    for (let y=16;y<24;y++) for (let x=4;x<28;x++) { const dx=x-16,dy=y-20; if(Math.abs(dx)<=dy+7) px(ctx,ox+x,oy+y,(dx+dy)%3===0?C.c2:C.c1); }
    for (let y=9;y<18;y++) for (let x=7;x<25;x++) { const dx=x-16,dy=y-14; if(Math.abs(dx)<=dy+6) px(ctx,ox+x,oy+y,(dx+dy)%3===0?C.c2:C.c3); }
    for (let y=3;y<12;y++) for (let x=10;x<22;x++) { const dx=x-16,dy=y-8; if(Math.abs(dx)<=dy+5) px(ctx,ox+x,oy+y,(dx+dy)%3===0?C.c2:C.c3); }
    // snow on branches
    for (const [x,y] of [[4,17],[16,16],[27,17],[7,10],[16,9],[24,10],[10,4],[16,3],[21,4]])
        { px(ctx,ox+x,oy+y,C.snow); if(x<31)px(ctx,ox+x+1,oy+y,C.snow); }
    for (const [x,y] of [[11,2],[15,1],[19,2]]) px(ctx,ox+x,oy+y,C.hi);
}

// ── Water variants ────────────────────────────────────────────────────────────

function shallowWater(ctx, ox = 0, oy = 0) {
    const C = { base: '#6ab4e8', mid: '#80c8f8', sand: '#c8b070', foam: '#c8e8ff', deep: '#4a90d0' };
    rect(ctx, ox, oy, 16, 16, C.base);
    // visible sandy bottom patches
    for (const [x,y] of [[1,3],[5,2],[9,4],[13,1],[2,8],[6,7],[10,9],[14,6],[0,13],[4,12],[8,14],[12,11]])
        px(ctx, ox+x, oy+y, C.sand);
    // light ripples
    hline(ctx, oy+1, ox+0, ox+5, C.foam); hline(ctx, oy+1, ox+8, ox+13, C.foam);
    hline(ctx, oy+6, ox+3, ox+8, C.foam); hline(ctx, oy+6, ox+11, ox+16, C.foam);
    hline(ctx, oy+11, ox+0, ox+5, C.foam); hline(ctx, oy+11, ox+8, ox+13, C.foam);
    for (const [x,y] of [[4,0],[12,0],[7,5],[15,5],[4,10],[12,10]]) px(ctx, ox+x, oy+y, '#ffffff');
}

// waterfall – 16×32 (1×2)
function waterfall(ctx, ox = 0, oy = 0) {
    const C = { base: '#2b6cb0', streak: '#a8d8f8', foam: '#d8f0ff', mid: '#5a9ee8', dark: '#1a4a80' };
    rect(ctx, ox, oy, 16, 32, C.base);
    // vertical streaks of varying brightness
    for (let y = 0; y < 32; y++) {
        if (y % 3 === 0) {
            for (const x of [1,2,6,7,11,12]) px(ctx, ox+x, oy+y, C.streak);
        } else if (y % 3 === 1) {
            for (const x of [3,4,8,9,13,14]) px(ctx, ox+x, oy+y, C.mid);
        } else {
            for (const x of [0,5,10,15]) px(ctx, ox+x, oy+y, C.dark);
        }
    }
    // foam at top and bottom
    hline(ctx, oy+0,  ox, ox+16, C.foam); hline(ctx, oy+1,  ox, ox+16, C.streak);
    hline(ctx, oy+30, ox, ox+16, C.streak); hline(ctx, oy+31, ox, ox+16, C.foam);
    // mist dots at bottom
    for (const [x,y] of [[1,28],[4,29],[7,27],[10,29],[13,28],[2,30],[5,31],[8,30],[11,31],[14,29]])
        px(ctx, ox+x, oy+y, C.foam);
}

// ── Structure tiles ───────────────────────────────────────────────────────────

function brickWall(ctx, ox = 0, oy = 0) {
    const C = { brick: '#b54030', l: '#cc5848', d: '#883020', m: '#5a2818', h: '#e07060' };
    rect(ctx, ox, oy, 16, 16, C.brick);
    // mortar
    hline(ctx, oy+0, ox, ox+16, C.m); hline(ctx, oy+5, ox, ox+16, C.m); hline(ctx, oy+6, ox, ox+16, C.m);
    hline(ctx, oy+11, ox, ox+16, C.m); hline(ctx, oy+12, ox, ox+16, C.m); hline(ctx, oy+15, ox, ox+16, C.m);
    for (let y=1;y<=4;y++) { px(ctx,ox+0,oy+y,C.m); px(ctx,ox+8,oy+y,C.m); px(ctx,ox+15,oy+y,C.m); }
    for (let y=7;y<=10;y++) { px(ctx,ox+0,oy+y,C.m); px(ctx,ox+4,oy+y,C.m); px(ctx,ox+12,oy+y,C.m); px(ctx,ox+15,oy+y,C.m); }
    for (let y=13;y<=14;y++) { px(ctx,ox+0,oy+y,C.m); px(ctx,ox+8,oy+y,C.m); px(ctx,ox+15,oy+y,C.m); }
    for (const [x,y] of [[1,1],[9,1],[5,7],[13,7],[1,13],[9,13]]) { px(ctx,ox+x,oy+y,C.h); px(ctx,ox+x+1,oy+y,C.l); }
    for (const [x,y] of [[7,4],[3,10],[11,10]]) px(ctx,ox+x,oy+y,C.d);
}

function windowTile(ctx, ox = 0, oy = 0) {
    wall(ctx, ox, oy);
    // glass pane over center
    rect(ctx, ox+3, oy+3, 10, 10, '#90c8e8');
    // window frame
    hline(ctx, oy+3, ox+3, ox+13, '#6a5030'); hline(ctx, oy+12, ox+3, ox+13, '#6a5030');
    vline(ctx, ox+3, oy+3, oy+13, '#6a5030'); vline(ctx, ox+12, oy+3, oy+13, '#6a5030');
    // cross divider
    vline(ctx, ox+7, oy+4, oy+12, '#6a5030'); hline(ctx, oy+7, ox+4, ox+12, '#6a5030');
    // glass shine
    px(ctx, ox+4, oy+4, '#d8f0ff'); px(ctx, ox+5, oy+4, '#d8f0ff'); px(ctx, ox+4, oy+5, '#d8f0ff');
    px(ctx, ox+8, oy+8, '#d8f0ff'); px(ctx, ox+9, oy+8, '#d8f0ff'); px(ctx, ox+8, oy+9, '#d8f0ff');
}

// door – 16×32 (1×2)
function door(ctx, ox = 0, oy = 0) {
    // wall background top half
    wall(ctx, ox, oy);
    wall(ctx, ox, oy+16);
    // door frame
    rect(ctx, ox+2, oy+4, 12, 28, '#5a3010');
    // door panel
    rect(ctx, ox+3, oy+5, 10, 26, '#8a5828');
    hline(ctx, oy+5, ox+3, ox+13, '#b07840'); // top highlight
    // panels detail
    rect(ctx, ox+4, oy+7, 4, 8, '#7a4a20'); rect(ctx, ox+9, oy+7, 3, 8, '#7a4a20');
    rect(ctx, ox+4, oy+18, 4, 7, '#7a4a20'); rect(ctx, ox+9, oy+18, 3, 7, '#7a4a20');
    // handle
    px(ctx, ox+11, oy+19, '#c8a040'); px(ctx, ox+11, oy+20, '#c8a040'); px(ctx, ox+11, oy+21, '#c8a040');
    px(ctx, ox+12, oy+20, '#c8a040');
    // frame shadow
    for (let y=4;y<32;y++) px(ctx, ox+2, oy+y, '#3a1808');
}

function roof(ctx, ox = 0, oy = 0) {
    const C = { base: '#803828', l: '#a04838', d: '#5a2018', ridge: '#402010', hi: '#c05040' };
    rect(ctx, ox, oy, 16, 16, C.base);
    // diagonal tile pattern
    for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
            const diag = (x + y * 2) % 8;
            if (diag === 0 || diag === 1) px(ctx, ox+x, oy+y, C.ridge);
            else if (diag === 2) px(ctx, ox+x, oy+y, C.hi);
            else if (diag >= 6) px(ctx, ox+x, oy+y, C.d);
        }
    }
    // ridge line at top
    hline(ctx, oy+0, ox, ox+16, C.ridge); hline(ctx, oy+1, ox, ox+16, C.d);
}

function chest(ctx, ox = 0, oy = 0) {
    const C = { wood: '#8a5020', ld: '#b07030', lh: '#d09040', latch: '#d4a020', dark: '#5a3010', hi: '#e0b050' };
    // body
    rect(ctx, ox+1, oy+6, 14, 9, C.wood);
    rect(ctx, ox+1, oy+5, 14, 2, C.ld); // lid bottom
    rect(ctx, ox+1, oy+2, 14, 4, C.lh); // lid top
    hline(ctx, oy+2, ox+1, ox+15, C.hi); // lid top edge
    // corner bands
    for (const x of [1,2,13,14]) { rect(ctx, ox+x, oy+2, 1, 13, C.dark); }
    // horizontal band
    hline(ctx, oy+5, ox+1, ox+15, C.dark); hline(ctx, oy+6, ox+1, ox+15, C.dark);
    // latch center
    rect(ctx, ox+6, oy+4, 4, 4, C.latch);
    px(ctx, ox+7, oy+4, C.hi); px(ctx, ox+8, oy+4, C.hi);
    px(ctx, ox+6, oy+5, C.dark); px(ctx, ox+9, oy+5, C.dark);
    // bottom shadow
    hline(ctx, oy+14, ox+2, ox+14, C.dark);
}

// ─── ITEM sprites ─────────────────────────────────────────────────────────────

function sofa(ctx, ox = 0, oy = 0) {
    const C = { body: '#b87040', back: '#8a4820', arm: '#7a3810', seat: '#d08858', l1: '#e0a870', leg: '#5a2800' };
    for (const x of [2,3,28,29]) rect(ctx, ox+x, oy+13, 2, 3, C.leg);
    rect(ctx, ox+3, oy+9, 26, 5, C.body);
    rect(ctx, ox+0, oy+2, 32, 8, C.back);
    rect(ctx, ox+0, oy+2, 4, 12, C.arm); rect(ctx, ox+28, oy+2, 4, 12, C.arm);
    vline(ctx, ox+16, oy+9, oy+14, C.back);
    hline(ctx, oy+9, ox+4, ox+16, C.l1); hline(ctx, oy+9, ox+17, ox+28, C.l1);
    for (let x=4;x<16;x++) px(ctx, ox+x, oy+13, C.back);
    for (let x=17;x<28;x++) px(ctx, ox+x, oy+13, C.back);
    hline(ctx, oy+2, ox+1, ox+31, C.body);
    rect(ctx, ox+3, oy+9, 26, 1, C.seat);
}

function table(ctx, ox = 0, oy = 0) {
    const C = { top: '#c87840', tl: '#e09050', td: '#8a5020', leg: '#6b3a10', lh: '#8b5a30' };
    hline(ctx, oy+2, ox, ox+32, C.tl); rect(ctx, ox, oy+3, 32, 2, C.top); rect(ctx, ox, oy+5, 32, 2, C.td);
    for (let x=3;x<32;x+=6) { px(ctx,ox+x,oy+3,C.td); px(ctx,ox+x,oy+4,C.td); }
    for (const x of [2,28]) {
        rect(ctx, ox+x, oy+7, 3, 9, C.leg);
        px(ctx,ox+x,oy+7,C.lh); px(ctx,ox+x,oy+8,C.lh); px(ctx,ox+x,oy+9,C.lh);
    }
    hline(ctx, oy+7, ox+4, ox+28, C.td); hline(ctx, oy+8, ox+4, ox+28, C.leg);
}

function chair(ctx, ox = 0, oy = 0) {
    const C = { wood: '#c87840', wl: '#e09050', wd: '#8b5020', leg: '#6b3a10', seat: '#d89060' };
    for (const x of [1,12]) rect(ctx, ox+x, oy+12, 2, 4, C.leg);
    rect(ctx, ox+1, oy+9, 14, 3, C.seat);
    hline(ctx, oy+9, ox+1, ox+15, C.wl); hline(ctx, oy+11, ox+1, ox+15, C.wd);
    rect(ctx, ox+1, oy+2, 2, 8, C.wood); rect(ctx, ox+13, oy+2, 2, 8, C.wood);
    rect(ctx, ox+1, oy+2, 14, 2, C.wood); hline(ctx, oy+2, ox+1, ox+15, C.wl);
    rect(ctx, ox+1, oy+6, 14, 2, C.wood); hline(ctx, oy+6, ox+1, ox+15, C.wl);
}

function rug(ctx, ox = 0, oy = 0) {
    const C = { base: '#9b3030', bdr: '#701818', pat: '#c45050', acc: '#d4a020', hi: '#c87030' };
    rect(ctx, ox, oy, 48, 32, C.base);
    rect(ctx, ox, oy, 48, 2, C.bdr); rect(ctx, ox, oy+30, 48, 2, C.bdr);
    rect(ctx, ox, oy, 2, 32, C.bdr); rect(ctx, ox+46, oy, 2, 32, C.bdr);
    hline(ctx, oy+3, ox+3, ox+45, C.acc); hline(ctx, oy+28, ox+3, ox+45, C.acc);
    vline(ctx, ox+3, oy+3, oy+29, C.acc); vline(ctx, ox+44, oy+3, oy+29, C.acc);
    for (let x=ox+5;x<ox+45;x+=4) { px(ctx,x,oy+0,C.acc); px(ctx,x,oy+31,C.acc); }
    for (let y=oy+4;y<oy+28;y+=4) { px(ctx,ox+0,y,C.acc); px(ctx,ox+47,y,C.acc); }
    const cx=ox+24,cy=oy+16;
    for (let d=0;d<=7;d++) for (const [dx,dy] of [[d,0],[0,d],[-d,0],[0,-d],[d,d],[-d,d],[d,-d],[-d,-d]])
        if(cx+dx>=ox+5&&cx+dx<ox+43&&cy+dy>=oy+5&&cy+dy<oy+27) px(ctx,cx+dx,cy+dy,d%2===0?C.acc:C.pat);
    for (const [mcx,mcy] of [[ox+12,oy+10],[ox+36,oy+10],[ox+12,oy+22],[ox+36,oy+22]])
        for (let d=0;d<=3;d++) for (const [dx,dy] of [[d,0],[0,d],[-d,0],[0,-d]])
            if(mcx+dx>=ox+5&&mcx+dx<ox+43&&mcy+dy>=oy+5&&mcy+dy<oy+27) px(ctx,mcx+dx,mcy+dy,d%2===0?C.hi:C.pat);
}

function plant(ctx, ox = 0, oy = 0) {
    const C = { pot: '#c07838', pd: '#8a4a18', ph: '#de9850', soil: '#6b3a14', s: '#3a7a18', l1: '#2a9a18', l2: '#4aba28', ld: '#1a6008' };
    rect(ctx, ox+3, oy+11, 10, 5, C.pot);
    hline(ctx, oy+11, ox+2, ox+14, C.ph); hline(ctx, oy+15, ox+4, ox+12, C.pd);
    vline(ctx, ox+3, oy+12, oy+15, C.pd); vline(ctx, ox+12, oy+12, oy+15, C.pd);
    hline(ctx, oy+10, ox+3, ox+13, C.soil); hline(ctx, oy+11, ox+3, ox+13, C.ph);
    px(ctx,ox+7,oy+9,C.s); px(ctx,ox+8,oy+8,C.s); px(ctx,ox+7,oy+7,C.s); px(ctx,ox+8,oy+6,C.s);
    for (const [x,y] of [[9,6],[10,5],[11,5],[12,4],[11,4],[10,4]]) px(ctx,ox+x,oy+y,C.l1);
    for (const [x,y] of [[9,5],[10,6]]) px(ctx,ox+x,oy+y,C.l2);
    px(ctx,ox+12,oy+4,C.ld);
    for (const [x,y] of [[6,6],[5,5],[4,5],[3,4],[4,4],[5,4]]) px(ctx,ox+x,oy+y,C.l1);
    for (const [x,y] of [[6,5],[5,6]]) px(ctx,ox+x,oy+y,C.l2);
    px(ctx,ox+3,oy+4,C.ld);
    for (const [x,y] of [[7,4],[8,4],[7,3],[8,3],[7,2],[8,2]]) px(ctx,ox+x,oy+y,C.l1);
    for (const [x,y] of [[7,3],[8,3]]) px(ctx,ox+x,oy+y,C.l2);
    px(ctx,ox+7,oy+2,C.ld);
}

// bed – 32×16 (2×1)
function bed(ctx, ox = 0, oy = 0) {
    const C = { frame: '#6b4020', fh: '#8a5a30', sheet: '#b8d4f0', pillow: '#e8f0ff', blanket: '#4a78c0', bl: '#6090e0', bd: '#305890' };
    // frame
    rect(ctx, ox, oy, 32, 16, C.frame);
    // headboard
    rect(ctx, ox+28, oy+1, 4, 14, C.fh);
    hline(ctx, oy+1, ox+28, ox+32, '#c07840');
    // footboard
    rect(ctx, ox, oy+1, 3, 14, C.fh);
    // mattress/sheet
    rect(ctx, ox+3, oy+3, 25, 10, C.sheet);
    // blanket (lower half)
    rect(ctx, ox+3, oy+8, 25, 5, C.blanket);
    hline(ctx, oy+8, ox+3, ox+28, C.bl); hline(ctx, oy+12, ox+3, ox+28, C.bd);
    // pillow
    rect(ctx, ox+22, oy+3, 6, 5, C.pillow);
    hline(ctx, oy+3, ox+22, ox+28, '#ffffff'); hline(ctx, oy+7, ox+22, ox+28, '#c0cce0');
    // frame shadow
    hline(ctx, oy+14, ox, ox+32, C.frame);
}

// bookshelf – 16×32 (1×2)
function bookshelf(ctx, ox = 0, oy = 0) {
    const C = { shelf: '#8a5828', sd: '#5a3010', sl: '#b07840' };
    rect(ctx, ox, oy, 16, 32, C.shelf);
    // shelves
    hline(ctx, oy+10, ox, ox+16, C.sd); hline(ctx, oy+11, ox, ox+16, '#7a4820');
    hline(ctx, oy+21, ox, ox+16, C.sd); hline(ctx, oy+22, ox, ox+16, '#7a4820');
    hline(ctx, oy+31, ox, ox+16, C.sd);
    // side rails
    vline(ctx, ox, oy, oy+32, C.sd); vline(ctx, ox+15, oy, oy+32, C.sd);
    // top highlight
    hline(ctx, oy+0, ox, ox+16, C.sl);
    // books row 1 (y 0-9)
    const books1 = ['#c03030','#3060c0','#308040','#c08020','#8030a0','#205090','#a04020'];
    for (let i=0;i<7;i++) { rect(ctx,ox+1+i*2,oy+1,2,9,books1[i]); px(ctx,ox+1+i*2,oy+1,'#ffffff'); }
    px(ctx,ox+15,oy+2,'#c08020');
    // books row 2 (y 12-20)
    const books2 = ['#20a080','#a02060','#6040c0','#c06010','#208090','#904020','#40a040'];
    for (let i=0;i<7;i++) { rect(ctx,ox+1+i*2,oy+12,2,9,books2[i]); px(ctx,ox+1+i*2,oy+12,'#ffffff'); }
    // books row 3 (y 23-30)
    const books3 = ['#b03020','#2050b0','#508030','#b07010','#703090','#105080'];
    for (let i=0;i<6;i++) { rect(ctx,ox+1+i*2,oy+23,2,8,books3[i]); px(ctx,ox+1+i*2,oy+23,'#ffffff'); }
}

// lamp – 16×16 (1×1)
function lamp(ctx, ox = 0, oy = 0) {
    const C = { stand: '#808080', sl: '#a0a0a0', shade: '#d09020', glow: '#ffe080', base: '#606060' };
    // base
    rect(ctx, ox+4, oy+13, 8, 3, C.base);
    hline(ctx, oy+13, ox+4, ox+12, C.sl);
    // pole
    vline(ctx, ox+7, oy+5, oy+13, C.stand); vline(ctx, ox+8, oy+5, oy+13, C.sl);
    // shade
    rect(ctx, ox+3, oy+2, 10, 5, C.shade);
    hline(ctx, oy+2, ox+3, ox+13, '#f0d040'); // top rim
    hline(ctx, oy+6, ox+2, ox+14, '#b07010'); // bottom rim wider
    // glow
    px(ctx, ox+7, oy+3, C.glow); px(ctx, ox+8, oy+3, C.glow); px(ctx, ox+7, oy+4, C.glow); px(ctx, ox+8, oy+4, C.glow);
    px(ctx, ox+6, oy+7, '#fff0a0'); px(ctx, ox+9, oy+7, '#fff0a0');
}

// counter – 32×16 (2×1)
function counter(ctx, ox = 0, oy = 0) {
    const C = { top: '#c0a870', td: '#9a8050', wood: '#8a5828', wd: '#5a3810', wl: '#b07840' };
    // countertop
    rect(ctx, ox, oy, 32, 4, C.top);
    hline(ctx, oy+0, ox, ox+32, '#d8c090'); // top highlight
    hline(ctx, oy+3, ox, ox+32, C.td);       // edge
    hline(ctx, oy+4, ox, ox+32, C.wd);       // shadow under edge
    // cabinet body
    rect(ctx, ox, oy+5, 32, 11, C.wood);
    // cabinet dividers
    vline(ctx, ox+15, oy+5, oy+16, C.wd); vline(ctx, ox+16, oy+5, oy+16, C.wl);
    // cabinet door lines
    hline(ctx, oy+9, ox+1, ox+15, C.wd); hline(ctx, oy+9, ox+17, ox+31, C.wd);
    // handles
    px(ctx,ox+6,oy+9,C.top); px(ctx,ox+7,oy+9,C.top);
    px(ctx,ox+22,oy+9,C.top); px(ctx,ox+23,oy+9,C.top);
    // bottom
    hline(ctx, oy+15, ox, ox+32, C.wd);
}

// barrel – 16×16 (1×1)
function barrel(ctx, ox = 0, oy = 0) {
    const C = { wood: '#8a5020', wd: '#5a3010', wl: '#b07030', ring: '#505050', ringl: '#707070' };
    // barrel body (rounded with varying widths)
    for (let y=0;y<16;y++) {
        const hw = y < 3 || y > 12 ? 4 : y < 6 || y > 9 ? 5 : 6;
        rect(ctx, ox+8-hw, oy+y, hw*2, 1, (y%3===0)?C.wd:(y%3===1)?C.wood:C.wl);
    }
    // metal rings
    for (const y of [2,3,12,13]) hline(ctx, oy+y, ox+3, ox+13, C.ring);
    hline(ctx, oy+2, ox+4, ox+12, C.ringl); hline(ctx, oy+12, ox+4, ox+12, C.ringl);
    // top cap
    hline(ctx, oy+0, ox+5, ox+11, C.wl); hline(ctx, oy+1, ox+4, ox+12, '#c08040');
    // lid line
    hline(ctx, oy+3, ox+4, ox+12, C.wd);
    // highlight
    vline(ctx, ox+3, oy+4, oy+12, '#c07030');
}

// sign – 16×16 (1×1)
function sign(ctx, ox = 0, oy = 0) {
    const C = { post: '#7a4a18', ph: '#9a6a30', board: '#c09050', bh: '#d8b070', bd: '#8a6030' };
    // post
    rect(ctx, ox+7, oy+0, 2, 16, C.post);
    px(ctx, ox+7, oy+0, C.ph); px(ctx, ox+7, oy+1, C.ph);
    // sign board
    rect(ctx, ox+1, oy+2, 14, 8, C.board);
    hline(ctx, oy+2, ox+1, ox+15, C.bh); // top highlight
    hline(ctx, oy+9, ox+1, ox+15, C.bd); // bottom shadow
    vline(ctx, ox+1, oy+2, oy+10, C.bh); // left highlight
    vline(ctx, ox+14, oy+2, oy+10, C.bd); // right shadow
    // text lines (decorative)
    hline(ctx, oy+4, ox+3, ox+13, C.bd);
    hline(ctx, oy+6, ox+3, ox+11, C.bd);
    hline(ctx, oy+8, ox+3, ox+9,  C.bd);
}

// campfire – 16×16 (1×1)
function campfire(ctx, ox = 0, oy = 0) {
    const C = { log: '#6b3a10', logl: '#9a5a20', ash: '#808080', ember: '#c04010', flame: '#f08010', flamel: '#ffd040', tip: '#fff080' };
    // ash circle
    for (let y=10;y<15;y++) for (let x=2;x<14;x++) {
        const dx=x-8,dy=y-12.5; if(dx*dx*0.7+dy*dy<=9) px(ctx,ox+x,oy+y,C.ash);
    }
    // logs (X pattern)
    for (let i=0;i<6;i++) { px(ctx,ox+3+i,oy+13-i,C.log); px(ctx,ox+4+i,oy+14-i,C.logl); }
    for (let i=0;i<6;i++) { px(ctx,ox+12-i,oy+13-i,C.log); px(ctx,ox+11-i,oy+14-i,C.log); }
    // embers
    for (const [x,y] of [[5,11],[9,10],[7,12],[11,11]]) px(ctx,ox+x,oy+y,C.ember);
    // flame layers
    for (let y=5;y<12;y++) for (let x=4;x<12;x++) {
        const dx=x-8,dy=y-9; if(dx*dx+dy*dy<=12) px(ctx,ox+x,oy+y,C.flame);
    }
    for (let y=3;y<9;y++) for (let x=5;x<11;x++) {
        const dx=x-8,dy=y-6; if(dx*dx+dy*dy<=8) px(ctx,ox+x,oy+y,C.flamel);
    }
    for (let y=1;y<6;y++) for (let x=6;x<10;x++) {
        const dx=x-8,dy=y-3.5; if(dx*dx*2+dy*dy<=5) px(ctx,ox+x,oy+y,C.tip);
    }
}

// fountain – 32×32 (2×2)
function fountain(ctx, ox = 0, oy = 0) {
    const C = { stone: '#909090', sl: '#b8b8b8', sd: '#606060', water: '#4090e0', wl: '#80c0f8', foam: '#c8e8ff' };
    // outer basin
    for (let y=18;y<30;y++) for (let x=4;x<28;x++) {
        const dx=x-16,dy=y-24; if(dx*dx*0.4+dy*dy<=36) px(ctx,ox+x,oy+y,C.stone);
    }
    // basin top rim
    for (let x=6;x<26;x++) { px(ctx,ox+x,oy+18,C.sl); px(ctx,ox+x,oy+19,C.sl); }
    // water in basin
    for (let y=20;y<29;y++) for (let x=6;x<26;x++) {
        const dx=x-16,dy=y-24; if(dx*dx*0.4+dy*dy<=28) px(ctx,ox+x,oy+y,(dx+dy)%3===0?C.wl:C.water);
    }
    // center pedestal
    rect(ctx, ox+13, oy+10, 6, 12, C.stone);
    hline(ctx, oy+10, ox+13, ox+19, C.sl);
    for (let y=10;y<22;y++) { px(ctx,ox+13,oy+y,C.sl); px(ctx,ox+18,oy+y,C.sd); }
    // top basin
    for (let y=7;y<12;y++) for (let x=10;x<22;x++) {
        const dx=x-16,dy=y-9; if(dx*dx+dy*dy*1.5<=16) px(ctx,ox+x,oy+y,C.stone);
    }
    hline(ctx, oy+7, ox+11, ox+21, C.sl);
    for (let y=8;y<11;y++) for (let x=11;x<21;x++) {
        const dx=x-16,dy=y-9; if(dx*dx+dy*dy*1.5<=12) px(ctx,ox+x,oy+y,C.wl);
    }
    // water spray
    for (const [x,y] of [[16,4],[15,3],[17,3],[14,5],[18,5],[16,2]]) px(ctx,ox+x,oy+y,C.foam);
    for (const [x,y] of [[15,5],[17,5],[13,6],[19,6]]) px(ctx,ox+x,oy+y,C.wl);
    // shadow
    hline(ctx, oy+29, ox+6, ox+26, C.sd);
}

// painting – 32×16 (2×1, wall item)
function painting(ctx, ox = 0, oy = 0) {
    const C = { frame: '#8a5020', fh: '#c07838', inner: '#f8f0e0' };
    rect(ctx, ox, oy, 32, 16, C.frame);
    hline(ctx, oy+0, ox, ox+32, C.fh); vline(ctx, ox, oy, oy+16, C.fh);
    rect(ctx, ox+3, oy+3, 26, 10, C.inner);
    // simple landscape painting
    rect(ctx, ox+3, oy+3, 26, 5, '#6ab0e0'); // sky
    rect(ctx, ox+3, oy+8, 26, 5, '#5a9a3a'); // ground
    // sun
    for (let y=4;y<7;y++) for (let x=ox+24;x<ox+30;x++) { const dx=x-ox-27,dy=y-5; if(dx*dx+dy*dy<=4) px(ctx,x,oy+y,'#ffe060'); }
    // tree silhouette
    for (let y=5;y<9;y++) for (let x=ox+8;x<ox+14;x++) { const dx=x-ox-11,dy=y-7; if(dx*dx+dy*dy<=6) px(ctx,x,oy+y,'#2a6a18'); }
    vline(ctx, ox+11, oy+9, oy+13, '#7a4a20');
}

// crystal – 16×16 (1×1)
function crystal(ctx, ox = 0, oy = 0) {
    const C = { base: '#8040e0', l: '#c080ff', d: '#4010a0', hi: '#e8c0ff', tip: '#ffffff' };
    // crystal facets
    for (let y=3;y<14;y++) for (let x=4;x<12;x++) {
        const dx=x-8,dy=y-8;
        if(Math.abs(dx)+(dy+2)*0.7<=5) {
            px(ctx,ox+x,oy+y,dx<0?C.l:(dx>1?C.d:C.base));
        }
    }
    // tip
    for (const [x,y] of [[7,1],[8,1],[7,2],[8,2],[6,3],[9,3]]) px(ctx,ox+x,oy+y,C.l);
    px(ctx,ox+7,oy+0,C.tip); px(ctx,ox+8,oy+0,C.tip);
    // highlights
    for (const [x,y] of [[5,5],[6,4],[5,6]]) px(ctx,ox+x,oy+y,C.hi);
    // glow around base
    for (const [x,y] of [[4,12],[5,13],[6,14],[7,14],[8,14],[9,13],[10,12]]) px(ctx,ox+x,oy+y,C.d);
}

// throne – 32×32 (2×2)
function throne(ctx, ox = 0, oy = 0) {
    const C = { gold: '#c8a020', gl: '#f0c840', gd: '#906010', ruby: '#c02030', seat: '#8a3a10', sl: '#b05020', cushion: '#9b1820', cl: '#cc3030' };
    // legs
    for (const x of [4,5,26,27]) rect(ctx,ox+x,oy+26,3,6,C.gd);
    // seat
    rect(ctx, ox+4, oy+18, 24, 9, C.seat);
    hline(ctx, oy+18, ox+4, ox+28, C.sl);
    // seat cushion
    rect(ctx, ox+5, oy+19, 22, 7, C.cushion);
    hline(ctx, oy+19, ox+5, ox+27, C.cl);
    // back frame
    rect(ctx, ox+4, oy+2, 24, 17, C.gold);
    hline(ctx, oy+2, ox+4, ox+28, C.gl);
    vline(ctx, ox+4, oy+2, oy+19, C.gl);
    // inner back panel
    rect(ctx, ox+6, oy+4, 20, 13, '#7a3010');
    rect(ctx, ox+7, oy+5, 18, 11, '#c04020');
    hline(ctx, oy+5, ox+7, ox+25, '#e06030');
    // armrests
    rect(ctx, ox+4, oy+14, 4, 5, C.gold);
    rect(ctx, ox+24, oy+14, 4, 5, C.gold);
    hline(ctx, oy+14, ox+4, ox+8, C.gl); hline(ctx, oy+14, ox+24, ox+28, C.gl);
    // crown decoration (top)
    for (const x of [8,12,16,20,24]) rect(ctx,ox+x,oy+0,3,3,C.gold);
    for (const x of [6,10,14,18,22,26]) px(ctx,ox+x,oy+1,C.gd);
    hline(ctx, oy+2, ox+4, ox+28, C.gl);
    // rubies
    for (const [x,y] of [[9,6],[15,6],[21,6],[9,12],[15,12],[21,12]]) { px(ctx,ox+x,oy+y,C.ruby); px(ctx,ox+x+1,oy+y,C.ruby); px(ctx,ox+x,oy+y+1,C.ruby); px(ctx,ox+x+1,oy+y+1,C.ruby); }
    // gold trim bottom
    hline(ctx, oy+18, ox+4, ox+28, C.gl); hline(ctx, oy+26, ox+4, ox+28, C.gl);
}

// ─── Render and save ──────────────────────────────────────────────────────────

const TILES = [
    { name: 'grass',         w: 16, h: 16, fn: grass      },
    { name: 'dirt',          w: 16, h: 16, fn: dirt       },
    { name: 'water',         w: 16, h: 16, fn: water      },
    { name: 'wall',          w: 16, h: 16, fn: wall       },
    { name: 'path',          w: 16, h: 16, fn: path       },
    { name: 'tree',          w: 32, h: 32, fn: tree       },
    { name: 'fence',         w: 16, h: 16, fn: fence      },
    { name: 'flower',        w: 16, h: 16, fn: flower     },
    // new floor tiles
    { name: 'sand',          w: 16, h: 16, fn: sand       },
    { name: 'snow',          w: 16, h: 16, fn: snow       },
    { name: 'lava',          w: 16, h: 16, fn: lava       },
    { name: 'cobblestone',   w: 16, h: 16, fn: cobblestone },
    { name: 'wood-floor',    w: 16, h: 16, fn: woodFloor  },
    { name: 'cave-floor',    w: 16, h: 16, fn: caveFloor  },
    // new nature tiles
    { name: 'bush',          w: 16, h: 16, fn: bush       },
    { name: 'cactus',        w: 16, h: 16, fn: cactus     },
    { name: 'rock',          w: 16, h: 16, fn: rock       },
    { name: 'mushroom',      w: 16, h: 16, fn: mushroom   },
    { name: 'pine-tree',     w: 32, h: 32, fn: pineTree   },
    // new water variants
    { name: 'shallow-water', w: 16, h: 16, fn: shallowWater },
    { name: 'waterfall',     w: 16, h: 32, fn: waterfall  },
    // new structure tiles
    { name: 'brick-wall',    w: 16, h: 16, fn: brickWall  },
    { name: 'window',        w: 16, h: 16, fn: windowTile },
    { name: 'door',          w: 16, h: 32, fn: door       },
    { name: 'roof',          w: 16, h: 16, fn: roof       },
    { name: 'chest',         w: 16, h: 16, fn: chest      },
];

const ITEMS = [
    { name: 'sofa',      w: 32, h: 16, fn: sofa      },
    { name: 'table',     w: 32, h: 16, fn: table     },
    { name: 'chair',     w: 16, h: 16, fn: chair     },
    { name: 'rug',       w: 48, h: 32, fn: rug       },
    { name: 'plant',     w: 16, h: 16, fn: plant     },
    // previously missing sprites
    { name: 'lamp',      w: 16, h: 16, fn: lamp      },
    { name: 'painting',  w: 32, h: 16, fn: painting  },
    { name: 'bookshelf', w: 16, h: 32, fn: bookshelf },
    { name: 'crystal',   w: 16, h: 16, fn: crystal   },
    { name: 'throne',    w: 32, h: 32, fn: throne    },
    // new items
    { name: 'bed',       w: 32, h: 16, fn: bed       },
    { name: 'counter',   w: 32, h: 16, fn: counter   },
    { name: 'barrel',    w: 16, h: 16, fn: barrel    },
    { name: 'sign',      w: 16, h: 16, fn: sign      },
    { name: 'campfire',  w: 16, h: 16, fn: campfire  },
    { name: 'fountain',  w: 32, h: 32, fn: fountain  },
];

for (const { name, w, h, fn } of TILES) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    fn(ctx);
    const buf = canvas.toBuffer('image/png');
    writeFileSync(join(TILES_OUT, `${name}.png`), buf);
    writeFileSync(join(HTTP_OUT,  `${name}.png`), buf);
    console.log(`✓ tile  ${name}.png  (${w}×${h})`);
}

for (const { name, w, h, fn } of ITEMS) {
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    fn(ctx);
    const buf = canvas.toBuffer('image/png');
    writeFileSync(join(ITEMS_OUT, `${name}.png`), buf);
    writeFileSync(join(HTTP_OUT,  `${name}.png`), buf);
    console.log(`✓ item  ${name}.png  (${w}×${h})`);
}

console.log('\nAll sprites generated!');
