#!/usr/bin/env python3
"""
Fetch latest SEC Form D filings (Atom feed), resolve primary_doc.xml URLs, parse issuer data,
and upsert into Postgres (Prisma schema): vc_firms + vc_funds + reg_d_filings (+ vc_firm_aliases for CIK).

SEC requires a descriptive User-Agent with contact email or your IP may be blocked:
  https://www.sec.gov/os/accessing-edgar-data

Env:
  DATABASE_URL   — Postgres connection string (same as Prisma)
  SEC_USER_AGENT — e.g. "VektaApp (you@company.com)"

Optional:
  SEC_FORM_D_LIMIT — max Atom entries to process (default 15)
  SEC_FORM_D_DRY_RUN — set to 1 to parse only, no DB writes
  SEC_FORM_D_VERBOSE — set to 1 for feed/debug logging on stderr

Usage:
  export DATABASE_URL=postgresql://...
  export SEC_USER_AGENT="VektaApp (ops@example.com)"
  python3 scripts/sec_form_d_sync.py
"""

from __future__ import annotations

import ipaddress
import os
import re
import sys
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET

import feedparser
import requests

# ---------------------------------------------------------------------------
# CONFIG
# ---------------------------------------------------------------------------

def _load_dotenv_files() -> None:
    root = Path(__file__).resolve().parents[1]
    for name in (".env", ".env.local"):
        p = root / name
        if not p.is_file():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            t = line.strip()
            if not t or t.startswith("#") or "=" not in t:
                continue
            k, _, v = t.partition("=")
            k = k.strip()
            v = v.strip().strip('"').strip("'")
            if k and k not in os.environ:
                os.environ[k] = v


def read_database_url_from_files(root: Path) -> str | None:
    """Last DATABASE_URL wins (.env.local overrides .env). Does not read os.environ."""
    last: str | None = None
    for name in (".env", ".env.local"):
        p = root / name
        if not p.is_file():
            continue
        for line in p.read_text(encoding="utf-8").splitlines():
            t = line.strip()
            if not t or t.startswith("#") or not t.startswith("DATABASE_URL="):
                continue
            v = t.split("=", 1)[1].strip().strip('"').strip("'")
            if v:
                last = v
    return last


def database_url_has_resolvable_host(url: str) -> bool:
    """False for shell placeholders like postgresql://u:p@.../db (host collapses to empty)."""
    if not url.strip():
        return False
    try:
        from psycopg.conninfo import conninfo_to_dict

        s = normalize_database_url(url)
        low = s.lower()
        if not (low.startswith("postgres://") or low.startswith("postgresql://")):
            return False
        params = conninfo_to_dict(s)
    except Exception:
        return False

    hval = params.get("host")
    if hval is not None and not isinstance(hval, str):
        hval = str(hval)
    raw_host = _prepare_raw_host((hval or "").strip())
    if (params.get("hostaddr") or "").strip():
        return True
    if not raw_host:
        return False
    if raw_host.startswith("/"):
        return True
    if "@" in raw_host:
        return False
    host_only, _ = _strip_host_port_if_concatenated(raw_host)
    cleaned = _collapse_empty_dns_labels(_sanitize_dns_host(host_only))
    return bool(cleaned)


def resolve_database_url() -> str:
    """
    Use os.environ DATABASE_URL only if it has a real host.
    Otherwise use .env / .env.local (avoids stale `export DATABASE_URL=...` placeholders).
    """
    root = Path(__file__).resolve().parents[1]
    _load_dotenv_files()
    env_u = os.environ.get("DATABASE_URL", "").strip()
    file_u = read_database_url_from_files(root)

    if env_u and database_url_has_resolvable_host(env_u):
        return env_u
    if file_u and database_url_has_resolvable_host(file_u):
        if env_u and env_u != file_u:
            print(
                "Note: environment DATABASE_URL is missing a valid host (e.g. literal `...`). "
                "Using DATABASE_URL from project .env / .env.local. Unset DATABASE_URL in your shell to silence this.",
                file=sys.stderr,
            )
        return file_u
    if file_u:
        return file_u
    if env_u:
        return env_u
    v = os.environ.get("DATABASE_URL", "").strip()
    if not v:
        print("Missing DATABASE_URL (set in .env or environment).", file=sys.stderr)
        sys.exit(1)
    return v


def _require_env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        print(f"Missing required env: {name}", file=sys.stderr)
        sys.exit(1)
    return v


