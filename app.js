"use strict";

/* ============================================================ estado global */
let DATA = null;
let labsById = {};
let equipPorLab = {};            // labId -> { existentes:[], novos:[] }
const labSort = { key: "nome", dir: 1 };
const eqSort = { key: "valor", dir: -1 };
let eqSubtab = "existentes";     // existentes | novos
let lastFocused = null;          // foco a restaurar ao fechar o modal
let eqThQtd = null;              // referência ao <th> da coluna qtd para atualizar label

let labControls = [];            // controles da aba Laboratórios
let eqLabControls = [];          // controles "critérios do laboratório" (aba Equip.)
let eqItemControls = [];         // controles "critérios do equipamento" (aba Equip.)
let distControls = [];           // controles da aba Distribuição

/* aba Distribuição: verba a repartir entre as unidades acadêmicas */
const DIST_VERBA = 1200000;      // verba total
const DIST_MIN = 20000;          // custo total mínimo para o item ser elegível
const DIST_TETO = 150000;        // teto por item (concentra a verba em equipamentos de maior porte)
const DIST_FATOR_TURMAS = 25;    // máx. de "turmas/semestre" plausível p/ validar alunos vs capacidade
const DIST_REDIST_MAX = 5;        // máx. de itens na redistribuição da sobra (reserva)
const DIST_REDIST_MIN = 25000;     // valor mínimo para um item ser candidato à redistribuição (reserva)
const DIST_REDIST_TETO = 150000;   // valor máximo para um item da redistribuição (reserva)
const DIST_LS = "distSelecao.v12";// chave do localStorage com a seleção (v12: 5 itens manuais, sem custo/aluno)
let distItems = [];              // novos + existentes anotados { e, lab, key, tipo, qtd, elegivel }
let distPorUnidade = new Map();  // unidade -> [itens]
let distPrioLab = new Map();     // unidade -> labId prioritário (critérios da distribuição)
let distSel = new Set();         // chaves dos itens selecionados
let distRedist = new Set();      // chaves dos itens adicionados pela redistribuição da sobra
let distHeads = {};              // unidade -> { badge, total } p/ atualizar sem re-render
let distView = "final";          // visão ativa: "final" (lista definitiva) | "ajustar"

/* A lista de itens atendidos é GERADA pelos critérios da distribuição (ver
   distSuggest): em cada unidade, o laboratório prioritário — atende licenciatura
   > mais alunos > mais cursos > mais cursos externos — com item de qtd = 1, valor
   ≥ R$ 20 mil e dentro do teto por item. Sobre esse resultado automático aplicam-se
   apenas dois ajustes humanos: os overrides de DIST_MANUAIS e as exclusões de
   DIST_MOTIVOS_ESPECIAIS. */

/* Overrides manuais: unidade -> item escolhido à mão (substitui a escolha
   automática da unidade) + motivo exibido no selo "ajuste manual". */
const DIST_MANUAIS = {
  FEN: {
    key: "LAB169|novo|LAVADORA ULTRASSONICA|20000",
    motivo: "Ajuste manual: pelos critérios automáticos a FEN seria atendida por outro laboratório (com um 'equipamento audiovisual'), mas a lavadora ultrassônica é o item que de fato se enquadra como equipamento de laboratório para este edital.",
  },
  EVZ: {
    key: "LAB085|existente|Cabine de segurança biológica classe A2|23000",
    motivo: "Ajuste manual: o item de maior valor elegível seria a Fiat Strada (veículo), que não se enquadra no edital. A cabine de segurança biológica é equipamento de laboratório adequado e atende 80 alunos/sem.",
  },
  FEFD: {
    key: "LAB167|novo|SQUAT MACHINE PL\nMUSCULAÇÃO NEXT SQUAT MACHINE PL PRE/PRE\nMOVEMENT|25390",
    motivo: "Ajuste manual: o item de maior valor elegível seria os tapetes de ginástica rítmica, que são um pacote de vários equipamentos (não um único equipamento). A squat machine é um equipamento individual adequado ao edital.",
  },
  FL: {
    key: "LAB202|novo|Câmera|22000",
    motivo: "Ajuste manual: o item de maior valor elegível seria a 'ilha de edição', que é um conjunto de vários equipamentos de áudio/vídeo (não um único equipamento). A câmera é um equipamento individual que atende a mesma demanda de produção audiovisual.",
  },
};

/* Itens VETADOS: excluídos da elegibilidade automática. Motivo: veículo,
   pacote multi-equipamento (não é um único equipamento) ou descrição placeholder.
   Esses itens continuam visíveis na aba "Ajustar seleção" (marcados como vetados),
   mas nunca entram na proposta gerada pelos critérios nem na redistribuição da
   sobra. A unidade pode ser atendida por outro item elegível. */
const DIST_VETADOS = {
  "LAB113|novo|Fiat Strada Endurance 1.3|105990": "Veículo — compra de veículos não se enquadra no edital.",
  "LAB114|novo|Fiat Strada Endurance Cabine Plus 1.3 MT|100990": "Veículo — compra de veículos não se enquadra no edital.",
  "LAB159|existente|Tapetes de ginástica rítmica.|80000": "Pacote multi-equipamento — não é um único equipamento.",
  "LAB202|novo|Ilha de edição|115000": "Pacote multi-equipamento — não é um único equipamento.",
  "LAB081|novo|Micro trator com roçadeira|40000": "Veículo — compra de veículos não se enquadra no edital.",
  "LAB086|novo|Toda a sequencia de produção de ração (pré-limpeza, moinho, silo de dosagem, balança, misturador) são equipamentos antigos, adquiridos a mais de 20 anos e todos necessitam de serem substituídos por novos|100000": "Pacote multi-equipamento — não é um único equipamento.",
  "LAB170|novo|EQUIPAMENTO AUDIO VISUAL|20000": "Descrição placeholder — não especifica qual equipamento seria adquirido.",
  "LAB171|novo|EQUIPAMENTO DE AUDIO VISUAL|20000": "Descrição placeholder — não especifica qual equipamento seria adquirido.",
  "LAB172|novo|EQUIPAMENTO AUDIO VISUAL|20000": "Descrição placeholder — não especifica qual equipamento seria adquirido.",
  "LAB174|novo|EQUIPAMENTO DE AUDIO VISUAL|20000": "Descrição placeholder — não especifica qual equipamento seria adquirido.",
  "LAB202|novo|Pro Display XDR – Vidro nano-texture|65000": "Monitor de luxo — não é equipamento essencial de produção audiovisual.",
};

/* Itens de redistribuição escolhidos manualmente: 5 equipamentos essenciais para
   a graduação, que transformam a capacidade de ensino das unidades subatendidas.
   Cada entrada é { key, swap?, motivo } — se swap é informado, o item original
   daquela unidade é removido e substituído pelo novo. */
const DIST_REDIST_OVERRIDES = [
  {
    key: "LAB226|novo|Câmara de pressão ou câmara de Scholander|60000",
    swap: "LAB234|existente|Microscópio com câmera acoplada|20000",
    motivo: "Câmara de pressão de Scholander — equipamento central de fisiologia vegetal e animal; permite aulas práticas de respiração e fotossíntese para 250 alunos (licenciatura em Ciências Biológicas).",
  },
  {
    key: "LAB167|novo|X-4.6TSI\nESTEIRA X-4.6I SAC.TCH SCREEN 15\" INC -2% A 18%\nLONA 60CM – MOVEMENT -\nFAZ ATÉ  22km/h|85980",
    motivo: "Esteira ergométrica com plataforma de avaliação — o equipamento central de avaliação física para Educação Física; sem ele não se ensina teste ergoespirométrico nem prescrição de exercício (120 alunos, licenciatura).",
  },
  {
    key: "LAB098|novo|Ultrafreezer|48000",
    motivo: "Ultrafreezer -80°C — preservação de amostras biológicas, reagentes e cultivos; essencial para manter a cadeia de frio em laboratórios de microbiologia e parasitologia veterinária (100 alunos).",
  },
  {
    key: "LAB257|novo|Microscópio petrográfico|57000",
    motivo: "Microscópio petrográfico — instrumento fundamental para Geociências: sem ele não se identifica minerais nem se analisa lâmina delgada de rocha (200 alunos, licenciatura).",
  },
  {
    key: "LAB028|existente|Prensa de Cisalhamento Direto|120000",
    motivo: "Prensa de cisalhamento direto — equipamento central de mecânica dos solos para Engenharia Civil; ensaio de cisalhamento é a prática mais importante de geotecnia (135 alunos).",
  },
];

/* mapa derivado chave -> motivo, usado para pintar o selo "ajuste manual" */
const DIST_AJUSTES = Object.fromEntries(
  Object.values(DIST_MANUAIS).map((ov) => [ov.key, ov.motivo]));

/* Unidades EXCLUÍDAS por decisão registrada: ficam sempre fora da lista atendida,
   mesmo que tivessem item elegível, e aparecem em "não contempladas" com o motivo.
   Unidade -> motivo (texto explicativo). */
const DIST_MOTIVOS_ESPECIAIS = {
  FM: "As duas únicas solicitações elegíveis são de altíssimo valor (Sequenciador MiSeq, R$ 600 mil, e GeneChip, R$ 400 mil) — muito acima do teto de R$ 120 mil por item — e o único laboratório com item elegível (Centro Clínico em Genética Humana) informou atender 0 alunos de graduação por semestre. Sem um equipamento de porte compatível e com público de graduação atendido, a unidade não entra na distribuição.",
  UAECH: "O único item elegível da unidade é uma 'Caixa de som' orçada em R$ 50 mil, valor considerado irreal para esse equipamento. Enquanto a estimativa não for revista, a solicitação não tem base para ser financiada.",
  FD: "A demanda foi registrada como um lote único reunindo vários equipamentos diferentes, com quantidade informada igual a 0 e custo total de R$ 250 mil. Sem itens individualizados (cada um com quantidade e preço próprios), não é possível avaliar nem selecionar um equipamento dentro dos critérios.",
};

/* ============================================================ helpers */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};
const esc = (s) =>
  String(s ?? "").replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const debounce = (fn, ms) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};

const fmtBRL = (v) =>
  "R$ " + Math.round(v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
const fmtNum = (v) => (v || 0).toLocaleString("pt-BR");

/* parser pt-BR: remove separador de milhar, troca vírgula decimal por ponto */
const parseNum = (s) => {
  const cleaned = String(s).trim()
    .replace(/\./g, "")       // separador de milhar pt-BR
    .replace(",", ".")         // separador decimal pt-BR
    .replace(/[^\d.\-]/g, ""); // remove tudo que não é dígito/ponto/sinal
  if (cleaned === "" || cleaned === "-") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
};
const inRange = (val, min, max) =>
  (min === null || val >= min) && (max === null || val <= max);
const cellText = (s) => (s && s.trim() ? esc(s) : '<span class="muted">—</span>');

const LAB_COLS = [
  { key: "nome", label: "Laboratório" },
  { key: "unidade", label: "Unidade" },
  { key: "area", label: "Grande Área" },
  { key: "localidade", label: "Localidade" },
  { key: "qtdCursosProprios", label: "Cursos da unidade", cls: "num" },
  { key: "qtdCursosExternos", label: "Cursos externos", cls: "num" },
  { key: "discentes", label: "Alunos / sem.", cls: "num" },
  { key: "capacidade", label: "Capac. / turma", cls: "num" },
  { key: "nEquip", label: "Equip.", cls: "num" },
];
const EQ_COLS = [
  ["lab", "Laboratório", ""], ["unidade", "Unidade", ""],
  ["area", "Grande Área", ""], ["localidade", "Localidade", ""],
  ["nome", "Equipamento", ""], ["prioridade", "Prioridade", "num"],
  ["qtd", "Qtd. a adquirir", "num"],
  ["valor", "Custo total (R$)", "num", "No levantamento de 2024, cada laboratório informou apenas o custo total para adquirir a quantidade que pediu deste equipamento. É esse valor que aparece aqui."],
  ["unit", "Estimativa de custo unitário (R$)", "num", "O levantamento não coletou o preço de uma unidade. Esta coluna é só uma estimativa: o custo total dividido pela quantidade pedida (por isso o ≈)."],
  ["descricao", "Descrição", ""], ["comentarios", "Comentários", ""],
];
function cmp(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "pt-BR", { numeric: true, sensitivity: "base" });
}

