import { Children, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  LayoutDashboard, CheckSquare, CalendarDays, Clock3, Users, Link2, LogOut, Search, Plus, X,
  Camera, CheckCircle2, Sparkles, ExternalLink, ChevronRight,
  ChevronLeft, ChevronDown, ClipboardCheck, Database, Sun, Moon, Bell, Eye, EyeOff, Settings as SettingsIcon,
  Download, Check, Wand2, KeyRound, FolderKanban, Megaphone, Trash2, BellOff, Pencil, History
} from 'lucide-react'

/* ---------------- Config ---------------- */
const ROLE_META = {
  admin:          { label:'Admin',        dept:null,           mode:'admin', head:false },
  eic:            { label:'EIC',          dept:'EDBO',         mode:'admin', head:false },
  aeic:           { label:'AEIC',         dept:'EDBO',         mode:'admin', head:false },
  edbo:           { label:'EDBO',         dept:'EDBO',         mode:'view',  head:false },
  art_director:   { label:'Art Director', dept:'Art Director', mode:'tasks', head:false },
  head_media:     { label:'Head Media',   dept:'Media',        mode:'hours', head:true  },
  staff_media:    { label:'Media',        dept:'Media',        mode:'hours', head:false },
  head_colorist:  { label:'TD',           dept:'Colorist',     mode:'tasks', head:true  },
  staff_colorist: { label:'Colorist',     dept:'Colorist',     mode:'tasks', head:false },
}
const DEPARTMENTS = ['Media','Colorist','Art Director']
const DEPT_ICON = { Media:Camera, Colorist:Wand2, 'Art Director':LayoutDashboard }
// EDBO positions you can pick when creating / editing an account -> the database role behind them.
const EDBO_POSITIONS = [['EIC','eic'],['AEIC','aeic'],['TD','head_colorist'],['Finance','edbo'],['Art Director','art_director'],['Head Media','head_media'],['Head Layout','edbo'],['Head Researcher','edbo'],['Head Writer','edbo']]
const ACCOUNT_GROUPS = ['Admin','EDBO','Media','Colorist']
// What is stored in the database: only 4 roles. EDBO members are told apart by their Position.
const DB_ROLE = { Admin:'admin', EDBO:'edbo', Media:'media', Colorist:'colorist' }
const POS_ROLE = { 'eic':'eic', 'aeic':'aeic', 'td':'head_colorist', 'art director':'art_director', 'head media':'head_media' }
const EDBO_ORDER = ['EIC','AEIC','TD','Finance','Art Director','Head Media','Head Layout','Head Researcher','Head Writer']
const SECTION_ORDER = ['Admin','EDBO','Media','Colorist']
const DUTIES = [['PM','Photo Main'],['PC','Photo Creative'],['VM','Video Main'],['VC','Video Creative']]
const LOGO = `${import.meta.env.BASE_URL}logo.png`
const EDITION = 'Nexemeral 27'
const WELCOME_LINE = 'Keep every story, page, photograph and fact moving toward the finished yearbook.'
const IDLE_LIMIT_MS = 3*60*1000
// Pipeline: Media event sorted -> TD assigns colorgrading (self / Colorist / EDBO) -> all colorgraded -> Art Director makes the Facebook cover -> posted.
const TD_STAGE = { dept:'Colorist', verb:'colorgrading', titlePrefix:'Colorgrading' }

