// Cloudflare Pages advanced-mode Worker. Secrets and D1 stay on the server.
const SESSION = '__Host-redsheet-session';
const OAUTH = '__Host-redsheet-oauth';
const encoder = new TextEncoder();
const noCache = {'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer'};
function json(data, status = 200) { return new Response(JSON.stringify(data), {status,headers:{...noCache,'Content-Type':'application/json; charset=utf-8'}}); }
function cookie(request, name) {
 return (request.headers.get('Cookie') || '').split(';').map(v => v.trim()).find(v => v.startsWith(name + '='))?.slice(name.length + 1) || '';
}
function setCookie(name, value, seconds) {return `${name}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${seconds}`;}
function redirect(path, cookies = []) {
 const headers = new Headers({...noCache,Location:path});
 cookies.forEach(value => headers.append('Set-Cookie',value));
 return new Response(null,{status:303,headers});
}
function base64url(bytes) {return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function randomToken() { return base64url(crypto.getRandomValues(new Uint8Array(32))); }
async function hash(value) {return base64url(await crypto.subtle.digest('SHA-256',encoder.encode(value)));}
function unbase64(value) {
 const text = value.replace(/-/g,'+').replace(/_/g,'/');
 return Uint8Array.from(atob(text.padEnd(Math.ceil(text.length / 4) * 4,'=')),c => c.charCodeAt(0));
}
function seconds() { return Math.floor(Date.now()/1000); }
function configured(env) {
 return !!(env.DB && env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && /^https:\/\/[^/]+$/.test(env.APP_ORIGIN || ''));
}
async function sessionUser(request, env) {
 const token = cookie(request,SESSION);
 if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
 return env.DB.prepare(`SELECT s.google_sub AS sub, s.email, s.expires_at FROM sessions s
 JOIN allowed_accounts a ON a.email = s.email AND a.google_sub = s.google_sub
 WHERE s.token_hash = ? AND s.expires_at > ? AND a.enabled = 1`).bind(await hash(token),seconds()).first();
}
async function verifyGoogleIdToken(token, env, nonce) {
 const parts = token?.split('.');
 if (!parts || parts.length !== 3) throw new Error('invalid token');
 const header = JSON.parse(new TextDecoder().decode(unbase64(parts[0])));
 const claims = JSON.parse(new TextDecoder().decode(unbase64(parts[1])));
 if (header.alg !== 'RS256' || typeof header.kid !== 'string') throw new Error('invalid algorithm');
 const response = await fetch('https://www.googleapis.com/oauth2/v3/certs',{cf:{cacheTtl:3600}});
 if (!response.ok) throw new Error('key unavailable');
 const {keys} = await response.json();
 const jwk = keys.find(k => k.kid === header.kid && k.kty === 'RSA' && (!k.alg || k.alg === 'RS256'));
 if (!jwk) throw new Error('unknown key');
 const key = await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
 if (!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,unbase64(parts[2]),encoder.encode(parts[0]+'.'+parts[1]))) throw new Error('invalid signature');
 const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
 if (!['https://accounts.google.com','accounts.google.com'].includes(claims.iss) ||
     !audiences.includes(env.GOOGLE_CLIENT_ID) ||
     (audiences.length > 1 && claims.azp !== env.GOOGLE_CLIENT_ID) ||
     (claims.azp && claims.azp !== env.GOOGLE_CLIENT_ID) ||
     typeof claims.exp !== 'number' || claims.exp <= seconds() ||
     typeof claims.iat !== 'number' || claims.iat > seconds()+60 ||
     claims.nonce !== nonce || claims.email_verified !== true ||
     typeof claims.sub !== 'string' || !claims.sub ||
     typeof claims.email !== 'string' || claims.email.length > 254) throw new Error('invalid claims');
 return {sub:claims.sub,email:claims.email.toLowerCase()};
}
async function startLogin(request, env) {
 if (await sessionUser(request,env)) return redirect('/');
 const state = randomToken(), nonce = randomToken(), verifier = randomToken();
 await env.DB.prepare('DELETE FROM oauth_transactions WHERE expires_at <= ?').bind(seconds()).run();
 await env.DB.prepare('INSERT INTO oauth_transactions (state_hash,nonce,verifier,expires_at) VALUES (?,?,?,?)').bind(await hash(state),nonce,verifier,seconds()+600).run();
 const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
 url.search = new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:env.APP_ORIGIN+'/auth/callback',response_type:'code',scope:'openid email',state,nonce,code_challenge:await hash(verifier),code_challenge_method:'S256',prompt:'select_account'});
 return redirect(url.toString(),[setCookie(OAUTH,state,600)]);
}
async function callback(request, env) {
 const url = new URL(request.url), state = url.searchParams.get('state');
 const clear = setCookie(OAUTH,'',0);
 if (!state || state !== cookie(request,OAUTH) || !/^[A-Za-z0-9_-]{43}$/.test(state)) return redirect('/login?error=login',[clear]);
 // DELETE RETURNING consumes the transaction exactly once, including failed exchanges.
 const transaction = await env.DB.prepare('DELETE FROM oauth_transactions WHERE state_hash = ? AND expires_at > ? RETURNING nonce,verifier').bind(await hash(state),seconds()).first();
 if (!transaction || !url.searchParams.get('code') || url.searchParams.has('error')) return redirect('/login?error=login',[clear]);
 try {
  const response = await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:url.searchParams.get('code'),client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:env.APP_ORIGIN+'/auth/callback',grant_type:'authorization_code',code_verifier:transaction.verifier})});
  if (!response.ok) throw new Error('exchange failed');
  const tokens = await response.json();
  const user = await verifyGoogleIdToken(tokens.id_token,env,transaction.nonce);
  await env.DB.prepare('UPDATE allowed_accounts SET google_sub = ? WHERE email = ? AND enabled = 1 AND google_sub IS NULL').bind(user.sub,user.email).run();
  const allowed = await env.DB.prepare('SELECT email FROM allowed_accounts WHERE email = ? AND google_sub = ? AND enabled = 1').bind(user.email,user.sub).first();
  if (!allowed) return redirect('/login?error=denied',[clear,setCookie(SESSION,'',0)]);
  const days = Math.min(90,Math.max(1,Number(env.SESSION_DAYS) || 90));
  const lifetime = Math.floor(days*86400), token = randomToken();
  await env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(seconds()).run();
  // Retire the previous cookie on this browser when switching accounts.
  const previous = cookie(request,SESSION);
  if (previous) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(previous)).run();
  await env.DB.prepare('INSERT INTO sessions (token_hash,email,google_sub,created_at,expires_at) VALUES (?,?,?,?,?)').bind(await hash(token),user.email,user.sub,seconds(),seconds()+lifetime).run();
  return redirect('/',[clear,setCookie(SESSION,token,lifetime)]);
 } catch {
  return redirect('/login?error=login',[clear]);
 }
}
async function asset(request, env, path) {
 const url = new URL(request.url); if (path) url.pathname = path;
 const response = await env.ASSETS.fetch(new Request(url,request));
 const headers = new Headers(response.headers);
 headers.set('Cache-Control','no-store');
 headers.set('Vary','Cookie');
 headers.set('X-Content-Type-Options','nosniff');
 headers.set('Referrer-Policy','no-referrer');
 headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
 return new Response(response.body,{status:response.status,headers});
}
async function handle(request, env) {
 const url = new URL(request.url), path = url.pathname;
 // This script only removes old offline caches and must remain reachable without a session.
 if (path === '/sw.js' && request.method === 'GET') return asset(request,env);
 if (!configured(env)) return new Response('認証設定が未完了です。READMEのGoogleログイン設定を確認してください。',{status:503,headers:{...noCache,'Content-Type':'text/plain; charset=utf-8'}});
 if (url.origin !== env.APP_ORIGIN) return json({error:'このドメインでは利用できません。'},403);
 if (request.method === 'POST' && request.headers.get('Origin') !== env.APP_ORIGIN) return json({error:'Invalid origin'},403);
 if (path === '/auth/logout') {
  if (request.method !== 'POST') return json({error:'Method not allowed'},405);
  const token = cookie(request,SESSION);
  if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await hash(token)).run();
  return redirect('/login',[setCookie(SESSION,'',0),setCookie(OAUTH,'',0)]);
 }
 if (!['GET','HEAD'].includes(request.method)) return json({error:'Method not allowed'},405);
 if (path === '/auth/login') return startLogin(request,env);
 if (path === '/auth/callback') return callback(request,env);
 if (path === '/login' || path === '/login.html') return asset(request,env,'/login.html');
 if (['/login.js','/auth.css','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'].includes(path)) return asset(request,env);
 const user = await sessionUser(request,env);
 if (!user) {
  if (path.startsWith('/api/')) return json({error:'unauthorized'},401);
  return redirect('/login',[setCookie(SESSION,'',0)]);
 }
 if (path === '/api/me') return json({sub:user.sub,email:user.email,expiresAt:user.expires_at});
 if (path.startsWith('/api/')) return json({error:'Not found'},404);
 return asset(request,env);
}
export default {
 async fetch(request, env) {
  try {return await handle(request,env);}
  catch {return json({error:'認証サービスに接続できません。時間をおいて再試行してください。'},503);}
 }
};
export {handle, hash, sessionUser, verifyGoogleIdToken};
