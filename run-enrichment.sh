#!/bin/bash
# Enrichment launcher — runs all 4 pipelines in parallel with log files
# Survives terminal close via nohup + disown
# Usage: bash run-enrichment.sh

cd "$(dirname "$0")"

LOG_DIR="$(pwd)/logs"
mkdir -p "$LOG_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚀 Starting enrichment pipelines at $TIMESTAMP"
echo "   Logs → $LOG_DIR"
echo ""

nohup npx tsx scripts/enrich-investor-profiles.ts > "$LOG_DIR/investor-profiles-$TIMESTAMP.log" 2>&1 &
P1=$!
disown $P1
echo "  [PID $P1] enrich-investor-profiles  → logs/investor-profiles-$TIMESTAMP.log"

nohup npm run db:enrich:wikipedia > "$LOG_DIR/wikipedia-$TIMESTAMP.log" 2>&1 &
P2=$!
disown $P2
echo "  [PID $P2] enrich-wikipedia          → logs/wikipedia-$TIMESTAMP.log"

nohup npm run db:enrich:emails:waterfall > "$LOG_DIR/emails-waterfall-$TIMESTAMP.log" 2>&1 &
P3=$!
disown $P3
echo "  [PID $P3] enrich-emails-waterfall   → logs/emails-waterfall-$TIMESTAMP.log"

nohup npm run db:sync:investor-photos > "$LOG_DIR/headshots-$TIMESTAMP.log" 2>&1 &
P4=$!
disown $P4
echo "  [PID $P4] sync-investor-photos      → logs/headshots-$TIMESTAMP.log"

echo ""
echo "✅ All 4 running — safe to close this terminal."
echo ""
echo "Watch logs:"
echo "  tail -f \"$LOG_DIR/investor-profiles-$TIMESTAMP.log\""
echo ""
echo "Kill all:"
echo "  kill $P1 $P2 $P3 $P4"
