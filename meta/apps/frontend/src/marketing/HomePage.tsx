import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './marketing.css';
import MarketingNav from './MarketingNav';
import MarketingFooter from './MarketingFooter';

// ── Shared design tokens ───────────────────────────────────────────────
const FONT = "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const PIXEL = "'Press Start 2P', monospace";

const C = {
    text: '#19142b',
    muted: '#6b6488',
    faint: '#8b82a8',
    accent: '#7c3aed',
    border: '#ece8f7',
    bg: '#faf9ff',
};

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
            el.style.transform = 'translateY(24px)';
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

// ── Pixel-office canvas (hero product screenshot) ──────────────────────
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
        const DRAW_W = 20, DRAW_H = 30;
        // Sheet is 256×96: columns = direction (0=down/front, 1=left, 2=right, 3=up),
        // rows = walk frames (0, 1). Each frame is 32×48.
        const FRAME_SW = 32, FRAME_SH = 48;
        const SPEED = 0.45;
        let raf = 0, cancelled = false, hoveredIdx = -1;

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
            moving: boolean;
            img: HTMLImageElement | null;
        }

        const DEFS = [
            { role: 'dev', tag: 'Dana', tagColor: '#7c3aed', x: 80, y: 148, wisdom: ['Ship it — perfect is the enemy of done.', 'The best code is no code.', 'Always be refactoring. Quietly.', 'Tests are love letters to your future self.'] },
            { role: 'designer', tag: 'Dee', tagColor: '#ec4899', x: 176, y: 122, wisdom: ['Whitespace breathes. Let it.', 'Your users don\'t read — they scan.', 'Design is thinking made visible.', 'Contrast is clarity.'] },
            { role: 'hr', tag: 'Helen', tagColor: '#16a34a', x: 252, y: 148, wisdom: ['Psychological safety IS the product.', 'Retention starts on day one.', 'Culture is what you tolerate, not what you say.', 'Your best 1:1 is a walk outside.'] },
            { role: 'marketing', tag: 'Mia', tagColor: '#f59e0b', x: 54, y: 180, wisdom: ['If you build it, they won\'t come — tell them.', 'Story first. Features second.', 'Vibes are a distribution channel.', 'Clarity converts better than cleverness.'] },
        ];

        const agents: Agent[] = DEFS.map((d, i) => ({
            ...d, tx: d.x, ty: d.y,
            waitTick: 60 + i * 45, frame: 0, tick: 0,
            facingLeft: false, wasHovered: false, wisdomIdx: 0, moving: false, img: null,
        }));

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
                ctx.font = 'bold 9px system-ui';
                const tw = ctx.measureText(a.tag).width + 14;
                const tx = Math.round(a.x - tw / 2), ty = Math.round(a.y - DRAW_H - 14);
                ctx.fillStyle = 'rgba(255,255,255,0.95)';
                ctx.beginPath(); ctx.roundRect?.(tx, ty, tw, 16, 4); ctx.fill();
                ctx.fillStyle = a.tagColor;
                ctx.beginPath(); ctx.arc(tx + 8, ty + 8, 3.5, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#19142b';
                ctx.fillText(a.tag, tx + 15, ty + 12);
            };

            const drawDialogue = (a: Agent) => {
                const quote = a.wisdom[a.wisdomIdx];
                const BW = 160, PAD = 8, LINE_H = 13;
                ctx.font = '9px system-ui';
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
                const by = charTop - BH - 12;
                bx = Math.max(3, Math.min(W - BW - 3, bx));
                ctx.fillStyle = 'rgba(0,0,0,0.14)';
                ctx.beginPath(); ctx.roundRect?.(bx + 2, by + 2, BW, BH, 8); ctx.fill();
                ctx.fillStyle = '#ffffff'; ctx.strokeStyle = a.tagColor; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.roundRect?.(bx, by, BW, BH, 8); ctx.fill(); ctx.stroke();
                const tipX = Math.max(bx + 12, Math.min(bx + BW - 12, Math.round(a.x)));
                ctx.beginPath();
                ctx.moveTo(tipX - 6, by + BH);
                ctx.lineTo(tipX, by + BH + 8);
                ctx.lineTo(tipX + 6, by + BH);
                ctx.fillStyle = '#ffffff'; ctx.fill();
                ctx.strokeStyle = a.tagColor; ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(tipX - 6, by + BH); ctx.lineTo(tipX, by + BH + 8); ctx.lineTo(tipX + 6, by + BH);
                ctx.stroke();
                ctx.fillStyle = '#19142b'; ctx.font = '9px system-ui';
                lines.forEach((l, i) => ctx.fillText(l, bx + PAD, by + PAD + 11 + i * LINE_H));
            };

            const drawAgent = (a: Agent) => {
                if (!a.img) return;
                const dx = Math.round(a.x - DRAW_W / 2), dy = Math.round(a.y - DRAW_H);
                // Walk frames alternate on rows 0/1; direction selects the column.
                const sy = (a.frame % 2) * FRAME_SH;
                let sx = 0; // idle = front-facing (col 0)
                if (a.moving) {
                    const horizontal = Math.abs(a.tx - a.x) >= Math.abs(a.ty - a.y);
                    sx = horizontal ? (a.facingLeft ? 1 : 2) * FRAME_SW : 0;
                }
                ctx.drawImage(a.img, sx, sy, FRAME_SW, FRAME_SH, dx, dy, DRAW_W, DRAW_H);
                drawNametag(a);
            };

            const step = () => {
                if (cancelled) return;
                ctx.drawImage(bg, 0, 0);

                agents.forEach((a, i) => {
                    const isHovered = i === hoveredIdx;
                    if (isHovered && !a.wasHovered) a.wisdomIdx = (a.wisdomIdx + 1) % a.wisdom.length;
                    a.wasHovered = isHovered;

                    if (isHovered || a.waitTick > 0) {
                        a.moving = false;
                        a.frame = 0;
                        if (!isHovered && a.waitTick > 0) a.waitTick--;
                        drawAgent(a);
                        return;
                    }
                    const dx = a.tx - a.x, dy = a.ty - a.y;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 1.5) {
                        const wp = WP[Math.floor(Math.random() * WP.length)];
                        a.tx = wp[0]; a.ty = wp[1];
                        a.waitTick = 90 + Math.floor(Math.random() * 120);
                        a.moving = false;
                        a.frame = 0;
                    } else {
                        a.facingLeft = dx < 0;
                        a.moving = true;
                        a.x += (dx / dist) * SPEED;
                        a.y += (dy / dist) * SPEED;
                        a.x = Math.max(16, Math.min(W - 16, a.x));
                        a.y = Math.max(50, Math.min(H - 12, a.y));
                        a.tick++;
                        if (a.tick % 8 === 0) a.frame = (a.frame + 1) % 2;
                    }
                    drawAgent(a);
                });

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

