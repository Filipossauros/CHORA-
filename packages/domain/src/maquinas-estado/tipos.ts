/**
 * Infraestrutura comum das máquinas de estado (secção 7).
 */

export interface Transicao<Estado extends string, Ator extends string> {
  de: Estado;
  para: Estado;
  atores: ReadonlyArray<Ator>;
  /** Códigos das regras aplicáveis à transição (documentação e rastreio). */
  regras?: ReadonlyArray<string>;
}

export interface ResultadoTransicao {
  permitida: boolean;
  motivo?: string;
}

/** Cria um avaliador de transições a partir de uma tabela declarativa. */
export function criarMaquina<Estado extends string, Ator extends string>(
  transicoes: ReadonlyArray<Transicao<Estado, Ator>>,
) {
  function transicaoPermitida(de: Estado, para: Estado, ator: Ator): ResultadoTransicao {
    const t = transicoes.find((x) => x.de === de && x.para === para);
    if (t === undefined) {
      return { permitida: false, motivo: `Transição ${de} → ${para} inexistente.` };
    }
    if (!t.atores.includes(ator)) {
      return {
        permitida: false,
        motivo: `O ator ${ator} não pode executar a transição ${de} → ${para}.`,
      };
    }
    return { permitida: true };
  }

  function transicoesPossiveis(de: Estado, ator: Ator): ReadonlyArray<Estado> {
    return transicoes.filter((t) => t.de === de && t.atores.includes(ator)).map((t) => t.para);
  }

  return { transicoes, transicaoPermitida, transicoesPossiveis };
}
