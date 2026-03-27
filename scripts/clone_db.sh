#!/usr/bin/env bash
# clone_db.sh – Dump/restore helper for the Supabase clone pipeline.
#
# Usage:
#   # Dump source (custom format — default)
#   ./scripts/clone_db.sh dump
#
#   # Dump source (plain SQL)
#   DUMP_FORMAT=plain ./scripts/clone_db.sh dump
#
#   # Restore to destination
#   ./scripts/clone_db.sh restore
#
# Required environment variables (source):
#   SRC_DB_HOST, SRC_DB_PORT, SRC_DB_NAME, SRC_DB_USER, SRC_DB_PASSWORD
#
# Required environment variables (destination):
#   DST_DB_HOST, DST_DB_PORT, DST_DB_NAME, DST_DB_USER, DST_DB_PASSWORD
#
# Optional:
#   DUMP_FORMAT  – custom (default) | plain
#   DUMP_FILE    – output path (default: db.dump or db.sql)
#   EXTRA_SCHEMAS – space-separated schemas to include (default: public)

set -euo pipefail

DUMP_FORMAT="${DUMP_FORMAT:-custom}"
EXTRA_SCHEMAS="${EXTRA_SCHEMAS:-public}"

if [ "$DUMP_FORMAT" = "custom" ]; then
  DUMP_FILE="${DUMP_FILE:-db.dump}"
else
  DUMP_FILE="${DUMP_FILE:-db.sql}"
fi

CMD="${1:-}"

# ── Helpers ──────────────────────────────────────────────────────────────────

check_tool() {
  if ! command -v "$1" &>/dev/null; then
    echo "ERROR: '$1' is not installed. Install postgresql-client." >&2
    exit 1
  fi
}

# ── Dump ─────────────────────────────────────────────────────────────────────

do_dump() {
  check_tool pg_dump
  : "${SRC_DB_HOST:?SRC_DB_HOST is required}"
  : "${SRC_DB_PORT:?SRC_DB_PORT is required}"
  : "${SRC_DB_NAME:?SRC_DB_NAME is required}"
  : "${SRC_DB_USER:?SRC_DB_USER is required}"
  : "${SRC_DB_PASSWORD:?SRC_DB_PASSWORD is required}"

  export PGPASSWORD="$SRC_DB_PASSWORD"

  SCHEMA_FLAGS=()
  for schema in $EXTRA_SCHEMAS; do
    SCHEMA_FLAGS+=("--schema=$schema")
  done

  echo "Dumping ${SRC_DB_HOST}:${SRC_DB_PORT}/${SRC_DB_NAME} → ${DUMP_FILE} (format: ${DUMP_FORMAT})"

  if [ "$DUMP_FORMAT" = "custom" ]; then
    pg_dump \
      --host="$SRC_DB_HOST" \
      --port="$SRC_DB_PORT" \
      --username="$SRC_DB_USER" \
      --dbname="$SRC_DB_NAME" \
      --format=custom \
      --no-owner \
      --no-acl \
      --no-privileges \
      "${SCHEMA_FLAGS[@]}" \
      --file="$DUMP_FILE"
  else
    pg_dump \
      --host="$SRC_DB_HOST" \
      --port="$SRC_DB_PORT" \
      --username="$SRC_DB_USER" \
      --dbname="$SRC_DB_NAME" \
      --format=plain \
      --no-owner \
      --no-acl \
      --no-privileges \
      "${SCHEMA_FLAGS[@]}" \
      --file="$DUMP_FILE"
  fi

  echo "Dump complete: $(du -sh "$DUMP_FILE" | cut -f1)"
  unset PGPASSWORD
}

# ── Restore ──────────────────────────────────────────────────────────────────

do_restore() {
  : "${DST_DB_HOST:?DST_DB_HOST is required}"
  : "${DST_DB_PORT:?DST_DB_PORT is required}"
  : "${DST_DB_NAME:?DST_DB_NAME is required}"
  : "${DST_DB_USER:?DST_DB_USER is required}"
  : "${DST_DB_PASSWORD:?DST_DB_PASSWORD is required}"

  export PGPASSWORD="$DST_DB_PASSWORD"

  if [ ! -f "$DUMP_FILE" ]; then
    # Auto-detect format
    if [ -f "db.dump" ]; then
      DUMP_FILE="db.dump"
      DUMP_FORMAT="custom"
    elif [ -f "db.sql" ]; then
      DUMP_FILE="db.sql"
      DUMP_FORMAT="plain"
    else
      echo "ERROR: No dump file found (db.dump or db.sql)." >&2
      exit 1
    fi
  fi

  echo "Restoring ${DUMP_FILE} → ${DST_DB_HOST}:${DST_DB_PORT}/${DST_DB_NAME}"

  if [ "$DUMP_FORMAT" = "custom" ] || [[ "$DUMP_FILE" == *.dump ]]; then
    check_tool pg_restore
    pg_restore \
      --host="$DST_DB_HOST" \
      --port="$DST_DB_PORT" \
      --username="$DST_DB_USER" \
      --dbname="$DST_DB_NAME" \
      --no-owner \
      --no-acl \
      --no-privileges \
      --clean \
      --if-exists \
      "$DUMP_FILE" || {
        echo "pg_restore exited with errors (some are non-fatal — check output above)." >&2
      }
  else
    check_tool psql
    psql \
      --host="$DST_DB_HOST" \
      --port="$DST_DB_PORT" \
      --username="$DST_DB_USER" \
      --dbname="$DST_DB_NAME" \
      --file="$DUMP_FILE"
  fi

  echo "Restore complete."
  unset PGPASSWORD
}

# ── Entry ────────────────────────────────────────────────────────────────────

case "$CMD" in
  dump)    do_dump ;;
  restore) do_restore ;;
  *)
    echo "Usage: $0 dump | restore" >&2
    exit 1
    ;;
esac
