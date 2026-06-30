import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './marketing.css';
import MarketingNav from './MarketingNav';
import MarketingFooter from './MarketingFooter';

// ── Scroll-reveal hook ─────────────────────────────────────────────────
function useReveal(rootRef: React.RefObject<HTMLElement | null>) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
        const vh = window.innerHeight || 800;
        els.forEach(el => {
            if (el.getBoundingClientRect().top < vh * 0.88) return;
            el.style.opacity = '0';
            el.style.transform = 'translateY(26px)';
            el.style.transition = 'opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)';
            (el as HTMLElement & { _hidden?: boolean })._hidden = true;
        });
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    (e.target as HTMLElement).style.opacity = '1';
                    (e.target as HTMLElement).style.transform = 'none';
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
        els.forEach(el => { if ((el as HTMLElement & { _hidden?: boolean })._hidden) io.observe(el); });
        return () => io.disconnect();
    }, [rootRef]);
}

// ── Pixel-office canvas ────────────────────────────────────────────────
function usePixelCanvas(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
    useEffect(() => {
        const cv = canvasRef.current;
        if (!cv) return;
        const ctx = cv.getContext('2d');
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;

        const load = (src: string) => new Promise<HTMLImageElement | null>(res => {
            const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src;
        });

        const W = cv.width, H = cv.height, T = 16;
        const DRAW_W = 20, DRAW_H = 30;           // render size
        const FRAME_SW = 32, FRAME_SH = 48;       // each frame is 32×48 (sheet: 256×96, 4 frames × 32px in first 128px)
        const FRAME_ROW = 0;                       // row 0 = south-facing walk cycle
        const SPEED = 0.45;
        let raf = 0, cancelled = false, hoveredIdx = -1;

        // Walkable waypoints (floor area only)
        const WP: [number, number][] = [
            [80, 148], [176, 122], [252, 148], [54, 180],
            [136, 165], [210, 158], [118, 155], [228, 155],
            [290, 170], [100, 168], [168, 142], [290, 148],
        ];

        interface Agent {
            role: string; tag: string; tagColor: string;
            wisdom: string[];
            x: number; y: number; tx: number; ty: number;
            waitTick: number; frame: number; tick: number;
            facingLeft: boolean; wasHovered: boolean; wisdomIdx: number;
            img: HTMLImageElement | null;
        }

        const DEFS = [
            {
                role: 'dev', tag: 'Dana', tagColor: '#7c3aed',
                x: 80, y: 148,
                wisdom: [
                    'Ship it — perfect is the enemy of done.',
                    'The best code is no code.',
                    'Always be refactoring. Quietly.',
                    'Tests are love letters to your future self.',
                ],
            },
            {
                role: 'designer', tag: 'Dee', tagColor: '#ec4899',
                x: 176, y: 122,
                wisdom: [
                    'Whitespace breathes. Let it.',
                    'Your users don\'t read — they scan.',
                    'Design is thinking made visible.',
                    'Contrast is clarity.',
                ],
            },
            {
                role: 'hr', tag: 'Helen', tagColor: '#16a34a',
                x: 252, y: 148,
                wisdom: [
                    'Psychological safety IS the product.',
                    'Retention starts on day one.',
                    'Culture is what you tolerate, not what you say.',
                    'Your best 1:1 is a walk outside.',
                ],
            },
            {
                role: 'marketing', tag: 'Mia', tagColor: '#f59e0b',
                x: 54, y: 180,
                wisdom: [
                    'If you build it, they won\'t come — tell them.',
                    'Story first. Features second.',
                    'Vibes are a distribution channel.',
                    'Clarity converts better than cleverness.',
                ],
            },
        ];

        const agents: Agent[] = DEFS.map((d, i) => ({
            ...d, tx: d.x, ty: d.y,
            waitTick: 60 + i * 45, frame: 0, tick: 0,
            facingLeft: false, wasHovered: false, wisdomIdx: 0, img: null,
        }));

        // Mouse → canvas coordinate mapping
        const onMouseMove = (e: MouseEvent) => {
            const r = cv.getBoundingClientRect();
            const mx = (e.clientX - r.left) * (W / r.width);
            const my = (e.clientY - r.top) * (H / r.height);
            let found = -1;
            agents.forEach((a, i) => {
                if (mx >= a.x - DRAW_W / 2 - 4 && mx <= a.x + DRAW_W / 2 + 4 &&
                    my >= a.y - DRAW_H - 4 && my <= a.y + 4) found = i;
            });
            hoveredIdx = found;
            cv.style.cursor = found >= 0 ? 'pointer' : 'default';
        };
        const onMouseLeave = () => { hoveredIdx = -1; cv.style.cursor = 'default'; };
        cv.addEventListener('mousemove', onMouseMove);
        cv.addEventListener('mouseleave', onMouseLeave);

        (async () => {
            const wantBg: Record<string, string> = {
                floor: '/tiles/office-floor.png', wall: '/tiles/wall.png', window: '/tiles/window.png',
                rug: '/items/rug.png', desk: '/items/office-desk.png', computer: '/items/computer.png',
                chair: '/items/office-chair.png', table: '/items/meeting-table.png', wb: '/items/whiteboard.png',
                plant: '/items/plant.png', coffee: '/items/coffee-machine.png', vend: '/items/vending-machine.png',
                shelf: '/items/bookshelf.png', sofa: '/items/sofa.png',
            };
            const bgI: Record<string, HTMLImageElement | null> = {};
            await Promise.all(Object.keys(wantBg).map(async k => { bgI[k] = await load(wantBg[k]); }));
            const avImgs = await Promise.all(DEFS.map(d => load(`/avatars/avatar-${d.role}.png`)));
            agents.forEach((a, i) => { a.img = avImgs[i]; });
            if (cancelled) return;

            // Pre-render static BG
            const bg = document.createElement('canvas'); bg.width = W; bg.height = H;
            const b = bg.getContext('2d')!; b.imageSmoothingEnabled = false;
            if (bgI.floor) for (let y = 0; y < H; y += T) for (let x = 0; x < W; x += T) b.drawImage(bgI.floor, x, y, T, T);
            if (bgI.wall) for (let x = 0; x < W; x += T) { b.drawImage(bgI.wall, x, 0, T, T); b.drawImage(bgI.wall, x, T, T, T); }
            if (bgI.window) [40, 64, 256, 280].forEach(x => b.drawImage(bgI.window!, x, 6, T, T));
            const blit = (img: HTMLImageElement | null, cx: number, by: number) => {
                if (!img) return;
                b.drawImage(img, Math.round(cx - img.width / 2), Math.round(by - img.height), img.width, img.height);
            };
            if (bgI.rug) b.drawImage(bgI.rug, 132, 96, 88, 56);
            ([
                [bgI.coffee, 26, 50], [bgI.vend, 326, 52], [bgI.wb, 176, 44], [bgI.shelf, 300, 48],
                [bgI.table, 176, 132], [bgI.chair, 150, 138], [bgI.chair, 202, 138],
                [bgI.desk, 54, 116], [bgI.computer, 54, 108], [bgI.chair, 54, 130],
                [bgI.desk, 290, 116], [bgI.computer, 290, 108], [bgI.chair, 290, 130],
                [bgI.sofa, 54, 188], [bgI.plant, 8, 188], [bgI.plant, 334, 188],
            ] as [HTMLImageElement | null, number, number][]).forEach(([img, cx, by]) => blit(img, cx, by));

            const drawNametag = (a: Agent) => {
                ctx.font = 'bold 8px system-ui';
                const tw = ctx.measureText(a.tag).width + 12;
                const tx = Math.round(a.x - tw / 2), ty = Math.round(a.y - DRAW_H - 13);
                ctx.fillStyle = 'rgba(255,255,255,0.92)';
                ctx.beginPath(); ctx.roundRect?.(tx, ty, tw, 14, 4); ctx.fill();
                ctx.fillStyle = a.tagColor;
                ctx.beginPath(); ctx.arc(tx + 8, ty + 7, 3, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#211c3b';
                ctx.fillText(a.tag, tx + 14, ty + 10);
            };

            const drawDialogue = (a: Agent) => {
                const quote = a.wisdom[a.wisdomIdx];
                const BW = 112, PAD = 6, LINE_H = 9;
                ctx.font = '7px system-ui';
                // word-wrap
                const lines: string[] = [];
                let line = '';
                for (const w of quote.split(' ')) {
                    const t = line ? line + ' ' + w : w;
                    if (ctx.measureText(t).width > BW - PAD * 2) { if (line) lines.push(line); line = w; }
                    else line = t;
                }
                if (line) lines.push(line);
                const BH = lines.length * LINE_H + PAD * 2 + 2;
                let bx = Math.round(a.x - BW / 2);
                const charTop = Math.round(a.y - DRAW_H);
                const by = charTop - BH - 10;
                bx = Math.max(3, Math.min(W - BW - 3, bx));
                // shadow
                ctx.fillStyle = 'rgba(0,0,0,0.12)';
                ctx.beginPath(); ctx.roundRect?.(bx + 2, by + 2, BW, BH, 7); ctx.fill();
                // bubble
                ctx.fillStyle = '#ffffff'; ctx.strokeStyle = a.tagColor; ctx.lineWidth = 1.5;
                ctx.beginPath(); ctx.roundRect?.(bx, by, BW, BH, 7); ctx.fill(); ctx.stroke();
                // pointer triangle
                const tipX = Math.max(bx + 10, Math.min(bx + BW - 10, Math.round(a.x)));
                ctx.beginPath();
                ctx.moveTo(tipX - 5, by + BH);
                ctx.lineTo(tipX, by + BH + 7);
                ctx.lineTo(tipX + 5, by + BH);
                ctx.fillStyle = '#ffffff'; ctx.fill();
                ctx.strokeStyle = a.tagColor; ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(tipX - 5, by + BH); ctx.lineTo(tipX, by + BH + 7); ctx.lineTo(tipX + 5, by + BH);
                ctx.stroke();
                // text
                ctx.fillStyle = '#211c3b'; ctx.font = '7px system-ui';
                lines.forEach((l, i) => ctx.fillText(l, bx + PAD, by + PAD + 8 + i * LINE_H));
            };

            const drawAgent = (a: Agent) => {
                if (!a.img) return;
                const f = a.frame % 4;
                const dx = Math.round(a.x - DRAW_W / 2), dy = Math.round(a.y - DRAW_H);
                const sy = FRAME_ROW * FRAME_SH;
                if (a.facingLeft) {
                    ctx.save(); ctx.scale(-1, 1);
                    ctx.drawImage(a.img, f * FRAME_SW, sy, FRAME_SW, FRAME_SH, -(dx + DRAW_W), dy, DRAW_W, DRAW_H);
                    ctx.restore();
                } else {
                    ctx.drawImage(a.img, f * FRAME_SW, sy, FRAME_SW, FRAME_SH, dx, dy, DRAW_W, DRAW_H);
                }
                drawNametag(a);
            };

            const step = () => {
                if (cancelled) return;
                ctx.drawImage(bg, 0, 0);

                agents.forEach((a, i) => {
                    const isHovered = i === hoveredIdx;
                    // Advance wisdom quote on new hover
                    if (isHovered && !a.wasHovered) a.wisdomIdx = (a.wisdomIdx + 1) % a.wisdom.length;
                    a.wasHovered = isHovered;

                    if (isHovered || a.waitTick > 0) {
                        a.frame = 0;
                        if (!isHovered && a.waitTick > 0) a.waitTick--;
                        drawAgent(a);
                        return;
                    }
                    // Walk toward target
                    const dx = a.tx - a.x, dy = a.ty - a.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 1.5) {
                        const wp = WP[Math.floor(Math.random() * WP.length)];
                        a.tx = wp[0]; a.ty = wp[1];
                        a.waitTick = 90 + Math.floor(Math.random() * 120);
                        a.frame = 0;
                    } else {
                        a.facingLeft = dx < 0;
                        a.x += (dx / dist) * SPEED;
                        a.y += (dy / dist) * SPEED;
                        a.x = Math.max(16, Math.min(W - 16, a.x));
                        a.y = Math.max(50, Math.min(H - 12, a.y));
                        a.tick++;
                        if (a.tick % 8 === 0) a.frame = (a.frame + 1) % 4;
                    }
                    drawAgent(a);
                });

                // Dialogue bubbles drawn last (on top of everything)
                agents.forEach((a, i) => { if (i === hoveredIdx) drawDialogue(a); });

                raf = requestAnimationFrame(step);
            };
            raf = requestAnimationFrame(step);
        })();

        return () => {
            cancelled = true;
            cancelAnimationFrame(raf);
            cv.removeEventListener('mousemove', onMouseMove);
            cv.removeEventListener('mouseleave', onMouseLeave);
        };
    }, [canvasRef]);
}

