/* supabase.js — Supabase clients (main project + oil project) */
/* Supabase client — RLS is disabled in this schema (custom auth, no auth.uid()).
   Access control is enforced in the SPA based on profile.role + user_permissions. */
const db = window.supabase.createClient(SB_URL, SB_KEY);
/* Second client for the oil project (see OIL_SB_URL / OIL_SB_KEY at top of file) */
const oilDb = window.supabase.createClient(OIL_SB_URL, OIL_SB_KEY);

