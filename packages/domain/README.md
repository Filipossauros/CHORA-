# @chora/domain

Camada de domínio do CHORA+: entidades, invariantes, máquinas de estado e motor
de regras. **Puro** TypeScript + Zod + Luxon — sem HTTP, base de dados ou
framework (ADR-02).

## Conteúdo

- `src/enums/` — enumerações (tipo + esquema Zod lado a lado).
- `src/tipos/` — primitivos (`DataISO`, `InstanteISO`, `MesISO`, `Cent`, …) e a
  fronteira temporal (`agora()` injetável, feriados PT, aritmética de calendário).
- `src/entidades/` — entidades com esquemas Zod (fonte única de verdade).
- `src/erros/` — `Regra`, `ResultadoRegra`, `ViolacaoRegra`.
- `src/rules/` — catálogo normativo `RN-101`…`RN-704` (secção 6). Uma função
  pura por regra, com caso positivo e negativo em `test/`.
- `src/calculos/` — consumo, prazos/vigência, execução financeira, preço/hora.
- `src/maquinas-estado/` — registo de tempo, contrato, fatura, por papel.

## Extração isolada

O pacote não tem dependências de outros pacotes do monorepo. Para o extrair:
copiar `packages/domain`, manter `zod` e `luxon` como dependências, e o
`tsconfig.base.json` (ou inline das opções `strict`). Nada mais é necessário.

## Comandos

```bash
pnpm --filter @chora/domain test:run
pnpm --filter @chora/domain test:cov     # cobertura ≥95% em rules/ e calculos/
pnpm --filter @chora/domain typecheck
```
