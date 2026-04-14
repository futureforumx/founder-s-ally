/**
 * Persist `firm_records.elevator_pitch` when missing: description excerpt → sentiment snippet
 * → deterministic thesis line → Lovable AI (JSON).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdminForMirror } from "./_mirrorFirmInvestorHeadshots.js";

const MAX = 200;

function clampPitch(text: string): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= MAX) return t;
  const cut = t.slice(0, MAX);
  const lastSpace = cut.lastIndexOf(" ");
  const base = lastSpace > MAX * 0.55 ? cut.slice(0, lastSpace) : cut;
  return `${base.trimEnd()}…`;
}

function excerptFromDescription(desc: string | null | undefined): string | null {
  const d = (desc ?? "").trim();
  if (d.length < 50) return null;
  const sentenceEnd = d.search(/[.!?]\s/);
  if (sentenceEnd > 0 && sentenceEnd <= 220) {
    return clampPitch(d.slice(0, sentenceEnd + 1));
  }
  return clampPitch(d);
}

function deterministicPitch(row: Record<string, unknown>): string | null {
  const name = String(row.firm_name ?? "").trim();
  if (!name) return null;
  const tv = ((row.thesis_verticals as string[]) ?? []).filter(Boolean).slice(0, 5);
  const stage = String(row.preferred_stage ?? "").trim();
  let line: string | null = null;
  if (tv.length > 0 && stage) {
    line = `${name}: ${stage} investor focused on ${tv.join(", ")}.`;
  } else if (tv.length > 0) {
    line = `${name} focuses on ${tv.join(", ")}.`;
  } else if (stage) {
    line = `${name} is a ${stage} investment firm.`;
  }
  if (!line) return null;
  return clampPitch(line);
}

async function generatePitchWithLovable(row: Record<string, unknown>): Promise<string | null> {
  const key = (process.env.LOVABLE_API_KEY ?? "").trim();
  if (!key) return null;

  const thesis = ((row.thesis_verticals as string[]) ?? []).filter(Boolean).slice(0, 8).join(", ");
  const user = [
    "Write exactly one elevator pitch line for this VC or investment firm.",
    "Max 200 characters. No quotation marks. Do not say you are an AI.",
    `Firm: ${String(row.firm_name ?? "Fund")}`,
    row.website_url ? `Website: ${String(row.website_url)}` : "",
    row.preferred_stage ? `Stage: ${String(row.preferred_stage)}` : "",
    thesis ? `Thesis / sectors: ${thesis}` : "",
    [row.hq_city, row.hq_state, row.hq_country].filter(Boolean).join(", ")
      ? `HQ: ${[row.hq_city, row.hq_state, row.hq_country].filter(Boolean).join(", ")}`
      : "",
    typeof row.description === "string" && row.description.trim().length > 0
      ? `Notes: ${row.description.trim().slice(0, 400)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-lite",
      messages: [
        {
          role: "system",
          content: 'Respond as JSON only: {"pitch":"..."} where pitch is at most 200 characters.',
        },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.35,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = data?.choices?.[0]?.message?.content ?? "{}";
  try {
    const parsed = JSON.parse(raw) as { pitch?: string };
    const p = typeof parsed.pitch === "string" ? clampPitch(parsed.pitch) : null;
    return p && p.length >= 12 ? p : null;
  } catch {
    return null;
  }
}

export type EnsureElevatorPitchResult = {
  ok: boolean;
  updated: boolean;
  firmRecordId: string;
  source?: string;
  message?: string;
};

export async function ensureFirmElevatorPitchSaved(
  admin: SupabaseClient,
  firmRecordId: string,
): Promise<EnsureElevatorPitchResult> {
  const base: EnsureElevatorPitchResult = {
    ok: true,
    updated: false,
    firmRecordId,
  };

  const { data: row, error } = await admin
    .from("firm_records")
    .select(
      "id,firm_name,description,sentiment_detail,elevator_pitch,website_url,preferred_stage,thesis_verticals,stage_focus,hq_city,hq_state,hq_country",
    )
    .eq("id", firmRecordId)
    .maybeSingle();

  if (error) return { ...base, ok: false, message: error.message };
  if (!row) return { ...base, ok: false, message: "Firm not found" };

  const r = row as Record<string, unknown>;
  const existing = String(r.elevator_pitch ?? "").trim();
  if (existing.length >= 15) {
    return { ...base, source: "already_set" };
  }

  const excerpt = excerptFromDescription(typeof r.description === "string" ? r.description : null);
  if (excerpt) {
    await admin
      .from("firm_records")
      .update({ elevator_pitch: excerpt, updated_at: new Date().toISOString() })
      .eq("id", firmRecordId);
    return { ...base, updated: true, source: "description_excerpt" };
  }

  const sent = String(r.sentiment_detail ?? "").trim();
  if (sent.length >= 45) {
    const pitch = clampPitch(sent);
    await admin
      .from("firm_records")
      .update({ elevator_pitch: pitch, updated_at: new Date().toISOString() })
      .eq("id", firmRecordId);
    return { ...base, updated: true, source: "sentiment_detail" };
  }

  const det = deterministicPitch(r);
  if (det) {
    await admin
      .from("firm_records")
      .update({ elevator_pitch: det, updated_at: new Date().toISOString() })
      .eq("id", firmRecordId);
    return { ...base, updated: true, source: "deterministic_thesis" };
  }

  const ai = await generatePitchWithLovable(r);
  if (!ai) {
    return {
      ...base,
      source: "no_pitch_generated",
      message: "LOVABLE_API_KEY missing or not enough firm context for AI pitch",
    };
  }

  await admin
    .from("firm_records")
    .update({ elevator_pitch: ai, updated_at: new Date().toISOString() })
    .eq("id", firmRecordId);
  return { ...base, updated: true, source: "ai" };
}

export function supabaseAdminForElevatorPitch(): SupabaseClient | null {
  return supabaseAdminForMirror();
}
