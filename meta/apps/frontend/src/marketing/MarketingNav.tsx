import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

type ActivePage = 'home' | 'about' | 'pricing' | 'contact';

interface Props {
    active?: ActivePage;
}

const LINKS: { label: string; to: string; key: ActivePage }[] = [
    { label: 'Home', to: '/', key: 'home' },
    { label: 'About', to: '/about', key: 'about' },
    { label: 'Pricing', to: '/pricing', key: 'pricing' },
    { label: 'Contact', to: '/contact', key: 'contact' },
];

export default function MarketingNav({ active = 'home' }: Props) {
    const token = useAuthStore((s) => s.token);
    const isLoggedIn = !!token;
    const capsuleRef = useRef<HTMLElement>(null);
    const [narrow, setNarrow] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 880px)');
        const onMq = () => { setNarrow(mq.matches); setOpen(false); };
        onMq();
        mq.addEventListener('change', onMq);

        const onScroll = () => {
            const c = capsuleRef.current;
            if (!c) return;
            const s = (window.scrollY || 0) > 8;
            c.style.boxShadow = s ? '0 12px 32px rgba(76,29,149,0.16)' : '0 4px 14px rgba(99,102,241,0.08)';
            c.style.background = s ? 'rgba(255,255,255,0.90)' : 'rgba(255,255,255,0.72)';
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        return () => {
            mq.removeEventListener('change', onMq);
            window.removeEventListener('scroll', onScroll);
        };
    }, []);

    return (
        <div style={{ position: 'sticky', top: 0, zIndex: 60, padding: '14px 18px 0', fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" }}>
            <nav
                ref={capsuleRef as React.RefObject<HTMLElement>}
                style={{
                    maxWidth: 1160, margin: '0 auto', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18,
                    padding: '10px 12px 10px 18px', borderRadius: 18,
                    background: 'rgba(255,255,255,0.72)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.7)', boxShadow: '0 4px 14px rgba(99,102,241,0.08)',
                    transition: 'box-shadow .25s, background .25s', position: 'relative',
                }}
            >
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 11, textDecoration: 'none', flexShrink: 0 }}>
                    <span style={{
                        width: 34, height: 34, borderRadius: 10,
                        background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#fff',
                        boxShadow: '0 6px 16px rgba(124,58,237,0.32)',
                    }}>px</span>
                    <span style={{ fontFamily: "'Silkscreen', monospace", fontWeight: 700, fontSize: 16, letterSpacing: '0.02em', color: '#211c3b' }}>OfficeVerse</span>
                </Link>

                {!narrow && (
                    <>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                            {LINKS.map(l => (
                                <Link
                                    key={l.key}
                                    to={l.to}
                                    className="mkt-nav-link"
                                    style={{
                                        position: 'relative', textDecoration: 'none', fontSize: 14, fontWeight: 600,
                                        color: '#4a4368', padding: '8px 15px', borderRadius: 10,
                                        transition: 'color .15s, background .15s',
                                    }}
                                >
                                    {l.label}
                                    {active === l.key && (
                                        <span style={{
                                            position: 'absolute', left: 15, right: 15, bottom: 3,
                                            height: 2, borderRadius: 2,
                                            background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                                        }} />
                                    )}
                                </Link>
                            ))}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
                            {isLoggedIn ? (
                                <Link
                                    to="/lobby"
                                    className="mkt-nav-cta"
                                    style={{
                                        textDecoration: 'none', fontSize: 14, fontWeight: 700,
                                        color: '#fff', padding: '10px 18px', borderRadius: 12,
                                        background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                                        boxShadow: '0 6px 16px rgba(124,58,237,0.32)',
                                        whiteSpace: 'nowrap', transition: 'transform .15s, box-shadow .15s',
                                        display: 'inline-flex', alignItems: 'center', gap: 7,
                                    }}
                                >Open app <span style={{ fontSize: 15 }}>→</span></Link>
                            ) : (
                                <>
                                    <Link
                                        to="/login"
                                        className="mkt-nav-login"
                                        style={{
                                            textDecoration: 'none', fontSize: 14, fontWeight: 600,
                                            color: '#4a4368', padding: '9px 16px', borderRadius: 11,
                                            whiteSpace: 'nowrap', transition: 'color .15s, background .15s',
                                        }}
                                    >Log in</Link>
                                    <Link
                                        to="/login"
                                        className="mkt-nav-cta"
                                        style={{
                                            textDecoration: 'none', fontSize: 14, fontWeight: 700,
                                            color: '#fff', padding: '10px 18px', borderRadius: 12,
                                            background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                                            boxShadow: '0 6px 16px rgba(124,58,237,0.32)',
                                            whiteSpace: 'nowrap', transition: 'transform .15s, box-shadow .15s',
                                            display: 'inline-flex', alignItems: 'center', gap: 7,
                                        }}
                                    >Start free <span style={{ fontSize: 15 }}>→</span></Link>
                                </>
                            )}
                        </div>
                    </>
                )}

                {narrow && (
                    <button
                        onClick={() => setOpen(o => !o)}
                        aria-label="Menu"
                        style={{
                            flexShrink: 0, width: 42, height: 42, borderRadius: 12,
                            border: '1px solid #e7e2f5', background: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#211c3b',
                        }}
                    >
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                            <path d="M4 7h16M4 12h16M4 17h16" />
                        </svg>
                    </button>
                )}
            </nav>

            {narrow && open && (
                <div style={{
                    maxWidth: 1160, margin: '10px auto 0', boxSizing: 'border-box',
                    padding: 12, borderRadius: 18, background: '#fff',
                    border: '1px solid #ece9f7', boxShadow: '0 16px 40px rgba(76,29,149,0.18)',
                    fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        {LINKS.map(l => (
                            <Link
                                key={l.key}
                                to={l.to}
                                onClick={() => setOpen(false)}
                                className="mkt-nav-link"
                                style={{
                                    textDecoration: 'none', fontSize: 15, fontWeight: 600,
                                    color: '#211c3b', padding: '13px 14px', borderRadius: 11,
                                    transition: 'background .15s',
                                }}
                            >{l.label}</Link>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 10, paddingTop: 12, borderTop: '1px solid #ece9f7' }}>
                        {isLoggedIn ? (
                            <Link
                                to="/lobby"
                                onClick={() => setOpen(false)}
                                style={{
                                    flex: 1, textAlign: 'center', textDecoration: 'none',
                                    fontSize: 14, fontWeight: 700, color: '#fff',
                                    padding: 12, borderRadius: 11,
                                    background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                                }}
                            >Open app →</Link>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    onClick={() => setOpen(false)}
                                    style={{
                                        flex: 1, textAlign: 'center', textDecoration: 'none',
                                        fontSize: 14, fontWeight: 600, color: '#4a4368',
                                        padding: 12, borderRadius: 11, border: '1px solid #e7e2f5',
                                    }}
                                >Log in</Link>
                                <Link
                                    to="/login"
                                    onClick={() => setOpen(false)}
                                    style={{
                                        flex: 1, textAlign: 'center', textDecoration: 'none',
                                        fontSize: 14, fontWeight: 700, color: '#fff',
                                        padding: 12, borderRadius: 11,
                                        background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                                    }}
                                >Start free</Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
