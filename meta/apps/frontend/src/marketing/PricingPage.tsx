import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import './marketing.css';
import MarketingNav from './MarketingNav';
import MarketingFooter from './MarketingFooter';
import { useRegion, convertFromINR, formatMoney } from '../lib/currency';

const API = import.meta.env.VITE_API_URL || 'http://localhost:3000';

interface PlanDef {
    id: string;
    tier: 'FREE' | 'STARTER' | 'PRO';
    name: string;
    priceInPaiseINR: number;
    billingPeriod: 'monthly' | 'yearly';
    maxSpaces: number;
    maxMembersPerSpace: number;
    maxConcurrentUsers: number;
    screenShareEnabled: boolean;
    broadcastEnabled: boolean;
}

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

const CheckIcon = ({ color = '#16a34a' }: { color?: string }) => (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
        <path d="M20 6 9 17l-5-5" />
    </svg>
);

const PRICING_FAQS = [
    { q: 'How does billing work?', a: "Plans are a flat price per space — one charge covers your whole team on that floor. Switch or cancel any time from your billing settings." },
    { q: 'Can I switch plans later?', a: 'Upgrade, downgrade or cancel whenever you like from billing settings. Your spaces and items are always kept.' },
    { q: 'Is the free plan really free forever?', a: "Yes. No time limit, no card required. It's how most teams start." },
    { q: 'Do you offer discounts?', a: 'Yearly billing saves 20% on every paid plan, and we offer additional discounts for students, educators and non-profits — just reach out.' },
];

function FaqItem({ q, a, open, onToggle }: { q: string; a: string; open: boolean; onToggle: () => void }) {
    return (
        <div style={{ border: '1px solid #ece9f7', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
            <button onClick={onToggle} style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '18px 20px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 16, fontWeight: 700, color: '#211c3b', textAlign: 'left' }}>
                {q}
                <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: '#f3effe', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, lineHeight: 1 }}>{open ? '−' : '+'}</span>
            </button>
            {open && <div style={{ padding: '0 20px 18px', fontSize: 15, lineHeight: 1.6, color: '#4a4368' }}>{a}</div>}
        </div>
    );
}

function planFeatures(p: PlanDef): string[] {
    return [
        p.maxSpaces >= 100000 ? 'Unlimited spaces' : `${p.maxSpaces} space${p.maxSpaces > 1 ? 's' : ''}`,
        `Up to ${p.maxMembersPerSpace} members per space`,
        `${p.maxConcurrentUsers} concurrent users per space`,
        p.broadcastEnabled ? 'Broadcast / cinema zones' : 'No broadcast zones',
        p.screenShareEnabled ? 'Screen share' : 'No screen share',
        'Real-time multiplayer & pixel-art library',
    ];
}

