/**
 * Backfill vc_people.avatar_url with the best reachable photo/icon using a waterfall.
 *
 * Usage:
 *   npm run db:sync:investor-photos
 *   INVESTOR_PHOTO_MAX_PEOPLE=5000 npm run db:sync:investor-photos
 *   INVESTOR_PHOTO_FORCE=1 npm run db:sync:investor-photos
 *   INVESTOR_PHOTO_DRY_RUN=1 npm run db:sync:investor-photos
 */

import { PrismaClient } from "@prisma/client";
import { loadDatabaseUrl } from "./lib/loadDatabaseUrl";
import { fetchGravatarProfile, gravatarAvatarUrl } from "./lib/gravatar";

type Candidate = {
  source: string;
  url: string;
};

type Config = {
  maxPeople: number;
  timeoutMs: number;
  delayMs: number;
  dryRun: boolean;
  force: boolean;
  gravatarOnly: boolean;
  sourceFilter?: string;
};

function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  return v ? v : undefined;
}

function parseEnvInt(name: string, fallback: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

function getConfig(): Config {
  return {
    maxPeople: Math.max(1, parseEnvInt("INVESTOR_PHOTO_MAX_PEOPLE", 5000)),
    timeoutMs: Math.max(1000, parseEnvInt("INVESTOR_PHOTO_TIMEOUT_MS", 6000)),
    delayMs: Math.max(0, parseEnvInt("INVESTOR_PHOTO_DELAY_MS", 20)),
    dryRun: ["1", "true", "yes"].includes((process.env.INVESTOR_PHOTO_DRY_RUN || "").toLowerCase()),
    force: ["1", "true", "yes"].includes((process.env.INVESTOR_PHOTO_FORCE || "").toLowerCase()),
    gravatarOnly: ["1", "true", "yes"].includes((process.env.INVESTOR_PHOTO_GRAVATAR_ONLY || "").toLowerCase()),
    sourceFilter: env("INVESTOR_PHOTO_SOURCE_FILTER"),
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function trimOrNull(v?: string | null): string | null {
  const t = v?.trim();
  return t ? t : null;
}

function parseHost(input?: string | null): string | null {
  const raw = input?.trim();
  if (!raw) return null;
  try {
    const u = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    return host.includes(".") ? host : null;
  } catch {
    return null;
  }
}

function parseXHandle(xUrl?: string | null): string | null {
  const raw = trimOrNull(xUrl);
  if (!raw) return null;
  try {
    const u = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "x.com" && host !== "twitter.com") return null;
    const first = (u.pathname.split("/").filter(Boolean)[0] || "").replace(/^@/, "").trim();
    return first || null;
  } catch {
    return null;
  }
}

function isRealLinkedInProfile(linkedinUrl?: string | null): boolean {
  const raw = trimOrNull(linkedinUrl);
  if (!raw) return false;
  try {
    const u = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    if (host !== "linkedin.com") return false;
    const path = u.pathname.toLowerCase();
    return path.startsWith("/in/") || path.startsWith("/pub/");
  } catch {
    return false;
  }
}

function isPartnerLevelProfile(title?: string | null, role?: string | null): boolean {
  const haystack = [trimOrNull(title), trimOrNull(role)]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (!haystack) return false;
  return /(general partner|managing partner|venture partner|partner|principal|associate|analyst|scout|investor|advisor)/.test(haystack);
}

function gstaticFaviconUrl(host: string, size: number = 128): string {
  return `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${host}&size=${size}`;
}

function googleS2FaviconUrl(host: string, size: number = 128): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${size}`;
}

function isLikelyDirectImageUrl(input?: string | null): boolean {
  const raw = trimOrNull(input);
  if (!raw) return false;
  try {
    const u = raw.includes("://") ? new URL(raw) : new URL(`https://${raw}`);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.toLowerCase();

    if (/\.(png|jpg|jpeg|gif|webp|avif|svg)$/i.test(path)) return true;
    if (host.includes("media.licdn.com") || host.includes("pbs.twimg.com")) return true;
    if (host.includes("ctfassets.net") || host.includes("cloudfront.net")) return true;
    if (host.includes("imgix.net") || host.includes("images.")) return true;
    return false;
  } catch {
    return false;
  }
}

