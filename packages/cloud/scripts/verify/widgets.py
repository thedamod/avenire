from playwright.sync_api import sync_playwright
import json,sys
name=sys.argv[1]
with sync_playwright() as p:
 browser=p.chromium.launch()
 page=browser.new_page(viewport={'width':560,'height':400},device_scale_factor=2)
 errors=[]
 page.on('console',lambda msg:errors.append(msg.text) if msg.type=='error' else None)
 page.on('pageerror',lambda error:errors.append(str(error)))
 response=page.goto('http://127.0.0.1:8765/'+name+'.html',wait_until='networkidle')
 assert response.status==200
 page.wait_for_timeout(1500)
 assert page.locator('canvas, svg').count()>0
 page.screenshot(path='renders/widget-'+name+'.png')
 print(json.dumps({'widget':name,'consoleErrors':errors}))
 browser.close()
 assert not errors,errors
