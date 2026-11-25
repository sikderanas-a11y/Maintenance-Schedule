/* page module (original lines 2313-2402) */
/* ============================================================
   REPORTS
   ============================================================ */
ROUTES.reports = async (host)=>{
  host.innerHTML = `
    <div class="space-y-4">
      <div class="bg-white rounded-xl border border-slate-200 p-4">
        <h3 class="font-semibold mb-3">Generate Reports</h3>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3 text-sm">
          <div><label class="block mb-1 font-medium">Report Type</label>
            <select id="rep_type" class="w-full border border-slate-300 rounded-lg px-3 py-2">
              <option value="maint">Vehicle-wise Maintenance</option>
              <option value="pending">Pending Maintenance</option>
              <option value="req">Item Requirement</option>
              <option value="rom">ROM Proposed Quantity</option>
              <option value="sc">Supply Chain Delivery</option>
              <option value="delayed">Delayed Item Delivery</option>
              <option value="history">Vehicle Maintenance History</option>
            </select>
          </div>
          <div><label class="block mb-1 font-medium">From</label><input id="rep_from" type="date" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
          <div><label class="block mb-1 font-medium">To</label><input id="rep_to" type="date" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
          <div class="flex items-end gap-2">
            <button onclick="generateReport()" class="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Generate</button>
            <button onclick="exportCSV()" class="bg-navy-800 hover:bg-navy-700 text-white text-sm px-3 py-2 rounded-lg">Export CSV</button>
          </div>
        </div>
      </div>
      <div id="repOut"><p class="text-sm text-slate-400">Select a report and click Generate.</p></div>
    </div>`;
  lucide.createIcons();
};

let LAST_REPORT = {headers:[], rows:[]};
async function generateReport(){
  const type = document.getElementById('rep_type').value;
  const from = document.getElementById('rep_from').value;
  const to   = document.getElementById('rep_to').value;
  const out = document.getElementById('repOut');
  out.innerHTML = `<div class="text-sm text-slate-400">Loading…</div>`;

  let headers=[], rows=[];
  if (type==='maint' || type==='history'){
    let q = db.from('maintenance_records').select('*').order('created_at',{ascending:false});
    if (from) q = q.gte('maintenance_required_date', from);
    if (to)   q = q.lte('maintenance_required_date', to);
    const { data } = await q;
    headers = ['Vehicle','Reg No.','Item','Required Date','Planned Repair','Status','Remarks'];
    rows = (data||[]).map(r=>[r.vehicle_name, r.registration_number, r.maintenance_item, fmtDate(r.maintenance_required_date), fmtDate(r.planned_repair_date), r.status, r.remarks||'']);
  } else if (type==='pending'){
    const { data } = await db.from('maintenance_records').select('*').neq('status','Completed').order('updated_at',{ascending:false});
    headers = ['Vehicle','Reg No.','Item','Status','Last Updated'];
    rows = (data||[]).map(r=>[r.vehicle_name, r.registration_number, r.maintenance_item, r.status, fmtDateTime(r.updated_at)]);
  } else if (type==='req'){
    let q = db.from('item_requirements').select('*').order('submission_date',{ascending:false});
    if (from) q = q.gte('submission_date', from);
    if (to)   q = q.lte('submission_date', to);
    const { data } = await q;
    headers = ['Req ID','Vehicle','Item','Qty','PR No.','Status'];
    rows = (data||[]).map(r=>[r.requirement_id, r.vehicle_name, r.item_name, r.required_quantity, r.pr_number||'', r.status]);
  } else if (type==='rom'){
    const { data } = await db.from('rom_reviews').select('*, item_requirements!inner(*)').order('reviewed_at',{ascending:false});
    headers = ['Req ID','Vehicle','Item','Required','Proposed','Remarks','Reviewed At'];
    rows = (data||[]).map(x=>[x.requirement_code, x.item_requirements?.vehicle_name||'', x.item_requirements?.item_name||'', x.required_quantity, x.proposed_quantity, x.remarks||'', fmtDateTime(x.reviewed_at)]);
  } else if (type==='sc' || type==='delayed'){
    let q = db.from('supply_chain_schedules').select('*, item_requirements!inner(*)').order('updated_at',{ascending:false});
    const { data } = await q;
    let arr = data||[];
    if (type==='delayed'){
      const today = new Date(); today.setHours(0,0,0,0);
      arr = arr.filter(s=>s.expected_delivery_date && new Date(s.expected_delivery_date)<today && s.delivery_status!=='Delivered');
    }
    headers = ['Req ID','Vehicle','Item','Expected Delivery','Confirmed Qty','Status','Remarks'];
    rows = arr.map(x=>[x.requirement_code, x.item_requirements?.vehicle_name||'', x.item_requirements?.item_name||'', fmtDate(x.expected_delivery_date), x.confirmed_delivery_qty||'', x.delivery_status, x.remarks||'']);
  }
  LAST_REPORT = {headers, rows};
  const thead = headers.map(h=>`<th class="px-4 py-2 text-left">${escapeHtml(h)}</th>`).join('');
  const tbody = rows.length ? rows.map(r=>`<tr>${r.map(c=>`<td class="px-4 py-2">${escapeHtml(String(c))}</td>`).join('')}</tr>`).join('') : `<tr><td colspan="${headers.length}" class="px-4 py-6 text-center text-slate-400">No data</td></tr>`;
  out.innerHTML = tableCard(`Report: ${document.getElementById('rep_type').selectedOptions[0].text} (${rows.length} rows)`, headers, tbody);
}
function exportCSV(){
  if (!LAST_REPORT.headers.length){ toast('Generate a report first.','error'); return; }
  const csv = [LAST_REPORT.headers, ...LAST_REPORT.rows].map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href=url; a.download='report.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('CSV exported','success');
}

