
// supabaseClient.js
const SUPABASE_URL = "https://pmygsosxkilsgfnihnou.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_BbLyVPL8sY6IZuelcMtB9Q_htOVmEja";

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
