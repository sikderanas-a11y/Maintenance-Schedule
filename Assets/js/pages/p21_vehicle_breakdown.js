/* ============================================================
   VEHICLE BREAKDOWN STATUS  (new module - self-contained)
   Table : vehicle_breakdown_status (main project `db`)   View: vehicle_breakdown_summary
   Fleet : db.vehicle_master (uuid_id, code, vehicle_name) - vehicle_breakdown_status.vehicle_id is a foreign key to vehicle_master.uuid_id
   One row = one breakdown episode; repaired vehicles keep their row (history is never deleted).
   PDF / Excel libraries are loaded only when a download button is clicked.
   ============================================================ */
const BD_TABLE = 'vehicle_breakdown_status', BD_VIEW = 'vehicle_breakdown_summary', BD_PAGE = 15;
const BD_OUT = 'Out of Operation', BD_OK = 'Operational';
const BD_LIBS = {
  jspdf: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  autotable: 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  /* ExcelJS (styles, frozen header row, filters). cdnjs first - same CDN the rest of the app uses - jsDelivr as fallback */
  exceljs: ['https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js', 'https://cdn.jsdelivr.net/npm/exceljs@4.3.0/dist/exceljs.min.js']
};
const bdInp = 'border border-slate-300 rounded-lg px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500';
const bdCard = 'bg-white rounded-xl shadow-sm border border-slate-200';
const bdBtn = 'rounded-lg px-3 py-1.5 text-sm font-medium transition disabled:opacity-60 disabled:cursor-not-allowed';

let bdVeh = [], bdVehT = 0;
let bdF = { q: '', st: 'active', vid: '', from: '', to: '' };
let bdPageNo = 0, bdTotal = 0, bdSum = null, bdBusy = false, bdQTimer = null;

/* ---------- small helpers ---------- */
const bdEl = id => document.getElementById(id);
/* Records are matched by vehicle CODE (vehicle_number), so rows written by older versions of this module still match. */
const bdNorm = c => String(c == null ? '' : c).trim().toUpperCase();
const bdVehByCode = c => bdVeh.find(v => bdNorm(v.code) === bdNorm(c)) || null;
const bdLike = c => String(c).trim().replace(/[\\%_]/g, '\\$&');            /* exact, case-insensitive match for ilike */
const bdUser = () => (typeof currentUser !== 'undefined' && currentUser) ? (currentUser.full_name || currentUser.email || '') : '';
const bdYmd = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const bdToday = () => bdYmd(new Date());
const bdUtc = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return Date.UTC(y, m - 1, d); };
const bdMon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const bdFmt = s => { if (!s) return '—'; const [y, m, d] = String(s).slice(0, 10).split('-'); return `${d}-${bdMon[+m - 1]}-${y}`; };
const bdFmtDT = s => { if (!s) return '—'; const t = new Date(s); if (isNaN(t)) return String(s); const p = n => String(n).padStart(2, '0'); return `${p(t.getDate())}-${bdMon[t.getMonth()]}-${t.getFullYear()} ${p(t.getHours())}:${p(t.getMinutes())}`; };
const bdDays = (from, to) => Math.max(0, Math.round((bdUtc(to) - bdUtc(from)) / 864e5));
const bdDown = r => r.status === BD_OUT ? bdDays(r.breakdown_date, bdToday()) : bdDays(r.breakdown_date, r.recovery_date || r.breakdown_date);
const bdNum = (n, d = 1) => { const v = Number(n); return isFinite(v) ? v.toLocaleString('en-US', { maximumFractionDigits: d }) : '0'; };
const bdPlural = n => n === 1 ? 'day' : 'days';

async function bdLoadVehicles(force) {
  if (!force && bdVeh.length && Date.now() - bdVehT < 60000) return bdVeh;
  let all = [], from = 0;
  for (;;) {
    const { data, error } = await db.from('vehicle_master').select('uuid_id, code, vehicle_name').order('vehicle_name').order('code').range(from, from + 999);
    if (error) throw error;
    all = all.concat(data || []); if (!data || data.length < 1000) break; from += 1000;
  }
  /* one entry per vehicle: vehicle_master rows that share the same code are merged (ids[] keeps every uuid_id so old records still match) */
  const byCode = new Map();
  all.filter(v => v.code && v.uuid_id).forEach(v => {
    const k = String(v.code).trim().toUpperCase(), id = String(v.uuid_id);
    if (byCode.has(k)) byCode.get(k).ids.push(id);
    else byCode.set(k, { id, ids: [id], code: String(v.code).trim(), name: String(v.vehicle_name || v.code) });
  });
  bdVeh = [...byCode.values()]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  bdVehT = Date.now(); return bdVeh;
}

