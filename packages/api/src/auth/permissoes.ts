import type { PapelAplicacional } from '@chora/domain';

/**
 * Matriz de permissões (secção 9.3). A autorização é decidida a partir dos
 * papéis aplicacionais do utilizador — não da UI e não do perfil contratual
 * (RN-501). Cada operação lista os papéis autorizados.
 */
export type Operacao =
  | 'registo.criar.proprio'
  | 'registo.ver.terceiros'
  | 'registo.aprovar'
  | 'registo.anular.aprovado'
  | 'gerir.contratos'
  | 'gerir.perfis.dotacoes'
  | 'gerir.afetacoes'
  | 'gerir.acesso.projetos'
  | 'registar.excecoes'
  | 'gerir.faturas.compromissos'
  | 'consultar.auditoria';

const ADMIN: PapelAplicacional = 'ADMINISTRADOR';
const G_CONTRATO: PapelAplicacional = 'GESTOR_CONTRATO';
const VALIDADOR: PapelAplicacional = 'VALIDADOR';
const ELEMENTO: PapelAplicacional = 'ELEMENTO_EQUIPA_TECNICA';

/**
 * O VALIDADOR é deliberadamente estreito: vê registos de terceiros e decide-os,
 * e mais nada. Não gere contratos, não gere perfis, não fatura. O papel que
 * substituiu — GESTOR_TECNICO — podia quase tudo o que o gestor podia, o que o
 * tornava um segundo gestor com outro nome.
 *
 * Atribuir papéis é só do ADMINISTRADOR. Se fosse também do gestor, qualquer
 * gestor poderia dar-se a si próprio o que lhe faltasse.
 */
export const MATRIZ: Record<Operacao, ReadonlyArray<PapelAplicacional>> = {
  'registo.criar.proprio': [ADMIN, G_CONTRATO, VALIDADOR, ELEMENTO],
  'registo.ver.terceiros': [ADMIN, G_CONTRATO, VALIDADOR],
  'registo.aprovar': [ADMIN, G_CONTRATO, VALIDADOR],
  'registo.anular.aprovado': [ADMIN, G_CONTRATO, VALIDADOR],
  'gerir.contratos': [ADMIN, G_CONTRATO],
  'gerir.perfis.dotacoes': [ADMIN, G_CONTRATO],
  'gerir.afetacoes': [ADMIN, G_CONTRATO],
  'gerir.acesso.projetos': [ADMIN],
  'registar.excecoes': [ADMIN, G_CONTRATO],
  'gerir.faturas.compromissos': [ADMIN, G_CONTRATO],
  'consultar.auditoria': [ADMIN, G_CONTRATO],
};

/** Verdadeiro se algum dos papéis do utilizador autoriza a operação. */
export function podeExecutar(papeis: ReadonlyArray<PapelAplicacional>, operacao: Operacao): boolean {
  const autorizados = MATRIZ[operacao];
  return papeis.some((p) => autorizados.includes(p));
}

/** Papel de gestão (gere contratos) — atalho usado por várias rotas. */
export function temPapelGestao(papeis: ReadonlyArray<PapelAplicacional>): boolean {
  return papeis.includes(ADMIN) || papeis.includes(G_CONTRATO);
}
