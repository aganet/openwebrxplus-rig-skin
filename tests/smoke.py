"""Smoke test: every screen opens and draws, drags and notes work, stock themes
hide the skin, the console stays clean. Works with both window modes: the
skin's own windows, or OpenWebRX+ plugin windows when the host has them."""
from playwright.sync_api import sync_playwright
import os
URL='http://localhost:8073/'
fails=[]; errors=[]
def check(name,ok,info=''):
 print(('PASS ' if ok else 'FAIL ')+name+(' '+str(info) if info else ''))
 if not ok: fails.append(name)
PAINTED="""(sel)=>{const c=document.querySelector(sel); if(!c) return -1;
 const x=c.getContext('2d'); const d=x.getImageData(0,0,c.width,c.height).data;
 let n=0; for(let i=3;i<d.length;i+=4*97){ if(d[i]>0) n++; } return n;}"""
def drag(pg,hsel,wsel,dx,dy,xoff=8):
 h=pg.locator(hsel).first.bounding_box(); w=pg.locator(wsel).first; b=w.bounding_box()
 pg.mouse.move(h['x']+xoff,h['y']+h['height']/2); pg.mouse.down()
 pg.mouse.move(h['x']+xoff+dx,h['y']+h['height']/2+dy,steps=5); pg.mouse.up(); pg.wait_for_timeout(150)
 a=w.bounding_box(); return abs((a['x']-b['x'])-dx)<3 and abs((a['y']-b['y'])-dy)<3
