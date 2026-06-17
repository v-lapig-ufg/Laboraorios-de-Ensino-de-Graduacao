# Aba "Distribuição R$ 1,35 mi" — documentação técnica

> Documento para humanos **e outras IAs** que forem mexer nesta funcionalidade.
> Para a visão geral do projeto (pipeline de dados, arquitetura, convenções),
> ver `../CLAUDE.md`. Aqui detalhamos só a aba **Distribuição**, que é a parte
> com mais regras de negócio. Todo o código dela vive em **`web/app.js`** (e os
> estilos em `web/styles.css`, o HTML em `web/index.html`).

---

## 1. Para que serve

Um edital do MEC reparte **R$ 1.350.000** entre as **31 unidades acadêmicas** da
UFG. A meta é apoiar **um equipamento de maior porte por unidade** (em vez de
pulverizar o recurso em itens pequenos), com um **2º equipamento** para unidades
subatendidas de grande público via redistribuição da sobra. Esta aba ajuda a
montar e justificar essa proposta de distribuição a partir dos dados do
levantamento de 2024.

A aba tem **duas visões** (sub-abas):

- **Lista definitiva** (`distView === "final"`): a proposta pronta + a metodologia
  + o impacto. É a tela de apresentação/justificativa.
- **Ajustar seleção** (`distView === "ajustar"`): checkboxes por unidade para
  marcar/desmarcar itens à mão. É a bancada de trabalho.

---

## 2. De onde vêm os dados (`data.json`)

Carregado uma vez por `fetch("data.json")`. Campos relevantes para esta aba:

**`labs[]`** (cada laboratório):
| campo | significado |
|---|---|
| `id` | `LAB###`, estável |
| `unidade` | sigla da unidade acadêmica (ex.: `FEN`, `IQ`) |
| `atendeLicenciatura` | bool — **1º critério de prioridade** |
| `discentes` | "alunos / semestre" atendidos (**ver §4: tem inconsistências**) |
| `capacidade` | capacidade por turma (usada para validar `discentes`) |
| `qtdCursosProprios`, `qtdCursosExternos` | nº de cursos atendidos |
| `cursosProprios`, `cursosExternos` | listas em texto (separador misto `|,;`) |

**`equipNovos[]`** e **`equipExistentes[]`** (cada item solicitado):
| campo | significado |
|---|---|
| `labId` | a qual laboratório pertence |
| `nome` | nome do equipamento |
| `valor` | **custo total** da linha (NÃO é preço unitário) |
| `qtdNecessaria` | quantidade pedida — **só em `equipNovos`** |
| `qtdAdquirir` | quantidade a adquirir — **só em `equipExistentes`** |
| `temDescricao`, `temComentario` | bools (usados como desempate de "documentação") |

> **Atenção:** "novos" = equipamentos que o lab ainda não tem; "existentes" =
> equipamentos que já tem e quer ampliar. A quantidade pedida vem de **campos
> diferentes** nos dois (`qtdNecessaria` vs `qtdAdquirir`).

---

## 3. A metodologia de seleção (o coração)

A proposta é **gerada por critérios** e depois recebe **ajustes humanos e redistribuição**.
Resumo do fluxo: `buildDistData()` prepara os dados → `distSuggest()` gera a base
por critérios → `distProposta()` aplica vetos/exclusões/overrides → `distRedistribuicao()`
redistribui a sobra → vira a seleção inicial (`distSel`).

### 3.1 Elegibilidade do item
Um item é elegível se: **`qtd === 1`**, **`DIST_MIN ≤ valor ≤ DIST_TETO`**
(hoje **R$ 20 mil a R$ 150 mil**) e **não está em `DIST_VETADOS`**.
Marcado em `it.elegivel` dentro de `buildDistData()`. Itens vetados (veículos,
pacotes multi-equipamento, descrições placeholder) ficam de fora da seleção
automática e da redistribuição, mas continuam visíveis na aba "Ajustar seleção"
com o selo **"vetado"**.

