import { z } from "zod";
import type { ExtractedDeal } from "./types.js";

const DealSchema = z.object({
  company_name: z.string().nullable().optional(),
  company_website: z.string().nullable().optional(),
  company_hq: z.string().nullable().optional(),
  round_type_raw: z.string().nullable().optional(),
  amount_raw: z.string().nullable().optional(),
  currency: z.string().nullable().optional(),
  announced_date_iso: z.string().nullable().optional(),
  sector_raw: z.string().nullable().optional(),
  founders_mentioned: z.array(z.string()).optional(),
  existing_investors_mentioned: z.array(z.string()).optional(),
  deal_summary: z.string().nullable().optional(),
  lead_investors: z.array(z.string()).optional(),
  participating_investors: z.array(z.string()).optional(),
  extraction_confidence: z.number().min(0).max(1).optional(),
});

export async function extractWithOpenAI(title: string, articleText: string): Promise<Partial<ExtractedDeal> | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const sys =
    "You extract structured startup funding data from a news article. Return ONLY valid JSON matching the schema keys. Use null when unknown. Dates as ISO-8601 date (YYYY-MM-DD) or null.";

  const user = JSON.stringify({
    title,
    article_excerpt: articleText.slice(0, 14_000),
    output_keys: [
      "company_name",
      "company_website",
      "company_hq",
      "round_type_raw",
      "amount_raw",
      "currency",
      "announced_date_iso",
      "sector_raw",
      "founders_mentioned",
      "existing_investors_mentioned",
      "deal_summary",
      "lead_investors",
      "participating_investors",
      "extraction_confidence",
    ],
  });

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
    }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(`OpenAI HTTP ${res.status}: ${t.slice(0, 500)}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const d = DealSchema.safeParse(parsed);
  if (!d.success) return null;
  const v = d.data;
  const announced =
    v.announced_date_iso && /^\d{4}-\d{2}-\d{2}$/.test(v.announced_date_iso) ? new Date(`${v.announced_date_iso}T12:00:00Z`) : null;

  return {
    company_name: v.company_name ?? null,
    company_website: v.company_website ?? null,
    company_hq: v.company_hq ?? null,
    round_type_raw: v.round_type_raw ?? null,
    amount_raw: v.amount_raw ?? null,
    currency: v.currency ?? "USD",
    announced_date: announced,
    sector_raw: v.sector_raw ?? null,
    founders_mentioned: v.founders_mentioned ?? [],
    existing_investors_mentioned: v.existing_investors_mentioned ?? [],
    deal_summary: v.deal_summary ?? null,
    lead_investors: v.lead_investors ?? [],
    participating_investors: v.participating_investors ?? [],
    extraction_confidence: v.extraction_confidence ?? 0.75,
  };
}
