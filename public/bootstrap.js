(() => {
 const gate = document.getElementById('authGate');
 let user = null, checking = null, appLoaded = false;
 function lock(message = 'ログイン状態を確認しています…') {
  document.body.classList.add('auth-locked'); gate.hidden = false;
  document.getElementById('authStatus').textContent = message;
 }
 async function check() {
  lock();
  if (checking) return checking;
  checking = (async () => {
   try {
    const response = await fetch('/api/me',{cache:'no-store',credentials:'same-origin',redirect:'error',signal:AbortSignal.timeout(15000)});
    if (response.status === 401 || response.status === 403) { location.replace('/login'); return; }
    if (!response.ok) throw new Error();
    const next = await response.json();
    if (typeof next.sub !== 'string') throw new Error();
    if (user && user.sub !== next.sub) { location.reload(); return; }
    user = next; window.redsheetUser = user;
    if (!appLoaded) {
     await new Promise((resolve,reject) => {
      const script = document.createElement('script'); script.src = '/app.js'; script.onload = resolve; script.onerror = reject; document.body.append(script);
     });
     appLoaded = true;
     const identity = document.createElement('p'); identity.className = 'library-status'; identity.textContent = user.email;
     const form = document.createElement('form'); form.method = 'POST'; form.action = '/auth/logout';
     const logout = document.createElement('button'); logout.type = 'submit'; logout.className = 'library-button secondary'; logout.textContent = 'ログアウト';
     form.append(logout); form.addEventListener('submit', () => lock('ログアウトしています…'));
     document.getElementById('library').append(identity,form);
    }
    if (!document.hidden) {gate.hidden = true; document.body.classList.remove('auth-locked');}
   } catch {
    lock('ログイン状態を確認できません。インターネット接続を確認して再試行してください。');
   }
  })().finally(() => {checking = null;});
  return checking;
 }
 document.getElementById('authRetry').addEventListener('click',check);
 document.addEventListener('visibilitychange',() => {if (document.hidden) lock(); else check();});
 window.addEventListener('pagehide',() => lock());
 window.addEventListener('pageshow',() => check());
 window.addEventListener('offline',() => lock('オフラインでは利用許可を確認できません。接続後に再試行してください。'));
 window.addEventListener('online',check);
 setInterval(() => {if (!document.hidden) check();},60000);
 if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
 check();
})();