/* ---------------- Helpers ---------------- */
// Database (role + position) -> the working role the screens use.
function effRole(role,position){ if(role==='edbo') return POS_ROLE[String(position||'').trim().toLowerCase()]||'edbo'; if(role==='media') return 'staff_media'; if(role==='colorist') return 'staff_colorist'; return role }
function normP(p){ if(!p) return p; const role=effRole(p.role,p.position); return {...p, dbRole:p.role, role, department:ROLE_META[role]?.dept||p.department} }
async function fetchProfiles(){ const {data,error}=await supabase.from('profiles').select('*').order('full_name'); if(error) console.error(error); return (data||[]).map(normP) }
async function fetchActive(){ return (await fetchProfiles()).filter(p=>p.active!==false) }
// Directory order: Admin, then EDBO (EIC, AEIC, TD, Finance, Art Director, Head Media, Head Layout, Head Researcher, Head Writer), then Media, then Colorist.
function edboRank(p){ const i=EDBO_ORDER.findIndex(x=>x.toLowerCase()===String(p.position||'').trim().toLowerCase()); if(i>=0) return i; const f={eic:0,aeic:1,head_colorist:2,art_director:4,head_media:5}[p.role]; return f??50 }
function dirSort(a,b){ return SECTION_ORDER.indexOf(groupOf(a.role))-SECTION_ORDER.indexOf(groupOf(b.role)) || edboRank(a)-edboRank(b) || (a.full_name||'').localeCompare(b.full_name||'') }
// Video-only crew (VM / VC) do not have to sort photos.
function needsSort(m){ const d=m.duties||[]; return !(d.length && d.every(x=>x==='VM'||x==='VC')) }
function isHead(role){ return !!ROLE_META[role]?.head }
function isStaff(role){ return !!role && role.startsWith('staff_') }
function isAdminLike(role){ return ['admin','eic','aeic'].includes(role) }   // can add / edit everything
function isViewer(role){ return role==='edbo' }                                  // board members who can only look
function seesAll(role){ return isAdminLike(role) || isViewer(role) }
function isWorker(role){ return isStaff(role) || role==='art_director' }       // sees only their own assigned work
function isTD(role){ return role==='head_colorist' }
const BOARD_ASSIGNABLE=['eic','aeic','art_director','head_colorist']             // EDBO who can be given colorgrading
const EVENT_BOARD=[...BOARD_ASSIGNABLE,'head_media']                              // EDBO who can be put on events
function roleDept(role){ return ROLE_META[role]?.dept || null }
function roleMode(role){ return ROLE_META[role]?.mode || 'admin' }
function groupOf(role){ return role==='admin'?'Admin':role==='staff_media'?'Media':role==='staff_colorist'?'Colorist':'EDBO' }
function roleLabel(p){ if(!p) return ''; if(p.role==='edbo') return p.position||'EDBO'; return ROLE_META[p.role]?.label || p.role }
function canCreateTask(role){ return isAdminLike(role) || isTD(role) }
function canCreateSchedule(role){ return isAdminLike(role) || role==='head_media' }
function canManageAccounts(role){ return role==='admin' }
function managedTaskDepts(role){ if(seesAll(role)) return ['Colorist','Art Director']; if(isTD(role)) return ['Colorist']; return [] }
function hasPostingTracker(role){ return isAdminLike(role) || isTD(role) || role==='art_director' || role==='head_media' }
function crewText(m){ return `${m.profiles?.full_name||''}${(m.duties||[]).length?` · ${m.duties.join('/')}`:''}` }
function initials(name=''){ return name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() }
function greet(){ const h=new Date().getHours(); return h<12?'Good morning':h<18?'Good afternoon':'Good evening' }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate() }
function fmtTime(iso){ return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }
function fmtDay(d,withYear=true){ if(!d) return '—'; const x=d instanceof Date?d:new Date(d.length===10?d+'T00:00:00':d); if(isNaN(x)) return '—'; return x.toLocaleDateString([], withYear?{weekday:'short',month:'short',day:'numeric',year:'numeric'}:{weekday:'short',month:'short',day:'numeric'}) }
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
// Button that stays neutral, lights up on hover, and turns green with a check once it has been pressed.
function ActionButton({label,doneLabel,run,after,className=''}){
  const [st,setSt]=useState('idle')
  async function go(){ if(st!=='idle') return; setSt('busy'); let r; try{ r=await run() }catch(e){ r={error:e} } if(r&&r.error){ notifyDialog(r.error.message||'Something went wrong.'); setSt('idle'); return } setSt('done'); setTimeout(()=>{ after&&after() },750) }
  return <button type="button" className={`act-btn ${st} ${className}`} onClick={go} disabled={st!=='idle'}>
    {st==='busy'?<span className="loader-ring" style={{width:12,height:12,borderWidth:2}}/>:st==='done'?<><Check size={14}/> {doneLabel||label}</>:label}
  </button>
}
function usePoll(fn,ms=30000){ const ref=useRef(fn); ref.current=fn; useEffect(()=>{ const t=setInterval(()=>ref.current(),ms); const vis=()=>{ if(document.visibilityState==='visible') ref.current() }; document.addEventListener('visibilitychange',vis); return ()=>{ clearInterval(t); document.removeEventListener('visibilitychange',vis) } },[]) }
// ---- Date field: type the numbers (10/25/2026, 2026-10-25, 102526 …) or tap the calendar icon.
function parseDateText(txt){
  const t=(txt||'').trim(); if(!t) return ''
  let y,m,d,mt
  if((mt=t.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})$/))){ y=+mt[1]; m=+mt[2]; d=+mt[3] }
  else if((mt=t.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{2}|\d{4})$/))){ m=+mt[1]; d=+mt[2]; y=+mt[3]; if(y<100) y+=2000 }
  else if((mt=t.match(/^(\d{2})(\d{2})(\d{4})$/))){ m=+mt[1]; d=+mt[2]; y=+mt[3] }
  else if((mt=t.match(/^(\d{4})(\d{2})(\d{2})$/))){ y=+mt[1]; m=+mt[2]; d=+mt[3] }
  else return null
  const dt=new Date(y,m-1,d); if(dt.getFullYear()!==y||dt.getMonth()!==m-1||dt.getDate()!==d) return null
  return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`
}
function isoToText(iso){ if(!iso) return ''; const [y,m,d]=iso.split('-'); return `${m}/${d}/${y}` }
function DateField({value,onChange,required,placeholder='MM/DD/YYYY',className}){
  const [txt,setTxt]=useState(isoToText(value)); const [bad,setBad]=useState(false)
  const pick=useRef(null); const box=useRef(null)
  useEffect(()=>{ setTxt(isoToText(value)); setBad(false) },[value])
  useEffect(()=>{ box.current?.setCustomValidity(required&&!value?'Enter a valid date (e.g. 10/25/2026).':'') },[value,required])
  function commit(){ const iso=parseDateText(txt); if(iso===null){ setBad(true); onChange(''); return } setBad(false); onChange(iso); setTxt(isoToText(iso)) }
  function openPicker(){ const el=pick.current; if(!el) return; try{ el.showPicker ? el.showPicker() : el.click() }catch{ el.click() } }
  return <div className={`date-field ${bad?'bad':''} ${className||''}`}>
    <div className="date-field-box">
      <input ref={box} inputMode="numeric" placeholder={placeholder} value={txt} onChange={e=>{ setTxt(e.target.value); const iso=parseDateText(e.target.value); if(iso) { setBad(false); onChange(iso) } else if(!e.target.value) onChange('') }} onBlur={commit} onKeyDown={e=>{ if(e.key==='Enter'){ commit() } }}/>
      <button type="button" className="date-pick-btn" onClick={openPicker} tabIndex={-1} title="Pick from calendar"><CalendarDays size={15}/></button>
      <input ref={pick} type="date" className="date-native" tabIndex={-1} value={value||''} onChange={e=>onChange(e.target.value)}/>
    </div>
    {value && !bad && <small className="date-hint">{fmtDay(value)}</small>}
    {bad && <small className="date-hint err">Use MM/DD/YYYY</small>}
  </div>
}

// ---- Time field: pick from the list (6:00 AM, 15-min steps) or type numbers like 930, 9:30pm, 14:30.
const TIME_OPTIONS=(()=>{ const out=[]; for(let i=0;i<96;i++){ const mins=(6*60+i*15)%1440; const h=Math.floor(mins/60); const m=mins%60; out.push([`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`,fmtHM(h,m)]) } return out })()
function fmtHM(h,m){ const ap=h>=12?'PM':'AM'; const hh=h%12===0?12:h%12; return `${hh}:${String(m).padStart(2,'0')} ${ap}` }
function parseTimeText(txt){
  const t=(txt||'').trim().toLowerCase().replace(/\./g,''); if(!t) return ''
  const mt=t.match(/^(\d{1,2})(?::?(\d{2}))?\s*(am|pm|a|p)?$/); if(!mt) return null
  let h=+mt[1]; const m=mt[2]?+mt[2]:0; const ap=mt[3]
  if(m>59) return null
  if(ap){ if(h<1||h>12) return null; if(ap[0]==='p'&&h<12) h+=12; if(ap[0]==='a'&&h===12) h=0 }
  else if(h>23) return null
  else if(!mt[2] && h>=1 && h<=5) h+=12 // bare "3" while typing hours usually means afternoon in an event schedule
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}
function timeLabel(v){ if(!v) return ''; const [h,m]=v.split(':').map(Number); return fmtHM(h,m) }
function TimeField({value,onChange,required}){
  const [txt,setTxt]=useState(timeLabel(value)); const [open,setOpen]=useState(false); const [bad,setBad]=useState(false)
  const box=useRef(null); const list=useRef(null)
  useEffect(()=>{ setTxt(timeLabel(value)); setBad(false) },[value])
  useEffect(()=>{ box.current?.setCustomValidity(required&&!value?'Choose or type a time.':'') },[value,required])
  useEffect(()=>{ if(open && list.current){ const el=list.current.querySelector('.active')||list.current.firstChild; if(el) list.current.scrollTop=Math.max(0,el.offsetTop-70) } },[open])
  function commit(){ const v=parseTimeText(txt); if(v===null){ setBad(true); onChange(''); return } setBad(false); onChange(v); setTxt(timeLabel(v)) }
  function choose(v){ onChange(v); setTxt(timeLabel(v)); setBad(false); setOpen(false) }
  const q=txt.trim().toLowerCase(); const shown=(open&&q&&timeLabel(value)!==txt)?TIME_OPTIONS.filter(([v,l])=>l.toLowerCase().replace(/[: ]/g,'').startsWith(q.replace(/[: ]/g,''))||l.toLowerCase().includes(q)):TIME_OPTIONS
  return <div className={`time-field ${bad?'bad':''}`}>
    <input ref={box} inputMode="numeric" placeholder="Select or type time" value={txt} autoComplete="off"
      onFocus={e=>{ setOpen(true); e.target.select() }} onChange={e=>{ setTxt(e.target.value); setOpen(true) }}
      onBlur={()=>{ setTimeout(()=>setOpen(false),120); commit() }}
      onKeyDown={e=>{ if(e.key==='Enter'){ e.preventDefault(); commit(); setOpen(false) } if(e.key==='Escape') setOpen(false) }}/>
    <Clock3 size={15} className="time-ic"/>
    {open && <div className="time-list" ref={list}>{shown.length?shown.map(([v,l])=><button type="button" key={v} className={v===value?'active':''} onMouseDown={e=>{ e.preventDefault(); choose(v) }}>{l}</button>):<div className="time-none">Press Enter to use “{txt}”</div>}</div>}
  </div>
}
function toCSV(rows){ if(!rows.length) return ''; const cols=Object.keys(rows[0]); const esc=v=>{ if(v==null) return ''; const s=String(v).replace(/"/g,'""'); return /[",\n]/.test(s)?`"${s}"`:s }; return [cols.join(','),...rows.map(r=>cols.map(c=>esc(r[c])).join(','))].join('\n') }
function downloadCSV(filename,rows){ if(!rows.length){ notifyDialog('Nothing to export yet.'); return } const blob=new Blob([toCSV(rows)],{type:'text/csv'}); const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=filename; a.click(); URL.revokeObjectURL(a.href) }

function useTheme(){
  const [theme,setTheme]=useState(()=>{ try{return localStorage.getItem('sm-theme')||'light'}catch{return 'light'} })
  useEffect(()=>{ document.documentElement.setAttribute('data-theme',theme); try{localStorage.setItem('sm-theme',theme)}catch{} },[theme])
  return [theme, ()=>setTheme(t=>t==='light'?'dark':'light')]
}
function ThemeToggle({theme,onToggle,floating}){
  return <button className={floating?'theme-toggle-floating':'theme-toggle'} onClick={onToggle} title="Toggle theme">
    {theme==='light'?<Moon size={floating?18:15}/>:<Sun size={floating?18:15}/>}
  </button>
}

/* ---------------- Root ---------------- */
export default function App(){
  const [session,setSession]=useState(undefined)
  const [profile,setProfile]=useState(null)
  const [theme,toggleTheme]=useTheme()

  useEffect(()=>{
    if(!supabase){ setSession(null); return }
    let mounted=true
    ;(async()=>{
      const {data}=await supabase.auth.getSession()
      let s=data.session
      if(s){
        const last=Number(localStorage.getItem('sm-last-active')||0)
        if(last && Date.now()-last>IDLE_LIMIT_MS){ await supabase.auth.signOut(); s=null }
      }
      if(!mounted) return
      setSession(s); if(s) await loadProfile(s.user.id); else setProfile(null)
    })()
    const {data:sub}=supabase.auth.onAuthStateChange(async(_e,s)=>{ setSession(s); if(s) await loadProfile(s.user.id); else setProfile(null) })
    return ()=>{ mounted=false; sub.subscription.unsubscribe() }
  },[])

  // Stamp "last active" while a session is open, so a 3+ minute absence forces a fresh login on return.
  useEffect(()=>{
    if(!session) return
    function ping(){ try{ localStorage.setItem('sm-last-active',String(Date.now())) }catch{} }
    ping()
    const t=setInterval(ping,15000)
    window.addEventListener('visibilitychange',ping)
    window.addEventListener('beforeunload',ping)
    return ()=>{ clearInterval(t); window.removeEventListener('visibilitychange',ping); window.removeEventListener('beforeunload',ping) }
  },[session])

  async function loadProfile(id){ const {data,error}=await supabase.from('profiles').select('*').eq('id',id).single(); if(error) console.error(error); setProfile(normP(data)||null) }

  if(!supabase) return <SetupScreen theme={theme} toggleTheme={toggleTheme}/>
  if(session===undefined) return <LoadingScreen/>
  if(!session) return <Login theme={theme} toggleTheme={toggleTheme} onLogin={async()=>{ const {data}=await supabase.auth.getSession(); setSession(data.session); if(data.session) await loadProfile(data.session.user.id) }}/>
  if(!profile) return <LoadingScreen/>
  if(!ROLE_META[profile.role] || profile.active===false) return <RetiredScreen profile={profile} theme={theme} toggleTheme={toggleTheme}/>
  return <Workspace profile={profile} onProfileRefresh={()=>loadProfile(profile.id)} theme={theme} toggleTheme={toggleTheme}/>
}

function RetiredScreen({profile,theme,toggleTheme}){
  return <div className="center-screen login-bg"><ThemeToggle theme={theme} onToggle={toggleTheme} floating/>
    <div className="login-card"><img className="brand-mark big" src={LOGO} alt=""/><h1>Account not active</h1>
    <p>{profile.active===false?'This account has been deactivated.':'This account’s position is no longer used in the system.'} Please ask the Admin to update it.</p>
    <button className="primary-btn wide" style={{marginTop:22}} onClick={()=>supabase.auth.signOut()}>Log out</button></div></div>
}

function LoadingScreen(){
  return <div className="center-screen loader-screen">
    <div className="loader-wrap">
      <div className="loader-orbit"><img className="loader-logo" src={LOGO} alt=""/><span className="loader-dot"/></div>
      <div className="loader-text">SILANG MEMOIRS</div>
      <div className="loader-bar"><span/></div>
    </div>
  </div>
}

function SetupScreen({theme,toggleTheme}){
  return <div className="center-screen login-bg"><ThemeToggle theme={theme} onToggle={toggleTheme} floating/>
    <div className="login-card"><img className="brand-mark big" src={LOGO} alt=""/><h1>Silang Memoirs</h1><p>Your Supabase environment variables are not configured yet.</p>
    <ol><li>Copy <b>.env.example</b> to <b>.env</b>.</li><li>Put your Supabase project URL in <b>VITE_SUPABASE_URL</b>.</li><li>Put your publishable key in <b>VITE_SUPABASE_PUBLISHABLE_KEY</b>.</li><li>Restart <b>npm run dev</b>.</li></ol></div></div>
}

/* ---------------- Login ---------------- */
function Login({onLogin,theme,toggleTheme}){
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [show,setShow]=useState(false)
  const [busy,setBusy]=useState(false); const [error,setError]=useState('')
  async function submit(e){ e.preventDefault(); setBusy(true); setError(''); const {error}=await supabase.auth.signInWithPassword({email,password}); if(error) setError(error.message); else await onLogin(); setBusy(false) }
  return <div className="center-screen login-bg">
    <ThemeToggle theme={theme} onToggle={toggleTheme} floating/>
    <div className="login-card">
      <img className="brand-mark big" src={LOGO} alt="Silang Memoirs"/>
      <div className="login-tagline">SILANG MEMOIRS • {EDITION.toUpperCase()}</div>
      <h1>Hello, welcome…</h1>
      <form onSubmit={submit}>
        <label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoComplete="email"/></label>
        <label>Password
          <div className="field-icon-wrap">
            <input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} required autoComplete="current-password"/>
            <button type="button" className="icon-toggle" onClick={()=>setShow(s=>!s)} tabIndex={-1}>{show?<EyeOff size={15}/>:<Eye size={15}/>}</button>
          </div>
        </label>
        {error && <div className="error">{error}</div>}
        <button className="primary-btn wide" disabled={busy}>{busy?<><span className="loader-ring" style={{width:16,height:16,borderWidth:2}}/> Logging in…</>:'Log in'}</button>
      </form>
    </div>
  </div>
}

/* ---------------- Workspace shell ---------------- */
function Workspace({profile,onProfileRefresh,theme,toggleTheme}){
  const [page,setPage]=useState('Dashboard')
  const [deptFocus,setDeptFocus]=useState(null) // admin drill-down into a department (Members page only)
  const [mobile,setMobile]=useState(false)
  const [collapsed,setCollapsed]=useState(()=>{ try{ return localStorage.getItem('sm-collapsed')==='1' }catch{ return false } })
  const [pwOpen,setPwOpen]=useState(false)
  const role=profile.role; const mode=roleMode(role)
  const adminLike=isAdminLike(role); const viewAll=seesAll(role)

  const nav=useMemo(()=>{
    const base=[['Dashboard',LayoutDashboard],['Calendar',CalendarDays],['Notifications',Bell],['Tracker',FolderKanban]]
    if(seesAll(role)){ base.push(['Members',Users],['Resources',Link2]); if(adminLike) base.push(['Announcements',Megaphone]); if(role==='admin') base.push(['Settings',SettingsIcon]); base.push(['Backup',Database]) }
    else if(isHead(role)){ base.push(['Members',Users],['Resources',Link2],['Backup',Database]) }
    else base.push(['Resources',Link2])
    return base
  },[role])

  // Browser back button: step back through visited pages; stepping back past the first one logs out.
  useEffect(()=>{ window.history.replaceState({page:'Dashboard'},'') },[])
  useEffect(()=>{
    function onPop(e){ const st=e.state; if(st && st.page){ setPage(st.page); setDeptFocus(null) } else { supabase.auth.signOut() } }
    window.addEventListener('popstate',onPop); return ()=>window.removeEventListener('popstate',onPop)
  },[])
  function goPage(n){ setPage(n); setDeptFocus(null); setMobile(false); window.history.pushState({page:n},'') }
  function onNavClick(n){ if(n===page){ toggleCollapsed() } else { goPage(n) } }
  function toggleCollapsed(){ setCollapsed(c=>{ try{ localStorage.setItem('sm-collapsed', c?'0':'1') }catch{}; return !c }) }

  async function logout(){ await supabase.auth.signOut() }

  return <div className="app">
    <aside className={`sidebar ${mobile?'open':''} ${collapsed?'collapsed':''}`}>
      <div className="brand">
        <img className="brand-mark" src={LOGO} alt="Silang Memoirs"/>
        <div className="sb-text"><div className="brand-name">Silang Memoirs</div><div className="brand-sub">{EDITION.toUpperCase()}</div></div>
      </div>
      <div className="nav-label sb-text">WORKSPACE</div>
      <nav>{nav.map(([n,I])=><button key={n} className={`nav-item ${page===n?'active':''}`} onClick={()=>onNavClick(n)} title={n}><I size={18} className="nav-ic"/><span className="sb-text">{n}</span>{page===n && <ChevronRight size={15} className="nav-arrow sb-text"/>}</button>)}</nav>
      <div className="sidebar-bottom">
        <div className="profile-mini">
          <div className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(profile.full_name)}</div>
          <div className="sb-text"><strong>{profile.full_name}</strong><span>{roleLabel(profile)}</span></div>
        </div>
        <button className="password-link full-width sb-text" onClick={()=>setPwOpen(true)} tabIndex={collapsed?-1:0}>Change password</button>
        <button className="nav-item logout" onClick={logout} title="Log out"><LogOut size={18} className="nav-ic"/><span className="sb-text">Log out</span></button>
      </div>
    </aside>
    {mobile && <div className="backdrop" onClick={()=>setMobile(false)}/>}
    <main className={`main ${collapsed?'sidebar-collapsed':''}`}>
      <header className="topbar">
        <div className="mobile-account">
          <div className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(profile.full_name)}</div>
          <div><strong>{profile.full_name}</strong><span>{roleLabel(profile)}</span></div>
          <button className="icon-btn" onClick={logout} title="Log out"><LogOut size={16}/></button>
        </div>
        <div className="crumb"><span>Silang Memoirs</span><ChevronRight size={14}/><strong>{deptFocus?deptFocus:page}</strong></div>
        <div className="top-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme}/>
          <NotificationBell profile={profile}/>
        </div>
      </header>
      <div className="content page-enter" key={page+String(deptFocus)}>
        {page==='Dashboard' && viewAll && <AdminDashboard profile={profile}/>}
        {page==='Dashboard' && !viewAll && mode==='hours' && <HoursDashboard profile={profile}/>}
        {page==='Dashboard' && !viewAll && mode==='tasks' && <TasksDashboard profile={profile}/>}

        {page==='Calendar' && <CalendarPage profile={profile}/>}
        {page==='Notifications' && <NotificationsPage profile={profile}/>}
        {page==='Tracker' && (mode==='tasks'||viewAll) && <TaskTracker profile={profile}/>}
        {page==='Tracker' && mode==='hours' && !viewAll && <Tracker profile={profile}/>}
        {page==='Members' && <Members profile={profile}/>}
        {page==='Resources' && <Resources profile={profile}/>}
        {page==='Announcements' && adminLike && <Announcements profile={profile}/>}
        {page==='Settings' && role==='admin' && <Settings profile={profile}/>}
        {page==='Backup' && <Backup profile={profile}/>}
      </div>
    </main>
    <nav className="mobile-tabbar">{nav.map(([n,I])=><button key={n} className={`mobile-tab ${page===n?'active':''}`} onClick={()=>goPage(n)}><I size={19}/>{page===n && <span>{n}</span>}</button>)}</nav>
    {pwOpen && <PasswordModal onClose={()=>setPwOpen(false)}/>}
    <DialogHost/>
  </div>
}

/* ---------------- Notifications ---------------- */
function NotificationBell({profile}){
  const [open,setOpen]=useState(false); const [rows,setRows]=useState([])
  useEffect(()=>{ load(); const t=setInterval(load,45000); return ()=>clearInterval(t) },[profile.id])
  async function load(){ const {data}=await supabase.from('notifications').select('*').eq('user_id',profile.id).eq('read',false).order('created_at',{ascending:false}).limit(25); setRows(data||[]) }
  async function markRead(id){ setRows(r=>r.filter(x=>x.id!==id)); await supabase.from('notifications').update({read:true}).eq('id',id) }
  async function markAllRead(){ const ids=rows.map(r=>r.id); if(!ids.length) return; setRows([]); await supabase.from('notifications').update({read:true}).in('id',ids) }
  return <div className="notif-wrap">
    <button className="icon-btn" onClick={()=>setOpen(o=>!o)}><Bell size={16}/>{rows.length>0 && <span className="notif-dot">{rows.length>9?'9+':rows.length}</span>}</button>
    {open && <div className="notif-dropdown">
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'4px 6px 10px'}}><strong style={{fontSize:12}}>Notifications</strong>{rows.length>0 && <button className="text-btn" onClick={markAllRead}>Mark all read</button>}</div>
      {!rows.length && <div className="notif-empty"><BellOff size={20}/><span>You're all caught up.</span></div>}
      {rows.map(r=><button key={r.id} className="notif-item unread" onClick={()=>markRead(r.id)}>
        <strong>{r.title}</strong>{r.body && <span>{r.body}</span>}<small>{new Date(r.created_at).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>
      </button>)}
    </div>}
  </div>
}

function NotificationsPage({profile}){
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true)
  useEffect(()=>{ load() },[profile.id])
  async function load(){ setLoading(true); const {data}=await supabase.from('notifications').select('*').eq('user_id',profile.id).order('created_at',{ascending:false}).limit(200); setRows(data||[]); setLoading(false) }
  async function markRead(id){ await supabase.from('notifications').update({read:true}).eq('id',id); load() }
  return <div>
    <section className="page-head"><div><div className="eyebrow">STAY IN THE LOOP</div><h1>Notifications</h1><p>Every task, event, and announcement sent your way.</p></div></section>
    <div className="panel">
      {loading ? <div className="empty">Loading…</div> : rows.map(r=><div key={r.id} className={`notif-item ${r.read?'':'unread'}`} style={{cursor:r.read?'default':'pointer'}} onClick={()=>!r.read && markRead(r.id)}>
        <strong>{r.title}</strong>{r.body && <span>{r.body}</span>}<small>{new Date(r.created_at).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>
      </div>)}
      {!loading && !rows.length && <div className="empty">Nothing here yet.</div>}
    </div>
  </div>
}

/* ---------------- Confirm dialog (replaces native confirm()/alert() everywhere) ---------------- */
function ConfirmModal({title='Are you sure?',body,danger,confirmLabel='Confirm',onConfirm,onClose}){
  return <Modal title={title} onClose={onClose}>
    {body && <p style={{color:'var(--text-dim)',fontSize:13,lineHeight:1.6,marginTop:-6}}>{body}</p>}
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button>
      <button className={danger?'danger-btn':'primary-btn'} onClick={()=>{ onConfirm(); onClose() }}>{confirmLabel}</button></div>
  </Modal>
}
function AlertModal({title='Notice',body,onClose}){
  return <Modal title={title} onClose={onClose}><p style={{color:'var(--text-dim)',fontSize:13,lineHeight:1.6,marginTop:-6}}>{body}</p>
    <div className="modal-actions"><button className="primary-btn" onClick={onClose}>OK</button></div></Modal>
}
// Lightweight app-wide confirm/alert, avoiding window.confirm()/alert() browser chrome.
let _dialogSetter=null
function DialogHost(){
  const [dialog,setDialog]=useState(null)
  useEffect(()=>{ _dialogSetter=setDialog; return ()=>{ _dialogSetter=null } },[])
  if(!dialog) return null
  function close(){ dialog.onCancel?.(); setDialog(null) }
  if(dialog.kind==='confirm') return <ConfirmModal {...dialog} onClose={close}/>
  return <AlertModal {...dialog} onClose={close}/>
}
function confirmDialog({title,body,danger,confirmLabel}={}){ return new Promise(resolve=>{ if(!_dialogSetter){ resolve(window.confirm(body||title||'Are you sure?')); return } _dialogSetter({ kind:'confirm', title, body, danger, confirmLabel, onConfirm:()=>resolve(true), onCancel:()=>resolve(false) }) }) }
function notifyDialog(body,title){ if(!_dialogSetter){ window.alert(body); return } _dialogSetter({ kind:'alert', title:title||'Notice', body }) }

/* ---------------- Password change (self service) ---------------- */
function PasswordModal({onClose}){
  const [p1,setP1]=useState(''); const [p2,setP2]=useState(''); const [busy,setBusy]=useState(false); const [msg,setMsg]=useState('')
  async function save(e){ e.preventDefault(); if(p1.length<6){ setMsg('Password must be at least 6 characters.'); return } if(p1!==p2){ setMsg("Passwords don't match."); return } setBusy(true); const {error}=await supabase.auth.updateUser({password:p1}); setBusy(false); if(error) setMsg(error.message); else { setMsg('Password updated.'); setTimeout(onClose,900) } }
  return <Modal title="Change password" onClose={onClose}><form onSubmit={save}>
    <label>New password<input type="password" value={p1} onChange={e=>setP1(e.target.value)} required minLength={6}/></label>
    <label>Confirm new password<input type="password" value={p2} onChange={e=>setP2(e.target.value)} required minLength={6}/></label>
    {msg && <div className="error" style={{background:'var(--surface-2)',color:'var(--text)',borderColor:'var(--border)'}}>{msg}</div>}
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Update password'}</button></div>
  </form></Modal>
}

/* ---------------- Stat + Modal shared ---------------- */
function Stat({title,value,note,icon:Icon}){ return <div className="stat-card"><div className="stat-top"><span>{title}</span><Icon size={16}/></div><strong>{value}</strong><small>{note}</small></div> }
function Modal({title,onClose,children}){
  return <div className="modal-backdrop" onClick={e=>{ if(e.target===e.currentTarget) onClose() }}>
    <div className="modal"><div className="modal-head"><h2>{title}</h2><button className="icon-btn" onClick={onClose}><X size={18}/></button></div>{children}</div>
  </div>
}

// Token-style person picker. multi=true toggles membership on click; multi=false makes each click replace the selection.
function PersonPicker({groups,value,multi,onChange,emptyLabel='No one available yet.'}){
  const flat=groups.flatMap(g=>g.people)
  if(!flat.length) return <div className="empty" style={{padding:'14px 0'}}>{emptyLabel}</div>
  function toggle(id){
    if(multi){ onChange(value.includes(id)?value.filter(x=>x!==id):[...value,id]) }
    else { onChange(value[0]===id?[]:[id]) }
  }
  return <div className="token-picker">
    {groups.map(g=>g.people.length>0 && <div key={g.label} className="token-group">
      {g.label && <div className="token-group-label">{g.label}</div>}
      <div className="token-row">{g.people.map(p=><button type="button" key={p.id} className={`token ${value.includes(p.id)?'active':''}`} onClick={()=>toggle(p.id)}>{p.full_name}</button>)}</div>
    </div>)}
  </div>
}

/* ---------------- Dashboards ---------------- */
function WelcomeHero({profile,children,onCreate,createLabel}){
  return <section className="hero">
    <div><div className="eyebrow"><Sparkles size={14}/> {seesAll(profile.role)?'COMMAND CENTER':(roleDept(profile.role)||'').toUpperCase()+' DESK'}</div>
    <h1>{greet()}, {profile.full_name.split(' ')[0]}.</h1><p>{WELCOME_LINE}</p></div>
    {onCreate && <button className="primary-btn" onClick={onCreate}><Plus size={17}/> {createLabel}</button>}
  </section>
}

// Search + date (+ extras) bar used by trackers, members and backup.
// Dropdown drawn in the app's own style (replaces the browser's grey menu). Works like <select>: pass <option>s as children.
function Select({value,onChange,children,className='',disabled,style}){
  const [open,setOpen]=useState(false); const [pos,setPos]=useState(null); const btn=useRef(null)
  const opts=[]; Children.forEach(children,c=>{ if(c&&c.props){ const label=Array.isArray(c.props.children)?c.props.children.join(''):String(c.props.children??''); opts.push({value:c.props.value!==undefined?c.props.value:label,label}) } })
  const cur=opts.find(o=>o.value===value)||opts[0]
  function toggle(){ if(disabled) return; if(!open){ const r=btn.current.getBoundingClientRect(); const below=window.innerHeight-r.bottom-12; const up=below<190&&r.top>below; setPos({left:r.left,width:r.width,...(up?{bottom:window.innerHeight-r.top+6,maxHeight:Math.min(280,r.top-12)}:{top:r.bottom+6,maxHeight:Math.min(280,below)})}) } setOpen(!open) }
  useEffect(()=>{ if(!open) return; const close=e=>{ if(e.type==='keydown'){ if(e.key==='Escape') setOpen(false); return } if(!e.target.closest?.('.sel-list')&&!btn.current?.contains(e.target)) setOpen(false) }; const off=()=>setOpen(false)
    document.addEventListener('mousedown',close); document.addEventListener('keydown',close); window.addEventListener('resize',off); window.addEventListener('scroll',off,true)
    return ()=>{ document.removeEventListener('mousedown',close); document.removeEventListener('keydown',close); window.removeEventListener('resize',off); window.removeEventListener('scroll',off,true) } },[open])
  return <div className={`sel ${className.replace('filter-select','').trim()} ${open?'open':''}`} style={style}>
    <button type="button" ref={btn} className="sel-btn" disabled={disabled} onClick={toggle} aria-haspopup="listbox" aria-expanded={open}><span>{cur?.label}</span><ChevronDown size={15} className="sel-chev"/></button>
    {open && pos && <div className="sel-list" role="listbox" style={pos}>{opts.map(o=><button type="button" role="option" aria-selected={o.value===value} key={String(o.value)} className={o.value===value?'on':''} onClick={()=>{ onChange({target:{value:o.value}}); setOpen(false) }}><span>{o.label}</span>{o.value===value && <Check size={13}/>}</button>)}</div>}
  </div>
}
function FilterBar({search,onSearch,date,onDate,children,onClear,extraActive,placeholder='Search…'}){
  const active=search||date||extraActive
  return <div className="panel filter-bar">
    <label className="grow">Search<div className="search-box"><Search size={15}/><input value={search} onChange={e=>onSearch(e.target.value)} placeholder={placeholder}/></div></label>
    {onDate && <label>Date<DateField className="filter-date" value={date} onChange={onDate}/></label>}
    {children}
    <button type="button" className={`text-btn filter-clear ${active?'':'off'}`} disabled={!active} tabIndex={active?0:-1} onClick={()=>{ onSearch(''); onDate&&onDate(''); onClear&&onClear() }}>Clear</button>
  </div>
}

// Events I'm on that still need MY part marked sorted. Everyone assigned to an event (media, EIC, TD, Art Director…) uses this.
function ToSortPanel({profile}){
  const [items,setItems]=useState([])
  async function load(){
    const {data}=await supabase.from('schedules').select('id,title,start_at,status,schedule_members(member_id,sorted,duties,profiles(full_name))').eq('department','Media').neq('status','completed').order('start_at')
    const now=new Date()
    setItems((data||[]).filter(s=>{ const my=(s.schedule_members||[]).find(m=>m.member_id===profile.id); return my && needsSort(my) && !my.sorted && new Date(s.start_at)<=now }))
  }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  const mark=id=>supabase.from('schedule_members').update({sorted:true}).eq('schedule_id',id).eq('member_id',profile.id)
  if(!items.length) return null
  return <div className="panel task-panel" style={{marginBottom:14}}>
    <div className="panel-title"><h2>To sort</h2></div>
    <div className="task-list">{items.map(s=><div className="task-row" key={s.id}><div className="task-icon media"><CalendarDays size={16}/></div>
      <div className="task-info"><strong>{s.title}</strong><span>{fmtDay(s.start_at)}{sortProgress(s)}{crewLine(s,profile.id)}</span></div>
      <ActionButton label="Sorted" run={()=>mark(s.id)} after={load}/></div>)}</div>
  </div>
}
function crewLine(s,myId){ const o=(s.schedule_members||[]).filter(m=>m.member_id!==myId).map(m=>crewText(m)).filter(Boolean); return o.length?` • With ${o.join(', ')}`:'' }

// Tasks assigned to me (shown on Admin / EDBO dashboards, since they sometimes colorgrade or do cover work too).
function MyTasksPanel({profile}){
  const [rows,setRows]=useState([])
  async function load(){ const {data}=await supabase.from('tasks').select('*').eq('assigned_to',profile.id).neq('status','completed').order('created_at',{ascending:false}); setRows(data||[]) }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  const done=id=>supabase.from('tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id)
  if(!rows.length) return null
  return <div className="panel task-panel" style={{marginBottom:14}}>
    <div className="panel-title"><h2>My tasks</h2></div>
    <div className="task-list">{rows.map(t=><div className="task-row" key={t.id}><div className="task-icon layout"><CheckSquare size={16}/></div>
      <div className="task-info"><strong>{t.title}</strong><span>{t.department} • Assigned {fmtDay(t.assigned_date)}</span></div>
      <ActionButton label={t.department==='Colorist'?'Colorgraded':'Done'} run={()=>done(t.id)} after={load}/></div>)}</div>
  </div>
}

const CARD_GROUPS=['Media','Colorist']
function AdminDashboard({profile}){
  const [metrics,setMetrics]=useState({})
  const [counts,setCounts]=useState({})
  const [detail,setDetail]=useState(null)
  useEffect(()=>{ load() },[]); usePoll(load)
  async function load(){
    // Member counts show staff only — heads and the EDBO board are not counted here.
    const profiles=await fetchActive()
    setCounts({ Media:(profiles||[]).filter(p=>p.role==='staff_media').length, Colorist:(profiles||[]).filter(p=>p.role==='staff_colorist').length })
    const {data:tasks}=await supabase.from('tasks').select('department,status')
    const {data:schedules}=await supabase.from('schedules').select('department,start_at,end_at,status')
    const hrs=(schedules||[]).filter(s=>s.department==='Media').reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0)
    setMetrics({ Media:{value:hrs.toFixed(1),label:'hrs logged'}, Colorist:{value:(tasks||[]).filter(t=>t.department==='Colorist'&&t.status==='completed').length,label:'tasks done'} })
  }
  async function openDetail(d){
    let stats={upcoming:0,ongoing:0,done:0,totalHours:0,totalTasks:0}
    if(d==='Media'){
      const {data}=await supabase.from('schedules').select('start_at,end_at,status').eq('department','Media')
      const now=new Date(); const rows=data||[]
      stats.upcoming=rows.filter(s=>new Date(s.start_at)>=now).length
      stats.ongoing=rows.filter(s=>{ const st=new Date(s.start_at),en=new Date(s.end_at); return now>=st && now<=en }).length
      stats.done=rows.filter(s=>s.status==='completed'||s.status==='done').length
      stats.totalHours=rows.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0)
    } else {
      const {data}=await supabase.from('tasks').select('status').eq('department',d)
      const rows=data||[]
      stats.upcoming=rows.filter(t=>t.status==='not_started').length
      stats.ongoing=rows.filter(t=>t.status==='in_progress').length
      stats.done=rows.filter(t=>t.status==='completed').length
      stats.totalTasks=rows.length
    }
    setDetail({dept:d,stats})
  }
  return <div>
    <WelcomeHero profile={profile}/>
    <div className="dept-grid two">{CARD_GROUPS.map(d=>{ const Icon=DEPT_ICON[d]; return <div key={d} className="panel dept-card" onClick={()=>openDetail(d)}>
      <div className="dept-icon"><Icon size={20}/></div><h3>{d}</h3><p>{counts[d]||0} members</p>
      <div className="dept-metric">{metrics[d]?.value ?? '—'}<small>{metrics[d]?.label}</small></div>
    </div> })}</div>
    {detail && <Modal title={detail.dept} onClose={()=>setDetail(null)}>
      <div className="stats-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
        {detail.dept==='Media' ? <>
          <Stat title="Upcoming" value={detail.stats.upcoming} note="Events ahead" icon={CalendarDays}/>
          <Stat title="Ongoing" value={detail.stats.ongoing} note="Happening now" icon={Clock3}/>
          <Stat title="Sorted" value={detail.stats.done} note="Wrapped" icon={CheckCircle2}/>
          <Stat title="Total Hours" value={detail.stats.totalHours.toFixed(1)} note="Logged" icon={Clock3}/>
        </> : <>
          <Stat title="Not Started" value={detail.stats.upcoming} note="Queued" icon={CalendarDays}/>
          <Stat title="Ongoing" value={detail.stats.ongoing} note="In progress" icon={Clock3}/>
          <Stat title="Done" value={detail.stats.done} note="Finished" icon={CheckCircle2}/>
          <Stat title="Total Tasks" value={detail.stats.totalTasks} note="All time" icon={ClipboardCheck}/>
        </>}
      </div>
    </Modal>}
    {!isViewer(profile.role) && <ToSortPanel profile={profile}/>}
    {!isViewer(profile.role) && <MyTasksPanel profile={profile}/>}
    {hasPostingTracker(profile.role) && <PostingTracker profile={profile}/>}
  </div>
}

/* ---------------- Posting Tracker: status of every Media event, from shoot to Facebook post (Admin / EIC / AEIC / TD / Art Director) ---------------- */
function PostingTracker({profile}){
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true)
  const canPost=isAdminLike(profile.role)||profile.role==='art_director'
  async function load(){
    const {data:events}=await supabase.from('schedules').select('id,title,start_at,status,posted_at,sorted_at,schedule_members(sorted,duties)').eq('department','Media').order('start_at',{ascending:false}).limit(40)
    const {data:tasks}=await supabase.from('tasks').select('schedule_id,department,status').not('schedule_id','is',null)
    const statusFor=(eventId,dept)=>{
      const ts=(tasks||[]).filter(x=>x.schedule_id===eventId && x.department===dept)
      if(!ts.length) return 'not started'
      if(ts.every(t=>t.status==='completed')) return 'completed'
      return 'in progress'
    }
    setRows((events||[]).map(e=>{
      const mem=(e.schedule_members||[]).filter(needsSort); const done=mem.filter(m=>m.sorted).length
      const isSorted=e.status==='completed'||e.status==='done'
      return { id:e.id, date:new Date(e.start_at), title:e.title,
        supposedPost:new Date(new Date(e.start_at).getTime()+6*864e5),
        sorted:isSorted?'sorted':(mem.length&&done>0?`${done}/${mem.length} sorted`:'not sorted'), isSorted, partial:!isSorted&&done>0,
        colorgrade:statusFor(e.id,'Colorist'), cover:statusFor(e.id,'Art Director'),
        posted:!!e.posted_at, postedOn:e.posted_at?new Date(e.posted_at):null }
    }))
    setLoading(false)
  }
  useEffect(()=>{ load() },[]); usePoll(load)
  const markPosted=id=>supabase.rpc('mark_event_posted',{sid:id})
  const cls=v=>v==='completed'?'completed':v==='in progress'?'in_progress':'scheduled'
  return <div className="panel table-panel" style={{marginTop:14}}>
    <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>Posting Tracker</h2></div>
    <div>
      <div className="table-head posting-row"><span>Event Date</span><span>Event Name</span><span>Post By</span><span>Sorted</span><span>Colorgrade</span><span>FB Cover</span><span>Posted</span><span>Posted On</span></div>
      {loading ? <div className="empty">Loading…</div> : rows.map(r=><div className="table-row posting-row" key={r.id}>
        <span data-label="Event date">{fmtDay(r.date)}</span><strong className="row-title">{r.title}</strong><span data-label="Post by">{fmtDay(r.supposedPost)}</span>
        <span data-label="Sorted"><span className={`status ${r.isSorted?'completed':r.partial?'in_progress':'scheduled'}`}>{r.sorted}</span></span>
        <span data-label="Colorgrade"><span className={`status ${cls(r.colorgrade)}`}>{r.colorgrade}</span></span>
        <span data-label="FB cover"><span className={`status ${cls(r.cover)}`}>{r.cover}</span></span>
        <span data-label="Posted">{r.posted ? <span className="status completed">posted</span> : (canPost && (r.cover==='completed'||isAdminLike(profile.role)) ? <ActionButton label="Mark posted" doneLabel="Posted" run={()=>markPosted(r.id)} after={load}/> : <span className="status scheduled">not posted</span>)}</span>
        <span data-label="Posted on">{r.postedOn?fmtDay(r.postedOn):'—'}</span>
      </div>)}
      {!loading && !rows.length && <div className="empty">No media events yet.</div>}
    </div>
  </div>
}

function sortProgress(s){ const m=(s.schedule_members||[]).filter(needsSort); if(!m.length) return ''; return ` • ${m.filter(x=>x.sorted).length}/${m.length} sorted` }

function HoursDashboard({profile}){
  const staff=isStaff(profile.role)
  const [stats,setStats]=useState({upcoming:0,completed:0,total:0,hours:0,members:0})
  const [items,setItems]=useState([])
  async function load(){
    const {data}=await supabase.from('schedules').select('*,schedule_members(member_id,sorted,duties,profiles(full_name))').eq('department',profile.department).order('start_at',{ascending:true})
    let rows=data||[]
    if(staff) rows=rows.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
    const now=new Date()
    const upcoming=rows.filter(s=>new Date(s.start_at)>=now)
    const completed=rows.filter(s=>s.status==='completed'||s.status==='done')
    const hours=rows.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0)
    let members=0
    if(!staff){ members=(await fetchActive()).filter(p=>p.role==='staff_media').length }
    setStats({upcoming:upcoming.length,completed:completed.length,total:rows.length,hours,members})
    setItems(upcoming.slice(0,6))
  }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  const next=items[0]
  return <div>
    <WelcomeHero profile={profile}/>
    <section className="stats-grid">
      {staff ? <>
        <Stat title="Upcoming Events" value={stats.upcoming} note="Coming up" icon={CalendarDays}/>
        <Stat title="Assigned Events" value={stats.total} note="All time" icon={ClipboardCheck}/>
        <Stat title="Total Hours" value={stats.hours.toFixed(1)} note="Logged this edition" icon={Clock3}/>
      </> : <>
        <Stat title="Coming Events" value={stats.upcoming} note="Scheduled ahead" icon={CalendarDays}/>
        <Stat title="Sorted Events" value={stats.completed} note="Wrapped" icon={CheckCircle2}/>
        <Stat title="Total Events" value={stats.total} note="This edition" icon={ClipboardCheck}/>
        <Stat title="Assigned Hours" value={stats.hours.toFixed(1)} note="Team total" icon={Clock3}/>
        <Stat title="Media Staff" value={stats.members} note="In department" icon={Users}/>
      </>}
    </section>
    <ToSortPanel profile={profile}/>
    {hasPostingTracker(profile.role) && <div style={{marginBottom:14}}><PostingTracker profile={profile}/></div>}
    {next && <div className="panel task-panel" style={{marginBottom:14}}>
      <div className="panel-title"><h2>Next up</h2></div>
      <strong style={{fontSize:16,display:'block',marginBottom:6}}>{next.title}</strong>
      <p style={{margin:'0 0 4px',color:'var(--text-dim)',fontSize:12}}>{new Date(next.start_at).toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})} • {fmtTime(next.start_at)}–{fmtTime(next.end_at)} ({Math.max(0,(new Date(next.end_at)-new Date(next.start_at))/3600000).toFixed(1)}h)</p>
      <p style={{margin:'0 0 4px',color:'var(--text-dim)',fontSize:12}}>Where: {next.location||'No location set'}</p>
      {next.description && <p style={{margin:'0 0 8px',color:'var(--text-dim)',fontSize:12}}>{next.description}</p>}
      <div className="eyebrow" style={{margin:'10px 0 6px'}}>THE CREW</div>
      <div className="member-chips" style={{justifyContent:'flex-start'}}>{(next.schedule_members||[]).map(m=><span key={m.member_id} className={m.member_id===profile.id?'me':''}>{crewText(m)}{m.sorted?' ✓':''}{m.member_id===profile.id?' (you)':''}</span>)}</div>
    </div>}
    <div className="panel task-panel">
      <div className="panel-title"><h2>{staff?'My schedule & assigned events':'Upcoming events'}</h2></div>
      <div className="task-list">{items.map(s=><div className="task-row" key={s.id}><div className="task-icon media"><CalendarDays size={16}/></div>
        <div className="task-info"><strong>{s.title}</strong><span>{fmtDay(s.start_at,false)} • {fmtTime(s.start_at)} • {s.location||'No location'}{sortProgress(s)}{staff?crewLine(s,profile.id):''}</span></div>
        <span className={`status ${s.status}`}>{s.status==='completed'?'sorted':s.status}</span></div>)}
        {!items.length && <div className="empty">Nothing scheduled yet.</div>}</div>
    </div>
  </div>
}

function TasksDashboard({profile}){
  const role=profile.role; const worker=isWorker(role); const td=isTD(role)
  const [stats,setStats]=useState({open:0,done:0,total:0,members:0})
  const [rows,setRows]=useState([])
  const [undone,setUndone]=useState([])
  const [avail,setAvail]=useState([])
  const [teammates,setTeammates]=useState([])
  const [picks,setPicks]=useState({})
  const [openTask,setOpenTask]=useState(false)
  async function load(){
    let q=supabase.from('tasks').select('*,profiles!tasks_assigned_to_fkey(full_name)').order('created_at',{ascending:false})
    if(worker) q=q.eq('assigned_to',profile.id); else q=q.in('department',managedTaskDepts(role))
    const {data}=await q; const list=data||[]
    let members=0; if(!worker){ members=(await fetchActive()).filter(p=>p.role==='staff_colorist').length }
    setStats({ open:list.filter(t=>t.status!=='completed').length, done:list.filter(t=>t.status==='completed').length, total:list.length, members })
    setRows(list.slice(0,8))
    setUndone(list.filter(t=>t.status!=='completed'))
    if(td){
      const {data:done}=await supabase.from('schedules').select('id,title,start_at,end_at,sorted_at').eq('department','Media').eq('status','completed').order('start_at',{ascending:false})
      const {data:ownTasks}=await supabase.from('tasks').select('schedule_id').eq('department','Colorist').not('schedule_id','is',null)
      const assignedIds=new Set((ownTasks||[]).map(t=>t.schedule_id))
      setAvail((done||[]).filter(e=>!assignedIds.has(e.id)))
      const tm=(await fetchActive()).filter(m=>m.role==='staff_colorist'||BOARD_ASSIGNABLE.includes(m.role))
      setTeammates(tm.filter(m=>m.id!==profile.id))
    }
  }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  const markDone=id=>supabase.from('tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id)
  function setPickList(scheduleId,ids){ setPicks(p=>({...p,[scheduleId]:new Set(ids)})) }
  async function assignStage(scheduleId,eventTitle,ids){
    if(!ids.length) return
    const {error}=await supabase.from('tasks').insert(ids.map(uid=>({ title:`${TD_STAGE.titlePrefix} — ${eventTitle}`, department:TD_STAGE.dept, assigned_to:uid, schedule_id:scheduleId, created_by:profile.id, assigned_date:todayISO() })))
    if(error) notifyDialog(error.message); else { setPicks(p=>({...p,[scheduleId]:new Set()})); load() }
  }
  const list=worker?undone:rows
  return <div>
    <WelcomeHero profile={profile} onCreate={canCreateTask(role)?()=>setOpenTask(true):null} createLabel="New task"/>
    <section className="stats-grid">
      <Stat title={worker?'My Tasks':'Open Tasks'} value={stats.open} note="Active work" icon={CheckSquare}/>
      <Stat title="Completed" value={stats.done} note={worker?'Worked task number':'Finished'} icon={CheckCircle2}/>
      {!worker && <Stat title="Colorists" value={stats.members} note="Staff" icon={Users}/>}
      <Stat title="Total Tasks" value={stats.total} note="All time" icon={ClipboardCheck}/>
    </section>
    <ToSortPanel profile={profile}/>
    {td && <div className="panel" style={{marginBottom:14}}>
      <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>Ready for {TD_STAGE.verb}</h2></div>
      {!avail.length && <div className="empty" style={{padding:'0 21px 21px'}}>No sorted events waiting.</div>}
      {avail.map(e=>{ const picked=[...(picks[e.id]||[])]; return <div style={{padding:'16px 21px',borderTop:'1px solid var(--border)'}} key={e.id}>
        <div style={{marginBottom:10}}><strong style={{display:'block',fontSize:13}}>{e.title}</strong><span style={{fontSize:11,color:'var(--text-dim)'}}>{fmtDay(e.start_at)}{e.sorted_at?` • sorted ${fmtDay(e.sorted_at,false)}`:''}</span></div>
        <div className="assign-row">
          <button className="act-btn idle" onClick={()=>assignStage(e.id,e.title,[profile.id])}>Assign to myself</button>
          <div style={{flex:1,display:'grid',gap:8}}>
            {[['STAFF',teammates.filter(m=>m.role==='staff_colorist')],['EDBO',teammates.filter(m=>BOARD_ASSIGNABLE.includes(m.role)).sort(dirSort)]].map(([lab,list])=>list.length>0 && <div key={lab}><div className="token-group-label">{lab}</div><div className="token-row">{list.map(m=><button type="button" key={m.id} className={`token ${picked.includes(m.id)?'active':''}`} onClick={()=>setPickList(e.id, picked.includes(m.id)?picked.filter(x=>x!==m.id):[...picked,m.id])}>{m.full_name}</button>)}</div></div>)}
            {!teammates.length && <span style={{fontSize:11,color:'var(--text-dim)'}}>No one else to assign yet.</span>}</div>
          {picked.length>0 && <button className="act-btn idle" onClick={()=>assignStage(e.id,e.title,picked)}>Assign selected ({picked.length})</button>}
        </div>
      </div> })}
    </div>}
    <div className="panel task-panel">
      <div className="panel-title"><h2>{worker?'My tasks':'Recent tasks'}</h2></div>
      <div className="task-list">{list.map(t=>{ const mine=t.status!=='completed' && t.assigned_to===profile.id; return <div className="task-row" key={t.id}><div className="task-icon layout"><CheckSquare size={16}/></div>
        <div className="task-info"><strong>{t.title}</strong><span>{worker?'':`${t.profiles?.full_name||'Unassigned'} • `}Assigned {fmtDay(t.assigned_date,false)}{t.status==='completed'&&t.completed_at?` • Done ${fmtDay(t.completed_at,false)}`:''}</span></div>
        {mine ? <ActionButton label={t.department==='Colorist'?'Colorgraded':'Done'} run={()=>markDone(t.id)} after={load}/> : <span className={`status ${t.status}`}>{t.status.replace('_',' ')}</span>}</div> })}
        {list.length===0 && <div className="empty">Nothing here yet.</div>}</div>
    </div>
    {hasPostingTracker(role) && <PostingTracker profile={profile}/>}
    {openTask && <TaskModal profile={profile} onClose={()=>setOpenTask(false)} onSaved={load}/>}
  </div>
}

/* ---------------- Task Tracker: finished work. Shows assigned date + done date (no due dates). ---------------- */
function TaskTracker({profile}){
  const role=profile.role; const privileged=seesAll(role); const worker=isWorker(role)
  const canTask=isAdminLike(role)||isTD(role); const canEvent=isAdminLike(role)
  const [tasks,setTasks]=useState([]); const [events,setEvents]=useState([]); const [loading,setLoading]=useState(true)
  const [deptFilter,setDeptFilter]=useState(''); const [dateFilter,setDateFilter]=useState(''); const [search,setSearch]=useState('')
  const [editTask,setEditTask]=useState(null); const [editEvent,setEditEvent]=useState(null)
  async function load(){
    let tq=supabase.from('tasks').select('*,profiles!tasks_assigned_to_fkey(full_name,department)').eq('status','completed').order('completed_at',{ascending:false})
    if(worker) tq=tq.eq('assigned_to',profile.id); else tq=tq.in('department',managedTaskDepts(role))
    const {data}=await tq; setTasks(data||[])
    if(privileged){ const {data:ev}=await supabase.from('schedules').select('*,schedule_members(member_id,sorted,sorted_at,duties,profiles(full_name))').eq('department','Media').in('status',['completed','done']).order('start_at',{ascending:false}); setEvents(ev||[]) }
    setLoading(false)
  }
  useEffect(()=>{ setLoading(true); load() },[profile.id]); usePoll(load)
  async function del(id){ if(!await confirmDialog({title:'Delete task?',body:'This removes the task for everyone. This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; await supabase.from('tasks').delete().eq('id',id); load() }
  async function delEvent(id){ if(!await confirmDialog({title:'Delete event?',body:'This removes the event for everyone. This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; await supabase.from('schedules').delete().eq('id',id); load() }
  const q=search.trim().toLowerCase()
  const filteredTasks=tasks.filter(t=>(!deptFilter||t.department===deptFilter)&&(!dateFilter||t.assigned_date===dateFilter||(t.completed_at&&localISO(t.completed_at)===dateFilter))&&(!q||`${t.title} ${t.profiles?.full_name||''} ${t.department}`.toLowerCase().includes(q)))
  const filteredEvents=events.filter(e=>(!deptFilter||deptFilter==='Media')&&(!dateFilter||localISO(e.start_at)===dateFilter||(e.sorted_at&&localISO(e.sorted_at)===dateFilter))&&(!q||`${e.title} ${(e.schedule_members||[]).map(m=>m.profiles?.full_name).join(' ')}`.toLowerCase().includes(q)))
  return <div>
    <section className="page-head"><div><div className="eyebrow">COMPLETED WORK</div><h1>Tracker</h1><p>Everything finished, with who did it and when.</p></div></section>
    <FilterBar search={search} onSearch={setSearch} date={dateFilter} onDate={setDateFilter} placeholder="Event, task or person…" extraActive={!!deptFilter} onClear={()=>setDeptFilter('')}>
      {privileged && <label>Department<Select className="filter-select" value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}><option value="">All</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</Select></label>}
    </FilterBar>
    {privileged && <>
      <div className="eyebrow" style={{margin:'6px 0 8px'}}>EVENTS — MEDIA</div>
      <div className="panel table-panel" style={{marginBottom:20}}>
        <div className={`table-head trk-events ${canEvent?'':'no-action'}`}><span>Event date</span><span>Event name</span><span>Medias</span><span>Sorted on</span><span>Status</span>{canEvent && <span>Action</span>}</div>
        {loading ? <div className="empty">Loading…</div> : filteredEvents.map(e=><div className={`table-row trk-events ${canEvent?'':'no-action'}`} key={e.id}>
          <span data-label="Event date">{fmtDay(e.start_at)}</span><strong className="row-title">{e.title}</strong>
          <span data-label="Medias">{(e.schedule_members||[]).map(m=>crewText(m)).filter(Boolean).join(', ')||'—'}</span>
          <span data-label="Sorted on">{e.sorted_at?fmtDay(e.sorted_at):'—'}</span>
          <span data-label="Status"><span className={`status ${e.status}`}>{e.status==='completed'?'sorted':e.status}</span></span>
          {canEvent && <span className="row-actions"><button className="icon-btn" title="Edit" onClick={()=>setEditEvent(e)}><Pencil size={14}/></button><button className="icon-btn" title="Delete" onClick={()=>delEvent(e.id)}><Trash2 size={14}/></button></span>}
        </div>)}
        {!loading && !filteredEvents.length && <div className="empty">No sorted events found.</div>}
      </div>
    </>}
    <div className="eyebrow" style={{margin:'6px 0 8px'}}>TASKS — {privileged?'ALL':(profile.department||'').toUpperCase()}</div>
    <div className="panel table-panel">
      <div className={`table-head trk-tasks ${canTask?'':'no-action'}`}><span>Task</span><span>Department</span><span>Assignee</span><span>Assigned</span><span>Done</span>{canTask && <span>Action</span>}</div>
      {loading ? <div className="empty">Loading…</div> : filteredTasks.map(t=><div className={`table-row trk-tasks ${canTask?'':'no-action'}`} key={t.id}>
        <strong className="row-title">{t.title}</strong><span data-label="Department">{t.department}</span><span data-label="Assignee">{t.profiles?.full_name||'Unassigned'}</span><span data-label="Assigned">{fmtDay(t.assigned_date)}</span><span data-label="Done">{t.completed_at?fmtDay(t.completed_at):'—'}</span>
        {canTask && <span className="row-actions"><button className="icon-btn" title="Edit" onClick={()=>setEditTask(t)}><Pencil size={14}/></button><button className="icon-btn" title="Delete" onClick={()=>del(t.id)}><Trash2 size={14}/></button></span>}
      </div>)}
      {!loading && !filteredTasks.length && <div className="empty">Nothing completed yet.</div>}
    </div>
    {editTask && <EditTaskModal task={editTask} onClose={()=>setEditTask(null)} onSaved={load}/>}
    {editEvent && <EditScheduleModal schedule={editEvent} onClose={()=>setEditEvent(null)} onSaved={load}/>}
  </div>
}
function localISO(v){ const d=new Date(v); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

// Task pickers: Staff first, then the EDBO board members who can colorgrade.
function taskAssigneeGroups(members){
  return [{label:'STAFF',people:members.filter(m=>m.role==='staff_colorist')},{label:'EDBO',people:members.filter(m=>BOARD_ASSIGNABLE.includes(m.role)).sort(dirSort)}]
}
function useAssignees(){
  const [members,setMembers]=useState([])
  useEffect(()=>{ (async()=>{ setMembers((await fetchActive()).filter(m=>m.role==='staff_colorist'||BOARD_ASSIGNABLE.includes(m.role))) })() },[])
  return members
}
// The task's department follows who it is for: Art Director work stays "Art Director", everything else is colorgrading.
function deptFromAssignee(members,id){ return members.find(m=>m.id===id)?.role==='art_director'?'Art Director':'Colorist' }

function TaskModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({title:'Colorgrading',description:'',assignedIds:[],assigned_date:todayISO()})
  const members=useAssignees(); const [busy,setBusy]=useState(false)
  async function save(e){ e.preventDefault()
    if(!form.assignedIds.length){ notifyDialog('Pick who the task is for.'); return }
    setBusy(true)
    const {error}=await supabase.from('tasks').insert({ title:form.title, description:form.description||null, department:deptFromAssignee(members,form.assignedIds[0]), assigned_to:form.assignedIds[0], assigned_date:form.assigned_date||todayISO(), created_by:profile.id })
    setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() }
  }
  return <Modal title="Create task" onClose={onClose}><form onSubmit={save}>
    <label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label>Assign to</label>
    <PersonPicker groups={taskAssigneeGroups(members)} value={form.assignedIds} multi={false} onChange={ids=>setForm({...form,assignedIds:ids})}/>
    <label>Assigned date<DateField required value={form.assigned_date} onChange={v=>setForm({...form,assigned_date:v})}/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Create task'}</button></div>
  </form></Modal>
}

function EditTaskModal({task,onClose,onSaved}){
  const [form,setForm]=useState({title:task.title,description:task.description||'',assignedIds:task.assigned_to?[task.assigned_to]:[],assigned_date:task.assigned_date||todayISO()})
  const members=useAssignees(); const [busy,setBusy]=useState(false)
  async function save(e){ e.preventDefault(); setBusy(true)
    const patch={ title:form.title, description:form.description||null, assigned_to:form.assignedIds[0]||null, assigned_date:form.assigned_date||null }
    if(form.assignedIds[0] && form.assignedIds[0]!==task.assigned_to) patch.department=deptFromAssignee(members,form.assignedIds[0])
    const {error}=await supabase.from('tasks').update(patch).eq('id',task.id)
    setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() }
  }
  return <Modal title="Edit task" onClose={onClose}><form onSubmit={save}>
    <label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label>Assign to</label>
    <PersonPicker groups={taskAssigneeGroups(members)} value={form.assignedIds} multi={false} onChange={ids=>setForm({...form,assignedIds:ids})}/>
    <label>Assigned date<DateField required value={form.assigned_date} onChange={v=>setForm({...form,assigned_date:v})}/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save changes'}</button></div>
  </form></Modal>
}

/* ---------------- Calendar (mode-aware, works for everyone) ---------------- */
function CalendarPage({profile}){
  const role=profile.role; const staff=isStaff(role); const worker=isWorker(role)
  const effMode = (seesAll(role)||isTD(role)||role==='art_director') ? 'all' : roleMode(role)
  const [month,setMonth]=useState(()=>{ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [items,setItems]=useState([]) // unified {id,title,date,type,raw}
  const [selected,setSelected]=useState(null)
  const [openSchedule,setOpenSchedule]=useState(false)
  const [openTask,setOpenTask]=useState(false)
  const [editItem,setEditItem]=useState(null)
  const [editMode,setEditMode]=useState(false) // pop-up switch: View (clean) / Edit (buttons)
  const gridStart=useMemo(()=>{ const d=new Date(month); d.setDate(1-d.getDay()); return d },[month])
  const gridDays=useMemo(()=>Array.from({length:42},(_,i)=>{ const d=new Date(gridStart); d.setDate(gridStart.getDate()+i); return d }),[gridStart])

  useEffect(()=>{ load() },[profile.id,month]); usePoll(()=>load())

  async function load(){
    const rangeStart=new Date(gridStart); const rangeEnd=new Date(gridStart); rangeEnd.setDate(rangeEnd.getDate()+42)
    let unified=[]
    if(effMode==='hours' || effMode==='all'){
      let sq=supabase.from('schedules').select('*,schedule_members(member_id,sorted,duties,profiles(full_name))').gte('start_at',rangeStart.toISOString()).lt('start_at',rangeEnd.toISOString()).order('start_at')
      if(effMode==='hours') sq=sq.eq('department',profile.department)
      const {data}=await sq; let rows=data||[]
      if(staff) rows=rows.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
      unified=unified.concat(rows.map(s=>({id:'s-'+s.id,title:s.title,date:new Date(s.start_at),type:'schedule',raw:s})))
    }
    if(effMode==='tasks' || effMode==='all'){
      let tq=supabase.from('tasks').select('*,profiles!tasks_assigned_to_fkey(full_name)').not('assigned_date','is',null).gte('assigned_date',localISO(rangeStart)).lt('assigned_date',localISO(rangeEnd))
      if(effMode==='tasks'){ if(worker) tq=tq.eq('assigned_to',profile.id); else tq=tq.in('department',managedTaskDepts(role)) }
      else if(!seesAll(role)) tq=tq.or(`assigned_to.eq.${profile.id}${isTD(role)?',department.eq.Colorist':''}`)
      const {data}=await tq; let rows=data||[]
      unified=unified.concat(rows.map(t=>({id:'t-'+t.id,title:t.title,date:new Date(t.assigned_date+'T00:00:00'),type:'task',raw:t})))
    }
    setItems(unified)
    setSelected(sel=>sel ? {date:sel.date, items:unified.filter(e=>sameDay(e.date,sel.date))} : sel)
  }

  function eventsOn(d){ return items.filter(e=>sameDay(e.date,d)) }
  function pickDay(d){ const list=eventsOn(d); if(list.length) setSelected({date:d,items:list}) }
  function shiftMonth(n){ const d=new Date(month); d.setMonth(d.getMonth()+n); setMonth(d) }
  const monthLabel=month.toLocaleDateString([], {month:'long',year:'numeric'}); const today=new Date()
  const upcoming=items.filter(e=>{ const st=e.raw.status; return e.date>=new Date(today.getFullYear(),today.getMonth(),today.getDate()) && st!=='completed' && st!=='done' }).sort((a,b)=>a.date-b.date).slice(0,8)

  const markMySorted=scheduleId=>supabase.from('schedule_members').update({sorted:true}).eq('schedule_id',scheduleId).eq('member_id',profile.id)
  // Admin / EDBO only: sort the whole event on everyone's behalf.
  async function markAllSorted(sched){
    if(!await confirmDialog({title:'Mark whole event sorted?',body:'This marks every assigned photographer as sorted.',confirmLabel:'Mark sorted'})) return
    const n=(sched.schedule_members||[]).length
    const r= n ? await supabase.from('schedule_members').update({sorted:true}).eq('schedule_id',sched.id) : await supabase.from('schedules').update({status:'completed'}).eq('id',sched.id)
    if(r.error) notifyDialog(r.error.message); load()
  }
  const markTaskDone=id=>supabase.from('tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id)
  async function deleteItem(item){ if(!await confirmDialog({title:'Delete this?',body:'This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; if(item.type==='task') await supabase.from('tasks').delete().eq('id',item.raw.id); else await supabase.from('schedules').delete().eq('id',item.raw.id); setSelected(null); load() }
  const canEdit=item=> item.type==='task' ? (isAdminLike(role)||(isTD(role)&&item.raw.department==='Colorist')) : canCreateSchedule(role)
  const anyEditable=!!selected && selected.items.some(canEdit)

  return <div>
    <section className="page-head"><div><div className="eyebrow">PLANNING</div><h1>Team calendar</h1><p>{worker?'Your assigned schedule.':'Create and review events and tasks.'}</p></div>
      <div style={{display:'flex',gap:8}}>
        {(effMode==='hours'||effMode==='all') && canCreateSchedule(role) && <button className="primary-btn" onClick={()=>setOpenSchedule(true)}><Plus size={17}/> New event</button>}
        {(effMode==='tasks'||effMode==='all') && canCreateTask(role) && <button className="primary-btn" onClick={()=>setOpenTask(true)}><Plus size={17}/> New task</button>}
      </div></section>
    <div className="panel calendar">
      <div className="cal-toolbar"><button className="icon-btn" onClick={()=>shiftMonth(-1)}><ChevronLeft size={16}/></button><strong>{monthLabel}</strong><button className="icon-btn" onClick={()=>shiftMonth(1)}><ChevronRight size={16}/></button>
        <button className="text-btn" style={{marginLeft:'auto'}} onClick={()=>{ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); setMonth(d) }}>Today</button></div>
      <div className="calendar-days">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d=><div key={d}>{d}</div>)}</div>
      <div className="calendar-grid">{gridDays.map((d,i)=>{ const list=eventsOn(d); const inMonth=d.getMonth()===month.getMonth(); const isToday=sameDay(d,today)
        return <div key={i} className={`day ${list.length?'has-event':''} ${inMonth?'':'muted'} ${isToday?'today':''}`} onClick={()=>{ setEditMode(false); pickDay(d) }}>
          <b>{d.getDate()}</b>{list.slice(0,2).map(e=><span key={e.id}>{e.title}</span>)}{list.length>2 && <span className="more">+{list.length-2} more</span>}
        </div> })}</div>
    </div>
    <div className="panel task-panel" style={{marginTop:14}}>
      <div className="panel-title"><h2>Upcoming</h2></div>
      <div className="task-list">{upcoming.map(e=><div className="task-row" key={e.id} onClick={()=>{ setEditMode(false); pickDay(e.date) }} style={{cursor:'pointer'}}>
        <div className={`task-icon ${e.type==='task'?'layout':'media'}`}>{e.type==='task'?<CheckSquare size={16}/>:<CalendarDays size={16}/>}</div>
        <div className="task-info"><strong>{e.title}</strong><span>{fmtDay(e.date,false)}{e.type!=='task'?` • ${fmtTime(e.raw.start_at)}`:''}</span></div>
        <span className={`status ${e.raw.status}`}>{e.raw.status.replace('_',' ')}</span>
      </div>)}
      {!upcoming.length && <div className="empty">Nothing upcoming.</div>}</div>
    </div>
    {selected && <Modal title={selected.date.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric',year:'numeric'})} onClose={()=>setSelected(null)}>
      {anyEditable && <div className="seg-switch" role="tablist"><button type="button" className={!editMode?'on':''} onClick={()=>setEditMode(false)}><Eye size={13}/> View</button><button type="button" className={editMode?'on':''} onClick={()=>setEditMode(true)}><Pencil size={13}/> Edit</button></div>}
      {selected.items.map(e=><div key={e.id} className="day-detail-row">
        <strong>{e.title}</strong>
        {e.type==='schedule' && <><span>{e.raw.department} • {fmtTime(e.raw.start_at)} – {fmtTime(e.raw.end_at)} ({Math.max(0,(new Date(e.raw.end_at)-new Date(e.raw.start_at))/3600000).toFixed(1)}h)</span>
          <span>Where: {e.raw.location||'No location'}</span>{e.raw.description && <span>{e.raw.description}</span>}<span>Status: {e.raw.status==='completed'?'sorted':e.raw.status}{e.raw.sorted_at?` (${fmtDay(e.raw.sorted_at,false)})`:''}</span></>}
        {e.type==='task' && <><span>{e.raw.department} • Assigned to {e.raw.profiles?.full_name||'Unassigned'}</span>
          <span>Assigned {fmtDay(e.raw.assigned_date)}{e.raw.completed_at?` • Done ${fmtDay(e.raw.completed_at)}`:''}</span>{e.raw.description && <span>{e.raw.description}</span>}<span>Status: {e.raw.status.replace('_',' ')}</span></>}
        {e.type==='schedule' && e.raw.schedule_members?.length>0 && <div className="member-chips">{e.raw.schedule_members.map(m=><span key={m.member_id} className={`${m.sorted?'done':''} ${m.member_id===profile.id?'me':''}`}>{crewText(m)}{!needsSort(m)?'':m.sorted?' ✓ sorted':' • pending'}{m.member_id===profile.id?' (you)':''}</span>)}</div>}
        <div style={{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}>
          {e.type==='schedule' && e.raw.status!=='completed' && (e.raw.schedule_members||[]).some(m=>m.member_id===profile.id && !m.sorted && needsSort(m)) && <ActionButton label="I've sorted my part" doneLabel="Sorted" run={()=>markMySorted(e.raw.id)} after={load}/>}
          {editMode && e.type==='schedule' && e.raw.status!=='completed' && isAdminLike(role) && <button className="ghost-btn" onClick={()=>markAllSorted(e.raw)}>Mark all sorted</button>}
          {e.type==='task' && e.raw.status!=='completed' && (e.raw.assigned_to===profile.id || isAdminLike(role)) && <ActionButton label={e.raw.department==='Colorist'?'Colorgraded':'Mark done'} doneLabel={e.raw.department==='Colorist'?'Colorgraded':'Done'} run={()=>markTaskDone(e.raw.id)} after={load}/>}
          {editMode && canEdit(e) && <button className="ghost-btn" onClick={()=>setEditItem(e)}><Pencil size={13}/> Edit</button>}
          {editMode && canEdit(e) && <button className="danger-btn" onClick={()=>deleteItem(e)}><Trash2 size={13}/> Delete</button>}
        </div>
      </div>)}
    </Modal>}
    {openSchedule && <ScheduleModal profile={profile} onClose={()=>setOpenSchedule(false)} onSaved={load}/>}
    {openTask && <TaskModal profile={profile} onClose={()=>setOpenTask(false)} onSaved={load}/>}
    {editItem?.type==='schedule' && <EditScheduleModal schedule={editItem.raw} onClose={()=>setEditItem(null)} onSaved={()=>{ load(); setSelected(null) }}/>}
    {editItem?.type==='task' && <EditTaskModal task={editItem.raw} onClose={()=>setEditItem(null)} onSaved={()=>{ load(); setSelected(null) }}/>}
  </div>
}

// Who is on an event: Media first, then EDBO. Tapping a name adds them and pops the duty tags (PM / PC / VM / VC) right beside it.
function CrewPicker({people,value,onChange}){
  const groups=[{label:'STAFF',people:people.filter(p=>p.role==='staff_media')},{label:'EDBO',people:people.filter(p=>EVENT_BOARD.includes(p.role)).sort(dirSort)}]
  function toggle(id){ const n={...value}; if(n[id]) delete n[id]; else n[id]=[]; onChange(n) }
  function duty(id,d){ const cur=value[id]||[]; onChange({...value,[id]:cur.includes(d)?cur.filter(x=>x!==d):[...cur,d]}) }
  return <div className="token-picker">
    {groups.map(g=>g.people.length>0 && <div key={g.label} className="token-group"><div className="token-group-label">{g.label}</div>
      <div className="token-row">{g.people.map(p=>{ const on=!!value[p.id]; return <span key={p.id} className={`crew-item ${on?'on':''}`}>
        <button type="button" className={`token ${on?'active':''}`} onClick={()=>toggle(p.id)}>{p.full_name}</button>
        {on && <span className="duty-pills">{DUTIES.map(([k,t])=><button type="button" key={k} title={t} className={(value[p.id]||[]).includes(k)?'on':''} onClick={()=>duty(p.id,k)}>{k}</button>)}</span>}
      </span> })}</div></div>)}
    <div className="duty-legend">Duty (optional): <b>PM</b> Photo Main · <b>PC</b> Photo Creative · <b>VM</b> Video Main · <b>VC</b> Video Creative</div>
  </div>
}

function useEventPeople(){
  const [people,setPeople]=useState([])
  useEffect(()=>{ (async()=>{ setPeople((await fetchActive()).filter(m=>m.role==='staff_media'||EVENT_BOARD.includes(m.role))) })() },[])
  return people
}

function ScheduleModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({title:'',description:'',location:'',date:todayISO(),start:'',end:'',crew:{}})
  const people=useEventPeople(); const [busy,setBusy]=useState(false)
  async function save(e){ e.preventDefault()
    if(form.end<=form.start){ notifyDialog('End time must be after the start time.'); return }
    setBusy(true)
    const start_at=new Date(`${form.date}T${form.start}`).toISOString(); const end_at=new Date(`${form.date}T${form.end}`).toISOString()
    const {data:sched,error}=await supabase.from('schedules').insert({ title:form.title, description:form.description||null, location:form.location||null, department:'Media', start_at, end_at, created_by:profile.id }).select().single()
    if(error){ notifyDialog(error.message); setBusy(false); return }
    const ids=Object.keys(form.crew)
    if(ids.length){ const {error:me}=await supabase.from('schedule_members').insert(ids.map(id=>({schedule_id:sched.id,member_id:id,duties:form.crew[id]}))); if(me) notifyDialog(me.message) }
    setBusy(false); onClose(); onSaved()
  }
  return <Modal title="New event" onClose={onClose}><form onSubmit={save}>
    <label>Event name<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label>Date<DateField required value={form.date} onChange={v=>setForm({...form,date:v})}/></label>
    <div className="form-row">
      <label>Start time<TimeField required value={form.start} onChange={v=>setForm({...form,start:v})}/></label>
      <label>End time<TimeField required value={form.end} onChange={v=>setForm({...form,end:v})}/></label>
    </div>
    <label>Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
    <label>Assigned to</label>
    <CrewPicker people={people} value={form.crew} onChange={crew=>setForm({...form,crew})}/>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Create event'}</button></div>
  </form></Modal>
}

function EditScheduleModal({schedule,onClose,onSaved}){
  const start=new Date(schedule.start_at); const end=new Date(schedule.end_at)
  const toTime=d=>d.toTimeString().slice(0,5)
  const [form,setForm]=useState({title:schedule.title,description:schedule.description||'',location:schedule.location||'',date:localISO(start),start:toTime(start),end:toTime(end),crew:{}})
  const people=useEventPeople(); const [busy,setBusy]=useState(false); const [before,setBefore]=useState({})
  useEffect(()=>{ (async()=>{
    const {data:existing}=await supabase.from('schedule_members').select('member_id,duties').eq('schedule_id',schedule.id)
    const c={}; (existing||[]).forEach(m=>{ c[m.member_id]=m.duties||[] }); setBefore(c); setForm(f=>({...f,crew:c}))
  })() },[])
  async function save(e){ e.preventDefault()
    if(form.end<=form.start){ notifyDialog('End time must be after the start time.'); return }
    setBusy(true)
    const start_at=new Date(`${form.date}T${form.start}`).toISOString(); const end_at=new Date(`${form.date}T${form.end}`).toISOString()
    const {error}=await supabase.from('schedules').update({ title:form.title, description:form.description||null, location:form.location||null, start_at, end_at }).eq('id',schedule.id)
    if(error){ notifyDialog(error.message); setBusy(false); return }
    const have=Object.keys(before), now=Object.keys(form.crew)
    const removed=have.filter(id=>!now.includes(id)); const added=now.filter(id=>!have.includes(id))
    const changed=now.filter(id=>have.includes(id) && JSON.stringify([...(before[id]||[])].sort())!==JSON.stringify([...(form.crew[id]||[])].sort()))
    if(removed.length) await supabase.from('schedule_members').delete().eq('schedule_id',schedule.id).in('member_id',removed)
    if(added.length) await supabase.from('schedule_members').insert(added.map(id=>({schedule_id:schedule.id,member_id:id,duties:form.crew[id]})))
    for(const id of changed) await supabase.from('schedule_members').update({duties:form.crew[id]}).eq('schedule_id',schedule.id).eq('member_id',id)
    setBusy(false); onClose(); onSaved()
  }
  return <Modal title="Edit event" onClose={onClose}><form onSubmit={save}>
    <label>Event name<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label>Date<DateField required value={form.date} onChange={v=>setForm({...form,date:v})}/></label>
    <div className="form-row">
      <label>Start time<TimeField required value={form.start} onChange={v=>setForm({...form,start:v})}/></label>
      <label>End time<TimeField required value={form.end} onChange={v=>setForm({...form,end:v})}/></label>
    </div>
    <label>Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
    <label>Assigned to</label>
    <CrewPicker people={people} value={form.crew} onChange={crew=>setForm({...form,crew})}/>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save changes'}</button></div>
  </form></Modal>
}

/* ---------------- Tracker (Head Media / Media: sorted events ledger) ---------------- */
function Tracker({profile}){
  const [rows,setRows]=useState([]); const [edit,setEdit]=useState(null)
  const [search,setSearch]=useState(''); const [dateFilter,setDateFilter]=useState('')
  const can=canCreateSchedule(profile.role); const staff=isStaff(profile.role)
  async function load(){
    const {data}=await supabase.from('schedules').select('*,schedule_members(member_id,sorted,sorted_at,duties,profiles(full_name))').eq('department','Media').in('status',['completed','done']).order('start_at',{ascending:false})
    let list=data||[]
    if(staff) list=list.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
    setRows(list)
  }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  async function del(id){ if(!await confirmDialog({title:'Delete event?',body:'This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; await supabase.from('schedules').delete().eq('id',id); load() }
  const q=search.trim().toLowerCase()
  const shown=rows.filter(r=>(!dateFilter||localISO(r.start_at)===dateFilter||(r.sorted_at&&localISO(r.sorted_at)===dateFilter))&&(!q||`${r.title} ${(r.schedule_members||[]).map(m=>m.profiles?.full_name).join(' ')}`.toLowerCase().includes(q)))
  return <div>
    <section className="page-head"><div><div className="eyebrow">FULL LEDGER</div><h1>Tracker</h1><p>Sorted events, who covered them, and when they were sorted.</p></div></section>
    <FilterBar search={search} onSearch={setSearch} date={dateFilter} onDate={setDateFilter} placeholder="Event or media…"/>
    <div className="panel table-panel">
      <div className={`table-head trk-media ${can?'':'no-action'}`}><span>Event date</span><span>Event name</span><span>Medias</span><span>Sorted on</span><span>Status</span>{can && <span>Action</span>}</div>
      {shown.map(r=><div className={`table-row trk-media ${can?'':'no-action'}`} key={r.id}>
        <span data-label="Event date">{fmtDay(r.start_at)}<small className="sub">{fmtTime(r.start_at)}–{fmtTime(r.end_at)} · {Math.max(0,(new Date(r.end_at)-new Date(r.start_at))/3600000).toFixed(1)}h</small></span>
        <strong className="row-title">{r.title}</strong>
        <span data-label="Medias">{(r.schedule_members||[]).map(m=>crewText(m)).filter(Boolean).join(', ')||'—'}</span>
        <span data-label="Sorted on">{r.sorted_at?fmtDay(r.sorted_at):'—'}</span>
        <span data-label="Status"><span className={`status ${r.status}`}>{r.status==='completed'?'sorted':r.status}</span></span>
        {can && <span className="row-actions"><button className="icon-btn" title="Edit" onClick={()=>setEdit(r)}><Pencil size={14}/></button><button className="icon-btn" title="Delete" onClick={()=>del(r.id)}><Trash2 size={14}/></button></span>}</div>)}
      {!shown.length && <div className="empty">Nothing sorted yet.</div>}
    </div>
    {edit && <EditScheduleModal schedule={edit} onClose={()=>setEdit(null)} onSaved={load}/>}
  </div>
}

/* ---------------- Announcements (admin only) ---------------- */
function Announcements({profile}){
  const [rows,setRows]=useState([]); const [open,setOpen]=useState(false)
  useEffect(()=>{ load() },[])
  async function load(){ const {data}=await supabase.from('announcements').select('*').order('created_at',{ascending:false}); setRows(data||[]) }
  return <div>
    <section className="page-head"><div><div className="eyebrow">TEAM-WIDE</div><h1>Announcements</h1><p>Send a message to everyone, all heads, all staff, or handpicked people.</p></div>
      <button className="primary-btn" onClick={()=>setOpen(true)}><Megaphone size={17}/> New announcement</button></section>
    <div className="panel table-panel">
      {rows.map(a=><div key={a.id} style={{padding:'18px',borderTop:'1px solid var(--border)'}}>
        <strong style={{display:'block',fontSize:14}}>{a.title}</strong>
        <p style={{margin:'6px 0',color:'var(--text-dim)',fontSize:12,lineHeight:1.6}}>{a.body}</p>
        <small style={{color:'var(--text-dim)',fontSize:10}}>To: {a.audience} • {new Date(a.created_at).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}</small>
      </div>)}
      {!rows.length && <div className="empty">No announcements sent yet.</div>}
    </div>
    {open && <AnnouncementModal profile={profile} onClose={()=>setOpen(false)} onSaved={load}/>}
  </div>
}
function AnnouncementModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({title:'',body:'',audience:'all',target:[]})
  const [people,setPeople]=useState([]); const [busy,setBusy]=useState(false)
  useEffect(()=>{ (async()=>{ const data=await fetchActive(); setPeople(data.filter(p=>ROLE_META[p.role])) })() },[])
  async function save(e){ e.preventDefault(); setBusy(true)
    let recipients=[]
    if(form.audience==='all') recipients=people.map(p=>p.id)
    else if(form.audience==='heads') recipients=people.filter(p=>isHead(p.role)).map(p=>p.id)
    else if(form.audience==='staff') recipients=people.filter(p=>isStaff(p.role)).map(p=>p.id)
    else recipients=form.target
    const {error}=await supabase.from('announcements').insert({ sender_id:profile.id, title:form.title, body:form.body, audience:form.audience, target_user_ids:form.audience==='custom'?form.target:[] })
    if(error){ notifyDialog(error.message); setBusy(false); return }
    if(recipients.length){ await supabase.from('notifications').insert(recipients.map(uid=>({ user_id:uid, title:form.title, body:form.body, kind:'announcement' }))) }
    setBusy(false); onClose(); onSaved()
  }
  return <Modal title="New announcement" onClose={onClose}><form onSubmit={save}>
    <label>Header<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Body<textarea required value={form.body} onChange={e=>setForm({...form,body:e.target.value})}/></label>
    <label>Send to<Select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}>
      <option value="all">Everyone</option><option value="heads">All heads</option><option value="staff">All staff</option><option value="custom">Specific people…</option>
    </Select></label>
    {form.audience==='custom' && <><label>Recipients</label>
      <PersonPicker groups={[
        {label:'MEDIA',people:people.filter(p=>p.role==='staff_media')},
        {label:'COLORIST',people:people.filter(p=>p.role==='staff_colorist')},
        {label:'EDBO',people:people.filter(p=>groupOf(p.role)==='EDBO'||p.role==='admin')},
      ]} value={form.target} multi={true} onChange={ids=>setForm({...form,target:ids})}/>
    </>}
    <label>By<input value={profile.full_name} disabled/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Sending…':'Send announcement'}</button></div>
  </form></Modal>
}

/* ---------------- Members (roster + drill-down) ---------------- */
function Members({profile}){
  const [rows,setRows]=useState([]); const [open,setOpen]=useState(false); const [detail,setDetail]=useState(null)
  const [group,setGroup]=useState(''); const [search,setSearch]=useState('')
  const all=seesAll(profile.role); const canCreate=canManageAccounts(profile.role)
  async function load(){
    let data=await fetchProfiles()
    if(!all) data=data.filter(m=>m.role===(profile.role==='head_media'?'staff_media':'staff_colorist'))
    setRows(data.filter(m=>ROLE_META[m.role]&&m.active!==false||m.role==='admin').sort(dirSort))
  }
  useEffect(()=>{ load() },[profile.id])
  const q=search.trim().toLowerCase()
  const shown=rows.filter(m=>(!group||groupOf(m.role)===group)&&(!q||`${m.full_name} ${m.position||''} ${roleLabel(m)}`.toLowerCase().includes(q)))
  return <div>
    <section className="page-head"><div><div className="eyebrow">{group?group.toUpperCase():'THE TEAM'}</div><h1>Members{group?` — ${group}`:''}</h1><p>Click a member to see their full activity.</p></div>
      {canCreate && <button className="primary-btn" onClick={()=>setOpen(true)}><Plus size={17}/> Create account</button>}</section>
    <FilterBar search={search} onSearch={setSearch} placeholder="Search a name or position…" extraActive={!!group} onClear={()=>setGroup('')}>
      {all && <label>Section<Select className="filter-select" value={group} onChange={e=>setGroup(e.target.value)}><option value="">All</option><option>Admin</option><option>EDBO</option><option>Media</option><option>Colorist</option></Select></label>}
    </FilterBar>
    {SECTION_ORDER.map(sec=>{ const list=shown.filter(m=>groupOf(m.role)===sec); return list.length>0 && <div key={sec} className="members-section">
      <div className="members-section-head"><h2>{sec==='Admin'?'Admin':sec==='EDBO'?'EDBO team':sec==='Media'?'Media team':'Colorist team'}</h2><span>{list.length}</span></div>
      <div className="members-grid">{list.map(m=><div className="panel member-card" key={m.id} onClick={()=>setDetail(m)}>
        <div className="member-top"><div className="avatar large">{m.avatar_url?<img src={m.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(m.full_name)}</div>{m.active && <span className="active-dot">● active</span>}</div>
        <h3>{m.full_name}</h3><p>{sec==='EDBO'?`EDBO · ${roleLabel(m)}`:roleLabel(m)}</p>
        <div className="member-meta"><span>{sec}</span><span>{sec==='EDBO'?(m.position||'—'):(m.position||'—')}</span></div>
      </div>)}</div>
    </div> })}
    {!shown.length && <div className="panel empty">No members found.</div>}
    {open && <CreateAccountModal profile={profile} onClose={()=>setOpen(false)} onSaved={load}/>}
    {detail && <MemberDetailModal member={detail} onClose={()=>setDetail(null)}/>}
  </div>
}

function MemberDetailModal({member,onClose}){
  const [events,setEvents]=useState([]); const [tasks,setTasks]=useState([]); const [loading,setLoading]=useState(true)
  const [showLog,setShowLog]=useState(false)
  useEffect(()=>{ (async()=>{
    setLoading(true)
    const {data:ev}=await supabase.from('schedules').select('*,schedule_members!inner(member_id,duties)').eq('schedule_members.member_id',member.id).order('start_at',{ascending:false})
    const {data:tk}=await supabase.from('tasks').select('*').eq('assigned_to',member.id).order('assigned_date',{ascending:false})
    setEvents(ev||[]); setTasks(tk||[]); setLoading(false)
  })() },[member.id])
  const hours=events.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0)
  const done=tasks.filter(t=>t.status==='completed').length
  return <Modal title={member.full_name} onClose={onClose}>
    <p style={{color:'var(--text-dim)',fontSize:12,marginTop:-8}}>{roleLabel(member)} • {groupOf(member.role)}</p>
    <div className="stats-grid" style={{gridTemplateColumns:'1fr 1fr',marginBottom:16}}>
      <Stat title="Total Hours" value={hours.toFixed(1)} note={`${events.length} events`} icon={Clock3}/>
      <Stat title="Tasks Completed" value={done} note={`${tasks.length} tasks in total`} icon={CheckCircle2}/>
    </div>
    <button type="button" className="secondary-btn wide" onClick={()=>setShowLog(true)}><History size={15}/> Show logged history</button>
    {showLog && <Modal title={`${member.full_name} — full history`} onClose={()=>setShowLog(false)}>
      {loading ? <div className="empty">Loading…</div> : <div style={{maxHeight:400,overflow:'auto'}}>
        {[...events.map(r=>({k:r.start_at,id:'e'+r.id,title:r.title,meta:`${fmtDay(r.start_at)} • ${Math.max(0,(new Date(r.end_at)-new Date(r.start_at))/3600000).toFixed(1)}h${(r.schedule_members?.[0]?.duties||[]).length?` • ${r.schedule_members[0].duties.join('/')}`:''}`})),
          ...tasks.map(r=>({k:r.assigned_date||r.created_at,id:'t'+r.id,title:r.title,meta:`Assigned ${fmtDay(r.assigned_date,false)} • ${r.status.replace('_',' ')}${r.completed_at?` ${fmtDay(r.completed_at,false)}`:''}`}))]
          .sort((a,b)=>String(b.k).localeCompare(String(a.k))).map(r=><div key={r.id} style={{padding:'10px 0',borderTop:'1px solid var(--border)'}}>
          <strong style={{fontSize:12,display:'block'}}>{r.title}</strong><span style={{fontSize:11,color:'var(--text-dim)'}}>{r.meta}</span></div>)}
        {!events.length && !tasks.length && <div className="empty">Nothing logged yet.</div>}
      </div>}
    </Modal>}
  </Modal>
}

// Account form shared by Create + Edit: pick a group; EDBO then asks for the position.
function groupAndPositionOf(m){
  if(m.role==='admin') return {group:'Admin',position:'Admin'}
  if(m.role==='staff_media') return {group:'Media',position:m.position||''}
  if(m.role==='staff_colorist') return {group:'Colorist',position:m.position||''}
  if(m.role==='edbo'){ const hit=EDBO_POSITIONS.find(([l,r])=>r==='edbo'&&l===m.position); return {group:'EDBO',position:hit?hit[0]:'Finance'} }
  const hit=EDBO_POSITIONS.find(([,r])=>r===m.role); return {group:'EDBO',position:hit?hit[0]:'EIC'}
}
function roleFromChoice(group){ return DB_ROLE[group]||'media' }
function deptForRole(group){ return group }
function AccountFields({form,setForm}){
  return <>
    <div className="form-row">
      <label>Section<Select value={form.group} onChange={e=>setForm({...form,group:e.target.value,position:e.target.value==='EDBO'?'EIC':''})}>{ACCOUNT_GROUPS.map(g=><option key={g}>{g}</option>)}</Select></label>
      {form.group==='EDBO'
        ? <label>EDBO position<Select value={form.position} onChange={e=>setForm({...form,position:e.target.value})}>{EDBO_POSITIONS.map(([l])=><option key={l}>{l}</option>)}</Select></label>
        : form.group==='Admin' ? <label>Position title<input value="Admin" disabled/></label>
        : <label>Position title<input value={form.position} onChange={e=>setForm({...form,position:e.target.value})} placeholder={form.group==='Media'?'e.g. Photographer':'e.g. Colorist'}/></label>}
    </div>
    {form.group==='EDBO' && <p className="hint-note">{['EIC','AEIC'].includes(form.position)?'EIC and AEIC can add and edit everything (no Settings).':['TD','Art Director','Head Media'].includes(form.position)?`${form.position} has their own tools plus EDBO access.`:'This EDBO member can view and track everything but cannot add or edit.'}</p>}
  </>
}

function CreateAccountModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({full_name:'',email:'',password:'',group:'Media',position:'',avatar_url:''})
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('')
  async function save(e){ e.preventDefault(); setBusy(true); setErr('')
    const role=roleFromChoice(form.group)
    const {data:{session}}=await supabase.auth.getSession()
    const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,{ method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({full_name:form.full_name,email:form.email,password:form.password,department:deptForRole(form.group),role,position:form.group==='Admin'?'Admin':form.position,avatar_url:form.avatar_url||null}) })
    const json=await res.json().catch(()=>({})); setBusy(false)
    if(!res.ok){ setErr(json.error||'Something went wrong.'); return }
    onClose(); onSaved()
  }
  return <Modal title="Create account" onClose={onClose}><form onSubmit={save}>
    <label>Full name<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
    <label>Profile picture URL<input type="url" placeholder="https://… (optional)" value={form.avatar_url} onChange={e=>setForm({...form,avatar_url:e.target.value})}/></label>
    <div className="form-row">
      <label>Email<input type="email" required value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label>
      <label>Temporary password<input required minLength={6} value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/></label>
    </div>
    <AccountFields form={form} setForm={setForm}/>
    {err && <div className="error">{err}</div>}
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Creating…':'Create account'}</button></div>
  </form></Modal>
}

/* ---------------- Resources: links and photos (e.g. the AUP calendar) ---------------- */
function Resources({profile}){
  const [rows,setRows]=useState([]); const [open,setOpen]=useState(false); const [view,setView]=useState(null)
  const can=isAdminLike(profile.role)||['head_media','head_colorist'].includes(profile.role)
  async function load(){ const {data}=await supabase.from('resources').select('*').order('created_at',{ascending:false}); setRows(data||[]) }
  useEffect(()=>{ load() },[profile.id])
  async function del(r){
    if(!await confirmDialog({title:'Remove this resource?',body:r.image_url?'The photo will be deleted too.':undefined,confirmLabel:'Remove',danger:true})) return
    if(r.image_url){ const path=r.image_url.split('/resources/')[1]; if(path) await supabase.storage.from('resources').remove([decodeURIComponent(path)]) }
    await supabase.from('resources').delete().eq('id',r.id); load()
  }
  return <div>
    <section className="page-head"><div><div className="eyebrow">QUICK ACCESS</div><h1>Resources</h1><p>Photos, Canva, Drive and other team links — one tap away.</p></div>{can && <button className="primary-btn" onClick={()=>setOpen(true)}><Plus size={17}/> Add resource</button>}</section>
    <div className="resource-grid">{rows.map(r=>r.image_url
      ? <div className="resource-card panel photo" key={r.id}>
          <button type="button" className="resource-photo" onClick={()=>setView(r)} title="Open photo"><img src={r.image_url} alt={r.name} loading="lazy"/></button>
          <div className="resource-info"><div><h3>{r.name}</h3><p>{r.description||'Photo'}{r.url?' • has link':''}</p></div>
            {can && <button className="icon-btn" onClick={()=>del(r)} title="Remove"><Trash2 size={14}/></button>}</div>
        </div>
      : <a className="resource-card panel" href={r.url} target="_blank" rel="noreferrer" key={r.id}>
          <div className="resource-icon"><Link2 size={22}/></div><div><h3>{r.name}</h3><p>{r.description||r.resource_type}</p></div>
          {can ? <button className="icon-btn" onClick={e=>{ e.preventDefault(); del(r) }}><X size={15}/></button> : <ExternalLink size={17}/>}
        </a>)}</div>
    {!rows.length && <div className="panel empty">No resources yet.{can?' Add a photo or a link above.':''}</div>}
    {view && <Modal title={view.name} onClose={()=>setView(null)}>
      <img className="resource-full" src={view.image_url} alt={view.name}/>
      {view.description && <p style={{color:'var(--text-dim)',fontSize:12,margin:'10px 0 0'}}>{view.description}</p>}
      <div className="modal-actions" style={{marginTop:14}}>
        {view.url && <a className="secondary-btn" href={view.url} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Open link</a>}
        <a className="primary-btn" href={view.image_url} target="_blank" rel="noreferrer"><Download size={14}/> Open full size</a>
      </div>
    </Modal>}
    {open && <ResourceModal profile={profile} onClose={()=>setOpen(false)} onSaved={load}/>}
  </div>
}
function ResourceModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({name:'',description:'',url:'',resource_type:'Photo'})
  const [file,setFile]=useState(null); const [preview,setPreview]=useState('')
  const [busy,setBusy]=useState(false)
  function pick(f){ setFile(f||null); setPreview(f?URL.createObjectURL(f):'') }
  async function save(e){ e.preventDefault()
    if(!file && !form.url){ notifyDialog('Add a photo, a link, or both.'); return }
    if(file && file.size>5*1024*1024){ notifyDialog('The photo is bigger than 5 MB. Please use a smaller one.'); return }
    setBusy(true)
    let image_url=null
    if(file){
      const ext=((file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,''))||'jpg'
      const path=`${crypto.randomUUID()}.${ext}`
      const {error:ue}=await supabase.storage.from('resources').upload(path,file,{contentType:file.type||'image/jpeg',cacheControl:'3600'})
      if(ue){ notifyDialog('Upload failed: '+ue.message); setBusy(false); return }
      image_url=supabase.storage.from('resources').getPublicUrl(path).data.publicUrl
    }
    const {error}=await supabase.from('resources').insert({name:form.name,description:form.description||null,url:form.url||null,image_url,resource_type:file?'Photo':form.resource_type,created_by:profile.id})
    setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() }
  }
  return <Modal title="Add resource" onClose={onClose}><form onSubmit={save}>
    <label>Name<input required placeholder="e.g. AUP Calendar" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>Photo (optional)<input type="file" accept="image/*" onChange={e=>pick(e.target.files?.[0])}/></label>
    {preview && <img className="resource-preview" src={preview} alt="Preview"/>}
    <label>Link (optional)<input type="url" placeholder="https://… Canva, Drive…" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/></label>
    <label>Note<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Uploading…':'Add'}</button></div>
  </form></Modal>
}

/* ---------------- Settings (admin only) ---------------- */
function Settings({profile}){
  const [rows,setRows]=useState([]); const [edit,setEdit]=useState(null); const [reset,setReset]=useState(null); const [filter,setFilter]=useState(''); const [search,setSearch]=useState('')
  useEffect(()=>{ load() },[])
  async function load(){ setRows((await fetchProfiles()).sort(dirSort)) }
  const q=search.trim().toLowerCase()
  const filtered=rows.filter(m=>(!filter||groupOf(m.role)===filter)&&(!q||`${m.full_name} ${m.email||''} ${m.position||''}`.toLowerCase().includes(q)))
  return <div>
    <section className="page-head"><div><div className="eyebrow">ADMIN ONLY</div><h1>Settings</h1><p>Edit member profiles or reset a password.</p></div></section>
    <FilterBar search={search} onSearch={setSearch} placeholder="Search name, email or position…" extraActive={!!filter} onClear={()=>setFilter('')}>
      <label>Section<Select value={filter} onChange={e=>setFilter(e.target.value)} className="filter-select"><option value="">All</option><option>Admin</option><option>EDBO</option><option>Media</option><option>Colorist</option></Select></label>
    </FilterBar>
    <div className="panel">{filtered.map(m=><div className="settings-row" key={m.id}>
      <div className="settings-who">
        <div className="avatar">{m.avatar_url?<img src={m.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(m.full_name)}</div>
        <div className="settings-text"><strong>{m.full_name}{m.active===false?' (inactive)':''}</strong><span>{ROLE_META[m.role]?roleLabel(m):'Old role (unused)'}{m.email?` • ${m.email}`:''}</span></div>
      </div>
      <div className="settings-actions"><button className="ghost-btn" onClick={()=>setEdit(m)}>Edit</button><button className="ghost-btn" onClick={()=>setReset(m)}><KeyRound size={13}/> Reset password</button></div>
    </div>)}{!filtered.length && <div className="empty">No members found.</div>}</div>
    {edit && <EditMemberModal member={edit} onClose={()=>setEdit(null)} onSaved={load}/>}
    {reset && <ResetPasswordModal member={reset} onClose={()=>setReset(null)}/>}
  </div>
}
async function callManageUser(body){
  const {data:{session}}=await supabase.auth.getSession()
  const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-manage-user`,{ method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify(body) })
  const json=await res.json().catch(()=>({})); if(!res.ok) throw new Error(json.error||'Something went wrong.'); return json
}
function EditMemberModal({member,onClose,onSaved}){
  const start=groupAndPositionOf(member.role&&ROLE_META[member.role]?member:{role:'staff_media',position:member.position})
  const [form,setForm]=useState({full_name:member.full_name,group:start.group,position:start.position,active:member.active,avatar_url:member.avatar_url||''})
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('')
  async function save(e){ e.preventDefault(); setBusy(true); setErr('')
    const role=roleFromChoice(form.group)
    try{ await callManageUser({action:'update_profile',userId:member.id,full_name:form.full_name,avatar_url:form.avatar_url,active:form.active,role,department:deptForRole(form.group),position:form.group==='Admin'?'Admin':form.position}); onClose(); onSaved() } catch(e){ setErr(e.message) }
    setBusy(false)
  }
  return <Modal title={`Edit ${member.full_name}`} onClose={onClose}><form onSubmit={save}>
    <label>Full name<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
    <label>Profile picture URL<input type="url" placeholder="https://…" value={form.avatar_url} onChange={e=>setForm({...form,avatar_url:e.target.value})}/></label>
    <AccountFields form={form} setForm={setForm}/>
    <label style={{display:'flex',flexDirection:'row',alignItems:'center',gap:8}}><input type="checkbox" style={{width:'auto'}} checked={form.active} onChange={e=>setForm({...form,active:e.target.checked})}/> Active member</label>
    {err && <div className="error">{err}</div>}
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save changes'}</button></div>
  </form></Modal>
}
function ResetPasswordModal({member,onClose}){
  const [pw,setPw]=useState(''); const [busy,setBusy]=useState(false); const [err,setErr]=useState(''); const [ok,setOk]=useState(false)
  async function save(e){ e.preventDefault(); setBusy(true); setErr('')
    try{ await callManageUser({action:'reset_password',userId:member.id,password:pw}); setOk(true); setTimeout(onClose,1000) } catch(e){ setErr(e.message) }
    setBusy(false)
  }
  return <Modal title={`Reset password — ${member.full_name}`} onClose={onClose}><form onSubmit={save}>
    <label>New password<input required minLength={6} value={pw} onChange={e=>setPw(e.target.value)}/></label>
    {err && <div className="error">{err}</div>}{ok && <div className="empty" style={{padding:'6px 0'}}>Password updated.</div>}
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Reset password'}</button></div>
  </form></Modal>
}