/* ---------- queries (one filter builder shared by the table and both exports) ---------- */
function bdQuery(sel, opts, f) {
  let q = db.from(BD_TABLE).select(sel, opts);
  if (f.st === 'active') q = q.eq('status', BD_OUT); else if (f.st === 'recovered') q = q.eq('status', BD_OK);
  if (f.vid) q = q.ilike('vehicle_number', bdLike(f.vid));
  if (f.from) q = q.gte('breakdown_date', f.from);
  if (f.to) q = q.lte('breakdown_date', f.to);
  const s = String(f.q || '').trim().replace(/[,()*%\\"]/g, ' ').replace(/\s+/g, ' ').trim();
  if (s) q = q.or(`vehicle_name.ilike.*${s}*,vehicle_number.ilike.*${s}*`);
  /* current breakdowns: longest downtime first; otherwise current ones first, then newest */
  q = f.st === 'active' ? q.order('breakdown_date', { ascending: true }) : q.order('status', { ascending: false }).order('breakdown_date', { ascending: false });
  return q.order('created_at', { ascending: false }).order('id', { ascending: true });
}
async function bdFetchPage() {
  const a = bdPageNo * BD_PAGE;
  const { data, error, count } = await bdQuery('*', { count: 'exact' }, bdF).range(a, a + BD_PAGE - 1);
  if (error) throw error;
  bdTotal = count || 0; return data || [];
}
async function bdFetchAll(f) {            /* every matching record, independent of on-screen pagination */
  let out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await bdQuery('*', {}, f).range(from, from + 999);
    if (error) throw error;
    out = out.concat(data || []); if (!data || data.length < 1000) break;
  }
  return out;
}
async function bdLoadSummary() {
  const [{ data, error }, veh] = await Promise.all([db.from(BD_VIEW).select('*').single(), bdLoadVehicles()]);
  if (error) throw error;
  const out = Number(data.vehicles_out_of_operation) || 0;
  bdSum = {
    out, active: Number(data.active_breakdowns) || 0, total: veh.length, operational: Math.max(0, veh.length - out),
    avgDown: Number(data.avg_active_downtime_days) || 0, avgRepair: Number(data.avg_repair_days) || 0,
    recovered: Number(data.recovered_breakdowns) || 0, records: Number(data.total_records) || 0
  };
  return bdSum;
}

/* ---------- page ---------- */
ROUTES.vehicle_breakdown = async host => {
  bdF = { q: '', st: 'active', vid: '', from: '', to: '' }; bdPageNo = 0; bdTotal = 0; bdSum = null; bdBusy = false;
  host.innerHTML = `<div class="w-full space-y-4">
    <div class="flex items-start gap-3 flex-wrap">
      <div class="min-w-0"><h3 class="text-lg font-bold text-navy-900">Vehicle Breakdown Status</h3>
        <p class="text-xs text-slate-500">Vehicles currently out of operation, with full breakdown and repair history</p></div>
      <div class="w-full md:w-auto md:ml-auto flex items-center gap-2 flex-wrap">
        <button id="bd_new" class="${bdBtn} bg-teal-600 hover:bg-teal-700 text-white">Update Breakdown Status</button>
        <select id="bd_scope" title="What the downloads contain" class="${bdInp} flex-1 min-w-[170px] md:flex-none"><option value="filtered">Export: current filters</option><option value="all">Export: all breakdown history</option></select>
        <button id="bd_pdf" class="${bdBtn} bg-red-600 hover:bg-red-700 text-white">Download PDF Report</button>
        <button id="bd_xls" class="${bdBtn} bg-green-600 hover:bg-green-700 text-white">Download Excel Report</button>
        <button id="bd_rf" class="${bdBtn} border border-slate-300 hover:bg-slate-50">Refresh</button>
      </div>
    </div>
    <div id="bd_err"></div>
    <div id="bd_cards" class="grid grid-cols-1 min-[480px]:grid-cols-2 xl:grid-cols-4 gap-3"></div>
    <div id="bd_cardnote" class="text-xs text-slate-500 -mt-1"></div>
    <div class="${bdCard} p-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-2 items-end">
        <div class="sm:col-span-2 lg:col-span-3 2xl:col-span-2"><label class="block text-xs text-slate-500 mb-1">Search vehicle name or number</label><input id="bd_q" placeholder="e.g. forklift or XCG1234R" class="${bdInp} w-full"/></div>
        <div><label class="block text-xs text-slate-500 mb-1">Status</label><select id="bd_st" class="${bdInp} w-full">
          <option value="active">Out of Operation (current)</option><option value="recovered">Operational (repaired)</option><option value="all">All records</option></select></div>
        <div><label class="block text-xs text-slate-500 mb-1">Vehicle</label><select id="bd_vid" class="${bdInp} w-full"><option value="">All vehicles</option></select></div>
        <div><label class="block text-xs text-slate-500 mb-1">Breakdown from</label><input id="bd_from" type="date" class="${bdInp} w-full"/></div>
        <div><label class="block text-xs text-slate-500 mb-1">Breakdown to</label><input id="bd_to" type="date" class="${bdInp} w-full"/></div>
      </div>
      <div class="mt-3 flex justify-end"><button id="bd_reset" class="${bdBtn} border border-slate-300 hover:bg-slate-50">Reset Filters</button></div>
    </div>
    <div class="${bdCard} overflow-hidden">
      <div class="hidden xl:block overflow-x-auto scroll-thin"><table class="data w-full text-sm">
        <thead><tr>${['Vehicle Name', 'Vehicle Number', 'Status', 'Breakdown Date', 'Downtime', 'Problem Description', 'Required Action / Parts', 'Remarks', 'Last Updated', 'Actions'].map(c => `<th class="text-left px-4 py-2 whitespace-nowrap">${c}</th>`).join('')}</tr></thead>
        <tbody id="bd_body"><tr><td colspan="10" class="px-4 py-8 text-center text-slate-400">Loading…</td></tr></tbody></table></div>
      <div id="bd_list" class="xl:hidden grid grid-cols-1 md:grid-cols-2 gap-3 p-3"></div>
      <div class="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-slate-200 text-sm text-slate-600">
        <div id="bd_count"></div>
        <div class="flex items-center gap-2"><button id="bd_prev" class="${bdBtn} border border-slate-300 hover:bg-slate-50">Previous</button><span id="bd_pg"></span><button id="bd_next" class="${bdBtn} border border-slate-300 hover:bg-slate-50">Next</button></div>
      </div>
    </div></div>`;

  bdEl('bd_new').onclick = () => bdOpenForm();
  bdEl('bd_pdf').onclick = () => bdExport('pdf');
  bdEl('bd_xls').onclick = () => bdExport('xlsx');
  bdEl('bd_rf').onclick = () => bdRefresh(true);
  bdEl('bd_reset').onclick = () => {
    bdF = { q: '', st: 'active', vid: '', from: '', to: '' }; bdPageNo = 0;
    ['bd_q', 'bd_from', 'bd_to'].forEach(i => bdEl(i).value = ''); bdEl('bd_st').value = 'active'; bdEl('bd_vid').value = ''; bdLoadTable();
  };
  const onF = () => { bdF.st = bdEl('bd_st').value; bdF.vid = bdEl('bd_vid').value; bdF.from = bdEl('bd_from').value; bdF.to = bdEl('bd_to').value; bdPageNo = 0; bdLoadTable(); };
  ['bd_st', 'bd_vid', 'bd_from', 'bd_to'].forEach(i => bdEl(i).onchange = onF);
  bdEl('bd_q').oninput = e => { clearTimeout(bdQTimer); bdQTimer = setTimeout(() => { bdF.q = e.target.value; bdPageNo = 0; bdLoadTable(); }, 300); };
  bdEl('bd_prev').onclick = () => { if (bdPageNo > 0) { bdPageNo--; bdLoadTable(); } };
  bdEl('bd_next').onclick = () => { if ((bdPageNo + 1) * BD_PAGE < bdTotal) { bdPageNo++; bdLoadTable(); } };
  const onAct = e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'hist') bdOpenHistory(b.dataset.v);
    else if (b.dataset.act === 'edit') bdOpenForm({ code: b.dataset.v, status: BD_OUT });
    else if (b.dataset.act === 'ok') bdOpenForm({ code: b.dataset.v, status: BD_OK });
  };
  bdEl('bd_body').addEventListener('click', onAct); bdEl('bd_list').addEventListener('click', onAct);

  try {
    const veh = await bdLoadVehicles();
    bdEl('bd_vid').innerHTML = '<option value="">All vehicles</option>' + veh.map(v => `<option value="${escapeHtml(v.code)}">${escapeHtml(v.name)} · ${escapeHtml(v.code)}</option>`).join('');
  } catch (e) { bdShowSetupError(e); }
  bdRefresh(false);
};


