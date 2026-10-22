import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  LayoutDashboard, CheckSquare, CalendarDays, Clock3, Users, Link2, LogOut, Search, Plus, X,
  Camera, PenLine, CheckCircle2, AlertCircle, Sparkles, ExternalLink, ChevronRight,
  ChevronLeft, ClipboardCheck, Database, Sun, Moon, Bell, Eye, EyeOff, Settings as SettingsIcon,
  Download, Wand2, KeyRound, FolderKanban, Megaphone, Trash2, BellOff, Pencil, History
} from 'lucide-react'

/* ---------------- Config ---------------- */
const ROLE_META = {
  admin:          { label:'Admin',              dept:null,           mode:'admin', head:false },
  eic:            { label:'EDBO',               dept:null,           mode:'admin', head:false },
  art_director:   { label:'Art Director',       dept:'Art Director', mode:'tasks', head:false },
  head_media:     { label:'Head Media',         dept:'Media',        mode:'hours', head:true  },
  staff_media:    { label:'Media',              dept:'Media',        mode:'hours', head:false },
  head_colorist:  { label:'TD (Head Colorist)', dept:'Colorist',     mode:'tasks', head:true  },
  staff_colorist: { label:'Colorist',           dept:'Colorist',     mode:'tasks', head:false },
}
const DEPARTMENTS = ['Media','Colorist','Art Director']
const DEPT_MODE = { Media:'hours', Colorist:'tasks', 'Art Director':'tasks' }
const DEPT_ICON = { Media:Camera, Colorist:Wand2, 'Art Director':LayoutDashboard }
const DEPT_HEAD_ROLE = { Media:'head_media', Colorist:'head_colorist', 'Art Director':'art_director' }
const DEPT_STAFF_ROLE = { Media:'staff_media', Colorist:'staff_colorist', 'Art Director':'art_director' }
const LOGO = `${import.meta.env.BASE_URL}logo.png`
const EDITION = 'Nexemeral 27'
const WELCOME_LINE = 'Keep every story, page, photograph and fact moving toward the finished yearbook.'
const IDLE_LIMIT_MS = 3*60*1000
// Pipeline: Media event sorted -> TD assigns colorgrading (self / Colorist / EDBO) -> all colorgraded -> Art Director makes the Facebook cover -> posted.
const TD_STAGE = { dept:'Colorist', verb:'colorgrading', titlePrefix:'Colorgrade' }
const TASK_ASSIGNEE_DEPTS = ['Colorist','Art Director']

