(() => {
 const gate=document.getElementById('authGate');
 let user=null,checking=null,appLoaded=false,shellReady=false,expiryTimer=null,lastAttemptAt=-Infinity,appLoading=null,scriptIndex=0;
 const CHECK_INTERVAL=10*60*1000;
 function lock(message='ログイン状態を確認しています…') {document.body.classList.add('auth-locked');gate.hidden=false;document.getElementById('authStatus').textContent=message;}
 async function load(next) {
  if(localStorage.getItem('redsheet-logout-pending'))return;
  if(user&&user.sub!==next.sub){location.reload();return;}
  user=next;window.redsheetUser=next;clearTimeout(expiryTimer);
  if(next.offline)expiryTimer=setTimeout(()=>lock('オフライン利用許可の期限が切れました。オンラインで再確認してください。'),Math.max(0,next.expiresAt*1000-Date.now()));
  window.redsheetAuth.online=!next.offline;
  if(!appLoaded){
   if(!appLoading)appLoading=(async()=>{
    const sources=['/vendor/katex-0.19.1/katex.min.js','/vendor/mermaid-12.3.0/mermaid.min.js','/rich-content.js','/app.js','/sync.js'];
    while(scriptIndex<sources.length){
     await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=sources[scriptIndex];script.onload=()=>{script.onload=script.onerror=null;resolve();};script.onerror=()=>{script.remove();reject(new Error('script failed'));};document.body.append(script);});
     scriptIndex++;
    }
    const identity=document.createElement('p');identity.id='accountStatus';identity.className='library-status';
    const logout=document.createElement('button');logout.type='button';logout.className='library-button secondary';logout.textContent='ログアウト';logout.addEventListener('click',window.redsheetAuth.logout);
    document.getElementById('library').append(identity,logout);appLoaded=true;
   })().finally(()=>{appLoading=null;});
   await appLoading;
  }
  if(localStorage.getItem('redsheet-logout-pending'))return;
  document.getElementById('accountStatus').textContent=next.email+(next.offline?'｜オフライン利用期限 '+new Date(next.expiresAt*1000).toLocaleString():'｜オンライン');
  if(!document.hidden){gate.hidden=true;document.body.classList.remove('auth-locked');}
  window.dispatchEvent(new Event('redsheet-auth-change'));
 }
 async function prepareShell(){
  if(shellReady)return;
  if(!('serviceWorker'in navigator))throw new Error('このブラウザはオフライン保存に対応していません。');
  const registration=await navigator.serviceWorker.register('/sw.js');
  const pending=registration.installing||registration.waiting;
  if(pending&&pending.state!=='activated')await new Promise((resolve,reject)=>{const changed=()=>{if(!['activated','redundant'].includes(pending.state))return;pending.removeEventListener('statechange',changed);pending.state==='activated'?resolve():reject(new Error('worker unavailable'));};pending.addEventListener('statechange',changed);changed();});
  const ready=await navigator.serviceWorker.ready;
  await new Promise((resolve,reject)=>{const channel=new MessageChannel();let timer;const finish=error=>{clearTimeout(timer);channel.port1.onmessage=null;channel.port1.close();channel.port2.close();error?reject(error):resolve();};timer=setTimeout(()=>finish(new Error('cache timeout')),90000);channel.port1.onmessage=e=>finish(e.data?.ok?null:new Error('cache failed'));try{ready.active.postMessage({type:'CACHE_SHELL'},[channel.port2]);}catch(error){finish(error);}});
  shellReady=true;
 }
 async function offline(){
  if(localStorage.getItem('redsheet-logout-pending'))throw new Error('ログアウト済みです。オンラインでログインしてください。');
  await load(await window.redsheetOffline.user());
 }
 async function check(){
  if(checking)return checking;
  if(!appLoaded)lock();
  lastAttemptAt=Date.now();
  checking=(async()=>{
   if(localStorage.getItem('redsheet-logout-pending')){
    try{const r=await fetch('/auth/logout',{method:'POST',credentials:'same-origin',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error();localStorage.removeItem('redsheet-logout-pending');location.replace('/login');}catch{lock('ログアウト済みです。オンラインに接続してログインしてください。');}return;
   }
   if(!navigator.onLine){try{await offline();}catch(error){lock(error.message);}return;}
   let response;
   try{response=await fetch('/api/me',{cache:'no-store',credentials:'same-origin',redirect:'manual',signal:AbortSignal.timeout(15000)});}
   catch{try{await offline();}catch(error){lock(error.message);}return;}
   if(localStorage.getItem('redsheet-logout-pending'))return;
   if(response.status===401||response.status===403){lock('利用許可が失効しました。再ログインしてください。');await window.redsheetOffline.clear();location.replace('/login');return;}
   // Server errors and explicit denials must never be treated as offline authorization.
   if(!response.ok){lock('利用許可を確認できません。時間をおいて再試行してください。');return;}
   try{
    const next=await response.json();if(typeof next.sub!=='string')throw new Error();
    const previous=await window.redsheetOffline.user().catch(()=>null);if(previous&&previous.sub!==next.sub)await window.redsheetOffline.clear();
    let shellFailure=null;try{await prepareShell();}catch(error){shellFailure=error;}
    await load(next);
    if(localStorage.getItem('redsheet-logout-pending'))return;
    try{
     let offlineUser=previous?.sub===next.sub?previous:null;
     // Reuse valid permits; renew once fewer than 24 hours remain.
     if(!offlineUser||offlineUser.expiresAt*1000-Date.now()<86400000){
      const permit=await fetch('/api/offline-permit',{cache:'no-store',credentials:'same-origin',redirect:'manual',signal:AbortSignal.timeout(15000)});
      if(permit.status===401||permit.status===403){await window.redsheetOffline.clear();lock('利用許可が失効しました。再ログインしてください。');return;}
      if(!permit.ok){const detail=await permit.json().catch(()=>({}));throw new Error(detail.error||'オフライン利用許可を取得できません（HTTP '+permit.status+'）。');}
      const record=await permit.json();await window.redsheetOffline.save(record);
      offlineUser=await window.redsheetOffline.verify(record);
     }
     if(shellFailure)throw shellFailure;
     await prepareShell();
     document.getElementById('accountStatus').textContent=next.email+'｜オフライン利用期限 '+new Date(offlineUser.expiresAt*1000).toLocaleString();
    }catch(error){document.getElementById('accountStatus').textContent=next.email+'｜オフライン準備に失敗：'+(error.message||'端末への保存を確認してください。');}
   }catch{lock('起動できませんでした。接続を確認して再試行してください。');}
  })().finally(()=>{checking=null;});return checking;
 }
 window.redsheetAuth={online:false,refresh:check,async logout(){
  localStorage.setItem('redsheet-logout-pending','1');lock('ログアウトしています…');clearTimeout(expiryTimer);window.redsheetAuth.online=false;window.dispatchEvent(new Event('redsheet-auth-change'));
  await checking;await window.redsheetOffline.clear();await check();
 }};
 function checkIfDue(){
  if(document.hidden)return;
  if(user&&user.expiresAt*1000<=Date.now())lock('利用許可の期限を確認しています…');
  if(!appLoaded || user?.expiresAt*1000<=Date.now() || Date.now()-lastAttemptAt>=CHECK_INTERVAL || Date.now()<lastAttemptAt)check();
 }
 document.getElementById('authRetry').addEventListener('click',check);
 document.addEventListener('visibilitychange',checkIfDue);
 window.addEventListener('pageshow',checkIfDue);
 window.addEventListener('offline',()=>{offline().catch(e=>lock(e.message));});window.addEventListener('online',check);
 setInterval(checkIfDue,CHECK_INTERVAL);check();
})();
