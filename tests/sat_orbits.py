"""Satellite orbits, polite to celestrak (which blocks addresses that ask
too often). celestrak is simulated here; this test never contacts it.
- nothing stored and celestrak blocked: the built-in set shows every bird
- a download is the three group files, one after another, nothing else
- after an attempt, nothing is asked again within 2 hours, not even by the
  reload chip, which says when the next update will be
- a download with only some birds updates those and loses none"""
from playwright.sync_api import sync_playwright
import re, time
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
import os
JS=open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'receiver', 'rig_skin', 'rig_skin.js')).read()
SEED=dict(re.findall(r'^        (\d+): \{ line1: "([^"]+)"', JS, re.M))
IDS=re.findall(r"\{ id: (\d+), name: '", JS)
def newer(line1, days=3):
 # same orbit, epoch moved a few days later: the update must win
 ep=float(line1[20:32])+days
 return line1[:20]+('%012.8f'%ep)+line1[32:]
with sync_playwright() as p:
 b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900}); pg=ctx.new_page()
 errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
 calls=[]; mode={'v':'hang'}
 def celestrak(route):
  url=route.request.url; calls.append((time.time(), url.split('?')[1]))
  if mode['v']=='hang': return route.abort('timedout')
  if mode['v']=='iss-only' and 'GROUP=stations' in url:
   l2=JS.split('25544: { line1: "')[1].split('line2: "')[1].split('"')[0]
   return route.fulfill(status=200, content_type='text/plain', body='ISS (ZARYA)\n%s\n%s\n'%(newer(SEED['25544']), l2))
  return route.fulfill(status=200, content_type='text/plain', body='')
 ctx.route('**/celestrak.org/**', celestrak)
 ctx.route('**/tle.ivanstanojevic.me/**', lambda r: (calls.append((time.time(),'ivanstanojevic')), r.abort()))
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1000)
 pg.evaluate("localStorage.removeItem('rig_sat_tles')")
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(800)
 check('no NOAA 15 or 19 in the list', '25338' not in IDS and '33591' not in IDS and len(IDS)==26, len(IDS))
 # 0. a blocked celestrak hangs rather than refusing: the map must not wait for it
 hp=ctx.new_page(); hp.add_init_script("""localStorage.removeItem('rig_sat_tles');
  const of=window.fetch; window.fetch=function(u,o){ if(String(u).includes('celestrak')) return new Promise((res,rej)=>{ if(o&&o.signal) o.signal.addEventListener('abort',()=>rej(new DOMException('aborted','AbortError'))); }); return of.apply(this,arguments); };""")
 hp.goto('http://localhost:8073/',wait_until='networkidle'); hp.wait_for_timeout(1000)
 hp.select_option('#openwebrx-themes-listbox','rig'); hp.wait_for_timeout(1500)
 hov=hp.locator('#openwebrx-autoplay-overlay')
 if hov.count() and hov.is_visible(): hov.click(); hp.wait_for_timeout(500)
 t0=time.time(); hp.click('#owrx-rig-sat-button'); n=0
 while time.time()-t0<8:
  hp.wait_for_timeout(250); n=hp.evaluate("Plugins.rig_skin._satTrack.positions().length")
  if n: break
 check('celestrak hanging: every bird on the map within seconds', n==26, (n, round(time.time()-t0,1)))
 hp.close()
 # 1. blocked, nothing stored: the built-in set
 pg.click('#owrx-rig-sat-button')
 for _ in range(60):
  pg.wait_for_timeout(1000)
  if pg.evaluate("Plugins.rig_skin._satTrack.positions().length")>0: break
 n=pg.evaluate("Plugins.rig_skin._satTrack.positions().length")
 check('celestrak blocked, nothing stored: every bird from the built-in set', n==26, n)
 foot=pg.evaluate("document.querySelector('#owrx-rig-satwin .owrx-rig-dx-foot').textContent")
 check('the window says the orbits are the built-in set', 'orbits: built-in set' in foot, foot)
 first=[c for c in calls]
 check('one attempt = the three group files, nothing else', [c[1] for c in first]==['FORMAT=TLE&GROUP=stations','FORMAT=TLE&GROUP=amateur','FORMAT=TLE&GROUP=weather'], [c[1] for c in first])
 # 2. within 2 hours: no new request, not on reopening, not from the reload chip
 calls.clear(); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(500); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(3000)
 pg.locator('#owrx-rig-satwin .owrx-rig-dx-chip[title*="orbits"]').click(); pg.wait_for_timeout(1500)
 check('within 2 hours nothing is asked again', not calls, [c[1] for c in calls])
 check('the reload chip says when the next update is', 'next update after' in pg.locator('#owrx-rig-flash').inner_text(), pg.locator('#owrx-rig-flash').inner_text())
 # after a failure the wait doubles: 4 hours, so 3 hours later still nothing
 pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('rig_sat_tles')); s.tried=Date.now()-3*3600*1000; localStorage.setItem('rig_sat_tles', JSON.stringify(s));})()")
 calls.clear(); pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1000)
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(500)
 pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(4000)
 check('after a failure, 3 hours later still nothing (waits 4)', not calls, [c[1] for c in calls])
 # 3. due again; a download with only the ISS: ISS updated, nobody lost
 pg.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('rig_sat_tles')); s.tried=Date.now()-5*3600*1000; localStorage.setItem('rig_sat_tles', JSON.stringify(s));})()")
 mode['v']='iss-only'; calls.clear()
 ok=pg.evaluate("new Promise(r=>Plugins.rig_skin._satTrack.reload(h=>r(h)))")
 st=pg.evaluate("JSON.parse(localStorage.getItem('rig_sat_tles'))")
 check('due again: one attempt of three requests', len(calls)==3 and not any('CATNR' in c[1] or 'ivanstanojevic' in c[1] for c in calls), [c[1] for c in calls])
 check('a short download updates the ISS and loses nobody', len(st['tles'])==26 and st['tles']['25544']['line1']==newer(SEED['25544']), (len(st['tles']), st['tles']['25544']['line1'][18:32]))
 pg.wait_for_timeout(65000)   # the open window refreshes its orbit line within a minute
 foot=pg.evaluate("document.querySelector('#owrx-rig-satwin .owrx-rig-dx-foot').textContent")
 check('after a good download the window shows its date, not the built-in set', 'orbits:' in foot and 'built-in' not in foot, foot)
 check('no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