/* passo "redondo" para o slider conforme a amplitude da faixa */
function niceStep(span) {
  if (span <= 200) return 1;
  if (span <= 2000) return 10;
  if (span <= 50000) return 100;
  if (span <= 500000) return 1000;
  return 5000;
}

/* ícone "i" de ajuda, reaproveitável (usa o tooltip rápido via data-tip) */
function infoIcon(text) {
  if (!text) return null;
  const s = el("span", "info", "i");
  s.tabIndex = 0;
  s.setAttribute("role", "note");
  s.setAttribute("aria-label", text);
  s.dataset.tip = text;
  // Evita que o clique no ícone acione o botão pai quando ele estiver dentro de um.
  s.addEventListener("click", (e) => e.stopPropagation());
  return s;
}

/* tooltip customizado: aparece rápido e não é cortado por containers com overflow.
   Qualquer elemento com [data-tip] dispara (hover ou foco). */
function initTooltips() {
  const tip = el("div", "tooltip");
  tip.setAttribute("role", "tooltip");
  document.body.appendChild(tip);
  let showTimer = null, current = null;

  const place = (target) => {
    const r = target.getBoundingClientRect();
    const tw = tip.offsetWidth, th = tip.offsetHeight, gap = 10, pad = 8;
    let top = r.top - th - gap, below = false;
    if (top < pad) { top = r.bottom + gap; below = true; }
    let left = r.left + r.width / 2 - tw / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tw - pad));
    tip.style.top = Math.round(top) + "px";
    tip.style.left = Math.round(left) + "px";
    let arrow = r.left + r.width / 2 - left;
    arrow = Math.max(12, Math.min(arrow, tw - 12));
    tip.style.setProperty("--arrow-left", arrow + "px");
    tip.classList.toggle("below", below);
  };
  const show = (target) => {
    const text = target.getAttribute("data-tip");
    if (!text) return;
    current = target;
    tip.textContent = text;
    place(target);
    tip.classList.add("show");
  };
  const hide = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    current = null;
    tip.classList.remove("show");
  };

  document.addEventListener("mouseover", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t || t === current) return;
    if (showTimer) clearTimeout(showTimer);
    showTimer = setTimeout(() => show(t), 90);
  });
  document.addEventListener("mouseout", (e) => {
    const t = e.target.closest("[data-tip]");
    if (!t) return;
    const to = e.relatedTarget && e.relatedTarget.closest ? e.relatedTarget.closest("[data-tip]") : null;
    if (to !== t) hide();
  });
  document.addEventListener("focusin", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (t) show(t);
  });
  document.addEventListener("focusout", hide);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
}

/* ============================================================ boot */
fetch("data.json")
  .then((r) => {
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  })
  .then((d) => { DATA = d; init(); })
  .catch((err) => {
    $("#loading").textContent =
      "Erro ao carregar data.json: " + err.message +
      ". Sirva a pasta por um servidor (ex.: python -m http.server).";
  });

function init() {
  const required = ["#lab-filters", "#eq-filters", "#lab-table", "#eq-table", "#lab-summary", "#eq-summary", "#lab-active", "#eq-active", "#lab-limpar", "#eq-limpar", "#loading", "#modal", "#modal-close", "#modal-content", "#meta-info", "#dist-filters", "#dist-groups", "#dist-budget", "#dist-active", "#dist-limpar", "#dist-sugerir", "#dist-desmarcar", "#dist-exportar", "#dist-aside", "#dist-layout"];
  const missing = required.filter((sel) => !$(sel));
  if (missing.length) {
    const ld = $("#loading");
    const msg = "Erro interno: elementos da página não encontrados: " + missing.join(", ") + ". Verifique se index.html está completo.";
    if (ld) { ld.textContent = msg; ld.removeAttribute("hidden"); }
    else console.error(msg);
    return;
  }

  try {
    DATA.labs.forEach((l) => {
    labsById[l.id] = l;
    equipPorLab[l.id] = { existentes: [], novos: [] };
  });
  DATA.equipExistentes.forEach((e) => {
    (equipPorLab[e.labId] || (equipPorLab[e.labId] = { existentes: [], novos: [] })).existentes.push(e);
  });
  DATA.equipNovos.forEach((e) => {
    (equipPorLab[e.labId] || (equipPorLab[e.labId] = { existentes: [], novos: [] })).novos.push(e);
  });

  const m = DATA.meta;
  $("#meta-info").innerHTML =
    `${fmtNum(m.totais.labs)} laboratórios · ${fmtNum(m.totais.equipExistentes + m.totais.equipNovos)} equipamentos`;

  const B = computeBounds();
  buildLabSidebar(m, B);
  buildEquipSidebar(m, B);
  buildDistData();
  buildDistSidebar(m);

  wireTabs();
  wireLabSort();
  buildEquipThead();
  wireEquipSort();
  wireModal();
  wireFiltersToggle();
  initTooltips();
  $("#lab-limpar").addEventListener("click", () => {
    labControls.forEach((c) => c.reset());
    renderLabs();
  });
  $("#eq-limpar").addEventListener("click", () => {
    [...eqLabControls, ...eqItemControls].forEach((c) => c.reset());
    renderEquip();
  });
  $("#dist-limpar").addEventListener("click", () => {
    distControls.forEach((c) => c.reset());
    renderDist();
  });
  $("#dist-sugerir").addEventListener("click", () => {
    if (!confirm("Substituir a seleção atual pela proposta oficial?")) return;
    distSel = distProposta();
    saveDistSel();
    renderDist();
  });
  $("#dist-desmarcar").addEventListener("click", () => {
    if (distSel.size && !confirm("Desmarcar todos os itens selecionados?")) return;
    distSel.clear();
    saveDistSel();
    renderDist();
  });
  $("#dist-exportar").addEventListener("click", exportDistCsv);

  $("#loading").setAttribute("hidden", "");
  $("#loading").removeAttribute("aria-busy");
  renderLabs();
  renderEquip();
  renderDist();
  } catch (err) {
    const ld = $("#loading");
    const msg = "Erro ao inicializar o dashboard: " + err.message + ". Verifique o console para detalhes.";
    if (ld) { ld.textContent = msg; ld.removeAttribute("hidden"); }
    else console.error(msg);
    console.error(err);
  }
}

/* limites [min,max] de cada campo numérico, calculados dos dados reais */
function computeBounds() {
  const maxOf = (arr, f) => arr.reduce((mx, x) => {
    const v = f(x);
    return Number.isFinite(v) && v > mx ? v : mx;
  }, 0);
  const labs = DATA.labs;
  const eqAll = [...DATA.equipExistentes, ...DATA.equipNovos];
  return {
    discentes: [0, maxOf(labs, (l) => l.discentes)],
    capacidade: [0, maxOf(labs, (l) => l.capacidade)],
    cprop: [0, maxOf(labs, (l) => l.qtdCursosProprios)],
    cext: [0, maxOf(labs, (l) => l.qtdCursosExternos)],
    docentes: [0, maxOf(labs, (l) => l.docentes)],
    taes: [0, maxOf(labs, (l) => l.taes)],
    bolsistas: [0, maxOf(labs, (l) => l.bolsistas)],
    terceirizados: [0, maxOf(labs, (l) => l.terceirizados)],
    valor: [0, maxOf(eqAll, (e) => e.valor)],
    prioridade: [0, 10],
    qtd: [0, maxOf(eqAll, (e) => Math.max(e.qtdAdquirir || 0, e.qtdNecessaria || 0))],
  };
}

/* ============================================================ fábrica de controles
   Cada controle retorna { key, node, read(), reset(), chips() }.
   chips() devolve [{label, clear}] descrevendo o estado ativo (para a barra). */

function searchControl({ key, label, placeholder, help, onChange }) {
  const field = el("div", "field");
  const lbl = el("label", null, esc(label));
  lbl.htmlFor = key;
  const info = infoIcon(help); if (info) lbl.appendChild(info);
  const wrap = el("div", "input-icon");
  wrap.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 21l-4.3-4.3M11 19a8 8 0 110-16 8 8 0 010 16z"/></svg>`;
  const inp = el("input");
  inp.type = "search"; inp.id = key; inp.placeholder = placeholder || "";
  const debouncedChange = debounce(onChange, 120);
  inp.addEventListener("input", debouncedChange);
  wrap.appendChild(inp);
  field.appendChild(lbl); field.appendChild(wrap);
  return {
    key, node: field,
    read: () => inp.value.trim(),
    reset: () => { inp.value = ""; },
    chips() {
      const v = inp.value.trim();
      return v ? [{ label: `${label}: "${v}"`, clear: () => { inp.value = ""; } }] : [];
    },
  };
}

function switchControl({ key, label, help, onChange }) {
  const wrap = el("label", "switch");
  const inp = el("input"); inp.type = "checkbox"; inp.id = key;
  const track = el("span", "track"); track.setAttribute("aria-hidden", "true");
  const lbl = el("span", "switch-label");
  lbl.appendChild(document.createTextNode(label));
  const info = infoIcon(help); if (info) lbl.appendChild(info);
  inp.addEventListener("change", onChange);
  wrap.append(inp, track, lbl);
  return {
    key, node: wrap,
    read: () => inp.checked,
    reset: () => { inp.checked = false; },
    chips() { return inp.checked ? [{ label, clear: () => { inp.checked = false; } }] : []; },
  };
}

function chipsControl({ key, label, values, help, onChange }) {
  const field = el("fieldset", "field");
  const legend = el("legend");
  legend.appendChild(document.createTextNode(label));
  const info = infoIcon(help); if (info) legend.appendChild(info);
  const box = el("div", "chips");
  box.setAttribute("role", "group");
  box.setAttribute("aria-label", label);
  const boxes = [];
  values.forEach((v) => {
    const chip = el("label", "chip");
    const cb = el("input"); cb.type = "checkbox"; cb.value = v;
    cb.addEventListener("change", () => { chip.classList.toggle("on", cb.checked); onChange(); });
    chip.appendChild(cb);
    chip.appendChild(document.createTextNode(v));
    box.appendChild(chip);
    boxes.push(cb);
  });
  field.append(legend, box);
  const off = (cb) => { cb.checked = false; cb.parentElement.classList.remove("on"); };
  return {
    key, node: field,
    read: () => boxes.filter((b) => b.checked).map((b) => b.value),
    reset: () => boxes.forEach(off),
    chips() {
      return boxes.filter((b) => b.checked).map((b) => ({
        label: `${label}: ${b.value}`,
        clear: () => off(b),
      }));
    },
  };
}

function selectControl({ key, label, values, allLabel, help, onChange }) {
  const field = el("div", "field");
  const lbl = el("label", null, esc(label));
  lbl.htmlFor = key;
  const info = infoIcon(help); if (info) lbl.appendChild(info);
  const sel = el("select"); sel.id = key;
  const o0 = el("option", null, esc(allLabel || "Todos")); o0.value = "";
  sel.appendChild(o0);
  values.forEach((v) => { const o = el("option", null, esc(v)); o.value = v; sel.appendChild(o); });
  sel.addEventListener("change", onChange);
  field.append(lbl, sel);
  return {
    key, node: field,
    read: () => sel.value,
    reset: () => { sel.value = ""; },
    chips() { return sel.value ? [{ label: `${label}: ${sel.value}`, clear: () => { sel.value = ""; } }] : []; },
  };
}

