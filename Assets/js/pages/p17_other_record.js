/* page module (original lines 3809-4193) */
/* ============================================================
   UNIVERSAL REPLACEMENT HISTORY  (table: item_replacement_history)
   Filter / Oil / Other entry pages all write here; snapshots
   last_filter_consumption / last_oil_consumption are kept in sync by DB triggers.
   ============================================================ */
const RH_TABLE = 'item_replacement_history';
const rhUuid = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16);}));
const rhClean = s => String(s||'').trim().replace(/[,()%*]/g,'');
async function rhLoadItems(cat){
  const { data, error } = await db.from('items').select('id,item_name,item_code,item_category,unit,status').ilike('item_category', cat).order('item_name');
  if (error) throw error;
  return (data||[]).filter(i=>i.status!=='Inactive');
}
/* rows share one entry_group_id; a retry with the same group id cannot duplicate (unique index) */
async function rhInsert(rows){
  const { error } = await db.from(RH_TABLE).insert(rows);
  if (error && error.code!=='23505') return error;   // 23505 = this group was already saved
  return null;
}
const rhBase = (v,it,date,qty,meter,rem,extra) => ({
  vehicle_name:v.vehicle_name, vehicle_code:v.code, item_id:it.id, item_name:it.item_name, item_code:it.item_code,
  item_category:it.item_category, replacement_date:date, quantity:qty, uom:it.unit||null,
  meter_reading:meter, remarks:rem||null, extra_data:extra||{}, created_by:(currentUser&&String(currentUser.id))||null });

/* ---------------- Filter entry (existing UI, dynamic items) ---------------- */
let deItems = [], deGid = null, deBusy = false;
async function deLoadItems(){ try{ deItems = await rhLoadItems('Filter'); }catch(e){ deItems=[]; toast('Could not load filter items: '+e.message,'error'); } deGid = rhUuid(); }
function deBuildFilters(){
  const host = document.getElementById('de_filters'); if(!host) return;
  if (!deItems.length){ host.innerHTML='<div class="text-sm text-slate-500 col-span-full">No active items with category "Filter" found in Item Master.</div>'; return; }
  host.innerHTML = deItems.map(it=>`
   <div class="border border-slate-200 rounded-xl p-3"><label class="block mb-2 text-sm font-medium">${escapeHtml(it.item_name)} <span class="font-mono text-[10px] text-slate-400">${escapeHtml(it.item_code||'')}</span></label>
     <div class="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
       ${[0,1,2].map(n=>`<label class="cursor-pointer"><input type="radio" name="de_${it.id}" value="${n}" class="peer sr-only" ${n===0?'checked':''}/>
         <span class="block text-center py-2.5 rounded-lg font-bold text-lg text-slate-500 peer-checked:bg-teal-50 peer-checked:text-teal-700 peer-checked:ring-2 peer-checked:ring-teal-600">${n}</span></label>`).join('')}
     </div></div>`).join('');
}
async function deSave(){
  if (deBusy) return;
  const er = document.getElementById('de_err'); er.textContent='';
  const date = document.getElementById('de_date').value, mr = document.getElementById('de_meter').value.trim(), n = parseFloat(mr);
  if (!date){ er.textContent='Select the filter change date.'; return; }
  if (!deSel || !fqVehicles.some(v=>v.id===deSel.id)){ er.textContent='Select a vehicle from the list.'; return; }
  if (mr==='' || isNaN(n) || n<0){ er.textContent='Enter a valid meter reading (0 or more). Use 0 if the vehicle has no meter.'; return; }
  const gid = deGid || (deGid = rhUuid());
  const rows = [];
  for (const it of deItems){
    const c = document.querySelector(`input[name="de_${it.id}"]:checked`), q = c ? parseInt(c.value,10) : 0;
    if (q>0) rows.push({...rhBase(deSel,it,date,q,n,null,{source:'filter_entry'}), entry_group_id:gid});
  }
  if (!rows.length){ er.textContent='Select quantity 1 or 2 for at least one filter.'; return; }
  deBusy = true; const b = document.getElementById('de_save'); b.disabled = true; b.textContent = 'Saving…';
  const error = await rhInsert(rows);
  deBusy = false; b.disabled = false; b.innerHTML = '&#10003; Save Record';
  if (error){ er.textContent='Not saved: '+error.message; toast('Record not saved','error'); return; }
  try{ await logActivity('FILTER_RECORD_CREATE',RH_TABLE,null,`${deSel.vehicle_name} (${deSel.code})`); }catch(e){}
  toast('Record saved for '+deSel.vehicle_name,'success');
  deSel = null; deGid = rhUuid(); deShowSel(); deResetRes(); deBuildFilters();
  document.getElementById('de_meter').value='0'; document.getElementById('de_date').value=deToday();
}
{ const _r = ROUTES.de_record; ROUTES.de_record = async host => { await deLoadItems(); return _r(host); }; }

