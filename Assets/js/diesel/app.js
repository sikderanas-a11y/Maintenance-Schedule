/* ============ SUPABASE CONFIGURATION ============ */
const SUPABASE_URL = "https://oshqaazzteqqukilghev.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zaHFhYXp6dGVxcXVraWxnaGV2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU3Mzc4ODYsImV4cCI6MjEwMTMxMzg4Nn0.Rz33PdqBlq9yWqgNiz_4B_2fG6B3ztpk3dTx44He4F0";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let vehicleCache = []; // [{code, vehicle_name}]
let lastReportRows = [];

/* ============ NAV ============ */
function switchPage(name) {
  if (!canOpen(name)) { alert("You do not have permission to access this section. Please contact your administrator."); return; }
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.querySelectorAll(".navitem").forEach(n => n.classList.remove("active"));
  document.getElementById("page-" + name).classList.add("active");
  document.querySelector('.navitem[data-page="' + name + '"]').classList.add("active");
  if (name === "dashboard") loadDashboard();
  if (name === "heatmap") hmInit();
  if (name === "create") loadVehiclesInto("generate");
  if (name === "report") { loadVehiclesInto("report"); loadReportDrivers(); }
  if (name === "drivers") loadDrivers();
  if (name === "rates") loadRates();
  if (name === "dispenser") loadDispenserTable(1);
  if (name === "operators") loadOperators();
  if (name === "useraccess") loadUserAccess();
}

document.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById("reportFrom").value = today;
  document.getElementById("reportTo").value = today;

  restoreAdminSession();

  document.getElementById("adminLoginPassword").addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleAdminLogin();
  });
});

/* ============ LOGIN: Supabase Auth + dashboard_users + dashboard_permissions ============ */
const PAGE_KEY = { dashboard:"dieseltracker_dashboard", heatmap:"dieseltracker_heatmap", create:"dieseltracker_create_qr",
                   report:"dieseltracker_report", drivers:"dieseltracker_drivers", rates:"dieseltracker_consumption_rate",
                   dispenser:"dieseltracker_dispenser", opmeter:"dieseltracker_operator_meter", recon:"dieseltracker_reconciliation", operators:"dieseltracker_operators", useraccess:"dieseltracker_settings" };
let adminAuth = null; // { email, isSuper, perms:{key:bool} } -- always rebuilt from the database

function getAdminSession() { return adminAuth ? { username: adminAuth.email, loggedIn: true } : null; }
function canOpen(page) {
  if (!adminAuth) return false;
  if (adminAuth.isSuper) return true;
  if (page === "useraccess") return false;
  return !!adminAuth.perms[PAGE_KEY[page]];
}

// Verifies the Auth session against the database; returns null if not allowed
async function loadAccessFor(user) {
  const email = (user.email || "").toLowerCase();
  if (email === UA_SUPER) return { email, isSuper: true, perms: {} };
  const { data: du, error } = await sb.from("dieseltracker_dashboard_users").select("email,is_active").eq("email", email).maybeSingle();
  if (error) throw error;
  if (!du) return { error: "This account is not registered for the dashboard." };
  if (!du.is_active) return { error: "Your account is disabled. Please contact your administrator." };
  const { data: pr, error: pe } = await sb.from("dieseltracker_dashboard_permissions").select("dashboard_key,is_enabled").eq("email", email);
  if (pe) throw pe;
  const perms = {}; (pr || []).forEach(r => { perms[r.dashboard_key] = !!r.is_enabled; });
  return { email, isSuper: false, perms };
}

function applyNavAccess() {
  let first = null;
  document.querySelectorAll(".navitem[data-page]").forEach(n => {
    const ok = canOpen(n.dataset.page);
    n.style.display = ok ? "" : "none";
    if (ok && !first) first = n.dataset.page;
  });
  return first;
}

async function enterAdminDashboard() {
  document.getElementById("adminLoginScreen").classList.add("hidden");
  document.getElementById("adminShell").classList.remove("hidden");
  const first = applyNavAccess();
  if (!first) { alert("You do not have permission to access any section. Please contact your administrator."); return handleAdminLogout(); }
  switchPage(first);
  loadVehicleCache();
}

async function handleAdminLogin() {
  const email = document.getElementById("adminLoginUsername").value.trim().toLowerCase();
  const password = document.getElementById("adminLoginPassword").value;
  document.getElementById("adminLoginMsg").innerHTML = "";
  if (!email) { showMsg("adminLoginMsg", "error", "Please enter your email."); return; }
  if (!password) { showMsg("adminLoginMsg", "error", "Please enter your password."); return; }
  const btn = document.getElementById("adminLoginBtn");
  btn.disabled = true; btn.textContent = "Logging in...";
  try {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { showMsg("adminLoginMsg", "error", "Invalid email or password."); return; }
    const acc = await loadAccessFor(data.user);
    if (acc.error) { await sb.auth.signOut(); showMsg("adminLoginMsg", "error", acc.error); return; }
    adminAuth = acc;
    document.getElementById("adminLoginPassword").value = "";
    await enterAdminDashboard();
  } catch (err) {
    console.error(err);
    showMsg("adminLoginMsg", "error", "Network error. Please try again.");
  } finally {
    btn.disabled = false; btn.textContent = "Log In";
  }
}

async function handleAdminLogout() {
  adminAuth = null;
  try { await sb.auth.signOut(); } catch (e) {}
  document.getElementById("adminShell").classList.add("hidden");
  document.getElementById("adminLoginScreen").classList.remove("hidden");
  document.getElementById("adminLoginUsername").value = "";
  document.getElementById("adminLoginPassword").value = "";
}

// restore session on refresh, re-validating status and permissions
async function restoreAdminSession() {
  try {
    return await restoreAdminSessionInner();
  } finally { document.documentElement.classList.remove("has-sess"); }
}
async function restoreAdminSessionInner() {
  try {
    const { data } = await sb.auth.getSession();
    if (data && data.session) {
      const acc = await loadAccessFor(data.session.user);
      if (!acc.error) { adminAuth = acc; return enterAdminDashboard(); }
      await sb.auth.signOut();
    }
  } catch (e) { console.error(e); }
  document.getElementById("adminLoginScreen").classList.remove("hidden");
  document.getElementById("adminShell").classList.add("hidden");
}

function showMsg(elId, type, text) {
  document.getElementById(elId).innerHTML = '<div class="msg ' + type + '">' + escapeHtml(text) + '</div>';
}
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function naturalSortByName(list) {
  // Ascending order that treats embedded numbers numerically, so
  // "Forklift-2" sorts before "Forklift-10" (not after, as plain
  // string sort would put it).
  const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
  return list.slice().sort((a, b) => collator.compare(a.vehicle_name || "", b.vehicle_name || ""));
}

/* ============ SHARED: LOAD VEHICLES (single query, cached) ============ */
async function loadVehicleCache() {
  const { data, error } = await sb.from("master").select("code, vehicle_name").order("code");
  if (error) { console.error(error); return; }
  vehicleCache = data || [];
  loadVehiclesInto("generate");
  loadVehiclesInto("report");
}

function loadVehiclesInto(context) {
  if (context === "generate") {
    const sorted = naturalSortByName(vehicleCache);
    const prev = new Set(Array.from(document.querySelectorAll(".veh-chk:checked")).map(c => c.value));
    document.getElementById("vehicleChecklist").innerHTML = sorted.map(v =>
      '<label class="veh-card" title="' + escapeHtml(v.vehicle_name) + ' (' + escapeHtml(v.code) + ')" data-cat="' + vehCategory(v) + '" data-s="' + escapeHtml((v.vehicle_name + " " + v.code).toLowerCase()) + '">' +
      '<input type="checkbox" class="veh-chk" value="' + v.code + '"' + (prev.has(v.code) ? " checked" : "") + ' onchange="updateVehSelCount()">' +
      '<span class="veh-txt"><span class="veh-name">' + escapeHtml(v.vehicle_name) + '</span><span class="veh-code">' + escapeHtml(v.code) + '</span></span></label>'
    ).join("");
    filterVehicleChecklist();
    updateVehSelCount();
  }
  if (context === "report") {
    const sel = document.getElementById("reportVehicle");
    sel.innerHTML = '<option value="__ALL__">ALL VEHICLES</option>' +
      naturalSortByName(vehicleCache).map(v => '<option value="' + v.code + '">' + escapeHtml(v.vehicle_name) + '</option>').join("");
  }
}

async function deleteSelectedVehicles() {
  const codes = Array.from(document.querySelectorAll(".veh-chk:checked")).map(c => c.value);
  if (codes.length === 0) { showMsg("generateMsg", "error", "Please select at least one vehicle to delete."); return; }
  const list = codes.map(c => { const v = vehicleCache.find(x => x.code === c); return "• " + (v ? v.vehicle_name + " (" + c + ")" : c); });
  const shown = list.slice(0, 10).join("\n") + (list.length > 10 ? "\n…and " + (list.length - 10) + " more" : "");
  if (!confirm("Permanently delete " + codes.length + " vehicle(s)?\n\n" + shown +
    "\n\nThe vehicle record, its consumption rate and its latest-data entry will be removed. " +
    "Past diesel entries are kept. This cannot be undone.")) return;
  if (codes.length > 1 && (prompt('Type DELETE to confirm deleting ' + codes.length + ' vehicles:') || "").trim() !== "DELETE") {
    showMsg("generateMsg", "info", "Deletion cancelled."); return;
  }

  const btn = document.getElementById("delVehBtn");
  btn.disabled = true;
  let deleted = 0; const failed = [];
  for (const code of codes) {
    try {
      // dependent per-vehicle rows first (in case of foreign keys); errors here are non-fatal
      await sb.from("consumption_rate").delete().eq("code", code);
      await sb.from("latest_data").delete().eq("code", code);
      const { error } = await sb.from("master").delete().eq("code", code);
      if (error) throw error;
      deleted++;
    } catch (err) { console.error("Delete vehicle failed", code, err); failed.push(code); }
  }
  btn.disabled = false;
  document.getElementById("qrPrintArea").innerHTML = "";
  document.getElementById("printBtn").disabled = true;
  await loadVehicleCache();
  showMsg("generateMsg", failed.length ? "error" : "success",
    deleted + " vehicle(s) deleted." + (failed.length ? " Failed: " + failed.join(", ") + " (check console / permissions)." : ""));
}

function setAllVehicleChecks(checked) {
  // only affects vehicles currently visible after search filtering
  document.querySelectorAll("#vehicleChecklist label").forEach(l => {
    if (l.style.display !== "none") l.querySelector(".veh-chk").checked = checked;
  });
  updateVehSelCount();
}
function updateVehSelCount() {
  const all = document.querySelectorAll(".veh-chk");
  let n = 0;
  all.forEach(c => { if (c.checked) n++; const l = c.closest("label"); if (l) l.classList.toggle("selected", c.checked); });
  document.getElementById("vehSelCount").textContent = n;
  document.getElementById("vehTotalCount").textContent = all.length;
}
/* category is derived from the existing vehicle name/code — no schema change */
function vehCategory(v) {
  const n = (v.vehicle_name || "").toLowerCase(), c = (v.code || "").toUpperCase(), cats = [];
  if (n.includes("forklift")) cats.push("forklift");
  if (n.includes("dump")) cats.push("dump");
  if (n.includes("excavator")) cats.push("excavator");
  if (n.includes("rental") || (c.length === 8 && c.charAt(7) === "R")) cats.push("rental");
  return cats.join(" ");
}
let vehCat = "all";
function setVehCat(cat) {
  vehCat = cat;
  document.querySelectorAll("#vehChips .chip").forEach(b => b.classList.toggle("active", b.dataset.cat === cat));
  filterVehicleChecklist();
}
function clearVehFilter() {
  const f = document.getElementById("vehFilter");
  f.value = ""; document.getElementById("vehFilterBox").classList.remove("has-val");
  filterVehicleChecklist(); f.focus();
}
function filterVehicleChecklist() {
  const q = document.getElementById("vehFilter").value.trim().toLowerCase();
  let shown = 0;
  document.querySelectorAll("#vehicleChecklist label").forEach(l => {
    const okQ = !q || l.dataset.s.includes(q);
    const okC = vehCat === "all" || (l.dataset.cat || "").split(" ").includes(vehCat);
    l.style.display = (okQ && okC) ? "" : "none";
    if (okQ && okC) shown++;
  });
  document.getElementById("vehShownCount").textContent = shown;
  document.getElementById("vehEmpty").classList.toggle("hidden", shown > 0);
}

/* ============ DASHBOARD ============ */
let dieselPage = 1;
const DIESEL_PAGE_SIZE = 10;
let dieselSortCol = "entry_datetime";
let dieselSortAsc = false;
let dieselFilterTimer = null;
let currentDieselRows = [];

async function loadDashboard() {
  try {
    const { data: summary, error } = await sb.rpc("get_diesel_dashboard_summary");
    if (error) throw error;
    document.getElementById("statVehicles").textContent = summary.total_vehicles ?? 0;
    document.getElementById("statEntries").textContent = summary.total_entries ?? 0;
    document.getElementById("statTotalConsumption").textContent = Number(summary.total_consumption ?? 0).toLocaleString();
    document.getElementById("statVehiclesWithEntries").textContent = summary.vehicles_with_entries ?? 0;
  } catch (err) {
    console.error(err);
  }

  const { count: dCount } = await sb.from("driver_information").select("*", { count: "exact", head: true });
  document.getElementById("statDrivers").textContent = dCount ?? 0;

  const startOfToday = new Date(); startOfToday.setHours(0,0,0,0);
  const { count: tCount } = await sb.from("diesel_data")
    .select("*", { count: "exact", head: true })
    .gte("entry_datetime", startOfToday.toISOString());
  document.getElementById("statToday").textContent = tCount ?? 0;

  if (!vehicleCache || vehicleCache.length === 0) await loadVehicleCache();
  populateAnalysisVehicleSelect();

  // Auto-load the first vehicle's consumption analysis so the graph
  // is never empty on open (unless there truly are no vehicles yet).
  const sel = document.getElementById("analysisVehicleSelect");
  if (!sel.value && vehicleCache && vehicleCache.length > 0) {
    sel.value = vehicleCache[0].code;
    applyAnalysis();
  } else if (!vehicleCache || vehicleCache.length === 0) {
    showMsg("analysisMsg", "info", "No vehicles found yet — add one under \"Create & Generate QR Codes\" first.");
  }

  dieselPage = 1;
  loadDieselDataTable(1);
}

/* ============ VEHICLE VS DATE HEAT MAP ============ */
let hmData = null;       // {days:[keys], vehicles:[{code,name,daily:{},counts:{},total,avg,registered}], from, to}
let hmInitialised = false;
let hmView = null;
let hmLoadToken = 0;
const HM_MAX_DAYS = 366;
const HM_PAGE = 1000;

