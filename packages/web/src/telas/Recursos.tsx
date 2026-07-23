import { useState, type ReactNode } from 'react';
import { app, nomeAzure, prestadorAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, useAsync } from '../comum.js';

/**
 * Recursos = utilizadores Azure associados a um contrato/perfil através das
 * afetações. Não há criação manual. A inativação de um recurso preserva as
 * associações (histórico); por omissão a vista só mostra os ativos.
 */
export function Recursos(): ReactNode {
  const [mostrarInativos, setMostrarInativos] = useState(false);

  const base = useAsync(async () => {
    const recursos = await app.ctx.repos.recursos.todos();
    const afetacoes = await app.ctx.repos.afetacoes.todos();
    const contratos = await app.ctx.repos.contratos.todos();
    const perfis = await app.ctx.repos.perfis.todos();
    // Agrega por recurso todas as afetações (ativas ou não) para preservar o histórico.
    const ids = new Set<string>([...recursos.map((r) => r.id), ...afetacoes.map((a) => a.recursoId)]);
    const linhas = [...ids].map((id) => {
      const rec = recursos.find((r) => r.id === id);
      const afs = afetacoes.filter((a) => a.recursoId === id);
      const contratosSet = new Set<string>();
      const perfisSet = new Set<string>();
      for (const a of afs) {
        const numero = contratos.find((c) => c.id === a.contratoId)?.numero;
        if (numero !== undefined) contratosSet.add(numero);
        const nome = perfis.find((p) => p.id === a.perfilId)?.nome;
        if (nome !== undefined) perfisSet.add(nome);
      }
      return { id, ativo: rec?.ativo ?? true, temRegisto: rec !== undefined, contratos: [...contratosSet], perfis: [...perfisSet] };
    });
    return linhas;
  }, []);

  const linhas = (base.dados ?? []).filter((l) => mostrarInativos || l.ativo);

  return (
    <>
      <Cabecalho titulo="Recursos" sub="Utilizadores do workspace Azure afetos a contratos (apenas visualização)" acoes={
        <label className="papel-chip" style={{ cursor: 'pointer' }}><input type="checkbox" checked={mostrarInativos} onChange={(e) => setMostrarInativos(e.target.checked)} /> Mostrar inativos</label>
      } />
      <div className="cartao"><table>
        <thead><tr><th>Recurso</th><th>Prestador</th><th>Contratos</th><th>Perfis</th><th>Estado</th></tr></thead>
        <tbody>{linhas.map((r) => (
          <tr key={r.id}>
            <td className="prim">{nomeAzure(r.id)}</td>
            <td>{prestadorAzure(r.id) ?? '—'}</td>
            <td>{r.contratos.map((c) => <span key={c} className="chip" style={{ marginRight: 4 }}>{c}</span>)}{r.contratos.length === 0 && '—'}</td>
            <td>{r.perfis.join(', ') || '—'}</td>
            <td><Estado v={r.ativo ? 'Ativa' : 'Inativa'} /></td>
          </tr>
        ))}{linhas.length === 0 && <tr><td colSpan={5} className="vazio">Sem recursos {mostrarInativos ? '' : 'ativos '}a mostrar.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