/* slider duplo + dois campos numéricos sincronizados */
function rangeControl({ key, label, bounds, fmt, help, onChange }) {
  const lo = bounds[0];
  let hi = bounds[1];
  if (hi <= lo) hi = lo + 1;
  const step = niceStep(hi - lo);
  const fmtv = (v) => (fmt === "brl" ? fmtBRL(v) : fmtNum(v));
  let minV = lo, maxV = hi;

  const wrap = el("div", "rc");
  const head = el("div", "rc-label");
  head.appendChild(document.createTextNode(label));
  const info = infoIcon(help); if (info) head.appendChild(info);

  const slider = el("div", "rc-slider");
  const rail = el("div", "rc-rail");
  const fill = el("div", "rc-fill");
  const rMin = el("input"); rMin.type = "range"; rMin.min = lo; rMin.max = hi; rMin.step = step; rMin.value = lo;
  rMin.setAttribute("aria-label", `${label} — mínimo`);
  const rMax = el("input"); rMax.type = "range"; rMax.min = lo; rMax.max = hi; rMax.step = step; rMax.value = hi;
  rMax.setAttribute("aria-label", `${label} — máximo`);
  slider.append(rail, fill, rMin, rMax);

  const fields = el("div", "rc-fields");
  const nMin = el("input"); nMin.type = "text"; nMin.inputMode = "numeric"; nMin.className = "rc-num";
  nMin.setAttribute("aria-label", `${label} — mínimo`);
  const dash = el("span", "rc-dash", "–");
  const nMax = el("input"); nMax.type = "text"; nMax.inputMode = "numeric"; nMax.className = "rc-num";
  nMax.setAttribute("aria-label", `${label} — máximo`);
  fields.append(nMin, dash, nMax);

  wrap.append(head, slider, fields);

  const pct = (v) => ((v - lo) / (hi - lo)) * 100;
  const paint = () => {
    fill.style.left = pct(minV) + "%";
    fill.style.width = (pct(maxV) - pct(minV)) + "%";
    rMin.value = minV; rMax.value = maxV;
    // garante que o thumb mínimo continue acessível quando os dois se aproximam do topo
    rMin.style.zIndex = pct(minV) > 60 ? 5 : 3;
    rMax.style.zIndex = 4;
  };
  const setTexts = () => {
    nMin.value = minV > lo ? fmtv(minV) : "";
    nMax.value = maxV < hi ? fmtv(maxV) : "";
    nMin.placeholder = fmtv(lo);
    nMax.placeholder = fmtv(hi);
  };
  const refresh = () => { paint(); setTexts(); };

  rMin.addEventListener("input", () => {
    let v = +rMin.value; if (v > maxV) v = maxV; minV = v;
    paint(); nMin.value = minV > lo ? fmtv(minV) : ""; onChange();
  });
  rMax.addEventListener("input", () => {
    let v = +rMax.value; if (v < minV) v = minV; maxV = v;
    paint(); nMax.value = maxV < hi ? fmtv(maxV) : ""; onChange();
  });
  rMin.addEventListener("pointerdown", () => { rMin.style.zIndex = 5; rMax.style.zIndex = 4; });
  rMax.addEventListener("pointerdown", () => { rMax.style.zIndex = 5; rMin.style.zIndex = 3; });

  nMin.addEventListener("input", () => {
    const v = parseNum(nMin.value);
    minV = v === null ? lo : Math.max(lo, Math.min(v, maxV));
    paint(); onChange();
  });
  nMax.addEventListener("input", () => {
    const v = parseNum(nMax.value);
    maxV = v === null ? hi : Math.min(hi, Math.max(v, minV));
    paint(); onChange();
  });
  nMin.addEventListener("blur", setTexts);   // reformata com separador de milhar ao sair
  nMax.addEventListener("blur", setTexts);

  refresh();

  return {
    key, node: wrap,
    read: () => ({ min: minV > lo ? minV : null, max: maxV < hi ? maxV : null }),
    reset: () => { minV = lo; maxV = hi; refresh(); },
    chips() {
      const a = minV > lo, b = maxV < hi;
      if (!a && !b) return [];
      let txt;
      if (a && b) txt = `${fmtv(minV)} – ${fmtv(maxV)}`;
      else if (a) txt = `≥ ${fmtv(minV)}`;
      else txt = `≤ ${fmtv(maxV)}`;
      return [{ label: `${label}: ${txt}`, clear: () => { minV = lo; maxV = hi; refresh(); } }];
    },
  };
}

/* lê todos os controles de uma lista num objeto { key: valor } */
function readControls(list) {
  const o = {};
  list.forEach((c) => { o[c.key] = c.read(); });
  return o;
}

/* monta os grupos de filtros num container */
function buildGroups(host, groups, store) {
  groups.forEach(([title, ctrls]) => {
    const g = el("div", "filter-group");
    g.appendChild(el("h3", null, esc(title)));
    ctrls.forEach((c) => { g.appendChild(c.node); store.push(c); });
    host.appendChild(g);
  });
}

/* ---------------------------------------------------- sidebar Laboratórios */
function buildLabSidebar(m, B) {
  const host = $("#lab-filters");
  labControls = [];
  buildGroups(host, [
    ["Busca", [
      searchControl({ key: "labBusca", label: "Nome do laboratório", placeholder: "buscar laboratório…", onChange: renderLabs }),
    ]],
    ["Localização", [
      chipsControl({ key: "labLoc", label: "Localidade / Campus", values: m.localidades, onChange: renderLabs }),
      chipsControl({ key: "labArea", label: "Grande Área", values: m.areas, onChange: renderLabs }),
      selectControl({ key: "labUni", label: "Unidade acadêmica", values: m.unidades, allLabel: "Todas as unidades", onChange: renderLabs }),
    ]],
    ["Quem atende", [
      switchControl({ key: "labLic", label: "Atende curso de licenciatura", help: "Laboratórios cujos cursos atendidos (próprios ou externos) incluem ao menos um curso de licenciatura.", onChange: renderLabs }),
      rangeControl({ key: "discentes", label: "Alunos atendidos / semestre", bounds: B.discentes, fmt: "int", help: "Número de alunos atendidos pelo laboratório em um semestre.", onChange: renderLabs }),
      rangeControl({ key: "capacidade", label: "Capacidade da turma", bounds: B.capacidade, fmt: "int", help: "Quantidade máxima de alunos que cabem em uma turma prática.", onChange: renderLabs }),
      rangeControl({ key: "cprop", label: "Cursos da própria unidade", bounds: B.cprop, fmt: "int", help: "Cursos da própria unidade acadêmica atendidos pelo laboratório.", onChange: renderLabs }),
      rangeControl({ key: "cext", label: "Cursos de outras unidades", bounds: B.cext, fmt: "int", help: "Cursos de outras unidades atendidos pelo laboratório.", onChange: renderLabs }),
    ]],
    ["Recursos humanos", [
      rangeControl({ key: "docentes", label: "Docentes vinculados", bounds: B.docentes, fmt: "int", onChange: renderLabs }),
      rangeControl({ key: "taes", label: "TAEs", bounds: B.taes, fmt: "int", help: "Técnicos-administrativos em educação vinculados.", onChange: renderLabs }),
      rangeControl({ key: "bolsistas", label: "Bolsistas", bounds: B.bolsistas, fmt: "int", onChange: renderLabs }),
      rangeControl({ key: "terceirizados", label: "Terceirizados", bounds: B.terceirizados, fmt: "int", onChange: renderLabs }),
    ]],
  ], labControls);
}

/* ---------------------------------------------------- sidebar Equipamentos */
function buildEquipSidebar(m, B) {
  const host = $("#eq-filters");
  eqLabControls = [];
  eqItemControls = [];

  // Grupo 1 (Busca) e Grupo 4 (Critérios do equipamento) -> critérios do ITEM
  const busca = searchControl({ key: "eqBusca", label: "Nome do equipamento", placeholder: "nome do equipamento…", onChange: renderEquip });

  // Grupos 2 e 3 -> critérios do LABORATÓRIO (mesma ordem da aba Laboratórios)
  const loc = chipsControl({ key: "eqLoc", label: "Localidade / Campus", values: m.localidades, onChange: renderEquip });
  const area = chipsControl({ key: "eqArea", label: "Grande Área", values: m.areas, onChange: renderEquip });
  const uni = selectControl({ key: "eqUni", label: "Unidade acadêmica", values: m.unidades, allLabel: "Todas as unidades", onChange: renderEquip });
  const lic = switchControl({ key: "eqLic", label: "Atende curso de licenciatura", onChange: renderEquip });
  const disc = rangeControl({ key: "eqDisc", label: "Alunos atendidos / semestre", bounds: B.discentes, fmt: "int", help: "Número de alunos atendidos pelo laboratório em um semestre.", onChange: renderEquip });

  const valor = rangeControl({ key: "eqValor", label: "Custo total (R$)", bounds: B.valor, fmt: "brl", help: "Custo total que o laboratório estimou, no levantamento de 2024, para adquirir a quantidade que pediu deste equipamento (não é por unidade).", onChange: renderEquip });
  const prio = rangeControl({ key: "eqPrio", label: "Prioridade (0–10)", bounds: B.prioridade, fmt: "int", help: "Prioridade atribuída pelo laboratório para o ensino de graduação (0 a 10).", onChange: renderEquip });
  const qtd = rangeControl({ key: "eqQtd", label: "Quantidade", bounds: B.qtd, fmt: "int", help: "Quantidade a adquirir (existentes) ou necessária (novos).", onChange: renderEquip });
  const comDesc = switchControl({ key: "eqComDesc", label: "Apenas com descrição preenchida", onChange: renderEquip });
  const comComent = switchControl({ key: "eqComComent", label: "Apenas com comentário preenchido", onChange: renderEquip });

  eqLabControls = [loc, area, uni, lic, disc];
  eqItemControls = [busca, valor, prio, qtd, comDesc, comComent];

  // ordem visual (alinhada com a aba Laboratórios no topo)
  buildGroups(host, [
    ["Busca", [busca]],
    ["Localização", [loc, area, uni]],
    ["Quem atende", [lic, disc]],
    ["Critérios do equipamento", [valor, prio, qtd, comDesc, comComent]],
  ], []);
}

/* ============================================================ barra de filtros ativos */
function renderActiveBar(containerSel, controls, rerender) {
  const box = $(containerSel);
  box.innerHTML = "";
  const chips = [];
  controls.forEach((c) => (c.chips() || []).forEach((ch) => chips.push(ch)));
  if (!chips.length) { box.hidden = true; return; }
  box.hidden = false;

  box.appendChild(el("span", "af-label", "Filtros ativos"));
  chips.forEach((ch) => {
    const b = el("button", "af-chip");
    b.type = "button";
    b.innerHTML = `${esc(ch.label)} <span class="x" aria-hidden="true">×</span>`;
    b.setAttribute("aria-label", `Remover filtro ${ch.label}`);
    b.addEventListener("click", () => { ch.clear(); rerender(); });
    box.appendChild(b);
  });
  const clr = el("button", "af-clear-all", "Limpar todos");
  clr.type = "button";
  clr.addEventListener("click", () => { controls.forEach((c) => c.reset()); rerender(); });
  box.appendChild(clr);
}

/* atualiza aria-sort no cabeçalho ativo */
function applySortIndicator(thead, key, dir) {
  thead.querySelectorAll("th").forEach((th) => {
    if (th.dataset.sort === key)
      th.setAttribute("aria-sort", dir === 1 ? "ascending" : "descending");
    else th.setAttribute("aria-sort", "none");
  });
}

/* ============================================================ matchers */
function matchLab(l, C) {
  if (C.labBusca && !l.nome.toLowerCase().includes(C.labBusca.toLowerCase())) return false;
  if (C.labLoc.length && !C.labLoc.includes(l.localidade)) return false;
  if (C.labArea.length && !C.labArea.includes(l.area)) return false;
  if (C.labUni && l.unidade !== C.labUni) return false;
  if (C.labLic && !l.atendeLicenciatura) return false;
  if (!inRange(l.discentes, C.discentes.min, C.discentes.max)) return false;
  if (!inRange(l.capacidade, C.capacidade.min, C.capacidade.max)) return false;
  if (!inRange(l.qtdCursosProprios, C.cprop.min, C.cprop.max)) return false;
  if (!inRange(l.qtdCursosExternos, C.cext.min, C.cext.max)) return false;
  if (!inRange(l.docentes, C.docentes.min, C.docentes.max)) return false;
  if (!inRange(l.taes, C.taes.min, C.taes.max)) return false;
  if (!inRange(l.bolsistas, C.bolsistas.min, C.bolsistas.max)) return false;
  if (!inRange(l.terceirizados, C.terceirizados.min, C.terceirizados.max)) return false;
  return true;
}