function uniqueCandidates(candidates: Candidate[]): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const url = candidate.url.trim();
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ ...candidate, url });
  }
  return out;
}

/** URLs that carry zero person-identity signal and should be replaced if a better source wins. */
function isReplaceablePlaceholderAvatar(url?: string | null): boolean {
  const normalized = trimOrNull(url)?.toLowerCase();
  if (!normalized) return false;
  // Autogenerated initials avatar
  if (normalized.includes("dicebear.com/")) return true;
  // Site favicons/logos — not a person headshot
  if (normalized.includes("linkedin.com")) return true;
  if (normalized.includes("faviconv2")) return true;
  if (normalized.includes("s2/favicons")) return true;
  return false;
}

function isLikelyImageContentType(contentType: string | null): boolean {
  return Boolean(contentType && contentType.toLowerCase().startsWith("image/"));
}

async function probeImage(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        accept: "image/*,*/*;q=0.8",
        range: "bytes=0-2048",
      },
      signal: controller.signal,
    });
    if (!res.ok) return false;

    const ct = res.headers.get("content-type");
    if (isLikelyImageContentType(ct)) return true;

    const knownImageHosts = [
      "gravatar.com/avatar/",
      "unavatar.io/",
      "clearbit.com",
    ];
    return knownImageHosts.some((token) => url.includes(token));
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function buildCandidates(input: {
  fullName: string;
  title?: string | null;
  role?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  gravatarProfilePhotoUrl?: string | null;
  websiteUrl?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
  firmWebsiteUrl?: string | null;
  gravatarOnly?: boolean;
}): Candidate[] {
  const email = trimOrNull(input.email)?.toLowerCase() ?? null;
  const xHandle = parseXHandle(input.xUrl);

  const candidates: Candidate[] = [];
  // NOTE: firm/website favicons are site logos, not person headshots — excluded from all sources.

  const existing = trimOrNull(input.avatarUrl);
  if (existing && !isReplaceablePlaceholderAvatar(existing)) {
    // Preserve a real existing headshot before generic fallback sources.
    candidates.push({ source: "existing_avatar", url: existing });
  }

  const websiteImage = trimOrNull(input.websiteUrl);
  if (isLikelyDirectImageUrl(websiteImage)) {
    candidates.push({ source: "website_direct_image", url: websiteImage! });
  }

  const linkedinDirectImage = trimOrNull(input.linkedinUrl);
  if (isLikelyDirectImageUrl(linkedinDirectImage)) {
    candidates.push({ source: "linkedin_direct_image", url: linkedinDirectImage! });
  }

  const xDirectImage = trimOrNull(input.xUrl);
  if (isLikelyDirectImageUrl(xDirectImage)) {
    candidates.push({ source: "x_direct_image", url: xDirectImage! });
  }

  const gravatarProfilePhotoUrl = trimOrNull(input.gravatarProfilePhotoUrl);
  const gravatar = gravatarAvatarUrl(email);
  if (gravatar) candidates.push({ source: "gravatar", url: gravatar });

  if (input.gravatarOnly) {
    return uniqueCandidates(candidates.filter((candidate) => candidate.source.startsWith("gravatar")));
  }

  if (gravatarProfilePhotoUrl) {
    candidates.push({ source: "gravatar_profile_photo", url: gravatarProfilePhotoUrl });
  }

  if (email) candidates.push({ source: "unavatar_email", url: `https://unavatar.io/${encodeURIComponent(email)}` });
  if (xHandle) candidates.push({ source: "unavatar_x", url: `https://unavatar.io/x/${encodeURIComponent(xHandle)}` });
  if (input.linkedinUrl) {
    candidates.push({ source: "unavatar_linkedin", url: `https://unavatar.io/${encodeURIComponent(input.linkedinUrl)}` });
  }

  const fullNameQuery = encodeURIComponent(input.fullName);
  candidates.push({ source: "unavatar_name", url: `https://unavatar.io/${fullNameQuery}` });

  return uniqueCandidates(candidates);
}

async function resolveBestCandidate(candidates: Candidate[], timeoutMs: number): Promise<Candidate | null> {
  for (const candidate of candidates) {
    const ok = await probeImage(candidate.url, timeoutMs);
    if (ok) return candidate;
  }
  return null;
}

