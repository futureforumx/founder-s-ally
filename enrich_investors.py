"""
Vekta Investor Enrichment Pipeline
====================================
Enriches investor CSV files using Apollo, Hunter, Explorium, Clay, and HubSpot APIs.
Validates enriched data quality using an AI model before overwriting originals.

SETUP:
  pip install requests openai tqdm

USAGE:
  python enrich_investors.py

CONFIG:
  Edit the API_KEYS section below before running.
"""

import csv
import json
import os
import re
import shutil
import time
from datetime import datetime
from pathlib import Path

import requests
from tqdm import tqdm

# ─── CONFIG ──────────────────────────────────────────────────────────────────

API_KEYS = {
    "clay":       "ef8d660258566d76c81c",
    "apollo":     "qvE-yC7EdFSebjyRdCFS2g",
    "hunter":     "0febd81b4c73d7647f48edb0cc0edb1e50277f34",
    "explorium":  "c32c28e0-4d13-49b7-b09c-ad652c4d9bec",
    "hubspot":    "na2-1909-fc67-49ea-9f3c-3f65f139e205",
    # For AI validation — add one of these:
    "openai":     "",   # sk-...
    "anthropic":  "",   # sk-ant-...
}

# Files to enrich (relative to this script's directory)
INPUT_FILES = [
    "Investors-Grid view (4).csv",
    "us_investor_single_deduped_enriched_920.csv",
    "Early-Stage Investor List-Grid view (1).csv",
]

# Fields we want to fill in (mapped to our unified schema)
PRIORITY_FIELDS = [
    "email", "linkedin", "twitter", "bio", "check_size",
    "sectors", "stage", "aum", "headcount", "geography",
    "prior_investments", "notable_investments", "themes",
    "average_check_size", "website",
]

# Minimum confidence score (0–1) to accept an enriched value
MIN_CONFIDENCE = 0.7

# Rate limiting (seconds between API calls per service)
RATE_LIMITS = {
    "apollo":    0.5,
    "hunter":    1.0,
    "explorium": 0.5,
    "hubspot":   0.3,
}

SCRIPT_DIR = Path(__file__).parent
LOG_FILE   = SCRIPT_DIR / f"enrichment_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jsonl"

# ─── HELPERS ─────────────────────────────────────────────────────────────────

def log(record: dict):
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(record) + "\n")

def backup_original(path: Path) -> Path:
    backup = path.with_suffix(f".backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv")
    shutil.copy2(path, backup)
    print(f"  ✓ Backed up original → {backup.name}")
    return backup

def clean(val) -> str:
    if val is None:
        return ""
    return str(val).strip()

def is_empty(val) -> bool:
    return not clean(val)

def extract_name_parts(full_name: str):
    parts = full_name.strip().split()
    if len(parts) >= 2:
        return parts[0], " ".join(parts[1:])
    return full_name, ""

def extract_domain(website_or_email: str) -> str:
    """Extract domain from a URL or email address."""
    s = clean(website_or_email)
    if "@" in s:
        return s.split("@")[-1].lower()
    s = re.sub(r'^https?://', '', s).rstrip('/')
    domain = s.split('/')[0].lower()
    return domain if '.' in domain else ""

# ─── APOLLO ──────────────────────────────────────────────────────────────────

_apollo_last_call = 0

def apollo_person(first_name: str, last_name: str, org: str = "", domain: str = "") -> dict:
    global _apollo_last_call
    elapsed = time.time() - _apollo_last_call
    if elapsed < RATE_LIMITS["apollo"]:
        time.sleep(RATE_LIMITS["apollo"] - elapsed)
    _apollo_last_call = time.time()

    payload = {"first_name": first_name, "last_name": last_name}
    if org:
        payload["organization_name"] = org
    if domain:
        payload["domain"] = domain

    try:
        r = requests.post(
            "https://api.apollo.io/v1/people/match",
            json=payload,
            headers={"x-api-key": API_KEYS["apollo"], "Content-Type": "application/json"},
            timeout=15,
        )
        if r.status_code == 200:
            person = r.json().get("person") or {}
            return {
                "email":     clean(person.get("email")),
                "linkedin":  clean(person.get("linkedin_url")),
                "twitter":   clean(person.get("twitter_url")),
                "bio":       clean(person.get("headline") or person.get("summary")),
                "location":  clean(person.get("city", "") + (", " + person.get("state", "") if person.get("state") else "")),
                "_source":   "apollo_person",
                "_confidence": 0.85 if person.get("email") else 0.6,
            }
    except Exception as e:
        log({"event": "apollo_person_error", "name": f"{first_name} {last_name}", "error": str(e)})
    return {}