function matchEqLab(l, C) {
  if (C.eqLoc.length && !C.eqLoc.includes(l.localidade)) return false;
  if (C.eqArea.length && !C.eqArea.includes(l.area)) return false;
  if (C.eqUni && l.unidade !== C.eqUni) return false;
  if (C.eqLic && !l.atendeLicenciatura) return false;
  if (!inRange(l.discentes, C.eqDisc.min, C.eqDisc.max)) return false;
  return true;
}

/* ============================================================ aba Laboratórios */
function nEquip(labId) {
  const e = equipPorLab[labId];
  return e ? e.existentes.length + e.novos.length : 0;
}

function renderLabs() {
  const C = readControls(labControls);
  const labs = DATA.labs.filter((l) => matchLab(l, C));
  labs.forEach((l) => { l._nEquip = nEquip(l.id); });

  const k = labSort.key;
  labs.sort((a, b) => {
    const av = k === "nEquip" ? a._nEquip : a[k];
    const bv = k === "nEquip" ? b._nEquip : b[k];
    return cmp(av, bv) * labSort.dir;
  });

  $("#lab-summary").innerHTML =
    `<strong>${fmtNum(labs.length)}</strong> de ${fmtNum(DATA.labs.length)} laboratórios`;
  renderActiveBar("#lab-active", labControls, renderLabs);
  applySortIndicator($("#lab-table thead"), labSort.key, labSort.dir);

  const tb = $("#lab-table tbody");
  tb.innerHTML = "";
  if (!labs.length) {
    tb.appendChild(el("tr", "empty-row", `<td colspan="${LAB_COLS.length}">Nenhum laboratório atende aos filtros selecionados.</td>`));
    return;
  }
  const frag = document.createDocumentFragment();
  labs.forEach((l) => {
    const tr = el("tr", "clickable");
    tr.tabIndex = 0;
    tr.setAttribute("role", "button");
    tr.setAttribute("aria-label", "Ver equipamentos de " + l.nome);
    tr.innerHTML =
      `<td><span class="lab-name">${esc(l.nome)}</span>${l.atendeLicenciatura ? ' <span class="badge lic">licenciatura</span>' : ""}</td>` +
      `<td>${esc(l.unidade)}</td><td>${esc(l.area)}</td><td>${esc(l.localidade)}</td>` +
      `<td class="num">${fmtNum(l.qtdCursosProprios)}</td><td class="num">${fmtNum(l.qtdCursosExternos)}</td>` +
      `<td class="num">${fmtNum(l.discentes)}</td>` +
      `<td class="num">${fmtNum(l.capacidade)}</td>` +
      `<td class="num">${fmtNum(l._nEquip)}</td>`;
    tr.addEventListener("click", () => openLab(l.id, tr));
    tr.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openLab(l.id, tr); }
    });
    frag.appendChild(tr);
  });
  tb.appendChild(frag);
  const wrap = document.querySelector("#lab-table")?.closest(".table-wrap");
  if (wrap) { wireScrollHints(wrap); updateScrollHints(wrap); }
}

function wireLabSort() {
  document.querySelectorAll("#lab-table thead th").forEach((th) => {
    th.addEventListener("click", () => {
      const kkey = th.dataset.sort;
      if (labSort.key === kkey) labSort.dir *= -1;
      else { labSort.key = kkey; labSort.dir = ["nome", "unidade", "area", "localidade"].includes(kkey) ? 1 : -1; }
      renderLabs();
    });
  });
}

/* ============================================================ aba Equipamentos */
function buildEquipThead() {
  const thead = $("#eq-table thead");
  thead.innerHTML = "";
  const htr = el("tr");
  EQ_COLS.forEach(([key, label, cls, tip]) => {
    const th = el("th", cls);
    th.dataset.sort = key;
    if (key === "qtd") eqThQtd = th;
    th.innerHTML = esc(label);
    if (tip) {
      const info = infoIcon(tip);
      info.classList.add("pulse");
      info.addEventListener("click", (e) => e.stopPropagation());
      th.appendChild(document.createTextNode(" "));
      th.appendChild(info);
    } else {
      th.dataset.tip = `${label} · clique para ordenar`;
    }
    th.insertAdjacentHTML("beforeend", ' <span class="arrow" aria-hidden="true"></span>');
    htr.appendChild(th);
  });
  thead.appendChild(htr);
}

function wireEquipSort() {
  const thead = $("#eq-table thead");
  thead.addEventListener("click", (e) => {
    const th = e.target.closest("th[data-sort]");
    if (!th) return;
    const key = th.dataset.sort;
    if (eqSort.key === key) eqSort.dir *= -1;
    else { eqSort.key = key; eqSort.dir = ["lab", "nome", "unidade", "area", "localidade", "descricao", "comentarios"].includes(key) ? 1 : -1; }
    renderEquip();
  });
}

function renderEquip() {
  const Clab = readControls(eqLabControls);
  const Citem = readControls(eqItemControls);
  const labsOk = new Set(DATA.labs.filter((l) => matchEqLab(l, Clab)).map((l) => l.id));

  const isNovo = eqSubtab === "novos";
  const fonte = isNovo ? DATA.equipNovos : DATA.equipExistentes;
  const qtdField = isNovo ? "qtdNecessaria" : "qtdAdquirir";
  const buscaLow = Citem.eqBusca.toLowerCase();

  const rows = fonte.filter((e) => {
    if (!labsOk.has(e.labId)) return false;
    if (buscaLow && !e.nome.toLowerCase().includes(buscaLow)) return false;
    if (!inRange(e.valor, Citem.eqValor.min, Citem.eqValor.max)) return false;
    if (!inRange(e.prioridade, Citem.eqPrio.min, Citem.eqPrio.max)) return false;
    if (!inRange(e[qtdField], Citem.eqQtd.min, Citem.eqQtd.max)) return false;
    if (Citem.eqComDesc && !e.temDescricao) return false;
    if (Citem.eqComComent && !e.temComentario) return false;
    return true;
  });

  // `valor` é o valor estimado TOTAL da linha (planilha). O unitário é derivado.
  rows.forEach((e) => { const q = e[qtdField] || 0; e._unit = q ? (e.valor || 0) / q : 0; });

  const k = eqSort.key;
  rows.sort((a, b) => {
    let av, bv;
    if (k === "lab") { av = labsById[a.labId]?.nome; bv = labsById[b.labId]?.nome; }
    else if (k === "qtd") { av = a[qtdField]; bv = b[qtdField]; }
    else if (k === "unit") { av = a._unit; bv = b._unit; }
    else { av = a[k]; bv = b[k]; }
    return cmp(av, bv) * eqSort.dir;
  });

  const totValor = rows.reduce((s, e) => s + (e.valor || 0), 0);
  const nLabs = new Set(rows.map((e) => e.labId)).size;

  $("#eq-summary").innerHTML =
    `<strong>${fmtNum(rows.length)}</strong> equipamento${rows.length !== 1 ? "s" : ""} · ` +
    `<strong>${fmtNum(nLabs)}</strong> laboratório${nLabs !== 1 ? "s" : ""} · ` +
    `custo total <span class="accent">${fmtBRL(totValor)}</span>`;

  renderActiveBar("#eq-active", [...eqLabControls, ...eqItemControls], renderEquip);

  const qtdLabel = isNovo ? "Qtd. necessária" : "Qtd. a adquirir";
  if (eqThQtd) {
    eqThQtd.childNodes[0].textContent = qtdLabel;
    eqThQtd.dataset.tip = `${qtdLabel} · clique para ordenar`;
  }
  const thead = $("#eq-table thead");
  applySortIndicator(thead, eqSort.key, eqSort.dir);

  const tb = $("#eq-table tbody");
  tb.innerHTML = "";
  if (!rows.length) {
    tb.appendChild(el("tr", "empty-row", `<td colspan="${EQ_COLS.length}">Nenhum equipamento atende aos filtros selecionados.</td>`));
    return;
  }
  const frag = document.createDocumentFragment();
  rows.forEach((e) => {
    const lab = labsById[e.labId] || {};
    const tr = el("tr");
    tr.innerHTML =
      `<td><a href="#" data-lab="${esc(e.labId)}">${esc(lab.nome || e.labId)}</a></td>` +
      `<td>${esc(lab.unidade || "")}</td><td>${esc(lab.area || "")}</td>` +
      `<td>${esc(lab.localidade || "")}</td>` +
      `<td>${esc(e.nome)}</td><td class="num">${fmtNum(e.prioridade)}</td>` +
      `<td class="num">${fmtNum(e[qtdField])}</td><td class="num">${fmtBRL(e.valor)}</td>` +
      `<td class="num unit-cell">${e._unit ? "≈ " + fmtBRL(e._unit) : '<span class="muted">—</span>'}</td>` +
      `<td class="cell-clip">${cellText(e.descricao)}</td><td class="cell-clip">${cellText(e.comentarios)}</td>`;
    tr.querySelector("a").addEventListener("click", (ev) => { ev.preventDefault(); openLab(e.labId, ev.currentTarget); });
    frag.appendChild(tr);
  });
  tb.appendChild(frag);
  const wrap = document.querySelector("#eq-table")?.closest(".table-wrap");
  if (wrap) { wireScrollHints(wrap); updateScrollHints(wrap); }
}

/* ============================================================ aba Distribuição
   Reparte DIST_VERBA entre as unidades acadêmicas: idealmente 1 equipamento novo
   por unidade, com qtdNecessaria = 1 e valor >= DIST_MIN. A seleção (Set de
   chaves) começa com uma sugestão automática e é persistida no localStorage. */

function distDoc(e) {
  return (e.temDescricao ? 1 : 0) + (e.temComentario ? 1 : 0);
}

/* nº de alunos/semestre VALIDADO contra a capacidade por turma. O levantamento
   tem inconsistências (labs com "0 alunos" apesar de capacidade, e números muito
   acima do que a sala comportaria por semestre), então, para fins de prioridade:
   - "0 alunos informados" continua 0 (não ganha prioridade);
   - um número implausivelmente alto é limitado a capacidade × DIST_FATOR_TURMAS
     (um teto de turmas/semestre), para que um dado inflado não fure a fila.
   O número exibido nas tabelas continua sendo o informado (bruto); este aqui só
   entra no ranqueamento. */
function discValid(l) {
  const d = l.discentes || 0, c = l.capacidade || 0;
  if (d === 0) return 0;
  return c > 0 ? Math.min(d, c * DIST_FATOR_TURMAS) : d;
}

/* verdito de consistência entre alunos/semestre e capacidade por turma.
   Devolve null quando está coerente, ou um aviso curto a exibir/checar. */
function consistenciaDiscentes(l) {
  const d = l.discentes || 0, c = l.capacidade || 0;
  if (d === 0 && c > 0) {
    return `Informa 0 alunos/semestre apesar de ter capacidade para ${fmtNum(c)} por turma — número provavelmente não preenchido.`;
  }
  if (c > 0 && d > c * DIST_FATOR_TURMAS) {
    return `Os ${fmtNum(d)} alunos/semestre equivalem a ${Math.round(d / c)} turmas cheias (capacidade ${fmtNum(c)}/turma), bem acima do plausível — confira se o número está correto.`;
  }
  return null;
}

/* critérios de prioridade entre laboratórios de uma mesma unidade, nesta ordem:
   1º atende licenciatura; 2º mais alunos/semestre (validado); 3º mais cursos
   atendidos; 4º mais cursos de outras unidades. Devolve > 0 se "a" > "b". */
function cmpPrioLab(a, b) {
  const cursos = (l) => (l.qtdCursosProprios || 0) + (l.qtdCursosExternos || 0);
  return (
    (a.atendeLicenciatura ? 1 : 0) - (b.atendeLicenciatura ? 1 : 0) ||
    discValid(a) - discValid(b) ||
    cursos(a) - cursos(b) ||
    (a.qtdCursosExternos || 0) - (b.qtdCursosExternos || 0)
  );
}

