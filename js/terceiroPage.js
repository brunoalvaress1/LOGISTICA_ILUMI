import { requireAuth, logout } from "./auth.js";
import { setLoading, toast, badgeStatus, escapeHtml } from "./ui.js";
import { getMyDriver, listMyServices, updateServiceStatus } from "./api.js";

document.getElementById("btnLogout").addEventListener("click", logout);
document.getElementById("btnRefresh").addEventListener("click", load);

let ctx, driver;

boot();

async function boot() {
  ctx = await requireAuth(["motorista_terceiro"]);
  if (!ctx) return;
  document.getElementById("userBadge").textContent = ctx.profile.nome || "Terceiro";
  await load();
}

async function load() {
  try {
    setLoading(true, "Carregando serviços...");
    driver = await getMyDriver();
    if (!driver) throw new Error("Seu cadastro de motorista não foi encontrado.");
    const services = await listMyServices(driver.id);
    render(services);
  } catch (e) {
    toast(e.message || "Erro", "danger");
  } finally {
    setLoading(false);
  }
}

function render(list) {
  const tb = document.getElementById("servicesTbody");
  if (!list.length) {
    tb.innerHTML = `<tr><td colspan="5" class="small-muted">Nenhum serviço atribuído.</td></tr>`;
    return;
  }

  tb.innerHTML = list.map(s => `
    <tr>
      <td><span class="badge badge-soft">${escapeHtml(s.tipo)}</span></td>
      <td>${escapeHtml(s.cliente)}</td>
      <td>${badgeStatus(s.status)}</td>
      <td class="small">${escapeHtml(s.endereco)}</td>
      <td class="d-flex gap-2">
        <a class="btn btn-outline-light btn-sm"
           target="_blank"
           href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.endereco)}">
           <i class="bi bi-geo-alt me-1"></i> Maps
        </a>
        <div class="dropdown">
          <button class="btn btn-light btn-sm dropdown-toggle" data-bs-toggle="dropdown">Finalizar</button>
          <ul class="dropdown-menu dropdown-menu-dark">
            <li><button class="dropdown-item" data-act="entregue" data-id="${s.id}">Entregue</button></li>
            <li><button class="dropdown-item" data-act="coletado" data-id="${s.id}">Coletado</button></li>
            <li><button class="dropdown-item" data-act="entregue_coletado" data-id="${s.id}">Entregue + Coletado</button></li>
          </ul>
        </div>
      </td>
    </tr>
  `).join("");

  tb.querySelectorAll("button[data-act]").forEach(btn => {
    btn.addEventListener("click", async () => {
      try {
        setLoading(true, "Atualizando...");
        await updateServiceStatus(btn.dataset.id, btn.dataset.act);
        toast("Atualizado com sucesso.", "success");
        await load();
      } catch (e) {
        toast(e.message || "Erro", "danger");
      } finally {
        setLoading(false);
      }
    });
  });
}
