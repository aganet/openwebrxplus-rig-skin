"""Own windows: fit the screen when opened, resize from any edge, geometry remembered."""
from playwright.sync_api import sync_playwright
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
def box(pg,sel): return pg.locator(sel).bounding_box()
def edge_drag(pg,sel,side,dx,dy):
 b=box(pg,sel); x=b['x']+(3 if side in('l','tl','bl') else b['width']-3 if side in('r','tr','br') else b['width']/2)
 y=b['y']+(3 if side in('t','tl','tr') else b['height']-3 if side in('b','bl','br') else b['height']/2)
 pg.mouse.move(x,y); pg.mouse.down(); pg.mouse.move(x+dx,y+dy,steps=6); pg.mouse.up(); pg.wait_for_timeout(200); return b, box(pg,sel)
with sync_playwright() as p:
 b=p.chromium.launch()
 pg=b.new_page(); errs=[]
 pg.close()
 # 2. on a big screen: edges grow and shrink, opposite edge stays, geometry is remembered
 ctx=b.new_context(viewport={'width':1400,'height':900}); pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))
 pg.add_init_script("localStorage.removeItem('rig_dx_size'); localStorage.setItem('rig_dx_pos', JSON.stringify({left:300,top:150}))")
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(1500)
 pg.click('#owrx-rig-dx-button'); pg.wait_for_timeout(1500)
 if pg.evaluate("Plugins.rig_skin.hostWindows()"):
  # on a host with the window API the frame is the host's: it resizes itself, the skin's edge resize is off by design
  check('hosted: host frame is resizable', pg.evaluate("getComputedStyle(document.getElementById('plugin-window-rig-dx')).resize")=='both')
  check('hosted: no skin edge cursor on the content', pg.evaluate("document.getElementById('owrx-rig-dx').style.cursor")=='')
  b.close(); print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails)); raise SystemExit(0)
 b0,b1=edge_drag(pg,'#owrx-rig-dx','l',-60,0)
 check('left edge: wider, right edge fixed', b1['width']-b0['width']>50 and abs((b1['x']+b1['width'])-(b0['x']+b0['width']))<3, (round(b0['width']),round(b1['width'])))
 b0,b1=edge_drag(pg,'#owrx-rig-dx','r',-80,0)
 check('right edge: narrower, left fixed', b0['width']-b1['width']>70 and abs(b1['x']-b0['x'])<3)
 b0,b1=edge_drag(pg,'#owrx-rig-dx','t',0,-40)
 check('top edge: taller, bottom fixed', b1['height']-b0['height']>30 and abs((b1['y']+b1['height'])-(b0['y']+b0['height']))<3, (round(b0['height']),round(b1['height'])))
 b0,b1=edge_drag(pg,'#owrx-rig-dx','br',30,-30)
 check('corner still works', b1['width']-b0['width']>20 and b0['height']-b1['height']>10)   # the map grows 15 with the width
 cur=pg.evaluate("(()=>{const e=document.getElementById('owrx-rig-dx'); const r=e.getBoundingClientRect(); const ev=new MouseEvent('mousemove',{clientX:r.left+2,clientY:r.top+r.height/2,bubbles:true}); e.dispatchEvent(ev); return e.style.cursor;})()")
 check('edge shows a resize cursor', cur=='ew-resize', cur)
 saved=pg.evaluate("JSON.parse(localStorage.getItem('rig_dx_size'))")
 pg.close(); pg=ctx.new_page(); pg.on('pageerror', lambda e: errs.append(str(e)))   # same context, same storage
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1200)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(1200)
 pg.click('#owrx-rig-dx-button'); pg.wait_for_timeout(1200)
 check('size remembered', abs(box(pg,'#owrx-rig-dx')['width']-(saved['w']+16))<3, (saved, round(box(pg,'#owrx-rig-dx')['width'])))
 # 3. header drag still moves without resizing
 h=box(pg,'#owrx-rig-dx .owrx-rig-dx-hdr'); b0=box(pg,'#owrx-rig-dx')
 pg.mouse.move(h['x']+8,h['y']+h['height']/2); pg.mouse.down(); pg.mouse.move(h['x']+8+50,h['y']+h['height']/2+20,steps=5); pg.mouse.up(); pg.wait_for_timeout(200)
 b1=box(pg,'#owrx-rig-dx')
 check('header drag moves, size unchanged', abs((b1['x']-b0['x'])-50)<3 and abs(b1['width']-b0['width'])<2)
 # 4. SAT window gets the same
 pg.click('#owrx-rig-dx-button'); pg.click('#owrx-rig-sat-button'); pg.wait_for_timeout(2500)
 b0,b1=edge_drag(pg,'#owrx-rig-satwin','l',-40,0)
 check('SAT left edge resizes', b1['width']-b0['width']>30)
 check('no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
