/* page module (original lines 2867-3065) */
/* ================= A4 vehicle ID cards (85x55 mm, 2x3 per page) ================= */
const FQ_CARD = {W:85, H:55, QS:52, M:1.5, GX:8, GY:8, COLS:2, ROWS:3};
let fqSel = new Set(), fqGenFilter = 'all', fqGenQ = '';
const FQ_GEN_FILTERS = [['all','All Vehicles'],['FL','Forklifts'],['DT','Dump Trucks'],['EX','Excavators'],['R','Rental']];

function fqGenVisible(){
  const q = fqGenQ.trim().toLowerCase();
  return fqVehicles.filter(v=>{
    const c = String(v.code||'').toUpperCase();
    const okF = fqGenFilter==='all' || (fqGenFilter==='R' ? c.slice(-1)==='R' : c.slice(1,3)===fqGenFilter);
    return okF && (!q || (v.vehicle_name+' '+v.code).toLowerCase().includes(q));
  });
}
function fqGenInit(){
  const host = document.getElementById('fqGen'); if(!host) return;
  host.innerHTML = `<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center"><i data-lucide="qr-code" class="w-5 h-5"></i></div>
        <div><h3 class="font-semibold text-navy-900">Generate QR Codes</h3><p class="text-xs text-slate-500">Select vehicles to generate printable A4 ID cards (85 × 55 mm, 6 cards per page).</p></div>
      </div>
      <div class="flex items-center gap-3 text-sm">
        <span class="px-3 py-1 rounded-full bg-teal-50 text-teal-800"><b id="fqGenCnt">0 selected</b></span>
        <span class="text-slate-500">of <span id="fqGenTot">0</span> vehicles</span>
        <button type="button" id="fqGenAll" class="text-teal-700 font-medium hover:underline">Select All</button><span class="text-slate-300">|</span>
        <button type="button" id="fqGenNone" class="text-teal-700 font-medium hover:underline">Deselect All</button>
      </div>
    </div>
    <input id="fqGenSearch" placeholder="Search vehicle name or code…" class="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm mb-3"/>
    <div id="fqGenChips" class="flex flex-wrap gap-2 mb-2"></div>
    <div class="flex justify-between text-xs text-slate-500 mb-2"><span>Showing <b id="fqGenShow">0</b> vehicles</span><span>Select All / Deselect All apply to the vehicles currently shown.</span></div>
    <div id="fqGenGrid" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 max-h-[420px] overflow-auto border border-slate-200 rounded-lg p-2"></div>
    <div class="flex justify-end mt-4"><button type="button" id="fqGenBtn" class="bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg px-5 py-2.5 text-sm flex items-center gap-2"><i data-lucide="qr-code" class="w-4 h-4"></i><span>Generate QR</span></button></div>
  </div>`;
  lucide.createIcons();
  document.getElementById('fqGenSearch').addEventListener('input', e=>{ fqGenQ=e.target.value; fqGenUpdate(); });
  document.getElementById('fqGenAll').addEventListener('click', ()=>{ fqGenVisible().forEach(v=>fqSel.add(v.code)); fqGenUpdate(); });
  document.getElementById('fqGenNone').addEventListener('click', ()=>{ fqGenVisible().forEach(v=>fqSel.delete(v.code)); fqGenUpdate(); });
  document.getElementById('fqGenChips').addEventListener('click', e=>{ const b=e.target.closest('button[data-f]'); if(!b) return; fqGenFilter=b.dataset.f; fqGenUpdate(); });
  document.getElementById('fqGenGrid').addEventListener('change', e=>{ const c=e.target.closest('input[data-code]'); if(!c) return; c.checked ? fqSel.add(c.dataset.code) : fqSel.delete(c.dataset.code); fqGenCount(); });
  document.getElementById('fqGenBtn').addEventListener('click', fqGenPdf);
  fqGenUpdate();
}
function fqGenCount(){
  const n = document.getElementById('fqGenCnt'); if(n) n.textContent = fqSel.size+' selected';
}
function fqGenUpdate(){
  const grid = document.getElementById('fqGenGrid'); if(!grid) return;
  const codes = new Set(fqVehicles.map(v=>v.code)); fqSel.forEach(c=>{ if(!codes.has(c)) fqSel.delete(c); });
  const vis = fqGenVisible();
  document.getElementById('fqGenChips').innerHTML = FQ_GEN_FILTERS.map(([k,l])=>`<button type="button" data-f="${k}" class="px-3 py-1 rounded-full text-sm border ${fqGenFilter===k?'bg-teal-600 border-teal-600 text-white':'border-slate-300 text-slate-700 hover:bg-slate-50'}">${l}</button>`).join('');
  document.getElementById('fqGenTot').textContent = fqVehicles.length;
  document.getElementById('fqGenShow').textContent = vis.length;
  grid.innerHTML = vis.map(v=>`<label class="flex items-center gap-3 border border-slate-200 rounded-lg px-3 py-2 cursor-pointer hover:bg-teal-50/50">
      <input type="checkbox" data-code="${escapeHtml(v.code)}" ${fqSel.has(v.code)?'checked':''} class="w-4 h-4 accent-teal-600"/>
      <span class="min-w-0"><span class="block text-sm font-semibold truncate">${escapeHtml(v.vehicle_name)}</span><span class="block text-xs text-slate-500 font-mono">${escapeHtml(v.code)}</span></span></label>`).join('')
      || '<div class="text-sm text-slate-400 p-3 col-span-full">No vehicles match.</div>';
  fqGenCount();
}

