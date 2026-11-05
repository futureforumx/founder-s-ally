import { createClient } from '@supabase/supabase-js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
if (!SUPABASE_URL || !SERVICE_KEY || !FIRECRAWL_API_KEY) throw new Error('Supabase or Firecrawl cloud secrets are missing.');

const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const LIMIT = Math.max(1, Math.min(100, Number(process.env.PITCHBOOK_BATCH_SIZE || 25)));
const DRY_RUN = process.env.PITCHBOOK_DRY_RUN === '1';
const STALE_RUN_PREFIX = 'pitchbook-full-v1';
const PAUSE_MS = 1400;
const FIRECRAWL_API = 'https://api.firecrawl.dev/v2';
const STATE_NAMES = {
  AL:'Alabama',AK:'Alaska',AZ:'Arizona',AR:'Arkansas',CA:'California',CO:'Colorado',CT:'Connecticut',DE:'Delaware',FL:'Florida',GA:'Georgia',HI:'Hawaii',ID:'Idaho',IL:'Illinois',IN:'Indiana',IA:'Iowa',KS:'Kansas',KY:'Kentucky',LA:'Louisiana',ME:'Maine',MD:'Maryland',MA:'Massachusetts',MI:'Michigan',MN:'Minnesota',MS:'Mississippi',MO:'Missouri',MT:'Montana',NE:'Nebraska',NV:'Nevada',NH:'New Hampshire',NJ:'New Jersey',NM:'New Mexico',NY:'New York',NC:'North Carolina',ND:'North Dakota',OH:'Ohio',OK:'Oklahoma',OR:'Oregon',PA:'Pennsylvania',RI:'Rhode Island',SC:'South Carolina',SD:'South Dakota',TN:'Tennessee',TX:'Texas',UT:'Utah',VT:'Vermont',VA:'Virginia',WA:'Washington',WV:'West Virginia',WI:'Wisconsin',WY:'Wyoming',DC:'District of Columbia'
};
const csvPath = resolve(process.cwd(), 'scripts/data/top_200_vc_firms_pitchbook_profiles.csv');
let firmCsvProfiles = new Map();

function parseCsvLine(line) {
  const fields = []; let value = '', quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && quoted && line[i + 1] === '"') { value += '"'; i++; }
    else if (c === '"') quoted = !quoted;
    else if (c === ',' && !quoted) { fields.push(value); value = ''; }
    else value += c;
  }
  fields.push(value);
  return fields;
}

