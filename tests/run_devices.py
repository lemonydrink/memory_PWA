"""Cross-engine touch/layout checks. See docs/devices.md for setup and limits."""
import argparse
import os
from pathlib import Path
from playwright.sync_api import sync_playwright
from run_browser import start_server

PROFILES = [
    ('ipad-portrait', 'webkit', 834, 1194),
    ('ipad-landscape', 'webkit', 1194, 834),
    ('ipad-split', 'webkit', 375, 1024),
    ('android-phone', 'chromium', 412, 915),
    ('android-landscape', 'chromium', 915, 412),
    ('android-small', 'chromium', 320, 568),
    ('android-tablet', 'chromium', 1280, 800),
]

def check(value, message):
    if not value:
        raise AssertionError(message)

def run_profile(browser, engine, name, width, height, origin, screenshots):
    device_options={}
    if engine=='chromium':
        device_options['user_agent']='Mozilla/5.0 (Linux; Android 15; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36'
    context = browser.new_context(**device_options, viewport={'width': width, 'height': height}, is_mobile=True, has_touch=True, device_scale_factor=1)
    if engine == 'webkit':
        # Desktop-mode iPad UA detection must not hide the Apple help.
        context.add_init_script("Object.defineProperty(navigator,'platform',{get:()=> 'MacIntel'});Object.defineProperty(navigator,'maxTouchPoints',{get:()=>5});")
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    try:
        page.goto(origin)
        page.wait_for_function("window.redsheetRich && document.getElementById('accountStatus') && !document.body.classList.contains('auth-locked')")
        check(page.evaluate("folderId==='' && phone.dataset.mode==='library'"), 'home startup')
        page.wait_for_function("Math.abs(document.getElementById('phone').getBoundingClientRect().height-visualViewport.height)<2")
        check(page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), 'home horizontal overflow')
        if width >= 768:
            check(page.locator('#phone').bounding_box()['width'] > 760, 'tablet width unused')
        if engine == 'webkit':
            check('Safari' in page.locator('#installHint').text_content(), 'iPad desktop-mode install help')
        if name in ('ipad-portrait','android-phone'):
            check(page.evaluate('''async()=>{
                const saved=AbortSignal.timeout;AbortSignal.timeout=undefined;
                try{
                    const ok=await(await redsheetDevice.fetch('/api/me',{},2000)).json();
                    let aborted=false;
                    try{await(await redsheetDevice.fetch('/test-slow-body',{},60)).text();}catch(e){aborted=e.name==='AbortError';}
                    return ok.sub==='fixture-account'&&aborted;
                }finally{AbortSignal.timeout=saved;}
            }'''), 'fallback timeout fails to abort response body')
            page.locator('#deviceHelp summary').tap()
            page.evaluate('''()=>{
                window.__installPrompts=0;
                const event=new Event('beforeinstallprompt',{cancelable:true});
                event.prompt=async()=>{window.__installPrompts++;};event.userChoice=Promise.resolve({outcome:'dismissed'});
                window.dispatchEvent(event);
            }''')
            page.locator('#installApp').tap()
            check(page.evaluate("window.__installPrompts===1&&document.getElementById('installApp').hidden"), 'install prompt should be one-use')
            page.locator('#deviceHelp summary').tap()
        if engine=='chromium':
            check('Chrome' in page.locator('#installHint').text_content(), 'Android install help')
        page.locator('#menuButton').tap()
        page.wait_for_function("document.getElementById('drawer').getBoundingClientRect().left>=-1")
        close = page.locator('#closeButton').bounding_box()
        check(0 <= close['y'] < height-44, 'drawer close outside viewport')
        page.locator('#closeButton').tap()
        page.evaluate('window.redsheetShowUpload()')
        page.locator('[data-folder-id="biology"]').tap()
        page.locator('[data-folder-id="cells"]').tap()
        page.get_by_role('button', name='＋ この中にフォルダを作る').tap()
        field = page.get_by_role('textbox', name='新しいフォルダ名')
        field.fill('端末テスト')
        check(field.evaluate("e=>parseFloat(getComputedStyle(e).fontSize)>=16"), 'input can trigger automatic zoom')
        # Resize models the available area shrinking; this does not emulate an OS keyboard.
        page.set_viewport_size({'width': width, 'height': min(340, height)})
        page.wait_for_function("Math.abs(document.getElementById('phone').clientHeight-visualViewport.height)<2")
        page.locator('.folder-picker-create').get_by_role('button', name='キャンセル').tap()
        page.set_viewport_size({'width': width, 'height': height})
        page.locator('#noteFile').set_input_files({'name':'device.md','mimeType':'text/markdown','buffer':'# 端末の確認\n\n## 学習\n\n**保存**できました。'.encode()})
        page.wait_for_function("!pendingImport && phone.dataset.mode==='library' && catalog.notes.some(n=>n.name==='端末の確認')")
        check(page.evaluate("folderId==='cells' && catalog.notes.find(n=>n.name==='端末の確認').folder==='cells'"), 'file import destination')
        lesson={'id':'device-rich','kind':'learn','name':'画面確認','assets':{},'body':'$\\frac{1}{2}$\n\n|'+ '|'.join(['列']*10)+'|\n|'+ '|'.join(['---']*10)+'|\n|'+ '|'.join(['**答え**']*10)+'|\n\n```mermaid\nflowchart LR\n A[問題] --> B[答え]\n```'}
        page.evaluate('note=>openNote(note)', lesson)
        page.wait_for_selector('.note-diagram svg')
        check(page.locator('.reading .katex').count() > 0, 'TeX render')
        check(page.evaluate("document.documentElement.scrollWidth<=innerWidth+1"), 'lesson horizontal overflow')
        check(page.locator('.note-table-scroll').evaluate('e=>e.scrollWidth>e.clientWidth'), 'wide table cannot scroll')
        check(page.locator('#reading').evaluate("e=>getComputedStyle(e).touchAction==='auto'"), 'table and pinch gestures restricted')
        page.evaluate('''()=>{
            const table=document.querySelector('.note-table-scroll');
            table.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,isPrimary:true,button:0,pointerId:90,clientX:phone.getBoundingClientRect().left+10,clientY:180}));
            table.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerId:90,clientX:phone.getBoundingClientRect().left+100,clientY:180}));
        }''')
        check(page.evaluate("!phone.classList.contains('menu-open')"), 'table gesture opens drawer')

        if engine=='chromium':
            touch=context.new_cdp_session(page)
            def swipe_touch(x1,y1,x2,y2):
                touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x1,'y':y1}]})
                for step in range(1,6):
                    touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x1+(x2-x1)*step/5,'y':y1+(y2-y1)*step/5}]})
                touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            table=page.locator('.note-table-scroll').bounding_box()
            swipe_touch(table['x']+table['width']-25,table['y']+20,table['x']+25,table['y']+20)
            page.wait_for_function("document.querySelector('.note-table-scroll').scrollLeft>0")
            check(page.evaluate("!phone.classList.contains('menu-open')"), 'native table swipe opens drawer')
        page.evaluate('setSheetStage(0)')
        page.locator('#grip').focus()
        for stage in range(1, 5):
            page.keyboard.press('ArrowDown')
            check(page.evaluate('sheetStage') == stage, 'five sheet positions')
        page.wait_for_timeout(280)
        grip = page.locator('#grip').bounding_box()
        check(grip['y'] >= 0 and grip['y']+grip['height'] <= height+1, 'sheet grip outside viewport')
        quiz={'id':'device-quiz','kind':'test','name':'確認問題','questions':[{'question':'答えは？','answer':'正解','prompt':'','explanation':'解説'}],'assets':{}}
        page.evaluate('note=>openNote(note)', quiz)
        if engine=='chromium':
            body=page.locator('#testBody').bounding_box()
            swipe_touch(body['x']+5,body['y']+body['height']-20,body['x']+5,body['y']+body['height']-105)
            page.wait_for_function('answerShown && !testTransitioning')
            swipe_touch(body['x']+5,body['y']+body['height']-105,body['x']+5,body['y']+body['height']-20)
            page.wait_for_function('!answerShown && !testTransitioning')
            touch.detach()
        page.locator('#revealAnswer').tap()
        page.wait_for_function('answerShown && !testTransitioning')
        controls = page.locator('.test-controls').bounding_box()
        check(controls['y']+controls['height'] <= height+1, 'quiz controls outside viewport')
        page.locator('#previousQuestion').tap()
        page.wait_for_function('!answerShown && !testTransitioning')
        page.evaluate('showLibrary()')
        if screenshots:
            page.screenshot(path=str(screenshots/(name+'.png')))
        context.set_offline(True)
        page.reload()
        page.wait_for_function("window.redsheetUser?.offline && document.getElementById('accountStatus') && !document.body.classList.contains('auth-locked')")
        check(page.evaluate("folderId==='' && phone.dataset.mode==='library'"), 'offline startup home')
        page.evaluate("openFolder('cells')")
        page.get_by_role('button', name='端末の確認 赤シート', exact=False).tap()
        check(page.locator('.reading .term').inner_text()=='保存', 'persisted offline lesson')
        check(not errors, 'JavaScript errors: '+repr(errors))
        print('PASS '+name+': layout, folder upload, keyboard-area resize, TeX/Mermaid, five stops, touch controls, persisted offline launch', flush=True)
    finally:
        context.close()

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--engine', choices=['all','webkit','chromium'], default='all')
    parser.add_argument('--screenshots', type=Path)
    args=parser.parse_args()
    if args.screenshots:
        args.screenshots.mkdir(parents=True, exist_ok=True)
    server=start_server('app')
    try:
        with sync_playwright() as p:
            for engine in ('webkit','chromium'):
                if args.engine not in ('all',engine):
                    continue
                options={'headless': True}
                if engine=='chromium':
                    options['executable_path']=os.environ.get('CHROME','/opt/google/chrome/chrome')
                    options['args']=['--no-sandbox','--no-proxy-server']
                elif os.environ.get('REDSHEET_WEBKIT_EXECUTABLE'):
                    options['executable_path']=os.environ['REDSHEET_WEBKIT_EXECUTABLE']
                browser=getattr(p,engine).launch(**options)
                try:
                    for name, profile_engine, width, height in PROFILES:
                        if profile_engine==engine:
                            run_profile(browser,engine,name,width,height,f'http://127.0.0.1:{server.server_port}/',args.screenshots)
                finally:
                    browser.close()
    finally:
        server.shutdown()

if __name__=='__main__':
    main()
