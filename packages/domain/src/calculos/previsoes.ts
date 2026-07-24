import type { Contrato } from '../entidades/contrato.js';
import type { PerfilContratual } from '../entidades/estrutura.js';
import type { RegistoTempo } from '../entidades/registo-tempo.js';
import type { DataISO } from '../tipos/primitivos.js';
import { adicionarDias, diasEntre } from '../tipos/tempo.js';
import { calcularConsumoPerfil } from './consumo.js';

/**
 * Camada analítica/preditiva DETERMINÍSTICA. Estima ritmos de consumo recentes e
 * projeta esgotamento de horas/valor e execução no término. Não bloqueia
 * decisões — é indicativa e reproduzível (pressupostos explícitos).
 */

export const JANELA_RITMO_DIAS = 42; // ~6 semanas de ritmo recente

/** Minutos consumidos por dia (média na janela recente). */
export function ritmoDiarioMin(registos: ReadonlyArray<RegistoTempo>, hoje: DataISO, janelaDias = JANELA_RITMO_DIAS): number {
  const desde = adicionarDias(hoje, -janelaDias);
  const total = registos.filter((r) => r.data >= desde && r.data <= hoje).reduce((s, r) => s + r.duracao, 0);
  return janelaDias > 0 ? total / janelaDias : 0;
}

/** Valor imputado por dia (média na janela recente). */
export function ritmoValorDia(registos: ReadonlyArray<RegistoTempo>, hoje: DataISO, janelaDias = JANELA_RITMO_DIAS): number {
  const desde = adicionarDias(hoje, -janelaDias);
  const total = registos.filter((r) => r.data >= desde && r.data <= hoje).reduce((s, r) => s + r.valorImputado, 0);
  return janelaDias > 0 ? total / janelaDias : 0;
}

export interface PrevisaoPerfil {
  perfilId: string;
  nome: string;
  minutosPrevistos: number;
  minutosConsumidos: number;
  minutosRestantes: number;
  ritmoDiaMin: number;
  diasParaEsgotar: number | null;
  dataEsgotamento: DataISO | null;
  esgotaAntesDoTermino: boolean | null;
}

/** Previsão de esgotamento das horas de um perfil, ao ritmo recente. */
export function preverPerfil(perfil: PerfilContratual, aprovadosContrato: ReadonlyArray<RegistoTempo>, contrato: Contrato, hoje: DataISO, janelaDias = JANELA_RITMO_DIAS): PrevisaoPerfil {
  const doPerfil = aprovadosContrato.filter((r) => r.perfilId === perfil.id);
  const consumo = calcularConsumoPerfil(perfil, doPerfil);
  const restantes = Math.max(0, perfil.quantidadePrevista - consumo.minutosConsumidos);
  const ritmo = ritmoDiarioMin(doPerfil, hoje, janelaDias);
  const dias = ritmo > 0 ? Math.ceil(restantes / ritmo) : null;
  const data = dias !== null ? adicionarDias(hoje, dias) : null;
  return {
    perfilId: perfil.id, nome: perfil.nome,
    minutosPrevistos: perfil.quantidadePrevista, minutosConsumidos: consumo.minutosConsumidos, minutosRestantes: restantes,
    ritmoDiaMin: ritmo, diasParaEsgotar: dias, dataEsgotamento: data,
    esgotaAntesDoTermino: data !== null ? data <= contrato.dataTerminoContratual : null,
  };
}

export interface PrevisaoContrato {
  valorAtual: number;
  valorExecutado: number;
  valorRestante: number;
  ritmoValorDia: number;
  diasAteTermino: number;
  valorProjetadoNoTermino: number; // executado + ritmo × dias restantes
  execucaoProjetadaPct: number; // 0..1
  gapNoTermino: number; // saldo previsto por executar no término
  dataEsgotamentoValor: DataISO | null;
}

/** Previsão de execução financeira de um contrato até ao término. */
export function preverContrato(contrato: Contrato, aprovados: ReadonlyArray<RegistoTempo>, hoje: DataISO, janelaDias = JANELA_RITMO_DIAS): PrevisaoContrato {
  const executado = aprovados.reduce((s, r) => s + r.valorImputado, 0);
  const restante = Math.max(0, contrato.precoContratualAtual - executado);
  const ritmo = ritmoValorDia(aprovados, hoje, janelaDias);
  const diasAteTermino = Math.max(0, diasEntre(hoje, contrato.dataTerminoContratual));
  const projetadoAdicional = ritmo * diasAteTermino;
  const projetadoNoTermino = Math.min(contrato.precoContratualAtual, executado + projetadoAdicional);
  const dias = ritmo > 0 ? Math.ceil(restante / ritmo) : null;
  return {
    valorAtual: contrato.precoContratualAtual,
    valorExecutado: executado,
    valorRestante: restante,
    ritmoValorDia: ritmo,
    diasAteTermino,
    valorProjetadoNoTermino: projetadoNoTermino,
    execucaoProjetadaPct: contrato.precoContratualAtual > 0 ? projetadoNoTermino / contrato.precoContratualAtual : 0,
    gapNoTermino: Math.max(0, contrato.precoContratualAtual - (executado + projetadoAdicional)),
    dataEsgotamentoValor: dias !== null ? adicionarDias(hoje, dias) : null,
  };
}

/** Cenário what-if: dias até esgotar as horas restantes com N pessoas a tempo inteiro. */
export function diasComFTE(minutosRestantes: number, ftes: number, horasDiaPorFTE = 8): number | null {
  const minutosDia = ftes * horasDiaPorFTE * 60;
  return minutosDia > 0 ? Math.ceil(minutosRestantes / minutosDia) : null;
}
