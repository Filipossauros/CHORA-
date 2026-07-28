import type { Contrato, PerfilContratual } from '@chora/domain';
import { semelhancaPerfil, LIMIAR_SEMELHANCA } from '@chora/domain';
import type { Contexto } from '../contexto.js';
import type { Projeto } from '../repositorios/memoria/index.js';

/**
 * RESOLUÇÃO DE ENTIDADES a partir de linguagem corrente.
 *
 * As pessoas não falam em `C-2026-001` — falam no «contrato de outsourcing da
 * Alfa», no «Diogo», no «projeto documental». Exigir o código exato era o que
 * mais fazia o assistente parecer burro: sabia responder, mas só a quem já
 * soubesse a resposta.
 *
 * A ambiguidade não se resolve por adivinhação. Quando mais do que uma entidade
 * corresponde, devolve-se a lista e PERGUNTA-SE — escolher a primeira seria
 * agir sobre o contrato errado, que num sistema com atos irreversíveis é bem
 * pior do que fazer uma pergunta a mais.
 */

export type Resolucao<T> =
  | { tipo: 'UM'; valor: T }
  | { tipo: 'VARIOS'; candidatos: T[] }
  | { tipo: 'NENHUM' };

export const normalizar = (t: string): string =>
  t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

/** Compacta para comparar códigos: «c 2026 001» ≡ «C-2026-001». */
const codigo = (t: string): string => normalizar(t).replace(/[\s-_/]/g, '');

/** Termos sem valor discriminante: aparecem em quase todos os contratos. */
const VAZIOS = new Set([
  'contrato', 'contratos', 'do', 'da', 'de', 'dos', 'das', 'o', 'a', 'os', 'as',
  'em', 'no', 'na', 'para', 'com', 'e', 'servicos', 'servico', 'prestacao',
]);

const termos = (t: string): string[] =>
  normalizar(t).split(/[^a-z0-9]+/).filter((x) => x.length > 2 && !VAZIOS.has(x));

const ROTULO_TIPOLOGIA: Record<string, string[]> = {
  BOLSA_HORAS: ['bolsa de horas', 'bolsa'],
  CHAVE_NA_MAO: ['chave na mao', 'chave-na-mao', 'preco fixo'],
  LICENCIAMENTO: ['licenciamento', 'licenca', 'licencas'],
};

/**
 * Resolve um contrato pelo que a frase diz dele: número, objeto, prestador ou
 * tipologia. O número, quando bate, ganha sempre — é a referência inequívoca.
 */
export async function resolverContrato(texto: string, ctx: Contexto): Promise<Resolucao<Contrato>> {
  const todos = await ctx.repos.contratos.todos();
  if (texto.trim() === '') return { tipo: 'NENHUM' };

  const alvo = codigo(texto);
  const porNumero = todos.filter((c) => codigo(c.numero) === alvo);
  if (porNumero.length === 1) return { tipo: 'UM', valor: porNumero[0]! };

  // Número mencionado algures na frase.
  const mencionado = todos.filter((c) => codigo(texto).includes(codigo(c.numero)));
  if (mencionado.length === 1) return { tipo: 'UM', valor: mencionado[0]! };

  const t = termos(texto);
  const emExecucao = todos.filter((c) => c.estado === 'EM_VIGOR' || c.estado === 'SUSPENSO');
  const universo = emExecucao.length > 0 ? emExecucao : todos;

  const pontuados = universo
    .map((c) => {
      const objeto = termos(c.objeto);
      const prestador = termos(c.prestador.nome);
      const tipologia = ROTULO_TIPOLOGIA[c.tipologia ?? 'BOLSA_HORAS'] ?? [];
      let pontos = 0;
      for (const termo of t) {
        if (objeto.some((o) => o.includes(termo) || termo.includes(o))) pontos += 2;
        if (prestador.some((p) => p.includes(termo) || termo.includes(p))) pontos += 3;
      }
      if (tipologia.some((r) => normalizar(texto).includes(r))) pontos += 1;
      return { c, pontos };
    })
    .filter((x) => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos);

  if (pontuados.length === 0) return { tipo: 'NENHUM' };
  // Um vencedor destacado resolve; um empate à cabeça pergunta-se.
  const melhor = pontuados[0]!;
  const empatados = pontuados.filter((x) => x.pontos === melhor.pontos);
  if (empatados.length === 1) return { tipo: 'UM', valor: melhor.c };
  return { tipo: 'VARIOS', candidatos: empatados.slice(0, 6).map((x) => x.c) };
}

/** Resolve uma pessoa pelo nome, através do diretório do workspace. */
export function resolverPessoa(texto: string, ctx: Contexto): Resolucao<{ id: string; nome: string }> {
  const candidatos = ctx.diretorio.procurar(texto);
  if (candidatos.length === 0) return { tipo: 'NENHUM' };
  if (candidatos.length === 1) return { tipo: 'UM', valor: candidatos[0]! };
  return { tipo: 'VARIOS', candidatos };
}

/** Resolve um projeto pelo nome ou identificador. */
export async function resolverProjeto(texto: string, ctx: Contexto): Promise<Resolucao<Projeto>> {
  const projetos = await ctx.repos.projetos.todos();
  const alvo = normalizar(texto);
  const exato = projetos.filter((p) => normalizar(p.nome) === alvo || normalizar(p.id) === alvo);
  if (exato.length === 1) return { tipo: 'UM', valor: exato[0]! };

  const t = termos(texto);
  const parciais = projetos.filter((p) => {
    const n = normalizar(p.nome);
    return n.includes(alvo) || alvo.includes(n) || t.some((x) => n.includes(x));
  });
  if (parciais.length === 1) return { tipo: 'UM', valor: parciais[0]! };
  if (parciais.length > 1) return { tipo: 'VARIOS', candidatos: parciais };
  return { tipo: 'NENHUM' };
}

/**
 * Resolve um perfil dentro de um contrato, por semelhança de nome — «arquiteto»
 * encontra «Arquiteto de Software Sénior», que é como as pessoas falam.
 */
export function resolverPerfil(texto: string, perfis: ReadonlyArray<PerfilContratual>): Resolucao<PerfilContratual> {
  const alvo = normalizar(texto);
  const exato = perfis.filter((p) => normalizar(p.nome) === alvo);
  if (exato.length === 1) return { tipo: 'UM', valor: exato[0]! };

  const pontuados = perfis
    .map((p) => ({ p, s: Math.max(semelhancaPerfil(texto, p.nome), normalizar(p.nome).includes(alvo) ? 0.9 : 0) }))
    .filter((x) => x.s >= LIMIAR_SEMELHANCA)
    .sort((a, b) => b.s - a.s);

  if (pontuados.length === 0) return { tipo: 'NENHUM' };
  if (pontuados.length === 1 || (pontuados[0]!.s - (pontuados[1]?.s ?? 0)) > 0.15) {
    return { tipo: 'UM', valor: pontuados[0]!.p };
  }
  return { tipo: 'VARIOS', candidatos: pontuados.map((x) => x.p) };
}

/** Rótulo legível de um contrato, para as listas de desambiguação. */
export const rotuloContrato = (c: Contrato): string =>
  `${c.numero} · ${c.objeto} · ${c.prestador.nome}`;
