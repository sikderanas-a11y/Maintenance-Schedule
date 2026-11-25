/* common.js — page registry, permissions, switcher, router, shared helpers */
/* ============================================================
   SIDEBAR / ROUTER
   ============================================================ */
/* ---------- Page-level access ----------
   Several pages share one legacy permission key (e.g. all Data Entry pages -> dash_data_entry).
   Each of those pages also gets its own optional column pg_<page>. Rule:
     pg_<page> true/false  -> explicit per-page setting
     pg_<page> null/absent -> fall back to the legacy shared key (existing users keep their access) */
const PG_SHARED = (()=>{ const c={}; Object.values(PAGES).forEach(p=>{ if(!p.superOnly&&!p.noPg) c[p.key]=(c[p.key]||0)+1; }); return new Set(Object.keys(PAGES).filter(k=>!PAGES[k].superOnly && !PAGES[k].noPg && c[PAGES[k].key]>1)); })();
function pageAllowedFor(perms, name, role){
  const p = PAGES[name]; if (!p) return false;
  if (role==='Super Admin') return true;
  if (p.superOnly) return false;
  perms = perms||{};
  if (PG_SHARED.has(name)){ const v = perms['pg_'+name]; if (v!==undefined && v!==null) return !!v; }
  return !!perms[p.key] || (name==='change_password' && !!perms.dash_settings);
}
const pageAllowed = name => pageAllowedFor(permissions, name, currentUser && currentUser.role);
const pgReady = () => !!permissions && PG_SHARED.size>0 && ('pg_'+[...PG_SHARED][0]) in permissions;
/* ============================================================
   LANDING PAGE (application portal) + top-bar page switcher
   ============================================================ */
const PAGE_CATS = {
  'Overview':{c:'#2563eb',t:'#dbeafe'}, 'Maintenance':{c:'#d97706',t:'#fef3c7'}, 'Requirements':{c:'#0d9488',t:'#ccfbf1'},
  'Approval':{c:'#7c3aed',t:'#ede9fe'}, 'Supply Chain':{c:'#4f46e5',t:'#e0e7ff'}, 'Data Entry':{c:'#16a34a',t:'#dcfce7'},
  'Records':{c:'#0891b2',t:'#cffafe'}, 'History & Analysis':{c:'#db2777',t:'#fce7f3'}, 'Master Data':{c:'#78716c',t:'#e7e5e4'},
  'Reports':{c:'#0284c7',t:'#e0f2fe'}, 'Settings':{c:'#475569',t:'#e2e8f0'}
};
const PAGE_META = {   // page -> [category, description]
  dashboard:          ['Overview','Fleet overview with maintenance status, pending requirements and department activity.'],
  vehicle_maintenance:['Maintenance','Log and manage vehicle maintenance jobs from request to completion.'],
  pending_maintenance:['Maintenance','Track maintenance that is waiting on parts, approval or a recorded reason.'],
  maintenance_history:['Maintenance','Browse completed and past maintenance records for every vehicle.'],
  maint_calendar:     ['Maintenance','Plan and view scheduled maintenance on a calendar.'],
  vehicle_status:     ['Maintenance','Select a vehicle to see its diesel history, service records, upcoming and overdue maintenance in one place.'],
  vehicle_breakdown:  ['Maintenance','See every vehicle that is out of operation, how long it has been down, what is needed to repair it, and download PDF / Excel reports.'],
  maint_overdue:      ['Maintenance','See vehicles whose maintenance is overdue, grouped by how late they are.'],
  item_requirement:   ['Requirements','Request spare parts and items for vehicles. Submissions flow to ROM and Supply Chain with a PDF receipt.'],
  item_requirement_list: ['Requirements','All submitted item requirements: view, edit, delete and download receipts.'],
  rom:                ['Approval','Review item requirements, confirm quantities and pass them on to Supply Chain.'],
  supply_chain:       ['Supply Chain','Schedule deliveries, confirm quantities and follow item delivery status.'],
  de_record:          ['Data Entry','Record a filter change against a vehicle.'],
  oil_record:         ['Data Entry','Record an engine oil change against a vehicle.'],
  other_record:       ['Data Entry','Record the replacement of other spare parts on a vehicle.'],
  diesel_consumption: ['Data Entry','Daily diesel consumption by vehicle, with a heat map to spot unusual usage.'],
  de_data:            ['Records','View and manage every recorded filter change entry.'],
  oil_data:           ['Records','View and manage every recorded oil change entry.'],
  other_data:         ['Records','View and manage every spare part replacement entry.'],
  filter_dashboard:   ['History & Analysis','Analyse filter change frequency and upcoming changes across the fleet.'],
  de_history:         ['History & Analysis','Full history of filter replacements with filters and export.'],
  oil_history:        ['History & Analysis','Full history of oil changes with filters and export.'],
  other_history:      ['History & Analysis','Full history of other spare part replacements.'],
  item_master:        ['Master Data','Maintain the master list of items, codes, categories and units.'],
  qr_codes:           ['Master Data','Register vehicles and generate QR codes for quick data entry.'],
  maint_settings:     ['Master Data','Set the maintenance intervals used for schedules and overdue checks.'],
  reports:            ['Reports','Generate and export operational reports.'],
  user_access:        ['Settings','Manage users, roles and page-level access.'],
  change_password:    ['Settings','Update your account password.'],
  bulk_import:        ['Settings','Import vehicles, items and records in bulk from CSV files.']
};
const pageCat = n => (PAGE_META[n]&&PAGE_META[n][0]) || 'Settings';
const pageCol = n => PAGE_CATS[pageCat(n)] || PAGE_CATS['Settings'];
const setHeader = (title, sub) => { const t=document.getElementById('pageTitle'), s=document.getElementById('pageSub'); if(t) t.textContent=title; if(s) s.textContent=sub; };

