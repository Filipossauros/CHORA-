# ADR-13 — Autorização por papel aplicacional

## Estado
Aceite (Fase 2; consolidação na Fase 4).

## Contexto
A secção 9.3 define uma matriz de permissões por papel aplicacional
(`GESTOR_CONTRATO`, `GESTOR_TECNICO`, `ELEMENTO_EQUIPA_TECNICA`). A secção 9.1
determina que a autorização é decidida a partir dos papéis do utilizador, e a
RN-501 é explícita: a aprovação depende do papel aplicacional do contraente
público, **não** da flag `perfilDeGestao` do perfil contratual do adjudicatário.

## Decisão
A matriz de permissões é lógica pura (`packages/api/src/auth/permissoes.ts`),
independente de HTTP, indexada por operação. As rotas verificam `podeExecutar`
antes de qualquer efeito e devolvem `403` quando o papel é insuficiente — mesmo
em chamada direta à API, não apenas na UI (critério de aceitação da Fase 4).

`perfilDeGestao` permanece uma categoria de faturação sem qualquer efeito na
autorização, cumprindo a RN-501.

## Nota sobre a localização
A especificação diz "autorização decidida no domínio". No protótipo, a matriz
vive na camada da API por ser onde o `ContextoUtilizador` (resolvido do token)
está disponível; é, ainda assim, uma função pura e testável, extraível para o
domínio sem alteração de assinatura se essa fronteira for revista no
desenvolvimento final.

## Consequências
- Testes confirmam `403` para papéis não autorizados em cada operação da matriz.
- A decisão de autorização é auditável (`EventoAuditoria` com resultado `NEGADO`).
