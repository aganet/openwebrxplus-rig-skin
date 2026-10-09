"""A partial orbit cache shows few birds; the reload chip downloads again and shows all.
celestrak is replaced by a route serving one orbit per satellite id."""
from playwright.sync_api import sync_playwright
import json, re
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
L1="1 25544U 98067A   26100.50000000  .00016717  00000-0  10270-3 0  9000"
L2="2 25544  51.6400 208.9163 0006703 130.5360 325.0288 15.49560000000000"
def tle(sid): return "SAT %s\n%s\n%s\n"%(sid, L1[:2]+str(sid).rjust(5)+L1[7:], L2[:2]+str(sid).rjust(5)+L2[7:])
def prep(pg):
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(1500)
with sync_playwright() as p:
 b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900}); pg=ctx.new_page()
 errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
 prep(pg)
 ids=pg.evaluate("(()=>{const r=/\\{ id: (\\d+), name:/g; const src=Plugins.rig_skin.createSatScreen.toString() || ''; const out=[]; let m; while((m=r.exec(src))) out.push(+m[1]); return out;})()")
 n=len(ids); check('found the satellite list', n>10, n)
 body="".join(tle(i) for i in ids)
 pg.route("**/celestrak.org/**", lambda route: route.fulfill(status=200, content_type="text/plain", body=body))
 # seed a fresh but partial cache: only 3 birds
 part={str(i): {"line1": tle(i).split("\n")[1], "line2": tle(i).split("\n")[2]} for i in ids[:3]}
 pg.evaluate("([ids,part])=>localStorage.setItem('rig_sat_tles', JSON.stringify({ts:Date.now(), ids:ids.join(','), tles:part, partial:true}))", [ids, part])
 pg.evaluate("localStorage.removeItem('rig_sat_cat')")
 pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(3000)
 shown=pg.evaluate("Plugins.rig_skin._satTrack.positions().length")
 check('partial cache shows only 3', shown==3, shown)
 pg.locator('#owrx-rig-satwin .owrx-rig-dx-chip[title*="orbits"]').click(); pg.wait_for_timeout(3000)
 shown=pg.evaluate("Plugins.rig_skin._satTrack.positions().length")
 check('reload shows all', shown==n, (shown,n))
 c=pg.evaluate("JSON.parse(localStorage.getItem('rig_sat_tles'))")
 check('full download cached as complete', c and c.get('partial')==False and len(c['tles'])==n)
 # a partial cache older than 30 minutes is not used on open
 pg.evaluate("([ids,part])=>localStorage.setItem('rig_sat_tles', JSON.stringify({ts:Date.now()-31*60*1000, ids:ids.join(','), tles:part, partial:true}))", [ids, part])
 pg.reload(wait_until='networkidle'); prep(pg); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(3000)
 shown=pg.evaluate("Plugins.rig_skin._satTrack.positions().length")
 check('stale partial cache is re-downloaded on open', shown==n, (shown,n))
 check('no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
