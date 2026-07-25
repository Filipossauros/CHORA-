import type { Alerta } from '../entidades/auditoria-alerta.js';
import type { DataISO, InstanteISO } from '../tipos/primitivos.js';
import type { SeveridadeAlerta } from '../enums/index.js';

/**
 * RECONCILIAÇÃO DE ALERTAS — o que impede a fadiga.
 *
 * O job não regenera alertas de raiz: calcula as decisões que se verificam
 * AGORA e reconcilia-as com as que já existem, por identidade estável. O estado
 * (em curso, dispensada) sobrevive; o que deixou de se verificar é RESOLVIDO
 * automaticamente, sem passo manual.
 */

/** Decisão calculada por uma regra de alerta, antes de ser reconciliada. */
export type AlertaCalculado = Omit<
  Alerta,
  'id' | 'estado' | 'geradoEm' | 'atualizadoEm' | 'resolvidaEm' | 'motivoResolucao' | 'dispensadaAte' | 'motivoDispensa' | 'lidoEm' | 'notificadoEm'
>;

/** Constrói a chave estável de uma decisão. */
export function chaveAlerta(contratoId: string, codigo: string, referencia?: string): string {
  return `${contratoId}|${codigo}${referencia !== undefined && referencia !== '' ? `|${referencia}` : ''}`;
}

const ORDEM_SEVERIDADE: Record<SeveridadeAlerta, number> = { INFO: 0, AVISO: 1, CRITICO: 2 };

/** Verdadeiro se `nova` é mais grave que `antiga`. */
export function agravou(antiga: SeveridadeAlerta, nova: SeveridadeAlerta): boolean {
  return ORDEM_SEVERIDADE[nova] > ORDEM_SEVERIDADE[antiga];
}

export interface ResultadoReconciliacao {
  /** Estado final de todas as decisões (a persistir). */
  alertas: Alerta[];
  /** Decisões detetadas pela primeira vez nesta execução. */
  novas: Alerta[];
  /** Decisões que deixaram de se verificar e foram resolvidas. */
  resolvidas: Alerta[];
  /** Decisões dispensadas que voltaram a abrir (fim da dispensa ou agravamento). */
  reabertas: Alerta[];
}

/**
 * Reconcilia as decisões calculadas com as existentes.
 *
 * Regras:
 *  - chave nova → decisão nova, ABERTA;
 *  - chave existente → conserva `geradoEm`, o estado e a decisão do gestor,
 *    atualizando o conteúdo (prazo, impacto, opções, severidade);
 *  - DISPENSADA reabre se a dispensa caducou ou se a severidade agravou;
 *  - RESOLVIDA reabre se a condição voltou a verificar-se;
 *  - chave que já não é calculada → RESOLVIDA («a condição deixou de se verificar»),
 *    salvo se já estiver resolvida.
 */
export function reconciliarAlertas(
  existentes: ReadonlyArray<Alerta>,
  calculados: ReadonlyArray<AlertaCalculado>,
  agora: InstanteISO,
  hoje: DataISO,
  novoId: () => string,
): ResultadoReconciliacao {
  const porChave = new Map(existentes.map((a) => [a.chave, a]));
  const calculadasChaves = new Set(calculados.map((c) => c.chave));
  const alertas: Alerta[] = [];
  const novas: Alerta[] = [];
  const resolvidas: Alerta[] = [];
  const reabertas: Alerta[] = [];

  for (const calc of calculados) {
    const antiga = porChave.get(calc.chave);
    if (antiga === undefined) {
      const nova: Alerta = { ...calc, id: novoId(), estado: 'ABERTA', geradoEm: agora, atualizadoEm: agora };
      alertas.push(nova);
      novas.push(nova);
      continue;
    }

    // Conserva a identidade e a primeira deteção; atualiza o conteúdo.
    const base: Alerta = {
      ...antiga, ...calc,
      id: antiga.id, chave: antiga.chave, geradoEm: antiga.geradoEm,
      estado: antiga.estado, atualizadoEm: agora,
    };

    if (antiga.estado === 'DISPENSADA') {
      const caducou = antiga.dispensadaAte === undefined || antiga.dispensadaAte < hoje;
      const piorou = agravou(antiga.severidade, calc.severidade);
      if (caducou || piorou) {
        const reaberta: Alerta = {
          ...base, estado: 'ABERTA',
          dispensadaAte: undefined, motivoDispensa: undefined,
        };
        alertas.push(reaberta);
        reabertas.push(reaberta);
      } else {
        alertas.push(base); // continua dispensada, com conteúdo atualizado
      }
      continue;
    }

    if (antiga.estado === 'RESOLVIDA') {
      // A condição voltou a verificar-se: reabre.
      const reaberta: Alerta = { ...base, estado: 'ABERTA', resolvidaEm: undefined, motivoResolucao: undefined };
      alertas.push(reaberta);
      reabertas.push(reaberta);
      continue;
    }

    alertas.push(base); // ABERTA ou EM_CURSO — conserva a decisão do gestor
  }

  // O que já não é calculado deixou de se verificar.
  for (const antiga of existentes) {
    if (calculadasChaves.has(antiga.chave)) continue;
    if (antiga.estado === 'RESOLVIDA') { alertas.push(antiga); continue; }
    const resolvida: Alerta = {
      ...antiga, estado: 'RESOLVIDA', atualizadoEm: agora, resolvidaEm: agora,
      motivoResolucao: 'A condição deixou de se verificar.',
    };
    alertas.push(resolvida);
    resolvidas.push(resolvida);
  }

  return { alertas, novas, resolvidas, reabertas };
}

/** Decisões que o gestor tem de ver: abertas ou em curso. */
export function decisoesPendentes(alertas: ReadonlyArray<Alerta>): Alerta[] {
  return alertas.filter((a) => a.estado === 'ABERTA' || a.estado === 'EM_CURSO');
}

/**
 * Saúde de um contrato a partir das decisões pendentes: a mais grave manda.
 * `null` quando não há decisões pendentes.
 */
export function saudeContrato(alertas: ReadonlyArray<Alerta>): SeveridadeAlerta | null {
  const pendentes = decisoesPendentes(alertas);
  if (pendentes.length === 0) return null;
  return pendentes.reduce<SeveridadeAlerta>(
    (pior, a) => (ORDEM_SEVERIDADE[a.severidade] > ORDEM_SEVERIDADE[pior] ? a.severidade : pior),
    'INFO',
  );
}
