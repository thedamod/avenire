"""CDP is loopback-only. The browser is the real, headed taskbar Chromium."""
import sys, json, base64
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser=p.chromium.connect_over_cdp('http://127.0.0.1:9222')
    pages=[page for context in browser.contexts for page in context.pages]
    candidates=[page for page in pages if '/interaction.html' in page.url]
    assert candidates, 'No interaction page'
    visible=[page for page in candidates if page.evaluate('document.visibilityState')=='visible']
    page=visible[-1] if visible else candidates[-1]
    page.bring_to_front()
    page.wait_for_timeout(100)
    result=page.evaluate(base64.b64decode(sys.argv[1]).decode())
    print(json.dumps(result))
    browser.close()
