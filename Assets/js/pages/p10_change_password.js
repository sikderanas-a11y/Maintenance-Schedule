/* page module (original lines 2653-2677) */
/* ============================================================
   CHANGE PASSWORD / SETTINGS
   ============================================================ */
ROUTES.change_password = async (host)=>{
  host.innerHTML = `
    <div class="max-w-md bg-white rounded-xl border border-slate-200 p-5 space-y-3 text-sm">
      <h3 class="font-semibold text-navy-900">Change Password</h3>
      <div><label class="block mb-1 font-medium">New Password</label><input id="cp_pass" type="password" class="w-full border border-slate-300 rounded-lg px-3 py-2"/></div>
      <button onclick="changePwd()" class="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg">Update Password</button>
    </div>`;
};
async function changePwd(){
  const pass = document.getElementById('cp_pass').value;
  if (!pass || pass.length<6){ toast('Min 6 chars.','error'); return; }
  const salt = randomSalt();
  const hash = await sha256Hex(salt + pass);
  const { error } = await db.from('user_credentials')
    .update({ password_hash: hash, salt, updated_at: new Date().toISOString() })
    .eq('email', currentUser.email);
  if (error){ toast(error.message,'error'); return; }
  await logActivity('CHANGE_PASSWORD','user_credentials', null, currentUser.email);
  toast('Password updated','success');
}


