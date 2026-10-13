"""Live API examples: production CSP/theme, geometry styling, pixels and controls."""
from playwright.sync_api import sync_playwright
from PIL import Image
from collections import Counter
from pathlib import Path
import json, sys

name = sys.argv[1]
tokens = json.loads(Path('widget-tokens.json').read_text())
errors = []
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 650, 'height': 700}, device_scale_factor=2, reduced_motion='reduce')
    page.on('console', lambda msg: errors.append(msg.text) if msg.type == 'error' else None)
    page.on('pageerror', lambda error: errors.append(str(error)))
    response = page.goto('http://127.0.0.1:8765/'+name+'.html', wait_until='networkidle')
    assert response.status == 200
    page.wait_for_timeout(200)
    theme = name.rsplit('-', 1)[1]
    wrapper = page.locator('#demo')
    assert wrapper.get_attribute('data-theme') == theme
    assert wrapper.evaluate("e=>getComputedStyle(e).getPropertyValue('--figure-card').trim()") == tokens[theme]['--figure-card']
    assert page.locator('.iso-plate [data-readout]').text_content().strip()
    def luminance(value):
        channels = [c/255 for c in bytes.fromhex(value[1:])]
        return sum(weight * (c/12.92 if c <= .04045 else ((c+.055)/1.055)**2.4)
                   for c,weight in zip(channels,[.2126,.7152,.0722]))
    expected_text = 'rgb('+', '.join(str(c) for c in bytes.fromhex(tokens[theme]['--figure-text'][1:]))+')'
    assert page.locator('.iso-legend').evaluate('e=>getComputedStyle(e).color') == expected_text
    ground = luminance(tokens[theme]['--figure-card'])
    contrast = {}
    for key in ['--figure-text', '--figure-hi']:
        ink = luminance(tokens[theme][key])
        contrast[key] = (max(ink,ground)+.05)/(min(ink,ground)+.05)
        assert contrast[key] >= 4.5, (theme,key,contrast[key])
    # Framing/text cannot hide a blank drawing: sample the actual stage only.
    stage = page.locator('canvas, .iso-plate > svg').first
    stage_path = 'renders/widget-'+name+'-stage.png'
    stage.screenshot(path=stage_path)
    pixels = Counter(Image.open(stage_path).convert('RGB').get_flattened_data())
    count = sum(pixels.values())
    # Hairline rods and three small bobs intentionally occupy very little area.
    limit = .999 if name.startswith('pendulum-') else .995
    fraction = pixels.most_common(1)[0][1]/count
    assert len(pixels) > 12 and fraction < limit, ('Flat or empty widget drawing',name,len(pixels),fraction,limit)
    if name.startswith('iso-'):
        faces = page.locator('.iso-top, .iso-shade').evaluate_all("es=>es.map(e=>getComputedStyle(e).fill)")
        strokes = page.locator('.iso-edge').evaluate_all("es=>es.map(e=>({colour:getComputedStyle(e).stroke,width:parseFloat(getComputedStyle(e).strokeWidth)}))")
        assert len(set(faces)) >= 3 and all(c != 'rgb(0, 0, 0)' for c in faces), faces
        assert strokes and all(s['colour'] != 'none' and abs(s['width']-.6) < .01 for s in strokes), strokes
        for key in ['--figure-top', '--figure-shade-0', '--figure-shade-3']:
            rgb = tuple(bytes.fromhex(tokens[theme][key][1:]))
            assert pixels[rgb] > 20, (key, pixels[rgb])
        outline = tuple(bytes.fromhex(tokens[theme]['--figure-hi'][1:]))
        assert sum(n for c,n in pixels.items() if max(abs(c[i]-outline[i]) for i in range(3)) < 35) > 30, 'Missing visible hairlines'
    if name.startswith(('pendulum-', 'three-body-')):
        assert float(stage.get_attribute('data-time')) == 0
        page.get_by_role('button', name='Step', exact=True).click()
        assert float(stage.get_attribute('data-time')) > 0
        page.get_by_role('button', name='Reset', exact=True).click()
        assert float(stage.get_attribute('data-time')) == 0
        page.get_by_role('button', name='Run', exact=True).click()
        page.wait_for_timeout(120)
        page.get_by_role('button', name='Pause', exact=True).click()
        assert float(stage.get_attribute('data-time')) > 0
    page.screenshot(path='renders/widget-'+name+'.png', full_page=True)
    for other in ['light', 'dark']:
        before = stage.get_attribute('data-time')
        page.evaluate("d=>window.postMessage(d,'*')", {'type':'avenire:theme','colorScheme':other,'tokens':tokens[other]})
        page.wait_for_timeout(60)
        assert wrapper.get_attribute('data-theme') == other
        assert before == stage.get_attribute('data-time'), 'Theme reset model state'
    page.evaluate("d=>window.postMessage(d,'*')", {'type':'avenire:theme','colorScheme':theme,'tokens':tokens[theme]})
    page.wait_for_timeout(60)
    page.set_viewport_size({'width':390,'height':700})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'Phone overflow'
    corners = page.locator('[data-corner]').evaluate_all('es=>es.map(e=>({name:e.dataset.corner,x:e.getBoundingClientRect().x,y:e.getBoundingClientRect().y,right:e.getBoundingClientRect().right,bottom:e.getBoundingClientRect().bottom}))')
    hint = next(c for c in corners if c['name']=='hint')
    readout = next(c for c in corners if c['name']=='readout')
    assert hint['bottom'] <= readout['y'] or hint['right'] <= readout['x'], 'Hint/readout overlap'
    page.screenshot(path='renders/widget-'+name+'-phone.png', full_page=True)
    browser.close()
assert not errors, errors
print(json.dumps({'widget':name,'consoleErrors':errors,'drawingColours':len(pixels),'largestColourFraction':pixels.most_common(1)[0][1]/count,'contrast':contrast,'themes':'light/dark passed','phone':'390px passed'}))
