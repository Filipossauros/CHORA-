import type { Contrato } from '../entidades/contrato.js';
import type { PerfilContratual } from '../entidades/estrutura.js';
import type { Afetacao } from '../entidades/recursos.js';
import type { RegistoTempo } from '../entidades/registo-tempo.js';
import type { Cent, DataISO } from '../tipos/primitivos.js';
import { diasUteisEntre, HORAS_DIA_UTIL } from '../tipos/tempo.js';
import { calcularConsumoPerfil } from './consumo.js';
import { valorHoraVigente } from './preco-perfil.js';
import { valorPrevistoPerfil } from './financeira.js';
import { semelhancaPerfil, LIMIAR_SEMELHANCA } from '../ia/similaridade.js';

/**
 * ONDE CABE MAIS UMA PESSOA — a pergunta que antecede qualquer afetação.
 *
 * Não basta ter horas: um perfil com 800 h por consumir e três semanas de
 * vigência não comporta ninguém a tempo inteiro. E não basta ter dinheiro: um
 * contrato com valor disponível mas sem o perfil criado exige antes um ato de
 * estrutura. A folga real é a interseção de horas, prazo e cobertura — e é isso
 * que estas funções calculam, para que a resposta não seja uma impressão.
 */

/** Folga de um perfil concreto de um contrato. */
export interface FolgaPerfil {
  contratoId: string;
  contratoNumero: string;
  contratoObjeto: string;
  perfilId: string;
  perfilNome: string;
  /** Semelhança com o perfil procurado (1 = nome igual). */
  semelhanca: number;
  minutosDisponiveis: number;
  valorDisponivel: Cent;
  valorHora: Cent;
  /** Dias úteis entre hoje e o término do contrato. */
  diasUteisRestantes: number;
  /**
   * Quantas pessoas a tempo inteiro as horas disponíveis sustentam até ao
   * término. É o número que responde à pergunta — as horas por si só não.
   */
  pessoasComportadas: number;
  /** Pessoas já afetas a este perfil. */
  pessoasAfetas: number;
  entidadeNipc: string;
}

/** Contratos com folga financeira para um perfil a um dado valor/hora. */
export interface FolgaValor {
  contratoId: string;
  contratoNumero: string;
  contratoObjeto: string;
  valorDisponivel: Cent;
  diasUteisRestantes: number;
  /** Horas que o valor disponível compra ao valor/hora pedido. */
  horasComportadas: number;
  /** Pessoas a tempo inteiro que isso sustenta até ao término. */
  pessoasComportadas: number;
  /** Existe já um perfil com valor/hora próximo? Evita criar duplicados. */
  perfilCompativel?: { perfilId: string; nome: string; valorHora: Cent };
  entidadeNipc: string;
}

/** Minutos que uma pessoa a tempo inteiro consome em N dias úteis. */
const minutosFTE = (diasUteis: number): number => diasUteis * HORAS_DIA_UTIL * 60;

/** Contratos em execução — os únicos onde faz sentido colocar alguém. */
const emExecucao = (c: Contrato): boolean => c.estado === 'EM_VIGOR' || c.estado === 'SUSPENSO';

/**
 * Perfis com folga para acolher mais pessoas de um dado perfil, em toda a
 * carteira. Ordena por pessoas comportadas — quem pergunta quer o sítio onde
 * cabe mais gente, não o que tem mais horas em bruto.
 */
