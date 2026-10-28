// Silang Memoirs — tiny service worker so the app can be installed and still opens when the connection is bad.
// Pages and files are always fetched fresh first; the saved copy is only used if the network fails. Data calls (Supabase) are never cached.
const CACHE='silang-shell-v1'
self.addEventListener('install',()=>self.skipWaiting())
self.addEventListener('activate',e=>e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k!==CACHE) await caches.delete(k); await self.clients.claim() })()))
self.addEventListener('fetch',e=>{
  const req=e.request
  if(req.method!=='GET' || new URL(req.url).origin!==self.location.origin) return
  e.respondWith((async()=>{
    try{ const res=await fetch(req); if(res.ok){ const c=await caches.open(CACHE); c.put(req,res.clone()) } return res }
    catch{ const hit=await caches.match(req); if(hit) return hit; if(req.mode==='navigate'){ const home=await caches.match('/'); if(home) return home } throw new Error('offline') }
  })())
})