// ── FAQ data ──────────────────────────────────────────────────────────
const HOME_FAQS = [
    { q: 'Do I need to download anything?', a: 'Nope. OfficeVerse runs entirely in the browser — share a link and your team is in the world in seconds, on any laptop.' },
    { q: 'Is there a free plan?', a: 'Yes — Free covers up to 10 teammates and one space forever. Pro and Team unlock bigger worlds, voice rooms and admin tools.' },
    { q: 'Can I use my own art and avatars?', a: 'Upload PNGs in Creator Studio to add custom furniture and props. Avatar customization and a team marketplace are on the roadmap.' },
    { q: 'How many people fit in one space?', a: 'Spaces scale from a cozy 10×10 room to a 50×50 campus. Real-time sync is Redis-backed, so big all-hands rooms stay smooth.' },
    { q: "Is my team's data private?", a: 'Spaces are private to invited members, auth is token-based, and voice/video are peer-to-peer. Enterprise SSO is available on Team.' },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
    return (
        <div style={{ borderBottom: '1px solid #ece8f7' }}>
            <button
                onClick={onToggle}
                className="mkt-faq-q"
                style={{
                    width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center',
                    justifyContent: 'space-between', gap: 16, padding: '20px 2px',
                    background: 'none', border: 'none', cursor: 'pointer',
                    fontFamily: FONT, fontSize: 16, fontWeight: 600, color: C.text, textAlign: 'left',
                }}
            >
                {q}
                <span style={{
                    flexShrink: 0, width: 24, height: 24, borderRadius: 8,
                    background: open ? '#f1ecfe' : '#f4f2fb', color: C.accent,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontFamily: FONT, fontSize: 17, lineHeight: 1, fontWeight: 600,
                    transition: 'transform .2s ease', transform: open ? 'rotate(180deg)' : 'none',
                }}>{open ? '−' : '+'}</span>
            </button>
            {open && <p style={{ padding: '0 2px 22px', margin: 0, fontSize: 15, lineHeight: 1.7, color: C.muted, fontFamily: FONT }}>{a}</p>}
        </div>
    );
}