function hmEsc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function hmFmt(n) {
  return Number(Number(n || 0).toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
// Local calendar-date key (same local-time convention as the rest of this app)
function hmDateKey(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function hmParseKey(k) { const p = k.split("-"); return new Date(+p[0], +p[1] - 1, +p[2]); }
function hmLabel(k) {
  return hmParseKey(k).toLocaleDateString().slice(0, -5);
}
function hmLongLabel(k) {
  return hmParseKey(k).toLocaleDateString();
}

function hmInit() {
  if (hmInitialised) return;
  hmInitialised = true;
  hmQuick("month");
  const wrap = document.getElementById("hmWrap");
  const tip = document.getElementById("hmTooltip");
  wrap.addEventListener("mousemove", e => {
    const td = e.target.closest("td.hm-cell");
    if (!td) { tip.style.display = "none"; return; }
    tip.innerHTML =
      "<b>" + hmEsc(td.dataset.name) + "</b><br>" +
      "Code: " + hmEsc(td.dataset.code) + "<br>" +
      "Date: " + hmEsc(td.dataset.date) + "<br>" +
      "Diesel: " + hmEsc(td.dataset.qty) + " LTR<br>" +
      "Entries: " + hmEsc(td.dataset.cnt);
    tip.style.display = "block";
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = e.clientX + 14, y = e.clientY + 14;
    if (x + w > window.innerWidth - 6) x = e.clientX - w - 14;
    if (y + h > window.innerHeight - 6) y = e.clientY - h - 14;
    tip.style.left = Math.max(4, x) + "px";
    tip.style.top = Math.max(4, y) + "px";
  });
  wrap.addEventListener("mouseleave", () => { tip.style.display = "none"; });
  wrap.addEventListener("scroll", () => { tip.style.display = "none"; });
  wrap.addEventListener("click", e => {
    const td = e.target.closest("td.hm-cell");
    if (!td) return;
    tip.style.display = "none";
    hmOpenEdit(td.dataset.code, td.dataset.key);
  });
  document.addEventListener("keydown", e => { if (e.key === "Escape") hmCloseEdit(); });
}

function hmQuick(kind) {
  const now = new Date();
  let from, to;
  if (kind === "today") { from = to = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
  else if (kind === "7d") { to = new Date(now.getFullYear(), now.getMonth(), now.getDate()); from = new Date(to); from.setDate(from.getDate() - 6); }
  else if (kind === "lastmonth") { from = new Date(now.getFullYear(), now.getMonth() - 1, 1); to = new Date(now.getFullYear(), now.getMonth(), 0); }
  else { from = new Date(now.getFullYear(), now.getMonth(), 1); to = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  document.getElementById("hmFrom").value = hmDateKey(from);
  document.getElementById("hmTo").value = hmDateKey(to);
  hmApply();
}

function hmRefresh() { hmApply(); }

async function hmFetchAll(table, columns, orderCols, applyFilters) {
  const out = [];
  for (let from = 0; ; from += HM_PAGE) {
    let q = sb.from(table).select(columns);
    if (applyFilters) q = applyFilters(q);
    orderCols.forEach(c => { q = q.order(c, { ascending: true }); });
    const { data, error } = await q.range(from, from + HM_PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < HM_PAGE) break;
  }
  return out;
}

async function hmApply() {
  const fromV = document.getElementById("hmFrom").value;
  const toV = document.getElementById("hmTo").value;
  const msg = document.getElementById("hmMsg");
  msg.innerHTML = "";
  if (!fromV || !toV) { showMsg("hmMsg", "error", "Please select both a start and an end date."); return; }
  const fromD = hmParseKey(fromV), toD = hmParseKey(toV);
  if (fromD > toD) { showMsg("hmMsg", "error", "Start date cannot be after end date."); return; }
  const nDays = Math.round((toD - fromD) / 86400000) + 1;
  if (nDays > HM_MAX_DAYS) { showMsg("hmMsg", "error", "Please select a range of at most " + HM_MAX_DAYS + " days."); return; }

  const token = ++hmLoadToken;
  showMsg("hmMsg", "info", "Loading heat map data...");
  try {
    const startISO = new Date(fromD.getFullYear(), fromD.getMonth(), fromD.getDate(), 0, 0, 0, 0).toISOString();
    const endExclusive = new Date(toD.getFullYear(), toD.getMonth(), toD.getDate() + 1, 0, 0, 0, 0).toISOString();

    const [masterRows, dieselRows] = await Promise.all([
      hmFetchAll("master", "code, vehicle_name", ["code"]),
      hmFetchAll("diesel_data", "id, code, vehicle_name, entry_datetime, quantity", ["entry_datetime", "id"],
        q => q.gte("entry_datetime", startISO).lt("entry_datetime", endExclusive))
    ]);
    if (token !== hmLoadToken) return; // a newer request superseded this one

    const days = [];
    for (let i = 0; i < nDays; i++) { const d = new Date(fromD); d.setDate(d.getDate() + i); days.push(hmDateKey(d)); }
    const dayIndex = new Set(days);

    const map = new Map();
    const ensure = (code, name, registered) => {
      if (!map.has(code)) map.set(code, { code, name: name || code, daily: {}, counts: {}, entries: {}, total: 0, avg: 0, registered });
      return map.get(code);
    };
    masterRows.forEach(m => { if (m.code != null) ensure(String(m.code), m.vehicle_name, true); });

    const seen = new Set();
    dieselRows.forEach(r => {
      if (r.id != null) { if (seen.has(r.id)) return; seen.add(r.id); }
      if (r.code == null || !r.entry_datetime) return;
      const dt = new Date(r.entry_datetime);
      if (isNaN(dt)) return;
      const key = hmDateKey(dt);
      if (!dayIndex.has(key)) return;
      const q = parseFloat(r.quantity);
      const qty = isFinite(q) ? q : 0;
      const v = ensure(String(r.code), r.vehicle_name, false);
      v.daily[key] = (v.daily[key] || 0) + qty;
      v.counts[key] = (v.counts[key] || 0) + 1;
      (v.entries[key] = v.entries[key] || []).push({ id: r.id, entry_datetime: r.entry_datetime, quantity: qty });
    });

    map.forEach(v => {
      v.total = days.reduce((s, k) => s + (v.daily[k] || 0), 0);
      v.avg = v.total / nDays;
    });

    hmData = { days, vehicles: Array.from(map.values()), from: fromV, to: toV };
    msg.innerHTML = "";
    hmRender();
  } catch (err) {
    console.error(err);
    if (token === hmLoadToken) showMsg("hmMsg", "error", "Error loading heat map data: " + (err.message || "please try again."));
  }
}

// Value -> colour: 0 white; then green -> yellow -> orange -> red by ratio to max
function hmColor(v, max) {
  if (!v || v <= 0 || !max) return "#ffffff";
  const r = Math.min(1, v / max);
  const hue = 120 - 120 * r;            // 120 (green) -> 0 (red)
  const light = 82 - 32 * r;            // lighter for low, stronger for high
  return "hsl(" + hue.toFixed(0) + ",75%," + light.toFixed(0) + "%)";
}

function hmRender() {
  if (!hmData) return;
  const { days, vehicles } = hmData;
  const nDays = days.length;
  const term = document.getElementById("hmSearch").value.trim().toLowerCase();
  const sortBy = document.getElementById("hmSort").value;
  const dir = document.getElementById("hmOrder").value === "desc" ? -1 : 1;

  // ---- Summary cards (whole selected date range, all vehicles) ----
  const dayTotalsAll = {};
  let grandAll = 0, withEntries = 0, topV = null;
  vehicles.forEach(v => {
    if (Object.keys(v.counts).length > 0) withEntries++;
    grandAll += v.total;
    if (v.total > 0 && (!topV || v.total > topV.total)) topV = v;
    days.forEach(k => { dayTotalsAll[k] = (dayTotalsAll[k] || 0) + (v.daily[k] || 0); });
  });
  let topD = null;
  days.forEach(k => { if (dayTotalsAll[k] > 0 && (!topD || dayTotalsAll[k] > dayTotalsAll[topD])) topD = k; });
  document.getElementById("hmCards").innerHTML =
    '<div class="hm-card"><div class="hl">Total Diesel Consumption</div><div class="hv">' + hmFmt(grandAll) + ' LTR</div></div>' +
    '<div class="hm-card"><div class="hl">Vehicles with Diesel Entries</div><div class="hv">' + withEntries + '</div><div class="hs">of ' + vehicles.length + ' vehicles</div></div>' +
    '<div class="hm-card"><div class="hl">Average Daily Consumption</div><div class="hv">' + hmFmt(grandAll / nDays) + ' LTR</div><div class="hs">over ' + nDays + ' day' + (nDays > 1 ? "s" : "") + '</div></div>' +
    '<div class="hm-card"><div class="hl">Highest-Consumption Vehicle</div><div class="hv">' + (topV ? hmEsc(topV.name) : "–") + '</div><div class="hs">' + (topV ? hmFmt(topV.total) + " LTR" : "No data") + '</div></div>' +
    '<div class="hm-card"><div class="hl">Highest-Consumption Date</div><div class="hv">' + (topD ? hmLongLabel(topD) : "–") + '</div><div class="hs">' + (topD ? hmFmt(dayTotalsAll[topD]) + " LTR" : "No data") + '</div></div>';

  // ---- Search + sort ----
  let rows = vehicles.filter(v => !term || String(v.name).toLowerCase().includes(term) || String(v.code).toLowerCase().includes(term));
  rows.sort((a, b) => {
    let c;
    if (sortBy === "total") c = a.total - b.total;
    else if (sortBy === "avg") c = a.avg - b.avg;
    else c = String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" });
    if (c === 0) c = String(a.name).localeCompare(String(b.name), undefined, { numeric: true });
    return c * dir;
  });

  // ---- Colour scale based on displayed cells ----
  let max = 0;
  rows.forEach(v => days.forEach(k => { const x = v.daily[k] || 0; if (x > max) max = x; }));
  document.getElementById("hmLegendBar").style.background =
    "linear-gradient(to right," + [0.02, .25, .5, .75, 1].map(r => hmColor(r, 1)).join(",") + ")";
  document.getElementById("hmLegendMin").textContent = "Low";
  document.getElementById("hmLegendMax").textContent = "Very high (" + hmFmt(max) + " LTR)";

  // ---- Table ----
  const colTotals = {};
  let grand = 0;
  let h = '<thead><tr><th class="hm-name">Vehicle Name</th>';
  days.forEach(k => { h += "<th>" + hmLabel(k) + "</th>"; });
  h += '<th class="hm-total">Total (LTR)</th></tr></thead><tbody>';
  if (rows.length === 0) {
    h += '<tr><td class="hm-name" colspan="' + (nDays + 2) + '" style="text-align:left;color:var(--muted);">No vehicles match your search.</td></tr>';
  }
  rows.forEach(v => {
    h += '<tr><td class="hm-name" title="' + hmEsc(v.name) + " (" + hmEsc(v.code) + ')">' + hmEsc(v.name) + "</td>";
    days.forEach(k => {
      const x = v.daily[k] || 0;
      const n = v.counts[k] || 0;
      colTotals[k] = (colTotals[k] || 0) + x;
      h += '<td class="hm-cell" style="background:' + hmColor(x, max) + '" data-name="' + hmEsc(v.name) + '" data-code="' + hmEsc(v.code) +
           '" data-key="' + k + '" data-date="' + hmLongLabel(k) + '" data-qty="' + hmFmt(x) + '" data-cnt="' + n + '">' + (x > 0 ? hmFmt(x) : "–") + "</td>";
    });
    grand += v.total;
    h += '<td class="hm-total">' + hmFmt(v.total) + "</td></tr>";
  });
  h += '</tbody><tfoot><tr><td class="hm-name">Total Daily Consumption (LTR)</td>';
  days.forEach(k => { h += "<td>" + hmFmt(colTotals[k] || 0) + "</td>"; });
  h += '<td class="hm-total">' + hmFmt(grand) + "</td></tr></tfoot>";
  hmView = { days, rows, max, colTotals, grand, nDays, from: hmData.from, to: hmData.to, search: term,
    sum: { grandAll, withEntries, totalVehicles: vehicles.length, topV, topD, topDTotal: topD ? dayTotalsAll[topD] : 0 } };
  document.getElementById("hmTable").innerHTML = h;
}


/* ---- Edit consumption from a heat map cell ---- */
let hmEditCtx = null; // {code, key, entries:[{id, original}]}

function hmOpenEdit(code, key) {
  if (!hmData) return;
  const v = hmData.vehicles.find(x => String(x.code) === String(code));
  if (!v) return;
  const list = (v.entries[key] || []).slice().sort((a, b) => new Date(a.entry_datetime) - new Date(b.entry_datetime));
  document.getElementById("hmEditMsg").innerHTML = "";
  document.getElementById("hmEditInfo").innerHTML = "<b>" + hmEsc(v.name) + "</b> (" + hmEsc(v.code) + ") &middot; " + hmLongLabel(key);
  const rowsEl = document.getElementById("hmEditRows");
  const saveBtn = document.getElementById("hmEditSaveBtn");
  if (list.length === 0) {
    hmEditCtx = null;
    rowsEl.innerHTML = '<div class="msg info">There is no diesel entry for this vehicle on this date, so there is nothing to edit.</div>';
    saveBtn.classList.add("hidden");
  } else {
    hmEditCtx = { code: String(v.code), key, entries: list.map(e => ({ id: e.id, original: e.quantity })) };
    saveBtn.classList.remove("hidden");
    rowsEl.innerHTML = list.map((e, i) =>
      '<div class="hm-e-row"><div class="t">' + hmEsc(new Date(e.entry_datetime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })) +
      '</div><input type="number" step="0.01" min="0" id="hmEditQty' + i + '" value="' + e.quantity + '" oninput="hmMarkChanged(' + i + ')"><span style="font-size:12px;color:var(--muted);">LTR</span></div>'
    ).join("");
  }
  document.getElementById("hmEditOverlay").classList.add("open");
}

function hmMarkChanged(i) {
  if (!hmEditCtx) return;
  const inp = document.getElementById("hmEditQty" + i);
  inp.classList.toggle("changed", parseFloat(inp.value) !== hmEditCtx.entries[i].original);
}

function hmCloseEdit() {
  document.getElementById("hmEditOverlay").classList.remove("open");
  hmEditCtx = null;
}

async function hmSaveEdit() {
  if (!hmEditCtx) return;
  const ctx = hmEditCtx;
  const changes = [];
  for (let i = 0; i < ctx.entries.length; i++) {
    const val = parseFloat(document.getElementById("hmEditQty" + i).value);
    if (isNaN(val) || val <= 0) { showMsg("hmEditMsg", "error", "Please enter a valid quantity greater than 0 for every entry."); return; }
    if (val !== ctx.entries[i].original) changes.push({ id: ctx.entries[i].id, qty: val });
  }
  if (changes.length === 0) { showMsg("hmEditMsg", "info", "No changes to save."); return; }

  const btn = document.getElementById("hmEditSaveBtn");
  btn.disabled = true; btn.textContent = "Saving...";
  document.getElementById("hmEditMsg").innerHTML = "";
  try {
    for (const c of changes) {
      const { error } = await sb.from("diesel_data").update({ quantity: c.qty }).eq("id", c.id);
      if (error) throw error;
    }
    await syncLatestDataForCode(ctx.code);

    // Update local data and re-render in place (keeps filters, search, sort and scroll position)
    const v = hmData.vehicles.find(x => String(x.code) === ctx.code);
    const byId = new Map(changes.map(c => [c.id, c.qty]));
    (v.entries[ctx.key] || []).forEach(e => { if (byId.has(e.id)) e.quantity = byId.get(e.id); });
    v.daily[ctx.key] = (v.entries[ctx.key] || []).reduce((s, e) => s + e.quantity, 0);
    v.total = hmData.days.reduce((s, k) => s + (v.daily[k] || 0), 0);
    v.avg = v.total / hmData.days.length;
    hmRender();
    hmCloseEdit();
    showMsg("hmMsg", "success", "Diesel consumption updated.");
    setTimeout(() => { const m = document.getElementById("hmMsg"); if (m && m.textContent.includes("updated")) m.innerHTML = ""; }, 4000);
  } catch (err) {
    console.error(err);
    showMsg("hmEditMsg", "error", "Error: " + (err.message || "could not save changes."));
  }
  btn.disabled = false; btn.textContent = "Save Changes";
}


/* ============ HEAT MAP EXPORT (Excel / PDF) ============ */
const HM_BUCKETS = 20;
function hmHslToRgb(h, sat, l) {
  sat /= 100; l /= 100;
  const k = n => (n + h / 30) % 12, a = sat * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}
function hmRgbFor(v, max) {          // same scale as the on-screen heat map
  if (!v || v <= 0 || !max) return [255, 255, 255];
  const r = Math.min(1, v / max);
  return hmHslToRgb(120 - 120 * r, 75, 82 - 32 * r);
}
function hmBucket(v, max) {          // 0 = no fill, 1..HM_BUCKETS
  if (!v || v <= 0 || !max) return 0;
  return Math.max(1, Math.min(HM_BUCKETS, Math.ceil((v / max) * HM_BUCKETS)));
}
const hmHex = rgb => rgb.map(x => x.toString(16).padStart(2, "0")).join("").toUpperCase();
const hmNum = n => Math.round((n || 0) * 100) / 100;
function hmFileBase() { return "Vehicle_vs_Date_Heat_Map_" + hmView.from + "_to_" + hmView.to; }
function hmDownloadBlob(blob, name) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function hmSummaryLines() {
  const m = hmView.sum;
  return [
    ["Total Diesel Consumption (LTR)", hmFmt(m.grandAll)],
    ["Vehicles with Diesel Entries", m.withEntries + " of " + m.totalVehicles],
    ["Average Daily Consumption (LTR)", hmFmt(m.grandAll / hmView.nDays)],
    ["Highest-Consumption Vehicle", m.topV ? m.topV.name + " (" + hmFmt(m.topV.total) + " LTR)" : "-"],
    ["Highest-Consumption Date", m.topD ? hmLongLabel(m.topD) + " (" + hmFmt(m.topDTotal) + " LTR)" : "-"]
  ];
}
function hmPeriodText() { return hmLongLabel(hmView.days[0]) + " to " + hmLongLabel(hmView.days[hmView.days.length - 1]) + " (" + hmView.nDays + " days)"; }

/* ---- minimal .xlsx writer (no external library) ---- */
const hmCrcTable = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function hmCrc32(b) { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = hmCrcTable[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
function hmZip(files) {              // files: [{name, data(string)}], stored (no compression)
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  files.forEach(f => {
    const name = enc.encode(f.name), data = enc.encode(f.data), crc = hmCrc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, 0, true); lh.setUint16(12, 33, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
    ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 33, true); ch.setUint32(16, crc, true);
    ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
    ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  });
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
const hmXml = t => String(t == null ? "" : t).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
function hmCol(n) { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; }

function hmBuildXlsx() {
  const v = hmView, nD = v.days.length;
  // style ids
  const S = { title: 1, head: 2, name: 3, zero: 4, bucket0: 5, total: 5 + HM_BUCKETS, label: 6 + HM_BUCKETS, text: 7 + HM_BUCKETS, footLabel: 8 + HM_BUCKETS, footNum: 9 + HM_BUCKETS };
  let fills = '<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF3457C9"/></patternFill></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFEEF1FB"/></patternFill></fill>';
  for (let i = 1; i <= HM_BUCKETS; i++) fills += '<fill><patternFill patternType="solid"><fgColor rgb="FF' + hmHex(hmRgbFor(i / HM_BUCKETS, 1)) + '"/></patternFill></fill>';
  const al = h => '<alignment horizontal="' + h + '" vertical="center"/>';
  let xfs = '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="2" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al("center") + '</xf>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1">' + al("left") + '</xf>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1">' + al("center") + '</xf>';
  for (let i = 1; i <= HM_BUCKETS; i++) xfs += '<xf numFmtId="164" fontId="0" fillId="' + (3 + i) + '" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al("center") + '</xf>';
  xfs += '<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al("center") + '</xf>' +
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al("left") + '</xf>' +
    '<xf numFmtId="164" fontId="3" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">' + al("center") + '</xf>';
  const nXf = 10 + HM_BUCKETS;
  const styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00;-#,##0.00;&quot;-&quot;"/></numFmts>' +
    '<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><color rgb="FF7A1E8C"/><name val="Calibri"/></font>' +
    '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FF7A1E8C"/><name val="Calibri"/></font></fonts>' +
    '<fills count="' + (4 + HM_BUCKETS) + '">' + fills + '</fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border>' +
    ['left', 'right', 'top', 'bottom'].map(x => '<' + x + ' style="thin"><color rgb="FFDCDFEF"/></' + x + '>').join('') + '<diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="' + nXf + '">' + xfs + '</cellXfs></styleSheet>';

  const strC = (r, c, t, st) => '<c r="' + hmCol(c) + r + '" t="inlineStr" s="' + st + '"><is><t xml:space="preserve">' + hmXml(t) + '</t></is></c>';
  const numC = (r, c, val, st, f) => '<c r="' + hmCol(c) + r + '" s="' + st + '">' + (f ? '<f>' + f + '</f>' : '') + '<v>' + val + '</v></c>';
  const rowsXml = [];
  const addRow = (r, cells) => rowsXml.push('<row r="' + r + '">' + cells.join('') + '</row>');

  addRow(1, [strC(1, 0, "Vehicle vs Date Diesel Consumption Heat Map", S.title)]);
  addRow(2, [strC(2, 0, "Period", S.label), strC(2, 1, hmPeriodText(), S.text)]);
  addRow(3, [strC(3, 0, "Generated", S.label), strC(3, 1, new Date().toLocaleString(), S.text)]);
  const sl = hmSummaryLines();
  sl.forEach((l, i) => addRow(4 + i, [strC(4 + i, 0, l[0], S.label), strC(4 + i, 1, l[1], S.text)]));
  const note = v.search ? 'Table filtered by search: "' + v.search + '" (table totals cover the vehicles shown; summary covers all vehicles)' : "";
  if (note) addRow(9, [strC(9, 0, note, S.text)]);

  const H = 11, first = H + 1, last = H + v.rows.length;
  const c0 = 1, cT = 1 + nD, cA = 2 + nD;       // first date col, total col, avg col
  const head = [strC(H, 0, "Vehicle Name", S.head)];
  v.days.forEach((k, i) => head.push(strC(H, c0 + i, hmLabel(k), S.head)));
  head.push(strC(H, cT, "Total (LTR)", S.head), strC(H, cA, "Avg Daily (LTR)", S.head));
  addRow(H, head);
  v.rows.forEach((veh, ri) => {
    const r = first + ri, cells = [strC(r, 0, veh.name, S.name)];
    v.days.forEach((k, i) => { const x = hmNum(veh.daily[k]); cells.push(numC(r, c0 + i, x, (hmBucket(x, v.max) ? S.bucket0 + hmBucket(x, v.max) - 1 : S.zero))); });
    cells.push(numC(r, cT, hmNum(veh.total), S.total, "SUM(" + hmCol(c0) + r + ":" + hmCol(c0 + nD - 1) + r + ")"));
    cells.push(numC(r, cA, hmNum(veh.avg), S.total, hmCol(cT) + r + "/" + nD));
    addRow(r, cells);
  });
  const fr = last + 1, foot = [strC(fr, 0, "Total Daily Consumption (LTR)", S.footLabel)];
  v.days.forEach((k, i) => foot.push(v.rows.length ? numC(fr, c0 + i, hmNum(v.colTotals[k]), S.footNum, "SUM(" + hmCol(c0 + i) + first + ":" + hmCol(c0 + i) + last + ")") : numC(fr, c0 + i, 0, S.footNum)));
  foot.push(v.rows.length ? numC(fr, cT, hmNum(v.grand), S.footNum, "SUM(" + hmCol(cT) + first + ":" + hmCol(cT) + last + ")") : numC(fr, cT, 0, S.footNum));
  foot.push(numC(fr, cA, hmNum(v.grand / nD), S.footNum, hmCol(cT) + fr + "/" + nD));
  addRow(fr, foot);

  const cols = '<cols><col min="1" max="1" width="34" customWidth="1"/><col min="2" max="' + (1 + nD) + '" width="9" customWidth="1"/><col min="' + (2 + nD) + '" max="' + (3 + nD) + '" width="16" customWidth="1"/></cols>';
  const sheet = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane xSplit="1" ySplit="' + H + '" topLeftCell="B' + (H + 1) + '" activePane="bottomRight" state="frozen"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' + cols + '<sheetData>' + rowsXml.join('') + '</sheetData>' +
    '<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>';

  const ns = 'xmlns="http://schemas.openxmlformats.org/package/2006/relationships"';
  return hmZip([
    { name: "[Content_Types].xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>' },
    { name: "_rels/.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ' + ns + '><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
    { name: "xl/workbook.xml", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Heat Map" sheetId="1" r:id="rId1"/></sheets></workbook>' },
    { name: "xl/_rels/workbook.xml.rels", data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships ' + ns + '><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
    { name: "xl/styles.xml", data: styles },
    { name: "xl/worksheets/sheet1.xml", data: sheet }
  ]);
}

function hmExportExcel() {
  if (!hmView || !hmView.rows) { showMsg("hmMsg", "error", "Load the heat map first, then export."); return; }
  try { hmDownloadBlob(hmBuildXlsx(), hmFileBase() + ".xlsx"); }
  catch (err) { console.error(err); showMsg("hmMsg", "error", "Could not create the Excel file: " + err.message); }
}

/* ---- PDF (jsPDF + AutoTable, loaded on demand) ---- */
const hmLibCache = {};
function hmLoadScript(src) {
  if (!hmLibCache[src]) hmLibCache[src] = new Promise((res, rej) => {
    const el = document.createElement("script");
    el.src = src; el.onload = res; el.onerror = () => { delete hmLibCache[src]; rej(new Error("Could not load " + src)); };
    document.head.appendChild(el);
  });
  return hmLibCache[src];
}

async function hmExportPdf() {
  if (!hmView || !hmView.rows) { showMsg("hmMsg", "error", "Load the heat map first, then export."); return; }
  const btn = document.getElementById("hmPdfBtn"), label = btn.innerHTML;
  btn.disabled = true; btn.textContent = "Preparing PDF...";
  try {
    if (!(window.jspdf && window.jspdf.jsPDF)) await hmLoadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js");
    if (!(window.jspdf && window.jspdf.jsPDF && window.jspdf.jsPDF.API.autoTable)) await hmLoadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js");
    const v = hmView, nD = v.days.length;
    const doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "pt", format: nD > 31 ? "a3" : "a4" });
    const pageW = doc.internal.pageSize.getWidth(), pageH = doc.internal.pageSize.getHeight();

    doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(122, 30, 140);
    doc.text("Vehicle vs Date Diesel Consumption Heat Map", 30, 34);
    doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(80, 80, 80);
    doc.text("Period: " + hmPeriodText() + "     Generated: " + new Date().toLocaleString(), 30, 50);
    let y = 66;
    hmSummaryLines().forEach((l, i) => {
      const col = i % 3, row = Math.floor(i / 3);
      doc.setFont("helvetica", "bold");
      const lw = doc.getTextWidth(l[0] + ": ");
      doc.text(l[0] + ":", 30 + col * 300, y + row * 13);
      doc.setFont("helvetica", "normal"); doc.text(String(l[1]), 30 + col * 300 + lw + 2, y + row * 13);
    });
    y += 13 * 2 + 8;
    if (v.search) { doc.setTextColor(150, 80, 0); doc.text('Table filtered by search "' + v.search + '"; table totals cover the vehicles shown.', 30, y); y += 12; doc.setTextColor(80, 80, 80); }
    // legend
    doc.text("Color scale (LTR):  0", 30, y + 8);
    const lx = 30 + doc.getTextWidth("Color scale (LTR):  0") + 6;
    for (let i = 0; i < 40; i++) { const c = hmRgbFor((i + 1) / 40, 1); doc.setFillColor(c[0], c[1], c[2]); doc.rect(lx + i * 4, y, 4, 10, "F"); }
    doc.text(hmFmt(v.max) + "  (white = zero, green = low, red = very high)", lx + 166, y + 8);
    y += 18;

    const head = [["Vehicle"].concat(v.days.map(k => hmLabel(k).replace(" ", "\n")), ["Total", "Avg/Day"])];
    const body = v.rows.map(r => [r.name].concat(v.days.map(k => { const x = r.daily[k] || 0; return x > 0 ? hmFmt(x) : "-"; }), [hmFmt(r.total), hmFmt(r.avg)]));
    const foot = [["Total Daily (LTR)"].concat(v.days.map(k => hmFmt(v.colTotals[k] || 0)), [hmFmt(v.grand), hmFmt(v.grand / nD)])];
    // Fit every date column on the page width: size columns and font from the range length
    const usable = pageW - 60, nameW = 110, totW = 46, avgW = 42;
    const dateW = (usable - nameW - totW - avgW) / nD;
    let maxLen = 3;
    body.forEach(r => r.slice(1, 1 + nD).forEach(t => { if (t.length > maxLen) maxLen = t.length; }));
    foot[0].slice(1, 1 + nD).forEach(t => { if (t.length > maxLen) maxLen = t.length; });
    const fs = Math.max(4.5, Math.min(9, (dateW - 2) / (0.6 * maxLen)));
    const colStyles = { 0: { halign: "left", cellWidth: nameW, fontStyle: "bold" } };
    for (let i = 1; i <= nD; i++) colStyles[i] = { cellWidth: dateW };
    colStyles[nD + 1] = { cellWidth: totW }; colStyles[nD + 2] = { cellWidth: avgW };

    doc.autoTable({
      head, body, foot: v.rows.length ? foot : undefined, startY: y, showFoot: "lastPage",
      theme: "grid", margin: { left: 30, right: 30, bottom: 34 },
      tableWidth: usable, styles: { fontSize: fs, cellPadding: 1.2, halign: "center", valign: "middle", lineColor: [220, 223, 239], lineWidth: 0.4, textColor: [34, 34, 34], overflow: "linebreak" },
      headStyles: { fillColor: [52, 87, 201], textColor: 255, fontStyle: "bold" },
      footStyles: { fillColor: [238, 241, 251], textColor: [122, 30, 140], fontStyle: "bold" },
      columnStyles: colStyles,
      didParseCell: d => {
        if (d.section === "body" && d.column.index >= 1 && d.column.index <= nD) {
          const val = v.rows[d.row.index].daily[v.days[d.column.index - 1]] || 0;
          const c = hmRgbFor(val, v.max); d.cell.styles.fillColor = c;
        } else if (d.section === "body" && d.column.index > nD) {
          d.cell.styles.fillColor = [238, 241, 251]; d.cell.styles.fontStyle = "bold"; d.cell.styles.textColor = [122, 30, 140];
        }
      },
      didDrawPage: () => {
        doc.setFontSize(8); doc.setTextColor(120, 120, 120);
        doc.text("Page " + doc.internal.getNumberOfPages(), pageW - 30, pageH - 16, { align: "right" });
        doc.text("Diesel Tracker Admin", 30, pageH - 16);
      }
    });
    doc.save(hmFileBase() + ".pdf");
  } catch (err) {
    console.error(err);
    showMsg("hmMsg", "error", "Could not create the PDF: " + (err.message || "check your internet connection and try again."));
  }
  btn.disabled = false; btn.innerHTML = label;
}

/* ============ COMPREHENSIVE DIESEL DATA TABLE ============ */
function onDieselFilterInput() {
  clearTimeout(dieselFilterTimer);
  dieselFilterTimer = setTimeout(() => loadDieselDataTable(1), 350); // debounce
}

function clearDieselFilters() {
  document.getElementById("ddFilterVehicle").value = "";
  document.getElementById("ddFilterOperator").value = "";
  document.getElementById("ddFilterDriver").value = "";
  document.getElementById("ddFilterFrom").value = "";
  document.getElementById("ddFilterTo").value = "";
  loadDieselDataTable(1);
}

function sortDieselData(col) {
  if (dieselSortCol === col) dieselSortAsc = !dieselSortAsc;
  else { dieselSortCol = col; dieselSortAsc = false; }
  ["entry_datetime","vehicle_name","quantity","admin_reading","operator_reading"].forEach(c => {
    document.getElementById("arrow_" + c).textContent = (c === dieselSortCol) ? (dieselSortAsc ? "▲" : "▼") : "";
  });
  loadDieselDataTable(1);
}

function changeDieselPage(delta) {
  loadDieselDataTable(dieselPage + delta);
}

async function loadDieselDataTable(page) {
  dieselPage = Math.max(1, page);
  const tbody = document.querySelector("#dieselDataTable tbody");
  document.getElementById("dieselTableMsg").innerHTML = "";
  tbody.innerHTML = '<tr><td colspan="11" style="color:var(--muted);">Loading...</td></tr>';

  const vehicleTerm = document.getElementById("ddFilterVehicle").value.trim();
  const operatorTerm = document.getElementById("ddFilterOperator").value.trim();
  const driverTerm = document.getElementById("ddFilterDriver").value.trim();
  const fromDate = document.getElementById("ddFilterFrom").value;
  const toDate = document.getElementById("ddFilterTo").value;

  try {
    let query = sb.from("diesel_data")
      .select("id, code, vehicle_name, entry_datetime, quantity, meter_reading, admin_reading, operator_reading, operator_name, operator_mobile, driver_name, driver_id_mobile, created_at", { count: "exact" });

    if (vehicleTerm) query = query.or("vehicle_name.ilike.%" + vehicleTerm + "%,code.ilike.%" + vehicleTerm + "%");
    if (operatorTerm) query = query.ilike("operator_name", "%" + operatorTerm + "%");
    if (driverTerm) query = query.ilike("driver_name", "%" + driverTerm + "%");
    if (fromDate) query = query.gte("entry_datetime", new Date(fromDate + "T00:00:00").toISOString());
    if (toDate) query = query.lte("entry_datetime", new Date(toDate + "T23:59:59").toISOString());

    query = query.order(dieselSortCol, { ascending: dieselSortAsc });

    const from = (dieselPage - 1) * DIESEL_PAGE_SIZE;
    const to = from + DIESEL_PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    if (!data || data.length === 0) {
      tbody.innerHTML = '<tr><td colspan="11" style="color:var(--muted);">No matching diesel entries.</td></tr>';
    } else {
      currentDieselRows = data;
      tbody.innerHTML = data.map(r =>
        '<tr>' +
        '<td>' + new Date(r.entry_datetime).toLocaleString() + '</td>' +
        '<td>' + escapeHtml(r.vehicle_name) + '</td>' +
        '<td>' + r.quantity + '</td>' +
        '<td>' + escapeHtml(r.driver_name || "-") + '</td>' +
        '<td>' + escapeHtml(r.driver_id_mobile || "-") + '</td>' +
        '<td>' + escapeHtml(r.operator_name) + '</td>' +
        '<td>' + r.meter_reading + '</td>' +
        '<td>' + mtFmt(r.admin_reading) + '</td><td>' + mtFmt(r.operator_reading) + '</td><td>' + mtGapCell(mtGap(r.operator_reading, r.admin_reading)) + '</td>' +
        '<td style="white-space:nowrap;">' +
        '<button class="btn small outline" style="margin-right:6px;" onclick="editDieselRow(\'' + r.id + '\')">Edit</button>' +
        '<button class="btn small" style="background:var(--red);" onclick="deleteDieselRow(\'' + r.id + '\')">Delete</button>' +
        '</td>' +
        '</tr>'
      ).join("");
    }

    const totalPages = Math.max(1, Math.ceil((count || 0) / DIESEL_PAGE_SIZE));
    document.getElementById("dieselPageInfo").textContent =
      (count || 0) + " record(s) — page " + dieselPage + " of " + totalPages;
    document.getElementById("dieselPrevBtn").disabled = dieselPage <= 1;
    document.getElementById("dieselNextBtn").disabled = dieselPage >= totalPages;
  } catch (err) {
    console.error(err);
    tbody.innerHTML = "";
    showMsg("dieselTableMsg", "error", "Error loading diesel data.");
  }
}

/* ============ EDIT / DELETE DIESEL ENTRY ============ */
function dtToLocalInputValue(dt) {
  // Converts a Date to the "YYYY-MM-DDTHH:mm" format <input type="datetime-local"> needs.
  const pad = n => String(n).padStart(2, "0");
  return dt.getFullYear() + "-" + pad(dt.getMonth() + 1) + "-" + pad(dt.getDate()) +
    "T" + pad(dt.getHours()) + ":" + pad(dt.getMinutes());
}

function editDieselRow(id) {
  const r = currentDieselRows.find(row => String(row.id) === String(id));
  if (!r) return;

  document.getElementById("dieselEditId").value = r.id;
  document.getElementById("dieselEditVehicleLabel").textContent = r.vehicle_name + " (" + r.code + ")";
  document.getElementById("dieselEditDatetime").value = dtToLocalInputValue(new Date(r.entry_datetime));
  document.getElementById("dieselEditQuantity").value = r.quantity;
  document.getElementById("dieselEditMeter").value = r.meter_reading;
  document.getElementById("dieselEditOperatorName").value = r.operator_name || "";
  document.getElementById("dieselEditOperatorMobile").value = r.operator_mobile || "";
  document.getElementById("dieselEditDriverName").value = r.driver_name || "";
  document.getElementById("dieselEditDriverIdMobile").value = r.driver_id_mobile || "";
  document.getElementById("dieselEditMsg").innerHTML = "";

  document.getElementById("dieselEditCard").classList.remove("hidden");
  document.getElementById("dieselEditCard").scrollIntoView({ behavior: "smooth", block: "center" });
}

function cancelDieselEdit() {
  document.getElementById("dieselEditCard").classList.add("hidden");
}

async function saveDieselEdit() {
  const msgBox = "dieselEditMsg";
  document.getElementById(msgBox).innerHTML = "";

  const id = document.getElementById("dieselEditId").value;
  const dtVal = document.getElementById("dieselEditDatetime").value;
  const quantity = parseFloat(document.getElementById("dieselEditQuantity").value);
  const meter = parseFloat(document.getElementById("dieselEditMeter").value);
  const opName = document.getElementById("dieselEditOperatorName").value.trim();
  const opMobile = document.getElementById("dieselEditOperatorMobile").value.trim();
  const drvName = document.getElementById("dieselEditDriverName").value.trim();
  const drvIdMobile = document.getElementById("dieselEditDriverIdMobile").value.trim();

  if (!dtVal) { showMsg(msgBox, "error", "Date & time is required."); return; }
  if (isNaN(quantity) || quantity <= 0) { showMsg(msgBox, "error", "Please enter a valid quantity."); return; }
  if (isNaN(meter) || meter < 0) { showMsg(msgBox, "error", "Please enter a valid meter reading."); return; }
  if (!opName) { showMsg(msgBox, "error", "Operator name is required."); return; }

  const row = currentDieselRows.find(r => String(r.id) === String(id));
  const btn = document.getElementById("dieselEditSaveBtn");
  btn.disabled = true;
  btn.textContent = "Saving...";

  try {
    const { error } = await sb.from("diesel_data")
      .update({
        entry_datetime: new Date(dtVal).toISOString(),
        quantity: quantity,
        meter_reading: meter,
        operator_name: opName,
        operator_mobile: opMobile || null,
        driver_name: drvName || null,
        driver_id_mobile: drvIdMobile || null
      })
      .eq("id", id);
    if (error) throw error;

    if (row) await syncLatestDataForCode(row.code);

    document.getElementById("dieselEditCard").classList.add("hidden");
    showMsg("dieselTableMsg", "success", "Diesel entry updated successfully.");
    loadDieselDataTable(dieselPage);
  } catch (err) {
    console.error(err);
    showMsg(msgBox, "error", "Error: " + (err.message || "could not save changes."));
  }
  btn.disabled = false;
  btn.textContent = "Save Changes";
}

async function deleteDieselRow(id) {
  const row = currentDieselRows.find(r => String(r.id) === String(id));
  const label = row ? (row.vehicle_name + " — " + new Date(row.entry_datetime).toLocaleString() + " — " + row.quantity + " L") : id;
  const ok = confirm("Are you sure you want to delete this diesel entry?\n\n" + label + "\n\nThis cannot be undone.");
  if (!ok) return;

  try {
    const { error } = await sb.from("diesel_data").delete().eq("id", id);
    if (error) throw error;

    if (row) await syncLatestDataForCode(row.code);

    showMsg("dieselTableMsg", "success", "Diesel entry deleted.");
    loadDieselDataTable(dieselPage);
  } catch (err) {
    console.error(err);
    alert("Error deleting entry: " + (err.message || ""));
  }
}

async function syncLatestDataForCode(code) {
  // The insert trigger keeps latest_data in sync automatically, but it
  // only fires on INSERT — editing or deleting a historical row needs
  // this explicit re-sync so latest_data (and the QR scanner) still
  // reflects whatever the vehicle's newest remaining entry actually is.
  try {
    const { data: newest } = await sb.from("diesel_data")
      .select("entry_datetime, quantity, meter_reading, vehicle_name, operator_name, operator_mobile, driver_name, driver_id_mobile")
      .eq("code", code)
      .order("entry_datetime", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (newest) {
      await sb.from("latest_data").update({
        entry_datetime: newest.entry_datetime,
        quantity: newest.quantity,
        meter_reading: newest.meter_reading,
        vehicle_name: newest.vehicle_name,
        operator_name: newest.operator_name,
        operator_mobile: newest.operator_mobile,
        driver_name: newest.driver_name,
        driver_id_mobile: newest.driver_id_mobile
      }).eq("code", code);
    } else {
      // No diesel_data rows left at all for this vehicle — clear the
      // diesel-related fields but leave status/location untouched.
      await sb.from("latest_data").update({
        entry_datetime: null, quantity: null, meter_reading: null,
        operator_name: null, operator_mobile: null, driver_name: null, driver_id_mobile: null
      }).eq("code", code);
    }
  } catch (err) {
    console.error("latest_data re-sync failed", err);
  }
}

/* ============ VEHICLE CONSUMPTION ANALYSIS ============ */
let analysisView = "date";

function populateAnalysisVehicleSelect() {
  const sel = document.getElementById("analysisVehicleSelect");
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Select a vehicle --</option>' +
    naturalSortByName(vehicleCache || []).map(v => '<option value="' + v.code + '">' + escapeHtml(v.vehicle_name) + '</option>').join("");
  if (current) sel.value = current;
}

function setAnalysisView(view) {
  analysisView = view;
  document.getElementById("viewDateBtn").classList.toggle("active", view === "date");
  document.getElementById("viewMonthBtn").classList.toggle("active", view === "month");
  document.getElementById("viewYearBtn").classList.toggle("active", view === "year");
}

async function applyAnalysis() {
  const code = document.getElementById("analysisVehicleSelect").value;
  const from = document.getElementById("analysisFrom").value;
  const to = document.getElementById("analysisTo").value;
  const msgBox = "analysisMsg";
  document.getElementById(msgBox).innerHTML = "";
  document.getElementById("analysisChartArea").classList.add("hidden");

  if (!code) { showMsg(msgBox, "error", "Please select a vehicle."); return; }

  showMsg(msgBox, "info", "Loading consumption data...");

  try {
    // Only the two columns needed, filtered by code (not name) + date
    // range — never the whole diesel_data table.
    let query = sb.from("diesel_data").select("entry_datetime, quantity").eq("code", code);
    if (from) query = query.gte("entry_datetime", new Date(from + "T00:00:00").toISOString());
    if (to) query = query.lte("entry_datetime", new Date(to + "T23:59:59").toISOString());
    query = query.order("entry_datetime");

    const { data: rows, error } = await query;
    if (error) throw error;

    document.getElementById(msgBox).innerHTML = "";

    if (!rows || rows.length === 0) {
      showMsg(msgBox, "info", "No diesel entries found for this vehicle in the selected range.");
      return;
    }

    renderAnalysis(rows, code);
  } catch (err) {
    console.error(err);
    showMsg(msgBox, "error", "Error loading consumption data.");
  }
}

function groupKey(dt, view) {
  const d = new Date(dt);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (view === "year") return String(y);
  if (view === "month") return y + "-" + m;
  return y + "-" + m + "-" + day;
}

function groupLabel(key, view) {
  if (view === "year") return key;
  if (view === "month") {
    const [y, m] = key.split("-");
    return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  return new Date(key + "T00:00:00").toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function renderAnalysis(rows, code) {
  const vehicle = (vehicleCache || []).find(v => v.code === code);
  const vehicleName = vehicle ? vehicle.vehicle_name : code;

  // Group raw rows by the selected period, summing quantity per group
  // and counting entries per group (per rule: sum quantities when
  // multiple entries land in the same period).
  const groups = {};
  rows.forEach(r => {
    const key = groupKey(r.entry_datetime, analysisView);
    if (!groups[key]) groups[key] = { total: 0, count: 0 };
    groups[key].total += Number(r.quantity);
    groups[key].count += 1;
  });

  const keys = Object.keys(groups).sort();
  const totals = keys.map(k => groups[k].total);
  const grandTotal = rows.reduce((s, r) => s + Number(r.quantity), 0);
  const highest = Math.max(...totals);
  const lowest = Math.min(...totals);
  const avgPerPeriod = grandTotal / keys.length;
  const periodLabel = analysisView === "date" ? "L/day" : analysisView === "month" ? "L/month" : "L/year";

  document.getElementById("analysisSummary").innerHTML = [
    ["Vehicle", vehicleName],
    ["Total Consumption", grandTotal.toFixed(2) + " L"],
    ["Average Consumption", avgPerPeriod.toFixed(2) + " " + periodLabel],
    ["Highest Consumption", highest.toFixed(2) + " L"],
    ["Lowest Consumption", lowest.toFixed(2) + " L"],
    ["Number of Entries", rows.length]
  ].map(p => '<div class="summary-item"><div class="snum">' + escapeHtml(p[1]) + '</div><div class="slbl">' + escapeHtml(p[0]) + '</div></div>').join("");

  const maxVal = Math.max(...totals, 1);
  const bars = document.getElementById("chartBars");
  const labelClass = analysisView === "date" ? "chart-bar-label" : "chart-bar-label horizontal";
  bars.innerHTML = keys.map(k => {
    const g = groups[k];
    const heightPct = Math.max((g.total / maxVal) * 100, 2);
    return '<div class="chart-bar-col" onclick="showChartTooltip(\'' + k + '\', ' + g.total + ', ' + g.count + ')">' +
      '<div class="chart-bar-value">' + g.total.toFixed(1) + '</div>' +
      '<div class="chart-bar" style="height:' + heightPct + '%;"></div>' +
      '<div class="' + labelClass + '">' + escapeHtml(groupLabel(k, analysisView)) + '</div>' +
      '</div>';
  }).join("");

  document.getElementById("chartTooltip").style.display = "none";
  document.getElementById("analysisChartArea").classList.remove("hidden");

  // Auto-show the most recent period's detail so the tooltip isn't
  // empty on first render.
  const lastKey = keys[keys.length - 1];
  showChartTooltip(lastKey, groups[lastKey].total, groups[lastKey].count);
}

function showChartTooltip(key, total, count) {
  document.querySelectorAll(".chart-bar").forEach(b => b.classList.remove("selected"));
  const tip = document.getElementById("chartTooltip");
  tip.style.display = "block";
  tip.innerHTML =
    '<strong>' + escapeHtml(groupLabel(key, analysisView)) + '</strong><br>' +
    'Consumption: ' + Number(total).toFixed(2) + ' L<br>' +
    'Entries: ' + count;
}

/* ============ CREATE NEW QR CODE ============ */
async function createVehicle() {
  const code = document.getElementById("newCode").value.trim().toUpperCase();
  const name = document.getElementById("newName").value.trim();
  document.getElementById("createMsg").innerHTML = "";
  document.getElementById("newQrPreview").style.display = "none";

  if (!code) { showMsg("createMsg", "error", "Vehicle code is required."); return; }
  if (!name) { showMsg("createMsg", "error", "Vehicle name is required."); return; }

  const btn = document.getElementById("createBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Creating...';

  try {
    // Duplicate check
    const { data: existing } = await sb.from("master").select("code").eq("code", code).maybeSingle();
    if (existing) {
      showMsg("createMsg", "error", "A vehicle with code \"" + code + "\" already exists.");
      btn.disabled = false; btn.innerHTML = '<svg class="ic"><use href="#i-plus"/></svg>Create &amp; Generate QR Code';
      return;
    }

    const { error: insertErr } = await sb.from("master").insert({ code, vehicle_name: name });
    if (insertErr) throw insertErr;

    // Generate + upload QR immediately
    const { svg, publicUrl } = await generateAndUploadQr(code, name);

    showMsg("createMsg", "success", "Vehicle \"" + code + "\" created and QR code generated successfully.");
    document.getElementById("newQrImg").src = publicUrl;
    document.getElementById("newQrCode").textContent = code;
    document.getElementById("newQrName").textContent = name;
    document.getElementById("newQrPreview").style.display = "block";

    document.getElementById("newCode").value = "";
    document.getElementById("newName").value = "";

    await loadVehicleCache(); // refresh dropdowns everywhere
  } catch (err) {
    console.error(err);
    showMsg("createMsg", "error", "Error: " + (err.message || "could not create vehicle."));
  }
  btn.disabled = false;
  btn.innerHTML = '<svg class="ic"><use href="#i-plus"/></svg>Create &amp; Generate QR Code';
}

/* ============ CSV BULK IMPORT ============ */
const CSV_LOCATIONS = { X: "Monica/Monalisa", S: "Sanitary" };
const CSV_TYPES = ["PL", "FL", "DT", "EF", "EX"];
const CSV_OWNERSHIP = { O: "Own", R: "Rental" };

let csvParsedRows = []; // rows after validation, ready for preview / import

function downloadCsvTemplate() {
  const csv = "vehicle_name,code\nForklift-01,XFL0001O\nForklift-02,XFL0002O\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "vehicle_qr_template.csv";
  link.click();
}

function parseCsvText(text) {
  // Basic CSV line parser (handles simple quoted fields with commas inside).
  const lines = text.split(/\r\n|\n|\r/).map(l => l.trim()).filter(l => l.length > 0);
  const rows = lines.map(line => {
    const cells = [];
    let cur = "", inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQuotes = !inQuotes; continue; }
      if (ch === "," && !inQuotes) { cells.push(cur); cur = ""; continue; }
      cur += ch;
    }
    cells.push(cur);
    return cells.map(c => c.trim());
  });
  return rows;
}

function validateCsvCode(code) {
  if (!code) return "Code is required.";
  if (code.length !== 8) return "Code must contain exactly 8 characters.";
  const location = code[0];
  const numberPart = code.substring(3, 7);
  const ownership = code[7];

  if (!CSV_LOCATIONS[location]) return "Invalid location character \"" + location + "\" (must be X or S).";
  if (!/^\d{4}$/.test(numberPart)) return "Vehicle number portion must be exactly 4 digits.";
  if (!CSV_OWNERSHIP[ownership]) return "Invalid ownership character \"" + ownership + "\" (must be O or R).";
  return null; // valid
}

async function handleCsvFile(event) {
  const file = event.target.files[0];
  event.target.value = ""; // allow re-selecting the same file later
  if (!file) return;

  document.getElementById("csvImportMsg").innerHTML = "";
  const text = await file.text();
  const rows = parseCsvText(text);

  if (rows.length === 0) {
    showMsg("csvImportMsg", "error", "The CSV file is empty.");
    return;
  }

  const header = rows[0].map(h => h.toLowerCase());
  if (header.length !== 2 || header[0] !== "vehicle_name" || header[1] !== "code") {
    showMsg("csvImportMsg", "error", 'Invalid header. The first row must be exactly: vehicle_name,code');
    return;
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    showMsg("csvImportMsg", "error", "No data rows found below the header.");
    return;
  }

  // Refresh vehicle cache so "already exists in database" checks are current
  await loadVehicleCache();
  const existingCodes = new Set(vehicleCache.map(v => v.code.toUpperCase()));
  const existingNames = new Set(vehicleCache.map(v => v.vehicle_name.trim().toLowerCase()));

  const seenNamesInFile = new Set();
  const seenCodesInFile = new Set();

  csvParsedRows = dataRows.map((cells, idx) => {
    const rowNum = idx + 2; // account for header row = row 1
    const vehicle_name = (cells[0] || "").trim();
    const code = (cells[1] || "").trim().toUpperCase();

    let reason = null;

    if (!vehicle_name) reason = "Vehicle name is required.";
    else if (!code) reason = "Code is required.";
    else reason = validateCsvCode(code);

    if (!reason && seenCodesInFile.has(code)) reason = "Duplicate code within this CSV file.";
    if (!reason && seenNamesInFile.has(vehicle_name.toLowerCase())) reason = "Duplicate vehicle name within this CSV file.";
    if (!reason && existingCodes.has(code)) reason = "Code already exists in the database.";
    if (!reason && existingNames.has(vehicle_name.toLowerCase())) reason = "Vehicle name already exists in the database.";

    if (vehicle_name) seenNamesInFile.add(vehicle_name.toLowerCase());
    if (code) seenCodesInFile.add(code);

    return { rowNum, vehicle_name, code, valid: !reason, reason };
  });

  renderCsvPreview();
}

function renderCsvPreview() {
  const validCount = csvParsedRows.filter(r => r.valid).length;
  const invalidCount = csvParsedRows.length - validCount;

  document.getElementById("csvPreviewSummary").innerHTML =
    '<div class="msg ' + (invalidCount > 0 ? "info" : "success") + '">' +
    csvParsedRows.length + ' row(s) read — ' + validCount + ' valid, ' + invalidCount + ' invalid. ' +
    (invalidCount > 0 ? "Invalid rows will be skipped and are not created." : "") +
    '</div>';

  const tbody = document.querySelector("#csvPreviewTable tbody");
  tbody.innerHTML = csvParsedRows.map(r =>
    '<tr>' +
    '<td>' + r.rowNum + '</td>' +
    '<td>' + escapeHtml(r.vehicle_name || "(empty)") + '</td>' +
    '<td>' + escapeHtml(r.code || "(empty)") + '</td>' +
    '<td>' + (r.valid
      ? '<span style="color:var(--green-dark);font-weight:700;">Valid</span>'
      : '<span style="color:var(--red);font-weight:700;">Invalid — ' + escapeHtml(r.reason) + '</span>') +
    '</td>' +
    '</tr>'
  ).join("");

  document.getElementById("csvPreviewCard").style.display = "block";
  document.getElementById("csvImportProgress").innerHTML = "";
  document.getElementById("csvConfirmBtn").disabled = (validCount === 0);
}

function cancelCsvImport() {
  csvParsedRows = [];
  document.getElementById("csvPreviewCard").style.display = "none";
  document.getElementById("csvImportProgress").innerHTML = "";
}

async function confirmCsvImport() {
  const validRows = csvParsedRows.filter(r => r.valid);
  if (validRows.length === 0) return;

  const btn = document.getElementById("csvConfirmBtn");
  btn.disabled = true;
  const progress = document.getElementById("csvImportProgress");

  let created = 0, failed = 0;
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    progress.innerHTML = '<span class="spinner" style="border-color:var(--green);border-top-color:transparent;"></span>' +
      "Creating " + (i + 1) + "/" + validRows.length + " — " + escapeHtml(row.code) + "...";
    try {
      const { error: insertErr } = await sb.from("master").insert({ code: row.code, vehicle_name: row.vehicle_name });
      if (insertErr) throw insertErr;

      created++; // QR codes are generated locally when previewed/printed
    } catch (err) {
      console.error("CSV import row failed", row, err);
      failed++;
    }
  }

  progress.innerHTML = '<div class="msg ' + (failed === 0 ? "success" : "error") + '">' +
    created + " vehicle(s) created and QR codes generated successfully." +
    (failed > 0 ? " " + failed + " row(s) failed during creation (see console)." : "") +
    "</div>";

  btn.disabled = false;
  csvParsedRows = [];
  await loadVehicleCache(); // refresh dropdowns everywhere with the newly imported vehicles
}

/* ============ QR GENERATION HELPERS ============ */
function sanitizeFileName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

/* Local, client-side QR generation (no network / Supabase needed).
   Same content (the vehicle code), error-correction level H, black on white SVG. */
function buildQrSvg(codeValue) {
  if (!window.QRLib) throw new Error("QR encoder not loaded");
  const qr = new QRLib.QRCode(-1, QRLib.ECC.H);   // auto size, error-correction level H
  qr.addData(unescape(encodeURIComponent(String(codeValue))));  // UTF-8 bytes
  qr.make();
  const n = qr.getModuleCount(), margin = 1, size = n + margin * 2;
  let d = "";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) d += "M" + (c + margin) + " " + (r + margin) + "h1v1h-1z";
    }
  }
  return '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="1000" viewBox="0 0 ' + size + ' ' + size +
    '" shape-rendering="crispEdges"><rect width="' + size + '" height="' + size + '" fill="#ffffff"/>' +
    '<path fill="#000000" d="' + d + '"/></svg>';
}

function qrDataUrl(codeValue) {
  const svg = buildQrSvg(codeValue);
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

/* Kept under the old name so existing callers work; now fully local. */
async function generateAndUploadQr(code, name) {
  const svg = buildQrSvg(code);
  return { svg, publicUrl: qrDataUrl(code) };
}

/* ============ GENERATE QR CODES (single / ALL) + A4 PRINT LAYOUT ============ */
async function generateSelected() {
  document.getElementById("generateMsg").innerHTML = "";
  document.getElementById("printBtn").disabled = true;

  const checked = Array.from(document.querySelectorAll(".veh-chk:checked")).map(c => c.value);
  const targets = naturalSortByName(vehicleCache.filter(v => checked.includes(v.code)));

  if (targets.length === 0) { showMsg("generateMsg", "error", "Please select at least one vehicle."); return; }

  const btn = document.getElementById("genBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Generating 0/' + targets.length + '...';

  const results = [];
  let done = 0;
  let lastQrErr = "";

  for (const v of targets) {
    try {
      const url = qrDataUrl(v.code); // generated locally in the browser
      results.push({ code: v.code, name: v.vehicle_name, url });
    } catch (err) {
      console.error("Error generating for", v.code, err);
      lastQrErr = err && err.message ? err.message : String(err);
    }
    done++;
    btn.innerHTML = '<span class="spinner"></span>Generating ' + done + '/' + targets.length + '...';
  }

  btn.disabled = false;
  btn.innerHTML = '<svg class="ic"><use href="#i-qr"/></svg>Generate QR Code(s)';

  if (results.length === 0) {
    showMsg("generateMsg", "error", "Failed to generate any QR codes." + (lastQrErr ? " (" + lastQrErr + ")" : ""));
    return;
  }

  showMsg("generateMsg", "success", results.length + " QR code(s) ready. " + Math.ceil(results.length / 2) + " A4 page(s) will print.");
  renderA4Pages(results);
  document.getElementById("printBtn").disabled = false;
}

function renderA4Pages(items) {
  const area = document.getElementById("qrPrintArea");
  area.innerHTML = "";
  for (let i = 0; i < items.length; i += 2) {
    const pair = items.slice(i, i + 2);
    const page = document.createElement("div");
    page.className = "a4-page";
    page.innerHTML = pair.map(it =>
      '<div class="qr-print-card"><div class="qr-wrap">' +
      '<img src="' + it.url + '" alt="' + escapeHtml(it.name) + '">' +
      '<div class="qr-name-overlay">' + escapeHtml(it.name) + '</div>' +
      '</div></div>'
    ).join("") + (pair.length === 1 ? '<div class="qr-print-card empty"></div>' : "");
    area.appendChild(page);
  }
}

/* ============ DIESEL CONSUMPTION REPORT (analytics + Excel + PDF) ============ */
const RP_LOGO = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAH0AAAApCAYAAAAYnybEAAAPGklEQVR4AdRcfXBc1XU/5763u7LAlpzpFGaYwSKVXRMatAQbFMh41xMyyQRcrZw0MTjGKyhQkrSWip3wYaMVdho+mlqmf1A3DVqT4mACaAUOgWDGawMzLknqFSEpAbes2zRtMiGWbMvZj/fuyTkrvc1qv7yfUnJnj9/9OPfc++7v3nPPPffJCjj8yVcPB5c89Cpl6YFXqOP+w9TxwCsTHaGD7cxS8Fs2dDDORA51Dr5MnfdO07JtB2jZ1peo855pWnb392jZXS9S55enaemXXqBlTB/Y8h1vgeAyGStvGfV+6IvP0oovTNPKz4/RytvH6PIvPPv/K26LnFh5W4RW3jpKzMf0DF3xl8/QlTcz3fQ0XcnU3fcUfTg4Td03fpuErtrwJF3NdNX6J+kjN+zLkP+GJ+ia679FH1+3l65b97hDE59e901/me79wRRlQP/Pu1aFNepe1DSZ23Olqc00oB+KBJ22gkWyq8rSWkVKTap8Qd7gaLtuMfbk52uFP0VLewChHZoUFNC4qcD/1BMbok1qYk7FZkCXFv9n86qIy7L8+cCTaQwuDx3sEJ5cOrbjY1ECOJSbV22cEJa4p5LhiuotcocA8FLICdz+aSS6AAw0c7IbGtX8jiqR9kf2ro81VPA8CsuCLn14557VsZbfWF5D07ikHUq0uoadeO7TIAhCvYGo55L+/UW1iSPa2/+cX5He5KSdJxn4XwT4K9B0rpPXyOeU29z1/BPr/ZFI30Qj5c63rFmgS2feCq2O66TNgwxZ4A3L7unc+lLBfpbhVTAk9eohyzR2ltrfRf1rjQVqnQjiaNP7FVGBFoIGhAWk+1597DNlJ2MDmpkXEQWgSy/iodUTAjwPbHawaYGnqBq2bBAtcBzqDLrE/t7+66lhBLiwQDzCApJVXlBQX4ZtKLZr1GXPPbG+6PvWJ/33o3ZR0KVrAvy7d68KaoJp4JGWdG4/GJKyXBI+IGjAiqCC/f3iO54PaISNkBdshUckiw2shq5ynuTjZJje6N7PVL1/bwn8s/eLgW+EhPoDXw/dtWZ3QPrYbNp3+fbA3hXbo0JjfxaK5tPz77/3UC59r+Nub0nQnc4K8IDYJ2lE7C9m1L0dWh1Bpeoy6kS+0jq7v4taNy2annBSOENI8Au2Obpnkg17aJfaM+Vx+4+Ee+PVCA0ERtpv+dSjkVPKPEoIgwg0SACDSYWjm3t2x7fwZKhGXjHeEW+o/ZFVD4RGrrpftOosls/+cFsECSd4THwpA32WQh8vFB8Q+Xj782kTVpGiVYp0hmxQ7WcFHTjIkc4B3kYoqvbyjDqoNbB6zezvCyfOhHkAF+XL0Yb6JQ/qT1nln5dfVmsakYaOhD8djIV7qzbYFiuIAEEPFAsES/g4Gb0z8EhNGskBO7WwNc7jO6gVbHqs+ytZ4/lbl++IPHnZ9vHJVvfLDPwbxbqQm6dRHTZAT1QEulScBp78fDzydm57uUCdv8UGIBAMCG+9pG2MsowiA0lvIBtuTBdwed0/JJjUhsEG22cLtq1KhAfXjgQRwVeWF6ENbCi6UKBM2Onf6T21eGEMUA2SyJjh1aiGpUyS1/9wayDhUTvbzqQeJqCfkVIlgbdNxeXU9r/t7njFoAMHOdIBkl+3uoLF1Pyx7R8dRlvvZ9a6foqorYiAUwR4EWr6OSA24oh23GoxWZ1/qmpAnL4hQBAqC75QYGfFzqOvfWxn0ED7qEG0JF+8VtD2vmQiIlpAym48ck847cI+QPikmbbdvCBOSn4BEb2XchvRCyZSHVWBLoIEeLHsk24jJOl8SrvMDcQrKD+/3jQhxm3E/yOEP61XllZqPKFM7/e/3hurRxb3xVtpfctqqYhXADdtPVJOLgEs8ZhGxOER4N0Jvcs2cDkQ/JzLZwHPk/NFUhj3JO2+ivd0R7jzjPORLmPgORk5TykjoIZargrgRzyDP8iD0ZbTVE1RAtjzb4+u9cZq2L9rarCKSgI4bzllAXfEsW/D968rd2S11IQbQmzMnWRwlxsERx0+ZcFhfufzWUN2KE2LJJ/HUx6NpWMZFy1ub4RUAjxpA7QRwBFQeF49Mk+1tQyIwVaPjNy6DFDFmsI0E2V5ZZ9meRUB/rs+4EYH+L5YaELZMCZlYr0T4TcNi37G27GXJ0LcsKlLyoSaAroIfmfHNfeCptckXg+xCn2dENsR4JJa5fBLTxKq3h8PX1dw5KlVptTjiZhdaZIuQ4dCkYGJUuWy3xuos+q6FF+xfEWwUaz40eWhDs8Z61GHB5E2JD3qdMpjjPEqn2UUNw10adzyuK4Dgpq9dQz2D9iou8bU+icW4gmRWTURjLMc/+vf6K1pUMu1F36mL0wE5f0TYt8YEIQywZVQ/UnTKDDaylTJL+pJtap3E61mILeAJ8QCV8q+NDdP4k0FXfZ3dzoVoLwrW2m4EpI9yCD4kaXUB0yiCwGgkmq5PIeSGv31Gmy5AvPjJzQEuI8FTqQZvnEylf/+yO0lHT6ZVa6x4Ag8U7+qh+XC7KWUrfAkIsRZy2XVuiOsaaB3hA62yyXNmXNa46zmB5wGK32y6jygEc/XAB4kKqkaS8kz0nrP6/+y1h9rssEWifRN/NPoTcGF2roMCYYIcAgBhjyaev/+2du8D0VujZXqo+Sf/156AwLVbaCKrFziiXgUbSrqQ2ga6NIBBAyaaesEKLUKLdgteZWQy6a3eQCvIITXBXiEIhcuZQQx4H2NNNhKNdW3diQqdOvaR6OTyuSLIe1H0H42PP1phP7Nf747eueaRzK0pYQ7dsrturmU/FrzXUk9BuyGLVW/aaCLamdjLsiAD6CCoDZgXalO5OdrVk2yj7s0nYdAmWNGPk/JNMFlR8K1O1xKyi1SwJPShwg+AvDxQLLPW/HKwpk4chx8NuBECozwOTBVoOK/+omdHSnT6CoiuuYsttKPpz2qrNtX1Sy9worH2EunNQ3x4LRxlWNMZX+mTQdshBUpQ71t81GtLHORQmVTWD6tKlI0J1k24iRrpuOIuMdU+qKHnvurwD88d2s4FBko2KJOulorctiU6rgifYgt8yEgGtKAQ5ahhpItRr+Z1BGV5jG3ibcbGOJFNJR2qQwlWszq3LClGs/PX7r1wH0dvKc7+cfu/3gILJIzZCcbZ/J0imY9CeFNviVaiQSPsaPBD1idWhdh2sQuj6Jod3C07GwX3kaTDbinxbLFKMsc5SytwuXU+7npRM2gK1vvueEH2/zX//u2UC7Jrduat+8LlaLet0KNBV2AZsDDiLDNTKZn+eBT53jkcmKSZ10PIb5UbMDdFiUAKKMGmae9GE8ledrALm1SbOUtozUPaiXt5PIookkDaGPaUCMEMEhE8h2ATwP6mM/nseya34frz/ohwPHPfX9r2WPgrAp5iYap9w5e2aZlR/mIIC8LysCrZQI47ckez4MxLGlFdAVq/abEHdJKjaUNXAGgRm0FXbzKFzlltTwJoQ2JolfcPDrr7FqLrErqaETZviphrZuH24rUI6QhoDuAs5u0K7czMttzgbda3BnQGfw222VOksLJaX56k9WVHwhDiLRYEcySM81T079tbAiOdgefPtuqqEn4/FWiurauukFf+pWDXjdCHFilQpEgwC/b8kJErmJltTt7OoN8NRBEIRPwPWC1nljUsosAG74yScHIR258MjPhMs39gf+DBD3iq6/1NeoCfSkDzudvAa68anOpHp1Mvdt554sh3m+zzgpWvz2ISs7vPsWuygWnfhNi8JfU+jLl6qVNY1N38KmMgVWOby7LWmydsV9qaXNxMhGV7+NqqVsz6PKnUBUBntsrgkEgWA/ZQG+ibXWzLTDgTut2AtiULWpGBGHjlTc9E5vPI13ua6k0ZBcAVBkUUVtaqdG9K3YQX7jQvg/dR9/uGqKnLx2i0Q+GaOySQXr24kHav+xe+k7nNnrhoq0Z+m7HVn9NoAvgKm2PcD/Lr3BmKPLrJMSZ87qodQC5/UooNSfqV2k9b0e6/LEYiA7EWFXP2DX5pc1Lq2pFy2fQvB8L4NVWzfKzWu9Ewt2k0AuLWgPL//a7g4DYKOMt206piADPGmZOj3Sl+sJjUJclXkpuufyqQL/o7w7zGRwHywmspIwM9RohrWN1PiD8pID3csgGZOcMEJzMZjQhQghtZsKKfvhz+xpuOFbT3ZaENScaLrdPFYHewWdwAZz94ZkzeK6AauOIMMm3bmcY1Og7D35ihE4nZhlX7Dt+7MfD1240NDR3f+eOC/CIOK9HOlHxit2p3J05+50VdAFceYyoYm9TY3qFo4qdM+Khu6R/fz+vdl9WLtH4VHtrBuzYP14bVoS7smVNjBi2PdKkI11FvTbT0A9zGFS5thzAeQ9uzH6r8DUA6jVsnXGWpN3m79Q6wWRiUas/Hlo9ATMh9vC1/RrxwEyyqQ9tw7wd6WS1pwwcauoL5ggvCbqcwWGBGUeAhgBODKqodQ2w5z++9smIeyoZRk1Z618Z5M8FHGbC6fbWv2Bt8N8zyaY+zJS98err98Xm40h3zwubQjZC+U+vGvT2RUFfyk6XtGlGVQ4o9bYnYIPL+GO7xT148R3PBwAh+7EeX8Lc9JOHri16ZpWJYHkwy1tvP85WHxG63pdMRgOBkYZdkJytTad86hwIEMG4k27WswB0OYOnTPMoEGVXYb2NE+J+bmijO5nMqHXbUFnjzSDaJQZduTZkQmhQfeV4GlmmGfiTCxZEu4Ojdfm4q+2T3LmfWgh+C1VTgVe5HRPALVON5ObVG0fESZFBLjMk4BmJlFzsOxPqEKv6iowYMexsxFIfIEoTDSU2XLv+KHEmFrjh8Tm7npUXEODveHnAy9tq0941C/qFD7423GjA5SWYHsaUbR/b/tHhzq0v+ZHgbzgPkK9Wk+e2BCReKcUevi6ICG9Uyl8vXxqwzdIQnWvgpd9/fXBzkIHvZVfrcUk3kjKgyxmcrzQ3NVKwyOJO7ydNN8rxTNKgIaPWOX/SQNog+zVUGVyn7B4gOl1ltXrYM8DPx38n9vno5sjCE6e8BMTaETMas54XceqqjgdfjWiXqtvp4gh0ngQ4yYAvBgVBAVdu2MDWS6Rcu42AqHqJV0tHwr1xy63WVFuvTv42m/DgmnWPZ2ySOmVVVV3+XOn2w18O3fbKl9pdlt3HmnIMAepa/b8FAAD//6BR1lEAAAAGSURBVAMAe2ZvaOcKZWMAAAAASUVORK5CYII="; // embedded XIC logo (125x41 px) - no external dependency
const RP_LOGO_RATIO = 41 / 125;
const RP_NAVY = "#142B45", RP_TEAL = "#0097A7";
const RP_PALETTE = ["#0097A7","#142B45","#2e86ab","#f6ae2d","#e4572e","#7b5ea7","#4caf50","#8d99ae","#d1495b","#00798c","#edae49","#66a182"];
let rpRows = [], rpAgg = null, rpMeta = null, rpTimeMode = "daily", rpCharts = {}, rpPageNo = 1;
const RP_PAGE_SIZE = 100;

const rpPad = n => String(n).padStart(2, "0");
const rpFmt = n => (Number(n) || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",").replace(/(,\d{3})+(?=\.)/, m => m); // plain ASCII digits
const rpFmtDT = d => rpPad(d.getDate()) + "/" + rpPad(d.getMonth() + 1) + "/" + d.getFullYear() + ", " + rpPad(d.getHours()) + ":" + rpPad(d.getMinutes()) + ":" + rpPad(d.getSeconds());
const rpDash = v => (v === null || v === undefined || String(v).trim() === "") ? "-" : String(v).trim();

function rpAggregate(rows) {
  const veh = new Map(), drv = new Map(), day = new Map(), mon = new Map(), yr = new Map();
  let total = 0;
  rows.forEach(r => {
    const q = Number(r.quantity) || 0; total += q;
    const vn = rpDash(r.vehicle_name);
    const v = veh.get(vn) || { name: vn, total: 0, tx: 0 }; v.total += q; v.tx++; veh.set(vn, v);
    const dn = rpDash(r.driver_name), di = rpDash(r.driver_id_mobile), dk = dn + "|" + di;
    const d = drv.get(dk) || { name: dn, id: di, total: 0, tx: 0 }; d.total += q; d.tx++; drv.set(dk, d);
    const dt = new Date(r.entry_datetime);
    const kd = dt.getFullYear() + "-" + rpPad(dt.getMonth() + 1) + "-" + rpPad(dt.getDate());
    [[day, kd], [mon, kd.slice(0, 7)], [yr, kd.slice(0, 4)]].forEach(([m, k]) => {
      const o = m.get(k) || { key: k, total: 0, tx: 0 }; o.total += q; o.tx++; m.set(k, o);
    });
  });
  const fin = (arr, pct) => arr.map(x => ({ ...x, avg: x.tx ? x.total / x.tx : 0, pct: total ? x.total / total * 100 : 0 }));
  const vehicles = fin([...veh.values()]).sort((a, b) => b.total - a.total);
  const drivers = fin([...drv.values()]).sort((a, b) => b.total - a.total);
  const byKey = m => fin([...m.values()]).sort((a, b) => a.key.localeCompare(b.key));
  return { total, tx: rows.length, vehicles, drivers, daily: byKey(day), monthly: byKey(mon), yearly: byKey(yr),
           avg: rows.length ? total / rows.length : 0 };
}

async function loadReportDrivers() {
  const sel = document.getElementById("reportDriver");
  if (!sel || sel.dataset.loaded) return;
  try {
    const seen = new Map();
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("driver_information").select("name, driver_id, driver_mobile_number").order("name").range(from, from + 999);
      if (error) throw error;
      (data || []).forEach(d => { if (d.name && !seen.has(d.name)) seen.set(d.name, d); });
      if (!data || data.length < 1000) break;
    }
    sel.innerHTML = '<option value="__ALL__">ALL DRIVERS</option>' + [...seen.values()].map(d =>
      '<option value="' + escapeHtml(d.name) + '">' + escapeHtml(d.name) + (d.driver_id || d.driver_mobile_number ? " (" + escapeHtml(d.driver_id || d.driver_mobile_number) + ")" : "") + '</option>').join("");
    sel.dataset.loaded = "1";
  } catch (e) { console.error(e); }
}

function resetReportFilters() {
  const t = new Date(); const today = t.getFullYear() + "-" + rpPad(t.getMonth() + 1) + "-" + rpPad(t.getDate());
  document.getElementById("reportFrom").value = today;
  document.getElementById("reportTo").value = today;
  document.getElementById("reportVehicle").value = "__ALL__";
  document.getElementById("reportDriver").value = "__ALL__";
  document.getElementById("reportMsg").innerHTML = "";
  document.getElementById("rpResults").style.display = "none";
  document.getElementById("rpXlsBtn").disabled = true;
  document.getElementById("rpPdfBtn").disabled = true;
  rpRows = []; rpAgg = null;
  Object.values(rpCharts).forEach(c => c.destroy()); rpCharts = {};
}

async function runReport() {
  const from = document.getElementById("reportFrom").value, to = document.getElementById("reportTo").value;
  const vSel = document.getElementById("reportVehicle"), dSel = document.getElementById("reportDriver");
  const vehicle = vSel.value, driver = dSel.value;
  const msg = document.getElementById("reportMsg"); msg.innerHTML = "";
  document.getElementById("rpXlsBtn").disabled = true; document.getElementById("rpPdfBtn").disabled = true;
  if (!from || !to) return showMsg("reportMsg", "error", "Please select both From and To dates.");
  if (from > to) return showMsg("reportMsg", "error", "From Date cannot be after To Date.");
  const btn = document.getElementById("reportBtn");
  btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>Generating...';
  try {
    const fromIso = new Date(from + "T00:00:00").toISOString();
    const toIso = new Date(to + "T23:59:59.999").toISOString(); // whole end date incl. 11:59:59 PM
    const seen = new Set(), rows = [], PAGE = 1000;
    for (let off = 0; ; off += PAGE) {
      let q = sb.from("diesel_data").select("id, code, entry_datetime, vehicle_name, quantity, driver_name, driver_id_mobile")
        .gte("entry_datetime", fromIso).lte("entry_datetime", toIso);
      if (vehicle !== "__ALL__") q = q.eq("code", vehicle);
      if (driver !== "__ALL__") q = q.eq("driver_name", driver);
      const { data, error } = await q.order("entry_datetime", { ascending: true }).order("id", { ascending: true }).range(off, off + PAGE - 1);
      if (error) throw error;
      (data || []).forEach(r => { if (!seen.has(r.id)) { seen.add(r.id); rows.push(r); } });
      if (!data || data.length < PAGE) break;
    }
    if (!rows.length) {
      document.getElementById("rpResults").style.display = "none";
      showMsg("reportMsg", "info", "No diesel records found for the selected filters.");
      return;
    }
    rpRows = rows; rpAgg = rpAggregate(rows);
    rpMeta = { from, to, vehicleLabel: vSel.options[vSel.selectedIndex].text, driverLabel: dSel.options[dSel.selectedIndex].text, generated: new Date() };
    document.getElementById("rpResults").style.display = "block";
    rpRender();
    document.getElementById("rpXlsBtn").disabled = false; document.getElementById("rpPdfBtn").disabled = false;
    showMsg("reportMsg", "success", rows.length.toLocaleString() + " transactions loaded (" + rpFmt(rpAgg.total) + " L).");
  } catch (err) {
    console.error(err); showMsg("reportMsg", "error", "Failed to generate report: " + (err.message || err));
  } finally {
    btn.disabled = false; btn.textContent = "Generate Report";
  }
}

function rpTable(id, head, rows) {
  document.getElementById(id).innerHTML = "<thead><tr>" + head.map(h => '<th class="' + (h[1] ? "n" : "") + '">' + h[0] + "</th>").join("") +
    "</tr></thead><tbody>" + rows.map(r => "<tr>" + r.map((c, i) => '<td class="' + (head[i][1] ? "n" : "") + '">' + escapeHtml(String(c)) + "</td>").join("") + "</tr>").join("") + "</tbody>";
}

function rpRender() {
  const a = rpAgg;
  document.getElementById("kpiTotal").textContent = rpFmt(a.total);
  document.getElementById("kpiTx").textContent = a.tx.toLocaleString();
  document.getElementById("kpiVeh").textContent = a.vehicles.length.toLocaleString();
  document.getElementById("kpiDrv").textContent = a.drivers.length.toLocaleString();
  document.getElementById("kpiAvg").textContent = rpFmt(a.avg);
  document.getElementById("kpiTop").textContent = a.vehicles[0].name;
  document.getElementById("kpiTopQty").textContent = rpFmt(a.vehicles[0].total) + " L";
  const vh = [["SL"], ["Vehicle Name"], ["Total Consumption (L)", 1], ["Total Transactions", 1], ["Avg. Quantity / Transaction (L)", 1], ["Consumption %", 1]];
  const vrow = (v, i) => [i + 1, v.name, rpFmt(v.total), v.tx, rpFmt(v.avg), rpFmt(v.pct) + "%"];
  rpTable("rpVehTbl", vh, a.vehicles.map(vrow));
  const low = a.vehicles.slice(-10).reverse();
  rpTable("rpLowTbl", vh, low.map(vrow));
  rpTable("rpDrvTbl", [["SL"], ["Driver Name"], ["Driver ID/Mobile"], ["Total Consumption (L)", 1], ["Total Transactions", 1], ["Avg. Quantity / Transaction (L)", 1]],
    a.drivers.map((d, i) => [i + 1, d.name, d.id, rpFmt(d.total), d.tx, rpFmt(d.avg)]));
  rpPageNo = 1; rpRenderTx(); rpRenderCharts();
}

function rpRenderTx() {
  const pages = Math.max(1, Math.ceil(rpRows.length / RP_PAGE_SIZE));
  rpPageNo = Math.min(Math.max(1, rpPageNo), pages);
  const start = (rpPageNo - 1) * RP_PAGE_SIZE;
  rpTable("rpTxTbl", [["SL"], ["Date/Time"], ["Vehicle"], ["Quantity (L)", 1], ["Driver Name"], ["Driver ID/Mobile"]],
    rpRows.slice(start, start + RP_PAGE_SIZE).map((r, i) => [start + i + 1, rpFmtDT(new Date(r.entry_datetime)), rpDash(r.vehicle_name), rpFmt(r.quantity), rpDash(r.driver_name), rpDash(r.driver_id_mobile)]));
  document.getElementById("rpPageInfo").textContent = "Page " + rpPageNo + " of " + pages + "  (" + rpRows.length.toLocaleString() + " records)";
}
function rpPage(d) { rpPageNo += d; rpRenderTx(); }

/* ---- charts ---- */
const rpValueLabels = {
  id: "valueLabels",
  afterDatasetsDraw(chart) {
    const o = chart.options.plugins.valueLabels; if (!o || !o.display) return;
    const ctx = chart.ctx, horiz = chart.options.indexAxis === "y";
    ctx.save(); ctx.font = "bold 10px Arial, Helvetica, 'Segoe UI', sans-serif"; ctx.fillStyle = "#142B45";
    chart.data.datasets.forEach((ds, i) => {
      const meta = chart.getDatasetMeta(i); if (meta.hidden || meta.data.length > 45) return;
      meta.data.forEach((el, idx) => {
        const txt = rpFmt(ds.data[idx]);
        if (horiz) { ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(txt, el.x + 4, el.y); }
        else { ctx.textAlign = "center"; ctx.textBaseline = "bottom"; ctx.fillText(txt, el.x, el.y - 3); }
      });
    });
    ctx.restore();
  }
};
function rpBase(extra) {
  return Object.assign({ responsive: true, maintainAspectRatio: false, layout: { padding: { top: 18, right: 48 } }, plugins: { legend: { display: false } } }, extra || {});
}
function rpBarCfg(labels, data, horiz, label) {
  return { type: "bar", data: { labels, datasets: [{ label, data, backgroundColor: RP_TEAL, borderRadius: 3 }] },
    options: rpBase({ indexAxis: horiz ? "y" : "x", plugins: { legend: { display: false }, valueLabels: { display: true } },
      scales: { x: { ticks: { autoSkip: false, maxRotation: horiz ? 0 : 60, font: { size: 10 } } }, y: { beginAtZero: true, ticks: { font: { size: 10 } } } } }) };
}
function rpDonutCfg(items) {
  const top = items.slice(0, 8), rest = items.slice(8).reduce((s, x) => s + x.total, 0);
  const tot = items.reduce((s, x) => s + x.total, 0) || 1;
  const all = top.map(x => ({ n: x.name, t: x.total })).concat(rest > 0 ? [{ n: "Others", t: rest }] : []);
  return { type: "doughnut", data: { labels: all.map(x => x.n + " - " + (x.t / tot * 100).toFixed(1) + "%"), datasets: [{ data: all.map(x => +x.t.toFixed(2)), backgroundColor: RP_PALETTE }] },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "right", labels: { boxWidth: 12, font: { size: 11 } } } } } };
}
function rpTimeData(mode) { return rpAgg[mode]; }
function rpCfgs(a, mode) {
  const top15 = a.vehicles.slice(0, 15), top10 = a.vehicles.slice(0, 10), td = rpTimeData(mode);
  const lineCfg = (arr, label) => ({ type: "line", data: { labels: arr.map(x => x.key), datasets: [{ label, data: arr.map(x => +x.total.toFixed(2)), borderColor: RP_TEAL, backgroundColor: "rgba(0,151,167,.15)", fill: true, tension: .25, pointRadius: 3 }] },
    options: rpBase({ plugins: { legend: { display: false }, valueLabels: { display: true } }, scales: { x: { ticks: { maxRotation: 60, font: { size: 10 } } }, y: { beginAtZero: true } } }) });
  return {
    time: mode === "daily" ? lineCfg(td, "Daily (L)") : rpBarCfg(td.map(x => x.key), td.map(x => +x.total.toFixed(2)), false, mode),
    veh: rpBarCfg(top15.map(v => v.name), top15.map(v => +v.total.toFixed(2)), false, "Liters"),
    top: rpBarCfg(top10.map(v => v.name), top10.map(v => +v.total.toFixed(2)), true, "Liters"),
    dist: rpDonutCfg(a.vehicles),
    month: lineCfg(a.monthly, "Monthly (L)"),
    drv: rpDonutCfg(a.drivers)
  };
}
function rpRenderCharts() {
  Object.values(rpCharts).forEach(c => c.destroy()); rpCharts = {};
  const cfgs = rpCfgs(rpAgg, rpTimeMode), ids = { time: "rpCTime", veh: "rpCVeh", top: "rpCTop", dist: "rpCDist", month: "rpCMonth", drv: "rpCDrv" };
  Object.keys(ids).forEach(k => { rpCharts[k] = new Chart(document.getElementById(ids[k]), Object.assign(cfgs[k], { plugins: [rpValueLabels] })); });
}
function rpSetTime(mode) {
  rpTimeMode = mode;
  ["daily", "monthly", "yearly"].forEach(m => document.getElementById("rpTm-" + m).classList.toggle("on", m === mode));
  if (!rpAgg) return;
  rpCharts.time.destroy();
  rpCharts.time = new Chart(document.getElementById("rpCTime"), Object.assign(rpCfgs(rpAgg, mode).time, { plugins: [rpValueLabels] }));
}
// render a chart offscreen to a PNG data-URL for embedding in Excel / PDF
function rpChartImage(cfg, w, h) {
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  cfg.options = cfg.options || {};
  cfg.options.responsive = false; cfg.options.animation = false; cfg.options.devicePixelRatio = 1;
  const bg = { id: "bg", beforeDraw(c) { const x = c.ctx; x.save(); x.globalCompositeOperation = "destination-over"; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height); x.restore(); } };
  cfg.plugins = [rpValueLabels, bg];
  const ch = new Chart(cv, cfg); const url = cv.toDataURL("image/png"); ch.destroy(); return url;
}
function rpPeriodText() { return rpMeta.from.split("-").reverse().join("/") + "  to  " + rpMeta.to.split("-").reverse().join("/"); }
function rpGenText() { return rpFmtDT(rpMeta.generated); }
function rpFileStamp() { return rpMeta.from + "_to_" + rpMeta.to; }
function rpSave(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

/* ---- Excel ---- */
async function downloadExcel() {
  if (!rpAgg) return;
  if (typeof ExcelJS === "undefined") return showMsg("reportMsg", "error", "Excel library failed to load. Check your internet connection and refresh.");
  const btn = document.getElementById("rpXlsBtn"); btn.disabled = true; const old = btn.textContent; btn.textContent = "Building Excel...";
  try {
    const a = rpAgg, wb = new ExcelJS.Workbook(); wb.creator = "XIC Diesel Tracker"; wb.created = new Date();
    const NAVY = "FF142B45", TEAL = "FF0097A7", ALT = "FFEAF6F5", WHITE = "FFFFFFFF";
    const thin = { style: "thin", color: { argb: "FFB8C4D0" } }, border = { top: thin, left: thin, bottom: thin, right: thin };
    const logoId = wb.addImage({ base64: RP_LOGO, extension: "png" });
    const fill = c => ({ type: "pattern", pattern: "solid", fgColor: { argb: c } });
    const utc = d => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds()));

    function banner(ws, title, ncols) {
      for (let r = 1; r <= 3; r++) { ws.getRow(r).height = 22; for (let c = 1; c <= ncols; c++) ws.getCell(r, c).fill = fill(c <= 2 ? WHITE : NAVY); }
      ws.addImage(logoId, { tl: { col: 0.15, row: 0.2 }, ext: { width: 150, height: Math.round(150 * RP_LOGO_RATIO) } });
      ws.mergeCells(1, 3, 2, ncols); const t = ws.getCell(1, 3);
      t.value = title; t.font = { bold: true, size: 18, color: { argb: WHITE } }; t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
      ws.mergeCells(3, 3, 3, ncols); const p = ws.getCell(3, 3);
      p.value = "Period: " + rpPeriodText() + "   |   Vehicle: " + rpMeta.vehicleLabel + "   |   Driver: " + rpMeta.driverLabel + "   |   Generated: " + rpGenText();
      p.font = { size: 10, color: { argb: "FFBFE9E5" } }; p.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
    }
    function section(ws, row, text, ncols) {
      ws.mergeCells(row, 1, row, ncols); const c = ws.getCell(row, 1); c.value = text;
      c.font = { bold: true, size: 12, color: { argb: WHITE } }; c.fill = fill(TEAL); c.alignment = { vertical: "middle", indent: 1 }; ws.getRow(row).height = 22;
    }
    function table(ws, headRow, heads, rows, fmts) {
      heads.forEach((h, i) => { const c = ws.getCell(headRow, i + 1); c.value = h; c.font = { bold: true, color: { argb: WHITE } }; c.fill = fill(NAVY); c.border = border; c.alignment = { horizontal: "center", vertical: "middle", wrapText: true }; });
      ws.getRow(headRow).height = 26;
      rows.forEach((r, ri) => r.forEach((v, i) => {
        const c = ws.getCell(headRow + 1 + ri, i + 1); c.value = v; c.border = border;
        if (ri % 2 === 1) c.fill = fill(ALT);
        if (fmts[i]) { c.numFmt = fmts[i]; c.alignment = { horizontal: fmts[i].indexOf("0") === 0 || fmts[i] === "#,##0" ? "right" : "center" }; }
      }));
      return headRow + rows.length;
    }
    function printSetup(ws, lastCol, lastRow, titleRow) {
      ws.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: .4, right: .4, top: .5, bottom: .6, header: .3, footer: .3 },
        printArea: "A1:" + lastCol + lastRow, printTitlesRow: titleRow ? titleRow + ":" + titleRow : undefined };
      ws.headerFooter = { oddFooter: "&LDiesel Consumption Analysis Report&CGenerated " + rpGenText() + "&RPage &P of &N" };
    }
    const vehRows = a.vehicles.map((v, i) => [i + 1, v.name, +v.total.toFixed(2), v.tx, +v.avg.toFixed(2), +(v.pct / 100).toFixed(4)]);
    const drvRows = a.drivers.map((d, i) => [i + 1, d.name, d.id, +d.total.toFixed(2), d.tx, +d.avg.toFixed(2)]);

    /* Sheet 1 - Executive Summary */
    const s1 = wb.addWorksheet("Executive Summary", { properties: { tabColor: { argb: TEAL } }, views: [{ showGridLines: false }] });
    [7, 34, 18, 16, 16, 16, 3].forEach((w, i) => s1.getColumn(i + 1).width = w);
    for (let i = 8; i <= 17; i++) s1.getColumn(i).width = 11;
    banner(s1, "DIESEL CONSUMPTION ANALYSIS REPORT", 17);
    section(s1, 5, "KEY PERFORMANCE INDICATORS", 6);
    const kpis = [["Total Diesel Consumption (LTR)", +a.total.toFixed(2), "#,##0.00"], ["Total Diesel Transactions", a.tx, "#,##0"], ["Total Vehicles Used", a.vehicles.length, "#,##0"],
      ["Total Drivers", a.drivers.length, "#,##0"], ["Average Quantity per Transaction (L)", +a.avg.toFixed(2), "#,##0.00"], ["Highest Consuming Vehicle", a.vehicles[0].name + "  (" + rpFmt(a.vehicles[0].total) + " L)", null]];
    kpis.forEach((k, i) => {
      const r = 6 + i; s1.mergeCells(r, 1, r, 2); s1.mergeCells(r, 3, r, 6);
      const l = s1.getCell(r, 1); l.value = k[0]; l.font = { bold: true, color: { argb: NAVY } }; l.fill = fill(ALT); l.border = border;
      const v = s1.getCell(r, 3); v.value = k[1]; v.font = { bold: true, size: 13, color: { argb: WHITE } }; v.fill = fill(NAVY); v.border = border; v.alignment = { horizontal: "center", vertical: "middle" };
      if (k[2]) v.numFmt = k[2]; s1.getRow(r).height = 22;
    });
    let r = 13; section(s1, r, "VEHICLE-WISE CONSUMPTION (TOP 10)", 6);
    r = table(s1, r + 1, ["SL", "Vehicle Name", "Total Consumption (L)", "Total Transactions", "Avg. Quantity (L)", "Contribution (%)"], vehRows.slice(0, 10), [null, null, "#,##0.00", "#,##0", "#,##0.00", "0.00%"]) + 2;
    section(s1, r, "DRIVER-WISE CONSUMPTION (TOP 10)", 6);
    r = table(s1, r + 1, ["SL", "Driver Name", "Driver ID/Mobile", "Total Consumption (L)", "Total Transactions", "Avg. Quantity (L)"], drvRows.slice(0, 10), [null, null, null, "#,##0.00", "#,##0", "#,##0.00"]) + 2;
    section(s1, r, "MONTHLY CONSUMPTION ANALYSIS", 6);
    r = table(s1, r + 1, ["SL", "Month", "Total Consumption (L)", "Total Transactions", "Avg. Quantity (L)", "Share (%)"],
      a.monthly.map((m, i) => [i + 1, m.key, +m.total.toFixed(2), m.tx, +m.avg.toFixed(2), +(m.pct / 100).toFixed(4)]), [null, null, "#,##0.00", "#,##0", "#,##0.00", "0.00%"]);
    const sumLast = r;
    s1.addConditionalFormatting({ ref: "C15:C24", rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: "FF7FD4CD" }] }] });
    // charts (embedded images) to the right of the tables
    const cfgs = rpCfgs(a, "monthly"), imgs = [
      ["Vehicle-Wise Consumption (Top 15)", rpChartImage(cfgs.veh, 880, 440)], ["Top 10 Vehicles", rpChartImage(cfgs.top, 880, 440)],
      ["Monthly Consumption Trend", rpChartImage(cfgs.month, 880, 440)], ["Vehicle Distribution", rpChartImage(cfgs.dist, 880, 440)],
      ["Driver-Wise Contribution", rpChartImage(cfgs.drv, 880, 440)], ["Consumption by Month (Bar)", rpChartImage(cfgs.time, 880, 440)]];
    s1.mergeCells(5, 8, 5, 17); const gh = s1.getCell(5, 8); gh.value = "GRAPHICAL ANALYSIS"; gh.font = { bold: true, size: 12, color: { argb: WHITE } }; gh.fill = fill(TEAL); gh.alignment = { indent: 1, vertical: "middle" };
    imgs.forEach((im, i) => {
      const id = wb.addImage({ base64: im[1], extension: "png" });
      s1.addImage(id, { tl: { col: 7 + (i % 2) * 5, row: 5.3 + Math.floor(i / 2) * 15 }, ext: { width: 440, height: 220 } });
    });
    for (let i = 1; i <= Math.max(sumLast, 50); i++) if (!s1.getRow(i).height) s1.getRow(i).height = 20;
    printSetup(s1, "Q", Math.max(sumLast, 50), null);

    /* Sheet 2 - Transaction Details */
    const s2 = wb.addWorksheet("Transaction Details", { properties: { tabColor: { argb: NAVY } } });
    [7, 22, 36, 15, 30, 22].forEach((w, i) => s2.getColumn(i + 1).width = w);
    banner(s2, "TRANSACTION DETAILS", 6);
    const txHead = 5;
    ["SL", "Date/Time", "Vehicle", "Quantity (L)", "Driver Name", "Driver ID/Mobile"].forEach((h, i) => { const c = s2.getCell(txHead, i + 1); c.value = h; c.font = { bold: true, color: { argb: WHITE } }; c.fill = fill(NAVY); c.border = border; c.alignment = { horizontal: "center", vertical: "middle" }; });
    s2.getRow(txHead).height = 26;
    rpRows.forEach((x, i) => {
      const row = s2.getRow(txHead + 1 + i);
      row.values = [i + 1, utc(new Date(x.entry_datetime)), rpDash(x.vehicle_name), Number(x.quantity) || 0, rpDash(x.driver_name), rpDash(x.driver_id_mobile)];
      row.getCell(2).numFmt = "dd/mm/yyyy hh:mm:ss"; row.getCell(4).numFmt = "#,##0.00";
      row.getCell(1).alignment = { horizontal: "center" }; row.getCell(2).alignment = { horizontal: "center" }; row.getCell(4).alignment = { horizontal: "right" };
      for (let c = 1; c <= 6; c++) { row.getCell(c).border = border; if (i % 2 === 1) row.getCell(c).fill = fill(ALT); }
    });
    const txLast = txHead + rpRows.length;
    s2.addConditionalFormatting({ ref: "D" + (txHead + 1) + ":D" + txLast, rules: [{ type: "cellIs", operator: "greaterThan", formulae: [+(a.avg * 2).toFixed(2)], style: { font: { bold: true, color: { argb: "FF9C0006" } }, fill: fill("FFFFC7CE") } }] });
    const tr = s2.getRow(txLast + 1); tr.getCell(3).value = "TOTAL"; tr.getCell(4).value = { formula: "SUBTOTAL(109,D" + (txHead + 1) + ":D" + txLast + ")", result: +a.total.toFixed(2) };
    [3, 4].forEach(c => { tr.getCell(c).font = { bold: true, color: { argb: WHITE } }; tr.getCell(c).fill = fill(TEAL); tr.getCell(c).border = border; }); tr.getCell(4).numFmt = "#,##0.00";
    s2.views = [{ state: "frozen", ySplit: txHead }];
    s2.autoFilter = { from: { row: txHead, column: 1 }, to: { row: txLast, column: 6 } };
    printSetup(s2, "F", txLast + 1, txHead);

    /* Sheet 3 - Vehicle Analysis */
    const s3 = wb.addWorksheet("Vehicle Analysis", { properties: { tabColor: { argb: TEAL } } });
    [7, 38, 22, 20, 22, 20].forEach((w, i) => s3.getColumn(i + 1).width = w);
    banner(s3, "VEHICLE ANALYSIS", 6);
    const vl = table(s3, 5, ["SL", "Vehicle Name", "Total Consumption (L)", "Total Transactions", "Avg. Consumption (L)", "Contribution (%)"], vehRows, [null, null, "#,##0.00", "#,##0", "#,##0.00", "0.00%"]);
    s3.addConditionalFormatting({ ref: "C6:C" + vl, rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: "FF7FD4CD" }] }] });
    s3.views = [{ state: "frozen", ySplit: 5 }]; s3.autoFilter = { from: { row: 5, column: 1 }, to: { row: vl, column: 6 } };
    printSetup(s3, "F", vl, 5);

    /* Sheet 4 - Driver Analysis */
    const s4 = wb.addWorksheet("Driver Analysis", { properties: { tabColor: { argb: NAVY } } });
    [7, 34, 24, 22, 20, 22].forEach((w, i) => s4.getColumn(i + 1).width = w);
    banner(s4, "DRIVER ANALYSIS", 6);
    const dl = table(s4, 5, ["SL", "Driver Name", "Driver ID/Mobile", "Total Consumption (L)", "Total Transactions", "Avg. Consumption (L)"], drvRows, [null, null, null, "#,##0.00", "#,##0", "#,##0.00"]);
    s4.addConditionalFormatting({ ref: "D6:D" + dl, rules: [{ type: "colorScale", cfvo: [{ type: "min" }, { type: "max" }], color: [{ argb: "FFFFFFFF" }, { argb: "FF7FD4CD" }] }] });
    s4.views = [{ state: "frozen", ySplit: 5 }]; s4.autoFilter = { from: { row: 5, column: 1 }, to: { row: dl, column: 6 } };
    printSetup(s4, "F", dl, 5);

    const buf = await wb.xlsx.writeBuffer();
    rpSave(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), "Diesel_Consumption_Report_" + rpFileStamp() + ".xlsx");
  } catch (e) { console.error(e); showMsg("reportMsg", "error", "Excel export failed: " + (e.message || e)); }
  btn.disabled = false; btn.textContent = old;
}

