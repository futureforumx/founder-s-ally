import { scoreFact } from "./confidence";
import type { EntitySpec, FieldSpec } from "./fieldRegistry";
import {
  isEmptyValue,
  mergeTextList,
  normalizeDomain,
  normalizeEmail,
  normalizeLinkedinUrl,
  normalizeUrl,
  normalizeXUrl,
  sameValue,
} from "./normalize";
import type { ConfidenceLabel, Fact, FieldDecision, RecordRow } from "./types";

export interface ExistingProvenance {
  sourcePlatform: string;
  confidenceScore: number | null;
  scrapedAt: string | null;
}

export interface DecideContext {
  spec: EntitySpec;
  row: RecordRow;
  identityScore: number;
  /** Latest provenance row per field name. */
  provenance: Record<string, ExistingProvenance | undefined>;
  allowContactLookups: boolean;
  /** Allows replacing existing values; only honoured when the caller was authorised for --force-refresh. */
  forceRefresh: boolean;
  /** Field names whose refresh group is stale (or all, for first-time enrichment). */
  refreshableFields: Set<string>;
}

const MANUAL_SOURCE = /manual|admin|user|claim|founder_submit|self[_-]?report|csv|import_by/i;

/** Current-state fields that only ever move forward; a larger/newer verified value is a correction, not a conflict. */
const MONOTONIC_UP = new Set(["total_raised_usd", "last_round_date", "last_funding_date", "most_recent_investment_date", "deals_last_24m", "lead_investments_count"]);
/** Fields describing the latest round; they follow last_round_date. */
const LATEST_ROUND_FOLLOWERS = new Set(["last_round_type", "last_round_size_usd", "valuation_usd"]);

