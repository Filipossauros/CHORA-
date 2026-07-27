# Catálogo de regras de negócio

> Documento **gerado** a partir de `packages/domain/src/rules/` por `pnpm docs`. Não editar à mão.

Total de regras: **61**.

## Contratos e procedimentos

| Código | Tipo | Req. | Exceção fundamentável | Descrição | Base legal / nota |
|---|---|---|---|---|---|
| RN-101 | bloqueio | RF1 | não | O número de contrato é obrigatório e único. | — |
| RN-102 | bloqueio | RF2 (corrigido) | não | Um contrato pertence a exatamente um lote; um lote tem no máximo um contrato; um procedimento tem 1..N lotes. | O lote é divisão do procedimento, não sinónimo de contrato. |
| RN-103 | bloqueio | RF3 (corrigido) | não | Um contrato pode estar associado a vários projetos e um projeto a vários contratos (N:N). | O outsourcing serve tipicamente vários projetos. |
| RN-104 | bloqueio | novo | não | precoContratualInicial é imutável após o contrato entrar em vigor. | É a base de cálculo dos limites legais. |
| RN-105 | bloqueio | RF17 | não | A soma do valor de todas as dotações e do valor previsto de todos os perfis não pode exceder precoContratualAtual. | — |
| RN-106 | bloqueio | RF6 | não | Tem de existir pelo menos uma dotação HORAS_BASE; BOLSA_VALOR e TRABALHOS_COMPLEMENTARES são opcionais. | — |
| RN-107 | bloqueio | novo | não | Todo o contrato tem de ter pelo menos um gestor designado, com data de designação anterior ao início de vigência. | CCP, art. 290.º-A n.º 1 e art. 96.º n.º 1 al. j). |
| RN-110 | bloqueio | RF36 | não | Todas as alterações contratuais são registadas em histórico imutável, incluindo o histórico de alterações da data de término. | — |
| RN-111 | bloqueio | novo | não | Um contrato chave-na-mão tem de ter pelo menos um entregável identificado, e todos os entregáveis têm de ter valor associado. | No preço fixo paga-se o resultado: a faturação é por entregável, pelo que estes têm de estar definidos. |
| RN-112 | bloqueio | novo | não | A soma do valor dos entregáveis com o valor da bolsa de horas não pode exceder o preço contratual atual. | O preço contratual é o teto da despesa: as componentes em que se reparte não o podem ultrapassar. |
| RN-113 | bloqueio | novo | não | Um contrato de licenciamento tem de indicar o período de vigência das licenças. | O licenciamento é um direito de uso por um período determinado. |
| RN-114 | bloqueio | novo | não | O período de vigência das licenças tem de estar contido na vigência do contrato e ter fim posterior ao início. | Não se licencia para lá do prazo em que o contrato que titula a aquisição existe. |
| RN-115 | bloqueio | novo | não | O encargo de cada ano futuro coberto por portaria de extensão de encargos não pode exceder 500 000 € para ser aprovado pelo Conselho de Administração; acima disso exige portaria conjunta dos membros do Governo. | Competência delegada do Conselho de Administração para assunção de encargos plurianuais. |

## Prazos e vigência

| Código | Tipo | Req. | Exceção fundamentável | Descrição | Base legal / nota |
|---|---|---|---|---|---|
| RN-201 | bloqueio | RF11 | não | dataInicioVigencia < dataTerminoContratual. | — |
| RN-202 | bloqueio | RF10 | sim | A vigência do contrato, incluindo prorrogações, não deve exceder 36 meses. Exceção fundamentável. | CCP, art. 440.º e 48.º — admite-se prazo superior mediante fundamentação (ADR-10). |
| RN-203 | bloqueio | RF11 | não | A vigência conta desde dataInicioVigencia até ao primeiro de: dataTerminoContratual; ou o esgotamento das horas/valor disponíveis. | — |
| RN-204 | aviso | RF11.3 (corrigido) | sim | Suspensões que deslocam a execução podem empurrar a vigência além dos 36 meses; nesse caso, aviso e exceção fundamentada. | Separar prazo de vigência de prazo de execução. |
| RN-205 | bloqueio | novo | não | Períodos de suspensão não se podem sobrepor entre si. | — |
| RN-207 | bloqueio | requisito sem número | não | A existência de disponibilidade financeira não altera o limite temporal. | — |
| RN-208 | bloqueio | novo | não | Contratos em estado RESOLVIDO, CADUCADO, REVOGADO ou TERMINADO bloqueiam qualquer novo registo ou aprovação. | O documento original só previa termo natural. |