/* ---------------- Oil entry (existing UI, dynamic items) ---------------- */
let oeGid = null;
async function oeLoadOilItems(){
  let items=[]; try{ items = await rhLoadItems('Oil'); }catch(e){ toast('Could not load oil items: '+e.message,'error'); }
  OE_OILS.length = 0; items.forEach(i=>OE_OILS.push([i.item_name, i.unit||'Litre', i.id, i.item_code, i.item_category]));
  oeGid = rhUuid();
}
function oeBuildOils(){
  const host = document.getElementById('oe_oils'); if(!host) return;
  if(!OE_OILS.length){ host.innerHTML='<div class="text-sm text-slate-500 col-span-full">No active items with category "Oil" found in Item Master.</div>'; return; }
  host.innerHTML=OE_OILS.map((o,i)=>`
   <div class="border border-slate-200 rounded-xl p-3"><div class="text-sm font-medium mb-2 break-words">${escapeHtml(o[0])} <span class="text-slate-400 text-xs">(${escapeHtml(o[1])})</span></div>
     <div class="flex gap-1 bg-slate-100 p-1 rounded-xl">
       ${[0,6,10].map(n=>`<button type="button" data-i="${i}" data-n="${n}" class="${oeSegCls(n===0)}">${n}</button>`).join('')}
       <button type="button" data-i="${i}" data-n="other" class="${oeSegCls(false)}">Other</button></div>
     <input type="number" id="oe_o${i}" inputmode="decimal" min="0" step="0.01" placeholder="Qty" class="hidden mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"/></div>`).join('');
}
async function oeSave(){
  if(oeBusy) return;
  const er=document.getElementById('oe_err'); er.textContent='';
  const fail=m=>{ er.textContent=m; };
  const mr=document.getElementById('oe_meter').value.trim(), m=parseFloat(mr);
  if(!oeSel || !oeVehicles.some(v=>v.code===oeSel.code)) return fail('Select a vehicle from the list.');
  for(let i=0;i<OE_OILS.length;i++){
    const oth=document.getElementById('oe_o'+i);
    if(!oth.classList.contains('hidden') && !(oeQty[i]>0)) return fail('Enter a quantity greater than zero for: '+OE_OILS[i][0]+' (or select 0).');
  }
  const used=OE_OILS.map((o,i)=>({o,q:oeQty[i]})).filter(x=>x.q>0);
  if(!used.length) return fail('Enter a quantity for at least one oil type.');
  if(!oePurpose) return fail('Select a purpose.');
  if(mr===''||isNaN(m)||m<0) return fail('Enter a valid meter reading (0 or more).');
  oeBusy=true;
  const b=document.getElementById('oe_save'); b.disabled=true; b.textContent='Saving…';
  const pickedDate=document.getElementById('oe_dt').value;
  if(!pickedDate || pickedDate>deToday()){ oeBusy=false; b.disabled=false; b.innerHTML='&#10003; Save Oil Entry'; return fail(!pickedDate?'Select the date.':'The date cannot be in the future.'); }
  const gid = oeGid || (oeGid = rhUuid()), now=(pickedDate===deToday()?new Date():new Date(pickedDate+'T12:00:00')).toISOString(), rm=document.getElementById('oe_rem').value.trim()||null;
  const v={vehicle_name:oeSel.vehicle_name, code:oeSel.code};
  const rows=used.map(x=>({...rhBase(v,{id:x.o[2],item_name:x.o[0],item_code:x.o[3],item_category:x.o[4],unit:x.o[1]},pickedDate,x.q,m,rm,
      {source:'oil_entry',purpose:oePurpose,operator_name:(currentUser&&currentUser.full_name)||null,company:'Automobile',entry_datetime:now}), entry_group_id:gid}));
  const error = await rhInsert(rows);
  oeBusy=false; b.disabled=false; b.innerHTML='&#10003; Save Oil Entry';
  if(error){ fail('Not saved: '+error.message); toast('Oil entry not saved','error'); return; }
  try{ await logActivity('OIL_ENTRY_CREATE',RH_TABLE,null,`${oeSel.vehicle_name} (${oeSel.code})`); }catch(e){}
  toast('Oil entry saved for '+oeSel.vehicle_name,'success');
  oeSel=null; oePurpose=null; oeQty=OE_OILS.map(()=>0); oeGid=rhUuid(); document.getElementById('oe_dt').value=deToday();
  oeShowSel(); oeResetRes(); oeBuildOils();
  document.querySelectorAll('#oe_purp button').forEach(x=>x.className='oe-p py-3 px-2 rounded-lg text-sm font-bold border-2 bg-slate-100 text-slate-500 border-transparent');
  document.getElementById('oe_meter').value='0'; document.getElementById('oe_rem').value='';
}
{ const _r = ROUTES.oil_record; ROUTES.oil_record = async host => { await oeLoadOilItems(); return _r(host); }; }

