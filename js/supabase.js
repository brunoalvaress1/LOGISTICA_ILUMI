const SUPABASE_URL = "https://pmygsosxkilsgfnihnou.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BbLyVPL8sY6IZuelcMtB9Q_htOVmEja";
const SUPABASE_SERVICE_ROLE = "sb_secret_XkiYYLIAlBZ9_N5J2MDxfw_6d0NXgrO"; 

window.sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ✅ Admin client
window.sbAdmin = supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false } // evita mexer na sessão do browser
});
