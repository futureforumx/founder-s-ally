/**
 * Source-aware merge + persist for StartupProfessional (idempotent re-runs).
 *
 * - Match: linkedin → angelListId → (fullName + currentStartup), optional PROFESSIONALS_MERGE_BY_NAME=1
 * - Store normalized fullName + currentStartup for composite uniqueness
 * - Scalars: higher sourcePriority wins; tie → newer sourceUpdatedAt
 * - githubStars, followers, phLaunchCount: max
 * - prevStartups: merged unique (normalized)
 * - phMaker: logical OR
 * - YC/AngelList + linkedin match: new startup archives old into prevStartups
 * - GitHub ingest does not override identity from rows already touched by priority ≥ 80
 */

import type { Prisma, PrismaClient, StartupProfessional } from "@prisma/client";

export const SOURCE_PRIORITY: Record<string, number> = {
  yc: 100,
  ph: 80,
  github: 70,
  angellist: 60,
};

export type ProfessionalSource = "yc" | "ph" | "github" | "angellist";

export type ProfessionalIngestPayload = {
  firstName: string;
  lastName: string;
  fullName: string;
  linkedin?: string | null;
  email?: string | null;
  title: string;
  currentRole: string;
  currentStartup: string;
  prevStartups?: string[];
  ycBatch?: string | null;
  phMaker?: boolean;
  phLaunchCount?: number;
  githubHandle?: string | null;
  githubStars?: number;
  angelListId?: string | null;
  followers?: number;
  location?: string | null;
  source: ProfessionalSource | string;
  sourcePriority?: number;
  sourceUpdatedAt?: Date | null;
};

export type MergeResult = {
  id: string;
  created: boolean;
  changeCount: number;
};