export function isManualSource(sourcePlatform: string | null | undefined): boolean {
  return Boolean(sourcePlatform && MANUAL_SOURCE.test(sourcePlatform));
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

export function coerceValue(spec: FieldSpec, raw: unknown): { ok: true; value: unknown } | { ok: false; reason: string } {
  if (raw === null || raw === undefined) return { ok: false, reason: "empty" };
  switch (spec.type) {
    case "text": {
      const s = typeof raw === "string" ? raw.trim() : typeof raw === "number" ? String(raw) : null;
      if (spec.field === "email" || spec.column === "email") {
        const e = normalizeEmail(raw);
        return e ? { ok: true, value: e } : { ok: false, reason: "invalid email" };
      }
      if (!s) return { ok: false, reason: "empty" };
      return { ok: true, value: s.slice(0, 8000) };
    }
    case "url": {
      const col = spec.column;
      const v = /linkedin/.test(col) ? normalizeLinkedinUrl(raw) : /^x_|twitter/.test(col) ? normalizeXUrl(raw) : normalizeUrl(raw);
      return v ? { ok: true, value: v } : { ok: false, reason: "invalid url" };
    }
    case "domain": {
      const d = normalizeDomain(raw);
      return d ? { ok: true, value: d } : { ok: false, reason: "invalid domain" };
    }
    case "int": {
      const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      if (!Number.isFinite(n)) return { ok: false, reason: "not a number" };
      if (spec.field === "founded_year" && (n < 1800 || n > new Date().getFullYear() + 1)) return { ok: false, reason: "implausible year" };
      if (n < 0) return { ok: false, reason: "negative" };
      return { ok: true, value: Math.round(n) };
    }
    case "number": {
      const n = typeof raw === "number" ? raw : Number.parseFloat(String(raw));
      return Number.isFinite(n) && n >= 0 ? { ok: true, value: n } : { ok: false, reason: "not a non-negative number" };
    }
    case "boolean":
      return typeof raw === "boolean" ? { ok: true, value: raw } : { ok: false, reason: "not boolean" };
    case "date": {
      const s = String(raw).trim();
      if (!ISO_DATE.test(s)) return { ok: false, reason: "not an ISO date" };
      const t = Date.parse(s.slice(0, 10));
      return Number.isFinite(t) ? { ok: true, value: s.slice(0, 10) } : { ok: false, reason: "invalid date" };
    }
    case "text[]": {
      const list = mergeTextList([], Array.isArray(raw) ? raw : [raw]);
      return list.length ? { ok: true, value: list } : { ok: false, reason: "empty" };
    }
    case "json":
      return Array.isArray(raw) || typeof raw === "object" ? { ok: true, value: raw } : { ok: false, reason: "not json" };
  }
}

function valueKey(v: unknown): string {
  return JSON.stringify(Array.isArray(v) ? [...v].map((x) => String(x).toLowerCase()).sort() : typeof v === "string" ? v.toLowerCase() : v);
}

interface Candidate {
  fact: Fact;
  value: unknown;
  score: number;
  label: ConfidenceLabel;
}

function mk(
  spec: FieldSpec,
  best: Candidate,
  action: FieldDecision["action"],
  reason: string,
  before: unknown,
  after: unknown,
): FieldDecision {
  return { field: spec.field, column: spec.column, action, reason, before, after, confidence: best.label, confidenceScore: best.score, fact: best.fact };
}

/**
 * Turns provider facts into per-field decisions. Pure: no I/O, no clock, so every rule is unit-testable.
 * Only "apply" decisions are ever written, and only high-confidence explicit facts reach "apply".
 */
export function decideFields(facts: Fact[], ctx: DecideContext): FieldDecision[] {
  const byField = new Map<string, Fact[]>();
  for (const f of facts) {
    const arr = byField.get(f.field) ?? [];
    arr.push(f);
    byField.set(f.field, arr);
  }

  const decisions: FieldDecision[] = [];

  for (const [field, group] of byField) {
    const spec = ctx.spec.fields.find((x) => x.field === field);
    if (!spec) continue;

    const coerced: Array<{ fact: Fact; value: unknown }> = [];
    for (const fact of group) {
      const c = coerceValue(spec, fact.value);
      if (c.ok && !isEmptyValue(c.value)) coerced.push({ fact, value: c.value });
    }
    if (!coerced.length) {
      const fact = group[0];
      decisions.push({
        field, column: spec.column, action: "skip", reason: "empty_value",
        before: ctx.row[spec.column], after: null, confidence: "low", confidenceScore: 0, fact,
      });
      continue;
    }

    const providersByValue = new Map<string, Set<string>>();
    for (const c of coerced) {
      const k = valueKey(c.value);
      const set = providersByValue.get(k) ?? new Set<string>();
      set.add(c.fact.provider);
      providersByValue.set(k, set);
    }

    const scored: Candidate[] = coerced.map((c) => {
      const s = scoreFact({
        fact: c.fact,
        identityScore: c.fact.identityScore ?? ctx.identityScore,
        corroboratingProviders: providersByValue.get(valueKey(c.value))?.size ?? 1,
      });
      return { fact: c.fact, value: c.value, score: s.score, label: s.label };
    });
    scored.sort((a, b) => b.score - a.score);
    const best = scored[0];

    const before = ctx.row[spec.column];
    const existingEmpty = isEmptyValue(before);
    const prov = ctx.provenance[spec.column] ?? ctx.provenance[spec.field];

    if (spec.contact && !ctx.allowContactLookups) {
      decisions.push(mk(spec, best, "skip", "contact_not_authorized: contact fields need --allow-contact-lookups", before, null));
      continue;
    }

    if (best.fact.kind === "inferred") {
      decisions.push(mk(spec, best, "review", "inferred_not_applied: inferred values are queued for review and never published as fact", before, best.value));
      continue;
    }

    if (best.label === "low") {
      decisions.push(mk(spec, best, "skip", "low_confidence", before, best.value));
      continue;
    }

    if (spec.reviewOnly) {
      decisions.push(mk(spec, best, "review", "enum_column_review_only: constrained or substantiation-sensitive column", before, best.value));
      continue;
    }

    if (existingEmpty) {
      if (best.label === "high") decisions.push(mk(spec, best, "apply", "fill_missing", before, best.value));
      else decisions.push(mk(spec, best, "review", "medium_confidence: not auto-applied", before, best.value));
      continue;
    }

    if (spec.multi) {
      const merged = mergeTextList(before, best.value, 100);
      if (sameValue(merged, before)) {
        decisions.push(mk(spec, best, "skip", "identical", before, before));
      } else if (best.label === "high") {
        decisions.push(mk(spec, best, "apply", "merge_multi_value: union with canonical dedupe, nothing removed", before, merged));
      } else {
        decisions.push(mk(spec, best, "review", "medium_confidence: not auto-applied", before, merged));
      }
      continue;
    }

    if (sameValue(before, best.value)) {
      decisions.push(mk(spec, best, "skip", "identical", before, before));
      continue;
    }

    const manual = isManualSource(prov?.sourcePlatform);
    if (manual) {
      decisions.push(mk(spec, best, "review", "manual_value_protected: existing value was set manually", before, best.value));
      continue;
    }

    if (best.label !== "high") {
      decisions.push(mk(spec, best, "review", "conflict_medium_confidence", before, best.value));
      continue;
    }

    if (MONOTONIC_UP.has(spec.field) && isForward(spec, before, best.value) && best.fact.verification !== "derived") {
      decisions.push(mk(spec, best, "apply", "current_state_correction: newer/larger verified value", before, best.value));
      continue;
    }

    const existingScore = prov?.confidenceScore ?? null;
    const refreshable = ctx.refreshableFields.has(spec.field);
    if (prov && existingScore !== null && existingScore < best.score && refreshable && !MONOTONIC_UP.has(spec.field)) {
      decisions.push(mk(spec, best, "apply", "more_authoritative: replaces lower-confidence automated value", before, best.value));
      continue;
    }

    if (ctx.forceRefresh && prov && !manual) {
      decisions.push(mk(spec, best, "apply", "force_refresh: authorised replacement of automated value", before, best.value));
      continue;
    }

    decisions.push(mk(spec, best, "review", prov ? "existing_more_authoritative_or_equal" : "conflict_unattributed_existing_value", before, best.value));
  }

  return enforceRoundCoherence(decisions);
}

function isForward(spec: FieldSpec, before: unknown, after: unknown): boolean {
  if (spec.type === "date") return String(after) > String(before);
  const b = typeof before === "number" ? before : Number.parseFloat(String(before));
  const a = typeof after === "number" ? after : Number.parseFloat(String(after));
  return Number.isFinite(a) && Number.isFinite(b) && a > b;
}

/**
 * Latest-round details (type, size, valuation) describe one round. They only replace existing values
 * when the same batch also moves last_round_date forward; otherwise a stale provider round would
 * overwrite a newer one.
 */
function enforceRoundCoherence(decisions: FieldDecision[]): FieldDecision[] {
  const date = decisions.find((d) => d.field === "last_round_date");
  const dateAdvances = date?.action === "apply";
  return decisions.map((d) => {
    if (!LATEST_ROUND_FOLLOWERS.has(d.field) || isEmptyValue(d.before)) return d;
    if (d.action === "apply" && !dateAdvances) {
      return { ...d, action: "review" as const, reason: "round_details_not_confirmed_by_newer_round_date" };
    }
    const upgradable = d.action === "review" && d.confidence === "high" && /^(conflict_unattributed|existing_more_authoritative)/.test(d.reason);
    if (upgradable && dateAdvances) {
      return { ...d, action: "apply" as const, reason: "current_state_correction: latest round advanced" };
    }
    return d;
  });
}

export function summarizeDecisions(decisions: FieldDecision[]): { apply: number; review: number; skip: number } {
  const out = { apply: 0, review: 0, skip: 0 };
  for (const d of decisions) out[d.action]++;
  return out;
}
