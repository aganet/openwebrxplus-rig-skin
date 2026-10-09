#!/bin/sh
# Stop the test receiver and the fake SDR.
docker rm -f rig-skin-test > /dev/null 2>&1 || true
pkill -f "python3 .*fake_rtl_tcp[.]py" 2>/dev/null || true
echo "test receiver stopped"