/* ---- PDF ---- */
async function downloadPdf() {
  if (!rpAgg) return;
  if (!window.jspdf || !window.jspdf.jsPDF) return showMsg("reportMsg", "error", "PDF library failed to load. Check your internet connection and refresh.");
  const btn = document.getElementById("rpPdfBtn"); btn.disabled = true; const old = btn.textContent; btn.textContent = "Building PDF...";
  try {
    const a = rpAgg, doc = new window.jspdf.jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const W = 297, H = 210, M = 10, TOP = 28, BOT = 16;
    const navy = [20, 43, 69], teal = [0, 151, 167];
    const logoW = 30, logoH = logoW * RP_LOGO_RATIO;
    const title = "DIESEL CONSUMPTION ANALYSIS REPORT";
    const sec = (t, y) => { doc.setFillColor(...teal); doc.rect(M, y, W - 2 * M, 7, "F"); doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text(t, M + 3, y + 5); doc.setTextColor(0); return y + 10; };

    // Page 1 - Executive Summary
    let y = sec("MANAGEMENT OVERVIEW", TOP);
    const kp = [["Total Consumption", rpFmt(a.total) + " L"], ["Transactions", a.tx.toLocaleString()], ["Vehicles Used", String(a.vehicles.length)],
      ["Drivers", String(a.drivers.length)], ["Avg. / Transaction", rpFmt(a.avg) + " L"], ["Highest Consuming Vehicle", a.vehicles[0].name]];
    const bw = (W - 2 * M - 5 * 3) / 6;
    kp.forEach((k, i) => {
      const x = M + i * (bw + 3); doc.setFillColor(i === 5 ? 20 : 234, i === 5 ? 43 : 246, i === 5 ? 69 : 245); doc.roundedRect(x, y, bw, 20, 2, 2, "F");
      doc.setFillColor(...teal); doc.rect(x, y, bw, 1.6, "F");
      doc.setFontSize(7.5); doc.setFont("helvetica", "bold"); doc.setTextColor(...(i === 5 ? [159, 179, 204] : [91, 107, 130])); doc.text(k[0].toUpperCase(), x + 3, y + 7);
      doc.setFontSize(i === 5 ? 9 : 13); doc.setTextColor(...(i === 5 ? [255, 255, 255] : navy)); doc.text(doc.splitTextToSize(k[1], bw - 6)[0], x + 3, y + 15);
      if (i === 5) { doc.setFontSize(7.5); doc.setTextColor(127, 212, 205); doc.text(rpFmt(a.vehicles[0].total) + " L", x + 3, y + 19); }
    });
    doc.setTextColor(0); y += 25;
    y = sec("GRAPHICAL ANALYSIS", y);
    const cfgs = rpCfgs(a, "monthly"), cw = (W - 2 * M - 8) / 3, ch = 78;
    [["Vehicle-Wise Consumption (Top 15)", cfgs.veh], ["Monthly Consumption Trend", cfgs.month], ["Top 10 Consuming Vehicles", cfgs.top]].forEach((c, i) => {
      const x = M + i * (cw + 4); doc.setDrawColor(200, 210, 220); doc.rect(x, y, cw, ch + 7);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...navy); doc.text(c[0], x + 2, y + 5);
      doc.addImage(rpChartImage(c[1], 900, Math.round(900 * ch / cw)), "PNG", x + 1, y + 7, cw - 2, ch - 1);
    });
    doc.setTextColor(0);

    // Page 2 - vehicle & driver analysis
    const tableOpts = { margin: { top: TOP, bottom: BOT, left: M, right: M }, theme: "grid", styles: { fontSize: 8, cellPadding: 1.6, lineColor: [200, 210, 220] },
      headStyles: { fillColor: navy, textColor: 255, halign: "center" }, alternateRowStyles: { fillColor: [234, 246, 245] }, showHead: "everyPage" };
    doc.addPage(); y = sec("VEHICLE-WISE CONSUMPTION SUMMARY", TOP);
    doc.autoTable({ ...tableOpts, startY: y, head: [["SL", "Vehicle Name", "Total Consumption (L)", "Transactions", "Avg. Qty / Transaction (L)", "Contribution (%)"]],
      body: a.vehicles.map((v, i) => [i + 1, v.name, rpFmt(v.total), v.tx, rpFmt(v.avg), rpFmt(v.pct) + "%"]),
      columnStyles: { 0: { halign: "center", cellWidth: 14 }, 2: { halign: "right" }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } } });
    y = doc.lastAutoTable.finalY + 8; if (y > H - 50) { doc.addPage(); y = TOP; }
    y = sec("DRIVER-WISE CONSUMPTION SUMMARY", y);
    doc.autoTable({ ...tableOpts, startY: y, head: [["SL", "Driver Name", "Driver ID/Mobile", "Total Consumption (L)", "Transactions", "Avg. Qty / Transaction (L)"]],
      body: a.drivers.map((d, i) => [i + 1, d.name, d.id, rpFmt(d.total), d.tx, rpFmt(d.avg)]),
      columnStyles: { 0: { halign: "center", cellWidth: 14 }, 3: { halign: "right" }, 4: { halign: "right" }, 5: { halign: "right" } } });

    // Transactions
    doc.addPage(); y = sec("TRANSACTION DETAILS  (" + a.tx.toLocaleString() + " records, total " + rpFmt(a.total) + " L)", TOP);
    doc.autoTable({ ...tableOpts, startY: y, head: [["SL", "Date/Time", "Vehicle", "Quantity (L)", "Driver Name", "Driver ID/Mobile"]],
      body: rpRows.map((r, i) => [i + 1, rpFmtDT(new Date(r.entry_datetime)), rpDash(r.vehicle_name), rpFmt(r.quantity), rpDash(r.driver_name), rpDash(r.driver_id_mobile)]),
      columnStyles: { 0: { halign: "center", cellWidth: 14 }, 1: { cellWidth: 46 }, 2: { cellWidth: 90 }, 3: { halign: "right", cellWidth: 30 }, 4: { cellWidth: 60 }, 5: { cellWidth: 37 } } });

    // header + footer on every page
    const n = doc.getNumberOfPages();
    for (let p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFillColor(...navy); doc.rect(0, 0, W, 22, "F");
      doc.setFillColor(255, 255, 255); doc.roundedRect(M - 3, 4, logoW + 6, 14, 2, 2, "F");
      doc.addImage(RP_LOGO, "PNG", M, 4 + (14 - logoH) / 2, logoW, logoH);
      doc.setTextColor(255); doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.text(title, M + logoW + 10, 11);
      doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(191, 233, 229);
      doc.text("Period: " + rpPeriodText() + "   |   Vehicle: " + rpMeta.vehicleLabel + "   |   Driver: " + rpMeta.driverLabel, M + logoW + 10, 17);
      doc.setFontSize(8); doc.text("Generated: " + rpGenText(), W - M, 11, { align: "right" });
      doc.setDrawColor(...teal); doc.setLineWidth(.6); doc.line(M, H - 12, W - M, H - 12);
      doc.setTextColor(91, 107, 130); doc.setFontSize(8);
      doc.text(title, M, H - 7); doc.text("Generated " + rpGenText(), W / 2, H - 7, { align: "center" }); doc.text("Page " + p + " of " + n, W - M, H - 7, { align: "right" });
    }
    doc.save("Diesel_Consumption_Report_" + rpFileStamp() + ".pdf");
  } catch (e) { console.error(e); showMsg("reportMsg", "error", "PDF export failed: " + (e.message || e)); }
  btn.disabled = false; btn.textContent = old;
}

