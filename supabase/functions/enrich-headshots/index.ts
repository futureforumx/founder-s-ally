/**
 * enrich-headshots — Supabase Edge Function
 *
 * Populates avatar_url for firm_investors by:
 *   1. Scraping the firm's team/people page (Firecrawl) → extracting
 *      name↔image mappings via DeepSeek (Gemini fallback)
 *   2. Falling back to Unavatar (LinkedIn → X → full name)
 *
 * Request body:
 *   { batchSize?: number, firmId?: string, forceRefresh?: boolean }
 *
 * Uses zero remote imports — Deno.serve() + raw fetch to Supabase REST API.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, " +
    "x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Supabase REST helpers (no SDK import needed)
// ---------------------------------------------------------------------------

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function supabaseSelect(table: string, select: string, filters: string = ""): Promise<any[]> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${encodeURIComponent(select)}${filters ? "&" + filters : ""}`;
  const r = await fetch(url, {
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
  });
  if (!r.ok) throw new Error(`SELECT ${table} failed: ${r.status} ${await r.text()}`);
  return r.json();
}

async function supabaseUpdate(table: string, id: string, data: Record<string, unknown>): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
  if (!r.ok) throw new Error(`UPDATE ${table} ${id} failed: ${r.status} ${await r.text()}`);
}

// ---------------------------------------------------------------------------
// Team page paths to try
// ---------------------------------------------------------------------------
const TEAM_PAGE_SUFFIXES = ["/people", "/team", "/about/team", "/about/people", "/about-us/team", "/our-team", "/who-we-are", "/partners", "/about"];

// ---------------------------------------------------------------------------
// Step 1: Scrape team page via Firecrawl
// ---------------------------------------------------------------------------

async function scrapeTeamPage(websiteUrl: string): Promise<string | null> {
  const FIRECRAWL_API_KEY = Deno.env.get("FIRECRAWL_API_KEY");
  if (!FIRECRAWL_API_KEY) return null;

  const base = websiteUrl.replace(/\/$/, "");

  for (const suffix of TEAM_PAGE_SUFFIXES) {
    const url = `${base}${suffix}`;
    try {
      const r = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url, formats: ["markdown", "html"], onlyMainContent: true, timeout: 30000, waitFor: 3000 }),
      });

      if (r.ok) {
        const data = await r.json();
        const md = (data.data?.markdown ?? data.markdown ?? "") as string;
        const html = (data.data?.html ?? data.html ?? "") as string;

        // Extract image URLs from HTML as a supplement
        const imgRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
        const imageUrls: string[] = [];
        let match;
        while ((match = imgRegex.exec(html)) !== null) {
          const src = match[1];
          if (src && !src.includes('logo') && !src.includes('icon') && !src.includes('favicon')) {
            imageUrls.push(src.startsWith('http') ? src : `${base}${src.startsWith('/') ? '' : '/'}${src}`);
          }
        }

        if (md.trim().length > 200 || imageUrls.length > 0) {
          const enriched = md + (imageUrls.length > 0 ? `\n\n--- EXTRACTED IMAGE URLS ---\n${imageUrls.join('\n')}` : '');
          console.log(`  ✓ Scraped team page: ${url} (${imageUrls.length} images found in HTML)`);
          return enriched;
        }
      }
    } catch { continue; }
  }

  console.log(`  ✗ No team page found for ${base}`);
  return null;
}

// ---------------------------------------------------------------------------
// Step 2: Extract name → avatar_url mapping via AI
// ---------------------------------------------------------------------------

interface HeadshotMapping { name: string; avatar_url: string; }

async function extractHeadshotsViaAI(firmName: string, markdown: string, investorNames: string[]): Promise<HeadshotMapping[]> {
  const prompt = `You are a data extraction specialist. I scraped the team/people page for the VC firm "${firmName}".

I need you to find headshot/profile image URLs for these specific people:
${investorNames.map((n) => `- ${n}`).join("\n")}

From the page content below, extract image URLs that are profile photos/headshots of the listed people.

Rules:
- Only return matches for the names I listed above
- Include any image URL that appears to be a headshot/profile photo (CDN URLs, URLs with query params, etc.)
- Match names fuzibly (e.g. "Bob Smith" matches "Robert Smith" or "Bob S.")
- If you find a relative URL like /images/bob.jpg, prepend the site domain
- Skip logos, icons, decorative images — only headshots
- Look for image URLs near person names in the content
- Check the EXTRACTED IMAGE URLS section at the bottom for additional image sources
- If no image is found for a person, omit them from the results

Return ONLY valid JSON with this shape (no markdown fences):
{
  "headshots": [
    { "name": "Full Name", "avatar_url": "https://..." }
  ]
}

--- PAGE CONTENT ---
${markdown.slice(0, 50000)}`;

  // Primary: DeepSeek (OpenAI-compatible, no quota issues)
  const deepseekKey = Deno.env.get("DEEPSEEK_API_KEY");
  if (deepseekKey) {
    try {
      const r = await fetch("https://api.deepseek.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${deepseekKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: "You extract structured data from web content. Always respond with valid JSON only." },
            { role: "user", content: prompt },
          ],
          temperature: 0.1,
          max_tokens: 4096,
          response_format: { type: "json_object" },
        }),
      });
      if (r.ok) {
        const data = await r.json();
        const text = data.choices?.[0]?.message?.content ?? "";
        console.log("  DeepSeek succeeded");
        return parseHeadshotResponse(text);
      } else {
        const errText = await r.text();
        console.error(`DeepSeek API error: ${r.status} ${errText}`);
      }
    } catch (e) { console.error("DeepSeek failed:", e); }
  }

  // Fallback: Gemini direct
  const geminiKey = Deno.env.get("GEMINI_API_KEY");
  if (geminiKey) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: "application/json" },
          }),
        }
      );
      const geminiData = await r.json();
      if (r.ok) {
        return parseHeadshotResponse(geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? "");
      } else {
        console.error(`Gemini API error: ${r.status}`, JSON.stringify(geminiData));
      }
    } catch (e) { console.error("Gemini direct failed:", e); }
  }

  return [];
}

function parseHeadshotResponse(text: string): HeadshotMapping[] {
  try {
    const cleaned = text.replace(/```json\s*/g, "").replace(/```\s*/g, "").trim();
    const parsed = JSON.parse(cleaned);
    const headshots = parsed.headshots ?? parsed.results ?? parsed;
    if (!Array.isArray(headshots)) return [];
    return headshots.filter(
      (h: any) => h.name && h.avatar_url && typeof h.avatar_url === "string" && h.avatar_url.startsWith("http")
    );
  } catch { return []; }
}

// ---------------------------------------------------------------------------
// Step 3: Unavatar fallback cascade
// ---------------------------------------------------------------------------

async function resolveViaUnavatar(investor: {
  full_name: string;
  linkedin_url?: string | null;
  x_url?: string | null;
  email?: string | null;
}): Promise<string | null> {
  const candidates: string[] = [];

  if (investor.linkedin_url) candidates.push(`https://unavatar.io/${encodeURIComponent(investor.linkedin_url)}`);

  if (investor.x_url) {
    const handle = investor.x_url.split("/").filter(Boolean).pop()?.replace("@", "");
    if (handle) candidates.push(`https://unavatar.io/x/${encodeURIComponent(handle)}`);
  }

  candidates.push(`https://unavatar.io/${encodeURIComponent(investor.full_name)}`);

  if (investor.email) candidates.push(`https://unavatar.io/${encodeURIComponent(investor.email)}`);

  for (const url of candidates) {
    try {
      const resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
      if (resp.ok) {
        const ct = resp.headers.get("content-type") || "";
        if (ct.startsWith("image/")) {
          const cl = parseInt(resp.headers.get("content-length") || "0", 10);
          if (cl > 1000) return url;
        }
      }
    } catch { /* skip */ }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Step 4: Validate image URL
// ---------------------------------------------------------------------------

async function validateImageUrl(url: string): Promise<boolean> {
  try {
    const resp = await fetch(url, { method: "HEAD", redirect: "follow", signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return false;
    return (resp.headers.get("content-type") || "").startsWith("image/");
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// Name matching
// ---------------------------------------------------------------------------

function normalizeName(name: string): string { return name.toLowerCase().replace(/[^a-z]/g, ""); }

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a), nb = normalizeName(b);
  if (na === nb) return true;
  if (na.length > 3 && nb.length > 3) return na.includes(nb) || nb.includes(na);
  return false;
}

// ---------------------------------------------------------------------------
// Main handler — Deno.serve (built-in, no import)
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

  try {
    const body = await req.json().catch(() => ({}));
    const batchSize = Math.min(body.batchSize ?? 50, 200);
    const firmId: string | null = body.firmId ?? null;
    const forceRefresh: boolean = body.forceRefresh ?? false;

    console.log(`enrich-headshots: batchSize=${batchSize}, firmId=${firmId ?? "all"}, forceRefresh=${forceRefresh}`);

    // 1. Fetch investors needing headshots + their firm's website_url
    let filters = "deleted_at=is.null&order=updated_at.asc&limit=" + batchSize;
    if (!forceRefresh) filters += "&avatar_url=is.null";
    if (firmId) filters += `&firm_id=eq.${firmId}`;

    const investors = await supabaseSelect(
      "firm_investors",
      "id,full_name,first_name,last_name,linkedin_url,x_url,email,avatar_url,firm_id",
      filters
    );

    if (!investors || investors.length === 0) {
      return json({ message: "No investors need headshots", updated: 0, processed: 0 });
    }

    console.log(`Found ${investors.length} investors needing headshots`);

    // 2. Get unique firm IDs and fetch firm details
    const firmIds = [...new Set(investors.map((i: any) => i.firm_id))];
    const firms = await supabaseSelect(
      "firm_records",
      "id,firm_name,website_url",
      `id=in.(${firmIds.join(",")})`
    );
    const firmMap = new Map(firms.map((f: any) => [f.id, f]));

    // 3. Group investors by firm
    const firmGroups = new Map<string, { firmName: string; websiteUrl: string | null; investors: any[] }>();
    for (const inv of investors) {
      const firm = firmMap.get(inv.firm_id);
      if (!firmGroups.has(inv.firm_id)) {
        firmGroups.set(inv.firm_id, {
          firmName: firm?.firm_name ?? "Unknown",
          websiteUrl: firm?.website_url ?? null,
          investors: [],
        });
      }
      firmGroups.get(inv.firm_id)!.investors.push(inv);
    }

    console.log(`Grouped into ${firmGroups.size} firms`);

    // 4. Process each firm
    let updated = 0, scraped = 0, unavatarResolved = 0, failed = 0;
    const errors: string[] = [];

    for (const [_fid, group] of firmGroups) {
      console.log(`\n--- ${group.firmName} (${group.investors.length} investors) ---`);

      const remaining = new Map<string, any>();
      for (const inv of group.investors) remaining.set(inv.id, inv);

      // Step A: Try scraping the firm's team page
      if (group.websiteUrl) {
        const markdown = await scrapeTeamPage(group.websiteUrl);

        if (markdown) {
          const names = group.investors.map((i: any) => i.full_name);
          const mappings = await extractHeadshotsViaAI(group.firmName, markdown, names);

          console.log(`  AI extracted ${mappings.length} headshot mappings`);

          for (const mapping of mappings) {
            const match = group.investors.find((inv: any) => namesMatch(inv.full_name, mapping.name));
            if (!match) continue;

            const valid = await validateImageUrl(mapping.avatar_url);
            if (!valid) { console.log(`  ✗ Invalid image: ${mapping.name}`); continue; }

            try {
              await supabaseUpdate("firm_investors", match.id, { avatar_url: mapping.avatar_url });
              updated++; scraped++; remaining.delete(match.id);
              console.log(`  ✓ [website] ${match.full_name}`);
            } catch (e: any) {
              errors.push(`${match.full_name}: ${e.message}`);
              failed++;
            }
          }
        }
      }

      // Step B: Unavatar fallback
      for (const [invId, inv] of remaining) {
        const avatarUrl = await resolveViaUnavatar(inv);

        if (avatarUrl) {
          try {
            await supabaseUpdate("firm_investors", invId, { avatar_url: avatarUrl });
            updated++; unavatarResolved++;
            console.log(`  ✓ [unavatar] ${inv.full_name}`);
          } catch (e: any) {
            errors.push(`${inv.full_name}: ${e.message}`);
            failed++;
          }
        } else {
          failed++;
          console.log(`  ✗ No headshot: ${inv.full_name}`);
        }

        await new Promise((r) => setTimeout(r, 200));
      }
    }

    const result = {
      processed: investors.length,
      updated,
      sources: { website_scrape: scraped, unavatar: unavatarResolved },
      failed,
      errors: errors.slice(0, 10),
    };

    console.log(`\n=== Done ===`, JSON.stringify(result));
    return json(result);
  } catch (e) {
    console.error("enrich-headshots error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
