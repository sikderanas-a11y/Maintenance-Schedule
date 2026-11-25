/* page module (original lines 4194-4395) */
/* ============================================================
   BULK CSV IMPORT for Filter / Oil / Other replacement history
   All three kinds are stored in item_replacement_history (entry_type is
   derived by the existing DB logic from the item's category, exactly as the
   single-entry forms rely on). Vehicles come from oilDb.master (fqVehicles),
   items from the Item Master (items table). Existing triggers fire as usual.
   ============================================================ */
const BI = {
  Oil:   {nameCol:'oil_type',    label:'oil type',    cat:'Oil',    src:'oil_csv_import',    file:'oil_replacement_template.csv',
          ex:[['Truck 01','VH-001','Engine Oil','15','25000','2026-11-15','Regular replacement'],['Excavator 02','VH-002','Hydraulic Oil','20','18000','2026-11-15','Hydraulic oil changed']]},
  Filter:{nameCol:'filter_name', label:'filter name', cat:'Filter', src:'filter_csv_import', file:'filter_replacement_template.csv',
          ex:[['Truck 01','VH-001','Engine Oil Filter','1','25000','2026-11-15','Filter replaced'],['Excavator 02','VH-002','Air Filter','2','18000','2026-11-15','Air filter replaced']]},
  Other: {nameCol:'item_name',   label:'item name',   cat:null,     src:'other_csv_import',  file:'other_replacement_template.csv',
          ex:[['Truck 01','VH-001','Brake Pad','2','25000','2026-11-15','Brake pad replaced'],['Excavator 02','VH-002','Battery','1','18000','2026-11-15','Battery replaced']]}
};
const biHeader = k => ['vehicle_name','vehicle_code',BI[k].nameCol,'quantity','meter_reading','replacement_date','remarks'].concat(k==='Oil'?['purpose']:[]);
const biExRows = k => BI[k].ex.map((r,i)=> k==='Oil' ? r.concat([(OE_PURPOSES[0]||'')]) : r);
const biCsvEsc = v => { v=String(v??''); return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v; };
const biCsv = rows => rows.map(r=>r.map(biCsvEsc).join(',')).join('\r\n')+'\r\n';
const biDownload = (name,text) => { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv'})); a.download=name; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); };
let biState = {kind:null, file:null, plan:null, busy:false, itemCache:{}};

async function biItems(k){
  if (biState.itemCache[k]) return biState.itemCache[k];
  let items;
  if (BI[k].cat) items = await rhLoadItems(BI[k].cat);
  else { items=[]; for(let from=0;;from+=1000){ const {data,error}=await db.from('items').select('id,item_name,item_code,item_category,unit,status').order('item_name').range(from,from+999); if(error) throw error; items=items.concat(data||[]); if(!data||data.length<1000) break; }
         items = items.filter(i=>i.status!=='Inactive' && !/^(filter|oil)$/i.test((i.item_category||'').trim())); }
  return biState.itemCache[k]=items;
}
function biSection(k){
  const hdr = biHeader(k), req = ['vehicle_code','vehicle_name',BI[k].nameCol,'quantity','replacement_date'].concat(k==='Filter'?['meter_reading']:[]);
  const rule = c => ({
    vehicle_name:['Yes','Must match the vehicle name in Vehicle Master for that code'], vehicle_code:['Yes','Must exist in Vehicle Master'],
    [BI[k].nameCol]:['Yes','Exact '+(k==='Other'?'active item name (any category except Oil/Filter)':'active "'+k+'" item name')+' from Item Master; unit is taken from the item'],
    quantity:['Yes','Any number, 0 or more'],
    meter_reading:['Optional','Number, 0 or more (blank = 0)'],
    replacement_date:['Yes','YYYY-MM-DD, not in the future'], remarks:['Optional','Free text, max 500 characters'],
    purpose:['Optional','One of: '+OE_PURPOSES.join(', ')+' (blank = not set)'] })[c];
  return `<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-4" id="bi_box">
   <div class="flex items-center gap-3 mb-4"><div class="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center"><i data-lucide="upload-cloud" class="w-5 h-5"></i></div>
    <div><h3 class="font-semibold text-navy-900">Bulk Import via CSV</h3><p class="text-xs text-slate-500">Add multiple ${k.toLowerCase()} replacement records at once from a CSV file.</p></div></div>
   <div class="grid grid-cols-1 md:grid-cols-[1fr_220px] gap-3">
    <div id="bi_drop" class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer min-h-[110px] flex flex-col items-center justify-center">
      <i data-lucide="upload-cloud" class="w-7 h-7 text-teal-600 mb-1"></i><b id="bi_dt" class="text-sm">Drag &amp; drop CSV file here</b><span id="bi_ds" class="text-xs text-slate-500">or click to browse</span>
      <input type="file" id="bi_file" accept=".csv,text/csv" class="hidden"/></div>
    <div class="grid gap-2 content-start">
      <button id="bi_tpl" class="border border-teal-600 text-teal-700 hover:bg-teal-50 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="download" class="w-4 h-4"></i>Download CSV Template</button>
      <button id="bi_imp" class="bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="upload-cloud" class="w-4 h-4"></i>Import CSV</button>
      <label class="flex items-start gap-2 text-xs text-slate-700 cursor-pointer mt-1"><input type="checkbox" id="bi_allow" class="mt-0.5 w-4 h-4 accent-teal-600"/><span><b>Allow duplicates</b> &ndash; import rows even if identical to another row in the file or to an existing record.</span></label></div></div>
   <div id="bi_rep"></div>
   <details class="mt-4 border border-dashed border-slate-300 rounded-lg p-3"><summary class="cursor-pointer text-sm font-semibold text-teal-700">CSV Format / Example</summary>
    <p class="text-sm text-slate-500 my-2">The file must have exactly these ${hdr.length} columns, in this order, with these exact headers:</p>
    <pre class="bg-navy-900 text-slate-100 rounded-lg p-3 text-xs leading-6 overflow-auto mb-3">${escapeHtml(biCsv([hdr].concat(biExRows(k))).trim())}</pre>
    <div class="overflow-x-auto"><table class="data w-full text-sm"><thead><tr><th class="text-left px-3 py-2">COLUMN</th><th class="text-left px-3 py-2">REQUIRED</th><th class="text-left px-3 py-2">RULE</th></tr></thead><tbody>
    ${hdr.map(c=>{const r=rule(c);return `<tr><td class="px-3 py-2 font-mono text-xs">${c}</td><td class="px-3 py-2">${r[0]}</td><td class="px-3 py-2">${escapeHtml(r[1])}</td></tr>`}).join('')}</tbody></table></div>
    <p class="text-xs text-slate-500 mt-2">All rows are validated first. Rows identical to an existing record (same vehicle, item, date, meter reading and quantity) are reported as duplicates and are never inserted again, so a corrected file can be re-imported safely.</p></details></div>`;
}
function biReport(ok,msg,list,extra){
  document.getElementById('bi_rep').innerHTML=`<div class="mt-3 rounded-lg p-3 text-sm ${ok?'bg-green-50 text-green-800':'bg-red-50 text-red-800'}"><b>${escapeHtml(msg)}</b>${extra||''}
   ${list&&list.length?`<ul class="mt-1 ml-4 list-disc max-h-48 overflow-auto">${list.slice(0,100).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>${list.length>100?`<div>…and ${list.length-100} more (download the error file)</div>`:''}`:''}</div>`;
}
function biSetFile(f){
  if (f && !/\.csv$/i.test(f.name)){ toast('Please choose a .csv file','error'); return; }
  biState.file=f||null; biState.plan=null;
  document.getElementById('bi_dt').textContent=f?f.name:'Drag & drop CSV file here';
  document.getElementById('bi_ds').textContent=f?'Click “Import CSV” to validate & import — click here to change':'or click to browse';
  document.getElementById('bi_rep').innerHTML='';
}
/* validate everything locally; returns {good, errors:[{line,msg,row}], dups} */
async function biValidate(k, text){
  const allowDup = !!(document.getElementById('bi_allow')||{}).checked;
  const rows = fqParseCsv(text.replace(/^\uFEFF/,'')).filter(r=>r.some(c=>String(c).trim()!==''));
  const hdr = biHeader(k);
  if (!rows.length) return {fatal:'The file is empty.'};
  const h = rows[0].map(x=>String(x).trim().toLowerCase());
  if (h.length!==hdr.length || hdr.some((c,i)=>h[i]!==c)) return {fatal:'Header must be exactly (same order): '+hdr.join(',')+'  — found: '+rows[0].join(',')};
  if (rows.length<2) return {fatal:'The file has a header but no data rows.'};
  if (rows.length>5001) return {fatal:'Too many rows (max 5000 per file).'};
  if (!fqVehicles || !fqVehicles.length) await fqLoadVehicles();
  const items = await biItems(k), today = deToday();
  const vByCode = new Map(fqVehicles.map(v=>[v.code.toLowerCase(),v]));
  const iByName = new Map(); items.forEach(i=>{ const key=i.item_name.trim().toLowerCase(); iByName.set(key, iByName.has(key)?null:i); });
  const good=[], errors=[], seen=new Set();
  rows.slice(1).forEach((r,n)=>{
    const ln=n+2, c=i=>String(r[i]??'').trim(), bad=m=>errors.push({line:ln,msg:m,row:r});
    if (r.length>hdr.length && r.slice(hdr.length).some(x=>String(x).trim())) return bad('Too many columns (extra commas? wrap text containing commas in quotes)');
    const vName=c(0), vCode=c(1), iName=c(2), qtyS=c(3), mrS=c(4), date=c(5), rem=c(6), purpose=k==='Oil'?c(7):'';
    if(!vCode) return bad('vehicle_code is empty');
    const v=vByCode.get(vCode.toLowerCase()); if(!v) return bad(`vehicle_code "${vCode}" not found in Vehicle Master`);
    if(!vName) return bad('vehicle_name is empty');
    if(v.vehicle_name.trim().toLowerCase()!==vName.toLowerCase()) return bad(`vehicle_name "${vName}" does not match Vehicle Master ("${v.vehicle_name}") for code ${v.code}`);
    if(!iName) return bad(BI[k].nameCol+' is empty');
    if(!iByName.has(iName.toLowerCase())) return bad(`${BI[k].label} "${iName}" not found among active ${k==='Other'?'Other':k} items in Item Master`);
    const it=iByName.get(iName.toLowerCase()); if(!it) return bad(`${BI[k].label} "${iName}" matches more than one Item Master record`);
    const q=Number(qtyS); if(qtyS===''||!isFinite(q)||q<0) return bad(`quantity "${qtyS}" must be a number (0 or more)`);
    let m=0; if(mrS!==''){ m=Number(mrS); if(!isFinite(m)||m<0) return bad(`meter_reading "${mrS}" must be a number 0 or more`); }
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) return bad(`replacement_date "${date}" must be a valid date as YYYY-MM-DD`);
    if(date>today) return bad(`replacement_date ${date} is in the future`);
    if(rem.length>500) return bad('remarks longer than 500 characters');
    if(k==='Oil' && purpose && !OE_PURPOSES.includes(purpose)) return bad(`purpose "${purpose}" must be one of: ${OE_PURPOSES.join(', ')}`);
    const key=[v.code,it.id,date,m,q].join('|');
    if(!allowDup && seen.has(key)) return errors.push({line:ln,msg:'Duplicate of an earlier row in this file',row:r,dup:true});
    seen.add(key); good.push({ln,v,it,date,q,m,rem,purpose,key,row:r});
  });
  /* duplicates already in the database (one query set per ~50 vehicles, date-bounded) */
  if (good.length && !allowDup){
    const dates=good.map(g=>g.date).sort(), lo=dates[0], hi=dates[dates.length-1], codes=[...new Set(good.map(g=>g.v.code))], exist=new Set();
    for(let i=0;i<codes.length;i+=50) for(let from=0;;from+=1000){
      const {data,error}=await db.from(RH_TABLE).select('vehicle_code,item_id,replacement_date,meter_reading,quantity').eq('entry_type',k).in('vehicle_code',codes.slice(i,i+50)).gte('replacement_date',lo).lte('replacement_date',hi).range(from,from+999);
      if(error) return {fatal:'Could not check existing records: '+error.message};
      (data||[]).forEach(r=>exist.add([r.vehicle_code,r.item_id,r.replacement_date,r.meter_reading===null?null:Number(r.meter_reading),Number(r.quantity)].join('|')));
      if(!data||data.length<1000) break; }
    for(let i=good.length-1;i>=0;i--) if(exist.has(good[i].key)){ const g=good.splice(i,1)[0]; errors.push({line:g.ln,msg:'Duplicate: identical record already exists in the system',row:g.row,dup:true}); }
  }
  errors.sort((a,b)=>a.line-b.line);
  return {good, errors, total:rows.length-1};
}
function biErrFile(k,errs){ return biCsv([['error_line','error_reason'].concat(biHeader(k))].concat(errs.map(e=>[e.line,e.msg].concat(e.row)))); }
async function biRun(){
  const k=biState.kind; if(biState.busy) return;
  if(!biState.file){ toast('Choose a CSV file first','error'); return; }
  const btn=document.getElementById('bi_imp'); biState.busy=true; btn.disabled=true; btn.textContent='Validating…';
  try{
    const res=await biValidate(k, await biState.file.text());
    if(res.fatal){ biReport(false,res.fatal); return; }
    const hard=res.errors.filter(e=>!e.dup), dups=res.errors.filter(e=>e.dup);
    const lines=res.errors.map(e=>`Row ${e.line}: ${e.msg}`);
    if(!res.good.length){ biReport(false,`Nothing to import — ${hard.length} invalid, ${dups.length} duplicate of ${res.total} rows.`,lines); return; }
    if(hard.length){ /* never silently skip: user must confirm importing only the valid rows */
      biReport(false,`${hard.length} invalid row(s) found. ${res.good.length} valid row(s) are ready.`,lines,
        `<div class="mt-2 flex gap-2"><button id="bi_go" class="bg-teal-600 text-white rounded-lg px-3 py-1.5 text-xs font-medium">Import ${res.good.length} valid row(s) only</button><button id="bi_err" class="border border-red-300 rounded-lg px-3 py-1.5 text-xs font-medium">Download error file</button></div>`);
      document.getElementById('bi_go').onclick=()=>biCommit(k,res,true);
      document.getElementById('bi_err').onclick=()=>biDownload(`${k.toLowerCase()}_import_errors.csv`,biErrFile(k,res.errors));
    } else await biCommit(k,res,false);
  }catch(e){ biReport(false,'Import failed: '+(e.message||e)); }
  finally{ biState.busy=false; btn.disabled=false; btn.innerHTML='<i data-lucide="upload-cloud" class="w-4 h-4"></i>Import CSV'; lucide.createIcons(); }
}
async function biCommit(k,res,partial){
  if(biState.busy && partial===false && false) return;
  const btn=document.getElementById('bi_imp'); biState.busy=true; btn.disabled=true;
  const go=document.getElementById('bi_go'); if(go) go.disabled=true;
  const groups=new Map(), failed=[]; let ok=0;
  res.good.forEach(g=>{ const gk=[g.v.code,g.date,g.m].join('|'); if(!groups.has(gk)) groups.set(gk,[]); const bk=groups.get(gk); let b=bk.find(x=>!x.items.has(g.it.id)); if(!b){ b={gid:rhUuid(),items:new Set()}; bk.push(b); } b.items.add(g.it.id); g.gid=b.gid; });
  const mk=g=>({...rhBase(g.v,g.it,g.date,g.q,g.m,g.rem,Object.assign({source:BI[k].src},g.purpose?{purpose:g.purpose}:{})),entry_group_id:g.gid});
  const CH=200;
  for(let i=0;i<res.good.length;i+=CH){
    const part=res.good.slice(i,i+CH); btn.textContent=`Importing ${Math.min(i+CH,res.good.length)} / ${res.good.length}…`;
    const err=await rhInsert(part.map(mk));    // single batched request per chunk
    if(err) part.forEach(g=>failed.push({line:g.ln,msg:'Database error: '+err.message,row:g.row})); else ok+=part.length;
  }
  try{ await logActivity(k.toUpperCase()+'_CSV_IMPORT',RH_TABLE,null,`${ok} records imported`); }catch(e){}
  const all=res.errors.concat(failed), dups=res.errors.filter(e=>e.dup).length, bad=all.length-dups;
  biReport(failed.length===0&&bad===0, `Import finished — Total in CSV: ${res.total} · Imported: ${ok} · Failed: ${bad} · Duplicates skipped: ${dups}`,
    all.sort((a,b)=>a.line-b.line).map(e=>`Row ${e.line}: ${e.msg}`),
    all.length?`<div class="mt-2"><button id="bi_err" class="border border-slate-300 bg-white rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700">Download rows to fix &amp; re-import</button></div>`:'');
  const eb=document.getElementById('bi_err'); if(eb) eb.onclick=()=>biDownload(`${k.toLowerCase()}_import_errors.csv`,biErrFile(k,all));
  toast(`${ok} record(s) imported`,ok?'success':'error');
  biState.busy=false; btn.disabled=false; btn.innerHTML='<i data-lucide="upload-cloud" class="w-4 h-4"></i>Import CSV'; lucide.createIcons();
}
function biMount(host,k){
  biState={...biState,kind:k,file:null,busy:false};
  host.insertAdjacentHTML('afterbegin',biSection(k)); lucide.createIcons();
  const drop=document.getElementById('bi_drop'), fi=document.getElementById('bi_file');
  drop.onclick=()=>fi.click(); fi.onchange=e=>{ biSetFile(e.target.files[0]); e.target.value=''; };
  drop.ondragover=e=>{e.preventDefault();drop.classList.add('border-teal-500','bg-teal-50');};
  drop.ondragleave=e=>{e.preventDefault();drop.classList.remove('border-teal-500','bg-teal-50');};
  drop.ondrop=e=>{e.preventDefault();drop.classList.remove('border-teal-500','bg-teal-50'); if(e.dataTransfer.files[0]) biSetFile(e.dataTransfer.files[0]); };
  document.getElementById('bi_tpl').onclick=()=>biDownload(BI[k].file,biCsv([biHeader(k)].concat(biExRows(k))));
  document.getElementById('bi_imp').onclick=biRun;
}
/* Dedicated Bulk CSV Import page: pick Oil / Filter / Other, then upload */
const BI_KINDS = [
  ['Oil',    'Oil',    'droplets',  'Engine, hydraulic & other oils',        'oil_history'],
  ['Filter', 'Filter', 'filter',    'Oil, air, fuel & other filters',        'de_history'],
  ['Other',  'Other',  'settings-2','Any other replaced item (not oil/filter)','other_history']
];
ROUTES.bulk_import = async host => {
  if (!currentUser || currentUser.role !== 'Super Admin'){ host.innerHTML='<div class="text-red-600 text-sm">Only a Super Admin can use Bulk CSV Import.</div>'; return; }
  biState.itemCache = {};
  host.innerHTML = `
   <p class="text-sm text-slate-500 mb-4">Import many replacement records at once from a CSV file. Choose what you are uploading:</p>
   <div id="bi_kinds" class="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4"></div>
   <div id="bi_host"></div>`;
  const draw = k => {
    document.getElementById('bi_kinds').innerHTML = BI_KINDS.map(([key,label,icon,desc])=>`
      <button type="button" data-k="${key}" class="text-left rounded-xl border-2 p-4 flex items-center gap-3 transition ${key===k?'border-teal-600 bg-teal-50':'border-slate-200 bg-white hover:border-teal-300'}">
        <span class="w-10 h-10 rounded-lg flex items-center justify-center ${key===k?'bg-teal-600 text-white':'bg-slate-100 text-slate-600'}"><i data-lucide="${icon}" class="w-5 h-5"></i></span>
        <span><b class="block text-sm text-navy-900">${label} Replacement</b><span class="text-xs text-slate-500">${desc}</span></span>
      </button>`).join('');
    const h = document.getElementById('bi_host'); h.innerHTML = '';
    biMount(h, k);
    const hist = BI_KINDS.find(x=>x[0]===k)[4];
    h.insertAdjacentHTML('beforeend', `<div class="text-sm"><a href="#" id="bi_hist" class="text-teal-700 hover:underline">View ${k.toLowerCase()} replacement history →</a></div>`);
    document.getElementById('bi_hist').onclick = e=>{ e.preventDefault(); route(hist); };
    lucide.createIcons();
  };
  document.getElementById('bi_kinds').onclick = e=>{ const b=e.target.closest('button[data-k]'); if(b && b.dataset.k!==biState.kind) draw(b.dataset.k); };
  draw('Oil');
};


