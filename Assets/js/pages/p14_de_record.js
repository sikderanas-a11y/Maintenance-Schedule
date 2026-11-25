/* page module (original lines 3141-3366) */
/* ============================================================
   DATA ENTRY DEPARTMENT - FILTER CHANGE RECORD & HISTORY
   Tables: vehicle_master (read), filter_database (insert / read)
   ============================================================ */
let deSel = null, dePage = 0, deTotal = 0, deRows = [];
const DE_PAGE = 10;
function deMatch(v,q){
  q = fqNorm(q); if(!q) return true;
  const name = fqNorm(v.vehicle_name), code = v.code.toLowerCase();
  if (name.includes(q) || code.includes(q)) return true;
  const m = q.match(/^([a-z]+)(\d+)$/); if(!m) return false;
  const [,L,D] = m, type = code.slice(1,3), digits = code.slice(3,7), nameDigits = (v.vehicle_name.match(/\d+/)||[''])[0];
  const typeOk = type===L || name.startsWith(L) || code.slice(0,3)===L;
  const numOk = digits.includes(D) || String(+digits)===String(+D) || nameDigits.replace(/^0+/,'').startsWith(D) || String(+nameDigits)===String(+D);
  return typeOk && numOk;
}
const deToday = ()=>{ const d=new Date(), p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };

