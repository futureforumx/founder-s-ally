/** Clerk REST API (Edge Functions). Set `CLERK_SECRET_KEY` in Supabase project secrets. */

const CLERK_API_V1 = "https://api.clerk.com/v1";

export type ClerkApiEmail = { id: string; email_address: string };

export type ClerkApiUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  image_url: string | null;
  primary_email_address_id: string | null;
  email_addresses: ClerkApiEmail[] | null;
  created_at: number;
  last_sign_in_at: number | null;
  public_metadata?: Record<string, unknown>;
};

export function clerkPrimaryEmail(u: ClerkApiUser): string {
  const list = u.email_addresses ?? [];
  const pid = u.primary_email_address_id;
  const hit = pid ? list.find((e) => e.id === pid) : undefined;
  if (hit?.email_address) return hit.email_address;
  return list[0]?.email_address ?? "";
}

export function clerkDisplayName(u: ClerkApiUser): string {
  const n = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  if (n) return n;
  if (u.username) return u.username;
  return "";
}

/** Fields aligned with Supabase Auth user shape used by admin-list-users merge. */
export function clerkUserToListedAuthFields(u: ClerkApiUser) {
  const meta = u.public_metadata ?? {};
  const role = meta.role;
  return {
    id: u.id,
    email: clerkPrimaryEmail(u),
    last_sign_in_at: u.last_sign_in_at != null ? new Date(u.last_sign_in_at).toISOString() : null,
    created_at: new Date(u.created_at).toISOString(),
    image_url: u.image_url ?? null,
    user_metadata: {
      full_name: clerkDisplayName(u),
      ...(typeof role === "string" ? { role } : {}),
    } as Record<string, unknown>,
  };
}

export async function clerkListAllUsers(secretKey: string): Promise<ClerkApiUser[]> {
  const out: ClerkApiUser[] = [];
  let offset = 0;
  const limit = 500;
  for (;;) {
    const url = `${CLERK_API_V1}/users?limit=${limit}&offset=${offset}&order_by=-created_at`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      const t = await res.text();
      throw new Error(`Clerk list users failed (${res.status}): ${t.slice(0, 500)}`);
    }
    const json = (await res.json()) as { data?: ClerkApiUser[] };
    const batch = json.data ?? [];
    out.push(...batch);
    if (batch.length < limit) break;
    offset += limit;
  }
  return out;
}

/** Ban a Clerk user so the account/email can no longer sign in. Best-effort. */
export async function clerkBanUser(secretKey: string, userId: string): Promise<boolean> {
  const res = await fetch(`${CLERK_API_V1}/users/${encodeURIComponent(userId)}/ban`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Clerk ban user failed (${res.status}): ${t.slice(0, 500)}`);
  }
  return true;
}

/** Best-effort list of IP addresses Clerk has seen for a user's sessions. */
export async function clerkGetUserSessionIps(secretKey: string, userId: string): Promise<string[]> {
  try {
    const res = await fetch(
      `${CLERK_API_V1}/sessions?user_id=${encodeURIComponent(userId)}&limit=50`,
      { headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/json" } },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as unknown;
    const rows = Array.isArray(json) ? json : ((json as { data?: unknown[] }).data ?? []);
    const ips = new Set<string>();
    for (const row of rows as Array<Record<string, unknown>>) {
      const la = row.latest_activity as Record<string, unknown> | undefined;
      const ip = la?.ip_address;
      if (typeof ip === "string" && ip.trim()) ips.add(ip.trim());
    }
    return [...ips];
  } catch {
    return [];
  }
}

export async function clerkGetUser(secretKey: string, userId: string): Promise<ClerkApiUser | null> {
  const res = await fetch(`${CLERK_API_V1}/users/${encodeURIComponent(userId)}`, {
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Clerk get user failed (${res.status}): ${t.slice(0, 500)}`);
  }
  return (await res.json()) as ClerkApiUser;
}
