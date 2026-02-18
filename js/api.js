import { sb } from "./supabaseClient.js";

export async function getMyDriver() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const { data, error } = await sb
    .from("drivers")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function listVehiclesActive() {
  const { data, error } = await sb
    .from("veiculos")
    .select("*")
    .eq("ativo", true)
    .order("placa");
  if (error) throw error;
  return data;
}

export async function getMyOpenJourney(driverId) {
  const { data, error } = await sb
    .from("jornadas")
    .select("*")
    .eq("motorista_id", driverId)
    .eq("aberta", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function checkIn({ driverId, vehicleId, kmStart, startPhotoPath }) {
  const { data, error } = await sb
    .from("jornadas")
    .insert([{
      motorista_id: driverId,
      veiculo_id: vehicleId,
      aberta: true,
      km_inicial: kmStart,
      foto_inicio: startPhotoPath,
      aberta_em: new Date().toISOString()
    }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function checkOutNormal({ journeyId, kmEnd, endPhotoPath }) {
  const { data, error } = await sb
    .from("jornadas")
    .update({
      aberta: false,
      km_final: kmEnd,
      foto_fim: endPhotoPath,
      encerrada_em: new Date().toISOString()
    })
    .eq("id", journeyId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function checkOutAssistido({ journeyId, obs }) {
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb
    .from("jornadas")
    .update({
      aberta: false,
      encerrada_por: user.id,
      encerrada_em: new Date().toISOString()
    })
    .eq("id", journeyId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listMyServices(driverId) {
  const { data, error } = await sb
    .from("servicos")
    .select("*")
    .eq("driver_id", driverId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function updateServiceStatus(serviceId, newStatus) {
  const valid = ["entregue","coletado","entregue_coletado"];
  if (!valid.includes(newStatus)) throw new Error("Status inválido");

  const { data, error } = await sb
    .from("servicos")
    .update({ status: newStatus })
    .eq("id", serviceId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/* ===== Logística ===== */
export async function listDrivers() {
  const { data, error } = await sb
    .from("drivers")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function upsertDriver(payload) {
  if (payload.id) {
    const { data, error } = await sb
      .from("drivers")
      .update(payload)
      .eq("id", payload.id)
      .select("*")
      .single();
    if (error) throw error;
    return data;
  } else {
    const { data, error } = await sb
      .from("drivers")
      .insert([payload])
      .select("*")
      .single();
    if (error) throw error;
    return data;
  }
}

export async function setDriverActive(id, ativo) {
  const { data, error } = await sb
    .from("drivers")
    .update({ ativo })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function listServicesAll() {
  const { data, error } = await sb
    .from("servicos")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function createService(payload) {
  const { data, error } = await sb
    .from("servicos")
    .insert([{
      ...payload,
      status: "pendente",
      created_at: new Date().toISOString(),
      created_by: (await sb.auth.getUser()).data.user.id
    }])
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function assignService(serviceId, driverId) {
  const { data, error } = await sb
    .from("servicos")
    .update({
      driver_id: driverId,
      status: "atribuido",
      assigned_at: new Date().toISOString()
    })
    .eq("id", serviceId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function assignServiceWithJourney(serviceId, driverId, veiculoId = null) {
  // Verificar se motorista tem jornada aberta hoje
  const today = new Date().toISOString().split('T')[0];
  const { data: jornada, error: jErr } = await sb
    .from("jornadas")
    .select("id")
    .eq("motorista_id", driverId)
    .eq("aberta", true)
    .gte("aberta_em", `${today}T00:00:00Z`)
    .maybeSingle();

  if (jErr) throw jErr;

  let jornadaId;
  if (!jornada) {
    // Criar jornada aberta para hoje com veículo se fornecido
    const { data: newJornada, error: createErr } = await sb
      .from("jornadas")
      .insert([{
        motorista_id: driverId,
        veiculo_id: veiculoId,  // Usar veículo selecionado
        aberta: true,
        aberta_em: new Date().toISOString()
      }])
      .select("id")
      .single();
    if (createErr) throw createErr;
    jornadaId = newJornada.id;
  } else {
    jornadaId = jornada.id;
  }

  // Atribuir serviço à jornada (se serviceId fornecido)
  if (serviceId) {
    const { error } = await sb
      .from("servicos")
      .update({
        driver_id: driverId,
        jornada_id: jornadaId,
        status: "atribuido",
        assigned_at: new Date().toISOString()
      })
      .eq("id", serviceId)
      .select("*")
      .single();
    if (error) throw error;
  }

  return { jornadaId };
}

export async function listAlertsOpen() {
  const { data, error } = await sb
    .from("alerts")
    .select("*")
    .is("resolved_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function resolveAlert(alertId, resolution_notes) {
  const { data: { user } } = await sb.auth.getUser();
  const { data, error } = await sb
    .from("alerts")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: user.id,
      resolution_notes
    })
    .eq("id", alertId)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/* ===== Portaria ===== */
export async function listOpenJourneys() {
  const { data, error } = await sb
    .from("jornadas")
    .select("*, drivers(nome,tipo), veiculos(placa,descricao)")
    .eq("aberta", true)
    .order("aberta_em", { ascending: true });
  if (error) throw error;
  return data;
}

export async function listRecentJourneys(limit = 20) {
  const { data, error } = await sb
    .from("jornadas")
    .select("*, drivers(nome,tipo), veiculos(placa,descricao)")
    .eq("aberta", false)
    .order("encerrada_em", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data;
}