const RESEND_API = "https://api.resend.com/emails";

/**
 * Transactional email via Resend (dependency-free `fetch`).
 * No-op + warn when RESEND_API_KEY is unset — never throw into billing flows.
 */
export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
        console.warn("[email] RESEND_API_KEY not set — skipping email:", { to, subject });
        return false;
    }
    const from = process.env.RESEND_FROM ?? "Metaverse 2D <no-reply@metaverse2d.com>";
    try {
        const res = await fetch(RESEND_API, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({ from, to, subject, html }),
        });
        if (!res.ok) {
            console.error("[email] Resend failed:", res.status, await res.text());
            return false;
        }
        return true;
    } catch (err) {
        console.error("[email] send error:", err);
        return false;
    }
}