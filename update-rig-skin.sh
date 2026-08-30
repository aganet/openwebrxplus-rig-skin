#!/bin/sh
# Update the rig_skin plugin in place.
# Usage: ./update-rig-skin.sh [version]
# Without a version it installs the latest release.
# The plugins folder is found automatically (current folder, Debian
# package path, docker image path); set PLUGINS_DIR to override.
set -e

REPO="aganet/openwebrxplus-rig-skin"

V="$1"
if [ -z "$V" ]; then
    V=$(curl -fsI "https://github.com/$REPO/releases/latest" | tr -d '\r' \
        | sed -n 's/^[Ll]ocation:.*\/tag\/v//p')
    [ -n "$V" ] || { echo "could not find the latest version"; exit 1; }
fi
V=${V#v}

# find the plugins folder: prefer one that already has rig_skin in it
KNOWN="plugins/receiver
htdocs/plugins/receiver
/usr/lib/python3/dist-packages/htdocs/plugins/receiver
/opt/openwebrx/htdocs/plugins/receiver"

DIR="$PLUGINS_DIR"
if [ -z "$DIR" ]; then
    for d in $KNOWN; do
        [ -d "$d/rig_skin" ] && { DIR="$d"; break; }
    done
fi
if [ -z "$DIR" ]; then
    for d in $KNOWN; do
        [ -d "$d" ] && { DIR="$d"; break; }
    done
fi
[ -n "$DIR" ] && [ -d "$DIR" ] || {
    echo "no plugins/receiver folder found here or in the usual places."
    echo "run it next to your plugins folder, or set PLUGINS_DIR=/path/to/plugins/receiver"
    exit 1
}
[ -w "$DIR" ] || { echo "$DIR is not writable, run with sudo"; exit 1; }

echo "updating rig_skin to $V in $DIR"
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

curl -fsSL -o "$TMP/rig-skin.zip" \
    "https://github.com/$REPO/releases/download/v$V/openwebrxplus-rig-skin-$V.zip"

# unpack to a staging folder and check everything BEFORE touching the
# live install; the live folder only ever receives plain file copies,
# nothing there is deleted
unzip -o -q "$TMP/rig-skin.zip" 'rig_skin/*' -d "$TMP/stage"
for f in rig_skin.js rig_skin.css rig_skin_map.js; do
    [ -s "$TMP/stage/rig_skin/$f" ] || { echo "bad download: $f missing from the zip"; exit 1; }
done
GOT=$(grep -o "_version = '[^']*'" "$TMP/stage/rig_skin/rig_skin.js" | cut -d"'" -f2)
[ "$GOT" = "$V" ] || { echo "the zip contains version $GOT, expected $V; not installing"; exit 1; }

mkdir -p "$DIR/rig_skin"
cp -f "$TMP/stage/rig_skin/"* "$DIR/rig_skin/"

echo "installed: $GOT"
if ! grep -q "Plugins.load('rig_skin')" "$DIR/init.js" 2>/dev/null; then
    echo "note: $DIR/init.js does not load rig_skin yet, add this line:"
    echo "    Plugins.load('rig_skin');"
fi
echo "done. reload the receiver page in the browser."
