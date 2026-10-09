"""Desktop guard: the rig face on desktop-size screens must not change.
BASELINE=1 records geometry and computed styles of every rig element at
three desktop sizes (mouse, no touch); without it, compares against the
recorded baseline and reports every difference."""
from playwright.sync_api import sync_playwright
import json, os, sys
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'desktop_baseline.json')
SIZES=[(1920,1080),(1400,900),(1280,720)]
PROPS=['display','position','width','height','font-size','font-family','color','background-color','background-image','border-radius','box-shadow','zoom','padding','margin','grid-template-columns','flex-direction']
FP="""(props)=>{
 const els=[...document.querySelectorAll('#openwebrx-panel-receiver, #openwebrx-panel-receiver *, [id^=owrx-rig], [class*=owrx-rig], .openwebrx-main-buttons, .openwebrx-main-buttons *')];
 const out={}, seen={};
 // live content (spot chips, beacon rotation, lists, clocks) changes by itself: skip it
 const LIVE='#owrx-rig-flash, #owrx-rig-spots, .owrx-rig-beacon-row, .owrx-rig-dx-list, .owrx-rig-sats-list, .owrx-rig-satwin-list, #openwebrx-panel-log';
 els.forEach((e)=>{ if(e.closest(LIVE)) return;
  const cls=[...e.classList].filter(c=>!['listening','active','act','playing','highlighted'].includes(c)).sort().join('.');
  const base=e.id?'#'+e.id:e.tagName+'.'+cls; seen[base]=(seen[base]||0)+1;
  const key=base+'@'+seen[base];
  const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
  out[key]=[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)].concat(props.map(p=>cs.getPropertyValue(p)));
 });
 return out;}"""
def capture():
 res={}
 with sync_playwright() as p:
  b=p.chromium.launch()
  for w,h in SIZES:
   ctx=b.new_context(viewport={'width':w,'height':h}, has_touch=False, is_mobile=False)
   pg=ctx.new_page()
   pg.add_init_script("localStorage.clear(); localStorage.setItem('ui_theme','rig')")
   pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
   pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
   # a fixed receiver state, whatever the last session left: 40 m profile, LSB
   if pg.evaluate("document.querySelector('#openwebrx-sdr-profiles-listbox').value") != 'fake|40m':
    pg.select_option('#openwebrx-sdr-profiles-listbox','fake|40m'); pg.wait_for_timeout(3000)
   pg.evaluate("UI.setModulation('lsb')"); pg.wait_for_timeout(1500)
   ov=pg.locator('#openwebrx-autoplay-overlay')
   if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(1500)
   res['%dx%d'%(w,h)]=pg.evaluate(FP, PROPS)
   ctx.close()
  b.close()
 return res
cur=capture()
if os.environ.get('BASELINE')=='1':
 json.dump(cur, open(OUT,'w')); print('baseline recorded:', {k:len(v) for k,v in cur.items()}); sys.exit(0)
import re
# the panel auto-fit settles on a zoom that varies by a hair between loads,
# moving everything by about a pixel: numbers match within 2 px
NUM=re.compile(r'-?\d+(?:\.\d+)?')
def same(x, y):
 if x is None or y is None: return x is y
 if len(x)!=len(y): return False
 for u,v in zip(x,y):
  if isinstance(u,(int,float)) and isinstance(v,(int,float)):
   if abs(u-v)>2: return False
  elif u!=v:
   nu,nv=NUM.findall(str(u)),NUM.findall(str(v))
   if NUM.sub('#',str(u))!=NUM.sub('#',str(v)) or len(nu)!=len(nv) or any(abs(float(a)-float(b))>2 for a,b in zip(nu,nv)): return False
 return True
base=json.load(open(OUT)); bad=0
for size in base:
 a,b2=base[size],cur.get(size,{})
 diff=[k for k in set(a)|set(b2) if not same(a.get(k), b2.get(k))]
 if diff and os.environ.get('DETAIL'):
  for k in sorted(diff)[:3]: print('   ',k,'\n      base',a.get(k),'\n      now ',b2.get(k))
 print(('PASS ' if not diff else 'FAIL ')+size+' %d elements'%len(a)+('' if not diff else ', %d differ: %s'%(len(diff), sorted(diff)[:6])))
 bad+=bool(diff)
print('RESULT', 'ALL PASS' if not bad else 'FAILED')
