/* page module (original lines 3620-3808) */
/* ============================================================
   DATA ENTRY DEPARTMENT - DIESEL CONSUMPTION (daily matrix + heat map)
   Tables (oil Supabase project): diesel_data (read), master (read, vehicle list)
   ============================================================ */
let dcAgg = null;   // {days:[ymd], rows:[{name,code,byDay:{},total}], dayTotals:{}, grand, vehTotal}
let dcView = [];    // rows currently displayed (after search / sort)
const dcYmd = d=>{ const p=n=>String(n).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`; };
const dcNum = n=>Number((+n||0).toFixed(2)).toLocaleString('en-US',{maximumFractionDigits:2});
const dcDayLbl = ymd=>{ const [y,m,d]=ymd.split('-').map(Number); return d+' '+new Date(y,m-1,1).toLocaleString('en-GB',{month:'short'}); };
const dcDayFull = ymd=>{ const [y,m,d]=ymd.split('-').map(Number); return d+' '+new Date(y,m-1,1).toLocaleString('en-GB',{month:'short'})+' '+y; };
/* heat colour: green -> yellow -> orange -> red, scaled to the highest cell shown */
const dcHeat = (q,max)=>{ const r=max>0?Math.min(1,q/max):0; return `hsl(${Math.round(120*(1-r))},${Math.round(70+15*r)}%,${Math.round(78-20*r)}%)`; };

ROUTES.diesel_consumption = async (host)=>{
  const inp='w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm';
  const btn='px-4 py-2 rounded-lg border border-teal-600 text-teal-700 bg-white hover:bg-teal-50 text-sm font-semibold inline-flex items-center gap-2';
  host.innerHTML=`
   <style>
     #dc_card{height:calc(100vh - 8.5rem);min-height:620px}
     .dc-wrap{flex:1 1 0;min-height:220px;min-width:0;max-width:100%;overflow:auto;border:1px solid #e2e8f0;border-radius:8px;background:#fff}
     .dc-table{border-collapse:separate;border-spacing:0;font-size:13px;white-space:nowrap;color:#0f172a;min-width:100%}
     .dc-table th,.dc-table td{padding:7px 10px;border-bottom:1px solid #e9eef4;text-align:center;font-weight:600;font-variant-numeric:tabular-nums;min-width:56px}
     .dc-table td.dc-h{border-left:1px solid #fff;border-right:1px solid #fff;border-bottom:1px solid #fff}
     .dc-table thead th{position:sticky;top:0;z-index:3;background:#eef2f7;color:#0f172a;font-weight:800;border-bottom:1px solid #cbd5e1}
     .dc-table .dc-n{position:sticky;left:0;z-index:2;background:#fff;text-align:left;font-weight:800;min-width:190px;color:#0f172a}
     .dc-table thead .dc-n{z-index:5;background:#eef2f7}
     .dc-table .dc-t{position:sticky;right:0;z-index:2;background:#eef2f7;font-weight:800;min-width:96px;color:#0f172a}
     .dc-table thead .dc-t{z-index:5}
     .dc-table .dc-e{color:#334155;font-weight:600}
     .dc-table tfoot td{position:sticky;bottom:0;z-index:3;background:#eef2f7;font-weight:800;border-top:1px solid #cbd5e1;border-bottom:0;color:#0f172a}
     .dc-table tfoot .dc-n{z-index:6}.dc-table tfoot .dc-t{z-index:6}
   </style>
   <div id="dc_card" class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 flex flex-col gap-4 min-w-0 max-w-full">
     <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl shrink-0">
       <input type="date" id="dc_f" class="${inp}"/><input type="date" id="dc_t" class="${inp}"/></div>
     <div class="flex flex-wrap gap-2 shrink-0">
       <button id="dc_today" class="${btn}">Today</button>
       <button id="dc_7" class="${btn}">Last 7 Days</button>
       <button id="dc_month" class="${btn}">This Month</button>
       <button id="dc_last" class="${btn}">Last Month</button>
       <button id="dc_apply" class="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold">Apply Filter</button>
       <button id="dc_ref" class="${btn}"><i data-lucide="refresh-cw" class="w-4 h-4"></i> Refresh</button>
       <button id="dc_xls" class="${btn}"><i data-lucide="download" class="w-4 h-4"></i> Excel</button>
       <button id="dc_pdf" class="${btn}"><i data-lucide="download" class="w-4 h-4"></i> PDF</button>
     </div>
     <div id="dc_stats" class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 shrink-0"></div>
     <div class="grid grid-cols-1 md:grid-cols-3 gap-3 shrink-0">
       <div><label class="block mb-1 text-sm font-medium">Search Vehicle</label><input id="dc_s" placeholder="Vehicle name or code" class="${inp}"/></div>
       <div><label class="block mb-1 text-sm font-medium">Sort By</label><select id="dc_sb" class="${inp}"><option value="name">Vehicle Name</option><option value="total">Total Consumption</option></select></div>
       <div><label class="block mb-1 text-sm font-medium">Order</label><select id="dc_so" class="${inp}"><option value="asc">Ascending</option><option value="desc">Descending</option></select></div>
     </div>
     <div id="dc_out" class="text-slate-400 text-sm flex-1 min-h-0 flex flex-col">Loading…</div>
     <div id="dc_leg" class="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-700 shrink-0"></div>
   </div>`;
  const now=new Date(), set=(f,t)=>{ document.getElementById('dc_f').value=f; document.getElementById('dc_t').value=t; dcLoad(); };
  const monthRange=(y,m)=>[dcYmd(new Date(y,m,1)),dcYmd(new Date(y,m+1,0))];
  document.getElementById('dc_today').onclick=()=>set(dcYmd(new Date()),dcYmd(new Date()));
  document.getElementById('dc_7').onclick=()=>{ const n=new Date(); set(dcYmd(new Date(n.getFullYear(),n.getMonth(),n.getDate()-6)),dcYmd(n)); };
  document.getElementById('dc_month').onclick=()=>{ const n=new Date(); set(...monthRange(n.getFullYear(),n.getMonth())); };
  document.getElementById('dc_last').onclick=()=>{ const n=new Date(); set(...monthRange(n.getFullYear(),n.getMonth()-1)); };
  document.getElementById('dc_apply').onclick=dcLoad;
  document.getElementById('dc_ref').onclick=dcLoad;
  document.getElementById('dc_xls').onclick=dcExcel;
  document.getElementById('dc_pdf').onclick=dcPdf;
  ['dc_s','dc_sb','dc_so'].forEach(id=>document.getElementById(id).addEventListener('input',dcRender));
  [document.getElementById('dc_f').value,document.getElementById('dc_t').value]=monthRange(now.getFullYear(),now.getMonth());
  lucide.createIcons();
  await dcLoad();
};
async function dcLoad(){
  const out=document.getElementById('dc_out'); if(!out) return;
  const f=document.getElementById('dc_f').value, t=document.getElementById('dc_t').value;
  if(!f||!t){ toast('Select both dates','error'); return; }
  if(f>t){ toast('"From" date must not be after "To" date','error'); return; }
  out.innerHTML='Loading…';
  try{
    await oeLoadVehicles();
    const lo=new Date(f+'T00:00:00').toISOString(), hi=new Date(t+'T23:59:59.999').toISOString();
    let all=[], from=0;
    for(;;){
      const { data, error } = await oilDb.from('diesel_data').select('code,vehicle_name,entry_datetime,quantity')
        .gte('entry_datetime',lo).lte('entry_datetime',hi).order('entry_datetime',{ascending:true}).order('id',{ascending:true}).range(from,from+999);
      if(error) throw error;
      all=all.concat(data||[]); if(!data||data.length<1000) break; from+=1000;
    }
    const days=[]; for(let d=new Date(f+'T00:00:00'); dcYmd(d)<=t; d.setDate(d.getDate()+1)) days.push(dcYmd(d));
    const map=new Map(); oeVehicles.forEach(v=>map.set(v.vehicle_name,{name:v.vehicle_name,code:v.code,byDay:{},total:0}));
    const dayTotals={}; let grand=0;
    all.forEach(r=>{
      const name=String(r.vehicle_name||'').trim()||String(r.code||'Unknown'), q=+r.quantity||0, day=dcYmd(new Date(r.entry_datetime));
      if(!map.has(name)) map.set(name,{name,code:String(r.code||''),byDay:{},total:0});
      const row=map.get(name); row.byDay[day]=(row.byDay[day]||0)+q; row.total+=q; dayTotals[day]=(dayTotals[day]||0)+q; grand+=q;
    });
    dcAgg={days,rows:[...map.values()],dayTotals,grand,vehTotal:oeVehicles.length};
    dcRender();
  }catch(e){ out.innerHTML=`<div class="text-red-600">Could not load diesel data: ${escapeHtml(e.message||e)}</div>`; }
}
function dcRender(){
  if(!dcAgg) return;
  const {days,rows,dayTotals,grand,vehTotal}=dcAgg;
  const s=fqNorm(document.getElementById('dc_s').value), sb=document.getElementById('dc_sb').value, so=document.getElementById('dc_so').value;
  dcView=rows.filter(r=>!s||fqNorm(r.name).includes(s)||fqNorm(r.code).includes(s));
  const dir=so==='desc'?-1:1;
  dcView.sort((a,b)=>dir*(sb==='total'?(a.total-b.total||a.name.localeCompare(b.name,undefined,{numeric:true})):a.name.localeCompare(b.name,undefined,{numeric:true})));
  /* stats (whole date range, independent of search) */
  const withEntries=rows.filter(r=>r.total>0).length;
  const topV=rows.reduce((a,r)=>r.total>(a?a.total:0)?r:a,null);
  const topD=Object.entries(dayTotals).reduce((a,e)=>e[1]>(a?a[1]:0)?e:a,null);
  const card=(l,v,sub)=>`<div class="rounded-xl border border-cyan-100 bg-cyan-50 p-4"><div class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">${l}</div><div class="text-xl font-bold text-navy-900 mt-1 break-words">${v}</div>${sub?`<div class="text-xs text-slate-500 mt-1">${sub}</div>`:''}</div>`;
  document.getElementById('dc_stats').innerHTML=
    card('Total diesel consumption',dcNum(grand)+' LTR')+
    card('Vehicles with diesel entries',withEntries,`of ${vehTotal} vehicles`)+
    card('Average daily consumption',dcNum(days.length?grand/days.length:0)+' LTR',`over ${days.length} day${days.length===1?'':'s'}`)+
    card('Highest-consumption vehicle',topV?escapeHtml(topV.name):'—',topV?dcNum(topV.total)+' LTR':'')+
    card('Highest-consumption date',topD?dcDayFull(topD[0]):'—',topD?dcNum(topD[1])+' LTR':'');
  /* heat scale: highest single cell among rows shown */
  let max=0; dcView.forEach(r=>days.forEach(d=>{ if((r.byDay[d]||0)>max) max=r.byDay[d]; }));
  const out=document.getElementById('dc_out');
  if(!dcView.length){ out.innerHTML='<div class="py-6 text-center text-slate-400">No vehicles match.</div>'; return; }
  const shownDay={}; let shownTot=0; dcView.forEach(r=>{ days.forEach(d=>{ shownDay[d]=(shownDay[d]||0)+(r.byDay[d]||0); }); shownTot+=r.total; });
  document.getElementById('dc_leg').innerHTML=`<span style="display:inline-block;width:14px;height:14px;border:1px solid #94a3b8;border-radius:3px;background:#fff"></span><span>0</span><span>Low</span><span style="width:190px;height:12px;border-radius:6px;background:linear-gradient(90deg,hsl(120,70%,78%),hsl(60,76%,72%),hsl(30,80%,66%),hsl(0,85%,58%))"></span><span>Very high (${dcNum(max)} LTR)</span><span class="font-normal text-slate-500">(green &rarr; yellow &rarr; orange &rarr; red, scaled to the highest cell shown)</span>`;
  out.innerHTML=`<div class="dc-wrap"><table class="dc-table"><thead><tr><th class="dc-n">Vehicle Name</th>${days.map(d=>`<th>${dcDayLbl(d)}</th>`).join('')}<th class="dc-t">Total (LTR)</th></tr></thead><tbody>
    ${dcView.map(r=>`<tr><td class="dc-n">${escapeHtml(r.name)}</td>${days.map(d=>{ const q=r.byDay[d]; return q>0?`<td class="dc-h" style="background:${dcHeat(q,max)}">${dcNum(q)}</td>`:'<td class="dc-e">–</td>'; }).join('')}<td class="dc-t">${dcNum(r.total)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td class="dc-n">Total Daily Consumption (LTR)</td>${days.map(d=>`<td>${dcNum(shownDay[d]||0)}</td>`).join('')}<td class="dc-t">${dcNum(shownTot)}</td></tr></tfoot></table></div>`;
}
/* export helpers — same data as shown on screen (static table with heat colours) */
function dcStaticTable(){
  const {days}=dcAgg; let max=0; dcView.forEach(r=>days.forEach(d=>{ if((r.byDay[d]||0)>max) max=r.byDay[d]; }));
  const th='style="border:1px solid #cbd5e1;padding:4px 6px;background:#f1f5f9;font-weight:bold"', td='border:1px solid #cbd5e1;padding:4px 6px;text-align:center;';
  return `<table style="border-collapse:collapse;font-family:Arial;font-size:11px"><thead><tr><th ${th}>Vehicle Name</th>${days.map(d=>`<th ${th}>${dcDayLbl(d)}</th>`).join('')}<th ${th}>Total (LTR)</th></tr></thead><tbody>
   ${dcView.map(r=>`<tr><td style="${td}text-align:left;font-weight:bold">${escapeHtml(r.name)}</td>${days.map(d=>{ const q=r.byDay[d]; return q>0?`<td style="${td}background:${dcHeat(q,max)}">${Number(q.toFixed(2))}</td>`:`<td style="${td}color:#94a3b8">–</td>`; }).join('')}<td style="${td}font-weight:bold;background:#f1f5f9">${Number(r.total.toFixed(2))}</td></tr>`).join('')}</tbody><tfoot><tr><td style="${td}text-align:left;font-weight:bold;background:#e8eef5">Total Daily Consumption (LTR)</td>${days.map(d=>`<td style="${td}font-weight:bold;background:#e8eef5">${Number(dcView.reduce((a,r)=>a+(r.byDay[d]||0),0).toFixed(2))}</td>`).join('')}<td style="${td}font-weight:bold;background:#e8eef5">${Number(dcView.reduce((a,r)=>a+r.total,0).toFixed(2))}</td></tr></tfoot></table>`;
}
function dcTitle(){ return `Diesel Consumption ${document.getElementById('dc_f').value} to ${document.getElementById('dc_t').value}`; }
function dcExcel(){
  if(!dcAgg||!dcView.length){ toast('Nothing to export','error'); return; }
  const html=`<html xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"></head><body><h3>${escapeHtml(dcTitle())}</h3>${dcStaticTable()}</body></html>`;
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['\ufeff'+html],{type:'application/vnd.ms-excel'}));
  a.download=dcTitle().replace(/\s+/g,'_')+'.xls'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),2000);
}
function dcPdf(){
  if(!dcAgg||!dcView.length){ toast('Nothing to export','error'); return; }
  const w=window.open('','_blank'); if(!w){ toast('Allow pop-ups to export the PDF','error'); return; }
  w.document.write(`<html><head><title>${escapeHtml(dcTitle())}</title><style>@page{size:A3 landscape;margin:10mm}body{font-family:Arial;margin:0}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body><h3>${escapeHtml(dcTitle())}</h3>${dcStaticTable()}</body></html>`);
  w.document.close(); w.focus(); setTimeout(()=>w.print(),400);
}

/* expose to inline handlers */
window.logout = logout;
window.toggleSidebar = toggleSidebar; window.toggleSwitcher = toggleSwitcher; window.swGo = swGo; window.swFilter = swFilter; window.swClose = swClose; window.renderHome = renderHome;
window.closeModal = closeModal;
window.viewMaintenance = viewMaintenance;
window.openMaintenanceForm = openMaintenanceForm;
window.updateMaintStatus = updateMaintStatus;
window.saveMaintenance = saveMaintenance;
window.saveMaintStatus = saveMaintStatus;
window.editPending = editPending;
window.savePending = savePending;
window.viewReq = viewReq;
window.openReqForm = openReqForm;
window.saveReq = saveReq;
window.filterReqTable = filterReqTable;
window.openROMReview = openROMReview;
window.saveROMReview = saveROMReview;
window.viewROM = viewROM;
window.filterROMTable = filterROMTable;
window.openSCSchedule = openSCSchedule;
window.saveSCSchedule = saveSCSchedule;
window.filterSCTable = filterSCTable;
window.openItemForm = openItemForm;
window.saveItem = saveItem;
window.deleteItem = deleteItem;
window.filterIMTable = filterIMTable;
window.generateReport = generateReport;
window.exportCSV = exportCSV;
window.filterUA = filterUA;
window.openUserForm = openUserForm;
window.saveUser = saveUser;
window.toggleDisable = toggleDisable;
window.deleteUser = deleteUser;
window.resetPassword = resetPassword;
window.changePwd = changePwd;
window.fqFilterTable = fqFilterTable;
window.fqShowQr = fqShowQr;
window.fqEdit = fqEdit;
window.fqDelete = fqDelete;
window.fqDownloadQr = fqDownloadQr;

lucide.createIcons();

