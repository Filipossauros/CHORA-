import type { PerfilContratual } from '../entidades/estrutura.js';
import type { RegistoTempo } from '../entidades/registo-tempo.js';
import type { Cent, Minutos } from '../tipos/primitivos.js';
import type { TipoDotacao } from '../enums/index.js';

/**
 * Cálculo de consumo físico e financeiro por perfil (secção 10.3 — Execução
 * física; RN-503, RN-504, RN-505).
 *
 * Consideram-se consumidores os registos APROVADOS (o consumo comprometido).
 * O consumo projetado, que inclui SUBMETIDO, é calculado à parte para a
 * validação da aprovação (evitar exceder o total ao aprovar um lote).
 */

export interface ConsumoPerfil {
  perfilId: string;
  minutosDisponiveis: Minutos;
  minutosConsumidos: Minutos;
  minutosPorTipo: Record<TipoDotacao, Minutos>;
  valorConsumido: Cent;
  percentagemHoras: number; // 0..1 (ou >1 se exceder)
}

const TIPOS_ZERADOS = (): Record<TipoDotacao, Minutos> => ({
  HORAS_BASE: 0,
  BOLSA_VALOR: 0,
  TRABALHOS_COMPLEMENTARES: 0,
});

/**
 * Consumo de um perfil a partir de um conjunto de registos.
 * O chamador decide que registos passar (tipicamente os APROVADOS).
 */
export function calcularConsumoPerfil(
  perfil: PerfilContratual,
  registos: ReadonlyArray<RegistoTempo>,
): ConsumoPerfil {
  const doPerfil = registos.filter((r) => r.perfilId === perfil.id);
  const minutosPorTipo = TIPOS_ZERADOS();
  let minutosConsumidos = 0;
  let valorConsumido = 0;

  for (const r of doPerfil) {
    minutosConsumidos += r.duracao;
    minutosPorTipo[r.tipoDotacaoConsumida] += r.duracao;
    valorConsumido += r.valorImputado;
  }

  const minutosDisponiveis = perfil.quantidadePrevista;
  const percentagemHoras =
    minutosDisponiveis > 0 ? minutosConsumidos / minutosDisponiveis : 0;

  return {
    perfilId: perfil.id,
    minutosDisponiveis,
    minutosConsumidos,
    minutosPorTipo,
    valorConsumido,
    percentagemHoras,
  };
}

/**
 * Minutos que ainda podem ser aprovados sem exceder a quantidade prevista do
 * perfil, dado o já consumido (registos aprovados).
 */
export function minutosDisponiveisPerfil(
  perfil: PerfilContratual,
  registosAprovados: ReadonlyArray<RegistoTempo>,
): Minutos {
  const consumo = calcularConsumoPerfil(perfil, registosAprovados);
  return Math.max(0, consumo.minutosDisponiveis - consumo.minutosConsumidos);
}
