#!/bin/bash
# ============================================================
# SDub Media FilmProject Pro — Daily Backup Script
# Exports all Supabase tables to timestamped JSON files
# Run manually: bash scripts/backup.sh
# Schedule daily: see instructions below
# ============================================================

BACKUP_DIR="$(dirname "$0")/../backups"
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
DEST="${BACKUP_DIR}/${TIMESTAMP}"

API="https://fjnfmvzdnhgiapuawzpp.supabase.co/rest/v1"
KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZqbmZtdnpkbmhnaWFwdWF3enBwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5MDczOTQsImV4cCI6MjA4ODQ4MzM5NH0.xupmrDaz5IKLK5QzFwnnl8rZCDiox6bzNXvmJUXgxEQ"

HEADERS=(-H "apikey: ${KEY}" -H "Authorization: Bearer ${KEY}")

mkdir -p "${DEST}"

TABLES=("clients" "crew_members" "locations" "project_types" "projects" "marketing_expenses" "user_profiles")

echo "=== SDub Media Backup — ${TIMESTAMP} ==="

for TABLE in "${TABLES[@]}"; do
  echo "  Backing up ${TABLE}..."
  curl -s "${API}/${TABLE}?select=*" "${HEADERS[@]}" > "${DEST}/${TABLE}.json"
done

# Count records
echo ""
echo "Backup complete: ${DEST}"
for TABLE in "${TABLES[@]}"; do
  COUNT=$(python3 -c "import json; print(len(json.load(open('${DEST}/${TABLE}.json'))))" 2>/dev/null || echo "?")
  echo "  ${TABLE}: ${COUNT} records"
done

# Clean up backups older than 30 days
find "${BACKUP_DIR}" -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null
echo ""
echo "Old backups (>30 days) cleaned up."
