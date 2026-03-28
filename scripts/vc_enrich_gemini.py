#!/usr/bin/env python3
"""
Enrich a VC firm profile: Tavily search + Jina Reader (optional) + Gemini JSON extraction.

Requires:
  pip install -r scripts/requirements-vc-enrich.txt

Env:
  GEMINI_API_KEY   (required)
  TAVILY_API_KEY   (required for search; or pass --skip-tavily)
  JINA_API_KEY     (optional; Jina Reader works for many URLs without a key)
  GEMINI_MODEL     (optional, default: gemini-2.0-flash)

Usage:
  export GEMINI_API_KEY=... TAVILY_API_KEY=...
  python3 scripts/vc_enrich_gemini.py "First Round Capital" --url https://firstround.com
  python3 scripts/vc_enrich_gemini.py "Accel" --url https://www.accel.com --out data/enriched/accel.json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from pathlib import Path

import google.generativeai as genai
import requests

TAVILY_URL = "https://api.tavily.com/search"


def search_tavily(vc_name: str, api_key: str) -> str:
    print(f"[tavily] Searching: {vc_name}")
    payload = {
        "api_key": api_key,
        "query": (
            f"Venture capital firm {vc_name}: AUM, fund size, general partners, "
            "recent investments, check size, investment thesis, headquarters."
        ),
        "search_depth": "advanced",
        "include_answer": True,
    }
    r = requests.post(TAVILY_URL, json=payload, timeout=120)
    if r.status_code != 200:
        print(f"[tavily] HTTP {r.status_code}: {r.text[:300]}", file=sys.stderr)
        return ""
    data = r.json()
    parts: list[str] = []
    ans = data.get("answer")
    if ans:
        parts.append(str(ans))
    for item in data.get("results") or []:
        title = item.get("title") or ""
        content = (item.get("content") or "")[:800]
        url = item.get("url") or ""
        if title or content:
            parts.append(f"- {title} ({url})\n  {content}")
    return "\n\n".join(parts) if parts else ""


def scrape_with_jina(vc_url: str, api_key: str | None) -> str:
    if not vc_url or not vc_url.startswith(("http://", "https://")):
        return ""
    print(f"[jina] Reader: {vc_url}")
    jina_url = f"https://r.jina.ai/{vc_url}"
    headers: dict[str, str] = {}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    r = requests.get(jina_url, headers=headers, timeout=120)
    if r.status_code != 200:
        print(f"[jina] HTTP {r.status_code}: {r.text[:200]}", file=sys.stderr)
        return ""
    return r.text or ""


def extract_json_from_gemini_text(text: str) -> dict:
    """Strip optional markdown fences; parse JSON object."""
    t = text.strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t)
    if fence:
        t = fence.group(1).strip()
    return json.loads(t)


def extract_schema_with_gemini(
    vc_name: str,
    tavily_context: str,
    jina_context: str,
    model_name: str,
) -> dict:
    print(f"[gemini] Model: {model_name}")
    model = genai.GenerativeModel(
        model_name=model_name,
        generation_config={"response_mime_type": "application/json"},
    )
    prompt = f"""You are a venture capital data analyst. Sources may be incomplete or contradictory.

Firm: "{vc_name}"

--- Web search context (Tavily) ---
{tavily_context[:120_000]}

--- Website markdown (Jina Reader; may be empty) ---
{jina_context[:120_000]}

Extract only what is supported by the sources above. If unknown, use null or "Unknown". Do not invent fund sizes, people, or deals.

Return a single JSON object with this exact shape (keys required):
{{
  "profile": {{
    "firm_name": "",
    "elevator_pitch": "",
    "description": "",
    "locations": []
  }},
  "social_links": {{
    "x": "",
    "linkedin": "",
    "substack_medium_beehiiv": "",
    "youtube": "",
    "crunchbase": "",
    "signal_nfx": ""
  }},
  "contact_details": {{
    "website": "",
    "email": "",
    "phone": "",
    "address": ""
  }},
  "team": {{
    "total_headcount": 0,
    "general_partners": [],
    "total_partners": 0
  }},
  "fund_details": {{
    "open_date": "",
    "size": "",
    "focus": "",
    "stage": [],
    "sector": [],
    "geography": [],
    "aum": "",
    "average_check_size": ""
  }},
  "activity": {{
    "recent_investments": [
      {{"company_name": "", "sector": "", "stage": "", "check_size": "", "date": ""}}
    ],
    "actively_deploying": true,
    "recent_blog_posts": []
  }}
}}
"""
    response = model.generate_content(prompt)
    raw = response.text or ""
    return extract_json_from_gemini_text(raw)


def slug_filename(vc_name: str) -> str:
    s = vc_name.lower().strip()
    s = re.sub(r"[^a-z0-9]+", "_", s)
    return s.strip("_")[:80] or "vc_profile"


def process_vc(
    vc_name: str,
    vc_url: str | None,
    *,
    skip_tavily: bool,
    skip_jina: bool,
    out_path: Path | None,
    model_name: str,
) -> dict:
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        sys.exit("Missing GEMINI_API_KEY")

    genai.configure(api_key=gemini_key)

    tavily_key = os.getenv("TAVILY_API_KEY")
    tavily_context = ""
    if not skip_tavily:
        if not tavily_key:
            sys.exit("Missing TAVILY_API_KEY (or pass --skip-tavily)")
        tavily_context = search_tavily(vc_name, tavily_key)
    else:
        print("[tavily] skipped")

    jina_context = ""
    if not skip_jina and vc_url:
        jina_context = scrape_with_jina(vc_url, os.getenv("JINA_API_KEY"))
    else:
        print("[jina] skipped" if skip_jina or not vc_url else "[jina] no URL")

    data = extract_schema_with_gemini(vc_name, tavily_context, jina_context, model_name)

    out = out_path or Path("data") / "enriched" / f"{slug_filename(vc_name)}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(data, indent=2), encoding="utf-8")
    print(f"[done] Wrote {out}")
    return data


def main() -> None:
    parser = argparse.ArgumentParser(description="VC firm enrichment (Tavily + Jina + Gemini)")
    parser.add_argument("firm", help='Firm name, e.g. "First Round Capital"')
    parser.add_argument("--url", default="", help="Firm website URL for Jina Reader")
    parser.add_argument("--out", type=Path, default=None, help="Output JSON path")
    parser.add_argument("--skip-tavily", action="store_true")
    parser.add_argument("--skip-jina", action="store_true")
    args = parser.parse_args()

    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    data = process_vc(
        args.firm,
        args.url or None,
        skip_tavily=args.skip_tavily,
        skip_jina=args.skip_jina,
        out_path=args.out,
        model_name=model,
    )
    print(json.dumps(data, indent=2))


if __name__ == "__main__":
    main()