### 3.2 Qual laboratório de cada unidade
Entre os labs da unidade que **têm item elegível**, escolhe-se o prioritário por
`cmpPrioLab(a, b)`, nesta ordem (cada critério desempata o anterior):
1. **atende licenciatura** (antes de tudo);
2. **mais alunos/semestre** — usando o número **validado** (§4), não o bruto;
3. **mais cursos atendidos** (próprios + externos);
4. **mais cursos de outras unidades** (`qtdCursosExternos`).

O lab vencedor de cada unidade fica em `distPrioLab` (unidade → labId) e recebe o
selo **prioritário** na UI.

### 3.3 Qual item dentro do laboratório
O **item de MAIOR valor** dentro do teto (desempate: melhor documentado). Isso
concentra a verba em equipamentos de maior porte e aproxima o gasto da verba.
Está no `sort` de `distSuggest()`:
```js
ops.sort((a, b) => b.e.valor - a.e.valor || distDoc(b.e) - distDoc(a.e));
```
> Histórico: já foi "mais barato" (`a.valor - b.valor`). Trocou para "mais caro"
> em 06/2026 para usar melhor a verba. Para reverter, basta inverter este sort.

### 3.4 Validação de alunos × capacidade (§4) — embutida no ranqueamento
`cmpPrioLab` usa `discValid(lab)` em vez de `lab.discentes` cru, para que um
número de alunos implausível não fure a fila. Ver §4.

### 3.5 Ajustes humanos (aplicados por `distProposta()` sobre `distSuggest()`)
- **`DIST_VETADOS`** — itens excluídos da elegibilidade (veículos, pacotes
  multi-equipamento, descrições placeholder). A unidade pode ser atendida por outro
  item elegível. Marcados com o selo **"vetado"** na aba "Ajustar seleção".
  Hoje: Fiat Strada (2 variantes), Tapetes de ginástica rítmica, Ilha de edição,
  Micro trator, "Toda a sequência de produção de ração" e 4 variantes de
  "EQUIPAMENTO DE/AUDIO VISUAL".
- **`DIST_MANUAIS`** — overrides por unidade. Substituem a escolha automática
  daquela unidade por um item escolhido à mão, e pintam o selo **"ajuste manual"**
  (tooltip = o motivo). Hoje: **FEN**, **EVZ**, **FEFD**, **FL**.
  `DIST_AJUSTES` é **derivado** de `DIST_MANUAIS` (mapa `chave → motivo`) e é o que
  a tabela consulta para desenhar o selo.
- **`DIST_MOTIVOS_ESPECIAIS`** — exclusões por decisão. A unidade fica **sempre
  fora** (mesmo com item elegível) e aparece em "não atendidas" com o texto do
  motivo. Hoje: **FM**, **UAECH**, **FD**.

```js
// distProposta(): base por critérios + vetos + exclusões + overrides + redistribuição
const sel = distSuggest();
// 1) tira unidades excluídas por decisão
[...sel].forEach((k) => { if (DIST_MOTIVOS_ESPECIAIS[keyUnit.get(k)]) sel.delete(k); });
// 2) aplica overrides manuais (troca a escolha automática da unidade)
Object.entries(DIST_MANUAIS).forEach(([uni, ov]) => {
  [...sel].forEach((k) => { if (keyUnit.get(k) === uni) sel.delete(k); });
  if (validas.has(ov.key)) sel.add(ov.key);
});
// 3) redistribui a sobra para unidades subatendidas
distRedistribuicao(sel);
```

### 3.6 Redistribuição da sobra (`distRedistribuicao`)
Após a proposta base (1 item por unidade), 10 equipamentos essenciais são
adicionados manualmente a unidades subatendidas, com base no impacto pedagógico —
não apenas no valor, mas na relevância para a graduação. A escolha é registrada em
`DIST_REDIST_OVERRIDES` com o motivo de cada item (tooltip no selo "redistribuição").

