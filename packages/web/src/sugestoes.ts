import { calcularConsumoPerfil, valorPrevistoPerfil, type Contrato, type PerfilContratual, type RegistoTempo } from '@chora/domain';

export interface PerfilAlternativo {
  contratoId: string;
  contratoNumero: string;
  perfilNome: string;
  horasDisponiveis: number;
  valorDisponivel: number;
}

export interface PerfilEmRisco {
  perfilNome: string;
  fracaoConsumo: number;
  alternativas: PerfilAlternativo[];
}

/**
 * Verificação determinística (não probabilística): para os perfis de um contrato
 * que estão a esgotar horas ou valor (>= limiar), procura perfis de nome idêntico
 * noutros contratos EM VIGOR com disponibilidade. Base da sugestão de "IA":
 * "existe um perfil idêntico disponível no contrato X".
 */
export function perfisIdenticosDisponiveis(
  contratoAlvoId: string,
  contratos: Contrato[],
  perfis: PerfilContratual[],
  aprovados: RegistoTempo[],
  limiarConsumo = 0.8,
): PerfilEmRisco[] {
  const resultados: PerfilEmRisco[] = [];
  const perfisAlvo = perfis.filter((p) => p.contratoId === contratoAlvoId);

  for (const p of perfisAlvo) {
    const consumo = calcularConsumoPerfil(p, aprovados.filter((r) => r.perfilId === p.id));
    const previstoValor = valorPrevistoPerfil(p);
    const fracHoras = p.quantidadePrevista > 0 ? consumo.minutosConsumidos / p.quantidadePrevista : 0;
    const fracValor = previstoValor > 0 ? consumo.valorConsumido / previstoValor : 0;
    const fracaoConsumo = Math.max(fracHoras, fracValor);
    if (fracaoConsumo < limiarConsumo) continue;

    const nomeAlvo = p.nome.trim().toLowerCase();
    const alternativas: PerfilAlternativo[] = [];
    for (const outro of perfis) {
      if (outro.contratoId === contratoAlvoId) continue;
      if (outro.nome.trim().toLowerCase() !== nomeAlvo) continue;
      const contrato = contratos.find((c) => c.id === outro.contratoId);
      if (contrato === undefined || contrato.estado !== 'EM_VIGOR') continue;
      const co = calcularConsumoPerfil(outro, aprovados.filter((r) => r.perfilId === outro.id));
      const horasDisponiveis = Math.max(0, (outro.quantidadePrevista - co.minutosConsumidos) / 60);
      const valorDisponivel = Math.max(0, valorPrevistoPerfil(outro) - co.valorConsumido);
      if (horasDisponiveis <= 0 && valorDisponivel <= 0) continue;
      alternativas.push({ contratoId: contrato.id, contratoNumero: contrato.numero, perfilNome: outro.nome, horasDisponiveis, valorDisponivel });
    }
    if (alternativas.length > 0) resultados.push({ perfilNome: p.nome, fracaoConsumo, alternativas });
  }
  return resultados;
}

/** Salvaguarda jurídica anexada às sugestões de mobilização entre contratos. */
export const SALVAGUARDA_JURIDICA =
  'Devem ser observados os requisitos contratuais e legais aplicáveis (nomeadamente o objeto, o âmbito e as condições de cada contrato, bem como o CCP); esta sugestão é meramente indicativa e não constitui parecer jurídico.';