function bdShowSetupError(e) {
  const noUuid = e && (e.code === '42703' || /uuid_id/i.test(e.message || ''));
  const missing = e && (e.code === '42P01' || e.code === 'PGRST205' || /vehicle_breakdown_(status|summary)/i.test(e.message || ''));
  const box = bdEl('bd_err'); if (!box) return;
  box.innerHTML = `<div class="p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800">${noUuid
    ? '<b>vehicle_master has no uuid_id column yet.</b> Run <code>Database/vehicle_breakdown_status.sql</code> once in the Supabase SQL Editor, then press Refresh.'
    : missing
    ? '<b>The breakdown table has not been created yet.</b> Run <code>Database/vehicle_breakdown_status.sql</code> once in the Supabase SQL Editor, then press Refresh.'
    : '<b>Could not load breakdown data.</b> ' + escapeHtml((e && e.message) || String(e))}</div>`;
}

async function bdRefresh(force) {
  if (force) bdVehT = 0;
  await Promise.all([bdLoadCards(), bdLoadTable()]);
}
async function bdLoadCards() {
  const cards = bdEl('bd_cards'); if (!cards) return;
  try {
    const s = await bdLoadSummary(); if (!bdEl('bd_cards')) return;
    cards.innerHTML = statCard('Vehicles Out of Operation', bdNum(s.out, 0), 'ban', 'bg-red-50 text-red-600')
      + statCard('Operational Vehicles', bdNum(s.operational, 0), 'check-circle', 'bg-green-50 text-green-600')
      + statCard('Active Breakdowns', bdNum(s.active, 0), 'alert-triangle', 'bg-amber-50 text-amber-600')
      + statCard('Average Downtime (days)', bdNum(s.avgDown, 1), 'timer', 'bg-blue-50 text-blue-600');
    bdEl('bd_cardnote').textContent = `Average downtime is for vehicles broken down right now. Completed repairs took ${bdNum(s.avgRepair, 1)} days on average (${s.recovered} repaired, ${s.records} breakdown records in total).`;
    bdEl('bd_err').innerHTML = '';
    lucide.createIcons();
  } catch (e) { bdShowSetupError(e); cards.innerHTML = ''; }
}
async function bdLoadTable() {
  const body = bdEl('bd_body'); if (!body) return;
  body.innerHTML = '<tr><td colspan="10" class="px-4 py-8 text-center text-slate-400"><span class="page-loader justify-center"><i></i>Loading breakdown records…</span></td></tr>';
  const list = bdEl('bd_list'); if (list) list.innerHTML = '<div class="col-span-full py-8 text-center text-slate-400"><span class="page-loader justify-center"><i></i>Loading breakdown records…</span></div>';
  try {
    let rows = await bdFetchPage();
    if (!rows.length && bdPageNo > 0) { bdPageNo = 0; rows = await bdFetchPage(); }
    if (!bdEl('bd_body')) return;
    const emptyMsg = bdF.st === 'active' && !bdF.q && !bdF.vid && !bdF.from && !bdF.to ? 'No vehicles are currently out of operation.' : 'No records match the selected filters.';
    body.innerHTML = rows.length ? rows.map(bdRowHtml).join('')
      : `<tr><td colspan="10" class="px-4 py-10 text-center text-slate-400">${emptyMsg}</td></tr>`;
    try { lucide.createIcons(); } catch (e) { }
    if (list) list.innerHTML = rows.length ? rows.map(bdCardHtml).join('') : `<div class="col-span-full py-10 text-center text-slate-400">${emptyMsg}</div>`;
    const a = bdTotal ? bdPageNo * BD_PAGE + 1 : 0, b = Math.min(bdTotal, (bdPageNo + 1) * BD_PAGE), pages = Math.max(1, Math.ceil(bdTotal / BD_PAGE));
    bdEl('bd_count').textContent = `Showing ${a}–${b} of ${bdTotal}`;
    bdEl('bd_pg').textContent = `Page ${bdPageNo + 1} of ${pages}`;
    bdEl('bd_prev').disabled = bdPageNo === 0; bdEl('bd_next').disabled = (bdPageNo + 1) * BD_PAGE >= bdTotal;
  } catch (e) { body.innerHTML = '<tr><td colspan="10" class="px-4 py-8 text-center text-red-500">Could not load records.</td></tr>'; if (list) list.innerHTML = '<div class="col-span-full py-8 text-center text-red-500">Could not load records.</div>'; bdShowSetupError(e); }
}
function bdStatusBadge(s) {
  return s === BD_OUT ? '<span class="badge bg-red-100 text-red-700">Out of Operation</span>' : '<span class="badge bg-green-100 text-green-700">Operational</span>';
}
const bdIconBtn = (act, v, icon, tip, cls) => `<button type="button" data-act="${act}" data-v="${v}" title="${tip}" aria-label="${tip}" class="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-slate-200 transition ${cls}"><i data-lucide="${icon}" class="w-4 h-4 pointer-events-none"></i></button>`;
function bdRowHtml(r) {
  const act = r.status === BD_OUT, d = bdDown(r);
  const dc = !act ? 'bg-slate-100 text-slate-600' : d >= 14 ? 'bg-red-100 text-red-700' : d >= 7 ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700';
  const txt = v => `<td class="px-4 py-2.5 min-w-[140px] max-w-[280px] whitespace-pre-wrap break-words align-top">${v ? escapeHtml(v) : '<span class="text-slate-300">—</span>'}</td>`;
  const v = escapeHtml(r.vehicle_number);   /* vehicle code */
  return `<tr class="border-t border-slate-100 ${act ? 'bg-red-50/40' : ''}">
    <td class="px-4 py-2.5 font-medium text-navy-900 align-top">${escapeHtml(r.vehicle_name)}</td>
    <td class="px-4 py-2.5 whitespace-nowrap align-top">${escapeHtml(r.vehicle_number)}</td>
    <td class="px-4 py-2.5 whitespace-nowrap align-top">${bdStatusBadge(r.status)}</td>
    <td class="px-4 py-2.5 whitespace-nowrap align-top">${bdFmt(r.breakdown_date)}${r.recovery_date ? `<div class="text-xs text-slate-400">Recovered ${bdFmt(r.recovery_date)}</div>` : ''}</td>
    <td class="px-4 py-2.5 whitespace-nowrap align-top"><span class="badge ${dc}">${d} ${bdPlural(d)}</span></td>
    ${txt(r.problem_description)}${txt(r.required_action)}${txt(r.remarks)}
    <td class="px-4 py-2.5 whitespace-nowrap text-xs text-slate-500 align-top">${bdFmtDT(r.updated_at)}${r.updated_by ? `<div>${escapeHtml(r.updated_by)}</div>` : ''}</td>
    <td class="px-4 py-2.5 whitespace-nowrap align-top"><div class="flex gap-1.5">
      ${bdIconBtn('hist', v, 'history', 'View history', 'text-blue-600 hover:bg-blue-50')}
      ${act ? bdIconBtn('edit', v, 'pencil', 'Edit breakdown', 'text-teal-700 hover:bg-teal-50') + bdIconBtn('ok', v, 'check-circle', 'Mark Operational', 'text-green-700 hover:bg-green-50') : ''}
    </div></td></tr>`;
}