function buildDistData() {
  // candidatos: equipamentos novos E existentes (a quantidade pedida vem de
  // campos diferentes). Chave estável por item, com sufixo p/ raras duplicatas.
  const vistos = new Map();
  const anota = (arr, tipo, qtdField) => arr.map((e) => {
    const qtd = e[qtdField] || 0;
    let key = `${e.labId}|${tipo}|${e.nome}|${e.valor}`;
    const n = (vistos.get(key) || 0) + 1;
    vistos.set(key, n);
    if (n > 1) key += `#${n}`;
    const lab = labsById[e.labId];
    return {
      e, lab, key, tipo, qtd,
      elegivel: !!lab && qtd === 1 && (e.valor || 0) >= DIST_MIN,
      vetado: !!DIST_VETADOS[key],
    };
  });
  distItems = [
    ...anota(DATA.equipNovos, "novo", "qtdNecessaria"),
    ...anota(DATA.equipExistentes, "existente", "qtdAdquirir"),
  ].filter((it) => it.lab); // ignora equipamentos órfãos (sem lab cadastrado)

  // itens vetados NÃO entram na seleção automática (distSuggest) nem na
  // redistribuição, mas continuam visíveis na aba "Ajustar seleção".
  distItems.forEach((it) => { if (it.vetado) it.elegivel = false; });

  distPorUnidade = new Map();
  distItems.forEach((it) => {
    const u = it.lab.unidade;
    if (!distPorUnidade.has(u)) distPorUnidade.set(u, []);
    distPorUnidade.get(u).push(it);
  });

  // lab prioritário de cada unidade (entre os labs com algum item elegível)
  distPrioLab = new Map();
  distPorUnidade.forEach((items, u) => {
    const labsEleg = new Map();
    items.forEach((it) => { if (it.elegivel) labsEleg.set(it.lab.id, it.lab); });
    if (!labsEleg.size) return;
    const top = [...labsEleg.values()].sort((a, b) => cmpPrioLab(b, a))[0];
    distPrioLab.set(u, top.id);
  });

  // restaura a seleção salva; sem nada salvo, parte da proposta oficial
  let salvo = null;
  try { salvo = JSON.parse(localStorage.getItem(DIST_LS)); } catch (err) { /* sem storage */ }
  if (Array.isArray(salvo)) {
    const validas = new Set(distItems.map((it) => it.key));
    distSel = new Set(salvo.filter((k) => validas.has(k)));
  } else {
    distSel = distProposta();
    saveDistSel();
  }
}

/* proposta oficial = seleção por critérios (distSuggest) com ajustes humanos
   e redistribuição da sobra:
   1. distSuggest() → base por critérios
   2. exclui unidades de DIST_MOTIVOS_ESPECIAIS
   3. aplica overrides de DIST_MANUAIS
   4. distRedistribuicao() → redistribui a sobra para unidades subatendidas */
function distProposta() {
  const validas = new Set(distItems.map((it) => it.key));
  const keyUnit = new Map(distItems.map((it) => [it.key, it.lab.unidade]));
  const sel = distSuggest();
  // exclusões por decisão registrada
  [...sel].forEach((k) => { if (DIST_MOTIVOS_ESPECIAIS[keyUnit.get(k)]) sel.delete(k); });
  // overrides manuais: troca a escolha automática da unidade pelo item curado
  Object.entries(DIST_MANUAIS).forEach(([uni, ov]) => {
    [...sel].forEach((k) => { if (keyUnit.get(k) === uni) sel.delete(k); });
    if (validas.has(ov.key)) sel.add(ov.key);
  });
  // redistribuição da sobra para unidades subatendidas
  distRedistribuicao(sel);
  return sel;
}

/* Redistribuição da sobra: 4 equipamentos essenciais escolhidos manualmente
   para unidades subatendidas, com base no impacto pedagógico (não apenas valor).
   Cada item tem um motivo registrado em DIST_REDIST_OVERRIDES.
   Para itens com `swap`, o item original da unidade é removido e substituído.
   Para itens sem `swap`, é adicionado como 2º item da unidade. */
function distRedistribuicao(sel) {
  distRedist = new Set(); // limpa rastreamento de itens da redistribuição
  const itemByKey = new Map(distItems.map((it) => [it.key, it]));
  for (const ov of DIST_REDIST_OVERRIDES) {
    const it = itemByKey.get(ov.key);
    if (!it) continue; // item não encontrado nos dados — ignora
    if (ov.swap) {
      // troca: remove o item original da unidade e adiciona o novo
      sel.delete(ov.swap);
    }
    sel.add(ov.key);
    distRedist.add(ov.key); // marca como item da redistribuição
  }
}

function saveDistSel() {
  try { localStorage.setItem(DIST_LS, JSON.stringify([...distSel])); } catch (err) { /* sem storage */ }
}

/* seleção pelos critérios da distribuição (base da proposta oficial):
   em cada unidade, escolhe o laboratório prioritário (cmpPrioLab) que tenha
   item elegível dentro do teto e, nele, o item de MAIOR valor dentro do teto
   (desempate pela melhor documentação). Concentrar a verba no equipamento de
   maior porte que o laboratório pediu aproxima o gasto dos R$ 1,2 milhão e usa
   o teto mais alto. Itens acima do teto ficam para decisão manual. */
function distSuggest() {
  const sel = new Set();
  distPorUnidade.forEach((items) => {
    const porLab = new Map();
    items.forEach((it) => {
      if (!it.elegivel) return;
      if (!porLab.has(it.lab.id)) porLab.set(it.lab.id, []);
      porLab.get(it.lab.id).push(it);
    });
    if (!porLab.size) return;
    const ranking = [...porLab.keys()].sort((a, b) => cmpPrioLab(labsById[b], labsById[a]));
    const alvo = ranking.find((id) => porLab.get(id).some((it) => it.e.valor <= DIST_TETO));
    if (!alvo) return;
    const ops = porLab.get(alvo).filter((it) => it.e.valor <= DIST_TETO);
    ops.sort((a, b) => b.e.valor - a.e.valor || distDoc(b.e) - distDoc(a.e));
    sel.add(ops[0].key);
  });
  return sel;
}

/* ---------------------------------------------------- sidebar Distribuição */
function buildDistSidebar(m) {
  const host = $("#dist-filters");
  distControls = [];
  buildGroups(host, [
    ["Busca", [
      searchControl({ key: "distBusca", label: "Nome do equipamento", placeholder: "nome do equipamento…", onChange: renderDist }),
    ]],
    ["Exibição", [
      selectControl({ key: "distUni", label: "Unidade acadêmica", values: m.unidades, allLabel: "Todas as unidades", onChange: renderDist }),
      selectControl({ key: "distTipo", label: "Tipo de equipamento", values: ["Novos", "Existentes"], allLabel: "Novos e existentes", help: "Novos: equipamentos que o laboratório ainda não possui. Existentes: equipamentos que o laboratório já tem e dos quais pede mais unidades.", onChange: renderDist }),
      switchControl({ key: "distSoSel", label: "Apenas itens selecionados", onChange: renderDist }),
      switchControl({ key: "distFora", label: "Mostrar itens fora dos critérios", help: "Exibe também os itens que não atendem aos critérios (quantidade ≠ 1 ou custo total abaixo de R$ 20 mil). Em unidades sem nenhum item elegível eles aparecem sempre, como alternativa.", onChange: renderDist }),
      switchControl({ key: "distSoDoc", label: "Apenas com descrição preenchida", onChange: renderDist }),
    ]],
  ], distControls);
}

/* ---------------------------------------------------- render */
function distStatusUnidade(u) {
  const items = distPorUnidade.get(u) || [];
  const sel = items.filter((it) => distSel.has(it.key));
  const tot = sel.reduce((s, it) => s + (it.e.valor || 0), 0);
  if (sel.length) return { cls: "ok", txt: `${sel.length} item${sel.length > 1 ? "s" : ""} selecionado${sel.length > 1 ? "s" : ""}`, tot };
  if (!items.length) return { cls: "off", txt: "nenhum equipamento solicitado", tot: 0 };
  if (items.some((it) => it.elegivel)) return { cls: "warn", txt: "sem seleção", tot: 0 };
  return { cls: "warn", txt: "sem item elegível — alternativas abaixo", tot: 0 };
}

function atualizaDistHead(u) {
  const h = distHeads[u];
  if (!h) return;
  const st = distStatusUnidade(u);
  h.badge.className = "badge " + st.cls;
  h.badge.textContent = st.txt;
  h.total.textContent = st.tot ? fmtBRL(st.tot) : "";
}

/* divide a lista de cursos do lab (a planilha mistura "|" e "," como separador) */
function distParseCursos(s) {
  return String(s || "").split(/[|,;]/).map((c) => c.trim().replace(/\s+/g, " ")).filter(Boolean);
}

/* métricas da seleção atual: labs distintos, cursos distintos, atendimentos */
function distImpacto() {
  const sel = distItems.filter((it) => distSel.has(it.key));
  const total = sel.reduce((s, it) => s + (it.e.valor || 0), 0);
  const labsSel = new Map();
  sel.forEach((it) => labsSel.set(it.lab.id, it.lab));
  const cursos = new Map();
  let atendimentos = 0, labsLic = 0;
  labsSel.forEach((l) => {
    atendimentos += l.discentes || 0;
    if (l.atendeLicenciatura) labsLic++;
    distParseCursos(l.cursosProprios).concat(distParseCursos(l.cursosExternos))
      .forEach((c) => cursos.set(c.toLowerCase(), c));
  });
  return {
    sel, total,
    unidades: new Set(sel.map((it) => it.lab.unidade)),
    labs: labsSel, labsLic,
    cursos: [...cursos.values()].sort((a, b) => cmp(a, b)),
    atendimentos,
  };
}

function renderDistBudget() {
  const I = distImpacto();
  const sobra = DIST_VERBA - I.total;
  const acima = I.total > DIST_VERBA;
  const pct = Math.min(100, (I.total / DIST_VERBA) * 100);
  const barra = `<div class="budget-bar"><div class="budget-fill${acima ? " over" : ""}" style="width:${pct}%"></div></div>`;

  if (distView === "final") {
    const cursosLic = I.cursos.filter((c) => c.toLowerCase().includes("licenciatura")).length;
    $("#dist-budget").innerHTML =
      `<div class="budget-stats">` +
      `<div class="budget-stat"><b>Investimento</b><span class="${acima ? "over" : "money"}">${fmtBRL(I.total)}</span></div>` +
      `<div class="budget-stat"><b>${acima ? "Excedente" : "Saldo da verba"}</b><span class="${acima ? "over" : ""}">${fmtBRL(Math.abs(sobra))}</span></div>` +
      `<div class="budget-stat"><b data-tip="Unidades acadêmicas atendidas, das ${fmtNum(DATA.meta.unidades.length)} unidades do levantamento.">Unidades atendidas</b><span>${fmtNum(I.unidades.size)} de ${fmtNum(DATA.meta.unidades.length)}</span></div>` +
      `<div class="budget-stat"><b data-tip="Laboratórios beneficiados. Destes, ${fmtNum(I.labsLic)} atendem cursos de licenciatura.">Laboratórios</b><span>${fmtNum(I.labs.size)}</span></div>` +
      `<div class="budget-stat"><b data-tip="Cursos de graduação distintos atendidos pelos laboratórios contemplados (da própria unidade e de outras). Destes, ${fmtNum(cursosLic)} são licenciaturas.">Cursos atendidos</b><span>${fmtNum(I.cursos.length)}</span></div>` +
      `<div class="budget-stat"><b data-tip="Soma dos alunos atendidos por semestre informados por cada laboratório contemplado. Um mesmo aluno pode ser atendido por mais de um laboratório, portanto o número mede atendimentos, não alunos únicos.">Atendimentos de alunos / sem.</b><span>${fmtNum(I.atendimentos)}</span></div>` +
      `</div>` + barra;
    return;
  }

  $("#dist-budget").innerHTML =
    `<div class="budget-stats">` +
    `<div class="budget-stat"><b>Selecionado</b><span class="${acima ? "over" : "money"}">${fmtBRL(I.total)}</span></div>` +
    `<div class="budget-stat"><b>Verba</b><span>${fmtBRL(DIST_VERBA)}</span></div>` +
    `<div class="budget-stat"><b>${acima ? "Excedente" : "Saldo"}</b><span class="${acima ? "over" : ""}">${fmtBRL(Math.abs(sobra))}</span></div>` +
    `<div class="budget-stat"><b>Itens</b><span>${fmtNum(I.sel.length)}</span></div>` +
    `<div class="budget-stat"><b>Unidades contempladas</b><span>${fmtNum(I.unidades.size)} de ${fmtNum(DATA.meta.unidades.length)}</span></div>` +
    `</div>` + barra;
}

