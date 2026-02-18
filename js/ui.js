  export function $(sel, root = document) {
    return root.querySelector(sel);
  }
  export function $all(sel, root = document) {
    return Array.from(root.querySelectorAll(sel));
  }

  export function formatDT(iso) {
    if (!iso) return "-";
    const d = new Date(iso);
    return d.toLocaleString("pt-BR");
  }

  export function minutesSince(iso) {
    if (!iso) return null;
    const diffMs = Date.now() - new Date(iso).getTime();
    return Math.floor(diffMs / 60000);
  }

  export function setLoading(on, text = "Carregando...") {
    const overlay = $("#spinnerOverlay");
    const label = $("#spinnerLabel");
    if (!overlay) return;
    label.textContent = text;
    overlay.classList.toggle("show", !!on);
  }

  export function toast(message, type = "info") {
    // type: info|success|warning|danger
    const host = $("#toastHost");
    if (!host) return alert(message);

    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.role = "alert";
    el.ariaLive = "assertive";
    el.ariaAtomic = "true";
    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;
    host.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3500 });
    t.show();
    el.addEventListener("hidden.bs.toast", () => el.remove());
  }

  export function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  export function badgeStatus(status) {
    const map = {
      pendente: "secondary",
      atribuido: "info",
      em_rota: "primary",
      entregue: "success",
      coletado: "success",
      entregue_coletado: "success",
      cancelado: "danger",
      aberta: "warning",
      fechada: "success",
      fechada_assistida: "danger",
    };
    const cls = map[status] || "secondary";
    return `<span class="badge bg-${cls}">${status}</span>`;
  }
