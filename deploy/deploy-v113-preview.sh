#!/usr/bin/env bash
# Changes ONLY the independent OVspot V1.1 preview API, never /app/v1 or the map.
# Use from an authorized VPS terminal with sudo.
set -Eeuo pipefail
ROOT=/home/ubuntu/ovspot-v11-review-20261105
REL="$ROOT/release"
TARGET="$ROOT/backend/ovspot_app_api.py"
SOURCE="$ROOT/app-position-preview/backend/ovspot_app_api.py"
LIVE=/opt/ovspot-app-api/ovspot_app_api.py
UNIT=ovspot-v11-preview-api.service
BASE_SHA=5e19cd85088c1837781ef24bd4f6d1637e991ccdd6cf8e85c7349e0664cf65ac
NEW_SHA=7aebe579f647c4df006719a59fd4d9ae0a8e1a64dd0d362bb5a65aabfb10610b
LIVE_SHA=18e52128f075a45acbabd43fe4393b53749f93220ac8c7316fb8b80d1039b443
sha() { sha256sum "$1" | cut -d' ' -f1; }
[[ "$EUID" -eq 0 ]] || { echo "Use sudo in your authorized VPS shell"; exit 2; }
[[ "$(sha "$TARGET")" == "$BASE_SHA" ]] || { echo 'PREVIEW_BASELINE_CHANGED'; exit 3; }
[[ "$(sha "$SOURCE")" == "$NEW_SHA" ]] || { echo 'QA_CANDIDATE_CHANGED'; exit 4; }
[[ "$(sha "$LIVE")" == "$LIVE_SHA" ]] || { echo 'PRODUCTION_CHANGED'; exit 5; }
systemctl is-active --quiet "$UNIT" || { echo 'PREVIEW_SERVICE_NOT_ACTIVE'; exit 6; }
curl -fsS --max-time 7 https://ovspot.nl/app/v1-preview/health | grep -q '"versie":"1.1.2-kv8-preview"' || { echo 'PUBLIC_PREVIEW_NOT_V112'; exit 7; }
curl -fsS --max-time 7 https://ovspot.nl/app/v1/health | grep -q '"versie":"1.0.0"' || { echo 'PRODUCTION_API_NOT_V100'; exit 8; }
(cd "$ROOT/app-position-preview/backend" && python3 -m unittest -q test_ovspot_app_api.py test_v11_regressions.py test_kv8_preview.py test_kv8_summary.py test_position_geo.py)
BACKUP="$REL/rollback-v113-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -p "$TARGET" "$BACKUP/ovspot_app_api.py"
[[ "$(sha "$BACKUP/ovspot_app_api.py")" == "$BASE_SHA" ]] || { echo 'BACKUP_INTEGRITY_FAILED'; exit 9; }
printf '%s\n' "$BACKUP" > "$REL/v113-active-backup.path"
rollback_on_failure() {
  trap - ERR
  echo 'V113_PREVIEW_DEPLOY_FAILED: restoring previous preview API'
  cp -p "$BACKUP/ovspot_app_api.py" "$TARGET" || true
  systemctl restart "$UNIT" || true
  curl -fsS --max-time 7 https://ovspot.nl/app/v1-preview/health || true
  exit 10
}
trap rollback_on_failure ERR
cp -p "$SOURCE" "$TARGET"
python3 -m py_compile "$TARGET"
systemctl restart "$UNIT"
READY=0
for attempt in {1..20}; do
  if curl -fsS --max-time 3 http://127.0.0.1:18111/app/v1/health 2>/dev/null | grep -q '"versie":"1.1.3-position-preview"'; then
    READY=1
    break
  fi
  sleep 0.5
done
[[ "$READY" == 1 ]]
python3 "$REL/smoke_v113_preview.py"
systemctl is-active --quiet "$UNIT"
[[ "$(sha "$LIVE")" == "$LIVE_SHA" ]]
echo "V113_PREVIEW_DEPLOYED_OK"
echo "Rollback: $BACKUP"
echo "Production API and OVspot map remain unchanged."
trap - ERR
