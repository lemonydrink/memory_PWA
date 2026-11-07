// Viewport and install support is shared by touch devices; UA is only for help text.
(() => {
 const root=document.documentElement;
 let frame=0;
 function resize(){
  if(frame)return;
  frame=requestAnimationFrame(()=>{
   frame=0;
   const viewport=window.visualViewport;
   // Preserve native pinch zoom rather than resizing the app under the user's fingers.
   if(viewport&&Math.abs(viewport.scale-1)>.01)return;
   root.style.setProperty('--app-height',(viewport?.height||window.innerHeight)+'px');
  });
 }
 window.addEventListener('resize',resize,{passive:true});
 window.visualViewport?.addEventListener('resize',resize,{passive:true});resize();
 const help=document.getElementById('deviceHelp'),hint=document.getElementById('installHint');
 const install=document.getElementById('installApp'),status=document.getElementById('installStatus');
 const standalone=matchMedia('(display-mode: standalone)');
 const apple=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
 let prompt=null;
 function installed(){return standalone.matches||navigator.standalone===true;}
 function update(){
  help.hidden=installed();install.hidden=!prompt||installed();
  hint.textContent=apple?'Safariの共有メニューから「ホーム画面に追加」を選んでください。追加後はホーム画面のアイコンから開き、ログインと教材の同期を確認してください。':/Android/.test(navigator.userAgent)?'Chromeのメニューから「アプリをインストール」または「ホーム画面に追加」を選べます。ボタンが表示された場合は、ここからも追加できます。':'ブラウザのメニューから、このアプリをインストールできます。iPadではSafariの共有メニュー、AndroidではChromeのメニューを使ってください。';
 }
 window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();prompt=event;update();});
 window.addEventListener('appinstalled',()=>{prompt=null;help.hidden=true;install.hidden=true;status.textContent='ホーム画面への追加が完了しました。';});
 standalone.addEventListener('change',()=>{if(installed())prompt=null;update();});
 install.addEventListener('click',async()=>{
  if(!prompt)return;
  const pending=prompt;prompt=null;install.hidden=true;
  try{await pending.prompt();const choice=await pending.userChoice;status.textContent=choice.outcome==='accepted'?'ホーム画面への追加を受け付けました。':'追加をキャンセルしました。ブラウザのメニューからも追加できます。';}
  catch{status.textContent='ブラウザのメニューからホーム画面へ追加してください。';}
 });
 update();
 // A per-request timeout avoids requiring AbortSignal.timeout on older tablets.
 async function fetchWithTimeout(url,options={},milliseconds=15000){
  if(typeof AbortSignal.timeout==='function')return fetch(url,{...options,signal:AbortSignal.timeout(milliseconds)});
  const controller=new AbortController();
  // Keep the bounded deadline until expiry so response-body reads also time out.
  const timer=setTimeout(()=>controller.abort(),milliseconds);
  try{return await fetch(url,{...options,signal:controller.signal});}catch(error){clearTimeout(timer);throw error;}
 }
 window.redsheetDevice={fetch:fetchWithTimeout};
})();