| unidade | item | valor | motivo |
|---|---|---|---|
| ICB | Câmara de pressão de Scholander | R$ 60 mil | Fisiologia vegetal/animal; 250 alunos, licenciatura (2º item; soma ao microscópio base de 800 alunos) |
| FEFD | Esteira ergométrica X-4.6TSI | R$ 86 mil | Avaliação física; 120 alunos, licenciatura |
| EVZ | Ultrafreezer -80°C | R$ 48 mil | Preservação de amostras biológicas; 100 alunos |
| IESA | Microscópio petrográfico | R$ 57 mil | Geociências; 200 alunos, licenciatura |
| EECA | Prensa de cisalhamento direto | R$ 120 mil | Mecânica dos solos; 135 alunos |
| FF | Espectrofotômetro leitor de placas | R$ 30 mil | Ensaios de absorbância em microplaca (ELISA, dosagem enzimática); 80 alunos; 2º item da Farmácia |
| IQ | Fotômetro de chama | R$ 50 mil | Química analítica (técnica distinta do UV-VIS já contemplado); 2º item, licenciatura |
| IPTSP | Câmera acoplada ao microscópio | R$ 22 mil | Captura/projeta lâminas para toda a turma; complementa o microscópio base; 150 alunos, licenciatura |
| EMAC | Mesa de luz cênica | R$ 20 mil | Operação de luz cênica — fundamental para as aulas práticas de teatro; 100 alunos, licenciatura |
| EA | Centrífuga de bancada p/ alimentos | R$ 27 mil | Separação/clarificação em tecnologia de alimentos; 90 alunos; 2º item da EA |

O mecanismo de `swap` (remover o item base da unidade e substituí-lo) continua
disponível, mas **nenhum item o usa atualmente** — todos os 10 são adicionados como
**2º equipamento** da unidade. Itens adicionados pela redistribuição recebem o selo
**"redistribuição"** na tabela.

---

## 4. Validação "alunos/semestre" × "capacidade por turma"

O levantamento foi preenchido pelos próprios labs e tem **inconsistências**:
labs com **0 alunos apesar de terem capacidade** (ex.: LAB209/FM), e labs com
alunos/semestre **muito acima** do que a sala comporta (razões de até 168×). Como
a regra "equipamento caro deve servir muitos alunos" depende desse número, ele é
**conferido contra a capacidade**:

- **`discValid(lab)`** — número usado **só no ranqueamento**:
  - `discentes === 0` → continua **0** (não ganha prioridade);
  - senão, limitado a `capacidade × DIST_FATOR_TURMAS` (=25 turmas/semestre);
  - **o número EXIBIDO nas tabelas continua sendo o bruto** (`lab.discentes`).
- **`consistenciaDiscentes(lab)`** — devolve `null` se coerente, ou um aviso curto
  quando: (a) 0 alunos com capacidade > 0; ou (b) alunos > `capacidade × 25`.
  O aviso vira o selo **"conferir alunos"** (`.badge.chk`) na coluna Alunos/sem.
- **Coluna "≈ custo / aluno-sem."** foi removida da tabela em v12 para evitar
  confusão. O número de alunos conferidos continua exposto via selo "conferir alunos".

> `DIST_FATOR_TURMAS` é um parâmetro de julgamento (quantas turmas/semestre são
> plausíveis num mesmo laboratório). Ajustável; documentar se mudar.

---

## 5. Mapa do código (`web/app.js`)

### Constantes (topo do arquivo, ~linhas 18–80)
| símbolo | o que é |
|---|---|
| `DIST_VERBA` | 1.350.000 |
| `DIST_MIN` | 20.000 (mínimo do item) |
| `DIST_TETO` | 150.000 (teto do item) |
| `DIST_FATOR_TURMAS` | 25 (validação alunos×capacidade) |
| `DIST_REDIST_MAX` | 10 (máx. de itens na redistribuição — reserva, não usado pelo algoritmo) |
| `DIST_REDIST_MIN` | 25.000 (valor mínimo p/ item da redistribuição — reserva) |
| `DIST_REDIST_TETO` | 150.000 (valor máximo p/ item da redistribuição — reserva) |
| `DIST_REDIST_OVERRIDES` | 10 itens de redistribuição escolhidos manualmente (`{key, swap?, motivo}`) |
| `DIST_LS` | chave do `localStorage` (**versionada** — ver §7) |
| `DIST_MANUAIS` | overrides manuais (unidade → `{key, motivo}`) |
| `DIST_AJUSTES` | derivado de `DIST_MANUAIS` (`chave → motivo`) |
| `DIST_VETADOS` | itens excluídos da elegibilidade (`chave → motivo`) |
| `DIST_MOTIVOS_ESPECIAIS` | exclusões por decisão (unidade → motivo) |