def _strip_database_url(raw: str) -> str:
    s = raw.strip().strip("\ufeff")
    if len(s) >= 2 and s[0] == s[-1] and s[0] in "\"'":
        s = s[1:-1].strip()
    return "".join(s.splitlines()).strip()


def normalize_database_url(raw: str) -> str:
    """Strip BOM/quotes/newlines. If the password contains @, URL-encode it as %40 in DATABASE_URL."""
    return _strip_database_url(raw)


def _collapse_empty_dns_labels(host: str) -> str:
    """Turn foo..bar into foo.bar (bad pastes / broken .env lines). Skip IPv6."""
    if not host or host.count(":") >= 2:
        return host
    return ".".join(p for p in host.split(".") if p)


def _validate_resolvable_host(host: str) -> None:
    """
    Fail fast before socket.getaddrinfo IDNA errors (e.g. label empty or too long).
    """
    inner = host[1:-1] if host.startswith("[") and host.endswith("]") else host
    try:
        ipaddress.ip_address(inner)
        return
    except ValueError:
        pass
    if any(len(label) == 0 for label in inner.split(".")):
        raise ValueError(
            "DATABASE_URL hostname has an empty DNS label (e.g. consecutive dots). Check the host part of the URL."
        )
    if len(inner) > 253 or any(len(label) > 63 for label in inner.split(".")):
        raise ValueError(
            "DATABASE_URL hostname is not valid DNS (label length or total length). "
            "If your password contains @, encode each @ as %40 so the host parses correctly."
        )


# Zero-width / formatting chars often end up in copied Supabase URLs and strip to "empty" host.
_HOST_INVISIBLE_RE = re.compile(r"[\u200b\u200c\u200d\u2060\ufeff\u00a0\u200e\u200f\u202a-\u202e]+")


def _prepare_raw_host(host: str) -> str:
    if not host:
        return host
    h = _HOST_INVISIBLE_RE.sub("", host)
    return h.strip()


def _strip_host_port_if_concatenated(host: str) -> tuple[str, str | None]:
    """
    If libpq put host:port in the host field (mis-parse), split so sanitization does not delete ':' and wreck the name.
    """
    if not host or host.startswith("["):
        return host, None
    if host.count(":") != 1:
        return host, None
    left, _, right = host.partition(":")
    if right.isdigit():
        return left, right
    return host, None


def _sanitize_dns_host(host: str) -> str:
    """Remove invisible/confusable chars that break IDNA (common bad pastes from dashboards)."""
    if not host:
        return host
    # Leave IPv6 literals alone (urlparse gives e.g. 2001:db8::1)
    if host.count(":") >= 2:
        return host
    trans = str.maketrans(
        {
            "\u2010": "-",
            "\u2011": "-",
            "\u2012": "-",
            "\u2013": "-",
            "\u2014": "-",
            "\uff0e": ".",
        }
    )
    h = host.translate(trans)
    # Keep ASCII hostname chars only (underscore rare but harmless for some internal hosts)
    return re.sub(r"[^a-zA-Z0-9.\-_]", "", h)


def postgres_connect_kwargs(url: str) -> dict:
    """
    Parse DATABASE_URL with libpq rules (psycopg.conninfo), then sanitize/validate the host.
    urllib.parse + manual fields mishandle passwords containing @ and can trigger IDNA UnicodeError.
    """
    from psycopg.conninfo import conninfo_to_dict

    s = normalize_database_url(url)
    low = s.lower()
    if not (low.startswith("postgres://") or low.startswith("postgresql://")):
        print("DATABASE_URL must start with postgres:// or postgresql://", file=sys.stderr)
        sys.exit(1)
    try:
        params = conninfo_to_dict(s)
    except Exception as e:
        print(f"Could not parse DATABASE_URL: {e}", file=sys.stderr)
        sys.exit(1)

    hval = params.get("host")
    if hval is not None and not isinstance(hval, str):
        hval = str(hval)
    raw_host = _prepare_raw_host((hval or "").strip())
    # libpq can use hostaddr (IP) with an empty host
    if not raw_host and (params.get("hostaddr") or "").strip():
        return params
    if raw_host:
        if raw_host.startswith("/"):
            pass
        else:
            if "@" in raw_host:
                print(
                    'DATABASE_URL host contains "@", which almost always means an unescaped @ in the password. '
                    "Replace each @ in the password with %40 (example: secret@x → secret%40x).",
                    file=sys.stderr,
                )
                sys.exit(1)
            host_only, port_from_host = _strip_host_port_if_concatenated(raw_host)
            if port_from_host and not str(params.get("port") or "").strip():
                params["port"] = port_from_host
            cleaned = _collapse_empty_dns_labels(_sanitize_dns_host(host_only))
            if not cleaned:
                esc = raw_host.encode("unicode_escape", errors="replace").decode("ascii")
                print(
                    "DATABASE_URL hostname became empty after cleanup (often zero-width spaces in .env). "
                    f"Re-copy the host from Supabase. Debug len={len(raw_host)} escaped={esc!r}",
                    file=sys.stderr,
                )
                sys.exit(1)
            try:
                _validate_resolvable_host(cleaned)
            except ValueError as e:
                print(str(e), file=sys.stderr)
                sys.exit(1)
            params["host"] = cleaned

    return params


