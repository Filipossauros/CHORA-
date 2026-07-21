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
pnpm install          # instala o workspace
pnpm test             # testes de todos os pacotes
pnpm --filter @chora/domain test:cov   # cobertura do domínio
pnpm build            # compila todos os pacotes
pnpm dev              # sobe a API (7071) [+ extensão, quando disponível]
pnpm seed             # popula os repositórios em memória com dados de demonstração
pnpm docs             # regenera openapi.yaml, catalogo-regras.md, modelo-dados.md
```

## Estado por fase (secção 13 da especificação)

- ✅ **Fase 0 — Fundações**: monorepo, TypeScript estrito, Vitest.
- ✅ **Fase 1 — Domínio**: entidades + Zod, enumerações, máquinas de estado,
  catálogo completo `RN-101`…`RN-704`, cálculos de consumo/prazos/execução
  financeira. Cobertura ≥ 95 % em `rules/` e `calculos/`.
- 🚧 **Fase 2 — API**: em curso.
- ⬜ Fases 3–7.

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