ROUTES.de_record = async (host)=>{
  deSel = null;
  const card = 'bg-white rounded-xl shadow-sm border border-slate-200 p-5';
  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm';
  host.innerHTML = `
   <div class="max-w-2xl mx-auto space-y-4">
     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Date</h3>
       <label class="block mb-1 text-sm font-medium">Date <span class="text-red-500">*</span></label>
       <input type="date" id="de_date" class="${inp}"/></div>

     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Vehicle</h3>
       <label class="block mb-1 text-sm font-medium">Vehicle code or name <span class="text-red-500">*</span></label>
       <div class="relative"><input id="de_vq" autocomplete="off" placeholder="e.g. f5, dt2, p3, ex1, t4, r6" class="${inp} pr-14"/>
         <button type="button" id="de_scan" title="Scan vehicle QR code" aria-label="Scan vehicle QR code" class="absolute right-1.5 top-1/2 -translate-y-1/2 w-10 h-10 rounded-lg bg-teal-50 text-teal-700 hover:bg-teal-100 flex items-center justify-center"><i data-lucide="qr-code" class="w-5 h-5"></i></button></div>
       <div id="de_vres" class="hidden mt-2 rounded-lg bg-slate-100 max-h-64 overflow-auto"></div>
       <div id="de_vsel"></div>
       <p class="text-xs text-slate-500 mt-3">f=Forklift &middot; p=Payloader &middot; dt=Dump Truck &middot; ex=Excavator &middot; t=Trolley &middot; r=Reach Truck</p></div>

     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Filter parts used</h3>
       <div id="de_filters" class="grid grid-cols-1 sm:grid-cols-2 gap-4"></div></div>

     <div class="${card}"><h3 class="text-xs font-semibold text-slate-500 uppercase mb-3">Meter reading</h3>
       <label class="block mb-1 text-sm font-medium">Current reading <span class="text-red-500">*</span></label>
       <div class="relative"><input type="number" id="de_meter" inputmode="decimal" min="0" step="any" value="0" placeholder="0" class="${inp} pr-20"/>
         <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">HRS/KM</span></div></div>

     <div id="de_err" class="text-red-600 text-sm min-h-[1rem]"></div>
     <button id="de_save" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-semibold rounded-xl py-3.5 text-base">&#10003; Save Record</button>
   </div>`;
  document.getElementById('de_date').value = deToday();
  deBuildFilters();
  await fqLoadVehicles();
  document.getElementById('de_vq').addEventListener('input', deSearch);
  document.getElementById('de_vres').addEventListener('click', e=>{
    const b = e.target.closest('button[data-id]'); if(!b) return;
    deSel = fqVehicles.find(v=>v.id==b.dataset.id);
    document.getElementById('de_vq').value=''; deResetRes(); deShowSel();
  });
  document.getElementById('de_save').addEventListener('click', deSave);
  document.getElementById('de_scan').addEventListener('click', deOpenScanner);
  lucide.createIcons();
};
function deResetRes(){ const b=document.getElementById('de_vres'); b.innerHTML=''; b.classList.add('hidden'); }
function deBuildFilters(){
  document.getElementById('de_filters').innerHTML = FQ_FILTERS.map(([k,l])=>`
   <div class="border border-slate-200 rounded-xl p-3"><label class="block mb-2 text-sm font-medium">${l}</label>
     <div class="grid grid-cols-3 gap-1.5 bg-slate-100 p-1 rounded-xl">
       ${[0,1,2].map(n=>`<label class="cursor-pointer"><input type="radio" name="de_${k}" value="${n}" class="peer sr-only" ${n===0?'checked':''}/>
         <span class="block text-center py-2.5 rounded-lg font-bold text-lg text-slate-500 peer-checked:bg-teal-50 peer-checked:text-teal-700 peer-checked:ring-2 peer-checked:ring-teal-600">${n}</span></label>`).join('')}
     </div></div>`).join('');
}
function deSearch(){
  const q = document.getElementById('de_vq').value.trim(), box = document.getElementById('de_vres');
  if (!q){ deResetRes(); return; }
  const r = fqVehicles.filter(v=>deMatch(v,q)).slice(0,30);
  box.classList.remove('hidden');
  box.innerHTML = r.length ? r.map(v=>`<button type="button" data-id="${v.id}" class="flex justify-between w-full px-4 py-3 text-sm text-left border-b border-slate-200 bg-white hover:bg-teal-50"><span>${escapeHtml(v.vehicle_name)}</span><span class="font-mono text-xs text-slate-500">${escapeHtml(v.code)}</span></button>`).join('')
    : '<div class="p-4 text-sm text-slate-500">No matching vehicle</div>';
}
function deShowSel(){
  const el = document.getElementById('de_vsel');
  el.innerHTML = deSel ? `<div class="mt-3 flex items-center gap-3 rounded-xl border-2 border-teal-600 bg-teal-50 px-4 py-3">
    <div><div class="font-semibold">${escapeHtml(deSel.vehicle_name)}</div><div class="font-mono text-xs text-slate-500">${escapeHtml(deSel.code)}</div></div>
    <button type="button" id="de_vclr" class="ml-auto text-sm px-3 py-1.5 rounded-lg bg-white border border-slate-300">Change</button></div>` : '';
  const c = document.getElementById('de_vclr');
  if (c) c.onclick = ()=>{ deSel=null; deShowSel(); document.getElementById('de_vq').focus(); };
}
async function deSave(){
  const er = document.getElementById('de_err'); er.textContent='';
  const date = document.getElementById('de_date').value, mr = document.getElementById('de_meter').value.trim(), n = parseFloat(mr);
  if (!date){ er.textContent='Select the filter change date.'; return; }
  if (!deSel || !fqVehicles.some(v=>v.id===deSel.id)){ er.textContent='Select a vehicle from the list.'; return; }
  const rec = {Date:date, vehicle_name:deSel.vehicle_name, code:deSel.code};
  for (const [k,l] of FQ_FILTERS){
    const c = document.querySelector(`input[name="de_${k}"]:checked`);
    if (!c){ er.textContent='Choose 0, 1 or 2 for '+l+'.'; return; }
    rec[k] = parseInt(c.value,10);
  }
  if (mr==='' || isNaN(n) || n<0){ er.textContent='Enter a valid meter reading (0 or more). Use 0 if the vehicle has no meter.'; return; }
  rec.Meter_Reading = n;
  const b = document.getElementById('de_save'); b.disabled = true; b.textContent = 'Saving…';
  const { error } = await db.from('filter_database').insert(rec);
  b.disabled = false; b.innerHTML = '&#10003; Save Record';
  if (error){ er.textContent='Not saved: '+error.message; toast('Record not saved','error'); return; }
  try{ await logActivity('FILTER_RECORD_CREATE','filter_database',null,`${rec.vehicle_name} (${rec.code})`); }catch(e){}
  toast('Record saved for '+rec.vehicle_name,'success');
  deSel = null; deShowSel(); deResetRes(); deBuildFilters();
  document.getElementById('de_meter').value='0'; document.getElementById('de_date').value=deToday();
}