def _normalize_sec_archive_url(href: str) -> str:
    h = (href or "").strip()
    if not h:
        return ""
    if h.startswith("/"):
        h = "https://www.sec.gov" + h
    h = h.replace("http://", "https://")
    h = re.sub(r"^https://sec\.gov", "https://www.sec.gov", h, flags=re.I)
    if "/Archives/edgar/data/" not in h and "/archives/edgar/data/" not in h:
        return ""
    return h.replace("/archives/edgar/", "/Archives/edgar/")


def extract_index_urls_from_feed_xml(text: str, limit: int) -> list[str]:
    """
    SEC Atom often puts the real index path only inside <link href="...">;
    feedparser may leave entry.link pointing at the CGI viewer instead.
    """
    seen: set[str] = set()
    out: list[str] = []
    # Any occurrence of the archive path (relative or inside absolute URL)
    # Prefer 5-segment SEC layout: .../data/CIK/accessionFolder/accession-dashed-index.htm
    patterns = (
        r"(?:https?://(?:www\.)?sec\.gov)?(/Archives/edgar/data/\d+/\d+/[A-Za-z0-9.\-]+-index\.html?)",
        r"(?:https?://(?:www\.)?sec\.gov)?(/Archives/edgar/data/\d+/[A-Za-z0-9.\-]+-index\.html?)",
    )
    for pat in patterns:
        for m in re.finditer(pat, text, flags=re.I):
            path = m.group(1)
            full = _normalize_sec_archive_url(path)
            if full and full not in seen:
                seen.add(full)
                out.append(full)
            if len(out) >= limit:
                return out
    return out


def _entry_index_url(entry) -> str:
    """Atom entries often expose the filing URL on links[] or id, not .link."""
    link = (getattr(entry, "link", None) or "").strip()
    link = _normalize_sec_archive_url(link)
    if link and "Archives/edgar/data/" in link:
        return link
    for L in getattr(entry, "links", None) or []:
        href = ""
        if isinstance(L, dict):
            href = (L.get("href") or "").strip()
        else:
            href = (getattr(L, "href", None) or "").strip()
        href = _normalize_sec_archive_url(href)
        if href and "Archives/edgar/data/" in href:
            return href
    eid = (getattr(entry, "id", None) or "").strip()
    eid = _normalize_sec_archive_url(eid)
    if eid and "Archives/edgar/data/" in eid:
        return eid
    return ""


# ---------------------------------------------------------------------------
# SEC HTTP
# ---------------------------------------------------------------------------

HEADERS: dict[str, str] = {}

ATOM_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=D&output=atom"


