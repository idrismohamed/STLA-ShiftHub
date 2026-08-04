#!/usr/bin/env bash
# Build the VoltBuilder upload zip.
#
# Signing credentials are NEVER committed: they live in voltbuilder.local.json
# (git-ignored) and are merged into the zip's voltbuilder.json here, at
# packaging time. Without that file you still get a zip — VoltBuilder will just
# produce an unsigned/debug build.
#
# Usage:  ./scripts/package-voltbuilder.sh [output.zip]
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${1:-build/ShiftHub-voltbuilder.zip}"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$(dirname "$OUT")"

# Project files VoltBuilder needs.
cp -r config.xml package.json www resources "$STAGE/"

# Merge build settings with local signing credentials (if present).
if [ -f voltbuilder.local.json ]; then
    python3 - "$STAGE/voltbuilder.json" <<'PY'
import json, sys
base  = json.load(open('voltbuilder.json'))
local = json.load(open('voltbuilder.local.json'))
base.pop('_comment', None); local.pop('_comment', None)
for k, v in local.items():
    if isinstance(v, dict) and isinstance(base.get(k), dict):
        base[k].update(v)
    else:
        base[k] = v
json.dump(base, open(sys.argv[1], 'w'), indent=2)
PY
    echo "✔ signing credentials merged from voltbuilder.local.json"
else
    python3 -c "import json,sys; d=json.load(open('voltbuilder.json')); d.pop('_comment',None); json.dump(d, open(sys.argv[1],'w'), indent=2)" "$STAGE/voltbuilder.json"
    echo "⚠ no voltbuilder.local.json — the build will not be signed."
    echo "  cp voltbuilder.local.json.sample voltbuilder.local.json and fill it in."
fi

rm -f "$OUT"
( cd "$STAGE" && zip -r -q "$OLDPWD/$OUT" . -x "*.DS_Store" )

VERSION=$(python3 -c "import xml.dom.minidom as m; print(m.parse('config.xml').documentElement.getAttribute('version'))")
echo "✔ $OUT  (v$VERSION, $(du -h "$OUT" | cut -f1))"
echo "  Upload it at https://volt.build to get a signed APK."
