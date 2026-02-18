import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ✅ Ajuste para os seus valores (ou importe de outro lugar)
const SUPABASE_URL = "https://pmygsosxkilsgfnihnou.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_BbLyVPL8sY6IZuelcMtB9Q_htOVmEja";

const sb = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);

// --------------------
// UI helpers
// --------------------
const $ = (id) => document.getElementById(id);

function setSpinner(on, label = "Carregando...") {
  const ov = $("spinnerOverlay");
  const lb = $("spinnerLabel");
  if (lb) lb.textContent = label;
  if (ov) ov.style.display = on ? "flex" : "none";
}

function badge(html) {
  return `<span class="badge badge-soft">${html}</span>`;
}

function fmtDt(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function setJourneyEmpty(msg = "Sem jornada aberta") {
  $("journeyTitle").textContent = msg;
  $("journeyStatusBadge").innerHTML = badge("—");
  $("openedAt").textContent = "—";
  $("kmStart").textContent = "—";
  $("kmEnd").textContent = "—";
}

function setServicesEmpty(msg = "Nenhum serviço atribuído.") {
  $("servicesCount").textContent = "0";
  $("servicesTbody").innerHTML = `<tr><td colspan="5" class="small-muted">${msg}</td></tr>`;
}

function toast(text) {
  // fallback simples
  alert(text);
}

// --------------------
// Auth / Perfil
// --------------------
async function requireSession() {
  const { data } = await sb.auth.getSession();
  const user = data?.session?.user;
  if (!user) {
    location.href = "index.html";
    throw new Error("Sem sessão");
  }
  return user;
}

async function loadProfile(userId) {
  const { data, error } = await sb
    .from("profiles")
    .select("id,role,tipo,nome,email,ativo")
    .eq("id", userId)
    .single();

  if (error) throw error;
  if (!data) throw new Error("Perfil não encontrado");
  if (data.ativo === false) throw new Error("Usuário desativado");
  return data;
}

function applyRoleUI(profile) {
  $("userBadge").textContent = `${profile.nome} • ${profile.role}`;

  // Remover diferenças: todos fazem jornada igual
  setJourneyEmpty("Pronto para check-in");
}

// --------------------
// Jornada e Serviços Integrados
// --------------------
async function loadJourneyAndServices(profile) {
  // Carregar jornada aberta de hoje (mais recente, evita múltiplas linhas)
  const today = new Date().toISOString().split('T')[0];
  const { data: jornadas, error: jErr } = await sb
    .from("jornadas")
    .select("*")
    .eq("motorista_id", profile.id)
    .eq("aberta", true)
    .gte("aberta_em", `${today}T00:00:00Z`)
    .order("aberta_em", { ascending: false });

  if (jErr) {
    console.error("Erro loadJourneyAndServices:", jErr);  // Debug
    throw jErr;
  }

  const jornada = jornadas?.[0];  // Pega a jornada mais recente (evita erro de múltiplas linhas)

  if (!jornada) {
    setJourneyEmpty("Nenhuma jornada aberta hoje.");
    setServicesEmpty("Nenhum serviço atribuído.");
    return;
  }

  // Mostrar jornada
  setJourneyTitle(`Jornada do dia: ${new Date(jornada.aberta_em).toLocaleDateString("pt-BR")}`);
  setJourneyStatusBadge('<span class="badge bg-warning">Aberta</span>');
  setOpenedAt(new Date(jornada.aberta_em).toLocaleString("pt-BR"));
  setKmStart(jornada.km_inicial || "—");
  setKmEnd(jornada.km_final || "—");

  // Carregar serviços da jornada (só se check-in feito, i.e., km_inicial > 0)
  if (!jornada.km_inicial || jornada.km_inicial <= 0) {
    setServicesEmpty("Faça check-in para ver as entregas.");
    return;
  }

  const { data: services, error: sErr } = await sb
    .from("servicos")
    .select("*")
    .eq("jornada_id", jornada.id)
    .order("created_at", { ascending: false });

  if (sErr) {
    console.error("Erro loadServices:", sErr);  // Debug
    throw sErr;
  }

  renderServices(services, jornada.id, profile);
}

function setJourneyTitle(title) {
  $("journeyTitle").textContent = title;
}

function setJourneyStatusBadge(badge) {
  $("journeyStatusBadge").innerHTML = badge;
}

function setOpenedAt(time) {
  $("openedAt").textContent = time;
}

function setKmStart(km) {
  $("kmStart").textContent = km;
}

function setKmEnd(km) {
  $("kmEnd").textContent = km;
}

function renderServices(list, jornadaId, profile) {
  // Filtrar apenas serviços pendentes (não concluídos)
  const pendentes = list.filter(s => !["entregue", "coletado", "entregue_coletado", "cancelado"].includes(s.status));

  const tb = document.getElementById("servicesTbody");
  if (!pendentes.length) {
    tb.innerHTML = `<tr><td colspan="5" class="small-muted">Todas as entregas finalizadas. Faça check-out.</td></tr>`;
    return;
  }

  tb.innerHTML = pendentes.map(s => `
    <tr>
      <td><span class="badge badge-soft">${escapeHtml(s.tipo)}</span></td>
      <td>${escapeHtml(s.cliente)}</td>
      <td>${badgeStatus(s.status)}</td>
      <td class="small">${escapeHtml(s.endereco)}</td>
      <td class="d-flex gap-2">
        <a class="btn btn-outline-light btn-sm" target="_blank" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.endereco)}">
          <i class="bi bi-geo-alt me-1"></i> Maps
        </a>
        <div class="dropdown">
          <button class="btn btn-light btn-sm dropdown-toggle" data-bs-toggle="dropdown">Finalizar</button>
          <ul class="dropdown-menu dropdown-menu-dark">
            <li><button class="dropdown-item" data-act="entregue" data-id="${s.id}">Entregue</button></li>
            <li><button class="dropdown-item" data-act="coletado" data-id="${s.id}">Coletado</button></li>
            <li><button class="dropdown-item" data-act="entregue_coletado" data-id="${s.id}">Entregue + Coletado</button></li>
            <li><button class="dropdown-item" data-act="nao_entregue" data-id="${s.id}">Não Entregue</button></li>
          </ul>
        </div>
      </td>
    </tr>
  `).join("");

  tb.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const act = btn.dataset.act;
      if (act === "nao_entregue") {
        const motivo = prompt("Motivo para não entrega:");
        if (!motivo) return;
        try {
          setSpinner(true, "Atualizando...");
          await updateServiceStatus(btn.dataset.id, "cancelado", 0, motivo);
          toast("Atualizado com sucesso.", "success");
          await loadJourneyAndServices(profile);
        } catch (e) {
          toast(e.message || "Erro", "danger");
        } finally {
          setSpinner(false);
        }
        return;
      }

      const km = prompt("Digite o KM atual:");
      if (km === null || isNaN(Number(km))) {
        toast("KM inválido.");
        return;
      }
      try {
        setSpinner(true, "Atualizando...");
        await updateServiceStatus(btn.dataset.id, act, Number(km));
        toast("Atualizado com sucesso.", "success");
        await loadJourneyAndServices(profile);
      } catch (e) {
        toast(e.message || "Erro", "danger");
      } finally {
        setSpinner(false);
      }
    });
  });
}

