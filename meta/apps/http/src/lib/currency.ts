// Display-only currency localization. The INR price on the Plan row is the
// source of truth (Razorpay charges INR); everything here just converts it for
// display. INR_RATES is approximate and admin-editable — swap for a live FX
// feed later if needed.

export interface Region {
    country: string;
    currency: string;
    locale: string;
}

export const DEFAULT_REGION: Region = { country: "IN", currency: "INR", locale: "en-IN" };

// ISO 3166 alpha-2 country -> currency + locale.
export const COUNTRY_REGION: Record<string, { currency: string; locale: string }> = {
    IN: { currency: "INR", locale: "en-IN" },
    US: { currency: "USD", locale: "en-US" },
    CA: { currency: "CAD", locale: "en-CA" },
    GB: { currency: "GBP", locale: "en-GB" },
    AU: { currency: "AUD", locale: "en-AU" },
    NZ: { currency: "NZD", locale: "en-NZ" },
    SG: { currency: "SGD", locale: "en-SG" },
    AE: { currency: "AED", locale: "en-AE" },
    SA: { currency: "SAR", locale: "en-SA" },
    JP: { currency: "JPY", locale: "ja-JP" },
    DE: { currency: "EUR", locale: "de-DE" },
    FR: { currency: "EUR", locale: "fr-FR" },
    ES: { currency: "EUR", locale: "es-ES" },
    IT: { currency: "EUR", locale: "it-IT" },
    NL: { currency: "EUR", locale: "nl-NL" },
    PT: { currency: "EUR", locale: "pt-PT" },
    IE: { currency: "EUR", locale: "en-IE" },
    BR: { currency: "BRL", locale: "pt-BR" },
    ZA: { currency: "ZAR", locale: "en-ZA" },
    NG: { currency: "NGN", locale: "en-NG" },
    KE: { currency: "KES", locale: "en-KE" },
    ID: { currency: "IDR", locale: "id-ID" },
    MY: { currency: "MYR", locale: "ms-MY" },
    PH: { currency: "PHP", locale: "en-PH" },
    PK: { currency: "PKR", locale: "en-PK" },
    BD: { currency: "BDT", locale: "bn-BD" },
    LK: { currency: "LKR", locale: "si-LK" },
    NP: { currency: "NPR", locale: "ne-NP" },
};

// Approximate value of 1 INR in each currency (display only). Update as needed.
export const INR_RATES: Record<string, number> = {
    INR: 1,
    USD: 0.012,
    CAD: 0.016,
    GBP: 0.0095,
    AUD: 0.018,
    NZD: 0.02,
    SGD: 0.016,
    AED: 0.044,
    SAR: 0.045,
    JPY: 1.8,
    EUR: 0.011,
    BRL: 0.066,
    ZAR: 0.22,
    NGN: 18.5,
    KES: 1.55,
    IDR: 190,
    MYR: 0.054,
    PHP: 0.68,
    PKR: 3.3,
    BDT: 1.4,
    LKR: 3.5,
    NPR: 1.6,
};

export function regionForCountry(country: string): Region {
    const r = COUNTRY_REGION[country.toUpperCase()];
    return r ? { country: country.toUpperCase(), currency: r.currency, locale: r.locale } : DEFAULT_REGION;
}

/** Convert a paise (INR minor unit) amount to the target currency's major unit. */
export function convertFromINRPaise(paise: number, currency: string): number {
    const rate = INR_RATES[currency] ?? 1;
    return Math.round((paise / 100) * rate * 100) / 100;
}