/* ---------------- Backup ---------------- */
function Backup({profile}){
  const role=profile.role; const all=seesAll(role)
  const canSetLink=isAdminLike(role)||isHead(role)
  const showEvents=all||role==='head_media'
  const fixedGroup=all?'':(role==='head_media'?'Media':'Colorist')
  const [group,setGroup]=useState(''); const [search,setSearch]=useState(''); const [dateFilter,setDateFilter]=useState('')
  const [sheetUrl,setSheetUrl]=useState(''); const [urlDraft,setUrlDraft]=useState(''); const [saved,setSaved]=useState(false)
  const [people,setPeople]=useState([]); const [events,setEvents]=useState([]); const [loading,setLoading]=useState(true); const [openId,setOpenId]=useState(null)
  const scope=all?'ALL':profile.department
  async function load(){
    const {data:intg}=await supabase.from('integrations').select('*').eq('scope',scope).maybeSingle(); setSheetUrl(intg?.sheet_webhook_url||''); setUrlDraft(u=>u||intg?.sheet_webhook_url||'')
    const profiles=await fetchActive()
    const {data:tasks}=await supabase.from('tasks').select('assigned_to,title,assigned_date,completed_at,status')
    const {data:scheds}=await supabase.from('schedules').select('id,title,start_at,end_at,status,sorted_at,schedule_members(member_id,duties)').eq('department','Media').order('start_at',{ascending:false})
    const nameOf=id=>(profiles||[]).find(p=>p.id===id)?.full_name||''
    const hrsOf=s=>Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000)
    const list=(profiles||[]).filter(p=>ROLE_META[p.role]&&p.role!=='admin'&&(!fixedGroup||groupOf(p.role)===fixedGroup)&&(!fixedGroup||isStaff(p.role))).map(p=>{
      const mineE=(scheds||[]).filter(s=>(s.schedule_members||[]).some(m=>m.member_id===p.id))
      const mineT=(tasks||[]).filter(t=>t.assigned_to===p.id)
      const rows=[
        ...mineE.map(s=>{ const d=(s.schedule_members.find(m=>m.member_id===p.id)?.duties||[]); return {iso:localISO(s.start_at),Date:fmtDay(s.start_at),Event:s.title,Duty:d.join('/'),Range:`${fmtTime(s.start_at)} → ${fmtTime(s.end_at)}`,Value:`${hrsOf(s).toFixed(1)} h`} }),
        ...mineT.map(t=>({iso:t.assigned_date||'',Date:fmtDay(t.assigned_date),Event:t.title,Duty:'',Range:`${fmtDay(t.assigned_date,false)} → ${t.completed_at?fmtDay(t.completed_at,false):'not done yet'}`,Value:t.status.replace('_',' ')}))
      ].sort((a,b)=>String(a.iso).localeCompare(String(b.iso)))
      return { id:p.id, Name:p.full_name, Position:p.position||roleLabel(p), Section:groupOf(p.role), Hours:mineE.reduce((a,s)=>a+hrsOf(s),0), Events:mineE.length, TasksDone:mineT.filter(t=>t.status==='completed').length, Tasks:mineT.length, rows }
    }).sort((a,b)=>a.Name.localeCompare(b.Name))
    setPeople(list)
    setEvents((scheds||[]).map(s=>({id:s.id,iso:localISO(s.start_at),Date:fmtDay(s.start_at),Event:s.title,Medias:(s.schedule_members||[]).map(m=>`${nameOf(m.member_id)}${(m.duties||[]).length?` (${m.duties.join('/')})`:''}`).filter(Boolean).join(', '),Hours:hrsOf(s).toFixed(1)})))
    setLoading(false)
  }
  useEffect(()=>{ load() },[profile.id]); usePoll(load,60000)
  async function saveLink(){ const {error}=await supabase.from('integrations').upsert({scope,sheet_webhook_url:urlDraft,updated_by:profile.id,updated_at:new Date().toISOString()},{onConflict:'scope'}); if(error) notifyDialog(error.message); else { setSheetUrl(urlDraft); setSaved(true); setTimeout(()=>setSaved(false),2000) } }
  const q=search.trim().toLowerCase()
  const shownPeople=people.filter(p=>(!group||p.Section===group)&&(!q||`${p.Name} ${p.Position}`.toLowerCase().includes(q))&&(!dateFilter||p.rows.some(r=>r.iso===dateFilter)))
  const shownEvents=events.filter(e=>(!dateFilter||e.iso===dateFilter)&&(!q||`${e.Event} ${e.Medias}`.toLowerCase().includes(q)))
  const summaryCSV=shownPeople.map(p=>({Name:p.Name,Position:p.Position,Section:p.Section,'Total Hours':p.Hours.toFixed(1),Events:p.Events,'Tasks Done':p.TasksDone,Tasks:p.Tasks}))
  const detailCSV=shownPeople.flatMap(p=>p.rows.filter(r=>!dateFilter||r.iso===dateFilter).map(r=>({Date:r.Date,'Event / Task':r.Event,Name:p.Name,Position:p.Position+(r.Duty?` (${r.Duty})`:''),'From → To':r.Range,'Hours / Status':r.Value})))
  const eventsCSV=shownEvents.map(e=>({'Event Date':e.Date,'Event Name':e.Event,Medias:e.Medias,Hours:e.Hours}))
  return <div>
    <section className="page-head"><div><div className="eyebrow">BACKUP</div><h1>{all?'Main spreadsheet backup':`${profile.department} backup`}</h1><p>Everyone is listed by name — tap a name to see all of their events and tasks.</p></div></section>
    <div className="panel task-panel" style={{marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',gap:14,flexWrap:'wrap'}}>
      <div><h2 style={{margin:0,fontFamily:'"Playfair Display"',fontSize:19}}>Google Sheet</h2><p style={{margin:'4px 0 0',fontSize:12,color:'var(--text-dim)'}}>The sheet pulls live data by itself (see the README, section 5) — this page only keeps the link.</p></div>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        {canSetLink && <input className="filter-select" style={{width:220}} placeholder="Paste the sheet's share URL" value={urlDraft} onChange={e=>setUrlDraft(e.target.value)}/>}
        {canSetLink && <button className="secondary-btn" onClick={saveLink}>{saved?'Saved ✓':'Save link'}</button>}
        {sheetUrl && <a className="primary-btn" href={sheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Check Google Sheet</a>}
      </div>
    </div>
    <FilterBar search={search} onSearch={setSearch} date={dateFilter} onDate={setDateFilter} placeholder="Name, event or media…" extraActive={!!group} onClear={()=>setGroup('')}>
      {all && <label>Section<Select className="filter-select" value={group} onChange={e=>setGroup(e.target.value)}><option value="">All</option><option>EDBO</option><option>Media</option><option>Colorist</option></Select></label>}
    </FilterBar>
    <div className="panel table-panel" style={{marginBottom:14}}>
      <div className="panel-title" style={{padding:'21px 21px 12px'}}><h2>People</h2><div style={{display:'flex',alignItems:'center',gap:12,flexWrap:'wrap'}}><span style={{fontSize:11,color:'var(--text-dim)'}}>{shownPeople.length} people</span><button className="text-btn" onClick={()=>downloadCSV('backup-summary.csv',summaryCSV)}><Download size={13}/> Summary CSV</button><button className="text-btn" onClick={()=>downloadCSV('backup-detail.csv',detailCSV)}><Download size={13}/> Detail CSV</button></div></div>
      {loading ? <div className="empty">Loading…</div> : shownPeople.map(p=>{ const open=openId===p.id; const rows=p.rows.filter(r=>!dateFilter||r.iso===dateFilter)
        return <div key={p.id} className={`person-acc ${open?'open':''}`}>
          <button type="button" className="person-head" onClick={()=>setOpenId(open?null:p.id)}>
            <ChevronRight size={16} className="person-chev"/><strong>{p.Name}</strong>
            <span className="person-meta">{p.Position} • {p.Section}</span>
            <span className="person-total">{p.Hours>0 && <>{p.Hours.toFixed(1)} <small>hrs</small></>}{p.Hours>0&&p.Tasks>0 && <small> · </small>}{p.Tasks>0 && <>{p.TasksDone} <small>tasks done</small></>}{!p.Hours&&!p.Tasks && <small>nothing yet</small>}</span>
          </button>
          {open && <div className="person-body">
            {rows.length?<div className="person-rows">{rows.map((d,i)=><div className="person-row" key={i}><b>{d.Date}</b><span>{d.Event}{d.Duty && <em className="duty-tag">{d.Duty}</em>}</span><span>{d.Range}</span><span>{d.Value}</span></div>)}</div>:<div className="empty" style={{padding:'14px 0'}}>Nothing logged yet.</div>}
          </div>}
        </div> })}
      {!loading && !shownPeople.length && <div className="empty">No one found.</div>}
    </div>
    {showEvents && <div className="panel table-panel">
      <div className="panel-title" style={{padding:'21px 21px 12px'}}><h2>Events</h2><div style={{display:'flex',alignItems:'center',gap:12}}><span style={{fontSize:11,color:'var(--text-dim)'}}>{shownEvents.length} events</span><button className="text-btn" onClick={()=>downloadCSV('backup-events.csv',eventsCSV)}><Download size={13}/> Events CSV</button></div></div>
      <div className="table-head trk-bk"><span>Event date</span><span>Event name</span><span>Medias</span><span>Hours</span></div>
      {shownEvents.map(e=><div className="table-row trk-bk" key={e.id}><span data-label="Event date">{e.Date}</span><strong className="row-title">{e.Event}</strong><span data-label="Medias">{e.Medias||'—'}</span><span data-label="Hours">{e.Hours} h</span></div>)}
      {!loading && !shownEvents.length && <div className="empty">No events found.</div>}
    </div>}
  </div>
}
