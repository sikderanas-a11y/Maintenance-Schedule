/* page module (original lines 3367-3619) */
/* ============================================================
   DATA ENTRY DEPARTMENT - OIL ENTRY & OIL CHANGE HISTORY
   Tables (oil Supabase project): master (read), oil_entries (insert / read)
   ============================================================ */
const OE_OILS=[["Engine Oil Delvac MX 15W-40 (CF -4/SG/CI-4)","Litre"],["Gear Oil HD 80W-90(GL-5)","Litre"],["Gear Oil HD 85W-140(GL-5)","Litre"],["Transmission Fluid ATF 220 SYN Tech (Dexron III)","Litre"],["Brake Fluid DOT 4","Litre"],["Hydraulic Oil DTE 24 Ultra (ISO VG 32)","Litre"],["Hydraulic Oil DTE 25 Ultra (ISO VG 46)","Litre"],["Hydraulic Oil DTE 26 Ultra (ISO VG 68)","Litre"],["Grease EP 2 (NLGI -2)","kg"],["Grease EP 3 (NLGI -3)","kg"],["Grease (Synthetic) Mobilith SHC 220","kg"],["Compressor Oil Rarus SHC 1025 (ISO VG 46)","Litre"],["Mobil Gear (Gear Oil)-600XP320","Litre"],["Coolant Extra Ready Mix","Litre"]];
const OE_PURPOSES=["Scheduled Maintenance","Loss Oil / Leakage","Breakdown / Emergency","Other"];
const OE_PAGE=15;
let oeVehicles=[], oeSel=null, oeQty=[], oePurpose=null, oeBusy=false, oePage=0, oeTotal=0, oeRows=[], oeScanner=null, oeScanBusy=false;

async function oeLoadVehicles(){
  let all=[], from=0;
  for(;;){
    const { data, error } = await oilDb.from('master').select('code, vehicle_name').order('code').range(from,from+999);
    if(error){ toast('Could not load vehicles: '+error.message,'error'); throw error; }
    all=all.concat(data||[]);
    if(!data||data.length<1000) break;
    from+=1000;
  }
  oeVehicles=all.map(v=>({code:String(v.code||''),vehicle_name:String(v.vehicle_name||'')})).sort((a,b)=>a.vehicle_name.localeCompare(b.vehicle_name,undefined,{numeric:true}));
}

