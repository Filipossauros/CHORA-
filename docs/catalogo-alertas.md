# Catálogo de regras de alertas

> Documento **gerado** a partir de `packages/domain/src/alertas/` por `pnpm docs`. Não editar à mão.

As regras de alertas (AL-xxx) estão **separadas** das regras de negócio (RN-xxx)
para facilidade de gestão. Os alertas são sempre **consultivos**: sinalizam
preocupações de execução, não bloqueiam decisões.

Os alertas com **janela de decisão** indicam a data-limite para agir, calculada
para trás a partir do evento-âncora com o prazo de instrução do ato (parametrizado
na base legal versionada). Nesses, a severidade escala à medida que a janela se fecha.

A **nota jurídica** acompanha as ações propostas na aplicação: enuncia o que a
facilidade de praticar o ato **não dispensa**.

Total de alertas: **22**.

## Tempo × dinheiro

| Código | Alerta | Condição | Severidade base | Janela de decisão | Regra ligada | Base legal / nota | Nota jurídica das ações |
|---|---|---|---|---|---|---|---|
| AL-FOLGA-SEM-TEMPO | Folga financeira sem tempo para a executar | Ao ritmo de execução recente, o contrato termina a vigência deixando saldo por executar. Quantifica o valor que se perde. | AVISO | término da vigência (prazo de instrução de uma modificação) | — | Cruzamento da projeção de execução com o término da vigência. | Executar o saldo dentro do prazo não dispensa: a prorrogação ser admissível face ao objeto e ao limite de vigência (RN-202); haver cobertura orçamental para o período acrescido; e a modificação ser fundamentada e registada. Acelerar o ritmo de execução não legitima registar trabalho não prestado. |
| AL-FIM-ANO-ECONOMICO | Transição de saldo a pedir antes do fecho do ano | Há saldo por executar, o contrato não tem portaria de extensão de encargos e aproxima-se o fecho do ano económico: o pedido de transição tem de estar instruído até à data-limite. | AVISO | fecho do ano económico (31/12) | — | LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — transição de encargos. | A transição de saldo não dispensa: a autorização da entidade competente; o cabimento no orçamento do ano seguinte; e a observância do limite legal de transição. O saldo transitado continua sujeito à vigência do contrato — transitar dinheiro não prorroga o prazo. |
| AL-EXECUCAO-EXCEDE-ANO | Execução projetada excede a dotação do ano | A execução projetada para o ano económico excede o montante que a portaria de extensão de encargos reparte para esse ano. | CRITICO | — | — | LCPA / DL n.º 127/2012 — a execução não pode exceder a dotação repartida. | Conter ou reprogramar não dispensa a proibição de assumir despesa sem cabimento e compromisso prévios (LCPA). A execução acima da dotação repartida não se regulariza a posteriori pelo simples registo. |
| AL-VALOR-DISPONIVEL | Valor disponível reduzido | O contrato tem 40% ou menos do valor atual por executar. | AVISO | — | — | Ponderar trabalhos complementares (secção 11). | O reforço por trabalhos complementares não dispensa: o limite de 50% do preço inicial (RN-301); a verificação dos pressupostos de circunstância imprevista e de não separabilidade técnica ou económica; e a fundamentação escrita da modificação. |

## Cobertura orçamental plurianual

| Código | Alerta | Condição | Severidade base | Janela de decisão | Regra ligada | Base legal / nota | Nota jurídica das ações |
|---|---|---|---|---|---|---|---|
| AL-PORTARIA-LIMITA-VIGENCIA | Portaria limita a vigência abaixo do máximo legal | A portaria de extensão de encargos cobre menos anos do que o contrato poderia ter de vigência (36 meses líquidos): reprogramá-la liberta meses de vigência. | AVISO | início do ano económico a cobrir | RN-202 | LCPA / DL n.º 127/2012 — repartição plurianual de encargos. | A reprogramação da portaria não dispensa: a autorização dos membros do Governo competentes; a demonstração da cobertura em cada ano abrangido; e a compatibilidade com o limite de vigência do contrato. |
| AL-PORTARIA-REPROGRAMAR | Portaria de extensão de encargos a reprogramar | A vigência do contrato ultrapassa o último ano coberto pela portaria de extensão de encargos: sem reprogramação não há cobertura orçamental para o período remanescente. | AVISO | início do ano económico a cobrir | — | LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — repartição plurianual de encargos. | A reprogramação da portaria não dispensa: a autorização dos membros do Governo competentes; a demonstração da cobertura em cada ano abrangido; e a compatibilidade com o limite de vigência do contrato. Sem cobertura, a execução no período não coberto é despesa sem compromisso. |
| AL-PORTARIA-ANO-INSUFICIENTE | Dotação do ano esgota-se antes do fim do ano | Ao ritmo recente, o montante que a portaria reparte para o ano corrente esgota-se antes de 31/12. | AVISO | — | — | LCPA / DL n.º 127/2012 — acompanhamento da dotação anual. | — |

## Capacidade e perfis

