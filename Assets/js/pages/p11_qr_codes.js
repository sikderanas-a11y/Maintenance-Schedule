/* page module (original lines 2678-2866) */
/* ============================================================
   MASTER DATA - FILTER VEHICLES (QR codes + CSV import)
   Tables: vehicle_master, filter_database
   ============================================================ */
const FQ_CODE_RE = /^[XS][A-Z]{2}[0-9]{4}[OR]$/;
const FQ_FILTERS = [['Oil_Filter','Oil Filter'],['Air_Filter','Air Filter'],['Water_Separator','Water Separator'],
  ['Hydraulic_Filter','Hydraulic Filter'],['Transmission_Filter','Transmission Filter'],['Fuel_Filter','Fuel Filter']];
let fqVehicles = [], fqEditId = null, fqCsvFile = null;
const fqNorm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g,'');

/* Vehicle list for all entry / history / maintenance pages: oil project's `master` table (oilDb): entry, history, calendar, overrides. */
async function fqLoadVehicles(){
  let all=[], from=0;
  for(;;){
    const { data, error } = await oilDb.from('master').select('code, vehicle_name').order('code').range(from,from+999);
    if (error){ toast('Could not load vehicles: '+error.message,'error'); throw error; }
    all=all.concat(data||[]); if(!data||data.length<1000) break; from+=1000;
  }
  fqVehicles = all.filter(v=>v.code).map(v=>({id:String(v.code), code:String(v.code), vehicle_name:String(v.vehicle_name||v.code)}))
    .sort((a,b)=>a.vehicle_name.localeCompare(b.vehicle_name,undefined,{numeric:true}));
}
/* Maintenance modules + QR registry keep using vehicle_master (their vehicle_id references it) */
async function fqLoadVehiclesLegacy(){
  const { data, error } = await db.from('vehicle_master').select('*').order('vehicle_name');
  if (error) throw error;
  fqVehicles = data || [];
}
function fqMatch(v,q){
  q = fqNorm(q); if(!q) return true;
  const name = fqNorm(v.vehicle_name), code = v.code.toLowerCase();
  return name.includes(q) || code.includes(q);
}

