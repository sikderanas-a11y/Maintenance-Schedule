/* page module (original lines 2403-2652) */
/* ============================================================
   USER ACCESS
   ============================================================ */
ROUTES.user_access = async (host)=>{
  if (currentUser.role !== 'Super Admin'){
    host.innerHTML = `<div class="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 text-sm">Only the Super Administrator can manage User Access.</div>`;
    return;
  }
  host.innerHTML = `
    <div class="space-y-4">
      <div class="flex items-center justify-between flex-wrap gap-2">
        <p class="text-sm text-slate-500">Manage users, roles, and dashboard permissions. <code class="bg-slate-100 px-1 rounded">admin@gmail.com</code> is the protected Super Administrator.</p>
        <button id="btnAddUser" class="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-lg flex items-center gap-2"><i data-lucide="user-plus" class="w-4 h-4"></i> Add New User</button>
      </div>
      <div class="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2">
        <i data-lucide="search" class="w-4 h-4 text-slate-400"></i>
        <input id="ua_search" placeholder="Search by email…" onkeyup="filterUA(this.value)" class="flex-1 text-sm outline-none"/>
      </div>
      <div id="uaWrap"><div class="text-slate-400 text-sm">Loading…</div></div>
    </div>`;
  lucide.createIcons();
  document.getElementById('btnAddUser').addEventListener('click', ()=>openUserForm());
  await refreshUA();
};
async function refreshUA(){
  const wrap = document.getElementById('uaWrap'); if(!wrap) return;
  const { data, error } = await db.from('profiles').select('*, user_permissions!left(*)').order('created_at',{ascending:false});
  if (error){ wrap.innerHTML=`<div class="text-red-600 text-sm">${escapeHtml(error.message)}</div>`; return; }
  const rows = (data||[]).map(p=>{
    // Supabase returns user_permissions as a single object when there's a
    // unique constraint on user_id (which there is). Handle both shapes.
    const rawPerms = p.user_permissions;
    const perms = Array.isArray(rawPerms) ? (rawPerms[0]||{}) : (rawPerms||{});
    const LABELS = {
      dash_main:'Main Dashboard',
      dash_vehicle_maintenance:'Vehicle Maintenance',
      dash_pending_maintenance:'Pending Maintenance',
      dash_item_requirement:'Item Requirement',
      dash_rom:'ROM',
      dash_supply_chain:'Supply Chain',
      dash_vehicle_master:'QR Codes & Filter Dashboard',
      dash_item_master:'Item Master',
      dash_data_entry:'Data Entry',
      dash_maintenance_history:'Maintenance History',
      dash_user_access:'User Access',
      dash_reports:'Reports',
      dash_settings:'Settings',
      dash_maint_calendar:'Maintenance Calendar',
      dash_maint_settings:'Maintenance Interval Settings'
    };
    const _pgs = Object.keys(PAGES).filter(n=>!PAGES[n].superOnly);
    const _ok = _pgs.filter(n=>pageAllowedFor(perms,n,p.role));
    const dashboards = _ok.length===_pgs.length ? ['All pages'] : _ok.map(n=>PAGES[n].label);
    const isSelf = p.id===currentUser.id;
    const isSuperAdmin = p.role==='Super Admin';
    const protect = isSuperAdmin || isSelf;
    return `<tr>
      <td class="px-4 py-2">${escapeHtml(p.full_name)}<div class="text-xs text-slate-400">${escapeHtml(p.role)}</div></td>
      <td class="px-4 py-2">${escapeHtml(p.email)}</td>
      <td class="px-4 py-2"><div class="flex flex-wrap gap-1">${dashboards.length?dashboards.map(d=>`<span class="badge bg-teal-50 text-teal-700">${d}</span>`).join(''):'<span class="text-slate-400 text-xs">none</span>'}</div></td>
      <td class="px-4 py-2">${badge(p.account_status)}</td>
      <td class="px-4 py-2">${fmtDateTime(p.updated_at)}</td>
      <td class="px-4 py-2 whitespace-nowrap">
        <div class="flex items-center gap-1">
        <button onclick="openUserForm('${p.id}')" class="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="${protect?'Protected':'Edit'}" aria-label="Edit" ${protect?'disabled':''}><i data-lucide="pencil" class="w-4 h-4"></i></button>
        <button onclick="resetPassword('${escapeHtml(p.email)}')" class="p-1.5 rounded-lg text-slate-500 hover:text-navy-800 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="${isSelf?'Self':'Reset Password'}" aria-label="Reset Password" ${isSelf?'disabled':''}><i data-lucide="key-round" class="w-4 h-4"></i></button>
        <button onclick="toggleDisable('${p.id}','${p.account_status}')" class="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="${protect?'Protected':(p.account_status==='Active'?'Disable':'Enable')}" aria-label="${p.account_status==='Active'?'Disable':'Enable'}" ${protect?'disabled':''}><i data-lucide="${p.account_status==='Active'?'user-x':'user-check'}" class="w-4 h-4"></i></button>
        <button onclick="deleteUser('${p.id}','${escapeHtml(p.email)}')" class="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent" title="${protect?'Protected':'Delete'}" aria-label="Delete" ${protect?'disabled':''}><i data-lucide="trash-2" class="w-4 h-4"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('') || emptyRow(6,'No users yet.');
  wrap.innerHTML = tableCard('Users', ['Name','Email','Accessible Pages','Status','Last Updated','Actions'], rows);
  lucide.createIcons();
}
function filterUA(q){q=q.toLowerCase();document.querySelectorAll('#uaWrap tbody tr').forEach(tr=>tr.style.display=tr.innerText.toLowerCase().includes(q)?'':'none');}

function uaPagesHtml(perms){
  const groups={};
  Object.entries(PAGES).forEach(([n,pg])=>{ if(!pg.superOnly) (groups[pg.group]=groups[pg.group]||[]).push(n); });
  const ready = pgReady();
  const cols = [...PG_SHARED].map(n=>'add column if not exists pg_'+n+' boolean').join(', ');
  const sql = 'alter table public.user_permissions '+cols+';';
  const banner = ready ? '' : `<div class="mb-2 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
      <b>One-time database step needed for separate per-page access.</b> Until it is run, pages that share a permission
      (e.g. all Data Entry pages) are still granted together. Run this once in the Supabase SQL editor — existing users keep their current access:
      <pre class="mt-1.5 p-2 bg-white border border-amber-200 rounded overflow-x-auto whitespace-pre-wrap select-all">${escapeHtml(sql)}</pre>
      <button type="button" class="mt-1 text-teal-700 font-medium hover:underline" onclick="navigator.clipboard&&navigator.clipboard.writeText(this.previousElementSibling.textContent).then(()=>toast('SQL copied','success'))">Copy SQL</button></div>`;
  const body = Object.entries(groups).map(([g,names])=>`
    <div class="mb-2">
      <div class="flex items-center gap-2 mb-1"><span class="text-[11px] font-semibold uppercase tracking-wide text-slate-500">${escapeHtml(g)}</span>
        <button type="button" onclick="uaSetGroup(this,true)" class="text-[11px] text-teal-700 hover:underline">all</button>
        <button type="button" onclick="uaSetGroup(this,false)" class="text-[11px] text-slate-500 hover:underline">none</button></div>
      <div class="grid grid-cols-2 md:grid-cols-3 gap-2">${names.map(n=>`<label class="perm-chip flex items-center gap-2 text-xs"><input type="checkbox" class="uaPg" id="pgp_${n}" ${pageAllowedFor(perms,n,'User')?'checked':''}/> <span>${escapeHtml(PAGES[n].label)}</span></label>`).join('')}</div>
    </div>`).join('');
  return `<div>
    <label class="block mb-1 font-medium">Accessible Pages</label>
    ${banner}
    <div class="bg-slate-50 p-3 rounded-lg">${body}</div>
    <div class="mt-2 flex gap-2 text-xs">
      <button type="button" onclick="document.querySelectorAll('.uaPg').forEach(c=>c.checked=true)" class="text-teal-700 hover:underline">Select all pages</button>
      <button type="button" onclick="document.querySelectorAll('.uaPg').forEach(c=>c.checked=false)" class="text-slate-600 hover:underline">Clear</button>
    </div></div>`;
}
function uaSetGroup(btn,on){ btn.closest('.mb-2').querySelectorAll('.uaPg').forEach(c=>c.checked=on); }
async function openUserForm(id=''){
  let p=null;
  if (id){ const {data}=await db.from('profiles').select('*, user_permissions!left(*)').eq('id',id).maybeSingle(); p=data; }
  const rawP = p?.user_permissions;
  const perms = Array.isArray(rawP) ? (rawP[0]||{}) : (rawP||{});
  openModal(p?'Edit User':'Add New User', `
    <form class="space-y-3 text-sm">
      ${!p?`
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block mb-1 font-medium">Full Name *</label><input id="u_name" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
        <div><label class="block mb-1 font-medium">Email *</label><input id="u_email" type="email" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
        <div><label class="block mb-1 font-medium">Password *</label><input id="u_pass" type="password" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
        <div><label class="block mb-1 font-medium">Department *</label>
          <select id="u_dept" class="w-full border border-slate-300 rounded-lg px-3 py-2">
            ${['Automobile','ROM','Supply Chain','Data Entry','Admin'].map(d=>`<option>${d}</option>`).join('')}
          </select>
        </div>
        <div><label class="block mb-1 font-medium">Role</label>
          <select id="u_role" class="w-full border border-slate-300 rounded-lg px-3 py-2">
            <option>User</option><option>Admin</option>
          </select>
        </div>
        <div><label class="block mb-1 font-medium">Account Status</label>
          <select id="u_status" class="w-full border border-slate-300 rounded-lg px-3 py-2">
            <option>Active</option><option>Disabled</option>
          </select>
        </div>
      </div>`:`
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block mb-1 font-medium">Full Name</label><input id="u_name" value="${escapeHtml(p.full_name)}" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
        <div><label class="block mb-1 font-medium">Email</label><input id="u_email" value="${escapeHtml(p.email)}" disabled class="w-full border border-slate-300 rounded-lg px-3 py-2 bg-slate-100"/></div>
        <div><label class="block mb-1 font-medium">Department</label>
          <select id="u_dept" class="w-full border border-slate-300 rounded-lg px-3 py-2">
            ${['Automobile','ROM','Supply Chain','Data Entry','Admin'].map(d=>`<option ${p.department===d?'selected':''}>${d}</option>`).join('')}
          </select>
        </div>
        <div><label class="block mb-1 font-medium">Role</label>
          <select id="u_role" class="w-full border border-slate-300 rounded-lg px-3 py-2" ${p.role==='Super Admin'?'disabled':''}>
            <option ${p.role==='User'?'selected':''}>User</option>
            <option ${p.role==='Admin'?'selected':''}>Admin</option>
            <option ${p.role==='Super Admin'?'selected':''}>Super Admin</option>
          </select>
        </div>
        <div><label class="block mb-1 font-medium">Account Status</label>
          <select id="u_status" class="w-full border border-slate-300 rounded-lg px-3 py-2" ${p.role==='Super Admin'?'disabled':''}>
            <option ${p.account_status==='Active'?'selected':''}>Active</option>
            <option ${p.account_status==='Disabled'?'selected':''}>Disabled</option>
          </select>
        </div>
      </div>`}
      ${uaPagesHtml(perms)}
    </form>`,
    `<button onclick="closeModal()" class="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Cancel</button>
     <button onclick="saveUser('${id}')" class="px-4 py-1.5 text-sm bg-teal-600 hover:bg-teal-700 text-white rounded-lg">${p?'Save Changes':'Create User'}</button>`);
}
async function saveUser(id){
  const name = document.getElementById('u_name').value.trim();
  const email = document.getElementById('u_email').value.trim();
  const dept = document.getElementById('u_dept').value;
  const role = document.getElementById('u_role').value;
  const status = document.getElementById('u_status').value;
  const perms = {};
  const pgChecked = n => { const el=document.getElementById('pgp_'+n); return !!(el && el.checked); };
  // legacy dash_* keys stay in sync: a key is on when at least one page using it is on
  const keys = [...new Set(Object.values(PAGES).filter(p=>!p.superOnly).map(p=>p.key))];
  keys.forEach(k=>{ perms[k] = Object.keys(PAGES).some(n=>PAGES[n].key===k && !PAGES[n].superOnly && pgChecked(n)); });
  if (pgReady()) PG_SHARED.forEach(n=>{ perms['pg_'+n] = pgChecked(n); });

  if (!id){
    if (!name||!email){ toast('Name & email required.','error'); return; }
    const pass = document.getElementById('u_pass').value;
    if (!pass || pass.length<6){ toast('Password min 6 chars.','error'); return; }
    // check email not already used
    const { data: existing } = await db.from('user_credentials').select('id').eq('email', email).maybeSingle();
    if (existing){ toast('Email already registered.','error'); return; }
    // 1) create profile
    const { data: prof, error: pe } = await db.from('profiles').insert({
      full_name: name, email, department: dept, role, account_status: status
    }).select().single();
    if (pe){ toast(pe.message,'error'); return; }
    // 2) create credentials with hashed password
    const salt = randomSalt();
    const hash = await sha256Hex(salt + pass);
    const { error: ce } = await db.from('user_credentials').insert({
      email, password_hash: hash, salt, profile_id: prof.id, status
    });
    if (ce){
      // rollback profile
      await db.from('profiles').delete().eq('id', prof.id);
      toast(ce.message,'error'); return;
    }
    // 3) permissions
    await db.from('user_permissions').upsert({ user_id: prof.id, ...perms }, { onConflict: 'user_id' });
    await logActivity('CREATE_USER','profiles', prof.id, `${email} (${dept}/${role})`);
    toast('User created','success'); closeModal(); refreshUA();
  } else {
    const { data: existing } = await db.from('profiles').select('*').eq('id', id).maybeSingle();
    if (!existing){ toast('User missing.','error'); return; }
    if (existing.role==='Super Admin' && role!=='Super Admin'){ toast('Cannot demote Super Admin.','error'); return; }
    const { error: e1 } = await db.from('profiles').update({
      full_name: name, department: dept, role, account_status: status
    }).eq('id', id);
    if (e1){ toast(e1.message,'error'); return; }
    const { error: e2 } = await db.from('user_permissions').upsert({ user_id: id, ...perms }, { onConflict: 'user_id' });
    if (e2){ toast(e2.message,'error'); return; }
    await logActivity('UPDATE_USER','profiles', id, `Updated ${email}`);
    toast('Saved','success'); closeModal(); refreshUA();
  }
}

async function toggleDisable(id, current){
  const { data: p } = await db.from('profiles').select('*').eq('id', id).maybeSingle();
  if (!p) return;
  if (p.role==='Super Admin'){ toast('Cannot disable Super Admin.','error'); return; }
  const newStatus = current==='Active'?'Disabled':'Active';
  const { error } = await db.from('profiles').update({account_status:newStatus}).eq('id', id);
  if (error){ toast(error.message,'error'); return; }
  // also flip credentials status so they can't log in
  await db.from('user_credentials').update({status:newStatus}).eq('email', p.email);
  await logActivity('TOGGLE_USER','profiles', id, `${p.email} → ${newStatus}`);
  toast(`User ${newStatus}`,'success'); refreshUA();
}
async function deleteUser(id, email){
  if (email==='admin@gmail.com'){ toast('Cannot delete Super Admin.','error'); return; }
  if (!await confirmDialog(`${email} will be removed along with their profile, credentials and permissions.`, {title:'Delete user?', confirmText:'Delete', danger:true})) return;
  // cascade: user_credentials + user_permissions removed via FK on delete cascade
  const { error } = await db.from('profiles').delete().eq('id', id);
  if (error){ toast(error.message,'error'); return; }
  await logActivity('DELETE_USER','profiles', id, email);
  toast('User deleted.','success'); refreshUA();
}
async function resetPassword(email){
  const newPass = await promptDialog(`Enter a new temporary password for ${email}.`, {title:'Reset password', confirmText:'Reset', placeholder:'At least 6 characters'});
  if (!newPass){ return; }
  if (newPass.length < 6){ toast('Password must be at least 6 characters.','error'); return; }
  const salt = randomSalt();
  const hash = await sha256Hex(salt + newPass);
  const { error } = await db.from('user_credentials')
    .update({ password_hash: hash, salt, updated_at: new Date().toISOString() })
    .eq('email', email);
  if (error){ toast(error.message,'error'); return; }
  await logActivity('RESET_PASSWORD','user_credentials', null, `Reset password for ${email}`);
  toast(`Password reset. New password: ${newPass}`,'success');
}

