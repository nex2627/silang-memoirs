import { useEffect, useMemo, useState } from 'react'
import { supabase } from './lib/supabase'
import {
  LayoutDashboard, CheckSquare, CalendarDays, Clock3, Users, Link2, LogOut, Search, Plus, X,
  Camera, PenLine, CheckCircle2, AlertCircle, Sparkles, ExternalLink, ChevronRight,
  ChevronLeft, ClipboardCheck, Database, Sun, Moon, Bell, Eye, EyeOff, Settings as SettingsIcon,
  Download, Wand2, KeyRound, FolderKanban, Megaphone, Trash2, BellOff
} from 'lucide-react'

/* ---------------- Config ---------------- */
const ROLE_META = {
  admin:            { label:'Administrator', dept:null,       mode:'admin', head:false },
  head_media:       { label:'Head — Media',       dept:'Media',        mode:'hours', head:true  },
  staff_media:      { label:'Staff — Media',      dept:'Media',        mode:'hours', head:false },
  head_colorist:    { label:'Head — Colorist',    dept:'Colorist',     mode:'tasks', head:true  },
  staff_colorist:   { label:'Staff — Colorist',   dept:'Colorist',     mode:'tasks', head:false },
  head_layout:      { label:'Head — Layout Artist', dept:'Layout Artist', mode:'tasks', head:true  },
  staff_layout:     { label:'Staff — Layout Artist', dept:'Layout Artist', mode:'tasks', head:false },
  head_writer:      { label:'Head — Writer',      dept:'Writer',       mode:'tasks', head:true  },
  staff_writer:     { label:'Staff — Writer',     dept:'Writer',       mode:'tasks', head:false },
  head_researcher:  { label:'Head — Researcher',  dept:'Researcher',   mode:'tasks', head:true  },
  staff_researcher: { label:'Staff — Researcher', dept:'Researcher',   mode:'tasks', head:false },
}
const DEPARTMENTS = ['Media','Colorist','Layout Artist','Writer','Researcher']
const DEPT_MODE = { Media:'hours', Colorist:'tasks', 'Layout Artist':'tasks', Writer:'tasks', Researcher:'tasks' }
const DEPT_ICON = { Media:Camera, Colorist:Wand2, 'Layout Artist':LayoutDashboard, Writer:PenLine, Researcher:Search }
const DEPT_HEAD_ROLE = { Media:'head_media', Colorist:'head_colorist', 'Layout Artist':'head_layout', Writer:'head_writer', Researcher:'head_researcher' }
const DEPT_STAFF_ROLE = { Media:'staff_media', Colorist:'staff_colorist', 'Layout Artist':'staff_layout', Writer:'staff_writer', Researcher:'staff_researcher' }
const LOGO = `${import.meta.env.BASE_URL}logo.png`
const EDITION = 'Nexemeral 27'
const WELCOME_LINE = 'Keep every story, page, photograph and fact moving toward the finished yearbook.'
const IDLE_LIMIT_MS = 3*60*1000
// The pipeline: once a Media event is marked completed, it becomes available work for these three heads in turn.
const STAGE_CONFIG = {
  head_writer:   { dept:'Writer',       verb:'captions',    titlePrefix:'Caption' },
  head_colorist: { dept:'Colorist',     verb:'colorgrading', titlePrefix:'Colorgrade' },
  head_layout:   { dept:'Layout Artist', verb:'layout',      titlePrefix:'Layout' },
}

/* ---------------- Helpers ---------------- */
function isHead(role){ return !!ROLE_META[role]?.head }
function isStaff(role){ return !!role && role.startsWith('staff_') }
function isColorist(role){ return role==='head_colorist' || role==='staff_colorist' }
function roleDept(role){ return ROLE_META[role]?.dept || null }
function roleMode(role){ return ROLE_META[role]?.mode || 'admin' }
function canCreateTask(role){ return role==='admin' || isHead(role) }
function canCreateSchedule(role){ return role==='admin' || isHead(role) }
function initials(name=''){ return name.split(' ').filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase() }
function greet(){ const h=new Date().getHours(); return h<12?'Good morning':h<18?'Good afternoon':'Good evening' }
function sameDay(a,b){ return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate() }
function fmtTime(iso){ return new Date(iso).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}) }
function roleRank(role){ if(role==='admin') return 0; if(isHead(role)) return 1; return 2 }
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
  return <Workspace profile={profile} onProfileRefresh={()=>loadProfile(profile.id)} theme={theme} toggleTheme={toggleTheme}/>
}

