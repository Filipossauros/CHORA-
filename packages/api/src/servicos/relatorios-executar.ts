import { diaDeInstante } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { ContextoUtilizador } from '../auth/token-validator.js';
import { podeExecutar } from '../auth/permissoes.js';
import { capacidadePorNome } from '../assistente/capacidades/index.js';
import { ErroEsclarecimento } from '../assistente/erros.js';
import { periodoNaFrase } from '../assistente/tempo.js';
import type { Capacidade, ContextoConversa, TabelaTrabalho } from '../assistente/tipos.js';
import type { RelatorioAdHoc, PassoRelatorio } from '../repositorios/memoria/index.js';
import { ServicoRelatoriosAdHoc } from './relatorios-adhoc.js';

/** O que correu, e o que não correu, ao executar um relatório guardado. */
export interface ResultadoRelatorio {
  relatorio: RelatorioAdHoc;
  executadoEm: string;
  tabela?: TabelaTrabalho;
  /** Período efetivamente usado, quando o relatório tem recorte temporal. */
  periodo?: { de: string; ate: string; rotulo: string };
  /** O passo que impediu a execução, quando houve um. */
  problema?: { passo: number; capacidade: string; motivo: string; tipo: MotivoFalha };
}

export type MotivoFalha = 'SEM_COMPETENCIA' | 'FUNCAO_DESAPARECEU' | 'PARAMETROS_INVALIDOS' | 'PRECISA_ESCOLHA' | 'SEM_LINHAS';

/**
 * EXECUTAR UM RELATÓRIO GUARDADO — repetir a receita com os dados de hoje.
 *
 * Três propriedades que só existem porque se guardou a receita e não o retrato:
 *
 *  1. **Os números são os de agora.** É o que faz de um relatório uma coisa a
 *     que se volta, em vez de um anexo que envelhece.
 *  2. **As permissões são as de quem abre.** Cada passo torna a passar pela
 *     matriz: um relatório com faturação não mostra faturação a quem não a pode
 *     consultar. Um retrato guardado não conseguiria garantir isto — os dados
 *     já lá estavam escritos.
 *  3. **A rutura é visível.** Se uma função desapareceu ou um parâmetro deixou
 *     de resolver, diz-se qual o passo e porquê, em vez de se devolver uma
 *     tabela vazia com ar de resposta.
 */
export async function executarRelatorio(
  ctx: Contexto, relatorio: RelatorioAdHoc, u: ContextoUtilizador,
): Promise<ResultadoRelatorio> {
  const hoje = diaDeInstante(ctx.relogio.agora());
  const executadoEm = ctx.relogio.agora();
  const conversa: ContextoConversa = {};
  const exec = {
    ctx, utilizador: u, hoje, conversa,
    lembrar: (patch: ContextoConversa): void => { Object.assign(conversa, patch); },
  };

  const periodo = periodoDoRelatorio(relatorio, hoje);
  const base = { relatorio, executadoEm, ...(periodo !== undefined ? { periodo } : {}) };

  for (const [i, passo] of relatorio.passos.entries()) {
    const capacidade = capacidadePorNome(passo.capacidade);
    if (capacidade === undefined) {
      return { ...base, problema: falha(i, passo, 'FUNCAO_DESAPARECEU', `A função «${passo.capacidade}» já não existe nesta versão da aplicação.`) };
    }
    if (capacidade.operacao !== undefined && !podeExecutar(u.papeis, capacidade.operacao)) {
      return { ...base, problema: falha(i, passo, 'SEM_COMPETENCIA', `Este relatório usa «${capacidade.titulo}», que exige competência que não tem. Não lhe posso mostrar os dados que dela dependem.`) };
    }

    const parametros = i === 0 && periodo !== undefined
      ? { ...passo.parametros, periodoDe: periodo.de, periodoAte: periodo.ate }
      : passo.parametros;
    const parsed = capacidade.parametros.safeParse(parametros);
    if (!parsed.success) {
      return { ...base, problema: falha(i, passo, 'PARAMETROS_INVALIDOS', `Os parâmetros guardados já não servem «${capacidade.titulo}».`) };
    }

    try {
      const r = await (capacidade.executar as Capacidade['executar'])(parsed.data, exec);
      // O primeiro passo abre a lista; os seguintes gerem-na e já a deixaram na
      // conversa. Fora do assistente não há quem o faça por eles.
      if (capacidade.gereTabela !== true) {
        const chaves = r.tabela?.chaves;
        if (r.tabela === undefined || chaves === undefined || chaves.length === 0) {
          return { ...base, problema: falha(i, passo, 'SEM_LINHAS', `«${capacidade.titulo}» não devolve hoje nenhuma linha: não há sobre o que aplicar os passos seguintes.`) };
        }
        conversa.tabela = { ...r.tabela, chaves, tipoEntidade: chaves[0]!.tipo, origem: [{ ...passo, parametros: parsed.data as Record<string, unknown> }] };
      }
    } catch (erro) {
      if (erro instanceof ErroEsclarecimento) {
        return { ...base, problema: falha(i, passo, 'PRECISA_ESCOLHA', `«${capacidade.titulo}» já não resolve sozinho o que lhe foi guardado: ${erro.pergunta}`) };
      }
      throw erro;
    }
  }

  const tabela = conversa.tabela;
  if (tabela !== undefined) {
    await new ServicoRelatoriosAdHoc(ctx).registarExecucao(relatorio.id, tabela.linhas.length, u);
    await ctx.auditoria.registar({
      utilizadorId: u.utilizadorId, entidade: 'RelatorioAdHoc', entidadeId: relatorio.id,
      operacao: 'EXECUTAR', resultado: 'PERMITIDO',
      depois: { titulo: relatorio.titulo, linhas: tabela.linhas.length, colunas: tabela.colunas.length },
    });
  }
  return { ...base, ...(tabela !== undefined ? { tabela } : {}) };
}

const falha = (passo: number, p: PassoRelatorio, tipo: MotivoFalha, motivo: string): NonNullable<ResultadoRelatorio['problema']> =>
  ({ passo: passo + 1, capacidade: p.capacidade, tipo, motivo });

/**
 * O período com que o relatório corre hoje.
 *
 * Relativo, reinterpreta-se a frase original com a data de hoje — é a mesma
 * função que interpretou «este ano» quando a pergunta foi feita, pelo que nunca
 * se dessincroniza dela. Fixo, usam-se as datas que ficaram nos parâmetros.
 */
export function periodoDoRelatorio(relatorio: RelatorioAdHoc, hoje: string): { de: string; ate: string; rotulo: string } | undefined {
  const primeiro = relatorio.passos[0];
  if (primeiro === undefined) return undefined;
  if (relatorio.periodoRelativo) return periodoNaFrase(primeiro.frase, hoje);

  const de = primeiro.parametros['periodoDe'];
  const ate = primeiro.parametros['periodoAte'];
  if (typeof de !== 'string' || typeof ate !== 'string') return undefined;
  return { de, ate, rotulo: `${de} a ${ate}` };
}
