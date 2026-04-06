#!/bin/zsh

cd ~/VEKTA\ APP

# Load env
set -a
source .env.local
set +a

# === RUN OPTIONS ===

# Firm enrichment
# ENRICH_MAX=30 npx tsx scripts/enrich-all.ts

# Investor LinkedIn backfill
# DRY_RUN=true ENRICH_MAX=20 npx tsx scripts/backfill-investor-linkedin.ts

echo "Choose a command and uncomment it"
