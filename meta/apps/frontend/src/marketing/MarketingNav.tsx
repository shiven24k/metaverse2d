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
    const barRef = useRef<HTMLElement>(null);
    const [narrow, setNarrow] = useState(false);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(max-width: 820px)');
        const onMq = () => { setNarrow(mq.matches); setOpen(false); };
        onMq();
        mq.addEventListener('change', onMq);

        const onScroll = () => {
            const b = barRef.current;
            if (!b) return;
            const s = (window.scrollY || 0) > 8;
            b.style.boxShadow = s ? '0 8px 28px rgba(76, 29, 149, 0.10)' : '0 1px 2px rgba(76, 29, 149, 0.04)';
            b.style.background = s ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.78)';
        };
        window.addEventListener('scroll', onScroll, { passive: true });
        onScroll();

        return () => {
            mq.removeEventListener('change', onMq);
            window.removeEventListener('scroll', onScroll);
        };
    }, []);

    const linkStyle: React.CSSProperties = {
        position: 'relative', textDecoration: 'none', fontSize: 14, fontWeight: 500,
        color: '#4a4368', padding: '8px 13px', borderRadius: 9,
        transition: 'color .15s, background .15s',
    };

    return (
        <div style={{ position: 'sticky', top: 0, zIndex: 60, padding: '12px 20px 0', fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif" }}>
            <nav
                ref={barRef as React.RefObject<HTMLElement>}
                style={{
                    maxWidth: 1160, margin: '0 auto', boxSizing: 'border-box',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16,
                    padding: '8px 10px 8px 16px', borderRadius: 16,
                    background: 'rgba(255,255,255,0.78)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(33,28,59,0.06)', boxShadow: '0 1px 2px rgba(76, 29, 149, 0.04)',
                    transition: 'box-shadow .25s, background .25s', position: 'relative',
                }}
            >
                <Link to="/" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', flexShrink: 0 }}>
                    <img src="/logo.svg" alt="OfficeVerse" style={{ height: 30, width: 'auto', display: 'block', imageRendering: 'pixelated' }} />
                    <span style={{ fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 700, fontSize: 17, letterSpacing: '-0.02em', color: '#19142b' }}>OfficeVerse</span>
                </Link>

                {!narrow && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 2, position: 'absolute', left: '50%', transform: 'translateX(-50%)' }}>
                        {LINKS.map(l => (
                            <Link
                                key={l.key}
                                to={l.to}
                                className="mkt-nav-link"
                                style={linkStyle}
                            >
                                {l.label}
                                {active === l.key && (
                                    <span style={{
                                        position: 'absolute', left: 13, right: 13, bottom: 4,
                                        height: 2, borderRadius: 2, background: '#7c3aed',
                                    }} />
                                )}
                            </Link>
                        ))}
                    </div>
                )}

                {!narrow && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                        {isLoggedIn ? (
                            <Link
                                to="/lobby"
                                className="mkt-btn-primary"
                                style={{
                                    textDecoration: 'none', fontSize: 14, fontWeight: 600, color: '#fff',
                                    padding: '9px 18px', borderRadius: 10,
                                    background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
                                    boxShadow: '0 6px 16px rgba(124,58,237,0.30)',
                                    whiteSpace: 'nowrap', transition: 'transform .15s, box-shadow .15s',
                                    display: 'inline-flex', alignItems: 'center', gap: 7,
                                }}
                            >Open app <span style={{ fontSize: 14 }}>→</span></Link>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    className="mkt-nav-login"
                                    style={{
                                        textDecoration: 'none', fontSize: 14, fontWeight: 500,
                                        color: '#4a4368', padding: '9px 14px', borderRadius: 10,
                                        whiteSpace: 'nowrap', transition: 'color .15s, background .15s',
                                    }}
                                >Log in</Link>
                                <Link
                                    to="/login"
                                    className="mkt-btn-primary"
                                    style={{
                                        textDecoration: 'none', fontSize: 14, fontWeight: 600, color: '#fff',
                                        padding: '9px 18px', borderRadius: 10,
                                        background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
                                        boxShadow: '0 6px 16px rgba(124,58,237,0.30)',
                                        whiteSpace: 'nowrap', transition: 'transform .15s, box-shadow .15s',
                                        display: 'inline-flex', alignItems: 'center', gap: 7,
                                    }}
                                >Start free <span style={{ fontSize: 14 }}>→</span></Link>
                            </>
                        )}
                    </div>
                )}

                {narrow && (
                    <button
                        onClick={() => setOpen(o => !o)}
                        aria-label="Menu"
                        style={{
                            flexShrink: 0, width: 40, height: 40, borderRadius: 11,
                            border: '1px solid #ece8f7', background: '#fff', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#19142b',
                        }}
                    >
                        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                            <path d="M4 7h16M4 12h16M4 17h16" />
                        </svg>
                    </button>
                )}
            </nav>

            {narrow && open && (
                <div style={{
                    maxWidth: 1160, margin: '8px auto 0', boxSizing: 'border-box',
                    padding: 10, borderRadius: 16, background: '#fff',
                    border: '1px solid #ece8f7', boxShadow: '0 16px 40px rgba(76, 29, 149, 0.14)',
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
                                    textDecoration: 'none', fontSize: 15, fontWeight: 500,
                                    color: '#19142b', padding: '12px 14px', borderRadius: 10,
                                    transition: 'background .15s',
                                }}
                            >{l.label}</Link>
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8, paddingTop: 10, borderTop: '1px solid #ece8f7' }}>
                        {isLoggedIn ? (
                            <Link
                                to="/lobby"
                                onClick={() => setOpen(false)}
                                style={{
                                    flex: 1, textAlign: 'center', textDecoration: 'none',
                                    fontSize: 14, fontWeight: 600, color: '#fff',
                                    padding: 11, borderRadius: 10,
                                    background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
                                }}
                            >Open app →</Link>
                        ) : (
                            <>
                                <Link
                                    to="/login"
                                    onClick={() => setOpen(false)}
                                    style={{
                                        flex: 1, textAlign: 'center', textDecoration: 'none',
                                        fontSize: 14, fontWeight: 500, color: '#4a4368',
                                        padding: 11, borderRadius: 10, border: '1px solid #ece8f7',
                                    }}
                                >Log in</Link>
                                <Link
                                    to="/login"
                                    onClick={() => setOpen(false)}
                                    style={{
                                        flex: 1, textAlign: 'center', textDecoration: 'none',
                                        fontSize: 14, fontWeight: 600, color: '#fff',
                                        padding: 11, borderRadius: 10,
                                        background: 'linear-gradient(135deg,#7c3aed,#8b5cf6)',
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