def apollo_org(name: str = "", domain: str = "") -> dict:
    global _apollo_last_call
    elapsed = time.time() - _apollo_last_call
    if elapsed < RATE_LIMITS["apollo"]:
        time.sleep(RATE_LIMITS["apollo"] - elapsed)
    _apollo_last_call = time.time()

    payload = {}
    if domain:
        payload["domain"] = domain
    elif name:
        payload["name"] = name
    else:
        return {}

    try:
        r = requests.post(
            "https://api.apollo.io/v1/organizations/enrich",
            json=payload,
            headers={"x-api-key": API_KEYS["apollo"], "Content-Type": "application/json"},
            timeout=15,
        )
        if r.status_code == 200:
            org = r.json().get("organization") or {}
            emp = org.get("estimated_num_employees") or org.get("num_employees")
            return {
                "bio":        clean(org.get("short_description") or org.get("long_description")),
                "website":    clean(org.get("website_url")),
                "linkedin":   clean(org.get("linkedin_url")),
                "sectors":    ", ".join(org.get("industry_tag_set") or [org.get("industry", "")]),
                "headcount":  str(emp) if emp else "",
                "aum":        "",   # Apollo doesn't have AUM for VCs
                "_source":    "apollo_org",
                "_confidence": 0.8,
            }
    except Exception as e:
        log({"event": "apollo_org_error", "name": name, "error": str(e)})
    return {}

# ─── HUNTER ──────────────────────────────────────────────────────────────────

_hunter_last_call = 0

def hunter_find_email(first_name: str, last_name: str, domain: str) -> dict:
    global _hunter_last_call
    elapsed = time.time() - _hunter_last_call
    if elapsed < RATE_LIMITS["hunter"]:
        time.sleep(RATE_LIMITS["hunter"] - elapsed)
    _hunter_last_call = time.time()

    if not domain:
        return {}
    try:
        r = requests.get(
            "https://api.hunter.io/v2/email-finder",
            params={
                "domain":     domain,
                "first_name": first_name,
                "last_name":  last_name,
                "api_key":    API_KEYS["hunter"],
            },
            timeout=15,
        )
        if r.status_code == 200:
            data = r.json().get("data") or {}
            email = clean(data.get("email"))
            score = data.get("score", 0)
            if email:
                return {
                    "email":       email,
                    "_source":     "hunter",
                    "_confidence": min(score / 100, 1.0),
                }
    except Exception as e:
        log({"event": "hunter_error", "name": f"{first_name} {last_name}", "error": str(e)})
    return {}


def hunter_domain_search(domain: str) -> list:
    """Return list of {email, first_name, last_name} for a domain."""
    global _hunter_last_call
    elapsed = time.time() - _hunter_last_call
    if elapsed < RATE_LIMITS["hunter"]:
        time.sleep(RATE_LIMITS["hunter"] - elapsed)
    _hunter_last_call = time.time()

    if not domain:
        return []
    try:
        r = requests.get(
            "https://api.hunter.io/v2/domain-search",
            params={"domain": domain, "limit": 10, "api_key": API_KEYS["hunter"]},
            timeout=15,
        )
        if r.status_code == 200:
            return r.json().get("data", {}).get("emails", [])
    except Exception as e:
        log({"event": "hunter_domain_error", "domain": domain, "error": str(e)})
    return []

# ─── EXPLORIUM ────────────────────────────────────────────────────────────────

_explorium_last_call = 0

def explorium_enrich(name: str = "", domain: str = "") -> dict:
    global _explorium_last_call
    elapsed = time.time() - _explorium_last_call
    if elapsed < RATE_LIMITS["explorium"]:
        time.sleep(RATE_LIMITS["explorium"] - elapsed)
    _explorium_last_call = time.time()

    payload = {}
    if domain:
        payload["website"] = f"https://{domain}"
    if name:
        payload["business_name"] = name

    if not payload:
        return {}

    try:
        r = requests.post(
            "https://api.explorium.ai/v1/businesses/enrich",
            json=payload,
            headers={"api_key": API_KEYS["explorium"], "Content-Type": "application/json"},
            timeout=15,
        )
        if r.status_code == 200:
            data = r.json().get("data") or r.json()
            return {
                "bio":        clean(data.get("description") or data.get("short_description")),
                "headcount":  clean(data.get("employee_count") or data.get("headcount")),
                "sectors":    clean(data.get("industry") or data.get("categories")),
                "website":    clean(data.get("website")),
                "aum":        clean(data.get("aum") or data.get("assets_under_management")),
                "_source":    "explorium",
                "_confidence": 0.75,
            }
    except Exception as e:
        log({"event": "explorium_error", "name": name, "error": str(e)})
    return {}

