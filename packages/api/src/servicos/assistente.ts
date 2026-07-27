import type { PapelAplicacional } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';
import { diaDeInstante } from '@chora/domain';
import { MATRIZ, podeExecutar } from '../auth/permissoes.js';
import { CAPACIDADES, capacidadePorNome } from '../assistente/capacidades.js';
import { encaminhar, type Encaminhamento } from '../assistente/router.js';
import type { Capacidade, CapacidadePublica, ResultadoCapacidade, Simulacao } from '../assistente/tipos.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';

/** O que o assistente devolve a uma frase. */
export interface Interpretacao {
  /** A capacidade escolhida, quando alguma bateu. */
  capacidade?: CapacidadePublica;
  parametros?: Record<string, unknown>;
  origem?: 'PADRAO' | 'MODELO';
  confianca?: number;
  /** Consultas correm de imediato; ações trazem simulação e esperam confirmação. */
  resultado?: ResultadoCapacidade;
  simulacao?: Simulacao;
  /** Quando não se percebeu a pergunta, ou o utilizador não tem competência. */
  mensagem?: string;
  /** Sugestões do catálogo, para orientar quem não sabe o que perguntar. */
  sugestoes?: string[];
}

/**
 * SERVIÇO DO ASSISTENTE — orquestra encaminhamento, autorização e execução.
 *
 * Não é aqui que se decide nada de negócio: as capacidades chamam os serviços
 * normais, que aplicam as regras. O que este serviço garante é o contrato do
 * assistente — lista fechada, esquema validado, papel verificado, ação
 * confirmada, tudo auditado com a frase que a originou.
 */
export class ServicoAssistente {
  constructor(private readonly ctx: Contexto) {}

  /** Vista pública do catálogo — alimenta o ecrã «Regras e alertas». */
  capacidades(): CapacidadePublica[] {
    return CAPACIDADES.map((c) => publica(c));
  }

  /** Frases de exemplo, para sugerir a quem não sabe o que pode perguntar. */
  sugestoes(papeis: ReadonlyArray<PapelAplicacional>): string[] {
    return CAPACIDADES
      .filter((c) => this.autorizada(c, papeis))
      .flatMap((c) => c.exemplos.slice(0, 1));
  }

  private autorizada(c: Capacidade<never>, papeis: ReadonlyArray<PapelAplicacional>): boolean {
    return c.operacao === undefined || podeExecutar(papeis, c.operacao);
  }

  /**
   * Interpreta a frase. As CONSULTAS correm já — não há nada a confirmar em
   * ler. As AÇÕES devolvem a simulação e esperam por `executar`: é a diferença
   * entre responder e mexer.
   */
  async interpretar(frase: string, u: ContextoUtilizador, encaminhamento?: Encaminhamento): Promise<Interpretacao> {
    const e = encaminhamento ?? encaminhar(frase);
    if (e === undefined) {
      return {
        mensagem:
          'Não percebi o suficiente para agir sobre isso. O que sei fazer está listado em «Regras e alertas → Funções do assistente» — ' +
          'e não faço nada que não esteja nessa lista.',
        sugestoes: this.sugestoes(u.papeis).slice(0, 4),
      };
    }

    const capacidade = capacidadePorNome(e.capacidade);
    if (capacidade === undefined) {
      // Só acontece se o modelo inventar um nome: rejeita-se sem executar.
      return { mensagem: `A função «${e.capacidade}» não existe.`, sugestoes: this.sugestoes(u.papeis).slice(0, 4) };
    }
    if (!this.autorizada(capacidade, u.papeis)) {
      throw new ErroProibido(`Não tem competência para «${capacidade.titulo}».`);
    }

    const parsed = capacidade.parametros.safeParse(e.parametros);
    if (!parsed.success) {
      return {
        capacidade: publica(capacidade),
        mensagem: `Percebi que quer «${capacidade.titulo}», mas faltam dados: ${
          capacidade.parametrosDescricao.filter((p) => p.obrigatorio).map((p) => p.descricao).join('; ')
        }.`,
      };
    }

    const exec = { ctx: this.ctx, utilizador: u, hoje: diaDeInstante(this.ctx.relogio.agora()) };
    const base: Interpretacao = {
      capacidade: publica(capacidade), parametros: parsed.data as Record<string, unknown>,
      origem: e.origem, confianca: e.confianca,
    };

    if (capacidade.tipo === 'CONSULTA') {
      const resultado = await (capacidade.executar as Capacidade['executar'])(parsed.data, exec);
      await this.auditar(frase, capacidade, 'CONSULTAR', u);
      return { ...base, resultado };
    }

    // Ações com simulação param aqui, à espera de confirmação. As que não têm
    // (as que só abrem UI embebida) correm — não mexem em nada por si.
    if (capacidade.simular !== undefined) {
      const simulacao = await (capacidade.simular as NonNullable<Capacidade['simular']>)(parsed.data, exec);
      return { ...base, simulacao };
    }
    const resultado = await (capacidade.executar as Capacidade['executar'])(parsed.data, exec);
    return { ...base, resultado };
  }

