/* ============ TIME-WISE VEHICLE CONSUMPTION ANALYSIS (dashboard section; dependency-free SVG) ============ */
const TW_COLORS=["#1D6FE0","#16A34A","#F59E0B","#9333EA","#DC2626","#0891B2","#DB2777","#65A30D","#EA580C","#4F46E5","#0D9488","#B45309","#7C3AED","#BE123C","#0369A1","#15803D","#A21CAF","#CA8A04","#475569","#E11D48"];
let twData=[], twHidden=new Set(), twZ=1, twColor={}, twPts=[], twInited=false, twDom=[0,1];
const twEsc=s=>escapeHtml(s==null?"":String(s));
function twTime(ms,sec){ const d=new Date(ms); let h=d.getHours(),ap=h>=12?"PM":"AM"; h=h%12||12; return h+":"+String(d.getMinutes()).padStart(2,"0")+(sec?":"+String(d.getSeconds()).padStart(2,"0"):"")+" "+ap; }
function twFillVehicles(){
  const sel=document.getElementById("twVehicle"); if(!sel) return; const cur=sel.value, seen=new Set();
  const list=(vehicleCache||[]).map(v=>({code:v.code,name:v.vehicle_name})); twData.forEach(r=>{ if(!list.some(v=>v.code===r.code)) list.push({code:r.code,name:r.vehicle_name}); });
  list.sort((a,b)=>String(a.name).localeCompare(String(b.name),undefined,{numeric:true}));
  sel.innerHTML='<option value="">All Vehicles</option>'+list.filter(v=>v.code&&!seen.has(v.code)&&seen.add(v.code)).map(v=>'<option value="'+twEsc(v.code)+'">'+twEsc(v.name||v.code)+'</option>').join("");
  sel.value=cur;
}
function twInit(){
  if(!twInited){ twInited=true; document.getElementById("twDate").value=mtToday(); document.getElementById("twDateTo").value=mtToday(); window.addEventListener("resize",()=>{clearTimeout(window._twR);window._twR=setTimeout(twDraw,200);});
    document.getElementById("twScroll").addEventListener("wheel",e=>{ if(e.ctrlKey){ e.preventDefault(); twZoom(e.deltaY<0?1.25:0.8); } },{passive:false});
    document.getElementById("twScroll").addEventListener("scroll",()=>document.getElementById("twTip").classList.add("hidden")); }
  twFillVehicles(); twLoad();
}
function twReset(){ document.getElementById("twDate").value=mtToday(); document.getElementById("twDateTo").value=mtToday(); document.getElementById("twStart").value=""; document.getElementById("twEnd").value=""; document.getElementById("twVehicle").value=""; twHidden.clear(); twLoad(); }
async function twLoad(){
  const d=document.getElementById("twDate").value, s=document.getElementById("twStart").value||"00:00", e=document.getElementById("twEnd").value||"23:59", code=document.getElementById("twVehicle").value;
  const msg="twMsg"; document.getElementById(msg).innerHTML="";
  if(!d) return showMsg(msg,"error","Please select a From Date.");
  let d2=document.getElementById("twDateTo").value; if(!d2){ d2=d; document.getElementById("twDateTo").value=d; }
  if(d2<d) return showMsg(msg,"error","To Date must not be earlier than From Date.");
  const from=new Date(d+"T"+s+":00").getTime(), to=new Date(d2+"T"+e+":59.999").getTime();
  if(to<=from) return showMsg(msg,"error","End must be after Start.");
  document.getElementById("twRange").textContent=new Date(from).toLocaleString()+"  →  "+new Date(to).toLocaleString();
  twDom=[from,to]; document.getElementById("twSvg").innerHTML='<text x="20" y="40" fill="#64748b" font-size="13">Loading…</text>';
  try{
    twData=await mtFetchAll(()=>{ let q=sb.from("diesel_data").select("id,entry_datetime,vehicle_name,code,quantity").gte("entry_datetime",new Date(from).toISOString()).lte("entry_datetime",new Date(to).toISOString()).order("entry_datetime",{ascending:true}).order("id"); if(code) q=q.eq("code",code); return q; });
    twData=twData.filter(r=>r.quantity!=null).map(r=>({...r,t:new Date(r.entry_datetime).getTime(),q:Number(r.quantity)}));
    const names=[...new Set(twData.map(r=>r.code))].sort((a,b)=>String(a).localeCompare(String(b),undefined,{numeric:true})); twColor={}; names.forEach((c,i)=>twColor[c]=TW_COLORS[i%TW_COLORS.length]);
    twHidden=new Set([...twHidden].filter(c=>names.includes(c))); twFillVehicles(); twZ=1; twRender();
    if(!twData.length) showMsg(msg,"info","No diesel transactions found for the selected dates/time/vehicle.");
  }catch(err){ console.error(err); document.getElementById("twSvg").innerHTML=""; document.getElementById("twY").innerHTML=""; showMsg(msg,"error","Error loading data: "+mtErr(err)); }
}
function twVisible(){ return twData.filter(r=>!twHidden.has(r.code)); }
function twRender(){
  const v=twVisible(), tot=v.reduce((a,r)=>a+r.q,0), mx=v.reduce((a,r)=>Math.max(a,r.q),0), nv=new Set(v.map(r=>r.code)).size;
  document.getElementById("twKpis").innerHTML=mtKpi("i-fuel","",mtFmt(tot),"Total Diesel Consumption (L)")+mtKpi("i-chart","navy",v.length,"Total Transactions")+mtKpi("i-users","green",nv,"Total Vehicles Refuelled")+mtKpi("i-gauge","amber",mtFmt(mx),"Highest Single Transaction (L)")+mtKpi("i-dashboard","navy",v.length?mtFmt(tot/v.length):"0.00","Average per Transaction (L)");
  const cnt={},nm={}; twData.forEach(r=>{cnt[r.code]=(cnt[r.code]||0)+1; nm[r.code]=r.vehicle_name;});
  document.getElementById("twLegend").innerHTML=Object.keys(cnt).sort((a,b)=>String(nm[a]).localeCompare(String(nm[b]),undefined,{numeric:true})).map(c=>'<span class="tw-chip'+(twHidden.has(c)?' off':'')+'" data-c="'+twEsc(c)+'"><i style="background:'+twColor[c]+'"></i>'+twEsc(nm[c]||c)+' ('+cnt[c]+')</span>').join("")+(twHidden.size?'<span class="tw-chip" data-all="1">Show all</span>':'');
  document.querySelectorAll("#twLegend .tw-chip").forEach(el=>el.onclick=()=>{ if(el.dataset.all) twHidden.clear(); else { const c=el.dataset.c; twHidden.has(c)?twHidden.delete(c):twHidden.add(c); } twRender(); });
  twDraw();
}
function twNice(max){ if(max<=0) return [5,1]; const steps=[1,2,5,10,20,25,50,100,200,250,500,1000]; let st=steps.find(s=>max/s<=6)||1000; return [Math.ceil(max/st)*st||st,st]; }
function twDraw(){
  const NS="http://www.w3.org/2000/svg", ys=document.getElementById("twY"), svg=document.getElementById("twSvg"), sc=document.getElementById("twScroll");
  const H=ys.getBoundingClientRect().height||360, T=16, B=58, ph=H-T-B, v=twVisible(), tip=document.getElementById("twTip"); tip.classList.add("hidden");
  let [ymax,ystep]=twNice(v.reduce((a,r)=>Math.max(a,r.q),0));
  let [d0,d1]=twDom; if(v.length&&document.getElementById("twStart").value===""&&document.getElementById("twEnd").value===""){ const ts=v.map(r=>r.t), mn=Math.min(...ts), mxT=Math.max(...ts), pad=Math.max((mxT-mn)*0.04,5*60000); d0=mn-pad; d1=mxT+pad; }
  const baseW=Math.max(sc.clientWidth||600,420), W=Math.round(baseW*twZ), L=18, R=24, pw=W-L-R, X=t=>L+(t-d0)/(d1-d0)*pw, Y=q=>T+ph-q/ymax*ph;
  svg.setAttribute("width",W); svg.setAttribute("height",H); svg.setAttribute("viewBox","0 0 "+W+" "+H);
  let s="", yy=""; for(let q=0;q<=ymax+1e-9;q+=ystep){ const y=Y(q); s+='<line x1="0" x2="'+W+'" y1="'+y+'" y2="'+y+'" stroke="#e5eaf1"/>'; yy+='<text x="50" y="'+(y+4)+'" text-anchor="end" font-size="12" fill="#475569">'+q+'</text>'; }
  yy+='<text transform="translate(12,'+(T+ph/2)+') rotate(-90)" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">Diesel Consumption (Litres)</text>'; ys.innerHTML=yy;
  const span=(d1-d0)/60000, cand=[1,2,5,10,15,20,30,60,120,180,240,360,720,1440,2880,10080], maxTicks=Math.max(2,Math.floor(pw/80)), multi=span>1560; const iv=(cand.find(c=>span/c<=maxTicks)||10080)*60000, off=new Date(d0).getTimezoneOffset()*60000;
  const MN=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  for(let t=Math.ceil((d0-off)/iv)*iv+off; t<=d1; t+=iv){ const x=X(t), dt=new Date(t); s+='<line y1="'+T+'" y2="'+(T+ph)+'" x1="'+x+'" x2="'+x+'" stroke="#eef2f7"/><text x="'+x+'" y="'+(T+ph+16)+'" text-anchor="middle" font-size="12" fill="#475569">'+twTime(t)+'</text>'+(multi?'<text x="'+x+'" y="'+(T+ph+30)+'" text-anchor="middle" font-size="11" fill="#64748b">'+dt.getDate()+" "+MN[dt.getMonth()]+'</text>':''); }
  if(span>1440){ const m0=new Date(d0); m0.setHours(24,0,0,0); for(let m=m0.getTime(); m<d1; ){ const x=X(m), dm=new Date(m); s+='<line y1="'+T+'" y2="'+(T+ph)+'" x1="'+x+'" x2="'+x+'" stroke="#94a3b8" stroke-dasharray="4 3"/><text x="'+(x+4)+'" y="'+(T+11)+'" font-size="11" font-weight="700" fill="#1F3A5F">'+dm.getDate()+" "+MN[dm.getMonth()]+'</text>'; const n=new Date(m); n.setDate(n.getDate()+1); m=n.getTime(); } }
  s+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+(T+ph)+'" y2="'+(T+ph)+'" stroke="#94a3b8"/><text x="'+(W/2)+'" y="'+(H-4)+'" text-anchor="middle" font-size="12" font-weight="700" fill="#1e293b">Time</text>';
  // identical timestamps are spread sideways so each transaction stays visible
  const grp={}; v.forEach(r=>{(grp[r.t]=grp[r.t]||[]).push(r);}); twPts=[];
  Object.values(grp).forEach(g=>g.forEach((r,i)=>{ const off=(i-(g.length-1)/2)*14; twPts.push({r,x:X(r.t)+off,y:Y(r.q)}); }));
  twPts.forEach((p,i)=>{ s+='<circle class="tw-pt" data-i="'+i+'" cx="'+p.x+'" cy="'+p.y+'" r="6" fill="'+twColor[p.r.code]+'" stroke="#fff" stroke-width="1.5"/>'; });
  if(!v.length) s+='<text x="'+(W/2)+'" y="'+(T+ph/2)+'" text-anchor="middle" font-size="14" fill="#64748b">No data to display</text>';
  svg.innerHTML=s;
  const box=document.getElementById("twBox");
  svg.querySelectorAll(".tw-pt").forEach(el=>{
    const show=ev=>{ const p=twPts[+el.dataset.i], r=p.r; el.setAttribute("r",8);
      tip.innerHTML='<b style="color:'+twColor[r.code]+'">'+twEsc(r.vehicle_name)+'</b><br>Time: '+twTime(r.t,true)+'<br>Consumption: '+mtFmt(r.q)+' L<br><span style="color:#64748b">'+new Date(r.t).toLocaleDateString()+' · '+twEsc(r.code)+'</span>';
      tip.classList.remove("hidden"); const b=box.getBoundingClientRect(), c=el.getBoundingClientRect(), tw=tip.offsetWidth, th=tip.offsetHeight;
      let x=c.left-b.left+c.width/2-tw/2, y=c.top-b.top-th-10; if(y<44) y=c.bottom-b.top+10; x=Math.max(6,Math.min(x,b.width-tw-6)); tip.style.left=x+"px"; tip.style.top=y+"px"; };
    el.addEventListener("mouseenter",show); el.addEventListener("click",show); el.addEventListener("mouseleave",()=>{el.setAttribute("r",6); tip.classList.add("hidden");});
  });
}
function twYmd(x){ return x.getFullYear()+"-"+String(x.getMonth()+1).padStart(2,"0")+"-"+String(x.getDate()).padStart(2,"0"); }
function twHm(x){ return String(x.getHours()).padStart(2,"0")+":"+String(x.getMinutes()).padStart(2,"0"); }
function twShift(dir){
  const g=id=>document.getElementById(id), d=g("twDate").value, d2=g("twDateTo").value||d, s=g("twStart").value, e=g("twEnd").value;
  if(!d) return showMsg("twMsg","error","Please select a From Date.");
  if(!s&&!e){   // whole days: move by the number of selected days
    const n=Math.round((new Date(d2+"T00:00:00")-new Date(d+"T00:00:00"))/864e5)+1, mv=x=>{ const t=new Date(x+"T00:00:00"); t.setDate(t.getDate()+dir*n); return twYmd(t); };
    g("twDate").value=mv(d); g("twDateTo").value=mv(d2);
  } else {      // move by the length of the selected window
    const f=new Date(d+"T"+(s||"00:00")+":00").getTime(), t=new Date(d2+"T"+(e||"23:59")+":59.999").getTime(), span=t-f+1, nf=new Date(f+dir*span), nt=new Date(t+dir*span);
    g("twDate").value=twYmd(nf); g("twStart").value=twHm(nf); g("twDateTo").value=twYmd(nt); g("twEnd").value=twHm(nt);
  }
  twLoad();
}
function twZoom(f){ twZ=f===0?1:Math.min(24,Math.max(1,twZ*f)); twDraw(); if(f===0) document.getElementById("twScroll").scrollLeft=0; }
function twFull(){ const b=document.getElementById("twBox"); if(document.fullscreenElement) document.exitFullscreen(); else if(b.requestFullscreen) b.requestFullscreen().then(()=>setTimeout(twDraw,150)); }
document.addEventListener("fullscreenchange",()=>setTimeout(twDraw,150));
const _twSwitch=switchPage;
switchPage=function(name){ _twSwitch(name); if(name==="timewise"&&canOpen("timewise")){ if(!twInited) twInit(); else { twFillVehicles(); twDraw(); } } };
PAGE_KEY.timewise="dieseltracker_timewise"; PAGE_META.timewise=["Time-Wise Consumption","Analytics"]; UA_KEYS.push(["dieseltracker_timewise","Time-Wise Consumption"]);
