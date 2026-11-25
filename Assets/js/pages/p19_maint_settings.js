/* page module (original lines 4396-5055) */
/* ============================================================
   MAINTENANCE INTERVAL SETTINGS / DIESEL ELIGIBILITY / CALENDAR / CHECKLIST
   Tables: maintenance_interval_settings, vehicle_interval_overrides, maintenance_app_settings,
           maintenance_checklist_status, last_filter_consumption, last_oil_consumption, item_replacement_history
   ============================================================ */
const MI_TYPES = [['Hours','Operating Hours'],['Days','Calendar Days'],['Kilometers','Kilometers'],['Diesel Litres','Diesel Consumption (Litres)'],['No Interval','No Interval']];
const MI_LABEL = Object.fromEntries(MI_TYPES), MI_UNIT = {Hours:'hrs',Days:'days',Kilometers:'km','Diesel Litres':'L'};
const miTypeOpts = sel => MI_TYPES.map(([v,l])=>`<option value="${v}" ${v===sel?'selected':''}>${l}</option>`).join('');
const miInp = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm';
const miCard = 'bg-white rounded-xl shadow-sm border border-slate-200 p-5';
const miUser = () => (currentUser && String(currentUser.id)) || null;
const miYmd = d => { const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
const miParse = s => { const [y,m,d]=String(s).slice(0,10).split('-').map(Number); return new Date(y,m-1,d); };
const miFmt = s => { try{ return miParse(s).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }catch(e){ return s; } };
async function miInChunks(table, col, ids, sel='*'){
  let out=[]; for(let i=0;i<ids.length;i+=80){ const { data, error } = await db.from(table).select(sel).in(col, ids.slice(i,i+80)); if(error) throw error; out=out.concat(data||[]); } return out;
}

/* ---- Diesel activity (reuses oilDb.diesel_data: code, vehicle_name, entry_datetime, quantity) ---- */
async function miDieselSetting(){
  const { data } = await db.from('maintenance_app_settings').select('value').eq('key','diesel_eligibility').maybeSingle();
  const v = (data && data.value) || {}; return { enabled: v.enabled!==false, days: Number(v.days)>0 ? Number(v.days) : 14 };
}
async function miLastDiesel(codes){           // latest ACTUAL consumption date (entry_datetime) per vehicle code
  const want = new Set(codes.map(c=>String(c).toUpperCase())), map = new Map(); let from=0;
  for (let page=0; page<40; page++){
    const { data, error } = await oilDb.from('diesel_data').select('code,entry_datetime').order('entry_datetime',{ascending:false}).range(from,from+999);
    if (error) throw error;
    (data||[]).forEach(r=>{ const c=String(r.code||'').toUpperCase(); if(want.has(c) && !map.has(c)) map.set(c, r.entry_datetime); });
    if (!data || data.length<1000 || map.size>=want.size) break; from+=1000;
  }
  return map;
}
async function miEligibility(vehicles){
  const st = await miDieselSetting(), today = new Date(); today.setHours(0,0,0,0);
  const last = st.enabled ? await miLastDiesel(vehicles.map(v=>v.code)) : new Map();
  const rows = vehicles.map(v=>{
    const d = last.get(String(v.code).toUpperCase()); let days = null;
    if (d){ const dd=new Date(d); dd.setHours(0,0,0,0); days = Math.round((today-dd)/864e5); }
    return { v, last:d||null, days, eligible: !st.enabled || (days!==null && days<=st.days) };
  });
  return { st, rows, eligible:new Set(rows.filter(r=>r.eligible).map(r=>r.v.code)) };
}

/* ---------------- Settings page ---------------- */
let miTab='std', miPg=0, miVeh=null;
ROUTES.maint_settings = async host => {
  miTab='std'; miPg=0; miVeh=null;
  host.innerHTML=`<div class="space-y-4"><div class="flex flex-wrap gap-2" id="mi_tabs"></div><div id="mi_body"></div></div>`;
  miRenderTabs(); await miShowTab();
};
function miRenderTabs(){
  const tabs=[['std','Standard Intervals'],['veh','Vehicle Overrides'],['dz','Diesel Activity Eligibility']];
  const t=document.getElementById('mi_tabs'); t.innerHTML=tabs.map(([k,l])=>`<button data-t="${k}" class="px-4 py-2 rounded-lg text-sm font-medium border ${k===miTab?'bg-teal-600 text-white border-teal-600':'bg-white text-slate-600 border-slate-300'}">${l}</button>`).join('');
  t.onclick=async e=>{ const b=e.target.closest('button[data-t]'); if(!b) return; miTab=b.dataset.t; miPg=0; miRenderTabs(); await miShowTab(); };
}
async function miShowTab(){
  const b=document.getElementById('mi_body'); b.innerHTML='<div class="text-slate-400 text-sm">Loading…</div>';
  try{ await ({std:miStd, veh:miVehTab, dz:miDz, mig:miMig}[miTab])(b); }catch(e){ b.innerHTML=`<div class="text-red-600 text-sm">${escapeHtml(e.message)}</div>`; }
}
let miCat='', miCats=null, miTotal=0;
async function miLoadCats(){
  if(miCats) return miCats; const set=new Set();
  for(let from=0;;from+=1000){ const {data,error}=await db.from('items').select('item_category').range(from,from+999); if(error) break; (data||[]).forEach(r=>{ if(r.item_category) set.add(r.item_category); }); if(!data||data.length<1000) break; }
  miCats=[...set].sort((a,b)=>a.localeCompare(b)); return miCats;
}
function miQuickRender(){
  const box=document.getElementById('mi_quick'); if(!box||!miCats) return;
  const pick=n=>miCats.find(c=>c.toLowerCase()===n);
  const btn=(c,l)=>`<button type="button" data-c="${escapeHtml(c)}" class="px-3 py-1 rounded-full border text-sm ${miCat===c?'bg-teal-600 text-white border-teal-600':'border-slate-300 text-slate-700 hover:bg-slate-50'}">${l}</button>`;
  const o=pick('oil'), fl=pick('filter');
  box.innerHTML='<span class="text-xs text-slate-500">Quick filter:</span>'+(o?btn(o,'Oil items'):'')+(fl?btn(fl,'Filter items'):'')+(miCat?`<button type="button" data-c="" class="px-3 py-1 rounded-full border border-slate-300 text-sm text-slate-600 hover:bg-slate-50">Clear category</button>`:'');
}
function miStdQuery(sel,opts){
  let qq=db.from('items').select(sel,opts).order('item_name');
  const q=rhClean((document.getElementById('mi_q')||{}).value);
  if(q) qq=qq.or(`item_name.ilike.%${q}%,item_code.ilike.%${q}%,item_category.ilike.%${q}%`);
  if(miCat) qq=qq.eq('item_category',miCat);
  return qq;
}
async function miBulkApply(){
  const type=document.getElementById('mb_type').value, val=parseFloat(document.getElementById('mb_val').value), qty=parseFloat(document.getElementById('mb_qty').value);
  const en=document.getElementById('mb_en').checked && type!=='No Interval';
  if(type!=='No Interval' && !(val>0)){ toast('Enter an interval value greater than zero.','error'); return; }
  if(!(qty>0)){ toast('Required quantity must be greater than zero.','error'); return; }
  openModal('Apply to all items?', `<p class="text-sm">This will set <b>${escapeHtml(type)}${type==='No Interval'?'':' '+val}</b>, required qty <b>${qty}</b>, ${en?'enabled':'not enabled'} for <b>${miTotal}</b> item(s)${miCat?' in category <b>'+escapeHtml(miCat)+'</b>':''}. Existing settings for these items will be replaced.</p>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button><button id="mb_ok" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Apply</button>`);
  document.getElementById('mb_ok').onclick=async e=>{
    e.target.disabled=true; e.target.textContent='Applying…';
    try{
      let ids=[]; for(let from=0;;from+=1000){ const qq=miStdQuery('id'); const {data,error}=await qq.range(from,from+999); if(error) throw error; ids=ids.concat((data||[]).map(r=>r.id)); if(!data||data.length<1000) break; }
      const now=new Date().toISOString();
      for(let i=0;i<ids.length;i+=200){
        const rows=ids.slice(i,i+200).map(id=>({item_id:id, enabled:en, interval_value:type==='No Interval'?null:val, interval_type:type, required_qty:qty, updated_by:miUser(), updated_at:now}));
        const {error}=await db.from('maintenance_interval_settings').upsert(rows,{onConflict:'item_id'}); if(error) throw error;
      }
      closeModal(); toast(`Interval applied to ${ids.length} item(s)`,'success'); miStdLoad();
    }catch(err){ closeModal(); toast('Bulk update failed: '+(err.message||err),'error'); }
  };
}
/* standard intervals: searchable + paginated */
async function miStd(b){
  b.innerHTML=`<div class="${miCard}"><div class="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-3"><input id="mi_q" placeholder="Search item name, code or category" class="${miInp} sm:col-span-2 w-full"/>
   <select id="mi_cat" class="${miInp}"><option value="">All categories</option></select>
   <select id="mi_st" class="${miInp}"><option value="">All items</option><option value="cfg">Configured only</option></select></div>
   <div id="mi_quick" class="flex flex-wrap items-center gap-2 mb-3 text-sm"></div>
   <div id="mi_bulk" class="hidden border border-teal-200 bg-teal-50/50 rounded-xl p-3 mb-3">
     <div class="text-sm font-semibold text-navy-900 mb-2">Set interval for all <span id="mi_bn">0</span> items shown by the current filter</div>
     <div class="flex flex-wrap items-end gap-3">
       <div><label class="block text-xs mb-1">Type</label><select id="mb_type" class="${miInp}">${miTypeOpts('No Interval')}</select></div>
       <div><label class="block text-xs mb-1">Interval</label><input id="mb_val" type="number" min="0" step="any" class="${miInp} w-28" disabled/></div>
       <div><label class="block text-xs mb-1">Req. qty</label><input id="mb_qty" type="number" min="0" step="any" value="1" class="${miInp} w-24"/></div>
       <label class="flex items-center gap-2 text-sm pb-2"><input id="mb_en" type="checkbox" checked/> Enabled</label>
       <button id="mb_go" class="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Apply to all</button>
     </div></div>
   <p class="text-xs text-slate-500 mb-3">Search to configure. "No Interval" items never auto-schedule but stay available for manual replacement entry.</p>
   <div id="mi_list"></div><div class="flex items-center justify-between mt-3"><button id="mi_pv" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Previous</button><span id="mi_pi" class="text-sm text-slate-500"></span><button id="mi_nx" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Next</button></div></div>`;
  document.getElementById('mi_q').oninput=()=>{ miPg=0; clearTimeout(window._miT); window._miT=setTimeout(miStdLoad,250); };
  document.getElementById('mi_cat').onchange=e=>{ miCat=e.target.value; miPg=0; miQuickRender(); miStdLoad(); };
  document.getElementById('mi_st').onchange=()=>{ miPg=0; miStdLoad(); };
  document.getElementById('mb_type').onchange=e=>{ const v=document.getElementById('mb_val'); v.disabled=e.target.value==='No Interval'; if(v.disabled) v.value=''; };
  document.getElementById('mb_go').onclick=miBulkApply;
  document.getElementById('mi_quick').onclick=e=>{ const b=e.target.closest('button[data-c]'); if(!b) return; miCat=b.dataset.c; document.getElementById('mi_cat').value=miCat; miPg=0; miQuickRender(); miStdLoad(); };
  miLoadCats().then(cs=>{ const sel=document.getElementById('mi_cat'); if(!sel) return; sel.innerHTML='<option value="">All categories</option>'+cs.map(c=>`<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join(''); sel.value=miCat; miQuickRender(); });
  document.getElementById('mi_pv').onclick=()=>{ miPg--; miStdLoad(); }; document.getElementById('mi_nx').onclick=()=>{ miPg++; miStdLoad(); };
  document.getElementById('mi_list').addEventListener('change',e=>{ const t=e.target; if(t.dataset.k==='type'){ const r=t.closest('tr'); r.querySelector('[data-k=val]').disabled=t.value==='No Interval'; } });
  document.getElementById('mi_list').addEventListener('click',e=>{ const s=e.target.closest('button[data-save]'); if(s) miStdSave(s.closest('tr')); });
  await miStdLoad();
}
async function miStdLoad(){
  const out=document.getElementById('mi_list'); if(!out) return; const PG=10;
  const qq=miStdQuery('id,item_name,item_code,item_category,unit,status',{count:'exact'});
  const { data, count, error } = await qq.range(miPg*PG, miPg*PG+PG-1); if(error){ out.innerHTML=`<div class="text-red-600">${escapeHtml(error.message)}</div>`; return; }
  const sets = data.length ? await miInChunks('maintenance_interval_settings','item_id',data.map(i=>i.id)) : []; const sm=new Map(sets.map(s=>[s.item_id,s]));
  out.innerHTML=data.length?`<div class="overflow-x-auto"><table class="data w-full text-sm"><thead><tr><th class="text-left px-2 py-2">Item</th><th class="text-left px-2 py-2">Category</th><th class="px-2 py-2">Enabled</th><th class="px-2 py-2">Interval</th><th class="px-2 py-2">Type</th><th class="px-2 py-2">Req. qty</th><th></th></tr></thead><tbody>
   ${data.map(i=>{ const s=sm.get(i.id)||{}; const ty=s.interval_type||'No Interval'; return `<tr data-id="${i.id}"><td class="px-2 py-2">${escapeHtml(i.item_name)}<div class="font-mono text-[11px] text-slate-400">${escapeHtml(i.item_code||'')} · ${escapeHtml(i.unit||'')}</div></td><td class="px-2 py-2">${escapeHtml(i.item_category||'—')}</td>
   <td class="px-2 py-2 text-center"><input type="checkbox" data-k="en" ${s.enabled?'checked':''}/></td>
   <td class="px-2 py-2"><input type="number" data-k="val" min="0" step="any" value="${s.interval_value??''}" ${ty==='No Interval'?'disabled':''} class="${miInp} w-24"/></td>
   <td class="px-2 py-2"><select data-k="type" class="${miInp}">${miTypeOpts(ty)}</select></td>
   <td class="px-2 py-2"><input type="number" data-k="qty" min="0" step="any" value="${s.required_qty??1}" class="${miInp} w-20"/></td>
   <td class="px-2 py-2"><button data-save class="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save</button></td></tr>`; }).join('')}</tbody></table></div>`
   :'<div class="py-6 text-center text-slate-400">No items found.</div>';
  const tot=count||0; miTotal=tot; const bn=document.getElementById('mi_bn'); if(bn) bn.textContent=tot; const bk=document.getElementById('mi_bulk'); if(bk) bk.classList.toggle('hidden', !(miCat||rhClean(document.getElementById('mi_q').value)) || !tot);
  document.getElementById('mi_pi').textContent=`${tot?miPg*PG+1:0}–${Math.min(tot,miPg*PG+PG)} of ${tot}`;
  document.getElementById('mi_pv').disabled=miPg===0; document.getElementById('mi_nx').disabled=(miPg+1)*PG>=tot;
}
async function miStdSave(tr){
  const g=k=>tr.querySelector(`[data-k=${k}]`), type=g('type').value, en=g('en').checked && type!=='No Interval', val=parseFloat(g('val').value), qty=parseFloat(g('qty').value);
  if(type!=='No Interval' && !(val>0)){ toast('Enter an interval value greater than zero.','error'); return; }
  if(!(qty>0)){ toast('Required quantity must be greater than zero.','error'); return; }
  const { error } = await db.from('maintenance_interval_settings').upsert({ item_id:tr.dataset.id, enabled:en, interval_value:type==='No Interval'?null:val, interval_type:type, required_qty:qty, updated_by:miUser(), updated_at:new Date().toISOString() },{onConflict:'item_id'});
  if(error){ toast('Not saved: '+error.message,'error'); return; }
  g('en').checked=en; toast('Interval saved','success');
}
/* vehicle-specific overrides */
async function miVehTab(b){
  await fqLoadVehiclesLegacy(); miVeh=null; /* Vehicle Overrides lists only vehicles in vehicle_master */
  b.innerHTML=`<div id="mv_listview" class="${miCard} space-y-3">
    <div class="flex flex-wrap items-center gap-3"><input id="mv_q" autocomplete="off" placeholder="Search vehicle name or code" class="${miInp} flex-1 min-w-[14rem]"/>
      <label class="flex items-center gap-2 text-sm"><input type="checkbox" id="mv_only" class="w-4 h-4 accent-teal-600"/> Only vehicles with overrides</label><span id="mv_cnt" class="text-xs text-slate-500"></span></div>
    <div id="mv_all" class="text-sm text-slate-400">Loading vehicles…</div></div>
   <div id="mv_detail" class="${miCard} space-y-3 hidden"><div class="flex flex-wrap items-center gap-3"><button id="mv_back" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-sm">&larr; All vehicles</button><div id="mv_sel" class="font-semibold"></div></div><div id="mv_work"></div></div>`;
  let counts=new Map();
  const loadCounts=async()=>{ counts=new Map(); for(let from=0;;from+=1000){ const { data } = await db.from('vehicle_interval_overrides').select('vehicle_code').range(from,from+999); (data||[]).forEach(r=>counts.set(r.vehicle_code,(counts.get(r.vehicle_code)||0)+1)); if(!data||data.length<1000) break; } };
  const draw=()=>{
    const q=document.getElementById('mv_q').value.trim(), only=document.getElementById('mv_only').checked;
    const list=fqVehicles.filter(v=>(!q||deMatch(v,q)) && (!only||counts.get(v.code))).slice().sort((x,y)=>String(x.vehicle_name).localeCompare(String(y.vehicle_name),undefined,{numeric:true}));
    document.getElementById('mv_cnt').textContent=`${list.length} of ${fqVehicles.length} vehicles`;
    document.getElementById('mv_all').innerHTML=list.length?`<div class="overflow-auto max-h-[65vh] border border-slate-200 rounded-lg"><table class="data w-full text-sm"><thead class="sticky top-0 bg-slate-50"><tr><th class="text-left px-3 py-2">#</th><th class="text-left px-3 py-2">Vehicle</th><th class="text-left px-3 py-2">Code</th><th class="text-left px-3 py-2">Overrides</th><th class="px-3 py-2"></th></tr></thead><tbody>
      ${list.map((v,i)=>{ const c=counts.get(v.code)||0; return `<tr data-id="${v.id}" class="cursor-pointer hover:bg-teal-50"><td class="px-3 py-2 text-slate-400">${i+1}</td><td class="px-3 py-2 font-medium">${escapeHtml(v.vehicle_name)}</td><td class="px-3 py-2 font-mono text-xs text-slate-500">${escapeHtml(v.code)}</td>
        <td class="px-3 py-2">${c?`<span class="px-2 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-700">${c}</span>`:'<span class="text-slate-300">—</span>'}</td><td class="px-3 py-2 text-right whitespace-nowrap"><span class="text-teal-700 text-xs font-medium">Manage →</span></td></tr>`; }).join('')}</tbody></table></div>`
      :'<div class="py-6 text-center text-slate-400">No matching vehicle.</div>';
  };
  const showList=async()=>{ miVeh=null; document.getElementById('mv_detail').classList.add('hidden'); document.getElementById('mv_listview').classList.remove('hidden'); await loadCounts(); draw(); };
  document.getElementById('mv_q').oninput=draw; document.getElementById('mv_only').onchange=draw;
  document.getElementById('mv_all').onclick=e=>{ const r=e.target.closest('tr[data-id]'); if(!r) return; miVeh=fqVehicles.find(v=>v.id==r.dataset.id); if(!miVeh) return;
    document.getElementById('mv_listview').classList.add('hidden'); document.getElementById('mv_detail').classList.remove('hidden');
    document.getElementById('mv_sel').innerHTML=`${escapeHtml(miVeh.vehicle_name)} <span class="font-mono text-xs text-slate-500">${escapeHtml(miVeh.code)}</span>`; miVehWork(); };
  document.getElementById('mv_back').onclick=showList;
  await loadCounts(); draw();
}
async function miVehWork(){
  const w=document.getElementById('mv_work');
  w.innerHTML=`<div class="flex flex-wrap items-center gap-3"><h4 class="text-sm font-semibold text-slate-600">Scheduled items &amp; intervals <span class="font-normal text-slate-400">— defaults come from Standard Intervals; fill the override columns to change them for this vehicle</span></h4><input id="mv_f" placeholder="Filter items" class="${miInp} w-56 ml-auto"/></div>
   <div id="mv_list" class="text-sm text-slate-400">Loading scheduled items…</div>
   <details class="mt-2 border border-dashed border-slate-300 rounded-lg p-3"><summary class="cursor-pointer text-sm font-semibold text-teal-700">Add an override for an item that has no standard interval</summary>
    <div class="mt-3"><input id="mv_iq" autocomplete="off" placeholder="Item name, code or category" class="${miInp} w-full"/><div id="mv_ires" class="hidden mt-2 rounded-lg bg-slate-100 max-h-60 overflow-auto"></div><div id="mv_edit" class="mt-3"></div></div></details>`;
  let T, found=[];
  document.getElementById('mv_iq').oninput=()=>{ clearTimeout(T); T=setTimeout(async()=>{ const q=rhClean(document.getElementById('mv_iq').value), box=document.getElementById('mv_ires'); if(q.length<2){ box.classList.add('hidden'); return; }
    const { data } = await db.from('items').select('id,item_name,item_code,item_category,unit,status').or(`item_name.ilike.%${q}%,item_code.ilike.%${q}%,item_category.ilike.%${q}%`).order('item_name').limit(30);
    found=(data||[]).filter(i=>i.status!=='Inactive').slice(0,15); box.classList.remove('hidden');
    box.innerHTML=found.length?found.map((i,k)=>`<button type="button" data-k="${k}" class="block w-full px-4 py-2.5 text-left border-b border-slate-200 bg-white hover:bg-teal-50"><div class="text-sm font-medium">${escapeHtml(i.item_name)}</div><div class="text-xs text-slate-500">${escapeHtml(i.item_code||'')} · ${escapeHtml(i.item_category||'—')}</div></button>`).join(''):'<div class="p-4 text-sm text-slate-500">No active items found</div>'; },250); };
  document.getElementById('mv_ires').onclick=e=>{ const x=e.target.closest('button[data-k]'); if(x){ document.getElementById('mv_ires').classList.add('hidden'); document.getElementById('mv_iq').value=''; miVehEdit(found[+x.dataset.k]); } };
  const L=document.getElementById('mv_list');
  document.getElementById('mv_f').oninput=()=>miVehDraw();
  L.addEventListener('change',e=>{ const t=e.target; if(t.dataset.k==='type'){ t.closest('tr').querySelector('[data-k=val]').disabled=t.value==='No Interval'; } });
  L.addEventListener('click',e=>{ const sv=e.target.closest('button[data-save]'), rs=e.target.closest('button[data-reset]'); if(sv) miVehSaveRow(sv.closest('tr')); else if(rs) miVehResetRow(rs.closest('tr')); });
  await miVehList();
}
let miVL=[];
async function miVehList(){
  const el=document.getElementById('mv_list'); if(!el||!miVeh) return;
  try{
    let sets=[]; for(let from=0;;from+=1000){ const { data, error } = await db.from('maintenance_interval_settings').select('*').eq('enabled',true).range(from,from+999); if(error) throw error; sets=sets.concat(data||[]); if(!data||data.length<1000) break; }
    sets=sets.filter(x=>x.interval_type!=='No Interval'); const sm=new Map(sets.map(x=>[x.item_id,x]));
    const { data:ovs, error:oe } = await db.from('vehicle_interval_overrides').select('*').eq('vehicle_code',miVeh.code); if(oe) throw oe; const om=new Map((ovs||[]).map(o=>[o.item_id,o]));
    const ids=[...new Set([...sm.keys(),...om.keys()])]; const items=ids.length?await miInChunks('items','id',ids,'id,item_name,item_code,item_category,unit,status'):[]; const im=new Map(items.map(i=>[i.id,i]));
    miVL=ids.map(id=>({it:im.get(id),std:sm.get(id)||null,ov:om.get(id)||null})).filter(r=>r.it && (r.it.status!=='Inactive'||r.ov))
      .sort((a,b)=>String(a.it.item_category||'').localeCompare(String(b.it.item_category||''))||String(a.it.item_name).localeCompare(String(b.it.item_name),undefined,{numeric:true}));
  }catch(err){ el.innerHTML=`<div class="text-red-600">${escapeHtml(err.message)}</div>`; return; }
  miVehDraw();
}
function miVehDraw(){
  const el=document.getElementById('mv_list'); if(!el) return; const f=((document.getElementById('mv_f')||{}).value||'').trim().toLowerCase();
  const rows=miVL.filter(r=>!f||r.it.item_name.toLowerCase().includes(f)||String(r.it.item_code||'').toLowerCase().includes(f)||String(r.it.item_category||'').toLowerCase().includes(f));
  if(!rows.length){ el.className='py-6 text-center text-slate-400 text-sm'; el.textContent=miVL.length?'No items match the filter.':'No items have a standard interval yet. Set them in the Standard Intervals tab, or add an override below.'; return; }
  el.className='text-sm';
  el.innerHTML=`<div class="overflow-auto max-h-[60vh] border border-slate-200 rounded-lg"><table class="data w-full text-sm"><thead class="sticky top-0 bg-slate-50"><tr><th class="text-left px-3 py-2">Item</th><th class="text-left px-3 py-2 whitespace-nowrap">Default interval</th><th class="text-left px-3 py-2">Override for this vehicle</th><th class="text-left px-3 py-2">Status</th><th class="px-3 py-2"></th></tr></thead><tbody>
   ${rows.map(r=>{ const {it,std,ov}=r, dv=std?`${std.interval_value} ${MI_UNIT[std.interval_type]}`:'—', dq=std?(std.required_qty??1):'';
     const ty=ov?.interval_type||std?.interval_type||'Days', st=ov?(ov.interval_type==='No Interval'?['Not scheduled for this vehicle','bg-purple-100 text-purple-700']:['Overridden','bg-teal-100 text-teal-700']):['Default','bg-slate-100 text-slate-600'];
     return `<tr data-id="${it.id}" class="align-top"><td class="px-3 py-2"><div class="font-medium">${escapeHtml(it.item_name)}</div><div class="font-mono text-[11px] text-slate-400">${escapeHtml(it.item_code||'')} · ${escapeHtml(it.item_category||'—')}</div></td>
      <td class="px-3 py-2 whitespace-nowrap"><div class="font-semibold">${escapeHtml(dv)}</div>${std?`<div class="text-[11px] text-slate-400">qty ${dq} ${escapeHtml(it.unit||'')}</div>`:'<div class="text-[11px] text-slate-400">no standard interval</div>'}</td>
      <td class="px-3 py-2"><div class="flex flex-wrap gap-1.5"><input type="number" data-k="val" min="0" step="any" value="${ov?.interval_value??''}" placeholder="${std?std.interval_value:'Value'}" ${ty==='No Interval'?'disabled':''} class="${miInp} w-24"/><select data-k="type" class="${miInp}">${miTypeOpts(ty)}</select><input type="number" data-k="qty" min="0" step="any" value="${ov?.required_qty??''}" placeholder="${std?dq:'Qty'}" class="${miInp} w-20" title="Required quantity"/></div></td>
      <td class="px-3 py-2"><span class="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${st[1]}">${st[0]}</span></td>
      <td class="px-3 py-2 whitespace-nowrap"><button data-save class="px-3 py-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save override</button>${ov?'<button data-reset class="ml-2 px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg">Reset to default</button>':''}</td></tr>`; }).join('')}</tbody></table></div>`;
}
async function miVehSaveRow(tr){
  const g=k=>tr.querySelector(`[data-k=${k}]`), type=g('type').value, val=parseFloat(g('val').value), qty=parseFloat(g('qty').value), r=miVL.find(x=>x.it.id==tr.dataset.id); if(!r) return;
  if(type!=='No Interval' && !(val>0)){ toast('Enter an override value greater than zero.','error'); return; }
  const btn=tr.querySelector('[data-save]'); btn.disabled=true;
  const { error } = await db.from('vehicle_interval_overrides').upsert({ vehicle_code:miVeh.code, vehicle_name:miVeh.vehicle_name, item_id:r.it.id, interval_type:type, interval_value:type==='No Interval'?null:val, required_qty:qty>0?qty:null, updated_by:miUser(), updated_at:new Date().toISOString() },{onConflict:'vehicle_code,item_id'});
  if(error){ btn.disabled=false; toast('Not saved: '+error.message,'error'); return; }
  toast('Override saved','success'); await miVehList();
}
async function miVehResetRow(tr){
  const r=miVL.find(x=>x.it.id==tr.dataset.id); if(!r) return;
  const { error } = await db.from('vehicle_interval_overrides').delete().eq('vehicle_code',miVeh.code).eq('item_id',r.it.id);
  if(error){ toast(error.message,'error'); return; } toast('Reset to default','success'); await miVehList();
}
async function miVehEdit(it){
  const { data:std } = await db.from('maintenance_interval_settings').select('*').eq('item_id',it.id).maybeSingle();
  const { data:ov } = await db.from('vehicle_interval_overrides').select('*').eq('vehicle_code',miVeh.code).eq('item_id',it.id).maybeSingle();
  const stdTxt = std && std.enabled && std.interval_type!=='No Interval' ? `${std.interval_value} ${MI_UNIT[std.interval_type]}` : 'No Interval / not enabled';
  document.getElementById('mv_edit').innerHTML=`<div class="border border-slate-200 rounded-xl p-4 space-y-3"><div class="font-semibold">${escapeHtml(it.item_name)} <span class="font-mono text-xs text-slate-500">${escapeHtml(it.item_code||'')}</span></div>
   <div class="text-sm text-slate-500">Standard interval: <b>${stdTxt}</b></div>
   <div class="flex flex-wrap gap-2 items-center"><input type="number" id="mv_val" min="0" step="any" placeholder="Override" value="${ov?.interval_value??''}" class="${miInp} w-28"/><select id="mv_type" class="${miInp}">${miTypeOpts(ov?.interval_type||std?.interval_type||'Hours')}</select>
   <input type="number" id="mv_qty" min="0" step="any" placeholder="Req. qty" value="${ov?.required_qty??''}" class="${miInp} w-24"/></div>
   <div class="flex gap-2"><button id="mv_save" class="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save override</button>${ov?'<button id="mv_del" class="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg">Remove override</button>':''}</div></div>`;
  document.getElementById('mv_save').onclick=async()=>{ const type=document.getElementById('mv_type').value, val=parseFloat(document.getElementById('mv_val').value), qty=parseFloat(document.getElementById('mv_qty').value);
    if(type!=='No Interval' && !(val>0)){ toast('Enter an override value greater than zero.','error'); return; }
    const { error } = await db.from('vehicle_interval_overrides').upsert({ vehicle_code:miVeh.code, vehicle_name:miVeh.vehicle_name, item_id:it.id, interval_type:type, interval_value:type==='No Interval'?null:val, required_qty:qty>0?qty:null, updated_by:miUser(), updated_at:new Date().toISOString() },{onConflict:'vehicle_code,item_id'});
    if(error){ toast('Not saved: '+error.message,'error'); return; } toast('Override saved','success'); document.getElementById('mv_edit').innerHTML=''; miVehList(); };
  const d=document.getElementById('mv_del'); if(d) d.onclick=async()=>{ const { error } = await db.from('vehicle_interval_overrides').delete().eq('vehicle_code',miVeh.code).eq('item_id',it.id); if(error){ toast(error.message,'error'); return; } toast('Override removed','success'); document.getElementById('mv_edit').innerHTML=''; miVehList(); };
}
/* diesel eligibility */
async function miDz(b){
  const st=await miDieselSetting();
  b.innerHTML=`<div class="${miCard} space-y-4"><div class="flex flex-wrap items-center gap-4"><label class="flex items-center gap-2 text-sm font-medium"><input type="checkbox" id="dz_en" ${st.enabled?'checked':''}/> Enable diesel activity filtering</label>
    <label class="text-sm">Minimum diesel activity period <input type="number" id="dz_days" min="1" value="${st.days}" class="${miInp} w-20 mx-1"/> days</label><button id="dz_save" class="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save</button></div>
    <p class="text-xs text-slate-500">Uses the latest actual consumption date (entry_datetime) in the Diesel project (diesel_data). Vehicles with no diesel history are excluded while filtering is on. Maintenance history is never deleted.</p>
    <div id="dz_out" class="text-sm text-slate-400">Loading vehicles…</div></div>`;
  document.getElementById('dz_save').onclick=async()=>{ const days=parseInt(document.getElementById('dz_days').value,10); if(!(days>0)){ toast('Enter days greater than zero.','error'); return; }
    const { error } = await db.from('maintenance_app_settings').upsert({ key:'diesel_eligibility', value:{enabled:document.getElementById('dz_en').checked, days}, updated_by:miUser(), updated_at:new Date().toISOString() },{onConflict:'key'});
    if(error){ toast('Not saved: '+error.message,'error'); return; } toast('Setting saved','success'); miShowTab(); };
  await fqLoadVehicles(); const el=await miEligibility(fqVehicles), ex=el.rows.filter(r=>!r.eligible), out=document.getElementById('dz_out');
  out.className='text-sm'; out.innerHTML=`<div class="mb-2 font-semibold">Excluded vehicles: ${ex.length} of ${el.rows.length}</div>`+(ex.length?`<div class="overflow-x-auto"><table class="data w-full text-sm"><thead><tr><th class="text-left px-2 py-2">Vehicle</th><th class="text-left px-2 py-2">Code</th><th class="text-left px-2 py-2">Last diesel</th><th class="text-left px-2 py-2">Days ago</th></tr></thead><tbody>${ex.map(r=>`<tr><td class="px-2 py-2">${escapeHtml(r.v.vehicle_name)}</td><td class="px-2 py-2 font-mono text-xs">${escapeHtml(r.v.code)}</td><td class="px-2 py-2">${r.last?fmtDateTime(r.last):'No history'}</td><td class="px-2 py-2">${r.days??'—'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="text-slate-400">None.</div>');
}
/* one-time migration of legacy oil_entries (oil project) into item_replacement_history */
async function miHashUuid(s){ const b=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))); const h=Array.from(b).slice(0,16).map(x=>x.toString(16).padStart(2,'0')).join(''); return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`; }
async function miMig(b){
  b.innerHTML=`<div class="${miCard} space-y-3"><h3 class="font-semibold text-navy-900">Migrate old Oil entries</h3><p class="text-sm text-slate-500">Copies legacy <b>oil_entries</b> (oil project) into <b>item_replacement_history</b>. Oil type names must exactly match an Oil-category item name; anything unmatched is listed for manual review and NOT assigned. Safe to re-run (no duplicates). The old table is not changed. Filter history is migrated with SQL file 03.</p>
   <button id="mg_run" class="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Run Oil migration</button><div id="mg_out" class="text-sm"></div></div>`;
  document.getElementById('mg_run').onclick=async e=>{
    const btn=e.target, out=document.getElementById('mg_out'); btn.disabled=true; out.textContent='Reading old records…';
    try{
      let all=[], from=0; for(;;){ const { data, error } = await oilDb.from('oil_entries').select('*').order('entry_datetime',{ascending:true}).range(from,from+999); if(error) throw error; all=all.concat(data||[]); if(!data||data.length<1000) break; from+=1000; }
      const items=await rhLoadItems('Oil'), im=new Map(items.map(i=>[i.item_name.trim().toLowerCase(),i]));
      const rows=[], unm=new Map(); let zero=0;
      for(const r of all){ const it=im.get(String(r.oil_type||'').trim().toLowerCase()), q=Number(r.quantity);
        if(!(q>0)){ zero++; continue; } if(!it){ unm.set(r.oil_type,(unm.get(r.oil_type)||0)+1); continue; }
        rows.push({ entry_group_id: await miHashUuid('oil|'+r.code+'|'+r.entry_datetime), vehicle_name:r.vehicle_name, vehicle_code:r.code, item_id:it.id, item_name:it.item_name, item_code:it.item_code, item_category:it.item_category,
          replacement_date:miYmd(new Date(r.entry_datetime)), quantity:q, uom:it.unit||r.unit||null, meter_reading:r.meter_reading, remarks:r.remarks||null, created_at:r.entry_datetime,
          extra_data:{source:'oil_migration',purpose:r.purpose||null,operator_name:r.operator_name||null,company:r.company||null,legacy_id:r.id??null} }); }
      out.textContent=`Writing ${rows.length} rows…`;
      for(let i=0;i<rows.length;i+=200){ const { error } = await db.from(RH_TABLE).upsert(rows.slice(i,i+200),{onConflict:'entry_group_id,item_id',ignoreDuplicates:true}); if(error) throw error; }
      const { count } = await db.from(RH_TABLE).select('id',{count:'exact',head:true}).eq('extra_data->>source','oil_migration');
      out.innerHTML=`<div class="rounded-lg bg-green-50 text-green-700 p-3">Old rows read: <b>${all.length}</b> · valid & matched: <b>${rows.length}</b> · skipped zero qty: <b>${zero}</b> · unmatched: <b>${[...unm.values()].reduce((a,b)=>a+b,0)}</b> · migrated rows now in new table: <b>${count}</b></div>`+
        (unm.size?`<div class="mt-3 font-semibold">Unmatched oil types (review manually, add/rename in Item Master then re-run):</div><ul class="list-disc ml-5">${[...unm].map(([k,v])=>`<li>${escapeHtml(k)} — ${v} rows</li>`).join('')}</ul>`:'');
    }catch(err){ out.innerHTML=`<div class="text-red-600">${escapeHtml(err.message)}</div>`; }
    btn.disabled=false; };
}

/* ---------------- Maintenance Schedule Calendar ---------------- */
let calM=new Date(), calSel=miYmd(new Date()), calData=null, calExcl=[], calPend=new Map();
const calStatus = k => { const t=miYmd(new Date()); return k<t?'overdue':(k===t?'today':'upcoming'); };
const CAL_CLS = {overdue:'bg-red-100 text-red-700',today:'bg-amber-100 text-amber-700',upcoming:'bg-blue-100 text-blue-700'};
const CAL_LBL = {overdue:'Overdue',today:'Due Today',upcoming:'Upcoming'};
/* due-status helpers: red = overdue, orange = due today / within 7 days, green = on time */
const calDiff = k => Math.round((miParse(k) - miParse(miYmd(new Date()))) / 86400000);
function calDueInfo(k, short){
  const d=calDiff(k), pl=n=>n===1?'day':'days';
  if(d<0){ const n=-d; return {cls:'bg-red-50 text-red-700 border-red-200', txt: short?`${n} ${pl(n)}`:`Overdue by ${n} ${pl(n)}`}; }
  if(d===0) return {cls:'bg-orange-50 text-orange-700 border-orange-200', txt:'Due today'};
  if(d<=7) return {cls:'bg-orange-50 text-orange-700 border-orange-200', txt:`Due in ${d} ${pl(d)}`};
  return {cls:'bg-green-50 text-green-700 border-green-200', txt:`On time · ${d} days left`};
}
const calChip = (k, short) => { const i=calDueInfo(k,short); return `<span class="inline-block whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-md border ${i.cls}">${i.txt}</span>`; };
const calEvery = x => { const m=/\+\s*(\d+)\s*days$/.exec(x.note||''); return m?`every ${m[1]} days`:''; };   // interval shown for date-based items
const calUsageNote = x => (x.note && !/^Last /.test(x.note)) ? `<div class="text-[11px] text-slate-400">${escapeHtml(x.note)}</div>` : '';   // hours / km / diesel basis
const calPendTag = x => calPend.has(x.vcode+'|'+x.item_id) ? `<span class="ml-1 align-middle text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1" title="Pending — ${escapeHtml(calPend.get(x.vcode+'|'+x.item_id)||'')}">Pending</span>` : '';
function calVehCard(vc, its, st){
  return `<div class="flex items-center gap-2.5 rounded-lg border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-2 shadow-sm">
    <div class="w-10 shrink-0">${ovIcon(ovKind(its[0].vname,vc))}</div>
    <div class="min-w-0"><div class="text-base font-bold text-navy-900 leading-tight break-words">${escapeHtml(its[0].vname)}</div>
      <div class="font-mono text-[11px] text-slate-500">${escapeHtml(vc)}</div>
      <span class="mt-1 inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded ${CAL_CLS[st]}">${CAL_LBL[st]} · ${its.length} item${its.length>1?'s':''}</span></div></div>`;
}
const calItemCell = x => `<div class="font-medium text-slate-800 leading-tight">${escapeHtml(x.iname)}${calPendTag(x)}</div><div class="text-[11px] text-slate-400">${escapeHtml(x.cat||'')}${x.icode?' · <span class="font-mono">'+escapeHtml(x.icode)+'</span>':''}${calEvery(x)?' · '+calEvery(x):''}</div>${calUsageNote(x)}`;
ROUTES.maint_calendar = async host => {
  calM=new Date(); calM.setDate(1); calSel=miYmd(new Date());
  host.innerHTML=`<div class="space-y-3"><div class="${miCard} !p-3"><div class="flex flex-wrap items-center gap-2 mb-2">
    <button id="cl_pv" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-2.5 py-1 text-xs font-medium">&larr;</button><div id="cl_title" class="font-semibold text-navy-900 min-w-[8rem] text-center text-sm"></div><button id="cl_nx" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-2.5 py-1 text-xs font-medium">&rarr;</button>
    <button id="cl_td" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-2.5 py-1 text-xs font-medium">Today</button><input type="month" id="cl_mo" class="${miInp} !py-1 !text-xs"/><button id="cl_rf" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-2.5 py-1 text-xs font-medium ml-auto">Refresh</button></div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-2"><input id="cl_v" placeholder="Search vehicle" class="${miInp} !py-1.5 !text-[13px] w-full"/><input id="cl_i" placeholder="Filter by item" class="${miInp} !py-1.5 !text-[13px] w-full"/><select id="cl_c" class="${miInp} !py-1.5 !text-[13px] w-full"><option value="">All categories</option></select></div>
    <div id="cl_sum" class="flex flex-wrap gap-1.5 mt-2 text-[11px]"></div></div>
   <div id="cl_body" class="text-slate-400 text-sm">Calculating schedule…</div></div>`;
  const $=id=>document.getElementById(id);
  $('cl_pv').onclick=()=>{ calM.setMonth(calM.getMonth()-1); calRender(); }; $('cl_nx').onclick=()=>{ calM.setMonth(calM.getMonth()+1); calRender(); };
  $('cl_td').onclick=()=>{ calM=new Date(); calM.setDate(1); calSel=miYmd(new Date()); calRender(); };
  $('cl_mo').onchange=e=>{ if(e.target.value){ const [y,m]=e.target.value.split('-').map(Number); calM=new Date(y,m-1,1); calRender(); } };
  ['cl_v','cl_i','cl_c'].forEach(id=>$(id).oninput=()=>calRender());
  $('cl_rf').onclick=()=>calLoad();
  await calLoad();
};
async function calLoad(){
  const body=document.getElementById('cl_body'); body.textContent='Calculating schedule…';
  try{ await calCompute(); }catch(e){ body.innerHTML=`<div class="text-red-600">${escapeHtml(e.message)}</div>`; return; }
  const cs=[...new Set(calData.map(x=>x.cat))].sort(), sel=document.getElementById('cl_c'), cur=sel.value;
  sel.innerHTML='<option value="">All categories</option>'+cs.map(c=>`<option ${c===cur?'selected':''}>${escapeHtml(c)}</option>`).join(''); calRender();
}
async function calCompute(){
  const [stdR, ovR, lf, lo] = await Promise.all([
    db.from('maintenance_interval_settings').select('*'), db.from('vehicle_interval_overrides').select('*'),
    db.from('last_filter_consumption').select('*'), db.from('last_oil_consumption').select('*'), fqLoadVehicles()]);
  [stdR,ovR,lf,lo].forEach(r=>{ if(r.error) throw r.error; });
  const std=new Map(stdR.data.map(s=>[s.item_id,s])), ov=new Map(ovR.data.map(o=>[o.vehicle_code+'|'+o.item_id,o]));
  const el=await miEligibility(fqVehicles); calExcl=el.rows.filter(r=>!r.eligible); const vm=new Map(fqVehicles.map(v=>[v.code,v]));
  const eff=(vc,iid)=>{ const o=ov.get(vc+'|'+iid), s=std.get(iid);
    if(o) return o.interval_type==='No Interval'?null:{type:o.interval_type,val:+o.interval_value,qty:+(o.required_qty||s?.required_qty||1)};
    if(s && s.enabled && s.interval_type!=='No Interval') return {type:s.interval_type,val:+s.interval_value,qty:+s.required_qty||1}; return null; };
  /* baseline records: Filter/Oil from the snapshot tables; Other from item_replacement_history (only for configured items) */
  const base=[]; lf.data.forEach(r=>base.push({...r,cat:'Filter'})); lo.data.forEach(r=>base.push({...r,cat:r.item_category||'Oil'}));
  const otherIds=[...new Set([...stdR.data.filter(s=>s.enabled).map(s=>s.item_id),...ovR.data.filter(o=>o.interval_type!=='No Interval').map(o=>o.item_id)])];
  const known=new Set(base.map(b=>b.item_id)); const itemRows=otherIds.length?await miInChunks('items','id',otherIds,'id,item_name,item_code,item_category,unit'):[]; const im=new Map(itemRows.map(i=>[i.id,i]));
  const otherItems=otherIds.filter(id=>{ const c=(im.get(id)?.item_category||'').trim().toLowerCase(); return c!=='filter'&&c!=='oil'; });
  if(otherItems.length){
    const seen=new Set(); for(let i=0;i<otherItems.length;i+=60){ let from=0; for(;;){
      const { data, error } = await db.from(RH_TABLE).select('vehicle_code,vehicle_name,item_id,item_name,item_code,item_category,replacement_date,quantity,uom,meter_reading,id,created_at').eq('entry_type','Other').in('item_id',otherItems.slice(i,i+60)).order('replacement_date',{ascending:false}).order('created_at',{ascending:false}).range(from,from+999);
      if(error) throw error; (data||[]).forEach(r=>{ const k=r.vehicle_code+'|'+r.item_id; if(!seen.has(k)){ seen.add(k); base.push({vehicle_code:r.vehicle_code,vehicle_name:r.vehicle_name,item_id:r.item_id,item_name:r.item_name,item_code:r.item_code,item_category:r.item_category,last_replacement_date:r.replacement_date,last_meter_reading:r.meter_reading,cat:r.item_category||'Other'}); } });
      if(!data||data.length<1000) break; from+=1000; } }
  }
  /* latest known meter per vehicle (highest reading recorded in latest-replacement data) */
  const cur=new Map(); base.forEach(b=>{ const m=+b.last_meter_reading; if(m>0 && (!cur.has(b.vehicle_code)||m>cur.get(b.vehicle_code))) cur.set(b.vehicle_code,m); });
  const litre=base.filter(b=>el.eligible.has(b.vehicle_code) && eff(b.vehicle_code,b.item_id)?.type==='Diesel Litres');
  let dz=[]; if(litre.length){ const min=litre.reduce((a,b)=>b.last_replacement_date<a?b.last_replacement_date:a,'9999'); const codes=new Set(litre.map(b=>String(b.vehicle_code).toUpperCase())); let from=0;
    for(;;){ const { data, error } = await oilDb.from('diesel_data').select('code,entry_datetime,quantity').gte('entry_datetime',new Date(min+'T00:00:00').toISOString()).order('entry_datetime',{ascending:true}).range(from,from+999); if(error) throw error;
      (data||[]).forEach(r=>{ if(codes.has(String(r.code).toUpperCase())) dz.push(r); }); if(!data||data.length<1000) break; from+=1000; } }
  const today=miYmd(new Date()), out=[];
  for(const b of base){
    if(!el.eligible.has(b.vehicle_code)) continue; const e=eff(b.vehicle_code,b.item_id); if(!e) continue;
    const last=String(b.last_replacement_date).slice(0,10); let key=null, note='';
    if(e.type==='Days'){ const d=miParse(last); d.setDate(d.getDate()+e.val); key=miYmd(d); note=`Last ${miFmt(last)} + ${e.val} days`; }
    else if(e.type==='Hours'||e.type==='Kilometers'){ const lm=+b.last_meter_reading, c=cur.get(b.vehicle_code); if(!(lm>=0)||!c) continue; const nd=lm+e.val;
      if(c>=nd){ key=today; note=`Next due ${nd} ${MI_UNIT[e.type]} · current ${c}`+(c>nd?` (${c-nd} over)`:''); } else continue; }
    else if(e.type==='Diesel Litres'){ const lt=dz.filter(r=>String(r.code).toUpperCase()===String(b.vehicle_code).toUpperCase() && r.entry_datetime>=new Date(last+'T00:00:00').toISOString()).reduce((a,r)=>a+(+r.quantity||0),0);
      if(lt>=e.val){ key=today; note=`${Math.round(lt)} L used since ${miFmt(last)} (interval ${e.val} L)`; } else continue; }
    if(!key) continue; const v=vm.get(b.vehicle_code);
    out.push({key, last, vcode:b.vehicle_code, vname:(v&&v.vehicle_name)||b.vehicle_name, item_id:b.item_id, iname:b.item_name, icode:b.item_code, cat:b.cat, qty:e.qty, uom:b.uom||im.get(b.item_id)?.unit||'', note, meter:cur.get(b.vehicle_code)||'', gid:rhUuid(), item:{id:b.item_id,item_name:b.item_name,item_code:b.item_code,item_category:b.item_category||b.cat,unit:b.uom||im.get(b.item_id)?.unit||null}});
  }
  calData=out;
  const { data:pd } = await db.from('maintenance_checklist_status').select('vehicle_code,item_id,reason'); calPend=new Map((pd||[]).map(p=>[p.vehicle_code+'|'+p.item_id,p.reason]));
}
function calFiltered(){
  const g=id=>(document.getElementById(id)||{}).value||'', v=g('cl_v').trim().toLowerCase(), i=g('cl_i').trim().toLowerCase(), c=g('cl_c');
  return calData.filter(x=>(!v||x.vname.toLowerCase().includes(v)||String(x.vcode).toLowerCase().includes(v))&&(!i||x.iname.toLowerCase().includes(i)||(x.icode||'').toLowerCase().includes(i))&&(!c||x.cat===c));
}
function calFixSel(){
  const ym=miYmd(calM).slice(0,7), t=miYmd(new Date());
  if(calSel.slice(0,7)===ym) return;
  if(t.slice(0,7)===ym){ calSel=t; return; }
  const ks=calFiltered().map(x=>x.key).filter(k=>k.slice(0,7)===ym).sort(); calSel=ks[0]||ym+'-01';
}
function calRender(){
  const body=document.getElementById('cl_body'); if(!body||!calData) return;
  const data=calFiltered(), by=new Map(); data.forEach(x=>{ if(!by.has(x.key)) by.set(x.key,new Map()); const m=by.get(x.key); if(!m.has(x.vcode)) m.set(x.vcode,[]); m.get(x.vcode).push(x); });
  calFixSel(); const y=calM.getFullYear(), mo=calM.getMonth(), first=new Date(y,mo,1), n=new Date(y,mo+1,0).getDate(), pad=(first.getDay()+6)%7;
  document.getElementById('cl_title').textContent=calM.toLocaleDateString('en-GB',{month:'long',year:'numeric'}); document.getElementById('cl_mo').value=`${y}-${String(mo+1).padStart(2,'0')}`;
  const allKeys=[...by.keys()], cnt=s=>allKeys.filter(k=>calStatus(k)===s).reduce((a,k)=>a+by.get(k).size,0);
  document.getElementById('cl_sum').innerHTML=Object.keys(CAL_LBL).map(s=>`<span class="px-2 py-0.5 rounded-full ${CAL_CLS[s]}">${CAL_LBL[s]}: ${cnt(s)} vehicle-days</span>`).join('')+`<button id="cl_ex" class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">Excluded by diesel filter: ${calExcl.length}</button>`;
  document.getElementById('cl_ex').onclick=calShowExcluded;
  let cells=''; for(let i=0;i<pad;i++) cells+='<div></div>';
  for(let d=1; d<=n; d++){ const k=miYmd(new Date(y,mo,d)), m=by.get(k), st=m?calStatus(k):null;
    cells+=`<button data-d="${k}" class="min-h-[36px] rounded-md border p-1 text-left ${k===calSel?'border-teal-600 ring-2 ring-teal-600':'border-slate-200'} ${k===miYmd(new Date())?'bg-teal-50':'bg-white'} hover:bg-slate-50"><div class="text-[11px] font-semibold text-slate-600 leading-none">${d}</div>${m?`<div class="mt-0.5 text-[10px] font-bold px-1 rounded-full inline-block ${CAL_CLS[st]}">${m.size}</div>`:''}</button>`; }
  const sel=by.get(calSel), st=sel?calStatus(calSel):null;
  const groups=sel?[...sel].sort((a,b)=>a[1][0].vname.localeCompare(b[1][0].vname,undefined,{numeric:true})).map(([vc,its])=>[vc,its.slice().sort((a,b)=>a.iname.localeCompare(b.iname))]):[];
  const nItems=groups.reduce((a,g)=>a+g[1].length,0);
  const th='sticky top-0 z-10 bg-blue-50 text-left text-[11px] uppercase tracking-wide font-semibold text-slate-600 px-3 py-2 border-b border-blue-100 whitespace-nowrap';
  const table=groups.length?`<div class="hidden md:block overflow-auto max-h-[72vh] rounded-lg border border-slate-200 scroll-thin"><table class="w-full text-[13px] border-collapse">
      <thead><tr><th class="${th} w-[250px]">Vehicle</th><th class="${th}">Item Name</th><th class="${th}">Last Change Date</th><th class="${th}">Next Due Date</th><th class="${th}">Overdue By</th></tr></thead>
      ${groups.map(([vc,its])=>`<tbody class="border-t-2 border-blue-100 first:border-t-0">${its.map((x,i)=>`<tr data-v="${escapeHtml(vc)}" class="cursor-pointer hover:bg-blue-50/50 ${i?'border-t border-slate-100':''}">
        ${i===0?`<td rowspan="${its.length}" class="align-top p-2 bg-slate-50/70 w-[250px]">${calVehCard(vc,its,st)}</td>`:''}
        <td class="px-3 py-1.5 align-middle">${calItemCell(x)}</td>
        <td class="px-3 py-1.5 whitespace-nowrap tabular-nums text-slate-700">${x.last?miFmt(x.last):'—'}</td>
        <td class="px-3 py-1.5 whitespace-nowrap tabular-nums font-semibold text-slate-800">${miFmt(x.key)}</td>
        <td class="px-3 py-1.5 whitespace-nowrap">${calChip(x.key)}</td></tr>`).join('')}</tbody>`).join('')}</table></div>
    <div class="md:hidden space-y-2">${groups.map(([vc,its])=>`<div data-v="${escapeHtml(vc)}" class="rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden"><div class="p-2 bg-slate-50/70 border-b border-blue-100">${calVehCard(vc,its,st)}</div>
      <div class="divide-y divide-slate-100">${its.map(x=>`<div class="px-3 py-2"><div class="flex items-start justify-between gap-2"><div class="min-w-0 text-[13px]">${calItemCell(x)}</div>${calChip(x.key)}</div>
        <div class="mt-1 flex gap-4 text-[11px] text-slate-500"><span>Last change: <b class="text-slate-700">${x.last?miFmt(x.last):'—'}</b></span><span>Next due: <b class="text-slate-700">${miFmt(x.key)}</b></span></div></div>`).join('')}</div></div>`).join('')}</div>`
    :'<div class="text-sm text-slate-400 py-6 text-center">No vehicles due on this date.</div>';
  body.innerHTML=`<div class="grid grid-cols-1 lg:grid-cols-12 gap-3"><div class="${miCard} lg:col-span-4 self-start !p-3"><div class="grid grid-cols-7 gap-1 text-[10px] font-semibold text-slate-400 mb-1 text-center">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(x=>`<div>${x}</div>`).join('')}</div><div class="grid grid-cols-7 gap-1" id="cl_grid">${cells}</div>
    <p class="text-[11px] text-slate-400 mt-2">Hour/km/diesel-based items appear on today (when already due) — no calendar date is estimated without usage data. Items with no previous replacement record are not scheduled.</p></div>
    <div class="${miCard} lg:col-span-8 !p-3"><div class="flex items-center justify-between mb-2"><div><h3 class="text-base font-bold text-navy-900">${miFmt(calSel)}</h3><div class="text-xs text-slate-500">${sel?sel.size:0} vehicle${sel&&sel.size!==1?'s':''} · ${nItems} item${nItems!==1?'s':''} due</div></div>${st?`<span class="px-2 py-0.5 rounded-full text-xs font-semibold ${CAL_CLS[st]}">${CAL_LBL[st]}</span>`:''}</div><div id="cl_side">${table}</div></div></div>`;
  document.getElementById('cl_grid').onclick=e=>{ const b=e.target.closest('button[data-d]'); if(b){ calSel=b.dataset.d; calRender(); } };
  document.getElementById('cl_side').onclick=e=>{ const b=e.target.closest('[data-v]'); if(b) calOpenChecklist(b.dataset.v, calSel); };
}
function calShowExcluded(){
  openModal('Excluded vehicles (no recent diesel consumption)', calExcl.length?`<div class="overflow-x-auto max-h-96"><table class="data w-full text-sm"><thead><tr><th class="text-left px-2 py-2">Vehicle</th><th class="text-left px-2 py-2">Last diesel</th></tr></thead><tbody>${calExcl.map(r=>`<tr><td class="px-2 py-2">${escapeHtml(r.v.vehicle_name)} <span class="font-mono text-xs text-slate-400">${escapeHtml(r.v.code)}</span></td><td class="px-2 py-2">${r.last?fmtDateTime(r.last)+' ('+r.days+' d ago)':'No history'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="text-sm text-slate-500">No vehicles excluded.</div>',`<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Close</button>`);
}

/* ---------------- Overdue Vehicles (oldest first) ---------------- */
const ovDays = k => Math.max(0, Math.round((miParse(miYmd(new Date())) - miParse(k)) / 86400000));
ROUTES.maint_overdue = async host => {
  host.innerHTML=`<div class="space-y-4"><div class="${miCard}">
    <div class="flex flex-wrap items-center gap-2 mb-3"><h3 class="font-semibold text-navy-900">Overdue vehicles <span class="text-xs font-normal text-slate-500">— oldest due date first</span></h3>
      <div class="ml-auto flex gap-2"><button id="ov_x" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-sm">Export Excel</button><button id="ov_r" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-sm">Refresh</button></div></div>
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3"><input id="ov_v" placeholder="Search vehicle" class="${miInp} w-full"/><input id="ov_i" placeholder="Filter by item" class="${miInp} w-full"/><select id="ov_c" class="${miInp} w-full"><option value="">All categories</option></select></div>
    <div id="ov_sum" class="flex flex-wrap gap-2 mt-3 text-xs"></div></div>
   <div id="ov_body" class="${miCard} text-slate-400 text-sm">Calculating schedule…</div></div>`;
  ovPage=0; ['ov_v','ov_i','ov_c'].forEach(id=>document.getElementById(id).oninput=()=>{ ovPage=0; ovRender(); });
  document.getElementById('ov_r').onclick=()=>ovLoad(); document.getElementById('ov_x').onclick=ovExport;
  document.getElementById('ov_body').addEventListener('click',e=>{
    const g=e.target.closest('[data-pg]');
    if(g){ if(g.disabled) return; const t=g.dataset.pg; ovPage = t==='prev'?ovPage-1 : t==='next'?ovPage+1 : +t; ovRender(); const h=document.getElementById('ov_body'); if(h&&h.scrollIntoView) h.scrollIntoView({block:'start',behavior:'smooth'}); return; }
    const b=e.target.closest('[data-v]'); if(b) ovDetails(b.dataset.v); });
  document.getElementById('ov_body').addEventListener('keydown',e=>{ if(e.key!=='Enter'&&e.key!==' ') return; const b=e.target.closest('[data-v]'); if(b&&b===e.target){ e.preventDefault(); ovDetails(b.dataset.v); } });
  await ovLoad();
};
async function ovLoad(){
  const body=document.getElementById('ov_body'); if(!body) return; body.className=`${miCard} text-slate-400 text-sm`; body.textContent='Calculating schedule…';
  try{ await calCompute(); }catch(e){ body.className=`${miCard} text-red-600 text-sm`; body.textContent=e.message; return; }
  const cs=[...new Set(calData.filter(x=>calStatus(x.key)==='overdue').map(x=>x.cat))].sort(), sel=document.getElementById('ov_c'), cur=sel.value;
  sel.innerHTML='<option value="">All categories</option>'+cs.map(c=>`<option ${c===cur?'selected':''}>${escapeHtml(c)}</option>`).join(''); ovRender();
}
function ovGroups(){
  const g=id=>(document.getElementById(id)||{}).value||'', v=g('ov_v').trim().toLowerCase(), i=g('ov_i').trim().toLowerCase(), c=g('ov_c');
  const rows=(calData||[]).filter(x=>calStatus(x.key)==='overdue' && (!v||x.vname.toLowerCase().includes(v)||String(x.vcode).toLowerCase().includes(v)) && (!i||x.iname.toLowerCase().includes(i)||(x.icode||'').toLowerCase().includes(i)) && (!c||x.cat===c));
  const m=new Map(); rows.forEach(x=>{ if(!m.has(x.vcode)) m.set(x.vcode,[]); m.get(x.vcode).push(x); });
  return [...m.entries()].map(([vc,its])=>{ its.sort((a,b)=>a.key.localeCompare(b.key)||a.iname.localeCompare(b.iname)); return {vc, vname:its[0].vname, its, oldest:its[0].key}; })
    .sort((a,b)=>a.oldest.localeCompare(b.oldest)||a.vname.localeCompare(b.vname,undefined,{numeric:true}));
}
/* ---------------- Overdue Vehicles: vehicle / consumer classification + illustrations ---------------- */
const OV_RULES = [   // checked in order against the actual vehicle name
  ['reach',    /reach\s*-?\s*truck/i],
  ['dump',     /dump\s*-?\s*truck|dumper|tipper/i],
  ['forklift', /fork\s*-?\s*lift/i],
  ['payloader',/pay\s*-?\s*loader|wheel\s*loader/i],
  ['excavator',/excavator/i],
  ['pickup',   /pick\s*-?\s*up/i],
  ['trolly',   /trolly|trolley|sonalika|swaraj/i],
  ['bus',      /\bbus\b/i]
];
const OV_CONSUMER_RE = /\b(civil|dlt|generator|kiln|sacmi|monalisa|monica|salow|ball\s*mill|mechanical|press)\b/i;
const OV_CODE_KIND = {XFL:'forklift',XPL:'payloader',XEX:'excavator',XDT:'dump',XPU:'pickup',XRT:'reach',XMT:'trolly',XSB:'bus'};
const OV_KIND_LABEL = {forklift:'Forklift',payloader:'Payloader',excavator:'Excavator',dump:'Dump truck',pickup:'Pickup',reach:'Reach truck',trolly:'Tractor with trolley',bus:'Bus',consumer:'Non-vehicle consumer',other:'Unclassified'};
function ovKind(name, code){
  const n=String(name||''), c=String(code||'');
  const hit=OV_RULES.find(([k,re])=>re.test(n)); if(hit) return hit[0];      // real vehicles first, so they are never shown as consumers
  if(OV_CONSUMER_RE.test(n)) return 'consumer';
  return OV_CODE_KIND[c.slice(0,3).toUpperCase()] || 'other';
}
let ovUid=0;   // unique gradient ids per rendered icon
const U = id => `url(#${id}@@)`;
const ovG = (id,a,b) => `<linearGradient id="${id}@@" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`;
const OV_DEFS = '<defs>' + [
  ovG('yT','#ffe98a','#f9c316'), ovG('yF','#fbc82a','#d99400'), ovG('yS','#d99a00','#8f5d00'),
  ovG('oT','#fdba74','#f97316'), ovG('oF','#fb923c','#c2410c'), ovG('oS','#c2570c','#7c2d12'),
  ovG('wT','#ffffff','#e2e8f0'), ovG('wF','#f8fafc','#b6c2d1'), ovG('wS','#cbd5e1','#7b8aa0'),
  ovG('bT','#93b4ff','#3b6ef0'), ovG('bF','#3b82f6','#1d4ed8'), ovG('bS','#1e40af','#172554'),
  ovG('gT','#86efac','#22c55e'), ovG('gF','#22c55e','#15803d'), ovG('gS','#15803d','#14532d'),
  ovG('sT','#d1d5db','#6b7280'), ovG('sF','#6b7280','#1f2937'), ovG('gl','#e0f2fe','#3b82f6'),
  '<radialGradient id="tr@@" cx=".38" cy=".35" r=".8"><stop offset="0" stop-color="#6b7280"/><stop offset=".6" stop-color="#1f2937"/><stop offset="1" stop-color="#030712"/></radialGradient>',
  '<radialGradient id="rm@@" cx=".35" cy=".3" r=".85"><stop offset="0" stop-color="#f9fafb"/><stop offset="1" stop-color="#6b7280"/></radialGradient>',
  '<radialGradient id="sh@@"><stop offset="0" stop-color="#0f172a" stop-opacity=".45"/><stop offset="1" stop-color="#0f172a" stop-opacity="0"/></radialGradient>'
].join('') + '</defs>';
const P = (pts,fill) => `<polygon points="${pts}" fill="${fill}"/>`;
const R = (x,y,w,h,fill,rx=0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"/>`;
const ovSh = `<ellipse cx="48" cy="61" rx="43" ry="3.2" fill="url(#sh@@)"/>`;
// 3D wheel: back thickness + shaded tyre + metallic rim + hub + highlight
const ovW = (x,y,r) => `<circle cx="${(x+r*.3).toFixed(1)}" cy="${(y-r*.1).toFixed(1)}" r="${r}" fill="#0b1220"/><circle cx="${x}" cy="${y}" r="${r}" fill="${U('tr')}"/><circle cx="${x}" cy="${y}" r="${(r*.52).toFixed(1)}" fill="${U('rm')}"/><circle cx="${x}" cy="${y}" r="${(r*.17).toFixed(1)}" fill="#374151"/><path d="M${(x-r*.7).toFixed(1)} ${(y-r*.45).toFixed(1)}A${r} ${r} 0 0 1 ${(x+r*.1).toFixed(1)} ${(y-r*.95).toFixed(1)}" stroke="#fff" stroke-opacity=".3" stroke-width="1" fill="none" stroke-linecap="round"/>`;
const OV_3D = new Set(['forklift','payloader','excavator','dump','pickup','reach','trolly','bus']);
const OV_SVG = {
  forklift: ovSh + R(16,8,5,46,U('sF')) + P('21,8 24,10 24,52 21,54','#1f2937') + R(23,12,3,40,U('sT'))
    + R(3,51,24,3.5,U('sF'),1) + P('3,51 7,48.5 28,48.5 27,51',U('sT'))
    + R(30,34,44,16,U('yF'),3) + P('30,34 36,28.5 80,28.5 74,34',U('yT')) + P('74,34 80,28.5 80,45 74,50',U('yS'))
    + `<path d="M36 28V14M64 28V14" stroke="#374151" stroke-width="2.6"/>` + P('34,15 40,10.5 70,10.5 64,15',U('sT')) + R(34,15,30,2.2,U('sF'))
    + R(44,22,10,8,'#374151',1.5) + ovW(40,53,8) + ovW(68,53,8),
  payloader: ovSh + P('3,34 23,34 26,52 6,52',U('yF')) + P('3,34 8,30 28,30 23,34',U('yT')) + P('23,34 28,30 31,48 26,52',U('yS')) + `<path d="M6 52h20" stroke="#374151" stroke-width="2"/>`
    + `<path d="M24 42L40 34" stroke="#8f5d00" stroke-width="5.5" stroke-linecap="round"/><path d="M24 41L40 33" stroke="#f5b301" stroke-width="3.5" stroke-linecap="round"/>`
    + R(34,36,52,14,U('yF'),3) + P('34,36 40,31 90,31 86,36',U('yT')) + P('86,36 90,31 90,46 86,50',U('yS')) + R(74,28,12,8,'#c98f00')
    + R(52,17,22,20,U('yF'),2) + R(55,20,16,11,U('gl'),1) + P('52,17 57,12 79,12 74,17',U('yT')) + P('74,17 79,12 79,32 74,37',U('yS'))
    + ovW(46,52,9) + ovW(76,52,9),
  excavator: ovSh + R(24,50,58,11,U('sF'),5.5) + R(24,49,58,3,U('sT'),1.5)
    + `<circle cx="32" cy="55.5" r="3.5" fill="#9ca3af"/><circle cx="74" cy="55.5" r="3.5" fill="#9ca3af"/><circle cx="44" cy="57" r="2" fill="#9ca3af"/><circle cx="53" cy="57" r="2" fill="#9ca3af"/><circle cx="62" cy="57" r="2" fill="#9ca3af"/>`
    + R(34,36,40,14,U('yF'),2) + P('34,36 40,31 78,31 74,36',U('yT')) + P('74,36 78,31 78,46 74,50',U('yS'))
    + R(52,18,22,19,U('yF'),2) + R(55,21,14,10,U('gl'),1) + P('52,18 57,13.5 79,13.5 74,18',U('yT')) + P('74,18 79,13.5 79,33 74,37',U('yS'))
    + `<path d="M46 38L27 14L11 38" fill="none" stroke="#8f5d00" stroke-width="6.5" stroke-linejoin="round" stroke-linecap="round"/><path d="M46 37L27 13L11 37" fill="none" stroke="#f9c316" stroke-width="4" stroke-linejoin="round" stroke-linecap="round"/><path d="M44 34L32 22" stroke="#9ca3af" stroke-width="2"/>`
    + `<path d="M11 38l-7 10 13 3z" fill="${U('sF')}"/><path d="M11 38l-7 10" stroke="#d1d5db" stroke-width="1"/>`,
  dump: ovSh + R(4,46,90,6,U('sF'),1.5)
    + P('32,22 90,14 90,46 32,46',U('yF')) + P('32,22 90,14 95,10 37,18',U('yT')) + P('90,14 95,10 95,42 90,46',U('yS'))
    + `<path d="M44 21V46M56 19.5V46M68 18V46M80 16.5V46" stroke="#8f5d00" stroke-width="1.2" opacity=".5"/>`
    + R(4,26,24,22,U('oF'),3) + P('4,26 9,21.5 31,21.5 28,26',U('oT')) + P('28,26 33,21.5 33,44 28,48',U('oS')) + R(7,29,14,9,U('gl'),1)
    + ovW(16,54,7.5) + ovW(56,54,7.5) + ovW(78,54,7.5),
  pickup: ovSh + R(6,36,84,14,U('wF'),4) + R(6,46,84,3,'#cbd5e1')
    + P('6,36 11,32 22,32 20,36',U('sT'))
    + P('20,36 28,20 54,20 62,36',U('wF')) + P('28,20 33,16.5 57,16.5 54,20',U('wT')) + P('26,34 31,23 52,23 58,34',U('gl'))
    + R(64,29,26,21,U('wF'),2) + P('64,29 69,25 93,28 90,29',U('wT')) + P('90,29 93,28 93,48 90,50',U('wS')) + R(67,32,20,6,'#94a3b8',1) + R(86,40,4,3,'#fde68a',1)
    + ovW(22,53,8) + ovW(74,53,8),
  reach: ovSh + R(14,6,5,48,U('sF')) + P('19,6 22,8 22,52 19,54','#1f2937') + R(21,10,3,42,U('sT')) + `<path d="M12 18h9M12 28h9M12 38h9" stroke="#1f2937" stroke-width="1.2"/>`
    + R(3,51,22,3.5,U('sF'),1) + P('3,51 7,48.5 26,48.5 25,51',U('sT'))
    + R(28,34,48,16,U('oF'),3) + P('28,34 34,28.5 82,28.5 76,34',U('oT')) + P('76,34 82,28.5 82,45 76,50',U('oS'))
    + `<path d="M34 28V12M66 28V12" stroke="#1f2937" stroke-width="2.6"/>` + P('32,13 38,8.5 72,8.5 66,13',U('sT')) + R(32,13,34,2.2,U('sF')) + R(42,22,10,8,'#374151',1.5)
    + ovW(38,55,6) + ovW(66,55,6),
  trolly: ovSh + R(6,32,26,10,U('bF'),2) + P('6,32 10,29 34,29 32,32',U('bT')) + R(28,20,14,22,U('bF'),2) + P('28,20 32,16.5 47,16.5 42,20',U('bT')) + P('42,20 47,16.5 47,38 42,42',U('bS'))
    + `<rect x="10" y="22" width="2" height="10" fill="#374151"/><path d="M44 46h8" stroke="#374151" stroke-width="3"/>`
    + R(52,30,40,16,U('gF'),1) + P('52,30 57,26 96,26 92,30',U('gT')) + P('92,30 96,26 96,42 92,46',U('gS'))
    + ovW(36,49,12) + ovW(14,54,7) + ovW(64,55,6) + ovW(84,55,6),
  bus: ovSh + R(4,14,82,36,U('wF'),6) + P('8,14 14,9.5 90,9.5 86,14',U('wT')) + P('86,14 90,9.5 90,45 86,50',U('wS'))
    + R(10,19,14,14,U('gl'),2) + R(28,19,12,12,U('gl'),2) + R(42,19,12,12,U('gl'),2) + R(56,19,12,12,U('gl'),2) + R(70,19,12,12,U('gl'),2)
    + R(4,38,82,6,U('bF')) + ovW(24,53,8) + ovW(68,53,8),
  consumer: `<path d="M30 12L66 52M66 12L30 52" stroke="#dc2626" stroke-width="10" stroke-linecap="round"/>`,
  other:    `<rect x="26" y="8" width="44" height="44" rx="8" fill="#f1f5f9" stroke="#cbd5e1"/><text x="48" y="41" text-anchor="middle" font-size="28" font-weight="700" fill="#94a3b8" font-family="Inter,Arial,sans-serif">?</text>`
};
const ovIcon = (kind, cls='w-full h-auto') => { const u=++ovUid, k=OV_KIND_LABEL[kind]; return `<svg viewBox="0 0 96 64" class="${cls}" role="img" aria-label="${k}"><title>${k}</title>${OV_3D.has(kind)?OV_DEFS:''}${OV_SVG[kind]||OV_SVG.other}</svg>`.replace(/@@/g,u); };

let ovPage=0; const OV_PER_PAGE=10;
const ovSev = d => d>=90?'border-l-red-600':d>=30?'border-l-orange-500':'border-l-amber-400';
function ovRender(){
  const body=document.getElementById('ov_body'); if(!body||!calData) return; const gr=ovGroups(), nItems=gr.reduce((a,x)=>a+x.its.length,0);
  document.getElementById('ov_sum').innerHTML=`<span class="px-2.5 py-1 rounded-full ${CAL_CLS.overdue}">Overdue vehicles: ${gr.length}</span><span class="px-2.5 py-1 rounded-full bg-slate-100 text-slate-600">Overdue items: ${nItems}</span>`;
  if(!gr.length){ body.className=miCard; body.innerHTML='<div class="py-8 text-center text-slate-400 text-sm">No overdue vehicles.</div>'; return; }
  const pages=Math.ceil(gr.length/OV_PER_PAGE); ovPage=Math.max(0,Math.min(ovPage,pages-1));
  const from=ovPage*OV_PER_PAGE, list=gr.slice(from,from+OV_PER_PAGE);
  const pb='w-9 h-9 text-sm font-semibold rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed';
  const nums = pages>1 && pages<=7 ? Array.from({length:pages},(_,p)=>`<button data-pg="${p}" class="w-9 h-9 text-sm font-semibold rounded-lg ${p===ovPage?'bg-teal-600 text-white':'border border-slate-300 hover:bg-slate-50'}">${p+1}</button>`).join('') : `<span class="text-sm text-slate-600 px-1">Page ${ovPage+1} of ${pages}</span>`;
  const lbl='text-[10px] uppercase tracking-wide text-slate-400 font-medium';
  const hasOther=gr.some(r=>ovKind(r.vname,r.vc)==='other');
  body.className='space-y-3';
  body.innerHTML=`<div class="grid grid-cols-1 md:grid-cols-2 gap-3">${list.map((r,n)=>{
    const d=ovDays(r.oldest), kind=ovKind(r.vname,r.vc), pend=r.its.filter(x=>calPend.has(x.vcode+'|'+x.item_id)).length;
    const names=r.its.map(x=>x.iname).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
    return `<div role="button" tabindex="0" data-v="${escapeHtml(r.vc)}" class="relative bg-white rounded-xl border border-slate-200 border-l-4 ${ovSev(d)} shadow-sm hover:shadow-md hover:bg-red-50/30 cursor-pointer px-3 py-2.5 transition">
      <span class="absolute top-2 right-3 px-2 py-0.5 rounded-full text-xs font-bold ${CAL_CLS.overdue}">${d} d</span>
      <div class="flex gap-3">
        <div class="w-14 sm:w-[72px] shrink-0 flex items-center justify-center self-start pt-1">${ovIcon(kind)}</div>
        <div class="min-w-0 flex-1">
          <div class="flex flex-col sm:flex-row gap-2 sm:gap-0">
            <div class="sm:w-[44%] min-w-0 pr-16 sm:pr-3"><div class="text-[11px] font-medium text-slate-400 leading-none">#${from+n+1}</div>
              <div class="text-base font-bold text-navy-900 leading-snug break-words">${escapeHtml(r.vname)}</div>
              <div class="font-mono text-xs text-slate-500">${escapeHtml(r.vc)}</div></div>
            <div class="flex gap-5 sm:gap-0 sm:flex-1 sm:mt-4">
              <div class="sm:px-3 sm:border-l sm:border-slate-200"><div class="${lbl}">Oldest due</div><div class="text-sm font-semibold text-slate-800 whitespace-nowrap">${miFmt(r.oldest)}</div></div>
              <div class="sm:px-3 sm:border-l sm:border-slate-200"><div class="${lbl}">Overdue items</div><div class="text-sm font-semibold text-slate-800">${r.its.length}${pend?` <span class="text-xs font-medium text-amber-600">· ${pend} pending</span>`:''}</div></div>
            </div>
          </div>
          <div class="mt-1.5 flex items-end justify-between gap-3">
            <div class="text-xs text-slate-500 truncate" title="${escapeHtml(names)}">${escapeHtml(names)}</div>
            <span class="shrink-0 text-teal-700 text-xs font-semibold">View details →</span>
          </div>
        </div>
      </div></div>`; }).join('')}</div>
    <div class="${miCard} flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-600">
        <span class="flex items-center gap-2"><span class="w-9">${ovIcon('payloader')}</span>= Vehicle</span>
        <span class="hidden sm:block w-px h-6 bg-slate-200"></span>
        <span class="flex items-center gap-2"><span class="w-6">${ovIcon('consumer')}</span>= Non-vehicle consumer</span>
        ${hasOther?`<span class="flex items-center gap-2"><span class="w-6">${ovIcon('other')}</span>= Unclassified</span>`:''}
        <span class="text-xs text-slate-400">Showing ${from+1}–${from+list.length} of ${gr.length}</span>
      </div>
      <div class="flex flex-wrap items-center gap-2"><button data-pg="prev" class="${pb}" aria-label="Previous page" ${ovPage===0?'disabled':''}>«</button>${nums}<button data-pg="next" class="${pb}" aria-label="Next page" ${ovPage>=pages-1?'disabled':''}>»</button></div>
    </div>`;
}
function ovDetails(vc){
  const its=(calData||[]).filter(x=>x.vcode===vc && calStatus(x.key)==='overdue').sort((a,b)=>a.key.localeCompare(b.key)||a.iname.localeCompare(b.iname));
  if(!its.length){ toast('No overdue items for this vehicle.','info'); return; }
  const d=ovDays(its[0].key), kind=ovKind(its[0].vname,vc), th='text-left px-3 py-2 text-[11px] uppercase tracking-wide font-semibold text-slate-600 whitespace-nowrap';
  openModal(its[0].vname, `
    <div class="flex items-center gap-3 mb-3">
      <div class="w-14 shrink-0">${ovIcon(kind)}</div>
      <div class="flex flex-wrap items-center gap-2">
        <span class="font-mono text-sm text-slate-500">${escapeHtml(vc)}</span>
        <span class="text-xs text-slate-400">${OV_KIND_LABEL[kind]}</span>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${CAL_CLS.overdue}">Oldest: ${d} days overdue</span>
        <span class="px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">${its.length} overdue item${its.length>1?'s':''}</span>
      </div>
    </div>
    <div class="overflow-x-auto rounded-lg border border-slate-200"><table class="w-full text-[13px] border-collapse">
      <thead><tr class="bg-blue-50 border-b border-blue-100"><th class="${th}">Item</th><th class="${th}">Last Change</th><th class="${th}">Due Date</th><th class="${th}">Overdue By</th><th class="${th} text-right">Qty</th></tr></thead>
      <tbody>${its.map(x=>{ const has=calPend.has(x.vcode+'|'+x.item_id), p=calPend.get(x.vcode+'|'+x.item_id);
        return `<tr class="border-t border-slate-100 align-top ${has?'bg-amber-50/60':''}">
          <td class="px-3 py-2"><div class="font-semibold text-slate-900 leading-tight">${escapeHtml(x.iname)}</div>
            <div class="text-[11px] text-slate-500">${escapeHtml(x.cat||'')}${x.icode?' · <span class="font-mono">'+escapeHtml(x.icode)+'</span>':''}${calEvery(x)?' · '+calEvery(x):''}</div>${calUsageNote(x)}
            ${has?`<div class="mt-1 text-[11px] font-medium text-amber-700">Pending — ${escapeHtml(p||'no reason given')}</div>`:''}</td>
          <td class="px-3 py-2 whitespace-nowrap tabular-nums text-slate-700">${x.last?miFmt(x.last):'—'}</td>
          <td class="px-3 py-2 whitespace-nowrap tabular-nums font-semibold text-red-600">${miFmt(x.key)}</td>
          <td class="px-3 py-2 whitespace-nowrap">${calChip(x.key,true)}</td>
          <td class="px-3 py-2 whitespace-nowrap text-right">${escapeHtml(x.qty)} ${escapeHtml(x.uom||'')}</td></tr>`; }).join('')}</tbody></table></div>`,
    `<button onclick="closeModal()" class="px-4 py-2 text-sm border border-slate-300 rounded-lg">Close</button>
     <button data-v="${escapeHtml(vc)}" onclick="calOpenChecklist(this.dataset.v,'overdue')" class="px-4 py-2 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Open checklist →</button>`);
}
function ovExport(){
  if(typeof XLSX==='undefined'){ toast('Excel library not loaded.','error'); return; }
  const out=[]; ovGroups().forEach((r,n)=>r.its.forEach(x=>out.push({'#':n+1,'Vehicle':r.vname,'Vehicle Code':r.vc,'Item':x.iname,'Item Code':x.icode||'','Category':x.cat,'Due Date':x.key,'Days Overdue':ovDays(x.key),'Required Qty':x.qty,'UoM':x.uom,'Basis':x.note,'Pending Reason':calPend.get(x.vcode+'|'+x.item_id)||''})));
  if(!out.length){ toast('Nothing to export.','error'); return; }
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(out),'Overdue'); XLSX.writeFile(wb,`overdue_vehicles_${deToday()}.xlsx`);
}

/* ---------------- Maintenance Checklist (per vehicle) ---------------- */
let ckItems=[];
function calOpenChecklist(vcode, key){
  const allOver=(key==='overdue'); ckItems=calData.filter(x=>x.vcode===vcode && (allOver? calStatus(x.key)==='overdue' : x.key===key)); if(!ckItems.length) return; const v=ckItems[0], today=miYmd(new Date());
  openModal(`Maintenance checklist — ${v.vname}`, `<div class="text-xs text-slate-500 mb-3">${escapeHtml(vcode)} · ${allOver?'all overdue items':'due '+miFmt(key)+' · '+CAL_LBL[calStatus(key)]}</div><div id="ck_list" class="space-y-3">
   ${ckItems.map((x,i)=>{ const pr=calPend.get(x.vcode+'|'+x.item_id); return `<div class="border border-slate-200 rounded-xl p-3" data-i="${i}">
    <div class="flex flex-wrap justify-between gap-2"><div><div class="text-sm font-semibold">${i+1}. ${escapeHtml(x.iname)}</div><div class="text-xs text-slate-500">${escapeHtml(x.cat)} · Required qty ${x.qty} ${escapeHtml(x.uom)}</div><div class="text-[11px] text-slate-400">${escapeHtml(x.note)}</div>${pr!==undefined?`<div class="text-[11px] text-amber-700 mt-1">Pending — ${escapeHtml(pr||'')}</div>`:''}</div>
    <div class="flex gap-1.5 items-start"><label class="cursor-pointer"><input type="radio" name="ck${i}" value="yes" class="peer sr-only"/><span class="block px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-100 text-slate-500 peer-checked:bg-green-100 peer-checked:text-green-700">Yes</span></label><label class="cursor-pointer"><input type="radio" name="ck${i}" value="no" class="peer sr-only"/><span class="block px-3 py-1.5 rounded-lg text-sm font-bold bg-slate-100 text-slate-500 peer-checked:bg-red-100 peer-checked:text-red-700">No</span></label></div></div>
    <div class="ck-yes hidden mt-3 grid grid-cols-2 gap-2"><label class="text-xs">Actual qty<input type="number" data-f="qty" min="0" step="any" value="${x.qty}" class="${miInp} w-full"/></label><label class="text-xs">Meter reading<input type="number" data-f="meter" min="0" step="any" value="${x.meter}" class="${miInp} w-full"/></label><label class="text-xs">Replacement date<input type="date" data-f="date" max="${today}" value="${today}" class="${miInp} w-full"/></label><label class="text-xs">Remarks<input data-f="rem" class="${miInp} w-full"/></label></div>
    <div class="ck-no hidden mt-3"><label class="text-xs">Reason (required)<input data-f="reason" class="${miInp} w-full"/></label></div>
    <div class="ck-act hidden mt-3 text-right"><button data-save class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save</button></div></div>`; }).join('')}</div>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Close</button>`);
  const L=document.getElementById('ck_list');
  L.addEventListener('change',e=>{ const c=e.target.closest('[data-i]'); if(!c||e.target.type!=='radio') return; const y=e.target.value==='yes'; c.querySelector('.ck-yes').classList.toggle('hidden',!y); c.querySelector('.ck-no').classList.toggle('hidden',y); c.querySelector('.ck-act').classList.remove('hidden'); });
  L.addEventListener('click',e=>{ const b=e.target.closest('button[data-save]'); if(b) ckSave(b.closest('[data-i]'), b); });
}
async function ckSave(card, btn){
  const x=ckItems[+card.dataset.i], ans=(card.querySelector('input[type=radio]:checked')||{}).value, f=k=>(card.querySelector(`[data-f=${k}]`)||{}).value||'';
  if(!ans) return; const v={vehicle_name:x.vname, code:x.vcode};
  if(ans==='no'){ const reason=f('reason').trim(); if(!reason){ toast('Enter the reason.','error'); return; }
    btn.disabled=true; const { error } = await db.from('maintenance_checklist_status').upsert({vehicle_code:x.vcode,vehicle_name:x.vname,item_id:x.item_id,item_name:x.iname,status:'Pending',reason,due_date:x.key,created_by:miUser(),updated_at:new Date().toISOString()},{onConflict:'vehicle_code,item_id'}); btn.disabled=false;
    if(error){ toast('Not saved: '+error.message,'error'); return; } calPend.set(x.vcode+'|'+x.item_id,reason); toast('Marked pending with reason','success'); card.querySelector('.ck-act').classList.add('hidden'); return; }
  const q=parseFloat(f('qty')), m=f('meter')===''?null:parseFloat(f('meter')), d=f('date');
  if(!(q>0)){ toast('Actual quantity must be greater than zero.','error'); return; } if(!d){ toast('Select the replacement date.','error'); return; } if(m!==null&&(isNaN(m)||m<0)){ toast('Invalid meter reading.','error'); return; }
  btn.disabled=true;      /* x.gid is fixed for this checklist line => double-click / retry cannot duplicate */
  const err=await rhInsert([{...rhBase(v,x.item,d,q,m,f('rem').trim()||null,{source:'checklist',scheduled_due:x.key}), entry_group_id:x.gid}]);
  if(err){ btn.disabled=false; toast('Not saved: '+err.message,'error'); return; }
  await db.from('maintenance_checklist_status').delete().eq('vehicle_code',x.vcode).eq('item_id',x.item_id); calPend.delete(x.vcode+'|'+x.item_id);
  try{ await logActivity('CHECKLIST_REPLACEMENT',RH_TABLE,null,`${x.vname} / ${x.iname}`); }catch(e){}
  calData=calData.filter(z=>!(z.vcode===x.vcode&&z.item_id===x.item_id)); toast('Replacement recorded','success');
  card.innerHTML=`<div class="text-sm text-green-700 font-medium">&#10003; ${escapeHtml(x.iname)} — completed</div>`; calRender(); if(typeof ovRender==='function') ovRender();
}


