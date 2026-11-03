import { normalizeSourceRecord } from "./normalize";
import { resolveEntity } from "./matching";
import { validateEntity } from "./validate";
import type { MatchCandidate, NormalizedMarketEntity, SourceRecord, ValidationIssue } from "./types";

export interface PipelineOutput {
  source: SourceRecord;
  normalized: NormalizedMarketEntity;
  validation: ValidationIssue[];
  match: ReturnType<typeof resolveEntity>;
  status: "staged" | "quarantined";
}

export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function processSourceRecord(source: SourceRecord, candidates: MatchCandidate[] = []): Promise<PipelineOutput> {
  const payloadHash = source.payloadHash || await sha256(source.payload);
  const completeSource = { ...source, payloadHash };
  const normalized = normalizeSourceRecord(completeSource);
  const validation = validateEntity(normalized);
  const match = resolveEntity(normalized, candidates);
  const hasBlockingError = validation.some((issue) => issue.severity === "error");
  return { source: completeSource, normalized, validation, match, status: hasBlockingError ? "quarantined" : "staged" };
}
