/* page module (original lines 1927-2048) */
/* ============================================================
   SUPPLY CHAIN
   ============================================================ */
ROUTES.supply_chain = async (host)=>{
  host.innerHTML = `<div id="scWrap"><div class="text-slate-400 text-sm">Loading…</div></div>`;
  await refreshSC();
};
async function refreshSC(){
  const wrap = document.getElementById('scWrap'); if (!wrap) return;
  const { data, error } = await db.from('item_requirements').select('*')
    .in('status',['Submitted to Supply Chain','Scheduled','Delivered'])
    .order('submission_date',{ascending:false});
  if (error){ wrap.innerHTML = `<div class="text-red-600 text-sm">${escapeHtml(error.message)}</div>`; return; }
  const ids = (data||[]).map(d=>d.id);
  let scMap={};
  if (ids.length){
    const { data: scs } = await db.from('supply_chain_schedules').select('*').in('requirement_id', ids).order('updated_at',{ascending:false});
    (scs||[]).forEach(s=>{ if(!scMap[s.requirement_id]) scMap[s.requirement_id]=s; });
  }
  const today = new Date(); today.setHours(0,0,0,0);
  const rows = (data||[]).map(r=>{
    const sc = scMap[r.id];
    const status = sc?sc.delivery_status:'Awaiting Scheduling';
    const overdue = sc && sc.expected_delivery_date && new Date(sc.expected_delivery_date)<today && status!=='Delivered';
    return `<tr class="${overdue?'bg-red-50':''}">
      <td class="px-4 py-2 font-mono text-xs">${escapeHtml(r.requirement_id)}</td>
      <td class="px-4 py-2">${escapeHtml(r.vehicle_name)}</td>
      <td class="px-4 py-2">${escapeHtml(r.item_name)}</td>
      <td class="px-4 py-2">${r.required_quantity}</td>
      <td class="px-4 py-2 font-semibold">${sc?sc.confirmed_delivery_qty||'—':'—'}</td>
        <td class="px-4 py-2">${escapeHtml(r.pr_number||'—')}</td>
      <td class="px-4 py-2">${fmtDateTime(r.submission_date)}</td>
      <td class="px-4 py-2">${sc?fmtDate(sc.expected_delivery_date):'—'}${overdue?' <span class="badge bg-red-100 text-red-700">Overdue</span>':''}</td>
      <td class="px-4 py-2">${badge(status)}</td>
      <td class="px-4 py-2 whitespace-nowrap">
        <button onclick="openSCSchedule('${r.id}')" class="text-teal-700 hover:underline text-xs">${sc?'Update':'Schedule'}</button>
      </td>
    </tr>`;
  }).join('') || emptyRow(11,'No requirements routed to Supply Chain yet.');
  wrap.innerHTML = tableCard('Supply Chain Management – Delivery Schedules',
    ['Req ID','Vehicle','Item','Required Qty','Confirmed Qty','PR No.','ROM Submitted','Expected Delivery','Delivery Status','Actions'], rows,
    {toolbar:`<input placeholder="Search…" onkeyup="filterSCTable(this.value)" class="border border-slate-300 rounded-lg px-3 py-1.5 text-sm w-48"/>`});
  lucide.createIcons();
}
function filterSCTable(q){q=q.toLowerCase();document.querySelectorAll('#scWrap tbody tr').forEach(tr=>tr.style.display=tr.innerText.toLowerCase().includes(q)?'':'none');}
async function openSCSchedule(id){
  const { data: r } = await db.from('item_requirements').select('*').eq('id', id).maybeSingle();
  if (!r){ toast('Not found','error'); return; }
  const { data: rom } = await db.from('rom_reviews').select('*').eq('requirement_id', id).order('reviewed_at',{ascending:false}).limit(1).maybeSingle();
  const { data: sc } = await db.from('supply_chain_schedules').select('*').eq('requirement_id', id).order('updated_at',{ascending:false}).limit(1).maybeSingle();
  const proposed = rom?rom.proposed_quantity:r.required_quantity;
  openModal('Supply Chain – '+r.requirement_id, `
    <div class="space-y-3 text-sm">
      <div class="bg-slate-50 rounded p-3 grid grid-cols-2 gap-2">
        <div><div class="text-xs text-slate-500">Vehicle</div><div class="font-medium">${escapeHtml(r.vehicle_name)}</div></div>
        <div><div class="text-xs text-slate-500">Item</div><div class="font-medium">${escapeHtml(r.item_name)}</div></div>
        <div><div class="text-xs text-slate-500">Required Qty</div><div class="font-medium">${r.required_quantity}</div></div>
        <div><div class="text-xs text-slate-500">Proposed Qty (ROM)</div><div class="font-medium">${proposed}</div></div>
        <div><div class="text-xs text-slate-500">PR Number</div><div class="font-medium">${escapeHtml(r.pr_number||'—')}</div></div>
      </div>
      <div>
        <label class="block mb-1 font-medium">Expected Delivery Date</label>
        <input id="sc_exp" type="date" value="${sc?.expected_delivery_date||''}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/>
      </div>
      <div>
        <label class="block mb-1 font-medium">Confirmed Delivery Quantity</label>
        <input id="sc_qty" type="number" min="0" step="0.01" value="${sc?.confirmed_delivery_qty??proposed}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/>
      </div>
      <div>
        <label class="block mb-1 font-medium">Delivery Status *</label>
        <select id="sc_status" class="w-full border border-slate-300 rounded-lg px-3 py-2">
          ${['Awaiting Scheduling','Delivery Date Confirmed','In Transit','Delivered','Delayed'].map(s=>`<option ${sc?.delivery_status===s?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div>
        <label class="block mb-1 font-medium">Supply Chain Remarks</label>
        <textarea id="sc_remarks" rows="3" class="w-full border border-slate-300 rounded-lg px-3 py-2">${escapeHtml(sc?.remarks||'')}</textarea>
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
     <button onclick="saveSCSchedule('${r.id}')" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save Schedule</button>`);
}
async function saveSCSchedule(reqRowId){
  const exp = document.getElementById('sc_exp').value || null;
  const qty = document.getElementById('sc_qty').value;
  const status = document.getElementById('sc_status').value;
  const rem = document.getElementById('sc_remarks').value.trim();
  if (!status){ toast('Select status.','error'); return; }
  const { data: r } = await db.from('item_requirements').select('*').eq('id', reqRowId).maybeSingle();
  if (!r){ toast('Requirement missing.','error'); return; }
  // upsert schedule
  const { data: existing } = await db.from('supply_chain_schedules').select('*').eq('requirement_id', reqRowId).maybeSingle();
  const payload = {
    requirement_id: reqRowId,
    requirement_code: r.requirement_id,
    expected_delivery_date: exp,
    confirmed_delivery_qty: qty?parseFloat(qty):null,
    delivery_status: status,
    remarks: rem,
    scheduled_by: currentUser.id,
  };
  let res;
  if (existing){
    res = await db.from('supply_chain_schedules').update(payload).eq('id', existing.id);
  } else {
    res = await db.from('supply_chain_schedules').insert(payload);
  }
  if (res.error){ toast(res.error.message,'error'); return; }
  // update requirement status
  let newStatus = 'Submitted to Supply Chain';
  if (status==='Delivered') newStatus='Delivered';
  else if (status!=='Awaiting Scheduling') newStatus='Scheduled';
  await db.from('item_requirements').update({status: newStatus}).eq('id', reqRowId);
  // update maintenance record if linked
  if (r.maintenance_id){
    const newMaintStatus = status==='Delivered'?'Repair In Progress': (status!=='Awaiting Scheduling'?'Waiting for Item Delivery':null);
    if (newMaintStatus) await db.from('maintenance_records').update({status: newMaintStatus}).eq('id', r.maintenance_id);
  }
  await logActivity('SUPPLY_CHAIN_SCHEDULE','supply_chain_schedules', reqRowId, `${r.requirement_id} → ${status}`);
  toast('Schedule saved','success'); closeModal(); refreshSC();
}