function bdCardHtml(r) {
  const act = r.status === BD_OUT, d = bdDown(r), v = escapeHtml(r.vehicle_number);
  const dc = !act ? 'bg-slate-100 text-slate-600' : d >= 14 ? 'bg-red-100 text-red-700' : d >= 7 ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700';
  const f = (l, val) => val ? `<div class="min-w-0"><div class="text-[11px] text-slate-500">${l}</div><div class="text-sm whitespace-pre-wrap break-words">${escapeHtml(val)}</div></div>` : '';
  return `<div class="rounded-xl border ${act ? 'border-red-200 bg-red-50/40' : 'border-slate-200'} p-3.5">
    <div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="font-semibold text-navy-900 break-words">${escapeHtml(r.vehicle_name)}</div><div class="text-xs text-slate-500">${escapeHtml(r.vehicle_number)}</div></div>${bdStatusBadge(r.status)}</div>
    <div class="grid grid-cols-2 gap-2 mt-3">
      <div><div class="text-[11px] text-slate-500">Breakdown date</div><div class="text-sm">${bdFmt(r.breakdown_date)}</div></div>
      <div><div class="text-[11px] text-slate-500">Downtime</div><span class="badge ${dc}">${d} ${bdPlural(d)}</span></div>
      ${r.recovery_date ? `<div><div class="text-[11px] text-slate-500">Recovered</div><div class="text-sm">${bdFmt(r.recovery_date)}</div></div>` : ''}
    </div>
    <div class="space-y-2 mt-3">${f('Problem', r.problem_description)}${f('Required action / parts', r.required_action)}${f('Remarks', r.remarks)}</div>
    <div class="text-[11px] text-slate-400 mt-3">Updated ${bdFmtDT(r.updated_at)}${r.updated_by ? ' · ' + escapeHtml(r.updated_by) : ''}</div>
    <div class="flex gap-4 mt-3 pt-3 border-t border-slate-200 text-xs font-semibold">
      <button data-act="hist" data-v="${v}" class="text-blue-600 hover:underline">History</button>
      ${act ? `<button data-act="edit" data-v="${v}" class="text-teal-700 hover:underline">Edit</button><button data-act="ok" data-v="${v}" class="text-green-700 hover:underline">Mark Operational</button>` : ''}
    </div></div>`;
}

