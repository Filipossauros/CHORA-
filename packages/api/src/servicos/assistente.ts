import type { PapelAplicacional } from '@chora/domain';
import { diaDeInstante } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';
import { MATRIZ, podeExecutar } from '../auth/permissoes.js';
import { CAPACIDADES, capacidadePorNome } from '../assistente/capacidades/index.js';
import { encaminhar, type Encaminhamento } from '../assistente/router.js';
import { periodoNaFrase } from '../assistente/tempo.js';
import { ErroEsclarecimento } from '../assistente/erros.js';
import type {
  Capacidade, CapacidadePublica, ContextoConversa, ResultadoCapacidade, Simulacao,
} from '../assistente/tipos.js';
import { ErroProibido, ErroValidacao } from '../erros/problema.js';

/** Pergunta de volta, quando o pedido é ambíguo ou lhe falta um dado. */
export interface Esclarecimento {
  pergunta: string;
  opcoes: Array<{ rotulo: string; detalhe?: string; parametros: Record<string, unknown> }>;
}

export interface Interpretacao {
  capacidade?: CapacidadePublica;
  parametros?: Record<string, unknown>;
  origem?: 'PADRAO' | 'MODELO';
  confianca?: number;
  resultado?: ResultadoCapacidade;
  simulacao?: Simulacao;
  esclarecimento?: Esclarecimento;
  mensagem?: string;
  sugestoes?: string[];
  /** Memória da conversa atualizada — o cliente devolve-a no turno seguinte. */
  conversa: ContextoConversa;
}

/**
 * SERVIÇO DO ASSISTENTE — encaminha, autoriza, esclarece e executa.
 *
 * Nada de negócio se decide aqui: as capacidades chamam os serviços normais, que
 * aplicam as regras. O que este serviço garante é o contrato do assistente —
 * lista fechada, esquema validado, papel verificado, ação confirmada, tudo
 * auditado com a frase que a originou.
 *
 * Duas peças fazem a diferença entre um assistente utilizável e uma vitrina: a
 * MEMÓRIA (para «e a vigência?» funcionar) e o ESCLARECIMENTO (para «qual o
 * saldo?» sem contrato perguntar de volta em vez de recusar).
 */
export class ServicoAssistente {
  constructor(private readonly ctx: Contexto) {}

  capacidades(): CapacidadePublica[] {
    return CAPACIDADES.map((c) => publica(c));
  }

  sugestoes(papeis: ReadonlyArray<PapelAplicacional>): string[] {
    return CAPACIDADES.filter((c) => this.autorizada(c, papeis)).flatMap((c) => c.exemplos.slice(0, 1));
  }

  private autorizada(c: Capacidade<never>, papeis: ReadonlyArray<PapelAplicacional>): boolean {
    return c.operacao === undefined || podeExecutar(papeis, c.operacao);
  }