| Código | Alerta | Condição | Severidade base | Janela de decisão | Regra ligada | Base legal / nota | Nota jurídica das ações |
|---|---|---|---|---|---|---|---|
| AL-PERFIL-ESGOTA-ANTES-TERMINO | Perfil esgota-se antes do término | Ao ritmo de consumo recente, as horas do perfil esgotam-se antes do término da vigência. Acompanha a escada de opções de atuação. | AVISO | data prevista de esgotamento do perfil | RN-505 | Projeção determinística do ritmo recente (camada de previsões). | As vias de reforço de capacidade não dispensam: a observância do objeto do contrato e do perfil contratado — não se reafeta pessoal para tarefa alheia ao objeto; a verificação da habilitação e da idoneidade do executante; a autorização prévia da subcontratação ou da cessão da posição contratual; a fundamentação e o registo da modificação contratual, quando exista; e o cabimento e compromisso prévios da despesa que dela resulte. |
| AL-PERFIL-80 | Consumo do perfil (80%) | Um perfil atingiu 80% do consumo de horas ou de valor previsto. | AVISO | — | RN-505 | Acompanhamento de saldos de execução. | — |
| AL-PERFIL-90 | Consumo do perfil (90%) | Um perfil atingiu 90% do consumo de horas ou de valor previsto. | CRITICO | — | RN-505 | Acompanhamento de saldos de execução. | — |
| AL-CAPACIDADE-INSUFICIENTE | Capacidade insuficiente até ao término | A soma das horas disponíveis em todos os perfis não chega para cobrir a execução até ao término, ao ritmo recente. | CRITICO | — | — | Projeção agregada de capacidade (camada de previsões). | Reforçar a capacidade não dispensa: a observância do objeto do contrato e dos perfis contratados; a habilitação do executante; a autorização prévia de subcontratação ou cessão; e o cabimento e compromisso da despesa acrescida. |
| AL-COMPLEMENTARES-40 | Consumo de serviços complementares (40%) | Os serviços complementares acumulados atingiram 40% do preço inicial. | AVISO | — | RN-302 | Prevenção de reparo em auditoria (limite de 50%, RN-301). | — |
| AL-COMPLEMENTARES-45 | Consumo de serviços complementares (45%) | Os serviços complementares acumulados atingiram 45% do preço inicial. | CRITICO | — | RN-302 | Prevenção de reparo em auditoria (limite de 50%, RN-301). | — |

## Fim de ciclo

| Código | Alerta | Condição | Severidade base | Janela de decisão | Regra ligada | Base legal / nota | Nota jurídica das ações |
|---|---|---|---|---|---|---|---|
| AL-NOVO-PROCEDIMENTO | Novo procedimento a lançar em tempo útil | Para haver contrato quando o atual terminar, o procedimento tem de ser lançado até à data-limite, somando a duração do concurso e, se aplicável, o visto prévio do Tribunal de Contas. | AVISO | término da vigência do contrato | — | CCP — planeamento da contratação; LOPTC quanto à fiscalização prévia. | Lançar novo procedimento não dispensa: a fundamentação da escolha do tipo de procedimento e do preço base; a decisão de contratar da entidade competente; e o cumprimento dos prazos de fiscalização prévia, quando aplicável. A urgência não é, por si, fundamento de ajuste direto. |
| AL-TERMINO-6M | Término a menos de 6 meses | Faltam 6 meses ou menos para o término contratual. | AVISO | — | — | Planeamento da transição (secção 11). | — |
| AL-TERMINO-3M | Término a menos de 3 meses | Faltam 3 meses ou menos para o término contratual. | CRITICO | — | — | Planeamento da transição (secção 11). | — |
| AL-VIGENCIA-36M | Vigência aproxima-se ou excede 36 meses | A vigência (início → término contratual) excede o limite de 36 meses. | CRITICO | — | RN-202 | CCP, art. 440.º e 48.º — exceção fundamentável. | — |

## Higiene e risco de auditoria

| Código | Alerta | Condição | Severidade base | Janela de decisão | Regra ligada | Base legal / nota | Nota jurídica das ações |
|---|---|---|---|---|---|---|---|
| AL-SUSPENSAO-VIGENCIA | Suspensão empurra a vigência além dos 36 meses | A deslocação do prazo de execução por suspensões projeta a vigência para além dos 36 meses sem exceção fundamentada. | AVISO | — | RN-204 | Separar prazo de vigência de prazo de execução — exceção fundamentável. | — |
| AL-SUSPENSAO-ABERTA | Suspensão sem data de fim | Existe uma suspensão em aberto há mais de 90 dias: o prazo de execução está parado por tempo indeterminado, o que é achado frequente em auditoria. | AVISO | — | RN-205 | CCP, art. 297.º-298.º — a suspensão deve ser temporária e delimitada. | Delimitar ou levantar a suspensão não dispensa: o registo fundamentado do facto que a determinou; o acordo ou notificação ao cocontratante; e a reprogramação dos prazos e encargos que dela resultem. |
| AL-EXECUCAO-FORA-VIGENCIA | Execução registada fora da vigência | Há registos de tempo aprovados com data fora do período de vigência do contrato ou dentro de um período de suspensão da execução. | CRITICO | — | RN-208 | Não há execução válida fora da vigência nem durante a suspensão. | Corrigir os registos não dispensa apurar se houve prestação efetiva fora da vigência ou em período suspenso. A correção do registo não sana a execução indevida nem legitima o pagamento correspondente. |
| AL-VISTO-PENDENTE | Visto do TdC pendente | Contrato em execução que exige visto prévio, sem visto obtido nem visto tácito. | CRITICO | — | — | LOPTC (Lei n.º 98/97) — fiscalização prévia. | Regularizar o visto não dispensa: a remessa do contrato ao Tribunal de Contas nos termos e prazos legais; e a proibição de produzir efeitos financeiros antes do visto, salvo nos casos legalmente admitidos. Os atos praticados antes do visto ficam sujeitos ao respetivo regime. |
| AL-FATURA-PRAZO | Prazo de pagamento de fatura | Fatura por pagar com data-limite próxima ou ultrapassada. | AVISO | — | — | Prazos de pagamento a fornecedores. | — |
