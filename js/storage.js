import { sb } from "./supabaseClient.js";

export async function uploadPainelFoto({ journeyId, file, kind }) {
  const path = `journeys/${journeyId}/${kind}.jpg`;

  const { error } = await sb
    .storage
    .from("painel-fotos")
    .upload(path, file, { upsert: true, contentType: file.type || "image/jpeg" });

  if (error) throw error;
  return path;
}