export function normalizePersonName(s: string): string {
  return s.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function normalizeStartupName(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function normLinkedin(s: string | null | undefined): string | null {
  if (!s?.trim()) return null;
  let u = s.trim();
  if (!/^https?:\/\//i.test(u)) u = `https://${u.replace(/^\/+/, "")}`;
  return u;
}

export function splitFullName(full: string): { first: string; last: string } {
  const p = normalizePersonName(full).split(/\s+/).filter(Boolean);
  if (p.length === 0) return { first: "Unknown", last: "" };
  if (p.length === 1) return { first: p[0], last: "" };
  return { first: p[0], last: p.slice(1).join(" ") };
}

function max0(a: number, b: number): number {
  return Math.max(a ?? 0, b ?? 0);
}

function mergeUniqueStartupsList(existing: string[], incoming: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of [...existing, ...incoming]) {
    const t = x.normalize("NFKC").replace(/\s+/g, " ").trim();
    const n = normalizeStartupName(t);
    if (!n || seen.has(n)) continue;
    seen.add(n);
    out.push(t);
  }
  return out;
}

function pickScalar(
  existing: string | null | undefined,
  incoming: string | null | undefined,
  exPri: number,
  inPri: number,
  exAt: Date | null | undefined,
  inAt: Date,
): string | null {
  const e = existing?.trim() || null;
  const n = incoming?.trim() || null;
  if (!n) return e;
  if (!e) return n;
  if (inPri > exPri) return n;
  if (inPri < exPri) return e;
  const exMs = exAt?.getTime() ?? 0;
  return inAt.getTime() >= exMs ? n : e;
}

function priorityForSource(source: string): number {
  const k = source.toLowerCase();
  return SOURCE_PRIORITY[k] ?? 0;
}

function auditEnabled(): boolean {
  return process.env.PROFESSIONALS_AUDIT_LOG !== "0";
}

type ChangeEntry = { field: string; from: unknown; to: unknown };

function serializeAudit(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

async function findExisting(
  prisma: PrismaClient,
  keys: {
    linkedin: string | null;
    angelListId: string | null;
    fullName: string;
    currentStartup: string;
  },
): Promise<StartupProfessional | null> {
  if (keys.linkedin) {
    const byLi = await prisma.startupProfessional.findUnique({ where: { linkedin: keys.linkedin } });
    if (byLi) return byLi;
  }
  if (keys.angelListId?.trim()) {
    const byAl = await prisma.startupProfessional.findFirst({
      where: { angelListId: keys.angelListId.trim() },
    });
    if (byAl) return byAl;
  }
  const byComp = await prisma.startupProfessional.findUnique({
    where: {
      fullName_currentStartup: { fullName: keys.fullName, currentStartup: keys.currentStartup },
    },
  });
  if (byComp) return byComp;

  if (process.env.PROFESSIONALS_MERGE_BY_NAME === "1") {
    const list = await prisma.startupProfessional.findMany({
      where: { fullName: keys.fullName },
      take: 2,
    });
    if (list.length === 1) return list[0]!;
  }
  return null;
}

function identityLockedByHighTrust(row: StartupProfessional): boolean {
  return row.sourcePriority >= 80;
}

export async function mergeStartupProfessional(
  prisma: PrismaClient,
  raw: ProfessionalIngestPayload,
): Promise<MergeResult> {
  const inPri = raw.sourcePriority ?? priorityForSource(raw.source);
  const inAt = raw.sourceUpdatedAt ?? new Date();
  const now = new Date();
  const src = raw.source.toLowerCase();

  const linkedin = normLinkedin(raw.linkedin ?? null);
  const nFull = normalizePersonName(raw.fullName);
  const nStartup = normalizeStartupName(raw.currentStartup);
  const keys = {
    linkedin,
    angelListId: raw.angelListId?.trim() || null,
    fullName: nFull,
    currentStartup: nStartup,
  };

  const existing = await findExisting(prisma, keys);

  if (!existing) {
    const prev = mergeUniqueStartupsList([], raw.prevStartups ?? []);
    const data: Prisma.StartupProfessionalCreateInput = {
      firstName: normalizePersonName(raw.firstName),
      lastName: normalizePersonName(raw.lastName),
      fullName: nFull,
      linkedin,
      email: raw.email?.trim() || null,
      title: raw.title.trim(),
      currentRole: raw.currentRole.trim(),
      currentStartup: nStartup,
      prevStartups: prev,
      ycBatch: raw.ycBatch?.trim() || null,
      phMaker: raw.phMaker ?? false,
      phLaunchCount: raw.phLaunchCount ?? 0,
      githubHandle: raw.githubHandle?.trim() || null,
      githubStars: raw.githubStars ?? 0,
      angelListId: raw.angelListId?.trim() || null,
      followers: raw.followers ?? 0,
      location: raw.location?.trim() || null,
      source: src,
      sourcePriority: inPri,
      lastSeenAt: now,
      sourceUpdatedAt: inAt,
    };
    const created = await prisma.startupProfessional.create({ data });
    if (auditEnabled()) {
      await prisma.startupProfessionalChangeLog.create({
        data: {
          startupProfessionalId: created.id,
          field: "*",
          oldValue: null,
          newValue: "create",
          source: src,
          sourcePriority: inPri,
          patch: [{ field: "_op", from: null, to: "create" }] as Prisma.InputJsonValue,
        },
      });
    }
    return { id: created.id, created: true, changeCount: 1 };
  }

  const exPri = existing.sourcePriority;
  const exAt = existing.sourceUpdatedAt;

  const changes: ChangeEntry[] = [];
  const push = (field: string, from: unknown, to: unknown) => {
    const fs = serializeAudit(from);
    const ts = serializeAudit(to);
    if (fs !== ts) changes.push({ field, from, to });
  };

  let nextFirst = existing.firstName;
  let nextLast = existing.lastName;
  let nextFull = existing.fullName;
  let nextTitle = existing.title;
  let nextRole = existing.currentRole;
  let nextStartup = existing.currentStartup;
  let nextYc = existing.ycBatch;
  let nextEmail = existing.email;
  let nextLi = existing.linkedin;
  let nextLoc = existing.location;
  let nextAl = existing.angelListId;
  let nextGh = existing.githubHandle;
  let prevList = [...existing.prevStartups];

  const ghIncoming = src === "github";
  const phIncoming = src === "ph";
  const ycOrAl = src === "yc" || src === "angellist";

  /** GitHub / PH must not overwrite YC/PH identity fields on high-trust rows */
  const freezeIdentity =
    (ghIncoming || phIncoming) && identityLockedByHighTrust(existing);

  if (!freezeIdentity) {
    nextFirst = pickScalar(existing.firstName, raw.firstName, exPri, inPri, exAt, inAt) ?? nextFirst;
    nextLast = pickScalar(existing.lastName, raw.lastName, exPri, inPri, exAt, inAt) ?? nextLast;
    nextFull = pickScalar(existing.fullName, nFull, exPri, inPri, exAt, inAt) ?? nextFull;
    nextTitle = pickScalar(existing.title, raw.title, exPri, inPri, exAt, inAt) ?? nextTitle;
    nextRole = pickScalar(existing.currentRole, raw.currentRole, exPri, inPri, exAt, inAt) ?? nextRole;
    nextEmail = pickScalar(existing.email, raw.email, exPri, inPri, exAt, inAt) ?? nextEmail;
    nextLi = pickScalar(existing.linkedin, linkedin, exPri, inPri, exAt, inAt) ?? nextLi;
    nextLoc = pickScalar(existing.location, raw.location, exPri, inPri, exAt, inAt) ?? nextLoc;
    nextAl = pickScalar(existing.angelListId, raw.angelListId?.trim() || null, exPri, inPri, exAt, inAt) ?? nextAl;
  }

  if (freezeIdentity && (ghIncoming || phIncoming)) {
    nextLoc = pickScalar(existing.location, raw.location, exPri, inPri, exAt, inAt) ?? nextLoc;
  }

  if (!freezeIdentity && !phIncoming) {
    const exS = normalizeStartupName(existing.currentStartup);
    if (ycOrAl && inPri >= 60 && exS !== nStartup) {
      if (exS) prevList = mergeUniqueStartupsList(prevList, [existing.currentStartup, ...(raw.prevStartups ?? [])]);
      nextStartup = nStartup;
    } else if (!ghIncoming) {
      nextStartup = pickScalar(existing.currentStartup, nStartup, exPri, inPri, exAt, inAt) ?? nextStartup;
    }
  } else if (phIncoming && !identityLockedByHighTrust(existing)) {
    nextStartup = pickScalar(existing.currentStartup, nStartup, exPri, inPri, exAt, inAt) ?? nextStartup;
    nextTitle = pickScalar(existing.title, raw.title, exPri, inPri, exAt, inAt) ?? nextTitle;
    nextFull = pickScalar(existing.fullName, nFull, exPri, inPri, exAt, inAt) ?? nextFull;
  }

  if (!freezeIdentity) {
    nextYc = pickScalar(existing.ycBatch, raw.ycBatch?.trim() || null, exPri, inPri, exAt, inAt) ?? nextYc;
  }

  if (ghIncoming || raw.githubHandle) {
    nextGh = pickScalar(existing.githubHandle, raw.githubHandle?.trim() || null, exPri, inPri, exAt, inAt) ?? nextGh;
  }

  prevList = mergeUniqueStartupsList(prevList, raw.prevStartups ?? []);

  const nextStars = max0(existing.githubStars, raw.githubStars ?? 0);
  const nextFollowers = max0(existing.followers, raw.followers ?? 0);
  const nextPhCount = max0(existing.phLaunchCount, raw.phLaunchCount ?? 0);
  const nextPhMaker = existing.phMaker || (raw.phMaker ?? false);

  const nextMaxPri = Math.max(exPri, inPri);
  const nextSource = src;
  const nextLastSeen = now;
  let nextSrcUpdDate: Date;
  if (inPri > exPri) nextSrcUpdDate = inAt;
  else if (inPri < exPri) nextSrcUpdDate = existing.sourceUpdatedAt ?? inAt;
  else nextSrcUpdDate = inAt >= (existing.sourceUpdatedAt ?? inAt) ? inAt : (existing.sourceUpdatedAt ?? inAt);

  push("firstName", existing.firstName, nextFirst);
  push("lastName", existing.lastName, nextLast);
  push("fullName", existing.fullName, nextFull);
  push("title", existing.title, nextTitle);
  push("currentRole", existing.currentRole, nextRole);
  push("currentStartup", existing.currentStartup, nextStartup);
  push("prevStartups", existing.prevStartups, prevList);
  push("ycBatch", existing.ycBatch, nextYc);
  push("email", existing.email, nextEmail);
  push("linkedin", existing.linkedin, nextLi);
  push("location", existing.location, nextLoc);
  push("angelListId", existing.angelListId, nextAl);
  push("githubHandle", existing.githubHandle, nextGh);
  push("githubStars", existing.githubStars, nextStars);
  push("followers", existing.followers, nextFollowers);
  push("phLaunchCount", existing.phLaunchCount, nextPhCount);
  push("phMaker", existing.phMaker, nextPhMaker);
  push("source", existing.source, nextSource);
  push("sourcePriority", existing.sourcePriority, nextMaxPri);
  push("lastSeenAt", existing.lastSeenAt?.toISOString() ?? null, nextLastSeen.toISOString());
  push("sourceUpdatedAt", existing.sourceUpdatedAt?.toISOString() ?? null, nextSrcUpdDate.toISOString());

  await prisma.$transaction(async (tx) => {
    await tx.startupProfessional.update({
      where: { id: existing.id },
      data: {
        firstName: nextFirst,
        lastName: nextLast,
        fullName: nextFull,
        title: nextTitle,
        currentRole: nextRole,
        currentStartup: nextStartup,
        prevStartups: prevList,
        ycBatch: nextYc,
        email: nextEmail,
        linkedin: nextLi,
        location: nextLoc,
        angelListId: nextAl,
        githubHandle: nextGh,
        githubStars: nextStars,
        followers: nextFollowers,
        phLaunchCount: nextPhCount,
        phMaker: nextPhMaker,
        source: nextSource,
        sourcePriority: nextMaxPri,
        lastSeenAt: nextLastSeen,
        sourceUpdatedAt: nextSrcUpdDate,
      },
    });

    if (auditEnabled() && changes.length > 0) {
      await tx.startupProfessionalChangeLog.create({
        data: {
          startupProfessionalId: existing.id,
          field: "*",
          oldValue: null,
          newValue: null,
          source: src,
          sourcePriority: inPri,
          patch: changes as Prisma.InputJsonValue,
        },
      });
    }
  });

  return { id: existing.id, created: false, changeCount: changes.length };
}

/** Skip GitHub users who look like investors (heuristic; founders/operators only). */
export function looksLikeVcInvestor(bio: string | null | undefined): boolean {
  if (!bio?.trim()) return false;
  const b = bio.slice(0, 200).toLowerCase();
  return (
    /\bvc\b/.test(b) ||
    /\bventure capital\b/.test(b) ||
    /\binvestor at\b/.test(b) ||
    (/\bprincipal at\b/.test(b) && /ventures|capital|partners/.test(b)) ||
    (/\bpartner at\b/.test(b) && /ventures|capital|\bvc\b/.test(b)) ||
    /\blimited partner\b/.test(b) ||
    (/\bangel investor\b/.test(b) && !/\bfounder\b/.test(b))
  );
}
