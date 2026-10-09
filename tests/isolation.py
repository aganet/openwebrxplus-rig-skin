"""Stock themes must be identical with and without the plugin loaded (10 x 2)."""
from playwright.sync_api import sync_playwright
import hashlib
URL='http://localhost:8073/'
STYLE_SEL=['#openwebrx-panel-receiver','#openwebrx-panel-receiver .frequencies-container',
 '#openwebrx-panel-receiver .openwebrx-panel-line','.webrx-top-container','#openwebrx-frequency-container',
 '.openwebrx-button','#openwebrx-smeter','#webrx-canvas-container','.openwebrx-panel-listbox','#openwebrx-panel-receiver .openwebrx-slider']
PROPS=['display','background-color','background-image','color','font-family','font-size','border-radius','box-shadow','width','height','zoom','position']
FP="""([sels,props])=>{
 const skin=e=>e.closest('[id^=owrx-rig],[class*=owrx-rig],#openwebrx-panel-log,#openwebrx-bookmarks-container,.openwebrx-bookmark,#openwebrx-digimode-content,#openwebrx-panel-status');
 const a={};
 sels.forEach(s=>{const els=[...document.querySelectorAll(s)].filter(e=>!skin(e)).slice(0,6);
  a[s]=els.map(e=>{const cs=getComputedStyle(e);const r=e.getBoundingClientRect();
   return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height),...props.map(p=>cs.getPropertyValue(p))];});});
 const vis=[...document.body.querySelectorAll('*')].filter(e=>!skin(e)&&e.getBoundingClientRect().width>0&&!['SCRIPT','STYLE','LINK'].includes(e.tagName))
  .map(e=>e.tagName+'#'+e.id+'.'+[...e.classList].filter(c=>!c.startsWith('owrx-rig')).sort().join('.'));
 return [JSON.stringify(a), vis.join('|')];}"""
def run(block):
 out={}
 with sync_playwright() as p:
  b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
  if block: pg.route('**/rig_skin*', lambda r: r.abort())
  pg.goto(URL,wait_until='networkidle'); pg.wait_for_timeout(1500)
  themes=[t for t in pg.eval_on_selector_all('#openwebrx-themes-listbox option','o=>o.map(x=>x.value)') if t!='rig']
  ov=pg.locator('#openwebrx-autoplay-overlay')
  if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(500)
  for t in themes:
   pg.select_option('#openwebrx-themes-listbox',t); pg.wait_for_timeout(700)
   s,v=pg.evaluate(FP,[STYLE_SEL,PROPS]); out[t]=(hashlib.md5(s.encode()).hexdigest(),hashlib.md5(v.encode()).hexdigest())
  b.close()
 return out
a=run(True); b=run(False)
passed=failed=0
for t in a:
 for i,name in enumerate(['styles','visible']):
  ok=a[t][i]==b[t][i]; passed+=ok; failed+=not ok
  print(('PASS ' if ok else 'FAIL ')+t+' '+name)
print('---'); print('passed %d failed %d'%(passed,failed))