### Variáveis de estado
| símbolo | o que é |
|---|---|
| `distItems` | todos os itens anotados (`{e, lab, key, tipo, qtd, elegivel, vetado}`) |
| `distPorUnidade` | mapa unidade → [itens] |
| `distPrioLab` | mapa unidade → labId prioritário |
| `distSel` | Set de chaves dos itens selecionados |
| `distRedist` | Set de chaves dos itens adicionados pela redistribuição (preenchido por `DIST_REDIST_OVERRIDES`) |
| `distHeads` | mapa unidade → `{badge, total}` para atualização sem re-render |

### Funções principais
| função | papel |
|---|---|
| `buildDistData()` | anota itens (`{e, lab, key, tipo, qtd, elegivel, vetado}`), agrupa por unidade (`distPorUnidade`), calcula `distPrioLab`, carrega/gera `distSel` |
| `discValid(l)`, `consistenciaDiscentes(l)` | validação de alunos (§4) |
| `cmpPrioLab(a, b)` | ordem de prioridade entre labs da unidade |
| `distSuggest()` | seleção base por critérios (Set de chaves de item) |
| `distProposta()` | `distSuggest()` + vetos + exclusões + overrides manuais + redistribuição |
| `distRedistribuicao(sel)` | aplica os 5 itens de `DIST_REDIST_OVERRIDES` (trocas e adições manuais) |
| `distImpacto()` | métricas da seleção (total, unidades, labs, cursos, atendimentos) |
| `renderDist()` | dispatcher: chama `renderDistFinal()` ou `renderDistAjustar()` |
| `distMetodologiaCard()` | card "Como esta lista foi montada" + legenda dos selos |
| `distTabelaConfirmados(itens, n)` | tabela das unidades atendidas (selos + dados) |
| `distNaoAtendida(u)` | classifica unidade fora: `{rank, cat, catCls, motivo}` |
| `distMotivoTag(it)` | selo "vetado" ou "fora dos critérios" para itens na aba Ajustar |
| `renderDistFinal()` | monta a visão "Lista definitiva" (metodologia + atendidas + cursos + não atendidas) |
| `renderDistAjustar()` | monta a visão "Ajustar seleção" (checkboxes por unidade) |
| `exportDistCsv()` | exporta a seleção em CSV (separador `;`, BOM p/ Excel) |

### Chave de item
Formato `` `${labId}|${tipo}|${nome}|${valor}` ``, com sufixo `#n` para raras
duplicatas. É o identificador usado em `distSel`, `DIST_MANUAIS`, `DIST_AJUSTES`,
no CSV e no `localStorage`. **Se o `nome` ou `valor` mudar no `data.json`, a chave
muda** e qualquer referência fixa (overrides) precisa ser reapontada.

---

## 6. A interface (visão "Lista definitiva")

Ordem dos blocos em `renderDistFinal()`:
1. **Card de metodologia** (`distMetodologiaCard`) — sempre visível.
2. **Unidades atendidas** — tabela única (`distTabelaConfirmados`) com colunas:
   Unidade · Laboratório (+ selos) · Equipamento (+ tipo) · Custo total ·
   Alunos/sem. (+ selo "conferir") · Cursos · Descrição · Comentários · linha de **Total**.
3. **Cursos de graduação atendidos** — `<details>` expansível.
4. **Unidades não atendidas** — tabela ordenada por categoria (`distNaoAtendida`):
   `rank 0` "Avaliada e não atendida" (decisão registrada ou só itens acima do
   teto) → `rank 1` "Solicitou, mas fora dos critérios" → `rank 2` "Não solicitou
   equipamento". Cada linha traz um motivo **explicativo e específico**.

