/* page module (original lines 2049-2290) */
/* ============================================================
   ITEM MASTER
   ============================================================ */
const IM_UNITS = ['PCS','SET','LTR','KG','M','BOX','ROLL','OTHER'];
const IM_HEADER = ['item_name','item_code','item_category','unit','description','status'];
let imCsvFile = null;

ROUTES.item_master = async (host)=>{
  imCsvFile = null; imFCat=''; imFQ=''; imPg=0;
  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm';
  host.innerHTML = `
   <p class="text-sm text-slate-500 mb-4">Add a new item or spare part, or import many items at once from a CSV file.</p>
   <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
     <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
       <div class="flex items-center gap-3 mb-4">
         <div class="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center"><i data-lucide="boxes" class="w-5 h-5"></i></div>
         <div><h3 class="font-semibold text-navy-900">Add an Item</h3><p class="text-xs text-slate-500">Create an item / spare part record.</p></div>
       </div>
       <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
         <div><label class="block mb-1 text-sm font-medium">Item Code (unique) <span class="text-red-500">*</span></label><input id="im_code" placeholder="e.g. OF-1001" class="${inp}"/></div>
         <div><label class="block mb-1 text-sm font-medium">Item Name <span class="text-red-500">*</span></label><input id="im_name" placeholder="e.g. Oil Filter" class="${inp}"/></div>
         <div><label class="block mb-1 text-sm font-medium">Category</label><input id="im_cat" placeholder="e.g. Filters" class="${inp}"/></div>
         <div><label class="block mb-1 text-sm font-medium">Unit <span class="text-red-500">*</span></label>
           <select id="im_unit" class="${inp}">${IM_UNITS.map(u=>`<option>${u}</option>`).join('')}</select></div>
         <div><label class="block mb-1 text-sm font-medium">Status</label>
           <select id="im_status" class="${inp}"><option>Active</option><option>Inactive</option></select></div>
         <div><label class="block mb-1 text-sm font-medium">Description</label><input id="im_desc" placeholder="Optional" class="${inp}"/></div>
       </div>
       <div id="imErr" class="text-red-600 text-xs min-h-[1rem] mb-2"></div>
       <button id="imSave" class="w-full bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg py-2.5 text-sm flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i>Create Item</button>
     </div>

     <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
       <div class="flex items-center gap-3 mb-4">
         <div class="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center"><i data-lucide="upload-cloud" class="w-5 h-5"></i></div>
         <div><h3 class="font-semibold text-navy-900">Bulk Import via CSV</h3><p class="text-xs text-slate-500">Create many items at once from a CSV file.</p></div>
       </div>
       <div class="grid grid-cols-1 md:grid-cols-[1fr_190px] gap-3">
         <div id="imDrop" class="border-2 border-dashed border-slate-300 rounded-xl p-6 text-center cursor-pointer min-h-[110px] flex flex-col items-center justify-center">
           <i data-lucide="upload-cloud" class="w-7 h-7 text-teal-600 mb-1"></i>
           <b id="imDropT" class="text-sm">Drag &amp; drop CSV file here</b>
           <span id="imDropS" class="text-xs text-slate-500">or click to browse</span>
           <input type="file" id="imFile" accept=".csv,text/csv" class="hidden"/>
         </div>
         <div class="grid gap-2 content-start">
           <button id="imTpl" class="border border-teal-600 text-teal-700 hover:bg-teal-50 rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="download" class="w-4 h-4"></i>Download CSV Template</button>
           <button id="imImp" class="bg-teal-600 hover:bg-teal-700 text-white rounded-lg py-2.5 text-sm font-medium flex items-center justify-center gap-2"><i data-lucide="upload-cloud" class="w-4 h-4"></i>Import CSV</button>
         </div>
       </div>
       <div id="imRep"></div>
       <details class="mt-4 border border-dashed border-slate-300 rounded-lg p-3">
         <summary class="cursor-pointer text-sm font-semibold text-teal-700">CSV Format / Example &amp; Rules</summary>
         <p class="text-sm text-slate-500 my-2">The file must have exactly these six columns, in this order, with this exact header:</p>
         <pre class="bg-navy-900 text-slate-100 rounded-lg p-3 text-xs leading-6 overflow-auto mb-3">item_name,item_code,item_category,unit,description,status
Oil Filter,OF-1001,Filters,PCS,Engine oil filter,Active
Hydraulic Oil,HO-2001,Lubricants,LTR,ISO 68,Active</pre>
         <div class="overflow-x-auto"><table class="data w-full text-sm"><thead><tr><th class="text-left px-3 py-2">COLUMN</th><th class="text-left px-3 py-2">REQUIRED</th><th class="text-left px-3 py-2">RULE</th></tr></thead><tbody>
           <tr><td class="px-3 py-2">item_name</td><td class="px-3 py-2">Yes</td><td class="px-3 py-2">Any text</td></tr>
           <tr><td class="px-3 py-2">item_code</td><td class="px-3 py-2">Yes</td><td class="px-3 py-2">Unique; repeated or existing codes are skipped</td></tr>
           <tr><td class="px-3 py-2">item_category</td><td class="px-3 py-2">No</td><td class="px-3 py-2">Any text</td></tr>
           <tr><td class="px-3 py-2">unit</td><td class="px-3 py-2">Yes</td><td class="px-3 py-2">${IM_UNITS.join(', ')}</td></tr>
           <tr><td class="px-3 py-2">description</td><td class="px-3 py-2">No</td><td class="px-3 py-2">Any text</td></tr>
           <tr><td class="px-3 py-2">status</td><td class="px-3 py-2">No</td><td class="px-3 py-2">Active or Inactive (blank = Active)</td></tr>
         </tbody></table></div>
       </details>
     </div>
   </div>
   <div id="iWrap"><div class="text-slate-400 text-sm">Loading…</div></div>`;
  lucide.createIcons();

  document.getElementById('imSave').addEventListener('click', imCreate);
  const drop = document.getElementById('imDrop'), fileIn = document.getElementById('imFile');
  drop.addEventListener('click', ()=>fileIn.click());
  fileIn.addEventListener('change', e=>{ imSetFile(e.target.files[0]); e.target.value=''; });
  ['dragenter','dragover'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.add('border-teal-500','bg-teal-50');}));
  ['dragleave','drop'].forEach(t=>drop.addEventListener(t,e=>{e.preventDefault();drop.classList.remove('border-teal-500','bg-teal-50');}));
  drop.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if(f) imSetFile(f); });
  document.getElementById('imTpl').addEventListener('click', imTemplate);
  document.getElementById('imImp').addEventListener('click', imImport);
  await refreshItemsMaster();
};