/* ---------- Update Breakdown Status (modal) ---------- */
async function bdOpenForm(pre) {
  let veh;
  try { veh = await bdLoadVehicles(); } catch (e) { toast(e && (e.code === '42703' || /uuid_id/i.test(e.message || '')) ? 'vehicle_master has no uuid_id column yet - run Database/vehicle_breakdown_status.sql first.' : 'Could not load vehicles: ' + ((e && e.message) || e), 'error'); return; }
  const today = bdToday(), lbl = 'block text-xs font-medium text-slate-600 mb-1';
  openModal('Update Breakdown Status', `<div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
    <div class="sm:col-span-2"><label class="${lbl}">Vehicle Name *</label>
      <input id="bf_q" placeholder="Search vehicle name or number…" class="${bdInp} w-full mb-2" autocomplete="off"/>
      <select id="bf_v" class="${bdInp} w-full"></select></div>
    <div><label class="${lbl}">Vehicle Number</label><input id="bf_no" readonly class="${bdInp} w-full bg-slate-50" placeholder="Filled in when a vehicle is selected"/></div>
    <div><label class="${lbl}">Status *</label><select id="bf_st" class="${bdInp} w-full"><option value="${BD_OUT}">${BD_OUT}</option><option value="${BD_OK}">${BD_OK}</option></select></div>
    <div id="bf_info" class="sm:col-span-2 hidden text-sm rounded-lg px-3 py-2 border"></div>
    <div><label class="${lbl}">Breakdown Date *</label><input id="bf_bd" type="date" max="${today}" value="${today}" class="${bdInp} w-full"/></div>
    <div id="bf_rdw" class="hidden"><label class="${lbl}">Recovery Date *</label><input id="bf_rd" type="date" max="${today}" value="${today}" class="${bdInp} w-full"/></div>
    <div class="sm:col-span-2"><label class="${lbl}">Problem Description <span id="bf_preq">*</span></label><textarea id="bf_pd" rows="3" class="${bdInp} w-full" placeholder="What went wrong?"></textarea></div>
    <div class="sm:col-span-2"><label class="${lbl}">Required Action / Parts</label><textarea id="bf_ra" rows="2" class="${bdInp} w-full" placeholder="What must be repaired, replaced or arranged?"></textarea></div>
    <div class="sm:col-span-2"><label class="${lbl}" id="bf_rml">Remarks (optional)</label><textarea id="bf_rm" rows="2" class="${bdInp} w-full"></textarea></div>
    <div class="sm:col-span-2"><label class="${lbl}">Updated By</label><input id="bf_by" readonly class="${bdInp} w-full bg-slate-50" value="${escapeHtml(bdUser())}"/></div>
  </div>`, `<button class="${bdBtn} border border-slate-300 hover:bg-slate-100" onclick="closeModal()">Cancel</button><button id="bf_save" class="${bdBtn} bg-teal-600 hover:bg-teal-700 text-white">Save</button>`);

  let active = null, vehicle = null, seq = 0;
  const fillList = () => {
    const q = (bdEl('bf_q').value || '').toLowerCase().replace(/[^a-z0-9]/g, ''), cur = bdEl('bf_v').value;
    const l = veh.filter(v => !q || (v.name + v.code).toLowerCase().replace(/[^a-z0-9]/g, '').includes(q));
    bdEl('bf_v').innerHTML = `<option value="">Select vehicle (${l.length})</option>` + l.map(v => `<option value="${escapeHtml(v.id)}" ${v.id === cur ? 'selected' : ''}>${escapeHtml(v.name)} · ${escapeHtml(v.code)}</option>`).join('');
    if (q && l.length === 1 && bdEl('bf_v').value !== l[0].id) { bdEl('bf_v').value = l[0].id; onVeh(); }
  };
  const setInfo = (kind, html) => {
    const b = bdEl('bf_info'); if (!b) return; if (!html) { b.classList.add('hidden'); return; }
    b.className = 'sm:col-span-2 text-sm rounded-lg px-3 py-2 border ' + (kind === 'red' ? 'bg-red-50 border-red-200 text-red-800' : kind === 'green' ? 'bg-green-50 border-green-200 text-green-800' : 'bg-slate-50 border-slate-200 text-slate-600');
    b.innerHTML = html;
  };
  const syncMode = () => {
    const ok = bdEl('bf_st').value === BD_OK;
    bdEl('bf_rdw').classList.toggle('hidden', !ok);
    bdEl('bf_bd').disabled = ok && !!active;
    bdEl('bf_preq').textContent = ok ? '' : '*';
    bdEl('bf_rml').textContent = ok ? 'Remarks / repair done (optional)' : 'Remarks (optional)';
    bdEl('bf_save').textContent = ok ? 'Mark as Operational' : (active ? 'Update Active Breakdown' : 'Save Breakdown');
    bdEl('bf_save').className = `${bdBtn} text-white ${ok ? 'bg-green-600 hover:bg-green-700' : 'bg-teal-600 hover:bg-teal-700'}`;
    if (ok && vehicle && !active) setInfo('slate', 'This vehicle is already Operational — there is no active breakdown to close.');
  };
  async function onVeh() {
    const vid = bdEl('bf_v').value, my = ++seq; active = null; vehicle = veh.find(v => v.id === vid) || null;
    bdEl('bf_no').value = vehicle ? vehicle.code : '';
    if (!vehicle) { setInfo(''); syncMode(); return; }
    setInfo('slate', 'Checking current status…');
    try {
      const { data, error } = await db.from(BD_TABLE).select('*').ilike('vehicle_number', bdLike(vehicle.code)).eq('status', BD_OUT).order('breakdown_date', { ascending: true }).limit(1).maybeSingle();
      if (error) throw error; if (my !== seq || !bdEl('bf_v')) return; active = data || null;
    } catch (e) { if (my === seq) setInfo('red', 'Could not check the vehicle: ' + escapeHtml(e.message || e)); return; }
    if (active) {
      const d = bdDown(active);
      setInfo('red', `Currently <b>Out of Operation</b> since ${bdFmt(active.breakdown_date)} (${d} ${bdPlural(d)}). Saving updates this active record; use Status → Operational to close it.`);
      bdEl('bf_bd').value = active.breakdown_date; bdEl('bf_pd').value = active.problem_description || ''; bdEl('bf_ra').value = active.required_action || ''; bdEl('bf_rm').value = active.remarks || '';
    } else {
      setInfo('green', 'Currently <b>Operational</b>. Saving as Out of Operation records a new breakdown.');
      bdEl('bf_bd').value = today; bdEl('bf_pd').value = ''; bdEl('bf_ra').value = ''; bdEl('bf_rm').value = '';
    }
    syncMode();
  }
  bdEl('bf_q').oninput = fillList; bdEl('bf_v').onchange = onVeh; bdEl('bf_st').onchange = syncMode;
  bdEl('bf_save').onclick = () => save();
  fillList(); syncMode();
  if (pre && pre.status) bdEl('bf_st').value = pre.status;
  if (pre && pre.code) {
    const pv = bdVehByCode(pre.code);
    if (!pv) toast('Vehicle ' + pre.code + ' was not found in vehicle_master.', 'error');
    else {
      bdEl('bf_q').value = ''; fillList(); bdEl('bf_v').value = pv.id;
      bdEl('bf_q').classList.add('hidden');                                  /* vehicle is already chosen: no search box */
      bdEl('bf_v').disabled = true; bdEl('bf_v').classList.add('bg-slate-50');
      await onVeh();
    }
  }
  syncMode();

  async function save() {
    if (bdBusy) return;
    const g = id => bdEl(id).value.trim(), st = bdEl('bf_st').value;
    if (!vehicle) { toast('Select a vehicle.', 'error'); return; }
    const bd = bdEl('bf_bd').value, rd = bdEl('bf_rd').value, pd = g('bf_pd');
    if (st === BD_OUT) {
      if (!bd) { toast('Enter the breakdown date.', 'error'); return; }
      if (bd > today) { toast('Breakdown date cannot be in the future.', 'error'); return; }
      if (!pd) { toast('Enter the problem description.', 'error'); return; }
    } else {
      if (!rd) { toast('Enter the recovery date.', 'error'); return; }
      if (rd > today) { toast('Recovery date cannot be in the future.', 'error'); return; }
    }
    const btn = bdEl('bf_save'), btnTxt = btn.textContent; bdBusy = true; btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const { data: cur, error: ce } = await db.from(BD_TABLE).select('*').ilike('vehicle_number', bdLike(vehicle.code)).eq('status', BD_OUT).order('breakdown_date', { ascending: true }).limit(1).maybeSingle();   /* re-check right before writing */
      if (ce) throw ce;
      const common = { problem_description: pd || null, required_action: g('bf_ra') || null, remarks: g('bf_rm') || null, updated_by: bdUser() || null };
      let msg, act, rec;
      if (st === BD_OUT) {
        if (cur) {
          const { data, error } = await db.from(BD_TABLE).update({ ...common, breakdown_date: bd }).eq('id', cur.id).eq('status', BD_OUT).select().maybeSingle();
          if (error) throw error; rec = data || cur; msg = 'Active breakdown updated.'; act = 'VEHICLE_BREAKDOWN_UPDATE';
        } else {
          const { data, error } = await db.from(BD_TABLE).insert({ ...common, vehicle_id: vehicle.id, vehicle_name: vehicle.name, vehicle_number: vehicle.code, status: BD_OUT, breakdown_date: bd, recovery_date: null }).select().maybeSingle();
          if (error) throw error; rec = data; msg = 'Breakdown recorded.'; act = 'VEHICLE_BREAKDOWN_CREATE';
        }
      } else {
        if (!cur) { toast(`${vehicle.name} is already Operational.`, 'error'); return; }
        if (rd < cur.breakdown_date) { toast(`Recovery date cannot be before the breakdown date (${bdFmt(cur.breakdown_date)}).`, 'error'); return; }
        const ok = await confirmDialog(`Mark ${vehicle.name} (${vehicle.code}) as Operational? The recovery date will be recorded as ${bdFmt(rd)} after ${bdDays(cur.breakdown_date, rd)} ${bdPlural(bdDays(cur.breakdown_date, rd))} of downtime. The breakdown stays in the history.`, { title: 'Mark as Operational', confirmText: 'Mark Operational', icon: 'check-circle' });
        if (!ok) return;
        const { data, error } = await db.from(BD_TABLE).update({ ...common, status: BD_OK, recovery_date: rd }).eq('id', cur.id).eq('status', BD_OUT).select().maybeSingle();
        if (error) throw error;
        if (!data) { toast('This breakdown was already closed by someone else. Refreshing.', 'error'); closeModal(); bdRefresh(); return; }
        rec = data; msg = `${vehicle.name} is now Operational.`; act = 'VEHICLE_BREAKDOWN_RECOVER';
      }
      try { await logActivity(act, BD_TABLE, rec && rec.id, vehicle.code); } catch (e) { }
      closeModal(); toast(msg, 'success'); bdRefresh();
    } catch (e) {
      toast(e && e.code === '23505' ? `${vehicle.name} already has an active breakdown. Reopen the form to edit it.` : 'Save failed: ' + ((e && e.message) || e), 'error');
    } finally { bdBusy = false; if (bdEl('bf_save')) { btn.disabled = false; btn.textContent = btnTxt; } }
  }
}

