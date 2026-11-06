"""Generate a private signing JWK locally; never commit the generated file.
Requires: python3 -m pip install cryptography
"""
import base64
import json
import os
from pathlib import Path
from cryptography.hazmat.primitives.asymmetric import ec

def encoded(number):
    return base64.urlsafe_b64encode(number.to_bytes(32, 'big')).decode().rstrip('=')

key = ec.generate_private_key(ec.SECP256R1()).private_numbers()
jwk = {'kty':'EC','crv':'P-256','x':encoded(key.public_numbers.x),'y':encoded(key.public_numbers.y),'d':encoded(key.private_value),'ext':True,'key_ops':['sign']}
path = Path('.offline-private-key.json')
with path.open('x') as output:
    os.chmod(path, 0o600)
    json.dump(jwk, output, separators=(',', ':'))
print('Saved .offline-private-key.json. Set its contents as OFFLINE_PRIVATE_KEY in Cloudflare Secrets. Never commit this file.')
