"""Run isolated browser tests: python3 tests/run_browser.py auth|app
Requires Chrome/Chromium. Uses fake Google/D1 fixtures, never real credentials.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
MODE = sys.argv[1] if len(sys.argv) > 1 else 'auth'
if MODE not in ('auth', 'app'):
    raise SystemExit('Choose auth or app')
result = threading.Event()
messages = []

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'public'), **kwargs)

    def log_message(self, *_):
        pass

    def content(self, body, content_type):
        data = body.encode()
        self.send_response(200)
        self.send_header('Content-Type', content_type)
        self.send_header('Content-Length', str(len(data)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == '/check.html':
            if MODE == 'auth':
                html = '<!doctype html><script type="module" src="/test-auth.js"></script>'
            else:
                html = (ROOT / 'public/index.html').read_text().replace('</html>', '<script src="/test-app.js" defer></script></html>')
            self.content(html, 'text/html; charset=utf-8')
        elif self.path == '/test-auth.js':
            self.content((ROOT / 'tests/auth-check.js').read_text(), 'text/javascript')
        elif self.path == '/test-app.js':
            script = (ROOT / 'tests/browser-check.js').read_text()
            script = script.replace("document.body.innerHTML = '<pre id=\"result\">PASS '+results.join(' | ')+'</pre>';", "fetch('/result', {method:'POST',body:'PASS APP: '+results.join(' | ')});")
            script = script.replace("document.body.innerHTML='<pre id=\"result\">FAIL '+e.message+'</pre>';", "fetch('/result', {method:'POST',body:'FAIL APP: '+e.message});")
            self.content(script, 'text/javascript')
        elif self.path == '/api/me':
            self.content(json.dumps({'sub':'fixture-account','email':'fixture@example.com','expiresAt':9999999999}), 'application/json')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path != '/result':
            self.send_error(404)
            return
        message = self.rfile.read(min(65536, int(self.headers['Content-Length']))).decode()
        messages.append(message)
        self.content('ok', 'text/plain')
        result.set()

chrome = os.environ.get('CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
# Prefer the installed binary over desktop launch wrappers.
if Path('/opt/google/chrome/chrome').exists():
    chrome = '/opt/google/chrome/chrome'
if not chrome:
    raise SystemExit('Chrome/Chromium is required')
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
threading.Thread(target=server.serve_forever, daemon=True).start()
with tempfile.TemporaryDirectory(prefix='redsheet-test-') as profile:
    process = subprocess.Popen([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--no-proxy-server', '--user-data-dir='+profile, f'http://127.0.0.1:{server.server_port}/check.html'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        if not result.wait(50):
            messages.append('FAIL: browser test timed out')
    finally:
        process.terminate()
        process.wait(timeout=5)
        server.shutdown()
print('\n'.join(messages))
raise SystemExit(0 if messages and all(m.startswith('PASS') for m in messages) else 1)
