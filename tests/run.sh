#!/bin/sh
# Run every test against the test receiver at http://localhost:8073
# (tests/demo/start.sh). Stops at the first failure.
# One-time setup: python3 -m venv tests/.venv &&
#   tests/.venv/bin/pip install playwright &&
#   tests/.venv/bin/playwright install chromium-headless-shell
DIR="$(cd "$(dirname "$0")" && pwd)"
PY="$DIR/.venv/bin/python"
[ -x "$PY" ] || { echo "no tests/.venv: see the setup lines at the top of this file"; exit 1; }
curl -s -o /dev/null -m 5 http://localhost:8073/ || { echo "no test receiver: run tests/demo/start.sh"; exit 1; }
cd "$DIR"
for t in smoke isolation desktop_guard feature resize satreload update_hint phone_grip ribbon; do
    printf '%-14s ' "$t"
    "$PY" "$t.py" > "/tmp/rig-skin-test-$t.log" 2>&1
    if grep -qE "^RESULT ALL PASS|passed [0-9]+ failed 0" "/tmp/rig-skin-test-$t.log"; then
        echo pass
    else
        echo FAIL; grep -E "^FAIL|Error|Traceback" "/tmp/rig-skin-test-$t.log" | head -5
        echo "full output: /tmp/rig-skin-test-$t.log"; exit 1
    fi
done
echo "all tests passed"
