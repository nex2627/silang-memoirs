
const IMG='silang-images-v1'
self.addEventListener('install',()=>self.skipWaiting())
self.addEventListener('activate',e=>e.waitUntil((async()=>{ for(const k of await caches.keys()) if(k!==CACHE&&k!==IMG) await caches.delete(k); await self.clients.claim() })()))
self.addEventListener('fetch',e=>{
  const req=e.request
  if(req.method!=='GET') return
  
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

self.addEventListener('push',e=>{
  let d={}; try{ d=e.data?e.data.json():{} }catch{ d={title:'Silang Memoirs',body:e.data?e.data.text():''} }
  e.waitUntil(self.registration.showNotification(d.title||'Silang Memoirs',{ body:d.body||'', icon:'/icon-192.png', badge:'/icon-192.png', data:{url:d.url||'/'}, tag:'sm-'+(d.title||'')+(d.body||'').slice(0,30) }))
})
self.addEventListener('notificationclick',e=>{
  e.notification.close(); const url=(e.notification.data&&e.notification.data.url)||'/'
  e.waitUntil((async()=>{
    const list=await self.clients.matchAll({type:'window',includeUncontrolled:true})
    for(const c of list){ if('focus' in c){ await c.focus(); if('navigate' in c){ try{ await c.navigate(url) }catch{} } return } }
    if(self.clients.openWindow) await self.clients.openWindow(url)
  })())
})
