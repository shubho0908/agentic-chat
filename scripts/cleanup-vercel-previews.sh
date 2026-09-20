#!/usr/bin/env bash
# Safe Vercel preview cleanup - keeps latest 2 previews + all production.
# Usage: ./scripts/cleanup-vercel-previews.sh [project] [--yes]
# Without --yes it only shows what WOULD be deleted (dry-run).
set -euo pipefail

PROJECT="agentic-chat"
CONFIRM=""

for arg in "$@"; do
  case "$arg" in
    --yes) CONFIRM="--yes" ;;
    -h|--help)
      sed -n '2,4p' "$0"
      exit 0
      ;;
    *) PROJECT="$arg" ;;
  esac
done

echo "Fetching previews for $PROJECT (newest first)..."
if ! OUT=$(vercel list "$PROJECT" --yes 2>&1); then
  echo "ERROR: 'vercel list $PROJECT' failed (auth, network, or unknown project?). Aborting." >&2
  echo "$OUT" | grep -v ExperimentalWarning | grep -v trace-warnings || true >&2
  exit 1
fi
OUT=$(echo "$OUT" | grep -v ExperimentalWarning | grep -v trace-warnings || true)

# Extract preview URLs in order, newest first
PREVIEWS=$(echo "$OUT" | awk '/vercel\.app/ && /Preview/ && !/Age/ {for(i=1;i<=NF;i++) if ($i ~ /^https:\/\/.*vercel\.app$/) print $i}' | awk '!seen[$0]++')

TOTAL=$(echo "$PREVIEWS" | grep -c . || true)
if [ "$TOTAL" -le 2 ]; then
  echo "Only $TOTAL previews found - nothing to delete. Production untouched."
  exit 0
fi

KEEP=$(echo "$PREVIEWS" | head -n 2)
DELETE=$(echo "$PREVIEWS" | tail -n +3)
DEL_COUNT=$(echo "$DELETE" | grep -c . || true)

echo "Total previews: $TOTAL | Keep latest 2 | To delete: $DEL_COUNT"
echo "--- KEEP ---"
echo "$KEEP"
echo "--- TO DELETE ---"
echo "$DELETE"

if [ "$CONFIRM" != "--yes" ]; then
  echo ""
  echo "Dry-run only. Re-run with --yes to actually delete (uses --safe, production protected)."
  exit 0
fi

FAILED=0
while IFS= read -r url; do
  [ -z "$url" ] && continue
  echo "rm $url"
  RM_OUT=$(vercel rm "$url" --safe --yes 2>&1)
  RM_STATUS=$?
  echo "$RM_OUT" | grep -v ExperimentalWarning | grep -v trace-warnings || true
  if [ "$RM_STATUS" -eq 0 ]; then
    echo "  OK"
  elif echo "$RM_OUT" | grep -q "Could not find unaliased"; then
    echo "  SKIP (has active alias, protected by --safe)"
  else
    echo "  FAILED (exit $RM_STATUS)"
    FAILED=$((FAILED + 1))
  fi
  sleep 1
done <<< "$DELETE"

if [ "$FAILED" -gt 0 ]; then
  echo "Done with $FAILED failure(s) - storage may not be fully reclaimed." >&2
  exit 1
fi
echo "Done."