function renderHome(){
  swClose(); route.current='home';
  setHeader('XiC (Automobile)','Concept of ROM · Digital maintenance portal');
  document.querySelectorAll('.sw-item').forEach(b=>b.classList.remove('ring-2','ring-teal-500'));
  const names = Object.keys(PAGES).filter(n=>pageAllowed(n));
  const u = currentUser||{};
  const page = document.getElementById('page');
  const card = n => { const p=PAGES[n], k=pageCol(n), meta=PAGE_META[n]||[pageCat(n),''];
    return `<a href="#${n}" data-name="${escapeHtml((p.label+' '+meta[1]+' '+meta[0]).toLowerCase())}" onclick="event.preventDefault();route('${n}')"
      class="hm-card relative flex flex-col bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150" style="--c:${k.c};--t:${k.t}">
      <span class="absolute left-0 top-5 bottom-14 w-[3px] rounded-r" style="background:var(--c)"></span>
      <div class="flex gap-4 p-5 pb-4">
        <span class="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center border" style="background:var(--t);color:var(--c);border-color:color-mix(in srgb,var(--c) 18%,white)"><i data-lucide="${p.icon}" class="w-5 h-5"></i></span>
        <div class="min-w-0"><div class="text-[17px] font-bold text-navy-900 leading-tight">${escapeHtml(p.label)}</div>
          <p class="mt-1 text-sm text-slate-600 leading-snug">${escapeHtml(meta[1])}</p></div>
      </div>
      <div class="mt-auto flex items-center justify-between px-5 py-2.5 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
        <span class="flex items-center gap-2"><span class="w-2 h-2 rounded-full border-2" style="border-color:var(--c)"></span>${escapeHtml(meta[0])}</span>
        <i data-lucide="arrow-right" class="w-4 h-4"></i>
      </div></a>`; };
  page.innerHTML = `<div class="max-w-[1140px] mx-auto">
    <div class="flex items-center justify-between gap-3 pb-3 mb-5 border-b border-slate-200 flex-wrap">
      <div class="text-sm text-slate-600">Welcome, <b class="text-navy-900">${escapeHtml(u.full_name||u.email||'')}</b>
        <span class="text-slate-400">· ${escapeHtml(u.department||'')}${u.role?' · '+escapeHtml(u.role):''}</span></div>
      <button onclick="logout()" class="flex items-center gap-2 text-sm text-slate-600 hover:text-red-600 hover:bg-red-50 rounded-lg px-3 py-1.5"><i data-lucide="log-out" class="w-4 h-4"></i> Logout</button>
    </div>
    <div class="flex items-center justify-between gap-3 mb-5 flex-wrap">
      <div class="relative w-full sm:w-[440px]">
        <i data-lucide="search" class="w-4 h-4 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"></i>
        <input id="hmSearch" type="text" autocomplete="off" placeholder="Search applications" class="w-full pl-11 pr-12 py-3 text-sm rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500"/>
        <kbd class="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] px-2 py-0.5 border border-slate-300 rounded-md bg-slate-50 text-slate-500 pointer-events-none">/</kbd>
      </div>
      <div class="text-sm text-slate-600"><b id="hmCount" class="text-navy-900">${names.length}</b> applications</div>
    </div>
    ${names.length ? `<div id="hmGrid" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">${names.map(card).join('')}</div>
      <div id="hmNone" class="hidden text-center text-slate-500 py-16">No applications match your search.</div>`
      : `<div class="text-center text-slate-500 py-16">No applications are assigned to your account yet. Please contact an administrator.</div>`}
  </div>`;
  const inp=document.getElementById('hmSearch');
  if (inp) inp.addEventListener('input',()=>{
    const q=inp.value.trim().toLowerCase(); let n=0;
    document.querySelectorAll('#hmGrid .hm-card').forEach(c=>{ const ok=!q||q.split(/\s+/).every(t=>c.dataset.name.includes(t)); c.style.display=ok?'':'none'; if(ok) n++; });
    document.getElementById('hmCount').textContent=n; document.getElementById('hmNone').classList.toggle('hidden',n>0);
  });
  lucide.createIcons();
}
if (!window.__hmKeys){ window.__hmKeys=true;
  document.addEventListener('keydown',e=>{
    if (e.key==='Escape') swClose();
    if (e.key==='/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement||{}).tagName||'')){ const i=document.getElementById('hmSearch'); if(i){ e.preventDefault(); i.focus(); } }
  });
  document.addEventListener('click',e=>{ const p=document.getElementById('swPanel'); if(p && !p.classList.contains('hidden') && !p.contains(e.target) && !e.target.closest('#swBtn')) swClose(); });
}

/* ---- top-bar switcher (the only navigation left in the header) ---- */
function swClose(){ const p=document.getElementById('swPanel'); if(p) p.classList.add('hidden'); }
function toggleSwitcher(ev){ if(ev) ev.stopPropagation(); const p=document.getElementById('swPanel'); if(!p) return;
  p.classList.toggle('hidden'); if(!p.classList.contains('hidden')){ const i=document.getElementById('swSearch'); if(i){ i.value=''; swFilter(''); i.focus(); } } }
function swGo(n){ swClose(); route(n); }
function swFilter(q){ q=q.trim().toLowerCase(); document.querySelectorAll('#swGrid .sw-item').forEach(b=>{ b.style.display=(!q||b.dataset.n.includes(q))?'':'none'; }); }
function buildSwitcher(){
  const host=document.getElementById('swList'); if(!host) return;
  const names = Object.keys(PAGES).filter(n=>pageAllowed(n));
  host.innerHTML = `<div id="swGrid" class="grid grid-cols-4 gap-1">${names.map(n=>{ const p=PAGES[n], k=pageCol(n);
    return `<button type="button" class="sw-item flex flex-col items-center gap-1 p-2 rounded-lg hover:bg-slate-100 text-center" data-route="${n}" data-n="${escapeHtml(p.label.toLowerCase())}" title="${escapeHtml(p.label)}" onclick="swGo('${n}')">
      <span class="w-10 h-10 rounded-xl flex items-center justify-center" style="background:${k.t};color:${k.c}"><i data-lucide="${p.icon}" class="w-5 h-5"></i></span>
      <span class="text-[11px] leading-tight text-slate-700 line-clamp-2">${escapeHtml(p.label)}</span></button>`; }).join('')}</div>`;
  const u=currentUser||{}, ue=document.getElementById('swUser');
  if (ue) ue.innerHTML = `<div class="font-semibold text-navy-900 truncate">${escapeHtml(u.full_name||'')}</div><div class="text-slate-500 truncate">${escapeHtml(u.email||'')} · ${escapeHtml(u.department||'')} · ${escapeHtml(u.role||'')}</div>`;
}
function toggleSidebar(){ toggleSwitcher(); }

function route(name){
  if (name==='home'){ if (location.hash!=='#home'){ try{ (location.hash? history.pushState : history.replaceState).call(history,null,'','#home'); }catch(e){} } return renderHome(); }
  if (!PAGES[name]) name='dashboard';
  swClose(); route.current=name;
  const p = PAGES[name];
  if (p.superOnly && currentUser.role !== 'Super Admin'){ toast('Only a Super Admin can open this page.','error'); return; }
  if (!pageAllowed(name)){
    toast('No access to this page.','error'); return;
  }
  setHeader(p.label, 'XiC (Automobile) · Concept of ROM');
  document.querySelectorAll('.sw-item').forEach(b=>{ const on=b.dataset.route===name; b.classList.toggle('ring-2',on); b.classList.toggle('ring-teal-500',on); });
  const page = document.getElementById('page');
  page.innerHTML = `<div class="text-slate-400 text-sm">Loading…</div>`;
  /* lazy-load only the code (and libraries) this page needs, then render */
  const target = (window.ROUTE_MANIFEST && ROUTE_MANIFEST[name]) ? name : 'dashboard';
  const tok = (route.tok = (route.tok||0)+1);
  try{ if (location.hash!=='#'+name) history.pushState(null,'','#'+name); }catch(e){}
  loadRouteChunks(target).then(()=>{ if (tok!==route.tok) return; return (ROUTES[name] || ROUTES.dashboard)(page); })
    .catch(err=>{ page.innerHTML = `<div class="text-red-600 text-sm">Error: ${escapeHtml(err.message)}</div>`; });
  lucide.createIcons();
}

const ROUTES = {};

/* ============================================================
   HELPERS
   ============================================================ */
async function loadVehicles(){
  const { data, error } = await db.from('vehicle_master').select('*').order('vehicle_name');
  if (error) throw error; return (data||[]).map(v=>({...v, registration_number:v.code}));
}
async function loadItems(){
  /* Supabase returns at most 1000 rows per request, so page through the whole table */
  let all=[];
  for (let from=0;;from+=1000){
    const { data, error } = await db.from('items').select('*').order('created_at',{ascending:false}).order('id',{ascending:true}).range(from,from+999);
    if (error) throw error; all=all.concat(data||[]); if (!data || data.length<1000) break;
  }
  return all;
}
function vehicleOptions(vehicles, selId=''){
  return `<option value="">Select vehicle…</option>` + vehicles.map(v=>
    `<option value="${v.id}" data-name="${escapeHtml(v.vehicle_name)}" data-reg="${escapeHtml(v.registration_number)}" ${v.id===selId?'selected':''}>${escapeHtml(v.vehicle_name)} · ${escapeHtml(v.registration_number)}</option>`).join('');
}
function itemOptions(items, selId=''){
  return `<option value="">Select item…</option>` + items.map(i=>
    `<option value="${i.id}" data-name="${escapeHtml(i.item_name)}" ${i.id===selId?'selected':''}>${escapeHtml(i.item_name)} (${escapeHtml(i.item_code)}) · ${escapeHtml(i.unit)}</option>`).join('');
}
function fmtDate(d){ if(!d) return '—'; try{ return new Date(d).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});}catch(e){return d;} }
function fmtDateTime(d){ if(!d) return '—'; try{ return new Date(d).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});}catch(e){return d;} }