function LoadingScreen(){
  return <div className="center-screen"><div className="loader-wrap"><img className="loader-logo" src={LOGO} alt=""/><div className="loader-ring"/><p>Opening Silang Memoirs…</p></div></div>
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
  const [pwOpen,setPwOpen]=useState(false)
  const role=profile.role; const mode=roleMode(role); const staff=isStaff(role)

  const nav=useMemo(()=>{
    const base=[['Dashboard',LayoutDashboard],['Calendar',CalendarDays],['Notifications',Bell]]
    if(role==='admin'){ base.push(['Tracker',FolderKanban],['Members',Users],['Resources',Link2],['Announcements',Megaphone],['Settings',SettingsIcon],['Backup',Database]) }
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

  async function logout(){ await supabase.auth.signOut() }

  return <div className="app">
    <aside className={`sidebar ${mobile?'open':''}`}>
      <div className="brand">
        <img className="brand-mark" src={LOGO} alt="Silang Memoirs"/>
        <div><div className="brand-name">Silang Memoirs</div><div className="brand-sub">{EDITION.toUpperCase()}</div></div>
        <button className="icon-btn mobile-close" onClick={()=>setMobile(false)}><X size={18}/></button>
      </div>
      <div className="nav-label">WORKSPACE</div>
      <nav>{nav.map(([n,I])=><button key={n} className={`nav-item ${page===n?'active':''}`} onClick={()=>goPage(n)}><I size={18}/><span>{n}</span>{page===n && <ChevronRight size={15} className="nav-arrow"/>}</button>)}</nav>
      <div className="sidebar-bottom">
        <ThemeToggle theme={theme} onToggle={toggleTheme}/>
        <div className="profile-mini" style={{marginTop:10}}>
          <div className="avatar">{profile.avatar_url?<img src={profile.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(profile.full_name)}</div>
          <div><strong>{profile.full_name}</strong><span>{ROLE_META[role]?.label || role}</span><span>{profile.department}</span></div>
        </div>
        <button className="password-link full-width" onClick={()=>setPwOpen(true)}>Change password</button>
        <button className="nav-item logout" onClick={logout}><LogOut size={18}/><span>Log out</span></button>
      </div>
    </aside>
    {mobile && <div className="backdrop" onClick={()=>setMobile(false)}/>}
    <main className="main">
      <header className="topbar">
        <div className="crumb"><span>Silang Memoirs</span><ChevronRight size={14}/><strong>{deptFocus?deptFocus:page}</strong></div>
        <div className="top-actions">
          <NotificationBell profile={profile}/>
          <div className="role-pill">{ROLE_META[role]?.label || role}</div>
        </div>
      </header>
      <div className="content page-enter" key={page+String(deptFocus)}>
        {page==='Dashboard' && role==='admin' && <AdminDashboard profile={profile}/>}
        {page==='Dashboard' && role!=='admin' && mode==='hours' && <HoursDashboard profile={profile}/>}
        {page==='Dashboard' && role!=='admin' && mode==='tasks' && <TasksDashboard profile={profile}/>}

        {page==='Calendar' && <CalendarPage profile={profile}/>}
        {page==='Notifications' && <NotificationsPage profile={profile}/>}
        {page==='Tracker' && (mode==='tasks'||role==='admin') && <TaskTracker profile={profile}/>}
        {page==='Tracker' && mode==='hours' && role!=='admin' && <Tracker profile={profile}/>}
        {page==='Members' && <Members profile={profile} deptFocus={deptFocus} onClearFocus={()=>setDeptFocus(null)}/>}
        {page==='Resources' && <Resources profile={profile}/>}
        {page==='Announcements' && role==='admin' && <Announcements profile={profile}/>}
        {page==='Settings' && role==='admin' && <Settings profile={profile}/>}
        {page==='Backup' && <Backup profile={profile}/>}
      </div>
    </main>
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

/* ---------------- Dashboards ---------------- */
function WelcomeHero({profile,children,onCreate,createLabel}){
  return <section className="hero">
    <div><div className="eyebrow"><Sparkles size={14}/> {roleDept(profile.role)?roleDept(profile.role).toUpperCase()+' DESK':'COMMAND CENTER'}</div>
    <h1>{greet()}, {profile.full_name.split(' ')[0]}.</h1><p>{WELCOME_LINE}</p></div>
    {onCreate && <button className="primary-btn" onClick={onCreate}><Plus size={17}/> {createLabel}</button>}
  </section>
}

function AdminDashboard({profile}){
  const [metrics,setMetrics]=useState({})
  const [counts,setCounts]=useState({})
  const [detail,setDetail]=useState(null)
  useEffect(()=>{ load() },[])
  async function load(){
    const {data:profiles}=await supabase.from('profiles').select('id,department,role')
    const cnt={}; DEPARTMENTS.forEach(d=>cnt[d]=(profiles||[]).filter(p=>p.department===d).length); setCounts(cnt)
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
          <Stat title="Done" value={detail.stats.done} note="Wrapped" icon={CheckCircle2}/>
          <Stat title="Total Hours" value={detail.stats.totalHours.toFixed(1)} note="Logged" icon={Clock3}/>
        </> : <>
          <Stat title="Not Started" value={detail.stats.upcoming} note="Queued" icon={CalendarDays}/>
          <Stat title="Ongoing" value={detail.stats.ongoing} note="In progress" icon={Clock3}/>
          <Stat title="Done" value={detail.stats.done} note="Finished" icon={CheckCircle2}/>
          <Stat title="Total Tasks" value={detail.stats.totalTasks} note="All time" icon={ClipboardCheck}/>
        </>}
      </div>
    </Modal>}
  </div>
}

function HoursDashboard({profile}){
  const staff=isStaff(profile.role)
  const [stats,setStats]=useState({upcoming:0,completed:0,total:0,hours:0,members:0})
  const [items,setItems]=useState([])
  useEffect(()=>{ load() },[profile.id])
  async function load(){
    let q=supabase.from('schedules').select('*,schedule_members(member_id,profiles(full_name))').eq('department',profile.department).order('start_at',{ascending:true})
    const {data}=await q; let rows=data||[]
    if(staff) rows=rows.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
    const now=new Date()
    const upcoming=rows.filter(s=>new Date(s.start_at)>=now)
    const completed=rows.filter(s=>s.status==='completed'||s.status==='done'||new Date(s.end_at)<now)
    const hours=rows.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0)
    let members=0
    if(!staff){ const {data:p}=await supabase.from('profiles').select('id').eq('department',profile.department); members=(p||[]).length }
    setStats({upcoming:upcoming.length,completed:completed.length,total:rows.length,hours,members})
    setItems(upcoming.slice(0,6))
  }
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
        <Stat title="Completed Events" value={stats.completed} note="Wrapped" icon={CheckCircle2}/>
        <Stat title="Total Events" value={stats.total} note="This edition" icon={ClipboardCheck}/>
        <Stat title="Assigned Hours" value={stats.hours.toFixed(1)} note="Team total" icon={Clock3}/>
        <Stat title="Members" value={stats.members} note="In department" icon={Users}/>
      </>}
    </section>
    {staff && next && <div className="panel task-panel" style={{marginBottom:14}}>
      <div className="panel-title"><h2>Next up</h2></div>
      <strong style={{fontSize:16,display:'block',marginBottom:6}}>{next.title}</strong>
      <p style={{margin:'0 0 4px',color:'var(--text-dim)',fontSize:12}}>{new Date(next.start_at).toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})} • {fmtTime(next.start_at)}–{fmtTime(next.end_at)} ({Math.max(0,(new Date(next.end_at)-new Date(next.start_at))/3600000).toFixed(1)}h)</p>
      <p style={{margin:'0 0 4px',color:'var(--text-dim)',fontSize:12}}>Where: {next.location||'No location set'}</p>
      {next.description && <p style={{margin:'0 0 8px',color:'var(--text-dim)',fontSize:12}}>{next.description}</p>}
      <div className="member-chips" style={{justifyContent:'flex-start'}}>{(next.schedule_members||[]).map(m=><span key={m.member_id}>{m.profiles?.full_name}</span>)}</div>
    </div>}
    <div className="panel task-panel">
      <div className="panel-title"><h2>{staff?'My schedule & assigned events':'Upcoming events'}</h2></div>
      <div className="task-list">{items.map(s=><div className="task-row" key={s.id}><div className="task-icon media"><CalendarDays size={16}/></div>
        <div className="task-info"><strong>{s.title}</strong><span>{new Date(s.start_at).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})} • {s.location||'No location'}</span></div>
        <span className={`status ${s.status}`}>{s.status}</span></div>)}
        {!items.length && <div className="empty">Nothing scheduled yet.</div>}</div>
    </div>
  </div>
}

