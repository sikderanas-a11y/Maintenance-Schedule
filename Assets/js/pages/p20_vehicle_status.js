/* page module (original lines 5056-5168) */
/* ============================================================
   VEHICLE STATUS  (read-only, per-vehicle overview)
   Reuses: oilDb.master (vehicle list), oilDb.diesel_data, item_replacement_history,
   maintenance_interval_settings + vehicle_interval_overrides (same interval rules as the Maintenance Calendar).
   ============================================================ */
let vsCfg=null, vsCur=null, vsF={st:'all',nr:false,dp:0,hp:0};
const VS_PG=15, vsNum=(n,d=0)=>Number(n||0).toLocaleString('en-US',{maximumFractionDigits:d});
const VS_ST={overdue:['Overdue','bg-red-50 text-red-700 border-red-200'],upcoming:['Upcoming','bg-orange-50 text-orange-700 border-orange-200'],ok:['Up to date','bg-green-50 text-green-700 border-green-200'],nodata:['No meter data','bg-slate-50 text-slate-600 border-slate-200'],norec:['No service record','bg-slate-50 text-slate-500 border-slate-200']};
const vsBadge=(s,t)=>`<span class="inline-block whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-md border ${VS_ST[s][1]}">${escapeHtml(t||VS_ST[s][0])}</span>`;
const vsAll=async mk=>{ let out=[]; for(let f=0;;f+=1000){ const {data,error}=await mk().range(f,f+999); if(error) throw error; out=out.concat(data||[]); if(!data||data.length<1000) break; } return out; };
const vsPl=n=>n===1?'day':'days';

ROUTES.vehicle_status = async host => {
  vsCur=null; vsCfg=null; vsF={st:'all',nr:false,dp:0,hp:0};
  host.innerHTML=`<div class="max-w-[1200px] mx-auto space-y-4"><div class="${miCard}">
    <div class="flex items-start gap-2 mb-3"><div><h3 class="text-lg font-bold text-navy-900">Vehicle Status</h3><p class="text-xs text-slate-500">Pick a type or search a vehicle to view its status</p></div>
      <button id="vs_rf" class="ml-auto border border-slate-300 hover:bg-slate-50 rounded-lg px-3 py-1.5 text-sm">Refresh</button></div>
    <div class="grid grid-cols-1 md:grid-cols-3 gap-2"><select id="vs_t" class="${miInp} w-full"></select><input id="vs_q" placeholder="Search vehicle name or code" class="${miInp} w-full"/><select id="vs_v" class="${miInp} w-full"></select></div></div>
    <div id="vs_body" class="${miCard} text-slate-400 text-sm">Loading vehicles…</div></div>`;
  const $=id=>document.getElementById(id);
  await fqLoadVehicles();
  const kinds=[...new Set(fqVehicles.map(v=>ovKind(v.vehicle_name,v.code)))].sort((a,b)=>OV_KIND_LABEL[a].localeCompare(OV_KIND_LABEL[b]));
  $('vs_t').innerHTML='<option value="">All types</option>'+kinds.map(k=>`<option value="${k}">${OV_KIND_LABEL[k]}</option>`).join('');
  const fill=()=>{ const t=$('vs_t').value, q=fqNorm($('vs_q').value), cur=$('vs_v').value;
    const l=fqVehicles.filter(v=>(!t||ovKind(v.vehicle_name,v.code)===t)&&(!q||fqNorm(v.vehicle_name).includes(q)||fqNorm(v.code).includes(q)));
    $('vs_v').innerHTML=`<option value="">Select vehicle (${l.length})</option>`+l.map(v=>`<option value="${escapeHtml(v.code)}" ${v.code===cur?'selected':''}>${escapeHtml(v.vehicle_name)} · ${escapeHtml(v.code)}</option>`).join('');
    if(l.length===1 && q && !(vsCur&&vsCur.v.code===l[0].code)){ $('vs_v').value=l[0].code; vsLoad(l[0].code); } };
  $('vs_t').onchange=fill; $('vs_q').oninput=fill; $('vs_v').onchange=e=>{ if(e.target.value) vsLoad(e.target.value); };
  $('vs_rf').onclick=()=>{ vsCfg=null; const c=$('vs_v').value; if(c) vsLoad(c); };
  $('vs_body').addEventListener('click',e=>{ const b=e.target.closest('[data-vf],[data-vp]'); if(!b) return;
    if(b.dataset.vf){ vsF.st=b.dataset.vf; } else { const [k,d]=b.dataset.vp.split(':'); vsF[k+'p']=Math.max(0,vsF[k+'p']+(+d)); } vsRender(); });
  $('vs_body').addEventListener('change',e=>{ if(e.target.id==='vs_nr'){ vsF.nr=e.target.checked; vsRender(); } });
  fill(); $('vs_body').textContent='Select a vehicle to view its status.'; $('vs_body').classList.add('text-center');
};

