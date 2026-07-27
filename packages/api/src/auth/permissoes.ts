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

const G_CONTRATO: PapelAplicacional = 'GESTOR_CONTRATO';
const G_TECNICO: PapelAplicacional = 'GESTOR_TECNICO';
const ELEMENTO: PapelAplicacional = 'ELEMENTO_EQUIPA_TECNICA';

export const MATRIZ: Record<Operacao, ReadonlyArray<PapelAplicacional>> = {
  'registo.criar.proprio': [G_CONTRATO, G_TECNICO, ELEMENTO],
  'registo.ver.terceiros': [G_CONTRATO, G_TECNICO],
  'registo.aprovar': [G_CONTRATO, G_TECNICO],
  'registo.anular.aprovado': [G_CONTRATO, G_TECNICO],
  'gerir.contratos': [G_CONTRATO, G_TECNICO],
  'gerir.perfis.dotacoes': [G_CONTRATO, G_TECNICO],
  'gerir.afetacoes': [G_CONTRATO, G_TECNICO],
  'gerir.acesso.projetos': [G_CONTRATO],
  'registar.excecoes': [G_CONTRATO],
  'gerir.faturas.compromissos': [G_CONTRATO],
  'consultar.auditoria': [G_CONTRATO],
};

/** Verdadeiro se algum dos papéis do utilizador autoriza a operação. */
export function podeExecutar(papeis: ReadonlyArray<PapelAplicacional>, operacao: Operacao): boolean {
  const autorizados = MATRIZ[operacao];
  return papeis.some((p) => autorizados.includes(p));
}

/** Papel de gestão (aprova, gere) — atalho usado por várias rotas. */
export function temPapelGestao(papeis: ReadonlyArray<PapelAplicacional>): boolean {
  return papeis.includes(G_CONTRATO) || papeis.includes(G_TECNICO);
}