# ─── HUBSPOT ─────────────────────────────────────────────────────────────────

_hubspot_last_call = 0

def hubspot_search_contact(email: str = "", name: str = "") -> dict:
    global _hubspot_last_call
    elapsed = time.time() - _hubspot_last_call
    if elapsed < RATE_LIMITS["hubspot"]:
        time.sleep(RATE_LIMITS["hubspot"] - elapsed)
    _hubspot_last_call = time.time()

    headers = {"Authorization": f"Bearer {API_KEYS['hubspot']}", "Content-Type": "application/json"}

    # Try email search first
    if email:
        try:
            r = requests.post(
                "https://api.hubapi.com/crm/v3/objects/contacts/search",
                json={
                    "filterGroups": [{"filters": [{"propertyName": "email", "operator": "EQ", "value": email}]}],
                    "properties": ["email", "firstname", "lastname", "linkedin_bio", "twitterhandle", "website"],
                    "limit": 1,
                },
                headers=headers,
                timeout=10,
            )
            if r.status_code == 200:
                results = r.json().get("results", [])
                if results:
                    props = results[0].get("properties", {})
                    return {
                        "twitter":  clean(props.get("twitterhandle")),
                        "linkedin": clean(props.get("linkedin_bio")),
                        "_source":  "hubspot",
                        "_confidence": 0.8,
                    }
        except Exception as e:
            log({"event": "hubspot_error", "email": email, "error": str(e)})
    return {}

# ─── AI VALIDATION ────────────────────────────────────────────────────────────

def validate_with_ai(original: dict, enriched: dict) -> dict:
    """
    Uses OpenAI or Anthropic to validate enriched fields.
    Returns a dict of {field: is_valid (bool)} for each enriched field.
    Falls back to accepting all values if no AI key is configured.
    """
    if not API_KEYS.get("openai") and not API_KEYS.get("anthropic"):
        # No AI key — accept all enriched values
        return {k: True for k in enriched}

    prompt = f"""You are a data quality validator for a VC investor database.

I enriched an investor record with new data from third-party APIs. Please validate whether the enriched values are plausible and consistent with the investor's original record.

ORIGINAL RECORD:
{json.dumps({k: v for k, v in original.items() if v and not k.startswith('_')}, indent=2)}

ENRICHED VALUES (to validate):
{json.dumps({k: v for k, v in enriched.items() if v and not k.startswith('_')}, indent=2)}

For each enriched field, respond with a JSON object like:
{{"email": true, "linkedin": true, "bio": false, ...}}

Set to true if the value looks accurate and plausible, false if it seems wrong or inconsistent.
Respond with ONLY the JSON object, no explanation."""

    try:
        if API_KEYS.get("openai"):
            import openai
            client = openai.OpenAI(api_key=API_KEYS["openai"])
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[{"role": "user", "content": prompt}],
                temperature=0,
                max_tokens=200,
            )
            raw = resp.choices[0].message.content.strip()
            return json.loads(raw)

        elif API_KEYS.get("anthropic"):
            r = requests.post(
                "https://api.anthropic.com/v1/messages",
                json={
                    "model": "claude-3-haiku-20240307",
                    "max_tokens": 200,
                    "messages": [{"role": "user", "content": prompt}],
                },
                headers={
                    "x-api-key": API_KEYS["anthropic"],
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                },
                timeout=15,
            )
            raw = r.json()["content"][0]["text"].strip()
            return json.loads(raw)

    except Exception as e:
        log({"event": "ai_validation_error", "error": str(e)})

    return {k: True for k in enriched}  # Accept all on failure

# ─── COLUMN MAPPING ──────────────────────────────────────────────────────────

# Maps our unified schema to actual CSV column names per file
COLUMN_MAPS = {
    "Investors-Grid view (4).csv": {
        "name":               "Investor Name",
        "firm":               "Firm",
        "email":              "Email",
        "linkedin":           "LinkedIn",
        "twitter":            "X / Twitter",
        "bio":                "Bio",
        "check_size":         "Check Size",
        "sectors":            "Sectors",
        "stage":              "Stage",
        "geography":          "Geography",
        "prior_investments":  "Prior Investments",
        "website":            "Personal Website / Bio",
        "location":           "Location",
    },
    "Early-Stage Investor List-Grid view (1).csv": {
        "name":               "Investor Name",
        "firm":               "Firm",
        "email":              "Email",
        "linkedin":           "LinkedIn",
        "twitter":            "X / Twitter",
        "bio":                "Bio",
        "check_size":         "Check Size",
        "sectors":            "Sectors",
        "stage":              "Stage",
        "geography":          "Geography",
        "prior_investments":  "Prior Investments",
        "website":            "Personal Website / Bio",
        "location":           "Location",
    },
    "us_investor_single_deduped_enriched_920.csv": {
        "name":               "firm_name",
        "firm":               "firm_name",
        "email":              "firm_email",
        "linkedin":           "firm_linkedin_profile_link",
        "twitter":            "firm_x_profile_link",
        "bio":                "description",
        "check_size":         "check_size_range_enriched",
        "sectors":            "sector_focus",
        "stage":              "stage_focus_normalized",
        "geography":          "geography_focus",
        "aum":                "total_aum_display",
        "headcount":          "headcount_enriched",
        "website":            "website",
        "location":           "hq_location_address",
    },
}

