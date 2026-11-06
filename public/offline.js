// Only verified server-issued permits may unlock local learning while disconnected.
(() => {
 const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(value.length/4)*4,'=')),c => c.charCodeAt(0));
 const db = new Promise((resolve,reject) => {
  const r = indexedDB.open('redsheet-permits',1);
  r.onupgradeneeded = () => r.result.createObjectStore('data');
  r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error);
 });
 async function get() {const d=await db; return new Promise((resolve,reject)=>{const r=d.transaction('data').objectStore('data').get('permit');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
 async function put(value) {const d=await db;return new Promise((resolve,reject)=>{const t=d.transaction('data','readwrite');t.objectStore('data').put(value,'permit');t.oncomplete=resolve;t.onabort=reject;});}
 async function verify(record, now=Date.now()) {
  if (!record?.token || !record.key) throw new Error('オフライン利用許可がありません。オンラインでログインしてください。');
  const parts=record.token.split('.'); if(parts.length!==2) throw new Error('利用許可が不正です。');
  const key=await crypto.subtle.importKey('jwk',record.key,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
  if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(parts[1]),new TextEncoder().encode(parts[0]))) throw new Error('利用許可の署名を確認できません。');
  const claims=JSON.parse(new TextDecoder().decode(decode(parts[0])));
  if(claims.origin!==location.origin || typeof claims.sub!=='string' || typeof claims.email!=='string' || !Number.isFinite(claims.iat) || !Number.isFinite(claims.exp) || claims.exp<=now/1000 || claims.iat>now/1000+60 || claims.exp-claims.iat>259200 || now < (record.lastSeen||0)-60000) throw new Error('オフライン利用許可が期限切れか、端末の日時が不正です。オンラインで確認してください。');
  return {sub:claims.sub,email:claims.email,expiresAt:claims.exp,offline:true};
 }
 window.redsheetOffline = {
  verify,
  async save(record) {await verify(record); await put({...record,lastSeen:Date.now()});},
  async user() {const record=await get();const user=await verify(record);await put({...record,lastSeen:Math.max(record.lastSeen||0,Date.now())});return user;},
  clear:()=>put(null)
 };
})();
