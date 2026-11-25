/* ============ DUAL DISPENSER METER READING SYSTEM (Admin / Operator / Reconciliation) ============ */
const MT_EDIT = "dieseltracker_meter_edit", MT_DEL = "dieseltracker_meter_delete";
function mtCan(k){ return !!adminAuth && (adminAuth.isSuper || !!adminAuth.perms[k]); }
function mtFmt(n){ return (n===null||n===undefined||n==="") ? "—" : Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2}); }
function mtGap(op, ad){ return (op==null||ad==null) ? null : Math.round((Number(op)-Number(ad))*100)/100; }
function mtGapCell(g){ if(g===null) return '<span style="color:var(--muted)">Not Available</span>'; return '<b style="color:'+(g>0?'var(--warn)':g<0?'var(--err)':'var(--ok)')+'">'+(g>0?'+':'')+mtFmt(g)+'</b>'; }
function mtTypeBadge(t){ const c={dispense:["#1D4ED8","#DBEAFE"],opening:["#0F766E","#CCFBF1"],closing:["#7E22CE","#F3E8FF"]}[t]||["#475569","#E2E8F0"];
  return '<span class="ua-badge" style="background:'+c[1]+';color:'+c[0]+';text-transform:capitalize">'+escapeHtml(t||"—")+'</span>'; }
function mtGapBadge(g){ const b=(t,c,bg)=>'<span class="ua-badge" style="background:'+bg+';color:'+c+'">'+t+'</span>';
  if(g===null) return b('Not Available','#475569','#E2E8F0'); if(g>0) return b('Positive Gap','#8A5A00','var(--warn-soft)'); if(g<0) return b('Negative Gap','#9F1D1D','var(--err-soft)'); return b('Matched','#15603A','var(--ok-soft)'); }
function mtKpi(ic,cls,num,lbl){ return '<div class="kpi '+cls+'"><div class="kpi-ic"><svg class="ic"><use href="#'+ic+'"/></svg></div><div><div class="num" style="font-size:'+(String(num).length>11?'17px':'')+'">'+num+'</div><div class="lbl">'+lbl+'</div></div></div>'; }
function mtDebounce(w){ clearTimeout(window["_t"+w]); window["_t"+w]=setTimeout(()=> w==="om"?omLoad(1):rcRender(1),350); }
function mtDayStart(d){ return new Date(d+"T00:00:00").toISOString(); } function mtDayEnd(d){ return new Date(d+"T23:59:59.999").toISOString(); }
function mtToday(){ const d=new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); }
function mtErr(e){ return (e && (e.message||e.details)) || "Unexpected database error."; }
async function mtFetchAll(build){ let all=[],from=0; for(;;){ const {data,error}=await build().range(from,from+999); if(error) throw error; all=all.concat(data||[]); if(!data||data.length<1000) break; from+=1000; } return all; }

/* ---- generic modal ---- */
let mtOnOk=null;
function mtOpen(title, body, okLabel, onOk, danger){
  document.getElementById("mtTitle").textContent=title; document.getElementById("mtBody").innerHTML=body; document.getElementById("mtMsg").innerHTML="";
  const ok=document.getElementById("mtOk"); ok.textContent=okLabel; ok.style.background=danger?"var(--red)":""; ok.disabled=false; mtOnOk=onOk;
  ok.onclick=async()=>{ ok.disabled=true; const t=ok.textContent; ok.innerHTML='<span class="spinner"></span>Working...'; try{ await mtOnOk(); }catch(e){ console.error(e); showMsg("mtMsg","error",mtErr(e)); } ok.disabled=false; ok.textContent=t; };
  document.getElementById("mtModal").classList.remove("hidden");
}
function mtClose(){ document.getElementById("mtModal").classList.add("hidden"); }
function mtAck(id){ return '<label style="display:flex;gap:8px;margin-top:10px;font-size:13px;"><input type="checkbox" id="'+id+'"> I understand and confirm this change.</label>'; }