/* ---------------- Other Item Replacement (search-based entry) ---------------- */
let otVeh=null, otRows=[], otGid=null, otBusy=false, otT=null;
const otCard='bg-white rounded-xl shadow-sm border border-slate-200 p-5', otInp='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm';
ROUTES.other_record = async host => {
  otVeh=null; otRows=[]; otGid=rhUuid();
  host.innerHTML=`
   <div class="max-w-2xl mx-auto space-y-4">
    <div class="${otCard}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">1. Vehicle</h3>
      <div class="relative"><input id="ot_vq" autocomplete="off" placeholder="Search vehicle name or code, or scan its QR" class="${otInp} pr-14"/>
        <button type="button" id="ot_scan" title="Scan vehicle QR code" aria-label="Scan vehicle QR code" class="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 flex items-center justify-center"><i data-lucide="qr-code" class="w-5 h-5"></i></button></div>
      <div id="ot_vres" class="hidden mt-2 rounded-lg bg-slate-100 max-h-64 overflow-auto"></div><div id="ot_vsel"></div></div>
    <div class="${otCard}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">2. Replacement date</h3>
      <input type="date" id="ot_date" max="${deToday()}" value="${deToday()}" class="${otInp}"/></div>
    <div class="${otCard}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">3. Items</h3>
      <input id="ot_iq" autocomplete="off" placeholder="Search item name, code or category" class="${otInp}"/>
      <div id="ot_ires" class="hidden mt-2 rounded-lg bg-slate-100 max-h-72 overflow-auto"></div>
      <div id="ot_list" class="mt-3 overflow-x-auto"></div></div>
    <div class="${otCard}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">4. Meter reading &amp; remarks</h3>
      <input type="number" id="ot_meter" inputmode="decimal" min="0" step="any" value="0" placeholder="Vehicle meter reading (0 if no meter)" class="${otInp} mb-3"/>
      <textarea id="ot_rem" rows="2" maxlength="500" placeholder="Remarks (optional)" class="${otInp}"></textarea></div>
    <div id="ot_err" class="text-red-600 text-sm min-h-[1rem]"></div>
    <button id="ot_save" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl py-3.5 text-base">&#10003; Submit Replacement</button>
   </div>`;
  await fqLoadVehicles();
  const $=id=>document.getElementById(id);
  $('ot_vq').addEventListener('input',()=>{
    const q=$('ot_vq').value.trim(), box=$('ot_vres'); if(!q){ box.classList.add('hidden'); return; }
    const r=fqVehicles.filter(v=>deMatch(v,q)).slice(0,30); box.classList.remove('hidden');
    box.innerHTML=r.length?r.map(v=>`<button type="button" data-id="${v.id}" class="flex justify-between w-full px-4 py-3 text-sm text-left border-b border-slate-200 bg-white hover:bg-teal-50"><span>${escapeHtml(v.vehicle_name)}</span><span class="font-mono text-xs text-slate-500">${escapeHtml(v.code)}</span></button>`).join(''):'<div class="p-4 text-sm text-slate-500">No matching vehicle</div>';
  });
  $('ot_vres').addEventListener('click',e=>{ const b=e.target.closest('button[data-id]'); if(!b) return;
    otVeh=fqVehicles.find(v=>v.id==b.dataset.id); $('ot_vq').value=''; $('ot_vres').classList.add('hidden'); otShowVeh(); });
  $('ot_iq').addEventListener('input',()=>{ clearTimeout(otT); otT=setTimeout(otSearchItems,250); });
  $('ot_ires').addEventListener('click',e=>{ const b=e.target.closest('button[data-i]'); if(!b) return; otAdd(otFound[+b.dataset.i]); });
  $('ot_list').addEventListener('click',e=>{ const b=e.target.closest('button[data-rm]'); if(b){ otRows.splice(+b.dataset.rm,1); otRender(); } });
  $('ot_list').addEventListener('input',e=>{ const t=e.target; if(t.dataset.q!==undefined) otRows[+t.dataset.q].qty=parseFloat(t.value); });
  $('ot_save').addEventListener('click',otSave);
  $('ot_scan').addEventListener('click',otOpenScanner);
  otRender(); lucide.createIcons();
};
function otShowVeh(){
  document.getElementById('ot_vsel').innerHTML = otVeh ? `<div class="mt-3 flex items-center gap-3 rounded-xl border-2 border-teal-600 bg-teal-50 px-4 py-3"><div><div class="font-semibold">${escapeHtml(otVeh.vehicle_name)}</div><div class="font-mono text-xs text-slate-500">${escapeHtml(otVeh.code)}</div></div><button type="button" id="ot_vclr" class="ml-auto text-sm px-3 py-1.5 rounded-lg bg-white border border-slate-300">Change</button></div>` : '';
  const c=document.getElementById('ot_vclr'); if(c) c.onclick=()=>{ otVeh=null; otShowVeh(); };
}
let otFound=[];

