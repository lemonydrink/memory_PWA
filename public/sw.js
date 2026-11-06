const CACHE='redsheet-shell-v4';
const SHELL=['/','/app.css','/auth.css','/app.js','/bootstrap.js','/offline.js','/sync.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('redsheet-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_SHELL')return;
 event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  for(const path of SHELL){const response=await fetch(path,{cache:'no-store',credentials:'same-origin'});if(!response.ok||response.redirected)throw new Error('not authenticated');await cache.put(path,response);}
 })().then(()=>event.ports[0]?.postMessage({ok:true}),()=>event.ports[0]?.postMessage({ok:false})));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!(SHELL.includes(url.pathname)||url.pathname==='/index.html'))return;
 event.respondWith(fetch(event.request).catch(async()=>await caches.match(url.pathname==='/index.html'?'/':url.pathname)||Response.error()));
});