# ─── ENRICHMENT LOGIC ─────────────────────────────────────────────────────────

def enrich_person_record(row: dict, colmap: dict) -> dict:
    """Enrich an individual investor record."""
    updates = {}

    name     = clean(row.get(colmap.get("name", ""), ""))
    firm     = clean(row.get(colmap.get("firm", ""), ""))
    email    = clean(row.get(colmap.get("email", ""), ""))
    website  = clean(row.get(colmap.get("website", ""), ""))
    linkedin = clean(row.get(colmap.get("linkedin", ""), ""))

    first, last = extract_name_parts(name)
    domain = extract_domain(email or website)

    needs_email    = is_empty(email)
    needs_linkedin = is_empty(linkedin)
    needs_bio      = is_empty(row.get(colmap.get("bio", ""), ""))

    if not first and not last:
        return updates

    # 1. Apollo person enrichment
    if needs_email or needs_linkedin or needs_bio:
        apollo_data = apollo_person(first, last, org=firm, domain=domain)
        if apollo_data:
            if needs_email and apollo_data.get("email"):
                updates["email"] = apollo_data["email"]
                domain = extract_domain(apollo_data["email"]) or domain
            if needs_linkedin and apollo_data.get("linkedin"):
                updates["linkedin"] = apollo_data["linkedin"]
            if needs_bio and apollo_data.get("bio"):
                updates["bio"] = apollo_data["bio"]
            if is_empty(row.get(colmap.get("twitter", ""), "")) and apollo_data.get("twitter"):
                updates["twitter"] = apollo_data["twitter"]
            if is_empty(row.get(colmap.get("location", ""), "")) and apollo_data.get("location"):
                updates["location"] = apollo_data["location"]
            log({"event": "apollo_person_hit", "name": name, "fields": list(apollo_data.keys())})

    # 2. Hunter email finder (if still missing email and we have a domain)
    if is_empty(updates.get("email") or email) and domain:
        hunter_data = hunter_find_email(first, last, domain)
        if hunter_data.get("email") and hunter_data.get("_confidence", 0) >= MIN_CONFIDENCE:
            updates["email"] = hunter_data["email"]
            log({"event": "hunter_hit", "name": name, "email": hunter_data["email"]})

    # 3. HubSpot — check existing CRM contact
    eff_email = updates.get("email") or email
    if eff_email:
        hs = hubspot_search_contact(email=eff_email)
        if hs:
            if is_empty(updates.get("twitter") or row.get(colmap.get("twitter", ""), "")) and hs.get("twitter"):
                updates["twitter"] = hs["twitter"]
            if is_empty(updates.get("linkedin") or linkedin) and hs.get("linkedin"):
                updates["linkedin"] = hs["linkedin"]

    return updates


