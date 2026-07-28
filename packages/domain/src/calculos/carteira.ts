import type { Contrato } from '../entidades/contrato.js';
import type { PerfilContratual } from '../entidades/estrutura.js';
import type { Fatura } from '../entidades/faturacao.js';
import type { RegistoTempo } from '../entidades/registo-tempo.js';
import type { Cent, DataISO } from '../tipos/primitivos.js';
import { diasEntre } from '../tipos/tempo.js';
import { preverContrato } from './previsoes.js';
import { calcularConsumoPerfil } from './consumo.js';
import { janelaNovoProcedimento } from './janela-decisao.js';

/**
 * LEITURA DA CARTEIRA — as perguntas que se fazem sobre o conjunto.
 *
 * Um gestor de unidade não pergunta pelo saldo de um contrato: pergunta quais
 * estão em risco, quais acabam este ano, e onde está o dinheiro todo. Essas
 * respostas não vivem na ficha de nenhum contrato — têm de ser compostas, e é
 * isso que estas funções fazem.
 *
 * O RISCO aqui não é uma pontuação de caixa preta: é a soma de motivos
 * enumerados, cada um com o número que o sustenta. Um contrato «em risco» tem
 * de poder dizer porquê, sob pena de a lista não servir para decidir nada.
 */

export type MotivoRisco =
  /** Vai deixar valor por executar ao ritmo atual. */
  | 'FOLGA_POR_EXECUTAR'
  /** As horas dos perfis não chegam até ao término. */
  | 'CAPACIDADE_INSUFICIENTE'
  /** Termina em breve e é preciso lançar procedimento. */
  | 'TERMINO_PROXIMO'
  /** O prazo para lançar o procedimento seguinte já passou. */
  | 'PROCEDIMENTO_TARDIO'
  /** Ninguém afeto a perfis com horas por consumir. */
  | 'SEM_PESSOAS'
  /** Contrato suspenso: a execução está parada. */
  | 'SUSPENSO';

export interface RiscoContrato {
  contratoId: string;
  numero: string;
  objeto: string;
  estado: string;
  /** 0..100 — soma dos pesos dos motivos, para ordenar. Nunca se apresenta só. */
  pontuacao: number;
  motivos: Array<{ motivo: MotivoRisco; descricao: string; valor?: Cent; dias?: number }>;
  valorAtual: Cent;
  valorExecutado: Cent;
  gapNoTermino: Cent;
  diasAteTermino: number;
}

/** Peso de cada motivo. Deliberadamente grosseiro: serve para ordenar, não para pontuar. */
const PESO: Record<MotivoRisco, number> = {
  PROCEDIMENTO_TARDIO: 40,
  CAPACIDADE_INSUFICIENTE: 25,
  FOLGA_POR_EXECUTAR: 20,
  TERMINO_PROXIMO: 15,
  SEM_PESSOAS: 15,
  SUSPENSO: 10,
};

