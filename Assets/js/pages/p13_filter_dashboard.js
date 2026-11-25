/* page module (original lines 3066-3140) */
/* ============================================================
   MASTER DATA - FILTER CHANGE DASHBOARD
   ============================================================ */
ROUTES.filter_dashboard = async (host)=>{
  host.innerHTML = `
   <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-4 flex flex-wrap items-end gap-3">
     <div><label class="block mb-1 text-xs font-medium">From</label><input type="date" id="fd_from" class="border border-slate-300 rounded-lg px-3 py-2 text-sm"/></div>
     <div><label class="block mb-1 text-xs font-medium">To</label><input type="date" id="fd_to" class="border border-slate-300 rounded-lg px-3 py-2 text-sm"/></div>
     <button id="fd_apply" class="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg">Apply / refresh</button>
   </div>
   <div id="fdOut"><div class="text-slate-400 text-sm">Loading…</div></div>`;
  document.getElementById('fd_apply').addEventListener('click', fdLoad);
  await fdLoad();
};
async function fdFetchAll(){   /* reads the universal table (Filter category); one record = one entry group */
  let all=[], from=0;
  const f=document.getElementById('fd_from').value, t=document.getElementById('fd_to').value;
  for(;;){
    let q = db.from('item_replacement_history').select('entry_group_id,replacement_date,vehicle_code,vehicle_name,meter_reading,item_name,quantity')
      .eq('entry_type','Filter').order('replacement_date',{ascending:false}).order('id',{ascending:true}).range(from,from+999);
    if (f) q=q.gte('replacement_date',f); if (t) q=q.lte('replacement_date',t);
    const { data, error } = await q; if (error) throw error;
    all = all.concat(data); if (data.length<1000) break; from+=1000;
  }
  const g=new Map();
  all.forEach(r=>{ let x=g.get(r.entry_group_id); if(!x){ x={Date:r.replacement_date,code:r.vehicle_code,vehicle_name:r.vehicle_name,Meter_Reading:r.meter_reading,q:{}}; g.set(r.entry_group_id,x); }
    x.q[r.item_name]=(x.q[r.item_name]||0)+Number(r.quantity||0); });
  return [...g.values()];
}
function fdBars(items,max){
  return items.map(([l,v])=>`<div class="grid grid-cols-[120px_1fr_44px] gap-2 items-center text-sm">
    <span class="truncate">${escapeHtml(l)}</span>
    <div class="h-4 bg-slate-100 rounded-full overflow-hidden"><div class="h-full bg-teal-500 rounded-full" style="width:${max?v/max*100:0}%"></div></div><b class="text-right">${v}</b></div>`).join('');
}
function fdCols(obj){
  const k=Object.keys(obj).sort(), m=Math.max(1,...k.map(x=>obj[x]));
  return `<div class="flex items-end gap-1 h-40 overflow-x-auto pt-4">${k.map(x=>`<div title="${x}: ${obj[x]}" class="flex-1 min-w-[26px] h-full flex flex-col justify-end items-center text-[11px] text-slate-500">
    <span>${obj[x]}</span><div class="w-full bg-teal-500 rounded-t" style="height:${obj[x]/m*100}%;min-height:2px"></div><span>${x.slice(-5)}</span></div>`).join('')||'<div class="text-slate-400 text-sm">No data</div>'}</div>`;
}
async function fdLoad(){
  const out = document.getElementById('fdOut'); if(!out) return;
  out.innerHTML = '<div class="text-slate-400 text-sm">Loading…</div>';
  let rows;
  try{ rows = await fdFetchAll(); await fqLoadVehicles(); }
  catch(e){ out.innerHTML = `<div class="text-red-600 text-sm">Could not load analytics: ${escapeHtml(e.message)}</div>`; return; }
  const d=new Date(), pad=n=>String(n).padStart(2,'0'), t=`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`, mo=t.slice(0,7);
  const vm=new Map(), daily={}, monthly={}, fsum={};
  rows.forEach(r=>{
    const x=vm.get(r.code)||{name:r.vehicle_name,n:0,date:'',meter:0}; x.n++;
    if (r.Date>=x.date){ x.date=r.Date; x.meter=r.Meter_Reading; } vm.set(r.code,x);
    daily[r.Date]=(daily[r.Date]||0)+1; monthly[r.Date.slice(0,7)]=(monthly[r.Date.slice(0,7)]||0)+1;
    Object.entries(r.q).forEach(([k,n])=>fsum[k]=(fsum[k]||0)+n);
  });
  const dk=Object.keys(daily).sort().slice(-31), dailyLast={}; dk.forEach(k=>dailyLast[k]=daily[k]);
  const monthVeh=new Set(rows.filter(r=>r.Date.startsWith(mo)).map(r=>r.code)).size;
  const fmax=Math.max(1,...Object.values(fsum));
  const vrows=[...vm].sort((a,b)=>b[1].n-a[1].n).map(([c,x])=>`<tr><td class="px-4 py-2">${escapeHtml(x.name)}</td><td class="px-4 py-2 font-mono text-xs">${escapeHtml(c)}</td><td class="px-4 py-2 text-center">${x.n}</td><td class="px-4 py-2">${x.date}</td><td class="px-4 py-2">${x.meter}</td></tr>`).join('')||emptyRow(5,'No records.');
  out.innerHTML = `
   <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-4">
     ${statCard('Filter change records', rows.length, 'clipboard-list')}
     ${statCard('Registered vehicles', fqVehicles.length, 'car', 'bg-blue-50 text-blue-700')}
     ${statCard('Filter changes today', rows.filter(r=>r.Date===t).length, 'calendar-check', 'bg-amber-50 text-amber-700')}
     ${statCard('Vehicles serviced this month', monthVeh, 'wrench', 'bg-purple-50 text-purple-700')}
   </div>
   <div class="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-4">
     <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5"><h3 class="font-semibold text-navy-900 mb-3">Filters changed (total quantity)</h3>
       <div class="grid gap-2">${fdBars(Object.entries(fsum),fmax)}</div></div>
     <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5"><h3 class="font-semibold text-navy-900">Records per month</h3>${fdCols(monthly)}
       <h3 class="font-semibold text-navy-900 mt-4">Records per day (last 31 days with data)</h3>${fdCols(dailyLast)}</div>
   </div>
   ${tableCard('Vehicle-wise analysis',['Vehicle','Code','Records','Latest change','Latest meter'],vrows)}`;
  lucide.createIcons();
}


