#!/bin/bash
# Copies the product guides and RadiusOne's guide component into the site, unchanged except for the icon import:
#   src/docs/radiusone.md   <- RadiusOne docs/USER-GUIDE.md       (RADIUSONE_DIR, default /opt/freeradius-web-laravel)
#   src/docs/dnsone.md      <- DNSOne docs/USER-GUIDE.md          (DNSONE_GUIDE: a path, host:path for scp, or a URL;
#                                                                  default the DNSOne server's source tree, over ssh)
#   src/docs/monitor.md     <- PingOmni Monitor docs/USER-GUIDE.md (MONITOR_DIR, default /opt/pingomni-monitor)
#   src/shared/guide.tsx    <- RadiusOne resources/js/components/guide.tsx
#   src/docs/versions.json  <- RadiusOne's and DNSOne's VERSION files and Monitor's latest tag (the version each guide describes)
# The docs pages (/docs/radiusone/, /docs/dnsone/, /docs/monitor/) render these, so they read exactly like each console's own guide.
# Run after a guide changes, then `npm run build`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
RADIUSONE="${RADIUSONE_DIR:-/opt/freeradius-web-laravel}"
DNSONE="${DNSONE_GUIDE:-dnsone:dnsone-src/docs/USER-GUIDE.md}"
MONITOR="${MONITOR_DIR:-/opt/pingomni-monitor}"
[ -f "$RADIUSONE/docs/USER-GUIDE.md" ] || { echo "RadiusOne not found at $RADIUSONE (set RADIUSONE_DIR)" >&2; exit 1; }
[ -f "$MONITOR/docs/USER-GUIDE.md" ] || { echo "PingOmni Monitor not found at $MONITOR (set MONITOR_DIR)" >&2; exit 1; }

mkdir -p "$HERE/src/docs"
cp "$RADIUSONE/docs/USER-GUIDE.md" "$HERE/src/docs/radiusone.md"
cp "$MONITOR/docs/USER-GUIDE.md" "$HERE/src/docs/monitor.md"
# The VERSION file sits at the root of the source tree, beside docs/, wherever the guide comes from.
fetch() {
    case "$1" in
        http://*|https://*) curl -fsS "$1" -o "$2" ;;
        *:*) scp -q "$1" "$2" ;;
        *) cp "$1" "$2" ;;
    esac
}
fetch "$DNSONE" "$HERE/src/docs/dnsone.md"
fetch "${DNSONE%docs/USER-GUIDE.md}VERSION" "$HERE/src/docs/.dnsone-version"
MONITOR_VERSION="$(git -c safe.directory='*' -C "$MONITOR" describe --tags --abbrev=0)"
printf '{ "radiusone": "%s", "dnsone": "%s", "monitor": "%s" }\n' "$(tr -d '[:space:]' < "$RADIUSONE/VERSION")" "$(tr -d '[:space:]' < "$HERE/src/docs/.dnsone-version")" "${MONITOR_VERSION#v}" > "$HERE/src/docs/versions.json"
rm "$HERE/src/docs/.dnsone-version"
sed "s|^import Icon from '@/components/Icon';|import Icon from '../Icon';|" "$RADIUSONE/resources/js/components/guide.tsx" > "$HERE/src/shared/guide.tsx"
grep -q "^import Icon from '../Icon';" "$HERE/src/shared/guide.tsx" || { echo "guide.tsx: the Icon import changed; update this script" >&2; exit 1; }
echo "Synced: $(cat "$HERE/src/docs/versions.json") from $RADIUSONE, $DNSONE and $MONITOR"
