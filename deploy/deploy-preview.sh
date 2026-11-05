#!/usr/bin/env bash
# OVspot V1.1: create a separate preview API, with atomic rollback on failure.
# Run only from an authorized VPS shell: sudo bash /home/ubuntu/ovspot-v11-review-20261105/release/deploy-preview.sh
set -Eeuo pipefail
ROOT=/home/ubuntu/ovspot-v11-review-20261105
RELEASE="$ROOT/release"
SITE=/etc/nginx/sites-available/ov-kaart
UNIT=/etc/systemd/system/ovspot-v11-preview-api.service
SNIPPET=/etc/nginx/snippets/ovspot-v11-preview.conf
SERVICE=ovspot-v11-preview-api.service
BEFORE_NGINX_SHA=5cf2043614874af2a5b808378863cfe7c18c63008e017e059f64eb58706057db
BEFORE_LIVE_API_SHA=18e52128f075a45acbabd43fe4393b53749f93220ac8c7316fb8b80d1039b443
if [[ $EUID -ne 0 ]]; then echo 'Requires sudo in your authorized VPS terminal'; exit 2; fi
if [[ ! -f "$SITE" || ! -f "$ROOT/backend/ovspot_app_api.py" ]]; then echo 'Missing baseline'; exit 2; fi
if [[ -e "$SNIPPET" || -e "$UNIT" ]]; then echo 'Preview route/service already exists; refusing overwrite'; exit 3; fi
if [[ "$(sha256sum "$SITE" | cut -d' ' -f1)" != "$BEFORE_NGINX_SHA" ]]; then echo 'Nginx config changed since audit, abort'; exit 4; fi
if [[ "$(sha256sum /opt/ovspot-app-api/ovspot_app_api.py | cut -d' ' -f1)" != "$BEFORE_LIVE_API_SHA" ]]; then echo 'Live API changed since audit, abort'; exit 5; fi
if ss -ltn | grep -q ':18111 '; then echo 'Port 18111 occupied'; exit 6; fi
BACKUP="$RELEASE/rollback-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP"
cp -a "$SITE" "$BACKUP/ov-kaart"
echo "$BACKUP" > "$RELEASE/active-backup.path"
rollback_on_failure() {
    trap - ERR
    echo 'PREVIEW DEPLOY FAILED: restoring previous nginx config and removing only preview service'
    cp -a "$BACKUP/ov-kaart" "$SITE" || true
    rm -f "$SNIPPET"
    if nginx -t; then systemctl reload nginx || true; fi
    systemctl disable --now "$SERVICE" 2>/dev/null || true
    rm -f "$UNIT"
    systemctl daemon-reload || true
    echo 'Rollback attempted, inspect nginx and systemctl before retry'
    exit 10
}
trap rollback_on_failure ERR
install -m 0644 "$RELEASE/ovspot-v11-preview-api.service" "$UNIT"
install -m 0644 "$RELEASE/ovspot-v11-preview.nginx" "$SNIPPET"
systemctl daemon-reload
systemctl start "$SERVICE"
for attempt in {1..20}; do
    if curl -fsS --max-time 2 http://127.0.0.1:18111/app/v1/health > "$BACKUP/health.json"; then break; fi
    sleep 0.5
done
python3 - "$BACKUP/health.json" <<'PY'
import json,sys
data=json.load(open(sys.argv[1]))
assert data.get("ok") and data.get("ovbord"), data
assert data.get("versie")=="1.1.0-staging", data
PY
python3 - "$SITE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
content=p.read_text()
anchor='    # OVspot-app API v1 (ovspot-app-api, 127.0.0.1:8110) — toegevoegd door ovspot-app-api install.py'
assert content.count(anchor)==1, "Unexpected Nginx config, abort"
include='    include /etc/nginx/snippets/ovspot-v11-preview.conf; # isolated OVspot V1.1 beta route'
assert include not in content
p.write_text(content.replace(anchor, include+'\n\n'+anchor,1))
PY
nginx -t
systemctl reload nginx
python3 "$RELEASE/smoke_public_preview.py"
systemctl enable "$SERVICE"
sha256sum "$SITE" | cut -d' ' -f1 > "$BACKUP/deployed-nginx.sha"
echo 'PUBLIC_PREVIEW_DEPLOYED_OK'
echo "Rollback directory: $BACKUP"
echo "Public URL: https://ovspot.nl/app/v1-preview/health"
echo 'The old /app/v1 API and OVspot map have not been changed.'
trap - ERR