/* ---- QR scanning for Other Item Replacement vehicle selection ---- */
let otScanner=null, otScanBusy=false;
function otSelectByCode(raw){
  const code=String(raw||'').trim().toUpperCase();
  const v=fqVehicles.find(x=>String(x.code).toUpperCase()===code);
  if(!v){ toast(`No registered vehicle for "${code}"`,'error'); return false; }
  otVeh=v; const q=document.getElementById('ot_vq'); if(q) q.value='';
  const r=document.getElementById('ot_vres'); if(r) r.classList.add('hidden');
  otShowVeh(); toast('Vehicle selected: '+v.vehicle_name,'success');
  return true;
}
async function otStopScan(){
  const sc=otScanner; otScanner=null; if(!sc) return;
  try{ if(sc.isScanning) await sc.stop(); }catch(e){}
  try{ sc.clear(); }catch(e){}
}
function otOpenScanner(){
  if(typeof Html5Qrcode==='undefined'){ toast('QR scanner could not load. Check your internet connection.','error'); return; }
  openModal('Scan vehicle QR code', `
    <div id="ot_reader" class="w-full rounded-xl overflow-hidden bg-slate-900 min-h-[260px]"></div>
    <p id="ot_scanMsg" class="text-sm text-slate-500 mt-3 text-center">Point the camera at the vehicle's QR code.</p>
    <div class="text-center mt-3">
      <label class="inline-flex items-center gap-2 text-sm text-teal-700 cursor-pointer hover:underline">
        <i data-lucide="image" class="w-4 h-4"></i> Upload a QR image instead
        <input type="file" id="ot_qrfile" accept="image/*" class="hidden"/></label>
    </div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>`);
  const msg=t=>{ const m=document.getElementById('ot_scanMsg'); if(m) m.textContent=t; };
  const sc=new Html5Qrcode('ot_reader'); otScanner=sc; otScanBusy=false;
  const onHit=async text=>{
    if(otScanBusy) return; otScanBusy=true;
    if(otSelectByCode(text)){ await otStopScan(); closeModal(); }
    else setTimeout(()=>{ otScanBusy=false; },1500);
  };
  sc.start({facingMode:'environment'},{fps:10,qrbox:{width:230,height:230}},onHit,()=>{})
    .catch(err=>{
      const txt=String(err||'');
      msg(/Permission|NotAllowed/i.test(txt)?'Camera access was blocked. Allow the camera in your browser, or upload a QR image.'
        :window.isSecureContext?'Could not start the camera. You can upload a QR image instead.'
        :'The camera needs a secure (https) page. You can upload a QR image instead.');
    });
  document.getElementById('ot_qrfile').addEventListener('change',async e=>{
    const file=e.target.files[0]; if(!file) return;
    try{
      if(sc.isScanning) await sc.stop();
      const text=await sc.scanFile(file,false);
      if(otSelectByCode(text)){ await otStopScan(); closeModal(); }
    }catch(err){ msg('No QR code found in that image. Try another one.'); }
    e.target.value='';
  });
  lucide.createIcons();
}
async function otSearchItems(){
  const q=rhClean(document.getElementById('ot_iq').value), box=document.getElementById('ot_ires'); if(!box) return;
  if(q.length<2){ box.classList.add('hidden'); return; }
  const { data, error } = await db.from('items').select('id,item_name,item_code,item_category,unit,status')
    .or(`item_name.ilike.%${q}%,item_code.ilike.%${q}%,item_category.ilike.%${q}%`).order('item_name').limit(40);
  box.classList.remove('hidden');
  if(error){ box.innerHTML=`<div class="p-4 text-sm text-red-600">${escapeHtml(error.message)}</div>`; return; }
  otFound=(data||[]).filter(i=>i.status!=='Inactive' && !/^(filter|oil)$/i.test((i.item_category||'').trim())).slice(0,20);
  box.innerHTML=otFound.length?otFound.map((i,k)=>`<button type="button" data-i="${k}" class="block w-full px-4 py-2.5 text-left border-b border-slate-200 bg-white hover:bg-teal-50"><div class="text-sm font-medium">${escapeHtml(i.item_name)}</div><div class="text-xs text-slate-500"><span class="font-mono">${escapeHtml(i.item_code||'')}</span> · ${escapeHtml(i.item_category||'—')} · ${escapeHtml(i.unit||'')}</div></button>`).join(''):'<div class="p-4 text-sm text-slate-500">No matching items (Filter/Oil items use their own pages)</div>';
}
function otAdd(it){
  if(!it) return;
  if(otRows.some(r=>r.it.id===it.id)){ toast('Item already added.','error'); return; }
  otRows.push({it, qty:1});
  const q=document.getElementById('ot_iq'); q.value=''; document.getElementById('ot_ires').classList.add('hidden'); otRender();
}
function otRender(){
  const h=document.getElementById('ot_list'); if(!h) return;
  h.innerHTML=otRows.length?`<table class="data w-full text-sm"><thead><tr><th class="text-left px-2 py-2">Item</th><th class="text-left px-2 py-2">Code</th><th class="text-left px-2 py-2 w-28">Qty</th><th class="text-left px-2 py-2 w-20">UoM</th><th class="text-left px-2 py-2 w-20">Action</th></tr></thead><tbody>
   ${otRows.map((r,i)=>`<tr><td class="px-2 py-2">${escapeHtml(r.it.item_name)}<div class="text-[11px] text-slate-400">${escapeHtml(r.it.item_category||'')}</div></td><td class="px-2 py-2 font-mono text-xs">${escapeHtml(r.it.item_code||'')}</td>
   <td class="px-2 py-2 align-middle"><input type="number" data-q="${i}" min="0.01" step="any" value="${r.qty}" class="w-24 border border-slate-300 rounded-lg px-2 py-1.5 text-sm"/></td><td class="px-2 py-2 align-middle">${escapeHtml(r.it.unit||'')}</td>
   <td class="px-2 py-2"><button type="button" data-rm="${i}" class="text-red-600 text-xs">Remove</button></td></tr>`).join('')}</tbody></table>`
   :'<div class="text-sm text-slate-400">No items added yet.</div>';
}
async function otSave(){
  if(otBusy) return;
  const er=document.getElementById('ot_err'); er.textContent=''; const fail=m=>{ er.textContent=m; };
  const date=document.getElementById('ot_date').value, mr=document.getElementById('ot_meter').value.trim(), m=mr===''?null:parseFloat(mr);
  if(!otVeh) return fail('Select a vehicle.');
  if(!date) return fail('Select the replacement date.');
  if(!otRows.length) return fail('Add at least one item.');
  if(otRows.some(r=>!(r.qty>0))) return fail('Quantity must be greater than zero for every item.');
  if(m!==null && (isNaN(m)||m<0)) return fail('Enter a valid meter reading.');
  otBusy=true; const b=document.getElementById('ot_save'); b.disabled=true; b.textContent='Saving…';
  const rm=document.getElementById('ot_rem').value.trim();
  const rows=otRows.map(r=>({...rhBase(otVeh,r.it,date,r.qty,m,rm,{source:'other_entry'}), entry_group_id:otGid}));
  const error=await rhInsert(rows);
  otBusy=false; b.disabled=false; b.innerHTML='&#10003; Submit Replacement';
  if(error){ fail('Not saved: '+error.message); toast('Not saved','error'); return; }
  try{ await logActivity('OTHER_REPLACEMENT_CREATE',RH_TABLE,null,`${otVeh.vehicle_name} (${otVeh.code})`); }catch(e){}
  toast('Replacement saved for '+otVeh.vehicle_name,'success');
  otVeh=null; otRows=[]; otGid=rhUuid(); otShowVeh(); otRender();
  document.getElementById('ot_meter').value='0'; document.getElementById('ot_rem').value=''; document.getElementById('ot_date').value=deToday();
}

