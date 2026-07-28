import type { Contrato, PerfilContratual, FonteResposta, Proveniencia } from '@chora/domain';
import type { ContextoExecucao, RegraAvaliada } from '../tipos.js';
import type { Projeto } from '../../repositorios/memoria/index.js';
import { ErroEsclarecimento } from '../erros.js';
import { resolverContrato, resolverPessoa, resolverProjeto, resolverPerfil, rotuloContrato } from '../resolucao.js';
import { anoCorrente, type Periodo } from '../tempo.js';

export const F = (proveniencia: Proveniencia, referencia: string): FonteResposta => ({ proveniencia, referencia });
export const horas = (min: number): number => Math.round(min / 60);
export const euros = (c: number): number => +(c / 100).toFixed(2);

/**
 * Resolve o contrato a partir do que foi dito, ou do que já se tinha falado.
 *
 * Três caminhos, por esta ordem: o que a frase diz, o que a conversa lembra, e
 * — se nem um nem outro chegarem — uma pergunta com as opções à frente. Nunca
 * se adivinha: agir sobre o contrato errado é o pior desfecho possível.
 */
export async function contratoDe(referencia: string | undefined, e: ContextoExecucao): Promise<Contrato> {
  if (referencia !== undefined && referencia.trim() !== '') {
    const r = await resolverContrato(referencia, e.ctx);
    if (r.tipo === 'UM') {
      e.lembrar({ contratoId: r.valor.id, contratoNumero: r.valor.numero });
      return r.valor;
    }
    if (r.tipo === 'VARIOS') {
      throw new ErroEsclarecimento(`«${referencia}» corresponde a mais do que um contrato. A qual se refere?`,
        r.candidatos.map((c) => ({ rotulo: c.numero, detalhe: `${c.objeto} · ${c.prestador.nome}`, parametros: { contratoNumero: c.numero } })));
    }
    throw new ErroEsclarecimento(`Não encontrei nenhum contrato que corresponda a «${referencia}». Qual destes?`,
      await opcoesContratos(e));
  }

  if (e.conversa.contratoNumero !== undefined) {
    const r = await resolverContrato(e.conversa.contratoNumero, e.ctx);
    if (r.tipo === 'UM') return r.valor;
  }
  throw new ErroEsclarecimento('De que contrato estamos a falar?', await opcoesContratos(e));
}

/** Lista de contratos em execução, para desambiguar. */
async function opcoesContratos(e: ContextoExecucao): Promise<Array<{ rotulo: string; detalhe: string; parametros: Record<string, unknown> }>> {
  const todos = await e.ctx.repos.contratos.todos((c) => c.estado === 'EM_VIGOR' || c.estado === 'SUSPENSO');
  return todos.slice(0, 12).map((c) => ({
    rotulo: c.numero, detalhe: `${c.objeto} · ${c.prestador.nome}`, parametros: { contratoNumero: c.numero },
  }));
}

/** Resolve o projeto, com desambiguação e memória de conversa. */
export async function projetoDe(referencia: string | undefined, e: ContextoExecucao): Promise<Projeto> {
  const alvo = referencia ?? e.conversa.projetoNome;
  const projetos = await e.ctx.repos.projetos.todos();
  const opcoes = projetos.map((p) => ({ rotulo: p.nome, parametros: { projeto: p.nome } }));

  if (alvo === undefined || alvo.trim() === '') {
    throw new ErroEsclarecimento('De que projeto estamos a falar?', opcoes);
  }
  const r = await resolverProjeto(alvo, e.ctx);
  if (r.tipo === 'UM') {
    e.lembrar({ projetoId: r.valor.id, projetoNome: r.valor.nome });
    return r.valor;
  }
  if (r.tipo === 'VARIOS') {
    throw new ErroEsclarecimento(`«${alvo}» corresponde a mais do que um projeto. A qual se refere?`,
      r.candidatos.map((p) => ({ rotulo: p.nome, parametros: { projeto: p.nome } })));
  }
  throw new ErroEsclarecimento(`Não conheço o projeto «${alvo}». Qual destes?`, opcoes);
}

