// Silang Memoirs — tiny service worker so the app can be installed and still opens when the connection is bad.
// Pages and files are always fetched fresh first; the saved copy is only used if the network fails. Data calls (Supabase) are never cached.
const CACHE='silang-shell-v1'
const IMG='silang-images-v1'
self.addEventListener('install',()=>self.skipWaiting())
self.addEventListener('activate',e=>e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k!==CACHE&&k!==IMG) await caches.delete(k); await self.clients.claim() })()))
self.addEventListener('fetch',e=>{
  const req=e.request
  if(req.method!=='GET') return
  // Profile pictures (any site, e.g. GitHub): show the saved copy instantly, refresh it quietly in the background.
  if(req.destination==='image' && new URL(req.url).origin!==self.location.origin){
    e.respondWith((async()=>{ const c=await caches.open(IMG); const hit=await c.match(req); const net=fetch(req).then(r=>{ if(r&&(r.ok||r.type==='opaque')) c.put(req,r.clone()); return r }).catch(()=>hit); return hit||net })())
    return
  }
  if(new URL(req.url).origin!==self.location.origin) return
  e.respondWith((async()=>{
    try{ const res=await fetch(req); if(res.ok){ const c=await caches.open(CACHE); c.put(req,res.clone()) } return res }
    catch{ const hit=await caches.match(req); if(hit) return hit; if(req.mode==='navigate'){ const home=await caches.match('/'); if(home) return home } throw new Error('offline') }
  })())
})