/* ================= 1) ADMIN DISPENSER METER READING (upgrades existing page) ================= */
async function dmLoadKpis(){
  const el=document.getElementById("dmKpis"); if(!el) return;
  try{
    const [l,c,u]=await Promise.all([
      sb.from("dispenser_meter_reading").select("date,last_meter_reading").order("date",{ascending:false}).order("updated_at",{ascending:false}).limit(1),
      sb.from("dispenser_meter_reading").select("id",{count:"exact",head:true}),
      sb.from("dispenser_meter_reading").select("updated_at").order("updated_at",{ascending:false,nullsFirst:false}).limit(1)]);
    if(l.error||c.error||u.error) throw (l.error||c.error||u.error);
    const r=l.data&&l.data[0];
    el.innerHTML=mtKpi("i-gauge","",r?mtFmt(r.last_meter_reading):"Not Available","Latest Admin Meter Reading (LTR)")+
      mtKpi("i-dashboard","navy",r?new Date(r.date+"T00:00:00").toLocaleDateString():"Not Available","Latest Reading Date")+
      mtKpi("i-chart","green",c.count||0,"Total Daily Records")+
      mtKpi("i-gauge","amber",(u.data&&u.data[0]&&u.data[0].updated_at)?new Date(u.data[0].updated_at).toLocaleString():"Not Available","Latest Updated Time");
  }catch(e){ showMsg("dispenserTableMsg","error","KPI error: "+mtErr(e)); }
}
function clearDispenserFilters(){ ["dmrFilterFrom","dmrFilterTo","dmrSearch"].forEach(i=>{const e=document.getElementById(i); if(e) e.value="";}); loadDispenserTable(1); }
async function loadDispenserTable(page){
  dispenserPage=Math.max(1,page); dmLoadKpis();
  const tbody=document.querySelector("#dispenserTable tbody"); document.getElementById("dispenserTableMsg").innerHTML="";
  tbody.innerHTML='<tr><td colspan="4" style="color:var(--muted);"><span class="spinner"></span> Loading...</td></tr>';
  const f=document.getElementById("dmrFilterFrom").value, t=document.getElementById("dmrFilterTo").value, s=(document.getElementById("dmrSearch").value||"").trim();
  try{
    let q=sb.from("dispenser_meter_reading").select("id,date,last_meter_reading,updated_at",{count:"exact"});
    if(s){ if(!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error("Search by date: use YYYY-MM-DD."); q=q.eq("date",s); }
    if(f) q=q.gte("date",f); if(t) q=q.lte("date",t);
    q=q.order(dispenserSortCol,{ascending:dispenserSortAsc}).range((dispenserPage-1)*DISPENSER_PAGE_SIZE,dispenserPage*DISPENSER_PAGE_SIZE-1);
    const {data,error,count}=await q; if(error) throw error;
    currentDispenserRows=data||[];
    const canE=mtCan(MT_EDIT);
    tbody.innerHTML=currentDispenserRows.length?currentDispenserRows.map(r=>'<tr><td>'+new Date(r.date+"T00:00:00").toLocaleDateString()+'</td><td>'+mtFmt(r.last_meter_reading)+'</td><td>'+(r.updated_at?new Date(r.updated_at).toLocaleString():"-")+'</td><td>'+
      (canE?'<button class="btn small outline" onclick="dmEdit(\''+r.id+'\')">Edit</button>':'<span style="color:var(--muted)">View only</span>')+'</td></tr>').join(""):
      '<tr><td colspan="4" style="color:var(--muted);">No dispenser meter readings found.</td></tr>';
    const tp=Math.max(1,Math.ceil((count||0)/DISPENSER_PAGE_SIZE));
    document.getElementById("dispenserPageInfo").textContent=(count||0)+" record(s) — page "+dispenserPage+" of "+tp;
    document.getElementById("dispenserPrevBtn").disabled=dispenserPage<=1; document.getElementById("dispenserNextBtn").disabled=dispenserPage>=tp;
  }catch(e){ tbody.innerHTML=""; showMsg("dispenserTableMsg","error",mtErr(e)); }
}
async function dmEdit(id){
  const r=currentDispenserRows.find(x=>String(x.id)===String(id)); if(!r) return;
  if(!mtCan(MT_EDIT)) return alert("You do not have permission to edit meter readings.");
  const {count}=await sb.from("diesel_data").select("id",{count:"exact",head:true}).gte("entry_datetime",mtDayStart(r.date)).not("admin_reading","is",null);
  const {data:lat}=await sb.from("dispenser_meter_reading").select("id").order("date",{ascending:false}).limit(1);
  const isLatest=lat&&lat[0]&&String(lat[0].id)===String(r.id);
  mtOpen("Edit Admin Meter Reading",
   '<div class="grid-2"><div class="field"><label>Date</label><input type="date" id="dmeDate" value="'+r.date+'"></div><div class="field"><label>Last Meter Reading (LTR)</label><input type="number" step="0.01" id="dmeRead" value="'+r.last_meter_reading+'"></div></div>'+
   '<div class="msg info" style="display:block;margin-top:8px;font-size:12.5px;">This updates the existing record only (no new record). <b>'+(count||0)+'</b> historical diesel transaction(s) on/after this date store their own Admin Reading — they will <b>not</b> be changed or recalculated.'+
   (isLatest?' This is the <b>latest</b> record, so <b>all new diesel entries will continue from the value you save</b>.':'')+'</div>'+mtAck("dmeAck"),
   "Save",async()=>{
    const d=document.getElementById("dmeDate").value, v=parseFloat(document.getElementById("dmeRead").value);
    if(!d||isNaN(v)||v<0) throw new Error("Valid date and meter reading are required.");
    if(!document.getElementById("dmeAck").checked) throw new Error("Please tick the confirmation box.");
    const {data:dup}=await sb.from("dispenser_meter_reading").select("id").eq("date",d).neq("id",r.id).limit(1);
    if(dup&&dup.length) throw new Error("Another record already exists for "+d+". Duplicate dates are not allowed.");
    const {error}=await sb.from("dispenser_meter_reading").update({date:d,last_meter_reading:v,updated_at:new Date().toISOString()}).eq("id",r.id);
    if(error) throw error; mtClose(); showMsg("dispenserTableMsg","success","Record updated successfully."); loadDispenserTable(dispenserPage);
   });
}

/* ================= 2) OPERATOR DISPENSER METER READING ================= */
let omPage=1, omSortCol="entry_datetime", omSortAsc=false, omRows=[], omOps=[]; const OM_SIZE=15;
function omClear(){ ["omSearch","omOperator","omType","omFrom","omTo"].forEach(i=>document.getElementById(i).value=""); omLoad(1); }
function omSort(c){ if(omSortCol===c) omSortAsc=!omSortAsc; else{omSortCol=c;omSortAsc=false;} ["entry_datetime","meter_reading"].forEach(k=>document.getElementById("omA_"+k).textContent=k===omSortCol?(omSortAsc?"▲":"▼"):""); omLoad(1); }
async function omKpis(){
  const cnt=t=>{let q=sb.from("operator_dispenser_meter_reading").select("id",{count:"exact",head:true}); return t?q.eq("reading_type",t):q;};
  const [a,o,d,c,l]=await Promise.all([cnt(),cnt("opening"),cnt("dispense"),cnt("closing"),
    sb.from("operator_dispenser_meter_reading").select("operator_name,meter_reading,entry_datetime").order("entry_datetime",{ascending:false}).limit(1)]);
  const e=a.error||o.error||d.error||c.error||l.error; if(e) throw e; const r=l.data&&l.data[0];
  document.getElementById("omKpis").innerHTML=mtKpi("i-hardhat","",a.count||0,"Total Records")+mtKpi("i-gauge","navy",o.count||0,"Opening Records")+mtKpi("i-fuel","green",d.count||0,"Dispense Records")+mtKpi("i-lock","amber",c.count||0,"Closing Records")+
    mtKpi("i-gauge","",r?mtFmt(r.meter_reading):"Not Available","Latest Operator Reading"+(r?" — "+escapeHtml(r.operator_name):""));
}
async function omLoad(page,refreshOps){
  omPage=Math.max(1,page||1); const tb=document.querySelector("#omTable tbody"); document.getElementById("omMsg").innerHTML="";
  tb.innerHTML='<tr><td colspan="6" style="color:var(--muted);"><span class="spinner"></span> Loading...</td></tr>';
  try{
    if(refreshOps||!omOps.length){ const rows=await mtFetchAll(()=>sb.from("operator_dispenser_meter_reading").select("operator_name").order("id")); omOps=[...new Set(rows.map(r=>r.operator_name).filter(Boolean))].sort();
      const sel=document.getElementById("omOperator"), cur=sel.value; sel.innerHTML='<option value="">All</option>'+omOps.map(n=>'<option>'+escapeHtml(n)+'</option>').join(""); sel.value=cur; }
    omKpis().catch(e=>showMsg("omMsg","error",mtErr(e)));
    const s=document.getElementById("omSearch").value.trim(), op=document.getElementById("omOperator").value, ty=document.getElementById("omType").value, f=document.getElementById("omFrom").value, t=document.getElementById("omTo").value;
    let q=sb.from("operator_dispenser_meter_reading").select("id,operator_name,entry_datetime,meter_reading,reading_type",{count:"exact"});
    if(s) q=q.ilike("operator_name","%"+s+"%"); if(op) q=q.eq("operator_name",op); if(ty) q=q.eq("reading_type",ty);
    if(f) q=q.gte("entry_datetime",mtDayStart(f)); if(t) q=q.lte("entry_datetime",mtDayEnd(t));
    q=q.order(omSortCol,{ascending:omSortAsc}).order("id",{ascending:false}).range((omPage-1)*OM_SIZE,omPage*OM_SIZE-1);
    const {data,error,count}=await q; if(error) throw error; omRows=data||[];
    const cE=mtCan(MT_EDIT), cD=mtCan(MT_DEL);
    tb.innerHTML=omRows.length?omRows.map(r=>'<tr><td>'+r.id+'</td><td>'+escapeHtml(r.operator_name)+'</td><td>'+new Date(r.entry_datetime).toLocaleString()+'</td><td>'+mtFmt(r.meter_reading)+'</td><td>'+mtTypeBadge(r.reading_type)+'</td><td style="white-space:nowrap">'+
      (cE?'<button class="btn small outline" style="margin-right:6px" onclick="omEdit('+r.id+')">Edit</button>':'')+(cD?'<button class="btn small" style="background:var(--red)" onclick="omDelete('+r.id+')">Delete</button>':'')+((!cE&&!cD)?'<span style="color:var(--muted)">View only</span>':'')+'</td></tr>').join(""):
      '<tr><td colspan="6" style="color:var(--muted);">No operator meter readings found.</td></tr>';
    const tp=Math.max(1,Math.ceil((count||0)/OM_SIZE)); document.getElementById("omInfo").textContent=(count||0)+" record(s) — page "+omPage+" of "+tp;
    document.getElementById("omPrev").disabled=omPage<=1; document.getElementById("omNext").disabled=omPage>=tp;
  }catch(e){ tb.innerHTML=""; showMsg("omMsg","error",mtErr(e)); }
}
async function omRefCount(r){
  const day=new Date(r.entry_datetime), ds=new Date(day.getFullYear(),day.getMonth(),day.getDate()).toISOString(), de=new Date(day.getFullYear(),day.getMonth(),day.getDate(),23,59,59,999).toISOString();
  const {count}=await sb.from("diesel_data").select("id",{count:"exact",head:true}).eq("operator_name",r.operator_name).gte("entry_datetime",ds).lte("entry_datetime",de).not("operator_reading","is",null); return count||0;
}
async function omEdit(id){
  const r=omRows.find(x=>x.id===id); if(!r) return; if(!mtCan(MT_EDIT)) return alert("You do not have permission to edit.");
  const n=await omRefCount(r);
  mtOpen("Edit Operator Meter Reading #"+r.id,
   '<div class="grid-2"><div class="field"><label>Operator Name</label><input type="text" id="omeName" list="omeOps" value="'+escapeHtml(r.operator_name)+'"><datalist id="omeOps">'+omOps.map(o=>'<option value="'+escapeHtml(o)+'">').join("")+'</datalist></div>'+
   '<div class="field"><label>Entry Date &amp; Time</label><input type="datetime-local" id="omeDt" value="'+dtToLocalInputValue(new Date(r.entry_datetime))+'"></div>'+
   '<div class="field"><label>Meter Reading (LTR)</label><input type="number" step="0.01" id="omeRead" value="'+r.meter_reading+'"></div>'+
   '<div class="field"><label>Reading Type</label><select id="omeType">'+["opening","dispense","closing"].map(t=>'<option value="'+t+'"'+(t===r.reading_type?" selected":"")+'>'+t.charAt(0).toUpperCase()+t.slice(1)+'</option>').join("")+'</select></div></div>'+
   '<div class="msg '+(n?'error':'info')+'" style="display:block;margin-top:8px;font-size:12.5px;">'+(n?'<b>Warning:</b> '+n+' diesel transaction(s) by this operator on this day store Operator Readings derived from this duty. ':'')+'They will <b>not</b> be modified or recalculated; only this record is updated (no new record).</div>'+(n?mtAck("omeAck"):""),
   "Save",async()=>{
    const name=document.getElementById("omeName").value.trim(), dt=document.getElementById("omeDt").value, v=parseFloat(document.getElementById("omeRead").value), ty=document.getElementById("omeType").value;
    if(!name||!dt||isNaN(v)||v<0) throw new Error("Operator, date/time and a valid reading are required.");
    if(!["opening","dispense","closing"].includes(ty)) throw new Error("Invalid reading type.");
    if(n&&!document.getElementById("omeAck").checked) throw new Error("Please tick the confirmation box.");
    const {error}=await sb.from("operator_dispenser_meter_reading").update({operator_name:name,entry_datetime:new Date(dt).toISOString(),meter_reading:v,reading_type:ty}).eq("id",r.id);
    if(error) throw error; mtClose(); showMsg("omMsg","success","Record #"+r.id+" updated successfully."); omLoad(omPage,true);
   });
}
async function omDelete(id){
  const r=omRows.find(x=>x.id===id); if(!r) return; if(!mtCan(MT_DEL)) return alert("You do not have permission to delete.");
  const n=await omRefCount(r);
  mtOpen("Delete Operator Meter Reading?",
   '<table class="data-table"><tbody><tr><td><b>Operator</b></td><td>'+escapeHtml(r.operator_name)+'</td></tr><tr><td><b>Entry Date/Time</b></td><td>'+new Date(r.entry_datetime).toLocaleString()+'</td></tr><tr><td><b>Meter Reading</b></td><td>'+mtFmt(r.meter_reading)+' L</td></tr><tr><td><b>Reading Type</b></td><td>'+escapeHtml(r.reading_type)+'</td></tr></tbody></table>'+
   '<div class="msg error" style="display:block;margin-top:8px;font-size:12.5px;">This permanently deletes only this record.'+(n?' <b>'+n+'</b> related diesel transaction(s) exist on this day; they are kept unchanged and reconciliation may show missing readings.':' Historical diesel transactions are not changed.')+'</div>'+mtAck("omdAck"),
   "Delete Permanently",async()=>{
    if(!document.getElementById("omdAck").checked) throw new Error("Please tick the confirmation box.");
    const {error}=await sb.from("operator_dispenser_meter_reading").delete().eq("id",r.id); if(error) throw error;
    mtClose(); showMsg("omMsg","success","Record #"+r.id+" deleted."); omLoad(omPage,true);
   },true);
}

/* ================= 3) DISPENSER METER RECONCILIATION ================= */
let rcAll=[], rcView=[], rcPage=1; const RC_SIZE=15;
function rcInit(){ const f=document.getElementById("rcFrom"),t=document.getElementById("rcTo"); if(!f.value){ const d=new Date(); d.setDate(d.getDate()-29); f.value=d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); t.value=mtToday(); } rcLoad(); }
async function rcLoad(){
  const tb=document.querySelector("#rcTable tbody"); document.getElementById("rcMsg").innerHTML="";
  tb.innerHTML='<tr><td colspan="9" style="color:var(--muted);"><span class="spinner"></span> Loading...</td></tr>';
  const f=document.getElementById("rcFrom").value, t=document.getElementById("rcTo").value;
  try{
    rcAll=await mtFetchAll(()=>{ let q=sb.from("diesel_data").select("id,entry_datetime,operator_name,vehicle_name,code,quantity,admin_reading,operator_reading").order("entry_datetime",{ascending:false}).order("id");
      if(f) q=q.gte("entry_datetime",mtDayStart(f)); if(t) q=q.lte("entry_datetime",mtDayEnd(t)); return q; });
    rcAll=rcAll.map(r=>({...r,rtype:"dispense"}));   // every diesel_data transaction is a Dispense
    // Opening / Closing physical readings come from the operator table (its own dispense rows are the same transactions, so not added again)
    const ops=await mtFetchAll(()=>{ let q=sb.from("operator_dispenser_meter_reading").select("id,operator_name,entry_datetime,meter_reading,reading_type").in("reading_type",["opening","closing"]).order("id");
      if(f) q=q.gte("entry_datetime",mtDayStart(f)); if(t) q=q.lte("entry_datetime",mtDayEnd(t)); return q; });
    rcAll=rcAll.concat(ops.map(o=>({id:"o"+o.id,entry_datetime:o.entry_datetime,operator_name:o.operator_name,vehicle_name:null,code:null,quantity:null,admin_reading:null,operator_reading:o.meter_reading,rtype:o.reading_type})))
      .sort((a,b)=>new Date(b.entry_datetime)-new Date(a.entry_datetime));
    const sel=document.getElementById("rcOperator"), cur=sel.value; sel.innerHTML='<option value="">All</option>'+[...new Set(rcAll.map(r=>r.operator_name).filter(Boolean))].sort().map(n=>'<option>'+escapeHtml(n)+'</option>').join(""); sel.value=cur;
    rcRender(1); rcKpis(f,t).catch(e=>showMsg("rcMsg","error","KPI error: "+mtErr(e)));
  }catch(e){ tb.innerHTML=""; showMsg("rcMsg","error",mtErr(e)); }
}
async function rcKpis(f,t){
  const today=mtToday();
  const [a,o,td,du]=await Promise.all([
    sb.from("dispenser_meter_reading").select("last_meter_reading,date").order("date",{ascending:false}).order("updated_at",{ascending:false}).limit(1),
    sb.from("diesel_data").select("operator_name,entry_datetime,admin_reading,operator_reading").not("operator_reading","is",null).order("entry_datetime",{ascending:false}).limit(1),
    mtFetchAll(()=>sb.from("diesel_data").select("quantity,id").gte("entry_datetime",mtDayStart(today)).lte("entry_datetime",mtDayEnd(today)).order("id")),
    (()=>{let q=sb.from("operator_dispenser_meter_reading").select("id",{count:"exact",head:true}).eq("reading_type","opening"); if(f) q=q.gte("entry_datetime",mtDayStart(f)); if(t) q=q.lte("entry_datetime",mtDayEnd(t)); return q;})()]);
  const e=a.error||o.error||du.error; if(e) throw e; const ad=a.data&&a.data[0], op=o.data&&o.data[0];
  const g=op?mtGap(op.operator_reading,op.admin_reading):null;
  document.getElementById("rcKpis").innerHTML=mtKpi("i-gauge","",ad?mtFmt(ad.last_meter_reading):"Not Available","Latest Admin Reading (LTR)")+
    mtKpi("i-hardhat","navy",op?mtFmt(op.operator_reading):"Not Available","Latest Operator Reading"+(op?" — "+escapeHtml(op.operator_name):""))+
    mtKpi("i-chart","amber",g===null?"Not Available":(g>0?"+":"")+mtFmt(g),"Current Meter Gap (latest matched transaction)")+
    mtKpi("i-fuel","green",mtFmt(td.reduce((s,r)=>s+Number(r.quantity||0),0)),"Today's Diesel Dispensed (L)")+
    mtKpi("i-users","navy",du.count||0,"Recorded Operator Duties (period)");
}
function rcRender(page){
  rcPage=Math.max(1,page||1); const s=document.getElementById("rcSearch").value.trim().toLowerCase(), op=document.getElementById("rcOperator").value, gf=document.getElementById("rcGap").value, ty=document.getElementById("rcType").value;
  rcView=rcAll.map(r=>({...r,gap:mtGap(r.operator_reading,r.admin_reading)})).filter(r=>(!op||r.operator_name===op)&&(!ty||r.rtype===ty)&&
    (!s||[r.vehicle_name,r.code,r.operator_name].some(x=>(x||"").toLowerCase().includes(s)))&&
    (!gf||(gf==="pos"&&r.gap!==null&&r.gap>0)||(gf==="neg"&&r.gap!==null&&r.gap<0)||(gf==="zero"&&r.gap===0)));
  const tp=Math.max(1,Math.ceil(rcView.length/RC_SIZE)); rcPage=Math.min(rcPage,tp);
  const rows=rcView.slice((rcPage-1)*RC_SIZE,rcPage*RC_SIZE), tb=document.querySelector("#rcTable tbody");
  tb.innerHTML=rows.length?rows.map(r=>'<tr><td>'+new Date(r.entry_datetime).toLocaleString()+'</td><td>'+escapeHtml(r.operator_name)+'</td><td>'+mtTypeBadge(r.rtype)+'</td><td>'+(r.vehicle_name?escapeHtml(r.vehicle_name):"—")+'</td><td>'+(r.admin_reading==null?'<span style="color:var(--muted)">Not Available</span>':mtFmt(r.admin_reading))+'</td><td>'+(r.operator_reading==null?'<span style="color:var(--muted)">Not Available</span>':mtFmt(r.operator_reading))+'</td><td>'+mtGapCell(r.gap)+'</td><td>'+mtFmt(r.quantity)+'</td><td>'+mtGapBadge(r.gap)+'</td></tr>').join(""):
    '<tr><td colspan="9" style="color:var(--muted);">No transactions match the filters.</td></tr>';
  document.getElementById("rcInfo").textContent=rcView.length+" record(s) — page "+rcPage+" of "+tp;
  document.getElementById("rcPrev").disabled=rcPage<=1; document.getElementById("rcNext").disabled=rcPage>=tp;
}

/* ---- navigation hooks (extend, never replace) ---- */
const _mtSwitch=switchPage;
switchPage=function(name){ _mtSwitch(name); if(name==="opmeter") omLoad(1,true); if(name==="recon") rcInit(); };
PAGE_KEY.opmeter="dieseltracker_operator_meter"; PAGE_KEY.recon="dieseltracker_reconciliation";
PAGE_META.dispenser=["Admin Dispenser Meter Reading","Operations"]; PAGE_META.opmeter=["Operator Dispenser Meter Reading","Operations"]; PAGE_META.recon=["Dispenser Meter Reconciliation","Operations"];
UA_KEYS.push(["dieseltracker_operator_meter","Operator Meter Reading"],["dieseltracker_reconciliation","Meter Reconciliation"],["dieseltracker_meter_edit","Edit Meter Readings"],["dieseltracker_meter_delete","Delete Operator Readings"]);