ROUTES.de_history = async (host)=>{
  dePage = 0;
  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm';
  host.innerHTML = `
   <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
     <h3 class="font-semibold text-navy-900 mb-3">Filter change history</h3>
     <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4 items-end">
       <div><label class="block mb-1 text-xs font-medium">Search</label><input id="dh_s" placeholder="Vehicle name or code" class="${inp}"/></div>
       <div><label class="block mb-1 text-xs font-medium">Vehicle</label><select id="dh_v" class="${inp}"><option value="">All vehicles</option></select></div>
       <div><label class="block mb-1 text-xs font-medium">From</label><input type="date" id="dh_f" class="${inp}"/></div>
       <div><label class="block mb-1 text-xs font-medium">To</label><input type="date" id="dh_t" class="${inp}"/></div>
       <div><button id="dh_r" class="w-full border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-2 text-sm font-medium">Refresh</button></div>
     </div>
     <div id="dh_out" class="text-slate-400 text-sm">Loading…</div>
     <div class="flex items-center justify-between mt-3 gap-2">
       <button id="dh_p" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Previous</button>
       <span id="dh_i" class="text-sm text-slate-500"></span>
       <button id="dh_n" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm disabled:opacity-50">Next</button>
     </div>
   </div>`;
  await fqLoadVehicles();
  document.getElementById('dh_v').innerHTML = '<option value="">All vehicles</option>'+fqVehicles.map(v=>`<option value="${escapeHtml(v.code)}">${escapeHtml(v.vehicle_name)} (${escapeHtml(v.code)})</option>`).join('');
  ['dh_s','dh_v','dh_f','dh_t'].forEach(id=>document.getElementById(id).addEventListener('input',()=>{ dePage=0; clearTimeout(window._deT); window._deT=setTimeout(deLoadHistory,250); }));
  document.getElementById('dh_r').addEventListener('click', async ()=>{ await fqLoadVehicles(); deLoadHistory(); });
  document.getElementById('dh_p').addEventListener('click', ()=>{ dePage--; deLoadHistory(); });
  document.getElementById('dh_n').addEventListener('click', ()=>{ dePage++; deLoadHistory(); });
  document.getElementById('dh_out').addEventListener('click', e=>{
    const tr = e.target.closest('[data-i]'); if(tr) deShowRecord(deRows[tr.dataset.i]);
  });
  await deLoadHistory();
};
async function deLoadHistory(){
  const out = document.getElementById('dh_out'); if(!out) return;
  let q = db.from('filter_database').select('*',{count:'exact'}).order('Timestamp',{ascending:false});
  const s = document.getElementById('dh_s').value.trim().replace(/[,()%*]/g,'');
  if (s) q = q.or(`vehicle_name.ilike.%${s}%,code.ilike.%${s}%`);
  if (document.getElementById('dh_v').value) q = q.eq('code', document.getElementById('dh_v').value);
  if (document.getElementById('dh_f').value) q = q.gte('Date', document.getElementById('dh_f').value);
  if (document.getElementById('dh_t').value) q = q.lte('Date', document.getElementById('dh_t').value);
  const { data, count, error } = await q.range(dePage*DE_PAGE, dePage*DE_PAGE+DE_PAGE-1);
  if (error){ out.innerHTML = `<div class="text-red-600">Could not load records: ${escapeHtml(error.message)}</div>`; return; }
  deTotal = count||0; deRows = data;
  const ths = FQ_FILTERS.map(([k,l])=>`<th class="text-center px-3 py-2 whitespace-nowrap">${l}</th>`).join('');
  out.innerHTML = data.length ? `<div class="overflow-x-auto"><table class="data w-full text-sm"><thead><tr><th class="text-left px-3 py-2">Timestamp</th><th class="text-left px-3 py-2">Date</th><th class="text-left px-3 py-2">Vehicle</th><th class="text-left px-3 py-2">Code</th>${ths}<th class="text-left px-3 py-2">Meter</th></tr></thead><tbody>
    ${data.map((r,i)=>`<tr data-i="${i}" class="cursor-pointer hover:bg-teal-50"><td class="px-3 py-2 whitespace-nowrap">${fmtDateTime(r.Timestamp)}</td><td class="px-3 py-2 whitespace-nowrap">${r.Date}</td><td class="px-3 py-2 whitespace-nowrap">${escapeHtml(r.vehicle_name)}</td><td class="px-3 py-2 font-mono text-xs">${escapeHtml(r.code)}</td>${FQ_FILTERS.map(([k])=>`<td class="px-3 py-2 text-center">${r[k]}</td>`).join('')}<td class="px-3 py-2">${r.Meter_Reading}</td></tr>`).join('')}</tbody></table></div>`
    : '<div class="py-6 text-center text-slate-400">No records match these filters.</div>';
  const from = deTotal ? dePage*DE_PAGE+1 : 0;
  document.getElementById('dh_i').textContent = `${from}–${Math.min(deTotal,dePage*DE_PAGE+DE_PAGE)} of ${deTotal}`;
  document.getElementById('dh_p').disabled = dePage===0;
  document.getElementById('dh_n').disabled = (dePage+1)*DE_PAGE>=deTotal;
}
function deShowRecord(r){
  if(!r) return;
  openModal('Filter change record', `
   <div class="font-semibold">${escapeHtml(r.vehicle_name)} <span class="font-mono text-xs text-slate-500">${escapeHtml(r.code)}</span></div>
   <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm mt-3">
     <dt class="text-slate-500">Timestamp</dt><dd class="font-medium">${fmtDateTime(r.Timestamp)}</dd>
     <dt class="text-slate-500">Date</dt><dd class="font-medium">${r.Date}</dd>
     ${FQ_FILTERS.map(([k,l])=>`<dt class="text-slate-500">${l}</dt><dd class="font-medium">${r[k]}</dd>`).join('')}
     <dt class="text-slate-500">Meter reading</dt><dd class="font-medium">${r.Meter_Reading}</dd></dl>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Close</button>`);
}