async function loadFirmCsvProfiles() {
  try {
    const lines = (await readFile(csvPath, 'utf8')).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) return;
    const headers = parseCsvLine(lines[0]);
    const nameIndex = headers.indexOf('VC Firm');
    const urlIndex = headers.indexOf('PitchBook Profile Preview URL');
    if (nameIndex < 0 || urlIndex < 0) return;
    for (const line of lines.slice(1)) {
      const fields = parseCsvLine(line);
      const name = clean(fields[nameIndex]); const url = clean(fields[urlIndex]);
      if (name && /^https:\/\/pitchbook\.com\/profiles\/investor\//i.test(url)) firmCsvProfiles.set(norm(name), url);
    }
  } catch { /* The database-linked firm URL remains the source when the CSV is absent. */ }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const norm = (s) => clean(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const isBlank = (v) => v === null || v === undefined || v === '';

async function firecrawl(endpoint, payload) {
  const response = await fetch(`${FIRECRAWL_API}/${endpoint}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${FIRECRAWL_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90000),
  });
  const result = await response.json().catch(() => ({}));
  if ([402, 403, 429, 503].includes(response.status)) throw new Error(`PITCHBOOK_RATE_LIMIT: Firecrawl returned ${response.status}`);
  if (!response.ok || result.success === false) throw new Error(`Firecrawl ${endpoint} failed (${response.status}): ${String(result.error || result.message || 'unknown error').slice(0, 250)}`);
  return result;
}

function normalizeMarkdown(markdown) {
  return String(markdown || '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/^\s*[-*]\s*/gm, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^\s*(Year Founded|Employees|Professionals|Portfolio|Exits)\s*-\s*(.+)\s*$/gim, '$1\n$2')
    .replace(/^\s*\|.*\|\s*$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseFacts(text) {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean);
  const next = (label) => {
    const i = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
    return i >= 0 ? lines[i + 1] : '';
  };
  const section = (startLabel, endLabel) => {
    const start = lines.findIndex((line) => line.toLowerCase() === startLabel.toLowerCase());
    if (start < 0) return '';
    const end = lines.findIndex((line, i) => i > start && line.toLowerCase() === endLabel.toLowerCase());
    return lines.slice(start + 1, end < 0 ? start + 8 : end).join(' ').trim();
  };
  const description = section('Description', 'Contact Information') || section('Company Description', 'Business Details');
  const faqHQ = text.match(/is headquartered in ([^.\n]+)\./i)?.[1] || '';
  const officeIndex = lines.findIndex((line) => line === 'Corporate Office');
  const office = officeIndex >= 0 ? lines.slice(officeIndex + 1, officeIndex + 9).join('\n') : '';
  const locationText = clean(faqHQ) || office;
  const hq = parseHQ(locationText, office);
  const website = next('Website').replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '').toLowerCase();
  const founded = Number(next('Year Founded'));
  const employees = Number(next('Employees'));
  const professionals = Number(next('Professionals'));
  const portfolio = Number(next('Portfolio'));
  const exits = Number(next('Exits'));
  const dateToken = text.match(/latest investment was on\s+(\d{2}-[A-Za-z]{3}-\d{4})/i)?.[1];
  const latestDate = dateToken ? parsePitchBookDate(dateToken) : null;
  const primaryIndustry = next('Primary Industry');
  const verticalLine = next('Vertical(s)');
  const verticals = verticalLine ? verticalLine.split(/,\s*/).map(clean).filter(Boolean) : [];
  return {
    lines, description,
    founded: Number.isInteger(founded) && founded > 1800 && founded <= new Date().getUTCFullYear() ? founded : null,
    employees: Number.isInteger(employees) && employees >= 0 ? employees : null,
    professionals: Number.isInteger(professionals) && professionals >= 0 ? professionals : null,
    portfolio: Number.isInteger(portfolio) && portfolio >= 0 ? portfolio : null,
    exits: Number.isInteger(exits) && exits >= 0 ? exits : null,
    latestDate,
    primaryIndustry: primaryIndustry || null,
    verticals,
    hq,
    website,
  };
}

function parsePitchBookDate(value) {
  const d = new Date(`${value.slice(0, 2)} ${value.slice(3, 6)} ${value.slice(7)} UTC`);
  if (Number.isNaN(d.getTime())) return null;
  const iso = d.toISOString().slice(0, 10);
  return iso <= new Date().toISOString().slice(0, 10) ? iso : null;
}

function parseHQ(headline, officeBlock) {
  const candidates = [headline, ...officeBlock.split('\n')].map(clean).filter(Boolean);
  let city = null, state = null, country = null;
  for (const line of candidates) {
    if (/United States|USA\b/i.test(line)) country = 'United States';
    else if (/United Kingdom|England\b/i.test(line)) country = 'United Kingdom';
    else if (/Canada\b/i.test(line)) country = 'Canada';
    else if (/Israel\b/i.test(line)) country = 'Israel';
    else if (/Germany\b/i.test(line)) country = 'Germany';
    else if (/France\b/i.test(line)) country = 'France';
    else if (/India\b/i.test(line)) country = 'India';
    else if (/Singapore\b/i.test(line)) country = 'Singapore';
    else if (/Japan\b/i.test(line)) country = 'Japan';
    else if (/China\b/i.test(line)) country = 'China';
    else if (/Netherlands\b/i.test(line)) country = 'Netherlands';
    const us = line.match(/^(.+?),\s*([A-Z]{2})(?:\s+\d{5}(?:-\d{4})?)?$/);
    if (us && STATE_NAMES[us[2]]) { city = clean(us[1]); state = STATE_NAMES[us[2]]; country ||= 'United States'; }
    const fullState = line.match(/^(.+?),\s*(California|New York|Massachusetts|Texas|Washington|Colorado|Florida|Illinois|Georgia|Virginia|Oregon|Pennsylvania|Ohio|Michigan|North Carolina|New Jersey|Utah|Arizona|Nevada|Maryland|Connecticut|Tennessee|Minnesota|Missouri|Indiana|Wisconsin)(?:\s+\d{5}(?:-\d{4})?)?$/i);
    if (fullState) { city = clean(fullState[1]); state = fullState[2]; country ||= 'United States'; }
  }
  if (!city && headline) {
    const parts = headline.split(',').map(clean);
    if (parts.length >= 2) {
      city = parts[0];
      if (/United States|United Kingdom|Canada|Israel|Germany|France|India|Singapore|Japan|China|Netherlands/i.test(parts[1])) country ||= parts[1];
    }
  }
  return { city, state, country };
}

function profileMatches(record, header, body, facts, kind) {
  const recordName = norm(kind === 'person' ? record.full_name : (record.firm_name || record.company_name));
  const profileName = norm(header);
  const bodyNorm = norm(body);
  if (!recordName || !(profileName.includes(recordName) || recordName.includes(profileName) || bodyNorm.includes(recordName))) return false;
  const existingUrl = kind === 'startup'
    ? record.external_ids?.pitchbook_url || record.external_ids?.pitchbook_profile_url
    : record.pitchbook_url;
  if (existingUrl) return true; // Existing PitchBook URL + exact displayed name is an established match.
  if (kind === 'person') {
    const firmContext = norm(record.firm_name);
    return Boolean(profileName === recordName && (bodyNorm.includes('investor') || bodyNorm.includes('investment')) && (!firmContext || bodyNorm.includes(firmContext)));
  }
  const expected = (record.domain || record.website_url || record.company_url || '').toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
  return Boolean(expected && facts.website && (facts.website === expected || facts.website.endsWith(`.${expected}`)));
}

async function discoverProfile(record, kind) {
  const profileType = kind === 'startup' ? 'company' : kind === 'person' ? 'person' : 'investor';
  const name = kind === 'person' ? record.full_name : (record.firm_name || record.company_name);
  const domain = record.domain || record.website_url || record.company_url || '';
  const context = kind === 'person' ? record.firm_name : domain.replace(/^https?:\/\//, '').split('/')[0];
  const query = `site:pitchbook.com/profiles/${profileType} "${name}" ${context ? `"${context}"` : ''}`;
  const result = await firecrawl('search', { query, limit: 5, sources: [{ type: 'web' }], includeDomains: ['pitchbook.com'], timeout: 60000 });
  const links = (result.data?.web || []).map((item) => item.url).filter((url) => {
    try { const parsed = new URL(url); return parsed.hostname === 'pitchbook.com' && parsed.pathname.startsWith(`/profiles/${profileType}/`); }
    catch { return false; }
  });
  return [...new Set(links)].slice(0, 3);
}

async function loadProfile(record, kind, directUrl) {
  const urls = directUrl ? [directUrl] : await discoverProfile(record, kind);
  if (!urls.length) return { outcome: 'no_profile' };
  let sawAmbiguous = false;
  for (const url of urls) {
    const result = await firecrawl('scrape', { url, formats: ['markdown'], onlyMainContent: true, maxAge: 0, timeout: 60000 });
    const rawBody = result.data?.markdown || '';
    const body = normalizeMarkdown(rawBody);
    const status = result.data?.metadata?.statusCode;
    if (status === 429 || /Performing security verification|Just a moment\.\.\./i.test(result.data?.metadata?.title || '')) return { outcome: 'rate_limited' };
    if (!body || status >= 400) continue;
    const header = clean(rawBody.match(/^\s*#\s+(.+)$/m)?.[1] || result.data?.metadata?.title || '').replace(/\s+\|.*$/, '');
    const facts = parseFacts(body);
    if (!profileMatches(record, header, body, facts, kind)) { sawAmbiguous = true; continue; }
    return { outcome: 'matched', url: url.split('#')[0], header, body, facts };
  }
  return { outcome: sawAmbiguous ? 'ambiguous' : 'no_profile' };
}

async function getCheckpoint(runId, entityType) {
  const { data, error } = await db.from('enrichment_scrape_checkpoints').select('*').eq('run_id', runId).eq('entity_type', entityType).eq('source_platform', 'pitchbook').order('updated_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (data) return data;
  if (DRY_RUN) return { id: null, run_id: runId, source_platform: 'pitchbook', entity_type: entityType, last_entity_id: '', status: 'in_progress', metadata: {} };
  const { data: created, error: insertError } = await db.from('enrichment_scrape_checkpoints').insert({ run_id: runId, source_platform: 'pitchbook', entity_type: entityType, last_entity_id: '', status: 'in_progress', metadata: {} }).select('*').single();
  if (insertError) throw insertError;
  return created;
}

async function saveCheckpoint(cp, fields) {
  if (DRY_RUN) return;
  const { error } = await db.from('enrichment_scrape_checkpoints').update({ ...fields, updated_at: new Date().toISOString() }).eq('id', cp.id);
  if (error) throw error;
}

async function provenance(entityType, entityId, field, newValue, sourceUrl, snippet, matchMethod) {
  if (DRY_RUN) return;
  const { error } = await db.from('enrichment_field_provenance').insert({
    entity_type: entityType, entity_id: String(entityId), field_name: field,
    old_value: null, new_value: typeof newValue === 'string' ? newValue : JSON.stringify(newValue),
    source_platform: 'pitchbook', source_url: sourceUrl, confidence_score: 0.99,
    extraction_method: 'firecrawl_api_public_profile_preview', match_method: matchMethod,
    reviewer_required: false, raw_snippet: clean(snippet).slice(0, 500), auto_applied: !DRY_RUN,
  });
  if (error) console.error('provenance_insert_failed', error.message);
}

async function guardedPatch(table, id, field, value) {
  if (DRY_RUN) return true;
  const query = db.from(table).update({ [field]: value }).eq('id', id).is('deleted_at', null).is(field, null).select('id').maybeSingle();
  const { data, error } = await query;
  if (error) throw error;
  return Boolean(data?.id);
}

async function updateFirm(record, profile, matchMethod) {
  const { facts, body, url } = profile;
  const updates = {
    description: facts.description || null,
    founded_year: facts.founded,
    hq_city: facts.hq.city,
    hq_state: facts.hq.state,
    hq_country: facts.hq.country,
    investing_team_count: facts.professionals,
    active_portfolio_count: facts.portfolio,
    exited_portfolio_count: facts.exits,
    most_recent_investment_date: facts.latestDate,
  };
  let writes = 0;
  for (const [field, value] of Object.entries(updates)) {
    if (isBlank(record[field]) && !isBlank(value)) {
      const ok = await guardedPatch('firm_records', record.id, field, value);
      if (ok) { writes++; await provenance('firm', record.id, field, value, url, facts.description || body.slice(0, 500), matchMethod); }
    }
  }
  if (!record.pitchbook_url && !DRY_RUN) {
    const { error } = await db.from('firm_records').update({ pitchbook_url: url }).eq('id', record.id).is('deleted_at', null).is('pitchbook_url', null);
    if (!error) writes++;
  }
  return writes;
}

async function updateStartup(record, profile) {
  const { facts, body, url } = profile;
  const updates = {
    description_long: facts.description || null,
    founded_year: facts.founded,
    headcount: facts.employees,
    hq_city: facts.hq.city,
    hq_state: facts.hq.state,
    hq_country: facts.hq.country,
    sector: facts.primaryIndustry,
    industry_verticals: facts.verticals.length ? facts.verticals : null,
  };
  let writes = 0;
  for (const [field, value] of Object.entries(updates)) {
    if (isBlank(record[field]) && !isBlank(value)) {
      const ok = await guardedPatch('startups', record.id, field, value);
      if (ok) { writes++; await provenance('firm', record.id, field, value, url, facts.description || body.slice(0, 500), 'existing_pitchbook_profile_url_and_exact_name'); }
    }
  }
  if (!DRY_RUN) {
    const externalIds = { ...(record.external_ids || {}) };
    externalIds.pitchbook_url = url;
    externalIds.pitchbook_profile_id = url.match(/profiles\/company\/([^/?#]+)/)?.[1] || null;
    if (JSON.stringify(externalIds) !== JSON.stringify(record.external_ids || {})) {
      const { error } = await db.from('startups').update({ external_ids: externalIds }).eq('id', record.id).is('deleted_at', null);
      if (!error) writes++;
    }
  }
  console.log('startup_evidence', JSON.stringify({ name: record.company_name, url, snippet: clean(facts.description || body.slice(0, 350)) }));
  return writes;
}

async function updatePerson(record, profile, matchMethod) {
  const { body, url } = profile;
  const lines = body.split(/\r?\n/).map(clean).filter(Boolean);
  let bio = '';
  for (const label of ['Biography', 'Professional Background', 'Background']) {
    const i = lines.findIndex((line) => line.toLowerCase() === label.toLowerCase());
    if (i >= 0) {
      const value = lines.slice(i + 1, i + 5).join(' ').trim();
      if (value.length > 40 && !/request a free trial/i.test(value)) { bio = value; break; }
    }
  }
  let writes = 0;
  if (!record.firm_bio_page_url) {
    const ok = await guardedPatch('firm_investors', record.id, 'firm_bio_page_url', url);
    if (ok) { writes++; await provenance('investor', record.id, 'firm_bio_page_url', url, url, body.slice(0, 350), matchMethod); }
  }
  if (bio) {
    for (const field of ['bio', 'background_summary']) {
      if (isBlank(record[field])) {
        const ok = await guardedPatch('firm_investors', record.id, field, bio);
        if (ok) { writes++; await provenance('investor', record.id, field, bio, url, bio, matchMethod); }
      }
    }
  }
  if (bio && !record.short_summary) {
    const summary = `${record.full_name}${record.title ? ` (${record.title})` : ''}: ${bio.slice(0, 220)}`;
    const ok = await guardedPatch('firm_investors', record.id, 'short_summary', summary);
    if (ok) { writes++; await provenance('investor', record.id, 'short_summary', summary, url, bio, matchMethod); }
  }
  return writes;
}

async function nextFirmRows(lastId, limit) {
  const { data, error } = await db.from('firm_records').select('id,firm_name,website_url,domain,pitchbook_url,description,founded_year,hq_city,hq_state,hq_country,investing_team_count,active_portfolio_count,exited_portfolio_count,most_recent_investment_date,firm_type,entity_type,deleted_at').is('deleted_at', null).gt('id', lastId || '00000000-0000-0000-0000-000000000000').or('pitchbook_url.is.null,description.is.null,founded_year.is.null,hq_city.is.null,hq_state.is.null,hq_country.is.null,investing_team_count.is.null,active_portfolio_count.is.null,exited_portfolio_count.is.null,most_recent_investment_date.is.null').order('id').limit(limit);
  if (error) throw error;
  return data || [];
}

async function nextStartupRows(lastId, limit) {
  const { data, error } = await db.from('startups').select('id,company_name,company_url,domain,description_short,description_long,founded_year,headcount,hq_city,hq_state,hq_country,sector,industry_verticals,external_ids,data_sources,deleted_at').is('deleted_at', null).gt('id', lastId || '').order('id').limit(1000);
  if (error) throw error;
  return (data || []).filter((r) => !r.external_ids?.pitchbook_url && !r.external_ids?.pitchbook_profile_url || isBlank(r.description_long) || isBlank(r.founded_year) || isBlank(r.headcount) || isBlank(r.hq_city)).slice(0, limit);
}

async function nextInvestorRows(lastId, limit) {
  const { data, error } = await db.from('firm_investors').select('id,firm_id,full_name,title,bio,background_summary,short_summary,linkedin_url,firm_bio_page_url,deleted_at').is('deleted_at', null).gt('id', lastId || '00000000-0000-0000-0000-000000000000').or('bio.is.null,short_summary.is.null').order('id').limit(limit);
  if (error) throw error;
  return data || [];
}

async function getFirmName(id) {
  const { data, error } = await db.from('firm_records').select('firm_name').eq('id', id).is('deleted_at', null).maybeSingle();
  if (error) return '';
  return data?.firm_name || '';
}

async function runQueue({ runId, entityType, entityKind, limit, loadRows, process }) {
  let cp = await getCheckpoint(runId, entityType);
  if (cp.status === 'completed') { console.log('queue_already_completed', runId); return { processed: 0, updated: 0, skipped: 0, completed: true }; }
  const rows = await loadRows(cp.last_entity_id, limit);
  if (!rows.length) {
    await saveCheckpoint(cp, { status: 'completed', error_message: null, metadata: { ...(cp.metadata || {}), entity_kind: entityKind, completed_at: new Date().toISOString() } });
    console.log('queue_completed', runId);
    return { processed: 0, updated: 0, skipped: 0, completed: true };
  }
  let processed = 0, updated = 0, skipped = 0, lastId = cp.last_entity_id;
  for (const record of rows) {
    try {
      const outcome = await process(record);
      if (outcome === 'rate_limited') {
        await saveCheckpoint(cp, { status: 'paused', error_message: 'PitchBook returned a rate limit or security verification page; stopped without bypass.', metadata: { ...(cp.metadata || {}), entity_kind: entityKind, processed, updated, skipped, last_id: lastId } });
        return { processed, updated, skipped, paused: true };
      }
      processed++;
      if (typeof outcome === 'number' && outcome > 0) updated += outcome;
      else skipped++;
      lastId = record.id;
      await saveCheckpoint(cp, { last_entity_id: lastId, last_entity_name: record.firm_name || record.company_name || record.full_name || null, records_processed: (cp.records_processed || 0) + 1, records_updated: (cp.records_updated || 0) + (typeof outcome === 'number' ? outcome : 0), records_skipped: (cp.records_skipped || 0) + (typeof outcome === 'number' && outcome > 0 ? 0 : 1), status: 'in_progress', error_message: null, metadata: { ...(cp.metadata || {}), entity_kind: entityKind, last_id: lastId } });
      await sleep(PAUSE_MS);
    } catch (error) {
      if (/PITCHBOOK_RATE_LIMIT|Performing security verification|Too Many Requests/i.test(String(error?.message || error))) {
        await saveCheckpoint(cp, { status: 'paused', error_message: 'Search or PitchBook temporarily rate-limited this run; stopped without bypass.', metadata: { ...(cp.metadata || {}), entity_kind: entityKind, processed, updated, skipped, last_id: lastId } });
        console.warn('queue_paused_for_rate_limit', runId, lastId || '(start)');
        return { processed, updated, skipped, paused: true };
      }
      console.error('record_failed', JSON.stringify({ id: record.id, name: record.firm_name || record.company_name || record.full_name, error: String(error?.message || error).slice(0, 300) }));
      processed++; skipped++;
      lastId = record.id;
      await saveCheckpoint(cp, { last_entity_id: lastId, records_processed: (cp.records_processed || 0) + 1, records_skipped: (cp.records_skipped || 0) + 1, records_failed: (cp.records_failed || 0) + 1, status: 'in_progress', error_message: String(error?.message || error).slice(0, 400), metadata: { ...(cp.metadata || {}), entity_kind: entityKind, last_id: lastId } });
    }
  }
  return { processed, updated, skipped, completed: false };
}

async function main() {
  await loadFirmCsvProfiles();
  const totals = {};
  if (process.env.PITCHBOOK_MODE === 'probe') {
    const url = process.env.PITCHBOOK_PROBE_URL || 'https://pitchbook.com/profiles/company/121885-75';
    const result = await firecrawl('scrape', { url, formats: ['markdown'], onlyMainContent: true, maxAge: 0, timeout: 60000 });
    const markdown = result.data?.markdown || '';
    console.log('pitchbook_cloud_probe', JSON.stringify({ status: result.data?.metadata?.statusCode ?? null, title: result.data?.metadata?.title || '', heading: clean(markdown.match(/^\s*#\s+(.+)$/m)?.[1] || ''), preview: /profile preview/i.test(markdown), rate_limited: result.data?.metadata?.statusCode === 429 }));
    return;
  }
  totals.firms = await runQueue({
      runId: `${STALE_RUN_PREFIX}-firms`, entityType: 'firm', entityKind: 'firm_records', limit: LIMIT,
      loadRows: nextFirmRows,
      process: async (record) => {
        const direct = record.pitchbook_url || firmCsvProfiles.get(norm(record.firm_name)) || null;
        const profile = await loadProfile(record, 'firm', direct);
        if (profile.outcome === 'rate_limited') return 'rate_limited';
        if (profile.outcome !== 'matched') { console.log('firm_skipped', record.id, profile.outcome); return 0; }
        return await updateFirm(record, profile, record.pitchbook_url ? 'existing_profile_url_and_exact_name' : firmCsvProfiles.has(norm(record.firm_name)) ? 'provided_csv_profile_and_website_domain' : 'exact_name_and_website_domain');
      },
    });
  totals.companies = await runQueue({
      runId: `${STALE_RUN_PREFIX}-companies`, entityType: 'firm', entityKind: 'startups', limit: LIMIT,
      loadRows: nextStartupRows,
      process: async (record) => {
        const direct = record.external_ids?.pitchbook_url || record.external_ids?.pitchbook_profile_url || null;
        const profile = await loadProfile(record, 'startup', direct);
        if (profile.outcome === 'rate_limited') return 'rate_limited';
        if (profile.outcome !== 'matched') { console.log('company_skipped', record.id, profile.outcome); return 0; }
        return await updateStartup(record, profile);
      },
    });
  totals.investors = await runQueue({
      runId: `${STALE_RUN_PREFIX}-investors`, entityType: 'investor', entityKind: 'firm_investors', limit: LIMIT,
      loadRows: nextInvestorRows,
      process: async (record) => {
        const firmName = await getFirmName(record.firm_id);
        const direct = record.firm_bio_page_url && /pitchbook\.com\/profiles\/person\//i.test(record.firm_bio_page_url) ? record.firm_bio_page_url : null;
        const profile = await loadProfile({ ...record, firm_name: firmName }, 'person', direct);
        if (profile.outcome === 'rate_limited') return 'rate_limited';
        if (profile.outcome !== 'matched') { console.log('investor_skipped', record.id, profile.outcome); return 0; }
        return await updatePerson(record, profile, direct ? 'existing_person_profile_url_and_exact_name' : 'exact_name_and_profile_context');
      },
    });
    console.log('pitchbook_cloud_run', JSON.stringify({ dry_run: DRY_RUN, limit_per_queue: LIMIT, totals }));
    if (Object.values(totals).some((v) => v?.paused)) process.exitCode = 0;
}

main().catch((error) => { console.error('pitchbook_cloud_failed', String(error?.stack || error)); process.exitCode = 1; });
