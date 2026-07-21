# ADR-12 — Reescrita de verbos-RPC no router da API

## Estado
Aceite (Fase 2).

## Contexto
A secção 8.1 especifica rotas no estilo `recurso:acao` — por exemplo
`POST /registos-tempo:aprovar`, `POST /jobs/alertas:executar`. O router do
Fastify (find-my-way) interpreta o `:` a meio de um segmento como o início de um
parâmetro nomeado, o que faz `registos-tempo:aprovar` e `registos-tempo:rejeitar`
colidirem na mesma rota paramétrica e o servidor recusar o arranque.

## Decisão
Mantém-se o **contrato externo** exatamente como na secção 8.1 (`:acao`). Na
fronteira, a instância Fastify usa `rewriteUrl` para reescrever, antes do
encaminhamento, qualquer segmento `…:acao` para uma forma interna com barra
(`…/_acao`). As rotas são registadas com a forma interna. A função
`reescreverVerbo` está isolada e testada implicitamente pelos testes de
integração, que invocam sempre a forma externa com `:`.

## Alternativas consideradas
- Trocar os `:` por `/` no próprio contrato: rejeitada, alteraria a API pública
  face à especificação.
- Escapar o `:` no router: não suportado de forma limpa pelo find-my-way.

## Consequências
- O cliente e o OpenAPI continuam a usar `:aprovar`, `:rejeitar`, `:executar`.
- Qualquer nova rota-RPC funciona sem configuração adicional.