/* ---------------- Helpers ---------------- */
function isHead(role){ return !!ROLE_META[role]?.head }
function isStaff(role){ return !!role && role.startsWith('staff_') }
function isAdminLike(role){ return role==='admin' || role==='eic' }
function isWorker(role){ return isStaff(role) || role==='art_director' } // sees only their own assigned work
function roleDept(role){ return ROLE_META[role]?.dept || null }
function roleMode(role){ return ROLE_META[role]?.mode || 'admin' }
function isTD(role){ return role==='head_colorist' }
function canCreateTask(role){ return isAdminLike(role) || isTD(role) }
function canCreateSchedule(role){ return isAdminLike(role) || role==='head_media' }
function canManageAccounts(role){ return role==='admin' }
// Which task departments a role can see / manage as a whole (workers only ever see their own).
function managedTaskDepts(role){ if(isAdminLike(role)) return DEPARTMENTS.filter(d=>DEPT_MODE[d]==='tasks'); if(isTD(role)) return TASK_ASSIGNEE_DEPTS; return [] }
function hasPostingTracker(role){ return isAdminLike(role) || ['head_media','head_colorist','art_director'].includes(role) }
function initials(name=''){ return name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() }
function greet(){ const h=new Date().getHours(); return h<12?'Good morning':h<18?'Good afternoon':'Good evening' }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate() }
function fmtTime(iso){ return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }
function roleRank(role){ if(role==='admin') return 0; if(role==='eic') return 1; if(role==='art_director') return 2; if(isHead(role)) return 3; return 4 }
function fmtDay(d,withYear=true){ if(!d) return '—'; const x=d instanceof Date?d:new Date(d.length===10?d+'T00:00:00':d); if(isNaN(x)) return '—'; return x.toLocaleDateString([], withYear?{weekday:'short',month:'short',day:'numeric',year:'numeric'}:{weekday:'short',month:'short',day:'numeric'}) }
function todayISO(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }
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

  async function loadProfile(id){ const {data,error}=await supabase.from('profiles').select('*').eq('id',id).single(); if(error) console.error(error); setProfile(data||null) }

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
  const adminLike=isAdminLike(role)

  const nav=useMemo(()=>{
    const base=[['Dashboard',LayoutDashboard],['Calendar',CalendarDays],['Notifications',Bell]]
    if(adminLike){ base.push(['Tracker',FolderKanban],['Members',Users],['Resources',Link2],['Announcements',Megaphone]); if(role==='admin') base.push(['Settings',SettingsIcon]); base.push(['Backup',Database]) }
    else if(role==='art_director'){ base.push(['Tracker',FolderKanban],['Resources',Link2]) }
    else if(mode==='tasks'){ base.push(['Tracker',FolderKanban]); if(isHead(role)) base.push(['Members',Users]); base.push(['Resources',Link2]); if(isHead(role)) base.push(['Backup',Database]) }
    else if(mode==='hours'){ base.push(['Tracker',FolderKanban]); if(isHead(role)) base.push(['Members',Users],['Backup',Database]) }
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
          <div className="sb-text"><strong>{profile.full_name}</strong><span>{ROLE_META[role]?.label || role}</span></div>
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
          <div><strong>{profile.full_name}</strong><span>{ROLE_META[role]?.label || role}</span></div>
          <button className="icon-btn" onClick={logout} title="Log out"><LogOut size={16}/></button>
        </div>
        <div className="crumb"><span>Silang Memoirs</span><ChevronRight size={14}/><strong>{deptFocus?deptFocus:page}</strong></div>
        <div className="top-actions">
          <ThemeToggle theme={theme} onToggle={toggleTheme}/>
          <NotificationBell profile={profile}/>
        </div>
      </header>
      <div className="content page-enter" key={page+String(deptFocus)}>
        {page==='Dashboard' && adminLike && <AdminDashboard profile={profile}/>}
        {page==='Dashboard' && !adminLike && mode==='hours' && <HoursDashboard profile={profile}/>}
        {page==='Dashboard' && !adminLike && mode==='tasks' && <TasksDashboard profile={profile}/>}

        {page==='Calendar' && <CalendarPage profile={profile}/>}
        {page==='Notifications' && <NotificationsPage profile={profile}/>}
        {page==='Tracker' && (mode==='tasks'||adminLike) && <TaskTracker profile={profile}/>}
        {page==='Tracker' && mode==='hours' && !adminLike && <Tracker profile={profile}/>}
        {page==='Members' && <Members profile={profile} deptFocus={deptFocus} onClearFocus={()=>setDeptFocus(null)}/>}
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
    <div><div className="eyebrow"><Sparkles size={14}/> {roleDept(profile.role)?roleDept(profile.role).toUpperCase()+' DESK':'COMMAND CENTER'}</div>
    <h1>{greet()}, {profile.full_name.split(' ')[0]}.</h1><p>{WELCOME_LINE}</p></div>
    {onCreate && <button className="primary-btn" onClick={onCreate}><Plus size={17}/> {createLabel}</button>}
  </section>
}

// Tasks assigned to me (shown on Admin / EDBO dashboards, since they sometimes colorgrade or do cover work too).
function MyTasksPanel({profile}){
  const [rows,setRows]=useState([])
  async function load(){ const {data}=await supabase.from('tasks').select('*').eq('assigned_to',profile.id).neq('status','completed').order('created_at',{ascending:false}); setRows(data||[]) }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  async function done(id){ await supabase.from('tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id); load() }
  if(!rows.length) return null
  return <div className="panel task-panel" style={{marginBottom:14}}>
    <div className="panel-title"><h2>My tasks</h2></div>
    <div className="task-list">{rows.map(t=><div className="task-row" key={t.id}><div className="task-icon layout"><CheckSquare size={16}/></div>
      <div className="task-info"><strong>{t.title}</strong><span>{t.department} • Assigned {fmtDay(t.assigned_date)}</span></div>
      <button className="small-btn" onClick={()=>done(t.id)}>{t.department==='Colorist'?'Colorgraded':'Done'}</button></div>)}</div>
  </div>
}

function AdminDashboard({profile}){
  const [metrics,setMetrics]=useState({})
  const [counts,setCounts]=useState({})
  const [detail,setDetail]=useState(null)
  useEffect(()=>{ load() },[]); usePoll(load)
  async function load(){
    const {data:profiles}=await supabase.from('profiles').select('id,department,role').eq('active',true)
    const cnt={}; DEPARTMENTS.forEach(d=>cnt[d]=(profiles||[]).filter(p=>ROLE_META[p.role]?.dept===d).length); setCounts(cnt)
    const {data:tasks}=await supabase.from('tasks').select('department,status')
    const {data:schedules}=await supabase.from('schedules').select('department,start_at,end_at,status')
    const m={}
    DEPARTMENTS.forEach(d=>{
      if(DEPT_MODE[d]==='hours'){ const hrs=(schedules||[]).filter(s=>s.department===d).reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0); m[d]={value:hrs.toFixed(1),label:'hrs logged'} }
      else { const done=(tasks||[]).filter(t=>t.department===d && t.status==='completed').length; m[d]={value:done,label:'tasks done'} }
    })
    setMetrics(m)
  }
  async function openDetail(d){
    let stats={upcoming:0,ongoing:0,done:0,totalHours:0,totalTasks:0}
    if(DEPT_MODE[d]==='hours'){
      const {data}=await supabase.from('schedules').select('start_at,end_at,status').eq('department',d)
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
    <div className="dept-grid">{DEPARTMENTS.map(d=>{ const Icon=DEPT_ICON[d]; return <div key={d} className="panel dept-card" onClick={()=>openDetail(d)}>
      <div className="dept-icon"><Icon size={20}/></div><h3>{d}</h3><p>{counts[d]||0} members</p>
      <div className="dept-metric">{metrics[d]?.value ?? '—'}<small>{metrics[d]?.label}</small></div>
    </div> })}</div>
    {detail && <Modal title={detail.dept} onClose={()=>setDetail(null)}>
      <div className="stats-grid" style={{gridTemplateColumns:'1fr 1fr'}}>
        {DEPT_MODE[detail.dept]==='hours' ? <>
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
    <MyTasksPanel profile={profile}/>
    <PostingTracker profile={profile}/>
  </div>
}

/* ---------------- Posting Tracker: status of every Media event, from shoot to Facebook post ---------------- */
function PostingTracker({profile}){
  const [rows,setRows]=useState([]); const [loading,setLoading]=useState(true)
  const canPost=isAdminLike(profile.role)||profile.role==='art_director'
  async function load(){
    const {data:events}=await supabase.from('schedules').select('id,title,start_at,status,posted_at,sorted_at,schedule_members(sorted)').eq('department','Media').order('start_at',{ascending:false}).limit(40)
    const {data:tasks}=await supabase.from('tasks').select('schedule_id,department,status').not('schedule_id','is',null)
    const statusFor=(eventId,dept)=>{
      const ts=(tasks||[]).filter(x=>x.schedule_id===eventId && x.department===dept)
      if(!ts.length) return 'not started'
      if(ts.every(t=>t.status==='completed')) return 'completed'
      return 'in progress'
    }
    setRows((events||[]).map(e=>{
      const mem=e.schedule_members||[]; const done=mem.filter(m=>m.sorted).length
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
  async function markPosted(id){ const {error}=await supabase.rpc('mark_event_posted',{sid:id}); if(error) notifyDialog(error.message); load() }
  const cls=v=>v==='completed'?'completed':v==='in progress'?'in_progress':'scheduled'
  return <div className="panel table-panel" style={{marginTop:14}}>
    <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>Posting Tracker</h2></div>
    <div style={{overflowX:'auto'}}>
      <div className="table-head posting-row"><span>Event Date</span><span>Event Name</span><span>Post By</span><span>Sorted</span><span>Colorgrade</span><span>FB Cover</span><span>Posted</span><span>Posted On</span></div>
      {loading ? <div className="empty">Loading…</div> : rows.map(r=><div className="table-row posting-row" key={r.id}>
        <span>{fmtDay(r.date)}</span><strong>{r.title}</strong><span>{fmtDay(r.supposedPost)}</span>
        <span className={`status ${r.isSorted?'completed':r.partial?'in_progress':'scheduled'}`}>{r.sorted}</span>
        <span className={`status ${cls(r.colorgrade)}`}>{r.colorgrade}</span>
        <span className={`status ${cls(r.cover)}`}>{r.cover}</span>
        <span>{r.posted ? <span className="status completed">posted</span> : (canPost && (r.cover==='completed'||isAdminLike(profile.role)) ? <button className="small-btn" onClick={()=>markPosted(r.id)}>Mark posted</button> : <span className="status scheduled">not posted</span>)}</span>
        <span>{r.postedOn?fmtDay(r.postedOn):'—'}</span>
      </div>)}
      {!loading && !rows.length && <div className="empty">No media events yet.</div>}
    </div>
  </div>
}

function sortProgress(s){ const m=s.schedule_members||[]; if(!m.length) return ''; return ` • ${m.filter(x=>x.sorted).length}/${m.length} sorted` }

function HoursDashboard({profile}){
  const staff=isStaff(profile.role)
  const [stats,setStats]=useState({upcoming:0,completed:0,total:0,hours:0,members:0})
  const [items,setItems]=useState([])
  const [toSort,setToSort]=useState([])
  async function load(){
    const {data}=await supabase.from('schedules').select('*,schedule_members(member_id,sorted,profiles(full_name))').eq('department',profile.department).order('start_at',{ascending:true})
    let rows=data||[]
    if(staff) rows=rows.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
    const now=new Date()
    const upcoming=rows.filter(s=>new Date(s.start_at)>=now)
    const completed=rows.filter(s=>s.status==='completed'||s.status==='done')
    const hours=rows.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0)
    let members=0
    if(!staff){ const {data:p}=await supabase.from('profiles').select('id').eq('department',profile.department).eq('active',true); members=(p||[]).length }
    setStats({upcoming:upcoming.length,completed:completed.length,total:rows.length,hours,members})
    setItems(upcoming.slice(0,6))
    // Anyone assigned to an event (head included) marks only their OWN part sorted.
    setToSort(rows.filter(s=>{ const my=(s.schedule_members||[]).find(m=>m.member_id===profile.id); return my && !my.sorted && new Date(s.start_at)<=now }))
  }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  async function markSorted(scheduleId){ const {error}=await supabase.from('schedule_members').update({sorted:true}).eq('schedule_id',scheduleId).eq('member_id',profile.id); if(error) notifyDialog(error.message); load() }
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
        <Stat title="Members" value={stats.members} note="In department" icon={Users}/>
      </>}
    </section>
    {toSort.length>0 && <div className="panel task-panel" style={{marginBottom:14}}>
      <div className="panel-title"><h2>To sort</h2></div>
      <div className="task-list">{toSort.map(s=><div className="task-row" key={s.id}><div className="task-icon media"><CalendarDays size={16}/></div>
        <div className="task-info"><strong>{s.title}</strong><span>{fmtDay(s.start_at)}{sortProgress(s)}</span></div>
        <button className="small-btn" onClick={()=>markSorted(s.id)}>Sorted</button></div>)}</div>
    </div>}
    {next && <div className="panel task-panel" style={{marginBottom:14}}>
      <div className="panel-title"><h2>Next up</h2></div>
      <strong style={{fontSize:16,display:'block',marginBottom:6}}>{next.title}</strong>
      <p style={{margin:'0 0 4px',color:'var(--text-dim)',fontSize:12}}>{new Date(next.start_at).toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})} • {fmtTime(next.start_at)}–{fmtTime(next.end_at)} ({Math.max(0,(new Date(next.end_at)-new Date(next.start_at))/3600000).toFixed(1)}h)</p>
      <p style={{margin:'0 0 4px',color:'var(--text-dim)',fontSize:12}}>Where: {next.location||'No location set'}</p>
      {next.description && <p style={{margin:'0 0 8px',color:'var(--text-dim)',fontSize:12}}>{next.description}</p>}
      <div className="member-chips" style={{justifyContent:'flex-start'}}>{(next.schedule_members||[]).map(m=><span key={m.member_id}>{m.profiles?.full_name}{m.sorted?' ✓':''}</span>)}</div>
    </div>}
    <div className="panel task-panel">
      <div className="panel-title"><h2>{staff?'My schedule & assigned events':'Upcoming events'}</h2></div>
      <div className="task-list">{items.map(s=><div className="task-row" key={s.id}><div className="task-icon media"><CalendarDays size={16}/></div>
        <div className="task-info"><strong>{s.title}</strong><span>{fmtDay(s.start_at,false)} • {fmtTime(s.start_at)} • {s.location||'No location'}{sortProgress(s)}</span></div>
        <span className={`status ${s.status}`}>{s.status==='completed'?'sorted':s.status}</span></div>)}
        {!items.length && <div className="empty">Nothing scheduled yet.</div>}</div>
    </div>
    {!staff && <PostingTracker profile={profile}/>}
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
    let members=0; if(!worker){ const {data:p}=await supabase.from('profiles').select('id').eq('department',profile.department).eq('active',true); members=(p||[]).length }
    setStats({ open:list.filter(t=>t.status!=='completed').length, done:list.filter(t=>t.status==='completed').length, total:list.length, members })
    setRows(list.slice(0,8))
    setUndone(list.filter(t=>t.status!=='completed'))
    if(td){
      const {data:done}=await supabase.from('schedules').select('id,title,start_at,end_at,sorted_at').eq('department','Media').eq('status','completed').order('start_at',{ascending:false})
      const {data:ownTasks}=await supabase.from('tasks').select('schedule_id').eq('department','Colorist').not('schedule_id','is',null)
      const assignedIds=new Set((ownTasks||[]).map(t=>t.schedule_id))
      setAvail((done||[]).filter(e=>!assignedIds.has(e.id)))
      const {data:tm}=await supabase.from('profiles').select('id,full_name,role').in('role',['staff_colorist','eic']).eq('active',true).order('full_name')
      setTeammates(tm||[])
    }
  }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  async function markDone(id){ const {error}=await supabase.from('tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id); if(error) notifyDialog(error.message); load() }
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
      {!worker && <Stat title="Members" value={stats.members} note="In department" icon={Users}/>}
      <Stat title="Total Tasks" value={stats.total} note="All time" icon={ClipboardCheck}/>
    </section>
    {td && <div className="panel" style={{marginBottom:14}}>
      <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>Ready for {TD_STAGE.verb}</h2></div>
      {!avail.length && <div className="empty" style={{padding:'0 21px 21px'}}>No sorted events waiting.</div>}
      {avail.map(e=>{ const picked=[...(picks[e.id]||[])]; return <div style={{padding:'16px 21px',borderTop:'1px solid var(--border)'}} key={e.id}>
        <div style={{marginBottom:10}}><strong style={{display:'block',fontSize:13}}>{e.title}</strong><span style={{fontSize:11,color:'var(--text-dim)'}}>{fmtDay(e.start_at)}{e.sorted_at?` • sorted ${fmtDay(e.sorted_at,false)}`:''}</span></div>
        <div className="assign-row">
          <button className="small-btn" onClick={()=>assignStage(e.id,e.title,[profile.id])}>Assign to myself</button>
          <div className="token-row" style={{flex:1}}>{teammates.map(m=><button type="button" key={m.id} className={`token ${picked.includes(m.id)?'active':''}`} onClick={()=>setPickList(e.id, picked.includes(m.id)?picked.filter(x=>x!==m.id):[...picked,m.id])}>{m.full_name}{m.role==='eic'?' · EDBO':''}</button>)}
            {!teammates.length && <span style={{fontSize:11,color:'var(--text-dim)'}}>No colorists yet.</span>}</div>
          {picked.length>0 && <button className="small-btn" onClick={()=>assignStage(e.id,e.title,picked)}>Assign selected ({picked.length})</button>}
        </div>
      </div> })}
    </div>}
    <div className="panel task-panel">
      <div className="panel-title"><h2>{worker?'My tasks':'Recent tasks'}</h2></div>
      <div className="task-list">{list.map(t=>{ const mine=t.status!=='completed' && t.assigned_to===profile.id; return <div className="task-row" key={t.id}><div className="task-icon layout"><CheckSquare size={16}/></div>
        <div className="task-info"><strong>{t.title}</strong><span>{worker?'':`${t.profiles?.full_name||'Unassigned'} • `}Assigned {fmtDay(t.assigned_date,false)}{t.status==='completed'&&t.completed_at?` • Done ${fmtDay(t.completed_at,false)}`:''}</span></div>
        {mine ? <button className="small-btn" onClick={()=>markDone(t.id)}>{t.department==='Colorist'?'Colorgraded':'Done'}</button> : <span className={`status ${t.status}`}>{t.status.replace('_',' ')}</span>}</div> })}
        {list.length===0 && <div className="empty">Nothing here yet.</div>}</div>
    </div>
    {hasPostingTracker(role) && <PostingTracker profile={profile}/>}
    {openTask && <TaskModal profile={profile} onClose={()=>setOpenTask(false)} onSaved={load}/>}
  </div>
}

/* ---------------- Task Tracker: finished work. Shows assigned date + done date (no due dates). ---------------- */
function TaskTracker({profile}){
  const role=profile.role; const privileged=isAdminLike(role); const worker=isWorker(role)
  const can=isAdminLike(role)||isTD(role)
  const [tasks,setTasks]=useState([]); const [events,setEvents]=useState([]); const [loading,setLoading]=useState(true)
  const [deptFilter,setDeptFilter]=useState(''); const [dateFilter,setDateFilter]=useState('')
  const [editTask,setEditTask]=useState(null); const [editEvent,setEditEvent]=useState(null)
  async function load(){
    let tq=supabase.from('tasks').select('*,profiles!tasks_assigned_to_fkey(full_name,department)').eq('status','completed').order('completed_at',{ascending:false})
    if(worker) tq=tq.eq('assigned_to',profile.id); else if(!privileged) tq=tq.in('department',managedTaskDepts(role))
    const {data}=await tq; setTasks(data||[])
    if(privileged){ const {data:ev}=await supabase.from('schedules').select('*,schedule_members(member_id,sorted,sorted_at,profiles(full_name))').eq('department','Media').in('status',['completed','done']).order('start_at',{ascending:false}); setEvents(ev||[]) }
    setLoading(false)
  }
  useEffect(()=>{ setLoading(true); load() },[profile.id]); usePoll(load)
  async function del(id){ if(!await confirmDialog({title:'Delete task?',body:'This removes the task for everyone. This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; await supabase.from('tasks').delete().eq('id',id); load() }
  async function delEvent(id){ if(!await confirmDialog({title:'Delete event?',body:'This removes the event for everyone. This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; await supabase.from('schedules').delete().eq('id',id); load() }
  const filteredTasks=tasks.filter(t=>(!deptFilter||t.department===deptFilter)&&(!dateFilter||t.assigned_date===dateFilter||(t.completed_at&&localISO(t.completed_at)===dateFilter)))
  const filteredEvents=events.filter(e=>(!deptFilter||deptFilter==='Media')&&(!dateFilter||localISO(e.start_at)===dateFilter||(e.sorted_at&&localISO(e.sorted_at)===dateFilter)))
  return <div>
    <section className="page-head"><div><div className="eyebrow">COMPLETED WORK</div><h1>Tracker</h1><p>Everything finished, with who did it and when.</p></div></section>
    {privileged && <div className="panel task-panel filter-bar">
      <label>Department<select className="filter-select" value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}><option value="">All departments</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Date<DateField className="filter-date" value={dateFilter} onChange={setDateFilter}/></label>
      {(deptFilter||dateFilter) && <button className="text-btn" onClick={()=>{ setDeptFilter(''); setDateFilter('') }}>Clear filters</button>}
    </div>}
    {privileged && <>
      <div className="eyebrow" style={{margin:'6px 0 8px'}}>EVENTS — MEDIA</div>
      <div className="panel table-panel" style={{marginBottom:20,overflowX:'auto'}}>
        <div className="table-head trk-events"><span>Event</span><span>Event date</span><span>Photographers</span><span>Sorted on</span><span>Status</span><span>Action</span></div>
        {loading ? <div className="empty">Loading…</div> : filteredEvents.map(e=><div className="table-row trk-events" key={e.id}>
          <strong>{e.title}</strong><span>{fmtDay(e.start_at)}</span>
          <span>{(e.schedule_members||[]).map(m=>m.profiles?.full_name).filter(Boolean).join(', ')||'—'}</span>
          <span>{e.sorted_at?fmtDay(e.sorted_at):'—'}</span>
          <span className={`status ${e.status}`}>{e.status==='completed'?'sorted':e.status}</span>
          <span style={{display:'flex',gap:4}}><button className="icon-btn" title="Edit" onClick={()=>setEditEvent(e)}><Pencil size={14}/></button><button className="icon-btn" title="Delete" onClick={()=>delEvent(e.id)}><Trash2 size={14}/></button></span>
        </div>)}
        {!loading && !filteredEvents.length && <div className="empty">No sorted events yet.</div>}
      </div>
    </>}
    <div className="eyebrow" style={{margin:'6px 0 8px'}}>TASKS — {privileged?'ALL DEPARTMENTS':profile.department.toUpperCase()}</div>
    <div className="panel table-panel" style={{overflowX:'auto'}}>
      <div className={`table-head trk-tasks ${can?'':'no-action'}`}><span>Task</span><span>Department</span><span>Assignee</span><span>Assigned</span><span>Done</span>{can && <span>Action</span>}</div>
      {loading ? <div className="empty">Loading…</div> : filteredTasks.map(t=><div className={`table-row trk-tasks ${can?'':'no-action'}`} key={t.id}>
        <strong>{t.title}</strong><span>{t.department}</span><span>{t.profiles?.full_name||'Unassigned'}</span><span>{fmtDay(t.assigned_date)}</span><span>{t.completed_at?fmtDay(t.completed_at):'—'}</span>
        {can && <span style={{display:'flex',gap:4}}><button className="icon-btn" title="Edit" onClick={()=>setEditTask(t)}><Pencil size={14}/></button><button className="icon-btn" title="Delete" onClick={()=>del(t.id)}><Trash2 size={14}/></button></span>}
      </div>)}
      {!loading && !filteredTasks.length && <div className="empty">Nothing completed yet.</div>}
    </div>
    {editTask && <EditTaskModal task={editTask} onClose={()=>setEditTask(null)} onSaved={load}/>}
    {editEvent && <EditScheduleModal schedule={editEvent} onClose={()=>setEditEvent(null)} onSaved={load}/>}
  </div>
}
function localISO(v){ const d=new Date(v); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` }

// Who can be given a task, per department. EDBO sometimes colorgrades / does cover work too.
const ASSIGNEE_ROLES=['staff_colorist','head_colorist','art_director','eic']
function taskAssigneeGroups(members,dept){
  if(dept==='Art Director') return [{label:'ART DIRECTOR',people:members.filter(m=>m.role==='art_director')},{label:'EDBO',people:members.filter(m=>m.role==='eic')}]
  return [{label:'COLORIST',people:members.filter(m=>m.role==='staff_colorist')},{label:'TD',people:members.filter(m=>m.role==='head_colorist')},{label:'EDBO',people:members.filter(m=>m.role==='eic')}]
}
function useAssignees(){
  const [members,setMembers]=useState([])
  useEffect(()=>{ (async()=>{ const {data}=await supabase.from('profiles').select('id,full_name,department,role').in('role',ASSIGNEE_ROLES).eq('active',true).order('full_name'); setMembers(data||[]) })() },[])
  return members
}

function TaskModal({profile,onClose,onSaved}){
  const depts=managedTaskDepts(profile.role)
  const [form,setForm]=useState({title:'',description:'',assignedIds:[],assigned_date:todayISO(),department:depts[0]||'Colorist'})
  const members=useAssignees(); const [busy,setBusy]=useState(false)
  async function save(e){ e.preventDefault(); setBusy(true)
    const {error}=await supabase.from('tasks').insert({ title:form.title, description:form.description||null, department:form.department, assigned_to:form.assignedIds[0]||null, assigned_date:form.assigned_date||todayISO(), created_by:profile.id })
    setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() }
  }
  return <Modal title="Create task" onClose={onClose}><form onSubmit={save}>
    <label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label>For<select value={form.department} onChange={e=>setForm({...form,department:e.target.value,assignedIds:[]})}>{depts.map(d=><option key={d}>{d}</option>)}</select></label>
    <label>Assign to</label>
    <PersonPicker groups={taskAssigneeGroups(members,form.department)} value={form.assignedIds} multi={false} onChange={ids=>setForm({...form,assignedIds:ids})}/>
    <label>Assigned date<DateField required value={form.assigned_date} onChange={v=>setForm({...form,assigned_date:v})}/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Create task'}</button></div>
  </form></Modal>
}

function EditTaskModal({task,onClose,onSaved}){
  const [form,setForm]=useState({title:task.title,description:task.description||'',assignedIds:task.assigned_to?[task.assigned_to]:[],assigned_date:task.assigned_date||todayISO()})
  const members=useAssignees(); const [busy,setBusy]=useState(false)
  async function save(e){ e.preventDefault(); setBusy(true)
    const {error}=await supabase.from('tasks').update({ title:form.title, description:form.description||null, assigned_to:form.assignedIds[0]||null, assigned_date:form.assigned_date||null }).eq('id',task.id)
    setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() }
  }
  return <Modal title="Edit task" onClose={onClose}><form onSubmit={save}>
    <label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label>Assign to</label>
    <PersonPicker groups={taskAssigneeGroups(members,task.department)} value={form.assignedIds} multi={false} onChange={ids=>setForm({...form,assignedIds:ids})}/>
    <label>Assigned date<DateField required value={form.assigned_date} onChange={v=>setForm({...form,assigned_date:v})}/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save changes'}</button></div>
  </form></Modal>
}

/* ---------------- Calendar (mode-aware, works for everyone) ---------------- */
function CalendarPage({profile}){
  const role=profile.role; const staff=isStaff(role); const worker=isWorker(role)
  const effMode = isAdminLike(role) ? 'all' : roleMode(role)
  const [month,setMonth]=useState(()=>{ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [items,setItems]=useState([]) // unified {id,title,date,type,raw}
  const [selected,setSelected]=useState(null)
  const [openSchedule,setOpenSchedule]=useState(false)
  const [openTask,setOpenTask]=useState(false)
  const [editItem,setEditItem]=useState(null)
  const gridStart=useMemo(()=>{ const d=new Date(month); d.setDate(1-d.getDay()); return d },[month])
  const gridDays=useMemo(()=>Array.from({length:42},(_,i)=>{ const d=new Date(gridStart); d.setDate(gridStart.getDate()+i); return d }),[gridStart])

  useEffect(()=>{ load() },[profile.id,month]); usePoll(()=>load())

  async function load(){
    const rangeStart=new Date(gridStart); const rangeEnd=new Date(gridStart); rangeEnd.setDate(rangeEnd.getDate()+42)
    let unified=[]
    if(effMode==='hours' || effMode==='all'){
      let sq=supabase.from('schedules').select('*,schedule_members(member_id,sorted,profiles(full_name))').gte('start_at',rangeStart.toISOString()).lt('start_at',rangeEnd.toISOString()).order('start_at')
      if(effMode==='hours') sq=sq.eq('department',profile.department)
      const {data}=await sq; let rows=data||[]
      if(staff) rows=rows.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
      unified=unified.concat(rows.map(s=>({id:'s-'+s.id,title:s.title,date:new Date(s.start_at),type:'schedule',raw:s})))
    }
    if(effMode==='tasks' || effMode==='all'){
      let tq=supabase.from('tasks').select('*,profiles!tasks_assigned_to_fkey(full_name)').not('assigned_date','is',null).gte('assigned_date',localISO(rangeStart)).lt('assigned_date',localISO(rangeEnd))
      if(effMode==='tasks'){ if(worker) tq=tq.eq('assigned_to',profile.id); else tq=tq.in('department',managedTaskDepts(role)) }
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

  async function markMySorted(scheduleId){ const {error}=await supabase.from('schedule_members').update({sorted:true}).eq('schedule_id',scheduleId).eq('member_id',profile.id); if(error) notifyDialog(error.message); load() }
  // Admin / EDBO only: sort the whole event on everyone's behalf.
  async function markAllSorted(sched){
    if(!await confirmDialog({title:'Mark whole event sorted?',body:'This marks every assigned photographer as sorted.',confirmLabel:'Mark sorted'})) return
    const n=(sched.schedule_members||[]).length
    const r= n ? await supabase.from('schedule_members').update({sorted:true}).eq('schedule_id',sched.id) : await supabase.from('schedules').update({status:'completed'}).eq('id',sched.id)
    if(r.error) notifyDialog(r.error.message); load()
  }
  async function markTaskDone(id){ await supabase.from('tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id); load() }
  async function deleteItem(item){ if(!await confirmDialog({title:'Delete this?',body:'This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; if(item.type==='task') await supabase.from('tasks').delete().eq('id',item.raw.id); else await supabase.from('schedules').delete().eq('id',item.raw.id); setSelected(null); load() }
  const canEdit=item=> item.type==='task' ? canCreateTask(role) : canCreateSchedule(role)

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
        return <div key={i} className={`day ${list.length?'has-event':''} ${inMonth?'':'muted'} ${isToday?'today':''}`} onClick={()=>pickDay(d)}>
          <b>{d.getDate()}</b>{list.slice(0,2).map(e=><span key={e.id}>{e.title}</span>)}{list.length>2 && <span className="more">+{list.length-2} more</span>}
        </div> })}</div>
    </div>
    <div className="panel task-panel" style={{marginTop:14}}>
      <div className="panel-title"><h2>Upcoming</h2></div>
      <div className="task-list">{upcoming.map(e=><div className="task-row" key={e.id} onClick={()=>pickDay(e.date)} style={{cursor:'pointer'}}>
        <div className={`task-icon ${e.type==='task'?'layout':'media'}`}>{e.type==='task'?<CheckSquare size={16}/>:<CalendarDays size={16}/>}</div>
        <div className="task-info"><strong>{e.title}</strong><span>{fmtDay(e.date,false)}{e.type!=='task'?` • ${fmtTime(e.raw.start_at)}`:''}</span></div>
        <span className={`status ${e.raw.status}`}>{e.raw.status.replace('_',' ')}</span>
      </div>)}
      {!upcoming.length && <div className="empty">Nothing upcoming.</div>}</div>
    </div>
    {selected && <Modal title={selected.date.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric',year:'numeric'})} onClose={()=>setSelected(null)}>
      {selected.items.map(e=><div key={e.id} className="day-detail-row">
        <strong>{e.title}</strong>
        {e.type==='schedule' && <><span>{e.raw.department} • {fmtTime(e.raw.start_at)} – {fmtTime(e.raw.end_at)} ({Math.max(0,(new Date(e.raw.end_at)-new Date(e.raw.start_at))/3600000).toFixed(1)}h)</span>
          <span>Where: {e.raw.location||'No location'}</span>{e.raw.description && <span>{e.raw.description}</span>}<span>Status: {e.raw.status==='completed'?'sorted':e.raw.status}{e.raw.sorted_at?` (${fmtDay(e.raw.sorted_at,false)})`:''}</span></>}
        {e.type==='task' && <><span>{e.raw.department} • Assigned to {e.raw.profiles?.full_name||'Unassigned'}</span>
          <span>Assigned {fmtDay(e.raw.assigned_date)}{e.raw.completed_at?` • Done ${fmtDay(e.raw.completed_at)}`:''}</span>{e.raw.description && <span>{e.raw.description}</span>}<span>Status: {e.raw.status.replace('_',' ')}</span></>}
        {e.type==='schedule' && e.raw.schedule_members?.length>0 && <div className="member-chips">{e.raw.schedule_members.map(m=><span key={m.member_id}>{m.profiles?.full_name}{m.sorted?' ✓ sorted':' • pending'}</span>)}</div>}
        <div style={{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}>
          {e.type==='schedule' && e.raw.status!=='completed' && (e.raw.schedule_members||[]).some(m=>m.member_id===profile.id && !m.sorted) && <button className="small-btn" onClick={()=>markMySorted(e.raw.id)}>I've sorted my part</button>}
          {e.type==='schedule' && e.raw.status!=='completed' && isAdminLike(role) && <button className="ghost-btn" onClick={()=>markAllSorted(e.raw)}>Mark all sorted</button>}
          {e.type==='task' && e.raw.status!=='completed' && (e.raw.assigned_to===profile.id || isAdminLike(role)) && <button className="small-btn" onClick={()=>markTaskDone(e.raw.id)}>{e.raw.department==='Colorist'?'Colorgraded':'Mark done'}</button>}
          {canEdit(e) && <button className="ghost-btn" onClick={()=>setEditItem(e)}><Pencil size={13}/> Edit</button>}
          {canEdit(e) && <button className="danger-btn" onClick={()=>deleteItem(e)}><Trash2 size={13}/> Delete</button>}
        </div>
      </div>)}
    </Modal>}
    {openSchedule && <ScheduleModal profile={profile} onClose={()=>setOpenSchedule(false)} onSaved={load}/>}
    {openTask && <TaskModal profile={profile} onClose={()=>setOpenTask(false)} onSaved={load}/>}
    {editItem?.type==='schedule' && <EditScheduleModal schedule={editItem.raw} onClose={()=>setEditItem(null)} onSaved={()=>{ load(); setSelected(null) }}/>}
    {editItem?.type==='task' && <EditTaskModal task={editItem.raw} onClose={()=>setEditItem(null)} onSaved={()=>{ load(); setSelected(null) }}/>}
  </div>
}

function ScheduleModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({title:'',description:'',location:'',date:todayISO(),start:'',end:'',memberIds:[]})
  const [people,setPeople]=useState([]); const [busy,setBusy]=useState(false)
  useEffect(()=>{ (async()=>{
    const {data}=await supabase.from('profiles').select('id,full_name,role').in('role',['staff_media','head_media']).eq('active',true).order('full_name')
    setPeople(data||[])
  })() },[])
  async function save(e){ e.preventDefault()
    if(form.end<=form.start){ notifyDialog('End time must be after the start time.'); return }
    setBusy(true)
    const start_at=new Date(`${form.date}T${form.start}`).toISOString(); const end_at=new Date(`${form.date}T${form.end}`).toISOString()
    const {data:sched,error}=await supabase.from('schedules').insert({ title:form.title, description:form.description||null, location:form.location||null, department:'Media', start_at, end_at, created_by:profile.id }).select().single()
    if(error){ notifyDialog(error.message); setBusy(false); return }
    if(form.memberIds.length){ await supabase.from('schedule_members').insert(form.memberIds.map(id=>({schedule_id:sched.id,member_id:id}))) }
    setBusy(false); onClose(); onSaved()
  }
  const groups=[
    {label:'MEDIA',people:people.filter(p=>p.role==='staff_media')},
    {label:'HEAD MEDIA',people:people.filter(p=>p.role==='head_media')},
  ]
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
    <PersonPicker groups={groups} value={form.memberIds} multi={true} onChange={ids=>setForm({...form,memberIds:ids})}/>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Create event'}</button></div>
  </form></Modal>
}

function EditScheduleModal({schedule,onClose,onSaved}){
  const start=new Date(schedule.start_at); const end=new Date(schedule.end_at)
  const toDate=d=>localISO(d); const toTime=d=>d.toTimeString().slice(0,5)
  const [form,setForm]=useState({title:schedule.title,description:schedule.description||'',location:schedule.location||'',date:toDate(start),start:toTime(start),end:toTime(end),memberIds:[]})
  const [people,setPeople]=useState([]); const [busy,setBusy]=useState(false)
  useEffect(()=>{ (async()=>{
    const {data}=await supabase.from('profiles').select('id,full_name,role').in('role',['staff_media','head_media']).eq('active',true).order('full_name')
    setPeople(data||[])
    const {data:existing}=await supabase.from('schedule_members').select('member_id').eq('schedule_id',schedule.id)
    setForm(f=>({...f,memberIds:(existing||[]).map(m=>m.member_id)}))
  })() },[])
  async function save(e){ e.preventDefault()
    if(form.end<=form.start){ notifyDialog('End time must be after the start time.'); return }
    setBusy(true)
    const start_at=new Date(`${form.date}T${form.start}`).toISOString(); const end_at=new Date(`${form.date}T${form.end}`).toISOString()
    const {error}=await supabase.from('schedules').update({ title:form.title, description:form.description||null, location:form.location||null, start_at, end_at }).eq('id',schedule.id)
    if(error){ notifyDialog(error.message); setBusy(false); return }
    const {data:cur}=await supabase.from('schedule_members').select('member_id').eq('schedule_id',schedule.id)
    const have=(cur||[]).map(m=>m.member_id)
    const removed=have.filter(id=>!form.memberIds.includes(id)); const added=form.memberIds.filter(id=>!have.includes(id))
    if(removed.length) await supabase.from('schedule_members').delete().eq('schedule_id',schedule.id).in('member_id',removed)
    if(added.length) await supabase.from('schedule_members').insert(added.map(id=>({schedule_id:schedule.id,member_id:id})))
    setBusy(false); onClose(); onSaved()
  }
  const groups=[
    {label:'MEDIA',people:people.filter(p=>p.role==='staff_media')},
    {label:'HEAD MEDIA',people:people.filter(p=>p.role==='head_media')},
  ]
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
    <PersonPicker groups={groups} value={form.memberIds} multi={true} onChange={ids=>setForm({...form,memberIds:ids})}/>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Save changes'}</button></div>
  </form></Modal>
}

/* ---------------- Tracker (hours-mode: full ledger, done only, editable) ---------------- */
function Tracker({profile}){
  const [rows,setRows]=useState([]); const [edit,setEdit]=useState(null)
  const can=canCreateSchedule(profile.role); const staff=isStaff(profile.role)
  async function load(){
    const {data}=await supabase.from('schedules').select('*,schedule_members(member_id,sorted,sorted_at,profiles(full_name))').eq('department',profile.department).in('status',['completed','done']).order('start_at',{ascending:false})
    let list=data||[]
    if(staff) list=list.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
    setRows(list)
  }
  useEffect(()=>{ load() },[profile.id]); usePoll(load)
  async function del(id){ if(!await confirmDialog({title:'Delete event?',body:'This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; await supabase.from('schedules').delete().eq('id',id); load() }
  return <div>
    <section className="page-head"><div><div className="eyebrow">FULL LEDGER</div><h1>Tracker</h1><p>Sorted events in {profile.department}, with hours and sorted dates.</p></div></section>
    <div className="panel table-panel" style={{overflowX:'auto'}}>
      <div className={`table-head trk-media ${can?'':'no-action'}`}><span>Event</span><span>Event date • Time</span><span>Members</span><span>Hours</span><span>Sorted on</span>{can && <span>Action</span>}</div>
      {rows.map(r=><div className={`table-row trk-media ${can?'':'no-action'}`} key={r.id}><strong>{r.title}</strong><span>{fmtDay(r.start_at)} • {fmtTime(r.start_at)}–{fmtTime(r.end_at)}</span>
        <span>{(r.schedule_members||[]).map(m=>m.profiles?.full_name).join(', ')||'—'}</span>
        <span>{Math.max(0,(new Date(r.end_at)-new Date(r.start_at))/3600000).toFixed(1)}h</span>
        <span>{r.sorted_at?fmtDay(r.sorted_at):'—'}</span>
        {can && <span style={{display:'flex',gap:4}}><button className="icon-btn" title="Edit" onClick={()=>setEdit(r)}><Pencil size={14}/></button><button className="icon-btn" title="Delete" onClick={()=>del(r.id)}><Trash2 size={14}/></button></span>}</div>)}
      {!rows.length && <div className="empty">Nothing sorted yet.</div>}
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
  useEffect(()=>{ (async()=>{ const {data}=await supabase.from('profiles').select('id,full_name,role,department').eq('active',true).order('full_name'); setPeople((data||[]).filter(p=>ROLE_META[p.role])) })() },[])
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
    <label>Send to<select value={form.audience} onChange={e=>setForm({...form,audience:e.target.value})}>
      <option value="all">Everyone</option><option value="heads">All heads</option><option value="staff">All staff</option><option value="custom">Specific people…</option>
    </select></label>
    {form.audience==='custom' && <><label>Recipients</label>
      <PersonPicker groups={[
        {label:'MEDIA',people:people.filter(p=>p.department==='Media')},
        {label:'COLORIST / TD',people:people.filter(p=>p.department==='Colorist')},
        {label:'ART DIRECTOR',people:people.filter(p=>p.role==='art_director')},
        {label:'EDITORIAL',people:people.filter(p=>['admin','eic'].includes(p.role))},
      ]} value={form.target} multi={true} onChange={ids=>setForm({...form,target:ids})}/>
    </>}
    <label>By<input value={profile.full_name} disabled/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Sending…':'Send announcement'}</button></div>
  </form></Modal>
}

/* ---------------- Members (roster + drill-down) ---------------- */
function Members({profile,deptFocus,onClearFocus}){
  const [rows,setRows]=useState([]); const [open,setOpen]=useState(false); const [detail,setDetail]=useState(null); const [filter,setFilter]=useState('')
  const managing=isAdminLike(profile.role); const canCreate=canManageAccounts(profile.role)
  const dept=deptFocus || filter || (managing?null:profile.department)
  useEffect(()=>{ load() },[profile.id,deptFocus,filter])
  async function load(){ let q=supabase.from('profiles').select('*').order('full_name'); if(dept) q=q.eq('department',dept); else if(!managing) q=q.eq('department',profile.department); const {data}=await q; setRows((data||[]).filter(m=>ROLE_META[m.role]&&m.active!==false).sort((a,b)=>roleRank(a.role)-roleRank(b.role))) }
  return <div>
    <section className="page-head"><div><div className="eyebrow">{dept?dept.toUpperCase():'THE TEAM'}</div><h1>Members{dept?` — ${dept}`:''}</h1><p>Click a member to see their full activity.</p></div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        {managing && !deptFocus && <select value={filter} onChange={e=>setFilter(e.target.value)} className="filter-select"><option value="">All departments</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select>}
        {deptFocus && <button className="secondary-btn" onClick={onClearFocus}>Clear filter</button>}
        {canCreate && <button className="primary-btn" onClick={()=>setOpen(true)}><Plus size={17}/> Create account</button>}
      </div></section>
    <div className="members-grid">{rows.map(m=><div className="panel member-card" key={m.id} onClick={()=>setDetail(m)}>
      <div className="member-top"><div className="avatar large">{m.avatar_url?<img src={m.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(m.full_name)}</div>{m.active && <span className="active-dot">● active</span>}</div>
      <h3>{m.full_name}</h3><p>{ROLE_META[m.role]?.label || m.role}</p>
      <div className="member-meta"><span>{m.department}</span><span>{m.position||'—'}</span></div>
    </div>)}
      {!rows.length && <div className="panel empty">No members yet.</div>}</div>
    {open && <CreateAccountModal profile={profile} defaultDept={dept} onClose={()=>setOpen(false)} onSaved={load}/>}
    {detail && <MemberDetailModal member={detail} onClose={()=>setDetail(null)}/>}
  </div>
}

function MemberDetailModal({member,onClose}){
  const mode=DEPT_MODE[member.department]||'tasks'
  const [rows,setRows]=useState([]); const [total,setTotal]=useState(0); const [loading,setLoading]=useState(true)
  const [showLog,setShowLog]=useState(false)
  useEffect(()=>{ load() },[member.id])
  async function load(){
    setLoading(true)
    if(mode==='hours'){
      const {data}=await supabase.from('schedules').select('*,schedule_members!inner(member_id)').eq('schedule_members.member_id',member.id).order('start_at',{ascending:false})
      const list=data||[]; setRows(list); setTotal(list.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0))
    } else {
      const {data}=await supabase.from('tasks').select('*').eq('assigned_to',member.id).order('assigned_date',{ascending:false})
      const list=data||[]; setRows(list); setTotal(list.filter(t=>t.status==='completed').length)
    }
    setLoading(false)
  }
  return <Modal title={member.full_name} onClose={onClose}>
    <p style={{color:'var(--text-dim)',fontSize:12,marginTop:-8}}>{ROLE_META[member.role]?.label} • {member.department}</p>
    <div className="stats-grid" style={{gridTemplateColumns:'1fr 1fr',marginBottom:16}}>
      <Stat title={mode==='hours'?'Total Hours':'Tasks Completed'} value={mode==='hours'?total.toFixed(1):total} note={mode==='hours'?'Logged':'This edition'} icon={mode==='hours'?Clock3:CheckCircle2}/>
      <Stat title={mode==='hours'?'Total Events':'Total Tasks'} value={rows.length} note="All time" icon={mode==='hours'?CalendarDays:CheckSquare}/>
    </div>
    <button type="button" className="secondary-btn wide" onClick={()=>setShowLog(true)}><History size={15}/> Show logged history</button>
    {showLog && <Modal title={`${member.full_name} — full history`} onClose={()=>setShowLog(false)}>
      {loading ? <div className="empty">Loading…</div> : <div style={{maxHeight:400,overflow:'auto'}}>
        {rows.map(r=><div key={r.id} style={{padding:'10px 0',borderTop:'1px solid var(--border)'}}>
          <strong style={{fontSize:12,display:'block'}}>{r.title}</strong>
          <span style={{fontSize:11,color:'var(--text-dim)'}}>{mode==='hours' ? `${fmtDay(r.start_at,false)} • ${Math.max(0,(new Date(r.end_at)-new Date(r.start_at))/3600000).toFixed(1)}h` : `Assigned ${fmtDay(r.assigned_date,false)} • ${r.status.replace('_',' ')}`}</span>
        </div>)}
        {!rows.length && <div className="empty">Nothing logged yet.</div>}
      </div>}
    </Modal>}
  </Modal>
}

const ROLE_OPTIONS=[['admin','Admin'],['eic','EDBO'],['art_director','Art Director'],['head_media','Head Media'],['staff_media','Media'],['head_colorist','TD (Head Colorist)'],['staff_colorist','Colorist']]
function deptForRole(r){ return ROLE_META[r]?.dept || 'Admin' }
function CreateAccountModal({profile,defaultDept,onClose,onSaved}){
  const [form,setForm]=useState({full_name:'',email:'',password:'',position:'',role:'staff_media',avatar_url:''})
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('')
  async function save(e){ e.preventDefault(); setBusy(true); setErr('')
    const {data:{session}}=await supabase.auth.getSession()
    const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,{ method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({full_name:form.full_name,email:form.email,password:form.password,department:deptForRole(form.role),role:form.role,position:form.position,avatar_url:form.avatar_url||null}) })
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
    <div className="form-row">
      <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{ROLE_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Position title<input value={form.position} onChange={e=>setForm({...form,position:e.target.value})} placeholder="e.g. Photographer"/></label>
    </div>
    {err && <div className="error">{err}</div>}
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Creating…':'Create account'}</button></div>
  </form></Modal>
}

/* ---------------- Outputs (task-mode staff/heads) ---------------- */
/* ---------------- Resources (with Outputs nested for task-mode departments) ---------------- */
function Resources({profile}){
  const [rows,setRows]=useState([]); const [open,setOpen]=useState(false)
  const [outputs,setOutputs]=useState([]); const [outOpen,setOutOpen]=useState(false)
  const [deptFilter,setDeptFilter]=useState('')
  const can=isAdminLike(profile.role)||isHead(profile.role)
  const showOutputs = roleMode(profile.role)==='tasks' || isAdminLike(profile.role)
  useEffect(()=>{ load() },[profile.id,deptFilter])
  async function load(){
    const {data}=await supabase.from('resources').select('*').order('created_at',{ascending:false}); setRows(data||[])
    if(showOutputs){ let oq=supabase.from('outputs').select('*,profiles(full_name,position,department,avatar_url)').order('created_at',{ascending:false}); if(isAdminLike(profile.role)){ if(deptFilter) oq=oq.eq('department',deptFilter) } else oq=oq.eq('department',profile.department); const {data:od}=await oq; setOutputs(od||[]) }
  }
  async function del(id){ if(!await confirmDialog({title:'Remove this link?',confirmLabel:'Remove',danger:true})) return; await supabase.from('resources').delete().eq('id',id); load() }
  async function delOutput(id){ if(!await confirmDialog({title:'Remove this output?',confirmLabel:'Remove',danger:true})) return; await supabase.from('outputs').delete().eq('id',id); load() }
  return <div>
    <section className="page-head"><div><div className="eyebrow">QUICK ACCESS</div><h1>Resources</h1><p>Canva, Drive and other team links — one click away.</p></div>{can && <button className="primary-btn" onClick={()=>setOpen(true)}><Plus size={17}/> Add link</button>}</section>
    <div className="resource-grid">{rows.map(r=><a className="resource-card panel" href={r.url} target="_blank" rel="noreferrer" key={r.id}>
      <div className="resource-icon"><Link2 size={22}/></div><div><h3>{r.name}</h3><p>{r.description||r.resource_type}{r.department?` • ${r.department}`:''}</p></div>
      {can ? <button className="icon-btn" onClick={e=>{ e.preventDefault(); del(r.id) }}><X size={15}/></button> : <ExternalLink size={17}/>}
    </a>)}</div>
    {!rows.length && <div className="panel empty">No resources yet.{can?' Add your Canva or Drive link above.':''}</div>}
    {showOutputs && <div style={{marginTop:28}}>
      <div className="page-head" style={{marginBottom:14}}><div><div className="eyebrow">DELIVERABLES</div><h1 style={{fontSize:26}}>Outputs</h1><p>Finished work, linked and logged.</p></div>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          {isAdminLike(profile.role) && <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} className="filter-select"><option value="">Colorist &amp; Art Director</option>{DEPARTMENTS.filter(d=>DEPT_MODE[d]==='tasks').map(d=><option key={d}>{d}</option>)}</select>}
          {roleMode(profile.role)==='tasks' && <button className="primary-btn" onClick={()=>setOutOpen(true)}><Plus size={17}/> Log output</button>}
        </div></div>
      <div className="panel table-panel">
        <div className="table-head"><span>Title</span><span>By</span><span>Link</span><span>Notes</span><span>Date</span></div>
        {outputs.map(r=><div className="table-row" key={r.id}><strong>{r.title}</strong>
          <span style={{display:'flex',alignItems:'center',gap:8}}><span className="avatar" style={{width:24,height:24,fontSize:9,flexShrink:0}}>{r.profiles?.avatar_url?<img src={r.profiles.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(r.profiles?.full_name)}</span>
            <span>{r.profiles?.full_name}{isAdminLike(profile.role) && <><br/><small style={{color:'var(--text-dim)',fontSize:10}}>{r.profiles?.position||'—'} • {r.profiles?.department}</small></>}</span></span>
          <a href={r.url} target="_blank" rel="noreferrer" style={{color:'var(--sand)'}}>Open ↗</a><span>{r.notes||'—'}</span><span>{new Date(r.created_at).toLocaleDateString()}</span></div>)}
        {!outputs.length && <div className="empty">No outputs logged yet.</div>}
      </div>
    </div>}
    {open && <ResourceModal profile={profile} onClose={()=>setOpen(false)} onSaved={load}/>}
    {outOpen && <OutputModal profile={profile} onClose={()=>setOutOpen(false)} onSaved={load}/>}
  </div>
}
function OutputModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({title:'',url:'',notes:''}); const [busy,setBusy]=useState(false)
  async function save(e){ e.preventDefault(); setBusy(true); const {error}=await supabase.from('outputs').insert({...form,user_id:profile.id,department:profile.department}); setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() } }
  return <Modal title="Log an output" onClose={onClose}><form onSubmit={save}>
    <label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Link<input required type="url" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/></label>
    <label>Notes<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})}/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Log output'}</button></div>
  </form></Modal>
}
function ResourceModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({name:'',description:'',url:'',resource_type:'Drive',department:isAdminLike(profile.role)?'':profile.department})
  const [busy,setBusy]=useState(false)
  async function save(e){ e.preventDefault(); setBusy(true); const {error}=await supabase.from('resources').insert({...form,department:form.department||null,created_by:profile.id}); setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() } }
  return <Modal title="Add resource link" onClose={onClose}><form onSubmit={save}>
    <label>Name<input required placeholder="e.g. Cover Canva Board" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>Link<input required type="url" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/></label>
    <div className="form-row">
      <label>Type<select value={form.resource_type} onChange={e=>setForm({...form,resource_type:e.target.value})}><option>Canva</option><option>Drive</option><option>Sheets</option><option>Other</option></select></label>
      <label>Visible to<select value={form.department} onChange={e=>setForm({...form,department:e.target.value})} disabled={!isAdminLike(profile.role)}><option value="">Everyone</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></label>
    </div>
    <label>Notes<input value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Add link'}</button></div>
  </form></Modal>
}

/* ---------------- Settings (admin only) ---------------- */
function Settings({profile}){
  const [rows,setRows]=useState([]); const [edit,setEdit]=useState(null); const [reset,setReset]=useState(null); const [filter,setFilter]=useState('')
  useEffect(()=>{ load() },[])
  async function load(){ const {data}=await supabase.from('profiles').select('*').order('department').order('full_name'); setRows(data||[]) }
  const filtered=rows.filter(m=>!filter||m.department===filter||(filter==='Retired'&&!ROLE_META[m.role]))
  return <div>
    <section className="page-head"><div><div className="eyebrow">ADMIN ONLY</div><h1>Settings</h1><p>Edit member profiles or reset a password.</p></div>
      <select value={filter} onChange={e=>setFilter(e.target.value)} className="filter-select"><option value="">All departments</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}<option value="Retired">Old / unused roles</option></select>
    </section>
    <div className="panel">{filtered.map(m=><div className="settings-row" key={m.id}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div className="avatar">{m.avatar_url?<img src={m.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(m.full_name)}</div>
        <div><strong>{m.full_name}</strong><span>{ROLE_META[m.role]?.label || 'Old role (unused)'} • {m.department}{m.email?` • ${m.email}`:''}</span></div>
      </div>
      <div className="settings-actions"><button className="ghost-btn" onClick={()=>setEdit(m)}>Edit</button><button className="ghost-btn" onClick={()=>setReset(m)}><KeyRound size={13}/> Reset password</button></div>
    </div>)}{!filtered.length && <div className="empty">No members yet.</div>}</div>
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
  const [form,setForm]=useState({full_name:member.full_name,role:ROLE_META[member.role]?member.role:'staff_media',position:member.position||'',active:member.active,avatar_url:member.avatar_url||''})
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('')
  async function save(e){ e.preventDefault(); setBusy(true); setErr('')
    try{ await callManageUser({action:'update_profile',userId:member.id,...form,department:deptForRole(form.role)}); onClose(); onSaved() } catch(e){ setErr(e.message) }
    setBusy(false)
  }
  return <Modal title={`Edit ${member.full_name}`} onClose={onClose}><form onSubmit={save}>
    <label>Full name<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
    <label>Profile picture URL<input type="url" placeholder="https://…" value={form.avatar_url} onChange={e=>setForm({...form,avatar_url:e.target.value})}/></label>
    <div className="form-row">
      <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{ROLE_OPTIONS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
      <label>Position title<input value={form.position} onChange={e=>setForm({...form,position:e.target.value})}/></label>
    </div>
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
  const privileged=isAdminLike(profile.role)
  const canSetLink=isAdminLike(profile.role)||isHead(profile.role)
  const [deptFilter,setDeptFilter]=useState('')
  const dept=privileged?(deptFilter||null):profile.department
  const [sheetUrl,setSheetUrl]=useState(''); const [urlDraft,setUrlDraft]=useState(''); const [saved,setSaved]=useState(false)
  const [people,setPeople]=useState([]); const [detail,setDetail]=useState([]); const [loading,setLoading]=useState(true)
  const scope=dept||'ALL'
  useEffect(()=>{ load() },[profile.id,deptFilter])
  async function load(){
    setLoading(true)
    const {data:intg}=await supabase.from('integrations').select('*').eq('scope',scope).maybeSingle(); setSheetUrl(intg?.sheet_webhook_url||''); setUrlDraft(intg?.sheet_webhook_url||'')
    let pq=supabase.from('profiles').select('id,full_name,position,department,role').eq('active',true); if(dept) pq=pq.eq('department',dept)
    const {data:profiles}=await pq
    let tq=supabase.from('tasks').select('assigned_to,title,assigned_date,completed_at,status'); if(dept) tq=tq.eq('department',dept)
    const {data:tasks}=await tq
    let sq=supabase.from('schedules').select('id,title,start_at,end_at,status,department,sorted_at,schedule_members(member_id)'); if(dept) sq=sq.eq('department',dept)
    const {data:schedules}=await sq
    const summary=[]; const detailRows=[]
    ;(profiles||[]).filter(p=>ROLE_META[p.role]?.dept).forEach(p=>{
      const m=DEPT_MODE[ROLE_META[p.role].dept]
      if(m==='hours'){
        const mine=(schedules||[]).filter(s=>(s.schedule_members||[]).some(x=>x.member_id===p.id))
        const hrs=mine.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0)
        summary.push({ Name:p.full_name, Position:p.position||ROLE_META[p.role]?.label, Department:ROLE_META[p.role].dept, Metric:'Total Hours', Total:hrs.toFixed(1), Events:mine.length })
        mine.forEach(s=>detailRows.push({ Date:fmtDay(s.start_at), Event:s.title, Name:p.full_name, Position:p.position||ROLE_META[p.role]?.label, From:`${fmtTime(s.start_at)} → ${fmtTime(s.end_at)}`, Hours:Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000).toFixed(1), _sort:localISO(s.start_at) }))
      } else {
        const mine=(tasks||[]).filter(t=>t.assigned_to===p.id)
        summary.push({ Name:p.full_name, Position:p.position||ROLE_META[p.role]?.label, Department:ROLE_META[p.role].dept, Metric:'Tasks Completed', Total:mine.filter(t=>t.status==='completed').length, Events:mine.length })
        mine.forEach(t=>detailRows.push({ Date:fmtDay(t.assigned_date), Event:t.title, Name:p.full_name, Position:p.position||ROLE_META[p.role]?.label, From:`${fmtDay(t.assigned_date,false)} → ${t.completed_at?fmtDay(t.completed_at,false):'not done yet'}`, Hours:t.status.replace('_',' '), _sort:t.assigned_date||'' }))
      }
    })
    detailRows.sort((a,b)=>String(a._sort||'').localeCompare(String(b._sort||'')))
    detailRows.forEach(r=>delete r._sort)
    setPeople(summary); setDetail(detailRows); setLoading(false)
  }
  async function saveLink(){ const {error}=await supabase.from('integrations').upsert({scope,sheet_webhook_url:urlDraft,updated_by:profile.id,updated_at:new Date().toISOString()},{onConflict:'scope'}); if(error) notifyDialog(error.message); else { setSheetUrl(urlDraft); setSaved(true); setTimeout(()=>setSaved(false),2000) } }
  return <div>
    <section className="page-head"><div><div className="eyebrow">BACKUP</div><h1>{isAdminLike(profile.role)?'Main spreadsheet backup':`${dept||'Team'} backup`}</h1><p>All-summary CSV, or a per-person detail CSV with every task or event assigned.</p></div>
      {privileged && <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} className="filter-select"><option value="">All departments</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select>}
    </section>
    <div className="panel task-panel" style={{marginBottom:14,display:'flex',justifyContent:'space-between',alignItems:'center',gap:14,flexWrap:'wrap'}}>
      <div><h2 style={{margin:0,fontFamily:'"Playfair Display"',fontSize:19}}>Google Sheet</h2><p style={{margin:'4px 0 0',fontSize:12,color:'var(--text-dim)'}}>Kept up to date automatically by the Apps Script from the README — this page doesn't push data to it.</p></div>
      <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap'}}>
        {canSetLink && <input className="filter-select" style={{width:220}} placeholder="Paste the sheet's share URL" value={urlDraft} onChange={e=>setUrlDraft(e.target.value)}/>}
        {canSetLink && <button className="secondary-btn" onClick={saveLink}>{saved?'Saved ✓':'Save link'}</button>}
        {sheetUrl && <a className="primary-btn" href={sheetUrl} target="_blank" rel="noreferrer"><ExternalLink size={15}/> Check Google Sheet</a>}
      </div>
    </div>
    <div className="panel table-panel" style={{marginBottom:14}}>
      <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>All summary</h2><div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:11,color:'var(--text-dim)'}}>{people.length} people</span><button className="text-btn" onClick={()=>downloadCSV('backup-summary.csv',people)}><Download size={13}/> Download CSV</button></div></div>
      <div className="table-head"><span>Name</span><span>Position</span><span>Department</span><span>Metric</span><span>Total</span></div>
      {loading ? <div className="empty">Loading…</div> : people.map((p,i)=><div className="table-row" key={i}><strong>{p.Name}</strong><span>{p.Position}</span><span>{p.Department}</span><span>{p.Metric}</span><span>{p.Total}</span></div>)}
      {!loading && !people.length && <div className="empty">No members yet.</div>}
    </div>
    <div className="panel table-panel">
      <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>By person — detail</h2><div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:11,color:'var(--text-dim)'}}>{detail.length} records</span><button className="text-btn" onClick={()=>downloadCSV('backup-detail.csv',detail)}><Download size={13}/> Download CSV</button></div></div>
      <div className="table-head"><span>Date</span><span>Event / Task</span><span>Name</span><span>From → To</span><span>Hours / Status</span></div>
      {loading ? <div className="empty">Loading…</div> : detail.map((d,i)=><div className="table-row" key={i}><strong>{d.Date}</strong><span>{d.Event}</span><span>{d.Name}</span><span>{d.From}</span><span>{d.Hours}</span></div>)}
      {!loading && !detail.length && <div className="empty">Nothing logged yet.</div>}
    </div>
  </div>
}
