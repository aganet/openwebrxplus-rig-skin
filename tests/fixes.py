"""Fixes of 0.10.21, each one failing on 0.10.20. Remote services are simulated.
- a callsign from the spot feed is shown as text, never run as markup
- the DX history comes over https
- VFO B has tunable digits below 10 MHz too
- a wheel that reports lines gives one step per notch, from the first
- a new tuning target replaces one still on its way; quick notches add up
- an orbit library that cannot load frees the reload chip and says so
- the PROP screen fetches nothing while a stock theme is active
- a browser without flag pictures shows the country code
- damaged saved values do not stop the skin from loading
- a refusal from celestrak counts as no answer; the download pace holds
  without usable storage"""
from playwright.sync_api import sync_playwright
import json, datetime
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
EVIL='<img src=x onerror="window.__xss=1">'
with sync_playwright() as p:
 b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900}); pg=ctx.new_page()
 seen=[]; errs=[]
 pg.on('pageerror', lambda e: errs.append(str(e)))
 def dxsummit(route):
  seen.append(route.request.url)
  route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'},
   body=json.dumps([{'dx_call': EVIL, 'frequency': 7074.0, 'time': datetime.datetime.now(datetime.UTC).strftime('%Y-%m-%dT%H:%M:%S'),
    'dx_longitude': -15.0, 'dx_latitude': 45.0, 'dx_country': '<b>bold</b>', 'de_call': 'T3ST', 'info': 'test'}]))
 ctx.route('**/www.dxsummit.fi/**', dxsummit)
 ctx.route('**/holycluster**', lambda r: r.abort())
 ctx.route('**/services.swpc.noaa.gov/**', lambda r: (seen.append(r.request.url), r.abort()))
 ctx.route('**/prop.kc2g.com/**', lambda r: (seen.append(r.request.url), r.abort()))
 ctx.route('**/celestrak.org/**', lambda r: r.abort()); ctx.route('**/tle.ivanstanojevic.me/**', lambda r: r.abort())
 lib={'ok': False}
 ctx.route('**/satellite.min.js', lambda r: r.continue_() if lib['ok'] else (seen.append(r.request.url), r.abort()))
 def start(theme='rig'):
  pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1200)
  pg.select_option('#openwebrx-themes-listbox',theme); pg.wait_for_timeout(1500)
  ov=pg.locator('#openwebrx-autoplay-overlay')
  if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(600)
 start()
 pg.evaluate("localStorage.removeItem('rig_dx_cache'); LS.save('rig_prop', false)")
 pg.select_option('#openwebrx-sdr-profiles-listbox','fake|40m'); pg.wait_for_timeout(2500)   # the spot is on 40 m
 # 1. hostile spot fields from the history, over https
 pg.click('#owrx-rig-dx-button'); pg.wait_for_timeout(2500)
 check('the DX history is asked over https', any(u.startswith('https://www.dxsummit.fi/') for u in seen), seen[:2])
 cv=pg.locator('#owrx-rig-dx canvas').first.bounding_box(); tip=''
 for y in range(int(cv['y'])+6, int(cv['y']+cv['height']), 7):
  for x in range(int(cv['x'])+6, int(cv['x']+cv['width']), 7):
   pg.mouse.move(x,y)
   if pg.evaluate("!!document.querySelector('#owrx-rig-dx .owrx-rig-dx-tip.show')"): tip=pg.evaluate("document.querySelector('#owrx-rig-dx .owrx-rig-dx-tip').innerHTML"); break
  if tip: break
 pg.wait_for_timeout(300)
 check('the hostile spot is on the map', bool(tip), tip[:80])
 check('its callsign is text, nothing runs', '<img' not in tip and '<b>' not in tip and '&lt;img' in tip and not pg.evaluate("window.__xss"), tip[:120])
 pg.click('#owrx-rig-dx-button')
 # 2. wheel in line mode
 r=pg.evaluate("[0,1,2].map(()=>Plugins.rig_skin.wheelSteps({deltaY:-3, deltaMode:1, currentTarget:document.body}))")
 check('a line-mode wheel: one step per notch, from the first', r==[1,1,1], r)
 # 3. VFO B below 10 MHz
 pg.select_option('#openwebrx-sdr-profiles-listbox','fake|40m'); pg.wait_for_timeout(2500)
 pg.evaluate("LS.delete && LS.delete('rig_vfo_b')")
 pg.locator('.owrx-rig-vfo-box:not(.active)').click(); pg.wait_for_timeout(1200)
 d=pg.locator('.owrx-rig-vfo-box.active .owrx-rig-digit[data-place="1000"]')
 check('VFO B has tunable digits below 10 MHz', d.count()==1, pg.locator('.owrx-rig-vfo-box.active .owrx-rig-vfo-freq').inner_text())
 if d.count():
  bb=d.bounding_box(); pg.mouse.move(bb['x']+bb['width']/2, bb['y']+bb['height']/2); f0=pg.evaluate("UI.getFrequency()")
  pg.mouse.wheel(0,-100); pg.wait_for_timeout(500)
  check('the wheel tunes VFO B by the digit', pg.evaluate("UI.getFrequency()")-f0==1000, pg.evaluate("UI.getFrequency()")-f0)
 # 4. targets on their way: the newest wins, quick notches add up
 r=pg.evaluate("""()=>{ const sent=[]; const real=ws.send; ws.send=function(m){ sent.push(m); };
   const f=UI.getFrequency(); Plugins.rig_skin.tuneTo(f+5e6, null); const a=Plugins.rig_skin.tuneTarget()-f;
   Plugins.rig_skin.tuneTo(Plugins.rig_skin.tuneTarget()+1e6, null); const c=Plugins.rig_skin.tuneTarget()-f;
   Plugins.rig_skin.tuneTo(f, null); const back=Plugins.rig_skin.tuneTarget()-f; ws.send=real; return [a,c,back,Plugins.rig_skin._tuning===null]; }""")
 check('a newer target replaces the one on its way', r==[5e6,6e6,0,True], r)
 # 5. the orbit library cannot load
 pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(1500)
 chip=pg.locator('#owrx-rig-satwin .owrx-rig-dx-chip[title*="orbits"]'); chip.click(); pg.wait_for_timeout(1500)
 check('library unavailable: the reload chip is free again and says it failed', 'busy' not in (chip.get_attribute('class') or '') and pg.locator('#owrx-rig-flash').inner_text()=='orbit update failed', (chip.get_attribute('class'), pg.locator('#owrx-rig-flash').inner_text()))
 n=len([u for u in seen if 'satellite' in u]); pg.wait_for_timeout(3000)
 check('no stream of library requests', len([u for u in seen if 'satellite' in u])==n and pg.evaluate("document.querySelectorAll('script[src*=\"satellite\"]').length")==0, n)
 lib['ok']=True; chip.click(); pg.wait_for_timeout(4000)
 check('a click loads the library once it is reachable', pg.evaluate("Plugins.rig_skin._satTrack.positions().length")>0, pg.evaluate("Plugins.rig_skin._satTrack.positions().length"))
 pg.click('#owrx-rig-sat-button')
 # 6. PROP open, stock theme: nothing is fetched
 pg.evaluate("LS.save('rig_prop', true)")
 stock=[t for t in pg.eval_on_selector_all('#openwebrx-themes-listbox option','o=>o.map(x=>x.value)') if t!='rig'][0]
 pg.select_option('#openwebrx-themes-listbox',stock); pg.wait_for_timeout(500)
 seen.clear(); start(stock); pg.wait_for_timeout(3000)
 check('PROP left open, stock theme: nothing is fetched', not [u for u in seen if 'noaa' in u or 'kc2g' in u], seen[:2])
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(2500)
 check('back on the rig theme the PROP data loads', any('noaa' in u or 'kc2g' in u for u in seen), seen[:2])
 pg.evaluate("LS.save('rig_prop', false)")
 check('no page errors', not errs, errs[:3])
 # 7. a browser that cannot draw flags shows the country code
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1000)
 ctx.unroute('**/www.dxsummit.fi/**'); ctx.route('**/www.dxsummit.fi/**', lambda r: r.abort())
 start(); pg.select_option('#openwebrx-sdr-profiles-listbox','fake|40m'); pg.wait_for_timeout(2500)
