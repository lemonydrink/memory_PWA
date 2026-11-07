importScripts('/vendor-manifest.js');
const CACHE='redsheet-shell-v12';
const SHELL=['/','/app.css','/auth.css','/app.js','/bootstrap.js','/offline.js','/sync.js','/rich-content.js','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png'];
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('redsheet-')&&k!==CACHE&&k!==REDSHEET_VENDOR.cache).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{
 if(event.data?.type!=='CACHE_SHELL')return;
 event.waitUntil((async()=>{
  for(const [name,paths] of [[CACHE,SHELL],[REDSHEET_VENDOR.cache,REDSHEET_VENDOR.assets]]){
   const cache=await caches.open(name);
   for(const path of paths){if(await cache.match(path))continue;const response=await fetch(path,{cache:'no-store',credentials:'same-origin'});if(!response.ok||response.redirected)throw new Error('not authenticated');await cache.put(path,response);}
  }
 })().then(()=>event.ports[0]?.postMessage({ok:true}),()=>event.ports[0]?.postMessage({ok:false})));
});
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(event.request.method!=='GET'||url.origin!==self.location.origin||!(SHELL.includes(url.pathname)||url.pathname==='/index.html'||REDSHEET_VENDOR.assets.includes(url.pathname)))return;
 event.respondWith((async()=>{const cache=await caches.open(REDSHEET_VENDOR.assets.includes(url.pathname)?REDSHEET_VENDOR.cache:CACHE);const saved=await cache.match(url.pathname==='/index.html'?'/':url.pathname);return saved||fetch(event.request);})());
});