function openModal(title, bodyHtml, footerHtml=''){
  const host = document.getElementById('modalHost');
  host.innerHTML = `
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div class="absolute inset-0 modal-bg" onclick="closeModal()"></div>
      <div class="relative bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div class="flex items-center justify-between px-5 py-3 border-b border-slate-200">
          <h3 class="font-semibold text-navy-900">${escapeHtml(title)}</h3>
          <button onclick="closeModal()" class="text-slate-400 hover:text-slate-600"><i data-lucide="x" class="w-5 h-5"></i></button>
        </div>
        <div class="p-5 overflow-y-auto scroll-thin">${bodyHtml}</div>
        ${footerHtml?`<div class="px-5 py-3 border-t border-slate-200 flex justify-end gap-2 bg-slate-50 rounded-b-xl">${footerHtml}</div>`:''}
      </div>
    </div>`;
  lucide.createIcons();
}
/* ============================================================
   IN-PAGE DIALOGS (replace browser confirm / prompt)
   ============================================================ */
function _dlgClose(host, onKey){ host.innerHTML=''; document.removeEventListener('keydown', onKey); }
function confirmDialog(message, opts={}){
  const { title='Please confirm', confirmText='Confirm', cancelText='Cancel', danger=false, icon=danger?'trash-2':'help-circle' } = opts;
  return new Promise(resolve=>{
    const host = document.getElementById('dialogHost');
    const tone = danger ? {bg:'bg-red-50', fg:'text-red-600', btn:'bg-red-600 hover:bg-red-700'} : {bg:'bg-teal-50', fg:'text-teal-600', btn:'bg-teal-600 hover:bg-teal-700'};
    host.innerHTML = `
     <div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
       <div class="absolute inset-0 modal-bg dlg-bg" data-dlg="cancel"></div>
       <div class="dlg-card relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center" role="alertdialog" aria-modal="true">
         <div class="mx-auto w-12 h-12 rounded-full ${tone.bg} ${tone.fg} flex items-center justify-center mb-3"><i data-lucide="${icon}" class="w-6 h-6"></i></div>
         <h3 class="text-lg font-semibold text-navy-900 mb-1">${escapeHtml(title)}</h3>
         <p class="text-sm text-slate-500 mb-5">${escapeHtml(message)}</p>
         <div class="flex gap-2 justify-center">
           <button data-dlg="cancel" class="flex-1 px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50">${escapeHtml(cancelText)}</button>
           <button data-dlg="ok" id="dlgOk" class="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg ${tone.btn}">${escapeHtml(confirmText)}</button>
         </div>
       </div>
     </div>`;
    lucide.createIcons();
    const done = v=>{ _dlgClose(host, onKey); resolve(v); };
    const onKey = e=>{ if(e.key==='Escape') done(false); if(e.key==='Enter') done(true); };
    document.addEventListener('keydown', onKey);
    host.querySelectorAll('[data-dlg]').forEach(b=>b.addEventListener('click',()=>done(b.dataset.dlg==='ok')));
    document.getElementById('dlgOk').focus();
  });
}
function promptDialog(message, opts={}){
  const { title='Enter a value', confirmText='Save', cancelText='Cancel', placeholder='', type='text', icon='key-round' } = opts;
  return new Promise(resolve=>{
    const host = document.getElementById('dialogHost');
    host.innerHTML = `
     <div class="fixed inset-0 z-[70] flex items-center justify-center p-4">
       <div class="absolute inset-0 modal-bg dlg-bg" data-dlg="cancel"></div>
       <div class="dlg-card relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6" role="dialog" aria-modal="true">
         <div class="mx-auto w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-3"><i data-lucide="${icon}" class="w-6 h-6"></i></div>
         <h3 class="text-lg font-semibold text-navy-900 mb-1 text-center">${escapeHtml(title)}</h3>
         <p class="text-sm text-slate-500 mb-4 text-center">${escapeHtml(message)}</p>
         <input id="dlgInput" type="${type}" placeholder="${escapeHtml(placeholder)}" class="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm mb-5"/>
         <div class="flex gap-2">
           <button data-dlg="cancel" class="flex-1 px-4 py-2 text-sm font-medium border border-slate-300 rounded-lg hover:bg-slate-50">${escapeHtml(cancelText)}</button>
           <button data-dlg="ok" class="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg bg-teal-600 hover:bg-teal-700">${escapeHtml(confirmText)}</button>
         </div>
       </div>
     </div>`;
    lucide.createIcons();
    const inp = document.getElementById('dlgInput');
    const done = ok=>{ const v = ok ? inp.value : null; _dlgClose(host, onKey); resolve(v); };
    const onKey = e=>{ if(e.key==='Escape') done(false); if(e.key==='Enter') done(true); };
    document.addEventListener('keydown', onKey);
    host.querySelectorAll('[data-dlg]').forEach(b=>b.addEventListener('click',()=>done(b.dataset.dlg==='ok')));
    inp.focus();
  });
}

