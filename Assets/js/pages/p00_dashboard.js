/* page module (original lines 668-840) */
/* ============================================================
   DASHBOARD
   ============================================================ */
ROUTES.dashboard = async (host)=>{
  const [v, m, reqs, sc] = await Promise.all([
    db.from('vehicle_master').select('*'),
    db.from('maintenance_records').select('*'),
    db.from('item_requirements').select('*'),
    db.from('supply_chain_schedules').select('*'),
  ]);

  const vehicles = v.data||[];
  const maint = m.data||[];
  const items = reqs.data||[];
  const sched = sc.data||[];

  const totalVehicles = vehicles.length;
  const needMaint = maint.filter(x=>x.status==='Maintenance Required').length;
  const completed = maint.filter(x=>x.status==='Completed').length;
  const pending = maint.filter(x=>x.status!=='Completed').length;
  const totalReq = items.length;
  const pendingReq = items.filter(x=>x.status==='Submitted to ROM').length;
  const romPending = items.filter(x=>x.status==='Submitted to ROM').length;
  const scPending = items.filter(x=>x.status==='Submitted to Supply Chain').length;
  const scheduled = sched.filter(x=>x.delivery_status!=='Awaiting Scheduling').length;
  const overdue = sched.filter(x=>x.expected_delivery_date && new Date(x.expected_delivery_date) < new Date() && x.delivery_status!=='Delivered').length;

  const recentMaint = maint.slice().sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,6);
  const recentReq = items.slice().sort((a,b)=>new Date(b.submission_date)-new Date(a.submission_date)).slice(0,6);

  // dept pending
  const deptPending = {
    'Automobile': pending,
    'ROM': romPending,
    'Supply Chain': scPending + sched.filter(x=>x.delivery_status==='Awaiting Scheduling').length
  };

  // chart data: maintenance by status
  const maintStatusData = {};
  maint.forEach(x=>maintStatusData[x.status]=(maintStatusData[x.status]||0)+1);
  const maintChartData = Object.entries(maintStatusData).map(([name,value])=>({name,value}));

  const reqStatusData = {};
  items.forEach(x=>reqStatusData[x.status]=(reqStatusData[x.status]||0)+1);
  const reqChartData = Object.entries(reqStatusData).map(([name,value])=>({name,value}));

  host.innerHTML = `
   <div class="space-y-6">

     <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
       ${statCard('Total Vehicles', totalVehicles, 'car','bg-navy-50 text-navy-700')}
       ${statCard('Require Maintenance', needMaint, 'wrench','bg-amber-50 text-amber-700')}
       ${statCard('Maintenance Completed', completed, 'check-circle','bg-green-50 text-green-700')}
       ${statCard('Maintenance Pending', pending, 'clock','bg-orange-50 text-orange-700')}
       ${statCard('Total Item Requirements', totalReq, 'package','bg-teal-50 text-teal-700')}
     </div>
     <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
       ${statCard('Pending Item Requirements', pendingReq, 'package-search','bg-amber-50 text-amber-700')}
       ${statCard('ROM Pending Approval', romPending, 'clipboard-check','bg-purple-50 text-purple-700')}
       ${statCard('Supply Chain Pending', scPending, 'truck','bg-blue-50 text-blue-700')}
       ${statCard('Scheduled for Delivery', scheduled, 'calendar-check','bg-cyan-50 text-cyan-700')}
       ${statCard('Overdue Deliveries', overdue, 'alert-triangle','bg-red-50 text-red-700')}
     </div>

     <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
       <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
         <h3 class="font-semibold mb-2">Maintenance Status</h3>
         <div id="chartMaint" style="height:240px"></div>
       </div>
       <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
         <h3 class="font-semibold mb-2">Item Requirement Status</h3>
         <div id="chartReq" style="height:240px"></div>
       </div>
     </div>

     <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
       ${tableCard('Recent Maintenance Activities',
         ['Vehicle','Item','Status','Required Date'],
         recentMaint.length?recentMaint.map(r=>`<tr>
           <td class="px-4 py-2">${escapeHtml(r.vehicle_name)}<div class="text-xs text-slate-400">${escapeHtml(r.registration_number)}</div></td>
           <td class="px-4 py-2">${escapeHtml(r.maintenance_item)}</td>
           <td class="px-4 py-2">${badge(r.status)}</td>
           <td class="px-4 py-2">${fmtDate(r.maintenance_required_date)}</td>
         </tr>`).join(''):emptyRow(4))}
       ${tableCard('Recent Item Requirements',
         ['Req ID','Vehicle','Item','Qty','Status'],
         recentReq.length?recentReq.map(r=>`<tr>
           <td class="px-4 py-2 font-mono text-xs">${escapeHtml(r.requirement_id)}</td>
           <td class="px-4 py-2">${escapeHtml(r.vehicle_name)}</td>
           <td class="px-4 py-2">${escapeHtml(r.item_name)}</td>
           <td class="px-4 py-2">${r.required_quantity}</td>
           <td class="px-4 py-2">${badge(r.status)}</td>
         </tr>`).join(''):emptyRow(5))}
     </div>

     <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
       ${tableCard('Department-wise Pending Activities',
         ['Department','Pending Count'],
         Object.entries(deptPending).map(([d,c])=>`<tr>
           <td class="px-4 py-2 font-medium">${escapeHtml(d)}</td>
           <td class="px-4 py-2"><span class="badge bg-amber-100 text-amber-700">${c}</span></td>
         </tr>`).join(''))}

       ${tableCard('Item Delivery Status Overview',
         ['Status','Count'],
         Object.entries(
           sched.reduce((a,x)=>{a[x.delivery_status]=(a[x.delivery_status]||0)+1;return a;},{})
         ).map(([s,c])=>`<tr>
           <td class="px-4 py-2">${badge(s)}</td>
           <td class="px-4 py-2 font-semibold">${c}</td>
         </tr>`).join('')||emptyRow(2))}
     </div>

     <div>
       ${tableCard('Upcoming Vehicle Maintenance',
         ['Vehicle','Item','Required Date','Planned Repair Date','Status'],
         maint.filter(x=>x.status!=='Completed')
              .sort((a,b)=>new Date(a.maintenance_required_date)-new Date(b.maintenance_required_date))
              .slice(0,8)
              .map(r=>`<tr>
                 <td class="px-4 py-2">${escapeHtml(r.vehicle_name)} <span class="text-xs text-slate-400">${escapeHtml(r.registration_number)}</span></td>
                 <td class="px-4 py-2">${escapeHtml(r.maintenance_item)}</td>
                 <td class="px-4 py-2">${fmtDate(r.maintenance_required_date)}</td>
                 <td class="px-4 py-2">${fmtDate(r.planned_repair_date)}</td>
                 <td class="px-4 py-2">${badge(r.status)}</td>
               </tr>`).join('')||emptyRow(5,'No upcoming maintenance'))}
     </div>
   </div>`;

  lucide.createIcons();
  renderCharts(maintChartData, reqChartData);
};

