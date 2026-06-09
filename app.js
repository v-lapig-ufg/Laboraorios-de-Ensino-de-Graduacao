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
  const required = ["#lab-filters", "#eq-filters", "#lab-table", "#eq-table", "#lab-summary", "#eq-summary", "#lab-active", "#eq-active", "#lab-limpar", "#eq-limpar", "#loading", "#modal", "#modal-close", "#modal-content", "#meta-info"];
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

  wireTabs();
  wireLabSort();
  buildEquipThead();
  wireEquipSort();
  wireModal();
  initTooltips();
  $("#lab-limpar").addEventListener("click", () => {
    labControls.forEach((c) => c.reset());
    renderLabs();
  });
  $("#eq-limpar").addEventListener("click", () => {
    [...eqLabControls, ...eqItemControls].forEach((c) => c.reset());
    renderEquip();
  });

  $("#loading").setAttribute("hidden", "");
  $("#loading").removeAttribute("aria-busy");
  renderLabs();
  renderEquip();
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
      return v ? [{ label: `${label}: “${v}”`, clear: () => { inp.value = ""; } }] : [];
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

  // sub-abas de equipamentos
  document.querySelectorAll(".subtab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".subtab").forEach((b) => {
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
    (l.comentarios ? `<p class="modal-note">“${esc(l.comentarios)}”</p>` : "") +
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
