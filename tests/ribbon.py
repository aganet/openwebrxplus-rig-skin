"""DX callsign chips on the bookmark ribbon follow zoom and profile changes."""
from playwright.sync_api import sync_playwright
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
CH="[...document.querySelectorAll('#owrx-rig-spots .owrx-rig-spot')]"
with sync_playwright() as p:
 b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
 errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(1500)
 check('ribbon hook on the bookmark bar', pg.evaluate("BookmarkBar.prototype.position.toString().includes('origPosition')"))
 n=0
 for i in range(18):
  pg.wait_for_timeout(5000); n=pg.evaluate(CH+".length")
  if n: break
 check('live spots on the ribbon', n>0, n)
 if n:
  before=pg.evaluate(CH+".map(e=>e.style.left)")
  pg.evaluate("zoom_set(zoom_level+2)"); pg.wait_for_timeout(300)
  check('chips move with a zoom', pg.evaluate(CH+".map(e=>e.style.left)")!=before)
  pg.evaluate("zoom_set(0)"); pg.wait_for_timeout(300)
  opts=pg.eval_on_selector_all('#openwebrx-sdr-profiles-listbox option','o=>o.map(x=>x.value)')
  cur=pg.evaluate("document.querySelector('#openwebrx-sdr-profiles-listbox').value")
  pg.select_option('#openwebrx-sdr-profiles-listbox',[v for v in opts if v!=cur][0]); pg.wait_for_timeout(2500)
  inwin=pg.evaluate("(()=>{const r=get_visible_freq_range(); return "+CH+".every(e=>{const f=parseFloat(e.title.split('  ')[1])*1000; return f>r.start && f<r.end;})})()")
  check('after a profile change no chip from the old band', inwin)
 check('no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