/* ---------------- History pages (Filter / Oil / Other) ---------------- */
const RH_PAGE = 15; let rhS = {kind:'Filter', page:0, total:0, rows:[], readOnly:false};
function rhQuery(q){
  const k=rhS.kind, g=id=>(document.getElementById(id)||{}).value||'';
  q = q.eq('entry_type', k);
  const s=rhClean(g('rh_s')); if(s) q=q.or(`vehicle_name.ilike.%${s}%,vehicle_code.ilike.%${s}%`);
  const i=rhClean(g('rh_i')); if(i) q=q.or(`item_name.ilike.%${i}%,item_code.ilike.%${i}%`);
  const c=rhClean(g('rh_c')); if(c) q=q.ilike('item_category',`%${c}%`);
  if(k==='Oil' && g('rh_p')) q=q.eq('extra_data->>purpose', g('rh_p'));
  if(g('rh_f')) q=q.gte('replacement_date',g('rh_f'));
  if(g('rh_t')) q=q.lte('replacement_date',g('rh_t'));
  return q;
}
const rhOrder = q => q.order('replacement_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false});
function rhRoute(host, kind, readOnly=false){
  rhS = {kind, page:0, total:0, rows:[], readOnly};
  const inp='w-full border border-slate-300 rounded-lg px-3 py-2 text-sm', L=(t,h)=>`<div><label class="block mb-1 text-xs font-medium">${t}</label>${h}</div>`;
  host.innerHTML=`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
   <h3 class="font-semibold text-navy-900 mb-3">${readOnly ? (kind==='Other'?'Spare change':kind+' change')+' data' : (kind==='Other'?'Other item replacement':kind+' change')+' history'}</h3>
   <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-4 items-end">
     ${L('Vehicle',`<input id="rh_s" placeholder="Vehicle name or code" class="${inp}"/>`)}
     ${L('Item',`<input id="rh_i" placeholder="Item name or code" class="${inp}"/>`)}
     ${kind==='Other'?L('Category',`<input id="rh_c" placeholder="Category" class="${inp}"/>`):''}
     ${kind==='Oil'?L('Purpose',`<select id="rh_p" class="${inp}"><option value="">All purposes</option>${OE_PURPOSES.map(p=>`<option>${escapeHtml(p)}</option>`).join('')}</select>`):''}
     ${L('From',`<input type="date" id="rh_f" class="${inp}"/>`)}${L('To',`<input type="date" id="rh_t" class="${inp}"/>`)}
   </div>
   <div class="flex justify-end gap-2 mb-3"><button id="rh_x" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-2 text-sm font-medium">Export Excel</button><button id="rh_r" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-2 text-sm font-medium">Refresh</button></div>
   <div id="rh_out" class="text-slate-400 text-sm">Loading…</div>
   <div class="flex items-center justify-between mt-3 gap-2"><button id="rh_pv" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Previous</button><span id="rh_pi" class="text-sm text-slate-500"></span><button id="rh_n" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Next</button></div></div>`;
  ['rh_s','rh_i','rh_c','rh_p','rh_f','rh_t'].forEach(id=>{ const e=document.getElementById(id); if(e) e.addEventListener('input',()=>{ rhS.page=0; clearTimeout(window._rhT); window._rhT=setTimeout(rhLoad,250); }); });
  document.getElementById('rh_r').onclick=rhLoad; document.getElementById('rh_x').onclick=rhExport;
  document.getElementById('rh_pv').onclick=()=>{ rhS.page--; rhLoad(); }; document.getElementById('rh_n').onclick=()=>{ rhS.page++; rhLoad(); };
  document.getElementById('rh_out').addEventListener('click',e=>{ const b=e.target.closest('button[data-act]'); if(b && !rhS.readOnly){ e.stopPropagation(); const r=rhS.rows[b.dataset.i]; return b.dataset.act==='edit'?rhEdit(r):rhDelete(r); } const tr=e.target.closest('[data-i]'); if(tr) rhDetail(rhS.rows[tr.dataset.i]); });
  return rhLoad();
}
const rhCols = k => [['Date','replacement_date'],['Vehicle','vehicle_name'],[k==='Oil'?'Oil Item':'Item','item_name'],...(k==='Other'?[['Category','item_category']]:[]),['Item Code','item_code'],['Quantity','quantity'],['UoM','uom'],['Meter Reading','meter_reading'],['Remarks','remarks']];
async function rhLoad(){
  const out=document.getElementById('rh_out'); if(!out) return;
  const { data, count, error } = await rhOrder(rhQuery(db.from(RH_TABLE).select('*',{count:'exact'}))).range(rhS.page*RH_PAGE, rhS.page*RH_PAGE+RH_PAGE-1);
  if(error){ out.innerHTML=`<div class="text-red-600">Could not load records: ${escapeHtml(error.message)}</div>`; return; }
  rhS.total=count||0; rhS.rows=data; const cols=rhCols(rhS.kind);
  out.innerHTML=data.length?`<div class="overflow-x-auto"><table class="data w-full text-sm"><thead><tr>${cols.map(c=>`<th class="text-left px-3 py-2 whitespace-nowrap">${c[0]}</th>`).join('')}${rhS.readOnly?'':'<th class="text-left px-3 py-2">Actions</th>'}</tr></thead><tbody>
   ${data.map((r,i)=>`<tr data-i="${i}" class="cursor-pointer hover:bg-teal-50">${cols.map(c=>`<td class="px-3 py-2 ${c[1]==='remarks'?'':'whitespace-nowrap'}">${escapeHtml(r[c[1]]??'')}</td>`).join('')}${rhS.readOnly?'':`<td class="px-3 py-2 whitespace-nowrap"><button data-act="edit" data-i="${i}" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-teal-700 hover:bg-teal-50" title="Edit" aria-label="Edit"><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i></button><button data-act="del" data-i="${i}" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-red-600 hover:bg-red-50" title="Delete" aria-label="Delete"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button></td>`}</tr>`).join('')}</tbody></table></div>`
   :'<div class="py-6 text-center text-slate-400">No records match these filters.</div>';
  document.getElementById('rh_pi').textContent=`${rhS.total?rhS.page*RH_PAGE+1:0}–${Math.min(rhS.total,rhS.page*RH_PAGE+RH_PAGE)} of ${rhS.total}`;
  document.getElementById('rh_pv').disabled=rhS.page===0; document.getElementById('rh_n').disabled=(rhS.page+1)*RH_PAGE>=rhS.total;
  lucide.createIcons();
}
function rhDetail(r){
  if(!r) return; const ex=r.extra_data||{};
  openModal(rhS.kind+' replacement', `<div class="font-semibold">${escapeHtml(r.vehicle_name)} <span class="font-mono text-xs text-slate-500">${escapeHtml(r.vehicle_code)}</span></div>
   <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm mt-3">
    <dt class="text-slate-500">Date</dt><dd class="font-medium">${r.replacement_date}</dd>
    <dt class="text-slate-500">Item</dt><dd class="font-medium">${escapeHtml(r.item_name)} <span class="font-mono text-xs">${escapeHtml(r.item_code||'')}</span></dd>
    <dt class="text-slate-500">Category</dt><dd class="font-medium">${escapeHtml(r.item_category||'')}</dd>
    <dt class="text-slate-500">Quantity</dt><dd class="font-medium">${r.quantity} ${escapeHtml(r.uom||'')}</dd>
    <dt class="text-slate-500">Meter reading</dt><dd class="font-medium">${r.meter_reading??''}</dd>
    <dt class="text-slate-500">Remarks</dt><dd class="font-medium">${escapeHtml(r.remarks||'')}</dd>
    ${Object.entries(ex).filter(([k])=>k!=='source').map(([k,v])=>`<dt class="text-slate-500">${escapeHtml(k.replace(/_/g,' '))}</dt><dd class="font-medium">${escapeHtml(v??'')}</dd>`).join('')}
    <dt class="text-slate-500">Entry group</dt><dd class="font-mono text-xs">${r.entry_group_id}</dd>
    <dt class="text-slate-500">Saved</dt><dd class="font-medium">${fmtDateTime(r.created_at)}</dd></dl>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Close</button>`);
}

/* ---- Edit / Delete a replacement-history record ---- */
function rhEdit(r){
  if(!r) return; const ex=r.extra_data||{}, inp='w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';
  const L=(t,h)=>`<div><label class="block mb-1 text-xs font-medium">${t}</label>${h}</div>`;
  openModal('Edit '+rhS.kind+' record', `<div class="font-semibold mb-1">${escapeHtml(r.vehicle_name)} <span class="font-mono text-xs text-slate-500">${escapeHtml(r.vehicle_code)}</span></div>
   <div class="text-xs text-slate-500 mb-3">${escapeHtml(r.item_name)} ${escapeHtml(r.item_code||'')}</div>
   <div class="grid grid-cols-2 gap-3">
    ${L('Date',`<input type="date" id="rhe_d" value="${escapeHtml(r.replacement_date||'')}" class="${inp}"/>`)}
    ${L('Quantity',`<input type="number" step="any" min="0" id="rhe_q" value="${escapeHtml(r.quantity??'')}" class="${inp}"/>`)}
    ${L('Meter reading',`<input type="number" step="any" min="0" id="rhe_m" value="${escapeHtml(r.meter_reading??'')}" class="${inp}"/>`)}
    ${rhS.kind==='Oil'?L('Purpose',`<select id="rhe_p" class="${inp}">${OE_PURPOSES.map(p=>`<option ${p===ex.purpose?'selected':''}>${escapeHtml(p)}</option>`).join('')}</select>`):'<div></div>'}
   </div>
   <div class="mt-3">${L('Remarks',`<textarea id="rhe_r" rows="2" class="${inp}">${escapeHtml(r.remarks||'')}</textarea>`)}</div>
   <div id="rhe_err" class="text-red-600 text-xs min-h-[1rem] mt-2"></div>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
    <button id="rhe_save" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save changes</button>`);
  document.getElementById('rhe_save').onclick = async ()=>{
    const er=document.getElementById('rhe_err'), date=document.getElementById('rhe_d').value;
    const q=parseFloat(document.getElementById('rhe_q').value), mv=document.getElementById('rhe_m').value.trim(), m=mv===''?null:parseFloat(mv);
    if(!date){ er.textContent='Date is required.'; return; }
    if(isNaN(q)||q<0){ er.textContent='Enter a valid quantity.'; return; }
    if(m!==null && (isNaN(m)||m<0)){ er.textContent='Enter a valid meter reading.'; return; }
    const upd={replacement_date:date, quantity:q, meter_reading:m, remarks:document.getElementById('rhe_r').value.trim()||null};
    if(rhS.kind==='Oil'){ upd.extra_data=Object.assign({}, ex, {purpose:document.getElementById('rhe_p').value}); }
    const btn=document.getElementById('rhe_save'); btn.disabled=true;
    const { error } = await db.from(RH_TABLE).update(upd).eq('id', r.id);
    if(error){ btn.disabled=false; er.textContent='Could not save: '+error.message; return; }
    try{ await logActivity('EDIT_REPLACEMENT', RH_TABLE, r.id, `${r.vehicle_code} · ${r.item_name} · ${date}`); }catch(_){}
    closeModal(); toast('Record updated','success'); rhLoad();
  };
}
function rhDelete(r){
  if(!r) return;
  openModal('Delete record?', `<p class="text-sm">Delete this ${escapeHtml(rhS.kind.toLowerCase())} record?</p>
   <div class="mt-2 text-sm bg-slate-50 rounded-lg p-3"><b>${escapeHtml(r.vehicle_name)}</b> <span class="font-mono text-xs">${escapeHtml(r.vehicle_code)}</span><br>${escapeHtml(r.item_name)} · ${escapeHtml(r.replacement_date)} · qty ${escapeHtml(r.quantity??'')}</div>
   <p class="text-xs text-red-600 mt-2">This cannot be undone.</p><div id="rhd_err" class="text-red-600 text-xs mt-1"></div>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
    <button id="rhd_go" class="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-700 text-white rounded-lg">Delete</button>`);
  document.getElementById('rhd_go').onclick = async ()=>{
    const btn=document.getElementById('rhd_go'); btn.disabled=true;
    const { error } = await db.from(RH_TABLE).delete().eq('id', r.id);
    if(error){ btn.disabled=false; document.getElementById('rhd_err').textContent='Could not delete: '+error.message; return; }
    try{ await logActivity('DELETE_REPLACEMENT', RH_TABLE, r.id, `${r.vehicle_code} · ${r.item_name} · ${r.replacement_date}`); }catch(_){}
    closeModal(); toast('Record deleted','success');
    if(rhS.rows.length===1 && rhS.page>0) rhS.page--; rhLoad();
  };
}
async function rhExport(){
  if(typeof XLSX==='undefined'){ toast('Excel library not loaded.','error'); return; }
  const cols=rhCols(rhS.kind); let all=[], from=0;
  for(;;){ const { data, error } = await rhOrder(rhQuery(db.from(RH_TABLE).select('*'))).range(from,from+999);
    if(error){ toast('Export failed: '+error.message,'error'); return; } all=all.concat(data||[]); if(!data||data.length<1000) break; from+=1000; }
  if(!all.length){ toast('Nothing to export.','error'); return; }
  const rows=all.map(r=>{ const o={}; cols.forEach(c=>o[c[0]]=r[c[1]]??''); o['Vehicle Code']=r.vehicle_code; if(rhS.kind==='Oil') o['Purpose']=(r.extra_data||{}).purpose||''; return o; });
  const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),rhS.kind+' History');
  XLSX.writeFile(wb,`${rhS.kind}_replacement_history_${deToday()}.xlsx`);
}
ROUTES.de_history = async host => rhRoute(host,'Filter');
ROUTES.oil_history = async host => rhRoute(host,'Oil');
ROUTES.other_history = async host => rhRoute(host,'Other');
/* Read-only views for Data Entry users: same tables, no Edit / Delete */
ROUTES.de_data    = async host => rhRoute(host,'Filter',true);
ROUTES.oil_data   = async host => rhRoute(host,'Oil',true);
ROUTES.other_data = async host => rhRoute(host,'Other',true);

