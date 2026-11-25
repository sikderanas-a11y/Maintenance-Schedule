/* page module (original lines 1141-1826) */
/* ============================================================
   ITEM REQUIREMENT SUBMISSION
   ============================================================ */
ROUTES.item_requirement = async (host)=>{
  REQ_HOST = host;
  host.innerHTML = `
   <div class="space-y-5">
     <p class="text-sm text-slate-500">Submit spare parts / item requirements. After submission, requirements auto-flow to ROM → Supply Chain, and a PDF receipt is generated.</p>
     <div class="grid grid-cols-1 xl:grid-cols-[minmax(360px,440px)_minmax(0,1fr)] gap-5 items-start">
       <div id="reqFormHost" class="xl:sticky xl:top-4"><div class="bg-white border border-slate-200 rounded-xl p-5 text-slate-400 text-sm">Loading form…</div></div>
       <div id="reqPreview" class="min-w-0"></div>
     </div>
   </div>`;
  lucide.createIcons();
  await openReqForm().catch(e=>{ const h=document.getElementById('reqFormHost'); if(h) h.innerHTML=`<div class="text-red-600 text-sm">${escapeHtml(e.message)}</div>`; });
};
ROUTES.item_requirement_list = async (host)=>{
  host.innerHTML = `<div class="space-y-4">
     <div class="flex items-center justify-between gap-2 flex-wrap"><p class="text-sm text-slate-500">All submitted item requirements. Use the icons to view, download the PDF receipt, edit or delete.</p>
       <button onclick="route('item_requirement')" class="px-3 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> New Requirement</button></div>
     <div id="reqWrap" class="min-w-0 overflow-x-auto"><div class="text-slate-400 text-sm">Loading…</div></div>
   </div>`;
  lucide.createIcons();
  await refreshRequirements();
};
async function refreshRequirements(){
  const wrap = document.getElementById('reqWrap'); if (!wrap) return;
  const { data, error } = await db.from('item_requirements').select('*').order('submission_date',{ascending:false});
  if (error){ wrap.innerHTML = `<div class="text-red-600 text-sm">${escapeHtml(error.message)}</div>`; return; }
  const users = await reqLoadUsers();
  const rows = (data||[]).map(r=>`<tr>
    <td class="px-4 py-2 font-mono text-xs">${escapeHtml(r.requirement_id)}</td>
    <td class="px-4 py-2">${escapeHtml(r.vehicle_name)}<div class="text-xs text-slate-400">${escapeHtml(r.registration_number)}</div></td>
    <td class="px-4 py-2">${escapeHtml(r.item_name)}</td>
    <td class="px-4 py-2">${r.required_quantity}${r.uom?' '+escapeHtml(r.uom):''}</td>
    <td class="px-4 py-2">${escapeHtml(r.pr_number||'—')}</td>
    <td class="px-4 py-2">${fmtDateTime(r.submission_date)}</td>
    <td class="px-4 py-2 whitespace-nowrap">
      <div class="flex items-center gap-1">
      <button onclick="viewReq('${r.id}')" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-teal-700 hover:bg-teal-50" title="View" aria-label="View"><i data-lucide="eye" class="w-4 h-4 pointer-events-none"></i></button>
      <button onclick="reqReceiptFor('${r.id}')" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-navy-800 hover:bg-slate-100" title="Download PDF receipt" aria-label="Download PDF receipt"><i data-lucide="file-down" class="w-4 h-4 pointer-events-none"></i></button>
      ${(()=>{ const ok = r.status==='Submitted to ROM', tip = ok?'':'Locked: already processed by ROM / Supply Chain';
        const cls='p-1.5 rounded-lg text-slate-500 align-middle disabled:opacity-40 disabled:cursor-not-allowed';
        return `<button onclick="editReq('${r.id}')" class="${cls} hover:text-teal-700 hover:bg-teal-50" title="${ok?'Edit':tip}" aria-label="Edit" ${ok?'':'disabled'}><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i></button>
      <button onclick="deleteReq('${r.id}')" class="${cls} hover:text-red-600 hover:bg-red-50" title="${ok?'Delete':tip}" aria-label="Delete" ${ok?'':'disabled'}><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>`; })()}
      </div>
    </td>
  </tr>`).join('') || emptyRow(7,'No item requirements submitted yet.');
  wrap.innerHTML = tableCard('Item Requirements',
    ['Req ID','Vehicle','Item','Qty','PR No.','Submitted','Actions'], rows,
    {toolbar:`<input id="reqSearch" placeholder="Search…" onkeyup="filterReqTable(this.value)" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48"/>`});
  lucide.createIcons();
}
function filterReqTable(q){
  q = q.toLowerCase();
  document.querySelectorAll('#reqWrap tbody tr').forEach(tr=>{
    tr.style.display = tr.innerText.toLowerCase().includes(q)?'':'none';
  });
}
/* ---- who submitted / edit / delete ---- */
async function reqLoadUsers(){
  const m = new Map();
  try{ const { data } = await db.from('profiles').select('id, full_name, email, department'); (data||[]).forEach(u=>m.set(String(u.id),u)); }catch(e){}
  if (currentUser) m.set(String(currentUser.id), m.get(String(currentUser.id)) || currentUser);
  return m;
}
function reqSubmitterHtml(r, users){
  const u = r.submitted_by ? users.get(String(r.submitted_by)) : null;
  if (!u) return '<span class="text-slate-400">—</span>';
  return `${escapeHtml(u.full_name||u.email||'')}${u.department?`<div class="text-xs text-slate-400">${escapeHtml(u.department)}</div>`:''}`;
}
let ER = null;
async function editReq(id){
  const { data: r } = await db.from('item_requirements').select('*').eq('id', id).maybeSingle();
  if (!r){ toast('Requirement not found.','error'); return; }
  if (r.status!=='Submitted to ROM'){ toast('This requirement has already been processed and can no longer be edited.','error'); refreshRequirements(); return; }
  let items=[]; try{ items = await loadItems(); }catch(e){ toast(e.message,'error'); return; }
  const label = i => `${i.item_name}${i.item_code?' ('+i.item_code+')':''}`;
  const origLabel = `${r.item_name||''}${r.item_code?' ('+r.item_code+')':''}`;
  ER = { r, origLabel, map:new Map(items.map(i=>[label(i), i])) };
  const uoms = REQ_UOMS.includes(r.uom) || !r.uom ? REQ_UOMS : [...REQ_UOMS, r.uom];
  const inp='w-full border border-slate-300 rounded-lg px-3 py-2';
  openModal(`Edit ${escapeHtml(r.requirement_id)}`, `
    <div class="space-y-3 text-sm">
      <div class="bg-slate-50 rounded-lg p-3"><div class="text-xs text-slate-500">Vehicle (to change the vehicle, delete this record and create a new one)</div>
        <div class="font-medium mt-0.5">${escapeHtml(r.vehicle_name||'')} <span class="font-mono text-xs text-slate-500">${escapeHtml(r.registration_number||'')}</span></div></div>
      <div><label class="block mb-1 font-medium">Item *</label>
        <input id="er_item" list="er_items" value="${escapeHtml(origLabel)}" class="${inp}" autocomplete="off" placeholder="Search item name or code…"/>
        <datalist id="er_items">${items.map(i=>`<option value="${escapeHtml(label(i))}"></option>`).join('')}</datalist></div>
      <div class="grid grid-cols-2 gap-3">
        <div><label class="block mb-1 font-medium">Quantity *</label><input id="er_qty" type="number" min="0" step="any" value="${escapeHtml(r.required_quantity)}" class="${inp}"/></div>
        <div><label class="block mb-1 font-medium">UoM *</label><select id="er_uom" class="${inp}">${uoms.map(u=>`<option ${u===(r.uom||'PCS')?'selected':''}>${escapeHtml(u)}</option>`).join('')}</select></div>
        <div><label class="block mb-1 font-medium">PR Number</label><input id="er_pr" value="${escapeHtml(r.pr_number||'')}" class="${inp}"/></div>
      </div>
      <div><label class="block mb-1 font-medium">Description</label><textarea id="er_desc" rows="2" class="${inp}">${escapeHtml(r.description||'')}</textarea></div>
      <div><label class="block mb-1 font-medium">Remarks</label><textarea id="er_rem" rows="2" class="${inp}">${escapeHtml(r.remarks||'')}</textarea></div>
    </div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
     <button id="er_save" onclick="saveEditReq()" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save Changes</button>`);
}
async function saveEditReq(){
  if (!ER) return; const r = ER.r;
  const val = document.getElementById('er_item').value.trim();
  let itemName=r.item_name, itemCode=r.item_code||null, itemId=r.item_id||null;
  if (val!==ER.origLabel){
    const it = ER.map.get(val);
    if (!it){ toast('Pick an item from the suggestions list.','error'); return; }
    itemName=it.item_name; itemCode=it.item_code||null; itemId=reqIsUuid(it.id)?it.id:null;
  }
  const qty=parseFloat(document.getElementById('er_qty').value);
  if (!(qty>0)){ toast('Enter a valid quantity.','error'); return; }
  const uom=document.getElementById('er_uom').value;
  const upd = { item_id:itemId, item_name:itemName, item_code:itemCode, required_quantity:qty, uom,
    pr_number:document.getElementById('er_pr').value.trim()||null,
    description:document.getElementById('er_desc').value.trim(), remarks:document.getElementById('er_rem').value.trim() };
  const btn=document.getElementById('er_save'); btn.disabled=true;
  const { data: cur } = await db.from('item_requirements').select('status').eq('id', r.id).maybeSingle();   // re-check right before saving
  if (!cur || cur.status!=='Submitted to ROM'){ btn.disabled=false; toast('ROM has already started processing this requirement; it can no longer be edited.','error'); ER=null; closeModal(); refreshRequirements(); return; }
  const strip = o => { const c={...o}; delete c.uom; delete c.item_code; c.description=((o.description||'')+' [UoM: '+o.uom+']').trim(); return c; };
  let res = await db.from('item_requirements').update(REQ_EXTRA_COLS===false?strip(upd):upd).eq('id', r.id).select('id');
  if (res.error && REQ_EXTRA_COLS!==false && reqIsMissingCol(res.error)){ REQ_EXTRA_COLS=false; res = await db.from('item_requirements').update(strip(upd)).eq('id', r.id).select('id'); }
  if (res.error){ btn.disabled=false; toast(res.error.message,'error'); return; }
  if (!res.data || !res.data.length){ btn.disabled=false; toast('Nothing was updated (no permission or record missing).','error'); return; }
  try{ await logActivity('UPDATE_ITEM_REQUIREMENT','item_requirements', r.id, `${r.requirement_id} - ${itemName} x${qty} ${uom}`); }catch(e){}
  toast('Requirement updated','success'); ER=null; closeModal(); refreshRequirements();
}
async function deleteReq(id){
  const { data: r } = await db.from('item_requirements').select('*').eq('id', id).maybeSingle();
  if (!r){ toast('Requirement not found.','error'); refreshRequirements(); return; }
  if (r.status!=='Submitted to ROM'){ toast('This requirement has already been processed and can no longer be deleted.','error'); refreshRequirements(); return; }
  if (!await confirmDialog(`${r.requirement_id} · ${r.item_name} × ${r.required_quantity} for ${r.vehicle_name} will be permanently deleted.`, {title:'Delete requirement?', confirmText:'Delete', danger:true})) return;
  const { data:del, error } = await db.from('item_requirements').delete().eq('id', id).select('id');
  if (error){ toast(error.message,'error'); return; }
  if (!del || !del.length){ toast('Nothing was deleted (no permission or already removed).','error'); refreshRequirements(); return; }
  if (r.maintenance_id){   // un-link a maintenance record that was waiting on this requirement
    try{ await db.from('maintenance_records').update({status:'Maintenance Required', item_requirement_id:null}).eq('id', r.maintenance_id).eq('item_requirement_id', id).eq('status','Item Requirement Pending'); }catch(e){}
  }
  try{ await logActivity('DELETE_ITEM_REQUIREMENT','item_requirements', id, `${r.requirement_id} - ${r.item_name} x${r.required_quantity}`); }catch(e){}
  toast('Requirement deleted','success'); refreshRequirements();
}
/* ---------- A4 PDF receipt (material requisition acknowledgement) ---------- */
function reqQrDataUrl(text){
  try{
    const d=document.createElement('div'); d.style.cssText='position:fixed;left:-9999px;top:0';
    document.body.appendChild(d);
    new QRCode(d,{text:String(text),width:160,height:160,correctLevel:QRCode.CorrectLevel.M});
    const c=d.querySelector('canvas'); const url=c?c.toDataURL('image/png'):null; d.remove(); return url;
  }catch(e){ return null; }
}
function reqMakeReceipt(recs, ctx){
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J || !recs || !recs.length) return false;
  ctx = ctx || {};
  const doc = new J({unit:'mm', format:'a4', orientation:'portrait'});
  const W=210, H=297, M=14, CW=W-2*M, FOOT=22;
  const NAVY=[15,42,74], TEAL=[13,148,136], GREY=[100,116,139], INK=[30,41,59], LIGHT=[241,245,249], LINE=[203,213,225];
  const T = s => String(s==null||s===''?'-':s).replace(/[\u2013\u2014]/g,'-').replace(/\u2192/g,'to');
  const dt = (d,time) => { if(!d) return '-'; try{ const o={day:'2-digit',month:'short',year:'numeric'}; if(time){o.hour='2-digit';o.minute='2-digit';} return new Date(d).toLocaleString('en-GB',o);}catch(e){return String(d);} };
  const first=recs[0], last=recs[recs.length-1];
  const rcpNo = 'RCP-'+String(first.requirement_id||'').replace(/^REQ-/,'');
  const idRange = (recs.length>1 && first.requirement_id!==last.requirement_id) ? `${first.requirement_id} to ${last.requirement_id}` : T(first.requirement_id);
  const nVeh = new Set(recs.map(r=>(r.registration_number||'')+'|'+(r.vehicle_name||''))).size;
  const nItm = new Set(recs.map(r=>(r.item_code||'')+'|'+(r.item_name||''))).size;
  const sub = ctx.submitter || {};
  const submittedAt = first.submission_date || new Date().toISOString();
  let y=0;

  /* --- first-page header band --- */
  doc.setFillColor(...NAVY); doc.rect(0,0,W,30,'F');
  if(APP_LOGO){ doc.setFillColor(255,255,255); doc.roundedRect(M,8,14,14,2,2,'F'); try{ doc.addImage(APP_LOGO,'PNG',M+0.8,8.8,12.4,12.4); }catch(e){} }
  else { doc.setFillColor(...TEAL); doc.roundedRect(M,8,14,14,2,2,'F');
  doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(11); doc.text('VM',M+7,16.6,{align:'center'}); }
  doc.setTextColor(255,255,255);
  doc.setFontSize(13); doc.text('XiC (Automobile)',M+19,13.5);
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.text('Concept of ROM',M+19,18.5);
  doc.setFont('helvetica','bold'); doc.setFontSize(15); doc.text('ITEM REQUIREMENT RECEIPT',W-M,14,{align:'right'});
  doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.text('Acknowledgement of requisition submission',W-M,19.5,{align:'right'});
  doc.setFillColor(...TEAL); doc.rect(0,30,W,1.2,'F');

  /* --- meta panel --- */
  y=37; const mh=30;
  doc.setDrawColor(...LINE); doc.setLineWidth(.3); doc.setFillColor(255,255,255); doc.roundedRect(M,y,CW,mh,1.5,1.5,'FD');
  const field=(label,val,x,yy,w)=>{ doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...GREY); doc.text(label.toUpperCase(),x,yy);
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...INK); const ls=doc.splitTextToSize(T(val),w); doc.text(ls.slice(0,2),x,yy+4.2); };
  field('Receipt No.', rcpNo, M+4, y+6, 52);
  field('Date & Time', dt(submittedAt,true), M+4, y+17, 52);
  field('Submitted By', sub.full_name||sub.email||'-', M+60, y+17, 46);
  field('Department', sub.department||'-', M+60, y+6, 46);
  field('Status', first.status||'Submitted to ROM', M+108, y+6, 38);
  field('Requirement IDs', idRange, M+108, y+17, 38);
  const qr = reqQrDataUrl(`${rcpNo}|${idRange}`);
  if (qr){ doc.addImage(qr,'PNG',W-M-27,y+5,23,23); doc.setFont('helvetica','normal'); doc.setFontSize(6.5); doc.setTextColor(...GREY); doc.text('Scan to verify',W-M-15.5,y+32,{align:'center'}); }
  y += mh+5;

  /* --- summary strip --- */
  const sw=(CW-8)/3;
  [['Vehicles',nVeh],['Distinct Items',nItm],['Requirement Records',recs.length]].forEach((s,i)=>{
    const x=M+i*(sw+4); doc.setFillColor(...LIGHT); doc.roundedRect(x,y,sw,12,1.5,1.5,'F');
    doc.setFont('helvetica','bold'); doc.setFontSize(13); doc.setTextColor(...NAVY); doc.text(String(s[1]),x+4,y+8.2);
    doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GREY); doc.text(s[0],x+sw-4,y+7.6,{align:'right'});
  });
  y += 17;

  /* --- table --- */
  const cols=[['S/N',10,'c'],['Item',78,'l'],['Vehicle',66,'l'],['Qty',14,'r'],['UoM',14,'c']];
  const colX=[]; { let x=M; cols.forEach(c=>{ colX.push(x); x+=c[1]; }); }
  const runHead=()=>{ doc.setFont('helvetica','normal'); doc.setFontSize(8); doc.setTextColor(...GREY);
    doc.text(`Item Requirement Receipt  |  ${rcpNo}  (continued)`,M,12); doc.setDrawColor(...LINE); doc.line(M,14,W-M,14); };
  const tHead=()=>{ doc.setFillColor(...NAVY); doc.rect(M,y,CW,7.5,'F'); doc.setTextColor(255,255,255); doc.setFont('helvetica','bold'); doc.setFontSize(8.5);
    cols.forEach((c,i)=>{ const tx = c[2]==='c'?colX[i]+c[1]/2 : c[2]==='r'?colX[i]+c[1]-2 : colX[i]+2; doc.text(c[0],tx,y+5,{align:c[2]==='c'?'center':c[2]==='r'?'right':'left'}); });
    y+=7.5; };
  const need = h => { if (y+h > H-FOOT){ doc.addPage(); runHead(); y=20; tHead(); } };
  tHead();
  recs.forEach((r,n)=>{
    const vL = doc.splitTextToSize(T(r.vehicle_name),cols[2][1]-4);
    const iL = doc.splitTextToSize(T(r.item_name),cols[1][1]-4);
    const lines = Math.max(vL.length, iL.length+(r.item_code?1:0), 1);
    const rh = Math.max(8, lines*4.1+3.2);
    need(rh);
    if (n%2===0){ doc.setFillColor(248,250,252); doc.rect(M,y,CW,rh,'F'); }
    doc.setDrawColor(...LINE); doc.setLineWidth(.2); doc.line(M,y+rh,M+CW,y+rh);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...INK);
    doc.text(String(n+1),colX[0]+cols[0][1]/2,y+5,{align:'center'});
    doc.setFont('helvetica','bold'); doc.setFontSize(8.5); doc.text(vL,colX[2]+2,y+5);
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.setTextColor(...INK); doc.text(iL,colX[1]+2,y+5);
    if (r.item_code){ doc.setFont('courier','normal'); doc.setFontSize(7.5); doc.setTextColor(...GREY); doc.text(T(r.item_code),colX[1]+2,y+5+iL.length*4.1); }
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(String(r.required_quantity),colX[3]+cols[3][1]-2,y+5,{align:'right'});
    doc.setFont('helvetica','normal'); doc.setFontSize(8.5); doc.text(T(r.uom||'PCS'),colX[4]+cols[4][1]/2,y+5,{align:'center'});
    y+=rh;
  });
  doc.setDrawColor(...NAVY); doc.setLineWidth(.5); doc.line(M,y,M+CW,y);
  y+=6;

  /* --- description / remarks --- */
  const notes=[['Requirement Description',first.description],['Remarks',first.remarks]].filter(n=>n[1]&&String(n[1]).trim());
  notes.forEach(([lab,txt])=>{
    const ls=doc.splitTextToSize(T(String(txt).replace(/\s*\[UoM:[^\]]*\]\s*$/,'')),CW-8); const h=Math.min(ls.length,12)*4.2+11;
    need(h+2);
    doc.setDrawColor(...LINE); doc.setLineWidth(.3); doc.roundedRect(M,y,CW,h,1.5,1.5,'S');
    doc.setFont('helvetica','bold'); doc.setFontSize(7.5); doc.setTextColor(...GREY); doc.text(lab.toUpperCase(),M+4,y+5.5);
    doc.setFont('helvetica','normal'); doc.setFontSize(9); doc.setTextColor(...INK); doc.text(ls.slice(0,12),M+4,y+11);
    y+=h+4;
  });

  /* --- footer + page numbers on every page --- */
  const pages=doc.getNumberOfPages();
  for (let p=1;p<=pages;p++){
    doc.setPage(p);
    doc.setDrawColor(...LINE); doc.setLineWidth(.3); doc.line(M,H-17,W-M,H-17);
    doc.setFont('helvetica','normal'); doc.setFontSize(7); doc.setTextColor(...GREY);
    doc.text('Computer-generated receipt confirming that the requirement was submitted. Submission does not guarantee approval or delivery;',M,H-13);
    doc.text('quantities and dates remain subject to ROM review and Supply Chain scheduling.',M,H-9.6);
    doc.text(`Generated ${dt(new Date().toISOString(),true)}`,M,H-5.5);
    doc.text(`${rcpNo}   |   Page ${p} of ${pages}`,W-M,H-5.5,{align:'right'});
  }
  doc.save(`Receipt_${rcpNo}.pdf`);
  return true;
}
async function reqReceiptFor(id){
  const { data: r } = await db.from('item_requirements').select('*').eq('id', id).maybeSingle();
  if (!r){ toast('Requirement not found.','error'); return; }
  const users = await reqLoadUsers(); const u = r.submitted_by ? users.get(String(r.submitted_by)) : null;
  let maint=null;
  if (r.maintenance_id){ try{ const { data:m } = await db.from('maintenance_records').select('vehicle_name, maintenance_item').eq('id', r.maintenance_id).maybeSingle(); if(m) maint=`${m.vehicle_name} - ${m.maintenance_item}`; }catch(e){} }
  try{ if (!reqMakeReceipt([r], {submitter:u||{}, maint})) toast('PDF library not loaded. Check your internet connection.','error'); }
  catch(e){ console.error(e); toast('Could not create the receipt: '+e.message,'error'); }
}
function reqReset(){ REQ=null; return openReqForm(); }
function reqToggleForm(){
  const b=document.getElementById('reqFormBody'), h=document.getElementById('reqFormHint'), c=document.getElementById('reqFormChev'); if(!b) return;
  const hide=!b.classList.contains('hidden'); b.classList.toggle('hidden',hide);
  if(h) h.textContent = hide?'Show form':'Hide form';
  if(c){ c.setAttribute('data-lucide', hide?'chevron-down':'chevron-up'); lucide.createIcons(); }
}
async function reqAfterSave(){
  await Promise.all([ refreshRequirements(), reqReset() ]);
  
}
/* ---- Item Requirement form: searchable items, multiple items, multiple vehicles ---- */
const REQ_UOMS = ['PCS','SET','LTR','KG','M','BOX','ROLL','OTHER'];
const REQ_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let REQ = null;             // state of the currently open form
let REQ_HOST = null;        // the page element that holds the requirement list / inline form
let REQ_EXTRA_COLS = null;  // null = unknown yet; true/false once the DB has told us if item_requirements has uom / item_code
const reqAlnum = s => String(s==null?'':s).toLowerCase().replace(/[^a-z0-9]/g,'');
const reqIsUuid = v => REQ_UUID_RE.test(String(v==null?'':v));
const reqRow = uid => REQ.rows.find(r=>r.uid===uid);
const reqNewRow = () => ({uid:'ri'+(++REQ.seq), item:null, qty:'1', uom:'PCS', q:'', vq:{}, ex:{}});
const reqVehCode = v => v.code || v.registration_number || '';
const reqItemLabel = i => `${i.item_name}${i.item_code?' ('+i.item_code+')':''}`;
function reqMatch(hay, q){
  const toks = String(q||'').toLowerCase().split(/\s+/).filter(Boolean);
  if (!toks.length) return true;
  const h = String(hay||'').toLowerCase(), hn = reqAlnum(hay);
  return toks.every(t=>{ const tn = reqAlnum(t); return h.includes(t) || (tn && hn.includes(tn)); });
}