def fetch_latest_form_d_filings(limit: int = 15) -> list:
    print("Fetching latest Form D filings from SEC Atom feed…")
    r = requests.get(ATOM_URL, headers=HEADERS, timeout=60)
    if r.status_code != 200:
        print(f"SEC Atom error: HTTP {r.status_code}", file=sys.stderr)
        return []
    feed = feedparser.parse(r.content)
    if getattr(feed, "bozo", False) and getattr(feed, "bozo_exception", None):
        print(f"Feed parse warning: {feed.bozo_exception}", file=sys.stderr)
    entries = list(feed.entries)[:limit]
    verbose = os.environ.get("SEC_FORM_D_VERBOSE", "").strip() == "1"
    text = r.content.decode("utf-8", errors="replace") if r.content else ""
    if verbose:
        ft = getattr(feed, "feed", None)
        title = (getattr(ft, "title", None) or getattr(feed, "title", None) or "") if ft else ""
        print(f"  feed title={title!r} entries={len(entries)}", file=sys.stderr)

    hrefs = extract_index_urls_from_feed_xml(text, limit) if text else []
    if hrefs:
        if verbose:
            print(f"  extracted {len(hrefs)} index URLs from raw Atom/XML", file=sys.stderr)

        class _E:
            pass

        merged: list = []
        for i, h in enumerate(hrefs):
            e = _E()
            e.link = h
            e.links = []
            e.id = h
            if i < len(entries):
                src = entries[i]
                e.updated_parsed = getattr(src, "updated_parsed", None)
                e.published_parsed = getattr(src, "published_parsed", None)
            else:
                e.updated_parsed = None
                e.published_parsed = None
            merged.append(e)
        return merged

    if verbose and entries:
        e0 = entries[0]
        print(
            f"  debug entry[0]: link={getattr(e0, 'link', '')!r} id={getattr(e0, 'id', '')!r} "
            f"links={getattr(e0, 'links', [])!r}",
            file=sys.stderr,
        )

    return entries


def construct_xml_url(entry_link: str) -> tuple[str, str, str]:
    """
    Returns (xml_url, cik, accession_dashed).

    SEC uses either:
    - .../data/{cik}/{accession_no_dashes}/{accession_dashed}-index.htm  (common now)
    - .../data/{cik}/{accession_dashed}-index.htm  (older)
    """
    m = re.search(
        r"/Archives/edgar/data/(\d+)/(\d+)/([A-Za-z0-9.\-]+)-index\.html?\b",
        entry_link,
        re.I,
    )
    if m:
        cik, accession_no_dashes, accession_dashed = m.group(1), m.group(2), m.group(3)
        xml_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_no_dashes}/primary_doc.xml"
        return xml_url, cik, accession_dashed

    parts = entry_link.rstrip("/").split("/")
    if len(parts) < 2:
        raise ValueError(f"Unrecognized EDGAR index URL: {entry_link}")
    cik = parts[-2]
    last = parts[-1]
    accession_dashed = re.sub(r"-index\.html?$", "", last, flags=re.I)
    accession_no_dashes = accession_dashed.replace("-", "")
    xml_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{accession_no_dashes}/primary_doc.xml"
    return xml_url, cik, accession_dashed


def _local_tag(tag: str) -> str:
    if "}" in tag:
        return tag.rsplit("}", 1)[-1]
    return tag


def _first_text(root: ET.Element, *local_names: str) -> str | None:
    want = set(local_names)
    for el in root.iter():
        if _local_tag(el.tag) in want and el.text and el.text.strip():
            return el.text.strip()
    return None


def parse_total_offering(amount_raw: str | None) -> tuple[float | None, str | None]:
    if not amount_raw or not str(amount_raw).strip():
        return None, None
    s = str(amount_raw).strip()
    low = s.lower()
    if any(x in low for x in ("indefinite", "undisclosed", "n/a", "na", "none")):
        return None, s
    cleaned = re.sub(r"[$,\s]", "", s)
    if not cleaned or not re.fullmatch(r"\d+(\.\d+)?", cleaned):
        return None, s
    try:
        return float(cleaned), s
    except ValueError:
        return None, s


def parse_form_d_xml(xml_url: str) -> dict | None:
    r = requests.get(xml_url, headers=HEADERS, timeout=60)
    if r.status_code != 200:
        return None
    try:
        root = ET.fromstring(r.content)
    except ET.ParseError as e:
        print(f"XML parse error {xml_url}: {e}", file=sys.stderr)
        return None

    entity_name = (
        _first_text(root, "entityName", "issuerName", "nameOfIssuer")
        or "Unknown Entity"
    )
    industry = _first_text(root, "industryGroupType") or "Unknown Industry"
    amount_raw = _first_text(root, "totalOfferingAmount")
    usd, raw_kept = parse_total_offering(amount_raw)

    record_type = "VC_FUND" if "Pooled Investment Fund" in industry else "STARTUP"

    if usd is not None:
        amount_display = f"${usd:,.0f}"
    else:
        amount_display = raw_kept or amount_raw or "Indefinite/Undisclosed"

    return {
        "entity_name": entity_name,
        "record_type": record_type,
        "industry": industry,
        "amount_raised_usd": usd,
        "amount_display": amount_display,
        "total_offering_raw": raw_kept or amount_raw,
        "source_url": xml_url,
    }