### Selos (badges) — significado
| selo | classe CSS | significado |
|---|---|---|
| licenciatura | `.badge.lic` | o lab atende cursos de licenciatura |
| prioritário | `.badge.prio` | lab priorizado pelos critérios (`distPrioLab`) |
| ajuste manual | `.badge.ajuste` | item trocado à mão (`DIST_MANUAIS`); tooltip = motivo |
| redistribuição | `.badge.redist` | item adicionado pela redistribuição do saldo da verba |
| conferir alunos | `.badge.chk` | alunos/sem. destoa da capacidade (§4); tooltip = detalhe |
| novo / existente | `.badge.tipo-*` | tipo do equipamento |
| vetado | `.tag-off.tag-vetado` | item excluído da seleção automática (veículo, pacote ou placeholder); tooltip = motivo |

O **card de verba** (`renderDistBudget`) mostra Investimento, Saldo, Unidades
atendidas, Laboratórios, Cursos e "Atendimentos de alunos/sem." (rotulado
"atendimentos" de propósito: um aluno pode ser contado por vários labs).

---

## 7. Estado e persistência

- A seleção viva é `distSel` (Set de chaves), salva em `localStorage[DIST_LS]`.
- **`DIST_LS` é versionada** (`distSelecao.vN`). **Regra de ouro:** sempre que você
  mudar a proposta padrão (regras, overrides, exclusões), **suba o número da
  versão** (ex.: `v7` → `v8`). Sem isso, o navegador do usuário continua carregando
  a seleção **antiga** salva, e ele não vê a mudança. Histórico das versões:
  `v4` lista curada à mão · `v5` FM/FH "sob análise" · `v6` regerada por critérios
  + FEN manual · `v7` teto 150k + item de maior valor + alunos validados · `v8` vetos + ajustes manuais EVZ/FEFD/FL + redistribuição da sobra · `v9` redistribuição limitada a 4 itens de R$ 30k–100k · `v10` redistribuição ampliada · `v11` 4 itens de redistribuição escolhidos manualmente (ICB câmara, FEFD esteira, EMAC cortina, EVZ ultrafreezer) · `v12` 5 itens manuais (ICB câmara, FEFD esteira, EVZ ultrafreezer, IESA microscópio petrográfico, EECA prensa); coluna custo/aluno removida; Pro Display XDR vetado · `v13` verba ampliada para R$ 1,35 mi; redistribuição passa a 8 itens — ICB deixa de fazer swap (câmara vira 2º item, somada ao microscópio base) e entram FF (espectrofotômetro UV), IQ (fotômetro de chama) e IPTSP (2º microscópio trinocular). Total ≈ R$ 1,331 mi, saldo ≈ R$ 19 mil · `v14` no IPTSP a câmera (R$ 22 mil, acoplada ao microscópio base) substitui o 2º microscópio, e entra a EMAC (mesa de luz cênica, R$ 20 mil) como 9º item da redistribuição. 9 unidades com 2 itens; total ≈ R$ 1,333 mi, saldo ≈ R$ 17 mil · `v15` na FF o **espectrofotômetro leitor de placas** (R$ 30 mil, 80 alunos) substitui o de UV com varredura, e entra a **EA** (centrífuga de bancada p/ alimentos, R$ 27 mil, 90 alunos) como 10º item — bancada técnica para uma unidade ainda sem 2º item. 10 unidades com 2 itens; total ≈ R$ 1,345 mi, saldo ≈ R$ 5 mil.
- Botões: **"Restaurar proposta"** (`distProposta()`), **"Desmarcar tudo"**,
  **"Exportar seleção (CSV)"**.

---

## 8. Receitas para mudanças comuns

> Depois de qualquer mudança que altere a **proposta padrão**, **suba `DIST_LS`**.

- **Mudar teto / mínimo / fator de turmas:** editar `DIST_TETO` / `DIST_MIN` /
  `DIST_FATOR_TURMAS`. Atualizar também o texto do card de metodologia
  (`distMetodologiaCard`) e o `<p class="intro">` do `index.html`.
- **Adicionar um ajuste manual:** acrescentar a unidade em `DIST_MANUAIS` com
  `{ key, motivo }`. `DIST_AJUSTES` e o selo saem de graça.