function TasksDashboard({profile}){
  const staff=isStaff(profile.role)
  const stageCfg = STAGE_CONFIG[profile.role]
  const [stats,setStats]=useState({open:0,done:0,due:0,total:0,members:0})
  const [rows,setRows]=useState([])
  const [undone,setUndone]=useState([])
  const [avail,setAvail]=useState([])
  const [teammates,setTeammates]=useState([])
  const [picks,setPicks]=useState({}) // scheduleId -> Set of selected member ids
  useEffect(()=>{ load() },[profile.id])
  async function load(){
    let q=supabase.from('tasks').select('*,profiles!tasks_assigned_to_fkey(full_name)').eq('department',profile.department).order('due_date',{ascending:true})
    if(staff) q=q.eq('assigned_to',profile.id)
    const {data}=await q; const list=data||[]
    let members=0; if(!staff){ const {data:p}=await supabase.from('profiles').select('id').eq('department',profile.department); members=(p||[]).length }
    setStats({ open:list.filter(t=>t.status!=='completed').length, done:list.filter(t=>t.status==='completed').length, due:list.filter(t=>t.due_date && new Date(t.due_date)<=new Date(Date.now()+7*864e5) && t.status!=='completed').length, total:list.length, members })
    setRows(list.slice(0,7))
    setUndone(list.filter(t=>t.status!=='completed'))
    if(stageCfg){
      const {data:done}=await supabase.from('schedules').select('id,title,start_at,end_at').eq('department','Media').eq('status','completed')
      let candidates=done||[]
      if(stageCfg.dept==='Layout Artist'){
        const {data:coloristTasks}=await supabase.from('tasks').select('schedule_id,status').eq('department','Colorist').not('schedule_id','is',null)
        const readyIds=new Set((coloristTasks||[]).filter(t=>t.status==='completed').map(t=>t.schedule_id))
        candidates=candidates.filter(e=>readyIds.has(e.id))
      }
      const {data:ownTasks}=await supabase.from('tasks').select('schedule_id').eq('department',stageCfg.dept).not('schedule_id','is',null)
      const assignedIds=new Set((ownTasks||[]).map(t=>t.schedule_id))
      setAvail(candidates.filter(e=>!assignedIds.has(e.id)))
      const {data:tm}=await supabase.from('profiles').select('id,full_name').eq('department',stageCfg.dept).eq('role',DEPT_STAFF_ROLE[stageCfg.dept])
      setTeammates(tm||[])
    }
  }
  async function markDone(id){ await supabase.from('tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id); load() }
  function togglePick(scheduleId,memberId){ setPicks(p=>{ const cur=new Set(p[scheduleId]||[]); cur.has(memberId)?cur.delete(memberId):cur.add(memberId); return {...p,[scheduleId]:cur} }) }
  async function assignStage(scheduleId,eventTitle,ids){
    if(!ids.length) return
    const {error}=await supabase.from('tasks').insert(ids.map(uid=>({ title:`${stageCfg.titlePrefix} — ${eventTitle}`, department:stageCfg.dept, assigned_to:uid, schedule_id:scheduleId, created_by:profile.id })))
    if(error) notifyDialog(error.message); else { setPicks(p=>({...p,[scheduleId]:new Set()})); load() }
  }
  return <div>
    <WelcomeHero profile={profile}/>
    <section className="stats-grid">
      <Stat title={staff?'My Tasks':'Open Tasks'} value={stats.open} note="Active work" icon={CheckSquare}/>
      <Stat title="Completed" value={stats.done} note={staff?'Worked task number':'Finished'} icon={CheckCircle2}/>
      <Stat title="Due Soon" value={stats.due} note="Next 7 days" icon={AlertCircle}/>
      {!staff && <Stat title="Members" value={stats.members} note="In department" icon={Users}/>}
      <Stat title="Total Tasks" value={stats.total} note="All time" icon={ClipboardCheck}/>
    </section>
    {stageCfg && <div className="panel" style={{marginBottom:14}}>
      <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>Ready for {stageCfg.verb}</h2></div>
      {!avail.length && <div className="empty">No finished media events waiting.</div>}
      {avail.map(e=>{ const picked=picks[e.id]||new Set(); return <div className="claim-row" key={e.id}><div><strong>{e.title}</strong><span>{new Date(e.start_at).toLocaleDateString()}</span></div>
        <div className="claim-actions">
          <button className="small-btn" onClick={()=>assignStage(e.id,e.title,[profile.id])}>Assign to myself</button>
          <div className="check-pop">
            <div className="check-list">{teammates.map(m=><label key={m.id} className="check-row"><input type="checkbox" checked={picked.has(m.id)} onChange={()=>togglePick(e.id,m.id)}/> {m.full_name}</label>)}
              {!teammates.length && <span style={{fontSize:11,color:'var(--text-dim)'}}>No staff in this department yet.</span>}</div>
            {picked.size>0 && <button className="small-btn" onClick={()=>assignStage(e.id,e.title,[...picked])}>Assign to selected ({picked.size})</button>}
          </div>
        </div></div> })}
    </div>}
    <div className="panel task-panel">
      <div className="panel-title"><h2>{staff?'My task':'Recent tasks'}</h2></div>
      <div className="task-list">{(staff?undone:rows).map(t=><div className="task-row" key={t.id}><div className="task-icon layout"><CheckSquare size={16}/></div>
        <div className="task-info"><strong>{t.title}</strong><span>{staff?`Assigned ${t.assigned_date||'—'} • Due ${t.due_date||'—'}`:`${t.profiles?.full_name||'Unassigned'} • ${t.due_date||'No due date'}`}</span></div>
        {staff ? <button className="small-btn" onClick={()=>markDone(t.id)}>Done</button> : <span className={`status ${t.status}`}>{t.status.replace('_',' ')}</span>}</div>)}
        {(staff?undone:rows).length===0 && <div className="empty">Nothing here yet.</div>}</div>
    </div>
  </div>
}

/* ---------------- Task Tracker (task-mode: done work only, admin also sees Media events) ---------------- */
function TaskTracker({profile}){
  const isAdmin=profile.role==='admin'; const staff=isStaff(profile.role)
  const [tasks,setTasks]=useState([]); const [events,setEvents]=useState([]); const [loading,setLoading]=useState(true)
  const [deptFilter,setDeptFilter]=useState(''); const [dateFilter,setDateFilter]=useState('')
  useEffect(()=>{ load() },[profile.id])
  async function load(){
    setLoading(true)
    let tq=supabase.from('tasks').select('*,profiles!tasks_assigned_to_fkey(full_name,department)').eq('status','completed').order('due_date',{ascending:false})
    if(staff) tq=tq.eq('assigned_to',profile.id); else if(!isAdmin) tq=tq.eq('department',profile.department)
    const {data}=await tq; setTasks(data||[])
    if(isAdmin){ const {data:ev}=await supabase.from('schedules').select('*').eq('department','Media').in('status',['completed','done']).order('start_at',{ascending:false}); setEvents(ev||[]) }
    setLoading(false)
  }
  async function del(id){ if(!await confirmDialog({title:'Delete task?',body:'This removes the task for everyone. This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; await supabase.from('tasks').delete().eq('id',id); load() }
  const filteredTasks=tasks.filter(t=>(!deptFilter||deptFilter==='Media'||t.department===deptFilter)&&(!dateFilter||t.assigned_date===dateFilter||t.due_date===dateFilter))
  const filteredEvents=events.filter(e=>(!deptFilter||deptFilter==='Media')&&(!dateFilter||new Date(e.start_at).toISOString().slice(0,10)===dateFilter))
  const can=profile.role==='admin'||isHead(profile.role)
  return <div>
    <section className="page-head"><div><div className="eyebrow">COMPLETED WORK</div><h1>Tracker</h1><p>Everything finished, with who did it and when.</p></div></section>
    {isAdmin && <div className="panel task-panel filter-bar">
      <label>Department<select className="filter-select" value={deptFilter} onChange={e=>setDeptFilter(e.target.value)}><option value="">All departments</option><option value="Media">Media</option>{DEPARTMENTS.filter(d=>DEPT_MODE[d]==='tasks').map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Date<input type="date" className="filter-select" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}/></label>
      {(deptFilter||dateFilter) && <button className="text-btn" onClick={()=>{ setDeptFilter(''); setDateFilter('') }}>Clear filters</button>}
    </div>}
    <div className="panel table-panel tracker6">
      <div className="table-head"><span>Task</span><span>Department</span><span>Assignee</span><span>Assigned → Due</span><span>Status</span>{can && <span>Action</span>}</div>
      {loading ? <div className="empty">Loading…</div> : filteredTasks.map(t=><div className="table-row" key={t.id}>
        <strong>{t.title}</strong><span>{t.department}</span><span>{t.profiles?.full_name||'Unassigned'}</span><span>{t.assigned_date||'—'} → {t.due_date||'—'}</span>
        <span className={`status ${t.status}`}>{t.status.replace('_',' ')}</span>
        {can && <span><button className="icon-btn" onClick={()=>del(t.id)}><Trash2 size={14}/></button></span>}
      </div>)}
      {isAdmin && filteredEvents.map(e=><div className="table-row" key={'ev-'+e.id}>
        <strong>{e.title}</strong><span>Media</span><span>Event</span><span>{new Date(e.start_at).toLocaleDateString()} → {fmtTime(e.end_at)}</span>
        <span className={`status ${e.status}`}>{e.status}</span><span><button className="icon-btn" onClick={async()=>{ if(!await confirmDialog({title:'Delete event?',body:'This removes the event for everyone. This cannot be undone.',danger:true,confirmLabel:'Delete'}))return; await supabase.from('schedules').delete().eq('id',e.id); load() }}><Trash2 size={14}/></button></span>
      </div>)}
      {!loading && !filteredTasks.length && !filteredEvents.length && <div className="empty">Nothing completed yet.</div>}
    </div>
  </div>
}

function TaskModal({profile,members,onClose,onSaved}){
  const isAdmin=profile.role==='admin'
  const [form,setForm]=useState({title:'',description:'',assigned_to:'',due_date:'',assigned_date:'',department:isAdmin?'Layout Artist':profile.department})
  const [busy,setBusy]=useState(false)
  const availableMembers = isAdmin ? members.filter(m=>m.department===form.department) : members
  async function save(e){ e.preventDefault(); setBusy(true)
    const {error}=await supabase.from('tasks').insert({ title:form.title, description:form.description||null, department:form.department, assigned_to:form.assigned_to||null, due_date:form.due_date||null, assigned_date:form.assigned_date||null, created_by:profile.id })
    setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() }
  }
  return <Modal title="Create task" onClose={onClose}><form onSubmit={save}>
    <label>Title<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <div className="form-row">
      {isAdmin && <label>Department<select value={form.department} onChange={e=>setForm({...form,department:e.target.value,assigned_to:''})}>{DEPARTMENTS.filter(d=>DEPT_MODE[d]==='tasks').map(d=><option key={d}>{d}</option>)}</select></label>}
      <label>Assign to<select value={form.assigned_to} onChange={e=>setForm({...form,assigned_to:e.target.value})}><option value="">Unassigned</option>{availableMembers.map(m=><option key={m.id} value={m.id}>{m.full_name}</option>)}</select></label>
    </div>
    <div className="form-row">
      <label>Assigned date<input type="date" value={form.assigned_date} onChange={e=>setForm({...form,assigned_date:e.target.value})}/></label>
      <label>Due date<input type="date" value={form.due_date} onChange={e=>setForm({...form,due_date:e.target.value})}/></label>
    </div>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Create task'}</button></div>
  </form></Modal>
}

/* ---------------- Calendar (mode-aware, works for everyone) ---------------- */
function CalendarPage({profile}){
  const role=profile.role; const staff=isStaff(role)
  const effMode = role==='admin' ? 'all' : roleMode(role)
  const [month,setMonth]=useState(()=>{ const d=new Date(); d.setDate(1); d.setHours(0,0,0,0); return d })
  const [items,setItems]=useState([]) // unified {id,title,date,type,raw}
  const [selected,setSelected]=useState(null)
  const [openSchedule,setOpenSchedule]=useState(false)
  const [openTask,setOpenTask]=useState(false)
  const gridStart=useMemo(()=>{ const d=new Date(month); d.setDate(1-d.getDay()); return d },[month])
  const gridDays=useMemo(()=>Array.from({length:42},(_,i)=>{ const d=new Date(gridStart); d.setDate(gridStart.getDate()+i); return d }),[gridStart])

  useEffect(()=>{ load() },[profile.id,month])

  async function load(){
    const rangeStart=new Date(gridStart); const rangeEnd=new Date(gridStart); rangeEnd.setDate(rangeEnd.getDate()+42)
    let unified=[]
    if(effMode==='hours' || effMode==='all'){
      let sq=supabase.from('schedules').select('*,schedule_members(member_id,profiles(full_name))').gte('start_at',rangeStart.toISOString()).lt('start_at',rangeEnd.toISOString()).order('start_at')
      if(effMode==='hours') sq=sq.eq('department',profile.department)
      const {data}=await sq; let rows=data||[]
      if(staff) rows=rows.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
      unified=unified.concat(rows.map(s=>({id:'s-'+s.id,title:s.title,date:new Date(s.start_at),type:'schedule',raw:s})))
    }
    if(effMode==='tasks' || effMode==='all'){
      let tq=supabase.from('tasks').select('*,profiles!tasks_assigned_to_fkey(full_name)').not('due_date','is',null).gte('due_date',rangeStart.toISOString().slice(0,10)).lt('due_date',rangeEnd.toISOString().slice(0,10))
      if(effMode==='tasks'){ if(staff) tq=tq.eq('assigned_to',profile.id); else tq=tq.eq('department',profile.department) }
      const {data}=await tq; let rows=data||[]
      unified=unified.concat(rows.map(t=>({id:'t-'+t.id,title:t.title,date:new Date(t.due_date+'T00:00:00'),type:'task',raw:t})))
    }
    setItems(unified)
    setSelected(sel=>sel ? {date:sel.date, items:unified.filter(e=>sameDay(e.date,sel.date))} : sel)
  }

  function eventsOn(d){ return items.filter(e=>sameDay(e.date,d)) }
  function pickDay(d){ const list=eventsOn(d); if(list.length) setSelected({date:d,items:list}) }
  function shiftMonth(n){ const d=new Date(month); d.setMonth(d.getMonth()+n); setMonth(d) }
  const monthLabel=month.toLocaleDateString([], {month:'long',year:'numeric'}); const today=new Date()
  const upcoming=items.filter(e=>{ const st=e.raw.status; return e.date>=new Date(today.getFullYear(),today.getMonth(),today.getDate()) && st!=='completed' && st!=='done' }).sort((a,b)=>a.date-b.date).slice(0,8)

  async function markScheduleStatus(id,status){ await supabase.from('schedules').update({status}).eq('id',id); load() }
  async function markTaskDone(id){ await supabase.from('tasks').update({status:'completed',completed_at:new Date().toISOString()}).eq('id',id); load() }
  async function deleteItem(item){ if(!await confirmDialog({title:'Delete this?',body:'This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; if(item.type==='task') await supabase.from('tasks').delete().eq('id',item.raw.id); else await supabase.from('schedules').delete().eq('id',item.raw.id); setSelected(null); load() }
  const can=role==='admin'||isHead(role)

  return <div>
    <section className="page-head"><div><div className="eyebrow">PLANNING</div><h1>TEAM CALENDAR</h1><p>{staff?'Your assigned schedule.':'Create and review coverage, deadlines and sessions.'}</p></div>
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
        <div className="task-info"><strong>{e.title}</strong><span>{e.date.toLocaleDateString([], {month:'short',day:'numeric'})}{e.type!=='task'?` • ${fmtTime(e.raw.start_at)}`:''}</span></div>
        <span className={`status ${e.raw.status}`}>{e.raw.status.replace('_',' ')}</span>
      </div>)}
      {!upcoming.length && <div className="empty">Nothing upcoming.</div>}</div>
    </div>
    {selected && <Modal title={selected.date.toLocaleDateString([], {weekday:'long',month:'long',day:'numeric'})} onClose={()=>setSelected(null)}>
      {selected.items.map(e=><div key={e.id} className="day-detail-row">
        <strong>{e.title}</strong>
        {e.type==='schedule' && <><span>{e.raw.department} • {fmtTime(e.raw.start_at)} – {fmtTime(e.raw.end_at)} ({Math.max(0,(new Date(e.raw.end_at)-new Date(e.raw.start_at))/3600000).toFixed(1)}h)</span>
          <span>Where: {e.raw.location||'No location'}</span>{e.raw.description && <span>{e.raw.description}</span>}<span>Status: {e.raw.status}</span></>}
        {e.type==='task' && <><span>{e.raw.department} • Assigned to {e.raw.profiles?.full_name||'Unassigned'}</span>
          <span>Assigned {e.raw.assigned_date||'—'} → Due {e.raw.due_date||'—'}</span>{e.raw.description && <span>{e.raw.description}</span>}<span>Status: {e.raw.status.replace('_',' ')}</span></>}
        {e.type==='schedule' && e.raw.schedule_members?.length>0 && <div className="member-chips">{e.raw.schedule_members.map(m=><span key={m.member_id}>{m.profiles?.full_name}</span>)}</div>}
        <div style={{marginTop:8,display:'flex',gap:8}}>
          {e.type==='schedule' && e.raw.department==='Media' && e.raw.status!=='completed' && (role==='admin'||isHead(role)) && <button className="small-btn" onClick={()=>markScheduleStatus(e.raw.id,'completed')}>Mark completed</button>}
          {e.type==='task' && e.raw.status!=='completed' && (staff || role==='admin' || isHead(role)) && <button className="small-btn" onClick={()=>markTaskDone(e.raw.id)}>Mark done</button>}
          {can && <button className="danger-btn" onClick={()=>deleteItem(e)}><Trash2 size={13}/> Delete</button>}
        </div>
      </div>)}
    </Modal>}
    {openSchedule && <ScheduleModal profile={profile} onClose={()=>setOpenSchedule(false)} onSaved={load}/>}
    {openTask && <TaskModalStandalone profile={profile} onClose={()=>setOpenTask(false)} onSaved={load}/>}
  </div>
}

function TaskModalStandalone({profile,onClose,onSaved}){
  const [members,setMembers]=useState([])
  const isAdmin=profile.role==='admin'
  useEffect(()=>{ (async()=>{ let mq=supabase.from('profiles').select('id,full_name,department').like('role','staff_%'); if(!isAdmin) mq=mq.eq('department',profile.department); const {data}=await mq; setMembers(data||[]) })() },[])
  return <TaskModal profile={profile} members={members} onClose={onClose} onSaved={onSaved}/>
}

function ScheduleModal({profile,onClose,onSaved}){
  const [form,setForm]=useState({title:'',description:'',location:'',date:'',start:'',end:'',memberIds:[]})
  const [members,setMembers]=useState([]); const [busy,setBusy]=useState(false)
  useEffect(()=>{ (async()=>{
    const {data}=await supabase.from('profiles').select('id,full_name,role').in('role',['admin','head_media','staff_media'])
    const order={staff_media:0,head_media:1,admin:2}
    setMembers((data||[]).sort((a,b)=>order[a.role]-order[b.role]))
  })() },[])
  async function save(e){ e.preventDefault(); setBusy(true)
    const start_at=new Date(`${form.date}T${form.start}`).toISOString(); const end_at=new Date(`${form.date}T${form.end}`).toISOString()
    const {data:sched,error}=await supabase.from('schedules').insert({ title:form.title, description:form.description||null, location:form.location||null, department:'Media', start_at, end_at, created_by:profile.id }).select().single()
    if(error){ notifyDialog(error.message); setBusy(false); return }
    if(form.memberIds.length){ await supabase.from('schedule_members').insert(form.memberIds.map(id=>({schedule_id:sched.id,member_id:id}))) }
    setBusy(false); onClose(); onSaved()
  }
  return <Modal title="New event" onClose={onClose}><form onSubmit={save}>
    <label>Event name<input required value={form.title} onChange={e=>setForm({...form,title:e.target.value})}/></label>
    <label>Description<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})}/></label>
    <label>Date<input type="date" required value={form.date} onChange={e=>setForm({...form,date:e.target.value})}/></label>
    <div className="form-row">
      <label>Start time<input type="time" required value={form.start} onChange={e=>setForm({...form,start:e.target.value})}/></label>
      <label>End time<input type="time" required value={form.end} onChange={e=>setForm({...form,end:e.target.value})}/></label>
    </div>
    <label>Location<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})}/></label>
    <label>Assigned to</label>
    <div className="check-list" style={{marginBottom:14,minWidth:0}}>
      {members.map(m=><label key={m.id} className="check-row"><input type="checkbox" checked={form.memberIds.includes(m.id)} onChange={()=>setForm(f=>({...f,memberIds:f.memberIds.includes(m.id)?f.memberIds.filter(x=>x!==m.id):[...f.memberIds,m.id]}))}/> {m.full_name} — {ROLE_META[m.role]?.label}</label>)}
      {!members.length && <span style={{fontSize:11,color:'var(--text-dim)'}}>No one available yet.</span>}
    </div>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Saving…':'Create event'}</button></div>
  </form></Modal>
}

/* ---------------- Tracker (hours-mode: full ledger, done only) ---------------- */
function Tracker({profile}){
  const [rows,setRows]=useState([])
  const can=profile.role==='admin'||isHead(profile.role); const staff=isStaff(profile.role)
  useEffect(()=>{ load() },[profile.id])
  async function load(){
    let q=supabase.from('schedules').select('*,schedule_members(member_id,profiles(full_name))').eq('department',profile.department).in('status',['completed','done']).order('start_at',{ascending:false})
    const {data}=await q; let list=data||[]
    if(staff) list=list.filter(s=>(s.schedule_members||[]).some(m=>m.member_id===profile.id))
    setRows(list)
  }
  async function del(id){ if(!await confirmDialog({title:'Delete event?',body:'This cannot be undone.',danger:true,confirmLabel:'Delete'})) return; await supabase.from('schedules').delete().eq('id',id); load() }
  return <div>
    <section className="page-head"><div><div className="eyebrow">FULL LEDGER</div><h1>Tracker</h1><p>Finished sessions in {profile.department}, with hours and status.</p></div></section>
    <div className="panel table-panel tracker-table">
      <div className="table-head"><span>Event</span><span>Date • Time</span><span>Members</span><span>Hours</span><span>Status</span>{can && <span>Action</span>}</div>
      {rows.map(r=><div className="table-row" key={r.id}><strong>{r.title}</strong><span>{new Date(r.start_at).toLocaleDateString()} • {fmtTime(r.start_at)}–{fmtTime(r.end_at)}</span>
        <span>{(r.schedule_members||[]).map(m=>m.profiles?.full_name).join(', ')||'—'}</span>
        <span>{Math.max(0,(new Date(r.end_at)-new Date(r.start_at))/3600000).toFixed(1)}h</span>
        <span className={`status ${r.status}`}>{r.status}</span>
        {can && <span><button className="icon-btn" onClick={()=>del(r.id)}><Trash2 size={14}/></button></span>}</div>)}
      {!rows.length && <div className="empty">Nothing finished yet.</div>}
    </div>
  </div>
}

/* ---------------- Colorist Tracker (split: graded by head vs by staff) ---------------- */
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
  useEffect(()=>{ (async()=>{ const {data}=await supabase.from('profiles').select('id,full_name,role').order('full_name'); setPeople(data||[]) })() },[])
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
    {form.audience==='custom' && <><label>Recipients</label><div className="check-list" style={{marginBottom:14,minWidth:0,maxHeight:220,overflow:'auto'}}>
      {people.map(p=><label key={p.id} className="check-row"><input type="checkbox" checked={form.target.includes(p.id)} onChange={()=>setForm(f=>({...f,target:f.target.includes(p.id)?f.target.filter(x=>x!==p.id):[...f.target,p.id]}))}/> {p.full_name} — {ROLE_META[p.role]?.label}</label>)}
    </div></>}
    <label>By<input value={profile.full_name} disabled/></label>
    <div className="modal-actions"><button type="button" className="secondary-btn" onClick={onClose}>Cancel</button><button className="primary-btn" disabled={busy}>{busy?'Sending…':'Send announcement'}</button></div>
  </form></Modal>
}