# written after the reload: leaving a page saves its own spots over the cache
 pg.evaluate("""LS.save('rig_dx_cache', JSON.stringify([{call:'EA7TEST', freq:7074000, mode:'', time:Date.now(), loc:[-4.4,36.7], cont:'EU', dxcc:21, spotter:'T3ST', comment:''}]))""")
 pg.evaluate("Plugins.rig_skin._flags = false"); pg.click('#owrx-rig-dx-button'); pg.wait_for_timeout(1500)
 cell=lambda: pg.evaluate("([...document.querySelectorAll('#owrx-rig-dx .owrx-rig-dx-spot td.call')].find(c=>c.textContent.includes('EA7TEST'))||{}).textContent||''")
 check('no flag pictures: the country code stands in', cell()=='ES EA7TEST', cell())
 pg.evaluate("Plugins.rig_skin._flags = true; Plugins.rig_skin._dxRender()"); pg.wait_for_timeout(300)
 check('with flag pictures the flag is shown', cell().endswith(' EA7TEST') and not cell().startswith('ES'), cell().encode('unicode_escape').decode()[:40])
 pg.click('#owrx-rig-dx-button')
 # 8. damaged saved values do not stop the skin
 pg.evaluate("""LS.save('rig_vfo_a','null'); LS.save('rig_vfo_b','7'); LS.save('rig_watch','{"a":1}'); localStorage.setItem('rig_sat_tles','{"tles":{"25544":null,"27607":{"line1":5}}}')""")
 errs.clear(); start(); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(2500)
 check('damaged saved values: the skin loads, the VFO and every satellite show', not errs and pg.locator('.owrx-rig-vfo-box.active .owrx-rig-digit').count()>0 and pg.evaluate("Plugins.rig_skin._satTrack.positions().length")==22, (errs[:2], pg.evaluate("Plugins.rig_skin._satTrack.positions().length")))
 b.close()
 # 9. orbit download pace without usable storage, and a refusal from celestrak
 b=p.chromium.launch(); ctx=b.new_context(viewport={'width':1400,'height':900}); pg=ctx.new_page()
 JS=open(__import__('os').path.join(__import__('os').path.dirname(__import__('os').path.abspath(__file__)), '..', 'receiver', 'rig_skin', 'rig_skin.js')).read()
 SEED={i: (l1, l2) for i, l1, l2 in __import__('re').findall(r'^        (\d+): \{ line1: "([^"]+)", line2: "([^"]+)"', JS, __import__('re').M)}
 calls=[]
 def ivan(route):
  sid=route.request.url.rstrip('/').split('/')[-1]; calls.append('ivan')
  if sid=='25544': return route.fulfill(status=404, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body='{}')
  route.fulfill(status=200, content_type='application/json', headers={'Access-Control-Allow-Origin':'*'}, body=json.dumps({'line1': SEED[sid][0], 'line2': SEED[sid][1]}))
 ctx.route('**/tle.ivanstanojevic.me/**', ivan)
 ctx.route('**/celestrak.org/**', lambda r: (calls.append('celestrak'), r.fulfill(status=403, body='blocked')))
 pg.add_init_script("localStorage.removeItem('rig_sat_tles')")
 start(); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(3000)
 st=pg.evaluate("JSON.parse(localStorage.getItem('rig_sat_tles'))")
 check('a refusal from celestrak counts as no answer: one request, longer wait', calls.count('celestrak')==1 and st.get('cfails')==1, (calls.count('celestrak'), st.get('cfails')))
 pg.add_init_script("const real=Storage.prototype.setItem; Storage.prototype.setItem=function(k,v){ if(k==='rig_sat_tles') throw new Error('blocked'); return real.apply(this,arguments); };")
 calls.clear(); start(); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(3000)
 left=pg.evaluate("(Plugins.rig_skin._satTrack.info().next-Date.now())/60000"); n=len(calls)
 check('storage blocked: the download still ran and the pace is kept in memory', n>=22 and 8 < left <= 10 and pg.evaluate("localStorage.getItem('rig_sat_tles')") is None, (n, round(left,1)))
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