## Dotações e serviços complementares

| Código | Tipo | Req. | Exceção fundamentável | Descrição | Base legal / nota |
|---|---|---|---|---|---|
| RN-301 | bloqueio | RF7 (corrigido) | não | O valor acumulado de serviços complementares não pode exceder 50 % do preço contratual inicial. | CCP, art. 370.º n.º 4. A base é o preço contratual inicial, não a soma de horas base com bolsa. |
| RN-302 | aviso | novo | não | Alertar aos 40 % e aos 45 % de consumo do limite de serviços complementares. | Prevenção de reparo em auditoria. |
| RN-303 | bloqueio | RF8 | não | Registar tempo contra BOLSA_VALOR exige perfil com consomeBolsaValor = true. | — |
| RN-304 | bloqueio | RF9 | não | Registar tempo contra TRABALHOS_COMPLEMENTARES exige perfil com consomeTrabalhosComplementares = true. | — |
| RN-305 | bloqueio | RF12 | não | Uma alteração de SERVICOS_COMPLEMENTARES cria obrigatoriamente uma Dotacao correspondente e atualiza precoContratualAtual. | — |

## Registo de tempo

| Código | Tipo | Req. | Exceção fundamentável | Descrição | Base legal / nota |
|---|---|---|---|---|---|
| RN-401 | bloqueio | RF19 | não | Só é possível registar tempo existindo Afetacao ativa do recurso ao contrato, ao perfil e ao projeto, na data do registo. | — |
| RN-402 | bloqueio | RF20 | não | O elemento da equipa técnica pode particionar o tempo livremente entre atividades no mesmo dia. | — |
| RN-403 | bloqueio | novo | não | A soma de durações de um recurso num dia não pode exceder um máximo configurável (720 min). Excedente exige justificação. | Prevenção de incongruências na origem. |
| RN-404 | aviso | novo | não | Registos em fim de semana ou feriado nacional geram aviso (não bloqueio) e são assinalados nos relatórios. | — |
| RN-405 | bloqueio | novo | não | Duração mínima 15 min; múltiplos de 15 min. | Configurável. |
| RN-406 | bloqueio | RF21 | não | O elemento da equipa técnica só pode alterar ou anular registos próprios em estado RASCUNHO ou SUBMETIDO. Após aprovação, imutável. | — |
| RN-407 | bloqueio | RF22 | não | O elemento da equipa técnica só visualiza os seus próprios registos. | — |
| RN-408 | bloqueio | RF24 | não | A data do registo tem de estar dentro da vigência do contrato e dentro do período da afetação. | — |
| RN-409 | bloqueio | novo | não | A data do registo não pode ser futura. | — |
| RN-410 | bloqueio | novo | não | A data do registo não pode cair dentro de período de suspensão do contrato. | — |
| RN-411 | bloqueio | novo | não | O work item indicado tem de pertencer ao projeto do registo. | Validado contra a API do Azure DevOps. |

## Aprovação

| Código | Tipo | Req. | Exceção fundamentável | Descrição | Base legal / nota |
|---|---|---|---|---|---|
| RN-501 | bloqueio | RF5 (corrigido) | não | A aprovação de registos é competência de GESTOR_CONTRATO ou GESTOR_TECNICO — papéis aplicacionais do contraente público. A flag perfilDeGestao não confere poder de aprovação. | A aprovação é ato do contraente público; não pode depender de um perfil do adjudicatário. |
| RN-502 | bloqueio | novo | não | Ninguém aprova os seus próprios registos. | Segregação de funções. |
| RN-503 | bloqueio | RF23 | não | Não é possível aprovar registos que façam exceder o total de horas do perfil (horas base + bolsa + complementares). | — |
| RN-504 | bloqueio | novo | não | Não é possível aprovar registos que façam exceder o valor disponível do perfil ou do contrato. | Horas e valor divergem sempre que há revisão de preços. |
| RN-505 | aviso | novo | não | Alertar quando o consumo de um perfil atingir 80 % e 90 % de horas ou de valor. | — |
| RN-506 | bloqueio | ADR-09 | não | Na aprovação, congelar valorHoraAplicado (preço vigente na data do registo) e valorImputado. | Garante estabilidade histórica dos relatórios. |
| RN-507 | bloqueio | RNF11 | não | Registos aprovados são tecnicamente imutáveis: leitura, exportação e consulta histórica apenas. | — |
| RN-508 | bloqueio | requisito sem número + RNF11 | não | O gestor pode anular registos aprovados. A anulação é lógica (ANULADO), com autor, data e motivo obrigatórios. Nunca eliminação física. | Resolve a contradição do documento original. ADR-08. |
| RN-509 | bloqueio | novo | não | Não é possível aprovar registos de contrato cujo visto do Tribunal de Contas seja necessário e ainda não obtido, se essa aprovação suportar faturação. | Nos contratos sujeitos a fiscalização prévia, os efeitos financeiros dependem do visto. |