/* ---------------- Members (roster + drill-down) ---------------- */
function Members({profile,deptFocus,onClearFocus}){
  const [rows,setRows]=useState([]); const [open,setOpen]=useState(false); const [detail,setDetail]=useState(null); const [filter,setFilter]=useState('')
  const isAdmin=profile.role==='admin'
  const dept=deptFocus || filter || (isAdmin?null:profile.department)
  useEffect(()=>{ load() },[profile.id,deptFocus,filter])
  async function load(){ let q=supabase.from('profiles').select('*').order('full_name'); if(dept) q=q.eq('department',dept); else if(!isAdmin) q=q.eq('department',profile.department); const {data}=await q; setRows((data||[]).sort((a,b)=>roleRank(a.role)-roleRank(b.role))) }
  return <div>
    <section className="page-head"><div><div className="eyebrow">{dept?dept.toUpperCase():'THE TEAM'}</div><h1>Members{dept?` — ${dept}`:''}</h1><p>Click a member to see their full activity.</p></div>
      <div style={{display:'flex',gap:8,alignItems:'center'}}>
        {isAdmin && !deptFocus && <select value={filter} onChange={e=>setFilter(e.target.value)} className="filter-select"><option value="">All departments</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select>}
        {deptFocus && <button className="secondary-btn" onClick={onClearFocus}>Clear filter</button>}
        {isAdmin && <button className="primary-btn" onClick={()=>setOpen(true)}><Plus size={17}/> Create account</button>}
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
  useEffect(()=>{ load() },[member.id])
  async function load(){
    setLoading(true)
    if(mode==='hours'){
      const {data}=await supabase.from('schedules').select('*,schedule_members!inner(member_id)').eq('schedule_members.member_id',member.id).order('start_at',{ascending:false})
      const list=data||[]; setRows(list); setTotal(list.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0))
    } else {
      const {data}=await supabase.from('tasks').select('*').eq('assigned_to',member.id).order('due_date',{ascending:false})
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
    {loading ? <div className="empty">Loading…</div> : <div style={{maxHeight:260,overflow:'auto'}}>
      {rows.map(r=><div key={r.id} style={{padding:'10px 0',borderTop:'1px solid var(--border)'}}>
        <strong style={{fontSize:12,display:'block'}}>{r.title}</strong>
        <span style={{fontSize:11,color:'var(--text-dim)'}}>{mode==='hours' ? `${new Date(r.start_at).toLocaleDateString()} • ${Math.max(0,(new Date(r.end_at)-new Date(r.start_at))/3600000).toFixed(1)}h` : `${r.due_date||'No due date'} • ${r.status.replace('_',' ')}`}</span>
      </div>)}
      {!rows.length && <div className="empty">Nothing logged yet.</div>}
    </div>}
  </Modal>
}

function CreateAccountModal({profile,defaultDept,onClose,onSaved}){
  const [form,setForm]=useState({full_name:'',email:'',password:'',department:defaultDept||'Media',position:'',section:'staff',avatar_url:''})
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('')
  async function save(e){ e.preventDefault(); setBusy(true); setErr('')
    const role = form.section==='admin' ? 'admin' : (form.section==='head'?DEPT_HEAD_ROLE:DEPT_STAFF_ROLE)[form.department]
    const {data:{session}}=await supabase.auth.getSession()
    const res=await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-user`,{ method:'POST', headers:{'Content-Type':'application/json',Authorization:`Bearer ${session.access_token}`}, body:JSON.stringify({full_name:form.full_name,email:form.email,password:form.password,department:form.section==='admin'?'Media':form.department,role,position:form.position,avatar_url:form.avatar_url||null}) })
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
    <label>Section<select value={form.section} onChange={e=>setForm({...form,section:e.target.value})}><option value="admin">Admin</option><option value="head">Head</option><option value="staff">Staff</option></select></label>
    {form.section!=='admin' && <div className="form-row">
      <label>Department<select value={form.department} onChange={e=>setForm({...form,department:e.target.value})}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Position<input value={form.position} onChange={e=>setForm({...form,position:e.target.value})} placeholder="e.g. Photographer"/></label>
    </div>}
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
  const can=profile.role==='admin'||isHead(profile.role)
  const showOutputs = roleMode(profile.role)==='tasks' || profile.role==='admin'
  useEffect(()=>{ load() },[profile.id,deptFilter])
  async function load(){
    const {data}=await supabase.from('resources').select('*').order('created_at',{ascending:false}); setRows(data||[])
    if(showOutputs){ let oq=supabase.from('outputs').select('*,profiles(full_name,position,department,avatar_url)').order('created_at',{ascending:false}); if(profile.role==='admin'){ if(deptFilter) oq=oq.eq('department',deptFilter) } else oq=oq.eq('department',profile.department); const {data:od}=await oq; setOutputs(od||[]) }
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
          {profile.role==='admin' && <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} className="filter-select"><option value="">Writer, Layout, Researcher</option>{DEPARTMENTS.filter(d=>DEPT_MODE[d]==='tasks').map(d=><option key={d}>{d}</option>)}</select>}
          {roleMode(profile.role)==='tasks' && <button className="primary-btn" onClick={()=>setOutOpen(true)}><Plus size={17}/> Log output</button>}
        </div></div>
      <div className="panel table-panel">
        <div className="table-head"><span>Title</span><span>By</span><span>Link</span><span>Notes</span><span>Date</span></div>
        {outputs.map(r=><div className="table-row" key={r.id}><strong>{r.title}</strong>
          <span style={{display:'flex',alignItems:'center',gap:8}}><span className="avatar" style={{width:24,height:24,fontSize:9,flexShrink:0}}>{r.profiles?.avatar_url?<img src={r.profiles.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(r.profiles?.full_name)}</span>
            <span>{r.profiles?.full_name}{profile.role==='admin' && <><br/><small style={{color:'var(--text-dim)',fontSize:10}}>{r.profiles?.position||'—'} • {r.profiles?.department}</small></>}</span></span>
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
  const [form,setForm]=useState({name:'',description:'',url:'',resource_type:'Drive',department:profile.role==='admin'?'':profile.department})
  const [busy,setBusy]=useState(false)
  async function save(e){ e.preventDefault(); setBusy(true); const {error}=await supabase.from('resources').insert({...form,department:form.department||null,created_by:profile.id}); setBusy(false); if(error) notifyDialog(error.message); else { onClose(); onSaved() } }
  return <Modal title="Add resource link" onClose={onClose}><form onSubmit={save}>
    <label>Name<input required placeholder="e.g. Layout Canva Board" value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label>
    <label>Link<input required type="url" value={form.url} onChange={e=>setForm({...form,url:e.target.value})}/></label>
    <div className="form-row">
      <label>Type<select value={form.resource_type} onChange={e=>setForm({...form,resource_type:e.target.value})}><option>Canva</option><option>Drive</option><option>Sheets</option><option>Other</option></select></label>
      <label>Visible to<select value={form.department} onChange={e=>setForm({...form,department:e.target.value})} disabled={profile.role!=='admin'}><option value="">Everyone</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></label>
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
  const filtered=rows.filter(m=>!filter||m.department===filter)
  return <div>
    <section className="page-head"><div><div className="eyebrow">ADMIN ONLY</div><h1>Settings</h1><p>Edit member profiles or reset a password.</p></div>
      <select value={filter} onChange={e=>setFilter(e.target.value)} className="filter-select"><option value="">All departments</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select>
    </section>
    <div className="panel">{filtered.map(m=><div className="settings-row" key={m.id}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div className="avatar">{m.avatar_url?<img src={m.avatar_url} alt="" style={{width:'100%',height:'100%',borderRadius:'50%',objectFit:'cover'}}/>:initials(m.full_name)}</div>
        <div><strong>{m.full_name}</strong><span>{ROLE_META[m.role]?.label} • {m.department}{m.email?` • ${m.email}`:''}</span></div>
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
  const [form,setForm]=useState({full_name:member.full_name,department:member.department,role:member.role,position:member.position||'',active:member.active,avatar_url:member.avatar_url||''})
  const [busy,setBusy]=useState(false); const [err,setErr]=useState('')
  async function save(e){ e.preventDefault(); setBusy(true); setErr('')
    try{ await callManageUser({action:'update_profile',userId:member.id,...form}); onClose(); onSaved() } catch(e){ setErr(e.message) }
    setBusy(false)
  }
  return <Modal title={`Edit ${member.full_name}`} onClose={onClose}><form onSubmit={save}>
    <label>Full name<input required value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})}/></label>
    <label>Profile picture URL<input type="url" placeholder="https://…" value={form.avatar_url} onChange={e=>setForm({...form,avatar_url:e.target.value})}/></label>
    <div className="form-row">
      <label>Department<select value={form.department} onChange={e=>{ const d=e.target.value; const wasHead=form.role===DEPT_HEAD_ROLE[form.department]; setForm({...form,department:d,role:wasHead?DEPT_HEAD_ROLE[d]:DEPT_STAFF_ROLE[d]}) }}>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select></label>
      <label>Role<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}><option value={DEPT_HEAD_ROLE[form.department]}>Head</option><option value={DEPT_STAFF_ROLE[form.department]}>Staff</option></select></label>
    </div>
    <label>Position<input value={form.position} onChange={e=>setForm({...form,position:e.target.value})}/></label>
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
  const isAdmin=profile.role==='admin'
  const [deptFilter,setDeptFilter]=useState('')
  const dept=isAdmin?(deptFilter||null):profile.department
  const [webhook,setWebhook]=useState(''); const [saved,setSaved]=useState(false); const [syncing,setSyncing]=useState(false); const [status,setStatus]=useState('')
  const [people,setPeople]=useState([]); const [detail,setDetail]=useState([]); const [loading,setLoading]=useState(true)
  const scope=dept||'ALL'
  useEffect(()=>{ load() },[profile.id,deptFilter])
  async function load(){
    setLoading(true)
    const {data:intg}=await supabase.from('integrations').select('*').eq('scope',scope).maybeSingle(); setWebhook(intg?.sheet_webhook_url||'')
    let pq=supabase.from('profiles').select('id,full_name,department,role'); if(dept) pq=pq.eq('department',dept)
    const {data:profiles}=await pq
    let tq=supabase.from('tasks').select('assigned_to,title,assigned_date,due_date,status'); if(dept) tq=tq.eq('department',dept)
    const {data:tasks}=await tq
    let sq=supabase.from('schedules').select('id,title,start_at,end_at,status,department,schedule_members(member_id)'); if(dept) sq=sq.eq('department',dept)
    const {data:schedules}=await sq
    const summary=[]; const detailRows=[]
    ;(profiles||[]).forEach(p=>{
      const m=DEPT_MODE[p.department]
      if(m==='hours'){
        const mine=(schedules||[]).filter(s=>(s.schedule_members||[]).some(x=>x.member_id===p.id))
        const hrs=mine.reduce((a,s)=>a+Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000),0)
        summary.push({ Name:p.full_name, Department:p.department, Role:ROLE_META[p.role]?.label, Metric:'Total Hours', Total:hrs.toFixed(1), Events:mine.length })
        mine.forEach(s=>detailRows.push({ Name:p.full_name, Department:p.department, Item:s.title, Date:new Date(s.start_at).toLocaleDateString(), Detail:`${Math.max(0,(new Date(s.end_at)-new Date(s.start_at))/3600000).toFixed(1)}h`, Status:s.status }))
      } else {
        const mine=(tasks||[]).filter(t=>t.assigned_to===p.id)
        summary.push({ Name:p.full_name, Department:p.department, Role:ROLE_META[p.role]?.label, Metric:'Tasks Completed', Total:mine.filter(t=>t.status==='completed').length, Events:mine.length })
        mine.forEach(t=>detailRows.push({ Name:p.full_name, Department:p.department, Item:t.title, Date:`${t.assigned_date||'—'} → ${t.due_date||'—'}`, Detail:t.status.replace('_',' '), Status:t.status }))
      }
    })
    setPeople(summary); setDetail(detailRows); setLoading(false)
  }
  async function saveWebhook(){ const {error}=await supabase.from('integrations').upsert({scope,sheet_webhook_url:webhook,updated_by:profile.id,updated_at:new Date().toISOString()},{onConflict:'scope'}); if(error) notifyDialog(error.message); else { setSaved(true); setTimeout(()=>setSaved(false),2000) } }
  async function syncNow(){ if(!webhook){ notifyDialog('Paste your Google Apps Script Web App URL first.'); return } setSyncing(true); setStatus('')
    try{ await fetch(webhook,{ method:'POST', headers:{'Content-Type':'text/plain;charset=utf-8'}, body:JSON.stringify({scope,syncedAt:new Date().toISOString(),people,detail}) }); setStatus('Sync request sent. Check your Google Sheet.') } catch(err){ setStatus('Could not reach the webhook: '+err.message) }
    setSyncing(false)
  }
  return <div>
    <section className="page-head"><div><div className="eyebrow">GOOGLE SHEETS BACKUP</div><h1>{isAdmin?'Main spreadsheet backup':`${dept} backup`}</h1><p>All-summary CSV, or a per-person detail CSV with every task or event assigned.</p></div>
      {isAdmin && <select value={deptFilter} onChange={e=>setDeptFilter(e.target.value)} className="filter-select"><option value="">All departments</option>{DEPARTMENTS.map(d=><option key={d}>{d}</option>)}</select>}
    </section>
    <div className="panel task-panel" style={{marginBottom:14}}>
      <div className="panel-title"><h2>Connect a Google Sheet</h2></div>
      <p style={{color:'var(--text-dim)',fontSize:12,lineHeight:1.6,marginTop:0}}>Create a Google Sheet, open <b>Extensions → Apps Script</b>, paste the sync script from the project README, deploy it as a <b>Web App</b>, then paste the URL below.</p>
      <div className="form-row"><label>Apps Script Web App URL<input placeholder="https://script.google.com/macros/s/.../exec" value={webhook} onChange={e=>setWebhook(e.target.value)}/></label>
        <div style={{display:'flex',alignItems:'flex-end',gap:8}}><button className="secondary-btn" onClick={saveWebhook}>{saved?'Saved ✓':'Save URL'}</button><button className="primary-btn" onClick={syncNow} disabled={syncing}>{syncing?'Syncing…':'Sync now'}</button></div></div>
      {status && <div className="empty" style={{padding:'10px 0',textAlign:'left'}}>{status}</div>}
    </div>
    <div className="panel table-panel" style={{marginBottom:14}}>
      <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>All summary</h2><div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:11,color:'var(--text-dim)'}}>{people.length} people</span><button className="text-btn" onClick={()=>downloadCSV('backup-summary.csv',people)}><Download size={13}/> Download CSV</button></div></div>
      <div className="table-head"><span>Name</span><span>Department</span><span>Metric</span><span>Total</span><span>Count</span></div>
      {loading ? <div className="empty">Loading…</div> : people.map((p,i)=><div className="table-row" key={i}><strong>{p.Name}</strong><span>{p.Department}</span><span>{p.Metric}</span><span>{p.Total}</span><span>{p.Events}</span></div>)}
      {!loading && !people.length && <div className="empty">No members yet.</div>}
    </div>
    <div className="panel table-panel">
      <div className="panel-title" style={{padding:'21px 21px 0'}}><h2>By person — detail</h2><div style={{display:'flex',alignItems:'center',gap:10}}><span style={{fontSize:11,color:'var(--text-dim)'}}>{detail.length} records</span><button className="text-btn" onClick={()=>downloadCSV('backup-detail.csv',detail)}><Download size={13}/> Download CSV</button></div></div>
      <div className="table-head"><span>Name</span><span>Department</span><span>Item</span><span>Date</span><span>Status</span></div>
      {loading ? <div className="empty">Loading…</div> : detail.map((d,i)=><div className="table-row" key={i}><strong>{d.Name}</strong><span>{d.Department}</span><span>{d.Item}</span><span>{d.Date}</span><span className={`status ${d.Status}`}>{d.Detail}</span></div>)}
      {!loading && !detail.length && <div className="empty">Nothing logged yet.</div>}
    </div>
  </div>
}