async function vsLoad(code){
  const body=document.getElementById('vs_body'); if(!body) return; body.className=`${miCard} text-slate-400 text-sm`; body.textContent='Loading vehicle status…'; vsF.dp=0; vsF.hp=0;
  try{
    if(!vsCfg){
      const [s,o]=await Promise.all([vsAll(()=>db.from('maintenance_interval_settings').select('*')),vsAll(()=>db.from('vehicle_interval_overrides').select('*'))]);
      const ids=[...new Set([...s.filter(x=>x.enabled).map(x=>x.item_id),...o.filter(x=>x.interval_type!=='No Interval').map(x=>x.item_id)])];
      const its=ids.length?await miInChunks('items','id',ids,'id,item_name,item_code,item_category,unit'):[];
      vsCfg={std:new Map(s.map(x=>[x.item_id,x])),ov:new Map(o.map(x=>[x.vehicle_code+'|'+x.item_id,x])),ids,im:new Map(its.map(i=>[i.id,i]))};
    }
    const v=fqVehicles.find(x=>x.code===code)||{code,vehicle_name:code};
    const [rh,dzRaw]=await Promise.all([
      vsAll(()=>db.from(RH_TABLE).select('id,replacement_date,item_id,item_name,item_code,item_category,quantity,uom,meter_reading,entry_type,created_at').eq('vehicle_code',code).order('replacement_date',{ascending:false}).order('created_at',{ascending:false}).order('id',{ascending:false})),
      vsAll(()=>oilDb.from('diesel_data').select('*').in('code',[...new Set([code,code.toUpperCase(),code.toLowerCase()])]).order('entry_datetime',{ascending:false}).order('id',{ascending:false}))]);
    const mk=dzRaw.length?(Object.keys(dzRaw[0]).find(k=>/^(meter_reading|meter|hour_meter|hmr|odometer|reading|current_meter)$/i.test(k))||Object.keys(dzRaw[0]).find(k=>/meter|hmr|odo|reading/i.test(k))):null;
    const dz=dzRaw.map(r=>({d:r.entry_datetime,q:+r.quantity||0,m:mk&&+r[mk]>0?+r[mk]:null}));
    const lastDz=dz.find(r=>r.m), cur=Math.max(lastDz?lastDz.m:0,...rh.map(r=>+r.meter_reading||0))||null;
    const eff=iid=>{ const o=vsCfg.ov.get(code+'|'+iid), s=vsCfg.std.get(iid);
      if(o) return o.interval_type==='No Interval'?null:{type:o.interval_type,val:+o.interval_value};
      return s&&s.enabled&&s.interval_type!=='No Interval'?{type:s.interval_type,val:+s.interval_value}:null; };
    const last=new Map(); rh.forEach(r=>{ if(r.item_id&&!last.has(r.item_id)) last.set(r.item_id,r); });
    const sched=[];
    vsCfg.ids.forEach(iid=>{
      const e=eff(iid); if(!e||!(e.val>0)) return; const it=vsCfg.im.get(iid)||{}, r=last.get(iid), u=MI_UNIT[e.type]||'';
      const o={name:it.item_name||(r&&r.item_name)||'—',code:it.item_code||(r&&r.item_code)||'',cat:it.item_category||(r&&r.item_category)||'',every:`Every ${vsNum(e.val)} ${u}`,
        last:r?String(r.replacement_date).slice(0,10):null,st:'norec',next:'—',left:'',over:'—',txt:''};
      if(r){
        const ld=o.last;
        if(e.type==='Days'){ const d=miParse(ld); d.setDate(d.getDate()+e.val); const k=miYmd(d), rem=calDiff(k); o.next=miFmt(k);
          if(rem<0){ o.st='overdue'; o.over=`${-rem} ${vsPl(-rem)}`; } else if(rem<=7){ o.st='upcoming'; o.left=rem===0?'Due today':`Due in ${rem} ${vsPl(rem)}`; } else { o.st='ok'; o.left=`${rem} days left`; } }
        else if(e.type==='Hours'||e.type==='Kilometers'){ const lm=+r.meter_reading;
          if(!(lm>0)||!cur){ o.st='nodata'; }
          else { const nd=lm+e.val, rem=nd-cur; o.next=`At ${vsNum(nd)} ${u}`;
            if(rem<0){ o.st='overdue'; o.over=`${vsNum(-rem)} ${u}`; } else if(rem<=e.val*0.1){ o.st='upcoming'; o.left=`${vsNum(rem)} ${u} left`; } else { o.st='ok'; o.left=`${vsNum(rem)} ${u} left`; } } }
        else if(e.type==='Diesel Litres'){ const t0=new Date(ld+'T00:00:00'), used=dz.filter(x=>new Date(x.d)>=t0).reduce((a,x)=>a+x.q,0), rem=e.val-used; o.next=`After ${vsNum(e.val)} L`;
          if(rem<0){ o.st='overdue'; o.over=`${vsNum(-rem)} L`; } else if(rem<=e.val*0.1){ o.st='upcoming'; o.left=`${vsNum(rem)} L left`; } else { o.st='ok'; o.left=`${vsNum(rem)} L left`; } }
      }
      o.txt=o.st==='upcoming'?`Upcoming · ${o.left}`:(o.st==='overdue'?'Overdue':'');
      sched.push(o);
    });
    const rank={overdue:0,upcoming:1,ok:2,nodata:3,norec:4}; sched.sort((a,b)=>rank[a.st]-rank[b.st]||a.name.localeCompare(b.name,undefined,{numeric:true}));
    vsCur={v,sched,hist:rh,dz,mk,cur,total:dz.reduce((a,x)=>a+x.q,0)};
    body.className=''; vsRender();
  }catch(err){ body.className=`${miCard} text-red-600 text-sm`; body.textContent=err.message||String(err); }
}