async function openReqForm(){
  const [vehicles, items] = await Promise.all([loadVehicles(), loadItems()]);
  // also list maintenance records that are "Item Requirement Pending" to optionally link
  const { data: maint } = await db.from('maintenance_records').select('*').in('status',['Maintenance Required','Item Requirement Pending','Waiting for Item Delivery']);
  REQ = { vehicles, vById:new Map(vehicles.map(v=>[String(v.id),v])), vSel:new Map(), vq:'',
          items, iById:new Map(items.map(i=>[String(i.id),i])),
          idx: items.map(i=>{ const t=`${i.item_name||''} ${i.item_code||''} ${i.item_category||''}`; return {i, n:String(i.item_name||'').toLowerCase(), h:t.toLowerCase(), hn:reqAlnum(t)}; }),
          maint: maint||[], rows:[], seq:0 };
  REQ.rows.push(reqNewRow());
  const inp = 'w-full border border-slate-300 rounded-lg px-3 py-2';
  const host = document.getElementById('reqFormHost'); if (!host) return;
  host.innerHTML = `<div class="bg-white border border-slate-200 rounded-xl shadow-sm">
    <div class="px-5 py-3 font-semibold text-navy-900">New Item Requirement</div>
    <div id="reqFormBody" class="px-5 pb-5 border-t border-slate-100 pt-4">
<form id="reqForm" onsubmit="return false" class="grid grid-cols-1 gap-4 text-sm">
     <div >
       <label class="block mb-1 font-medium">Vehicle(s) * <span id="r_vcount" class="ml-1 text-xs font-normal text-slate-500"></span></label>
       <div class="border border-slate-300 rounded-lg">
         <div class="p-2 flex flex-col sm:flex-row gap-2 border-b border-slate-200">
           <input id="r_vsearch" type="text" autocomplete="off" placeholder="Search vehicle name or code…" oninput="reqVehSearch(this.value)" class="flex-1 min-w-0 ${inp}"/>
           <div class="flex gap-2">
             <button type="button" onclick="reqVehAll()" class="flex-1 sm:flex-none px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap">Select All</button>
             <button type="button" onclick="reqVehClear()" class="flex-1 sm:flex-none px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg hover:bg-slate-50 whitespace-nowrap">Clear Selection</button>
           </div>
         </div>
         <div id="r_vlist" class="max-h-64 overflow-y-auto scroll-thin p-2 grid grid-cols-1 gap-1.5"></div>
       </div>
       <div id="r_vsel" class="mt-2"></div>
     </div>
     <div >
       <label class="block mb-1 font-medium">Items *</label>
       <div id="r_items" class="space-y-3"></div>
       <button type="button" onclick="reqAddRow()" class="mt-3 w-full sm:w-auto px-3 py-2 text-sm font-medium border border-teal-600 text-teal-700 hover:bg-teal-50 rounded-lg flex items-center justify-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Add Another Item</button>
       <div id="r_summary" class="mt-2 text-xs text-slate-500"></div>
     </div>
     <div>
       <label class="block mb-1 font-medium">PR Number</label>
       <input id="r_pr" class="${inp}"/>
     </div>
     <div >
       <label class="block mb-1 font-medium">Link to Maintenance (optional)</label>
       <select id="r_maint" class="${inp}">
         <option value="">— None —</option>
         ${(maint||[]).map(m=>`<option value="${m.id}">${escapeHtml(m.vehicle_name)} · ${escapeHtml(m.maintenance_item)}</option>`).join('')}
       </select>
     </div>
     <div >
       <label class="block mb-1 font-medium">Requirement Description</label>
       <textarea id="r_desc" rows="2" class="${inp}"></textarea>
     </div>
     <div >
       <label class="block mb-1 font-medium">Remarks</label>
       <textarea id="r_remarks" rows="2" class="${inp}"></textarea>
     </div>
   </form>
      <div class="flex justify-end gap-2 mt-4">
        <button type="button" onclick="reqReset()" class="px-4 py-2 text-sm border border-slate-300 bg-white rounded-lg hover:bg-slate-50">Clear Form</button>
        <button id="reqSubmitBtn" type="button" onclick="saveReq()" class="px-5 py-2 text-sm font-medium bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Submit</button>
      </div>
    </div>
  </div>`;
  lucide.createIcons();
  const fm=document.getElementById('reqForm'); if(fm){ fm.addEventListener('input',reqRenderPreview); fm.addEventListener('change',reqRenderPreview); }
  reqRenderVehicles(); reqRenderItems(); reqRenderPreview();
}