/** Resolve uma pessoa do diretório, com desambiguação. */
export function pessoaDe(referencia: string | undefined, e: ContextoExecucao, papel = 'a pessoa'): { id: string; nome: string } {
  const alvo = referencia ?? e.conversa.pessoaNome;
  if (alvo === undefined || alvo.trim() === '') {
    throw new ErroEsclarecimento(`Quem é ${papel}?`, []);
  }
  const r = resolverPessoa(alvo, e.ctx);
  if (r.tipo === 'UM') {
    e.lembrar({ pessoaId: r.valor.id, pessoaNome: r.valor.nome });
    return r.valor;
  }
  if (r.tipo === 'VARIOS') {
    throw new ErroEsclarecimento(`«${alvo}» corresponde a mais do que uma pessoa. Quem é ${papel}?`,
      r.candidatos.map((c) => ({ rotulo: c.nome, parametros: { pessoa: c.nome } })));
  }
  throw new ErroEsclarecimento(`Não encontrei ninguém chamado «${alvo}».`, []);
}

/** Resolve um perfil dentro de um contrato, com desambiguação. */
export function perfilDe(referencia: string | undefined, perfis: ReadonlyArray<PerfilContratual>, contrato: Contrato, e: ContextoExecucao): PerfilContratual {
  const opcoes = perfis.map((p) => ({ rotulo: p.nome, parametros: { perfil: p.nome, contratoNumero: contrato.numero } }));
  const alvo = referencia ?? e.conversa.perfilNome;
  if (alvo === undefined || alvo.trim() === '') {
    throw new ErroEsclarecimento(`De que perfil do ${contrato.numero} estamos a falar?`, opcoes);
  }
  const r = resolverPerfil(alvo, perfis);
  if (r.tipo === 'UM') {
    e.lembrar({ perfilNome: r.valor.nome });
    return r.valor;
  }
  if (r.tipo === 'VARIOS') {
    throw new ErroEsclarecimento(`«${alvo}» corresponde a mais do que um perfil do ${contrato.numero}. Qual?`,
      r.candidatos.map((p) => ({ rotulo: p.nome, parametros: { perfil: p.nome, contratoNumero: contrato.numero } })));
  }
  throw new ErroEsclarecimento(`O contrato ${contrato.numero} não tem perfil «${alvo}». Qual destes?`, opcoes);
}

/** Período pedido, ou o ano corrente quando não foi dito nada. */
export function periodoDe(p: { periodoDe?: string; periodoAte?: string }, e: ContextoExecucao): Periodo {
  if (p.periodoDe !== undefined && p.periodoAte !== undefined) {
    e.lembrar({ periodoDe: p.periodoDe, periodoAte: p.periodoAte });
    return { de: p.periodoDe, ate: p.periodoAte, rotulo: `${p.periodoDe} a ${p.periodoAte}` };
  }
  if (e.conversa.periodoDe !== undefined && e.conversa.periodoAte !== undefined) {
    return { de: e.conversa.periodoDe, ate: e.conversa.periodoAte, rotulo: `${e.conversa.periodoDe} a ${e.conversa.periodoAte}` };
  }
  return anoCorrente(e.hoje);
}

/** Avalia uma regra em seco, para a simulação de uma ação. */
export function avaliar<T>(
  regra: { codigo: string; descricao: string; avaliar(d: T): { ok: boolean; mensagem?: string } },
  dados: T,
): RegraAvaliada {
  const r = regra.avaliar(dados);
  return { codigo: regra.codigo, descricao: regra.descricao, ok: r.ok, ...(r.ok ? {} : { mensagem: r.mensagem }) };
}

/** Parâmetros comuns a quase todas as consultas, para reuso nos esquemas. */
export const DESC_CONTRATO = {
  nome: 'contratoNumero', tipo: 'texto', obrigatorio: false,
  descricao: 'Contrato: número, objeto ou prestador. Sem ele, usa-se o da conversa.',
} as const;
export const DESC_PERIODO = [
  { nome: 'periodoDe', tipo: 'data', obrigatorio: false, descricao: 'Início do período (AAAA-MM-DD)' },
  { nome: 'periodoAte', tipo: 'data', obrigatorio: false, descricao: 'Fim do período; por omissão, o ano corrente' },
] as const;

export { rotuloContrato };