/* QR modules come from the same local qrcodejs library / same data (the vehicle code) / same level M as the existing QR modal. */
function fqQrMatrix(text){
  const d = document.createElement('div');
  const q = new QRCode(d, {text:text, width:128, height:128, correctLevel:QRCode.CorrectLevel.M});
  const m = q._oQRCode, n = m.getModuleCount(), rows = [];
  for (let r=0;r<n;r++){ const row=[]; for (let c=0;c<n;c++) row.push(m.isDark(r,c)); rows.push(row); }
  return rows;
}
function fqFit(doc, text, max, min, w){
  let fs = max;
  for (; fs>min; fs-=0.25){ doc.setFontSize(fs); if (doc.getTextWidth(text)<=w) return {fs, ok:true}; }
  doc.setFontSize(min); return {fs:min, ok: doc.getTextWidth(text)<=w};
}
function fqSplit2(doc, text, w){           // best two-line split at a space or hyphen
  let best=null;
  for (let i=1;i<text.length;i++){
    if (!(text[i-1]===' ' || text[i-1]==='-')) continue;
    const a=text.slice(0,i).trim(), b=text.slice(i).trim(); if(!a||!b) continue;
    const wa=fqFit(doc,a,13,4,w), wb=fqFit(doc,b,13,4,w), fs=Math.min(wa.fs,wb.fs);
    if (!best || fs>best.fs) best={lines:[a,b], fs};
  }
  return best;
}
function fqDrawCard(doc, x, y, v){
  const {W,H,QS,M} = FQ_CARD, MM = 0.3528;
  doc.setDrawColor(0); doc.setFillColor(0); doc.setTextColor(0);
  // outer border (kept fully inside the 85 x 55 mm card box)
  doc.setLineWidth(0.6); doc.rect(x+0.3, y+0.3, W-0.6, H-0.6, 'S');
  // QR box: exactly 52 x 52 mm, right side
  const qx = x+W-M-QS, qy = y+M;
  const mat = fqQrMatrix(String(v.code)), n = mat.length, QZ = 1, inner = QS, cell = inner/(n+2*QZ);
  const ox = qx+QZ*cell, oy = qy+QZ*cell;
  for (let r=0;r<n;r++){
    let c=0;
    while (c<n){
      if (!mat[r][c]) { c++; continue; }
      let e=c; while (e<n && mat[r][e]) e++;
      doc.rect(ox+c*cell, oy+r*cell, (e-c)*cell+0.01, cell+0.01, 'F');
      c=e;
    }
  }
  // left section
  const lx = x+2.2, lw = qx-1.5-lx, cx = lx+lw/2;
  doc.setFillColor(0); doc.rect(lx, y+3, lw, 7, 'F');
  doc.setFont('helvetica','bold'); doc.setFontSize(10); doc.setTextColor(255);
  const tw = doc.getTextWidth('FOL ID'); doc.text('FOL ID', cx, y+3+3.5+10*MM*0.35, {align:'center'});
  doc.setDrawColor(255); doc.setLineWidth(0.4);
  const side = (lw-tw)/2 - 1.2 - 1.5;
  if (side>1){ const ly=y+6.5;
    doc.line(lx+1.5, ly, lx+1.5+side, ly);
    doc.line(lx+lw-1.5-side, ly, lx+lw-1.5, ly); }
  // name + code, centred in the remaining left area
  doc.setTextColor(0); doc.setFont('helvetica','bold');
  const name = String(v.vehicle_name||''), code = String(v.code||''), tw2 = lw-1;
  let lines=[name], nfs, r1 = fqFit(doc,name,13,7.5,tw2);
  if (r1.ok) nfs=r1.fs;
  else { const sp = fqSplit2(doc,name,tw2); if (sp){ lines=sp.lines; nfs=sp.fs; } else { nfs=4.5; doc.setFontSize(nfs); lines=doc.splitTextToSize(name,tw2).slice(0,3); } }
  const cfs = fqFit(doc,code,12,5,tw2).fs, gap = 3;
  const lh = f=>f*MM*1.15;
  const total = lines.length*lh(nfs) + gap + lh(cfs);
  const top = y+12, areaH = (y+H-9)-top;
  let cy = top + Math.max(0,(areaH-total)/2);
  doc.setFontSize(nfs);
  lines.forEach(t=>{ doc.text(t, cx, cy+nfs*MM*0.85, {align:'center'}); cy+=lh(nfs); });
  cy += gap; doc.setFontSize(cfs); doc.text(code, cx, cy+cfs*MM*0.85, {align:'center'});
  const co = fqFit(doc,'X Ceramics Group',7,4,lw); doc.setFontSize(co.fs); doc.text('X Ceramics Group', cx, y+H-3.2, {align:'center'});
}
async function fqGenPdf(){
  const list = fqVehicles.filter(v=>fqSel.has(v.code));
  if (!list.length){ toast('Select at least one vehicle first.','error'); return; }
  const J = window.jspdf && window.jspdf.jsPDF;
  if (!J || typeof QRCode==='undefined'){ toast('PDF/QR library could not load. Check your internet connection.','error'); return; }
  try{
    const {W,H,GX,GY,COLS,ROWS} = FQ_CARD, per = COLS*ROWS;
    const doc = new J({orientation:'portrait', unit:'mm', format:'a4', compress:true});
    const x0 = (210-(COLS*W+(COLS-1)*GX))/2, y0 = (297-(ROWS*H+(ROWS-1)*GY))/2;
    list.forEach((v,i)=>{
      if (i>0 && i%per===0) doc.addPage('a4','portrait');
      const k=i%per, col=k%COLS, row=Math.floor(k/COLS);
      fqDrawCard(doc, x0+col*(W+GX), y0+row*(H+GY), v);
    });
    doc.setProperties({title:'Vehicle Identification Cards'});
    doc.save('Vehicle_Identification_Cards.pdf');
    toast(`PDF generated: ${list.length} card${list.length>1?'s':''}, ${Math.ceil(list.length/per)} page${list.length>per?'s':''}. Print at 100% / Actual size.`,'success');
  }catch(err){ console.error(err); toast('Could not generate the PDF: '+err.message,'error'); }
}