def entry_filing_date(entry) -> datetime | None:
    t = getattr(entry, "updated_parsed", None) or getattr(entry, "published_parsed", None)
    if not t:
        return None
    try:
        return datetime(
            t.tm_year, t.tm_mon, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec, tzinfo=timezone.utc
        )
    except (TypeError, ValueError):
        return None


def slugify(name: str) -> str:
    s = name.lower().strip()
    s = re.sub(r"[''`]", "", s)
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = s.strip("-")[:80]
    return s or "firm"


# ---------------------------------------------------------------------------
# DATABASE (psycopg3)
# ---------------------------------------------------------------------------

UPSERT_FIRM_SQL = """
INSERT INTO vc_firms (
  id, firm_name, slug, description, firm_type,
  created_at, updated_at
) VALUES (
  %s, %s, %s, %s, 'VC'::"FirmType",
  NOW(), NOW()
)
ON CONFLICT (slug) DO UPDATE SET
  firm_name = EXCLUDED.firm_name,
  description = COALESCE(vc_firms.description, EXCLUDED.description),
  updated_at = NOW()
RETURNING id;
"""

INSERT_FUND_SQL = """
INSERT INTO vc_funds (
  id, firm_id, fund_name, size_usd, focus_summary,
  fund_status, fund_type, actively_deploying,
  created_at, updated_at
) VALUES (
  %s, %s, %s, %s, %s,
  'ACTIVE'::"FundStatus", 'TRADITIONAL'::"FundType", true,
  NOW(), NOW()
)
RETURNING id;
"""

INSERT_REG_SQL = """
INSERT INTO reg_d_filings (
  id, kind, entity_name, industry_group, total_offering_raw, amount_raised_usd,
  filing_date, source_url, index_url, sec_cik, sec_accession,
  vc_firm_id, vc_fund_id, created_at, updated_at
) VALUES (
  %s, %s::"RegDFilingKind", %s, %s, %s, %s,
  %s, %s, %s, %s, %s,
  %s, %s, NOW(), NOW()
)
ON CONFLICT (source_url) DO UPDATE SET
  entity_name = EXCLUDED.entity_name,
  industry_group = EXCLUDED.industry_group,
  total_offering_raw = EXCLUDED.total_offering_raw,
  amount_raised_usd = EXCLUDED.amount_raised_usd,
  filing_date = EXCLUDED.filing_date,
  index_url = EXCLUDED.index_url,
  sec_cik = EXCLUDED.sec_cik,
  sec_accession = EXCLUDED.sec_accession,
  vc_firm_id = COALESCE(reg_d_filings.vc_firm_id, EXCLUDED.vc_firm_id),
  vc_fund_id = COALESCE(reg_d_filings.vc_fund_id, EXCLUDED.vc_fund_id),
  updated_at = NOW();
"""

UPSERT_ALIAS_SQL = """
INSERT INTO vc_firm_aliases (
  id, firm_id, alias_type, alias_value, source, created_at, updated_at
) VALUES (
  %s, %s, 'EXTERNAL_REF'::"VCFirmAliasType", %s, 'sec_form_d_sync', NOW(), NOW()
)
ON CONFLICT (alias_type, alias_value) DO NOTHING;
"""