/* ---------- vehicles ---------- */
function reqVehFiltered(){ return REQ.vehicles.filter(v=>reqMatch(v.vehicle_name+' '+reqVehCode(v), REQ.vq)); }
function reqRenderVehicles(){
  const host = document.getElementById('r_vlist'); if (!host || !REQ) return;
  host.innerHTML = reqVehFiltered().map(v=>`<label class="perm-chip flex items-center gap-2 text-sm">
      <input type="checkbox" ${REQ.vSel.has(String(v.id))?'checked':''} data-vid="${escapeHtml(String(v.id))}" onchange="reqVehToggle(this.dataset.vid,this.checked)"/>
      <span class="min-w-0"><span class="block truncate">${escapeHtml(v.vehicle_name)}</span><span class="block text-[11px] font-mono text-slate-500 font-normal">${escapeHtml(reqVehCode(v))}</span></span>
    </label>`).join('') || `<div class="col-span-full text-center text-slate-400 py-4">No vehicles match your search.</div>`;
  reqRenderVehSel();
}
function reqRenderVehSel(){
  const host = document.getElementById('r_vsel'); if (!host || !REQ) return;
  const arr = [...REQ.vSel.values()];
  const cnt = document.getElementById('r_vcount'); if (cnt) cnt.textContent = arr.length ? `(${arr.length} selected)` : '';
  host.innerHTML = arr.length
    ? `<div class="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto scroll-thin">${arr.map(v=>`<span class="inline-flex items-center gap-1 bg-teal-50 text-teal-700 border border-teal-200 rounded-full pl-2.5 pr-1 py-0.5 text-xs font-medium">${escapeHtml(v.vehicle_name)} · <span class="font-mono">${escapeHtml(reqVehCode(v))}</span><button type="button" data-vid="${escapeHtml(String(v.id))}" onclick="reqVehRemove(this.dataset.vid)" class="w-4 h-4 rounded-full hover:bg-teal-200 flex items-center justify-center leading-none" title="Remove" aria-label="Remove vehicle">&times;</button></span>`).join('')}</div>`
    : `<div class="text-xs text-slate-400">No vehicle selected yet.</div>`;
  reqUpdateSummary(); reqRenderAllVq();
}
function reqVehToggle(id,on){ const v=REQ.vById.get(String(id)); if(!v) return; if(on) REQ.vSel.set(String(id),v); else REQ.vSel.delete(String(id)); reqRenderVehSel(); }
function reqVehRemove(id){ REQ.vSel.delete(String(id)); reqRenderVehicles(); }
function reqVehSearch(q){ REQ.vq=q; reqRenderVehicles(); }
function reqVehAll(){ reqVehFiltered().forEach(v=>REQ.vSel.set(String(v.id),v)); reqRenderVehicles(); }   // selects everything matching the current search
function reqVehClear(){ REQ.vSel.clear(); reqRenderVehicles(); }