/* ---- CSV import ---- */
function fqSetFile(f){
  fqCsvFile = f || null;
  document.getElementById('fqDropT').textContent = f ? f.name : 'Drag & drop CSV file here';
  document.getElementById('fqDropS').textContent = f ? 'Ready to import - click to change' : 'or click to browse';
  document.getElementById('fqRep').innerHTML = '';
}
function fqDownloadTemplate(){
  const blob = new Blob(['vehicle_name,code\r\nForklift-01,XFL0001O\r\nDump Truck-6986,XDT6986R\r\n'],{type:'text/csv'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'vehicle_template.csv'; a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}
function fqParseCsv(t){
  t = t.replace(/^\uFEFF/,''); const rows=[]; let row=[], f='', q=false;
  for (let i=0;i<t.length;i++){ const c=t[i];
    if (q){ if(c==='"'){ if(t[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else if (c==='"') q=true;
    else if (c===','){ row.push(f); f=''; }
    else if (c==='\n'||c==='\r'){ if(c==='\r'&&t[i+1]==='\n') i++; row.push(f); rows.push(row); row=[]; f=''; }
    else f+=c; }
  if (f!==''||row.length){ row.push(f); rows.push(row); }
  return rows.filter(r=>r.some(x=>x.trim()!==''));
}
function fqReport(ok, msg, list){
  document.getElementById('fqRep').innerHTML = `<div class="mt-3 rounded-lg p-3 text-sm ${ok?'bg-green-50 text-green-800':'bg-red-50 text-red-800'}"><b>${escapeHtml(msg)}</b>
    ${list&&list.length?`<ul class="mt-1 ml-4 list-disc max-h-40 overflow-auto">${list.slice(0,50).map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul>${list.length>50?`<div>…and ${list.length-50} more</div>`:''}`:''}</div>`;
}
async function fqImportCsv(){
  if (!fqCsvFile){ toast('Choose a CSV file first','error'); return; }
  const rows = fqParseCsv(await fqCsvFile.text());
  if (!rows.length){ fqReport(false,'The file is empty.'); return; }
  const h = rows[0].map(x=>x.trim().toLowerCase());
  if (h.length!==2 || h[0]!=='vehicle_name' || h[1]!=='code'){ fqReport(false,'Header must be exactly: vehicle_name,code'); return; }
  const seen = new Set(fqVehicles.map(v=>v.code)), good=[], problems=[];
  rows.slice(1).forEach((r,i)=>{ const ln=i+2, name=(r[0]||'').trim(), code=(r[1]||'').trim().toUpperCase();
    if(!name) return problems.push(`Line ${ln}: missing vehicle name`);
    if(!FQ_CODE_RE.test(code)) return problems.push(`Line ${ln}: invalid code "${code}"`);
    if(seen.has(code)) return problems.push(`Line ${ln}: code ${code} already exists or is repeated`);
    seen.add(code); good.push({vehicle_name:name, code}); });
  if (!good.length){ fqReport(false,'Nothing imported.',problems); return; }
  const btn = document.getElementById('fqImp'); btn.disabled = true;
  for (let i=0;i<good.length;i+=500){
    const { error } = await db.from('vehicle_master').insert(good.slice(i,i+500));
    if (error){ btn.disabled=false; fqReport(false,'Import stopped: '+error.message,problems); return; }
  }
  btn.disabled = false;
  try{ await logActivity('FILTER_VEHICLE_IMPORT','vehicle_master',null,`${good.length} vehicles`); }catch(e){}
  fqSetFile(null); await fqRefresh();
  fqReport(true, `Imported ${good.length} vehicle${good.length>1?'s':''}${problems.length?`, skipped ${problems.length}`:''}.`, problems);
  toast(`Imported ${good.length} vehicles`,'success');
}

