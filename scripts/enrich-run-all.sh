#!/usr/bin/env bash
# enrich-run-all.sh
# =================
# Full enrichment sweep — runs every enrichment pass in priority order.
# Designed to run unattended; logs each step's stdout/stderr.
#
# Usage (from project root):
#   bash scripts/enrich-run-all.sh
#
# Background (keeps running after you close terminal):
#   nohup bash scripts/enrich-run-all.sh > data/enrichment-logs/run-all.log 2>&1 &
#   echo "PID: $!"     # note the PID to kill later if needed
#
# To watch progress:
#   tail -f data/enrichment-logs/run-all.log

set -euo pipefail

LOG_DIR="data/enrichment-logs"
mkdir -p "$LOG_DIR"

START_TIME=$(date +%s)

step() {
  local label="$1"; shift
  local log_file="$LOG_DIR/step-${label}-$(date +%Y%m%dT%H%M%S).log"
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  STEP: $label"
  echo "  Started: $(date)"
  echo "  Log: $log_file"
  echo "════════════════════════════════════════════════════════════"
  if "$@" 2>&1 | tee "$log_file"; then
    echo "  ✅ $label — DONE ($(date))"
  else
    echo "  ⚠️  $label — exited non-zero, continuing..."
  fi
}

echo "════════════════════════════════════════════════════════════"
echo "  Vekta Full Enrichment Sweep"
echo "  Started: $(date)"
echo "════════════════════════════════════════════════════════════"

# ── INVESTORS ────────────────────────────────────────────────────────────────

# 1. Rule-based inference: seniority, investor_type, short_summary (no API, instant)
step "phase2-rule-based" pnpm enrich:investors:phase2:rules

# 2. Firm investor fields from firm websites (bio, email, LinkedIn, headshot, city)
step "person-website-profiles" \
  env INVESTOR_PROFILE_MAX=0 \
      INVESTOR_PROFILE_INCOMPLETE_ONLY=1 \
      INVESTOR_PROFILE_DELAY_MS=300 \
  pnpm db:backfill:person-website-profiles

# 3. Firm investor list refresh from firm websites (catches team page additions)
step "firm-investors-from-website" \
  env INVESTOR_BACKFILL_MAX=0 \
      INVESTOR_BACKFILL_DELAY_MS=300 \
  pnpm db:backfill:firm-investors-website

# ── FIRMS ─────────────────────────────────────────────────────────────────────

# 4. Firm logos (Clearbit → Logo.dev → Brandfetch waterfall)
step "firm-logos" \
  env LOGO_MAX=0 \
      LOGO_CONCURRENCY=6 \
  pnpm enrich:firm-logos

# 5. Firm HQ / location from firm websites
step "firm-hq-from-website" \
  env HQ_BACKFILL_MAX=0 \
      HQ_BACKFILL_DELAY_MS=400 \
      HQ_BACKFILL_READY_ONLY=1 \
  pnpm db:backfill:firm-hq-website

# 6. Firm portfolio pages (fills portfolio companies)
step "firm-portfolio-page" \
  env PORTFOLIO_PAGE_MAX=0 \
      PORTFOLIO_PAGE_CONCURRENCY=6 \
  pnpm db:backfill:firm-portfolio-page

# ── FUND DATA (SEC public filings — no API key needed) ───────────────────────

# 7. SEC EDGAR Form D filings — fund sizes, vintage years, num_funds
step "funds-edgar" \
  env EDGAR_DRY_RUN=0 \
  pnpm vc:enrich-funds:edgar

# 8. SEC ADV filings — AUM, headcount, adviser details
step "funds-adv" \
  pnpm vc:enrich-funds:adv

# ── DONE ──────────────────────────────────────────────────────────────────────

END_TIME=$(date +%s)
ELAPSED=$(( END_TIME - START_TIME ))
MINS=$(( ELAPSED / 60 ))
SECS=$(( ELAPSED % 60 ))

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✅ Full enrichment sweep complete"
echo "  Finished: $(date)"
echo "  Total time: ${MINS}m ${SECS}s"
echo "  Logs in: $LOG_DIR"
echo "════════════════════════════════════════════════════════════"