/* ---------- items ---------- */
function reqRenderItems(){
  const host = document.getElementById('r_items'); if (!host || !REQ) return;
  const cls = 'w-full border border-slate-300 rounded-lg px-3 py-2 bg-white';
  host.innerHTML = REQ.rows.map((r,n)=>{
    const uoms = REQ_UOMS.includes(r.uom) ? REQ_UOMS : REQ_UOMS.concat(r.uom);
    return `<div data-card="${r.uid}" class="rounded-lg border border-slate-200 bg-slate-50 p-3 transition">
      <div class="flex items-center justify-between mb-2">
        <span class="text-xs font-semibold text-slate-600">Item ${n+1}</span>
        <button type="button" onclick="reqRemoveRow('${r.uid}')" class="text-slate-400 hover:text-red-600 p-1" title="Remove this item" aria-label="Remove item"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
      </div>
      <div class="relative">
        <input id="ri_q_${r.uid}" type="text" autocomplete="off" placeholder="Type to search item name or code…" value="${escapeHtml(r.item?reqItemLabel(r.item):r.q)}"
          oninput="reqItemType('${r.uid}',this)" onfocus="reqItemFocus('${r.uid}',this)" onblur="reqItemBlur('${r.uid}')" class="${cls}"/>
        <div id="ri_dd_${r.uid}" class="hidden absolute z-20 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-56 overflow-y-auto scroll-thin"></div>
      </div>
      <div class="grid grid-cols-2 gap-3 mt-3">
        <div><label class="block mb-1 text-xs font-medium">Quantity *</label>
          <input id="ri_qty_${r.uid}" type="number" min="0.01" step="0.01" value="${escapeHtml(r.qty)}" oninput="reqSetField('${r.uid}','qty',this.value)" class="${cls}"/></div>
        <div><label class="block mb-1 text-xs font-medium">UoM *</label>
          <select id="ri_uom_${r.uid}" onchange="reqSetField('${r.uid}','uom',this.value)" class="${cls}">${uoms.map(u=>`<option value="${escapeHtml(u)}" ${u===r.uom?'selected':''}>${escapeHtml(u)}</option>`).join('')}</select></div>
      </div>
      <div id="ri_vq_${r.uid}" class="mt-3"></div>
    </div>`;
  }).join('');
  lucide.createIcons(); reqUpdateSummary(); reqRenderAllVq();
}
function reqSetField(uid,f,val){ const r=reqRow(uid); if(r){ r[f]=val; if(f==='qty'||f==='uom') reqSyncVq(uid); } }
function reqItemType(uid,el){ const r=reqRow(uid); if(!r) return; r.item=null; r.q=el.value; reqShowDD(uid); reqUpdateSummary(); }
function reqItemFocus(uid,el){ const r=reqRow(uid); if(!r) return; if(r.item) el.select(); else reqShowDD(uid); }
function reqItemBlur(uid){
  setTimeout(()=>{
    const dd=document.getElementById('ri_dd_'+uid); if(dd) dd.classList.add('hidden');
    const r=reqRow(uid), inp=document.getElementById('ri_q_'+uid);
    if (r && r.item && inp) inp.value = reqItemLabel(r.item);   // undo half-finished edits of a chosen item
  },200);
}
function reqShowDD(uid){
  const r=reqRow(uid), dd=document.getElementById('ri_dd_'+uid); if(!r||!dd) return;
  const q=(r.q||'').trim();
  if (!q){
    dd.innerHTML = `<div class="px-3 py-2 text-xs text-slate-500">Type an item name or code to search ${REQ.idx.length.toLocaleString()} items…</div>`;
  } else {
    const taken = new Set(REQ.rows.filter(x=>x.uid!==uid && x.item).map(x=>String(x.item.id)));
    const ql=q.toLowerCase(), toks=ql.split(/\s+/).filter(Boolean), tns=toks.map(reqAlnum);
    const hits=[];
    for (const e of REQ.idx){
      let ok=true;
      for (let k=0;k<toks.length;k++){ if(!(e.h.includes(toks[k]) || (tns[k] && e.hn.includes(tns[k])))){ ok=false; break; } }
      if (ok) hits.push(e);
    }
    const score = e => e.n.startsWith(ql)?0 : e.n.includes(ql)?1 : 2;
    hits.sort((a,b)=>score(a)-score(b) || (a.n<b.n?-1:a.n>b.n?1:0));
    const shown=hits.slice(0,30);
    dd.innerHTML = shown.length
      ? shown.map(e=>{ const i=e.i, t=taken.has(String(i.id));
          return `<button type="button" ${t?'disabled':''} data-uid="${r.uid}" data-iid="${escapeHtml(String(i.id))}" onclick="reqPickItem(this.dataset.uid,this.dataset.iid)" class="block w-full text-left px-3 py-2 border-b border-slate-100 last:border-0 ${t?'opacity-50 cursor-not-allowed':'hover:bg-teal-50'}">
            <span class="block text-sm font-medium text-slate-800">${escapeHtml(i.item_name)}</span>
            <span class="block text-[11px] text-slate-500">${escapeHtml(i.item_code||'')}${i.item_category?' · '+escapeHtml(i.item_category):''} · ${escapeHtml(i.unit||'')}${i.status==='Inactive'?' · Inactive':''}${t?' · Already added':''}</span></button>`; }).join('')
        + (hits.length>shown.length ? `<div class="px-3 py-2 text-xs text-slate-500 bg-slate-50">Showing ${shown.length} of ${hits.length} matches — keep typing to narrow down.</div>` : '')
      : `<div class="px-3 py-2 text-xs text-slate-500">No items match “${escapeHtml(q)}”.</div>`;
  }
  dd.classList.remove('hidden');
  if (dd.scrollIntoView) dd.scrollIntoView({block:'nearest'});
}
function reqPickItem(uid,iid){
  const r=reqRow(uid), it=REQ.iById.get(String(iid)); if(!r||!it) return;
  if (REQ.rows.some(x=>x.uid!==uid && x.item && String(x.item.id)===String(it.id))){ toast('This item is already added.','error'); return; }
  r.item=it; r.q=''; r.uom = it.unit || r.uom || 'PCS';
  reqRenderItems();
  const el=document.getElementById('ri_qty_'+uid); if(el){ el.focus(); el.select(); }
}
function reqAddRow(){
  const empty=REQ.rows.find(r=>!r.item);
  if (empty){ toast('Select an item in the empty row first.','error'); const el=document.getElementById('ri_q_'+empty.uid); if(el) el.focus(); return; }
  const r=reqNewRow(); REQ.rows.push(r); reqRenderItems();
  const el=document.getElementById('ri_q_'+r.uid); if(el){ el.scrollIntoView({block:'center',behavior:'smooth'}); el.focus(); }
}
function reqRemoveRow(uid){
  if (REQ.rows.length===1) REQ.rows[0]=reqNewRow(); else REQ.rows=REQ.rows.filter(r=>r.uid!==uid);
  reqRenderItems();
}

