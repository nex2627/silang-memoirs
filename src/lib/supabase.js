import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function makeStorage(){
  let ls, ss
  try{ ls=window.localStorage; ss=window.sessionStorage }catch{ return undefined }
  const me=Math.random().toString(36).slice(2)
  let mode=null
  let ch=null; try{ ch=new BroadcastChannel('sm-tabs') }catch{}
  const ready=new Promise(resolve=>{
    const finish=m=>{ if(mode) return; mode=m; try{ ss.setItem('sm-tab-mode',m) }catch{} resolve() }
    if(ss.getItem('sm-tab-mode')==='own'){ mode='own'; resolve() }
    if(!ch){ finish('main'); return }
    ch.onmessage=ev=>{
      const d=ev.data||{}
      if(d.t==='whois' && mode==='main') ch.postMessage({t:'main',id:me,to:d.from})
      else if(d.t==='main' && d.to===me && d.id!==me) finish('own')
    }
    if(!mode){ ch.postMessage({t:'whois',from:me}); setTimeout(()=>finish('main'),350) }
  })
  const box=()=>mode==='own'?ss:ls
  return {
    getItem:async k=>{ await ready; return box().getItem(k) },
    setItem:async(k,v)=>{ await ready; box().setItem(k,v) },
    removeItem:async k=>{ await ready; box().removeItem(k) }
  }
}

export const supabase = url && key ? createClient(url, key, { auth:{ storage:makeStorage(), persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } }) : null
