"""Satellite orbits. tle.ivanstanojevic.me first, celestrak for the birds it
misses, at the pace celestrak asks for. Both are simulated here; this test
contacts neither.
- the map never waits for a download: every bird at once, from what is at
  hand or the built-in set
- the window says only what the update is doing, never an old date
- four requests at a time; a click updates at once, and never starts a
  second download while one runs
- updates come every hour, 10 minutes after a failed or partial one
- celestrak is asked only for birds the first source misses, at most every
  2 hours, 4 after it did not answer
- a download with only some birds updates those and loses none
- a failed update kept from 0.10.18 does not hold the next one back"""
from playwright.sync_api import sync_playwright
import re, time, json
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
import os
JS=open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'receiver', 'rig_skin', 'rig_skin.js')).read()
SEED={i: (l1, l2) for i, l1, l2 in re.findall(r'^        (\d+): \{ line1: "([^"]+)", line2: "([^"]+)"', JS, re.M)}
IDS=re.findall(r"\{ id: (\d+), name: '", JS)
GROUPS=['FORMAT=TLE&GROUP=stations','FORMAT=TLE&GROUP=amateur','FORMAT=TLE&GROUP=weather']
def newer(line1, days):
 # same orbit, epoch moved a few days later: the newer one must win
 ep=float(line1[20:32])+days
 return line1[:20]+('%012.8f'%ep)+line1[32:]