/* ---------- breakdown history of one vehicle (modal) ---------- */
async function bdOpenHistory(vcode) {
  openModal('Breakdown History', '<div class="page-loader"><i></i>Loading history…</div>');
  try {
    const { data, error } = await db.from(BD_TABLE).select('*').ilike('vehicle_number', bdLike(vcode)).order('breakdown_date', { ascending: true }).order('created_at', { ascending: true });
    if (error) throw error;
    const rows = data || [], ev = [];
    rows.forEach(r => {
      ev.push({ d: r.breakdown_date, s: BD_OUT, t: [r.problem_description, r.required_action ? 'Needs: ' + r.required_action : ''].filter(Boolean).join(' — ') || '—' });
      if (r.recovery_date) ev.push({ d: r.recovery_date, s: BD_OK, t: r.remarks || 'Vehicle recovered', extra: `Downtime ${bdDown(r)} ${bdPlural(bdDown(r))}` });
    });
    ev.sort((a, b) => bdUtc(a.d) - bdUtc(b.d));
    const cur = rows.find(r => r.status === BD_OUT), tot = rows.reduce((n, r) => n + bdDown(r), 0), vm = bdVehByCode(vcode), name = rows.length ? rows[rows.length - 1].vehicle_name : (vm ? vm.name : 'vehicle'), code = rows.length ? rows[rows.length - 1].vehicle_number : (vm ? vm.code : '');
    const host = bdEl('modalHost'); if (!host) return;
    host.querySelector('h3').textContent = `Breakdown History — ${name} (${code})`;
    host.querySelector('.p-5').innerHTML = rows.length ? `
      <div class="flex flex-wrap gap-2 mb-3 text-xs">
        ${bdStatusBadge(cur ? BD_OUT : BD_OK)}<span class="badge bg-slate-100 text-slate-700">${rows.length} breakdown${rows.length === 1 ? '' : 's'}</span><span class="badge bg-slate-100 text-slate-700">Total downtime ${tot} ${bdPlural(tot)}</span></div>
      <div class="overflow-x-auto scroll-thin"><table class="data w-full text-sm"><thead><tr><th class="text-left px-3 py-2 whitespace-nowrap">Date</th><th class="text-left px-3 py-2">Status</th><th class="text-left px-3 py-2">Problem / Details</th></tr></thead><tbody>
      ${ev.map(e => `<tr class="border-t border-slate-100"><td class="px-3 py-2 whitespace-nowrap align-top">${bdFmt(e.d)}</td><td class="px-3 py-2 whitespace-nowrap align-top">${bdStatusBadge(e.s)}</td>
        <td class="px-3 py-2 whitespace-pre-wrap break-words align-top">${escapeHtml(e.t)}${e.extra ? `<div class="text-xs text-slate-400">${escapeHtml(e.extra)}</div>` : ''}</td></tr>`).join('')}</tbody></table></div>`
      : '<div class="text-center text-slate-400 py-8">No breakdown has been recorded for this vehicle.</div>';
  } catch (e) { const h = bdEl('modalHost'); if (h && h.querySelector('.p-5')) h.querySelector('.p-5').innerHTML = `<div class="text-red-600 text-sm">Could not load history: ${escapeHtml(e.message || e)}</div>`; }
}

/* ============================================================
   EXPORT  (data comes straight from Supabase, never from the HTML table)
   ============================================================ */