/* ============ DRIVER INFORMATION MANAGEMENT ============ */
let driverSearchTimer = null;
let currentDriverRows = [];

async function loadDrivers(searchTerm) {
  const tbody = document.querySelector("#driverTable tbody");
  tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);">Loading...</td></tr>';
  document.getElementById("driverListMsg").innerHTML = "";

  try {
    let query = sb.from("driver_information")
      .select("id, name, driver_id, driver_mobile_number")
      .order("name")
      .limit(50); // don't pull the whole table

    if (searchTerm) {
      const t = searchTerm.trim();
      // Single server-side query across all three fields — no client-side
      // full-table filtering, no extra round trips.
      query = query.or(
        "name.ilike.%" + t + "%,driver_id.ilike.%" + t + "%,driver_mobile_number.ilike.%" + t + "%"
      );
    }

    const { data, error } = await query;
    if (error) throw error;
    renderDriverTable(data || []);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--red);">Error loading drivers.</td></tr>';
  }
}

function renderDriverTable(rows) {
  currentDriverRows = rows;
  const tbody = document.querySelector("#driverTable tbody");
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);">No drivers found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(d =>
    '<tr>' +
    '<td>' + escapeHtml(d.name) + '</td>' +
    '<td>' + escapeHtml(d.driver_id) + '</td>' +
    '<td>' + escapeHtml(d.driver_mobile_number) + '</td>' +
    '<td>' +
    '<button class="btn small outline" style="margin-right:6px;" onclick="editDriver(\'' + d.id + '\')">Edit</button>' +
    '<button class="btn small" style="background:var(--red);" onclick="deleteDriver(\'' + d.id + '\')">Delete</button>' +
    '</td>' +
    '</tr>'
  ).join("");
}