  /**
   * Interpreta a frase. Consultas correm já; ações devolvem simulação e esperam
   * confirmação. Quando falta um dado ou há ambiguidade, devolve uma pergunta
   * com opções — pedir precisão é trabalho do assistente, não de quem pergunta.
   */
  async interpretar(
    frase: string,
    u: ContextoUtilizador,
    encaminhamento?: Encaminhamento,
    conversa: ContextoConversa = {},
  ): Promise<Interpretacao> {
    const memoria: ContextoConversa = { ...conversa };
    const e = encaminhamento ?? encaminhar(frase, conversa);

    if (e === undefined) {
      return {
        conversa: memoria,
        mensagem:
          'Não percebi o suficiente para agir sobre isso. Pergunte «o que sabes fazer?» para ver a lista completa — ' +
          'e note que não faço nada fora dela.',
        sugestoes: this.sugestoes(u.papeis).slice(0, 4),
      };
    }

    const capacidade = capacidadePorNome(e.capacidade);
    if (capacidade === undefined) {
      return { conversa: memoria, mensagem: `A função «${e.capacidade}» não existe.`, sugestoes: this.sugestoes(u.papeis).slice(0, 4) };
    }
    if (!this.autorizada(capacidade, u.papeis)) {
      throw new ErroProibido(`Não tem competência para «${capacidade.titulo}».`);
    }

    // O período dito na frase entra como parâmetro; o que a conversa lembra
    // preenche o que a frase deixou por dizer.
    const periodo = periodoNaFrase(frase, diaDeInstante(this.ctx.relogio.agora()));
    const parametros = {
      ...(periodo !== undefined ? { periodoDe: periodo.de, periodoAte: periodo.ate } : {}),
      ...e.parametros,
    };

    const parsed = capacidade.parametros.safeParse(parametros);
    if (!parsed.success) {
      return {
        conversa: memoria, capacidade: publica(capacidade),
        mensagem: `Percebi que quer «${capacidade.titulo}», mas os dados não batem certo: ${
          capacidade.parametrosDescricao.filter((x) => x.obrigatorio).map((x) => x.descricao).join('; ') || 'reformule o pedido'
        }.`,
      };
    }

    const exec = {
      ctx: this.ctx, utilizador: u,
      hoje: diaDeInstante(this.ctx.relogio.agora()),
      conversa: memoria,
      lembrar: (patch: ContextoConversa): void => { Object.assign(memoria, patch); },
    };
    const base = {
      conversa: memoria, capacidade: publica(capacidade),
      parametros: parsed.data as Record<string, unknown>,
      origem: e.origem, confianca: e.confianca,
    };

    try {
      if (capacidade.tipo === 'CONSULTA') {
        const resultado = await (capacidade.executar as Capacidade['executar'])(parsed.data, exec);
        abrirTabela(memoria, capacidade, frase, parsed.data as Record<string, unknown>, resultado);
        await this.auditar(frase, capacidade, 'CONSULTAR', u);
        return { ...base, resultado };
      }
      if (capacidade.simular !== undefined) {
        const simulacao = await (capacidade.simular as NonNullable<Capacidade['simular']>)(parsed.data, exec);
        return { ...base, simulacao };
      }
      const resultado = await (capacidade.executar as Capacidade['executar'])(parsed.data, exec);
      abrirTabela(memoria, capacidade, frase, parsed.data as Record<string, unknown>, resultado);
      return { ...base, resultado };
    } catch (erro) {
      if (erro instanceof ErroEsclarecimento) {
        return { ...base, esclarecimento: { pergunta: erro.pergunta, opcoes: erro.opcoes } };
      }
      throw erro;
    }
  }

  /**
   * Executa uma ação já confirmada. Revalida tudo — papel, esquema e simulação —
   * porque entre a confirmação e a execução os dados podem ter mudado, e uma
   * confirmação não é um cheque em branco.
   */
  async executar(
    nome: string, parametros: unknown, frase: string, u: ContextoUtilizador, conversa: ContextoConversa = {},
  ): Promise<ResultadoCapacidade> {
    const capacidade = capacidadePorNome(nome);
    if (capacidade === undefined) throw new ErroValidacao(`A função «${nome}» não existe.`);
    if (capacidade.tipo !== 'ACAO') throw new ErroValidacao(`«${capacidade.titulo}» é uma consulta: não há nada a executar.`);
    if (!this.autorizada(capacidade, u.papeis)) throw new ErroProibido(`Não tem competência para «${capacidade.titulo}».`);

    const parsed = capacidade.parametros.safeParse(parametros);
    if (!parsed.success) throw new ErroValidacao('Parâmetros inválidos para esta função.', parsed.error.issues);

    const memoria: ContextoConversa = { ...conversa };
    const exec = {
      ctx: this.ctx, utilizador: u,
      hoje: diaDeInstante(this.ctx.relogio.agora()),
      conversa: memoria,
      lembrar: (patch: ContextoConversa): void => { Object.assign(memoria, patch); },
    };

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

/**
 * Põe a tabela devolvida em cima da mesa, para a pergunta seguinte poder
 * trabalhar sobre ela.
 *
 * Só as tabelas com CHAVES entram: sem identificador por linha não há junção
 * possível, e juntar por texto é como se constroem relatórios que parecem
 * certos. As capacidades que gerem a própria tabela ficam de fora — já a
 * atualizaram, com a proveniência que lhes pertence.
 */
function abrirTabela(
  memoria: ContextoConversa, c: Capacidade<never>, frase: string,
  parametros: Record<string, unknown>, r: ResultadoCapacidade,
): void {
  if (c.gereTabela === true) return;
  const chaves = r.tabela?.chaves;
  if (r.tabela === undefined || chaves === undefined || chaves.length === 0) return;
  memoria.tabela = {
    ...r.tabela, chaves,
    tipoEntidade: chaves[0]!.tipo,
    origem: [{ frase, capacidade: c.nome, parametros }],
  };
}

function publica(c: Capacidade<never>): CapacidadePublica {
  return {
    nome: c.nome, titulo: c.titulo, descricao: c.descricao, tipo: c.tipo,
    parametros: c.parametrosDescricao, regras: c.regras, exemplos: c.exemplos,
    papeis: c.operacao !== undefined ? [...MATRIZ[c.operacao]] : ['GESTOR_CONTRATO', 'GESTOR_TECNICO', 'ELEMENTO_EQUIPA_TECNICA'],
  };
}
