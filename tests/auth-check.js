import worker, {hash, verifyGoogleIdToken} from '/_worker.js';
const passed = [];
function check(name, value) {if (!value) throw new Error(name);passed.push(name);}
const accounts = new Map(), sessions = new Map(), transactions = new Map();
const env = {APP_ORIGIN:'https://test.example',GOOGLE_CLIENT_ID:'test-client',GOOGLE_CLIENT_SECRET:'secret',SESSION_DAYS:'90',ASSETS:{fetch:async () => new Response('asset')}};
env.DB = {prepare(sql) {return {bind(...args) {return {
 async first() {
  if (sql.startsWith('SELECT s.google_sub')) {
   const s = sessions.get(args[0]), a = s && accounts.get(s.email);
   return s && s.expires_at > args[1] && a?.enabled && a.sub === s.google_sub ? {sub:s.google_sub,email:s.email,expires_at:s.expires_at} : null;
  }
  if (sql.startsWith('DELETE FROM oauth_transactions WHERE state_hash')) {
   const t = transactions.get(args[0]); transactions.delete(args[0]); return t && t.expires_at > args[1] ? t : null;
  }
  if (sql.startsWith('SELECT email FROM allowed_accounts')) {
   const a = accounts.get(args[0]); return a?.enabled && a.sub === args[1] ? {email:args[0]} : null;
  }
  throw new Error('unexpected query: '+sql);
 },
 async run() {
  if (sql.startsWith('INSERT INTO oauth_transactions')) transactions.set(args[0],{nonce:args[1],verifier:args[2],expires_at:args[3]});
  else if (sql.startsWith('INSERT INTO sessions')) sessions.set(args[0],{email:args[1],google_sub:args[2],created_at:args[3],expires_at:args[4]});
  else if (sql.startsWith('UPDATE allowed_accounts')) {const a = accounts.get(args[1]);if (a?.enabled && !a.sub) a.sub = args[0];}
  else if (sql.startsWith('DELETE FROM sessions WHERE token_hash')) sessions.delete(args[0]);
  else if (sql.startsWith('DELETE FROM sessions WHERE expires_at') || sql.startsWith('DELETE FROM oauth_transactions WHERE expires_at')) { /* No expired fixtures. */ }
  else throw new Error('unexpected mutation: '+sql);
  return {success:true};
 }
};}};}};
const objects=new Map();let objectVersion=0;
env.BACKUPS={
 async get(key){const item=objects.get(key);return item?{...item,body:new Blob([item.bytes]).stream()}:null;},
 async put(key,body,options={}){
  const previous=objects.get(key),h=options.onlyIf;
  if(h&&((h.get('If-None-Match')==='*'&&previous)||(h.get('If-Match')&&h.get('If-Match')!==previous?.httpEtag)))return null;
  const bytes=body instanceof ReadableStream?new Uint8Array(await new OriginalResponse(body).arrayBuffer()):typeof body==='string'?new TextEncoder().encode(body):body;
  const etag='version-'+(++objectVersion),item={key,bytes,etag,httpEtag:'"'+etag+'"',uploaded:new Date()};objects.set(key,item);return item;
 },
 async list({prefix}){return{objects:[...objects.values()].filter(o=>o.key.startsWith(prefix))};},
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])objects.delete(key);}
};
function request(path, headers = {}, method='GET') {return {url:env.APP_ORIGIN+path,headers:new Headers(headers),method};}
function b64(bytes) {return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
const originalFetch = globalThis.fetch;
// Browser Response hides Set-Cookie; a Worker Response exposes it. Preserve it in this harness.
const OriginalResponse = globalThis.Response;
globalThis.Response = class extends OriginalResponse {
 constructor(body, init = {}) {
  super(body, init);
  Object.defineProperty(this, 'headers', {value:new Headers(init.headers)});
 }
};
try {
 let response = await worker.fetch(request('/'),env);
 check('anonymous page denied',response.status === 303 && response.headers.get('Location') === '/login');
 check('anonymous API denied',(await worker.fetch(request('/api/me'),env)).status === 401);
 check('missing configuration closed',(await worker.fetch(request('/'),{ASSETS:env.ASSETS})).status === 503);
 check('other origin rejected',(await worker.fetch(new Request('https://preview.example/'),env)).status === 403);
 check('logout GET denied',(await worker.fetch(request('/auth/logout'),env)).status === 405);
 check('logout CSRF denied',(await worker.fetch(request('/auth/logout',{Origin:'https://evil.example'},'POST'),env)).status === 403);
 const keypair = await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
 const jwk = await crypto.subtle.exportKey('jwk',keypair.publicKey); jwk.kid = 'test-key'; jwk.alg = 'RS256';
 let idToken = '', lastCallback = null;
 globalThis.fetch = async (url) => {
  if (String(url).includes('/oauth2/v3/certs')) return Response.json({keys:[jwk]});
  if (String(url) === 'https://oauth2.googleapis.com/token') return Response.json({id_token:idToken});
  throw new Error('unexpected external fetch');
 };
 async function login(email, sub, overrides={}) {
  const start = await worker.fetch(request('/auth/login'),env);
  const authURL = new URL(start.headers.get('Location'));
  const state = authURL.searchParams.get('state'), nonce = authURL.searchParams.get('nonce');
  check('PKCE present',authURL.searchParams.get('code_challenge_method') === 'S256');
  const now = Math.floor(Date.now()/1000);
  const claims = {iss:'https://accounts.google.com',aud:env.GOOGLE_CLIENT_ID,iat:now,exp:now+3600,nonce,email,email_verified:true,sub,...overrides};
  const unsigned = b64(new TextEncoder().encode(JSON.stringify({alg:'RS256',kid:'test-key'})))+'.'+b64(new TextEncoder().encode(JSON.stringify(claims)));
  idToken = unsigned+'.'+b64(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keypair.privateKey,new TextEncoder().encode(unsigned)));
  if (!Object.keys(overrides).length) await verifyGoogleIdToken(idToken,env,nonce);
  lastCallback = request('/auth/callback?state='+state+'&code=code',{Cookie:'__Host-redsheet-oauth='+state});
  return worker.fetch(lastCallback,env);
 }
 response = await worker.fetch(request('/auth/callback?state=forged&code=x'),env);
 check('OAuth state rejected',response.headers.get('Location') === '/login?error=login');
 response = await login('unlisted@gmail.com','unlisted');
 check('unlisted account rejected',response.headers.get('Location') === '/login?error=denied');
 accounts.set('allowed@gmail.com',{enabled:1,sub:null});
 response = await login('allowed@gmail.com','google-user');
 check('allowed account login',response.headers.get('Location') === '/');
 check('OAuth callback replay rejected',(await worker.fetch(lastCallback,env)).headers.get('Location') === '/login?error=login');
 const cookieHeader = response.headers.get('Set-Cookie');
 const token = /__Host-redsheet-session=([A-Za-z0-9_-]{43})/.exec(cookieHeader)?.[1];
 check('secure cookie and 90 days',!!token && cookieHeader.includes('HttpOnly') && cookieHeader.includes('Secure') && cookieHeader.includes('SameSite=Lax') && cookieHeader.includes('Max-Age=7776000'));
 check('token stored hashed',sessions.has(await hash(token)) && !sessions.has(token));
 const headers = {Cookie:'__Host-redsheet-session='+token};
 check('session survives next request',(await worker.fetch(request('/api/me',headers),env)).status === 200);
 check('authenticated asset served',(await worker.fetch(request('/',headers),env)).status === 200);
 const me = await (await worker.fetch(request('/api/me',headers),env)).json();
 check('account identity returned',me.sub === 'google-user');
 const signing=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 env.OFFLINE_PRIVATE_KEY=JSON.stringify(await crypto.subtle.exportKey('jwk',signing.privateKey));
 const permit=await(await worker.fetch(request('/api/offline-permit',headers),env)).json();
 const [payload,signature]=permit.token.split('.');
 const decode=x=>Uint8Array.from(atob(x.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(x.length/4)*4,'=')),c=>c.charCodeAt(0));
 const permitKey=await crypto.subtle.importKey('jwk',permit.key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
 check('offline permit signed',await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},permitKey,decode(signature),new TextEncoder().encode(payload)));
 const claims=JSON.parse(new TextDecoder().decode(decode(payload)));
 check('offline permission three days',claims.exp-claims.iat===259200&&claims.sub==='google-user');
 const session=sessions.get(await hash(token));const fullExpiry=session.expires_at;session.expires_at=Math.floor(Date.now()/1000)+3600;
 const short=await(await worker.fetch(request('/api/offline-permit',headers),env)).json();
 check('permit limited by session',JSON.parse(new TextDecoder().decode(decode(short.token.split('.')[0]))).exp===session.expires_at);session.expires_at=fullExpiry;
 check('anonymous cloud denied',(await worker.fetch(request('/api/sync'),env)).status===401);
 check('empty cloud',(await(await worker.fetch(request('/api/sync',headers),env)).json()).exists===false);
 const backup={format:'redsheet-local-backup',version:1,createdAt:new Date().toISOString(),library:{notes:[],folders:[]}};
 function upload(precondition,body=JSON.stringify(backup)){
  return worker.fetch({url:env.APP_ORIGIN+'/api/sync',method:'POST',headers:new Headers({...headers,Origin:env.APP_ORIGIN,...precondition}),body:new Blob([body]).stream()},env);
 }
 check('sync precondition required',(await upload({})).status===428);
 const first=await upload({'If-None-Match':'*'});check('first cloud upload',first.status===200);const firstMeta=await first.json();
 check('stale cloud upload rejected',(await upload({'If-None-Match':'*'})).status===409);
 const cloud=await worker.fetch(request('/api/sync',headers),env);check('cloud download etag',cloud.headers.get('ETag')===firstMeta.etag);
 check('cloud data roundtrip',(await cloud.json()).format==='redsheet-local-backup');
 check('conditional update succeeds',(await upload({'If-Match':firstMeta.etag})).status===200);
 check('old version cannot overwrite',(await upload({'If-Match':firstMeta.etag})).status===409);
 check('previous snapshot retained',[...objects.keys()].some(k=>k.includes('/history/')));
 const secondToken='b'.repeat(43);accounts.set('second@gmail.com',{enabled:1,sub:'second'});sessions.set(await hash(secondToken),{email:'second@gmail.com',google_sub:'second',expires_at:Math.floor(Date.now()/1000)+100});
 check('cloud account separation',(await(await worker.fetch(request('/api/sync',{Cookie:'__Host-redsheet-session='+secondToken}),env)).json()).exists===false);
 accounts.get('allowed@gmail.com').enabled = 0;
 check('revoked account denied with cookie',(await worker.fetch(request('/api/me',headers),env)).status === 401);
 accounts.get('allowed@gmail.com').enabled = 1;
 response = await login('allowed@gmail.com','different-sub');
 check('email cannot switch Google identity',response.headers.get('Location') === '/login?error=denied');
 response = await login('allowed@gmail.com','google-user',{email_verified:false});
 check('unverified email rejected',response.headers.get('Location') === '/login?error=login');
 response = await login('allowed@gmail.com','google-user',{aud:'wrong-client'});
 check('wrong audience rejected',response.headers.get('Location') === '/login?error=login');
 response = await login('allowed@gmail.com','google-user',{nonce:'wrong-nonce'});
 check('wrong nonce rejected',response.headers.get('Location') === '/login?error=login');
 response = await login('allowed@gmail.com','google-user',{exp:1});
 check('expired Google token rejected',response.headers.get('Location') === '/login?error=login');
 const s = sessions.get(await hash(token)); s.expires_at = 1;
 check('expired session denied',(await worker.fetch(request('/api/me',headers),env)).status === 401);
 s.expires_at = Math.floor(Date.now()/1000)+100;
 response = await worker.fetch(request('/auth/logout',{...headers,Origin:env.APP_ORIGIN},'POST'),env);
 check('logout revokes session',response.status === 303 && !sessions.has(await hash(token)));
 check('logged out cookie rejected',(await worker.fetch(request('/api/me',headers),env)).status === 401);
 globalThis.fetch = originalFetch; globalThis.Response = OriginalResponse;
 await fetch('/result',{method:'POST',body:'PASS AUTH: '+passed.join(' | ')});
} catch(error) {
 globalThis.fetch = originalFetch; globalThis.Response = OriginalResponse;
 await fetch('/result',{method:'POST',body:'FAIL AUTH: '+error.message+'\n'+error.stack});
}
