import type { ReactNode } from 'react';
import { JobAlertas } from '@chora/api/nucleo';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, useAsync } from '../comum.js';

export function Alertas(): ReactNode {
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const base = useAsync(() => app.ctx.repos.alertas.todos(), []);

  async function executar(): Promise<void> {
    await new JobAlertas(app.ctx).executar();
    base.recarregar();
  }

  const sev = (s: string): string => (s === 'CRITICO' ? 'REJEITADO' : s === 'AVISO' ? 'AGUARDA_VISTO' : 'RECEBIDA');
  return (
    <>
      <Cabecalho titulo="Alertas" sub="Gerados por job determinístico (secção 11)" acoes={podeGerir ? <button className="btn" onClick={() => void executar()}>Executar job de alertas</button> : undefined} />
      <div className="cartao"><table>
        <thead><tr><th>Severidade</th><th>Código</th><th>Título</th><th>Detalhe</th></tr></thead>
        <tbody>{(base.dados ?? []).map((a) => <tr key={a.id}><td><Estado v={sev(a.severidade)} /></td><td><code>{a.codigo}</code></td><td className="prim">{a.titulo}</td><td>{a.detalhe}</td></tr>)}
        {base.dados?.length === 0 && <tr><td colSpan={4} className="vazio">Sem alertas.</td></tr>}</tbody>
      </table></div>
    </>
  );
}
