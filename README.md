# CHORA+

Solução de **Controlo de Horas e Registo de Atividades** para contratos públicos
de prestação de serviços em regime de *outsourcing*, implementada como extensão
do Azure DevOps. Este repositório contém o **protótipo** (secções 1 e 2 da
especificação): domínio, API REST e extensão — **sem base de dados real e sem o
módulo de IA**.

## Arquitetura

Monorepo pnpm com três pacotes independentes (ADR-01):

| Pacote | Papel | Depende de |
|---|---|---|
| [`@chora/domain`](packages/domain) | Entidades, invariantes, máquinas de estado e motor de regras. Puro TypeScript + Zod + Luxon, sem framework (ADR-02). | — |
| [`@chora/api`](packages/api) | API REST (Fastify), repositórios em memória atrás de interfaces, autenticação, auditoria, seed e alertas. | `@chora/domain` |
| [`@chora/extension`](packages/extension) | Extensão Azure DevOps (React) com as três vistas. | `@chora/api` (por HTTP) |

O domínio é o artefacto de maior valor e o mais longevo. A persistência real
(MongoDB) e o módulo de validação de faturas por IA ficam para o desenvolvimento
final e estão desenhados como **pontos de extensão** (secção 14 da especificação).

## Requisitos

- Node.js 20+ (testado em 22)
- pnpm 9+

## Comandos

```bash
pnpm install                 # instala o workspace
pnpm -r test:run             # testes de todos os pacotes
pnpm --filter @chora/domain test:cov   # cobertura do domínio (≥95% em rules/ e calculos/)
pnpm -r typecheck            # verificação de tipos estrita
pnpm dev                     # sobe a API na porta 7071 (FakeTokenValidator)
pnpm seed                    # imprime o resumo do seed determinístico
pnpm run docs                # regenera openapi.yaml, catalogo-regras.md, modelo-dados.md
```

> Nota: use `pnpm run docs` (e não `pnpm docs`), porque `docs` colide com um
> comando embutido do pnpm.

### Experimentar a API

A API arranca com o `FakeTokenValidator`: o utilizador vai no cabeçalho
`X-Dev-User`. Utilizadores de demonstração: `oid-gestor-contrato`,
`oid-gestor-tecnico`, `oid-recurso-01…03`.

```bash
pnpm dev
curl -s http://localhost:7071/api/v1/contratos -H "X-Dev-User: oid-gestor-contrato"
curl -s -X POST http://localhost:7071/api/v1/jobs/alertas:executar -H "X-Dev-User: oid-gestor-contrato"
```

## Estado por fase (secção 13 da especificação)

- ✅ **Fase 0 — Fundações**: monorepo, TypeScript estrito, Vitest.
- ✅ **Fase 1 — Domínio**: entidades + Zod, enumerações, máquinas de estado,
  catálogo completo `RN-101`…`RN-704` (56 regras), cálculos de consumo/prazos/
  execução financeira. Cobertura ≥ 95 % em `rules/` e `calculos/` (209 testes).
- ✅ **Fase 2 — API**: Fastify, repositórios em memória, `TokenValidator`,
  matriz de permissões, `problem+json`, auditoria em cada mutação, seed e job de
  alertas (17 testes de integração).
- ✅ **Fase 3 — Front-end**: extensão Azure DevOps com as três vistas, cliente
  API, componentes partilhados. Compila (`typecheck`); a instalação numa
  organização real fica para o desenvolvimento final.
- ◑ **Fase 4 — Auth/Autz**: matriz aplicada na API (ADR-13); as três
  implementações de `TokenValidator` existem (Fake funcional; Ado/Entra stub).
- ◑ **Fase 5 — Relatórios e alertas**: relatórios determinísticos e todos os
  códigos de alerta da secção 11 acionáveis; exportação assíncrona por desenhar.
- ◑ **Fase 6 — Faturação determinística**: regras RN-601…RN-607 no domínio e no
  seed; a rota de conferência e o stub `IFaturaValidator` ficam documentados.
- ✅ **Fase 7 — Handoff**: `docs/openapi.yaml`, `docs/modelo-dados.md`,
  `docs/catalogo-regras.md` (gerado), ADRs.

Ver [`docs/`](docs) para o catálogo de regras, o modelo de dados MongoDB e o
contrato OpenAPI, todos regeneráveis com `pnpm run docs`.

## Convenções

- Todo o domínio e as mensagens de erro em **português europeu (pós-AO90)**;
  primitivas técnicas em inglês.
- Nenhum campo `string` nu para valores tipados — ver `DataISO`, `InstanteISO`,
  `MesISO`, `Cent`, `Minutos`, `AnoCivil` (secção 5.3.1).
- As regras de negócio são funções puras testadas em
  `packages/domain/src/rules/`, referenciadas pelo código `RN-xxx` nos erros da
  API (ADR-06). O catálogo é normativo (secção 6).

As decisões de desenho tomadas durante a implementação estão em
[`docs/adr/`](docs/adr).
