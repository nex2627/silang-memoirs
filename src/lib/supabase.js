import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

function pickStorage(){
  try{
    const ls=window.localStorage, ss=window.sessionStorage
    let id=ss.getItem('sm-tab-id'); if(!id){ id=Math.random().toString(36).slice(2); ss.setItem('sm-tab-id',id) }
    const beat=()=>{ try{ return JSON.parse(ls.getItem('sm-main-tab')||'null') }catch{ return null } }
    const fresh=b=>b && Date.now()-b.t<7000
    let mode=ss.getItem('sm-tab-mode'); const b=beat()
    if(mode==='main'){ if(fresh(b) && b.id!==id) mode='own' }
    else if(mode!=='own'){ mode = fresh(b) && b.id!==id ? 'own' : 'main' }
    ss.setItem('sm-tab-mode',mode)
    if(mode==='main'){
      const stamp=()=>ls.setItem('sm-main-tab',JSON.stringify({id,t:Date.now()}))
      stamp(); setInterval(stamp,3000)
      window.addEventListener('pagehide',()=>{ const x=beat(); if(x&&x.id===id) ls.removeItem('sm-main-tab') })
      return ls
    }
    return ss
  }catch{ return undefined }
}

export const supabase = url && key ? createClient(url, key, { auth:{ storage:pickStorage(), persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } }) : null