## Faturação e execução financeira

| Código | Tipo | Req. | Exceção fundamentável | Descrição | Base legal / nota |
|---|---|---|---|---|---|
| RN-601 | bloqueio | RF32 | não | Uma fatura tem de estar associada a contrato e a compromisso válido, com saldo suficiente. | Lei dos Compromissos e Pagamentos em Atraso (Lei n.º 8/2012). |
| RN-602 | bloqueio | RF26, RF31 | não | A conferência só pode iniciar-se com a evidência documental em PDF: a fatura e, consoante o tipo de faturação, o relatório de horas do fornecedor (bolsa de horas) ou o auto de entrega (entregável). A fatura e o relatório podem vir no mesmo ficheiro. O licenciamento basta-se com a fatura. | O circuito de validação técnica funciona sobre PDF. Ver secção 5.3.2. |
| RN-602-A | bloqueio | novo | não | O hash de um documento associado a uma fatura já decidida (VALIDADA ou INVALIDADA) não pode ser alterado. Substituir obriga a reabrir a conferência. | Garante que o relatório de evidência se refere sempre ao documento efetivamente conferido. |
| RN-603 | bloqueio | RF26 (parte determinística) | não | A conferência compara as linhas da fatura com os registos aprovados do período, por perfil e por recurso. Divergência em quantidade ou valor bloqueia a validação. | Esta é a conferência que não precisa de IA: comparam-se números, não documentos. |
| RN-604 | bloqueio | RF27, RF28 | não | Toda a validação (ou invalidação) gera RelatorioEvidencia arquivado e imutável. | — |
| RN-607 | bloqueio | novo | não | O somatório de montantes aprovados não pode exceder precoContratualAtual. | — |
| RN-608 | bloqueio | novo | não | A faturação de um entregável exige que este esteja identificado na fatura e assinalado como entregue. | Nos contratos de preço fixo o facto gerador da faturação é a entrega e aceitação do resultado. |
| RN-609 | bloqueio | novo | não | O montante de uma fatura de entregável tem de corresponder exatamente ao valor do entregável. | No preço fixo não há faturação parcial nem por medição do entregável. |
| RN-610 | bloqueio | novo | não | Um contrato de licenciamento admite uma única fatura de valor positivo, correspondente à totalidade do contrato. Notas de crédito não são abrangidas. | No licenciamento contrata-se um direito de uso por um período, faturado de uma só vez. |
| RN-611 | bloqueio | novo | não | O montante da fatura de um contrato de licenciamento tem de corresponder à totalidade do preço contratual atual. | Faturação única: não há faturação parcial de um licenciamento. |
| RN-612 | bloqueio | novo | não | A validação de uma fatura corrigida por nota de crédito exige que a nota de crédito esteja documentada em PDF e que o líquido (fatura menos nota de crédito) corresponda ao montante conferido. | A nota de crédito integra a evidência da decisão: valida-se o líquido, não o valor emitido a mais. |
| RN-613 | bloqueio | novo | não | A fatura tem de identificar o número do contrato e o NIF do prestador, e ambos têm de corresponder ao contrato que liquida. | A fatura é o título da despesa: sem identificar o contrato e o prestador não é imputável. |

## Recursos e habilitações

| Código | Tipo | Req. | Exceção fundamentável | Descrição | Base legal / nota |
|---|---|---|---|---|---|
| RN-701 | bloqueio | novo | não | A substituição de um recurso cria nova afetação com substituiAfetacaoId, encerrando a anterior. Perfil e entidade executante têm de coincidir. | Ponto de litígio frequente neste tipo de contrato. |
| RN-702 | bloqueio | novo | não | A afetação identifica a entidade executante efetiva (adjudicatário ou subcontratado). | CCP, art. 316.º e ss. e art. 321.º-A. |
| RN-703 | aviso | novo | não | Documentos de habilitação com validade a expirar em menos de 30 dias geram alerta ao gestor. | Revalidação necessária, sobretudo em renovações. |
| RN-704 | bloqueio | novo | não | Um mesmo recurso pode estar afeto a vários contratos, mas não pode registar tempo sobreposto. | — |
