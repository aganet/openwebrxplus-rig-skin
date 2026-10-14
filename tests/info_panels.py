"""Every mode information panel: on a phone it opens inside the rig's
scroll, full width, readable, with the mode buttons still usable; on a
computer it stays where OpenWebRX+ puts it."""
from playwright.sync_api import sync_playwright
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
def prep(pg, touch):
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(2500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): (ov.tap() if touch else ov.click()); pg.wait_for_timeout(3500)
PANELS="[...document.getElementById('openwebrx-panels-container-left').children, ...(document.getElementById('owrx-rig-phone-info')||{children:[]}).children].filter(e=>e.classList.contains('openwebrx-panel') && e.id!=='openwebrx-panel-log' && e.id!=='openwebrx-panel-status').map(e=>e.id)"
ONE="""(id)=>{const e=document.getElementById(id); const rig=document.getElementById('openwebrx-panel-receiver');
 e.scrollIntoView({block:'center'}); const r=e.getBoundingClientRect();
 const t=document.elementFromPoint(r.left+r.width/2, r.top+Math.min(15,r.height/2));
 const b=rig.querySelector('.openwebrx-demodulator-button'); b.scrollIntoView({block:'center'}); const br=b.getBoundingClientRect();
 const tb=document.elementFromPoint(br.left+br.width/2, br.top+br.height/2);
 return {inRig: rig.contains(e), width: Math.round(r.width), height: Math.round(r.height), readable: !!(t && e.contains(t)), modes: !!(tb && b.contains(tb))}}"""
with sync_playwright() as p:
 b=p.chromium.launch(); errs=[]
 dev=dict(p.devices['iPhone 13']); dev.pop('default_browser_type',None)
 pg=b.new_context(**dev).new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
 prep(pg, True)
 ids=pg.evaluate(PANELS); vw=pg.evaluate('innerWidth')
 check('phone: info panels found', len(ids)>=20, len(ids))
 bad=[]
 for pid in ids:
  pg.evaluate("(id)=>toggle_panel(id, true)", pid); pg.wait_for_timeout(900)
  r=pg.evaluate(ONE, pid)
  ok=r['inRig'] and r['readable'] and r['modes'] and r['width']>=vw-40
  if not ok: bad.append((pid.replace('openwebrx-panel-',''), r))
  pg.evaluate("(id)=>toggle_panel(id, false)", pid); pg.wait_for_timeout(700)
 check('phone: every info panel opens in the rig, full width, readable, mode buttons usable (%d panels)'%len(ids), not bad, bad[:3])
 # several at once (mode panel plus its decode list), like a real digital mode
 pg.evaluate("toggle_panel('openwebrx-panel-digimodes', true); toggle_panel('openwebrx-panel-wsjt-message', true)"); pg.wait_for_timeout(1200)
 both=[pg.evaluate(ONE,'openwebrx-panel-digimodes'), pg.evaluate(ONE,'openwebrx-panel-wsjt-message')]
 check('phone: two panels open together, both readable', all(x['inRig'] and x['readable'] and x['modes'] for x in both))
 pg.screenshot(path='/tmp/rig-skin-info-phone.png')
 pg.evaluate("toggle_panel('openwebrx-panel-digimodes', false); toggle_panel('openwebrx-panel-wsjt-message', false)"); pg.wait_for_timeout(800)
 # a decode table wider than the phone scrolls sideways to its last column
 pg.evaluate("toggle_panel('openwebrx-panel-adsb-message', true)"); pg.wait_for_timeout(1200)
 wide=pg.evaluate("""(()=>{const p=document.getElementById('openwebrx-panel-adsb-message'); const ths=p.querySelectorAll('thead th, thead td');
  const tb=p.querySelector('tbody'); for(let i=0;i<6;i++){const tr=document.createElement('tr'); ths.forEach((h,c)=>{const td=document.createElement('td'); td.style.whiteSpace='nowrap'; td.textContent=c===ths.length-1?'LAST_COLUMN':'WIDE_VALUE_'+c; tr.appendChild(td);}); tb.appendChild(tr);}
  p.scrollIntoView({block:'center'}); const r=p.getBoundingClientRect(); const last=ths[ths.length-1];
  const before=last.getBoundingClientRect().right<=r.right+1; p.scrollLeft=99999; const q=last.getBoundingClientRect();
  return {needsScroll: !before, reachable: q.right<=r.right+1 && q.left>=r.left-1}})()""")
 check('phone: a too-wide decode table scrolls sideways to its last column', wide['needsScroll'] and wide['reachable'], wide)
 check('phone: no page errors', not errs, errs[:3])
 # a computer: the panels stay in OpenWebRX+'s own place
 errs.clear(); pd=b.new_context(viewport={'width':1400,'height':900}).new_page(); pd.on('pageerror', lambda e: errs.append(str(e)))
 prep(pd, False)
 pd.evaluate("toggle_panel('openwebrx-panel-digimodes', true)"); pd.wait_for_timeout(1200)
 check('computer: info panels not moved', pd.evaluate("document.getElementById('openwebrx-panels-container-left').contains(document.getElementById('openwebrx-panel-digimodes')) && !document.getElementById('owrx-rig-phone-info')"))
 check('computer: no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