ROUTES.qr_codes = async (host)=>{
  fqEditId = null; fqCsvFile = null;
  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm';
  host.innerHTML = `
   <p class="text-sm text-slate-500 mb-4">Register a new vehicle and immediately generate its QR code, or import many vehicles at once from a CSV file.</p>
   <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
     <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
       <div class="flex items-center gap-3 mb-4">
         <div class="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center"><i data-lucide="truck" class="w-5 h-5"></i></div>
         <div><h3 id="fqFormTitle" class="font-semibold text-navy-900">Add a Vehicle</h3><p class="text-xs text-slate-500">Create a vehicle record and its QR code.</p></div>
       </div>
       <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
         <div><label class="block mb-1 text-sm font-medium">Vehicle Code (unique) <span class="text-red-500">*</span></label>
           <input id="fq_code" maxlength="8" placeholder="e.g. XDT6986R" class="${inp} uppercase"/></div>
         <div><label class="block mb-1 text-sm font-medium">Vehicle Name <span class="text-red-500">*</span></label>
           <input id="fq_name" placeholder="e.g. Dump Truck-6986" class="${inp}"/></div>
       </div>
       <div id="fqErr" class="text-red-600 text-xs min-h-[1rem] mb-2"></div>
       <button id="fqSave" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg py-2.5 text-sm flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i><span>Create &amp; Generate QR Code</span></button>
       <button id="fqCancel" class="hidden mt-2 text-sm text-slate-600 border border-slate-300 rounded-lg px-3 py-1.5">Cancel edit</button>
     </div>

     <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
       <div class="flex items-center gap-3 mb-4">
         <div class="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center"><i data-lucide="upload-cloud" class="w-5 h-5"></i></div>
         <div><h3 class="font-semibold text-navy-900">Bulk Import via CSV</h3><p class="text-xs text-slate-500">Create many vehicles and QR codes at once from a CSV file.</p></div>
       </div>
       <div class="grid grid-cols-1 md:grid-cols-[1fr_190px] gap-3">
         <div id="fqDrop" class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer min-h-[110px] flex flex-col items-center justify-center">
           <i data-lucide="upload-cloud" class="w-7 h-7 text-teal-600 mb-1"></i>
           <b id="fqDropT" class="text-sm">Drag &amp; drop CSV file here</b>
           <span id="fqDropS" class="text-xs text-slate-500">or click to browse</span>
           <input type="file" id="fqFile" accept=".csv,text/csv" class="hidden"/>
         </div>
         <div class="grid gap-2 content-start">
           <button id="fqTpl" class="border border-teal-600 text-teal-700 hover:bg-teal-50 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="download" class="w-4 h-4"></i>Download CSV Template</button>
           <button id="fqImp" class="bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="upload-cloud" class="w-4 h-4"></i>Import CSV</button>
         </div>
       </div>
       <div id="fqRep"></div>
       <details class="mt-4 border border-dashed border-slate-300 rounded-lg p-3">
         <summary class="cursor-pointer text-sm font-semibold text-teal-700">CSV Format / Example &amp; Code Rules</summary>
         <p class="text-sm text-slate-500 my-2">The file must have exactly these two columns, in this order, with this exact header:</p>
         <pre class="bg-navy-900 text-slate-100 rounded-lg p-3 text-xs leading-6 overflow-auto mb-3">vehicle_name,code
Dump Truck-6986,XDT6986R
Forklift-01,XFL0001O
Excavator-1,XEX0001O
Forklift-02,SFL0002O</pre>
         <p class="text-sm font-semibold mb-1">8-character code structure:</p>
         <div class="overflow-x-auto"><table class="data w-full text-sm"><thead><tr><th class="text-left px-3 py-2">POSITION</th><th class="text-left px-3 py-2">MEANING</th><th class="text-left px-3 py-2">VALID VALUES</th></tr></thead><tbody>
           <tr><td class="px-3 py-2">1st</td><td class="px-3 py-2">Location</td><td class="px-3 py-2">X = Monica/Monalisa, S = Sanitary</td></tr>
           <tr><td class="px-3 py-2">2nd&ndash;3rd</td><td class="px-3 py-2">Vehicle Type</td><td class="px-3 py-2">Any 2 letters (e.g. PL, FL, DT, EF, EX)</td></tr>
           <tr><td class="px-3 py-2">4th&ndash;7th</td><td class="px-3 py-2">Vehicle Number</td><td class="px-3 py-2">Exactly 4 digits</td></tr>
           <tr><td class="px-3 py-2">8th</td><td class="px-3 py-2">Ownership</td><td class="px-3 py-2">O = Own, R = Rental</td></tr>
         </tbody></table></div>
       </details>
     </div>
   </div>
   <div id="fqGen" class="mb-4"></div>
   `;
  lucide.createIcons();

  document.getElementById('fqSave').addEventListener('click', fqSaveVehicle);
  document.getElementById('fqCancel').addEventListener('click', fqClearForm);
  const drop = document.getElementById('fqDrop'), fileIn = document.getElementById('fqFile');
  drop.addEventListener('click', ()=>fileIn.click());
  fileIn.addEventListener('change', e=>{ fqSetFile(e.target.files[0]); e.target.value=''; });
  ['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('border-teal-500','bg-teal-50');}));
  ['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('border-teal-500','bg-teal-50');}));
  drop.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if(f) fqSetFile(f); });
  document.getElementById('fqTpl').addEventListener('click', fqDownloadTemplate);
  document.getElementById('fqImp').addEventListener('click', fqImportCsv);
  fqGenInit();
  await fqRefresh();
};

async function fqRefresh(){
  await fqLoadVehiclesLegacy();
  fqGenUpdate();
  const wrap = document.getElementById('fqWrap'); if(!wrap) return;
  const rows = fqVehicles.map(v=>`<tr>
    <td class="px-4 py-2">${escapeHtml(v.vehicle_name)}</td>
    <td class="px-4 py-2 font-mono text-xs">${escapeHtml(v.code)}</td>
    <td class="px-4 py-2 whitespace-nowrap">
      <button onclick="fqShowQr('${v.id}')" class="text-teal-700 hover:underline text-xs">QR</button>
      <button onclick="fqEdit('${v.id}')" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-teal-700 hover:bg-teal-50" title="Edit" aria-label="Edit"><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i></button>
      <button onclick="fqDelete('${v.id}')" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-red-600 hover:bg-red-50" title="Delete" aria-label="Delete"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
    </td></tr>`).join('') || emptyRow(3,'No vehicles.');
  wrap.innerHTML = tableCard(`Registered Vehicles (${fqVehicles.length})`, ['Name','Code','Actions'], rows,
    {toolbar:`<input placeholder="Search…" onkeyup="fqFilterTable(this.value)" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48"/>`});
  lucide.createIcons();
}
function fqFilterTable(q){ q=q.toLowerCase(); document.querySelectorAll('#fqWrap tbody tr').forEach(tr=>tr.style.display=tr.innerText.toLowerCase().includes(q)?'':'none'); }

