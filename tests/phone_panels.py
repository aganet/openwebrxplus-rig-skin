"""Phone: the log (chat) and status panels start closed, and the Chat and
Status buttons open them on top of the docked rig and close them again.
Mode information panels stay under the rig, so its mode buttons can be used."""
from playwright.sync_api import sync_playwright
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
SHOWN="""(id)=>{const e=document.getElementById(id); if(!e) return 'missing'; const r=e.getBoundingClientRect();
 if(getComputedStyle(e).display==='none' || r.height===0) return 'closed';
 const x=Math.round(r.left+Math.min(40,r.width/2)), y=Math.round(r.top+Math.min(20,r.height/2));
 const top=document.elementFromPoint(x,y); return top && e.contains(top) ? 'on top' : 'covered';}"""
with sync_playwright() as p:
 b=p.chromium.launch(); dev=dict(p.devices['iPhone 13']); dev.pop('default_browser_type',None)
 ctx=b.new_context(**dev); pg=ctx.new_page(); errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 ORDER0=pg.evaluate("[...document.getElementById('openwebrx-panels-container-left').children].map(e=>e.id).join(',')")
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(2500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.tap(); pg.wait_for_timeout(800)
 # OpenWebRX+ hides the log by itself 2 s after the audio starts: test after that
 pg.wait_for_timeout(3000)
 check('phone mode on', pg.evaluate("document.body.classList.contains('rig-phone')"))
 for pid,label in [('openwebrx-panel-log','Chat'),('openwebrx-panel-status','Status')]:
  check(label+' panel closed at start', pg.evaluate(SHOWN,pid)=='closed', pg.evaluate(SHOWN,pid))
  btn=pg.locator('.openwebrx-main-buttons [data-toggle-panel="%s"]'%pid)
  check(label+' button present', btn.count()==1)
  if not btn.count(): continue
  btn.tap(); pg.wait_for_timeout(1200)
  check(label+' opens on top of the rig', pg.evaluate(SHOWN,pid)=='on top', pg.evaluate(SHOWN,pid))
  pg.screenshot(path='/tmp/rig-skin-phone-%s.png'%label.lower())
  btn.tap(); pg.wait_for_timeout(1200)
  check(label+' closes again', pg.evaluate(SHOWN,pid)=='closed', pg.evaluate(SHOWN,pid))
 # mode information panels move into the rig's scroll, under its controls,
 # and go back to OpenWebRX+'s own place when the rig theme ends
 ORDER="[...document.getElementById('openwebrx-panels-container-left').children].map(e=>e.id).join(',')"
 pg.evaluate("toggle_panel('openwebrx-panel-digimodes', true)"); pg.wait_for_timeout(1200)
 check('info panel sits inside the rig', pg.evaluate("document.getElementById('openwebrx-panel-receiver').contains(document.getElementById('openwebrx-panel-digimodes'))"))
 seen=pg.evaluate("""(()=>{const e=document.getElementById('openwebrx-panel-digimodes'); e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();
  const t=document.elementFromPoint(r.left+r.width/2, r.top+Math.min(20,r.height/2)); return !!(t && e.contains(t)) && r.width>300;})()""")
 check('info panel readable full width when scrolled to', seen)
 reach=pg.evaluate("""(()=>{const b=document.querySelector('#openwebrx-panel-receiver .openwebrx-demodulator-button'); b.scrollIntoView({block:'center'});
  const r=b.getBoundingClientRect(); const t=document.elementFromPoint(r.left+r.width/2, r.top+r.height/2); return !!(t && b.contains(t));})()""")
 check('mode buttons stay reachable with an info panel open', reach)
 pg.evaluate("toggle_panel('openwebrx-panel-digimodes', false)")
 pg.select_option('#openwebrx-themes-listbox','default'); pg.wait_for_timeout(1500)
 back=pg.evaluate(ORDER)
 check('stock theme: every panel back in OpenWebRX+ order', back==ORDER0 and not pg.evaluate("!!document.getElementById('owrx-rig-phone-info') && document.body.contains(document.getElementById('owrx-rig-phone-info'))"), back[:80])
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 check('back to rig: info panels in the rig again', pg.evaluate("document.getElementById('openwebrx-panel-receiver').contains(document.getElementById('openwebrx-panel-digimodes'))"))
 check('no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