  /**
   * Executa uma ação já confirmada. Revalida tudo — papel, esquema e simulação —
   * porque entre a confirmação e a execução os dados podem ter mudado, e uma
   * confirmação não é um cheque em branco.
   */
  async executar(nome: string, parametros: unknown, frase: string, u: ContextoUtilizador): Promise<ResultadoCapacidade> {
    const capacidade = capacidadePorNome(nome);
    if (capacidade === undefined) throw new ErroValidacao(`A função «${nome}» não existe.`);
    if (capacidade.tipo !== 'ACAO') throw new ErroValidacao(`«${capacidade.titulo}» é uma consulta: não há nada a executar.`);
    if (!this.autorizada(capacidade, u.papeis)) throw new ErroProibido(`Não tem competência para «${capacidade.titulo}».`);

    const parsed = capacidade.parametros.safeParse(parametros);
    if (!parsed.success) throw new ErroValidacao('Parâmetros inválidos para esta função.', parsed.error.issues);

    const exec = { ctx: this.ctx, utilizador: u, hoje: diaDeInstante(this.ctx.relogio.agora()) };
    if (capacidade.simular !== undefined) {
      const s = await (capacidade.simular as NonNullable<Capacidade['simular']>)(parsed.data, exec);
      if (s.bloqueada) {
        const falhadas = s.regras.filter((r) => !r.ok);
        throw new ErroValidacao(
          `A ação não pode ser executada: ${falhadas.map((r) => `${r.codigo} — ${r.mensagem ?? r.descricao}`).join('; ') || s.avisos.join('; ')}`,
        );
      }
    }

    const resultado = await (capacidade.executar as Capacidade['executar'])(parsed.data, exec);
    await this.auditar(frase, capacidade, 'EXECUTAR', u, parsed.data);
    return resultado;
  }

  /**
   * Regista o que o assistente fez, e com que frase. Quem auditar tem de poder
   * distinguir um ato praticado no ecrã de um pedido em linguagem natural — e
   * ver a frase que o originou.
   */
  private async auditar(frase: string, c: Capacidade<never>, operacao: string, u: ContextoUtilizador, parametros?: unknown): Promise<void> {
    await this.ctx.auditoria.registar({
      utilizadorId: u.utilizadorId,
      entidade: 'Assistente', entidadeId: c.nome,
      operacao: `ASSISTENTE:${operacao}`, resultado: 'PERMITIDO',
      depois: { frase, capacidade: c.nome, tipo: c.tipo, ...(parametros !== undefined ? { parametros } : {}) },
    });
  }
}

function publica(c: Capacidade<never>): CapacidadePublica {
  return {
    nome: c.nome, titulo: c.titulo, descricao: c.descricao, tipo: c.tipo,
    parametros: c.parametrosDescricao, regras: c.regras, exemplos: c.exemplos,
    papeis: c.operacao !== undefined ? [...MATRIZ[c.operacao]] : ['GESTOR_CONTRATO', 'GESTOR_TECNICO', 'ELEMENTO_EQUIPA_TECNICA'],
  };
}
