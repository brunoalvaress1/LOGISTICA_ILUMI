import { sb } from "./supabaseClient.js";

export async function requireAuth(allowedRoles = []) {
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) {
    window.location.href = "index.html";
    return null;
  }

  const { data: profile, error } = await sb
    .from("profiles")
    .select("role,nome,ativo")
    .eq("id", session.user.id)
    .single();

  if (error || !profile?.ativo) {
    await sb.auth.signOut();
    window.location.href = "index.html";
    return null;
  }

  if (allowedRoles.length && !allowedRoles.includes(profile.role)) {
    window.location.href = "unauthorized.html";
    return null;
  }

  return { session, profile };
}

export async function logout() {
  await sb.auth.signOut();
  window.location.href = "index.html";
}
