#!/usr/bin/env python3

import argparse
import csv
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional


DEFAULT_URL = "https://mercury.com/investor-database"
DEFAULT_OUTPUT = "mercury_investor_database.csv"


def fetch_html(url: str) -> str:
    with urllib.request.urlopen(url) as response:
        return response.read().decode("utf-8")


def load_html(path: Optional[str], url: str) -> str:
    if path:
        return Path(path).read_text(encoding="utf-8")
    return fetch_html(url)


def extract_investors(html: str) -> List[Dict]:
    scripts = re.findall(r"<script[^>]*>(.*?)</script>", html, re.S | re.I)
    chunk = next(
        (script for script in scripts if '\\"investors\\":[' in script),
        None,
    )
    if chunk is None:
        raise ValueError("Could not find investor data in the Mercury page.")

    match = re.search(
        r'self\.__next_f\.push\(\[1,"((?:\\.|[^"\\])*)"\]\)',
        chunk,
        re.S,
    )
    if match is None:
        raise ValueError("Could not decode the investor payload.")

    decoded = json.loads(f'"{match.group(1)}"')
    payload = json.loads(decoded.split(":", 1)[1])
    return payload[3]["children"][3]["investors"]


def join_list(values: Optional[List[str]]) -> str:
    if not values:
        return ""
    return "; ".join(values)


def join_regions(regions: Optional[List[Dict]]) -> str:
    if not regions:
        return ""
    return "; ".join(item["region"] for item in regions if item.get("region"))


def normalize_rows(investors: List[Dict]) -> List[Dict]:
    rows = []
    for investor in investors:
        rows.append(
            {
                "id": investor.get("id", ""),
                "name": investor.get("name", ""),
                "first_name": investor.get("firstName", ""),
                "last_name": investor.get("lastName", ""),
                "fund_company_name": investor.get("fundCompanyName", ""),
                "role": investor.get("role", ""),
                "investor_type": investor.get("investorType", ""),
                "leads_round": investor.get("leadsRound", ""),
                "check_size": investor.get("checkSize", "").lstrip("$"),
                "minimum_check_size": investor.get("minimumCheckSize", ""),
                "maximum_check_size": investor.get("maximumCheckSize", ""),
                "stages": join_list(investor.get("stages")),
                "industries": join_list(investor.get("industries")),
                "geographies": join_regions(investor.get("geographies")),
                "location": join_list(investor.get("location")),
                "slug": investor.get("slug", ""),
                "editing_url": investor.get("_editingUrl", ""),
            }
        )
    return rows


def write_csv(rows: List[Dict], output_path: str) -> None:
    fieldnames = list(rows[0].keys()) if rows else []
    with open(output_path, "w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract Mercury's investor database into a CSV."
    )
    parser.add_argument(
        "--input-html",
        help="Read from a previously downloaded Mercury investor database HTML file.",
    )
    parser.add_argument(
        "--url",
        default=DEFAULT_URL,
        help=f"Source URL to fetch when --input-html is not provided. Default: {DEFAULT_URL}",
    )
    parser.add_argument(
        "--output",
        default=DEFAULT_OUTPUT,
        help=f"CSV output path. Default: {DEFAULT_OUTPUT}",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    html = load_html(args.input_html, args.url)
    investors = extract_investors(html)
    rows = normalize_rows(investors)
    write_csv(rows, args.output)
    print(f"Wrote {len(rows)} investors to {args.output}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
