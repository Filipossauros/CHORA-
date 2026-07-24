import { useState, type ReactNode } from 'react';
import type { Recomendacao } from '@chora/domain';
import { app, nomeAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { mensagemErro, useAsync } from '../comum.js';

function EstadoRec({ v }: { v: string }): ReactNode {
  const m: Record<string, string> = { PROPOSTA: 'p-azul', ACEITE: 'p-verde', REJEITADA: 'p-verm' };
  const rot: Record<string, string> = { PROPOSTA: 'Proposta', ACEITE: 'Aceite', REJEITADA: 'Rejeitada' };
  return <span className={`pill ${m[v] ?? 'p-ard'}`}>{rot[v] ?? v}</span>;
}

export function Recomendacoes(): ReactNode {
  const podeDecidir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const [erro, setErro] = useState<string>();
  const base = useAsync(async () => {
    const recs = (await app.ctx.repos.recomendacoes.todos()).sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1));
    const contratos = await app.ctx.repos.contratos.todos();
    return { recs, numeroDe: (id?: string) => contratos.find((c) => c.id === id)?.numero ?? '—' };
  }, []);

  async function decidir(r: Recomendacao, estado: 'ACEITE' | 'REJEITADA'): Promise<void> {
    setErro(undefined);
    const nota = estado === 'REJEITADA' ? (prompt('Nota da decisão (opcional):') ?? undefined) : undefined;
    try { await app.recomendacoes.decidir(r.id, estado, nota ?? undefined, app.utilizador()); base.recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  const recs = base.dados?.recs ?? [];
  return (
    <>
      <Cabecalho titulo="Recomendações" sub="Sugestões inteligentes persistidas — indicativas, com feedback (aceite/rejeitada). Não vinculativas." />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div className="cartao"><table>
        <thead><tr><th>Origem</th><th>Contrato</th><th>Recomendação</th><th className="num">Confiança</th><th>Estado</th>{podeDecidir && <th></th>}</tr></thead>
        <tbody>{recs.map((r) => (
          <tr key={r.id}>
            <td className="sec">{r.origem}{r.codigo !== undefined ? ` · ${r.codigo}` : ''}</td>
            <td>{base.dados?.numeroDe(r.contratoId)}</td>
            <td><div className="prim">{r.titulo}</div><div className="sec">{r.texto}</div>{r.referenciaLegal !== undefined && <div className="sec" style={{ marginTop: 2 }}>⚖ {r.referenciaLegal}</div>}{r.decididoPor !== undefined && <div className="sec">decidida por {nomeAzure(r.decididoPor)}{r.notaDecisao !== undefined ? ` — ${r.notaDecisao}` : ''}</div>}</td>
            <td className="num">{Math.round(r.confianca * 100)}%</td>
            <td><EstadoRec v={r.estado} /></td>
            {podeDecidir && <td style={{ whiteSpace: 'nowrap' }}>{r.estado === 'PROPOSTA' && <><button className="btn sm" onClick={() => void decidir(r, 'ACEITE')}>Aceitar</button> <button className="btn sm" style={{ color: 'var(--vermelho)' }} onClick={() => void decidir(r, 'REJEITADA')}>Rejeitar</button></>}</td>}
          </tr>
        ))}{recs.length === 0 && <tr><td colSpan={podeDecidir ? 6 : 5} className="vazio">Sem recomendações. Gere-as a partir dos alertas (botão "Guardar como recomendação").</td></tr>}</tbody>
      </table></div>
    </>
  );
}
