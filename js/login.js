import { sb } from "./supabaseClient.js";
import { setLoading, toast } from "./ui.js";

document.getElementById("loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  try {
    setLoading(true, "Autenticando...");
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;

    // buscar role para redirecionar
    const { data: profile, error: pErr } = await sb
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single();

    if (pErr) throw pErr;

    const role = profile.role;
    const map = {
      logistica: "logistica.html",
      motorista_proprio: "motorista.html",
      motorista_terceiro: "terceiro.html",
      portaria: "portaria.html"
    };
    window.location.href = map[role] || "unauthorized.html";
  } catch (err) {
    toast(err?.message || "Falha no login", "danger");
  } finally {
    setLoading(false);
  }
});