ROUTES.oil_record = async (host)=>{
  oeSel=null; oePurpose=null; oeQty=OE_OILS.map(()=>0);
  const card='bg-white rounded-xl shadow-sm border border-slate-200 p-5';
  const inp='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm';
  host.innerHTML=`
   <div class="max-w-2xl mx-auto space-y-4">
     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Date</h3>
       <label class="block mb-1 text-sm font-medium">Date <span class="text-red-500">*</span></label>
       <input type="date" id="oe_dt" max="${deToday()}" value="${deToday()}" class="${inp}"/></div>

     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Vehicle</h3>
       <label class="block mb-1 text-sm font-medium">Vehicle code or name <span class="text-red-500">*</span></label>
       <div class="relative"><input id="oe_vq" autocomplete="off" placeholder="e.g. f5, dt2, p3, ex1, t4, r6" class="${inp} pr-14"/>
         <button type="button" id="oe_scan" title="Scan vehicle QR code" aria-label="Scan vehicle QR code" class="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 flex items-center justify-center"><i data-lucide="qr-code" class="w-5 h-5"></i></button></div>
       <div id="oe_vres" class="hidden mt-2 rounded-lg bg-slate-100 max-h-64 overflow-auto"></div>
       <div id="oe_vsel"></div>
       <p class="text-xs text-slate-500 mt-3">f=Forklift &middot; p=Payloader &middot; dt=Dump Truck &middot; ex=Excavator &middot; t=Trolley &middot; r=Reach Truck</p></div>

     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-1">Oil consumption</h3>
       <p class="text-xs text-slate-500 mb-3">Select quantity for each oil type used. Leave at 0 if not used. Litres (grease in kg).</p>
       <div id="oe_oils" class="grid grid-cols-1 sm:grid-cols-2 gap-4"></div></div>

     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Purpose <span class="text-red-500">*</span></h3>
       <div id="oe_purp" class="grid grid-cols-2 gap-2">${OE_PURPOSES.map(p=>`<button type="button" data-p="${escapeHtml(p)}" class="oe-p py-3 px-2 rounded-lg text-sm font-bold bg-slate-100 text-slate-500 border-2 border-transparent">${escapeHtml(p)}</button>`).join('')}</div></div>

     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Meter reading</h3>
       <label class="block mb-1 text-sm font-medium">Current vehicle meter reading <span class="text-red-500">*</span></label>
       <div class="relative"><input type="number" id="oe_meter" inputmode="decimal" min="0" step="any" value="0" placeholder="0" class="${inp} pr-20"/>
         <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">HRS/KM</span></div></div>

     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Remarks</h3>
       <textarea id="oe_rem" rows="2" maxlength="500" placeholder="Optional" class="${inp}"></textarea></div>

     <div id="oe_err" class="text-red-600 text-sm min-h-[1rem]"></div>
     <button id="oe_save" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl py-3.5 text-base">&#10003; Save Oil Entry</button>
   </div>`;
  clearInterval(window._oeTick);
  oeBuildOils();
  await oeLoadVehicles();
  document.getElementById('oe_vq').addEventListener('input', oeSearch);
  document.getElementById('oe_vres').addEventListener('click', e=>{
    const b=e.target.closest('button[data-id]'); if(!b) return;
    oeSel=oeVehicles.find(v=>v.code==b.dataset.id);
    document.getElementById('oe_vq').value=''; oeResetRes(); oeShowSel();
  });
  document.getElementById('oe_oils').addEventListener('click', e=>{
    const b=e.target.closest('button[data-i]'); if(!b) return;
    const i=+b.dataset.i, n=b.dataset.n, oth=document.getElementById('oe_o'+i);
    if(n==='other'){ oth.classList.remove('hidden'); oth.focus(); oeQty[i]=parseFloat(oth.value)||0; }
    else { oth.classList.add('hidden'); oth.value=''; oeQty[i]=+n; }
    b.parentElement.querySelectorAll('button').forEach(x=>x.className=oeSegCls(x===b));
  });
  document.getElementById('oe_oils').addEventListener('input', e=>{
    const t=e.target; if(t.tagName==='INPUT') oeQty[+t.id.slice(4)]=parseFloat(t.value)||0;
  });
  document.getElementById('oe_purp').addEventListener('click', e=>{
    const b=e.target.closest('button[data-p]'); if(!b) return;
    oePurpose=b.dataset.p;
    document.querySelectorAll('#oe_purp button').forEach(x=>x.className='oe-p py-3 px-2 rounded-lg text-sm font-bold border-2 '+(x===b?'bg-teal-50 text-teal-700 border-teal-600':'bg-slate-100 text-slate-500 border-transparent'));
  });
  document.getElementById('oe_save').addEventListener('click', oeSave);
  document.getElementById('oe_scan').addEventListener('click', oeOpenScanner);
  lucide.createIcons();
};
const oeSegCls=sel=>'flex-1 py-2 rounded-lg font-bold text-sm border-2 '+(sel?'bg-teal-50 text-teal-700 border-teal-600':'text-slate-500 border-transparent');
function oeBuildOils(){
  document.getElementById('oe_oils').innerHTML=OE_OILS.map((o,i)=>`
   <div class="border border-slate-200 rounded-xl p-3"><div class="text-sm font-medium mb-2 break-words">${escapeHtml(o[0])} <span class="text-slate-400 text-xs">(${o[1]==='kg'?'kg':'L'})</span></div>
     <div class="flex gap-1 bg-slate-100 p-1 rounded-xl">
       ${[0,6,10].map(n=>`<button type="button" data-i="${i}" data-n="${n}" class="${oeSegCls(n===0)}">${n}</button>`).join('')}
       <button type="button" data-i="${i}" data-n="other" class="${oeSegCls(false)}">Other</button></div>
     <input type="number" id="oe_o${i}" inputmode="decimal" min="0" step="0.01" placeholder="Qty" class="hidden mt-2 w-full border border-slate-300 rounded-lg px-3 py-2 text-sm"/></div>`).join('');
}
function oeResetRes(){ const b=document.getElementById('oe_vres'); b.innerHTML=''; b.classList.add('hidden'); }
function oeSearch(){
  const q=document.getElementById('oe_vq').value.trim(), box=document.getElementById('oe_vres');
  if(!q){ oeResetRes(); return; }
  const r=oeVehicles.filter(v=>deMatch(v,q)).slice(0,30);
  box.classList.remove('hidden');
  box.innerHTML=r.length?r.map(v=>`<button type="button" data-id="${escapeHtml(v.code)}" class="flex justify-between w-full px-4 py-3 text-sm text-left border-b border-slate-200 bg-white hover:bg-teal-50"><span>${escapeHtml(v.vehicle_name)}</span><span class="font-mono text-xs text-slate-500">${escapeHtml(v.code)}</span></button>`).join('')
    :'<div class="p-4 text-sm text-slate-500">No matching vehicle</div>';
}
function oeShowSel(){
  const el=document.getElementById('oe_vsel');
  el.innerHTML=oeSel?`<div class="mt-3 flex items-center gap-3 rounded-xl border-2 border-teal-600 bg-teal-50 px-4 py-3">
    <div><div class="font-semibold">${escapeHtml(oeSel.vehicle_name)}</div><div class="font-mono text-xs text-slate-500">${escapeHtml(oeSel.code)}</div></div>
    <button type="button" id="oe_vclr" class="ml-auto text-sm px-3 py-1.5 rounded-lg bg-white border border-slate-300">Change</button></div>`:'';
  const c=document.getElementById('oe_vclr');
  if(c) c.onclick=()=>{ oeSel=null; oeShowSel(); document.getElementById('oe_vq').focus(); };
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
  const now=new Date().toISOString(), rm=document.getElementById('oe_rem').value.trim()||null;
  const rows=used.map(x=>({code:oeSel.code,vehicle_name:oeSel.vehicle_name,oil_type:x.o[0],quantity:x.q,unit:x.o[1],purpose:oePurpose,meter_reading:m,remarks:rm,operator_name:(currentUser&&currentUser.full_name)||null,company:'Automobile',entry_datetime:now}));
  const { error } = await oilDb.from('oil_entries').insert(rows);
  oeBusy=false; b.disabled=false; b.innerHTML='&#10003; Save Oil Entry';
  if(error){ fail('Not saved: '+error.message); toast('Oil entry not saved','error'); return; }
  try{ await logActivity('OIL_ENTRY_CREATE','oil_entries',null,`${oeSel.vehicle_name} (${oeSel.code})`); }catch(e){}
  toast('Oil entry saved for '+oeSel.vehicle_name,'success');
  oeSel=null; oePurpose=null; oeQty=OE_OILS.map(()=>0);
  oeShowSel(); oeResetRes(); oeBuildOils();
  document.querySelectorAll('#oe_purp button').forEach(x=>x.className='oe-p py-3 px-2 rounded-lg text-sm font-bold border-2 bg-slate-100 text-slate-500 border-transparent');
  document.getElementById('oe_meter').value='0'; document.getElementById('oe_rem').value='';
}