async function main() {
  loadDatabaseUrl();
  const cfg = getConfig();
  const prisma = new PrismaClient();

  const whereClause: Record<string, unknown> = {
    deleted_at: null,
  };

  if (!cfg.force) {
    whereClause.OR = [{ avatar_url: null }, { avatar_url: "" }];
  }
  if (cfg.sourceFilter) {
    whereClause.data_source = cfg.sourceFilter;
  }

  const people = await prisma.vCPerson.findMany({
    where: whereClause,
    take: cfg.maxPeople,
    orderBy: { updated_at: "asc" },
    include: {
      firm: {
        select: {
          website_url: true,
        },
      },
    },
  });

  const stats = {
    scanned: people.length,
    attempted: 0,
    updated: 0,
    unchanged: 0,
    clearedPlaceholders: 0,
    unresolved: 0,
  };

  const bySource = new Map<string, number>();

  console.log("\n[photo-sync] Starting investor photo waterfall sync");
  console.log(
    `[photo-sync] scanned=${stats.scanned} dryRun=${cfg.dryRun} force=${cfg.force} gravatarOnly=${cfg.gravatarOnly}`,
  );

  for (let i = 0; i < people.length; i += 1) {
    const person = people[i];
    const fullName = `${person.first_name} ${person.last_name}`.trim();
    const gravatarProfile = await fetchGravatarProfile(person.email, cfg.timeoutMs);
    const candidates = buildCandidates({
      fullName,
      title: person.title,
      role: person.role,
      email: person.email,
      avatarUrl: person.avatar_url,
      gravatarProfilePhotoUrl: gravatarProfile?.avatarUrl ?? gravatarProfile?.thumbnailUrl ?? null,
      websiteUrl: person.website_url,
      linkedinUrl: person.linkedin_url,
      xUrl: person.x_url,
      firmWebsiteUrl: person.firm.website_url,
      gravatarOnly: cfg.gravatarOnly,
    });

    if (candidates.length === 0) {
      stats.unresolved += 1;
      continue;
    }

    stats.attempted += 1;
    const resolved = await resolveBestCandidate(candidates, cfg.timeoutMs);

    if (!resolved) {
      const current = trimOrNull(person.avatar_url);
      if (cfg.force && current && isReplaceablePlaceholderAvatar(current)) {
        if (!cfg.dryRun) {
          await prisma.vCPerson.update({
            where: { id: person.id },
            data: { avatar_url: null },
          });
        }
        stats.updated += 1;
        stats.clearedPlaceholders += 1;
      } else {
        stats.unresolved += 1;
      }
      if (cfg.delayMs > 0) await sleep(cfg.delayMs);
      continue;
    }

    bySource.set(resolved.source, (bySource.get(resolved.source) ?? 0) + 1);

    const current = trimOrNull(person.avatar_url);
    if (current === resolved.url) {
      stats.unchanged += 1;
    } else if (!cfg.dryRun) {
      await prisma.vCPerson.update({
        where: { id: person.id },
        data: { avatar_url: resolved.url },
      });
      stats.updated += 1;
    } else {
      stats.updated += 1;
    }

    if ((i + 1) % 100 === 0 || i === people.length - 1) {
      console.log(
        `[photo-sync] ${i + 1}/${people.length} attempted=${stats.attempted} updated=${stats.updated} clearedPlaceholders=${stats.clearedPlaceholders} unresolved=${stats.unresolved}`,
      );
    }

    if (cfg.delayMs > 0) await sleep(cfg.delayMs);
  }

  console.log("\n[photo-sync] Done");
  console.log(
    `[photo-sync] scanned=${stats.scanned} attempted=${stats.attempted} updated=${stats.updated} unchanged=${stats.unchanged} clearedPlaceholders=${stats.clearedPlaceholders} unresolved=${stats.unresolved}`,
  );
  if (bySource.size > 0) {
    console.log("[photo-sync] source breakdown:");
    for (const [source, count] of [...bySource.entries()].sort((a, b) => b[1] - a[1])) {
      console.log(`  - ${source}: ${count}`);
    }
  }

  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error("[photo-sync] fatal:", err);
  process.exitCode = 1;
});