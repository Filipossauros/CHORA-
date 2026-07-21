import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, formatarMoeda, useAsync } from '../comum.js';

export function Contratos(): ReactNode {
  const navegar = useNavigate();
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const { dados } = useAsync(() => app.ctx.repos.contratos.todos(), []);

  return (
    <>
      <Cabecalho titulo="Contratos" sub={`${dados?.length ?? 0} contratos`} acoes={podeGerir ? <button className="btn pri" onClick={() => navegar('/contratos/novo')}>+ Novo contrato</button> : undefined} />
      <div className="cartao">
        <table>
          <thead><tr><th>Nº / Objeto</th><th>Prestador (NIPC)</th><th>Vigência</th><th className="num">Valor atual do contrato</th><th>Estado</th></tr></thead>
          <tbody>
            {(dados ?? []).map((c) => (
              <tr key={c.id} className="click" onClick={() => navegar(`/contratos/${c.id}`)}>
                <td><div className="prim">{c.numero}</div><div className="sec">{c.objeto}</div></td>
                <td>{c.prestador.nome}<div className="sec">{c.prestador.nipc}</div></td>
                <td className="tabnum">{c.dataInicioVigencia} – {c.dataTerminoContratual}</td>
                <td className="num">{formatarMoeda(c.precoContratualAtual)}</td>
                <td><Estado v={c.estado} /></td>
              </tr>
            ))}
            {dados !== undefined && dados.length === 0 && <tr><td colSpan={5} className="vazio">Sem contratos. Crie um procedimento e um contrato.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