FOOT="document.querySelector('#owrx-rig-satwin .owrx-rig-dx-foot').textContent"
with sync_playwright() as p:
 b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900}); pg=ctx.new_page()
 errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
 calls=[]; mode={'ivan':'down', 'ck':'down'}
 def celestrak(route):
  url=route.request.url; calls.append(url.split('?')[1])
  if mode['ck']=='down': return route.abort('timedout')
  if 'GROUP=stations' in url:
   return route.fulfill(status=200, content_type='text/plain', body='ISS (ZARYA)\n%s\n%s\n'%(newer(SEED['25544'][0], 7), SEED['25544'][1]))
  return route.fulfill(status=200, content_type='text/plain', body='')
 def ivan(route):
  sid=route.request.url.rstrip('/').split('/')[-1]; calls.append('ivan '+sid)
  if mode['ivan']=='down': return route.abort('timedout')
  if mode['ivan']=='no-iss' and sid=='25544': return route.fulfill(status=404, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'}, body='{}')
  return route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin': '*'},
   body=json.dumps({'satelliteId': int(sid), 'name': 'SAT', 'line1': newer(SEED[sid][0], 5), 'line2': SEED[sid][1]}))
 ctx.route('**/celestrak.org/**', celestrak)
 ctx.route('**/tle.ivanstanojevic.me/**', ivan)
 IVAN=['ivan '+i for i in IDS]
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1000)
 pg.evaluate("localStorage.removeItem('rig_sat_tles')")
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(800)
 check('no NOAA 15 or 19 in the list', '25338' not in IDS and '33591' not in IDS and len(IDS)==26, len(IDS))
 # 0. a server can hold a request open without answering: the map must not wait for it
 hp=ctx.new_page(); hp.add_init_script("""localStorage.removeItem('rig_sat_tles');
  window.__n=0; const of=window.fetch; window.fetch=function(u,o){ if(/celestrak|ivanstanojevic/.test(String(u))) return (window.__n++, new Promise((res,rej)=>{ if(o&&o.signal) o.signal.addEventListener('abort',()=>rej(new DOMException('aborted','AbortError'))); })); return of.apply(this,arguments); };""")
 hp.goto('http://localhost:8073/',wait_until='networkidle'); hp.wait_for_timeout(1000)
 hp.select_option('#openwebrx-themes-listbox','rig'); hp.wait_for_timeout(1500)
 hov=hp.locator('#openwebrx-autoplay-overlay')
 if hov.count() and hov.is_visible(): hov.click(); hp.wait_for_timeout(500)
 t0=time.time(); hp.click('#owrx-rig-sat-button'); n=0
 while time.time()-t0<8:
  hp.wait_for_timeout(250); n=hp.evaluate("Plugins.rig_skin._satTrack.positions().length")
  if n: break
 check('no server answering: every bird on the map within seconds', n==26, (n, round(time.time()-t0,1)))
 foot=hp.evaluate(FOOT)
 check('the window says the orbits are updating, no old date', foot.endswith('updating orbits') and 'built-in' not in foot and '20' not in foot.split('tune')[-1], foot)
 hp.wait_for_timeout(500); hp.locator('#owrx-rig-satwin .owrx-rig-dx-chip[title*="orbits"]').click(); hp.wait_for_timeout(1000)
 check('four requests at a time, then the click starts no second download', hp.evaluate("window.__n")==4, hp.evaluate("window.__n"))
 check('the reload chip says the orbits are updating', 'updating' in hp.locator('#owrx-rig-flash').inner_text(), hp.locator('#owrx-rig-flash').inner_text())
 hp.close()
 # that tab's attempt counts for the whole browser: start clean again
 pg.evaluate("localStorage.removeItem('rig_sat_tles')"); calls.clear()
 def setst(**kw):
  pg.evaluate("kw=>{const s=JSON.parse(localStorage.getItem('rig_sat_tles')); for(const k in kw) s[k]=Date.now()-kw[k]*60000; localStorage.setItem('rig_sat_tles', JSON.stringify(s));}", kw)
 def idle():
  for _ in range(80):
   if not pg.evaluate("Plugins.rig_skin._satTrack.info().busy"): break
   pg.wait_for_timeout(250)
 def reopen():
  pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1500)
  pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1000)
  if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(500)
  pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(1500); idle()
 chip=pg.locator('#owrx-rig-satwin .owrx-rig-dx-chip[title*="orbits"]')
 flash=lambda: pg.locator('#owrx-rig-flash').inner_text()
 def click():
  chip.click(); pg.wait_for_timeout(500); idle()
 # 1. nothing stored, no server answering: every bird from the built-in set, which is never named
 pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(1500); idle()
 n=pg.evaluate("Plugins.rig_skin._satTrack.positions().length")
 check('no server answering, nothing stored: every bird on the map', n==26, n)
 foot=pg.evaluate(FOOT)
 check('the window says the update failed, and shows no old date', foot.endswith('orbit update failed') and 'built-in' not in foot, foot)
 check('first source first, then celestrak, each given up at its first no-answer', sorted(calls[:4])==sorted(IVAN[:4]) and calls[4:]==[GROUPS[0]], calls)
 # 2. after a failure: reopening within 10 minutes asks nothing; a click retries at once
 calls.clear(); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(500); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(2000)
 check('after a failure, reopening within 10 minutes asks nothing', not calls, calls)
 click()
 check('a click retries at once; celestrak did not answer, so it waits', sorted(calls)==sorted(IVAN[:4]), calls)
 check('the reload chip says the update failed', flash()=='orbit update failed', flash())
 # 15 minutes after a failure the update runs again by itself
 setst(tried=15); calls.clear(); reopen()
 check('15 minutes after a failure the update runs again', sorted(calls)==sorted(IVAN[:4]), calls)
 # 3. the first source up: every bird from it, celestrak not asked
 mode['ivan']='up'; calls.clear(); click()
 st=pg.evaluate("JSON.parse(localStorage.getItem('rig_sat_tles'))"); foot=pg.evaluate(FOOT)
 check('first source up: every bird from it, celestrak not asked', sorted(calls)==sorted(IVAN), calls[:3])
 check('every bird has the new orbit', all(st['tles'][i]['line1']==newer(SEED[i][0], 5) for i in IDS), len(st['tles']))
 check('the window says when the orbits were updated', re.search(r'orbits updated \d\d:\d\d$', foot) is not None, foot)
 check('the reload chip says the orbits are updated', flash()=='orbits updated', flash())
 # 4. within the hour nothing is asked on reopening; a click still updates at once
 calls.clear(); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(500); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(2000)
 check('within the hour, reopening asks nothing', not calls, calls)
 click()
 check('within the hour, a click updates at once', sorted(calls)==sorted(IVAN), calls[:3])
 # an hour later opening the window updates
 setst(tried=70); calls.clear(); reopen()
 check('an hour later, opening the window updates', sorted(calls)==sorted(IVAN), calls[:3])
 # 5. the first source misses the ISS: celestrak gets it, nobody is lost
 setst(ctried=300); mode['ivan']='no-iss'; mode['ck']='iss-only'; calls.clear(); click()
 st=pg.evaluate("JSON.parse(localStorage.getItem('rig_sat_tles'))")
 check('a bird the first source misses comes from celestrak', sorted(calls[:26])==sorted(IVAN) and calls[26:]==GROUPS, calls[-4:])
 check('ISS from celestrak, nobody lost', len(st['tles'])==26 and st['tles']['25544']['line1']==newer(SEED['25544'][0], 7), (len(st['tles']), st['tles']['25544']['line1'][18:32]))
 # celestrak answered just now: within its 2 hours it is not asked again
 calls.clear(); click()
 check('celestrak within its 2 hours: not asked again', sorted(calls)==sorted(IVAN), calls[-3:])
 left=pg.evaluate("(Plugins.rig_skin._satTrack.info().next-Date.now())/60000")
 check('a bird still missing: the next update in 10 minutes, not an hour', 9 < left <= 10, round(left,1))
 # 6. a browser that kept a failed update from 0.10.18: updated as soon as the window opens
 mode['ivan']='up'
 pg.evaluate("localStorage.setItem('rig_sat_tles', JSON.stringify({tles:{}, tried:Date.now()-20*60000, ts:Date.now()-12*864e5, fails:1}))")
 calls.clear(); reopen(); foot=pg.evaluate(FOOT)
 check('a failed update kept from 0.10.18: fresh orbits as soon as the window opens', re.search(r'orbits updated \d\d:\d\d$', foot) is not None and sorted(calls)==sorted(IVAN), (foot, len(calls)))
 check('no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
