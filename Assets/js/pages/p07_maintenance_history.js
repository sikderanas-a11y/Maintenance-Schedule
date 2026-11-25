/* page module (original lines 2291-2312) */
/* ============================================================
   MAINTENANCE HISTORY
   ============================================================ */
ROUTES.maintenance_history = async (host)=>{
  host.innerHTML = `<div id="mhWrap"><div class="text-slate-400 text-sm">Loading…</div></div>`;
  const wrap = document.getElementById('mhWrap');
  const { data, error } = await db.from('maintenance_records').select('*').order('created_at',{ascending:false});
  if (error){ wrap.innerHTML=`<div class="text-red-600 text-sm">${escapeHtml(error.message)}</div>`; return; }
  const rows = (data||[]).map(r=>`<tr>
    <td class="px-4 py-2">${escapeHtml(r.vehicle_name)}<div class="text-xs text-slate-400">${escapeHtml(r.registration_number)}</div></td>
    <td class="px-4 py-2">${escapeHtml(r.maintenance_item)}</td>
    <td class="px-4 py-2">${fmtDate(r.maintenance_required_date)}</td>
    <td class="px-4 py-2">${fmtDate(r.planned_repair_date)}</td>
    <td class="px-4 py-2">${fmtDate(r.expected_completion_date)}</td>
    <td class="px-4 py-2">${badge(r.status)}</td>
    <td class="px-4 py-2">${fmtDateTime(r.updated_at)}</td>
  </tr>`).join('') || emptyRow(7,'No history.');
  wrap.innerHTML = tableCard('Maintenance History',
    ['Vehicle','Item','Required Date','Planned Repair','Expected Completion','Status','Last Updated'], rows);
  lucide.createIcons();
};

