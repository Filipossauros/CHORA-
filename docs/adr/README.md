# Registo de decisões de arquitetura (ADR)

ADR-01 a ADR-10 estão fixados na secção 3 da especificação e são pressupostos do
protótipo. Os ADR abaixo registam decisões tomadas **durante a implementação**
(secção 0, regra 6).

| ADR | Decisão | Fase |
|---|---|---|
| [ADR-11](ADR-11-regras-consultivas.md) | Distinção entre regras de bloqueio e regras consultivas (`bloqueia`). | 1 |
| [ADR-12](ADR-12-verbos-rpc-router.md) | Reescrita de verbos-RPC (`recurso:acao`) no router da API. | 2 |
| [ADR-13](ADR-13-autorizacao.md) | Autorização por papel aplicacional como lógica pura testável. | 2 |
| [ADR-14](ADR-14-nome-relatorio-evidencia.md) | Materialização do nome no `RelatorioEvidencia` (exceção à minimização). | diferida |

## Decisões em aberto (a fixar no desenvolvimento final)

- **Validador de token de produção** (secção 9.2): escolha entre
  `AdoConnectionDataValidator` e `EntraIdJwtValidator`. Ambos existem como
  interface; o `EntraIdJwtValidator` requer *app registration* próprio.
- **Redação da *query string*** em *reverse proxy*/APM (secção 8.4): requisito de
  configuração de infraestrutura, fora do âmbito do protótipo.
