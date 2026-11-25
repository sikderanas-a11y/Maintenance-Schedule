/* page module (original lines 841-1059) */
/* ============================================================
   VEHICLE MAINTENANCE
   ============================================================ */
ROUTES.vehicle_maintenance = async (host)=>{
  host.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="text-sm text-slate-500">All vehicle maintenance records. Add a new maintenance requirement, view details, and update status.</p>
        <button id="btnAddMaint" class="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2"><i data-lucide="plus" class="w-4 h-4"></i> Add Maintenance</button>
      </div>
      <div id="maintWrap"><div class="text-slate-400 text-sm">Loading…</div></div>
    </div>`;
  lucide.createIcons();
  document.getElementById('btnAddMaint').addEventListener('click', ()=>openMaintenanceForm());
  await refreshMaintenance();
};

async function refreshMaintenance(){
  const wrap = document.getElementById('maintWrap');
  if (!wrap) return;
  const { data, error } = await db.from('maintenance_records')
    .select('*').order('created_at',{ascending:false});
  if (error){ wrap.innerHTML = `<div class="text-red-600 text-sm">${escapeHtml(error.message)}</div>`; return; }
  const rows = (data||[]).map(r=>`<tr>
    <td class="px-4 py-2">${escapeHtml(r.vehicle_name)}<div class="text-xs text-slate-400">${escapeHtml(r.registration_number)}</div></td>
    <td class="px-4 py-2">${escapeHtml(r.maintenance_item)}</td>
    <td class="px-4 py-2 max-w-xs truncate" title="${escapeHtml(r.maintenance_description)}">${escapeHtml(r.maintenance_description||'—')}</td>
    <td class="px-4 py-2">${fmtDate(r.maintenance_required_date)}</td>
    <td class="px-4 py-2">${fmtDate(r.planned_repair_date)}</td>
    <td class="px-4 py-2">${badge(r.status)}</td>
    <td class="px-4 py-2 whitespace-nowrap">
      <button onclick="viewMaintenance('${r.id}')" class="text-teal-700 hover:underline text-xs mr-2">View</button>
      <button onclick="openMaintenanceForm('${r.id}')" class="p-1.5 rounded-lg text-slate-500 align-middle hover:text-teal-700 hover:bg-teal-50" title="Edit" aria-label="Edit"><i data-lucide="pencil" class="w-4 h-4 pointer-events-none"></i></button>
      <button onclick="updateMaintStatus('${r.id}','${r.status}')" class="text-amber-700 hover:underline text-xs">Status</button>
    </td>
  </tr>`).join('') || emptyRow(7,'No maintenance records yet. Click "Add Maintenance".');
  wrap.innerHTML = tableCard('Maintenance Records',
    ['Vehicle','Item','Description','Required Date','Planned Repair','Status','Actions'], rows);
  lucide.createIcons();
}

async function openMaintenanceForm(id=''){
  let rec=null; const vehicles = await loadVehicles();
  if (id){
    const { data } = await db.from('maintenance_records').select('*').eq('id',id).maybeSingle();
    rec = data;
  }
  const vOpts = vehicleOptions(vehicles, rec?.vehicle_id);
  openModal(rec?'Edit Maintenance':'Add Maintenance Requirement',
   `<form id="maintForm" class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
     <div class="md:col-span-2">
       <label class="block mb-1 font-medium">Vehicle *</label>
       <select id="f_vehicle" required class="w-full border border-slate-300 rounded-lg px-3 py-2">${vOpts}</select>
     </div>
     <div>
       <label class="block mb-1 font-medium">Item / Spare Part *</label>
       <input id="f_item" required value="${escapeHtml(rec?.maintenance_item||'')}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/>
     </div>
     <div>
       <label class="block mb-1 font-medium">Maintenance Required Date *</label>
       <input id="f_reqdate" type="date" required value="${rec?.maintenance_required_date||''}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/>
     </div>
     <div class="md:col-span-2">
       <label class="block mb-1 font-medium">Problem Description</label>
       <textarea id="f_desc" rows="2" class="w-full border border-slate-300 rounded-lg px-3 py-2">${escapeHtml(rec?.maintenance_description||'')}</textarea>
     </div>
     <div class="md:col-span-2">
       <label class="block mb-1 font-medium">Required Repair / Maintenance Work</label>
       <textarea id="f_work" rows="2" class="w-full border border-slate-300 rounded-lg px-3 py-2">${escapeHtml(rec?.required_work||'')}</textarea>
     </div>
     <div>
       <label class="block mb-1 font-medium">Planned Repair Date</label>
       <input id="f_plan" type="date" value="${rec?.planned_repair_date||''}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/>
     </div>
     <div>
       <label class="block mb-1 font-medium">Status</label>
       <select id="f_status" class="w-full border border-slate-300 rounded-lg px-3 py-2">
         ${['Maintenance Required','Item Requirement Pending','Waiting for Item Delivery','Repair In Progress','Completed','Pending with Reason']
           .map(s=>`<option ${rec?.status===s?'selected':''}>${s}</option>`).join('')}
       </select>
     </div>
     <div class="md:col-span-2">
       <label class="block mb-1 font-medium">Remarks</label>
       <textarea id="f_remarks" rows="2" class="w-full border border-slate-300 rounded-lg px-3 py-2">${escapeHtml(rec?.remarks||'')}</textarea>
     </div>
     <div id="reasonBox" class="md:col-span-2 hidden">
       <label class="block mb-1 font-medium">Pending Reason *</label>
       <textarea id="f_reason" rows="3" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="Explain why maintenance cannot be completed…"></textarea>
     </div>
   </form>`,
   `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
    <button onclick="saveMaintenance('${id}')" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Save</button>`);

  const statusSel = document.getElementById('f_status');
  function toggleReason(){ document.getElementById('reasonBox').classList.toggle('hidden', statusSel.value!=='Pending with Reason'); }
  statusSel.addEventListener('change', toggleReason);
  if (rec?.status==='Pending with Reason') toggleReason();
}

async function saveMaintenance(id){
  const form = document.getElementById('maintForm');
  const vSel = document.getElementById('f_vehicle');
  const vehicleId = vSel.value;
  if (!vehicleId){ toast('Select a vehicle.','error'); return; }
  const vName = vSel.options[vSel.selectedIndex].dataset.name;
  const vReg  = vSel.options[vSel.selectedIndex].dataset.reg;
  const payload = {
    vehicle_id: vehicleId,
    vehicle_name: vName,
    registration_number: vReg,
    maintenance_item: document.getElementById('f_item').value.trim(),
    maintenance_description: document.getElementById('f_desc').value.trim(),
    required_work: document.getElementById('f_work').value.trim(),
    maintenance_required_date: document.getElementById('f_reqdate').value,
    planned_repair_date: document.getElementById('f_plan').value||null,
    status: document.getElementById('f_status').value,
    remarks: document.getElementById('f_remarks').value.trim(),
    submitted_by: currentUser.id,
    expected_completion_date: document.getElementById('f_plan').value||null,
  };
  if (!payload.maintenance_item || !payload.maintenance_required_date){ toast('Fill required fields.','error'); return; }
  if (payload.status==='Pending with Reason'){
    const reason = document.getElementById('f_reason').value.trim();
    if (!reason){ toast('Enter pending reason.','error'); return; }
  }
  let res;
  if (id){
    res = await db.from('maintenance_records').update(payload).eq('id', id);
    await logActivity('UPDATE_MAINTENANCE','maintenance_records', id, `Updated ${payload.vehicle_name} - ${payload.maintenance_item}`);
  } else {
    res = await db.from('maintenance_records').insert(payload).select().single();
    if (!res.error){
      const newId = res.data.id;
      await logActivity('CREATE_MAINTENANCE','maintenance_records', newId, `Created ${payload.vehicle_name} - ${payload.maintenance_item}`);
      if (payload.status==='Pending with Reason'){
        const reason = document.getElementById('f_reason').value.trim();
        await db.from('maintenance_pending_reasons').insert({
          maintenance_id:newId, reason, expected_completion_date: payload.expected_completion_date,
          created_by: currentUser.id
        });
      }
    }
  }
  if (res.error){ toast(res.error.message,'error'); return; }
  toast('Saved successfully','success'); closeModal(); refreshMaintenance();
}

async function viewMaintenance(id){
  const { data: r } = await db.from('maintenance_records').select('*').eq('id',id).maybeSingle();
  if (!r){ toast('Not found','error'); return; }
  // related item requirements
  const { data: reqs } = await db.from('item_requirements').select('*').eq('maintenance_id', id).order('submission_date',{ascending:false});
  // pending history
  const { data: pend } = await db.from('maintenance_pending_reasons').select('*').eq('maintenance_id', id).order('created_at',{ascending:false});

  const infoRows = [
    ['Vehicle', `${r.vehicle_name} (${r.registration_number})`],
    ['Maintenance Item', r.maintenance_item],
    ['Description', r.maintenance_description||'—'],
    ['Required Work', r.required_work||'—'],
    ['Required Date', fmtDate(r.maintenance_required_date)],
    ['Planned Repair Date', fmtDate(r.planned_repair_date)],
    ['Expected Completion', fmtDate(r.expected_completion_date)],
    ['Status', badge(r.status)],
    ['Remarks', r.remarks||'—'],
  ];
  openModal('Vehicle Maintenance Details', `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
      ${infoRows.map(([k,v])=>`<div class="bg-slate-50 rounded-lg p-3"><div class="text-xs text-slate-500">${k}</div><div class="font-medium mt-1">${v}</div></div>`).join('')}
    </div>
    <h4 class="font-semibold mb-2">Related Item Requirements</h4>
    ${(reqs&&reqs.length)?`<table class="data w-full text-sm mb-4"><thead><tr><th class="px-3 py-1">Req ID</th><th class="px-3 py-1">Item</th><th class="px-3 py-1">Qty</th><th class="px-3 py-1">Status</th></tr></thead><tbody>
      ${reqs.map(q=>`<tr><td class="px-3 py-1 font-mono text-xs">${escapeHtml(q.requirement_id)}</td><td class="px-3 py-1">${escapeHtml(q.item_name)}</td><td class="px-3 py-1">${q.required_quantity}</td><td class="px-3 py-1">${badge(q.status)}</td></tr>`).join('')}
    </tbody></table>`:'<p class="text-sm text-slate-400 mb-4">No related item requirements.</p>'}
    <h4 class="font-semibold mb-2">Pending History</h4>
    ${(pend&&pend.length)?`<ul class="text-sm space-y-2">${pend.map(p=>`<li class="bg-slate-50 rounded p-2"><div class="text-xs text-slate-500">${fmtDateTime(p.created_at)}</div><div>${escapeHtml(p.reason)}</div>${p.expected_completion_date?`<div class="text-xs text-slate-500">Expected: ${fmtDate(p.expected_completion_date)}</div>`:''}</li>`).join('')}</ul>`:'<p class="text-sm text-slate-400">No pending history.</p>'}
  `);
  lucide.createIcons();
}

async function updateMaintStatus(id, current){
  const opts = ['Maintenance Required','Item Requirement Pending','Waiting for Item Delivery','Repair In Progress','Completed','Pending with Reason'];
  openModal('Update Maintenance Status', `
    <div class="space-y-3 text-sm">
      <div><label class="block mb-1 font-medium">Status *</label>
        <select id="st_status" class="w-full border border-slate-300 rounded-lg px-3 py-2">
          ${opts.map(s=>`<option ${s===current?'selected':''}>${s}</option>`).join('')}
        </select>
      </div>
      <div id="st_reasonBox" class="${current==='Pending with Reason'?'':'hidden'}">
        <label class="block mb-1 font-medium">Pending Reason *</label>
        <textarea id="st_reason" rows="3" class="w-full border border-slate-300 rounded-lg px-3 py-2" placeholder="e.g. Required spare parts not available."></textarea>
      </div>
      <div><label class="block mb-1 font-medium">Expected Completion Date</label>
        <input id="st_exp" type="date" class="w-full border border-slate-300 rounded-lg px-3 py-2"/>
      </div>
    </div>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
     <button onclick="saveMaintStatus('${id}')" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">Update</button>`);
  const sel = document.getElementById('st_status');
  sel.addEventListener('change', ()=>document.getElementById('st_reasonBox').classList.toggle('hidden', sel.value!=='Pending with Reason'));
}
async function saveMaintStatus(id){
  const status = document.getElementById('st_status').value;
  const exp = document.getElementById('st_exp').value || null;
  const payload = { status, expected_completion_date: exp };
  if (status==='Pending with Reason'){
    const reason = document.getElementById('st_reason').value.trim();
    if (!reason){ toast('Enter reason.','error'); return; }
    await db.from('maintenance_pending_reasons').insert({
      maintenance_id:id, reason, expected_completion_date: exp, created_by: currentUser.id
    });
  }
  const { error } = await db.from('maintenance_records').update(payload).eq('id', id);
  if (error){ toast(error.message,'error'); return; }
  await logActivity('UPDATE_MAINTENANCE_STATUS','maintenance_records', id, `Status → ${status}`);
  toast('Status updated','success'); closeModal(); refreshMaintenance();
}

