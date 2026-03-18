// Global runtime config for static hosting (Vercel, etc.)
// Update API_URL after you deploy the backend.
window.FF_CONFIG = {
  API_URL: 'https://YOUR_BACKEND_API_URL',
  SUPABASE_URL: 'https://itymnewbpzmjtchuztvg.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_jUHZii3ud-f4qdH2aLvT_g_l_wODuyZ',
};

window.FF_API_URL = window.FF_CONFIG.API_URL;
window.FF_SUPABASE_URL = window.FF_CONFIG.SUPABASE_URL;
window.FF_SUPABASE_ANON_KEY = window.FF_CONFIG.SUPABASE_ANON_KEY;
