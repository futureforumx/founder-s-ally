import { entityNameTokens, tokenJaccard } from "@/lib/ingestEntityMatch";
import type { ConfidenceLabel, EntityType, IdentityOutcome, RecordRow } from "./types";
import type { EntitySpec } from "./fieldRegistry";
import {
  canonicalFirstName,
  isAggregatorDomain,
  linkedinSlug,
  normalizeCompanyName,
  normalizeDomain,
  personNameKey,
} from "./normalize";

/** Thresholds, exported so tests and reports share one definition. */
export const IDENTITY_HIGH = 0.92;
export const IDENTITY_MEDIUM = 0.85;
export const IDENTITY_AMBIGUOUS = 0.6;

export interface EntityIdentity {
  id: string;
  entity: EntityType;
  name: string;
  domain: string | null;
  linkedinSlug: string | null;
  /** People: employer / parent firm or company. */
  parentName: string | null;
  parentDomain: string | null;
  country: string | null;
  city: string | null;
  /** True when more than one existing record shares this identity key (cannot auto-merge). */
  duplicateOfExisting: boolean;
}

/** What a provider told us about the matched entity, normalized for comparison. */
export interface ProviderEntity {
  name?: string | null;
  domain?: string | null;
  website?: string | null;
  linkedin?: string | null;
  employerName?: string | null;
  employerDomain?: string | null;
  pastEmployerNames?: string[];
  country?: string | null;
  city?: string | null;
  /** Provider-reported match likelihood (0..1) when available. */
  likelihood?: number | null;
}

export function identityFromRow(spec: EntitySpec, row: RecordRow, parent: RecordRow | null = null): EntityIdentity {
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const domainRaw = spec.domainColumn ? str(row[spec.domainColumn]) : null;
  const websiteRaw = spec.websiteColumn ? str(row[spec.websiteColumn]) : null;
  const domain = normalizeDomain(domainRaw) ?? normalizeDomain(websiteRaw);
  const p = spec.parent;
  const parentDomain = p && parent ? normalizeDomain(parent[p.domainColumn ?? ""]) ?? normalizeDomain(parent[p.websiteColumn ?? ""]) : null;
  return {
    id: String(row[spec.idColumn]),
    entity: spec.entity,
    name: str(row[spec.nameColumn]) ?? "",
    domain: isAggregatorDomain(domain) ? null : domain,
    linkedinSlug: spec.linkedinColumn ? linkedinSlug(row[spec.linkedinColumn]) : null,
    parentName: p && parent ? str(parent[p.nameColumn]) : null,
    parentDomain: isAggregatorDomain(parentDomain) ? null : parentDomain,
    country: str(row.hq_country) ?? str(row.country),
    city: str(row.hq_city) ?? str(row.city),
    duplicateOfExisting: false,
  };
}

function label(score: number): ConfidenceLabel {
  return score >= IDENTITY_HIGH ? "high" : score >= IDENTITY_MEDIUM ? "medium" : "low";
}

function outcome(score: number, signals: string[], reasonIfNot: string): IdentityOutcome {
  const rounded = Math.round(score * 100) / 100;
  if (score >= IDENTITY_MEDIUM) return { kind: "match", confidence: label(score), score: rounded, signals };
  if (score >= IDENTITY_AMBIGUOUS) return { kind: "ambiguous", score: rounded, signals, reason: reasonIfNot };
  return { kind: "no_match", score: rounded, signals, reason: reasonIfNot };
}

function nameSimilarity(a: string, b: string): number {
  const na = normalizeCompanyName(a);
  const nb = normalizeCompanyName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  return tokenJaccard(entityNameTokens(a), entityNameTokens(b));
}

