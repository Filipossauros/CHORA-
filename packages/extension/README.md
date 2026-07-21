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

## Pré-visualização local no browser (sem Azure DevOps)

Para ver e clicar nas três vistas contra a API local com dados de *seed*, sem
publicar no Marketplace, use o harness de pré-visualização. Este substitui o SDK
do Azure DevOps por um stub (o token é o `X-Dev-User`, aceite pelo
`FakeTokenValidator`) e serve as vistas num browser normal.

Em dois terminais:

```bash
# Terminal 1 — API com dados de seed (porta 7071)
pnpm dev

# Terminal 2 — harness de pré-visualização (porta 3000)
pnpm --filter @chora/extension preview
```

Abra **http://localhost:3000**. No cabeçalho pode trocar de **utilizador**
(gestor de contrato, gestor técnico, elemento) e de **vista** (V1/V2/V3), e
observar a autorização a mudar — por exemplo, um elemento não vê as ações de
aprovação (RN-407, RN-501). Se a API correr noutro endereço, defina
`window.CHORA_API_BASE` antes de carregar a página.

> O harness (`preview/`) **não** faz parte da extensão distribuída — serve
> apenas para validação local.

## Demonstração no GitHub Pages (só browser, sem servidor)

A pasta `pages/` contém uma demonstração **estática**: corre o domínio, os
serviços e o *seed* inteiramente no browser (o `ClienteMemoria` reencaminha os
pedidos das vistas para os serviços reais, em memória). As regras `RN-xxx` e a
autorização por papel são as verdadeiras; os dados reiniciam ao recarregar.

O workflow `.github/workflows/pages.yml` faz o build (`pages:build`) e publica no
GitHub Pages a cada *push*. Para ativar (uma vez): **Settings → Pages → Build and
deployment → Source: GitHub Actions**. O URL fica em
`https://<utilizador>.github.io/<repo>/`.

Build local da demo:

```bash
pnpm --filter @chora/extension pages:build   # → packages/extension/pages-dist/
```

## Build e instalação

```bash
pnpm --filter @chora/extension typecheck
pnpm --filter @chora/extension build      # webpack → dist/
pnpm --filter @chora/extension package     # tfx → .vsix
```

A instalação numa organização de teste e a validação ponta-a-ponta ficam para o
desenvolvimento final (Fase 3 da especificação). Defina `window.CHORA_API_BASE`
para apontar à API.
