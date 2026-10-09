#!/bin/sh
# Test receiver for the rig skin: a fake rtl_tcp SDR (noise and a few
# carriers on 40 m and 20 m) and the OpenWebRX+ release image, serving the
# skin straight from this checkout at http://localhost:8073.
# Needs docker and python3; port 8073 must be free.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$DIR/../.." && pwd)"
IMAGE="${1:-slechev/openwebrxplus:latest}"

# the feed must listen before the receiver starts, or it marks the SDR failed
if ! ss -tln | grep -q ':11234 '; then
    nohup python3 "$DIR/fake_rtl_tcp.py" > "$DIR/fake_rtl.log" 2>&1 &
    until ss -tln | grep -q ':11234 '; do sleep 1; done
fi

docker rm -f rig-skin-test > /dev/null 2>&1 || true
docker run -d --name rig-skin-test --network host \
    -v "$DIR/settings.json:/var/lib/openwebrx/settings.json" \
    -v "$DIR/plugins:/usr/lib/python3/dist-packages/htdocs/plugins/receiver" \
    -v "$REPO/receiver/rig_skin:/usr/lib/python3/dist-packages/htdocs/plugins/receiver/rig_skin" \
    "$IMAGE" > /dev/null
until curl -s -o /dev/null http://localhost:8073/; do sleep 2; done
echo "test receiver up at http://localhost:8073 ($IMAGE)"
