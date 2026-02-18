import { requireAuth, logout } from "./auth.js";
import { setLoading, toast, formatDT, minutesSince, badgeStatus, escapeHtml } from "./ui.js";
import { listOpenJourneys, listRecentJourneys, checkOutAssistido } from "./api.js";

document.getElementById("btnLogout").addEventListener("click", logout);
document.getElementById("btnRefresh").addEventListener("click", load);

const modal = new bootstrap.Modal(document.getElementById("modalAssistido"));
document.getElementById("formAssistido").addEventListener("submit", onAssistido);

let ctx;
boot();

async function boot() {
  ctx = await requireAuth(["portaria"]);
  if (!ctx) return;
  document.getElementById("userBadge").textContent = ctx.profile.nome || "Portaria";
  await load();
  setInterval(load, 20000);
}

async function load() {
  try {
    setLoading(true, "Atualizando painel...");
    const [open, recent] = await Promise.all([
      listOpenJourneys(),
      listRecentJourneys(15)
    ]);

    renderOpen(open);
    renderRecent(recent);
  } catch (e) {
    toast(e.message || "Erro", "danger");
  } finally {
    setLoading(false);
  }
}

function renderOpen(list) {
  const tb = document.getElementById("openTbody");
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="5" class="small-muted">Nenhuma jornada em rota.</td></tr>`;
    return;
  }

  tb.innerHTML = list.map(j => {
    const mins = minutesSince(j.opened_at);
    const warn = mins != null && mins > 12 * 60; // 12h como base
    const tempo = mins == null ? "—" : `${Math.floor(mins/60)}h ${mins%60}m`;
    return `
      <tr>
        <td>
          <div class="fw-semibold">${escapeHtml(j.vehicles?.placa || "—")}</div>
          <div class="small-muted">${escapeHtml(j.vehicles?.descricao || "")}</div>
        </td>
        <td>
          <div class="fw-semibold">${escapeHtml(j.drivers?.nome || "—")}</div>
          <div class="small-muted">${escapeHtml(j.drivers?.tipo || "")}</div>
        </td>
        <td>${formatDT(j.opened_at)}</td>
        <td>${warn ? `<span class="badge bg-danger">${tempo}</span>` : `<span class="badge bg-warning text-dark">${tempo}</span>`}</td>
        <td>
          <button class="btn btn-light btn-sm" data-assist="1" data-id="${j.id}"
            data-meta="${escapeHtml((j.vehicles?.placa||'') + ' • ' + (j.drivers?.nome||''))}">
            <i class="bi bi-exclamation-triangle me-1"></i> Checkout assistido
          </button>
        </td>
      </tr>
    `;
  }).join("");

  tb.querySelectorAll("button[data-assist]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.getElementById("assistJourneyId").value = btn.dataset.id;
      document.getElementById("assistMeta").textContent = btn.dataset.meta;
      document.getElementById("assistObs").value = "";
      modal.show();
    });
  });
}

function renderRecent(list) {
  document.getElementById("recentCount").textContent = list.length;
  const tb = document.getElementById("recentTbody");
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="3" class="small-muted">Sem histórico recente.</td></tr>`;
    return;
  }

  tb.innerHTML = list.map(j => `
    <tr>
      <td>${escapeHtml(j.vehicles?.placa || "—")}</td>
      <td>${badgeStatus(j.status)}</td>
      <td>${formatDT(j.closed_at)}</td>
    </tr>
  `).join("");
}

async function onAssistido(e) {
  e.preventDefault();
  const journeyId = document.getElementById("assistJourneyId").value;
  const obs = document.getElementById("assistObs").value.trim();
  if (obs.length < 5) return toast("Observação muito curta.", "warning");

  try {
    setLoading(true, "Encerrando jornada...");
    await checkOutAssistido({ journeyId, obs });
    toast("Jornada encerrada assistida e auditada.", "success");
    modal.hide();
    await load();
  } catch (err) {
    toast(err.message || "Erro", "danger");
  } finally {
    setLoading(false);
  }
}
