"""Rebuild browser libraries from version-pinned official npm archives.
Run from the repository root: python3 tools/vendor_assets.py
No npm install or Cloudflare build step is required.
"""
from pathlib import Path
import hashlib
import io
import json
import re
import tarfile
import urllib.request

root = Path(__file__).resolve().parents[1]
lock = json.loads((root / 'vendor-lock.json').read_text())
for name, package in lock.items():
    data = urllib.request.urlopen(package['url'], timeout=60).read()
    if hashlib.sha512(data).hexdigest() != package['sha512']:
        raise SystemExit(f'Integrity check failed: {name}')
    folder = root / 'public/vendor' / f"{name}-{package['version']}"
    folder.mkdir(parents=True, exist_ok=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        for member in archive:
            path = member.name
            keep = (path == 'package/LICENSE' or
                    name == 'katex' and (path in ('package/dist/katex.min.js', 'package/dist/katex.min.css') or path.startswith('package/dist/fonts/') and path.endswith('.woff2')) or
                    name == 'mermaid' and path == 'package/dist/mermaid.min.js')
            if not keep or not member.isfile():
                continue
            relative = Path('LICENSE' if path == 'package/LICENSE' else path.removeprefix('package/dist/'))
            if relative.is_absolute() or '..' in relative.parts:
                raise SystemExit('Invalid archive path')
            content = archive.extractfile(member).read()
            if relative.suffix == '.css':
                content = re.sub(rb',url\([^)]*\) format\("(?:woff|truetype)"\)', b'', content)
            target = folder / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(content)
assets = ['/' + str(p.relative_to(root / 'public')) for p in sorted((root / 'public/vendor').rglob('*')) if p.is_file() and p.name != 'LICENSE']
cache = 'redsheet-libs-' + '-'.join(name+'-'+info['version'] for name,info in lock.items())
(root / 'public/vendor-manifest.js').write_text('self.REDSHEET_VENDOR='+json.dumps({'cache':cache,'assets':assets}, indent=2)+';\n')
print('Vendored libraries verified and written. Commit public/vendor, vendor-lock.json and vendor-manifest.js together.')
