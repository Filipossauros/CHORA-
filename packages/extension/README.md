# @chora/extension

Extensão Azure DevOps (React) do CHORA+ com as três vistas (secção 10.3):

- **V1 — Registo de tempo no work item** (`src/paineis/registo-tempo/`):
  `work-item-form-page`. Formulário compacto com validação otimista (RN-405) e
  lista dos registos próprios.
- **V2 — Aprovações** (`src/hubs/aprovacoes/`): tabela com filtros, seleção
  múltipla, aprovação/rejeição em lote com relatório de resultado por item.
- **V3 — Área do Gestor** (`src/hubs/area-gestor/`): execução física (barras de
  consumo), execução financeira e alertas.

Componentes partilhados em `src/comum/`: `ClienteApi` (injeção de token,
tradução de `problem+json`), formatadores (cêntimos→EUR, minutos→`Hh MMm`),
`BarraConsumo`, `EtiquetaEstado`, `PainelViolacoes`, hooks de dados.

## Limitações respeitadas (secção 10.1)

- UI em iframe *sandboxed*; interação com o host via SDK (`src/sdk.ts`).
- Sem *Data Storage* do ADO e sem `localStorage` para dados de negócio.
- Tema do host via tokens CSS, não cores fixas.

## Build e instalação

```bash
pnpm --filter @chora/extension typecheck
pnpm --filter @chora/extension build      # webpack → dist/
pnpm --filter @chora/extension package     # tfx → .vsix
```

A instalação numa organização de teste e a validação ponta-a-ponta ficam para o
desenvolvimento final (Fase 3 da especificação). Defina `window.CHORA_API_BASE`
para apontar à API.