/* Retorna o motivo da redistribuição para um item (tooltip do selo). */
function redistMotivo(key) {
  const ov = DIST_REDIST_OVERRIDES.find((r) => r.key === key);
  return ov ? ov.motivo : "Item adicionado pela redistribuição do saldo da verba às unidades subatendidas.";
}

function distMotivoTag(it) {
  if (it.vetado) {
    const motivo = DIST_VETADOS[it.key] || "Item vetado.";
    return ` <span class="tag-off tag-vetado" data-tip="${esc(motivo)}">vetado</span>`;
  }
  if (it.elegivel) return "";
  const m = [];
  if (it.qtd !== 1) m.push(`qtd. ${fmtNum(it.qtd)}`);
  if ((it.e.valor || 0) < DIST_MIN) m.push("abaixo de R$ 20 mil");
  return ` <span class="tag-off" data-tip="Fora dos critérios da distribuição (quantidade = 1 e custo total ≥ R$ 20 mil), mas pode ser selecionado manualmente.">${esc(m.join(" · "))}</span>`;
}

const DIST_COLS = [
  ["Equipamento", ""], ["Tipo", ""], ["Laboratório", ""],
  ["Alunos / sem.", "num"], ["Cursos atendidos", "num"],
  ["Qtd. solicitada", "num"], ["Custo total (R$)", "num"],
  ["Estimativa de custo unitário (R$)", "num", "O levantamento não coletou o preço de uma unidade. Esta coluna é só uma estimativa: o custo total dividido pela quantidade pedida (por isso o ≈)."],
  ["Descrição", ""], ["Comentários", ""],
];

function renderDist() {
  const final = distView === "final";
  $("#dist-aside").hidden = final;
  $("#dist-layout").classList.toggle("dist-full", final);
  $("#dist-sugerir").hidden = final;
  $("#dist-desmarcar").hidden = final;
  renderDistBudget();
  if (final) {
    $("#dist-active").hidden = true;
    renderDistFinal();
  } else {
    renderDistAjustar();
  }
}

/* ---------------------------------------------------- visão Lista definitiva */
const PRIO_TIP = "Laboratório prioritário da unidade pelos critérios da distribuição, nesta ordem: atende licenciatura, mais alunos/semestre, mais cursos atendidos, mais cursos de outras unidades (entre os labs com item elegível).";

/* card explicativo no topo da Lista definitiva: deixa claro como os itens foram
   escolhidos e o que significa cada selo (atende a um pedido explícito de clareza). */
function distMetodologiaCard() {
  const nManuais = Object.keys(DIST_MANUAIS).length;
  const nVetados = Object.keys(DIST_VETADOS).length;
  const card = el("div", "dist-method");
  card.innerHTML =
    `<h3>Como esta lista foi montada</h3>` +
    `<ul>` +
    `<li>O edital reparte <strong>R$ 1,2 milhão</strong> entre as unidades acadêmicas. A prioridade é concentrar o recurso em <strong>equipamentos de maior porte</strong> (em vez de pulverizá-lo) — conforme orientação do MEC.</li>` +
    `<li><strong>Quais itens entram (elegibilidade):</strong> apenas equipamentos com <strong>quantidade solicitada igual a 1</strong> e <strong>custo total entre R$ 20 mil e R$ 150 mil</strong> (o teto por item evita que uma só unidade consuma a verba). Itens vetados (veículos, pacotes multi-equipamento e descrições placeholder) ficam de fora.</li>` +
    `<li><strong>Qual laboratório de cada unidade é escolhido:</strong> entre os que têm item elegível, a prioridade é, <strong>antes de tudo, atender cursos de licenciatura</strong>; em seguida, ter mais alunos por semestre, atender mais cursos e atender mais cursos de outras unidades. O laboratório priorizado recebe o selo <span class="badge prio">prioritário</span>.</li>` +
    `<li><strong>Qual item dentro do laboratório:</strong> o de <strong>maior valor dentro do teto</strong>, para que a verba seja usada em equipamentos de maior porte e o gasto total se aproxime dos R$ 1,2 milhão.</li>` +
    `<li><strong>Ajustes manuais:</strong> quando o item escolhido automaticamente não se enquadra no edital (veículo, pacote multi-equipamento etc.), ele é trocado à mão. Há <strong>${fmtNum(nManuais)} ajustes</strong>, marcados com o selo <span class="badge ajuste">ajuste manual</span> — passe o mouse sobre o selo para ver o motivo.</li>` +
    `<li><strong>Redistribuição da sobra:</strong> após a proposta base (1 item por unidade), <strong>${fmtNum(DIST_REDIST_OVERRIDES.length)} equipamentos essenciais</strong> foram escolhidos manualmente para unidades subatendidas, com base no impacto pedagógico — não apenas no valor, mas na relevância para a graduação. Cada item tem um motivo registrado (passe o mouse sobre o selo <span class="badge redist">redistribuição</span>). A ICB troca o microscópio pela câmara de pressão de Scholander; as demais unidades recebem um 2º equipamento.</li>` +
    `<li><strong>Equipamento caro tem que servir muitos alunos — com o dado conferido:</strong> como o levantamento traz inconsistências, o número de alunos é <strong>conferido contra a capacidade por turma</strong>: um valor implausível não ganha prioridade e recebe o selo <span class="badge chk">conferir alunos</span>.</li>` +
    `<li><strong>Quem fica de fora:</strong> unidades sem nenhum item dentro desses critérios, ou barradas na análise (por exemplo, valor irreal ou só itens acima do teto), aparecem na lista de <strong>não atendidas</strong> ao final, com o motivo de cada uma.</li>` +
    `</ul>` +
    `<p class="dist-legenda"><strong>Legenda dos selos:</strong> ` +
    `<span class="badge lic">licenciatura</span> o laboratório atende cursos de licenciatura · ` +
    `<span class="badge prio">prioritário</span> laboratório priorizado pelos critérios acima · ` +
    `<span class="badge ajuste">ajuste manual</span> item revisado/trocado manualmente · ` +
    `<span class="badge redist">redistribuição</span> item adicionado pela redistribuição da sobra · ` +
    `<span class="badge chk">conferir alunos</span> alunos/semestre destoa da capacidade — confira o dado · ` +
    `<span class="badge tipo-novo">novo</span> equipamento que o laboratório ainda não tem · ` +
    `<span class="badge tipo-exist">existente</span> mais unidades de um que ele já possui.</p>`;
  return card;
}

/* tabela da Seção A — itens confirmados (com selos lic./prioritário/ajuste manual,
   selo de consistência de alunos) */
function distTabelaConfirmados(itens, totalUnidades) {
  const total = itens.reduce((s, it) => s + (it.e.valor || 0), 0);
  const card = el("div", "table-card");
  card.innerHTML =
    `<div class="table-wrap"><table class="dist-final">` +
    `<caption class="sr-only">Itens confirmados da distribuição</caption>` +
    `<thead><tr>` +
    `<th>Unidade</th><th>Laboratório</th><th>Equipamento</th><th class="num">Custo total (R$)</th>` +
    `<th class="num">Alunos / sem.</th>` +
    `<th class="num">Cursos atendidos</th><th>Descrição</th><th>Comentários</th>` +
    `</tr></thead><tbody></tbody></table></div>`;
  const tb = card.querySelector("tbody");
  itens.forEach((it) => {
    const cursos = (it.lab.qtdCursosProprios || 0) + (it.lab.qtdCursosExternos || 0);
    const ehPrio = distPrioLab.get(it.lab.unidade) === it.lab.id;
    const ajuste = DIST_AJUSTES[it.key];
    const ehRedist = distRedist.has(it.key);
    const inconsist = consistenciaDiscentes(it.lab);
    const tr = el("tr");
    tr.innerHTML =
      `<td><strong>${esc(it.lab.unidade)}</strong></td>` +
      `<td><a href="#" data-lab="${esc(it.e.labId)}" data-tip="Clique para ver os dados completos do laboratório">${esc(it.lab.nome)}</a>` +
      (it.lab.atendeLicenciatura ? ' <span class="badge lic">licenciatura</span>' : "") +
      (ehPrio ? ` <span class="badge prio" data-tip="${esc(PRIO_TIP)}">prioritário</span>` : "") +
      (ajuste ? ` <span class="badge ajuste" data-tip="${esc(ajuste)}">ajuste manual</span>` : "") +
      (ehRedist ? ` <span class="badge redist" data-tip="${esc(redistMotivo(it.key))}">redistribuição</span>` : "") + `</td>` +
      `<td>${esc(it.e.nome)} <span class="badge tipo-${it.tipo === "novo" ? "novo" : "exist"}">${it.tipo}</span></td>` +
      `<td class="num">${fmtBRL(it.e.valor)}</td>` +
      `<td class="num">${fmtNum(it.lab.discentes)}` +
      (inconsist ? ` <span class="badge chk" data-tip="${esc(inconsist)}">conferir</span>` : "") + `</td>` +
      `<td class="num"><span data-tip="${esc(`${fmtNum(it.lab.qtdCursosProprios)} da própria unidade + ${fmtNum(it.lab.qtdCursosExternos)} de outras unidades`)}">${fmtNum(cursos)}</span></td>` +
      `<td class="cell-clip">${cellText(it.e.descricao)}</td>` +
      `<td class="cell-clip">${cellText(it.e.comentarios)}</td>`;
    tr.querySelector("a").addEventListener("click", (ev) => {
      ev.preventDefault();
      openLab(it.e.labId, ev.currentTarget);
    });
    tb.appendChild(tr);
  });
  const trTot = el("tr", "dist-total-row");
  trTot.innerHTML =
    `<td colspan="3">Total — ${fmtNum(itens.length)} equipamento${itens.length !== 1 ? "s" : ""} em ${fmtNum(totalUnidades)} unidades</td>` +
    `<td class="num">${fmtBRL(total)}</td><td colspan="4"></td>`;
  tb.appendChild(trTot);
  return card;
}

/* classifica uma unidade não contemplada: rank (p/ ordenar), rótulo da situação,
   classe do selo e um motivo explicativo. Categorias, em ordem de exibição:
   0 = solicitou mas foi barrada (decisão registrada ou só itens acima do teto);
   1 = solicitou mas nada dentro dos critérios; 2 = não solicitou nada. */
function distNaoAtendida(u) {
  const items = distPorUnidade.get(u) || [];
  const especial = DIST_MOTIVOS_ESPECIAIS[u];
  if (especial) {
    return { rank: 0, cat: "Avaliada e não atendida", catCls: "warn", motivo: especial };
  }
  if (!items.length) {
    return {
      rank: 2, cat: "Não solicitou equipamento", catCls: "off",
      motivo: "A unidade não registrou nenhuma solicitação de equipamento no levantamento de 2024.",
    };
  }
  const eleg = items.filter((it) => it.elegivel);
  if (eleg.length) {
    const minEleg = Math.min(...eleg.map((it) => it.e.valor || 0));
    return {
      rank: 0, cat: "Avaliada e não atendida", catCls: "warn",
      motivo: `Tem ${fmtNum(eleg.length)} item(ns) que cumprem os critérios, mas o mais barato custa ${fmtBRL(minEleg)}, acima do teto de ${fmtBRL(DIST_TETO)} por item — fora do porte previsto para um equipamento da distribuição.`,
    };
  }
  const n = items.length;
  const plural = n > 1 ? "ões" : "ão";
  const qtd1 = items.filter((it) => it.qtd === 1);
  const maxQtd1 = qtd1.reduce((m, it) => Math.max(m, it.e.valor || 0), 0);
  let motivo;
  if (!qtd1.length) {
    motivo = `Apresentou ${fmtNum(n)} solicitaç${plural}, mas todas pediam mais de uma unidade do mesmo item — nenhuma com quantidade exatamente 1, como o edital exige.`;
  } else if (maxQtd1 < DIST_MIN) {
    motivo = `Apresentou ${fmtNum(n)} solicitaç${plural}; entre as de quantidade 1, a mais cara custa ${fmtBRL(maxQtd1)}, abaixo do mínimo de R$ 20 mil.`;
  } else {
    motivo = `Apresentou ${fmtNum(n)} solicitaç${plural}, mas nenhuma combina quantidade exatamente 1 com custo total a partir de R$ 20 mil.`;
  }
  return { rank: 1, cat: "Solicitou, mas fora dos critérios", catCls: "off", motivo };
}

