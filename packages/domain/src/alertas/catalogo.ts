import type { SeveridadeAlerta } from '../enums/index.js';

/**
 * Catálogo de REGRAS DE ALERTAS (secção 11), separado do catálogo de regras de
 * negócio (RN-xxx) para facilidade de gestão. Cada definição descreve a condição
 * determinística que dispara o alerta, a severidade base e — quando aplicável —
 * a regra de negócio a que se liga. O job de alertas (`JobAlertas`) consome este
 * catálogo; o ecrã "Regras e alertas" apresenta-o numa tabela própria.
 *
 * Os alertas são SEMPRE consultivos: sinalizam, não bloqueiam. O bloqueio vem
 * das regras RN-xxx.
 *
 * Muitos alertas são COMPOSTOS (cruzam tempo, dinheiro, cobertura orçamental e
 * capacidade) e trazem uma JANELA DE DECISÃO: a data-limite para agir, calculada
 * para trás a partir do evento-âncora com o prazo de instrução do ato. Nesses, a
 * severidade escala à medida que a janela se fecha (ver `janela-decisao.ts`).
 */
export interface DefinicaoAlerta {
  codigo: string;
  titulo: string;
  /** Condição que dispara o alerta, em linguagem de gestão. */
  descricao: string;
  /** Família funcional, para agrupar na apresentação. */
  familia: FamiliaAlerta;
  /** Severidade base; escala com a janela de decisão quando existe. */
  severidadeBase: SeveridadeAlerta;
  /** O alerta traz data-limite para agir? */
  temJanelaDecisao?: boolean;
  /** Evento a partir do qual a janela é calculada. */
  eventoAncora?: string;
  /** Regra de negócio relacionada (RN-xxx), quando existe. */
  regraRelacionada?: string;
  /** Base legal / requisito de origem. */
  base?: string;
  /**
   * Reserva jurídica das ações propostas: o que elas NÃO dispensam. Aparece a
   * seguir às ações, para que a facilidade de executar o ato na aplicação não
   * se confunda com dispensa das formalidades que o ato exige.
   */
  notaJuridica?: string;
}

export type FamiliaAlerta =
  | 'Tempo × dinheiro'
  | 'Cobertura orçamental plurianual'
  | 'Capacidade e perfis'
  | 'Fim de ciclo'
  | 'Higiene e risco de auditoria';

