(() => {
 const view=node('div','library');view.id='uploadView';view.hidden=true;
 const title=node('h1','','教材のアップロード');
 const back=button('← ノート一覧','library-button secondary',showLibrary);
 const file=button('教材ファイルを選ぶ','library-button',()=>{if(!pendingImport)noteFile.click();});
 const hint=node('p','library-status','Markdown・画像付きZIPを、このフォルダへ追加します。');
 const sync=button('クラウドと同期','library-button',runSync);sync.id='cloudSync';
 const status=node('p','library-status','同期はボタンを押したときだけ行います。');status.id='cloudSyncStatus';status.setAttribute('role','status');
 const actions=node('div','library-editor');actions.hidden=true;
 function clearOptions(){actions.hidden=true;actions.replaceChildren();}
 const recovery=button('同期前の端末データへ戻す','library-button secondary',async()=>{
  try{const saved=await read('recovery:');if(!saved)throw new Error('退避データはありません。');if(!confirm('同期前に退避した端末データへ戻しますか？'))return;await apply(saved.library,null,false);status.textContent='同期前のデータへ戻しました。クラウドにはまだ反映していません。';}catch(e){status.textContent=e.message;}
 });
 view.append(back,title,file,hint,node('hr'),node('h2','','端末とクラウド'),sync,status,actions,recovery);phone.append(view);
 let busy=false;
 const key=prefix=>prefix+window.redsheetUser.sub;
 async function read(prefix){const db=await storage;if(!db)throw new Error('端末の保存領域を利用できません。');return new Promise((resolve,reject)=>{const r=db.transaction('data').objectStore('data').get(key(prefix));r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function writeMeta(meta){const db=await storage;return new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');tx.objectStore('data').put(meta,key('sync:'));tx.oncomplete=resolve;tx.onabort=reject;});}
 async function digest(library){const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(library)));return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');}
 async function api(options={}){
  const response=await fetch('/api/sync',{credentials:'same-origin',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(60000),...options});
  if(response.status===401||response.status===403){await window.redsheetOffline.clear();await window.redsheetAuth.refresh();throw new Error('ログインを確認してください。');}
  if(!response.ok){const error=await response.json().catch(()=>({}));throw new Error(error.error||'クラウドに接続できませんでした。');}
  return response;
 }
 async function apply(lib,meta,keepRecovery=true){
  const db=await storage;if(!db)throw new Error('端末の保存領域を利用できません。');
  await new Promise((resolve,reject)=>{const tx=db.transaction('data','readwrite');const store=tx.objectStore('data');if(keepRecovery)store.put({at:new Date().toISOString(),library:catalog},key('recovery:'));store.put(lib,key('library:'));if(meta)store.put(meta,key('sync:'));tx.oncomplete=resolve;tx.onabort=reject;});
  libraryRevision++;catalog=lib;folderId='';noteStates.clear();renderLibrary();
 }
 function options(message,upload,download){
  status.textContent=message;actions.replaceChildren();actions.hidden=false;
  if(upload)actions.append(button('端末の教材をクラウドへ保存','library-button',()=>perform(upload)));
  if(download)actions.append(button('クラウドの教材を端末へ復元','library-button secondary',()=>perform(download)));
  actions.append(button('キャンセル','library-button secondary',()=>{clearOptions();status.textContent='同期をキャンセルしました。';}));
 }
 async function perform(action){if(busy)return;busy=true;window.redsheetSyncBusy=true;sync.disabled=true;file.disabled=true;back.disabled=true;menuButton.disabled=true;recovery.disabled=true;for(const b of actions.querySelectorAll('button'))b.disabled=true;
  clearOptions();
  try{await action();}catch(e){status.textContent='同期できませんでした：'+e.message;}finally{busy=false;window.redsheetSyncBusy=false;sync.disabled=!window.redsheetAuth.online;file.disabled=false;back.disabled=false;menuButton.disabled=false;recovery.disabled=false;}
 }
 async function runSync(){
  if(busy)return;
  if(pendingImport){status.textContent='教材の読み込み完了を待ってから同期してください。';return;}
  await perform(async()=>{
   status.textContent='端末とクラウドの教材を確認しています…';
   const local=await encodeBackup(catalog);const localHash=await digest(local.library);const revision=libraryRevision;
   const response=await api();const remote=await response.json();const etag=response.headers.get('ETag');const meta=await read('sync:');
   const remoteLib=remote.exists===false?null:await decodeBackup(remote);
   const remoteHash=remoteLib?await digest((await encodeBackup(remoteLib)).library):null;
   if(libraryRevision!==revision)throw new Error('教材が変更されました。もう一度同期してください。');
   const upload=async()=>{
    if(libraryRevision!==revision)throw new Error('教材が変更されました。もう一度同期してください。');
    if(!local.library.notes.length&&!confirm('端末の教材は0件です。クラウドを空の教材で更新しますか？'))return;
    const body=JSON.stringify(local);if(new Blob([body]).size>50*1024*1024)throw new Error('バックアップは50 MiB以内にしてください。');
    status.textContent='クラウドへ保存しています…';
    const result=await(await api({method:'POST',headers:{'Content-Type':'application/json',...(etag?{'If-Match':etag}:{'If-None-Match':'*'})},body})).json();
    await writeMeta({etag:result.etag,hash:localHash,at:result.savedAt});status.textContent=(revision===libraryRevision?'クラウドへ保存済み｜':'送信後に端末の変更があります。もう一度同期してください｜')+new Date(result.savedAt).toLocaleString();
   };
   const download=async()=>{
    if(libraryRevision!==revision)throw new Error('教材が変更されました。もう一度同期してください。');
    if(!confirm(`クラウドの${remoteLib.notes.length}件のノートで端末の教材を置き換えます。現在のデータは端末内へ退避します。よろしいですか？`))return;
    await apply(remoteLib,{etag,hash:remoteHash,at:remote.createdAt});status.textContent='クラウドから復元済み｜'+new Date(remote.createdAt).toLocaleString();
   };
   if(remoteHash===localHash){await writeMeta({etag,hash:localHash,at:remote.createdAt});status.textContent='同期済み｜端末とクラウドの教材は同じです。';return;}
   // Choose explicitly for first sync, remote changes, and conflicts; never push an empty new device silently.
   if(meta?.etag===etag&&etag&&meta.hash!==localHash){await upload();return;}
   // Defer choices until perform() has released its busy state.
   setTimeout(()=>{if(libraryRevision!==revision||phone.dataset.mode!=='upload')return;options(remoteLib?`端末 ${local.library.notes.length}件 ／ クラウド ${remoteLib.notes.length}件（${new Date(remote.createdAt).toLocaleString()}）。内容が異なります。使う方を選んでください。`:'クラウドには教材がありません。端末の教材を保存できます。',upload,remoteLib?download:null);},0);
  });
 }
 window.redsheetShowUpload=async()=>{leaveNote();updateMode('upload','教材のアップロード');menu(false);hint.textContent='保存先：'+(folderPath(folderId).map(f=>f.name).join(' › ')||'すべて')+'｜Markdown・画像付きZIPを読み込めます。';try{const meta=await read('sync:');const localHash=await digest((await encodeBackup(catalog)).library);status.textContent=meta?((meta.hash===localHash?'前回同期から端末の変更なし｜':'端末に未同期の変更あり｜')+new Date(meta.at).toLocaleString()):'未同期です。「クラウドと同期」で保存・復元を選べます。';}catch(e){status.textContent=e.message;}if(!window.redsheetAuth.online)status.textContent='オフライン利用中です。同期はオンラインで行ってください。';};
 window.addEventListener('redsheet-library-change',()=>{status.textContent='端末に変更があります。「クラウドと同期」で保存してください。';clearOptions();});
 window.addEventListener('redsheet-view-change',()=>{if(phone.dataset.mode!=='upload')clearOptions();});
 window.addEventListener('redsheet-auth-change',()=>{if(!window.redsheetAuth.online)clearOptions();sync.disabled=busy||!window.redsheetAuth.online;if(!window.redsheetAuth.online)status.textContent='オフライン利用中です。教材の読み込みと学習は可能です。同期はオンラインで行ってください。';});
})();
