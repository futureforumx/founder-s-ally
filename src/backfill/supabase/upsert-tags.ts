/**
 * supabase/upsert-tags.ts — Write firm_tags + firm_tag_links idempotently.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Logger, SourceName } from "../types";

export type TagNamespace = "theme" | "sector" | "stage_initial" | "stage_followon" | "geo";

export interface TagInput {
  firmId: string;
  namespace: TagNamespace;
  values: string[];
  source: SourceName;
  confidence?: number;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export async function upsertTags(
  db: SupabaseClient,
  input: TagInput,
  opts: { dryRun?: boolean; logger?: Logger } = {},
): Promise<{ tagIds: string[] }> {
  const values = [...new Set(input.values.map((v) => v.trim()).filter(Boolean))];
  if (!values.length) return { tagIds: [] };

  if (opts.dryRun) {
    opts.logger?.info("upsert.tags.dry", { firm_id: input.firmId, ns: input.namespace, count: values.length });
    return { tagIds: [] };
  }

  // 1) Upsert tag rows — onConflict on (namespace, slug) to merge casing variants
  //    ("Fintech", "fintech", "FinTech") into one row.
  const tagRows = values.map((v) => ({
    namespace: input.namespace,
    value:     v,
    slug:      slugify(v),
  }));

  const { data: tagData, error: tagErr } = await db
    .from("firm_tags")
    .upsert(tagRows, { onConflict: "namespace,slug", ignoreDuplicates: false })
    .select("id, value, slug");

  if (tagErr) {
    opts.logger?.error("upsert.tags.tag_row_failed", { err: tagErr.message });
    throw tagErr;
  }

  const tagIds = (tagData ?? []).map((r: { id: string }) => r.id);
  if (!tagIds.length) return { tagIds: [] };

  // 2) Upsert links — update source+confidence on conflict so re-runs refresh
  //    the provenance/confidence of existing tag↔firm pairs.
  const linkRows = (tagData ?? []).map((tag: { id: string }) => ({
    firm_id:    input.firmId,
    tag_id:     tag.id,
    namespace:  input.namespace,
    source:     input.source,
    confidence: input.confidence ?? 0.7,
  }));

  const { error: linkErr } = await db
    .from("firm_tag_links")
    .upsert(linkRows, { onConflict: "firm_id,tag_id", ignoreDuplicates: false });

  if (linkErr) {
    opts.logger?.error("upsert.tags.link_failed", { err: linkErr.message });
    throw linkErr;
  }

  return { tagIds };
}
