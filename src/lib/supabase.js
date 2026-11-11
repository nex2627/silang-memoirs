import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// The admin picks the login style in Control Center:
//  'session'  -> login lives in sessionStorage only (closing the tab / app = log in again, every tab is its own login)
//  'remember' -> login is also kept in localStorage so people stay signed in
// The last known choice is cached here so it's already applied before anyone logs in.
let ls=null, ss=null
try{ ls=window.localStorage; ss=window.sessionStorage }catch{}
const isAuthKey=k=>k.startsWith('sb-')
let mode='session'
try{ if(ls && ls.getItem('sm-login-mode')==='remember') mode='remember' }catch{}
const purgeLocal=()=>{ try{ Object.keys(ls).filter(isAuthKey).forEach(k=>ls.removeItem(k)) }catch{} }
if(mode!=='remember') purgeLocal()

export function applyLoginMode(m){
  mode=m==='remember'?'remember':'session'
  try{ ls.setItem('sm-login-mode',mode) }catch{}
  try{
    if(mode==='remember') Object.keys(ss).filter(isAuthKey).forEach(k=>ls.setItem(k,ss.getItem(k)))
    else purgeLocal()
  }catch{}
}

const storage = (ls&&ss) ? {
  getItem:k=>{ let v=null; try{ v=ss.getItem(k) }catch{} if(v==null && mode==='remember'){ try{ v=ls.getItem(k) }catch{} } return v },
  setItem:(k,v)=>{ try{ ss.setItem(k,v) }catch{} if(mode==='remember'){ try{ ls.setItem(k,v) }catch{} } },
  removeItem:k=>{ try{ ss.removeItem(k) }catch{} try{ ls.removeItem(k) }catch{} }
} : undefined

export const supabase = url && key ? createClient(url, key, { auth:{ storage, persistSession:true, autoRefreshToken:true, detectSessionInUrl:true } }) : null