/** Firms and companies: domain / LinkedIn first, then name plus geographic corroboration. */
export function resolveOrganization(existing: EntityIdentity, cand: ProviderEntity): IdentityOutcome {
  const signals: string[] = [];
  if (existing.duplicateOfExisting) {
    return { kind: "ambiguous", score: 0.7, signals: ["duplicate_existing_record"], reason: "More than one existing record shares this domain or LinkedIn identity; resolve duplicates before enriching." };
  }

  const candDomain = normalizeDomain(cand.domain) ?? normalizeDomain(cand.website);
  const candDomainOk = candDomain && !isAggregatorDomain(candDomain) ? candDomain : null;
  const candSlug = linkedinSlug(cand.linkedin);
  const nameSim = cand.name ? nameSimilarity(existing.name, cand.name) : 0;

  const domainEqual = Boolean(existing.domain && candDomainOk && existing.domain === candDomainOk);
  const domainConflict = Boolean(existing.domain && candDomainOk && existing.domain !== candDomainOk);
  const linkedinEqual = Boolean(existing.linkedinSlug && candSlug && existing.linkedinSlug === candSlug);
  const linkedinConflict = Boolean(existing.linkedinSlug && candSlug && existing.linkedinSlug !== candSlug);

  if (domainEqual) signals.push("domain");
  if (linkedinEqual) signals.push("linkedin");
  if (nameSim >= 0.99) signals.push("name_exact");
  else if (nameSim >= 0.7) signals.push("name_similar");

  let score = 0;
  if (domainEqual || linkedinEqual) {
    score = domainEqual && linkedinEqual ? 0.99 : 0.95;
    if (nameSim >= 0.7) score = Math.min(1, score + 0.04);
    else if (cand.name && nameSim < 0.2) {
      score = Math.min(score, 0.8);
      signals.push("name_mismatch");
    }
  } else if (nameSim >= 0.99) {
    score = 0.7;
    const geo =
      (existing.country && cand.country && existing.country.toLowerCase() === cand.country.toLowerCase() ? 1 : 0) +
      (existing.city && cand.city && existing.city.toLowerCase() === cand.city.toLowerCase() ? 1 : 0);
    if (geo >= 1) {
      score = existing.city && cand.city && existing.city.toLowerCase() === cand.city.toLowerCase() ? 0.9 : 0.86;
      signals.push("geo");
    }
  } else if (nameSim >= 0.8) {
    score = 0.6;
  }

  if (domainConflict && !domainEqual) {
    signals.push("domain_conflict");
    score = Math.min(score, 0.7);
  }
  if (linkedinConflict && !linkedinEqual) {
    signals.push("linkedin_conflict");
    score = Math.min(score, 0.7);
  }
  if (typeof cand.likelihood === "number" && cand.likelihood < 0.5) {
    signals.push("provider_low_likelihood");
    score = Math.min(score, 0.7);
  }

  const reason = score === 0 ? "No domain, LinkedIn or name evidence links the provider result to this record." : "Insufficient corroboration (name-only or conflicting identifiers).";
  return outcome(score, signals, reason);
}

function firstNamesCompatible(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (canonicalFirstName(a) === canonicalFirstName(b)) return 0.9;
  if (a.length === 1 && b.startsWith(a)) return 0.5;
  if (b.length === 1 && a.startsWith(b)) return 0.5;
  return 0;
}