/* ---------- quantity per vehicle (editable; defaults to the item's Quantity) ---------- */
const reqVqVal=(r,v)=>{ if(r.ex[String(v.id)]) return '0'; const o=r.vq[String(v.id)]; return o!==undefined?o:r.qty; };   // removed vehicle = 0 = skipped
function reqRenderAllVq(){ if(!REQ) return; REQ.rows.forEach(r=>reqRenderVq(r.uid)); }
function reqRenderVq(uid){
  const host=document.getElementById('ri_vq_'+uid), r=reqRow(uid); if(!host||!r) return;
  const vs=[...REQ.vSel.values()];
  if(vs.length<2){ host.innerHTML=''; return; }
  const on=vs.filter(v=>!r.ex[String(v.id)]), off=vs.filter(v=>r.ex[String(v.id)]);
  host.innerHTML=`<div class="text-xs font-medium mb-1">Quantity per vehicle <span class="font-normal text-slate-500">(editable &middot; use the bin to remove a vehicle that does not need this item &middot; changing Quantity above updates vehicles you have not edited)</span></div>
   <div class="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 max-h-56 overflow-y-auto scroll-thin">${on.map(v=>`<div class="flex items-center gap-2 px-3 py-1.5"><div class="min-w-0 flex-1"><div class="truncate text-sm">${escapeHtml(v.vehicle_name)}</div><div class="text-[11px] font-mono text-slate-500">${escapeHtml(reqVehCode(v))}</div></div><input type="number" min="0" step="0.01" data-vq="${uid}" data-vid="${escapeHtml(String(v.id))}" value="${escapeHtml(reqVqVal(r,v))}" oninput="reqSetVq('${uid}',this.dataset.vid,this.value)" class="w-24 border border-slate-300 rounded-lg px-2 py-1 text-right"/>${on.length>1?`<button type="button" data-vid="${escapeHtml(String(v.id))}" onclick="reqVqRemove('${uid}',this.dataset.vid)" class="text-slate-400 hover:text-red-600 p-1" title="Remove this vehicle from this item" aria-label="Remove vehicle from this item"><i data-lucide="trash-2" class="w-4 h-4 pointer-events-none"></i></button>`:''}</div>`).join('')}</div>
   ${off.length?`<div class="mt-2 text-xs text-slate-500">Not needed for this item (tap to add back):${off.map(v=>`<button type="button" data-vid="${escapeHtml(String(v.id))}" onclick="reqVqRestore('${uid}',this.dataset.vid)" class="ml-1 mb-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-slate-300 hover:bg-slate-50">+ ${escapeHtml(v.vehicle_name)}</button>`).join('')}</div>`:''}
   <div id="ri_vqt_${uid}" class="mt-1 text-xs text-slate-500"></div>`;
  lucide.createIcons(); reqVqTotal(uid);
}
function reqVqRemove(uid,vid){ const r=reqRow(uid); if(!r) return; if([...REQ.vSel.values()].filter(v=>!r.ex[String(v.id)]).length<2) return; r.ex[vid]=true; reqRenderVq(uid); reqUpdateSummary(); }
function reqVqRestore(uid,vid){ const r=reqRow(uid); if(!r) return; delete r.ex[vid]; reqRenderVq(uid); reqUpdateSummary(); }
function reqVqTotal(uid){ const r=reqRow(uid), t=document.getElementById('ri_vqt_'+uid); if(!r||!t) return; const tot=[...REQ.vSel.values()].reduce((a,v)=>a+(parseFloat(reqVqVal(r,v))||0),0); t.textContent=`Total: ${+tot.toFixed(2)} ${r.uom}`; }
function reqSetVq(uid,vid,val){ const r=reqRow(uid); if(!r) return; r.vq[vid]=val; reqVqTotal(uid); reqUpdateSummary(); }
function reqSyncVq(uid){ const r=reqRow(uid); if(!r) return; document.querySelectorAll(`input[data-vq="${uid}"]`).forEach(i=>{ if(r.vq[i.dataset.vid]===undefined) i.value=r.qty; }); reqVqTotal(uid); }

