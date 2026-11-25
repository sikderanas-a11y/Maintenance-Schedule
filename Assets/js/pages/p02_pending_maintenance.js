/* page module (original lines 1060-1140) */
/* ============================================================
   PENDING MAINTENANCE
   ============================================================ */
ROUTES.pending_maintenance = async (host)=>{
  host.innerHTML = `<div id="pWrap"><div class="text-slate-400 text-sm">Loading…</div></div>`;
  await refreshPending();
};
async function refreshPending(){
  const wrap = document.getElementById('pWrap'); if(!wrap) return;
  const { data, error } = await db.from('maintenance_records')
    .select('*').neq('status','Completed').order('updated_at',{ascending:false});
  if (error){ wrap.innerHTML = `<div class="text-red-600 text-sm">${escapeHtml(error.message)}</div>`; return; }
  // pull latest pending reason per record
  let rowsHtml = '';
  if (!data.length){ rowsHtml = emptyRow(7,'No pending maintenance (none)'); }
  else {
    const ids = data.map(d=>d.id);
    const { data: pend } = await db.from('maintenance_pending_reasons')
      .select('*').in('maintenance_id', ids).order('created_at',{ascending:false});
    const pendMap = {};
    (pend||[]).forEach(p=>{ if(!pendMap[p.maintenance_id]) pendMap[p.maintenance_id]=p; });
    rowsHtml = data.map(r=>{
      const p = pendMap[r.id];
      return `<tr>
        <td class="px-4 py-2">${escapeHtml(r.vehicle_name)}<div class="text-xs text-slate-400">${escapeHtml(r.registration_number)}</div></td>
        <td class="px-4 py-2">${escapeHtml(r.maintenance_item)}</td>
        <td class="px-4 py-2">${p?escapeHtml(p.reason):`<span class="text-slate-400">—</span>`}</td>
        <td class="px-4 py-2">${p?fmtDateTime(p.created_at):fmtDateTime(r.updated_at)}</td>
        <td class="px-4 py-2">${fmtDate(p?.expected_completion_date||r.expected_completion_date)}</td>
        <td class="px-4 py-2">${badge(r.status)}</td>
        <td class="px-4 py-2">${fmtDateTime(r.updated_at)}</td>
        <td class="px-4 py-2"><button onclick="editPending('${r.id}')" class="text-teal-700 hover:underline text-xs">Update</button></td>
      </tr>`;
    }).join('');
  }
  wrap.innerHTML = tableCard('Pending Maintenance',
    ['Vehicle','Maintenance Req.','Pending Reason','Pending Since','Expected Completion','Status','Last Updated','Actions'], rowsHtml);
  lucide.createIcons();
}
async function editPending(id){
  const { data: r } = await db.from('maintenance_records').select('*').eq('id',id).maybeSingle();
  if (!r){ toast('Not found','error'); return; }
  const { data: p } = await db.from('maintenance_pending_reasons').select('*').eq('maintenance_id', id).order('created_at',{ascending:false}).limit(1).maybeSingle();
  openModal('Update Pending Reason', `
    <div class="space-y-3 text-sm">
      <div class="bg-slate-50 rounded p-3">
        <div class="text-xs text-slate-500">Vehicle</div>
        <div class="font-medium">${escapeHtml(r.vehicle_name)} (${escapeHtml(r.registration_number)})</div>
        <div class="text-xs text-slate-500 mt-2">Maintenance Item</div>
        <div class="font-medium">${escapeHtml(r.maintenance_item)}</div>
      </div>
      <div><label class="block mb-1 font-medium">Pending Reason *</label>
        <select id="p_reasonSel" class="w-full border border-slate-300 rounded-lg px-3 py-2">
          ${['Required spare parts not available.','Waiting for Supply Chain delivery.','Vehicle is waiting for technical inspection.','Repair work is postponed.','Other (specify)'].map(x=>`<option ${p?.reason===x?'selected':''}>${x}</option>`).join('')}
        </select>
      </div>
      <div><label class="block mb-1 font-medium">Custom Reason (if Other)</label>
        <textarea id="p_reasonText" rows="2" class="w-full border border-slate-300 rounded-lg px-3 py-2">${escapeHtml(p?.reason||'')}</textarea>
      </div>
      <div><label class="block mb-1 font-medium">Expected Completion Date *</label>
        <input id="p_exp" type="date" value="${p?.expected_completion_date||r.expected_completion_date||''}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/>
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
     <button onclick="savePending('${id}')" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save</button>`);
}
async function savePending(id){
  const sel = document.getElementById('p_reasonSel').value;
  const text = document.getElementById('p_reasonText').value.trim();
  const exp = document.getElementById('p_exp').value;
  if (!exp){ toast('Enter expected completion date.','error'); return; }
  const reason = (sel==='Other (specify)' && text) ? text : sel;
  const { error } = await db.from('maintenance_pending_reasons').insert({
    maintenance_id:id, reason, expected_completion_date: exp, created_by: currentUser.id
  });
  if (error){ toast(error.message,'error'); return; }
  await db.from('maintenance_records').update({status:'Pending with Reason', expected_completion_date: exp}).eq('id', id);
  await logActivity('UPDATE_PENDING_REASON','maintenance_records', id, reason);
  toast('Pending reason saved','success'); closeModal(); refreshPending();
}