function renderDistFinal() {
  const I = distImpacto();
  const host = $("#dist-groups");
  host.innerHTML = "";

  // metodologia + legenda (sempre visível, mesmo sem itens)
  host.appendChild(distMetodologiaCard());

  // ---- Seção 1: itens atendidos (a seleção atual = proposta gerada pelos critérios)
  const atendidos = [...I.sel]
    .sort((a, b) => cmp(a.lab.unidade, b.lab.unidade) || cmp(a.lab.nome, b.lab.nome) || cmp(a.e.nome, b.e.nome));
  const unidadesAtendidas = new Set(atendidos.map((it) => it.lab.unidade));

  host.appendChild(el("h3", "dist-final-h",
    `Unidades atendidas <span class="badge ok">${fmtNum(unidadesAtendidas.size)}</span>`));
  host.appendChild(el("p", "dist-note-inline",
    "Proposta de distribuição da verba: cada unidade recebe pelo menos um equipamento pelos critérios acima (priorizando licenciatura), e o saldo da verba é redistribuído às unidades subatendidas. Itens com ajuste manual estão marcados com o selo “ajuste manual”; itens da redistribuição estão marcados com o selo “redistribuição”."));
  if (!atendidos.length) {
    host.appendChild(el("p", "dist-note", "Nenhum item selecionado. Use a visão 'Ajustar seleção' para montar a lista."));
  } else {
    host.appendChild(distTabelaConfirmados(atendidos, unidadesAtendidas.size));
  }

  // ---- cursos atendidos pelos itens da proposta (lista expansível)
  if (atendidos.length) {
    const cursosLic = I.cursos.filter((c) => c.toLowerCase().includes("licenciatura"));
    const det = el("details", "dist-cursos");
    det.innerHTML =
      `<summary>Cursos de graduação atendidos: <strong>${fmtNum(I.cursos.length)}</strong>` +
      ` (${fmtNum(cursosLic.length)} de licenciatura) — ver lista</summary>` +
      `<ul>` + I.cursos.map((c) =>
        `<li>${esc(c)}${c.toLowerCase().includes("licenciatura") ? ' <span class="badge lic">lic</span>' : ""}</li>`).join("") +
      `</ul>` +
      `<p class="dist-note-inline">Cursos distintos informados pelos laboratórios atendidos (atendidos diretamente ou de outras unidades).</p>`;
    host.appendChild(det);
  }

  // ---- Seção 2: unidades não atendidas, agrupadas por motivo e em ordem
  const fora = DATA.meta.unidades
    .filter((u) => !unidadesAtendidas.has(u))
    .map((u) => ({ u, ...distNaoAtendida(u) }))
    .sort((a, b) => a.rank - b.rank || cmp(a.u, b.u));
  if (fora.length) {
    host.appendChild(el("h3", "dist-final-h",
      `Unidades não atendidas <span class="badge off">${fmtNum(fora.length)}</span>`));
    host.appendChild(el("p", "dist-note-inline",
      "Ordenadas por situação: primeiro as que pediram mas foram barradas na análise, depois as que não tiveram item dentro dos critérios e, por fim, as que não solicitaram nada."));
    const nc = el("div", "table-card");
    nc.innerHTML =
      `<div class="table-wrap"><table class="dist-nc">` +
      `<caption class="sr-only">Unidades acadêmicas não atendidas, a situação e o motivo</caption>` +
      `<thead><tr><th>Unidade</th><th>Situação</th><th>Por que não foi atendida</th></tr></thead><tbody></tbody></table></div>`;
    const ntb = nc.querySelector("tbody");
    fora.forEach(({ u, cat, catCls, motivo }) => {
      ntb.appendChild(el("tr", null,
        `<td><strong>${esc(u)}</strong></td>` +
        `<td><span class="badge ${catCls}">${esc(cat)}</span></td>` +
        `<td class="dist-nc-motivo">${esc(motivo)}</td>`));
    });
    host.appendChild(nc);
    host.appendChild(el("p", "dist-note-inline",
      "As solicitações dessas unidades podem ser examinadas na visão 'Ajustar seleção' (ative 'Mostrar itens fora dos critérios')."));
  }

  host.querySelectorAll(".table-wrap").forEach((w) => { wireScrollHints(w); updateScrollHints(w); });
}

/* ---------------------------------------------------- visão Ajustar seleção */
function renderDistAjustar() {
  const C = readControls(distControls);
  renderActiveBar("#dist-active", distControls, renderDist);

  const busca = C.distBusca.toLowerCase();
  const tipoFiltro = C.distTipo === "Novos" ? "novo" : C.distTipo === "Existentes" ? "existente" : "";
  const filtrosAtivos = !!(busca || C.distSoSel || C.distSoDoc || tipoFiltro);
  const host = $("#dist-groups");
  host.innerHTML = "";
  distHeads = {};
  const frag = document.createDocumentFragment();

  DATA.meta.unidades.forEach((u) => {
    if (C.distUni && u !== C.distUni) return;
    const items = distPorUnidade.get(u) || [];
    const temElegivel = items.some((it) => it.elegivel);

    const mostrar = items.filter((it) => {
      if (busca && !it.e.nome.toLowerCase().includes(busca)) return false;
      if (tipoFiltro && it.tipo !== tipoFiltro) return false;
      if (C.distSoSel && !distSel.has(it.key)) return false;
      if (C.distSoDoc && !it.e.temDescricao) return false;
      // fora dos critérios: só aparece se pedido, se já selecionado
      // ou se a unidade não tem nenhum item elegível (alternativas)
      if (!it.elegivel && !C.distFora && temElegivel && !distSel.has(it.key)) return false;
      return true;
    });
    if (!mostrar.length && filtrosAtivos) return;

    const prioId = distPrioLab.get(u);
    mostrar.sort((a, b) =>
      (b.elegivel ? 1 : 0) - (a.elegivel ? 1 : 0) ||
      (b.lab.id === prioId ? 1 : 0) - (a.lab.id === prioId ? 1 : 0) ||
      (distSel.has(b.key) ? 1 : 0) - (distSel.has(a.key) ? 1 : 0) ||
      distDoc(b.e) - distDoc(a.e) ||
      a.e.valor - b.e.valor);

    const grupo = el("section", "dist-unit");
    const head = el("div", "dist-unit-head");
    head.appendChild(el("h3", null, esc(u)));
    const badge = el("span", "badge");
    const total = el("span", "dist-unit-total");
    head.append(badge, total);
    grupo.appendChild(head);
    distHeads[u] = { badge, total };
    atualizaDistHead(u);

    if (!mostrar.length) {
      grupo.appendChild(el("p", "dist-note", "Nenhum equipamento solicitado por esta unidade no levantamento de 2024."));
      frag.appendChild(grupo);
      return;
    }

    const card = el("div", "table-card");
    const ths = `<th class="dist-sel-col"><span class="sr-only">Selecionar</span></th>` +
      DIST_COLS.map(([label, cls, tip]) =>
        `<th class="${cls}"${tip ? ` data-tip="${esc(tip)}"` : ""}>${esc(label)}</th>`).join("");
    card.innerHTML = `<div class="table-wrap"><table class="dist-table"><thead><tr>${ths}</tr></thead><tbody></tbody></table></div>`;
    const tb = card.querySelector("tbody");

    mostrar.forEach((it) => {
      const tr = el("tr", (it.elegivel ? "" : "dist-off") + (distSel.has(it.key) ? " dist-sel" : ""));
      const tdSel = el("td", "dist-sel-cell");
      const cb = el("input", "dist-check");
      cb.type = "checkbox";
      cb.checked = distSel.has(it.key);
      cb.setAttribute("aria-label", `Selecionar ${it.e.nome} — ${it.lab.nome} (${u})`);
      cb.addEventListener("change", () => {
        if (cb.checked) distSel.add(it.key); else distSel.delete(it.key);
        tr.classList.toggle("dist-sel", cb.checked);
        saveDistSel();
        renderDistBudget();
        atualizaDistHead(u);
      });
      tdSel.appendChild(cb);
      tr.appendChild(tdSel);

      const cursos = (it.lab.qtdCursosProprios || 0) + (it.lab.qtdCursosExternos || 0);
      const unit = it.qtd ? (it.e.valor || 0) / it.qtd : 0;
      const tipoTip = it.tipo === "existente"
        ? `Equipamento que o laboratório já tem: ${fmtNum(it.e.qtdExistente)} unidade(s), ${fmtNum(it.e.qtdFuncionando)} funcionando; pede mais ${fmtNum(it.qtd)}.`
        : "Equipamento que o laboratório ainda não possui e deseja adquirir.";
      const ehPrio = it.lab.id === prioId;
      const prioTip = "Laboratório prioritário da unidade pelos critérios da distribuição, nesta ordem: atende licenciatura, mais alunos/semestre, mais cursos atendidos, mais cursos de outras unidades (entre os labs com item elegível).";
      tr.insertAdjacentHTML("beforeend",
        `<td>${esc(it.e.nome)}${distMotivoTag(it)}</td>` +
        `<td><span class="badge tipo-${it.tipo === "novo" ? "novo" : "exist"}" data-tip="${esc(tipoTip)}">${it.tipo}</span></td>` +
        `<td><a href="#" data-lab="${esc(it.e.labId)}">${esc(it.lab.nome)}</a>${ehPrio ? ` <span class="badge prio" data-tip="${esc(prioTip)}">prioritário</span>` : ""}</td>` +
        `<td class="num">${fmtNum(it.lab.discentes)}</td>` +
        `<td class="num"><span data-tip="${esc(`${fmtNum(it.lab.qtdCursosProprios)} da própria unidade + ${fmtNum(it.lab.qtdCursosExternos)} de outras unidades`)}">${fmtNum(cursos)}</span></td>` +
        `<td class="num">${fmtNum(it.qtd)}</td>` +
        `<td class="num">${fmtBRL(it.e.valor)}</td>` +
        `<td class="num unit-cell">${unit ? "≈ " + fmtBRL(unit) : '<span class="muted">—</span>'}</td>` +
        `<td class="cell-clip">${cellText(it.e.descricao)}</td>` +
        `<td class="cell-clip">${cellText(it.e.comentarios)}</td>`);
      tr.querySelector("a").addEventListener("click", (ev) => {
        ev.preventDefault();
        openLab(it.e.labId, ev.currentTarget);
      });
      tb.appendChild(tr);
    });

    grupo.appendChild(card);
    frag.appendChild(grupo);
  });

  if (!frag.childNodes.length) {
    host.appendChild(el("p", "dist-note", "Nenhum item corresponde aos filtros selecionados."));
    return;
  }
  host.appendChild(frag);
  host.querySelectorAll(".table-wrap").forEach((w) => { wireScrollHints(w); updateScrollHints(w); });
}