// ── Section eyebrow ───────────────────────────────────────────────────
function Eyebrow({ children, tone = C.accent }: { children: React.ReactNode; tone?: string }) {
    return (
        <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontFamily: PIXEL, fontSize: 10, letterSpacing: '0.06em', color: tone,
            marginBottom: 18,
        }}>{children}</div>
    );
}

// ── Main component ─────────────────────────────────────────────────────
export default function HomePage() {
    const rootRef = useRef<HTMLDivElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [openFaq, setOpenFaq] = useState(0);

    useReveal(rootRef);
    usePixelCanvas(canvasRef);

    const btnPrimary: React.CSSProperties = {
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 9,
        fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#fff',
        padding: '13px 24px', borderRadius: 12,
        background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
        boxShadow: '0 10px 24px rgba(124,58,237,0.32)',
        transition: 'transform .15s, box-shadow .15s',
    };
    const btnSecondary: React.CSSProperties = {
        textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 9,
        fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#3f3854',
        padding: '13px 22px', borderRadius: 12,
        background: '#fff', border: '1px solid #e5e0f5',
        boxShadow: '0 1px 2px rgba(33,28,59,0.04)',
        transition: 'transform .15s, border-color .15s, background .15s',
    };

    const NPC_TEAM = [
        { src: '/avatars/avatar-ceo-front.png', name: 'Mike', role: 'CEO' },
        { src: '/avatars/avatar-dev-front.png', name: 'Dana', role: 'Developer' },
        { src: '/avatars/avatar-designer-front.png', name: 'Dee', role: 'Designer' },
        { src: '/avatars/avatar-hr-front.png', name: 'Helen', role: 'HR Manager' },
        { src: '/avatars/avatar-marketing-front.png', name: 'Mia', role: 'Marketing' },
        { src: '/avatars/avatar-intern-front.png', name: 'Sam', role: 'Intern' },
    ];

    return (
        <div ref={rootRef} className="mkt-body" style={{ fontFamily: FONT, color: C.text, background: C.bg, overflowX: 'hidden' }}>
            <MarketingNav active="home" />

            {/* ─── HERO ─── */}
            <section style={{ position: 'relative', maxWidth: 1200, margin: '0 auto', padding: '76px 28px 40px' }}>
                {/* Subtle backdrop */}
                <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
                    <div style={{ position: 'absolute', top: '6%', right: '6%', width: 480, height: 480, borderRadius: '50%', background: 'radial-gradient(circle, rgba(167,139,250,0.16), transparent 68%)', filter: 'blur(20px)' }} />
                    <div style={{ position: 'absolute', bottom: '-20%', left: '-8%', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(236,72,153,0.07), transparent 68%)', filter: 'blur(20px)' }} />
                    <div style={{ position: 'absolute', top: 40, left: '4%', fontFamily: PIXEL, fontSize: 10, color: 'rgba(124,58,237,0.10)' }}>+</div>
                    <div style={{ position: 'absolute', top: 160, left: '1%', fontFamily: PIXEL, fontSize: 8, color: 'rgba(124,58,237,0.08)' }}>♦</div>
                    <div style={{ position: 'absolute', bottom: 80, right: '1%', fontFamily: PIXEL, fontSize: 10, color: 'rgba(124,58,237,0.09)' }}>+</div>
                </div>

                <div className="mkt-hero-grid" style={{ position: 'relative' }}>
                    {/* Left */}
                    <div data-reveal style={{ minWidth: 0 }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 12px', borderRadius: 999, background: '#fff', border: '1px solid #ece8f7', boxShadow: '0 1px 2px rgba(33,28,59,0.04)', marginBottom: 26 }}>
                            <span className="mkt-pulse" style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a', flexShrink: 0 }} />
                            <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.muted }}>2,418 online now</span>
                        </div>

                        <h1 style={{
                            fontFamily: FONT, fontWeight: 800, fontSize: 'clamp(40px, 4.8vw, 58px)',
                            lineHeight: 1.06, letterSpacing: '-0.035em', color: C.text,
                            margin: '0 0 22px',
                        }}>
                            Your team's office,<br />now a world worth<br />
                            <span style={{ background: 'linear-gradient(100deg,#7c3aed 0%,#c026d3 55%,#f59e0b 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>hanging out in.</span>
                        </h1>

                        <p style={{ fontFamily: FONT, fontSize: 18, lineHeight: 1.6, color: C.muted, margin: '0 0 34px', maxWidth: 470 }}>
                            Walk up to teammates, wave, drop into a chat — and build your space tile by tile. No call invite needed.
                        </p>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 30 }}>
                            <Link to="/login" className="mkt-btn-primary" style={btnPrimary}>
                                Enter the world <span style={{ fontSize: 16 }}>→</span>
                            </Link>
                            <Link to="/pricing" className="mkt-btn-secondary" style={btnSecondary}>
                                <span style={{ display: 'inline-flex', width: 22, height: 22, borderRadius: '50%', background: '#f1ecfe', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="#7c3aed"><path d="M8 5v14l11-7z" /></svg>
                                </span>
                                Watch the tour
                            </Link>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                            <div style={{ display: 'flex' }}>
                                {['/avatars/avatar-dev-front.png', '/avatars/avatar-designer-front.png', '/avatars/avatar-hr-front.png', '/avatars/avatar-ceo-front.png', '/avatars/avatar-marketing-front.png'].map((src, i) => (
                                    <span key={i} className="mkt-avatar-ring" style={{
                                        display: 'block', width: 36, height: 36, borderRadius: 12, overflow: 'hidden',
                                        background: '#ede9fe', border: '2px solid #fff', marginRight: i < 4 ? -8 : 0,
                                        boxShadow: '0 1px 3px rgba(33,28,59,0.10)', transition: 'transform .18s ease',
                                    }}>
                                        <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top', imageRendering: 'pixelated' }} />
                                    </span>
                                ))}
                            </div>
                            <div style={{ fontFamily: FONT, fontSize: 14, color: C.muted, lineHeight: 1.5 }}>
                                <strong style={{ color: C.text, fontWeight: 700 }}>12,000+ teammates</strong> joined<br />across 3,400 spaces this season.
                            </div>
                        </div>
                    </div>

                    {/* Right — product screenshot */}
                    <div data-reveal style={{ position: 'relative', minWidth: 0 }}>
                        <div style={{ position: 'absolute', inset: 10, borderRadius: 24, background: 'linear-gradient(135deg,rgba(124,58,237,0.18),rgba(236,72,153,0.08))', filter: 'blur(36px)', pointerEvents: 'none' }} />
                        <div style={{ position: 'relative', borderRadius: 16, overflow: 'hidden', background: '#fff', border: '1px solid rgba(33,28,59,0.08)', boxShadow: '0 2px 4px rgba(33,28,59,0.04), 0 24px 60px rgba(76,29,149,0.14)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '12px 14px', background: '#faf9ff', borderBottom: '1px solid #ece8f7' }}>
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#ff5f57' }} />
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#febc2e' }} />
                                <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#28c840' }} />
                                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '5px 10px', borderRadius: 8, background: '#fff', border: '1px solid #ece8f7' }}>
                                    <span style={{ fontFamily: "ui-monospace,'SF Mono',Menlo,monospace", fontSize: 12, color: C.faint }}>officeverse.world/lobby</span>
                                </div>
                            </div>
                            <div style={{ position: 'relative', background: '#d9d0ee', lineHeight: 0 }}>
                                <canvas ref={canvasRef} width={352} height={224} style={{ display: 'block', width: '100%', height: 'auto', imageRendering: 'pixelated' }} />
                                <div className="mkt-floaty" style={{ position: 'absolute', top: 14, left: 14, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(6px)', boxShadow: '0 4px 14px rgba(33,28,59,0.12)', fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.text, whiteSpace: 'nowrap' }}>
                                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />5 here now
                                </div>
                                <div className="mkt-floaty2" style={{ position: 'absolute', bottom: 46, right: 16, padding: '8px 12px', borderRadius: '12px 12px 12px 3px', background: '#7c3aed', color: '#fff', fontFamily: FONT, fontSize: 12, fontWeight: 600, boxShadow: '0 8px 20px rgba(124,58,237,0.40)' }}>brb, coffee ☕</div>
                                <div className="mkt-floaty" style={{ position: 'absolute', bottom: 14, left: 16, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(6px)', boxShadow: '0 4px 14px rgba(33,28,59,0.12)', fontFamily: FONT, fontSize: 12, fontWeight: 600, color: '#b45309', animationDelay: '0.5s' }}>🪙 +50 coins</div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── WHY OFFICEVERSE ─── */}
            <section style={{ maxWidth: 1120, margin: '0 auto', padding: '80px 28px 20px' }}>
                <div data-reveal style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 52px' }}>
                    <Eyebrow>WHY OFFICEVERSE</Eyebrow>
                    <h2 style={{ fontFamily: FONT, fontSize: 'clamp(30px, 3.6vw, 42px)', lineHeight: 1.12, letterSpacing: '-0.03em', fontWeight: 800, margin: '0 0 16px', color: C.text }}>A workplace that feels like a place.</h2>
                    <p style={{ fontFamily: FONT, fontSize: 17, lineHeight: 1.6, color: C.muted, margin: 0 }}>Presence, play, and craft — the three things video calls can't give a distributed team. Here they're the whole point.</p>
                </div>

                <div className="mkt-why-grid">
                    {[
                        {
                            pixel: '/avatars/avatar-dev-front.png',
                            pixelBg: 'linear-gradient(160deg,#f5f3ff,#f3f0fd)',
                            title: 'Walk up and talk',
                            body: 'Proximity chat opens a room the moment two people are near each other — and closes it when you step away. No scheduling, no invite links.',
                            link: '/pricing', linkLabel: 'See how it works',
                        },
                        {
                            pixel: '/avatars/avatar-marketing-front.png',
                            pixelBg: 'linear-gradient(160deg,#fdf2f8,#faf0ff)',
                            title: 'Emotes that land',
                            body: 'Twelve animated emotes on the number keys — wave, dance, celebrate, or set an AFK status with a floating ☕ over your head.',
                            link: '/login', linkLabel: 'Try the emotes',
                        },
                        {
                            pixel: '/items/whiteboard.png',
                            pixelBg: 'linear-gradient(160deg,#eff6ff,#f5f3ff)',
                            title: 'Build your space, tile by tile',
                            body: 'Drag desks, whiteboards, plants and 25+ pixel-art props onto a grid up to 50×50. Everyone in the room sees changes in real time.',
                            link: '/login', linkLabel: 'Start building',
                        },
                    ].map(f => (
                        <div key={f.title} className="mkt-card-hover" style={{ borderRadius: 18, padding: 26, background: '#fff', border: '1px solid #ece8f7', boxShadow: '0 1px 2px rgba(33,28,59,0.04), 0 8px 24px rgba(76,29,149,0.05)', transition: 'transform .18s ease, box-shadow .18s ease' }}>
                            <div style={{ width: '100%', height: 120, borderRadius: 12, background: f.pixelBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18, overflow: 'hidden', position: 'relative' }}>
                                <img src={f.pixel} alt="" style={{ height: 84, width: 'auto', imageRendering: 'pixelated', filter: 'drop-shadow(0 6px 10px rgba(76,29,149,0.16))' }} />
                            </div>
                            <h3 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: C.text }}>{f.title}</h3>
                            <p style={{ fontFamily: FONT, fontSize: 14, lineHeight: 1.65, color: C.muted, margin: '0 0 16px' }}>{f.body}</p>
                            <Link to={f.link} className="mkt-arrow-link" style={{ textDecoration: 'none', fontFamily: FONT, fontSize: 14, fontWeight: 600, color: C.accent, display: 'inline-flex', alignItems: 'center', gap: 8 }}>{f.linkLabel} <span>→</span></Link>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── PRODUCT SHOWCASE ─── */}
            <section style={{ maxWidth: 1120, margin: '0 auto', padding: '70px 28px 20px' }}>
                <div className="mkt-showcase-grid" data-reveal>
                    <div style={{ minWidth: 0 }}>
                        <Eyebrow>BUILD MODE</Eyebrow>
                        <h2 style={{ fontFamily: FONT, fontSize: 'clamp(28px, 3.2vw, 38px)', lineHeight: 1.14, letterSpacing: '-0.03em', fontWeight: 800, margin: '0 0 16px', color: C.text }}>Build your space,<br />tile by tile.</h2>
                        <p style={{ fontFamily: FONT, fontSize: 16, lineHeight: 1.7, color: C.muted, margin: '0 0 24px', maxWidth: 440 }}>
                            Drag desks, whiteboards, plants and pixel-art props into a shared space. Paint floors, drop a meeting room, undo anything — every change appears for everyone in real time.
                        </p>
                        <ul style={{ listStyle: 'none', margin: '0 0 28px', padding: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {['Shared canvas, live for everyone in the room', '25+ pixel-art props, furniture and floor tiles', 'Undo, erase and restyle anything instantly'].map(x => (
                                <li key={x} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontFamily: FONT, fontSize: 15, color: '#3f3854' }}>
                                    <span style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, background: '#f1ecfe', color: C.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700 }}>✓</span>
                                    {x}
                                </li>
                            ))}
                        </ul>
                        <Link to="/login" className="mkt-btn-primary" style={btnPrimary}>Start building <span>→</span></Link>
                    </div>

                    <div style={{ position: 'relative', minWidth: 0 }}>
                        <div style={{ position: 'absolute', inset: 12, borderRadius: 24, background: 'radial-gradient(circle, rgba(124,58,237,0.14), transparent 70%)', filter: 'blur(30px)', pointerEvents: 'none' }} />
                        <div style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', border: '1px solid rgba(33,28,59,0.08)', boxShadow: '0 2px 4px rgba(33,28,59,0.04), 0 24px 60px rgba(76,29,149,0.14)' }}>
                            {/* Scene */}
                            <div style={{ position: 'relative', background: 'linear-gradient(180deg,#f7f4ff 0%,#efeafd 40%)', padding: 18 }}>
                                {/* Wall props */}
                                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
                                    <img src="/items/plant.png" alt="" style={{ height: 44, imageRendering: 'pixelated' }} />
                                    <img src="/items/whiteboard.png" alt="" style={{ height: 58, imageRendering: 'pixelated' }} />
                                    <img src="/items/bookshelf.png" alt="" style={{ height: 52, imageRendering: 'pixelated' }} />
                                </div>
                                {/* Floor */}
                                <div style={{ position: 'relative', borderRadius: 12, backgroundImage: 'url(/tiles/office-floor.png)', backgroundSize: '20px 20px', backgroundRepeat: 'repeat', minHeight: 150, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 10, padding: '14px 14px 10px' }}>
                                    <img src="/items/sofa.png" alt="" style={{ height: 42, imageRendering: 'pixelated' }} />
                                    <img src="/items/meeting-table.png" alt="" style={{ height: 48, imageRendering: 'pixelated' }} />
                                    <img src="/items/office-chair.png" alt="" style={{ height: 36, imageRendering: 'pixelated' }} />
                                    <img src="/items/office-desk.png" alt="" style={{ height: 44, imageRendering: 'pixelated' }} />
                                    <img src="/items/computer.png" alt="" style={{ height: 34, imageRendering: 'pixelated' }} />
                                    <img src="/items/coffee-machine.png" alt="" style={{ height: 46, imageRendering: 'pixelated' }} />
                                </div>
                            </div>
                            {/* Floating UI labels */}
                            <div className="mkt-floaty" style={{ position: 'absolute', top: 16, left: 16, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.95)', boxShadow: '0 6px 16px rgba(33,28,59,0.12)', fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.text }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#16a34a' }} />5 people here
                            </div>
                            <div className="mkt-floaty2" style={{ position: 'absolute', top: 62, left: 18, display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.95)', boxShadow: '0 6px 16px rgba(33,28,59,0.12)', fontFamily: FONT, fontSize: 12, fontWeight: 600, color: C.text }}>
                                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#7c3aed' }} />Proximity chat
                            </div>
                            <div className="mkt-floaty" style={{ position: 'absolute', bottom: 16, right: 16, padding: '7px 12px', borderRadius: 999, background: 'rgba(255,255,255,0.95)', boxShadow: '0 6px 16px rgba(33,28,59,0.12)', fontFamily: FONT, fontSize: 12, fontWeight: 600, color: '#b45309', animationDelay: '0.4s' }}>🪙 +50 coins</div>
                            <div className="mkt-floaty2" style={{ position: 'absolute', bottom: 52, right: 18, padding: '7px 12px', borderRadius: '12px 12px 12px 3px', background: '#7c3aed', color: '#fff', fontFamily: FONT, fontSize: 12, fontWeight: 600, boxShadow: '0 8px 20px rgba(124,58,237,0.40)' }}>☕ Coffee break</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── NPC / CHARACTERS ─── */}
            <section style={{ maxWidth: 1120, margin: '0 auto', padding: '80px 28px 20px' }}>
                <div data-reveal style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 48px' }}>
                    <Eyebrow>THE CREW</Eyebrow>
                    <h2 style={{ fontFamily: FONT, fontSize: 'clamp(30px, 3.6vw, 42px)', lineHeight: 1.12, letterSpacing: '-0.03em', fontWeight: 800, margin: '0 0 16px', color: C.text }}>Meet your virtual coworkers.</h2>
                    <p style={{ fontFamily: FONT, fontSize: 17, lineHeight: 1.6, color: C.muted, margin: 0 }}>Manager Mike, Dev Dana and HR Helen patrol the floor with their own dialogue, quests and workplace-comedy energy — your world is never empty.</p>
                </div>

                <div className="mkt-team-grid">
                    {NPC_TEAM.map(n => (
                        <div key={n.name} className="mkt-avatar-ring" style={{ textAlign: 'center', borderRadius: 16, padding: '20px 10px 18px', background: '#fff', border: '1px solid #ece8f7', boxShadow: '0 1px 2px rgba(33,28,59,0.04), 0 8px 24px rgba(76,29,149,0.05)', transition: 'transform .18s ease', position: 'relative', overflow: 'hidden' }}>
                            <div style={{ position: 'relative', height: 96, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', marginBottom: 6 }}>
                                <img src={n.src} alt={n.name} style={{ height: 88, width: 'auto', imageRendering: 'pixelated', position: 'relative', zIndex: 1 }} />
                                <div style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 52, height: 16, borderRadius: 6, background: 'url(/tiles/office-floor.png) center/cover', border: '1px solid rgba(33,28,59,0.12)', zIndex: 0 }} />
                            </div>
                            <div style={{ fontFamily: FONT, fontSize: 14, fontWeight: 700, color: C.text }}>{n.name}</div>
                            <div style={{ fontFamily: FONT, fontSize: 12, color: C.muted, marginTop: 2 }}>{n.role}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── STATS ─── */}
            <section data-reveal style={{ maxWidth: 1120, margin: '56px auto 0', padding: '0 28px' }}>
                <div className="mkt-stats" style={{ borderRadius: 24, background: 'linear-gradient(160deg,#f4f0fd,#faf6ff)', border: '1px solid #ece8f7', padding: '44px 36px' }}>
                    {[
                        { n: '12,000+', label: 'Teammates online' },
                        { n: '3,400', label: 'Spaces built' },
                        { n: '1.2M', label: 'Coins earned' },
                        { n: '98%', label: 'Rather not call' },
                    ].map(s => (
                        <div key={s.label}>
                            <div style={{ fontFamily: FONT, fontSize: 40, fontWeight: 800, letterSpacing: '-0.03em', color: C.text, background: 'linear-gradient(120deg,#7c3aed,#a855f7)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>{s.n}</div>
                            <div style={{ fontFamily: FONT, fontSize: 13, color: C.muted, marginTop: 6 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── HOW IT WORKS ─── */}
            <section style={{ maxWidth: 1000, margin: '0 auto', padding: '80px 28px 20px' }}>
                <div data-reveal style={{ textAlign: 'center', marginBottom: 56 }}>
                    <Eyebrow>GET STARTED</Eyebrow>
                    <h2 style={{ fontFamily: FONT, fontSize: 'clamp(30px, 3.6vw, 42px)', lineHeight: 1.12, letterSpacing: '-0.03em', fontWeight: 800, margin: 0, color: C.text }}>Three steps to a full office</h2>
                </div>
                <div className="mkt-steps" data-reveal style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: 30, left: '16.6%', right: '16.6%', height: 2, background: '#e8e2f8' }} />
                    {[
                        { n: '01', color: '#7c3aed', icon: '🗺️', title: 'Claim your space', body: 'Pick a starter map or a blank room. Name it, size it, you\'re in.' },
                        { n: '02', color: '#a855f7', icon: '🪑', title: 'Decorate & invite', body: 'Drop furniture, paint the floor, then share a link with the team.' },
                        { n: '03', color: '#ec4899', icon: '💬', title: 'Walk over & talk', body: 'Move next to anyone to start a chat. Wave, emote, get things done.' },
                    ].map(s => (
                        <div key={s.n} style={{ textAlign: 'center', position: 'relative' }}>
                            <div style={{ width: 60, height: 60, margin: '0 auto 20px', borderRadius: 16, background: '#fff', border: '1px solid #ece8f7', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 20px rgba(76,29,149,0.08)', position: 'relative', zIndex: 1 }}>
                                <span style={{ fontFamily: FONT, fontSize: 24 }}>{s.icon}</span>
                            </div>
                            <div style={{ fontFamily: PIXEL, fontSize: 10, color: s.color, marginBottom: 10 }}>{s.n}</div>
                            <h4 style={{ fontFamily: FONT, fontSize: 18, fontWeight: 700, margin: '0 0 8px', color: C.text }}>{s.title}</h4>
                            <p style={{ fontFamily: FONT, fontSize: 14, lineHeight: 1.65, color: C.muted, margin: '0 auto', maxWidth: 260 }}>{s.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── FAQ ─── */}
            <section style={{ maxWidth: 760, margin: '0 auto', padding: '70px 28px 30px' }}>
                <div data-reveal style={{ textAlign: 'center', marginBottom: 36 }}>
                    <Eyebrow>QUESTIONS</Eyebrow>
                    <h2 style={{ fontFamily: FONT, fontSize: 'clamp(28px, 3.4vw, 38px)', lineHeight: 1.12, letterSpacing: '-0.03em', fontWeight: 800, margin: 0, color: C.text }}>Good to know</h2>
                </div>
                <div data-reveal>
                    {HOME_FAQS.map((f, i) => (
                        <FaqItem key={i} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(v => v === i ? -1 : i)} />
                    ))}
                </div>
            </section>

            {/* ─── FINAL CTA ─── */}
            <section data-reveal style={{ maxWidth: 1120, margin: '40px auto 80px', padding: '0 28px' }}>
                <div style={{ position: 'relative', borderRadius: 26, overflow: 'hidden', background: 'linear-gradient(135deg,#1e1733,#2d1f5e 55%,#4c2a9e)', padding: '64px 40px', textAlign: 'center', boxShadow: '0 24px 60px rgba(33,28,59,0.30)' }}>
                    {/* pixel accents */}
                    <div style={{ position: 'absolute', top: 24, left: 32, fontFamily: PIXEL, fontSize: 12, color: 'rgba(255,255,255,0.28)' }}>✦</div>
                    <div style={{ position: 'absolute', top: 56, right: 44, fontFamily: PIXEL, fontSize: 9, color: 'rgba(255,255,255,0.22)' }}>♦</div>
                    <div style={{ position: 'absolute', bottom: 34, left: 52, fontFamily: PIXEL, fontSize: 9, color: 'rgba(255,255,255,0.20)' }}>+</div>
                    <div style={{ position: 'absolute', bottom: 30, right: 36, fontFamily: PIXEL, fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>✦</div>
                    <div style={{ position: 'absolute', top: -90, right: -40, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(236,72,153,0.30),transparent 70%)' }} />
                    <div style={{ position: 'absolute', bottom: -110, left: -30, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,158,11,0.20),transparent 70%)' }} />
                    <div style={{ position: 'relative' }}>
                        <h2 style={{ fontFamily: FONT, fontSize: 'clamp(30px, 3.6vw, 42px)', lineHeight: 1.12, letterSpacing: '-0.03em', fontWeight: 800, color: '#fff', margin: '0 0 16px' }}>Your office is waiting.</h2>
                        <p style={{ fontFamily: FONT, fontSize: 17, color: '#c9c1e6', margin: '0 0 32px', maxWidth: 460, marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.6 }}>Spin up a space, invite the team, and see how good remote can feel. Free forever for up to 10.</p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <Link to="/login" className="mkt-btn-white" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 9, fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#19142b', padding: '13px 26px', borderRadius: 12, background: '#fff', boxShadow: '0 10px 24px rgba(0,0,0,0.25)', transition: 'transform .15s, box-shadow .15s' }}>
                                Create your space <span>→</span>
                            </Link>
                            <Link to="/contact" className="mkt-btn-outline" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', fontFamily: FONT, fontSize: 15, fontWeight: 600, color: '#fff', padding: '13px 24px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.28)', transition: 'background .15s' }}>
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