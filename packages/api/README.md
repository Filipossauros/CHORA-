# @chora/api

API REST (Fastify) do CHORA+. Persistência **em memória** atrás de interfaces
`Repository<T>` (ADR-03) — a substituição por MongoDB não toca em domínio nem em
rotas.

## Estrutura

- `src/repositorios/` — `Repository<T>` (interface) e implementação em memória.
- `src/auth/` — `TokenValidator` (Fake/Ado/Entra) e matriz de permissões.
- `src/servicos/` — casos de uso (registos de tempo, contratos, auditoria).
- `src/rotas/` — rotas da secção 8.
- `src/erros/` — mapeamento para `application/problem+json` (ADR-06).
- `src/alertas/` — job determinístico (secção 11).
- `src/seed/` — dados de demonstração determinísticos (secção 12.1).
- `src/openapi/` — geração do contrato OpenAPI (ADR-05).

## Segurança de transporte (secção 8.3/8.4)

Todas as respostas incluem `Cache-Control: no-store` e `X-Request-Id`. Qualquer
credencial em *query string* (`?token=`, `?access_token=`) é rejeitada com `401`
e auditada. Autenticação por `Authorization: Bearer` ou, em dev, `X-Dev-User`.

## Extração e caminho para produção

Substituir `src/repositorios/memoria` por implementações MongoDB (ver
`docs/modelo-dados.md`), escolher o `TokenValidator` de produção (secção 9.2) e
ligar os pontos de extensão da secção 14 (`IFaturaValidator`, `Notifier`,
`ArquivoDocumental`, `ClienteAzureDevOps`, `ClientePortalBase`).

## Comandos

```bash
pnpm --filter @chora/api dev        # porta 7071
pnpm --filter @chora/api seed
pnpm --filter @chora/api test:run
```
