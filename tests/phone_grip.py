"""Phone: dragging the grip sets the waterfall strip above the rig, remembered; double tap resets."""
from playwright.sync_api import sync_playwright
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
def top(pg): return round(pg.evaluate("document.getElementById('openwebrx-panel-receiver').getBoundingClientRect().top"))
def drag(pg, dy):
 g=pg.locator('#owrx-rig-grip').bounding_box(); x=g['x']+g['width']/2; y=g['y']+g['height']/2
 pg.mouse.move(x,y); pg.mouse.down()
 for i in range(1,9): pg.mouse.move(x, y+dy*i/8); pg.wait_for_timeout(30)
 pg.mouse.up(); pg.wait_for_timeout(300)
def prep(pg):
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(2000)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(800)
with sync_playwright() as p:
 b=p.chromium.launch(); dev=dict(p.devices['iPhone 13']); dev.pop('default_browser_type',None); dev['has_touch']=True
 ctx=b.new_context(**dev); pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
 prep(pg); pg.evaluate("localStorage.removeItem('rig_phone_strip'); localStorage.removeItem('rig_pos')"); prep(pg)
 t0=top(pg); check('phone mode on', pg.evaluate("document.body.classList.contains('rig-phone')"))
 drag(pg, 150); t1=top(pg)
 check('drag down: rig top follows, more waterfall', abs((t1-t0)-150)<6, (t0,t1))
 check('strip saved', pg.evaluate("localStorage.getItem('rig_phone_strip')") is not None, pg.evaluate("localStorage.getItem('rig_phone_strip')"))
 drag(pg, -80); t2=top(pg)
 check('drag up: more rig', abs((t1-t2)-80)<6, (t1,t2))
 prep(pg); t3=top(pg)
 check('height remembered after reload', abs(t3-t2)<4, (t2,t3))
 drag(pg, -2000); edge=round(pg.evaluate("document.getElementById('openwebrx-frequency-container').getBoundingClientRect().bottom"))
 check('stops right under the frequency scale', abs(top(pg)-edge)<4, (top(pg), edge))
 g=pg.locator('#owrx-rig-grip').bounding_box(); x=g['x']+g['width']/2; y=g['y']+g['height']/2
 pg.mouse.click(x,y); pg.wait_for_timeout(120); pg.mouse.click(x,y); pg.wait_for_timeout(400)
 check('double tap: back to the default strip', abs(top(pg)-t0)<4 and pg.evaluate("localStorage.getItem('rig_phone_strip')") is None, (t0, top(pg)))
 check('no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
