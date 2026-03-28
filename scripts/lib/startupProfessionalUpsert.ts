/**
 * @deprecated Use `startupProfessionalMerge.mergeStartupProfessional` for idempotent ingest.
 * Re-exports normalizers used by seed scripts.
 */

export {
  mergeStartupProfessional,
  normalizePersonName,
  normalizeStartupName,
  normLinkedin,
  splitFullName,
  SOURCE_PRIORITY,
  type ProfessionalIngestPayload,
  type MergeResult,
  type ProfessionalSource,
} from "./startupProfessionalMerge";