/** People: LinkedIn / stable identifier first, then full name plus verified employer. */
export function resolvePerson(existing: EntityIdentity, cand: ProviderEntity): IdentityOutcome {
  const signals: string[] = [];
  if (existing.duplicateOfExisting) {
    return { kind: "ambiguous", score: 0.7, signals: ["duplicate_existing_record"], reason: "More than one existing person record shares this identity; resolve duplicates before enriching." };
  }

  const a = personNameKey(existing.name);
  const b = personNameKey(cand.name);
  const lastEqual = Boolean(a.last && b.last && a.last === b.last);
  const firstScore = firstNamesCompatible(a.first, b.first);
  const fullEqual = Boolean(a.full && b.full && a.full === b.full);
  const nameStrong = fullEqual || (lastEqual && firstScore >= 0.9);
  const nameWeak = lastEqual && firstScore >= 0.5;
  const nameContradicts = Boolean(cand.name) && !nameWeak && !fullEqual;

  const candSlug = linkedinSlug(cand.linkedin);
  const linkedinEqual = Boolean(existing.linkedinSlug && candSlug && existing.linkedinSlug === candSlug);
  const linkedinConflict = Boolean(existing.linkedinSlug && candSlug && existing.linkedinSlug !== candSlug);
  if (linkedinEqual) signals.push("linkedin");
  if (fullEqual) signals.push("name_exact");
  else if (nameStrong) signals.push("name_compatible");

  const employerNameSim = existing.parentName && cand.employerName ? nameSimilarity(existing.parentName, cand.employerName) : 0;
  const candEmpDomain = normalizeDomain(cand.employerDomain);
  const employerDomainEqual = Boolean(existing.parentDomain && candEmpDomain && existing.parentDomain === candEmpDomain);
  const employerMatches = employerDomainEqual || employerNameSim >= 0.8;
  if (employerMatches) signals.push("employer");

  const formerEmployer =
    !employerMatches &&
    Boolean(existing.parentName) &&
    (cand.pastEmployerNames ?? []).some((n) => nameSimilarity(existing.parentName as string, n) >= 0.8);
  if (formerEmployer) signals.push("former_employer_only");

  let score = 0;
  if (linkedinEqual) {
    score = nameContradicts ? 0.5 : 0.97;
    if (nameContradicts) signals.push("name_contradiction");
  } else if (nameStrong && employerMatches) {
    score = fullEqual ? 0.9 : 0.86;
    if (existing.country && cand.country && existing.country.toLowerCase() !== cand.country.toLowerCase()) {
      score -= 0.05;
      signals.push("country_mismatch");
    }
  } else if (nameStrong && formerEmployer) {
    score = 0.65;
  } else if (nameStrong) {
    score = 0.6;
    signals.push("name_only");
  } else if (nameWeak && employerMatches) {
    score = 0.6;
  }

  if (linkedinConflict && !linkedinEqual) {
    signals.push("linkedin_conflict");
    score = Math.min(score, 0.55);
  }
  if (typeof cand.likelihood === "number" && cand.likelihood < 0.5) {
    signals.push("provider_low_likelihood");
    score = Math.min(score, 0.7);
  }

  const reason = formerEmployer
    ? "Provider result lists the existing firm only as a past employer; role change needs human review."
    : score === 0
      ? "No LinkedIn, name or employer evidence links the provider result to this person."
      : "Name-only or partial evidence; not enough to treat as the same person.";
  return outcome(score, signals, reason);
}

export function resolveIdentity(existing: EntityIdentity, cand: ProviderEntity): IdentityOutcome {
  return existing.entity === "firm" || existing.entity === "company" ? resolveOrganization(existing, cand) : resolvePerson(existing, cand);
}

/** Marks identities that collide with another existing record on a strong key. */
export function flagDuplicateIdentities(identities: EntityIdentity[]): void {
  const byKey = new Map<string, EntityIdentity[]>();
  const add = (k: string | null, i: EntityIdentity) => {
    if (!k) return;
    const arr = byKey.get(k) ?? [];
    arr.push(i);
    byKey.set(k, arr);
  };
  for (const i of identities) {
    add(i.domain ? `domain:${i.domain}` : null, i);
    add(i.linkedinSlug ? `li:${i.linkedinSlug}` : null, i);
    if (i.entity === "investor" || i.entity === "founder" || i.entity === "operator") {
      const n = personNameKey(i.name).full;
      add(n && i.parentName ? `person:${n}|${normalizeCompanyName(i.parentName)}` : null, i);
    }
  }
  for (const group of byKey.values()) {
    if (group.length > 1) for (const i of group) i.duplicateOfExisting = true;
  }
}

export function duplicateGroups(identities: EntityIdentity[]): Array<{ key: string; ids: string[] }> {
  const byKey = new Map<string, string[]>();
  for (const i of identities) {
    const keys: string[] = [];
    if (i.domain) keys.push(`domain:${i.domain}`);
    if (i.linkedinSlug) keys.push(`linkedin:${i.linkedinSlug}`);
    if (i.entity === "investor" || i.entity === "founder" || i.entity === "operator") {
      const n = personNameKey(i.name).full;
      if (n && i.parentName) keys.push(`person:${n}|${normalizeCompanyName(i.parentName)}`);
    } else if (i.name) {
      keys.push(`name:${normalizeCompanyName(i.name)}`);
    }
    for (const k of keys) byKey.set(k, [...(byKey.get(k) ?? []), i.id]);
  }
  return [...byKey.entries()].filter(([, ids]) => ids.length > 1).map(([key, ids]) => ({ key, ids }));
}