export const CATALOGO_ALERTAS: ReadonlyArray<DefinicaoAlerta> = [
  // ─── A · Tempo × dinheiro ──────────────────────────────────────────────────
  {
    codigo: 'AL-FOLGA-SEM-TEMPO',
    titulo: 'Folga financeira sem tempo para a executar',
    descricao:
      'Ao ritmo de execução recente, o contrato termina a vigência deixando saldo por executar. Quantifica o valor que se perde.',
    familia: 'Tempo × dinheiro',
    severidadeBase: 'AVISO',
    temJanelaDecisao: true,
    eventoAncora: 'término da vigência (prazo de instrução de uma modificação)',
    base: 'Cruzamento da projeção de execução com o término da vigência.',
    notaJuridica:
      'Executar o saldo dentro do prazo não dispensa: a prorrogação ser admissível face ao objeto e ao limite de vigência (RN-202); haver cobertura orçamental para o período acrescido; e a modificação ser fundamentada e registada. Acelerar o ritmo de execução não legitima registar trabalho não prestado.',
  },
  {
    codigo: 'AL-FIM-ANO-ECONOMICO',
    titulo: 'Transição de saldo a pedir antes do fecho do ano',
    descricao:
      'Há saldo por executar, o contrato não tem portaria de extensão de encargos e aproxima-se o fecho do ano económico: o pedido de transição tem de estar instruído até à data-limite.',
    familia: 'Tempo × dinheiro',
    severidadeBase: 'AVISO',
    temJanelaDecisao: true,
    eventoAncora: 'fecho do ano económico (31/12)',
    base: 'LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — transição de encargos.',
    notaJuridica:
      'A transição de saldo não dispensa: a autorização da entidade competente; o cabimento no orçamento do ano seguinte; e a observância do limite legal de transição. O saldo transitado continua sujeito à vigência do contrato — transitar dinheiro não prorroga o prazo.',
  },
  {
    codigo: 'AL-EXECUCAO-EXCEDE-ANO',
    titulo: 'Execução projetada excede a dotação do ano',
    descricao:
      'A execução projetada para o ano económico excede o montante que a portaria de extensão de encargos reparte para esse ano.',
    familia: 'Tempo × dinheiro',
    severidadeBase: 'CRITICO',
    base: 'LCPA / DL n.º 127/2012 — a execução não pode exceder a dotação repartida.',
    notaJuridica:
      'Conter ou reprogramar não dispensa a proibição de assumir despesa sem cabimento e compromisso prévios (LCPA). A execução acima da dotação repartida não se regulariza a posteriori pelo simples registo.',
  },
  {
    codigo: 'AL-VALOR-DISPONIVEL',
    titulo: 'Valor disponível reduzido',
    descricao: 'O contrato tem 40% ou menos do valor atual por executar.',
    familia: 'Tempo × dinheiro',
    severidadeBase: 'AVISO',
    base: 'Ponderar trabalhos complementares (secção 11).',
    notaJuridica:
      'O reforço por trabalhos complementares não dispensa: o limite de 50% do preço inicial (RN-301); a verificação dos pressupostos de circunstância imprevista e de não separabilidade técnica ou económica; e a fundamentação escrita da modificação.',
  },

  // ─── B · Cobertura orçamental plurianual ───────────────────────────────────
  {
    codigo: 'AL-PORTARIA-LIMITA-VIGENCIA',
    titulo: 'Portaria limita a vigência abaixo do máximo legal',
    descricao:
      'A portaria de extensão de encargos cobre menos anos do que o contrato poderia ter de vigência (36 meses líquidos): reprogramá-la liberta meses de vigência.',
    familia: 'Cobertura orçamental plurianual',
    severidadeBase: 'AVISO',
    temJanelaDecisao: true,
    eventoAncora: 'início do ano económico a cobrir',
    regraRelacionada: 'RN-202',
    base: 'LCPA / DL n.º 127/2012 — repartição plurianual de encargos.',
    notaJuridica:
      'A reprogramação da portaria não dispensa: a autorização dos membros do Governo competentes; a demonstração da cobertura em cada ano abrangido; e a compatibilidade com o limite de vigência do contrato.',
  },
  {
    codigo: 'AL-PORTARIA-REPROGRAMAR',
    titulo: 'Portaria de extensão de encargos a reprogramar',
    descricao:
      'A vigência do contrato ultrapassa o último ano coberto pela portaria de extensão de encargos: sem reprogramação não há cobertura orçamental para o período remanescente.',
    familia: 'Cobertura orçamental plurianual',
    severidadeBase: 'AVISO',
    temJanelaDecisao: true,
    eventoAncora: 'início do ano económico a cobrir',
    base: 'LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — repartição plurianual de encargos.',
    notaJuridica:
      'A reprogramação da portaria não dispensa: a autorização dos membros do Governo competentes; a demonstração da cobertura em cada ano abrangido; e a compatibilidade com o limite de vigência do contrato. Sem cobertura, a execução no período não coberto é despesa sem compromisso.',
  },
  {
    codigo: 'AL-PORTARIA-ANO-INSUFICIENTE',
    titulo: 'Dotação do ano esgota-se antes do fim do ano',
    descricao:
      'Ao ritmo recente, o montante que a portaria reparte para o ano corrente esgota-se antes de 31/12.',
    familia: 'Cobertura orçamental plurianual',
    severidadeBase: 'AVISO',
    base: 'LCPA / DL n.º 127/2012 — acompanhamento da dotação anual.',
  },

  // ─── C · Capacidade e perfis ───────────────────────────────────────────────
  {
    codigo: 'AL-PERFIL-ESGOTA-ANTES-TERMINO',
    titulo: 'Perfil esgota-se antes do término',
    descricao:
      'Ao ritmo de consumo recente, as horas do perfil esgotam-se antes do término da vigência. Acompanha a escada de opções de atuação.',
    familia: 'Capacidade e perfis',
    severidadeBase: 'AVISO',
    temJanelaDecisao: true,
    eventoAncora: 'data prevista de esgotamento do perfil',
    regraRelacionada: 'RN-505',
    base: 'Projeção determinística do ritmo recente (camada de previsões).',
    notaJuridica:
      'As vias de reforço de capacidade não dispensam: a observância do objeto do contrato e do perfil contratado — não se reafeta pessoal para tarefa alheia ao objeto; a verificação da habilitação e da idoneidade do executante; a autorização prévia da subcontratação ou da cessão da posição contratual; a fundamentação e o registo da modificação contratual, quando exista; e o cabimento e compromisso prévios da despesa que dela resulte.',
  },
  {
    codigo: 'AL-PERFIL-80',
    titulo: 'Consumo do perfil (80%)',
    descricao: 'Um perfil atingiu 80% do consumo de horas ou de valor previsto.',
    familia: 'Capacidade e perfis',
    severidadeBase: 'AVISO',
    regraRelacionada: 'RN-505',
    base: 'Acompanhamento de saldos de execução.',
  },
  {
    codigo: 'AL-PERFIL-90',
    titulo: 'Consumo do perfil (90%)',
    descricao: 'Um perfil atingiu 90% do consumo de horas ou de valor previsto.',
    familia: 'Capacidade e perfis',
    severidadeBase: 'CRITICO',
    regraRelacionada: 'RN-505',
    base: 'Acompanhamento de saldos de execução.',
  },
  {
    codigo: 'AL-CAPACIDADE-INSUFICIENTE',
    titulo: 'Capacidade insuficiente até ao término',
    descricao:
      'A soma das horas disponíveis em todos os perfis não chega para cobrir a execução até ao término, ao ritmo recente.',
    familia: 'Capacidade e perfis',
    severidadeBase: 'CRITICO',
    base: 'Projeção agregada de capacidade (camada de previsões).',
    notaJuridica:
      'Reforçar a capacidade não dispensa: a observância do objeto do contrato e dos perfis contratados; a habilitação do executante; a autorização prévia de subcontratação ou cessão; e o cabimento e compromisso da despesa acrescida.',
  },
  {
    codigo: 'AL-COMPLEMENTARES-40',
    titulo: 'Consumo de serviços complementares (40%)',
    descricao: 'Os serviços complementares acumulados atingiram 40% do preço inicial.',
    familia: 'Capacidade e perfis',
    severidadeBase: 'AVISO',
    regraRelacionada: 'RN-302',
    base: 'Prevenção de reparo em auditoria (limite de 50%, RN-301).',
  },
  {
    codigo: 'AL-COMPLEMENTARES-45',
    titulo: 'Consumo de serviços complementares (45%)',
    descricao: 'Os serviços complementares acumulados atingiram 45% do preço inicial.',
    familia: 'Capacidade e perfis',
    severidadeBase: 'CRITICO',
    regraRelacionada: 'RN-302',
    base: 'Prevenção de reparo em auditoria (limite de 50%, RN-301).',
  },

  // ─── D · Fim de ciclo ──────────────────────────────────────────────────────
  {
    codigo: 'AL-NOVO-PROCEDIMENTO',
    titulo: 'Novo procedimento a lançar em tempo útil',
    descricao:
      'Para haver contrato quando o atual terminar, o procedimento tem de ser lançado até à data-limite, somando a duração do concurso e, se aplicável, o visto prévio do Tribunal de Contas.',
    familia: 'Fim de ciclo',
    severidadeBase: 'AVISO',
    temJanelaDecisao: true,
    eventoAncora: 'término da vigência do contrato',
    base: 'CCP — planeamento da contratação; LOPTC quanto à fiscalização prévia.',
    notaJuridica:
      'Lançar novo procedimento não dispensa: a fundamentação da escolha do tipo de procedimento e do preço base; a decisão de contratar da entidade competente; e o cumprimento dos prazos de fiscalização prévia, quando aplicável. A urgência não é, por si, fundamento de ajuste direto.',
  },
  {
    codigo: 'AL-TERMINO-6M',
    titulo: 'Término a menos de 6 meses',
    descricao: 'Faltam 6 meses ou menos para o término contratual.',
    familia: 'Fim de ciclo',
    severidadeBase: 'AVISO',
    base: 'Planeamento da transição (secção 11).',
  },
  {
    codigo: 'AL-TERMINO-3M',
    titulo: 'Término a menos de 3 meses',
    descricao: 'Faltam 3 meses ou menos para o término contratual.',
    familia: 'Fim de ciclo',
    severidadeBase: 'CRITICO',
    base: 'Planeamento da transição (secção 11).',
  },
  {
    codigo: 'AL-VIGENCIA-36M',
    titulo: 'Vigência aproxima-se ou excede 36 meses',
    descricao: 'A vigência (início → término contratual) excede o limite de 36 meses.',
    familia: 'Fim de ciclo',
    severidadeBase: 'CRITICO',
    regraRelacionada: 'RN-202',
    base: 'CCP, art. 440.º e 48.º — exceção fundamentável.',
  },

  // ─── E · Higiene e risco de auditoria ──────────────────────────────────────
  {
    codigo: 'AL-SUSPENSAO-VIGENCIA',
    titulo: 'Suspensão empurra a vigência além dos 36 meses',
    descricao:
      'A deslocação do prazo de execução por suspensões projeta a vigência para além dos 36 meses sem exceção fundamentada.',
    familia: 'Higiene e risco de auditoria',
    severidadeBase: 'AVISO',
    regraRelacionada: 'RN-204',
    base: 'Separar prazo de vigência de prazo de execução — exceção fundamentável.',
  },
  {
    codigo: 'AL-SUSPENSAO-ABERTA',
    titulo: 'Suspensão sem data de fim',
    descricao:
      'Existe uma suspensão em aberto há mais de 90 dias: o prazo de execução está parado por tempo indeterminado, o que é achado frequente em auditoria.',
    familia: 'Higiene e risco de auditoria',
    severidadeBase: 'AVISO',
    regraRelacionada: 'RN-205',
    base: 'CCP, art. 297.º-298.º — a suspensão deve ser temporária e delimitada.',
    notaJuridica:
      'Delimitar ou levantar a suspensão não dispensa: o registo fundamentado do facto que a determinou; o acordo ou notificação ao cocontratante; e a reprogramação dos prazos e encargos que dela resultem.',
  },
  {
    codigo: 'AL-EXECUCAO-FORA-VIGENCIA',
    titulo: 'Execução registada fora da vigência',
    descricao:
      'Há registos de tempo aprovados com data fora do período de vigência do contrato ou dentro de um período de suspensão da execução.',
    familia: 'Higiene e risco de auditoria',
    severidadeBase: 'CRITICO',
    regraRelacionada: 'RN-208',
    base: 'Não há execução válida fora da vigência nem durante a suspensão.',
    notaJuridica:
      'Corrigir os registos não dispensa apurar se houve prestação efetiva fora da vigência ou em período suspenso. A correção do registo não sana a execução indevida nem legitima o pagamento correspondente.',
  },
  {
    codigo: 'AL-VISTO-PENDENTE',
    titulo: 'Visto do TdC pendente',
    descricao: 'Contrato em execução que exige visto prévio, sem visto obtido nem visto tácito.',
    familia: 'Higiene e risco de auditoria',
    severidadeBase: 'CRITICO',
    base: 'LOPTC (Lei n.º 98/97) — fiscalização prévia.',
    notaJuridica:
      'Regularizar o visto não dispensa: a remessa do contrato ao Tribunal de Contas nos termos e prazos legais; e a proibição de produzir efeitos financeiros antes do visto, salvo nos casos legalmente admitidos. Os atos praticados antes do visto ficam sujeitos ao respetivo regime.',
  },
  {
    codigo: 'AL-LICENCA-A-EXPIRAR',
    titulo: 'Licenciamento a expirar',
    descricao:
      'A vigência das licenças aproxima-se do fim. Sem renovação, o direito de uso cessa na data indicada.',
    familia: 'Fim de ciclo',
    severidadeBase: 'AVISO',
    temJanelaDecisao: true,
    eventoAncora: 'fim da vigência do licenciamento',
    regraRelacionada: 'RN-113',
    base: 'O licenciamento é um direito de uso por período determinado.',
    notaJuridica:
      'Renovar ou substituir o licenciamento não dispensa: a verificação de que a necessidade se mantém; a escolha do procedimento adequado ao valor e ao objeto, sem fracionamento da despesa; e o cabimento e compromisso prévios. A continuação de uso sem título válido não se regulariza a posteriori.',
  },
];

export const FAMILIAS_ALERTAS: ReadonlyArray<FamiliaAlerta> = [
  'Tempo × dinheiro',
  'Cobertura orçamental plurianual',
  'Capacidade e perfis',
  'Fim de ciclo',
  'Higiene e risco de auditoria',
];

const porCodigo = new Map<string, DefinicaoAlerta>(
  CATALOGO_ALERTAS.map((a) => [a.codigo, a]),
);

/** Obtém a definição de alerta pelo código, ou `undefined`. */
export function definicaoAlerta(codigo: string): DefinicaoAlerta | undefined {
  return porCodigo.get(codigo);
}
