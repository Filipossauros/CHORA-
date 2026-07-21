import type { PapelAplicacional, Relogio } from '@chora/domain';
import { DateTime } from 'luxon';
import { ErroAutenticacao, type ContextoUtilizador, type TokenValidator } from './token-validator.js';

/**
 * Utilizadores de desenvolvimento. O token é o próprio identificador do
 * utilizador, lido do cabeçalho `X-Dev-User` (secção 9.2).
 */
export interface UtilizadorDev {
  utilizadorId: string;
  papeis: PapelAplicacional[];
  projetoId?: string;
}

/**
 * FakeTokenValidator — desenvolvimento local. Aceita o valor de `X-Dev-User`
 * (propagado como token) e resolve o utilizador a partir de um diretório fixo.
 */
export class FakeTokenValidator implements TokenValidator {
  private readonly utilizadores: Map<string, UtilizadorDev>;

  constructor(
    utilizadores: UtilizadorDev[],
    private readonly relogio: Relogio,
    private readonly organizacao = 'dev',
  ) {
    this.utilizadores = new Map(utilizadores.map((u) => [u.utilizadorId, u]));
  }

  async validar(token: string, contextoProjeto?: string): Promise<ContextoUtilizador> {
    const u = this.utilizadores.get(token);
    if (u === undefined) {
      throw new ErroAutenticacao(`Utilizador de desenvolvimento desconhecido: ${token}`);
    }
    const validoAte = DateTime.fromISO(this.relogio.agora()).plus({ hours: 1 }).toUTC().toISO();
    return {
      utilizadorId: u.utilizadorId,
      papeis: u.papeis,
      organizacao: this.organizacao,
      ...(contextoProjeto !== undefined
        ? { projetoId: contextoProjeto }
        : u.projetoId !== undefined
          ? { projetoId: u.projetoId }
          : {}),
      validoAte: validoAte ?? this.relogio.agora(),
    };
  }
}
