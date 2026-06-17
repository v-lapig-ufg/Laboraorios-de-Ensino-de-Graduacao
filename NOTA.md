# Nota de infraestrutura do laboratório (0–10)

A **Nota** é um índice 0–10 que resume as condições de infraestrutura de cada laboratório,
apuradas na **seção 5** do levantamento de 2024. Ela é a reprodução fiel da medida DAX `Nota`
do antigo dashboard Power BI (`extracted_pbit/DataModelSchema_utf8.json`).

## Como é calculada

Começa em **10** e subtrai penalidades. **Nota = 10 − Σ penalidades** (mínimo 0).

| # | Penalidade | Condição | Valor |
|---|---|---|---|
| 1 | Risco à segurança **física** | campo 5.7, escala 0–10 | `risco × 0,2` |
| 2 | Risco à segurança **patrimonial** | campo 5.8, escala 0–10 | `risco × 0,2` |
| 3 | Tomadas insuficientes | 5.1 = "Não" | 0,75 |
| 4 | Iluminação insuficiente | 5.2 = "Não" | 0,75 |
| 5 | Ar-condicionado ausente/inoperante | 5.3 = "Não" **ou** "Não possui aparelho de ar condicionado" | 0,75 |
| 6 | Sem rede | 5.5 (Wi-Fi própria) = "Não" **E** 5.6 (eduroam) = "Não" | 0,75 |
| 7 | Descarte de líquidos inadequado | 5.10 = "Não" | 0,75 |
| 8 | Descarte de sólidos inadequado | 5.12 = "Não" | 0,75 |
| 9 | Necessita adequação predial | 5.14 = "Sim" | 0,75 |
| 10 | Necessita adequação de acessibilidade | 5.15 = "Sim" | 0,75 |

- As penalidades 1 e 2 (riscos) contribuem com até 2,0 cada (risco 10 × 0,2). As demais valem 0,75
  quando aplicáveis. Penalidade total máxima = 10,0 → Nota mínima = 0.
- "Não se aplica" (resíduos) **não** penaliza — só "Não" penaliza.

## Laboratórios "não avaliados"

~17 laboratórios deixaram a seção 5 inteiramente em branco. Como "em branco" não casa "Não"/"Sim" e os
riscos viram 0, a fórmula daria Nota 10 artificialmente. Por isso, quando **nenhum** campo textual da
seção 5 foi respondido (e os riscos são 0), o laboratório é marcado `notaValida = false` e aparece como
**"—" / não avaliado** (nunca como 10). Esses labs ficam por último ao ordenar pela Nota.

## Onde a Nota aparece no dashboard

- **Aba Laboratórios:** coluna *Nota* (pílula colorida: ≥8 verde · ≥5 âmbar · <5 vermelho).
- **Aba Infraestrutura:** coluna *Nota* e a sub-visão **Notas (ranking)** (pior primeiro).
- **Modal do laboratório:** card *Nota de infraestrutura* com o detalhamento item a item de como ela foi
  obtida, mais a **média da unidade** (medida `Media_Unidade` do Power BI).

## Implementação

- Cálculo: `computa_nota()` em `scripts/build_dashboard_json.py` — gera `nota`, `notaValida` e
  `notaBreakdown` (lista dos 10 critérios com `aplicado`/`penalidade`) em cada laboratório do `data.json`.
- A média por unidade vai em `meta.mediaNotaPorUnidade`.
- Renderização: `notaPill()` e `notaCardHTML()` em `web/app.js`.
