#!/usr/bin/env bash
# Only the isolated OVspot V1.1 preview API is updated. Never touches production.
# Run: sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/deploy-kv8-preview.sh
set -Eeuo pipefail
ROOT=/home/ubuntu/ovspot-v11-review-20261105
TARGET="$ROOT/backend/ovspot_app_api.py"
SOURCE="$ROOT/app-preview/backend/ovspot_app_api.py"
SERVICE=ovspot-v11-preview-api.service
RELEASE="$ROOT/release"
LIVE=/opt/ovspot-app-api/ovspot_app_api.py
BASELINE_SHA=6078f86f146c34a4c8467ea8b2c4941fc25d96cc8e2d593a865acfa9327faa69
CANDIDATE_SHA=6b0b8e7a8d238778391f6057eca5e5895e17681e3de5233af84abb8f4a086d8b
LIVE_SHA=18e52128f075a45acbabd43fe4393b53749f93220ac8c7316fb8b80d1039b443
if [[ $EUID -ne 0 ]]; then echo 'Use sudo in authorized VPS terminal'; exit 2; fi
if [[ "$(sha256sum "$TARGET" | cut -d' ' -f1)" != "$BASELINE_SHA" ]]; then echo "Preview backend changed since review"; exit 3; fi
if [[ "$(sha256sum "$SOURCE" | cut -d' ' -f1)" != "$CANDIDATE_SHA" ]]; then echo "KV8 candidate modified since review"; exit 4; fi
if [[ "$(sha256sum "$LIVE" | cut -d' ' -f1)" != "$LIVE_SHA" ]]; then echo "Production source changed since review"; exit 5; fi
if [[ $(systemctl is-active "$SERVICE") != active ]]; then echo "Preview service inactive"; exit 6; fi
if ! curl -fsS --max-time 7 https://ovspot.nl/app/v1-preview/health | grep -q '"versie":"1.1.0-staging"'; then
    echo "Preview baseline health/version mismatch"; exit 7
fi
if ! curl -fsS --max-time 7 https://ovspot.nl/app/v1/health | grep -q '"versie":"1.0.0"'; then
    echo "Production baseline health mismatch"; exit 8
fi
(cd "$ROOT/app-preview/backend" && python3 -m unittest -q test_ovspot_app_api.py test_v11_regressions.py test_kv8_preview.py)
BACKUP="$RELEASE/rollback-kv8-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -p "$TARGET" "$BACKUP/ovspot_app_api.py"
echo "$BACKUP" > "$RELEASE/kv8-active-backup.path"
rollback_failure() {
    trap - ERR
    echo "KV8_PREVIEW_DEPLOY_FAILED: reverting only preview API"
    cp -p "$BACKUP/ovspot_app_api.py" "$TARGET" || true
    systemctl restart "$SERVICE" || true
    curl -fsS --max-time 7 https://ovspot.nl/app/v1-preview/health || true
    exit 10
}
trap rollback_failure ERR
cp -p "$SOURCE" "$TARGET"
python3 -m py_compile "$TARGET"
systemctl restart "$SERVICE"
for attempt in {1..16}; do
    if curl -fsS --max-time 3 http://127.0.0.1:18111/app/v1/health | grep -q '"versie":"1.1.1-kv8-preview"'; then break; fi
    sleep .5
done
python3 "$RELEASE/smoke_kv8_preview.py"
systemctl is-active --quiet "$SERVICE"
echo "KV8_PREVIEW_DEPLOYED_OK"
echo "Preview https://ovspot.nl/app/v1-preview/health"
echo "Rollback backup $BACKUP"
echo "Production API and map unchanged"
trap - ERR
