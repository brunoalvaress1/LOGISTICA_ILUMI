import { requireAuth, logout } from "./auth.js";
import { setLoading, toast, badgeStatus, formatDT, escapeHtml } from "./ui.js";
import {
  listDrivers, upsertDriver, setDriverActive,
  listServicesAll, createService, assignService,
  listAlertsOpen, resolveAlert
} from "./api.js";

document.getElementById("btnLogout").addEventListener("click", logout);
document.getElementById("btnRefresh").addEventListener("click", loadAll);

const modalDriver = new bootstrap.Modal(document.getElementById("modalDriver"));
const modalService = new bootstrap.Modal(document.getElementById("modalService"));

document.getElementById("btnNewDriver").addEventListener("click", () => openDriverModal());
document.getElementById("btnNewService").addEventListener("click", openServiceModal);
document.getElementById("formDriver").addEventListener("submit", onSaveDriver);
document.getElementById("formService").addEventListener("submit", onCreateService);

let ctx;
let cacheDrivers = [];
let cacheServices = [];
let cacheAlerts = [];

boot();

async function boot() {
  ctx = await requireAuth(["logistica"]);
  if (!ctx) return;
  document.getElementById("userBadge").textContent = ctx.profile.nome || "Logística";

  bindMenu();
  await loadAll();
}

function bindMenu() {
  document.querySelectorAll("[data-view]").forEach(a => {
    a.addEventListener("click", (e) => {
      e.preventDefault();
      const v = a.dataset.view;
      document.querySelectorAll(".sidebar-link").forEach(x => x.classList.remove("active"));
      a.classList.add("active");

      document.querySelectorAll(".view").forEach(sec => sec.classList.add("d-none"));
      document.getElementById(`view-${v}`).classList.remove("d-none");
    });
  });
}

async function loadAll() {
  try {
    setLoading(true, "Atualizando dados...");
    const [drivers, services, alerts] = await Promise.all([
      listDrivers(),
      listServicesAll(),
      listAlertsOpen()
    ]);
    cacheDrivers = drivers;
    cacheServices = services;
    cacheAlerts = alerts;

    renderKpis();
    renderDrivers();
    renderServices();
    renderAlerts();
  } catch (e) {
    toast(e.message || "Erro ao carregar", "danger");
  } finally {
    setLoading(false);
  }
}

function renderKpis() {
  const activeDrivers = cacheDrivers.filter(d => d.ativo).length;
  const pendingServices = cacheServices.filter(s => ["pendente","atribuido","em_rota"].includes(s.status)).length;
  const openAlerts = cacheAlerts.length;

  document.getElementById("kpiDrivers").textContent = activeDrivers;
  document.getElementById("kpiServices").textContent = pendingServices;
  document.getElementById("kpiAlerts").textContent = openAlerts;
}

function renderDrivers() {
  const tb = document.getElementById("driversTbody");
  if (!cacheDrivers.length) {
    tb.innerHTML = `<tr><td colspan="5" class="small-muted">Nenhum motorista cadastrado.</td></tr>`;
    return;
  }

  tb.innerHTML = cacheDrivers.map(d => `
    <tr>
      <td class="fw-semibold">${escapeHtml(d.nome)}</td>
      <td><span class="badge badge-soft">${escapeHtml(d.tipo)}</span></td>
      <td>${escapeHtml(d.telefone || "-")}</td>
      <td>${d.ativo ? `<span class="badge bg-success">ativo</span>` : `<span class="badge bg-secondary">inativo</span>`}</td>
      <td class="d-flex gap-2">
        <button class="btn btn-outline-light btn-sm" data-edit-driver="${d.id}">
          <i class="bi bi-pencil me-1"></i>Editar
        </button>
        <button class="btn btn-light btn-sm" data-toggle-driver="${d.id}">
          ${d.ativo ? "Desativar" : "Ativar"}
        </button>
      </td>
    </tr>
  `).join("");

  tb.querySelectorAll("[data-edit-driver]").forEach(btn => {
    btn.addEventListener("click", () => {
      const d = cacheDrivers.find(x => x.id === btn.dataset.editDriver);
      openDriverModal(d);
    });
  });

  tb.querySelectorAll("[data-toggle-driver]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.toggleDriver;
      const d = cacheDrivers.find(x => x.id === id);
      try {
        setLoading(true, "Atualizando motorista...");
        await setDriverActive(id, !d.ativo);
        toast("Motorista atualizado.", "success");
        await loadAll();
      } catch (e) {
        toast(e.message || "Erro", "danger");
      } finally {
        setLoading(false);
      }
    });
  });
}

function openDriverModal(d = null) {
  document.getElementById("driverModalTitle").textContent = d ? "Editar motorista" : "Novo motorista";
  document.getElementById("driverId").value = d?.id || "";
  document.getElementById("driverNome").value = d?.nome || "";
  document.getElementById("driverTipo").value = d?.tipo || "proprio";
  document.getElementById("driverTel").value = d?.telefone || "";
  document.getElementById("driverAtivo").checked = d ? !!d.ativo : true;
  modalDriver.show();
}

async function onSaveDriver(e) {
  e.preventDefault();
  try {
    setLoading(true, "Salvando...");
    const payload = {
      id: document.getElementById("driverId").value || undefined,
      nome: document.getElementById("driverNome").value.trim(),
      tipo: document.getElementById("driverTipo").value,
      telefone: document.getElementById("driverTel").value.trim() || null,
      ativo: document.getElementById("driverAtivo").checked,
    };
    if (!payload.nome) throw new Error("Nome é obrigatório.");
    await upsertDriver(payload);
    toast("Salvo com sucesso.", "success");
    modalDriver.hide();
    await loadAll();
  } catch (e2) {
    toast(e2.message || "Erro", "danger");
  } finally {
    setLoading(false);
  }
}