/* ---- Oil change history ---- */
ROUTES.oil_history = async (host)=>{
  oePage=0;
  const inp='w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';
  host.innerHTML=`
   <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
     <h3 class="font-semibold text-navy-900 mb-3">Oil change history</h3>
     <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3 mb-4 items-end">
       <div><label class="block mb-1 text-xs font-medium">Search</label><input id="oh_s" placeholder="Vehicle name or code" class="${inp}"/></div>
       <div><label class="block mb-1 text-xs font-medium">Vehicle</label><select id="oh_v" class="${inp}"><option value="">All vehicles</option></select></div>
       <div><label class="block mb-1 text-xs font-medium">Oil type</label><select id="oh_o" class="${inp}"><option value="">All oil types</option>${OE_OILS.map(o=>`<option value="${escapeHtml(o[0])}">${escapeHtml(o[0])}</option>`).join('')}</select></div>
       <div><label class="block mb-1 text-xs font-medium">Purpose</label><select id="oh_p" class="${inp}"><option value="">All purposes</option>${OE_PURPOSES.map(p=>`<option>${escapeHtml(p)}</option>`).join('')}</select></div>
       <div><label class="block mb-1 text-xs font-medium">From</label><input type="date" id="oh_f" class="${inp}"/></div>
       <div><label class="block mb-1 text-xs font-medium">To</label><input type="date" id="oh_t" class="${inp}"/></div>
     </div>
     <div class="flex justify-end mb-3"><button id="oh_r" class="border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-2 text-sm font-medium">Refresh</button></div>
     <div id="oh_out" class="text-slate-400 text-sm">Loading…</div>
     <div class="flex items-center justify-between mt-3 gap-2">
       <button id="oh_pv" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
       <span id="oh_i" class="text-sm text-slate-500"></span>
       <button id="oh_n" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
     </div>
   </div>`;
  await oeLoadVehicles();
  document.getElementById('oh_v').innerHTML='<option value="">All vehicles</option>'+oeVehicles.map(v=>`<option value="${escapeHtml(v.code)}">${escapeHtml(v.vehicle_name)} (${escapeHtml(v.code)})</option>`).join('');
  ['oh_s','oh_v','oh_o','oh_p','oh_f','oh_t'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{ oePage=0; clearTimeout(window._ohT); window._ohT=setTimeout(oeLoadHistory,250); }));
  document.getElementById('oh_r').addEventListener('click', async ()=>{ await oeLoadVehicles(); oeLoadHistory(); });
  document.getElementById('oh_pv').addEventListener('click', ()=>{ oePage--; oeLoadHistory(); });
  document.getElementById('oh_n').addEventListener('click', ()=>{ oePage++; oeLoadHistory(); });
  document.getElementById('oh_out').addEventListener('click', e=>{ const tr=e.target.closest('[data-i]'); if(tr) oeShowRecord(oeRows[tr.dataset.i]); });
  await oeLoadHistory();
};
async function oeLoadHistory(){
  const out=document.getElementById('oh_out'); if(!out) return;
  let q=oilDb.from('oil_entries').select('*',{count:'exact'}).order('entry_datetime',{ascending:false});
  const s=document.getElementById('oh_s').value.trim().replace(/[,()%*]/g,'');
  if(s) q=q.or(`vehicle_name.ilike.%${s}%,code.ilike.%${s}%`);
  const v=document.getElementById('oh_v').value, o=document.getElementById('oh_o').value, p=document.getElementById('oh_p').value;
  const f=document.getElementById('oh_f').value, t=document.getElementById('oh_t').value;
  if(v) q=q.eq('code',v);
  if(o) q=q.eq('oil_type',o);
  if(p) q=q.eq('purpose',p);
  if(f) q=q.gte('entry_datetime',new Date(f+'T00:00:00').toISOString());
  if(t) q=q.lte('entry_datetime',new Date(t+'T23:59:59.999').toISOString());
  const { data, count, error } = await q.range(oePage*OE_PAGE, oePage*OE_PAGE+OE_PAGE-1);
  if(error){ out.innerHTML=`<div class="text-red-600">Could not load records: ${escapeHtml(error.message)}</div>`; return; }
  oeTotal=count||0; oeRows=data;
  out.innerHTML=data.length?`<div class="overflow-x-auto"><table class="data w-full text-sm"><thead><tr><th class="text-left px-3 py-2">Date &amp; Time</th><th class="text-left px-3 py-2">Vehicle</th><th class="text-left px-3 py-2">Code</th><th class="text-left px-3 py-2">Oil type</th><th class="text-right px-3 py-2">Qty</th><th class="text-left px-3 py-2">Purpose</th><th class="text-left px-3 py-2">Meter</th><th class="text-left px-3 py-2">Operator</th></tr></thead><tbody>
    ${data.map((r,i)=>`<tr data-i="${i}" class="cursor-pointer hover:bg-teal-50"><td class="px-3 py-2 whitespace-nowrap">${fmtDateTime(r.entry_datetime)}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(r.vehicle_name)}</td><td class="px-3 py-2 font-mono text-xs">${escapeHtml(r.code)}</td><td class="px-3 py-2">${escapeHtml(r.oil_type)}</td><td class="px-3 py-2 text-right whitespace-nowrap">${escapeHtml(r.quantity)} ${escapeHtml(r.unit)}</td><td class="px-3 py-2">${escapeHtml(r.purpose)}</td><td class="px-3 py-2">${escapeHtml(r.meter_reading)}</td><td class="px-3 py-2">${escapeHtml(r.operator_name||'—')}</td></tr>`).join('')}</tbody></table></div>`
    :'<div class="py-6 text-center text-slate-400">No records match these filters.</div>';
  const from=oeTotal?oePage*OE_PAGE+1:0;
  document.getElementById('oh_i').textContent=`${from}–${Math.min(oeTotal,oePage*OE_PAGE+OE_PAGE)} of ${oeTotal}`;
  document.getElementById('oh_pv').disabled=oePage===0;
  document.getElementById('oh_n').disabled=(oePage+1)*OE_PAGE>=oeTotal;
}
function oeShowRecord(r){
  if(!r) return;
  openModal('Oil entry', `
   <div class="font-semibold">${escapeHtml(r.vehicle_name)} <span class="font-mono text-xs text-slate-500">${escapeHtml(r.code)}</span></div>
   <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm mt-3">
     <dt class="text-slate-500">Date &amp; time</dt><dd class="font-medium">${fmtDateTime(r.entry_datetime)}</dd>
     <dt class="text-slate-500">Oil type</dt><dd class="font-medium">${escapeHtml(r.oil_type)}</dd>
     <dt class="text-slate-500">Quantity</dt><dd class="font-medium">${escapeHtml(r.quantity)} ${escapeHtml(r.unit)}</dd>
     <dt class="text-slate-500">Purpose</dt><dd class="font-medium">${escapeHtml(r.purpose)}</dd>
     <dt class="text-slate-500">Meter reading</dt><dd class="font-medium">${escapeHtml(r.meter_reading)}</dd>
     <dt class="text-slate-500">Operator</dt><dd class="font-medium">${escapeHtml(r.operator_name||'—')}</dd>
     <dt class="text-slate-500">Remarks</dt><dd class="font-medium">${escapeHtml(r.remarks||'—')}</dd></dl>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Close</button>`);
}