def enrich_firm_record(row: dict, colmap: dict) -> dict:
    """Enrich a firm/org record."""
    updates = {}

    name    = clean(row.get(colmap.get("name", ""), ""))
    website = clean(row.get(colmap.get("website", ""), ""))
    email   = clean(row.get(colmap.get("email", ""), ""))

    domain = extract_domain(website or email)

    needs_bio      = is_empty(row.get(colmap.get("bio", ""), ""))
    needs_sectors  = is_empty(row.get(colmap.get("sectors", ""), ""))
    needs_headcount = is_empty(row.get(colmap.get("headcount", ""), ""))
    needs_aum      = is_empty(row.get(colmap.get("aum", ""), ""))
    needs_website  = is_empty(website)
    needs_email    = is_empty(email)

    if not name and not domain:
        return updates

    # 1. Apollo org enrichment
    if needs_bio or needs_sectors or needs_website:
        apollo_data = apollo_org(name=name, domain=domain)
        if apollo_data:
            for field in ["bio", "sectors", "website", "linkedin", "headcount"]:
                col = colmap.get(field)
                if col and is_empty(row.get(col, "")) and apollo_data.get(field):
                    updates[field] = apollo_data[field]
                    if field == "website":
                        domain = extract_domain(apollo_data["website"]) or domain
            log({"event": "apollo_org_hit", "name": name, "fields": list(apollo_data.keys())})

    # 2. Explorium for financials / AUM / headcount
    if needs_aum or needs_headcount or (needs_bio and not updates.get("bio")):
        exp_data = explorium_enrich(name=name, domain=domain)
        if exp_data:
            for field in ["bio", "aum", "headcount", "sectors", "website"]:
                col = colmap.get(field)
                if col and is_empty(row.get(col, "")) and is_empty(updates.get(field, "")) and exp_data.get(field):
                    updates[field] = exp_data[field]
            log({"event": "explorium_hit", "name": name, "fields": list(exp_data.keys())})

    # 3. Hunter domain search for email
    if needs_email and domain:
        emails_found = hunter_domain_search(domain)
        for entry in emails_found[:1]:
            if entry.get("confidence", 0) >= (MIN_CONFIDENCE * 100):
                updates["email"] = entry["value"]
                break

    return updates


def is_firm_file(filename: str) -> bool:
    return "920" in filename

# ─── MAIN PIPELINE ────────────────────────────────────────────────────────────

def process_file(filename: str):
    filepath = SCRIPT_DIR / filename
    if not filepath.exists():
        print(f"  ✗ File not found: {filename}")
        return

    colmap = COLUMN_MAPS.get(filename, {})
    if not colmap:
        print(f"  ✗ No column map for {filename}")
        return

    print(f"\n{'='*60}")
    print(f"Processing: {filename}")
    print(f"{'='*60}")

    with open(filepath, "r", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    fieldnames = list(rows[0].keys()) if rows else []

    print(f"  {len(rows)} records loaded")

    enriched_rows   = []
    total_updates   = 0
    total_validated = 0

    for i, row in enumerate(tqdm(rows, desc="  Enriching")):
        new_row = dict(row)

        # Enrich
        if is_firm_file(filename):
            updates = enrich_firm_record(row, colmap)
        else:
            updates = enrich_person_record(row, colmap)

        if not updates:
            enriched_rows.append(new_row)
            continue

        # Validate with AI
        validation = validate_with_ai(row, updates)

        applied = 0
        for unified_field, new_val in updates.items():
            if not validation.get(unified_field, True):
                log({"event": "ai_rejected", "row": i, "field": unified_field, "value": new_val})
                continue

            csv_col = colmap.get(unified_field)
            if csv_col and csv_col in new_row and is_empty(new_row[csv_col]) and new_val:
                new_row[csv_col] = new_val
                applied += 1
                log({"event": "field_updated", "row": i, "field": unified_field, "col": csv_col, "value": new_val})

        total_updates   += applied
        total_validated += 1
        enriched_rows.append(new_row)

        # Checkpoint every 50 rows
        if (i + 1) % 50 == 0:
            out_tmp = filepath.with_suffix(".enriching.csv")
            with open(out_tmp, "w", newline="", encoding="utf-8") as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames)
                writer.writeheader()
                writer.writerows(enriched_rows)

    print(f"\n  Records enriched: {total_validated}")
    print(f"  Total fields filled: {total_updates}")

    # Backup original
    backup_original(filepath)

    # Write enriched file
    out_path = filepath.with_stem(filepath.stem + "_enriched")
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(enriched_rows)

    print(f"  ✓ Saved enriched file → {out_path.name}")

    # Clean up checkpoint
    tmp = filepath.with_suffix(".enriching.csv")
    if tmp.exists():
        tmp.unlink()

    return total_updates


def main():
    print("=" * 60)
    print("  VEKTA INVESTOR ENRICHMENT PIPELINE")
    print(f"  Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 60)

    # Check which APIs are available
    print("\nAPI Keys configured:")
    for svc, key in API_KEYS.items():
        status = "✓" if key else "✗ (not set)"
        print(f"  {svc:12s}: {status}")

    if not API_KEYS.get("openai") and not API_KEYS.get("anthropic"):
        print("\n  ⚠  No AI validation key set — enriched values will be accepted without validation.")
        print("     Set API_KEYS['openai'] or API_KEYS['anthropic'] for quality gating.\n")

    total = 0
    for filename in INPUT_FILES:
        n = process_file(filename)
        if n:
            total += n

    print(f"\n{'='*60}")
    print(f"  Done! Total fields filled across all files: {total}")
    print(f"  Log: {LOG_FILE.name}")
    print("=" * 60)


if __name__ == "__main__":
    main()
