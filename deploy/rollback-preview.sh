#!/usr/bin/env bash
# Explicit rollback of only the isolated OVspot V1.1 preview route/service.
# sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/rollback-preview.sh
set -Eeuo pipefail
ROOT=/home/ubuntu/ovspot-v11-review-20261105
RELEASE="$ROOT/release"
SITE=/etc/nginx/sites-available/ov-kaart
UNIT=/etc/systemd/system/ovspot-v11-preview-api.service
SNIPPET=/etc/nginx/snippets/ovspot-v11-preview.conf
SERVICE=ovspot-v11-preview-api.service
if [[ $EUID -ne 0 ]]; then echo 'Requires sudo'; exit 2; fi
if [[ ! -f "$RELEASE/active-backup.path" ]]; then echo 'No preview deployment backup'; exit 3; fi
BACKUP="$(cat "$RELEASE/active-backup.path")"
if [[ ! -f "$BACKUP/ov-kaart" || ! -f "$BACKUP/deployed-nginx.sha" ]]; then echo 'Backup incomplete'; exit 4; fi
CURRENT="$(sha256sum "$SITE" | cut -d' ' -f1)"
EXPECTED="$(cat "$BACKUP/deployed-nginx.sha")"
if [[ "$CURRENT" != "$EXPECTED" ]]; then echo 'Nginx has changed since deployment; refusing overwrite'; exit 5; fi
cp -a "$BACKUP/ov-kaart" "$SITE"
nginx -t
systemctl reload nginx
systemctl disable --now "$SERVICE"
rm -f "$UNIT" "$SNIPPET"
systemctl daemon-reload
if curl -fsS --max-time 5 https://ovspot.nl/app/v1/health >/dev/null; then
    echo 'PREVIEW_ROLLBACK_OK: live API remains healthy'
else
    echo 'Live API health check failed: inspect immediately'
    exit 6
fi