/* ---------- live preview of the PDF receipt (right side of the submission page) ---------- */
function reqRenderPreview(){
  const host=document.getElementById('reqPreview'); if(!host||!REQ) return;
  const E=escapeHtml, g=id=>{ const e=document.getElementById(id); return e?e.value.trim():''; };
  const vl=[...REQ.vSel.values()], its=REQ.rows.filter(r=>r.item), recs=[];
  vl.forEach(v=>its.forEach(r=>{ const q=parseFloat(reqVqVal(r,v)); if(q>0) recs.push({v,r,q}); }));
  const u=currentUser||{}, mSel=document.getElementById('r_maint'), maint=mSel&&mSel.value?mSel.options[mSel.selectedIndex].text:'None';
  const now=new Date().toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'});
  const f=(l,v)=>`<div class="min-w-0"><div class="text-[9px] tracking-wide uppercase text-slate-500">${l}</div><div class="text-xs font-bold text-slate-800 break-words">${E(v||'-')}</div></div>`;
  const tile=(l,n)=>`<div class="rounded-md bg-slate-100 px-3 py-2 flex items-center justify-between"><span class="text-lg font-bold text-navy-900">${n}</span><span class="text-[11px] text-slate-500">${l}</span></div>`;
  const note=(l,t)=>t?`<div class="border border-slate-300 rounded-md p-3 mt-3"><div class="text-[10px] font-bold uppercase text-slate-500 mb-1">${l}</div><div class="text-xs text-slate-800 whitespace-pre-wrap break-words">${E(t)}</div></div>`:'';
  const logo=(typeof APP_LOGO!=='undefined'&&APP_LOGO)?`<img src="${APP_LOGO}" alt="" class="w-10 h-10 rounded-md bg-white object-contain"/>`:`<div class="w-10 h-10 rounded-md bg-teal-600 text-white font-bold flex items-center justify-center text-sm">VM</div>`;
  const rows=recs.map((x,n)=>`<tr class="${n%2?'':'bg-slate-50'} border-b border-slate-200"><td class="px-2 py-1.5 text-center">${n+1}</td><td class="px-2 py-1.5">${E(x.r.item.item_name)}${x.r.item.item_code?`<div class="font-mono text-[10px] text-slate-500">${E(x.r.item.item_code)}</div>`:''}</td><td class="px-2 py-1.5 font-bold">${E(x.v.vehicle_name)}</td><td class="px-2 py-1.5 text-right font-bold">${+x.q.toFixed(2)}</td><td class="px-2 py-1.5 text-center">${E(x.r.uom||'PCS')}</td></tr>`).join('')
    || `<tr><td colspan="5" class="px-2 py-6 text-center text-slate-400">Select vehicles and items to see them in the receipt.</td></tr>`;
  host.innerHTML=`<div class="flex items-center justify-between mb-2"><h3 class="text-sm font-semibold text-navy-900">PDF Receipt Preview</h3><span class="text-xs text-slate-400">Updates as you fill the form</span></div>
   <div class="bg-white border border-slate-300 rounded-lg shadow-sm overflow-hidden text-slate-800">
    <div class="bg-navy-900 text-white px-5 py-4 flex items-center gap-3 flex-wrap">${logo}<div class="min-w-0"><div class="font-bold text-sm">XiC (Automobile)</div><div class="text-[11px] opacity-90">Concept of ROM</div></div>
      <div class="ml-auto text-right"><div class="font-bold text-sm sm:text-base">ITEM REQUIREMENT RECEIPT</div><div class="text-[11px] opacity-90">Acknowledgement of requisition submission</div></div></div>
    <div class="h-1 bg-teal-600"></div>
    <div class="p-5">
     <div class="border border-slate-300 rounded-md p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">${f('Receipt No.','Assigned on submit')}${f('Department',u.department)}${f('Status','Submitted to ROM')}${f('Date & Time',now)}${f('Submitted By',u.full_name||u.email)}${f('Requirement IDs','Assigned on submit')}</div>
     <div class="grid grid-cols-3 gap-2 mt-3">${tile('Vehicles',new Set(recs.map(x=>x.v.id)).size)}${tile('Distinct Items',new Set(recs.map(x=>x.r.item.id)).size)}${tile('Requirement Records',recs.length)}</div>
     <div class="mt-3 overflow-x-auto"><table class="w-full text-xs min-w-[420px]"><thead><tr class="bg-navy-900 text-white text-left"><th class="px-2 py-1.5 text-center w-10">S/N</th><th class="px-2 py-1.5">Item</th><th class="px-2 py-1.5">Vehicle</th><th class="px-2 py-1.5 text-right">Qty</th><th class="px-2 py-1.5 text-center">UoM</th></tr></thead><tbody>${rows}</tbody></table><div class="border-t-2 border-navy-900"></div></div>
     ${note('Requirement Description',g('r_desc'))}${note('Remarks',g('r_remarks'))}
     <div class="mt-5 pt-2 border-t border-slate-300 text-[9px] text-slate-500 leading-snug">Computer-generated receipt confirming that the requirement was submitted. Submission does not guarantee approval or delivery; quantities and dates remain subject to ROM review and Supply Chain scheduling.</div>
    </div></div>`;
}
function reqUpdateSummary(){
  const el=document.getElementById('r_summary'); if(!el||!REQ) return;
  const vl=[...REQ.vSel.values()], v=vl.length, its=REQ.rows.filter(r=>r.item), i=its.length, n=its.reduce((a,r)=>a+vl.filter(x=>parseFloat(reqVqVal(r,x))>0).length,0);
  reqRenderPreview();
  el.textContent = n ? `${v} vehicle${v>1?'s':''} × ${i} item${i>1?'s':''} = ${n} requirement record${n>1?'s':''} will be created.` : 'Select at least one vehicle and one item.';
}

