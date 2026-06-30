import { useEffect, useRef, useState } from 'react';
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
        }, { threshold: 0.1, rootMargin: '0px 0px -6% 0px' });
        els.forEach(el => { if ((el as HTMLElement & { _h?: boolean })._h) io.observe(el); });
        return () => io.disconnect();
    }, [rootRef]);
}

export default function ContactPage() {
    const rootRef = useRef<HTMLDivElement>(null);
    useReveal(rootRef);

    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [team, setTeam] = useState('Just me');
    const [message, setMessage] = useState('');
    const [errName, setErrName] = useState(false);
    const [errEmail, setErrEmail] = useState(false);
    const [errMsg, setErrMsg] = useState(false);
    const [submitted, setSubmitted] = useState(false);

    const submit = (e: React.FormEvent) => {
        e.preventDefault();
        const en = !name.trim();
        const ee = !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
        const em = message.trim().length < 10;
        setErrName(en); setErrEmail(ee); setErrMsg(em);
        if (en || ee || em) return;
        setSubmitted(true);
    };

    return (
        <div ref={rootRef} className="mkt-body" style={{ fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", color: '#211c3b', background: '#faf9ff', overflowX: 'hidden' }}>
            <MarketingNav active="contact" />

            {/* ─── HERO ─── */}
            <section style={{ position: 'relative', maxWidth: 880, margin: '0 auto', padding: '56px 28px 14px', textAlign: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 520, height: 320, borderRadius: '50%', background: 'radial-gradient(circle,rgba(167,139,250,0.26),transparent 70%)', filter: 'blur(8px)', animation: 'ov-blob 16s ease-in-out infinite', pointerEvents: 'none' }} />
                <div data-reveal style={{ position: 'relative' }}>
                    <div style={{ display: 'inline-block', fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', letterSpacing: '0.04em', marginBottom: 20 }}>SAY HELLO</div>
                    <h1 style={{ fontSize: 50, lineHeight: 1.08, letterSpacing: -1.4, fontWeight: 800, margin: '0 0 18px' }}>
                        Let's <span style={{ background: 'linear-gradient(135deg,#6366f1,#ec4899 55%,#f59e0b)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>talk.</span>
                    </h1>
                    <p style={{ fontSize: 18, lineHeight: 1.6, color: '#4a4368', margin: '0 auto', maxWidth: 500 }}>
                        Questions about plans, a demo for your team, or just want to say hi? Drop us a line — a real human replies within a few hours.
                    </p>
                </div>
            </section>

            {/* ─── FORM + SIDEBAR ─── */}
            <section style={{ maxWidth: 1040, margin: '0 auto', padding: '30px 28px 20px' }}>
                <div data-reveal style={{ display: 'grid', gridTemplateColumns: '1.25fr 0.85fr', gap: 28, alignItems: 'start' }}>

                    {/* FORM CARD */}
                    <div style={{ borderRadius: 22, background: '#fff', border: '1px solid #ece9f7', boxShadow: '0 10px 30px rgba(99,102,241,0.10)', padding: 34, minWidth: 0 }}>
                        {!submitted ? (
                            <form onSubmit={submit} noValidate>
                                <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px' }}>Send us a message</h2>
                                <p style={{ fontSize: 14, color: '#8b82a8', margin: '0 0 24px' }}>We'll get back to you at the email you provide.</p>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#211c3b', marginBottom: 7 }}>Name</label>
                                        <input
                                            className="mkt-input"
                                            type="text"
                                            value={name}
                                            onChange={e => { setName(e.target.value); setErrName(false); }}
                                            placeholder="Dana Kapoor"
                                            style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 11, border: `1.5px solid ${errName ? '#dc2626' : '#e7e2f5'}`, background: '#fff', fontFamily: 'inherit', fontSize: 15, color: '#211c3b' }}
                                        />
                                        {errName && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>Please enter your name.</div>}
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#211c3b', marginBottom: 7 }}>Work email</label>
                                        <input
                                            className="mkt-input"
                                            type="email"
                                            value={email}
                                            onChange={e => { setEmail(e.target.value); setErrEmail(false); }}
                                            placeholder="dana@team.com"
                                            style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 11, border: `1.5px solid ${errEmail ? '#dc2626' : '#e7e2f5'}`, background: '#fff', fontFamily: 'inherit', fontSize: 15, color: '#211c3b' }}
                                        />
                                        {errEmail && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>Enter a valid email address.</div>}
                                    </div>
                                </div>

                                <div style={{ marginBottom: 16 }}>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#211c3b', marginBottom: 7 }}>Team size</label>
                                    <select
                                        className="mkt-select"
                                        value={team}
                                        onChange={e => setTeam(e.target.value)}
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 11, border: '1.5px solid #e7e2f5', background: '#fff', fontFamily: 'inherit', fontSize: 15, color: '#211c3b' }}
                                    >
                                        {['Just me', '2–10 people', '11–50 people', '51–200 people', '200+ people'].map(o => <option key={o}>{o}</option>)}
                                    </select>
                                </div>

                                <div style={{ marginBottom: 22 }}>
                                    <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#211c3b', marginBottom: 7 }}>Message</label>
                                    <textarea
                                        className="mkt-textarea"
                                        rows={4}
                                        value={message}
                                        onChange={e => { setMessage(e.target.value); setErrMsg(false); }}
                                        placeholder="Tell us a little about your team and what you're hoping to do…"
                                        style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 11, border: `1.5px solid ${errMsg ? '#dc2626' : '#e7e2f5'}`, background: '#fff', fontFamily: 'inherit', fontSize: 15, color: '#211c3b', resize: 'vertical' }}
                                    />
                                    {errMsg && <div style={{ color: '#dc2626', fontSize: 13, marginTop: 6 }}>Please add a few words (10+ characters).</div>}
                                </div>

                                <button type="submit" style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: '#fff', padding: 15, borderRadius: 13, border: 'none', cursor: 'pointer', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', boxShadow: '0 10px 24px rgba(124,58,237,0.32)', transition: 'transform .15s, box-shadow .15s' }}>
                                    Send message →
                                </button>
                            </form>
                        ) : (
                            <div style={{ textAlign: 'center', padding: '30px 10px' }}>
                                <div className="mkt-pop" style={{ width: 72, height: 72, margin: '0 auto 20px', borderRadius: '50%', background: 'linear-gradient(135deg,#34d399,#10b981)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 10px 26px rgba(16,185,129,0.32)' }}>
                                    <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                </div>
                                <h2 style={{ fontSize: 24, fontWeight: 800, margin: '0 0 10px' }}>Thanks, {name}! 👋</h2>
                                <p style={{ fontSize: 15, lineHeight: 1.6, color: '#4a4368', margin: '0 auto', maxWidth: 340 }}>Your message is on its way to the floor. We'll reply to your inbox within a few hours — usually much sooner.</p>
                            </div>
                        )}
                    </div>

                    {/* SIDEBAR */}
                    <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14 }}>
                        {[
                            {
                                bg: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="3"/><path d="m3 6 9 7 9-7"/></svg>,
                                label: 'Email us',
                                value: 'hi@officeverse.world',
                            },
                            {
                                bg: 'linear-gradient(135deg,#22d3ee,#3b82f6)',
                                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 12h8M8 8h6"/><path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
                                label: 'Join the community',
                                value: 'Discord → 8,200 members',
                            },
                            {
                                bg: 'linear-gradient(135deg,#34d399,#10b981)',
                                icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>,
                                label: 'Office hours, in-world',
                                value: 'Mon–Fri · 10am PT · by the fountain',
                            },
                        ].map(c => (
                            <div key={c.label} style={{ borderRadius: 18, background: '#fff', border: '1px solid #ece9f7', boxShadow: '0 4px 14px rgba(99,102,241,0.07)', padding: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
                                <span style={{ flexShrink: 0, width: 44, height: 44, borderRadius: 12, background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.icon}</span>
                                <div>
                                    <div style={{ fontSize: 13, color: '#8b82a8' }}>{c.label}</div>
                                    <div style={{ fontSize: 15, fontWeight: 700 }}>{c.value}</div>
                                </div>
                            </div>
                        ))}

                        <div style={{ position: 'relative', borderRadius: 18, background: 'linear-gradient(160deg,#f5f3ff,#fdf2f8)', border: '1px solid #ece9f7', padding: 22, overflow: 'hidden' }}>
                            <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(#d6caf8 1px,transparent 1px)', backgroundSize: '14px 14px', opacity: 0.5 }} />
                            <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 12 }}>
                                <img src="/items/plant.png" alt="" style={{ height: 50, imageRendering: 'pixelated', filter: 'drop-shadow(0 6px 10px rgba(76,29,149,0.16))' }} />
                                <img src="/items/fountain.png" alt="" style={{ height: 60, imageRendering: 'pixelated', filter: 'drop-shadow(0 6px 10px rgba(76,29,149,0.16))' }} />
                                <img src="/items/plant.png" alt="" style={{ height: 50, imageRendering: 'pixelated', filter: 'drop-shadow(0 6px 10px rgba(76,29,149,0.16))' }} />
                            </div>
                            <p style={{ position: 'relative', textAlign: 'center', fontSize: 13, color: '#4a4368', margin: '14px 0 0' }}>Prefer a tour? Come find us in-world.</p>
                        </div>
                    </div>
                </div>
            </section>

            <div style={{ height: 50 }} />
            <MarketingFooter />
        </div>
    );
}