function renderCharts(maintData, reqData){
  const R = window.Recharts;
  if (!R) return;
  const Palette = ['#0f766e','#0d9488','#14b8a6','#06b6d4','#3b82f6','#8b5cf6','#f59e0b','#ef4444','#10b981','#64748b'];

  function renderPie(elId, data){
    const el = document.getElementById(elId);
    if (!el) return;
    if (!data.length){ el.innerHTML = `<div class="text-sm text-slate-400 text-center pt-12">No data</div>`; return; }
    ReactDOM?undefined:undefined;
    // Recharts UMD exposes React hooks via window.React? It bundles its own React. Use createRoot from react-dom umd if available; otherwise use simple bar via SVG fallback.
    if (!window.ReactDOM || !window.React){
      // fallback simple bar
      let max = Math.max(...data.map(d=>d.value),1);
      el.innerHTML = data.map((d,i)=>`
        <div class="flex items-center gap-3 mb-2">
          <div class="w-40 text-xs">${escapeHtml(d.name)}</div>
          <div class="flex-1 bg-slate-100 rounded h-5 relative">
            <div style="width:${(d.value/max*100)}%;background:${Palette[i%Palette.length]}" class="h-5 rounded"></div>
          </div>
          <div class="w-8 text-xs font-semibold">${d.value}</div>
        </div>`).join('');
      return;
    }
    const root = ReactDOM.createRoot(el);
    root.render(
      React.createElement(R.ResponsiveContainer, {width:'100%',height:240},
        React.createElement(R.PieChart, null,
          React.createElement(R.Pie, {data, dataKey:'value', nameKey:'name', cx:'50%',cy:'50%',outerRadius:80,label:true},
            data.map((d,i)=>React.createElement(R.Cell,{key:i,fill:Palette[i%Palette.length]}))),
          React.createElement(R.Tooltip,null),
          React.createElement(R.Legend,null)
        )
      )
    );
  }
  renderPie('chartMaint', maintData);
  renderPie('chartReq', reqData);
}