function onDriverSearchInput() {
  clearTimeout(driverSearchTimer);
  const term = document.getElementById("driverSearchInput").value;
  driverSearchTimer = setTimeout(() => loadDrivers(term), 350); // debounce
}

function editDriver(id) {
  const d = currentDriverRows.find(r => String(r.id) === String(id));
  if (!d) return;
  document.getElementById("driverFormTitle").textContent = "Edit Driver";
  document.getElementById("driverEditId").value = d.id;
  document.getElementById("driverFormName").value = d.name;
  document.getElementById("driverFormId").value = d.driver_id;
  document.getElementById("driverFormMobile").value = d.driver_mobile_number;
  document.getElementById("driverSaveBtn").textContent = "Save Changes";
  document.getElementById("driverCancelEditBtn").style.display = "inline-block";
  document.getElementById("driverFormMsg").innerHTML = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetDriverForm() {
  document.getElementById("driverFormTitle").textContent = "Add New Driver";
  document.getElementById("driverEditId").value = "";
  document.getElementById("driverFormName").value = "";
  document.getElementById("driverFormId").value = "";
  document.getElementById("driverFormMobile").value = "";
  document.getElementById("driverSaveBtn").textContent = "Save Driver";
  document.getElementById("driverCancelEditBtn").style.display = "none";
  document.getElementById("driverFormMsg").innerHTML = "";
}

async function saveDriver() {
  const msgBox = "driverFormMsg";
  document.getElementById(msgBox).innerHTML = "";

  const editId = document.getElementById("driverEditId").value;
  const name = document.getElementById("driverFormName").value.trim();
  const driverId = document.getElementById("driverFormId").value.trim();
  const mobile = document.getElementById("driverFormMobile").value.trim();

  if (!name) { showMsg(msgBox, "error", "Driver Name is required."); return; }
  if (!driverId) { showMsg(msgBox, "error", "Driver ID is required."); return; }
  if (!mobile) { showMsg(msgBox, "error", "Driver Mobile Number is required."); return; }

  const btn = document.getElementById("driverSaveBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving...';

  try {
    // Duplicate checks (exclude the record being edited, if any)
    let dupQuery = sb.from("driver_information").select("id, driver_id, driver_mobile_number")
      .or("driver_id.eq." + driverId + ",driver_mobile_number.eq." + mobile);
    const { data: dups, error: dupErr } = await dupQuery;
    if (dupErr) throw dupErr;

    const conflict = (dups || []).find(d => String(d.id) !== String(editId));
    if (conflict) {
      const reason = conflict.driver_id === driverId
        ? "A driver with this Driver ID already exists."
        : "A driver with this Mobile Number already exists.";
      showMsg(msgBox, "error", reason);
      btn.disabled = false;
      btn.textContent = editId ? "Save Changes" : "Save Driver";
      return;
    }

    if (editId) {
      const { error: updErr } = await sb.from("driver_information")
        .update({ name, driver_id: driverId, driver_mobile_number: mobile })
        .eq("id", editId);
      if (updErr) throw updErr;
      showMsg(msgBox, "success", "Driver information updated successfully.");
    } else {
      const { error: insErr } = await sb.from("driver_information")
        .insert({ name, driver_id: driverId, driver_mobile_number: mobile });
      if (insErr) throw insErr;
      showMsg(msgBox, "success", "Driver information added successfully.");
    }

    resetDriverForm();
    // resetDriverForm clears the message box, so show it again after
    document.getElementById(msgBox).innerHTML =
      '<div class="msg success">Driver information ' + (editId ? "updated" : "added") + ' successfully.</div>';
    loadDrivers(document.getElementById("driverSearchInput").value);
  } catch (err) {
    console.error(err);
    showMsg(msgBox, "error", "Error: " + (err.message || "could not save driver."));
  }
  btn.disabled = false;
  btn.textContent = editId ? "Save Changes" : "Save Driver";
}

async function deleteDriver(id) {
  const d = currentDriverRows.find(r => String(r.id) === String(id));
  const name = d ? d.name : "this driver";
  const ok = confirm("Are you sure you want to delete this driver?\n\n" + name +
    "\n\nThis only removes them from the current driver list — historical diesel entries already saved with this driver's name will not be changed.");
  if (!ok) return;

  try {
    const { error } = await sb.from("driver_information").delete().eq("id", id);
    if (error) throw error;
    loadDrivers(document.getElementById("driverSearchInput").value);
  } catch (err) {
    console.error(err);
    alert("Error deleting driver: " + (err.message || ""));
  }
}

/* ============ DRIVER CSV BULK IMPORT ============ */
let driverCsvParsedRows = [];

function downloadDriverCsvTemplate() {
  const csv = "driver_name,driver_id,driver_mobile_number\nAbdul Karim,DR-1025,017XXXXXXXX\nRahim Uddin,DR-1026,018XXXXXXXX\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "driver_import_template.csv";
  link.click();
}

async function handleDriverCsvFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  document.getElementById("driverCsvImportMsg").innerHTML = "";
  const text = await file.text();
  const rows = parseCsvText(text); // reused from vehicle CSV import

  if (rows.length === 0) {
    showMsg("driverCsvImportMsg", "error", "The CSV file is empty.");
    return;
  }

  const header = rows[0].map(h => h.toLowerCase());
  if (header.length !== 3 || header[0] !== "driver_name" || header[1] !== "driver_id" || header[2] !== "driver_mobile_number") {
    showMsg("driverCsvImportMsg", "error", "Invalid header. The first row must be exactly: driver_name,driver_id,driver_mobile_number");
    return;
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    showMsg("driverCsvImportMsg", "error", "No data rows found below the header.");
    return;
  }

  // Fresh lookup so "already exists in database" checks are current
  const { data: existingDrivers } = await sb.from("driver_information").select("driver_id, driver_mobile_number");
  const existingIds = new Set((existingDrivers || []).map(d => d.driver_id.toLowerCase()));
  const existingMobiles = new Set((existingDrivers || []).map(d => d.driver_mobile_number.toLowerCase()));

  const seenIdsInFile = new Set();
  const seenMobilesInFile = new Set();

  driverCsvParsedRows = dataRows.map((cells, idx) => {
    const rowNum = idx + 2;
    const name = (cells[0] || "").trim();
    const driverId = (cells[1] || "").trim();
    const mobile = (cells[2] || "").trim();

    let reason = null;
    if (!name) reason = "Driver Name is required.";
    else if (!driverId) reason = "Driver ID is required.";
    else if (!mobile) reason = "Driver Mobile Number is required.";

    if (!reason && seenIdsInFile.has(driverId.toLowerCase())) reason = "Duplicate Driver ID within this CSV file.";
    if (!reason && seenMobilesInFile.has(mobile.toLowerCase())) reason = "Duplicate Mobile Number within this CSV file.";
    if (!reason && existingIds.has(driverId.toLowerCase())) reason = "Driver ID already exists in the database.";
    if (!reason && existingMobiles.has(mobile.toLowerCase())) reason = "Mobile Number already exists in the database.";

    if (driverId) seenIdsInFile.add(driverId.toLowerCase());
    if (mobile) seenMobilesInFile.add(mobile.toLowerCase());

    return { rowNum, name, driverId, mobile, valid: !reason, reason };
  });

  renderDriverCsvPreview();
}

function renderDriverCsvPreview() {
  const validCount = driverCsvParsedRows.filter(r => r.valid).length;
  const invalidCount = driverCsvParsedRows.length - validCount;

  document.getElementById("driverCsvPreviewSummary").innerHTML =
    '<div class="msg ' + (invalidCount > 0 ? "info" : "success") + '">' +
    driverCsvParsedRows.length + ' row(s) read — ' + validCount + ' valid, ' + invalidCount + ' invalid. ' +
    (invalidCount > 0 ? "Invalid rows will be skipped and are not created." : "") +
    '</div>';

  const tbody = document.querySelector("#driverCsvPreviewTable tbody");
  tbody.innerHTML = driverCsvParsedRows.map(r =>
    '<tr>' +
    '<td>' + r.rowNum + '</td>' +
    '<td>' + escapeHtml(r.name || "(empty)") + '</td>' +
    '<td>' + escapeHtml(r.driverId || "(empty)") + '</td>' +
    '<td>' + escapeHtml(r.mobile || "(empty)") + '</td>' +
    '<td>' + (r.valid
      ? '<span style="color:var(--green-dark);font-weight:700;">Valid</span>'
      : '<span style="color:var(--red);font-weight:700;">Invalid — ' + escapeHtml(r.reason) + '</span>') +
    '</td>' +
    '</tr>'
  ).join("");

  document.getElementById("driverCsvPreviewCard").style.display = "block";
  document.getElementById("driverCsvImportProgress").innerHTML = "";
  document.getElementById("driverCsvConfirmBtn").disabled = (validCount === 0);
}

function cancelDriverCsvImport() {
  driverCsvParsedRows = [];
  document.getElementById("driverCsvPreviewCard").style.display = "none";
  document.getElementById("driverCsvImportProgress").innerHTML = "";
}

async function confirmDriverCsvImport() {
  const validRows = driverCsvParsedRows.filter(r => r.valid);
  if (validRows.length === 0) return;

  const btn = document.getElementById("driverCsvConfirmBtn");
  btn.disabled = true;
  const progress = document.getElementById("driverCsvImportProgress");

  let created = 0, failed = 0;
  for (let i = 0; i < validRows.length; i++) {
    const row = validRows[i];
    progress.innerHTML = '<span class="spinner" style="border-color:var(--green);border-top-color:transparent;"></span>' +
      "Creating " + (i + 1) + "/" + validRows.length + " — " + escapeHtml(row.driverId) + "...";
    try {
      const { error } = await sb.from("driver_information")
        .insert({ name: row.name, driver_id: row.driverId, driver_mobile_number: row.mobile });
      if (error) throw error;
      created++;
    } catch (err) {
      console.error("Driver CSV import row failed", row, err);
      failed++;
    }
  }

  progress.innerHTML = '<div class="msg ' + (failed === 0 ? "success" : "error") + '">' +
    created + " driver(s) created successfully." +
    (failed > 0 ? " " + failed + " row(s) failed during creation (see console)." : "") +
    "</div>";

  btn.disabled = false;
  driverCsvParsedRows = [];
  loadDrivers(document.getElementById("driverSearchInput").value);
}
/* ============ CONSUMPTION RATE MANAGEMENT ============ */
let rateSearchTimer = null;
let currentRateRows = [];

function populateRateVehicleSelect() {
  const sel = document.getElementById("rateFormVehicle");
  if (!vehicleCache || vehicleCache.length === 0) {
    sel.innerHTML = '<option value="">No vehicles found — add one under "Create New QR Code" first.</option>';
    return;
  }
  const current = sel.value;
  sel.innerHTML = '<option value="">-- Select a vehicle --</option>' +
    naturalSortByName(vehicleCache).map(v => '<option value="' + v.code + '">' + escapeHtml(v.vehicle_name) + '</option>').join("");
  if (current) sel.value = current;
}

async function loadRates(searchTerm) {
  if (!vehicleCache || vehicleCache.length === 0) await loadVehicleCache();
  populateRateVehicleSelect();

  const tbody = document.querySelector("#rateTable tbody");
  tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);">Loading...</td></tr>';
  document.getElementById("rateListMsg").innerHTML = "";

  try {
    let query = sb.from("consumption_rate")
      .select("code, vehicle_name, consumption_rate_per_day")
      .order("code")
      .limit(50); // don't pull the whole table

    if (searchTerm) {
      const t = searchTerm.trim();
      query = query.or("code.ilike.%" + t + "%,vehicle_name.ilike.%" + t + "%");
    }

    const { data, error } = await query;
    if (error) throw error;
    renderRateTable(data || []);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--red);">Error loading consumption rates.</td></tr>';
  }
}

