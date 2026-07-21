# ADR-11 — Distinção entre regras de bloqueio e regras consultivas

## Estado
Aceite (Fase 1).

## Contexto
A secção 6 da especificação lista, com o mesmo formato `RN-xxx`, dois tipos de
regra que têm consequências operacionais diferentes:

- **Bloqueio** — a violação impede a operação e é mapeada para `422` na API
  (ex.: RN-301, limite de serviços complementares).
- **Aviso** — a condição indesejada é sinalizada mas *não* impede a operação;
  gera um alerta (secção 11). Exemplos: RN-109 (declaração de conflito de
  interesses), RN-204, RN-302, RN-306, RN-404, RN-505, RN-605, RN-703.

O tipo `ResultadoRegra` é binário (`ok` / violação) e não distingue estes casos.

## Decisão
Acrescenta-se à interface `Regra<Ctx>` um campo opcional `bloqueia: boolean`
(por omissão `true`). As regras consultivas declaram `bloqueia: false`.

- `exigir()` (que converte violações em `ViolacaoRegra`) só deve ser invocado
  sobre regras de bloqueio.
- Os jobs de alerta (secção 11) avaliam as regras consultivas: um resultado
  `ok: false` numa regra consultiva significa "condição de alerta ativa", não
  "operação proibida".

Todas as regras — de bloqueio ou consultivas — continuam a ser funções puras
testadas com pelo menos um caso positivo e um negativo, satisfazendo a
normatividade da secção 6 e a matriz de testes da secção 12.2.

## Consequências
- A camada de API nunca bloqueia uma operação por uma regra consultiva.
- A geração do catálogo (`pnpm docs`) distingue visualmente os dois tipos.
- Não há alteração ao formato `application/problem+json` (ADR-06).