function closeModal(){
  if (typeof deStopScan==='function' && deScanner) deStopScan();
  if (typeof oeStopScan==='function' && oeScanner) oeStopScan();
  if (typeof otStopScan==='function' && otScanner) otStopScan();
  document.getElementById('modalHost').innerHTML='';
}

function tableCard(title, cols, rowsHtml, opts={}){
  return `
   <div class="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
     <div class="px-5 py-3 border-b border-slate-200 flex items-center justify-between flex-wrap gap-2">
       <h3 class="font-semibold text-navy-900">${escapeHtml(title)}</h3>
       ${opts.toolbar||''}
     </div>
     <div class="overflow-x-auto scroll-thin">
       <table class="data w-full text-sm">
         <thead><tr>${cols.map(c=>`<th class="text-left px-4 py-2 whitespace-nowrap">${c}</th>`).join('')}</tr></thead>
         <tbody>${rowsHtml}</tbody>
       </table>
     </div>
   </div>`;
}
function emptyRow(cols, msg='No records'){ return `<tr><td colspan="${cols}" class="px-4 py-6 text-center text-slate-400">${msg}</td></tr>`; }

function statCard(label, value, icon, color='bg-teal-50 text-teal-700'){
  return `<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex items-center gap-4">
    <div class="w-12 h-12 rounded-lg ${color} flex items-center justify-center">
      <i data-lucide="${icon}" class="w-6 h-6"></i></div>
    <div>
      <div class="text-2xl font-bold text-navy-900">${value}</div>
      <div class="text-xs text-slate-500">${escapeHtml(label)}</div>
    </div>
  </div>`;
}

async function logActivity(action, entity, entityId, detail){
  try{
    await db.from('activity_logs').insert({
      user_id: currentUser.id, user_email: currentUser.email,
      action, entity, entity_id: entityId?String(entityId):null, detail
    });
  }catch(e){}
}

/* Company logo: paste the base64 data URI of logo.png here (used on login, header and PDF receipt) */
var APP_LOGO='';
if(APP_LOGO) document.querySelectorAll('img[src="../Assets/images/logo.png"]').forEach(i=>{ i.src=APP_LOGO; });
/* Browser/Back-button navigation between pages */
window.addEventListener('hashchange', function(){ if (typeof currentUser!=='undefined' && currentUser) route(startRoute()); });