def sync_records(conn, records: list[dict]) -> None:
    desc = (
        "Ingested from SEC Form D (Regulation D). Amounts and classification are as filed; verify before use."
    )

    for rec in records:
        src = rec["source_url"]
        try:
            with conn.transaction():
                with conn.cursor() as cur:
                    cur.execute("SELECT id FROM reg_d_filings WHERE source_url = %s", (src,))
                    if cur.fetchone():
                        continue

                    filing_dt = rec.get("filing_date")
                    kind = "VC_FUND" if rec["record_type"] == "VC_FUND" else "STARTUP"
                    firm_id = None
                    fund_id = None

                    if kind == "VC_FUND":
                        base_slug = slugify(rec["entity_name"])
                        slug = f"{base_slug}-{rec['sec_cik']}"[:80]
                        firm_uuid = str(uuid.uuid4())
                        cur.execute(
                            UPSERT_FIRM_SQL,
                            (firm_uuid, rec["entity_name"], slug, desc),
                        )
                        row = cur.fetchone()
                        firm_id = row[0] if row else None
                        if not firm_id:
                            cur.execute("SELECT id FROM vc_firms WHERE slug = %s", (slug,))
                            r2 = cur.fetchone()
                            firm_id = r2[0] if r2 else None
                        if not firm_id:
                            print(
                                f"Firm upsert failed (reg_d only): {rec['entity_name']}",
                                file=sys.stderr,
                            )

                        alias_val = f"sec-cik-{rec['sec_cik']}"
                        if firm_id:
                            cur.execute(UPSERT_ALIAS_SQL, (str(uuid.uuid4()), firm_id, alias_val))

                            fund_name = f"{rec['entity_name']} (Form D {rec['sec_accession']})"[:500]
                            summary = (
                                f"SEC Form D; industry: {rec['industry']}; offering: {rec['amount_display']}. "
                                f"XML: {src}"
                            )[:8000]
                            fund_uuid = str(uuid.uuid4())
                            cur.execute(
                                INSERT_FUND_SQL,
                                (
                                    fund_uuid,
                                    firm_id,
                                    fund_name,
                                    rec.get("amount_raised_usd"),
                                    summary,
                                ),
                            )
                            fr = cur.fetchone()
                            fund_id = fr[0] if fr else None

                    reg_id = str(uuid.uuid4())
                    cur.execute(
                        INSERT_REG_SQL,
                        (
                            reg_id,
                            kind,
                            rec["entity_name"],
                            rec["industry"],
                            rec.get("total_offering_raw"),
                            rec.get("amount_raised_usd"),
                            filing_dt,
                            src,
                            rec.get("index_url"),
                            rec["sec_cik"],
                            rec["sec_accession"],
                            firm_id,
                            fund_id,
                        ),
                    )
        except Exception as e:
            print(f"DB error for {src}: {e}", file=sys.stderr)


def run_pipeline(limit: int) -> list[dict]:
    entries = fetch_latest_form_d_filings(limit=limit)
    out: list[dict] = []
    for entry in entries:
        link = _entry_index_url(entry)
        if not link:
            continue
        try:
            xml_url, cik, accession = construct_xml_url(link)
        except ValueError as e:
            print(f"Skip bad index URL: {e}", file=sys.stderr)
            continue
        time.sleep(0.15)
        parsed = parse_form_d_xml(xml_url)
        if not parsed:
            continue
        parsed["filing_date"] = entry_filing_date(entry)
        parsed["index_url"] = link
        parsed["sec_cik"] = cik.lstrip("0") or cik
        parsed["sec_accession"] = accession
        out.append(parsed)
    return out


def main() -> None:
    _load_dotenv_files()
    global HEADERS
    ua = os.environ.get("SEC_USER_AGENT", "").strip()
    if not ua:
        print(
            'Set SEC_USER_AGENT="YourOrg (email@domain.com)" per https://www.sec.gov/os/accessing-edgar-data',
            file=sys.stderr,
        )
        sys.exit(1)
    HEADERS = {"User-Agent": ua}

    limit = int(os.environ.get("SEC_FORM_D_LIMIT", "15"))

    records = run_pipeline(limit)
    print(f"\n--- Parsed {len(records)} Form D filing(s) ---")
    for r in records:
        if r["record_type"] == "VC_FUND":
            print(f"[VC_FUND] {r['entity_name']} — {r['amount_display']}")
        else:
            print(f"[STARTUP] {r['entity_name']} ({r['industry']}) — {r['amount_display']}")

    if os.environ.get("SEC_FORM_D_DRY_RUN", "").strip() == "1":
        print("SEC_FORM_D_DRY_RUN=1 — skipping database writes.")
        return

    import psycopg

    conn_kw = postgres_connect_kwargs(resolve_database_url())
    if os.environ.get("SEC_FORM_D_VERBOSE", "").strip() == "1":
        print(
            f"  db host={conn_kw.get('host')!r} port={conn_kw.get('port')!r} dbname={conn_kw.get('dbname')!r} "
            f"user={conn_kw.get('user')!r} sslmode={conn_kw.get('sslmode')!r}",
            file=sys.stderr,
        )

    try:
        conn = psycopg.connect(**conn_kw)
    except UnicodeError as e:
        print(
            "Could not resolve DATABASE host (IDNA). Encode @ in password as %40; re-copy host from Supabase.",
            file=sys.stderr,
        )
        raise SystemExit(1) from e
    try:
        sync_records(conn, records)
    finally:
        conn.close()

    print("Database sync complete.")


if __name__ == "__main__":
    main()
