#!/bin/bash
# ============================================================
# SDub Media FilmProject Pro — Restore from Backup
# Usage: bash scripts/restore.sh backups/2026-03-17_050000
# WARNING: This will OVERWRITE all current data!
# ============================================================

if [ -z "$1" ]; then
  echo "Usage: bash scripts/restore.sh <backup-folder>"
  echo ""
  echo "Available backups:"
  ls -d backups/*/ 2>/dev/null || echo "  No backups found"
  exit 1
fi

BACKUP_DIR="$1"
if [ ! -d "${BACKUP_DIR}" ]; then
  echo "Error: Backup folder '${BACKUP_DIR}' not found"
  exit 1
fi

API="https://fjnfmvzdnhgiapuawzpp.supabase.co/rest/v1"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbmZtdnpkbmhnaWFwdWF3enBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDczOTQsImV4cCI6MjA4ODQ4MzM5NH0.xupmrDaz5IKLK5QzFwnnl8rZCDiox6bzNXvmJUXgxEQ"

HEADERS=(-H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}" -H "Content-Type: application/json")

echo "=== SDub Media Restore ==="
echo "Restoring from: ${BACKUP_DIR}"
echo ""
read -p "WARNING: This will OVERWRITE all current data. Continue? (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

# Restore order matters for foreign keys - delete in reverse, insert in order
DELETE_ORDER=("projects" "marketing_expenses" "user_profiles" "crew_members" "locations" "project_types" "clients")
INSERT_ORDER=("clients" "project_types" "locations" "crew_members" "projects" "marketing_expenses" "user_profiles")

echo ""
echo "Clearing existing data..."
for TABLE in "${DELETE_ORDER[@]}"; do
  curl -s -X DELETE "${API}/${TABLE}?id=neq.impossible_id_that_matches_nothing" \
    "${HEADERS[@]}" -H "Prefer: return=minimal" > /dev/null
  # Use a broader delete - delete all rows
  curl -s -X DELETE "${API}/${TABLE}?select=id" \
    "${HEADERS[@]}" -H "Prefer: return=minimal" \
    -G --data-urlencode "id=not.is.null" > /dev/null
  echo "  Cleared ${TABLE}"
done

echo ""
echo "Restoring data..."
for TABLE in "${INSERT_ORDER[@]}"; do
  FILE="${BACKUP_DIR}/${TABLE}.json"
  if [ -f "${FILE}" ]; then
    COUNT=$(python3 -c "import json; data=json.load(open('${FILE}')); print(len(data))" 2>/dev/null || echo "0")
    if [ "${COUNT}" != "0" ]; then
      curl -s -X POST "${API}/${TABLE}" \
        "${HEADERS[@]}" \
        -H "Prefer: return=minimal,resolution=merge-duplicates" \
        -d @"${FILE}" > /dev/null
      echo "  Restored ${TABLE}: ${COUNT} records"
    else
      echo "  Skipped ${TABLE}: empty"
    fi
  else
    echo "  Skipped ${TABLE}: no backup file"
  fi
done

echo ""
echo "Restore complete!"
