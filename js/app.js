/* app.js (GLOBAL / SEM MODULES)
   Requisitos:
   - supabase-js v2 carregado via CDN antes deste arquivo
   - js/supabase.js deve criar: window.mySupabase = supabase.createClient(...)
   - HTML deve ter seções/containers por perfil (se existir, o código alterna):
       #screenLogistica, #screenMotoristaProprio, #screenMotoristaTerceiro, #screenPortaria
     e (opcional) um loader #globalLoading e um toast #toastHost.
   Banco (mínimo para este app funcionar):
   - profiles (id uuid = auth.users.id, role, nome, ativo)
   - motoristas (id, user_id, nome, tipo, telefone, ativo)
   - servicos (id, tipo, cliente, endereco, cidade, uf, status, motorista_id, created_at, executed_at)
   - jornadas (id, motorista_id, status, opened_at, closed_at, km_start, km_end, km_total, assistido_obs, assistido_por)
*/

(function () {
  if (!window.mySupabase) {
    console.error("window.mySupabase não encontrado. Verifique js/supabase.js");
    return;
  }

  // -----------------------------
  // Helpers DOM
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function show(el, on) {
    if (!el) return;
    el.classList.toggle("d-none", !on);
  }

  function setText(el, text) {
    if (!el) return;
    el.textContent = text ?? "";
  }

  function fmtDT(iso) {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("pt-BR");
    } catch {
      return iso;
    }
  }

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function badge(status) {
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
    return `<span class="badge bg-${cls}">${escapeHtml(status)}</span>`;
  }

  function toast(msg, type = "info") {
    // Se você tiver toast Bootstrap, use #toastHost.
    const host = $("#toastHost");
    if (!host || !window.bootstrap?.Toast) {
      alert(msg);
      return;
    }
    const el = document.createElement("div");
    el.className = `toast align-items-center text-bg-${type} border-0`;
    el.role = "alert";
    el.ariaLive = "assertive";
    el.ariaAtomic = "true";
    el.innerHTML = `
      <div class="d-flex">
        <div class="toast-body">${escapeHtml(msg)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
      </div>
    `;
    host.appendChild(el);
    const t = new bootstrap.Toast(el, { delay: 3500 });
    t.show();
    el.addEventListener("hidden.bs.toast", () => el.remove());
  }

  function setLoading(on, label = "Carregando...") {
    const overlay = $("#globalLoading");
    const text = $("#globalLoadingText");
    if (text) text.textContent = label;
    if (!overlay) return;
    overlay.classList.toggle("show", !!on);
    overlay.classList.toggle("d-none", !on);
  }

  // -----------------------------
  // Estado
  // -----------------------------
  let session = null;
  let profile = null; // {role, nome, ativo}
  let motorista = null; // {id, user_id, nome, tipo, ...}

  // -----------------------------
  // Boot
  // -----------------------------
  document.addEventListener("DOMContentLoaded", () => {
    bindGlobalButtons();
    initAuth();
  });

  function bindGlobalButtons() {
    const btnLogout = $("#btnLogout");
    if (btnLogout) {
      btnLogout.addEventListener("click", async () => {
        await window.mySupabase.auth.signOut();
        window.location.href = "index.html";
      });
    }

    const btnRefresh = $("#btnRefresh");
    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => {
        routeByRole().catch((e) => toast(e.message || "Erro ao atualizar", "danger"));
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



    // LOGÍSTICA: criar serviço (se existir)
    const formServico = $("#formServico");
    if (formServico) {
      formServico.addEventListener("submit", onCreateServico);
    }

    // PORTARIA: checkout assistido
    const formAssistido = $("#formAssistido");
    if (formAssistido) {
      formAssistido.addEventListener("submit", onCheckoutAssistido);
    }

    // MOTORISTA: check-in/out
    const formCheckIn = $("#formCheckIn");
    if (formCheckIn) formCheckIn.addEventListener("submit", onCheckInProprio);

    const formCheckOut = $("#formCheckOut");
    if (formCheckOut) formCheckOut.addEventListener("submit", onCheckOutProprio);
  }

  async function initAuth() {
    try {
      setLoading(true, "Validando sessão...");
      const { data } = await window.mySupabase.auth.getSession();
      session = data?.session || null;

      if (!session?.user) {
        window.location.href = "index.html";
        return;
      }

      // sempre revalida em mudanças
      window.mySupabase.auth.onAuthStateChange(async (_event, newSession) => {
        session = newSession;
        if (!session?.user) {
          window.location.href = "index.html";
          return;
        }
        await routeByRole();
      });

      await routeByRole();
    } catch (e) {
      console.error(e);
      toast(e.message || "Falha ao iniciar", "danger");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // Perfil e roteamento
  // -----------------------------
  async function fetchProfile() {
    // tenta profiles (recomendado). Se não existir, fallback em user_metadata.role
    const uid = session.user.id;

    try {
      const { data, error } = await window.mySupabase
        .from("profiles")
        .select("role,nome,ativo")
        .eq("id", uid)
        .single();

      if (error) throw error;
      return data;
    } catch (e) {
      console.warn("profiles não disponível ou não acessível. Fallback user_metadata.role", e?.message);
      return {
        role: session.user.user_metadata?.role || null,
        nome: session.user.user_metadata?.nome || session.user.email,
        ativo: true,
      };
    }
  }

  async function routeByRole() {
    setLoading(true, "Carregando painel...");
    profile = await fetchProfile();

    if (!profile?.ativo) {
      await window.mySupabase.auth.signOut();
      window.location.href = "index.html";
      return;
    }

    // Atualiza badge nome (se existir)
    setText($("#userBadge"), profile?.nome || session.user.email || "Usuário");

    // Esconde tudo
    show($("#screenLogistica"), false);
    show($("#screenMotoristaProprio"), false);
    show($("#screenMotoristaTerceiro"), false);
    show($("#screenPortaria"), false);

    // Carrega tela
    const role = profile.role;
    if (role === "logistica") {
      show($("#screenLogistica"), true);
      await loadLogistica();
    } else if (role === "motorista_proprio") {
      show($("#screenMotoristaProprio"), true);
      await loadMotorista(true);
    } else if (role === "motorista_terceiro") {
      show($("#screenMotoristaTerceiro"), true);
      await loadMotorista(false);
    } else if (role === "portaria") {
      show($("#screenPortaria"), true);
      await loadPortaria();
    } else {
      toast("Seu usuário não tem perfil definido (role).", "warning");
    }

    setLoading(false);
  }

  // -----------------------------
  // LOGÍSTICA
  // -----------------------------
  async function loadLogistica() {
    await Promise.allSettled([loadMotoristasTable(), loadServicosTable(), loadAlertas()]);
  }

  async function loadMotoristasTable() {
    const tb = $("#motoristasTbody");
    if (tb) tb.innerHTML = `<tr><td colspan="6" class="text-muted">Carregando...</td></tr>`;

    const { data, error } = await window.mySupabase
      .from("motoristas")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      if (tb) tb.innerHTML = `<tr><td colspan="6" class="text-danger">Erro ao buscar motoristas</td></tr>`;
      toast(error.message || "Erro ao buscar motoristas", "danger");
      return;
    }

    if (!tb) return;

    if (!data?.length) {
      tb.innerHTML = `<tr><td colspan="6" class="text-muted">Nenhum motorista cadastrado.</td></tr>`;
      return;
    }

    tb.innerHTML = data
      .map((m) => {
        return `
          <tr>
            <td class="fw-semibold">${escapeHtml(m.nome)}</td>
            <td>${escapeHtml(m.tipo || "-")}</td>
            <td>${escapeHtml(m.telefone || "-")}</td>
            <td>${m.ativo ? `<span class="badge bg-success">ativo</span>` : `<span class="badge bg-secondary">inativo</span>`}</td>
            <td>${escapeHtml(m.user_id || "-")}</td>
            <td class="d-flex gap-2">
              <button class="btn btn-outline-light btn-sm" data-edit-motorista="${m.id}">Editar</button>
              <button class="btn btn-light btn-sm" data-toggle-motorista="${m.id}">
                ${m.ativo ? "Desativar" : "Ativar"}
              </button>
            </td>
          </tr>
        `;
      })
      .join("");

    $$("[data-edit-motorista]", tb).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.editMotorista;
        const m = data.find((x) => x.id === id);
        openMotoristaModal(m);
      });
    });

    $$("[data-toggle-motorista]", tb).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.toggleMotorista;
        const m = data.find((x) => x.id === id);
        try {
          setLoading(true, "Atualizando motorista...");
          const { error: e2 } = await window.mySupabase
            .from("motoristas")
            .update({ ativo: !m.ativo })
            .eq("id", id);
          if (e2) throw e2;
          toast("Motorista atualizado.", "success");
          await loadMotoristasTable();
        } catch (e) {
          toast(e.message || "Erro ao atualizar", "danger");
        } finally {
          setLoading(false);
        }
      });
    });
  }

  function openMotoristaModal(m) {
    // Modal opcional. IDs esperados:
    // #motoristaId, #motoristaNome, #motoristaTipo, #motoristaTelefone, #motoristaAtivo, #motoristaUserId
    setText($("#motoristaModalTitle"), m ? "Editar motorista" : "Novo motorista");
    if ($("#motoristaId")) $("#motoristaId").value = m?.id || "";
    if ($("#motoristaNome")) $("#motoristaNome").value = m?.nome || "";
    if ($("#motoristaTipo")) $("#motoristaTipo").value = m?.tipo || "proprio";
    if ($("#motoristaTelefone")) $("#motoristaTelefone").value = m?.telefone || "";
    if ($("#motoristaAtivo")) $("#motoristaAtivo").checked = m ? !!m.ativo : true;
    if ($("#motoristaUserId")) $("#motoristaUserId").value = m?.user_id || "";

    // abre bootstrap modal se existir
    const modalEl = $("#modalMotorista");
    if (modalEl && window.bootstrap?.Modal) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    }
  }

  async function saveMotorista() {
  try {
    const nome = document.getElementById('motoristaNome').value.trim();
    const tipo = document.getElementById('motoristaTipo').value; // proprio | terceiro | portaria
    const telefoneEl = document.getElementById('motoristaTelefone'); // se existir
    const telefone = telefoneEl ? telefoneEl.value.trim() : null;

    // NOVO: user_id opcional (coloque um input no modal)
    const userIdEl = document.getElementById('motoristaUserId'); // crie esse campo no modal
    const user_id = userIdEl ? (userIdEl.value.trim() || null) : null;

    if (!nome || !tipo) {
      alert('Preencha Nome e Tipo!');
      return;
    }

    const payload = {
      nome,
      tipo: tipo === 'portaria' ? null : tipo,
      telefone: telefone || null,
      user_id,        // pode ser null por enquanto
      ativo: true
    };

    const { error } = await window.mySupabase.from('motoristas').insert(payload);
    if (error) throw error;

    loadMotoristas();
    bootstrap.Modal.getInstance(document.getElementById('motoristaModal')).hide();

    document.getElementById('motoristaNome').value = '';
    document.getElementById('motoristaTipo').value = '';
    if (telefoneEl) telefoneEl.value = '';
    if (userIdEl) userIdEl.value = '';

    showToast('Motorista cadastrado com sucesso!', 'success');
  } catch (e) {
    console.error(e);
    alert('Erro ao salvar: ' + (e.message || e));
    showToast('Erro ao salvar: ' + (e.message || e), 'danger');
  }
}


  async function loadServicosTable() {
    const tb = $("#servicosTbody");
    if (tb) tb.innerHTML = `<tr><td colspan="6" class="text-muted">Carregando...</td></tr>`;

    const { data: servicos, error } = await window.mySupabase
      .from("servicos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      if (tb) tb.innerHTML = `<tr><td colspan="6" class="text-danger">Erro ao buscar serviços</td></tr>`;
      return;
    }

    if (!tb) return;

    if (!servicos?.length) {
      tb.innerHTML = `<tr><td colspan="6" class="text-muted">Nenhum serviço cadastrado.</td></tr>`;
      return;
    }

    // Para mostrar nome do motorista, buscamos uma vez o mapa de motoristas:
    const { data: motoristas } = await window.mySupabase.from("motoristas").select("id,nome");
    const map = new Map((motoristas || []).map((m) => [m.id, m.nome]));

    tb.innerHTML = servicos
      .map((s) => {
        const mNome = s.motorista_id ? (map.get(s.motorista_id) || "—") : "—";
        return `
          <tr>
            <td>${escapeHtml(s.tipo)}</td>
            <td>
              <div class="fw-semibold">${escapeHtml(s.cliente)}</div>
              <div class="text-muted small">${escapeHtml(s.endereco)}</div>
            </td>
            <td>${badge(s.status)}</td>
            <td>${escapeHtml(mNome)}</td>
            <td>${fmtDT(s.created_at)}</td>
            <td class="d-flex gap-2">
              <button class="btn btn-outline-light btn-sm" data-assign-servico="${s.id}">Atribuir</button>
              <a class="btn btn-light btn-sm" target="_blank"
                href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.endereco)}">Maps</a>
            </td>
          </tr>
        `;
      })
      .join("");

    $$("[data-assign-servico]", tb).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const servicoId = btn.dataset.assignServico;
        // Simples: prompt. Se tiver select no modal, substitua.
        const motoristaId = prompt("Cole o ID do motorista (motoristas.id) para atribuir:");
        if (!motoristaId) return;

        try {
          setLoading(true, "Atribuindo serviço...");
          const { error: e2 } = await window.mySupabase
            .from("servicos")
            .update({ motorista_id: motoristaId.trim(), status: "atribuido" })
            .eq("id", servicoId);
          if (e2) throw e2;
          toast("Serviço atribuído.", "success");
          await loadServicosTable();
        } catch (e) {
          toast(e.message || "Erro ao atribuir", "danger");
        } finally {
          setLoading(false);
        }
      });
    });
  }

  async function onCreateServico(e) {
    e.preventDefault();
    try {
      setLoading(true, "Criando serviço...");
      const tipo = $("#svcTipo")?.value;
      const cliente = $("#svcCliente")?.value?.trim();
      const endereco = $("#svcEndereco")?.value?.trim();
      const cidade = $("#svcCidade")?.value?.trim() || null;
      const uf = $("#svcUF")?.value?.trim() || null;
      const status = "pendente";

      if (!tipo || !cliente || !endereco) throw new Error("Tipo, cliente e endereço são obrigatórios.");

      const { error } = await window.mySupabase.from("servicos").insert([
        { tipo, cliente, endereco, cidade, uf, status },
      ]);
      if (error) throw error;

      toast("Serviço criado.", "success");
      e.target.reset();

      // fecha modal se existir
      const modalEl = $("#modalServico");
      if (modalEl && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(modalEl).hide();

      await loadServicosTable();
    } catch (err) {
      toast(err.message || "Erro ao criar serviço", "danger");
    } finally {
      setLoading(false);
    }
  }

  async function loadAlertas() {
    // Se você não tiver tabela alerts, apenas ignore
    const tb = $("#alertasTbody");
    if (!tb) return;

    tb.innerHTML = `<tr><td colspan="4" class="text-muted">Carregando...</td></tr>`;

    const { data, error } = await window.mySupabase
      .from("alerts")
      .select("*")
      .is("resolved_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      tb.innerHTML = `<tr><td colspan="4" class="text-muted">Sem alertas (ou tabela não existe / sem permissão).</td></tr>`;
      return;
    }

    if (!data?.length) {
      tb.innerHTML = `<tr><td colspan="4" class="text-muted">Nenhum alerta aberto.</td></tr>`;
      return;
    }

    tb.innerHTML = data
      .map((a) => `
        <tr>
          <td>${escapeHtml(a.type)}</td>
          <td>${escapeHtml(a.severity)}</td>
          <td>${escapeHtml(a.message)}</td>
          <td>${fmtDT(a.created_at)}</td>
        </tr>
      `)
      .join("");
  }

  // -----------------------------
  // MOTORISTA (próprio e terceiro)
  // -----------------------------
  async function loadMotorista(isProprio) {
    // 1) encontrar motorista pelo user_id
    const uid = session.user.id;

    const { data: mot, error } = await window.mySupabase
      .from("motoristas")
      .select("*")
      .eq("user_id", uid)
      .single();

    if (error) {
      console.error(error);
      toast(
        "Seu cadastro de motorista não foi encontrado. Peça para a logística vincular seu user_id.",
        "warning"
      );
      // remove “carregando” se existir
      const tb = isProprio ? $("#servicosMotoristaTbody") : $("#servicosTerceiroTbody");
      if (tb) tb.innerHTML = `<tr><td colspan="5" class="text-muted">Sem cadastro vinculado.</td></tr>`;
      return;
    }

    motorista = mot;

    if (isProprio) {
      await Promise.allSettled([loadJornadaAtual(), loadServicosDoMotorista()]);
    } else {
      await loadServicosDoMotorista(true);
    }
  }

  async function loadServicosDoMotorista(isTerceiro = false) {
    const tb = isTerceiro ? $("#servicosTerceiroTbody") : $("#servicosMotoristaTbody");
    if (tb) tb.innerHTML = `<tr><td colspan="5" class="text-muted">Carregando...</td></tr>`;

    const { data, error } = await window.mySupabase
      .from("servicos")
      .select("*")
      .eq("motorista_id", motorista.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      if (tb) tb.innerHTML = `<tr><td colspan="5" class="text-danger">Erro ao buscar serviços.</td></tr>`;
      toast(error.message || "Erro ao buscar serviços", "danger");
      return;
    }

    if (!tb) return;

    if (!data?.length) {
      tb.innerHTML = `<tr><td colspan="5" class="text-muted">Nenhum serviço atribuído.</td></tr>`;
      return;
    }

    tb.innerHTML = data
      .map((s) => `
        <tr>
          <td><span class="badge bg-light text-dark">${escapeHtml(s.tipo)}</span></td>
          <td>${escapeHtml(s.cliente)}</td>
          <td>${badge(s.status)}</td>
          <td>
            <div>${escapeHtml(s.endereco)}</div>
            <div class="text-muted small">${escapeHtml([s.cidade, s.uf].filter(Boolean).join(" • "))}</div>
          </td>
          <td class="d-flex gap-2">
            <a class="btn btn-outline-light btn-sm" target="_blank"
              href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.endereco)}">Maps</a>
            <div class="dropdown">
              <button class="btn btn-light btn-sm dropdown-toggle" data-bs-toggle="dropdown">Finalizar</button>
              <ul class="dropdown-menu dropdown-menu-dark">
                <li><button class="dropdown-item" data-finish="entregue" data-id="${s.id}">Entregue</button></li>
                <li><button class="dropdown-item" data-finish="coletado" data-id="${s.id}">Coletado</button></li>
                <li><button class="dropdown-item" data-finish="entregue_coletado" data-id="${s.id}">Entregue + Coletado</button></li>
              </ul>
            </div>
          </td>
        </tr>
      `)
      .join("");

    $$("button[data-finish]", tb).forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.id;
        const newStatus = btn.dataset.finish;
        try {
          setLoading(true, "Atualizando serviço...");
          const { error: e2 } = await window.mySupabase
            .from("servicos")
            .update({ status: newStatus, executed_at: new Date().toISOString() })
            .eq("id", id);
          if (e2) throw e2;
          toast("Serviço atualizado.", "success");
          await loadServicosDoMotorista(isTerceiro);
        } catch (e) {
          toast(e.message || "Erro ao atualizar", "danger");
        } finally {
          setLoading(false);
        }
      });
    });
  }

 






  // -----------------------------
  // JORNADAS (motorista próprio)
  // -----------------------------
  async function loadJornadaAtual() {
    const title = $("#jornadaTitle");
    const statusEl = $("#jornadaStatus");
    const opened = $("#jornadaOpenedAt");
    const kmS = $("#jornadaKmStart");
    const kmE = $("#jornadaKmEnd");

    setText(title, "Carregando...");
    if (statusEl) statusEl.innerHTML = "";
    setText(opened, "-");
    setText(kmS, "-");
    setText(kmE, "-");

    const { data, error } = await window.mySupabase
      .from("jornadas")
      .select("*")
      .eq("motorista_id", motorista.id)
      .eq("status", "aberta")
      .maybeSingle();

    if (error) {
      console.error(error);
      toast(error.message || "Erro ao buscar jornada", "danger");
      setText(title, "Erro ao carregar jornada");
      return;
    }

    if (!data) {
      setText(title, "Nenhuma jornada aberta");
      if (statusEl) statusEl.innerHTML = `<span class="badge bg-secondary">fechada</span>`;
      setText(opened, "-");
      setText(kmS, "-");
      setText(kmE, "-");

      const btnIn = $("#btnOpenCheckIn");
      const btnOut = $("#btnOpenCheckOut");
      if (btnIn) btnIn.disabled = false;
      if (btnOut) btnOut.disabled = true;
      return;
    }

    setText(title, "Jornada aberta");
    if (statusEl) statusEl.innerHTML = badge(data.status);
    setText(opened, fmtDT(data.opened_at));
    setText(kmS, data.km_start ?? "-");
    setText(kmE, data.km_end ?? "-");

    const btnIn = $("#btnOpenCheckIn");
    const btnOut = $("#btnOpenCheckOut");
    if (btnIn) btnIn.disabled = true;
    if (btnOut) btnOut.disabled = false;

    // guarda jornada atual em dataset (facilita)
    const holder = $("#jornadaHolder");
    if (holder) holder.dataset.jornadaId = data.id;
  }

  async function onCheckInProprio(e) {
    e.preventDefault();
    try {
      const kmStart = Number($("#kmStartInput")?.value);
      if (!kmStart || Number.isNaN(kmStart)) throw new Error("KM inicial inválido.");

      setLoading(true, "Abrindo jornada...");
      const { error } = await window.mySupabase.from("jornadas").insert([
        {
          motorista_id: motorista.id,
          status: "aberta",
          opened_at: new Date().toISOString(),
          km_start: kmStart,
        },
      ]);
      if (error) throw error;

      toast("Check-in realizado.", "success");
      // fecha modal se existir
      const modalEl = $("#modalCheckIn");
      if (modalEl && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      e.target.reset();
      await loadJornadaAtual();
    } catch (err) {
      toast(err.message || "Erro no check-in", "danger");
    } finally {
      setLoading(false);
    }
  }

  async function onCheckOutProprio(e) {
    e.preventDefault();
    try {
      const jornadaId = $("#jornadaHolder")?.dataset?.jornadaId;
      if (!jornadaId) throw new Error("Nenhuma jornada aberta para fechar.");

      const kmEnd = Number($("#kmEndInput")?.value);
      if (!kmEnd || Number.isNaN(kmEnd)) throw new Error("KM final inválido.");

      setLoading(true, "Fechando jornada...");
      const { data: j, error: e1 } = await window.mySupabase
        .from("jornadas")
        .select("km_start")
        .eq("id", jornadaId)
        .single();
      if (e1) throw e1;

      const kmTotal = (j.km_start != null) ? (kmEnd - j.km_start) : null;

      const { error } = await window.mySupabase
        .from("jornadas")
        .update({
          status: "fechada",
          closed_at: new Date().toISOString(),
          km_end: kmEnd,
          km_total: kmTotal,
        })
        .eq("id", jornadaId);

      if (error) throw error;

      toast("Check-out realizado.", "success");
      const modalEl = $("#modalCheckOut");
      if (modalEl && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      e.target.reset();
      await loadJornadaAtual();
    } catch (err) {
      toast(err.message || "Erro no check-out", "danger");
    } finally {
      setLoading(false);
    }
  }

  // -----------------------------
  // PORTARIA
  // -----------------------------
  async function loadPortaria() {
    await Promise.allSettled([loadJornadasAbertasPortaria(), loadHistoricoPortaria()]);
  }

  async function loadJornadasAbertasPortaria() {
    const tb = $("#portariaAbertasTbody");
    if (tb) tb.innerHTML = `<tr><td colspan="5" class="text-muted">Carregando...</td></tr>`;

    const { data, error } = await window.mySupabase
      .from("jornadas")
      .select("*, motoristas(nome,tipo)")
      .eq("status", "aberta")
      .order("opened_at", { ascending: true });

    if (error) {
      console.error(error);
      if (tb) tb.innerHTML = `<tr><td colspan="5" class="text-danger">Erro ao buscar jornadas</td></tr>`;
      return;
    }

    if (!tb) return;

    if (!data?.length) {
      tb.innerHTML = `<tr><td colspan="5" class="text-muted">Nenhuma jornada aberta.</td></tr>`;
      return;
    }

    tb.innerHTML = data
      .map((j) => `
        <tr>
          <td>${escapeHtml(j.motoristas?.nome || "—")}</td>
          <td>${escapeHtml(j.motoristas?.tipo || "—")}</td>
          <td>${fmtDT(j.opened_at)}</td>
          <td>${badge(j.status)}</td>
          <td>
            <button class="btn btn-light btn-sm" data-assist="${j.id}">Checkout assistido</button>
          </td>
        </tr>
      `)
      .join("");

    $$("button[data-assist]", tb).forEach((btn) => {
      btn.addEventListener("click", () => {
        const jornadaId = btn.dataset.assist;
        if ($("#assistJornadaId")) $("#assistJornadaId").value = jornadaId;

        const modalEl = $("#modalAssistido");
        if (modalEl && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(modalEl).show();
      });
    });
  }

  async function loadHistoricoPortaria() {
    const tb = $("#portariaHistoricoTbody");
    if (!tb) return;

    tb.innerHTML = `<tr><td colspan="4" class="text-muted">Carregando...</td></tr>`;

    const { data, error } = await window.mySupabase
      .from("jornadas")
      .select("*, motoristas(nome)")
      .neq("status", "aberta")
      .order("closed_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error(error);
      tb.innerHTML = `<tr><td colspan="4" class="text-muted">Sem histórico (ou sem permissão).</td></tr>`;
      return;
    }

    if (!data?.length) {
      tb.innerHTML = `<tr><td colspan="4" class="text-muted">Sem histórico recente.</td></tr>`;
      return;
    }

    tb.innerHTML = data
      .map((j) => `
        <tr>
          <td>${escapeHtml(j.motoristas?.nome || "—")}</td>
          <td>${badge(j.status)}</td>
          <td>${fmtDT(j.opened_at)}</td>
          <td>${fmtDT(j.closed_at)}</td>
        </tr>
      `)
      .join("");
  }

  async function onCheckoutAssistido(e) {
    e.preventDefault();
    try {
      const jornadaId = $("#assistJornadaId")?.value?.trim();
      const obs = $("#assistObs")?.value?.trim();
      if (!jornadaId) throw new Error("Jornada inválida.");
      if (!obs || obs.length < 5) throw new Error("Observação obrigatória (mín. 5 caracteres).");

      setLoading(true, "Encerrando jornada...");
      const { error } = await window.mySupabase
        .from("jornadas")
        .update({
          status: "fechada_assistida",
          closed_at: new Date().toISOString(),
          assistido_obs: obs,
          assistido_por: session.user.id,
        })
        .eq("id", jornadaId);

      if (error) throw error;

      toast("Checkout assistido registrado.", "success");

      const modalEl = $("#modalAssistido");
      if (modalEl && window.bootstrap?.Modal) bootstrap.Modal.getOrCreateInstance(modalEl).hide();
      e.target.reset();

      await loadJornadasAbertasPortaria();
      await loadHistoricoPortaria();
    } catch (err) {
      toast(err.message || "Erro no checkout assistido", "danger");
    } finally {
      setLoading(false);
    }
  }
})();
