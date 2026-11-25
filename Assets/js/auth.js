/* auth.js — custom auth, session handling, login, initApp (unchanged logic) */
/* ============================================================
   CUSTOM AUTH (no Supabase Auth)
   - user_credentials table: { email, password_hash, salt, profile_id }
   - hash = sha256(salt + password)  (hex)
   - session stored in localStorage: { profileId, email, ts }
   ============================================================ */
const SESSION_KEY = 'vmsp_session';

async function sha256Hex(text){
  const buf = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function randomSalt(len=24){
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function saveSession(profile){
  localStorage.setItem(SESSION_KEY, JSON.stringify({
    profileId: profile.id, email: profile.email, ts: Date.now()
  }));
}
function loadSession(){
  try { return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch(e){ return null; }
}
function clearSession(){ localStorage.removeItem(SESSION_KEY); }

/* ============================================================
   STATE
   ============================================================ */
let currentUser = null;     // profile row
let permissions = null;     // user_permissions row

const PAGES = {
  dashboard:             {label:'Dashboard',                  icon:'layout-dashboard', group:'Main',                key:'dash_main'},
  vehicle_maintenance:   {label:'Vehicle Maintenance',        icon:'wrench',           group:'Automobile Department',key:'dash_vehicle_maintenance'},
  pending_maintenance:   {label:'Pending Maintenance',        icon:'hourglass',            group:'Automobile Department',key:'dash_pending_maintenance'},
  item_requirement:      {label:'Item Requirement Submission',icon:'package-plus',     group:'Automobile Department',key:'dash_item_requirement'},
  item_requirement_list: {label:'Item Requirements',          icon:'list-checks',      group:'Automobile Department',key:'dash_item_requirement', noPg:true},
  maintenance_history:   {label:'Maintenance History',        icon:'history',          group:'Automobile Department',key:'dash_maintenance_history'},
  rom:                   {label:'ROM',                         icon:'clipboard-check',  group:'ROM Department',       key:'dash_rom'},
  supply_chain:          {label:'Supply Chain Management',    icon:'truck',            group:'Supply Chain Department',key:'dash_supply_chain'},
  de_record:             {label:'Filter Entry',               icon:'cylinder',        group:'Data Entry Department',key:'dash_data_entry'},
  de_data:               {label:'Filter Change Data',         icon:'replace',            group:'Data Entry Department',key:'dash_data_entry'},
  oil_record:            {label:'Oil Entry',                  icon:'droplet',         group:'Data Entry Department',key:'dash_data_entry'},
  oil_data:              {label:'Oil Change Data',            icon:'droplets',            group:'Data Entry Department',key:'dash_data_entry'},
  other_record:          {label:'Other Entry',                icon:'cog',       group:'Data Entry Department',key:'dash_data_entry'},
  other_data:            {label:'Spare Change Data',          icon:'package-check',            group:'Data Entry Department',key:'dash_data_entry'},
    maint_calendar:        {label:'Maintenance Schedule Calendar',icon:'calendar-days',  group:'Automobile Department',key:'dash_maint_calendar'},
  maint_overdue:         {label:'Overdue Vehicles',           icon:'alert-triangle',   group:'Automobile Department',key:'dash_maint_calendar'},
  vehicle_status:        {label:'Vehicle Status',            icon:'gauge',            group:'Automobile Department',key:'dash_maint_calendar', noPg:true},
  vehicle_breakdown:     {label:'Vehicle Breakdown Status',  icon:'siren',            group:'Automobile Department',key:'dash_vehicle_maintenance', noPg:true},
  maint_settings:        {label:'Maintenance Interval Settings',icon:'sliders-horizontal',group:'Master Data',   key:'dash_maint_settings'},
  diesel_consumption:    {label:'Diesel Consumption',         icon:'fuel',             group:'Data Entry Department',key:'dash_data_entry'},
  item_master:           {label:'Item Master',                icon:'boxes',            group:'Master Data',          key:'dash_item_master'},
  qr_codes:              {label:'Create & Generate QR Codes', icon:'qr-code',          group:'Master Data',          key:'dash_vehicle_master'},
  filter_dashboard:      {label:'Filter Change Dashboard',    icon:'bar-chart-3',      group:'Master Data',          key:'dash_vehicle_master'},
  de_history:            {label:'Filter Change History',      icon:'file-clock',          group:'Master Data',          key:'dash_vehicle_master'},
  oil_history:           {label:'Oil Change History',         icon:'timer-reset',          group:'Master Data',          key:'dash_vehicle_master'},
  other_history:         {label:'Other Replacement History',  icon:'calendar-clock',          group:'Master Data',          key:'dash_vehicle_master'},
  reports:               {label:'Reports',                    icon:'bar-chart-3',      group:'Reports',              key:'dash_reports'},
  user_access:           {label:'User Access',                icon:'users',            group:'Settings',             key:'dash_user_access'},
  change_password:       {label:'Change Password',            icon:'key-round',        group:'Settings',             key:'dash_settings'},
  bulk_import:           {label:'Bulk CSV Import',            icon:'upload-cloud',     group:'Settings',             key:'dash_settings', superOnly:true},
};

const STATUS_COLORS = {
  'Maintenance Required':'bg-amber-100 text-amber-700',
  'Item Requirement Pending':'bg-orange-100 text-orange-700',
  'Waiting for Item Delivery':'bg-blue-100 text-blue-700',
  'Repair In Progress':'bg-purple-100 text-purple-700',
  'Completed':'bg-green-100 text-green-700',
  'Pending with Reason':'bg-red-100 text-red-700',
  'Submitted to ROM':'bg-amber-100 text-amber-700',
  'Submitted to Supply Chain':'bg-blue-100 text-blue-700',
  'Scheduled':'bg-cyan-100 text-cyan-700',
  'Delivered':'bg-green-100 text-green-700',
  'Rejected':'bg-red-100 text-red-700',
  'Awaiting Scheduling':'bg-slate-100 text-slate-700',
  'Delivery Date Confirmed':'bg-blue-100 text-blue-700',
  'In Transit':'bg-purple-100 text-purple-700',
  'Delayed':'bg-red-100 text-red-700',
  'Active':'bg-green-100 text-green-700',
  'Inactive':'bg-slate-200 text-slate-600',
  'Disabled':'bg-red-100 text-red-700',
};

function badge(s){ const c = STATUS_COLORS[s]||'bg-slate-100 text-slate-700';
  return `<span class="badge ${c}">${escapeHtml(s||'')}</span>`; }

function escapeHtml(s){ return (s==null?'':String(s)).replace(/[&<>"']/g,m=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

function toast(msg, type='info'){
  const box = document.getElementById('toastBox');
  const wrap = document.getElementById('toast');
  const colors = {success:'bg-green-600', error:'bg-red-600', info:'bg-navy-800'};
  box.className = `absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-max max-w-[90vw] px-6 py-4 rounded-xl shadow-2xl text-base font-medium text-white flex items-center justify-center gap-2.5 dlg-bg ${colors[type]||colors.info}`;
  box.innerHTML = `<i data-lucide="${type==='success'?'check-circle':type==='error'?'alert-circle':'info'}" class="w-5 h-5 shrink-0"></i> <span>${escapeHtml(msg)}</span>`;
  wrap.classList.remove('hidden');
  lucide.createIcons();
  clearTimeout(window.__toastT);
  window.__toastT = setTimeout(()=>wrap.classList.add('hidden'), 3500);
}


/* ============================================================
   AUTH  (custom — no Supabase Auth)
   ============================================================ */
document.getElementById('loginForm').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const errBox = document.getElementById('loginError');
  errBox.classList.add('hidden');
  const email = document.getElementById('loginEmail').value.trim().toLowerCase();
  const pass  = document.getElementById('loginPassword').value;
  if (!email || !pass){ errBox.textContent='Enter email and password.'; errBox.classList.remove('hidden'); return; }

  // fetch credentials row by email
  const { data: cred, error: ce } = await db.from('user_credentials')
    .select('id, email, password_hash, salt, profile_id, status')
    .eq('email', email).maybeSingle();
  if (ce){ errBox.textContent = ce.message; errBox.classList.remove('hidden'); return; }
  if (!cred){ errBox.textContent='Invalid email or password.'; errBox.classList.remove('hidden'); return; }
  if (cred.status === 'Disabled'){ errBox.textContent='Your account is disabled. Contact admin.'; errBox.classList.remove('hidden'); return; }

  // hash input password with stored salt, compare
  const inputHash = await sha256Hex(cred.salt + pass);
  if (inputHash !== cred.password_hash){
    errBox.textContent='Invalid email or password.'; errBox.classList.remove('hidden'); return;
  }

  // load profile
  const { data: prof, error: pe } = await db.from('profiles')
    .select('*').eq('id', cred.profile_id).maybeSingle();
  if (pe || !prof){ errBox.textContent='Profile load failed.'; errBox.classList.remove('hidden'); return; }
  if (prof.account_status === 'Disabled'){ errBox.textContent='Your account is disabled.'; errBox.classList.remove('hidden'); return; }

  // update last_login_at
  await db.from('user_credentials').update({last_login_at: new Date().toISOString()}).eq('id', cred.id);

  saveSession(prof);
  await initApp(prof);
});

async function logout(){
  clearSession();
  currentUser = null; permissions = null;
  location.reload();
}

/* On page load — auto-login if a valid session exists */
window.addEventListener('DOMContentLoaded', async ()=>{
  const sess = loadSession();
  const done = ()=>document.documentElement.classList.remove('has-sess');
  if (!sess || !sess.profileId){ done(); return; }
  try {
    // run the profile and credential checks in parallel (same checks as before)
    const profP = db.from('profiles').select('*').eq('id', sess.profileId).maybeSingle();
    const credP = sess.email ? db.from('user_credentials').select('status').eq('email', sess.email).maybeSingle() : null;
    const { data: prof } = await profP;
    if (!prof || prof.account_status === 'Disabled'){ clearSession(); return; }
    let cred;
    if (credP && prof.email === sess.email) ({ data: cred } = await credP);
    else ({ data: cred } = await db.from('user_credentials').select('status').eq('email', prof.email).maybeSingle());
    if (!cred || cred.status === 'Disabled'){ clearSession(); return; }
    await initApp(prof);
  } catch(e){ console.error(e); }
  finally { done(); }
});

async function initApp(prof){
  if (!prof) return;

  // load permissions
  let { data: perms } = await db.from('user_permissions').select('*').eq('user_id', prof.id).maybeSingle();
  if (!perms && prof.role === 'Super Admin'){
    const full = {user_id: prof.id, dash_main:true,dash_vehicle_maintenance:true,dash_pending_maintenance:true,
      dash_item_requirement:true,dash_rom:true,dash_supply_chain:true,dash_vehicle_master:true,
      dash_item_master:true,dash_data_entry:true,dash_maintenance_history:true,dash_user_access:true,dash_reports:true,dash_settings:true,dash_maint_calendar:true,dash_maint_settings:true};
    await db.from('user_permissions').insert(full);
    ({ data: perms } = await db.from('user_permissions').select('*').eq('user_id', prof.id).maybeSingle());
  }
  if (!perms){
    perms = {dash_main:true,dash_settings:true};
  }
  currentUser = prof;
  permissions = perms;

  document.getElementById('loginScreen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');

  buildSwitcher();
  lucide.createIcons();
  route(startRoute());
}

