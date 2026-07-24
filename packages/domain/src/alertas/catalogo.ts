import type { SeveridadeAlerta } from '../enums/index.js';

/**
 * Catálogo de REGRAS DE ALERTAS (secção 11), separado do catálogo de regras de
 * negócio (RN-xxx) para facilitar a gestão. Cada definição descreve a condição
 * determinística que dispara o alerta, a severidade base e — quando aplicável —
 * a regra de negócio a que se liga. O job de alertas (`JobAlertas`) consome este
 * catálogo; o ecrã "Regras" apresenta-o numa tabela própria.
 *
 * Os alertas são SEMPRE consultivos: sinalizam, não bloqueiam. O bloqueio vem
 * das regras RN-xxx.
 */
export interface DefinicaoAlerta {
  codigo: string;
  titulo: string;
  /** Condição que dispara o alerta, em linguagem de gestão. */
  descricao: string;
  /** Severidade base; alguns alertas escalam para CRÍTICO conforme o valor. */
  severidadeBase: SeveridadeAlerta;
  /** Regra de negócio relacionada (RN-xxx), quando existe. */
  regraRelacionada?: string;
  /** Base legal / requisito de origem. */
  base?: string;
}

export const CATALOGO_ALERTAS: ReadonlyArray<DefinicaoAlerta> = [
  {
    codigo: 'AL-TERMINO-6M',
    titulo: 'Término a menos de 6 meses',
    descricao: 'Faltam 6 meses ou menos para o término contratual.',
    severidadeBase: 'AVISO',
    base: 'Planeamento da transição (secção 11).',
  },
  {
    codigo: 'AL-TERMINO-3M',
    titulo: 'Término a menos de 3 meses',
    descricao: 'Faltam 3 meses ou menos para o término contratual.',
    severidadeBase: 'CRITICO',
    base: 'Planeamento da transição (secção 11).',
  },
  {
    codigo: 'AL-VIGENCIA-36M',
    titulo: 'Vigência aproxima-se ou excede 36 meses',
    descricao: 'A vigência (início → término contratual) excede o limite de 36 meses.',
    severidadeBase: 'CRITICO',
    regraRelacionada: 'RN-202',
    base: 'CCP, art. 440.º e 48.º — exceção fundamentável.',
  },
  {
    codigo: 'AL-SUSPENSAO-VIGENCIA',
    titulo: 'Suspensão empurra a vigência além dos 36 meses',
    descricao:
      'A deslocação do prazo de execução por suspensões projeta a vigência para além dos 36 meses sem exceção fundamentada.',
    severidadeBase: 'AVISO',
    regraRelacionada: 'RN-204',
    base: 'Separar prazo de vigência de prazo de execução — exceção fundamentável.',
  },
  {
    codigo: 'AL-COMPLEMENTARES-40',
    titulo: 'Consumo de serviços complementares (40%)',
    descricao: 'Os serviços complementares acumulados atingiram 40% do preço inicial.',
    severidadeBase: 'AVISO',
    regraRelacionada: 'RN-302',
    base: 'Prevenção de reparo em auditoria (limite de 50%, RN-301).',
  },
  {
    codigo: 'AL-COMPLEMENTARES-45',
    titulo: 'Consumo de serviços complementares (45%)',
    descricao: 'Os serviços complementares acumulados atingiram 45% do preço inicial.',
    severidadeBase: 'CRITICO',
    regraRelacionada: 'RN-302',
    base: 'Prevenção de reparo em auditoria (limite de 50%, RN-301).',
  },
  {
    codigo: 'AL-PERFIL-80',
    titulo: 'Consumo do perfil (80%)',
    descricao: 'Um perfil atingiu 80% do consumo de horas ou de valor previsto.',
    severidadeBase: 'AVISO',
    regraRelacionada: 'RN-505',
    base: 'Acompanhamento de saldos de execução.',
  },
  {
    codigo: 'AL-PERFIL-90',
    titulo: 'Consumo do perfil (90%)',
    descricao: 'Um perfil atingiu 90% do consumo de horas ou de valor previsto.',
    severidadeBase: 'CRITICO',
    regraRelacionada: 'RN-505',
    base: 'Acompanhamento de saldos de execução.',
  },
  {
    codigo: 'AL-VALOR-DISPONIVEL',
    titulo: 'Valor disponível reduzido',
    descricao: 'O contrato tem 40% ou menos do valor atual por executar.',
    severidadeBase: 'AVISO',
    base: 'Ponderar trabalhos complementares (secção 11).',
  },
  {
    codigo: 'AL-TRANSICAO-ANO',
    titulo: 'Saldo por executar no fim da vigência',
    descricao:
      'Término próximo, com saldo por executar, sem portaria de extensão e sem transição registada.',
    severidadeBase: 'AVISO',
    base: 'LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — transição de encargos.',
  },
  {
    codigo: 'AL-PORTARIA-REPROGRAMAR',
    titulo: 'Portaria de extensão de encargos a reprogramar',
    descricao:
      'A vigência do contrato ultrapassa o último ano coberto pela portaria de extensão de encargos; para manter a execução plurianual é necessário pedir a reprogramação da portaria.',
    severidadeBase: 'AVISO',
    base: 'LCPA (Lei n.º 8/2012) e DL n.º 127/2012 — repartição plurianual de encargos.',
  },
  {
    codigo: 'AL-VISTO-PENDENTE',
    titulo: 'Visto do TdC pendente',
    descricao: 'Contrato em execução que exige visto prévio, sem visto obtido nem visto tácito.',
    severidadeBase: 'CRITICO',
    base: 'LOPTC (Lei n.º 98/97) — fiscalização prévia.',
  },
  {
    codigo: 'AL-FATURA-PRAZO',
    titulo: 'Prazo de pagamento de fatura',
    descricao: 'Fatura por pagar com data-limite próxima ou ultrapassada.',
    severidadeBase: 'AVISO',
    base: 'Prazos de pagamento a fornecedores.',
  },
];

const porCodigo = new Map<string, DefinicaoAlerta>(
  CATALOGO_ALERTAS.map((a) => [a.codigo, a]),
);

/** Obtém a definição de alerta pelo código, ou `undefined`. */
export function definicaoAlerta(codigo: string): DefinicaoAlerta | undefined {
  return porCodigo.get(codigo);
}
