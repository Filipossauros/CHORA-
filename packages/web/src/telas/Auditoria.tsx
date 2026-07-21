import type { ReactNode } from 'react';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, useAsync } from '../comum.js';

export function Auditoria(): ReactNode {
  const podeVer = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const base = useAsync(async () => (await app.ctx.repos.eventosAuditoria.todos()).sort((a, b) => (a.ocorridoEm < b.ocorridoEm ? 1 : -1)), []);

  if (!podeVer) return (<><Cabecalho titulo="Auditoria" /><div className="aviso">Só o Gestor de Contrato consulta a trilha de auditoria <code>secção 9.3</code>.</div></>);

  return (
    <>
      <Cabecalho titulo="Auditoria" sub="Trilha imutável (append-only) · retenção 5 anos" />
      <div className="cartao"><table>
        <thead><tr><th>Ocorrido em</th><th>Utilizador</th><th>Entidade</th><th>Operação</th><th>Resultado</th><th>Regra</th></tr></thead>
        <tbody>{(base.dados ?? []).slice(0, 60).map((e) => <tr key={e.id}><td className="tabnum">{e.ocorridoEm}</td><td>{e.utilizadorId}</td><td>{e.entidade}</td><td>{e.operacao}</td><td><Estado v={e.resultado === 'PERMITIDO' ? 'APROVADO' : 'REJEITADO'} /></td><td>{e.regraViolada !== undefined ? <code>{e.regraViolada}</code> : ''}</td></tr>)}
        {base.dados?.length === 0 && <tr><td colSpan={6} className="vazio">Sem eventos.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