const eur = (c: Cent): string =>
  `${(c / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const horas = (min: number): string => `${Math.round(min / 60).toLocaleString('pt-PT')} h`;

/** Contratos em execução — os únicos sobre que faz sentido falar em risco. */
const emExecucao = (c: Contrato): boolean => c.estado === 'EM_VIGOR' || c.estado === 'SUSPENSO';

/**
 * Avalia o risco de cada contrato da carteira, ordenado do mais exposto ao
 * menos. Contratos sem motivo nenhum saem da lista: uma lista de riscos onde
 * tudo aparece não é uma lista de riscos.
 */
export function avaliarCarteira(
  contratos: ReadonlyArray<Contrato>,
  perfis: ReadonlyArray<PerfilContratual>,
  afetacoes: ReadonlyArray<{ perfilId: string; ativa: boolean }>,
  aprovados: ReadonlyArray<RegistoTempo>,
  hoje: DataISO,
): RiscoContrato[] {
  const out: RiscoContrato[] = [];

  for (const contrato of contratos.filter(emExecucao)) {
    const doContrato = aprovados.filter((r) => r.contratoId === contrato.id);
    const p = preverContrato(contrato, doContrato, hoje);
    const motivos: RiscoContrato['motivos'] = [];

    if (contrato.estado === 'SUSPENSO') {
      motivos.push({ motivo: 'SUSPENSO', descricao: 'O contrato está suspenso: a execução não corre.' });
    }

    // Folga: significativa a partir de 15% do valor atual — abaixo disso é ruído
    // de projeção, não um problema de gestão.
    if (p.gapNoTermino > 0 && contrato.precoContratualAtual > 0 && p.gapNoTermino / contrato.precoContratualAtual >= 0.15) {
      motivos.push({
        motivo: 'FOLGA_POR_EXECUTAR',
        descricao: `Ao ritmo recente sobram ${eur(p.gapNoTermino)} por executar no término (${Math.round((p.gapNoTermino / contrato.precoContratualAtual) * 100)}% do valor).`,
        valor: p.gapNoTermino,
      });
    }

    const dosPerfis = perfis.filter((x) => x.contratoId === contrato.id);
    if (dosPerfis.length > 0) {
      const minutosRestantes = dosPerfis.reduce((s, x) => {
        const c = calcularConsumoPerfil(x, doContrato.filter((r) => r.perfilId === x.id));
        return s + Math.max(0, x.quantidadePrevista - c.minutosConsumidos);
      }, 0);
      const ritmoMin = doContrato.length > 0 ? p.ritmoValorDia : 0;
      // Capacidade: converte-se o ritmo em minutos pela média do valor/hora
      // efetivo, para comparar com as horas que restam.
      const valorHoraMedio = doContrato.length > 0
        ? doContrato.reduce((s, r) => s + r.valorHoraAplicado, 0) / doContrato.length
        : 0;
      const minutosNecessarios = valorHoraMedio > 0 ? (ritmoMin / valorHoraMedio) * 60 * p.diasAteTermino : 0;
      if (minutosNecessarios > minutosRestantes && minutosRestantes >= 0 && minutosNecessarios > 0) {
        motivos.push({
          motivo: 'CAPACIDADE_INSUFICIENTE',
          descricao: `Ao ritmo recente seriam precisas ${horas(minutosNecessarios)} até ao término, mas só restam ${horas(minutosRestantes)}.`,
        });
      }

      const comSaldoSemGente = dosPerfis.filter((x) => {
        const c = calcularConsumoPerfil(x, doContrato.filter((r) => r.perfilId === x.id));
        const resta = x.quantidadePrevista - c.minutosConsumidos;
        return resta > 0 && !afetacoes.some((a) => a.perfilId === x.id && a.ativa);
      });
      if (comSaldoSemGente.length > 0) {
        motivos.push({
          motivo: 'SEM_PESSOAS',
          descricao: `${comSaldoSemGente.length} perfil(is) com horas por consumir e ninguém afeto: ${comSaldoSemGente.map((x) => x.nome).join(', ')}.`,
        });
      }
    }

    const j = janelaNovoProcedimento(hoje, contrato.dataTerminoContratual, contrato.vistoTribunalContasNecessario);
    if (j.diasParaLimite < 0) {
      motivos.push({
        motivo: 'PROCEDIMENTO_TARDIO',
        descricao: `O prazo para lançar o procedimento seguinte terminou em ${j.dataLimiteAcao} (há ${-j.diasParaLimite} dias).`,
        dias: j.diasParaLimite,
      });
    } else if (p.diasAteTermino <= 180) {
      motivos.push({
        motivo: 'TERMINO_PROXIMO',
        descricao: `Termina em ${contrato.dataTerminoContratual} (faltam ${p.diasAteTermino} dias).`,
        dias: p.diasAteTermino,
      });
    }

    if (motivos.length === 0) continue;
    out.push({
      contratoId: contrato.id, numero: contrato.numero, objeto: contrato.objeto, estado: contrato.estado,
      pontuacao: Math.min(100, motivos.reduce((s, m) => s + PESO[m.motivo], 0)),
      motivos,
      valorAtual: contrato.precoContratualAtual,
      valorExecutado: p.valorExecutado,
      gapNoTermino: p.gapNoTermino,
      diasAteTermino: p.diasAteTermino,
    });
  }

  return out.sort((a, b) => b.pontuacao - a.pontuacao || a.diasAteTermino - b.diasAteTermino);
}

export interface ContratoATerminar {
  contratoId: string;
  numero: string;
  objeto: string;
  dataTermino: DataISO;
  diasAteTermino: number;
  valorPorExecutar: Cent;
  /** Data-limite para lançar o procedimento seguinte em tempo útil. */
  dataLimiteProcedimento: DataISO;
  diasParaLancarProcedimento: number;
  exigeVistoPrevio: boolean;
}

/**
 * Contratos que terminam dentro de um intervalo, com o prazo de lançamento do
 * procedimento seguinte — que é o que interessa saber, não a data do fim: quando
 * o contrato acaba já não há nada a fazer.
 */
export function contratosATerminar(
  contratos: ReadonlyArray<Contrato>,
  aprovados: ReadonlyArray<RegistoTempo>,
  de: DataISO,
  ate: DataISO,
  hoje: DataISO,
): ContratoATerminar[] {
  return contratos
    .filter((c) => emExecucao(c) && c.dataTerminoContratual >= de && c.dataTerminoContratual <= ate)
    .map((c) => {
      const executado = aprovados.filter((r) => r.contratoId === c.id).reduce((s, r) => s + r.valorImputado, 0);
      const j = janelaNovoProcedimento(hoje, c.dataTerminoContratual, c.vistoTribunalContasNecessario);
      return {
        contratoId: c.id, numero: c.numero, objeto: c.objeto,
        dataTermino: c.dataTerminoContratual,
        diasAteTermino: Math.max(0, diasEntre(hoje, c.dataTerminoContratual)),
        valorPorExecutar: Math.max(0, c.precoContratualAtual - executado),
        dataLimiteProcedimento: j.dataLimiteAcao,
        diasParaLancarProcedimento: j.diasParaLimite,
        exigeVistoPrevio: c.vistoTribunalContasNecessario,
      };
    })
    .sort((a, b) => (a.dataTermino < b.dataTermino ? -1 : 1));
}

export interface ResumoCarteira {
  contratos: number;
  contratado: Cent;
  executado: Cent;
  faturadoValidado: Cent;
  porExecutar: Cent;
  /** Trabalho aprovado ainda não coberto por fatura validada. */
  porFaturar: Cent;
  porTipologia: Array<{ tipologia: string; contratos: number; contratado: Cent; executado: Cent }>;
}

/** Retrato financeiro da carteira em execução. */
export function resumoCarteira(
  contratos: ReadonlyArray<Contrato>,
  aprovados: ReadonlyArray<RegistoTempo>,
  faturas: ReadonlyArray<Fatura>,
): ResumoCarteira {
  const ativos = contratos.filter(emExecucao);
  const exec = (id: string): Cent => aprovados.filter((r) => r.contratoId === id).reduce((s, r) => s + r.valorImputado, 0);
  const val = (id: string): Cent => faturas
    .filter((f) => f.contratoId === id && f.estado === 'VALIDADA')
    .reduce((s, f) => s + (f.montanteAprovado ?? f.montanteSemIva), 0);

  const contratado = ativos.reduce((s, c) => s + c.precoContratualAtual, 0);
  const executado = ativos.reduce((s, c) => s + exec(c.id), 0);
  const faturadoValidado = ativos.reduce((s, c) => s + val(c.id), 0);

  const tipologias = [...new Set(ativos.map((c) => c.tipologia ?? 'BOLSA_HORAS'))];
  return {
    contratos: ativos.length,
    contratado, executado, faturadoValidado,
    porExecutar: Math.max(0, contratado - executado),
    porFaturar: Math.max(0, executado - faturadoValidado),
    porTipologia: tipologias.map((t) => {
      const dos = ativos.filter((c) => (c.tipologia ?? 'BOLSA_HORAS') === t);
      return {
        tipologia: t, contratos: dos.length,
        contratado: dos.reduce((s, c) => s + c.precoContratualAtual, 0),
        executado: dos.reduce((s, c) => s + exec(c.id), 0),
      };
    }),
  };
}
