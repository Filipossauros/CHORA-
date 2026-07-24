# Catálogo de regras de alertas

> Documento **gerado** a partir de `packages/domain/src/alertas/` por `pnpm docs`. Não editar à mão.

As regras de alertas (AL-xxx) estão **separadas** das regras de negócio (RN-xxx)
para facilidade de gestão. Os alertas são sempre **consultivos**: sinalizam
preocupações de execução, não bloqueiam decisões.

Total de alertas: **13**.

| Código | Alerta | Condição | Severidade base | Regra ligada | Base legal / nota |
|---|---|---|---|---|---|
| AL-COMPLEMENTARES-40 | Consumo de serviços complementares (40%) | Os serviços complementares acumulados atingiram 40% do preço inicial. | AVISO | RN-302 | Prevenção de reparo em auditoria (limite de 50%, RN-301). |
| AL-COMPLEMENTARES-45 | Consumo de serviços complementares (45%) | Os serviços complementares acumulados atingiram 45% do preço inicial. | CRITICO | RN-302 | Prevenção de reparo em auditoria (limite de 50%, RN-301). |
| AL-FATURA-PRAZO | Prazo de pagamento de fatura | Fatura por pagar com data-limite próxima ou ultrapassada. | AVISO | — | Prazos de pagamento a fornecedores. |
| AL-PERFIL-80 | Consumo do perfil (80%) | Um perfil atingiu 80% do consumo de horas ou de valor previsto. | AVISO | RN-505 | Acompanhamento de saldos de execução. |
| AL-PERFIL-90 | Consumo do perfil (90%) | Um perfil atingiu 90% do consumo de horas ou de valor previsto. | CRITICO | RN-505 | Acompanhamento de saldos de execução. |
| AL-PORTARIA-REPROGRAMAR | Portaria de extensão de encargos a reprogramar | A vigência do contrato ultrapassa o último ano coberto pela portaria de extensão de encargos; para manter a execução plurianual é necessário pedir a reprogramação da portaria. | AVISO | — | LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — repartição plurianual de encargos. |
| AL-SUSPENSAO-VIGENCIA | Suspensão empurra a vigência além dos 36 meses | A deslocação do prazo de execução por suspensões projeta a vigência para além dos 36 meses sem exceção fundamentada. | AVISO | RN-204 | Separar prazo de vigência de prazo de execução — exceção fundamentável. |
| AL-TERMINO-3M | Término a menos de 3 meses | Faltam 3 meses ou menos para o término contratual. | CRITICO | — | Planeamento da transição (secção 11). |
| AL-TERMINO-6M | Término a menos de 6 meses | Faltam 6 meses ou menos para o término contratual. | AVISO | — | Planeamento da transição (secção 11). |
| AL-TRANSICAO-ANO | Saldo por executar no fim da vigência | Término próximo, com saldo por executar, sem portaria de extensão e sem transição registada. | AVISO | — | LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — transição de encargos. |
| AL-VALOR-DISPONIVEL | Valor disponível reduzido | O contrato tem 40% ou menos do valor atual por executar. | AVISO | — | Ponderar trabalhos complementares (secção 11). |
| AL-VIGENCIA-36M | Vigência aproxima-se ou excede 36 meses | A vigência (início → término contratual) excede o limite de 36 meses. | CRITICO | RN-202 | CCP, art. 440.º e 48.º — exceção fundamentável. |
| AL-VISTO-PENDENTE | Visto do TdC pendente | Contrato em execução que exige visto prévio, sem visto obtido nem visto tácito. | CRITICO | — | LOPTC (Lei n.º 98/97) — fiscalização prévia. |
