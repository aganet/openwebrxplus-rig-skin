"""Peak hold timing, PIN chips, and the priority watch (squelch-gated)."""
from playwright.sync_api import sync_playwright
fails=[]; errors=[]
def check(name,ok,info=''):
 print(('PASS ' if ok else 'FAIL ')+name+(' '+str(info) if info else ''))
 if not ok: fails.append(name)
GRAY="""()=>{const c=document.querySelector('#owrx-rig-meter canvas, canvas.owrx-rig-meter'); const x=c.getContext('2d');
 const d=x.getImageData(0,0,c.width,c.height).data; let n=0;
 for(let i=0;i<d.length;i+=4){ if(Math.abs(d[i]-0x6b)<6&&Math.abs(d[i+1]-0x76)<6&&Math.abs(d[i+2]-0x80)<6&&d[i+3]>200) n++; } return n;}"""
def prep(pg):
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(2000)
with sync_playwright() as p:
 b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
 pg.add_init_script("localStorage.setItem('rig_meter_style','needle')")
 pg.on('pageerror', lambda e: errors.append(str(e)))
 pg.on('console', lambda m: errors.append(m.text) if m.type=='error' else None)
 prep(pg)
 # clear once, not on every load: the reload below must keep the pin
 pg.evaluate("localStorage.removeItem('rig_watch'); localStorage.removeItem('rig_watch_parked')")
 pg.reload(wait_until='networkidle'); prep(pg)
 # 1. peak hold: drive the meter up, drop it, the grey ghost needle must outlive 2 s and be gone by 8 s.
 # The live signal would keep re-arming the peak, so the host's meter updates are muted meanwhile.
 pg.evaluate("window.__meterOrig=Plugins.rig_skin.setMeterTarget; Plugins.rig_skin.setMeterTarget=function(v){ if(window.__testMeter) window.__meterOrig(v); }")
 pg.evaluate("window.__testMeter=true; Plugins.rig_skin.setMeterTarget(0.9); window.__testMeter=false"); pg.wait_for_timeout(700)
 pg.evaluate("window.__testMeter=true; Plugins.rig_skin.setMeterTarget(0.1); window.__testMeter=false"); pg.wait_for_timeout(2000)
 g2=pg.evaluate(GRAY); pg.wait_for_timeout(6500); g8=pg.evaluate(GRAY)
 pg.evaluate("Plugins.rig_skin.setMeterTarget=window.__meterOrig")
 check('peak ghost still held after 2 s', g2>20, g2)
 check('peak ghost gone after 8.5 s', g8<5, g8)
 # 3. priority watch: watch on the strong carrier at 7.105, VFO parked on a quiet spot
 # CW: the channel is centered on the dial, so the bare carrier at 7.105 counts as a signal.
 # tuneTo moves the receiver window too (the demo may sit on another profile)
 pg.evaluate("Plugins.rig_skin.tuneTo(7105000, 'cw')")
 for _ in range(30):
  pg.wait_for_timeout(500)
  if pg.evaluate("Math.abs(center_freq-7105000)<20000 && UI.getModulation()=='cw'"): break
 check('on the 40m window in CW', pg.evaluate("Math.abs(center_freq-7105000)<20000 && UI.getModulation()=='cw'"), pg.evaluate("[center_freq, UI.getFrequency()]"))
 pg.wait_for_timeout(1500)
 # sit the watch on the strongest carrier the FFT actually shows
 peak=pg.evaluate("(()=>{const d=Plugins.rig_skin._lastFft,n=d.length; let bi=0; for(let i=1;i<n;i++) if(d[i]>d[bi]) bi=i; return Math.round(center_freq+(bi/n-0.5)*bandwidth);})()")
 pg.evaluate("UI.setFrequency(%d)"%peak); pg.wait_for_timeout(800)
 pg.click('#owrx-rig-watch-button'); pg.wait_for_timeout(500)
 wf=pg.evaluate("JSON.parse(localStorage.getItem('rig_watch'))[0].f")
 quiet=pg.evaluate("center_freq - 40000"); away=pg.evaluate("center_freq - 30000")
 pg.evaluate("UI.setFrequency(%d)"%quiet); pg.wait_for_timeout(3000)
 check('watch shows activity', pg.locator('.owrx-rig-watch.act').count()==1)
 sq=pg.evaluate("Plugins.rig_skin._squelchT()")
 check('squelch off to start', sq is None, sq)
 check('no jump while squelch is off', pg.evaluate("UI.getFrequency()")==quiet, pg.evaluate("UI.getFrequency()"))
 pg.locator('#owrx-rig-keys-left .owrx-rig-key:has-text("SQL")').click(); pg.wait_for_timeout(600)
 check('squelch engaged', pg.evaluate("Plugins.rig_skin._squelchT()") is not None)
 f=None
 for _ in range(16):
  pg.wait_for_timeout(500); f=pg.evaluate("UI.getFrequency()")
  if f==wf: break
 check('priority watch jumps to the active watch', f==wf and pg.locator('.owrx-rig-watch.playing').count()==1, (f, wf))
 # the operator turns the dial away: the watch must not grab it back while it is still active
 pg.evaluate("UI.setFrequency(%d)"%away); pg.wait_for_timeout(4000)
 check('hands off after a manual tune', pg.evaluate("UI.getFrequency()")==away, pg.evaluate("UI.getFrequency()"))
 pg.locator('#owrx-rig-keys-left .owrx-rig-key:has-text("SQL")').click(); pg.wait_for_timeout(300)
 # 4. parking: right-click WATCH hides all, remembered across reload, one click brings them back
 pg.click('#owrx-rig-watch-button'); pg.wait_for_timeout(400)
 n=pg.evaluate("JSON.parse(localStorage.getItem('rig_watch')||'[]').length")
 pg.click('#owrx-rig-watch-button', button='right'); pg.wait_for_timeout(300)
 check('right-click parks all watches', n==2 and pg.locator('.owrx-rig-watch:visible').count()==0 and pg.evaluate("localStorage.getItem('rig_watch_parked')")=='true')
 pg.reload(wait_until='networkidle'); prep(pg); pg.wait_for_timeout(1000)
 check('parked state survives reload', pg.locator('.owrx-rig-watch:visible').count()==0 and pg.evaluate("JSON.parse(localStorage.getItem('rig_watch')||'[]').length")==2)
 pg.click('#owrx-rig-watch-button'); pg.wait_for_timeout(400)
 check('click brings all back, adds none', pg.locator('.owrx-rig-watch:visible').count()==2 and pg.evaluate("JSON.parse(localStorage.getItem('rig_watch')||'[]').length")==2)
 # cleanup through the skin's own close handlers, whatever the window mode
 pg.evaluate("document.querySelectorAll('.owrx-rig-watch .owrx-rig-dx-close').forEach(e => e.click())"); pg.wait_for_timeout(300)
 check('cleanup removed all watches', pg.evaluate("JSON.parse(localStorage.getItem('rig_watch')||'[]').length")==0)
 b.close()
errs=[e for e in errors if 'favicon' not in e and 'Failed to load' not in e]
check('no console errors', not errs, errs[:4])
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