- **Vetar um item:** acrescentar a chave em `DIST_VETADOS` (`chave → motivo`).
  O item fica inelegível para seleção automática e redistribuição, mas ainda
  visível na aba "Ajustar seleção" com o selo "vetado" e tooltip com o motivo.
- **Excluir uma unidade por decisão:** acrescentar em `DIST_MOTIVOS_ESPECIAIS`
  (unidade → motivo). Ela some das atendidas e aparece em não atendidas com o texto.
- **Trocar a regra do item (mais caro ↔ mais barato):** inverter o `sort` em
  `distSuggest()` (§3.3).
- **Mudar a prioridade dos labs:** editar `cmpPrioLab` (§3.2).
- **Validar/regenerar fora do navegador:** dá para replicar a lógica em Node lendo
  `data.json` (mesma `anota`/`cmpPrioLab`/`distSuggest`) para conferir números
  antes de mexer no app. Foi assim que validamos cada rodada.

---

## 9. Decisões e histórico (por que está assim)

- **FEN = lavadora ultrassônica (ajuste manual):** o critério automático pegaria
  um "equipamento audiovisual" de outro lab; a lavadora é o que de fato é
  equipamento de laboratório para o edital.
- **EVZ = cabine de segurança biológica (ajuste manual):** o item de maior valor
  elegível seria a Fiat Strada (veículo), que não se enquadra no edital. A cabine
  de segurança biológica é equipamento de laboratório adequado e atende 80 alunos/sem.
- **FEFD = squat machine (ajuste manual):** o item de maior valor elegível seriam
  os tapetes de ginástica rítmica, que são um pacote de vários equipamentos (não
  um único equipamento). A squat machine é um equipamento individual adequado ao edital.
- **FL = câmera (ajuste manual):** o item de maior valor elegível seria a "ilha de
  edição", que é um conjunto de vários equipamentos de áudio/vídeo. A câmera é um
  equipamento individual que atende a mesma demanda de produção audiovisual.
