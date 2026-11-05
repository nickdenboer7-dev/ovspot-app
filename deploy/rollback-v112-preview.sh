#!/usr/bin/env bash
# Roll back only KV8 processing inside OVspot V1.1 preview.
set -Eeuo pipefail
ROOT=/home/ubuntu/ovspot-v11-review-20261105
RELEASE="$ROOT/release"
TARGET="$ROOT/backend/ovspot_app_api.py"
SERVICE=ovspot-v11-preview-api.service
if [[ $EUID -ne 0 ]]; then echo 'Use sudo'; exit 2; fi
if [[ ! -f "$RELEASE/v112-active-backup.path" ]]; then echo 'No KV8 rollback pointer'; exit 3; fi
BACKUP="$(cat "$RELEASE/v112-active-backup.path")"
if [[ ! -f "$BACKUP/ovspot_app_api.py" ]]; then echo 'KV8 rollback file missing'; exit 4; fi
CURRENT="$(sha256sum "$TARGET" | cut -d' ' -f1)"
if [[ "$CURRENT" != 5e19cd85088c1837781ef24bd4f6d1637e991ccdd6cf8e85c7349e0664cf65ac ]]; then
    echo 'Preview backend has changed since KV8 deploy; refusing overwrite'
    exit 5
fi
cp -p "$BACKUP/ovspot_app_api.py" "$TARGET"
systemctl restart "$SERVICE"
curl -fsS --max-time 7 https://ovspot.nl/app/v1-preview/health
echo
echo V112_PREVIEW_ROLLBACK_OK