function bdScope() { return bdEl('bd_scope') && bdEl('bd_scope').value === 'all' ? { q: '', st: 'all', vid: '', from: '', to: '' } : { ...bdF }; }
function bdFilterText(f, all) {
  if (all) return 'All breakdown history (no filters)';
  const p = [`Status: ${f.st === 'active' ? 'Out of Operation' : f.st === 'recovered' ? 'Operational (repaired)' : 'All'}`];
  if (f.vid) { const v = bdVehByCode(f.vid); p.push(`Vehicle: ${v ? v.name + ' (' + v.code + ')' : f.vid}`); }
  if (f.from || f.to) p.push(`Breakdown date: ${f.from ? bdFmt(f.from) : 'start'} to ${f.to ? bdFmt(f.to) : 'today'}`);
  if (String(f.q || '').trim()) p.push(`Search: "${f.q.trim()}"`);
  return p.join(' | ');
}
const bdAscii = s => String(s == null ? '' : s).replace(/[\u2018\u2019]/g, "'").replace(/[\u201C\u201D]/g, '"').replace(/[\u2013\u2014]/g, '-').replace(/\u2026/g, '...').replace(/[^\n\u0020-\u00FF]/g, '?');
async function bdLoadLib(name) {
  if (name === 'xlsx') {
    if (window.ExcelJS) return window.ExcelJS;
    let err; for (const u of BD_LIBS.exceljs) { try { await loadScript(u); if (window.ExcelJS) return window.ExcelJS; } catch (e) { err = e; } }
    throw err || new Error('Excel library failed to load (check your connection)');
  }
  if (!(window.jspdf && window.jspdf.jsPDF)) await loadScript(BD_LIBS.jspdf);
  if (!(window.jspdf.jsPDF.API && window.jspdf.jsPDF.API.autoTable)) await loadScript(BD_LIBS.autotable);
  return window.jspdf;
}
function bdSaveBlob(blob, name) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
async function bdExport(kind) {
  if (bdBusy) return;
  const scope = bdScope(), isAll = bdEl('bd_scope').value === 'all', btn = bdEl(kind === 'pdf' ? 'bd_pdf' : 'bd_xls'), txt = btn.textContent;
  bdBusy = true; ['bd_pdf', 'bd_xls'].forEach(i => bdEl(i).disabled = true); btn.textContent = 'Preparing…';
  try {
    const [rows, sum] = await Promise.all([bdFetchAll(scope), bdLoadSummary()]);
    if (!rows.length) { toast('No records match the current selection, so there is nothing to export.', 'error'); return; }
    const info = { rows, sum, filters: bdFilterText(scope, isAll), when: new Date(), by: bdUser() };
    if (kind === 'pdf') await bdMakePdf(info); else await bdMakeXlsx(info);
    toast(`${kind === 'pdf' ? 'PDF' : 'Excel'} report downloaded (${rows.length} record${rows.length === 1 ? '' : 's'}).`, 'success');
  } catch (e) { toast('Export failed: ' + ((e && e.message) || e), 'error'); }
  finally { bdBusy = false; ['bd_pdf', 'bd_xls'].forEach(i => { const b = bdEl(i); if (b) b.disabled = false; }); if (bdEl(btn.id)) btn.textContent = txt; }
}
const bdStamp = d => { const p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}-${bdMon[d.getMonth()]}-${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };

async function bdMakePdf({ rows, sum, filters, when, by }) {
  const { jsPDF } = await bdLoadLib('pdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' }), W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight(), M = 10;
  const navy = [15, 37, 64];
  /* page-1 block: title, generation info, summary boxes */
  doc.setTextColor(...navy); doc.setFont('helvetica', 'bold'); doc.setFontSize(17); doc.text('Vehicle Breakdown Status Report', M, 28);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(71, 85, 105);
  doc.text(`Report generated: ${bdStamp(when)}${by ? '   |   Prepared by: ' + bdAscii(by) : ''}`, M, 34);
  const fl = doc.splitTextToSize('Filters applied: ' + bdAscii(filters), W - 2 * M); doc.text(fl, M, 39);
  let y = 39 + fl.length * 4 + 2;
  const boxes = [['Vehicles out of operation', bdNum(sum.out, 0), [220, 38, 38]], ['Operational vehicles', bdNum(sum.operational, 0), [22, 163, 74]], ['Active breakdowns', bdNum(sum.active, 0), [217, 119, 6]], ['Average downtime (days)', bdNum(sum.avgDown, 1), [37, 99, 235]]];
  const bw = (W - 2 * M - 3 * 4) / 4;
  boxes.forEach((b, i) => {
    const x = M + i * (bw + 4);
    doc.setDrawColor(203, 213, 225); doc.setFillColor(248, 250, 252); doc.roundedRect(x, y, bw, 15, 1.5, 1.5, 'FD');
    doc.setFillColor(...b[2]); doc.rect(x, y, 1.6, 15, 'F');
    doc.setTextColor(...b[2]); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(b[1], x + 5, y + 8);
    doc.setTextColor(71, 85, 105); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.text(b[0], x + 5, y + 12.5);
  });
  y += 19; doc.setFontSize(7.5); doc.setTextColor(100, 116, 139);
  doc.text(`Summary cards show the current fleet status. The table below lists ${rows.length} record${rows.length === 1 ? '' : 's'} matching the filters above.`, M, y); y += 3;

  const head = [['S/N', 'Vehicle Name', 'Vehicle Number', 'Breakdown Date', 'Recovery Date', 'Downtime (Days)', 'Problem Description', 'Required Action / Parts', 'Current Status', 'Remarks']];
  const body = rows.map((r, i) => [i + 1, bdAscii(r.vehicle_name), bdAscii(r.vehicle_number), bdFmt(r.breakdown_date), r.recovery_date ? bdFmt(r.recovery_date) : '-', bdDown(r), bdAscii(r.problem_description) || '-', bdAscii(r.required_action) || '-', r.status, bdAscii(r.remarks) || '-']);
  doc.autoTable({
    head, body, startY: y, margin: { top: 22, left: M, right: M, bottom: 16 }, theme: 'grid', rowPageBreak: 'avoid', showHead: 'everyPage',
    styles: { font: 'helvetica', fontSize: 7.5, cellPadding: 1.8, overflow: 'linebreak', valign: 'top', lineColor: [203, 213, 225], lineWidth: 0.1, textColor: [15, 23, 42] },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold', halign: 'center', valign: 'middle' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: { 0: { cellWidth: 9, halign: 'center' }, 1: { cellWidth: 32 }, 2: { cellWidth: 24 }, 3: { cellWidth: 22, halign: 'center' }, 4: { cellWidth: 22, halign: 'center' }, 5: { cellWidth: 17, halign: 'center' }, 6: { cellWidth: 50 }, 7: { cellWidth: 48 }, 8: { cellWidth: 27, halign: 'center' }, 9: { cellWidth: 26 } },
    didParseCell: d => { if (d.section === 'body' && d.column.index === 8) { d.cell.styles.fontStyle = 'bold'; d.cell.styles.textColor = d.cell.raw === BD_OUT ? [185, 28, 28] : [21, 128, 61]; } }
  });
  const n = doc.internal.getNumberOfPages();       /* header + footer on every page, with "Page x of y" */
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    doc.setFillColor(...navy); doc.rect(0, 0, W, 15, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.text('X Ceramics Ltd (Automobile)', M, 9.4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text('Concept of ROM  |  Vehicle Breakdown Status Report', W - M, 9.4, { align: 'right' });
    doc.setDrawColor(203, 213, 225); doc.line(M, H - 11, W - M, H - 11);
    doc.setTextColor(100, 116, 139); doc.setFontSize(8);
    doc.text(`Generated ${bdStamp(when)}${by ? ' by ' + bdAscii(by) : ''}`, M, H - 6.5);
    doc.text(`Page ${i} of ${n}`, W - M, H - 6.5, { align: 'right' });
  }
  doc.save(`Vehicle_Breakdown_Report_${bdYmd(when)}.pdf`);
}

