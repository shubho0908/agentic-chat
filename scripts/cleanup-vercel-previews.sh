#!/usr/bin/env bash
# Safe Vercel preview cleanup - keeps latest 2 previews + all production.
# Usage: ./scripts/cleanup-vercel-previews.sh [project] [--yes]
# Without --yes it only shows what WOULD be deleted (dry-run).
set -euo pipefail

PROJECT="${1:-agentic-chat}"
CONFIRM="${2:-}"

echo "Fetching previews for $PROJECT (newest first)..."
OUT=$(vercel list "$PROJECT" --yes 2>&1 | grep -v ExperimentalWarning | grep -v trace-warnings || true)

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

echo "$DELETE" | while read -r url; do
  [ -z "$url" ] && continue
  echo "rm $url"
  vercel rm "$url" --safe --yes 2>&1 | grep -v ExperimentalWarning | grep -v trace-warnings || echo "  SKIP (aliased/protected)"
  sleep 1
done
echo "Done."
