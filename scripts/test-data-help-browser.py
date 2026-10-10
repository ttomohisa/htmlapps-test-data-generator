"""Help layout regression. Development-only Playwright, no runtime dependency.
Run: CHROMIUM_PATH=/usr/bin/chromium python scripts/test-data-help-browser.py --source
Omit --source after the normal repository build to cover all three release artifacts.
The isolated HTTP fixture server binds only to loopback; app requests are monitored.
"""
import asyncio
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[1]

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

async def layout(page, width, height):
    box = await page.locator('#helpDialog').bounding_box()
    assert box and 12 <= box['y'] <= 33, f'Help opens near the viewport top: {box}'
    assert box['y'] + box['height'] <= height - 11, f'Help stays inside the viewport: {box}'
    assert await page.evaluate('document.documentElement.scrollWidth <= innerWidth'), 'no page-level horizontal overflow'
    body = page.locator('#helpBody')
    assert await body.count() == 1, 'independent Help reading area exists'
    body_box = await body.bounding_box()
    head = await page.locator('#helpDialog .dialog-header').bounding_box()
    assert body_box['y'] >= head['y'] + head['height'] - 1
    assert body_box['y'] + body_box['height'] <= box['y'] + box['height'] - 1
    assert await page.locator('#helpDialog').evaluate('(node) => node.scrollHeight <= node.clientHeight + 1'), 'outer dialog never clips its scroll area'

async def run_case(browser, url, relative, width, height, language):
    context = await browser.new_context(viewport={'width':width,'height':height},locale=language)
    page = await context.new_page()
    errors, requests = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('request', lambda req: requests.append(req.url) if req.url.startswith(('http:','https:')) else None)
    await page.goto(url)
    await page.locator('#helpButton').wait_for()
    await page.locator('#seedInput').fill('help-regression-seed')
    original = await page.locator('#columnList').inner_text()
    await page.evaluate('window.scrollTo({top:640,behavior:"instant"})')
    for method in ['button','escape','backdrop']:
        before_y = await page.evaluate('scrollY')
        await page.locator('#helpButton').click()
        await layout(page,width,height)
        body = page.locator('#helpBody')
        assert await body.evaluate('(node) => node.scrollTop') == 0, 'reopen starts at beginning'
        assert await page.locator('#closeHelpButton').evaluate('(node) => node === document.activeElement')
        locked_y = await page.evaluate('scrollY')
        await page.mouse.move(3,height//2)
        await page.mouse.wheel(0,600)
        await page.wait_for_timeout(80)
        assert await page.evaluate('scrollY') == locked_y, 'backdrop scrolling cannot move background'
        await page.keyboard.press('Tab')
        assert await body.evaluate('(node) => node === document.activeElement'), 'Tab reaches Help text'
        await page.keyboard.press('PageDown')
        await page.wait_for_function('document.querySelector("#helpBody").scrollTop > 0')
        close_before = await page.locator('#closeHelpButton').bounding_box()
        await body.evaluate('(node) => { node.scrollTop = node.scrollHeight; }')
        body_box = await body.bounding_box()
        last = await page.locator('#helpBody .dialog-note').bounding_box()
        assert last['y'] + last['height'] <= body_box['y'] + body_box['height'] + 1, 'last paragraph is reachable'
        assert close_before == await page.locator('#closeHelpButton').bounding_box(), 'close button remains fixed'
        if method == 'button': await page.locator('#closeHelpButton').click()
        elif method == 'escape': await page.keyboard.press('Escape')
        else: await page.mouse.click(2,2)
        await page.wait_for_function('!document.querySelector("#helpDialog").open')
        assert await page.evaluate('scrollY') == before_y, 'original page position restores exactly'
        assert await page.locator('#helpButton').evaluate('(node) => node === document.activeElement')
        assert await page.locator('#seedInput').input_value() == 'help-regression-seed'
        assert await page.locator('#columnList').inner_text() == original
    await page.locator('#helpButton').click()
    await page.set_viewport_size({'width':320,'height':300})
    await layout(page,320,300)
    await page.keyboard.press('Escape')
    assert await page.evaluate('getComputedStyle(document.body).position') != 'fixed', 'lock releases after resize'
    assert not errors, errors
    assert requests == [url], requests
    print(f'PASS {relative} {width}x{height} {language}: layout, scrolled page, lock/restore, keyboard, close/Escape/backdrop, reopen, resize, no runtime HTTP requests',flush=True)
    await context.close()

async def main():
    with TemporaryDirectory(prefix='test-data-help-') as tmp:
        folder = Path(tmp)
        files = ['src/index.template.html'] if '--source' in sys.argv else ['dist/index.html','dist/index.self-extract.html','test-data-generator.html']
        for index, relative in enumerate(files):
            html = (ROOT/relative).read_text(encoding='utf-8')
            if '--source' in sys.argv:
                html = html.replace('__APP_CONFIG_JSON__',json.dumps(json.loads((ROOT/'app.config.json').read_text(encoding='utf-8')),ensure_ascii=False)).replace('__BUILD_MANIFEST_JSON__','{}').replace('__EMBEDDED_ASSET_BUNDLE_JSON__','{}')
            (folder/f'{index}.html').write_text(html,encoding='utf-8')
        server = ThreadingHTTPServer(('127.0.0.1',0),partial(QuietHandler,directory=tmp))
        thread = Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            async with async_playwright() as playwright:
                launch={'args':['--no-sandbox','--disable-gpu']}
                if os.environ.get('CHROMIUM_PATH'): launch['executable_path']=os.environ['CHROMIUM_PATH']
                browser = await playwright.chromium.launch(**launch)
                try:
                    for index, relative in enumerate(files):
                        for width,height,lang in [(1280,900,'ja'),(1280,900,'en'),(320,480,'ja'),(320,480,'en'),(390,844,'ja'),(812,375,'en')]:
                            await run_case(browser,f'http://127.0.0.1:{server.server_port}/{index}.html',relative,width,height,lang)
                finally: await browser.close()
        finally: server.shutdown();server.server_close()

asyncio.run(main())
