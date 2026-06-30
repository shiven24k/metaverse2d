import { Link } from 'react-router-dom';

const XIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
        <path d="M18.9 2h3.3l-7.2 8.3L23.5 22h-6.6l-5.2-6.8L5.7 22H2.4l7.7-8.8L1.5 2h6.8l4.7 6.2L18.9 2Zm-1.2 18h1.8L7.1 3.9H5.2L17.7 20Z" />
    </svg>
);

const DiscordIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.2.4a14.4 14.4 0 0 1 4.4 1.4 17.6 17.6 0 0 0-15.2 0A14.4 14.4 0 0 1 8.8 3.4L8.6 3a19.8 19.8 0 0 0-4.9 1.4C.7 8.9-.1 13.2.3 17.5a19.9 19.9 0 0 0 6 3l.5-.7a13.3 13.3 0 0 1-2-1l.5-.4a14.2 14.2 0 0 0 13.4 0l.5.4a13.3 13.3 0 0 1-2 1l.5.7a19.9 19.9 0 0 0 6-3c.5-5-.7-9.3-3.3-13.1ZM8.5 14.9c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Zm7 0c-1.1 0-2-1-2-2.3s.9-2.3 2-2.3 2 1 2 2.3-.9 2.3-2 2.3Z" />
    </svg>
);

const GithubIcon = () => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a10 10 0 0 0-3.2 19.5c.5.1.7-.2.7-.5v-1.7c-2.8.6-3.4-1.3-3.4-1.3-.5-1.2-1.1-1.5-1.1-1.5-.9-.6.1-.6.1-.6 1 .1 1.5 1 1.5 1 .9 1.5 2.3 1.1 2.9.8.1-.6.3-1.1.6-1.4-2.2-.3-4.6-1.1-4.6-5a3.9 3.9 0 0 1 1-2.7c-.1-.3-.5-1.3.1-2.7 0 0 .8-.3 2.7 1a9.3 9.3 0 0 1 5 0c1.9-1.3 2.7-1 2.7-1 .6 1.4.2 2.4.1 2.7a3.9 3.9 0 0 1 1 2.7c0 3.9-2.4 4.7-4.6 5 .3.3.6.9.6 1.8v2.7c0 .3.2.6.7.5A10 10 0 0 0 12 2Z" />
    </svg>
);

const SocialBtn = ({ children, label }: { children: React.ReactNode; label: string }) => (
    <a
        href="#"
        aria-label={label}
        className="mkt-social-btn"
        style={{
            width: 38, height: 38, borderRadius: 10, background: '#fff',
            border: '1px solid #e7e1f6', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#6b6488', textDecoration: 'none', transition: 'background .15s, color .15s, transform .15s',
            boxShadow: '0 2px 8px rgba(99,102,241,0.06)',
        }}
    >{children}</a>
);

const FooterLink = ({ href, to, children }: { href?: string; to?: string; children: React.ReactNode }) => {
    const style: React.CSSProperties = { fontSize: 14, color: '#4a4368', textDecoration: 'none', transition: 'color .15s' };
    if (to) return <Link to={to} className="mkt-footer-link" style={style}>{children}</Link>;
    return <a href={href ?? '#'} className="mkt-footer-link" style={style}>{children}</a>;
};

export default function MarketingFooter() {
    return (
        <footer style={{
            width: '100%', boxSizing: 'border-box',
            background: 'linear-gradient(180deg,#f6f3fe,#efeafb)',
            color: '#4a4368', fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif",
            padding: '64px 28px 30px', position: 'relative', overflow: 'hidden',
            borderTop: '1px solid #e7e1f6',
        }}>
            <div style={{ position: 'absolute', top: -120, right: -80, width: 340, height: 340, borderRadius: '50%', background: 'radial-gradient(circle,rgba(124,58,237,0.12),transparent 70%)', pointerEvents: 'none' }} />
            <div style={{ position: 'absolute', bottom: -140, left: -60, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(236,72,153,0.10),transparent 70%)', pointerEvents: 'none' }} />

            <div style={{ maxWidth: 1120, margin: '0 auto', position: 'relative', display: 'grid', gridTemplateColumns: '1.6fr 1fr 1fr 1fr', gap: 40 }}>
                <div style={{ maxWidth: 300 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
                        <span style={{
                            width: 34, height: 34, borderRadius: 9,
                            background: 'linear-gradient(135deg,#7c3aed,#a78bfa)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontFamily: "'Press Start 2P', monospace", fontSize: 11, color: '#fff',
                        }}>px</span>
                        <span style={{ fontFamily: "'Silkscreen', monospace", fontWeight: 700, fontSize: 16, color: '#211c3b' }}>OfficeVerse</span>
                    </div>
                    <p style={{ fontSize: 14, lineHeight: 1.65, color: '#6b6488', margin: '0 0 20px' }}>
                        The 2D pixel office where remote teams actually feel together — walk over, wave, and get things done in a world you build tile by tile.
                    </p>
                    <div style={{ display: 'flex', gap: 10 }}>
                        <SocialBtn label="X"><XIcon /></SocialBtn>
                        <SocialBtn label="Discord"><DiscordIcon /></SocialBtn>
                        <SocialBtn label="GitHub"><GithubIcon /></SocialBtn>
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b82a8', marginBottom: 16 }}>Product</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <FooterLink to="/">Features</FooterLink>
                        <FooterLink to="/pricing">Pricing</FooterLink>
                        <FooterLink to="/login">Live workspace</FooterLink>
                        <FooterLink href="#">Emotes & quests</FooterLink>
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b82a8', marginBottom: 16 }}>Company</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <FooterLink to="/about">About us</FooterLink>
                        <FooterLink to="/contact">Contact</FooterLink>
                        <FooterLink href="#">Careers</FooterLink>
                        <FooterLink href="#">Blog</FooterLink>
                    </div>
                </div>

                <div>
                    <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#8b82a8', marginBottom: 16 }}>Resources</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                        <FooterLink href="#">Docs</FooterLink>
                        <FooterLink href="#">Community</FooterLink>
                        <FooterLink href="#">Status</FooterLink>
                        <FooterLink href="#">Changelog</FooterLink>
                    </div>
                </div>
            </div>

            <div style={{
                maxWidth: 1120, margin: '44px auto 0', paddingTop: 24,
                borderTop: '1px solid #e7e1f6', display: 'flex',
                alignItems: 'center', justifyContent: 'space-between',
                gap: 16, flexWrap: 'wrap', position: 'relative',
            }}>
                <span style={{ fontSize: 13, color: '#8b82a8' }}>© 2026 OfficeVerse 2D. Built for teams who'd rather hang out than sit on a call.</span>
                <div style={{ display: 'flex', gap: 22 }}>
                    {['Privacy', 'Terms', 'Cookies'].map(t => (
                        <a key={t} href="#" className="mkt-footer-link" style={{ fontSize: 13, color: '#8b82a8', textDecoration: 'none', transition: 'color .15s' }}>{t}</a>
                    ))}
                </div>
            </div>
        </footer>
    );
}
