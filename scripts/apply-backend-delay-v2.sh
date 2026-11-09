#!/usr/bin/env bash
set -euo pipefail
if [[ "$(id -u)" != "0" ]]; then
  echo "Deze gerichte API-correctie vereist root: sudo bash $0" >&2
  exit 1
fi
target="/opt/ovspot-app-api-v2/rit_compat.py"
patch="/home/ubuntu/ovspot-ota-betafamily-20261109/backend/rit_compat.py"
backup="/opt/ovspot-app-api-v2/rit_compat.py.bak.ritv2-20261109"
original_sha="84af1d9a1429d552ca2e01fe381b04c24e5ab56cf8804490bfdc780e62538c10"
patched_sha="b1e013e5dfea24ec1b24f10a11fc4aff172b0fa344977f023f7bb4a05dd1288d"
service="ovspot-app-api-v2.service"
test -f "$target"
test -f "$patch"
patch_now="$(sha256sum "$patch" | awk '{print $1}')"
if [[ "$patch_now" != "$patched_sha" ]]; then
  echo "Afgebroken: patch komt niet overeen met geteste release." >&2
  exit 2
fi
now_sha="$(sha256sum "$target" | awk '{print $1}')"
if [[ "$now_sha" == "$patched_sha" ]]; then
  echo "NRestarts=$(systemctl show "$service" -p NRestarts --value)"
  exit 0
fi
if [[ "$now_sha" != "$original_sha" ]]; then
  echo "Afgebroken: live rit_compat is elders gewijzigd. Niets aangepast." >&2
  exit 3
fi
# Preflight: compileer de GETESTE kandidaat voor er iets live wijzigt.
python3 - <<'PY'
from pathlib import Path
import ast
p=Path("/home/ubuntu/ovspot-ota-betafamily-20261109/backend/rit_compat.py")
ast.parse(p.read_text())
source=p.read_text()
a=source.index("def _verwachte_tijd")
b=source.index("def bouw_rit",a)
scope={}
exec(source[a:b],scope)
f=scope["_verwachte_tijd"]
v,d=f(100000,220000,0)
assert (v,d)==(220000,120000)
v,d=f(180000,None,d)
assert (v,d)==(300000,120000)
v,d=f(240000,240000,d)
assert (v,d)==(240000,0)
PY
if [[ ! -e "$backup" ]]; then cp -p "$target" "$backup"; fi
restore() {
  cp -p "$backup" "$target"
  systemctl restart "$service" || true
}
trap 'restore' ERR
install -o root -g root -m 0644 "$patch" "$target"
systemctl restart "$service"
sleep 3
restarts="$(systemctl show "$service" -p NRestarts --value)"
if [[ "$restarts" != "0" ]]; then
  echo "NRestarts=$restarts; rollback uitgevoerd" >&2
  restore
  exit 4
fi
trap - ERR
echo "NRestarts=0"
