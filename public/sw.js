const CACHE='karaj-atlas-shell-v1';
const OFFLINE_CACHE='karaj-atlas-offline-data-v1';
const SHELL=['./','./index.html','./manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!==OFFLINE_CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
async function cachedRange(request,url){
 const range=request.headers.get('range');if(!range)return null;
 const match=/^bytes=(\d*)-(\d*)$/.exec(range);if(!match)return new Response(null,{status:416});
 const cache=await caches.open(OFFLINE_CACHE);const full=await cache.match(url.href);if(!full)return null;
 const data=await full.blob(),size=data.size;
 let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2]||0));
 let end=match[2]&&match[1]?Math.min(Number(match[2]),size-1):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});
 const headers=new Headers({'Accept-Ranges':'bytes','Content-Range':`bytes ${start}-${end}/${size}`,'Content-Length':String(end-start+1),'Content-Type':full.headers.get('Content-Type')||'application/octet-stream'});
 const etag=full.headers.get('ETag');if(etag)headers.set('ETag',etag);
 return new Response(data.slice(start,end+1),{status:206,statusText:'Partial Content',headers});
}
self.addEventListener('fetch',event=>{
 const req=event.request;if(req.method!=='GET')return;
 const url=new URL(req.url);
 if(url.origin!==self.location.origin)return;
 if(url.pathname.endsWith('/data/karaj.pmtiles')){
  if(req.headers.has('range'))event.respondWith(cachedRange(req,url).then(hit=>hit||fetch(req)));
  else event.respondWith(fetch(req));
  return;
 }
 // Cache app shell/assets only. Large PMTiles and GeoJSON are cached explicitly by user/browser storage.
 event.respondWith(caches.match(req).then(hit=>hit||fetch(req).then(res=>{
  if(res.ok&&(req.destination==='script'||req.destination==='style'||req.destination==='document'||req.destination==='font'||req.destination==='image')){
   const copy=res.clone();caches.open(CACHE).then(cache=>cache.put(req,copy));
  }return res;
 }).catch(()=>caches.match('./index.html'))));
});