/* ---------------------------------------------------- exportação CSV */
function exportDistCsv() {
  const sel = distItems.filter((it) => distSel.has(it.key));
  if (!sel.length) { alert("Nenhum item selecionado para exportar."); return; }
  sel.sort((a, b) => cmp(a.lab.unidade, b.lab.unidade) || cmp(a.lab.nome, b.lab.nome) || cmp(a.e.nome, b.e.nome));

  const celula = (v) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const linhas = [[
    "Unidade", "Laboratório", "Equipamento", "Tipo", "Qtd. solicitada", "Custo total (R$)",
    "Estimativa de custo unitário (R$)", "Alunos/semestre", "Cursos da unidade",
    "Cursos externos", "Prioridade", "Descrição", "Comentários",
  ].map(celula).join(";")];
  let total = 0;
  sel.forEach((it) => {
    total += it.e.valor || 0;
    linhas.push([
      it.lab.unidade, it.lab.nome, it.e.nome, it.tipo, it.qtd, it.e.valor,
      it.qtd ? Math.round((it.e.valor || 0) / it.qtd) : "",
      it.lab.discentes, it.lab.qtdCursosProprios, it.lab.qtdCursosExternos,
      it.e.prioridade, it.e.descricao, it.e.comentarios,
    ].map(celula).join(";"));
  });
  linhas.push(["TOTAL", "", "", "", "", total, "", "", "", "", "", "", ""].map(celula).join(";"));

  // BOM no início faz o Excel abrir o arquivo como UTF-8
  const blob = new Blob(["\ufeff" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = el("a");
  a.href = URL.createObjectURL(blob);
  a.download = "distribuicao-equipamentos-1200000.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

/* ============================================================ abas */
function wireTabs() {
  const tabs = [...document.querySelectorAll('.tablist [role="tab"]')];
  const activate = (btn) => {
    tabs.forEach((b) => {
      const on = b === btn;
      b.classList.toggle("active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
      b.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(b.getAttribute("aria-controls"));
      panel.classList.toggle("active", on);
      panel.toggleAttribute("hidden", !on);
    });
  };
  tabs.forEach((btn, i) => {
    btn.addEventListener("click", () => activate(btn));
    btn.addEventListener("keydown", (e) => {
      let j = null;
      if (e.key === "ArrowRight") j = (i + 1) % tabs.length;
      else if (e.key === "ArrowLeft") j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") j = 0;
      else if (e.key === "End") j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); activate(tabs[j]); tabs[j].focus(); }
    });
  });

  // sub-abas de equipamentos (Existentes / Novos)
  document.querySelectorAll("#tab-equip .subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#tab-equip .subtab").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      eqSubtab = btn.dataset.subtab;
      const panel = document.getElementById("eq-panel");
      if (panel) panel.setAttribute("aria-labelledby", btn.id);
      renderEquip();
    });
  });

  // visões da distribuição (Lista definitiva / Ajustar seleção)
  document.querySelectorAll("#tab-dist .subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll("#tab-dist .subtab").forEach((b) => {
        const on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      distView = btn.dataset.distview;
      renderDist();
    });
  });
}

/* ============================================================ modal do lab */
function courseList(csvText) {
  if (!csvText) return `<p class="modal-note">—</p>`;
  const items = csvText.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (items.length <= 1) return `<p>${esc(csvText)}</p>`;
  return `<ul class="course-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;
}

function openLab(labId, trigger) {
  const l = labsById[labId];
  if (!l) return;
  lastFocused = trigger || document.activeElement;
  const eq = equipPorLab[labId] || { existentes: [], novos: [] };

  const totExistVal = eq.existentes.reduce((s, e) => s + (e.valor || 0), 0);
  const totNovoVal = eq.novos.reduce((s, e) => s + (e.valor || 0), 0);
  const totGeral = totExistVal + totNovoVal;

  const statGrid = [
    ["Alunos/semestre", fmtNum(l.discentes)],
    ["Capacidade/turma", fmtNum(l.capacidade)],
    ["Equip. existentes", fmtNum(eq.existentes.length)],
    ["Equip. novos", fmtNum(eq.novos.length)],
    ["Custo estim. exist.", fmtBRL(totExistVal)],
    ["Custo estim. novos", fmtBRL(totNovoVal)],
    ["Custo estim. total", fmtBRL(totGeral)],
  ].map(([label, val], i) =>
    `<div class="modal-stat"><b>${esc(label)}</b><span class="${i >= 4 ? "money" : ""}">${val}</span></div>`
  ).join("");

  const meta = [
    ["Unidade", esc(l.unidade)],
    ["Grande Área", esc(l.area)],
    ["Localidade", esc(l.localidade)],
    ["Cursos da unidade", `${l.qtdCursosProprios} curso${l.qtdCursosProprios !== 1 ? "s" : ""}`, courseList(l.cursosProprios)],
    ["Cursos de outras unids.", `${l.qtdCursosExternos} curso${l.qtdCursosExternos !== 1 ? "s" : ""}`, courseList(l.cursosExternos)],
    ["Docentes vinculados", esc(l.docentes)],
    ["TAEs", esc(l.taes)],
    ["Bolsistas", esc(l.bolsistas)],
    ["Terceirizados", esc(l.terceirizados)],
  ].map(([k, v, extra]) =>
    `<div><b>${esc(k)}</b>${v}${extra ? extra : ""}</div>`
  ).join("");

  const unitTxt = (valor, q) => (q ? "≈ " + fmtBRL(valor / q) : '<span class="muted">—</span>');
  const existHead = ["Equipamento", "Prioridade", "Existente", "Em funcionamento", "A adquirir", "Custo total (R$)", "Estimativa de custo unitário (R$)", "Descrição", "Comentários"];
  const existRows = eq.existentes.map((e) =>
    `<tr><td>${esc(e.nome)}</td><td class="num">${fmtNum(e.prioridade)}</td>` +
    `<td class="num">${fmtNum(e.qtdExistente)}</td><td class="num">${fmtNum(e.qtdFuncionando)}</td>` +
    `<td class="num">${fmtNum(e.qtdAdquirir)}</td><td class="num">${fmtBRL(e.valor)}</td>` +
    `<td class="num unit-cell">${unitTxt(e.valor, e.qtdAdquirir)}</td>` +
    `<td>${cellText(e.descricao)}</td><td>${cellText(e.comentarios)}</td></tr>`).join("");

  const novoHead = ["Equipamento", "Prioridade", "Qtd. necessária", "Custo total (R$)", "Estimativa de custo unitário (R$)", "Descrição", "Comentários"];
  const novoRows = eq.novos.map((e) =>
    `<tr><td>${esc(e.nome)}</td><td class="num">${fmtNum(e.prioridade)}</td>` +
    `<td class="num">${fmtNum(e.qtdNecessaria)}</td><td class="num">${fmtBRL(e.valor)}</td>` +
    `<td class="num unit-cell">${unitTxt(e.valor, e.qtdNecessaria)}</td>` +
    `<td>${cellText(e.descricao)}</td><td>${cellText(e.comentarios)}</td></tr>`).join("");

  $("#modal-content").innerHTML =
    `<h2 id="modal-title">${esc(l.nome)} <span class="badge">${esc(l.id)}</span>` +
    (l.atendeLicenciatura ? ' <span class="badge lic">licenciatura</span>' : "") + `</h2>` +
    `<p class="sub">${esc(l.unidade)} · ${esc(l.area)} · ${esc(l.localidade)}</p>` +
    `<div class="modal-stat-grid">${statGrid}</div>` +
    `<div class="lab-meta">${meta}</div>` +
    (l.comentarios ? `<p class="modal-note">"${esc(l.comentarios)}"</p>` : "") +
    `<h3>Equipamentos existentes que precisam de mais unidades` +
    `<span class="badge">${eq.existentes.length}</span><span class="h3-total">${fmtBRL(totExistVal)}</span></h3>` +
    sectionTable(existHead, existRows, "Nenhum equipamento existente registrado para este laboratório.") +
    `<h3>Novos equipamentos a adquirir` +
    `<span class="badge">${eq.novos.length}</span><span class="h3-total">${fmtBRL(totNovoVal)}</span></h3>` +
    sectionTable(novoHead, novoRows, "Nenhum novo equipamento registrado para este laboratório.");

  const modal = $("#modal");
  document.body.style.overflow = "hidden";
  [...document.body.children].forEach((el) => { if (el !== modal) el.inert = true; });
  modal.removeAttribute("hidden");
  // indicador de scroll horizontal nas tabelas internas do modal
  modal.querySelectorAll(".table-wrap").forEach((w) => { wireScrollHints(w); updateScrollHints(w); });
  $("#modal-close").focus();
}

function sectionTable(headers, rowsHtml, emptyMsg) {
  if (!rowsHtml) return `<p class="modal-note">${esc(emptyMsg)}</p>`;
  const ths = headers.map((h, i) =>
    `<th class="${i === 0 || i >= headers.length - 2 ? "" : "num"}">${esc(h)}</th>`).join("");
  return `<div class="table-card"><div class="table-wrap"><table><thead><tr>${ths}</tr></thead><tbody>${rowsHtml}</tbody></table></div></div>`;
}

function wireModal() {
  const modal = $("#modal");
  $("#modal-close").addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (modal.hasAttribute("hidden")) return;
    if (e.key === "Escape") closeModal();
    if (e.key === "Tab") trapFocus(e, modal);
  });
}
function trapFocus(e, modal) {
  const f = modal.querySelectorAll('button, a[href], input, [tabindex]:not([tabindex="-1"])');
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}
function closeModal() {
  const modal = $("#modal");
  modal.setAttribute("hidden", "");
  document.body.style.overflow = "";
  [...document.body.children].forEach((el) => { if (el !== modal) el.removeAttribute("inert"); });
  if (lastFocused && lastFocused.focus) lastFocused.focus();
}

/* ============================================================ sidebar colapsável (mobile)
   Em ≤600px, esconde o corpo dos filtros por padrão e mostra um botão "Filtros ▾/▴".
   O estado é compartilhado pelas duas abas (Labs / Equip) e sincronizado no resize. */
const FILTERS_BP = 600;
function isMobileFilters() { return window.innerWidth <= FILTERS_BP; }
function setToggleVisual(btn, open) {
  const arrow = btn.querySelector(".filters-toggle-arrow");
  if (arrow) arrow.textContent = open ? "▴" : "▾";
  btn.setAttribute("aria-expanded", open ? "true" : "false");
}
function applyFiltersCollapsed(collapsed) {
  document.querySelectorAll(".filters").forEach((f) => {
    f.classList.toggle("collapsed", collapsed);
  });
  document.querySelectorAll(".filters-toggle").forEach((b) => {
    setToggleVisual(b, !collapsed);
  });
}
function wireFiltersToggle() {
  document.querySelectorAll(".filters-toggle").forEach((btn) => {
    btn.addEventListener("click", () => {
      const filters = btn.closest(".filters");
      if (!filters) return;
      filters.classList.toggle("collapsed");
      const isCollapsed = filters.classList.contains("collapsed");
      setToggleVisual(btn, !isCollapsed);
    });
  });
  // estado inicial + sync no resize
  applyFiltersCollapsed(isMobileFilters());
  const onResize = debounce(() => applyFiltersCollapsed(isMobileFilters()), 120);
  window.addEventListener("resize", onResize);
}

/* ============================================================ indicador de scroll horizontal
   Marca .table-wrap com .has-overflow-right enquanto houver conteúdo cortado à direita.
   O gradiente de sombra vive no CSS; este helper só liga/desliga a classe.
   Obs: em alguns layouts, o .clientWidth do wrap pode ser inflado pelo min-width
   dos <th> (mesmo valor que scrollWidth). Usamos o menor entre clientWidth e a
   largura do viewport como referência visível em todos os cálculos. */
function updateScrollHints(wrapEl) {
  if (!wrapEl) return;
  const visibleWidth = Math.min(wrapEl.clientWidth, document.documentElement.clientWidth);
  const hasOverflow = wrapEl.scrollWidth > visibleWidth + 1;
  const atEnd = wrapEl.scrollLeft + visibleWidth >= wrapEl.scrollWidth - 1;
  wrapEl.classList.toggle("has-overflow-right", hasOverflow && !atEnd);
}
function wireScrollHints(wrapEl) {
  if (!wrapEl || wrapEl.dataset.hintWired === "1") return;
  wrapEl.dataset.hintWired = "1";
  wrapEl.addEventListener("scroll", () => updateScrollHints(wrapEl), { passive: true });
  // recalcula no resize (mudou a largura visível)
  const onResize = debounce(() => updateScrollHints(wrapEl), 120);
  window.addEventListener("resize", onResize);
}
