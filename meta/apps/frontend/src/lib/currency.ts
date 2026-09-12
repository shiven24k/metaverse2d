import { useEffect, useState } from "react";

const API = import.meta.env.VITE_API_URL ?? "http://localhost:3000";
const OVERRIDE_KEY = "metaverse_display_currency";

export interface RegionInfo {
    country: string;
    currency: string;
    locale: string;
    base: string;
    rates: Record<string, number>;
}

const FALLBACK: RegionInfo = {
    country: "IN",
    currency: "INR",
    locale: "en-IN",
    base: "INR",
    rates: { INR: 1 },
};

let regionPromise: Promise<RegionInfo> | null = null;

/** Fetch the server-detected region once and memoize it for the session. */
export function fetchRegion(): Promise<RegionInfo> {
    if (!regionPromise) {
        regionPromise = fetch(`${API}/api/v1/billing/region`)
            .then((r) => (r.ok ? (r.json() as Promise<RegionInfo>) : FALLBACK))
            .catch(() => FALLBACK);
    }
    return regionPromise;
}

export function getCurrencyOverride(): string | null {
    try {
        return localStorage.getItem(OVERRIDE_KEY);
    } catch {
        return null;
    }
}

export function setCurrencyOverride(currency: string | null) {
    try {
        if (currency) localStorage.setItem(OVERRIDE_KEY, currency);
        else localStorage.removeItem(OVERRIDE_KEY);
    } catch {
        /* ignore */
    }
}

/** Convert an INR paise amount to the target currency's major unit. */
export function convertFromINR(paise: number, currency: string, rates: Record<string, number>): number {
    const rate = rates[currency] ?? 1;
    return Math.round((paise / 100) * rate * 100) / 100;
}

export function formatMoney(amount: number, currency: string, locale: string): string {
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            maximumFractionDigits: 2,
        }).format(amount);
    } catch {
        return `${currency} ${amount.toFixed(2)}`;
    }
}

export function useRegion() {
    const [region, setRegion] = useState<RegionInfo>(FALLBACK);
    const [override, setOverrideState] = useState<string | null>(() => getCurrencyOverride());

    useEffect(() => {
        let cancelled = false;
        fetchRegion().then((r) => {
            if (!cancelled) setRegion(r);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    const currency = override ?? region.currency;
    const locale = region.locale;
    const rates = region.rates;

    const setOverride = (c: string | null) => {
        setCurrencyOverride(c);
        setOverrideState(c);
    };

    return { region, currency, locale, rates, override, setOverride };
}
