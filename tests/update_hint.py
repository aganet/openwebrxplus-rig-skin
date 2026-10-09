"""The skin checks its own file on load; a newer build on the server shows a reload hint."""
from playwright.sync_api import sync_playwright
import re, urllib.request
fails=[]
def check(n,ok,i=''):
 print(('PASS ' if ok else 'FAIL ')+n+(' '+str(i) if i else ''))
 if not ok: fails.append(n)
JS='http://localhost:8073/static/plugins/receiver/rig_skin/rig_skin.js'
real=urllib.request.urlopen(JS).read().decode()
cur=re.search(r"_version = '([0-9.]+)'", real).group(1)
bumped=real.replace("_version = '%s'"%cur, "_version = '9.9.9'")
def prep(pg):
 pg.goto('http://localhost:8073/',wait_until='networkidle'); pg.wait_for_timeout(1500)
 pg.select_option('#openwebrx-themes-listbox','rig'); pg.wait_for_timeout(1500)
 ov=pg.locator('#openwebrx-autoplay-overlay')
 if ov.count() and ov.is_visible(): ov.click(); pg.wait_for_timeout(1000)
with sync_playwright() as p:
 b=p.chromium.launch(); pg=b.new_page(viewport={'width':1400,'height':900})
 errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
 # same server file: no hint
 prep(pg); pg.wait_for_timeout(1500)
 v=pg.locator('#owrx-rig-version')
 check('same version: plain print', v.inner_text()=='rig skin '+cur and 'update' not in (v.get_attribute('class') or ''), v.inner_text())
 # the check (a fetch) sees a newer build, the script tag still loads the current one
 seen=[]
 def route(r):
  seen.append(r.request.resource_type)
  if r.request.resource_type=='fetch': r.fulfill(status=200, content_type='application/javascript', body=bumped)
  else: r.continue_()
 pg.route("**/rig_skin/rig_skin.js*", route)
 prep(pg); pg.wait_for_timeout(2000)
 check('check request made with the page load', 'fetch' in seen, seen)
 check('hint shown for the newer build', 'ready' in v.inner_text() and '9.9.9' in v.inner_text() and 'update' in (v.get_attribute('class') or ''), v.inner_text())
 pg.unroute("**/rig_skin/rig_skin.js*")
 with pg.expect_navigation(): v.click()
 pg.wait_for_timeout(1500)
 check('click reloads the page, no new tab', len(pg.context.pages)==1 and pg.url.startswith('http://localhost:8073'))
 check('no page errors', not errs, errs[:3])
 b.close()
print('RESULT', 'ALL PASS' if not fails else 'FAILED: '+', '.join(fails))