async function imCreate(){
  const er = document.getElementById('imErr'); er.textContent='';
  const name = document.getElementById('im_name').value.trim(), code = document.getElementById('im_code').value.trim();
  if (!name) { er.textContent='Enter an item name.'; return; }
  if (!code) { er.textContent='Enter an item code.'; return; }
  const btn = document.getElementById('imSave'); btn.disabled = true;
  const existing = await loadItems();
  if (existing.some(x=>String(x.item_code).toLowerCase()===code.toLowerCase())){ btn.disabled=false; er.textContent='This item code is already registered.'; return; }
  const { error } = await db.from('items').insert({
    item_name:name, item_code:code,
    item_category:document.getElementById('im_cat').value.trim()||null,
    unit:document.getElementById('im_unit').value,
    description:document.getElementById('im_desc').value.trim(),
    status:document.getElementById('im_status').value });
  btn.disabled = false;
  if (error){ er.textContent = error.code==='23505' ? 'This item code is already registered.' : error.message; return; }
  try{ await logActivity('ITEM_CREATE','items',null,code); }catch(e){}
  ['im_name','im_code','im_cat','im_desc'].forEach(id=>document.getElementById(id).value='');
  toast('Item created','success'); refreshItemsMaster();
}
function imSetFile(f){
  imCsvFile = f || null;
  document.getElementById('imDropT').textContent = f ? f.name : 'Drag & drop CSV file here';
  document.getElementById('imDropS').textContent = f ? 'Ready to import - click to change' : 'or click to browse';
  document.getElementById('imRep').innerHTML = '';
}
function imTemplate(){
  const blob = new Blob([IM_HEADER.join(',')+'\r\nOil Filter,OF-1001,Filters,PCS,Engine oil filter,Active\r\nHydraulic Oil,HO-2001,Lubricants,LTR,ISO 68,Active\r\n'],{type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'item_template.csv'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function imReport(ok, msg, list){
  document.getElementById('imRep').innerHTML = `<div class="mt-3 rounded-lg p-3 text-sm ${ok?'bg-green-50 text-green-800':'bg-red-50 text-red-800'}"><b>${escapeHtml(msg)}</b>
    ${list&&list.length?`<ul class="mt-1 ml-4 list-disc max-h-40 overflow-auto">${list.slice(0,50).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>${list.length>50?`<div>…and ${list.length-50} more</div>`:''}`:''}</div>`;
}
async function imImport(){
  if (!imCsvFile){ toast('Choose a CSV file first','error'); return; }
  const rows = fqParseCsv(await imCsvFile.text());
  if (!rows.length){ imReport(false,'The file is empty.'); return; }
  const h = rows[0].map(x=>x.trim().toLowerCase());
  if (h.length!==IM_HEADER.length || IM_HEADER.some((c,k)=>h[k]!==c)){ imReport(false,'Header must be exactly: '+IM_HEADER.join(',')); return; }
  const existing = await loadItems();
  const seen = new Set(existing.map(x=>String(x.item_code).toLowerCase())), good=[], problems=[];
  rows.slice(1).forEach((r,i)=>{ const ln=i+2, c=k=>(r[k]||'').trim();
    const name=c(0), code=c(1), unit=c(3).toUpperCase(), status=c(5)||'Active';
    if(!name) return problems.push(`Line ${ln}: missing item_name`);
    if(!code) return problems.push(`Line ${ln}: missing item_code`);
    if(!IM_UNITS.includes(unit)) return problems.push(`Line ${ln}: invalid unit "${c(3)}"`);
    if(!['Active','Inactive'].includes(status)) return problems.push(`Line ${ln}: status must be Active or Inactive`);
    if(seen.has(code.toLowerCase())) return problems.push(`Line ${ln}: code ${code} already exists or is repeated`);
    seen.add(code.toLowerCase());
    good.push({item_name:name, item_code:code, item_category:c(2)||null, unit, description:c(4), status}); });
  if (!good.length){ imReport(false,'Nothing imported.',problems); return; }
  const btn = document.getElementById('imImp'); btn.disabled = true;
  for (let i=0;i<good.length;i+=500){
    const { error } = await db.from('items').insert(good.slice(i,i+500));
    if (error){ btn.disabled=false; imReport(false,'Import stopped: '+error.message,problems); return; }
  }
  btn.disabled = false;
  try{ await logActivity('ITEM_IMPORT','items',null,`${good.length} items`); }catch(e){}
  imSetFile(null); await refreshItemsMaster();
  imReport(true, `Imported ${good.length} item${good.length>1?'s':''}${problems.length?`, skipped ${problems.length}`:''}.`, problems);
  toast(`Imported ${good.length} items`,'success');
}
const IM_PAGE = 50; let imAll=[], imPg=0, imFCat='', imFQ='';
const imRow = i => `<tr>
    <td class="px-4 py-2">${escapeHtml(i.item_name)}</td>
    <td class="px-4 py-2 font-mono text-xs">${escapeHtml(i.item_code)}</td>
    <td class="px-4 py-2">${escapeHtml(i.item_category||'—')}</td>
    <td class="px-4 py-2">${escapeHtml(i.unit)}</td>
    <td class="px-4 py-2 max-w-xs truncate" title="${escapeHtml(i.description)}">${escapeHtml(i.description||'—')}</td>
    <td class="px-4 py-2">${badge(i.status)}</td>
    <td class="px-4 py-2">${fmtDate(i.created_at)}</td>
    <td class="px-4 py-2 whitespace-nowrap">
      <button onclick="openItemForm('${i.id}')" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-teal-700 hover:bg-teal-50" title="Edit" aria-label="Edit"><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i></button>
      <button onclick="deleteItem('${i.id}')" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-red-600 hover:bg-red-50" title="Delete" aria-label="Delete"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>
    </td></tr>`;
async function refreshItemsMaster(){
  const wrap=document.getElementById('iWrap'); if(!wrap) return;
  try{ imAll = await loadItems(); }catch(err){ wrap.innerHTML=`<div class="text-red-600 text-sm">Could not load items: ${escapeHtml(err.message)}</div>`; return; }
  const cats = [...new Set(imAll.map(i=>(i.item_category||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})), hasNone = imAll.some(i=>!(i.item_category||'').trim());
  if (imFCat && imFCat!=='__none' && !cats.includes(imFCat)) imFCat='';
  wrap.innerHTML = tableCard('Item Master',
    ['Name','Code','Category','Unit','Description','Status','Created','Actions'], '',
    {toolbar:`<div class="flex flex-wrap items-center gap-2"><span id="im_cnt" class="text-xs text-slate-500"></span>
      <select id="im_fcat" onchange="filterIMTable()" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm"><option value="">All categories</option>${cats.map(c=>`<option value="${escapeHtml(c)}" ${c===imFCat?'selected':''}>${escapeHtml(c)}</option>`).join('')}${hasNone?`<option value="__none" ${imFCat==='__none'?'selected':''}>No category</option>`:''}</select>
      <input id="im_fq" placeholder="Search…" value="${escapeHtml(imFQ)}" oninput="filterIMTable()" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48"/></div>`})
    + `<div id="im_pager" class="flex items-center justify-between gap-2 mt-3 text-sm"></div>`;
  lucide.createIcons(); imRender();
}
function imFiltered(){
  const q=imFQ.trim().toLowerCase();
  return imAll.filter(i=>{ const c=(i.item_category||'').trim();
    if (imFCat && !(imFCat==='__none' ? c==='' : c===imFCat)) return false;
    return !q || [i.item_name,i.item_code,c,i.unit,i.description,i.status].some(v=>String(v??'').toLowerCase().includes(q)); });
}
function imRender(){
  const tb=document.querySelector('#iWrap tbody'), cnt=document.getElementById('im_cnt'), pg=document.getElementById('im_pager'); if(!tb) return;
  const filtering=!!(imFCat||imFQ.trim()), total=imAll.length; let list, from=0;
  if (filtering){ list=imFiltered(); }
  else { const pages=Math.max(1,Math.ceil(total/IM_PAGE)); imPg=Math.max(0,Math.min(imPg,pages-1)); from=imPg*IM_PAGE; list=imAll.slice(from,from+IM_PAGE); }
  tb.innerHTML = list.map(imRow).join('') || emptyRow(8, filtering?'No items match the filters.':'No items.');
  if (cnt) cnt.textContent = filtering ? `${list.length} of ${total} items` : `${total} items`;
  if (pg) pg.innerHTML = filtering ? `<span class="text-slate-500">Showing all ${list.length} matching item${list.length===1?'':'s'}</span><span></span>`
    : `<button onclick="imGo(-1)" ${imPg===0?'disabled':''} class="border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-50">Previous</button><span class="text-slate-500">${total?from+1:0}–${from+list.length} of ${total}</span><button onclick="imGo(1)" ${from+list.length>=total?'disabled':''} class="border border-slate-300 rounded-lg px-3 py-1.5 disabled:opacity-50">Next</button>`;
  lucide.createIcons();   // draw the Edit/Delete icons in the freshly rendered rows
}
function imGo(d){ imPg+=d; imRender(); }
function filterIMTable(){
  const sel=document.getElementById('im_fcat'), inp=document.getElementById('im_fq'); if(!sel||!inp) return;
  imFCat=sel.value; imFQ=inp.value; imPg=0; imRender();
}
async function openItemForm(id=''){
  let i=null;
  if (id){ const {data}=await db.from('items').select('*').eq('id',id).maybeSingle(); i=data; }
  openModal(i?'Edit Item':'Add Item', `
   <form class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
     <div class="md:col-span-2"><label class="block mb-1 font-medium">Item Name *</label><input id="i_name" value="${escapeHtml(i?.item_name||'')}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
     <div><label class="block mb-1 font-medium">Item Code *</label><input id="i_code" value="${escapeHtml(i?.item_code||'')}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
     <div><label class="block mb-1 font-medium">Category</label><input id="i_cat" value="${escapeHtml(i?.item_category||'')}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
     <div><label class="block mb-1 font-medium">Unit *</label>
       <select id="i_unit" class="w-full border border-slate-300 rounded-lg px-3 py-2">
         ${['PCS','SET','LTR','KG','M','BOX','ROLL','OTHER'].map(u=>`<option ${i?.unit===u?'selected':''}>${u}</option>`).join('')}
       </select>
     </div>
     <div><label class="block mb-1 font-medium">Status</label>
       <select id="i_status" class="w-full border border-slate-300 rounded-lg px-3 py-2">
         <option ${i?.status==='Active'?'selected':''}>Active</option>
         <option ${i?.status==='Inactive'?'selected':''}>Inactive</option>
       </select>
     </div>
     <div class="md:col-span-2"><label class="block mb-1 font-medium">Description</label><textarea id="i_desc" rows="2" class="w-full border border-slate-300 rounded-lg px-3 py-2">${escapeHtml(i?.description||'')}</textarea></div>
   </form>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
    <button onclick="saveItem('${id}')" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save</button>`);
}
async function saveItem(id){
  const name = document.getElementById('i_name').value.trim();
  const code = document.getElementById('i_code').value.trim();
  if (!name||!code){ toast('Name & code required.','error'); return; }
  const payload = {
    item_name:name, item_code:code,
    item_category:document.getElementById('i_cat').value.trim()||null,
    unit:document.getElementById('i_unit').value,
    description:document.getElementById('i_desc').value.trim(),
    status:document.getElementById('i_status').value,
  };
  let res;
  if (id) res=await db.from('items').update(payload).eq('id',id);
  else res=await db.from('items').insert(payload);
  if (res.error){ toast(res.error.message,'error'); return; }
  toast('Saved','success'); closeModal(); refreshItemsMaster();
}
async function deleteItem(id){
  if (!await confirmDialog('This item will be permanently removed from the Item Master. This cannot be undone.', {title:'Delete item?', confirmText:'Delete', danger:true})) return;
  const { error } = await db.from('items').delete().eq('id', id);
  if (error){ toast(error.message,'error'); return; }
  toast('Deleted','success'); refreshItemsMaster();
}

