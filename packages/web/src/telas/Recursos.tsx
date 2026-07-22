import type { ReactNode } from 'react';
import { app, nomeAzure, prestadorAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, useAsync } from '../comum.js';

/**
 * Recursos = utilizadores Azure associados a um contrato/perfil através das
 * afetações. Não há criação manual (as contas vêm do workspace Azure). A lista
 * apresenta a designação do prestador (não o NIPC).
 */
export function Recursos(): ReactNode {
  const base = useAsync(async () => {
    const afetacoes = await app.ctx.repos.afetacoes.todos();
    const contratos = await app.ctx.repos.contratos.todos();
    const perfis = await app.ctx.repos.perfis.todos();
    // Agrega por recurso: contratos e perfis onde tem afetação ativa.
    const porRecurso = new Map<string, { ativo: boolean; contratos: Set<string>; perfis: Set<string> }>();
    for (const a of afetacoes) {
      const e = porRecurso.get(a.recursoId) ?? { ativo: false, contratos: new Set<string>(), perfis: new Set<string>() };
      if (a.ativa) {
        e.ativo = true;
        const numero = contratos.find((c) => c.id === a.contratoId)?.numero;
        if (numero !== undefined) e.contratos.add(numero);
        const nome = perfis.find((p) => p.id === a.perfilId)?.nome;
        if (nome !== undefined) e.perfis.add(nome);
      }
      porRecurso.set(a.recursoId, e);
    }
    return Array.from(porRecurso.entries()).map(([recursoId, v]) => ({ recursoId, ...v }));
  }, []);

  return (
    <>
      <Cabecalho titulo="Recursos" sub="Utilizadores do workspace Azure afetos a contratos (sem criação manual)" />
      <div className="cartao"><table>
        <thead><tr><th>Recurso</th><th>Prestador</th><th>Contratos</th><th>Perfis</th><th>Estado</th></tr></thead>
        <tbody>{(base.dados ?? []).map((r) => (
          <tr key={r.recursoId}>
            <td className="prim">{nomeAzure(r.recursoId)}</td>
            <td>{prestadorAzure(r.recursoId) ?? '—'}</td>
            <td>{[...r.contratos].map((c) => <span key={c} className="chip" style={{ marginRight: 4 }}>{c}</span>)}{r.contratos.size === 0 && '—'}</td>
            <td>{[...r.perfis].join(', ') || '—'}</td>
            <td><Estado v={r.ativo ? 'Ativa' : 'Inativa'} /></td>
          </tr>
        ))}{base.dados?.length === 0 && <tr><td colSpan={5} className="vazio">Sem recursos afetos.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
