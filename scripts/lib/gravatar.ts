import { createHash } from "node:crypto";

export type GravatarProfile = {
  avatarUrl: string | null;
  thumbnailUrl: string | null;
  profileUrl: string | null;
};

type RawGravatarProfile = {
  entry?: Array<{
    profileUrl?: string;
    thumbnailUrl?: string;
    photos?: Array<{
      value?: string;
      type?: string;
    }>;
  }>;
};

function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized && normalized.includes("@") ? normalized : null;
}

export function gravatarHash(email?: string | null): string | null {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return createHash("md5").update(normalized, "utf8").digest("hex");
}

export function gravatarAvatarUrl(email?: string | null, size: number = 256): string | null {
  const hash = gravatarHash(email);
  if (!hash) return null;
  return `https://www.gravatar.com/avatar/${hash}?s=${size}&d=404`;
}

export async function fetchGravatarProfile(
  email?: string | null,
  timeoutMs: number = 6000,
): Promise<GravatarProfile | null> {
  const hash = gravatarHash(email);
  if (!hash) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`https://www.gravatar.com/${hash}.json`, {
      method: "GET",
      headers: {
        accept: "application/json",
      },
      signal: controller.signal,
    });

    if (!res.ok) return null;

    const json = (await res.json()) as RawGravatarProfile;
    const entry = json.entry?.[0];
    if (!entry) return null;

    const preferredPhoto = entry.photos?.find((photo) => photo.value)?.value ?? null;

    return {
      avatarUrl: preferredPhoto,
      thumbnailUrl: entry.thumbnailUrl ?? null,
      profileUrl: entry.profileUrl ?? null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