function renderRateTable(rows) {
  currentRateRows = rows;
  const tbody = document.querySelector("#rateTable tbody");
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);">No consumption rates set yet.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(r =>
    '<tr>' +
    '<td>' + escapeHtml(r.code) + '</td>' +
    '<td>' + escapeHtml(r.vehicle_name) + '</td>' +
    '<td>' + r.consumption_rate_per_day + ' L/day</td>' +
    '<td>' +
    '<button class="btn small outline" style="margin-right:6px;" onclick="editRate(\'' + r.code + '\')">Edit</button>' +
    '<button class="btn small" style="background:var(--red);" onclick="deleteRate(\'' + r.code + '\')">Delete</button>' +
    '</td>' +
    '</tr>'
  ).join("");
}

function onRateSearchInput() {
  clearTimeout(rateSearchTimer);
  const term = document.getElementById("rateSearchInput").value;
  rateSearchTimer = setTimeout(() => loadRates(term), 350); // debounce
}

function editRate(code) {
  const r = currentRateRows.find(row => row.code === code);
  if (!r) return;
  document.getElementById("rateFormTitle").textContent = "Edit Consumption Rate";
  document.getElementById("rateFormVehicle").value = r.code;
  document.getElementById("rateFormValue").value = r.consumption_rate_per_day;
  document.getElementById("rateSaveBtn").textContent = "Save Changes";
  document.getElementById("rateCancelEditBtn").style.display = "inline-block";
  document.getElementById("rateFormMsg").innerHTML = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetRateForm() {
  document.getElementById("rateFormTitle").textContent = "Set Consumption Rate";
  document.getElementById("rateFormVehicle").value = "";
  document.getElementById("rateFormValue").value = "";
  document.getElementById("rateSaveBtn").textContent = "Save Rate";
  document.getElementById("rateCancelEditBtn").style.display = "none";
  document.getElementById("rateFormMsg").innerHTML = "";
}

async function saveRate() {
  const msgBox = "rateFormMsg";
  document.getElementById(msgBox).innerHTML = "";

  const code = document.getElementById("rateFormVehicle").value;
  const rate = parseFloat(document.getElementById("rateFormValue").value);

  if (!code) { showMsg(msgBox, "error", "Please select a vehicle."); return; }
  if (isNaN(rate) || rate < 0) { showMsg(msgBox, "error", "Please enter a valid consumption rate."); return; }

  const vehicle = vehicleCache.find(v => v.code === code);
  const btn = document.getElementById("rateSaveBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving...';

  try {
    // upsert on code (the table's primary key) — works for both a
    // brand-new rate and editing an existing one in a single call.
    const { error } = await sb.from("consumption_rate")
      .upsert({ code, vehicle_name: vehicle ? vehicle.vehicle_name : code, consumption_rate_per_day: rate }, { onConflict: "code" });
    if (error) throw error;

    resetRateForm();
    document.getElementById(msgBox).innerHTML = '<div class="msg success">Consumption rate saved successfully.</div>';
    loadRates(document.getElementById("rateSearchInput").value);
  } catch (err) {
    console.error(err);
    showMsg(msgBox, "error", "Error: " + (err.message || "could not save rate."));
  }
  btn.disabled = false;
  btn.textContent = document.getElementById("rateCancelEditBtn").style.display === "inline-block" ? "Save Changes" : "Save Rate";
}

async function deleteRate(code) {
  const r = currentRateRows.find(row => row.code === code);
  const label = r ? (r.code + " — " + r.vehicle_name) : code;
  const ok = confirm("Are you sure you want to delete the consumption rate for this vehicle?\n\n" + label);
  if (!ok) return;

  try {
    const { error } = await sb.from("consumption_rate").delete().eq("code", code);
    if (error) throw error;
    loadRates(document.getElementById("rateSearchInput").value);
  } catch (err) {
    console.error(err);
    alert("Error deleting rate: " + (err.message || ""));
  }
}

/* ============ CONSUMPTION RATE CSV BULK IMPORT ============ */
let rateCsvParsedRows = [];

function downloadRateCsvTemplate() {
  const csv = "code,consumption_rate_per_day\nDF01,12.5\nDF02,10\n";
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "consumption_rate_template.csv";
  link.click();
}

async function handleRateCsvFile(event) {
  const file = event.target.files[0];
  event.target.value = "";
  if (!file) return;

  document.getElementById("rateCsvImportMsg").innerHTML = "";
  const text = await file.text();
  const rows = parseCsvText(text); // reused from vehicle CSV import

  if (rows.length === 0) {
    showMsg("rateCsvImportMsg", "error", "The CSV file is empty.");
    return;
  }

  const header = rows[0].map(h => h.toLowerCase());
  if (header.length !== 2 || header[0] !== "code" || header[1] !== "consumption_rate_per_day") {
    showMsg("rateCsvImportMsg", "error", "Invalid header. The first row must be exactly: code,consumption_rate_per_day");
    return;
  }

  const dataRows = rows.slice(1);
  if (dataRows.length === 0) {
    showMsg("rateCsvImportMsg", "error", "No data rows found below the header.");
    return;
  }

  await loadVehicleCache(); // fresh vehicle list to validate codes against
  const vehicleByCode = new Map(vehicleCache.map(v => [v.code.toUpperCase(), v.vehicle_name]));
  const seenCodesInFile = new Set();

  rateCsvParsedRows = dataRows.map((cells, idx) => {
    const rowNum = idx + 2;
    const code = (cells[0] || "").trim().toUpperCase();
    const rateStr = (cells[1] || "").trim();
    const rate = parseFloat(rateStr);

    let reason = null;
    if (!code) reason = "Vehicle code is required.";
    else if (!vehicleByCode.has(code)) reason = "Unknown vehicle code — create the vehicle first.";
    else if (!rateStr) reason = "Consumption rate is required.";
    else if (isNaN(rate) || rate < 0) reason = "Consumption rate must be a valid non-negative number.";

    if (!reason && seenCodesInFile.has(code)) reason = "Duplicate code within this CSV file.";
    if (code) seenCodesInFile.add(code);

    return {
      rowNum, code, rate: isNaN(rate) ? null : rate,
      vehicleName: vehicleByCode.get(code) || "",
      valid: !reason, reason
    };
  });

  renderRateCsvPreview();
}

function renderRateCsvPreview() {
  const validCount = rateCsvParsedRows.filter(r => r.valid).length;
  const invalidCount = rateCsvParsedRows.length - validCount;

  document.getElementById("rateCsvPreviewSummary").innerHTML =
    '<div class="msg ' + (invalidCount > 0 ? "info" : "success") + '">' +
    rateCsvParsedRows.length + ' row(s) read — ' + validCount + ' valid, ' + invalidCount + ' invalid. ' +
    (invalidCount > 0 ? "Invalid rows will be skipped and are not saved." : "") +
    '</div>';

  const tbody = document.querySelector("#rateCsvPreviewTable tbody");
  tbody.innerHTML = rateCsvParsedRows.map(r =>
    '<tr>' +
    '<td>' + r.rowNum + '</td>' +
    '<td>' + escapeHtml(r.code || "(empty)") + '</td>' +
    '<td>' + escapeHtml(r.vehicleName || "-") + '</td>' +
    '<td>' + (r.rate !== null ? r.rate : "-") + '</td>' +
    '<td>' + (r.valid
      ? '<span style="color:var(--green-dark);font-weight:700;">Valid</span>'
      : '<span style="color:var(--red);font-weight:700;">Invalid — ' + escapeHtml(r.reason) + '</span>') +
    '</td>' +
    '</tr>'
  ).join("");

  document.getElementById("rateCsvPreviewCard").style.display = "block";
  document.getElementById("rateCsvImportProgress").innerHTML = "";
  document.getElementById("rateCsvConfirmBtn").disabled = (validCount === 0);
}

function cancelRateCsvImport() {
  rateCsvParsedRows = [];
  document.getElementById("rateCsvPreviewCard").style.display = "none";
  document.getElementById("rateCsvImportProgress").innerHTML = "";
}

async function confirmRateCsvImport() {
  const validRows = rateCsvParsedRows.filter(r => r.valid);
  if (validRows.length === 0) return;

  const btn = document.getElementById("rateCsvConfirmBtn");
  btn.disabled = true;
  const progress = document.getElementById("rateCsvImportProgress");

  try {
    // Single batch upsert — much faster than one request per row, and
    // avoids unnecessary repeated database round trips.
    const payload = validRows.map(r => ({
      code: r.code, vehicle_name: r.vehicleName, consumption_rate_per_day: r.rate
    }));
    const { error } = await sb.from("consumption_rate").upsert(payload, { onConflict: "code" });
    if (error) throw error;

    progress.innerHTML = '<div class="msg success">' + validRows.length + ' consumption rate(s) saved successfully.</div>';
  } catch (err) {
    console.error("Rate CSV import failed", err);
    progress.innerHTML = '<div class="msg error">Error saving rates: ' + (err.message || "") + '</div>';
  }

  btn.disabled = false;
  rateCsvParsedRows = [];
  loadRates(document.getElementById("rateSearchInput").value);
}

/* ============ USER ACCESS (dashboard_users + dashboard_permissions, keyed by email) ============ */
const UA_SUPER = "admin@gmail.com";
const UA_KEYS = [
  ["dieseltracker_dashboard","Dashboard"],["dieseltracker_heatmap","Heat Map"],["dieseltracker_create_qr","Create & QR Codes"],
  ["dieseltracker_report","Download Report"],["dieseltracker_drivers","Driver Information"],
  ["dieseltracker_consumption_rate","Consumption Rate"],["dieseltracker_dispenser","Dispenser Reading"],
  ["dieseltracker_operators","Operator Information"]
];
let uaUsers = [], uaPerms = {}, uaEditing = null;

function uaActor() { const s = getAdminSession(); return (s && s.username) ? s.username : UA_SUPER; }
function uaMsg(id, type, t) { showMsg(id, type, t); }

async function loadUserAccess() {
  const [u, p] = await Promise.all([
    sb.from("dieseltracker_dashboard_users").select("*").order("email"),
    sb.from("dieseltracker_dashboard_permissions").select("*")
  ]);
  if (u.error || p.error) { uaMsg("uaMsg","error",(u.error||p.error).message); return; }
  uaUsers = u.data || [];
  uaPerms = {};
  (p.data || []).forEach(r => { (uaPerms[r.email] = uaPerms[r.email] || {})[r.dashboard_key] = r.is_enabled; });
  uaRender();
}

function uaRender() {
  const q = document.getElementById("uaSearch").value.trim().toLowerCase();
  const rows = uaUsers.filter(u => u.email.toLowerCase().includes(q));
  const body = document.getElementById("uaBody");
  if (!rows.length) { body.innerHTML = '<tr><td colspan="5">No users found.</td></tr>'; return; }
  body.innerHTML = rows.map(u => {
    const sup = u.email.toLowerCase() === UA_SUPER;
    const perms = uaPerms[u.email] || {};
    const badges = sup ? '<span class="ua-badge">Super Administrator — Full Access</span>' :
      (UA_KEYS.filter(k => perms[k[0]]).map(k => '<span class="ua-badge">' + k[1] + '</span>').join("") || '<span class="ua-badge off">None</span>');
    const e = escapeHtml(u.email).replace(/'/g, "&#39;");
    const acts = sup ? '<em style="color:var(--muted)">Protected</em>' :
      '<button class="btn small outline" onclick="uaOpenEdit(\'' + e + '\')">Edit</button> ' +
      '<button class="btn small outline" onclick="pwOpen(\'' + e + '\')">Reset Password</button> ' +
      '<button class="btn small outline" onclick="uaToggle(\'' + e + '\',' + (!u.is_active) + ')">' + (u.is_active ? "Disable" : "Enable") + '</button> ' +
      '<button class="btn small outline" style="color:var(--red);border-color:var(--red)" onclick="uaDelete(\'' + e + '\')">Delete</button>';
    return '<tr><td>' + escapeHtml(u.email) + '</td><td>' + badges + '</td><td><span class="ua-badge' + (u.is_active ? '' : ' off') + '">' +
      (u.is_active ? "Enabled" : "Disabled") + '</span></td><td>' + (u.updated_at ? new Date(u.updated_at).toLocaleString() : "") + '</td><td>' + acts + '</td></tr>';
  }).join("");
}

function uaBuildChecks(sel) {
  document.getElementById("uaChecks").innerHTML = UA_KEYS.map(k =>
    '<label><input type="checkbox" class="ua-chk-i" value="' + k[0] + '"' + (sel[k[0]] ? " checked" : "") + '> ' + k[1] + '</label>').join("");
}
function uaOpenAdd() {
  uaEditing = null;
  document.getElementById("uaTitle").textContent = "Add New User";
  document.getElementById("uaEmail").value = ""; document.getElementById("uaEmail").disabled = false;
  document.getElementById("uaPw").value = ""; document.getElementById("uaPw2").value = "";
  document.getElementById("uaPwWrap").style.display = "block";
  document.getElementById("uaModalMsg").innerHTML = "";
  uaBuildChecks({});
  document.getElementById("uaModal").classList.remove("hidden");
}
function uaOpenEdit(email) {
  uaEditing = email;
  document.getElementById("uaTitle").textContent = "Edit User Access";
  document.getElementById("uaEmail").value = email; document.getElementById("uaEmail").disabled = true;
  document.getElementById("uaPwWrap").style.display = "none";
  document.getElementById("uaModalMsg").innerHTML = "";
  uaBuildChecks(uaPerms[email] || {});
  document.getElementById("uaModal").classList.remove("hidden");
}
function uaClose() { document.getElementById("uaModal").classList.add("hidden"); }

async function uaSave() {
  const email = document.getElementById("uaEmail").value.trim().toLowerCase();
  const btn = document.getElementById("uaSaveBtn");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return uaMsg("uaModalMsg","error","Enter a valid email address.");
  if (email === UA_SUPER) return uaMsg("uaModalMsg","error","The Super Administrator cannot be modified.");
  const checked = {};
  document.querySelectorAll(".ua-chk-i").forEach(c => { checked[c.value] = c.checked; });
  btn.disabled = true;
  try {
    const now = new Date().toISOString(), by = uaActor();
    if (!uaEditing) {
      const pw = document.getElementById("uaPw").value, pw2 = document.getElementById("uaPw2").value;
      if (pw.length < 6) throw new Error("Password must be at least 6 characters.");
      if (pw !== pw2) throw new Error("Passwords do not match.");
      if (uaUsers.some(u => u.email.toLowerCase() === email)) throw new Error("This user already exists.");
      // Admin-only SQL function creates a pre-confirmed Auth user (no confirmation email is sent)
      const { error: se } = await sb.rpc("dieseltracker_create_auth_user", { p_email: email, p_password: pw });
      if (se) throw se;
      const { error: ue } = await sb.from("dieseltracker_dashboard_users").insert({ email, is_active: true, updated_at: now, updated_by: by });
      if (ue) throw ue;
    }
    const rows = UA_KEYS.map(k => ({ email, dashboard_key: k[0], is_enabled: !!checked[k[0]], updated_at: now, updated_by: by }));
    const { error: pe } = await sb.from("dieseltracker_dashboard_permissions").upsert(rows, { onConflict: "email,dashboard_key" });
    if (pe) throw pe;
    if (uaEditing) await sb.from("dieseltracker_dashboard_users").update({ updated_at: now, updated_by: by }).eq("email", email);
    uaClose();
    uaMsg("uaMsg","success", uaEditing ? "Permissions updated." : "User created.");
    loadUserAccess();
  } catch (err) {
    console.error(err);
    uaMsg("uaModalMsg","error", err.message || "Failed.");
  }
  btn.disabled = false;
}

async function uaToggle(email, active) {
  if (email.toLowerCase() === UA_SUPER) return;
  const { error } = await sb.from("dieseltracker_dashboard_users").update({ is_active: active, updated_at: new Date().toISOString(), updated_by: uaActor() }).eq("email", email);
  if (error) return uaMsg("uaMsg","error",error.message);
  uaMsg("uaMsg","success", email + (active ? " enabled." : " disabled."));
  loadUserAccess();
}

async function uaDelete(email) {
  if (email.toLowerCase() === UA_SUPER) return;
  if (!confirm("Delete " + email + " and all its permissions?")) return;
  const a = await sb.from("dieseltracker_dashboard_permissions").delete().eq("email", email);
  if (a.error) return uaMsg("uaMsg","error",a.error.message);
  const b = await sb.from("dieseltracker_dashboard_users").delete().eq("email", email);
  if (b.error) return uaMsg("uaMsg","error",b.error.message);
  const c = await sb.rpc("dieseltracker_delete_auth_user", { p_email: email });
  if (c.error) return uaMsg("uaMsg","error","Rows deleted, but Auth account was not removed: " + c.error.message);
  uaMsg("uaMsg","success", email + " deleted (including its login).");
  loadUserAccess();
}


/* ============ CHANGE PASSWORD ============ */
let pwTarget = null; // null = own password; otherwise admin resetting another user
function pwOpen(email) {
  pwTarget = email || null;
  document.getElementById("pwTitle").textContent = pwTarget ? "Reset Password: " + pwTarget : "Change Password";
  document.getElementById("pwCurWrap").style.display = "block";
  document.getElementById("pwCurLbl").textContent = pwTarget ? "Your Admin Password (to confirm)" : "Current Password";
  ["pwCur","pwNew","pwNew2"].forEach(i => document.getElementById(i).value = "");
  document.getElementById("pwMsg").innerHTML = "";
  document.getElementById("pwModal").classList.remove("hidden");
}
function pwClose() { document.getElementById("pwModal").classList.add("hidden"); }
async function pwSave() {
  const np = document.getElementById("pwNew").value, np2 = document.getElementById("pwNew2").value;
  if (np.length < 6) return showMsg("pwMsg","error","Password must be at least 6 characters.");
  if (np !== np2) return showMsg("pwMsg","error","Passwords do not match.");
  const btn = document.getElementById("pwSaveBtn"); btn.disabled = true;
  try {
    if (pwTarget) {
      if (!adminAuth || !adminAuth.isSuper) throw new Error("Only the Super Administrator can reset other users' passwords.");
      const ap = document.getElementById("pwCur").value;
      if (!ap) throw new Error("Enter your admin password to confirm.");
      const { error: ae } = await sb.auth.signInWithPassword({ email: adminAuth.email, password: ap });
      if (ae) throw new Error("Your admin password is incorrect.");
      const { error } = await sb.rpc("dieseltracker_set_auth_password", { p_email: pwTarget, p_password: np });
      if (error) throw error;
    } else {
      const cur = document.getElementById("pwCur").value;
      if (!cur) throw new Error("Enter your current password.");
      const { error: ce } = await sb.auth.signInWithPassword({ email: adminAuth.email, password: cur });
      if (ce) throw new Error("Current password is incorrect.");
      const { error } = await sb.auth.updateUser({ password: np });
      if (error) throw error;
    }
    pwClose();
    alert("Password updated successfully.");
  } catch (err) {
    showMsg("pwMsg","error", err.message || "Failed to update password.");
  }
  btn.disabled = false;
}

/* ============ OPERATOR INFORMATION (operator_login table) ============ */
let operatorSearchTimer = null;
let currentOperatorRows = [];
let revealedOperatorIds = new Set();

async function loadOperators(searchTerm) {
  const tbody = document.querySelector("#operatorTable tbody");
  tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);">Loading...</td></tr>';
  document.getElementById("operatorListMsg").innerHTML = "";

  try {
    let query = sb.from("operator_login")
      .select("id, name, mobile, pass, XIC_ID, created_at")
      .order("created_at", { ascending: false })
      .limit(50); // don't pull the whole table

    if (searchTerm) {
      const t = searchTerm.trim();
      let orParts = ["name.ilike.%" + t + "%", "mobile.ilike.%" + t + "%"];
      if (/^\d+$/.test(t)) orParts.push("XIC_ID.eq." + t);
      query = query.or(orParts.join(","));
    }

    const { data, error } = await query;
    if (error) throw error;
    renderOperatorTable(data || []);
  } catch (err) {
    console.error(err);
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--red);">Error loading operators.</td></tr>';
  }
}

function maskPassword(pass) {
  if (!pass) return "-";
  return "•".repeat(Math.min(pass.length, 10));
}

function renderOperatorTable(rows) {
  currentOperatorRows = rows;
  const tbody = document.querySelector("#operatorTable tbody");
  if (rows.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="color:var(--muted);">No operators found.</td></tr>';
    return;
  }
  tbody.innerHTML = rows.map(o => {
    const revealed = revealedOperatorIds.has(o.id);
    return '<tr>' +
      '<td>' + escapeHtml(o.name) + '</td>' +
      '<td>' + escapeHtml(o.mobile) + '</td>' +
      '<td>' + escapeHtml(o.XIC_ID) + '</td>' +
      '<td>' +
      '<span style="font-family:monospace;">' + escapeHtml(revealed ? o.pass : maskPassword(o.pass)) + '</span> ' +
      '<button class="btn small outline" style="width:auto;padding:3px 8px;font-size:11px;" onclick="toggleRevealPassword(\'' + o.id + '\')">' + (revealed ? "Hide" : "Show") + '</button>' +
      '</td>' +
      '<td>' + new Date(o.created_at).toLocaleDateString() + '</td>' +
      '<td>' +
      '<button class="btn small outline" style="margin-right:6px;" onclick="editOperator(\'' + o.id + '\')">Edit</button>' +
      '<button class="btn small" style="background:var(--red);" onclick="deleteOperator(\'' + o.id + '\')">Delete</button>' +
      '</td>' +
      '</tr>';
  }).join("");
}

function toggleRevealPassword(id) {
  if (revealedOperatorIds.has(id)) revealedOperatorIds.delete(id);
  else revealedOperatorIds.add(id);
  renderOperatorTable(currentOperatorRows);
}

function onOperatorSearchInput() {
  clearTimeout(operatorSearchTimer);
  const term = document.getElementById("operatorSearchInput").value;
  operatorSearchTimer = setTimeout(() => loadOperators(term), 350); // debounce
}

function editOperator(id) {
  const o = currentOperatorRows.find(r => String(r.id) === String(id));
  if (!o) return;
  document.getElementById("operatorFormTitle").textContent = "Edit Operator";
  document.getElementById("operatorEditId").value = o.id;
  document.getElementById("operatorFormName").value = o.name;
  document.getElementById("operatorFormMobile").value = o.mobile;
  document.getElementById("operatorFormPass").value = o.pass;
  document.getElementById("operatorFormXicId").value = o.XIC_ID;
  document.getElementById("operatorSaveBtn").textContent = "Save Changes";
  document.getElementById("operatorCancelEditBtn").style.display = "inline-block";
  document.getElementById("operatorFormMsg").innerHTML = "";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function resetOperatorForm() {
  document.getElementById("operatorFormTitle").textContent = "Add New Operator";
  document.getElementById("operatorEditId").value = "";
  document.getElementById("operatorFormName").value = "";
  document.getElementById("operatorFormMobile").value = "";
  document.getElementById("operatorFormPass").value = "";
  document.getElementById("operatorFormXicId").value = "";
  document.getElementById("operatorSaveBtn").textContent = "Save Operator";
  document.getElementById("operatorCancelEditBtn").style.display = "none";
  document.getElementById("operatorFormMsg").innerHTML = "";
}

async function saveOperator() {
  const msgBox = "operatorFormMsg";
  document.getElementById(msgBox).innerHTML = "";

  const editId = document.getElementById("operatorEditId").value;
  const name = document.getElementById("operatorFormName").value.trim();
  const mobile = document.getElementById("operatorFormMobile").value.trim();
  const pass = document.getElementById("operatorFormPass").value.trim();
  const xicIdRaw = document.getElementById("operatorFormXicId").value.trim();

  if (!name) { showMsg(msgBox, "error", "Name is required."); return; }
  if (!mobile) { showMsg(msgBox, "error", "Mobile Number is required."); return; }
  if (!pass) { showMsg(msgBox, "error", "Password is required."); return; }
  if (!xicIdRaw) { showMsg(msgBox, "error", "XIC_ID is required."); return; }
  if (!/^-?\d+$/.test(xicIdRaw)) { showMsg(msgBox, "error", "XIC_ID must be a valid whole number."); return; }
  const xicId = parseInt(xicIdRaw, 10);

  const btn = document.getElementById("operatorSaveBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving...';

  try {
    // Duplicate checks (exclude the record being edited, if any)
    const { data: dups, error: dupErr } = await sb.from("operator_login")
      .select("id, mobile, XIC_ID")
      .or("mobile.eq." + mobile + ",XIC_ID.eq." + xicId);
    if (dupErr) throw dupErr;

    const conflict = (dups || []).find(d => String(d.id) !== String(editId));
    if (conflict) {
      const reason = conflict.XIC_ID === xicId
        ? "An operator with this XIC_ID already exists."
        : "An operator with this Mobile Number already exists.";
      showMsg(msgBox, "error", reason);
      btn.disabled = false;
      btn.textContent = editId ? "Save Changes" : "Save Operator";
      return;
    }

    if (editId) {
      // id and created_at are never touched on edit
      const { error: updErr } = await sb.from("operator_login")
        .update({ name, mobile, pass, XIC_ID: xicId })
        .eq("id", editId);
      if (updErr) throw updErr;
      showMsg(msgBox, "success", "Operator updated successfully.");
    } else {
      // id (uuid) and created_at are left out — the database generates them
      const { error: insErr } = await sb.from("operator_login")
        .insert({ name, mobile, pass, XIC_ID: xicId });
      if (insErr) throw insErr;
      showMsg(msgBox, "success", "Operator added successfully.");
    }

    resetOperatorForm();
    document.getElementById(msgBox).innerHTML =
      '<div class="msg success">Operator ' + (editId ? "updated" : "added") + ' successfully.</div>';
    loadOperators(document.getElementById("operatorSearchInput").value);
  } catch (err) {
    console.error(err);
    showMsg(msgBox, "error", "Error: " + (err.message || "could not save operator."));
  }
  btn.disabled = false;
  btn.textContent = document.getElementById("operatorCancelEditBtn").style.display === "inline-block" ? "Save Changes" : "Save Operator";
}

async function deleteOperator(id) {
  const o = currentOperatorRows.find(r => String(r.id) === String(id));
  const label = o ? (o.name + " (" + o.mobile + ")") : id;
  const ok = confirm("Are you sure you want to delete this operator?\n\n" + label);
  if (!ok) return;

  try {
    const { error } = await sb.from("operator_login").delete().eq("id", id);
    if (error) throw error;
    loadOperators(document.getElementById("operatorSearchInput").value);
  } catch (err) {
    console.error(err);
    alert("Error deleting operator: " + (err.message || ""));
  }
}
/* ============ DISPENSER METER READING ============ */
let dispenserPage = 1;
const DISPENSER_PAGE_SIZE = 10;
let dispenserSortCol = "date";
let dispenserSortAsc = false;
let editingDispenserRow = null; // set when "Edit" is clicked on a row

function toggleDispenserForm(show) {
  const el = document.getElementById("dispenserForm");
  const shouldShow = show !== undefined ? show : el.classList.contains("hidden");
  el.classList.toggle("hidden", !shouldShow);
  if (shouldShow && !editingDispenserRow) {
    document.getElementById("dispenserFormDate").value = new Date().toISOString().slice(0, 10);
    document.getElementById("dispenserFormReading").value = "";
  }
  document.getElementById("dispenserFormMsg").innerHTML = "";
  if (!shouldShow) editingDispenserRow = null;
}

function editDispenserReading(id, date, reading) {
  editingDispenserRow = id;
  document.getElementById("dispenserFormDate").value = date;
  document.getElementById("dispenserFormReading").value = reading;
  toggleDispenserForm(true);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function saveDispenserReading() {
  const msgBox = "dispenserFormMsg";
  document.getElementById(msgBox).innerHTML = "";

  const date = document.getElementById("dispenserFormDate").value;
  const readingRaw = document.getElementById("dispenserFormReading").value.trim();

  if (!date) { showMsg(msgBox, "error", "Date is required."); return; }
  if (!readingRaw) { showMsg(msgBox, "error", "Meter reading is required."); return; }
  const reading = parseFloat(readingRaw);
  if (isNaN(reading) || reading < 0) { showMsg(msgBox, "error", "Please enter a valid meter reading."); return; }

  const btn = document.getElementById("dispenserSaveBtn");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>Saving...';

  try {
    // Check whether a record already exists for this date — if so we
    // UPDATE that one record (the correction), leaving every other
    // date's historical row completely untouched.
    const { data: existing, error: checkErr } = await sb.from("dispenser_meter_reading")
      .select("id").eq("date", date).maybeSingle();
    if (checkErr) throw checkErr;

    if (existing) {
      const { error: updErr } = await sb.from("dispenser_meter_reading")
        .update({ last_meter_reading: reading, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (updErr) throw updErr;
    } else {
      const { error: insErr } = await sb.from("dispenser_meter_reading")
        .insert({ date, last_meter_reading: reading, updated_at: new Date().toISOString() });
      if (insErr) throw insErr;
    }

    toggleDispenserForm(false);
    showMsg("dispenserTableMsg", "success", "Meter reading saved successfully for " + date + ".");
    loadDispenserTable(1);
  } catch (err) {
    console.error(err);
    showMsg(msgBox, "error", "Error: " + (err.message || "could not save reading."));
    btn.disabled = false;
    btn.textContent = "Save Reading";
    return;
  }
  btn.disabled = false;
  btn.textContent = "Save Reading";
}

function clearDispenserFilters() {
  document.getElementById("dmrFilterFrom").value = "";
  document.getElementById("dmrFilterTo").value = "";
  loadDispenserTable(1);
}

function sortDispenserData(col) {
  if (dispenserSortCol === col) dispenserSortAsc = !dispenserSortAsc;
  else { dispenserSortCol = col; dispenserSortAsc = false; }
  ["date", "last_meter_reading", "updated_at"].forEach(c => {
    document.getElementById("darrow_" + c).textContent = (c === dispenserSortCol) ? (dispenserSortAsc ? "▲" : "▼") : "";
  });
  loadDispenserTable(1);
}

function changeDispenserPage(delta) {
  loadDispenserTable(dispenserPage + delta);
}

let currentDispenserRows = [];

async function loadDispenserTable(page) {
  dispenserPage = Math.max(1, page);
  const tbody = document.querySelector("#dispenserTable tbody");
  document.getElementById("dispenserTableMsg").innerHTML = "";
  tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);">Loading...</td></tr>';

  const fromDate = document.getElementById("dmrFilterFrom").value;
  const toDate = document.getElementById("dmrFilterTo").value;

  try {
    let query = sb.from("dispenser_meter_reading")
      .select("id, date, last_meter_reading, updated_at", { count: "exact" });

    if (fromDate) query = query.gte("date", fromDate);
    if (toDate) query = query.lte("date", toDate);

    query = query.order(dispenserSortCol, { ascending: dispenserSortAsc });

    const from = (dispenserPage - 1) * DISPENSER_PAGE_SIZE;
    const to = from + DISPENSER_PAGE_SIZE - 1;
    query = query.range(from, to);

    const { data, error, count } = await query;
    if (error) throw error;

    currentDispenserRows = data || [];

    if (currentDispenserRows.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" style="color:var(--muted);">No dispenser meter readings found.</td></tr>';
    } else {
      tbody.innerHTML = currentDispenserRows.map(r =>
        '<tr>' +
        '<td>' + new Date(r.date + "T00:00:00").toLocaleDateString() + '</td>' +
        '<td>' + Number(r.last_meter_reading).toLocaleString() + '</td>' +
        '<td>' + (r.updated_at ? new Date(r.updated_at).toLocaleString() : "-") + '</td>' +
        '<td><button class="btn small outline" onclick="editDispenserReading(\'' + r.id + '\', \'' + r.date + '\', ' + r.last_meter_reading + ')">Edit</button></td>' +
        '</tr>'
      ).join("");
    }

    const totalPages = Math.max(1, Math.ceil((count || 0) / DISPENSER_PAGE_SIZE));
    document.getElementById("dispenserPageInfo").textContent =
      (count || 0) + " record(s) — page " + dispenserPage + " of " + totalPages;
    document.getElementById("dispenserPrevBtn").disabled = dispenserPage <= 1;
    document.getElementById("dispenserNextBtn").disabled = dispenserPage >= totalPages;
  } catch (err) {
    console.error(err);
    tbody.innerHTML = "";
    showMsg("dispenserTableMsg", "error", "Error loading dispenser meter readings.");
  }
}
