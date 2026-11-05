#!/usr/bin/env bash
# Roll back only KV8 processing inside OVspot V1.1 preview.
set -Eeuo pipefail
ROOT=/home/ubuntu/ovspot-v11-review-20261105
RELEASE="$ROOT/release"
TARGET="$ROOT/backend/ovspot_app_api.py"
SERVICE=ovspot-v11-preview-api.service
if [[ $EUID -ne 0 ]]; then echo 'Use sudo'; exit 2; fi
if [[ ! -f "$RELEASE/kv8-active-backup.path" ]]; then echo 'No KV8 rollback pointer'; exit 3; fi
BACKUP="$(cat "$RELEASE/kv8-active-backup.path")"
if [[ ! -f "$BACKUP/ovspot_app_api.py" ]]; then echo 'KV8 rollback file missing'; exit 4; fi
CURRENT="$(sha256sum "$TARGET" | cut -d' ' -f1)"
if [[ "$CURRENT" != 6b0b8e7a8d238778391f6057eca5e5895e17681e3de5233af84abb8f4a086d8b ]]; then
    echo 'Preview backend has changed since KV8 deploy; refusing overwrite'
    exit 5
fi
cp -p "$BACKUP/ovspot_app_api.py" "$TARGET"
systemctl restart "$SERVICE"
curl -fsS --max-time 7 https://ovspot.nl/app/v1-preview/health
echo
echo KV8_PREVIEW_ROLLBACK_OK