function vsRender(){
  const c=vsCur, body=document.getElementById('vs_body'); if(!c||!body) return;
  const {v,sched,hist,dz,mk,cur,total}=c, kind=ovKind(v.vehicle_name,v.code), cnt=s=>sched.filter(x=>x.st===s).length;
  const vis=sched.filter(x=>x.st!=='norec'||vsF.nr), shown=vis.filter(x=>vsF.st==='all'||x.st===vsF.st), hidden=sched.filter(x=>x.st==='norec').length;
  const ovl=cnt('overdue')?'overdue':cnt('upcoming')?'upcoming':cnt('ok')?'ok':null;
  const tile=(l,val)=>`<div class="min-w-0"><div class="text-[11px] text-slate-500">${l}</div><div class="text-sm font-bold text-navy-900 break-words">${val}</div></div>`;
  const th='px-3 py-2 font-semibold', td='px-3 py-2 align-top', thead=cols=>`<thead><tr class="bg-blue-50 border-b border-blue-100 text-left text-xs text-slate-600">${cols.map(x=>`<th class="${th}">${x}</th>`).join('')}</tr></thead>`;
  const chip=(f,l,n)=>`<button data-vf="${f}" class="px-2.5 py-1 rounded-full text-xs font-medium border ${vsF.st===f?'bg-navy-800 text-white border-navy-800':'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}">${l}${n==null?'':' · '+n}</button>`;
  const pager=(k,n,p)=>{ const pages=Math.max(1,Math.ceil(n/VS_PG)); return n>VS_PG?`<div class="flex items-center justify-between mt-3 text-xs text-slate-500"><span>Page ${p+1} of ${pages} · ${n} records</span><span class="flex gap-2"><button data-vp="${k}:-1" ${p<=0?'disabled':''} class="border border-slate-300 rounded-lg px-3 py-1 disabled:opacity-40">Prev</button><button data-vp="${k}:1" ${p>=pages-1?'disabled':''} class="border border-slate-300 rounded-lg px-3 py-1 disabled:opacity-40">Next</button></span></div>`:''; };
  vsF.dp=Math.min(vsF.dp,Math.max(0,Math.ceil(dz.length/VS_PG)-1)); vsF.hp=Math.min(vsF.hp,Math.max(0,Math.ceil(hist.length/VS_PG)-1));
  const nxt=x=>`<div>${escapeHtml(x.next)}</div>${x.left?`<div class="text-[11px] text-slate-400">${x.left}</div>`:''}`;
  const srows=shown.map(x=>`<tr class="border-b border-slate-100"><td class="${td}"><div class="font-medium text-slate-800">${escapeHtml(x.name)}</div><div class="text-[11px] text-slate-400">${escapeHtml(x.cat)}${x.code?' · '+escapeHtml(x.code):''}</div></td><td class="${td}">${x.every}</td><td class="${td}">${x.last?miFmt(x.last):'—'}</td><td class="${td}">${nxt(x)}</td><td class="${td} ${x.st==='overdue'?'font-semibold text-red-600':''}">${x.over}</td><td class="${td}">${vsBadge(x.st,x.txt)}</td></tr>`).join('');
  const scards=shown.map(x=>`<div class="rounded-lg border border-slate-200 p-3"><div class="flex items-start justify-between gap-2"><div class="min-w-0"><div class="font-medium text-slate-800 text-sm">${escapeHtml(x.name)}</div><div class="text-[11px] text-slate-400">${escapeHtml(x.cat)} · ${x.every}</div></div>${vsBadge(x.st,x.txt)}</div>
    <div class="grid grid-cols-2 gap-2 mt-2 text-xs"><div><div class="text-slate-500">Last service</div><b>${x.last?miFmt(x.last):'—'}</b></div><div><div class="text-slate-500">Next due</div><b>${escapeHtml(x.next)}</b></div>${x.st==='overdue'?`<div class="col-span-2 text-red-600 font-semibold">Overdue by ${x.over}</div>`:''}</div></div>`).join('');
  const dRows=dz.slice(vsF.dp*VS_PG,(vsF.dp+1)*VS_PG).map(x=>`<tr class="border-b border-slate-100"><td class="${td}">${fmtDateTime(x.d)}</td><td class="${td} text-right font-medium">${vsNum(x.q,1)}</td><td class="${td} text-right">${x.m?vsNum(x.m,1):'—'}</td></tr>`).join('');
  const hRows=hist.slice(vsF.hp*VS_PG,(vsF.hp+1)*VS_PG).map(x=>`<tr class="border-b border-slate-100"><td class="${td}">${miFmt(String(x.replacement_date).slice(0,10))}</td><td class="${td}"><span class="font-medium text-slate-800">${escapeHtml(x.item_name)}</span><span class="text-[11px] text-slate-400"> ${escapeHtml(x.item_category||'')}</span></td><td class="${td} text-right">${x.quantity!=null?vsNum(x.quantity,2)+' '+escapeHtml(x.uom||''):'—'}</td><td class="${td} text-right">${+x.meter_reading>0?vsNum(x.meter_reading,1):'—'}</td></tr>`).join('');
  const card=(t,inner)=>`<div class="${miCard}"><h4 class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-3">${t}</h4>${inner}</div>`;
  body.innerHTML=`<div class="space-y-4">
   <div class="${miCard}"><div class="flex items-center gap-3"><div class="w-16 shrink-0">${ovIcon(kind)}</div>
     <div class="min-w-0"><div class="text-lg font-bold text-navy-900 leading-tight break-words">${escapeHtml(v.vehicle_name)}</div><div class="font-mono text-xs text-slate-500">${escapeHtml(v.code)} · ${OV_KIND_LABEL[kind]}</div></div>
     <div class="ml-auto">${ovl?vsBadge(ovl,ovl==='overdue'?'OVERDUE':ovl==='upcoming'?'UPCOMING':'UP TO DATE'):''}</div></div>
     <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-slate-100">${tile('Last Service',hist.length?miFmt(String(hist[0].replacement_date).slice(0,10)):'—')}${tile('Current Meter',cur?vsNum(cur,1):'N/A')}${tile('Last Diesel',dz.length?fmtDate(dz[0].d):'—')}${tile('Total Diesel',vsNum(total,1)+' LTR')}${tile('Diesel Entries / Services',dz.length+' / '+hist.length)}</div></div>
   ${card('Scheduled Maintenance',`<div class="flex flex-wrap items-center gap-1.5 mb-3">${chip('all','All',vis.length)}${chip('overdue','Overdue',cnt('overdue'))}${chip('upcoming','Upcoming',cnt('upcoming'))}${chip('ok','Up to date',cnt('ok'))}
      <label class="ml-auto flex items-center gap-1.5 text-xs text-slate-600"><input id="vs_nr" type="checkbox" ${vsF.nr?'checked':''}/> Show items with no service record${hidden?` (${hidden})`:''}</label></div>
     ${shown.length?`<div class="hidden md:block overflow-x-auto"><table class="w-full text-sm">${thead(['Item Name','Interval','Last Service','Next Due','Overdue By','Status'])}<tbody>${srows}</tbody></table></div><div class="md:hidden space-y-2">${scards}</div>`:'<div class="py-6 text-center text-slate-400 text-sm">No scheduled maintenance items to show.</div>'}`)}
   ${card('Diesel Consumption History',dz.length?`<div class="overflow-x-auto"><table class="w-full text-sm">${thead(['Date','Quantity (LTR)','Meter Reading'].map((x,i)=>i?`<span class="block text-right">${x}</span>`:x))}<tbody>${dRows}</tbody></table></div>${pager('d',dz.length,vsF.dp)}${mk?'':'<div class="text-[11px] text-slate-400 mt-2">No meter column found in diesel records.</div>'}`:'<div class="py-4 text-center text-slate-400 text-sm">No diesel consumption records.</div>')}
   ${card('Maintenance History',hist.length?`<div class="overflow-x-auto"><table class="w-full text-sm">${thead(['Date','Item',`<span class="block text-right">Quantity</span>`,`<span class="block text-right">Meter</span>`])}<tbody>${hRows}</tbody></table></div>${pager('h',hist.length,vsF.hp)}`:'<div class="py-4 text-center text-slate-400 text-sm">No maintenance records.</div>')}
  </div>`;
}