/* ---- QR scanning for oil entry vehicle selection ---- */
function oeSelectByCode(raw){
  const code=String(raw||'').trim().toUpperCase();
  const v=oeVehicles.find(x=>x.code===code);
  if(!v){ toast(`No registered vehicle for "${code}"`,'error'); return false; }
  oeSel=v; const q=document.getElementById('oe_vq'); if(q) q.value='';
  oeResetRes(); oeShowSel(); toast('Vehicle selected: '+v.vehicle_name,'success');
  return true;
}
async function oeStopScan(){
  const sc=oeScanner; oeScanner=null; if(!sc) return;
  try{ if(sc.isScanning) await sc.stop(); }catch(e){}
  try{ sc.clear(); }catch(e){}
}
function oeOpenScanner(){
  if(typeof Html5Qrcode==='undefined'){ toast('QR scanner could not load. Check your internet connection.','error'); return; }
  openModal('Scan vehicle QR code', `
    <div id="oe_reader" class="w-full rounded-xl overflow-hidden bg-slate-900 min-h-[260px]"></div>
    <p id="oe_scanMsg" class="text-sm text-slate-500 mt-3 text-center">Point the camera at the vehicle's QR code.</p>
    <div class="text-center mt-3"><label class="inline-flex items-center gap-2 text-sm text-teal-700 cursor-pointer hover:underline">
      <i data-lucide="image" class="w-4 h-4"></i> Upload a QR image instead<input type="file" id="oe_qrfile" accept="image/*" class="hidden"/></label></div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>`);
  const msg=t=>{ const m=document.getElementById('oe_scanMsg'); if(m) m.textContent=t; };
  const sc=new Html5Qrcode('oe_reader'); oeScanner=sc; oeScanBusy=false;
  const onHit=async text=>{
    if(oeScanBusy) return; oeScanBusy=true;
    if(oeSelectByCode(text)){ await oeStopScan(); closeModal(); }
    else setTimeout(()=>{ oeScanBusy=false; },1500);
  };
  sc.start({facingMode:'environment'},{fps:10,qrbox:{width:230,height:230}},onHit,()=>{})
    .catch(err=>{ const txt=String(err||'');
      msg(/Permission|NotAllowed/i.test(txt)?'Camera access was blocked. Allow the camera in your browser, or upload a QR image.'
        :window.isSecureContext?'Could not start the camera. You can upload a QR image instead.':'The camera needs a secure (https) page. You can upload a QR image instead.'); });
  document.getElementById('oe_qrfile').addEventListener('change', async e=>{
    const file=e.target.files[0]; if(!file) return;
    try{ if(sc.isScanning) await sc.stop(); const text=await sc.scanFile(file,false);
      if(oeSelectByCode(text)){ await oeStopScan(); closeModal(); }
    }catch(err){ msg('No QR code found in that image. Try another one.'); }
    e.target.value='';
  });
  lucide.createIcons();
}

