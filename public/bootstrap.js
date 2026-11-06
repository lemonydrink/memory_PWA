(() => {
 const gate=document.getElementById('authGate');
 let user=null,checking=null,appLoaded=false,shellReady=false,expiryTimer=null;
 function lock(message='ログイン状態を確認しています…') {document.body.classList.add('auth-locked');gate.hidden=false;document.getElementById('authStatus').textContent=message;}
 async function load(next) {
  if(user&&user.sub!==next.sub){location.reload();return;}
  user=next;window.redsheetUser=next;clearTimeout(expiryTimer);
  if(next.offline)expiryTimer=setTimeout(()=>lock('オフライン利用許可の期限が切れました。オンラインで再確認してください。'),Math.max(0,next.expiresAt*1000-Date.now()));
  window.redsheetAuth.online=!next.offline;
  if(!appLoaded){
   for(const src of ['/app.js','/sync.js'])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.onload=resolve;script.onerror=reject;document.body.append(script);});
   appLoaded=true;
   const identity=document.createElement('p');identity.id='accountStatus';identity.className='library-status';
   const logout=document.createElement('button');logout.type='button';logout.className='library-button secondary';logout.textContent='ログアウト';logout.addEventListener('click',window.redsheetAuth.logout);
   document.getElementById('library').append(identity,logout);
  }
  document.getElementById('accountStatus').textContent=next.email+(next.offline?'｜オフライン利用期限 '+new Date(next.expiresAt*1000).toLocaleString():'｜オンライン');
  if(!document.hidden){gate.hidden=true;document.body.classList.remove('auth-locked');}
  window.dispatchEvent(new Event('redsheet-auth-change'));
 }
 async function prepareShell(){
  if(shellReady||!('serviceWorker'in navigator))return;
  const registration=await navigator.serviceWorker.register('/sw.js');
  const pending=registration.installing||registration.waiting;
  if(pending&&pending.state!=='activated')await new Promise(resolve=>pending.addEventListener('statechange',()=>{if(pending.state==='activated')resolve();}));
  const ready=await navigator.serviceWorker.ready;
  await new Promise((resolve,reject)=>{const channel=new MessageChannel();const timer=setTimeout(()=>reject(new Error('cache timeout')),20000);channel.port1.onmessage=e=>{clearTimeout(timer);e.data?.ok?resolve():reject(new Error('cache failed'));};ready.active.postMessage({type:'CACHE_SHELL'},[channel.port2]);});
  shellReady=true;
 }
 async function offline(){
  if(localStorage.getItem('redsheet-logout-pending'))throw new Error('ログアウト済みです。オンラインでログインしてください。');
  await load(await window.redsheetOffline.user());
 }
 async function check(){
  lock();if(checking)return checking;
  checking=(async()=>{
   if(localStorage.getItem('redsheet-logout-pending')){
    try{const r=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error();localStorage.removeItem('redsheet-logout-pending');location.replace('/login');}catch{lock('ログアウト済みです。オンラインに接続してログインしてください。');}return;
   }
   let response;
   try{response=await fetch('/api/me',{cache:'no-store',credentials:'same-origin',redirect:'manual',signal:AbortSignal.timeout(15000)});}
   catch{try{await offline();}catch(error){lock(error.message);}return;}
   if(response.status===401||response.status===403){await window.redsheetOffline.clear();location.replace('/login');return;}
   // Server errors and explicit denials must never be treated as offline authorization.
   if(!response.ok){lock('利用許可を確認できません。時間をおいて再試行してください。');return;}
   try{
    const next=await response.json();if(typeof next.sub!=='string')throw new Error();
    const previous=await window.redsheetOffline.user().catch(()=>null);if(previous&&previous.sub!==next.sub)await window.redsheetOffline.clear();
    await load(next);
    try{
     const permit=await fetch('/api/offline-permit',{cache:'no-store',credentials:'same-origin',redirect:'manual',signal:AbortSignal.timeout(15000)});
     if(permit.status===401||permit.status===403){await window.redsheetOffline.clear();lock('利用許可が失効しました。再ログインしてください。');return;}
     if(!permit.ok)throw new Error();
     const record=await permit.json();await window.redsheetOffline.save(record);
     const offlineUser=await window.redsheetOffline.verify(record);
     await prepareShell();
     document.getElementById('accountStatus').textContent=next.email+'｜オフライン利用期限 '+new Date(offlineUser.expiresAt*1000).toLocaleString();
    }catch{document.getElementById('accountStatus').textContent=next.email+'｜オフライン許可の準備・更新に失敗しました';}
   }catch{lock('起動できませんでした。接続を確認して再試行してください。');}
  })().finally(()=>{checking=null;});return checking;
 }
 window.redsheetAuth={online:false,refresh:check,async logout(){
  lock('ログアウトしています…');await window.redsheetOffline.clear();localStorage.setItem('redsheet-logout-pending','1');await check();
 }};
 document.getElementById('authRetry').addEventListener('click',check);
 document.addEventListener('visibilitychange',()=>{if(document.hidden)lock();else check();});
 window.addEventListener('pagehide',()=>lock());window.addEventListener('pageshow',check);
 window.addEventListener('offline',()=>{lock();offline().catch(e=>lock(e.message));});window.addEventListener('online',check);
 setInterval(()=>{if(!document.hidden)check();},60000);check();
})();
