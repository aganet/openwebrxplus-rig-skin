#!/usr/bin/env python3
"""Refresh the built-in satellite orbits in rig_skin.js (SAT_SEED) from
SatNOGS, for every satellite in the skin's list. Run before a release:
  python3 tools/sat_seed.py
The skin uses this set only when it has nothing newer."""
import datetime, json, re, sys, urllib.request

JS = 'receiver/rig_skin/rig_skin.js'
src = open(JS).read()
ids = re.findall(r"\{ id: (\d+), name: '([^']+)'", src)
if not ids:
    sys.exit('satellite list not found in ' + JS)

req = urllib.request.Request('https://db.satnogs.org/api/tle/?format=json', headers={'User-Agent': 'rig-skin-seed'})
data = json.load(urllib.request.urlopen(req, timeout=60))
by_id = {str(x['norad_cat_id']): x for x in data if x.get('tle1') and x.get('tle2')}

tles, missing = {}, []
for sid, name in ids:
    x = by_id.get(sid)
    if x:
        tles[sid] = {'line1': x['tle1'].strip(), 'line2': x['tle2'].strip()}
    else:
        missing.append(name)

today = datetime.date.today().isoformat()
lines = ['    // built-in orbits, used only when nothing newer is at hand;',
         '    // refreshed with tools/sat_seed.py before a release',
         '    var SAT_SEED = { date: %s, tles: {' % json.dumps(today)]
items = sorted(tles.items(), key=lambda kv: int(kv[0]))
for n, (sid, t) in enumerate(items):
    lines.append('        %s: { line1: %s, line2: %s }%s' % (sid, json.dumps(t['line1']), json.dumps(t['line2']), ',' if n < len(items) - 1 else ''))
lines.append('    } };')
block = '\n'.join(lines) + '\n'

marker = re.compile(r"    // built-in orbits, used only when nothing newer is at hand;\n.*?\n    \} \};\n", re.S)
if marker.search(src):
    src = marker.sub(lambda m: block, src, count=1)
else:
    anchor = src.index("    ];\n", src.index("{ id: " + ids[-1][0] + ",")) + len("    ];\n")
    src = src[:anchor] + '\n' + block + src[anchor:]
open(JS, 'w').write(src)
print('SAT_SEED %s: %d of %d satellites%s' % (today, len(tles), len(ids), ('; missing: ' + ', '.join(missing)) if missing else ''))
