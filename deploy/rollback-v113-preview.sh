#!/usr/bin/env bash
# Undo only the OVspot preview V1.1.3 API; refuse overwriting a newer change.
set -Eeuo pipefail
ROOT=/home/ubuntu/ovspot-v11-review-20261105
REL="$ROOT/release"
TARGET="$ROOT/backend/ovspot_app_api.py"
UNIT=ovspot-v11-preview-api.service
NEW_SHA=7aebe579f647c4df006719a59fd4d9ae0a8e1a64dd0d362bb5a65aabfb10610b
BASE_SHA=5e19cd85088c1837781ef24bd4f6d1637e991ccdd6cf8e85c7349e0664cf65ac
sha(){ sha256sum "$1" | cut -d' ' -f1; }
[[ "$EUID" -eq 0 ]] || { echo 'Use sudo'; exit 2; }
[[ -f "$REL/v113-active-backup.path" ]] || { echo 'NO_ROLLBACK_POINTER'; exit 3; }
BACKUP="$(cat "$REL/v113-active-backup.path")"
[[ -f "$BACKUP/ovspot_app_api.py" ]] || { echo 'BACKUP_MISSING'; exit 4; }
[[ "$(sha "$BACKUP/ovspot_app_api.py")" == "$BASE_SHA" ]] || { echo 'BACKUP_CHANGED'; exit 5; }
[[ "$(sha "$TARGET")" == "$NEW_SHA" ]] || { echo 'PREVIEW_CHANGED_SINCE_DEPLOY'; exit 6; }
cp -p "$BACKUP/ovspot_app_api.py" "$TARGET"
systemctl restart "$UNIT"
for attempt in {1..20}; do
  if curl -fsS --max-time 3 http://127.0.0.1:18111/app/v1/health 2>/dev/null | grep -q '"versie":"1.1.2-kv8-preview"'; then
    echo 'V113_PREVIEW_ROLLBACK_OK'
    exit 0
  fi
  sleep 0.5
done
echo 'PREVIEW_ROLLBACK_HEALTH_FAILED'
exit 7