async function bdMakeXlsx({ rows, sum, filters, when, by }) {
  const E = await bdLoadLib('xlsx'), COLS = 11, HEAD = 4;                 /* header row = row 4; rows 1-3 = title, generation info, summary */
  const wb = new E.Workbook(); wb.creator = 'X Ceramics Ltd (Automobile) - Concept of ROM'; wb.created = when;
  const ws = wb.addWorksheet('Breakdown Report', { views: [{ state: 'frozen', xSplit: 0, ySplit: HEAD, topLeftCell: 'A' + (HEAD + 1), activePane: 'bottomLeft' }] });
  [6, 28, 18, 15, 15, 12, 50, 50, 17, 35, 20].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  const navy = 'FF0F2540', line = { style: 'thin', color: { argb: 'FFCBD5E1' } }, box = { top: line, bottom: line, left: line, right: line };
  const cell = (r, c, v, o = {}) => { const x = ws.getCell(r, c); x.value = v; if (o.font) x.font = o.font; if (o.al) x.alignment = o.al; if (o.fmt) x.numFmt = o.fmt; if (o.fill) x.fill = o.fill; if (o.border) x.border = o.border; return x; };
  const lab = { font: { bold: true, color: { argb: 'FF475569' } } }, val = { font: { bold: true, size: 12, color: { argb: navy } }, al: { horizontal: 'left' } };

  ws.mergeCells(1, 1, 1, COLS); cell(1, 1, 'Vehicle Breakdown Status Report', { font: { bold: true, size: 16, color: { argb: navy } } }); ws.getRow(1).height = 24;
  ws.mergeCells(2, 1, 2, 2); cell(2, 1, 'Report generated:', lab);
  ws.mergeCells(2, 3, 2, 5); cell(2, 3, bdStamp(when) + (by ? '  (by ' + by + ')' : ''), val);
  cell(2, 6, 'Filters:', lab); ws.mergeCells(2, 7, 2, COLS); cell(2, 7, filters, { font: { color: { argb: 'FF0F172A' } } });
  ws.mergeCells(3, 1, 3, 2); cell(3, 1, 'Vehicles out of operation', lab); cell(3, 3, sum.out, val);
  ws.mergeCells(3, 4, 3, 5); cell(3, 4, 'Operational vehicles', lab); cell(3, 6, sum.operational, val);
  cell(3, 7, 'Active breakdowns', lab); cell(3, 8, sum.active, val);
  ws.mergeCells(3, 9, 3, 10); cell(3, 9, 'Average downtime (days)', lab); cell(3, 11, Math.round(sum.avgDown * 10) / 10, { ...val, fmt: '0.0' });

  ['S/N', 'Vehicle Name', 'Vehicle Number', 'Breakdown Date', 'Recovery Date', 'Downtime (Days)', 'Problem Description', 'Required Action / Parts', 'Current Status', 'Remarks', 'Last Updated'].forEach((h, i) =>
    cell(HEAD, i + 1, h, { font: { bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: navy } }, al: { horizontal: 'center', vertical: 'middle', wrapText: true }, border: box }));
  ws.getRow(HEAD).height = 30;
  const toDate = s => { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };   /* real Excel dates */
  const top = { vertical: 'top' }, wrap = { vertical: 'top', wrapText: true }, mid = { vertical: 'top', horizontal: 'center' };
  rows.forEach((r, i) => {
    const R = HEAD + 1 + i, out = r.status === BD_OUT;
    cell(R, 1, i + 1, { al: mid, border: box }); cell(R, 2, r.vehicle_name || '', { al: wrap, border: box }); cell(R, 3, r.vehicle_number || '', { al: wrap, border: box });
    cell(R, 4, toDate(r.breakdown_date), { al: mid, border: box, fmt: 'dd-mmm-yyyy' });
    cell(R, 5, r.recovery_date ? toDate(r.recovery_date) : null, { al: mid, border: box, fmt: 'dd-mmm-yyyy' });
    cell(R, 6, bdDown(r), { al: mid, border: box, fmt: '0' });
    cell(R, 7, r.problem_description || '', { al: wrap, border: box }); cell(R, 8, r.required_action || '', { al: wrap, border: box });
    cell(R, 9, r.status, { al: mid, border: box, font: { bold: true, color: { argb: out ? 'FFB91C1C' : 'FF15803D' } } });
    cell(R, 10, r.remarks || '', { al: wrap, border: box }); cell(R, 11, bdFmtDT(r.updated_at), { al: mid, border: box });
  });
  ws.autoFilter = { from: { row: HEAD, column: 1 }, to: { row: HEAD + rows.length, column: COLS } };
  const buf = await wb.xlsx.writeBuffer();
  bdSaveBlob(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Vehicle_Breakdown_Report_${bdYmd(when)}.xlsx`);
}