// ── FAQ accordion ──────────────────────────────────────────────────────
const HOME_FAQS = [
    { q: 'Do I need to download anything?', a: 'Nope. OfficeVerse runs entirely in the browser — share a link and your team is in the world in seconds, on any laptop.' },
    { q: 'Is there a free plan?', a: 'Yes — Free covers up to 10 teammates and one space forever. Pro and Team unlock bigger worlds, voice rooms and admin tools.' },
    { q: 'Can I use my own art and avatars?', a: 'Upload PNGs in Creator Studio to add custom furniture and props. Avatar customization and a team marketplace are on the roadmap.' },
    { q: 'How many people fit in one space?', a: 'Spaces scale from a cozy 10×10 room to a 50×50 campus. Real-time sync is Redis-backed, so big all-hands rooms stay smooth.' },
    { q: "Is my team's data private?", a: 'Spaces are private to invited members, auth is token-based, and voice/video are peer-to-peer. Enterprise SSO is available on Team.' },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
    return (
        <div style={{ border: '1px solid #ece9f7', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
            <button
                onClick={onToggle}
                style={{
                    width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 16, padding: '18px 20px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: '#211c3b', textAlign: 'left',
                }}
            >
                {q}
                <span style={{
                    flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                    background: '#f3effe', color: '#7c3aed',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, lineHeight: 1,
                }}>{open ? '−' : '+'}</span>
            </button>
            {open && <div style={{ padding: '0 20px 18px', fontSize: 15, lineHeight: 1.6, color: '#4a4368' }}>{a}</div>}
        </div>
    );
}

// ── Main component ─────────────────────────────────────────────────────
export default function HomePage() {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [openFaq, setOpenFaq] = useState(0);

    useReveal(rootRef);
    usePixelCanvas(canvasRef);

    const CheckIcon = ({ color = '#16a34a' }: { color?: string }) => (
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M20 6 9 17l-5-5" />
        </svg>
    );

    return (
        <div ref={rootRef} className="mkt-body" style={{ fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", color: '#211c3b', background: '#faf9ff', overflowX: 'hidden' }}>
            <MarketingNav active="home" />

            {/* ─── HERO ─── */}
            <section style={{ position: 'relative', maxWidth: 1280, margin: '0 auto', padding: '64px 40px 52px', overflow: 'hidden' }}>
                {/* Subtle dot grid, masked toward the canvas side */}
                <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#d6caf8 1px,transparent 1px)', backgroundSize: '24px 24px', opacity: 0.35, WebkitMaskImage: 'radial-gradient(130% 90% at 72% 0%,#000,transparent 72%)', maskImage: 'radial-gradient(130% 90% at 72% 0%,#000,transparent 72%)', pointerEvents: 'none' }} />
                {/* Soft colour blooms */}
                <div style={{ position: 'absolute', top: -80, left: -100, width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle,rgba(167,139,250,0.22),transparent 70%)', filter: 'blur(8px)', animation: 'ov-blob 14s ease-in-out infinite', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', top: 80, right: -80, width: 460, height: 460, borderRadius: '50%', background: 'radial-gradient(circle,rgba(236,72,153,0.12),transparent 70%)', filter: 'blur(8px)', animation: 'ov-blob 18s ease-in-out infinite reverse', pointerEvents: 'none' }} />

                <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: '1.15fr 1.05fr', gap: 40, alignItems: 'center' }}>

                    {/* Left */}
                    <div data-reveal style={{ minWidth: 0 }}>
                        {/* Online pill */}
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 9, padding: '7px 14px', borderRadius: 22, background: '#fff', border: '1px solid #e7e2f5', boxShadow: '0 4px 14px rgba(99,102,241,0.10)', marginBottom: 26 }}>
                            <span className="mkt-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                            <span style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 9, letterSpacing: '0.02em', color: '#7c3aed', whiteSpace: 'nowrap' }}>2,418 ONLINE NOW</span>
                        </div>

                        {/* Headline */}
                        <h1 style={{ fontSize: 58, lineHeight: 1.04, letterSpacing: -1.6, fontWeight: 800, margin: '0 0 22px', color: '#211c3b' }}>
                            Your team's office,<br />now a world worth<br />
                            <span style={{ background: 'linear-gradient(120deg,#7c3aed 0%,#ec4899 52%,#f59e0b 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>hanging out in.</span>
                        </h1>

                        {/* Sub-copy */}
                        <p style={{ fontSize: 18, lineHeight: 1.65, color: '#4a4368', margin: '0 0 34px', maxWidth: 460 }}>
                            Walk up to teammates, wave, drop into a chat — and build your space tile by tile. No call invite needed.
                        </p>

                        {/* CTAs */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
                            <Link
                                to="/login"
                                className="mkt-btn-primary"
                                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 16, fontWeight: 700, color: '#fff', padding: '15px 26px', borderRadius: 13, background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', boxShadow: '0 10px 28px rgba(124,58,237,0.34)', transition: 'transform .15s, box-shadow .15s' }}
                            >
                                Enter the world <span style={{ fontSize: 18 }}>→</span>
                            </Link>
                            <Link
                                to="/pricing"
                                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 10, fontSize: 16, fontWeight: 600, color: '#4a4368', padding: '14px 22px', borderRadius: 13, background: '#fff', border: '1px solid #e7e2f5', boxShadow: '0 2px 8px rgba(99,102,241,0.08)', transition: 'border-color .15s, box-shadow .15s' }}
                            >
                                <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: '#f3effe', alignItems: 'center', justifyContent: 'center' }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#7c3aed"><path d="M8 5v14l11-7z" /></svg>
                                </span>
                                Watch the tour
                            </Link>
                        </div>

                        {/* Feature line */}
                        <div style={{ display: 'flex', alignItems: 'center', fontSize: 13, color: '#b3aacb', letterSpacing: '0.01em', marginBottom: 28 }}>
                            {['No setup', 'Free for 10', 'Works in any browser'].map((f, i) => (
                                <span key={f} style={{ display: 'flex', alignItems: 'center' }}>
                                    {i > 0 && <span style={{ margin: '0 10px' }}>·</span>}
                                    {f}
                                </span>
                            ))}
                        </div>

                        {/* Social proof */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ display: 'flex' }}>
                                {['/avatars/avatar-dev.png', '/avatars/avatar-designer.png', '/avatars/avatar-hr.png', '/avatars/avatar-ceo.png', '/avatars/avatar-marketing.png'].map((src, i) => (
                                    <img key={i} src={src} alt="" style={{ width: 36, height: 36, borderRadius: '50%', border: '2.5px solid #fff', objectFit: 'cover', objectPosition: '0 0', background: '#ede9fe', imageRendering: 'pixelated', marginRight: i < 4 ? -10 : 0, boxShadow: '0 2px 8px rgba(99,102,241,0.18)' }} />
                                ))}
                            </div>
                            <div style={{ fontSize: 13, color: '#8b82a8', lineHeight: 1.4 }}>
                                Joined by <strong style={{ color: '#211c3b' }}>12,000+ teammates</strong><br />across 3,400 spaces this season.
                            </div>
                        </div>
                    </div>

                    {/* Right — elevated canvas frame */}
                    <div data-reveal style={{ position: 'relative', minWidth: 0 }}>
                        {/* Soft purple glow behind the frame */}
                        <div style={{ position: 'absolute', inset: 8, borderRadius: 22, background: 'linear-gradient(135deg,rgba(124,58,237,0.30),rgba(236,72,153,0.18))', filter: 'blur(32px)', pointerEvents: 'none', zIndex: 0 }} />
                        {/* Frame */}
                        <div style={{ position: 'relative', zIndex: 1, borderRadius: 20, overflow: 'hidden', background: '#fff', border: '1px solid rgba(124,58,237,0.18)', boxShadow: '0 2px 0 rgba(255,255,255,0.9) inset,0 24px 64px rgba(76,29,149,0.22),0 4px 16px rgba(76,29,149,0.10)' }}>
                            {/* Browser chrome */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '11px 14px', background: '#f7f5ff', borderBottom: '1px solid #ece9f7' }}>
                                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#ff5f57' }} />
                                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#febc2e' }} />
                                <span style={{ width: 11, height: 11, borderRadius: '50%', background: '#28c840' }} />
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px 10px', borderRadius: 7, background: '#fff', border: '1px solid #ece9f7' }}>
                                    <span style={{ fontSize: 11, color: '#8b82a8', fontFamily: "ui-monospace,'SF Mono',Menlo,monospace" }}>officeverse.world/lobby</span>
                                </div>
                            </div>
                            {/* Canvas */}
                            <div style={{ position: 'relative', background: '#cdbff0', lineHeight: 0 }}>
                                <canvas ref={canvasRef} width={352} height={224} style={{ display: 'block', width: '100%', height: 'auto', imageRendering: 'pixelated' }} />
                                <div className="mkt-floaty" style={{ position: 'absolute', top: 12, left: 12, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 20, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', fontSize: 11, fontWeight: 700, color: '#211c3b', whiteSpace: 'nowrap' }}>
                                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#16a34a' }} />5 here now
                                </div>
                                <div className="mkt-floaty2" style={{ position: 'absolute', bottom: 46, right: 14, padding: '8px 12px', borderRadius: '14px 14px 14px 3px', background: '#7c3aed', color: '#fff', fontSize: 11, fontWeight: 600, boxShadow: '0 6px 16px rgba(124,58,237,0.4)' }}>brb, coffee ☕</div>
                                <div className="mkt-floaty" style={{ position: 'absolute', bottom: 12, left: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 20, background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(6px)', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', fontSize: 11, fontWeight: 700, color: '#b45309', animationDelay: '0.5s' }}>🪙 +50 coins</div>
                            </div>
                        </div>
                    </div>

                </div>
            </section>

            {/* ─── TRUST BAR ─── */}
            <section data-reveal style={{ maxWidth: 1100, margin: '0 auto', padding: '24px 28px 24px' }}>
                <p style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#b3aacb', margin: '0 0 20px' }}>Where remote teams actually show up</p>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 46, flexWrap: 'wrap', opacity: 0.8 }}>
                    <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5, color: '#8b82a8' }}>North◇Loop</span>
                    <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5, color: '#8b82a8' }}>Pixelry</span>
                    <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: 17, color: '#8b82a8' }}>BYTEHAUS</span>
                    <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5, color: '#8b82a8' }}>Cloudkit</span>
                    <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: -0.5, color: '#8b82a8' }}>Studio∞</span>
                    <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: 17, color: '#8b82a8' }}>MERIDIAN</span>
                </div>
            </section>

            {/* ─── FEATURES ─── */}
            <section style={{ maxWidth: 1120, margin: '0 auto', padding: '70px 28px 30px' }}>
                <div data-reveal style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', letterSpacing: '0.04em', marginBottom: 16 }}>WHY OFFICEVERSE</div>
                    <h2 style={{ fontSize: 42, lineHeight: 1.1, letterSpacing: -1, fontWeight: 800, margin: '0 0 16px' }}>A workplace that feels like a place</h2>
                    <p style={{ fontSize: 17, lineHeight: 1.6, color: '#4a4368', margin: 0 }}>Presence, play, and craft — the three things video calls can't give a distributed team. Here they're the whole point.</p>
                </div>

                {/* Feature row 1 */}
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', marginBottom: 30 }}>
                    <div style={{ position: 'relative', borderRadius: 20, padding: 34, background: 'linear-gradient(160deg,#f5f3ff,#fdf2f8)', border: '1px solid #ece9f7', minHeight: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#d6caf8 1px,transparent 1px)', backgroundSize: '16px 16px', opacity: 0.5 }} />
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 14 }}>
                            <img src="/items/whiteboard.png" alt="whiteboard" style={{ height: 74, imageRendering: 'pixelated', filter: 'drop-shadow(0 8px 12px rgba(76,29,149,0.18))' }} />
                            <img src="/items/office-desk.png" alt="desk" style={{ height: 58, imageRendering: 'pixelated', filter: 'drop-shadow(0 8px 12px rgba(76,29,149,0.18))' }} />
                            <img src="/items/plant.png" alt="plant" style={{ height: 66, imageRendering: 'pixelated', filter: 'drop-shadow(0 8px 12px rgba(76,29,149,0.18))' }} />
                        </div>
                    </div>
                    <div>
                        <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7c3aed', background: '#f3effe', padding: '5px 11px', borderRadius: 8, marginBottom: 16 }}>Build mode</span>
                        <h3 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, margin: '0 0 12px' }}>Build your space, tile by tile</h3>
                        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#4a4368', margin: '0 0 18px' }}>Drag desks, whiteboards, plants and 25+ pixel-art props onto a grid up to 50×50. Paint floors, drop a meeting room, undo anything. Everyone in the room sees it appear in real time.</p>
                        <Link to="/login" style={{ textDecoration: 'none', fontSize: 15, fontWeight: 700, color: '#7c3aed', display: 'inline-flex', alignItems: 'center', gap: 7 }}>Start building <span>→</span></Link>
                    </div>
                </div>

                {/* Feature row 2 */}
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center', marginBottom: 30 }}>
                    <div style={{ order: 2, position: 'relative', borderRadius: 20, padding: 34, background: 'linear-gradient(160deg,#eff6ff,#f5f3ff)', border: '1px solid #ece9f7', minHeight: 230, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#c4b5fd 1px,transparent 1px)', backgroundSize: '16px 16px', opacity: 0.45 }} />
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 18 }}>
                            <img src="/avatars/avatar-ceo.png" alt="NPC" style={{ height: 86, imageRendering: 'pixelated', objectFit: 'none', objectPosition: '0 0', width: 64, filter: 'drop-shadow(0 8px 12px rgba(76,29,149,0.18))' }} />
                            <div style={{ background: '#fff', border: '1px solid #e7e2f5', borderRadius: '14px 14px 14px 3px', padding: '12px 14px', fontSize: 13, fontWeight: 600, color: '#211c3b', boxShadow: '0 8px 20px rgba(76,29,149,0.14)', maxWidth: 160 }}>"Welcome to my space! Grab a coffee, the standup's by the whiteboard."</div>
                        </div>
                    </div>
                    <div style={{ order: 1 }}>
                        <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#ec4899', background: '#fce7f3', padding: '5px 11px', borderRadius: 8, marginBottom: 16 }}>Living world</span>
                        <h3 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, margin: '0 0 12px' }}>Meet NPC coworkers with opinions</h3>
                        <p style={{ fontSize: 16, lineHeight: 1.65, color: '#4a4368', margin: '0 0 18px' }}>Manager Mike, Dev Dana and HR Helen patrol the floor with their own dialogue, quests and workplace-comedy energy. Your world is never empty — even at 2am.</p>
                        <Link to="/about" style={{ textDecoration: 'none', fontSize: 15, fontWeight: 700, color: '#ec4899', display: 'inline-flex', alignItems: 'center', gap: 7 }}>Meet the cast <span>→</span></Link>
                    </div>
                </div>

                {/* Feature cards row */}
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22, marginTop: 30 }}>
                    {[
                        { icon: <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h8M8 8h8M8 16h5"/><rect x="3" y="3" width="18" height="18" rx="3"/></svg>, bg: 'linear-gradient(135deg,#34d399,#10b981)', shadow: '0 6px 16px rgba(16,185,129,0.30)', title: 'Proximity chat', body: 'Walk up and a room forms automatically. Step away and it\'s gone. Voice and camera flick on only when someone\'s actually near.' },
                        { icon: '👋', bg: 'linear-gradient(135deg,#ec4899,#f59e0b)', shadow: '0 6px 16px rgba(236,72,153,0.30)', title: 'Emotes that land', body: 'Twelve animated emotes on the number keys — wave, dance, celebrate, or set an AFK status with a floating ☕ over your head.' },
                        { icon: '🪙', bg: 'linear-gradient(135deg,#f59e0b,#fbbf24)', shadow: '0 6px 16px rgba(245,158,11,0.30)', title: 'Quests & seasons', body: 'Daily gifts, coin rewards, streak milestones and seasonal collectibles keep your team coming back to the floor.' },
                    ].map(c => (
                        <div key={c.title} className="mkt-card-hover" style={{ borderRadius: 18, padding: 26, background: '#fff', border: '1px solid #ece9f7', boxShadow: '0 4px 14px rgba(99,102,241,0.07)', transition: 'transform .18s, box-shadow .18s' }}>
                            <div style={{ width: 52, height: 52, borderRadius: 14, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, boxShadow: c.shadow, fontSize: 24 }}>
                                {c.icon}
                            </div>
                            <h4 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 9px' }}>{c.title}</h4>
                            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a4368', margin: 0 }}>{c.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── STATS BAND ─── */}
            <section data-reveal style={{ maxWidth: 1120, margin: '50px auto', padding: '0 28px' }}>
                <div style={{ position: 'relative', borderRadius: 24, overflow: 'hidden', background: 'linear-gradient(135deg,#6366f1,#ec4899 60%,#f59e0b)', padding: '52px 40px', boxShadow: '0 24px 60px rgba(124,58,237,0.30)' }}>
                    <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(rgba(255,255,255,0.18) 1.5px,transparent 1.5px)', backgroundSize: '22px 22px', opacity: 0.5 }} />
                    <div style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 24, textAlign: 'center', color: '#fff' }}>
                        {[
                            { n: '12,000+', label: 'Teammates online' },
                            { n: '3,400', label: 'Spaces built' },
                            { n: '1,200,000', label: 'Coins earned' },
                            { n: '98%', label: 'Would rather not call' },
                        ].map(s => (
                            <div key={s.label}>
                                <div style={{ fontSize: 46, fontWeight: 800, letterSpacing: -1 }}>{s.n}</div>
                                <div style={{ fontSize: 14, opacity: 0.9, marginTop: 6 }}>{s.label}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ─── HOW IT WORKS ─── */}
            <section style={{ maxWidth: 1000, margin: '0 auto', padding: '40px 28px 20px' }}>
                <div data-reveal style={{ textAlign: 'center', marginBottom: 48 }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', marginBottom: 16 }}>GET STARTED</div>
                    <h2 style={{ fontSize: 42, lineHeight: 1.1, letterSpacing: -1, fontWeight: 800, margin: 0 }}>Three steps to a full office</h2>
                </div>
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 24 }}>
                    {[
                        { n: '1', color: '#7c3aed', shadow: '0 8px 20px rgba(99,102,241,0.12)', title: 'Claim your space', body: 'Pick a starter map or a blank room. Name it, size it, you\'re in.' },
                        { n: '2', color: '#ec4899', shadow: '0 8px 20px rgba(236,72,153,0.12)', title: 'Decorate & invite', body: 'Drop furniture, paint the floor, then share a link with the team.' },
                        { n: '3', color: '#f59e0b', shadow: '0 8px 20px rgba(245,158,11,0.12)', title: 'Walk over & talk', body: 'Move next to anyone to start a chat. Wave, emote, get things done.' },
                    ].map(s => (
                        <div key={s.n} style={{ textAlign: 'center' }}>
                            <div style={{ width: 64, height: 64, margin: '0 auto 18px', borderRadius: 18, background: '#fff', border: '1px solid #ece9f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Silkscreen', monospace", fontSize: 24, fontWeight: 700, color: s.color, boxShadow: s.shadow }}>{s.n}</div>
                            <h4 style={{ fontSize: 19, fontWeight: 800, margin: '0 0 9px' }}>{s.title}</h4>
                            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a4368', margin: 0 }}>{s.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── TESTIMONIALS ─── */}
            <section style={{ maxWidth: 1120, margin: '0 auto', padding: '70px 28px 30px' }}>
                <div data-reveal style={{ textAlign: 'center', marginBottom: 48 }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', marginBottom: 16 }}>LOVED ON THE FLOOR</div>
                    <h2 style={{ fontSize: 42, lineHeight: 1.1, letterSpacing: -1, fontWeight: 800, margin: 0 }}>Teams that ditched the call grid</h2>
                </div>
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22 }}>
                    {[
                        { quote: '"Standup went from a dreaded 9am call to people just… wandering over to the whiteboard. Our interns finally feel like they\'re in the room."', name: 'Priya Nair', role: 'Design Lead, Pixelry', avatar: '/avatars/avatar-designer.png' },
                        { quote: '"It\'s the first remote tool my whole team opens without being asked. The quests and seasonal drops are unreasonably motivating."', name: 'Marcus Bell', role: 'Eng Manager, Bytehaus', avatar: '/avatars/avatar-dev.png' },
                        { quote: '"We onboarded 40 people in a week and nobody felt lost. They just followed Manager Mike around the office. Genuinely delightful."', name: 'Sofia Reyes', role: 'People Ops, Meridian', avatar: '/avatars/avatar-hr.png' },
                    ].map(t => (
                        <div key={t.name} style={{ borderRadius: 18, padding: 28, background: '#fff', border: '1px solid #ece9f7', boxShadow: '0 4px 14px rgba(99,102,241,0.07)' }}>
                            <div style={{ color: '#f59e0b', fontSize: 16, marginBottom: 14, letterSpacing: 2 }}>★★★★★</div>
                            <p style={{ fontSize: 15, lineHeight: 1.65, color: '#211c3b', margin: '0 0 20px', fontWeight: 500 }}>{t.quote}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                                <img src={t.avatar} alt="" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'none', objectPosition: '0 0', background: '#ede9fe', imageRendering: 'pixelated', border: '2px solid #f3effe' }} />
                                <div>
                                    <div style={{ fontSize: 14, fontWeight: 700 }}>{t.name}</div>
                                    <div style={{ fontSize: 12, color: '#8b82a8' }}>{t.role}</div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── FAQ ─── */}
            <section style={{ maxWidth: 760, margin: '0 auto', padding: '60px 28px 30px' }}>
                <div data-reveal style={{ textAlign: 'center', marginBottom: 40 }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', marginBottom: 16 }}>QUESTIONS</div>
                    <h2 style={{ fontSize: 38, lineHeight: 1.1, letterSpacing: -1, fontWeight: 800, margin: 0 }}>Good to know</h2>
                </div>
                <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {HOME_FAQS.map((f, i) => (
                        <FaqItem key={i} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(v => v === i ? -1 : i)} />
                    ))}
                </div>
            </section>

            {/* ─── CTA BAND ─── */}
            <section data-reveal style={{ maxWidth: 1120, margin: '40px auto 70px', padding: '0 28px' }}>
                <div style={{ position: 'relative', borderRadius: 26, overflow: 'hidden', background: 'linear-gradient(135deg,#211c3b,#3b1f6e 55%,#7c3aed)', padding: '64px 40px', textAlign: 'center', boxShadow: '0 24px 60px rgba(33,28,59,0.35)' }}>
                    <div style={{ position: 'absolute', top: -90, right: -40, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(236,72,153,0.4),transparent 70%)' }} />
                    <div style={{ position: 'absolute', bottom: -110, left: -30, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,158,11,0.3),transparent 70%)' }} />
                    <div style={{ position: 'relative' }}>
                        <h2 style={{ fontSize: 40, lineHeight: 1.1, letterSpacing: -1, fontWeight: 800, color: '#fff', margin: '0 0 14px' }}>Your office is waiting.</h2>
                        <p style={{ fontSize: 18, color: '#cfc7e6', margin: '0 0 30px', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>Spin up a space, invite the team, and see how good remote can feel. Free forever for up to 10.</p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <Link to="/login" className="mkt-cta-white" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 16, fontWeight: 700, color: '#211c3b', padding: '15px 28px', borderRadius: 13, background: '#fff', boxShadow: '0 10px 26px rgba(0,0,0,0.25)', transition: 'transform .15s' }}>
                                Create your space <span>→</span>
                            </Link>
                            <Link to="/contact" className="mkt-cta-outline" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', fontSize: 16, fontWeight: 600, color: '#fff', padding: '15px 26px', borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)', transition: 'background .15s' }}>
                                Talk to us
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <MarketingFooter />
        </div>
    );
}
