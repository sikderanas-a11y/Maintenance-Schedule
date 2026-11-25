# XiC (Automobile) — Vehicle Maintenance + Diesel Admin

## Run it
Serve the `Project` folder over HTTP (do not rely on `file://`):
```
cd Project
python3 -m http.server 8080      # then open http://localhost:8080/
```
Any static host works (Netlify, GitHub Pages, IIS, Nginx...). Internet is needed for Supabase and CDN libraries.

## Structure
```
index.html                      Landing portal (no app code loaded)
Pages/VehicleMaintenance.html   Vehicle Maintenance shell (login, header, page switcher)
Pages/DieselAdmin.html          Diesel Admin app (own login, own Supabase config)
Pages/<Name>.html               Deep-link entry per maintenance page (e.g. OilEntry.html -> VehicleMaintenance.html#oil_record)
Assets/css/                     style.css (original), common.css, responsive.css, diesel.css
Assets/js/config.js             Supabase URLs/keys (unchanged values)
Assets/js/supabase.js           db + oilDb clients
Assets/js/auth.js               custom auth / session / login / initApp
Assets/js/common.js             PAGES registry, permissions, switcher, router, helpers
Assets/js/router.js             on-demand loader for page modules + libraries
Assets/js/performance.js        master-data cache (loadVehicles/loadItems) with write invalidation
Assets/js/pages/pNN_*.js        page modules, loaded only when the page is opened (original code, unchanged)
Assets/js/diesel/*.js           Diesel Admin code (original, split in original order)
Assets/images/logo.png          put your logo here (pages hide it gracefully if missing)
```
## Independence
Vehicle Maintenance (`vmsp_session`, project pdsahyolbylfntshsjug) and Diesel Admin (own `sb` client in `diesel/app.js`) share no auth, config or permissions.

## Performance
Landing page loads no libraries. Maintenance: Tailwind/Supabase/Lucide + small core only; page code, and XLSX / QR / jsPDF / scanner libraries load when a page needing them opens. Master data is cached 60 s and cleared on any write.

## Vehicle Breakdown Status module
```
Pages/Vehicle_Breakdown_Status.html   deep link -> VehicleMaintenance.html#vehicle_breakdown
Assets/js/pages/p21_vehicle_breakdown.js   whole module (page, form, history, PDF + Excel export); loaded only when the page opens
Database/vehicle_breakdown_status.sql      run once in the Supabase SQL Editor (main project): adds vehicle_master.uuid_id + creates the breakdown table/view
```
* Registered like every other page: `PAGES` (auth.js), `PAGE_META` (common.js), route manifest (router.js). Access follows the **Vehicle Maintenance** permission; no new permission column is needed.
* Data: table `vehicle_breakdown_status` + view `vehicle_breakdown_summary`. One row per breakdown; repairing a vehicle closes the row (status `Operational`, `recovery_date` set) and never deletes it. A partial unique index allows only one active breakdown per vehicle. The database grants no DELETE.
* Vehicle list: the main project's `vehicle_master` table (`uuid_id`, `code`, `vehicle_name`). The SQL file adds a `uuid_id` column to it (existing `id` untouched), and `vehicle_breakdown_status.vehicle_id` is a real foreign key to `vehicle_master.uuid_id` (ON DELETE RESTRICT, so a vehicle with breakdown history cannot be deleted). `vehicle_name` / `vehicle_number` (= `code`) are stored on each record as a snapshot.
* PDF (jsPDF + AutoTable, cdnjs) and Excel (ExcelJS, cdnjs with jsDelivr fallback) load only when a download button is pressed. Exports are built from Supabase rows (all matching records, not just the visible page), never from the HTML table.
* `router.js` `startRoute()` now checks `PAGES` by name (it is a `const`, so `window.PAGES` was always undefined) so deep links and the browser Back button open the right page; pages the user may not open fall back to Home.
