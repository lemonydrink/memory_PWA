(async()=>{
 const results=[];
 const check=(name,value)=>{if(!value)throw new Error(name);results.push(name);};
 const pause=()=>new Promise(r=>setTimeout(r,0));
 const settle=async()=>{await pause();await pause();window.gc();await pause();};
 try{
  for(let i=0;i<300&&(!window.redsheetRich||!document.getElementById('accountStatus')||document.body.classList.contains('auth-locked'));i++){
   if(document.getElementById('authStatus').textContent.startsWith('起動できませんでした'))await redsheetAuth.refresh();
   await new Promise(r=>setTimeout(r,50));
  }
  check('startup failure retry initializes app once',window.__startupFailureInjected&&document.querySelectorAll('script[src="/app.js"]').length===1&&document.querySelectorAll('#accountStatus').length===1);
  check('cache preparation closes MessagePorts',window.__openCachePorts===0);
  check('forced GC available',typeof window.gc==='function');
  const makeURL=URL.createObjectURL,freeURL=URL.revokeObjectURL,liveURLs=new Set();
  URL.createObjectURL=blob=>{const url=makeURL.call(URL,blob);liveURLs.add(url);return url;};
  URL.revokeObjectURL=url=>{liveURLs.delete(url);return freeURL.call(URL,url);};
  const learn={id:'stress-learn',kind:'learn',name:'反復テスト',body:'**答え** $x^2$ ![図](assets/a.png)\n\n'.repeat(30),assets:{'assets/a.png':new Blob(['image'],{type:'image/png'})}};
  const quiz={id:'stress-test',kind:'test',name:'問題',questions:[{question:'$x$ は？',prompt:'**確認**',answer:'$1$ ![図](assets/a.png)',explanation:'解説'}],assets:learn.assets};
  async function cycles(count){for(let i=0;i<count;i++){openNote(learn);openNote(quiz);showAnswer();showLibrary();if(i%10===0)await pause();}}
  await cycles(20);await settle();const before=performance.memory.usedJSHeapSize;
  await cycles(120);await settle();const after=performance.memory.usedJSHeapSize;
  check('object URLs released after 140 cycles',liveURLs.size===0&&imageURLs.size===0);
  const retained=reading.querySelectorAll('*').length+testQuestion.querySelectorAll('*').length+document.getElementById('testAnswerValue').querySelectorAll('*').length;
  results.push('heap before='+before+' after='+after+' delta='+String(after-before)+' bytes; retained content nodes='+retained);
  check('heap growth below 8 MiB',after-before<8*1024*1024);
  check('closed lesson DOM released',retained===0);
  check('closed quiz reference released',questions===sampleQuestions);
  for(let i=0;i<25;i++){openNote({id:'stress-diagram',kind:'learn',name:'図',body:'```mermaid\nflowchart LR\n A[問題] --> B[答え]\n```',assets:{}});await pause();showLibrary();}
  for(let i=0;i<400&&document.querySelector('.diagram-measure');i++)await new Promise(r=>setTimeout(r,10));
  check('diagram measurement nodes released',!document.querySelector('.diagram-measure'));
  check('diagram temporary SVG released',!document.querySelector('[id^="dlesson-diagram-"]'));
  const probe=document.createElement('section');document.body.append(probe);
  redsheetRich.inline(probe,'<img src=x onerror="window.__injected=true"> $\\href{javascript:alert(1)}{x}$',true,new Map());
  check('Markdown and TeX cannot inject active HTML',!probe.querySelector('img,script,a,[onerror]')&&!window.__injected);probe.remove();
  URL.createObjectURL=makeURL;URL.revokeObjectURL=freeURL;
  const fetchBeforeLogout=window.fetch;let releaseCheck;
  window.fetch=(url,...args)=>String(url)==='/api/me'?new Promise(resolve=>{releaseCheck=resolve;}):String(url)==='/auth/logout'?Promise.resolve(new Response('{}',{status:503})):fetchBeforeLogout(url,...args);
  const inFlight=redsheetAuth.refresh();
  while(!releaseCheck)await pause();
  const loggingOut=redsheetAuth.logout();
  for(let i=0;i<100&&!localStorage.getItem('redsheet-logout-pending');i++)await pause();
  releaseCheck(new Response(JSON.stringify({sub:'fixture-account',email:'fixture@example.com',expiresAt:9999999999}),{status:200}));
  await Promise.all([inFlight,loggingOut]);
  check('logout during auth refresh stays locked',document.body.classList.contains('auth-locked')&&localStorage.getItem('redsheet-logout-pending')==='1');
  check('logout clears offline permission',await redsheetOffline.user().then(()=>false,()=>true));
  window.fetch=fetchBeforeLogout;

  document.body.innerHTML = '<pre id="result">PASS '+results.join(' | ')+'</pre>';
 }catch(e){document.body.innerHTML='<pre id="result">FAIL '+e.message+' | '+results.join(' | ')+'</pre>';}
})();
