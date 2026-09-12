import type { Request } from "express";
import { DEFAULT_REGION, regionForCountry, type Region } from "./currency";

// Server-side IP geolocation for display currency.
//
// Priority:
//   1. CF-IPCountry        — set by Cloudflare for every request (no lookup, free)
//   2. X-Country-Code      — set by nginx (ngx_http_geoip2) if not behind Cloudflare
//   3. ipwho.is lookup     — optional, env-gated (GEOIP_FALLBACK=true), cached in-memory
//   4. DEFAULT_REGION      — India / INR (the gateway's settlement currency)
//
// We never *charge* in the detected currency — Razorpay settles INR. This only
// drives the approximate display price in the UI.

const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const lookupCache = new Map<string, { region: Region; at: number }>();

function countryFromHeader(req: Request, name: string): string | null {
    const raw = req.headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const code = value?.trim().toUpperCase();
    // "XX"/"T1" are Cloudflare's unknown/Tor markers — treat as no signal.
    if (code && /^[A-Z]{2}$/.test(code) && code !== "XX" && code !== "T1") return code;
    return null;
}

function clientIp(req: Request): string | null {
    const cf = req.headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.trim()) return cf.trim();
    const xff = req.headers["x-forwarded-for"];
    if (typeof xff === "string" && xff.trim()) return xff.split(",")[0].trim();
    return req.socket?.remoteAddress ?? null;
}

async function lookupCountryByIp(ip: string): Promise<string | null> {
    const cached = lookupCache.get(ip);
    if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.region.country;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 1500);
        const resp = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!resp.ok) return null;
        const data = (await resp.json()) as { success?: boolean; country_code?: string };
        if (data.success === false || !data.country_code) return null;
        const region = regionForCountry(data.country_code);
        lookupCache.set(ip, { region, at: Date.now() });
        return region.country;
    } catch {
        return null;
    }
}

export async function resolveRegion(req: Request): Promise<Region> {
    const fromCf = countryFromHeader(req, "cf-ipcountry");
    if (fromCf) return regionForCountry(fromCf);

    const fromNginx = countryFromHeader(req, "x-country-code");
    if (fromNginx) return regionForCountry(fromNginx);

    if (process.env.GEOIP_FALLBACK === "true") {
        const ip = clientIp(req);
        if (ip && ip !== "::1" && ip !== "127.0.0.1" && !ip.startsWith("::ffff:127.")) {
            const cached = lookupCache.get(ip);
            if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.region;
            const country = await lookupCountryByIp(ip);
            if (country) return regionForCountry(country);
        }
    }

    return DEFAULT_REGION;
}