/* ---------- save ---------- */
/* One submission = one request number: DDMMYY + 4-digit daily sequence (e.g. 1911260001). All vehicle x item records of a submission share it. */
async function reqNextSubmissionId(){
  const d=new Date(), p=n=>String(n).padStart(2,'0');
  const prefix = p(d.getDate())+p(d.getMonth()+1)+p(d.getFullYear()%100);
  let seq=0;
  const { data, error } = await db.from('item_requirements').select('requirement_id').like('requirement_id', prefix+'%').order('requirement_id',{ascending:false}).limit(50);
  if (error) throw error;
  (data||[]).forEach(r=>{ const m=/^(\d{6})(\d{4})$/.exec(String(r.requirement_id||'')); if(m && m[1]===prefix) seq=Math.max(seq,parseInt(m[2],10)); });
  return prefix + String(seq+1).padStart(4,'0');
}
const reqIsMissingCol = e => e && (e.code==='PGRST204' || e.code==='42703' || /could not find the .* column|column .* does not exist/i.test(e.message||''));
let REQ_NEED_FB=false;   // the DB still has need_by_date NOT NULL: fill it silently (the field is no longer shown anywhere)
async function reqInsertOne(p){
  if (REQ_NEED_FB) p={...p, need_by_date:new Date().toLocaleDateString('en-CA')};
  /* item_code / uom are stored when the table has those columns; otherwise UoM is appended to the description */
  const strip = o => { const c={...o}; delete c.uom; delete c.item_code; c.description=((o.description||'')+' [UoM: '+o.uom+']').trim(); return c; };
  let res = await db.from('item_requirements').insert(REQ_EXTRA_COLS===false?strip(p):p).select().single();
  if (res.error && REQ_EXTRA_COLS!==false && reqIsMissingCol(res.error)){
    REQ_EXTRA_COLS=false;
    res = await db.from('item_requirements').insert(strip(p)).select().single();
  } else if (!res.error && REQ_EXTRA_COLS===null) REQ_EXTRA_COLS=true;
  if (res.error && !REQ_NEED_FB && /need_by_date/i.test(res.error.message||'')){ REQ_NEED_FB=true; return reqInsertOne(p); }
  return res;
}
function reqSameVehicle(m,v){
  return !!m && (String(m.vehicle_id)===String(v.id) || (m.registration_number && m.registration_number===reqVehCode(v)) || m.vehicle_name===v.vehicle_name);
}
/* The vehicle list comes from vehicle_master, whose ids are not UUIDs, so item_requirements.vehicle_id / item_id
   cannot hold them (they are saved by name + code instead). If those columns are still NOT NULL, show the one-time fix. */
