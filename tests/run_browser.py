"""Run isolated browser tests: python3 tests/run_browser.py auth|app|memory
Requires Chrome/Chromium. Uses fake Google/D1 fixtures, never real credentials.
"""
import base64
import time
from cryptography.hazmat.primitives.asymmetric import ec, utils
from cryptography.hazmat.primitives import hashes
import http.server
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import tempfile
import threading

ROOT = Path(__file__).resolve().parents[1]
MODE = 'auth'
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
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        server.request_counts[self.path]=server.request_counts.get(self.path,0)+1
        if self.path == '/test-slow-body':
            self.send_response(200)
            self.send_header('Content-Type','text/plain')
            self.send_header('Content-Length','2')
            self.end_headers()
            self.wfile.write(b'a');self.wfile.flush();time.sleep(.3)
            try:self.wfile.write(b'b')
            except (BrokenPipeError,ConnectionResetError):pass
            return
        if self.path == '/test-request-counts':
            self.content(json.dumps(server.request_counts),'application/json');return
        if self.path == '/index.html':
            self.send_response(308);self.send_header('Location','/');self.end_headers();return
        if self.path == '/simulate-offline':
            server.simulate_offline = True
            self.content('ok', 'text/plain')
            return
        if getattr(server, 'simulate_offline', False):
            self.connection.shutdown(socket.SHUT_RDWR)
            self.connection.close()
            return
        if self.path == '/check.html':
            if MODE == 'auth':
                html = '<!doctype html><script src="/offline.js"></script><script type="module" src="/test-auth.js"></script>'
            else:
                html = (ROOT / 'public/index.html').read_text().replace('<script src="/offline.js"', '<script src="/test-timers.js"></script><script src="/offline.js"').replace('</html>', '<script src="/test-app.js" defer></script></html>')
            self.content(html, 'text/html; charset=utf-8')
        elif self.path == '/test-auth.js':
            self.content((ROOT / 'tests/auth-check.js').read_text(), 'text/javascript')
        elif self.path == '/test-timers.js':
            if MODE == 'memory':
                self.content((ROOT / 'tests/memory-probes.js').read_text(), 'text/javascript');return
            self.content("window.__testIntervals=[];const nativeInterval=window.setInterval;window.setInterval=(callback,delay,...args)=>{window.__testIntervals.push(delay);return nativeInterval(callback,delay,...args);};", 'text/javascript')
        elif self.path == '/test-app.js':
            script = (ROOT / ('tests/memory-check.js' if MODE == 'memory' else 'tests/browser-check.js')).read_text()
            script = script.replace("document.body.innerHTML = '<pre id=\"result\">PASS '+results.join(' | ')+'</pre>';", "fetch('/result', {method:'POST',body:'PASS APP: '+results.join(' | ')});")
            script = script.replace("document.body.innerHTML='<pre id=\"result\">FAIL '+e.message+'</pre>';", "fetch('/result', {method:'POST',body:'FAIL APP: '+e.message});")
            script = script.replace("document.body.innerHTML='<pre id=\"result\">FAIL '+e.message+' | '+results.join(' | ')+'</pre>';", "fetch('/result', {method:'POST',body:'FAIL APP: '+e.message+' | '+results.join(' | ')});")
            self.content(script, 'text/javascript')
        elif self.path == '/api/sync':
            if server.cloud_backup is None:
                self.content(json.dumps({'exists':False}), 'application/json')
            else:
                data=server.cloud_backup.encode()
                self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('ETag', server.cloud_etag);self.end_headers();self.wfile.write(data)
        elif self.path == '/simulate-remote-update':
            server.cloud_etag='"remote-update"';self.content('ok','text/plain')
        elif self.path == '/api/offline-permit':
            self.content(json.dumps(permit), 'application/json')
        elif self.path == '/api/me':
            self.content(json.dumps({'sub':'fixture-account','email':'fixture@example.com','expiresAt':9999999999}), 'application/json')
        else:
            super().do_GET()

    def do_POST(self):
        if self.path == '/api/sync':
            server.cloud_backup=self.rfile.read(int(self.headers['Content-Length'])).decode()
            server.cloud_etag='"saved-version"'
            self.content(json.dumps({'etag':server.cloud_etag,'savedAt':'2026-11-07T00:00:00Z'}),'application/json')
            return
        if self.path != '/result':
            self.send_error(404)
            return
        message = self.rfile.read(min(65536, int(self.headers['Content-Length']))).decode()
        messages.append(message)
        self.content('ok', 'text/plain')
        result.set()

def start_server(mode='app'):
    global MODE, server, permit
    MODE = mode
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    server.request_counts={}
    server.cloud_backup=None
    server.cloud_etag=None
    def b64(data):
        return base64.urlsafe_b64encode(data).decode().rstrip('=')
    private = ec.generate_private_key(ec.SECP256R1())
    numbers = private.public_key().public_numbers()
    now = int(time.time())
    payload = b64(json.dumps({'sub':'fixture-account','email':'fixture@example.com','origin':f'http://127.0.0.1:{server.server_port}','iat':now,'exp':now+259200}).encode())
    r, s = utils.decode_dss_signature(private.sign(payload.encode(), ec.ECDSA(hashes.SHA256())))
    permit = {'token':payload+'.'+b64(r.to_bytes(32,'big')+s.to_bytes(32,'big')),'key':{'kty':'EC','crv':'P-256','x':b64(numbers.x.to_bytes(32,'big')),'y':b64(numbers.y.to_bytes(32,'big')),'ext':True,'key_ops':['verify']}}
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server

def main():
    global MODE
    MODE = sys.argv[1] if len(sys.argv) > 1 else 'auth'
    if MODE not in ('auth', 'app', 'memory'):
        raise SystemExit('Choose auth, app or memory')
    chrome = os.environ.get('CHROME') or shutil.which('google-chrome') or shutil.which('chromium')
    # Prefer the installed binary over desktop launch wrappers.
    if Path('/opt/google/chrome/chrome').exists():
        chrome = '/opt/google/chrome/chrome'
    if not chrome:
        raise SystemExit('Chrome/Chromium is required')
    start_server(MODE)
    with tempfile.TemporaryDirectory(prefix='redsheet-test-') as profile:
        process = subprocess.Popen([chrome, '--headless', '--no-sandbox', '--disable-gpu', '--no-proxy-server', *(['--js-flags=--expose-gc','--enable-precise-memory-info'] if MODE=='memory' else []), '--user-data-dir='+profile, f'http://127.0.0.1:{server.server_port}/check.html'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            if not result.wait(90 if MODE == 'memory' else 50):
                messages.append('FAIL: browser test timed out')
        finally:
            process.terminate()
            process.wait(timeout=5)
            server.shutdown()
    print('\n'.join(messages))
    raise SystemExit(0 if messages and all(m.startswith('PASS') for m in messages) else 1)

if __name__ == '__main__':
    main()