export default function PricingPage() {
    const rootRef = useRef<HTMLDivElement>(null);
    const sliderRef = useRef<HTMLDivElement>(null);
    const [yearly, setYearly] = useState(false);
    const [openFaq, setOpenFaq] = useState(-1);
    const [plans, setPlans] = useState<PlanDef[]>([]);
    const { currency, locale, rates } = useRegion();

    useReveal(rootRef);

    useEffect(() => {
        let cancelled = false;
        fetch(`${API}/api/v1/billing/plans`)
            .then(r => (r.ok ? r.json() : { plans: [] }))
            .then(d => { if (!cancelled) setPlans(d.plans ?? []); })
            .catch(() => { if (!cancelled) setPlans([]); });
        return () => { cancelled = true; };
    }, []);

    const setYear = (y: boolean) => {
        if (sliderRef.current) sliderRef.current.style.transform = `translateX(${y ? '100%' : '0%'})`;
        setYearly(y);
    };

    const period = yearly ? 'yearly' : 'monthly';
    const periodPlans = plans.filter(p => p.billingPeriod === period);
    const byTier = (t: PlanDef['tier']) => periodPlans.find(p => p.tier === t);

    const cards: { tier: PlanDef['tier']; featured: boolean; highlight: boolean }[] = [
        { tier: 'FREE', featured: false, highlight: false },
        { tier: 'STARTER', featured: true, highlight: false },
        { tier: 'PRO', featured: false, highlight: true },
    ];

    const fmtPrice = (p: PlanDef | undefined) => {
        if (!p || !p.priceInPaiseINR) return { main: 'Free', per: '/forever', note: null as string | null };
        const local = formatMoney(convertFromINR(p.priceInPaiseINR, currency, rates), currency, locale);
        const per = p.billingPeriod === 'yearly' ? '/yr' : '/mo';
        const inr = `₹${(p.priceInPaiseINR / 100).toLocaleString('en-IN')}`;
        const note = currency === 'INR' ? null : `billed ${inr} INR${per}`;
        return { main: local, per, note };
    };

    const billNote = yearly ? 'billed annually' : 'billed monthly';
    const currencyLabel = currency === 'INR' ? '' : ` · shown in ${currency}`;

    return (
        <div ref={rootRef} className="mkt-body" style={{ fontFamily: "system-ui,-apple-system,'Segoe UI',Roboto,sans-serif", color: '#211c3b', background: '#faf9ff', overflowX: 'hidden' }}>
            <MarketingNav active="pricing" />

            {/* ─── HERO + TOGGLE ─── */}
            <section style={{ position: 'relative', maxWidth: 880, margin: '0 auto', padding: '56px 28px 10px', textAlign: 'center', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 520, height: 340, borderRadius: '50%', background: 'radial-gradient(circle,rgba(167,139,250,0.26),transparent 70%)', filter: 'blur(8px)', animation: 'ov-blob 16s ease-in-out infinite', pointerEvents: 'none' }} />
                <div data-reveal style={{ position: 'relative' }}>
                    <div style={{ display: 'inline-block', fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', letterSpacing: '0.04em', marginBottom: 20 }}>PRICING</div>
                    <h1 style={{ fontSize: 50, lineHeight: 1.08, letterSpacing: -1.4, fontWeight: 800, margin: '0 0 18px' }}>
                        Pricing that scales<br />with your <span style={{ background: 'linear-gradient(135deg,#6366f1,#ec4899 55%,#f59e0b)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>floor.</span>
                    </h1>
                    <p style={{ fontSize: 18, lineHeight: 1.6, color: '#4a4368', margin: '0 auto 28px', maxWidth: 500 }}>Start free forever. Upgrade when your team outgrows the room. No setup fees, cancel anytime.</p>
                    <div style={{ position: 'relative', display: 'inline-flex', background: '#f3effe', borderRadius: 22, padding: 4, border: '1px solid #e7e2f5' }}>
                        <div ref={sliderRef} style={{ position: 'absolute', top: 4, left: 4, width: 'calc(50% - 4px)', height: 'calc(100% - 8px)', borderRadius: 18, background: '#fff', boxShadow: '0 2px 8px rgba(76,29,149,0.14)', transition: 'transform .25s cubic-bezier(.2,.7,.2,1)', transform: 'translateX(0%)' }} />
                        <button onClick={() => setYear(false)} style={{ position: 'relative', zIndex: 1, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#211c3b', padding: '9px 24px', borderRadius: 18 }}>Monthly</button>
                        <button onClick={() => setYear(true)} style={{ position: 'relative', zIndex: 1, border: 'none', background: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: '#211c3b', padding: '9px 22px', borderRadius: 18, display: 'inline-flex', alignItems: 'center', gap: 6 }}>Yearly <span style={{ color: '#16a34a', fontSize: 12, fontWeight: 700 }}>Save 20%</span></button>
                    </div>
                </div>
            </section>

            {/* ─── TIERS ─── */}
            <section data-reveal style={{ maxWidth: 1080, margin: '0 auto', padding: '34px 28px 20px' }}>
                {plans.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#8b82a8', fontSize: 14, padding: '40px 0' }}>Loading plans…</p>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 22, alignItems: 'start' }}>
                        {cards.map(({ tier, featured, highlight }, idx) => {
                            const p = byTier(tier);
                            const price = fmtPrice(p);
                            const isFree = tier === 'FREE';
                            const label = p?.name ?? (isFree ? 'Free' : tier.charAt(0) + tier.slice(1).toLowerCase());
                            const ctaText = isFree ? 'Start free' : `Upgrade to ${label}`;
                            const ctaTo = isFree ? '/login' : '/billing';
                            const featureList = p ? planFeatures(p) : [];
                            return (
                                <div key={tier} style={featured ? {
                                    position: 'relative', borderRadius: 22, padding: 30, background: 'linear-gradient(170deg,#ffffff,#f7f3ff)', border: '2px solid #7c3aed', boxShadow: '0 20px 50px rgba(124,58,237,0.22)', transform: 'translateY(-8px)',
                                } : { borderRadius: 20, padding: 30, background: '#fff', border: '1px solid #ece9f7', boxShadow: '0 4px 14px rgba(99,102,241,0.07)' }}>
                                    {featured && (
                                        <div style={{ position: 'absolute', top: -13, left: '50%', transform: 'translateX(-50%)', fontSize: 11, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#fff', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', padding: '5px 14px', borderRadius: 20, boxShadow: '0 6px 16px rgba(124,58,237,0.32)', whiteSpace: 'nowrap' }}>Most popular</div>
                                    )}
                                    <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: featured ? '#7c3aed' : '#8b82a8' }}>{label}</div>
                                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, margin: '14px 0 4px' }}>
                                        <span style={{ fontSize: 40, fontWeight: 800, letterSpacing: -1.5 }}>{price.main}</span>
                                        <span style={{ fontSize: 15, color: '#8b82a8' }}>{price.per}</span>
                                    </div>
                                    {!isFree && <p style={{ fontSize: 13, color: '#8b82a8', margin: '0 0 8px' }}>{billNote}{currencyLabel}</p>}
                                    {price.note && <p style={{ fontSize: 11, color: '#a59fc0', margin: '0 0 8px' }}>{price.note}</p>}
                                    <Link to={ctaTo} className={featured ? 'mkt-pricing-pro-btn' : 'mkt-pricing-free-btn'} style={{
                                        display: 'block', textAlign: 'center', textDecoration: 'none', fontSize: 15, fontWeight: 700, padding: 14, borderRadius: 12, marginBottom: 24, transition: 'background .15s, transform .15s',
                                        ...(featured
                                            ? { color: '#fff', background: 'linear-gradient(135deg,#7c3aed,#a78bfa)', boxShadow: '0 10px 24px rgba(124,58,237,0.32)' }
                                            : isFree
                                                ? { color: '#7c3aed', background: '#f3effe', border: '1px solid #e7e2f5' }
                                                : { color: '#211c3b', background: '#fff', border: '1px solid #d6caf8' }),
                                    }}>{ctaText}</Link>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                                        {!isFree && <div style={{ fontSize: 13, fontWeight: 700, color: '#211c3b', marginBottom: -2 }}>Everything in Free, plus:</div>}
                                        {featureList.map(f => (
                                            <div key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: '#4a4368', lineHeight: 1.4 }}>
                                                <CheckIcon color={featured ? '#7c3aed' : '#16a34a'} />{f}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                <p style={{ textAlign: 'center', fontSize: 13, color: '#8b82a8', margin: '26px 0 0' }}>All plans include real-time multiplayer, the canvas editor, and the full pixel-art library. Education & non-profit discounts available.</p>
            </section>

            {/* ─── FAQ ─── */}
            <section style={{ maxWidth: 760, margin: '0 auto', padding: '60px 28px 30px' }}>
                <div data-reveal style={{ textAlign: 'center', marginBottom: 36 }}>
                    <div style={{ fontFamily: "'Press Start 2P', monospace", fontSize: 10, color: '#7c3aed', marginBottom: 16 }}>BILLING QUESTIONS</div>
                    <h2 style={{ fontSize: 34, lineHeight: 1.12, letterSpacing: -0.8, fontWeight: 800, margin: 0 }}>Before you upgrade</h2>
                </div>
                <div data-reveal style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {PRICING_FAQS.map((f, i) => (
                        <FaqItem key={i} q={f.q} a={f.a} open={openFaq === i} onToggle={() => setOpenFaq(v => v === i ? -1 : i)} />
                    ))}
                </div>
            </section>

            {/* ─── CTA ─── */}
            <section data-reveal style={{ maxWidth: 1120, margin: '30px auto 70px', padding: '0 28px' }}>
                <div style={{ position: 'relative', borderRadius: 26, overflow: 'hidden', background: 'linear-gradient(135deg,#211c3b,#3b1f6e 55%,#7c3aed)', padding: '60px 40px', textAlign: 'center', boxShadow: '0 24px 60px rgba(33,28,59,0.35)' }}>
                    <div style={{ position: 'absolute', bottom: -100, left: -30, width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle,rgba(245,158,11,0.32),transparent 70%)' }} />
                    <div style={{ position: 'relative' }}>
                        <h2 style={{ fontSize: 36, lineHeight: 1.12, letterSpacing: -0.8, fontWeight: 800, color: '#fff', margin: '0 0 14px' }}>Still deciding? Start free.</h2>
                        <p style={{ fontSize: 17, color: '#cfc7e6', margin: '0 0 28px' }}>No card, no commitment. Bring the team and feel the difference in a day.</p>
                        <Link to="/login" className="mkt-cta-white" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 9, fontSize: 16, fontWeight: 700, color: '#211c3b', padding: '15px 28px', borderRadius: 13, background: '#fff', boxShadow: '0 10px 26px rgba(0,0,0,0.25)', transition: 'transform .15s' }}>
                            Create your space <span>→</span>
                        </Link>
                    </div>
                </div>
            </section>

            <MarketingFooter />
        </div>
    );
}