function badgeStatus(status) {
  const map = {
    pendente: "secondary",
    atribuido: "info",
    em_rota: "primary",
    entregue: "success",
    coletado: "success",
    entregue_coletado: "success",
    cancelado: "danger",
  };
  const cls = map[status] || "secondary";
  return `<span class="badge bg-${cls}">${status}</span>`;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// --------------------
// Eventos
// --------------------
async function wireEvents(profile) {
  $("btnLogout").addEventListener("click", async () => {
    await sb.auth.signOut();
    location.href = "index.html";
  });

  $("btnRefresh").addEventListener("click", async () => {
    setSpinner(true, "Atualizando...");
    try {
      await loadJourneyAndServices(profile);
    } finally {
      setSpinner(false);
    }
  });

  // Check-in / check-out
  const modalIn = new bootstrap.Modal(document.getElementById("modalCheckIn"));
  const modalOut = new bootstrap.Modal(document.getElementById("modalCheckOut"));

  $("btnCheckIn").addEventListener("click", async () => {
    const jornada = await getMyOpenJourney(profile.id);
    if (!jornada) {
      toast("Nenhuma jornada atribuída hoje.");
      return;
    }
    // Pré-selecionar veículo da jornada
    await loadVeiculosSelect(jornada.veiculo_id);
    modalIn.show();
  });

  $("btnCheckOut").addEventListener("click", async () => {
    // Validação: Verificar se todas as entregas estão concluídas
    const jornada = await getMyOpenJourney(profile.id);
    if (!jornada) {
      toast("Nenhuma jornada aberta.");
      return;
    }
    const { data: services } = await sb
      .from("servicos")
      .select("status")
      .eq("jornada_id", jornada.id);
    const pendentes = services.filter(s => !["entregue", "coletado", "entregue_coletado", "cancelado"].includes(s.status));
    if (pendentes.length > 0) {
      toast("Finalize todas as entregas antes do check-out.");
      return;
    }
    modalOut.show();
  });

  // Submits
  $("formCheckIn").addEventListener("submit", async (e) => {
    e.preventDefault();
    const kmStart = Number($("kmStartInput")?.value);
    const vehicleId = $("vehicleSelect")?.value;
    if (!kmStart || !vehicleId) {
      toast("Preencha KM e veículo.");
      return;
    }
    try {
      setSpinner(true, "Fazendo check-in...");
      await checkIn({ driverId: profile.id, vehicleId, kmStart, startPhotoPath: "" });
      toast("Check-in realizado.", "success");
      modalIn.hide();
      await loadJourneyAndServices(profile);  // Recarrega para mostrar serviços
    } catch (err) {
      toast(err.message || "Erro no check-in", "danger");
    } finally {
      setSpinner(false);
    }
  });

  $("formCheckOut").addEventListener("submit", async (e) => {
    e.preventDefault();
    const jornada = await getMyOpenJourney(profile.id);
    if (!jornada) {
      toast("Nenhuma jornada aberta.");
      return;
    }
    const kmEnd = Number($("kmEndInput")?.value);
    if (!kmEnd) {
      toast("Preencha KM final.");
      return;
    }
    try {
      setSpinner(true, "Fazendo check-out...");
      await checkOutNormal({ journeyId: jornada.id, kmEnd, endPhotoPath: "" });
      toast("Check-out realizado.", "success");
      modalOut.hide();
      await loadJourneyAndServices(profile);
    } catch (err) {
      toast(err.message || "Erro no check-out", "danger");
    } finally {
      setSpinner(false);
    }
  });
}

// --------------------
// Funções Auxiliares
// --------------------
async function getMyOpenJourney(driverId) {
  const { data, error } = await sb
    .from("jornadas")
    .select("*")
    .eq("motorista_id", driverId)
    .eq("aberta", true)
    .order("aberta_em", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data?.[0] || null;
}

async function checkIn({ driverId, vehicleId, kmStart, startPhotoPath }) {
  // Verificar se já há jornada aberta hoje
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await sb
    .from("jornadas")
    .select("id")
    .eq("motorista_id", driverId)
    .eq("aberta", true)
    .gte("aberta_em", `${today}T00:00:00Z`)
    .maybeSingle();

  if (existing) {
    // Atualizar jornada existente
    const { error } = await sb
      .from("jornadas")
      .update({
        veiculo_id: vehicleId,
        km_inicial: kmStart,
        foto_inicio: startPhotoPath
      })
      .eq("id", existing.id);
    if (error) throw error;
    return existing;
  } else {
    // Inserir nova jornada
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
}

async function checkOutNormal({ journeyId, kmEnd, endPhotoPath }) {
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

async function updateServiceStatus(serviceId, newStatus, km, motivo = null) {
  const valid = ["entregue","coletado","entregue_coletado","cancelado"];
  if (!valid.includes(newStatus)) throw new Error("Status inválido");

  const updateData = { status: newStatus };
  if (newStatus === "entregue" || newStatus === "entregue_coletado") {
    updateData.km_entrega = km;
  }
  if (newStatus === "coletado" || newStatus === "entregue_coletado") {
    updateData.km_coleta = km;
  }
  if (motivo) {
    updateData.motivo_nao_entrega = motivo;
  }

  console.log("Atualizando serviço:", serviceId, "dados:", updateData);  // Debug
  const { data, error } = await sb
    .from("servicos")
    .update(updateData)
    .eq("id", serviceId)
    .select("*")
    .single();
  if (error) {
    console.error("Erro updateServiceStatus:", error);  // Debug
    throw error;
  }
  return data;
}

async function loadVeiculosSelect(selectedVehicleId = null) {
  const sel = document.getElementById("vehicleSelect");
  sel.innerHTML = `<option value="">Carregando...</option>`;

  const { data, error } = await sb
    .from("veiculos")
    .select("id,placa,modelo,tipo,ativo")
    .eq("ativo", true)
    .order("placa", { ascending: true });

  if (error) {
    console.error("Erro loadVeiculosSelect:", error);
    sel.innerHTML = `<option value="">Erro ao carregar veículos</option>`;
    return;
  }

  if (!data?.length) {
    sel.innerHTML = `<option value="">Nenhum veículo disponível</option>`;
    return;
  }

  sel.innerHTML = data.map(v =>
    `<option value="${v.id}" ${selectedVehicleId === v.id ? 'selected' : ''}>${v.placa}${v.modelo ? " • " + v.modelo : ""} (${v.tipo})</option>`
  ).join("");
}

// --------------------
// Init
// --------------------
(async function init() {
  setSpinner(true, "Carregando...");

  try {
    const user = await requireSession();
    const profile = await loadProfile(user.id);

    applyRoleUI(profile);

    await loadJourneyAndServices(profile);
    await wireEvents(profile);

  } catch (err) {
    console.error(err);
    setJourneyEmpty("Erro ao carregar");
    setServicesEmpty("Erro ao carregar serviços.");
    toast(err?.message || "Falha ao iniciar tela do motorista");
  } finally {
    setSpinner(false);
  }
})();