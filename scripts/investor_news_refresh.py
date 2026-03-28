#!/usr/bin/env python3
"""
Refresh an *existing* investor CRM JSON with recent news (Tavily news search + Gemini merge).

Differs from `vc_enrich_gemini.py` (firm snapshot from scratch): this keeps your schema and
only applies deltas from the last ~6 months of news.

Requires:
  pip install -r scripts/requirements-vc-enrich.txt

Env:
  GEMINI_API_KEY   (required)
  TAVILY_API_KEY   (required)
  GEMINI_MODEL     (optional; default: gemini-2.0-flash)

Usage:
  export GEMINI_API_KEY=... TAVILY_API_KEY=...
  python3 scripts/investor_news_refresh.py "Marc Andreessen" "a16z" \\
    --in data/investor-mock.json --out data/investor-updated.json
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


def format_tavily_results(data: dict) -> str:
    parts: list[str] = []
    ans = data.get("answer")
    if ans:
        parts.append(str(ans))
    for item in data.get("results") or []:
        title = item.get("title") or ""
        content = (item.get("content") or "")[:1200]
        url = item.get("url") or ""
        if title or content:
            parts.append(f"- {title} ({url})\n  {content}")
    return "\n\n".join(parts) if parts else ""


def get_recent_updates_tavily(investor_name: str, firm_name: str, api_key: str) -> str:
    print(f"[tavily] Recent news: {investor_name} @ {firm_name}")
    payload = {
        "api_key": api_key,
        "query": (
            f"Recent news, new fund announcements, job changes, or new startup investments for "
            f"{investor_name} at {firm_name} in the last 6 months."
        ),
        "search_depth": "advanced",
        "topic": "news",
        "days": 180,
        "include_answer": True,
    }
    r = requests.post(TAVILY_URL, json=payload, timeout=120)
    if r.status_code != 200:
        print(f"[tavily] HTTP {r.status_code}: {r.text[:400]}", file=sys.stderr)
        return ""
    data = r.json()
    return format_tavily_results(data)


def extract_json_from_gemini_text(text: str) -> dict:
    t = (text or "").strip()
    fence = re.match(r"^```(?:json)?\s*([\s\S]*?)\s*```$", t)
    if fence:
        t = fence.group(1).strip()
    return json.loads(t)


def merge_updates_with_gemini(
    existing_profile: dict,
    recent_context: str,
    model_name: str,
) -> dict:
    print(f"[gemini] Merging with model: {model_name}")
    model = genai.GenerativeModel(
        model_name=model_name,
        generation_config={"response_mime_type": "application/json"},
    )
    prompt = f"""
You are an expert venture capital analyst maintaining an investor CRM.

Below is the EXISTING JSON profile for an investor.
EXISTING PROFILE:
{json.dumps(existing_profile, indent=2)}

Below is the RECENT NEWS CONTEXT gathered from the web.
RECENT NEWS:
{recent_context[:200_000]}

Your task:
1. Read the RECENT NEWS.
2. Update the EXISTING PROFILE if you find new information (e.g., they raised a new fund, changed their AUM, made a new recent investment, or changed firms).
3. If they made new investments, append them to the `recent_investments` array (or the array path used in the existing schema for deals).
4. If the news indicates they are out of money or stopped investing, set `actively_deploying` to false (or the equivalent boolean field in the schema).
5. Return the full, updated JSON object matching the exact original top-level structure and key names. Do not drop existing data unless it is explicitly contradicted by reliable recent news.
6. If the news context is empty or irrelevant, return the EXISTING PROFILE unchanged.
"""
    response = model.generate_content(prompt)
    raw = response.text or ""
    return extract_json_from_gemini_text(raw)


def run_investor_update(
    investor_name: str,
    firm_name: str,
    existing_data: dict,
    *,
    tavily_key: str,
    model_name: str,
) -> dict:
    recent_news = get_recent_updates_tavily(investor_name, firm_name, tavily_key)
    if len(recent_news.strip()) < 50:
        print("[skip] Insufficient news context; leaving profile unchanged.")
        return existing_data

    try:
        updated = merge_updates_with_gemini(existing_data, recent_news, model_name)
        print(f"[ok] Updated profile for {investor_name}")
        return updated
    except json.JSONDecodeError as e:
        print(f"[error] Gemini did not return valid JSON: {e}", file=sys.stderr)
        return existing_data


def default_mock_profile(investor_name: str, firm_name: str) -> dict:
    return {
        "profile": {"investor_name": investor_name, "firm_name": firm_name},
        "fund_details": {"aum": "", "actively_deploying": True},
        "activity": {"recent_investments": []},
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Investor profile news refresh (Tavily + Gemini)")
    parser.add_argument("investor", help='Investor name, e.g. "Marc Andreessen"')
    parser.add_argument("firm", help='Firm name, e.g. "a16z"')
    parser.add_argument(
        "--in",
        dest="in_path",
        type=Path,
        default=None,
        help="Existing profile JSON path (default: built-in mock)",
    )
    parser.add_argument("--out", type=Path, default=None, help="Write updated JSON here")
    args = parser.parse_args()

    gemini_key = os.getenv("GEMINI_API_KEY")
    tavily_key = os.getenv("TAVILY_API_KEY")
    if not gemini_key:
        sys.exit("Missing GEMINI_API_KEY")
    if not tavily_key:
        sys.exit("Missing TAVILY_API_KEY")

    genai.configure(api_key=gemini_key)
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    if args.in_path:
        existing = json.loads(args.in_path.read_text(encoding="utf-8"))
    else:
        existing = default_mock_profile(args.investor, args.firm)

    updated = run_investor_update(
        args.investor,
        args.firm,
        existing,
        tavily_key=tavily_key,
        model_name=model_name,
    )

    if args.out:
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(updated, indent=2), encoding="utf-8")
        print(f"[done] Wrote {args.out}")

    print(json.dumps(updated, indent=2))


if __name__ == "__main__":
    main()
