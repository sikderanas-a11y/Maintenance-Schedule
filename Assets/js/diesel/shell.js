/* ============ UI SHELL HELPERS (layout only — no data logic) ============ */
const PAGE_META = {
  dashboard:["Dashboard","Overview"], heatmap:["Vehicle vs Date Heat Map","Analytics"],
  create:["Create & Generate QR Codes","QR Management"], report:["Download Report","Reports"],
  drivers:["Driver Information","Master Data"], rates:["Consumption Rate","Master Data"],
  dispenser:["Dispenser Meter Reading","Operations"], operators:["Operator Information","Master Data"],
  useraccess:["User Access","Settings"]
};
const DESKTOP_MIN = 1100;
function closeSidebar(){ document.body.classList.remove("sb-open"); }
function toggleSidebar(){
  if (window.innerWidth >= DESKTOP_MIN) {
    const c = document.body.classList.toggle("sb-collapsed");
    try { localStorage.setItem("dt_sb_collapsed", c ? "1" : "0"); } catch (e) {}
  } else {
    document.body.classList.toggle("sb-open");
  }
}
(function initSidebar(){
  try { if (localStorage.getItem("dt_sb_collapsed") === "1") document.body.classList.add("sb-collapsed"); } catch (e) {}
  window.addEventListener("resize", () => { if (window.innerWidth >= DESKTOP_MIN) closeSidebar(); });
  document.addEventListener("keydown", e => { if (e.key === "Escape") closeSidebar(); });
})();

/* header title / breadcrumb follow the active page (wraps, never replaces, switchPage) */
const _switchPageOrig = switchPage;
switchPage = function(name){
  _switchPageOrig(name);
  const pg = document.getElementById("page-" + name);
  if (pg && pg.classList.contains("active") && PAGE_META[name]) {
    document.getElementById("hdrTitle").textContent = PAGE_META[name][0];
    document.getElementById("hdrCrumb").textContent = PAGE_META[name][1];
    closeSidebar();
    window.scrollTo({ top: 0 });
  }
};
/* logged-in administrator info in the header */
const _enterAdminOrig = enterAdminDashboard;
enterAdminDashboard = async function(){
  if (adminAuth) {
    document.getElementById("hdrUserEmail").textContent = adminAuth.email;
    document.getElementById("hdrUserRole").textContent = adminAuth.isSuper ? "Super Administrator" : "Dashboard User";
    document.getElementById("hdrAvatar").textContent = (adminAuth.email || "A").charAt(0).toUpperCase();
  }
  return _enterAdminOrig();
};

/* drag & drop onto CSV dropzones -> reuses each input's existing onchange handler */
document.querySelectorAll(".dropzone[data-input]").forEach(z => {
  ["dragenter","dragover"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.add("drag"); }));
  ["dragleave","drop"].forEach(ev => z.addEventListener(ev, e => { e.preventDefault(); z.classList.remove("drag"); }));
  z.addEventListener("drop", e => {
    const input = document.getElementById(z.dataset.input);
    if (e.dataTransfer && e.dataTransfer.files.length) {
      input.files = e.dataTransfer.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  });
});
/* search-box clear (x) visibility */
document.addEventListener("input", e => {
  const box = e.target.closest && e.target.closest(".search-box");
  if (box) box.classList.toggle("has-val", !!e.target.value);
});