export function folgaParaPerfil(
  perfilProcurado: string,
  contratos: ReadonlyArray<Contrato>,
  perfis: ReadonlyArray<PerfilContratual>,
  afetacoes: ReadonlyArray<Afetacao>,
  aprovados: ReadonlyArray<RegistoTempo>,
  hoje: DataISO,
  limiar = LIMIAR_SEMELHANCA,
): FolgaPerfil[] {
  const out: FolgaPerfil[] = [];
  for (const contrato of contratos.filter(emExecucao)) {
    if (contrato.dataTerminoContratual <= hoje) continue;
    const diasUteisRestantes = diasUteisEntre(hoje, contrato.dataTerminoContratual);
    if (diasUteisRestantes <= 0) continue;

    for (const p of perfis.filter((x) => x.contratoId === contrato.id)) {
      const semelhanca = semelhancaPerfil(perfilProcurado, p.nome);
      if (semelhanca < limiar) continue;
      const consumo = calcularConsumoPerfil(p, aprovados.filter((r) => r.perfilId === p.id));
      const minutosDisponiveis = Math.max(0, p.quantidadePrevista - consumo.minutosConsumidos);
      if (minutosDisponiveis <= 0) continue;
      const valorHora = valorHoraVigente(p, hoje) ?? p.precos[p.precos.length - 1]?.valorHora ?? 0;
      out.push({
        contratoId: contrato.id, contratoNumero: contrato.numero, contratoObjeto: contrato.objeto,
        perfilId: p.id, perfilNome: p.nome, semelhanca,
        minutosDisponiveis,
        valorDisponivel: Math.max(0, valorPrevistoPerfil(p) - consumo.valorConsumido),
        valorHora, diasUteisRestantes,
        pessoasComportadas: Math.floor(minutosDisponiveis / Math.max(1, minutosFTE(diasUteisRestantes))),
        pessoasAfetas: afetacoes.filter((a) => a.perfilId === p.id && a.ativa).length,
        entidadeNipc: contrato.prestador.nipc,
      });
    }
  }
  return out.sort((a, b) =>
    b.pessoasComportadas - a.pessoasComportadas ||
    b.minutosDisponiveis - a.minutosDisponiveis ||
    b.semelhanca - a.semelhanca);
}

/**
 * Contratos com folga FINANCEIRA para um perfil a um dado valor/hora.
 *
 * A pergunta é outra: aqui não se procura um perfil que exista, procura-se onde
 * há dinheiro por executar que comporte alguém a X €/h. O perfil pode ter de
 * ser criado — por isso se assinala se já existe um compatível, para não
 * multiplicar perfis equivalentes no mesmo contrato.
 */
export function folgaParaValorHora(
  valorHoraPretendido: Cent,
  contratos: ReadonlyArray<Contrato>,
  perfis: ReadonlyArray<PerfilContratual>,
  aprovados: ReadonlyArray<RegistoTempo>,
  hoje: DataISO,
): FolgaValor[] {
  const out: FolgaValor[] = [];
  for (const contrato of contratos.filter(emExecucao)) {
    if (contrato.dataTerminoContratual <= hoje) continue;
    const diasUteisRestantes = diasUteisEntre(hoje, contrato.dataTerminoContratual);
    if (diasUteisRestantes <= 0) continue;

    const doContrato = aprovados.filter((r) => r.contratoId === contrato.id);
    const executado = doContrato.reduce((s, r) => s + r.valorImputado, 0);
    const valorDisponivel = Math.max(0, contrato.precoContratualAtual - executado);
    if (valorDisponivel <= 0 || valorHoraPretendido <= 0) continue;

    const horasComportadas = Math.floor(valorDisponivel / valorHoraPretendido);
    // Um valor/hora a 15% de distância é o mesmo papel a preço negociado
    // diferente; acima disso já é outro perfil.
    const compativel = perfis
      .filter((p) => p.contratoId === contrato.id)
      .map((p) => ({ p, vh: valorHoraVigente(p, hoje) ?? p.precos[p.precos.length - 1]?.valorHora ?? 0 }))
      .filter(({ vh }) => vh > 0 && Math.abs(vh - valorHoraPretendido) / valorHoraPretendido <= 0.15)
      .sort((a, b) => Math.abs(a.vh - valorHoraPretendido) - Math.abs(b.vh - valorHoraPretendido))[0];

    out.push({
      contratoId: contrato.id, contratoNumero: contrato.numero, contratoObjeto: contrato.objeto,
      valorDisponivel, diasUteisRestantes, horasComportadas,
      pessoasComportadas: Math.floor((horasComportadas * 60) / Math.max(1, minutosFTE(diasUteisRestantes))),
      ...(compativel !== undefined ? { perfilCompativel: { perfilId: compativel.p.id, nome: compativel.p.nome, valorHora: compativel.vh } } : {}),
      entidadeNipc: contrato.prestador.nipc,
    });
  }
  return out.sort((a, b) => b.pessoasComportadas - a.pessoasComportadas || b.valorDisponivel - a.valorDisponivel);
}