with sync_playwright() as p:
 b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
 pg.on('pageerror', lambda e: errors.append('pageerror: '+str(e)))
 pg.on('console', lambda m: errors.append('console.error: '+m.text) if m.type=='error' else None)
 pg.goto(URL,wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.evaluate("localStorage.removeItem('rig_watch'); localStorage.removeItem('rig_sat_tles')")
 # celestrak throttles repeat requests: serve one synthetic orbit per satellite id instead
 L1="1 25544U 98067A   26100.50000000  .00016717  00000-0  10270-3 0  9000"; L2="2 25544  51.6400 208.9163 0006703 130.5360 325.0288 15.49560000000000"
 ids=pg.evaluate("(()=>{const r=/\\{ id: (\\d+), name:/g; const src=Plugins.rig_skin.createSatScreen.toString(); const out=[]; let m; while((m=r.exec(src))) out.push(+m[1]); return out;})()")
 tles="".join("SAT %s\n%s\n%s\n"%(i, L1[:2]+str(i).rjust(5)+L1[7:], L2[:2]+str(i).rjust(5)+L2[7:]) for i in ids)
 pg.route("**/celestrak.org/**", lambda route: route.fulfill(status=200, content_type="text/plain", body=tles))
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(2500)
 check('rig theme on', pg.evaluate("document.body.classList.contains('theme-rig')"))
 hosted=pg.evaluate("Plugins.rig_skin.hostWindows()")
 print('window mode:', 'host plugin windows' if hosted else 'own windows')
 DXB='#owrx-rig-dx-button'; SATB='#owrx-rig-sat-button'; WB='#owrx-rig-watch-button'
 check('buttons in the banner, none in the host stack', pg.locator('.openwebrx-main-buttons '+DXB).count()==1 and pg.locator('#openwebrx-panel-plugins .owrx-rig-hostbtn').count()==0)
 check('fft flowing', pg.evaluate("!!(Plugins.rig_skin._fftHooked && Plugins.rig_skin._lastFft && Plugins.rig_skin._lastFft.length)"))
 pg.click(DXB); pg.wait_for_timeout(2500)
 check('dx map painted', pg.locator('#owrx-rig-dx').is_visible() and pg.evaluate(PAINTED,'#owrx-rig-dx canvas')>0)
 if hosted: check('dx drag', drag(pg,'#plugin-window-rig-dx .openwebrx-plugin-header','#plugin-window-rig-dx',80,40))
 else:
  check('dx drag', drag(pg,'#owrx-rig-dx .owrx-rig-dx-hdr','#owrx-rig-dx',80,40))
  g=pg.locator('#owrx-rig-dx .owrx-rig-dx-grip').first
  gb=g.bounding_box(); w0=pg.locator('#owrx-rig-dx').bounding_box()['width']
  pg.mouse.move(gb['x']+gb['width']/2,gb['y']+gb['height']/2); pg.mouse.down(); pg.mouse.move(gb['x']+gb['width']/2+60,gb['y']+gb['height']/2,steps=4); pg.mouse.up(); pg.wait_for_timeout(300)
  check('dx grip resizes', pg.locator('#owrx-rig-dx').bounding_box()['width']-w0>40)
 pg.screenshot(path='smoke_dx_'+('hosted' if hosted else 'own')+'.png')
 pg.click(DXB); pg.wait_for_timeout(300)
 check('dx closed', not pg.locator('#owrx-rig-dx').is_visible())
 pg.click(SATB); pg.wait_for_timeout(4000)
 check('sat map painted', pg.locator('#owrx-rig-satwin').is_visible() and pg.evaluate(PAINTED,'#owrx-rig-satwin canvas')>0)
 if hosted: check('sat drag', drag(pg,'#plugin-window-rig-sat .openwebrx-plugin-header','#plugin-window-rig-sat',50,30))
 else: check('sat drag', drag(pg,'#owrx-rig-satwin .owrx-rig-dx-hdr','#owrx-rig-satwin',50,30))
 if hosted:
  pg.locator('#plugin-window-rig-sat .openwebrx-plugin-close').click(); pg.wait_for_timeout(300)
  check('host X closes sat and clears LED', not pg.locator('#owrx-rig-satwin').is_visible() and 'highlighted' not in (pg.locator(SATB).get_attribute('class') or ''))
 else: pg.click(SATB); pg.wait_for_timeout(300)
 pg.evaluate("Plugins.rig_skin._satToggle()")
 txt='loading...'
 for _ in range(40):
  txt=pg.locator('.owrx-rig-sats-head').inner_text()
  if 'loading' not in txt: break
  pg.wait_for_timeout(500)
 check('sat passes rendered', ('position' in txt) or pg.locator('.owrx-rig-sat-row').count()>0, txt[:60])
 pg.evaluate("Plugins.rig_skin._satToggle()"); pg.wait_for_timeout(200)
 pg.evaluate("Plugins.rig_skin.openKeypad()"); pg.wait_for_timeout(300)
 pg.keyboard.type('14250'); pg.wait_for_timeout(200)
 check('keypad keyboard entry', '14250' in pg.locator('.owrx-rig-kp-disp').first.inner_text().replace(' ',''))
 check('keypad drag', drag(pg,'.owrx-rig-kp-head','.owrx-rig-kp',-70,30,xoff=20))
 pg.keyboard.press('Escape'); pg.wait_for_timeout(200)
 check('keypad closed on escape', pg.locator('.owrx-rig-kp-overlay.visible').count()==0)
 pg.evaluate("Plugins.rig_skin.setMeterTarget(0.5)"); pg.wait_for_timeout(600)
 check('meter painted', pg.evaluate(PAINTED,'#owrx-rig-meter canvas, canvas.owrx-rig-meter')>0)
 pg.click(WB); pg.wait_for_timeout(2500)
 check('watch painted', pg.evaluate(PAINTED,'.owrx-rig-watch canvas')>0)
 if hosted:
  pg.click(WB); pg.wait_for_timeout(600)
  a=pg.locator('#plugin-window-rig-watch-1').bounding_box(); c=pg.locator('#plugin-window-rig-watch-2').bounding_box()
  check('hosted watches do not stack', (a['x'],a['y'])!=(c['x'],c['y']) and a['x']>0 and a['y']>0, ((a['x'],a['y']),(c['x'],c['y'])))
  pg.locator('#plugin-window-rig-watch-2 .openwebrx-plugin-close').click(); pg.wait_for_timeout(300)
 if hosted: check('watch drag', drag(pg,'#plugin-window-rig-watch-1 .openwebrx-plugin-header','#plugin-window-rig-watch-1',60,20))
 else: check('watch drag', drag(pg,'.owrx-rig-watch .owrx-rig-dx-hdr','.owrx-rig-watch',60,20,xoff=30))
 pg.locator('.owrx-rig-watch canvas').first.dblclick(); pg.wait_for_timeout(200)
 pg.keyboard.type('GB3XX'); pg.keyboard.press('Enter'); pg.wait_for_timeout(200)
 check('watch note', pg.locator('.owrx-rig-watch .owrx-rig-watch-note').first.inner_text()=='GB3XX')
 pg.screenshot(path='smoke_watch_'+('hosted' if hosted else 'own')+'.png')
 (pg.locator('#plugin-window-rig-watch-1 .openwebrx-plugin-close') if hosted else pg.locator('.owrx-rig-watch .owrx-rig-dx-close')).first.click(); pg.wait_for_timeout(300)
 check('watch removed', pg.evaluate("JSON.parse(localStorage.getItem('rig_watch')||'[]').length")==0 and pg.locator('.owrx-rig-watch:visible').count()==0)
 if hosted:
  # a hosted watch keeps its place across a reload
  pg.click(WB); pg.wait_for_timeout(600); before=pg.locator('#plugin-window-rig-watch-1').bounding_box()
  pg.reload(wait_until='networkidle'); pg.wait_for_timeout(1500)
  pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1200)
  ov=pg.locator('#openwebrx-autoplay-overlay')
  if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(1500)
  after=pg.locator('#plugin-window-rig-watch-1').bounding_box()
  check('hosted watch keeps its place after reload', abs(after['x']-before['x'])<3 and abs(after['y']-before['y'])<3 and after['x']>0, ((before['x'],before['y']),(after['x'],after['y'])))
  pg.evaluate("document.querySelectorAll('.owrx-rig-watch .owrx-rig-dx-close').forEach(e => e.click())"); pg.wait_for_timeout(300)
 pg.select_option('#openwebrx-themes-listbox','black'); pg.wait_for_timeout(800)
 if hosted: check('host windows hidden on stock theme', pg.locator('.owrx-rig-hostwin:visible').count()==0)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1200)
 check('theme flip ok', pg.evaluate("document.body.classList.contains('theme-rig')"))
 b.close()
errs=[e for e in errors if 'favicon' not in e and 'ERR_' not in e and 'Failed to load resource' not in e]
check('no console errors', not errs, errs[:6])
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
