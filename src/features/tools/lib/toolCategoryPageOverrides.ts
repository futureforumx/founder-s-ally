import { supabasePublicDirectory, isSupabaseConfigured } from "@/integrations/supabase/client";
import type { ToolCategory } from "@/features/tools/types";
import { TOOL_CATEGORY_INTROS } from "@/features/tools/lib/tools";

export type ToolCategoryPageOverrideRow = {
  category_slug: string;
  title: string | null;
  description: string | null;
  meta: string | null;
  updated_at: string;
};

export async function fetchToolCategoryPageOverride(categorySlug: string): Promise<ToolCategoryPageOverrideRow | null> {
  if (!isSupabaseConfigured) return null;
  const { data, error } = await supabasePublicDirectory
    .from("tool_category_page_overrides")
    .select("category_slug, title, description, meta, updated_at")
    .eq("category_slug", categorySlug)
    .maybeSingle();
  if (error) {
    if (import.meta.env.DEV) console.warn("[toolCategoryPageOverrides]", error.message);
    return null;
  }
  return data as ToolCategoryPageOverrideRow | null;
}

export function mergeToolCategoryIntro(
  category: ToolCategory,
  row: Pick<ToolCategoryPageOverrideRow, "title" | "description" | "meta"> | null,
): { title: string; description: string; meta: string } {
  const base = TOOL_CATEGORY_INTROS[category];
  if (!row) return base;
  return {
    title: row.title?.trim() || base.title,
    description: row.description?.trim() || base.description,
    meta: row.meta?.trim() || base.meta,
  };
}
