import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import './marketing.css';
import MarketingNav from './MarketingNav';
import MarketingFooter from './MarketingFooter';

function useReveal(rootRef: React.RefObject<HTMLElement | null>) {
    useEffect(() => {
        const root = rootRef.current;
        if (!root) return;
        if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
        const els = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'));
        const vh = window.innerHeight || 800;
        els.forEach(el => {
            if (el.getBoundingClientRect().top < vh * 0.9) return;
            el.style.opacity = '0';
            el.style.transform = 'translateY(26px)';
            el.style.transition = 'opacity .7s cubic-bezier(.2,.7,.2,1), transform .7s cubic-bezier(.2,.7,.2,1)';
            (el as HTMLElement & { _h?: boolean })._h = true;
        });
        const io = new IntersectionObserver(entries => {
            entries.forEach(e => {
                if (e.isIntersecting) {
                    (e.target as HTMLElement).style.opacity = '1';
                    (e.target as HTMLElement).style.transform = 'none';
                    io.unobserve(e.target);
                }
            });
        }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
        els.forEach(el => { if ((el as HTMLElement & { _h?: boolean })._h) io.observe(el); });
        return () => io.disconnect();
    }, [rootRef]);
}

const VALUES = [
    { icon: <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>, bg: 'linear-gradient(135deg,#7c3aed,#a78bfa)', shadow: '0 6px 16px rgba(124,58,237,0.30)', title: 'Presence over pings', body: 'Being seen beats being notified. Ambient presence is the default, not another inbox.' },
    { icon: '🎮', bg: 'linear-gradient(135deg,#ec4899,#f59e0b)', shadow: '0 6px 16px rgba(236,72,153,0.30)', title: 'Play is productive', body: 'Joy isn\'t the opposite of work. A space people enjoy is a space they actually use.' },
    { icon: '🔧', bg: 'linear-gradient(135deg,#34d399,#10b981)', shadow: '0 6px 16px rgba(16,185,129,0.30)', title: 'Build your own world', body: 'Every team is different. Yours should be able to make the space unmistakably theirs.' },
    { icon: '🎉', bg: 'linear-gradient(135deg,#22d3ee,#3b82f6)', shadow: '0 6px 16px rgba(59,130,246,0.30)', title: "Everyone's invited", body: 'Runs in any browser, no install, low-spec friendly. The floor is open to the whole team.' },
];

const TEAM = [
    { name: 'Mike Ramos', role: 'Founder & CEO', avatar: '/avatars/avatar-ceo.png' },
    { name: 'Dana Kapoor', role: 'Head of Engineering', avatar: '/avatars/avatar-dev.png' },
    { name: 'Dee Okafor', role: 'Design Lead', avatar: '/avatars/avatar-designer.png' },
    { name: 'Helen Cho', role: 'People & Community', avatar: '/avatars/avatar-hr.png' },
    { name: 'Mia Santos', role: 'Growth', avatar: '/avatars/avatar-marketing.png' },
    { name: 'Sam Lee', role: 'Engineering Intern', avatar: '/avatars/avatar-intern.png' },
];

export default function AboutPage() {
    const rootRef = useRef<HTMLDivElement>(null);
    useReveal(rootRef);

    return (
        <div ref={rootRef} className="mkt-body" style={{ fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", color: '#211c3b', background: '#faf9ff', overflowX: 'hidden' }}>
            <MarketingNav active="about" />

            {/* ─── HERO ─── */}
            <section style={{ position: 'relative', maxWidth: 880, margin: '0 auto', padding: '56px 28px 30px', textAlign: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 520, height: 360, borderRadius: '50%', background: 'radial-gradient(circle,rgba(167,139,250,0.28),transparent 70%)', filter: 'blur(8px)', animation: 'ov-blob 16s ease-in-out infinite', pointerEvents: 'none' }} />
                <div data-reveal style={{ position: 'relative' }}>
                    <div style={{ display: 'inline-block', fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', letterSpacing: '0.04em', marginBottom: 20 }}>OUR STORY</div>
                    <h1 style={{ fontSize: 52, lineHeight: 1.08, letterSpacing: -1.4, fontWeight: 800, margin: '0 0 20px' }}>
                        The office worth<br />
                        <span style={{ background: 'linear-gradient(135deg,#6366f1,#ec4899 55%,#f59e0b)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>showing up to.</span>
                    </h1>
                    <p style={{ fontSize: 18, lineHeight: 1.6, color: '#4a4368', margin: '0 auto', maxWidth: 560 }}>
                        We started OfficeVerse because remote work traded the hallway for a wall of muted rectangles. We wanted the spontaneity back — the walk-overs, the wave hello, the desk you actually decorate. So we built a world for it.
                    </p>
                </div>
            </section>

            {/* ─── STATS STRIP ─── */}
            <section data-reveal style={{ maxWidth: 900, margin: '10px auto 0', padding: '0 28px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 18, border: '1px solid #ece9f7', borderRadius: 20, background: '#fff', boxShadow: '0 4px 14px rgba(99,102,241,0.07)', padding: '28px 20px', textAlign: 'center' }}>
                    {[
                        { n: '2024', label: 'Founded', color: '#7c3aed' },
                        { n: '12k+', label: 'Daily teammates', color: '#ec4899' },
                        { n: '3,400', label: 'Spaces built', color: '#f59e0b' },
                        { n: '47', label: 'Countries', color: '#16a34a' },
                    ].map(s => (
                        <div key={s.label}>
                            <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: -0.5, color: s.color }}>{s.n}</div>
                            <div style={{ fontSize: 13, color: '#8b82a8', marginTop: 4 }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── MISSION ─── */}
            <section style={{ maxWidth: 1080, margin: '0 auto', padding: '70px 28px 20px' }}>
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1.05fr 1fr', gap: 48, alignItems: 'center' }}>
                    <div style={{ minWidth: 0 }}>
                        <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: '#7c3aed', background: '#f3effe', padding: '5px 11px', borderRadius: 8, marginBottom: 16 }}>Our mission</span>
                        <h2 style={{ fontSize: 34, lineHeight: 1.15, letterSpacing: -0.7, fontWeight: 800, margin: '0 0 16px' }}>Make distance feel like a different desk, not a different planet.</h2>
                        <p style={{ fontSize: 16, lineHeight: 1.7, color: '#4a4368', margin: '0 0 14px' }}>Calls are great for meetings and terrible for everything else — the quick question, the over-the-shoulder review, the "wanna grab coffee?" OfficeVerse gives a team one shared place where presence is ambient and talking is one step away.</p>
                        <p style={{ fontSize: 16, lineHeight: 1.7, color: '#4a4368', margin: 0 }}>It's playful on purpose. Pixel art, emotes, quests and seasons aren't gimmicks — they're the texture that makes a space feel alive, and a team feel like a team.</p>
                    </div>
                    <div style={{ position: 'relative', borderRadius: 20, padding: 34, background: 'linear-gradient(160deg,#f5f3ff,#eff6ff)', border: '1px solid #ece9f7', minHeight: 240, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden', minWidth: 0 }}>
                        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#c4b5fd 1px,transparent 1px)', backgroundSize: '16px 16px', opacity: 0.45 }} />
                        <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                            <img src="/items/meeting-table.png" alt="" style={{ height: 62, imageRendering: 'pixelated', filter: 'drop-shadow(0 8px 12px rgba(76,29,149,0.18))' }} />
                            <img src="/items/coffee-machine.png" alt="" style={{ height: 74, imageRendering: 'pixelated', filter: 'drop-shadow(0 8px 12px rgba(76,29,149,0.18))' }} />
                            <img src="/items/whiteboard.png" alt="" style={{ height: 70, imageRendering: 'pixelated', filter: 'drop-shadow(0 8px 12px rgba(76,29,149,0.18))' }} />
                        </div>
                    </div>
                </div>
            </section>

            {/* ─── VALUES ─── */}
            <section style={{ maxWidth: 1120, margin: '0 auto', padding: '56px 28px 20px' }}>
                <div data-reveal style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 44px' }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', marginBottom: 16 }}>WHAT WE BELIEVE</div>
                    <h2 style={{ fontSize: 36, lineHeight: 1.12, letterSpacing: -0.8, fontWeight: 800, margin: 0 }}>Four things we won't compromise on</h2>
                </div>
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 20 }}>
                    {VALUES.map(v => (
                        <div key={v.title} className="mkt-card-hover" style={{ borderRadius: 18, padding: 26, background: '#fff', border: '1px solid #ece9f7', boxShadow: '0 4px 14px rgba(99,102,241,0.07)', transition: 'transform .18s, box-shadow .18s' }}>
                            <div style={{ width: 48, height: 48, borderRadius: 13, background: v.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16, boxShadow: v.shadow, fontSize: 22 }}>{v.icon}</div>
                            <h4 style={{ fontSize: 17, fontWeight: 800, margin: '0 0 8px' }}>{v.title}</h4>
                            <p style={{ fontSize: 14, lineHeight: 1.6, color: '#4a4368', margin: 0 }}>{v.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── TEAM ─── */}
            <section style={{ maxWidth: 1120, margin: '0 auto', padding: '64px 28px 20px' }}>
                <div data-reveal style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 44px' }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', marginBottom: 16 }}>THE CREW</div>
                    <h2 style={{ fontSize: 36, lineHeight: 1.12, letterSpacing: -0.8, fontWeight: 800, margin: '0 0 12px' }}>The humans behind the pixels</h2>
                    <p style={{ fontSize: 16, lineHeight: 1.6, color: '#4a4368', margin: 0 }}>A small, fully-remote team that lives on our own floor every day.</p>
                </div>
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 18 }}>
                    {TEAM.map(m => (
                        <div key={m.name} className="mkt-team-card" style={{ textAlign: 'center', borderRadius: 18, padding: '22px 12px', background: '#fff', border: '1px solid #ece9f7', boxShadow: '0 4px 14px rgba(99,102,241,0.07)', transition: 'transform .18s' }}>
                            <img src={m.avatar} alt={m.name} style={{ display: 'block', width: 72, height: 54, margin: '0 auto 12px', imageRendering: 'pixelated', objectFit: 'none', objectPosition: '0 0' }} />
                            <div style={{ fontSize: 14, fontWeight: 800 }}>{m.name}</div>
                            <div style={{ fontSize: 12, color: '#8b82a8', marginTop: 2 }}>{m.role}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── TIMELINE ─── */}
            <section style={{ maxWidth: 1080, margin: '0 auto', padding: '64px 28px 30px' }}>
                <div data-reveal style={{ textAlign: 'center', maxWidth: 600, margin: '0 auto 44px' }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', marginBottom: 16 }}>HOW WE GOT HERE</div>
                    <h2 style={{ fontSize: 36, lineHeight: 1.12, letterSpacing: -0.8, fontWeight: 800, margin: 0 }}>From an empty grid to a living world</h2>
                </div>
                <div data-reveal style={{ position: 'relative', display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22 }}>
                    {[
                        { phase: 'PHASE 0–1', color: '#7c3aed', badge: 'Shipped', badgeBg: '#dcfce7', badgeColor: '#16a34a', bg: '#fff', border: '#ece9f7', title: 'A playable core', body: 'The grid, real-time movement, avatars and login. The first time two people walked up to each other, we knew.' },
                        { phase: 'PHASE 2–3', color: '#ec4899', badge: 'Shipped', badgeBg: '#dcfce7', badgeColor: '#16a34a', bg: '#fff', border: '#ece9f7', title: 'Economy & social', body: 'Items, coins, the shop, emotes, guestbooks and quests. The floor stopped being a demo and started being a place.' },
                        { phase: 'PHASE 4–5', color: '#f59e0b', badge: 'In progress', badgeBg: '#fef3c7', badgeColor: '#d97706', bg: 'linear-gradient(160deg,#f5f3ff,#fdf2f8)', border: '#d6caf8', title: 'Scale & seasons', body: 'Seasonal drops, neighbourhoods, Redis-backed scale, mobile and a creator marketplace. The world keeps growing.' },
                    ].map(p => (
                        <div key={p.phase} style={{ borderRadius: 16, padding: 22, background: p.bg, border: `1px solid ${p.border}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                                <span style={{ fontFamily: "'Silkscreen', monospace", fontSize: 13, color: p.color }}>{p.phase}</span>
                                <span style={{ fontSize: 11, fontWeight: 700, color: p.badgeColor, background: p.badgeBg, padding: '3px 8px', borderRadius: 20 }}>{p.badge}</span>
                            </div>
                            <h4 style={{ fontSize: 16, fontWeight: 800, margin: '0 0 7px' }}>{p.title}</h4>
                            <p style={{ fontSize: 13, lineHeight: 1.6, color: '#4a4368', margin: 0 }}>{p.body}</p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ─── CTA ─── */}
            <section data-reveal style={{ maxWidth: 1120, margin: '40px auto 70px', padding: '0 28px' }}>
                <div style={{ position: 'relative', borderRadius: 26, overflow: 'hidden', background: 'linear-gradient(135deg,#211c3b,#3b1f6e 55%,#7c3aed)', padding: '60px 40px', textAlign: 'center', boxShadow: '0 24px 60px rgba(33,28,59,0.35)' }}>
                    <div style={{ position: 'absolute', top: -90, right: -40, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(236,72,153,0.4),transparent 70%)' }} />
                    <div style={{ position: 'relative' }}>
                        <h2 style={{ fontSize: 36, lineHeight: 1.12, letterSpacing: -0.8, fontWeight: 800, color: '#fff', margin: '0 0 14px' }}>Come build the floor with us.</h2>
                        <p style={{ fontSize: 17, color: '#cfc7e6', margin: '0 0 28px' }}>We're hiring, and we'd love to show you around the office — literally.</p>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap' }}>
                            <Link to="/login" className="mkt-cta-white" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 16, fontWeight: 700, color: '#211c3b', padding: '15px 28px', borderRadius: 13, background: '#fff', boxShadow: '0 10px 26px rgba(0,0,0,0.25)', transition: 'transform .15s' }}>
                                Try OfficeVerse <span>→</span>
                            </Link>
                            <Link to="/contact" className="mkt-cta-outline" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', fontSize: 16, fontWeight: 600, color: '#fff', padding: '15px 26px', borderRadius: 13, border: '1px solid rgba(255,255,255,0.25)', transition: 'background .15s' }}>
                                Get in touch
                            </Link>
                        </div>
                    </div>
                </div>
            </section>

            <MarketingFooter />
        </div>
    );
}