/* ---- QR scanning for vehicle selection ---- */
let deScanner = null, deScanBusy = false;
function deSelectByCode(raw){
  const code = String(raw||'').trim().toUpperCase();
  const v = fqVehicles.find(x=>x.code===code);
  if (!v){ toast(`No registered vehicle for "${code}"`,'error'); return false; }
  deSel = v;
  const q = document.getElementById('de_vq'); if (q) q.value='';
  deResetRes(); deShowSel(); toast('Vehicle selected: '+v.vehicle_name,'success');
  return true;
}
async function deStopScan(){
  const sc = deScanner; deScanner = null;
  if (!sc) return;
  try{ if (sc.isScanning) await sc.stop(); }catch(e){}
  try{ sc.clear(); }catch(e){}
}
function deOpenScanner(){
  if (typeof Html5Qrcode === 'undefined'){ toast('QR scanner could not load. Check your internet connection.','error'); return; }
  openModal('Scan vehicle QR code', `
    <div id="de_reader" class="w-full rounded-xl overflow-hidden bg-slate-900 min-h-[260px]"></div>
    <p id="de_scanMsg" class="text-sm text-slate-500 mt-3 text-center">Point the camera at the vehicle's QR code.</p>
    <div class="text-center mt-3">
      <label class="inline-flex items-center gap-2 text-sm text-teal-700 cursor-pointer hover:underline">
        <i data-lucide="image" class="w-4 h-4"></i> Upload a QR image instead
        <input type="file" id="de_qrfile" accept="image/*" class="hidden"/></label>
    </div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>`);
  const msg = t=>{ const m=document.getElementById('de_scanMsg'); if(m) m.textContent=t; };
  const sc = new Html5Qrcode('de_reader'); deScanner = sc; deScanBusy = false;
  const onHit = async text=>{
    if (deScanBusy) return; deScanBusy = true;
    if (deSelectByCode(text)){ await deStopScan(); closeModal(); }
    else setTimeout(()=>{ deScanBusy=false; }, 1500);
  };
  sc.start({facingMode:'environment'}, {fps:10, qrbox:{width:230,height:230}}, onHit, ()=>{})
    .catch(err=>{
      const txt = String(err||'');
      msg(/Permission|NotAllowed/i.test(txt) ? 'Camera access was blocked. Allow the camera in your browser, or upload a QR image.'
        : window.isSecureContext ? 'Could not start the camera. You can upload a QR image instead.'
        : 'The camera needs a secure (https) page. You can upload a QR image instead.');
    });
  document.getElementById('de_qrfile').addEventListener('change', async e=>{
    const file = e.target.files[0]; if (!file) return;
    try{
      if (sc.isScanning) await sc.stop();
      const text = await sc.scanFile(file, false);
      if (deSelectByCode(text)){ await deStopScan(); closeModal(); }
    }catch(err){ msg('No QR code found in that image. Try another one.'); }
    e.target.value='';
  });
  lucide.createIcons();
}