- **Itens vetados (DIST_VETADOS):** veículos (Fiat Strada, Micro trator), pacotes
  multi-equipamento (Tapetes de ginástica rítmica, Ilha de edição, "Toda a
  sequência de produção de ração"), descrições placeholder ("EQUIPAMENTO DE AUDIO
  VISUAL") e monitor de luxo (Pro Display XDR) não se enquadram como equipamento
  individual de laboratório para este edital.
- **FM excluída:** seus únicos itens elegíveis (R$ 400 mil/600 mil) passam do teto
  e o lab indicado informa **0 alunos**.
- **UAECH excluída:** o único item elegível é uma "caixa de som" de R$ 50 mil,
  valor considerado **irreal**. O usuário decidiu **mantê-la fora** mesmo o critério
  querendo incluí-la (decisão registrada, não automática).
- **FD excluída:** demanda registrada como **lote único** (qtd 0, R$ 250 mil),
  sem itens individualizados para avaliar.
- **Teto 120k → 150k e "item mais caro":** para aproximar o gasto da verba
  (passou de ~R$ 686 mil para ~R$ 825 mil na base de 19 unidades).
- **Verba R$ 1,2 mi → R$ 1,35 mi (v13):** recálculo do edital. Os parâmetros e a
  metodologia continuam idênticos; a verba extra foi usada para **ampliar a
  redistribuição**, dando um **2º equipamento** a unidades de grande público em
  ciências básicas que só tinham um item modesto na base: **ICB**, **FF**, **IQ** e
  **IPTSP**. A ICB deixou de **trocar** (swap) o microscópio pela câmara de
  Scholander — agora fica com **os dois** (microscópio base de 800 alunos + câmara).
- **Redistribuição da sobra (v12→v13):** a proposta base (1 item por unidade) deixava
  grande saldo. Em vez de algoritmo automático, os equipamentos foram escolhidos
  manualmente com base no impacto pedagógico. Os 5 da v12: FEFD (esteira ergométrica,
  R$ 86 mil — avaliação física, 120 alunos, licenciatura), EVZ (ultrafreezer -80°C,
  R$ 48 mil — preservação de amostras biológicas, 100 alunos), IESA (microscópio
  petrográfico, R$ 57 mil — geociências, 200 alunos, licenciatura), EECA (prensa de
  cisalhamento direto, R$ 120 mil — mecânica dos solos, 135 alunos) e ICB (câmara de
  pressão de Scholander, R$ 60 mil — fisiologia, 250 alunos, licenciatura). Na **v13**,
  com a verba em R$ 1,35 mi, entraram mais 3 — **FF** (espectrofotômetro UV com varredura,
  R$ 45 mil — doseamento de fármacos), **IQ** (fotômetro de chama, R$ 50 mil — química
  analítica, técnica distinta do UV-VIS já contemplado) e **IPTSP** (2º microscópio
  trinocular — dobra a capacidade de microscopia) — e a ICB passou a manter
  microscópio base **e** câmara (sem swap). Na **v14**, a pedido do usuário, o 2º item do
  IPTSP virou a **câmera** (R$ 22 mil, acoplada ao microscópio base — captura/projeta as
  lâminas para a turma) no lugar do 2º microscópio, e entrou a **EMAC** (mesa de luz
  cênica, R$ 20 mil — equipamento fundamental para as aulas práticas de teatro, 100 alunos,
  licenciatura), por ser uma unidade ainda sem 2º item e com item bem documentado. Na
  **v15**, a pedido do usuário, o 2º item da FF passou do espectrofotômetro UV com
  varredura para o **leitor de placas** (R$ 30 mil, 80 alunos — ensaios de absorbância em
  microplaca), e o saldo liberado entrou como **EA** (centrífuga de bancada para alimentos,
  R$ 27 mil, 90 alunos), preferida por ser "bancada técnica" com bom público entre as opções
  de ~R$ 30 mil disponíveis. Cada item tem motivo registrado (tooltip no selo
  "redistribuição"). Total ≈ R$ 1,345 mi; saldo final ≈ R$ 5 mil; 10 unidades com 2 equipamentos.
- **Cortina de isolamento acústico (EMAC) removida:** envolve mão de obra e manutenção,
  não é equipamento autônomo. Substituída pelo microscópio petrográfico (IESA) e pela
  prensa de cisalhamento (EECA) para melhor aproveitamento da verba.
- **Coluna custo/aluno removida (v12):** a coluna "≈ Custo / aluno-sem." foi removida
  da tabela para evitar confusão. A informação de alunos conferidos permanece via selo.

### Limitação conhecida (em aberto para decisão do usuário)
A regra "item de maior valor por lab", **sozinha**, às vezes coloca os itens mais
caros em labs de **pouco público** (ex.: um item de R$ ~100 mil para 30–50 alunos),
enquanto um lab de 800 alunos leva um item de R$ 20 mil — porque foi só isso que
ele pediu dentro dos critérios, e a estrutura "1 lab por unidade" não permite mover
um item de uma unidade para outra. A redistribuição da sobra (v8–v9) mitiga isso
parcialmente, mas não resolve todos os casos (ex.: ICB, com 800 alunos, não tem
outro item elegível de valor maior). Os selos continuam expostos para transparência.
Se for preciso **forçar** "caro ↔ muitos alunos",
a opção é um **teto de valor proporcional aos alunos válidos** (um "R$ por aluno");
ainda não implementado por ser uma decisão de política do usuário.

---

## 10. Convenções e armadilhas

- **Tudo em pt-BR** (textos e dados). Mantenha as strings de UI em português.
- **`valor` = custo total** da linha, não unitário. O "≈ por unidade" é `valor ÷ qtd`.
- Moeda via `fmtBRL()`; parsing pt-BR via `parseNum()` (milhar `.`, decimal `,`).
- **Todo conteúdo dinâmico passa por `esc()`** (evita XSS). Não monte HTML com dado
  cru.
- **Não regenere `data.json`** a menos que as planilhas-fonte mudem (ver `../CLAUDE.md`).
- O front precisa de **servidor** (`python -m http.server 8731`), não abre por
  `file://` (o `fetch` falha).
- **Sem framework / sem build / sem npm.** JS/CSS/HTML puro.
- Preserve a **acessibilidade** existente (ARIA, navegação por teclado, foco,
  `aria-live`) ao mexer na UI.