function fqClearForm(){
  fqEditId = null;
  document.getElementById('fq_code').value=''; document.getElementById('fq_name').value='';
  document.getElementById('fqFormTitle').textContent='Add a Vehicle';
  document.querySelector('#fqSave span').textContent='Create & Generate QR Code';
  document.getElementById('fqCancel').classList.add('hidden');
  document.getElementById('fqErr').textContent='';
}
function fqEdit(id){
  const v = fqVehicles.find(x=>x.id==id); if(!v) return;
  fqEditId = v.id;
  document.getElementById('fq_code').value=v.code; document.getElementById('fq_name').value=v.vehicle_name;
  document.getElementById('fqFormTitle').textContent='Edit Vehicle';
  document.querySelector('#fqSave span').textContent='Save changes';
  document.getElementById('fqCancel').classList.remove('hidden');
  window.scrollTo({top:0,behavior:'smooth'});
}
async function fqSaveVehicle(){
  const name = document.getElementById('fq_name').value.trim();
  const code = document.getElementById('fq_code').value.trim().toUpperCase();
  const er = document.getElementById('fqErr'); er.textContent='';
  if (!name) { er.textContent='Enter a vehicle name.'; return; }
  if (!FQ_CODE_RE.test(code)) { er.textContent='Code must be 8 characters: X or S, two letters, four digits, then O or R.'; return; }
  if (fqVehicles.some(v=>v.code===code && v.id!==fqEditId)) { er.textContent='This code is already registered.'; return; }
  const wasEdit = !!fqEditId, btn = document.getElementById('fqSave'); btn.disabled = true;
  const res = fqEditId
    ? await db.from('vehicle_master').update({vehicle_name:name, code}).eq('id', fqEditId)
    : await db.from('vehicle_master').insert({vehicle_name:name, code});
  btn.disabled = false;
  if (res.error){ er.textContent = res.error.code==='23505' ? 'This code is already registered.' : res.error.message; return; }
  try{ await logActivity(wasEdit?'FILTER_VEHICLE_UPDATE':'FILTER_VEHICLE_CREATE','vehicle_master',null,code); }catch(e){}
  toast(wasEdit?'Vehicle updated':'Vehicle created','success');
  fqClearForm(); await fqRefresh(); fqOpenQr(name, code);
}
async function fqDelete(id){
  const v = fqVehicles.find(x=>x.id==id); if(!v) return;
  if (!await confirmDialog(`${v.vehicle_name} (${v.code}) will be permanently removed. This cannot be undone.`, {title:'Delete vehicle?', confirmText:'Delete', danger:true})) return;
  const { error } = await db.from('vehicle_master').delete().eq('id', id);
  if (error){ toast(error.code==='23503' ? 'Cannot delete: this vehicle has filter change records.' : error.message,'error'); return; }
  try{ await logActivity('FILTER_VEHICLE_DELETE','vehicle_master',null,v.code); }catch(e){}
  toast('Deleted','success'); fqRefresh();
}

/* ---- QR ---- */
function fqShowQr(id){ const v = fqVehicles.find(x=>x.id==id); if(v) fqOpenQr(v.vehicle_name, v.code); }
function fqOpenQr(name, code){
  openModal('Vehicle QR Code', `
    <div class="flex flex-col items-center gap-2">
      <div class="font-semibold">${escapeHtml(name)}</div>
      <div class="font-mono text-xs text-slate-500">${escapeHtml(code)}</div>
      <div id="fqQrBox" class="p-3 bg-white border border-slate-200 rounded-lg"></div>
    </div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Close</button>
     <button onclick="fqDownloadQr('${escapeHtml(code)}')" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Download PNG</button>`);
  new QRCode(document.getElementById('fqQrBox'), {text:code, width:240, height:240, correctLevel:QRCode.CorrectLevel.M});
}
function fqDownloadQr(code){
  const c = document.querySelector('#fqQrBox canvas'); if(!c){ toast('QR not ready','error'); return; }
  const a = document.createElement('a'); a.href = c.toDataURL('image/png'); a.download = code+'.png'; a.click();
}