function reqShowDbFix(col){
  const sql = col==='requirement_trigger' ? 'select t.tgname, pg_get_functiondef(t.tgfoid) as definition from pg_trigger t where t.tgrelid = \'public.item_requirements\'::regclass and not t.tgisinternal;  -- copy the result and send it to Claude' : col==='requirement_id' ? 'alter table public.item_requirements drop constraint if exists item_requirements_requirement_id_key;' : 'alter table public.item_requirements alter column vehicle_id drop not null, alter column item_id drop not null;';
  const old=document.getElementById('reqDbFix'); if(old) old.remove();
  const host=document.getElementById('r_summary'); if(!host) { toast('Database setting needed: '+sql,'error'); return; }
  host.insertAdjacentHTML('afterend',`<div id="reqDbFix" class="mt-2 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
    <b>${col==='requirement_trigger'?'Saved with the old number — one-time database fix needed.':'Nothing was saved — one-time database fix needed.'}</b> ${col==='requirement_trigger'?'The database is overwriting the request number with its own (old REQ-…) numbering through a trigger.':col==='requirement_id'?'The request number is now shared by all records of one submission, but the table still requires <code>requirement_id</code> to be unique.':'The table still requires <code>'+escapeHtml(col)+'</code>, but vehicles/items here are saved by name and code.'}
    ${col==='requirement_trigger'?'This submission was saved with the old number, so do not submit it again. Run this in the Supabase SQL editor and send the result:':'Run this once in the Supabase SQL editor, then press Submit again (existing data is not affected):'}
    <pre class="mt-1.5 p-2 bg-white border border-red-200 rounded overflow-x-auto whitespace-pre-wrap select-all">${escapeHtml(sql)}</pre>
    <button type="button" class="mt-1 text-teal-700 font-medium hover:underline" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>toast('SQL copied','success'))">Copy SQL</button></div>`);
  const b=document.getElementById('reqDbFix'); if(b) b.scrollIntoView({block:'center',behavior:'smooth'});
}
async function saveReq(){
  if (!REQ) return;
  const vehs=[...REQ.vSel.values()];
  if (!vehs.length){ toast('Select at least one vehicle.','error'); const el=document.getElementById('r_vsearch'); if(el) el.focus(); return; }
  const seen=new Set();
  for (let n=0;n<REQ.rows.length;n++){
    const r=REQ.rows[n];
    const bad=(msg,fid)=>{ toast(`Item ${n+1}: ${msg}`,'error');
      const card=document.querySelector(`[data-card="${r.uid}"]`);
      if(card){ card.classList.add('ring-2','ring-red-400'); card.scrollIntoView({block:'center',behavior:'smooth'}); setTimeout(()=>card.classList.remove('ring-2','ring-red-400'),2500); }
      const f=document.getElementById(fid+r.uid); if(f) f.focus(); };
    if (!r.item){ bad('select an item from the search results.','ri_q_'); return; }
    if (!(parseFloat(r.qty)>0)){ bad('enter a valid quantity.','ri_qty_'); return; }
    if (!r.uom){ bad('select a UoM.','ri_uom_'); return; }
    for (const v of vehs){ if (!(parseFloat(reqVqVal(r,v))>=0)){ bad(`enter a quantity for ${v.vehicle_name} (use 0 to skip it).`,'ri_qty_'); return; } }
    if (!vehs.some(v=>parseFloat(reqVqVal(r,v))>0)){ bad('quantity is 0 for every vehicle.','ri_qty_'); return; }
    const key=String(r.item.id);
    if (seen.has(key)){ bad('this item is added more than once.','ri_q_'); return; }
    seen.add(key);
  }
  const maintId=document.getElementById('r_maint').value || null;
  const maintRec=maintId ? REQ.maint.find(m=>String(m.id)===String(maintId)) : null;
  const pr=document.getElementById('r_pr').value.trim()||null;
  const desc=document.getElementById('r_desc').value.trim();
  const remarks=document.getElementById('r_remarks').value.trim();
  let submissionId;
  try{ submissionId = await reqNextSubmissionId(); }catch(e){ toast('Could not generate the request number: '+(e.message||e),'error'); return; }
  const payloads=[];
  vehs.forEach(v=>{
    const link = maintId && (vehs.length===1 || reqSameVehicle(maintRec,v)) ? maintId : null;  // with several vehicles, link only the maintenance record's own vehicle
    REQ.rows.forEach(r=>{ if(!(parseFloat(reqVqVal(r,v))>0)) return; payloads.push({
      requirement_id: submissionId,
      /* numeric ids from the master tables cannot go into uuid columns (the "invalid input syntax for type uuid" error);
         the vehicle / item are still stored by name, code and registration number */
      vehicle_id: reqIsUuid(v.id)?v.id:null,
      vehicle_name: v.vehicle_name,
      registration_number: reqVehCode(v),
      item_id: reqIsUuid(r.item.id)?r.item.id:null,
      item_name: r.item.item_name,
      item_code: r.item.item_code||null,
      required_quantity: parseFloat(reqVqVal(r,v)),
      uom: r.uom,
      pr_number: pr,
      description: desc,
      remarks,
      submitted_by: currentUser.id,
      maintenance_id: link,
      status: 'Submitted to ROM'
    }); });
  });
  const btn=document.getElementById('reqSubmitBtn'); if(btn){ btn.disabled=true; btn.textContent='Submitting…'; }
  const created=[];
  try{
    for (const p of payloads){
      const { data, error } = await reqInsertOne(p);
      if (error) throw error;
      created.push(data);
    }
  }catch(error){
    let msg=error.message||'Could not save the requirement.';
    if (created.length){   // all-or-nothing: undo what was already saved in this submission
      const { data:del, error:de } = await db.from('item_requirements').delete().in('id', created.map(c=>c.id)).select('id');
      msg += (de || !del || del.length!==created.length) ? ` (${created.length} record(s) were saved before the error — please check the list.)` : ' Nothing was saved.';
    }
    if (btn){ btn.disabled=false; btn.textContent='Submit'; }
    const nn = /null value in column "(vehicle_id|item_id)"/i.exec(error.message||'');
    if (/need_by_date/i.test(error.message||'')){ toast('Database setting needed: run  alter table public.item_requirements alter column need_by_date drop not null;  in the Supabase SQL editor, then submit again.','error'); return; }
    if (error.code==='23505' || /duplicate key|unique/i.test(error.message||'')){ reqShowDbFix('requirement_id'); return; }
    if (error.code==='23502' || nn){ reqShowDbFix(nn?nn[1]:'vehicle_id'); return; }
    toast(msg,'error'); return;
  }
  /* If the database (a trigger / default) replaced the number with its own REQ-xxxx, write ours back. */
  if (created.some(c=>c.requirement_id!==submissionId)){
    const { data:fixed, error:fe } = await db.from('item_requirements').update({requirement_id: submissionId}).in('id', created.map(c=>c.id)).select('id, requirement_id');
    if (!fe && fixed && fixed.length===created.length){ created.forEach(c=>{ c.requirement_id=submissionId; }); }
    else { console.error('Could not set request number', fe, fixed); reqShowDbFix('requirement_trigger'); }
  }
  const linked=created.find(c=>c.maintenance_id);
  if (linked) await db.from('maintenance_records').update({status:'Item Requirement Pending', item_requirement_id: linked.id}).eq('id', linked.maintenance_id);
  await Promise.all(created.map(c=>logActivity('CREATE_ITEM_REQUIREMENT','item_requirements', c.id, `${c.requirement_id} - ${c.item_name} x${c.required_quantity}${c.uom?' '+c.uom:''}`)));
  const recs = created.map((c,i)=>({...payloads[i], ...c, uom: c.uom||payloads[i].uom, item_code: c.item_code||payloads[i].item_code}));
  let pdfOk=false;
  try{ pdfOk = reqMakeReceipt(recs, {submitter: currentUser, maint: maintRec ? `${maintRec.vehicle_name} - ${maintRec.maintenance_item}` : null}); }catch(e){ console.error('Receipt error',e); }
  const base = created.length===1 ? `Submitted: ${created[0].requirement_id}` : `Submitted request ${created[0].requirement_id} (${created.length} records)`;
  if (created[0].requirement_id!==submissionId) console.warn('Database replaced the request number', submissionId, '->', created[0].requirement_id);
  toast(base + (pdfOk ? '. PDF receipt downloaded.' : '. (Receipt not generated - use the receipt icon in the list.)'),'success');
  reqAfterSave();
}

async function viewReq(id){
  const { data: r } = await db.from('item_requirements').select('*').eq('id', id).maybeSingle();
  if (!r){ toast('Not found','error'); return; }
  const { data: rom } = await db.from('rom_reviews').select('*').eq('requirement_id', id).order('reviewed_at',{ascending:false}).limit(1).maybeSingle();
  const { data: sc } = await db.from('supply_chain_schedules').select('*').eq('requirement_id', id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  const _users = await reqLoadUsers(), _su = r.submitted_by ? _users.get(String(r.submitted_by)) : null;
  const info = [
    ['Requirement ID', r.requirement_id],
    ['Vehicle', `${r.vehicle_name} (${r.registration_number})`],
    ['Item', r.item_name],
    ['Required Quantity', escapeHtml(r.required_quantity+(r.uom?' '+r.uom:''))],
    ['PR Number', r.pr_number||'—'],
    ['Description', r.description||'—'],
    ['Remarks', r.remarks||'—'],
    ['Submitted By', _su ? escapeHtml((_su.full_name||'')+(_su.email?' · '+_su.email:'')) : '—'],
    ['Submission Date', fmtDateTime(r.submission_date)],
    ['Status', badge(r.status)],
  ];
  if (rom){ info.push(['Proposed Quantity (ROM)', rom.proposed_quantity + (rom.remarks?` · <span class="text-slate-500 text-xs">${escapeHtml(rom.remarks)}</span>`:'')]); }
  if (sc){
    info.push(['Expected Delivery', fmtDate(sc.expected_delivery_date)]);
    info.push(['Confirmed Delivery Qty', sc.confirmed_delivery_qty||'—']);
    info.push(['Delivery Status', badge(sc.delivery_status)]);
    info.push(['SC Remarks', sc.remarks||'—']);
  }
  openModal('Requirement Details', `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">${info.map(([k,v])=>`<div class="bg-slate-50 rounded p-3"><div class="text-xs text-slate-500">${k}</div><div class="font-medium mt-1">${v}</div></div>`).join('')}</div>
  `);
  lucide.createIcons();
}

