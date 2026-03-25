import { z } from "zod";

const emailSchema = z.string().trim().email();

const skipDnsDomains = new Set(
  [
    "gmail.com",
    "googlemail.com",
    "yahoo.com",
    "yahoo.co.uk",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
    "me.com",
    "mac.com",
    "live.com",
    "msn.com",
    "proton.me",
    "protonmail.com",
    "aol.com",
  ].map((d) => d.toLowerCase())
);

/**
 * Signup-only validation: RFC-ish format (Zod) + DNS proof the domain exists (MX or A).
 * On network failure, allows signup (fail-open) so outages do not block users.
 */
export async function validateSignupEmail(
  rawEmail: string
): Promise<{ ok: true } | { ok: false; message: string }> {
  const email = rawEmail.trim();
  if (!email) {
    return { ok: false, message: "Enter an email address." };
  }

  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return {
      ok: false,
      message: `"${email}" is not a valid email address: The address format is invalid.`,
    };
  }

  const at = email.lastIndexOf("@");
  const domain = email.slice(at + 1).toLowerCase();
  if (!domain || domain.includes("@")) {
    return {
      ok: false,
      message: `"${email}" is not a valid email address: The address format is invalid.`,
    };
  }

  if (skipDnsDomains.has(domain)) {
    return { ok: true };
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);

  try {
    const headers = { Accept: "application/dns-json" } as const;
    const base = "https://cloudflare-dns.com/dns-query";

    const mxRes = await fetch(`${base}?name=${encodeURIComponent(domain)}&type=MX`, {
      headers,
      signal: controller.signal,
    });
    if (!mxRes.ok) {
      return { ok: true };
    }
    const mx = (await mxRes.json()) as { Status?: number; Answer?: unknown[] };

    if (mx.Status === 3) {
      return {
        ok: false,
        message: `"${email}" is not a valid email address: The domain name ${domain} does not exist.`,
      };
    }

    if (Array.isArray(mx.Answer) && mx.Answer.length > 0) {
      return { ok: true };
    }

    const aRes = await fetch(`${base}?name=${encodeURIComponent(domain)}&type=A`, {
      headers,
      signal: controller.signal,
    });
    if (!aRes.ok) {
      return { ok: true };
    }
    const a = (await aRes.json()) as { Status?: number; Answer?: unknown[] };

    if (a.Status === 3) {
      return {
        ok: false,
        message: `"${email}" is not a valid email address: The domain name ${domain} does not exist.`,
      };
    }

    if (Array.isArray(a.Answer) && a.Answer.length > 0) {
      return { ok: true };
    }

    return {
      ok: false,
      message: `"${email}" is not a valid email address: The domain name ${domain} does not exist.`,
    };
  } catch {
    return { ok: true };
  } finally {
    clearTimeout(timeoutId);
  }
}
