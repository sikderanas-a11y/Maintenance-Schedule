/* page module (original lines 1827-1926) */
/* ============================================================
   ROM
   ============================================================ */
ROUTES.rom = async (host)=>{
  host.innerHTML = `<div id="romWrap"><div class="text-slate-400 text-sm">Loading…</div></div>`;
  await refreshROM();
};
async function refreshROM(){
  const wrap = document.getElementById('romWrap'); if (!wrap) return;
  const { data, error } = await db.from('item_requirements').select('*')
    .in('status',['Submitted to ROM','Submitted to Supply Chain','Scheduled','Delivered'])
    .order('submission_date',{ascending:false});
  if (error){ wrap.innerHTML = `<div class="text-red-600 text-sm">${escapeHtml(error.message)}</div>`; return; }
  // pull rom_reviews
  const ids = (data||[]).map(d=>d.id);
  let romMap = {};
  if (ids.length){
    const { data: roms } = await db.from('rom_reviews').select('*').in('requirement_id', ids).order('reviewed_at',{ascending:false});
    (roms||[]).forEach(r=>{ if(!romMap[r.requirement_id]) romMap[r.requirement_id]=r; });
  }
  const rows = (data||[]).map(r=>{
    const rom = romMap[r.id];
    const proposed = rom?rom.proposed_quantity:r.required_quantity;
    return `<tr>
      <td class="px-4 py-2 font-mono text-xs">${escapeHtml(r.requirement_id)}</td>
      <td class="px-4 py-2">${escapeHtml(r.vehicle_name)}</td>
      <td class="px-4 py-2">${escapeHtml(r.item_name)}</td>
      <td class="px-4 py-2">${r.required_quantity}</td>
      <td class="px-4 py-2 font-semibold">${proposed}</td>
        <td class="px-4 py-2">${escapeHtml(r.pr_number||'—')}</td>
      <td class="px-4 py-2">${fmtDateTime(r.submission_date)}</td>
      <td class="px-4 py-2">${badge(r.status)}</td>
      <td class="px-4 py-2 whitespace-nowrap">
        ${r.status==='Submitted to ROM'?
          `<button onclick="openROMReview('${r.id}')" class="text-teal-700 hover:underline text-xs">Review</button>`
          : `<button onclick="viewROM('${r.id}')" class="text-slate-600 hover:underline text-xs">View</button>`}
      </td>
    </tr>`;
  }).join('') || emptyRow(10,'No requirements pending ROM review.');
  wrap.innerHTML = tableCard('ROM – Requirement & Order Management',
    ['Req ID','Vehicle','Item','Required Qty','Proposed Qty','PR No.','Submitted','Status','Actions'], rows,
    {toolbar:`<input placeholder="Search…" onkeyup="filterROMTable(this.value)" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48"/>`});
  lucide.createIcons();
}
function filterROMTable(q){
  q=q.toLowerCase();
  document.querySelectorAll('#romWrap tbody tr').forEach(tr=>tr.style.display=tr.innerText.toLowerCase().includes(q)?'':'none');
}
async function openROMReview(id){
  const { data: r } = await db.from('item_requirements').select('*').eq('id', id).maybeSingle();
  if (!r){ toast('Not found','error'); return; }
  openModal('ROM Review – '+r.requirement_id, `
    <div class="space-y-3 text-sm">
      <div class="bg-slate-50 rounded p-3">
        <div class="text-xs text-slate-500">Requirement from Automobile Department</div>
        <div class="grid grid-cols-2 gap-2 mt-2">
          <div><div class="text-xs text-slate-500">Vehicle</div><div class="font-medium">${escapeHtml(r.vehicle_name)} (${escapeHtml(r.registration_number)})</div></div>
          <div><div class="text-xs text-slate-500">Item</div><div class="font-medium">${escapeHtml(r.item_name)}</div></div>
          <div><div class="text-xs text-slate-500">Required Quantity</div><div class="font-medium">${r.required_quantity}</div></div>
          <div><div class="text-xs text-slate-500">PR Number</div><div class="font-medium">${escapeHtml(r.pr_number||'—')}</div></div>
          <div><div class="text-xs text-slate-500">Description</div><div class="font-medium">${escapeHtml(r.description||'—')}</div></div>
        </div>
      </div>
      <div>
        <label class="block mb-1 font-medium">Proposed Quantity * (defaults to required)</label>
        <input id="rom_proposed" type="number" min="0" step="0.01" value="${r.required_quantity}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/>
        <p class="text-xs text-slate-500 mt-1">ROM may revise the proposed quantity. Original required quantity is preserved.</p>
      </div>
      <div>
        <label class="block mb-1 font-medium">ROM Remarks</label>
        <textarea id="rom_remarks" rows="3" class="w-full border border-slate-300 rounded-lg px-3 py-2"></textarea>
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
     <button onclick="saveROMReview('${r.id}')" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Submit to Supply Chain</button>`);
}
async function saveROMReview(reqRowId){
  const prop = parseFloat(document.getElementById('rom_proposed').value);
  const rem  = document.getElementById('rom_remarks').value.trim();
  if (isNaN(prop)||prop<0){ toast('Enter valid proposed qty.','error'); return; }
  // fetch requirement
  const { data: r } = await db.from('item_requirements').select('*').eq('id', reqRowId).maybeSingle();
  if (!r){ toast('Requirement missing.','error'); return; }
  // insert rom_review (preserves required qty snapshot)
  const { error: e1 } = await db.from('rom_reviews').insert({
    requirement_id: r.id, requirement_code: r.requirement_id,
    required_quantity: r.required_quantity, proposed_quantity: prop,
    remarks: rem, reviewed_by: currentUser.id
  });
  if (e1){ toast(e1.message,'error'); return; }
  // update requirement status
  const { error: e2 } = await db.from('item_requirements').update({status:'Submitted to Supply Chain'}).eq('id', r.id);
  if (e2){ toast(e2.message,'error'); return; }
  await logActivity('ROM_REVIEW','rom_reviews', r.id, `${r.requirement_id} proposed ${prop}`);
  toast('Submitted to Supply Chain','success'); closeModal(); refreshROM();
}
async function viewROM(id){
  await viewReq(id);
}

