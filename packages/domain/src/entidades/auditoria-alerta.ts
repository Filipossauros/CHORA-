import { z } from 'zod';
import { zEstadoAlerta, zSeveridadeAlerta } from '../enums/index.js';
import { zCent, zDataISO, zInstanteISO } from '../tipos/primitivos.js';

/**
 * Onde se executa uma opção. A opção não descreve apenas o caminho: leva lá.
 * `MODIFICACOES` transporta o tipo de modificação a pré-selecionar, para que o
 * formulário abra já no ato certo.
 */
export const zDestinoAcao = z.enum(['AFETACOES', 'MODIFICACOES', 'FICHA', 'REGISTOS']);
export type DestinoAcao = z.infer<typeof zDestinoAcao>;

export const zAcaoOpcao = z.object({
  destino: zDestinoAcao,
  rotulo: z.string().min(1),
  /** Contrato onde a ação se executa — pode não ser o do alerta (mobilização). */
  contratoId: z.string().optional(),
  /** Tipo de modificação a pré-selecionar quando `destino = MODIFICACOES`. */
  tipoModificacao: z.string().optional(),
});
export type AcaoOpcao = z.infer<typeof zAcaoOpcao>;

/**
 * Opção de atuação proposta com um alerta ("escada de opções"), ordenada por
 * atrito jurídico crescente. É sempre indicativa: quem decide é o gestor.
 *
 * Cada opção tem o SEU prazo: reafectar dentro do contrato pode fazer-se até ao
 * dia em que as horas acabam, mas subcontratar ou reforçar exigem instrução
 * prévia, e lançar um procedimento exige meses. O prazo do alerta é o mais curto
 * destes — é a partir dele que se começa a perder alternativas.
 */
export const zOpcaoAlerta = z.object({
  ordem: z.number().int().nonnegative(), // 1 = menor atrito
  titulo: z.string().min(1),
  detalhe: z.string().min(1),
  viabilidade: z.enum(['VIAVEL', 'CONDICIONADA', 'INVIAVEL']),
  fundamento: z.string().optional(), // base legal / regra aplicável
  impactoValor: zCent.optional(), // diferencial de custo, quando quantificável
  /** Data-limite própria desta opção; depois dela, a opção deixa de existir. */
  dataLimite: zDataISO.optional(),
  /** Dias até `dataLimite`; negativo se já passou. */
  diasParaLimite: z.number().int().optional(),
  /** Para onde levar o gestor que escolha esta opção. */
  acao: zAcaoOpcao.optional(),
});
export type OpcaoAlerta = z.infer<typeof zOpcaoAlerta>;

/**
 * Alerta gerado por job (secção 11). Não é Auditável (não tem autor humano);
 * tem `geradoEm`.
 *
 * Além do sinal, o alerta transporta a JANELA DE DECISÃO (`dataLimiteAcao`: até
 * quando é preciso agir, calculada para trás a partir do evento com o prazo de
 * instrução do ato), o IMPACTO quantificado e a ESCADA DE OPÇÕES.
 */
export const zAlerta = z.object({
  id: z.string().min(1),
  contratoId: z.string().min(1),
  codigo: z.string().min(1), // ver secção 11
  /**
   * Identidade ESTÁVEL da decisão: `contratoId|codigo|referencia`. Duas
   * execuções do job sobre a mesma situação produzem a mesma chave — e portanto
   * a mesma decisão, não duas. A `referencia` distingue ocorrências legítimas
   * do mesmo código (ex.: o perfil a que respeita, ou o ano económico).
   */
  chave: z.string().min(1),
  estado: zEstadoAlerta,
  severidade: zSeveridadeAlerta,
  titulo: z.string().min(1),
  detalhe: z.string().min(1),
  destinatarioId: z.string().min(1),
  geradoEm: zInstanteISO, // primeira deteção (não muda entre reconciliações)
  atualizadoEm: zInstanteISO.optional(), // última reconciliação
  lidoEm: zInstanteISO.optional(),
  notificadoEm: zInstanteISO.optional(),
  /** Quando passou a RESOLVIDA (ato registado ou condição deixou de existir). */
  resolvidaEm: zInstanteISO.optional(),
  motivoResolucao: z.string().optional(),
  /** Dispensa temporária: reaparece depois desta data, ou se agravar. */
  dispensadaAte: zDataISO.optional(),
  motivoDispensa: z.string().optional(),
  /** Data-limite para agir (janela de decisão). */
  dataLimiteAcao: zDataISO.optional(),
  /** Dias que faltam até à data-limite; negativo se já passou. */
  diasParaLimite: z.number().int().optional(),
  /** Evento a que a janela se refere (ex.: 'fecho do ano económico'). */
  eventoAncora: z.string().optional(),
  /** Impacto financeiro quantificado (€, em cêntimos). */
  impactoValor: zCent.optional(),
  /** Impacto em horas (minutos), quando aplicável. */
  impactoMinutos: z.number().int().optional(),
  /**
   * Dias ÚTEIS que restam até a capacidade se esgotar. É a leitura de gestão do
   * impacto em horas: «restam 340 h» diz pouco, «restam 2 meses e 3 dias» diz
   * se há tempo para instruir o ato.
   */
  diasUteisRestantes: z.number().int().optional(),
  /** Escada de opções de atuação. */
  opcoes: z.array(zOpcaoAlerta).optional(),
  /**
   * Reserva jurídica que acompanha as opções: o que nenhuma delas dispensa.
   * A aplicação propõe caminhos de gestão, não substitui o parecer jurídico.
   */
  notaJuridica: z.string().optional(),
});
export type Alerta = z.infer<typeof zAlerta>;

/**
 * Evento de auditoria append-only (ADR-07). Imutável por natureza; tem apenas o
 * carimbo `ocorridoEm`. O `utilizadorId` nunca é o nome (secção 9.4).
 */
export const zEventoAuditoria = z.object({
  id: z.string().min(1),
  ocorridoEm: zInstanteISO,
  utilizadorId: z.string().min(1),
  projetoId: z.string().optional(),
  entidade: z.string().min(1), // 'RegistoTempo', 'Contrato', ...
  entidadeId: z.string().min(1),
  operacao: z.string().min(1), // 'CRIAR' | 'APROVAR' | 'ANULAR' | ...
  resultado: z.enum(['PERMITIDO', 'NEGADO', 'ERRO']),
  regraViolada: z.string().optional(),
  antes: z.unknown().optional(),
  depois: z.unknown().optional(),
  ipOrigem: z.string().optional(),
  tokenValidoAte: zInstanteISO.optional(),
});
export type EventoAuditoria = z.infer<typeof zEventoAuditoria>;