function renderServices() {
  const tb = document.getElementById("servicesTbody");
  if (!cacheServices.length) {
    tb.innerHTML = `<tr><td colspan="5" class="small-muted">Nenhum serviço.</td></tr>`;
    return;
  }

  tb.innerHTML = cacheServices.map(s => {
    const driver = cacheDrivers.find(d => d.id === s.driver_id);
    return `
      <tr>
        <td><span class="badge badge-soft">${escapeHtml(s.tipo)}</span></td>
        <td>
          <div class="fw-semibold">${escapeHtml(s.cliente)}</div>
          <div class="small-muted">${escapeHtml(s.endereco)}</div>
        </td>
        <td>${badgeStatus(s.status)}</td>
        <td>${escapeHtml(driver?.nome || "—")}</td>
        <td class="d-flex gap-2">
          <button class="btn btn-outline-light btn-sm" data-assign="${s.id}">
            <i class="bi bi-person-check me-1"></i>Atribuir
          </button>
          <a class="btn btn-light btn-sm" target="_blank"
             href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.endereco)}">
            <i class="bi bi-geo-alt me-1"></i>Maps
          </a>
        </td>
      </tr>
    `;
  }).join("");

  tb.querySelectorAll("[data-assign]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const serviceId = btn.dataset.assign;
      const choice = prompt("Cole o ID do motorista para atribuir (por enquanto). Em seguida vamos trocar por dropdown.");
      if (!choice) return;
      try {
        setLoading(true, "Atribuindo...");
        await assignService(serviceId, choice.trim());
        toast("Serviço atribuído.", "success");
        await loadAll();
      } catch (e) {
        toast(e.message || "Erro", "danger");
      } finally {
        setLoading(false);
      }
    });
  });
}

function openServiceModal() {
  const sel = document.getElementById("svcDriver");
  sel.innerHTML = `<option value="">— Sem atribuição —</option>` + cacheDrivers
    .filter(d => d.ativo)
    .map(d => `<option value="${d.id}">${escapeHtml(d.nome)} • ${escapeHtml(d.tipo)}</option>`)
    .join("");

  document.getElementById("formService").reset();
  modalService.show();
}

async function onCreateService(e) {
  e.preventDefault();
  try {
    setLoading(true, "Criando serviço...");
    const payload = {
      tipo: document.getElementById("svcTipo").value,
      cliente: document.getElementById("svcCliente").value.trim(),
      endereco: document.getElementById("svcEndereco").value.trim(),
      cidade: document.getElementById("svcCidade").value.trim() || null,
      uf: document.getElementById("svcUF").value.trim() || null,
      cep: document.getElementById("svcCEP").value.trim() || null,
      observacoes: document.getElementById("svcObs").value.trim() || null,
    };
    const driverId = document.getElementById("svcDriver").value || null;

    if (!payload.cliente || !payload.endereco) throw new Error("Cliente e endereço são obrigatórios.");

    const created = await createService(payload);
    if (driverId) await assignService(created.id, driverId);

    toast("Serviço criado.", "success");
    modalService.hide();
    await loadAll();
  } catch (e2) {
    toast(e2.message || "Erro", "danger");
  } finally {
    setLoading(false);
  }
}

function renderAlerts() {
  const tb = document.getElementById("alertsTbody");
  if (!cacheAlerts.length) {
    tb.innerHTML = `<tr><td colspan="5" class="small-muted">Nenhum alerta aberto.</td></tr>`;
    return;
  }

  tb.innerHTML = cacheAlerts.map(a => `
    <tr>
      <td><span class="badge badge-soft">${escapeHtml(a.type)}</span></td>
      <td>${escapeHtml(a.severity)}</td>
      <td>${escapeHtml(a.message)}</td>
      <td>${formatDT(a.created_at)}</td>
      <td class="d-flex gap-2">
        <button class="btn btn-light btn-sm" data-resolve="${a.id}">
          <i class="bi bi-check2-circle me-1"></i>Resolver
        </button>
      </td>
    </tr>
  `).join("");

  tb.querySelectorAll("[data-resolve]").forEach(btn => {
    btn.addEventListener("click", async () => {
      const id = btn.dataset.resolve;
      const notes = prompt("Observação da resolução (opcional):") || null;
      try {
        setLoading(true, "Resolvendo alerta...");
        await resolveAlert(id, notes);
        toast("Alerta resolvido.", "success");
        await loadAll();
      } catch (e) {
        toast(e.message || "Erro", "danger");
      } finally {
        setLoading(false);
      }
    });
  });
}


document.getElementById("formCriarMotorista").addEventListener("submit", async (e) => {
  e.preventDefault();

  const nome = document.getElementById("mNome").value.trim();
  const email = document.getElementById("mEmail").value.trim().toLowerCase();
  const tipo = document.getElementById("mTipo").value;

  const { error } = await sb.from("profiles_pending").insert({
    email,
    nome,
    role: "motorista",
    tipo
  });

  if (error) {
    alert(error.message);
    return;
  }

  alert("Pré-cadastro criado! O motorista deve criar a senha no primeiro acesso.");
});
