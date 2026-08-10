import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { decisoesPendentes, type Alerta } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, Estado, formatarMoeda, pct, useAsync } from '../comum.js';

/**
 * Percentagem de consumo com uma casa decimal abaixo dos 10%: no arranque de um
 * contrato, arredondar 0,4% para «0%» faz parecer que não há execução nenhuma.
 */
function pctConsumo(fracao: number): string {
  if (fracao > 0 && fracao < 0.1) return `${(fracao * 100).toFixed(1).replace('.', ',')}%`;
  return pct(fracao);
}

/** Execução de um contrato, para a coluna de consumo. */
interface ResumoLista {
  valorExecutado: number;
  valorAtualContrato: number;
}

export function Contratos(): ReactNode {
  const navegar = useNavigate();
  const podeGerir = app.podeGerir();
  const { dados } = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const pendentes = decisoesPendentes(await app.ctx.repos.alertas.todos());
    // Consumo pela mesma medida da ficha do contrato, para os dois números
    // coincidirem: o valor executado sobre o valor ATUAL (com complementares).
    const consumo = new Map<string, number>();
    for (const c of contratos) {
      const r = await app.contratos.resumoExecucao(c.id) as ResumoLista;
      consumo.set(c.id, r.valorAtualContrato > 0 ? r.valorExecutado / r.valorAtualContrato : 0);
    }
    return { contratos, pendentes, consumo };
  }, []);

  const contratos = dados?.contratos ?? [];
  const decisoesDe = (id: string): Alerta[] => (dados?.pendentes ?? []).filter((a) => a.contratoId === id);

  return (
    <>
      <Cabecalho titulo="Contratos" sub={`${contratos.length} contratos`} acoes={podeGerir ? <button className="btn pri" onClick={() => navegar('/contratos/novo')}>+ Novo contrato</button> : undefined} />
      <div className="cartao">
        <table>
          <thead><tr><th>Nº / Objeto</th><th>Prestador (NIPC)</th><th>Vigência</th><th className="num">Valor atual do contrato</th><th style={{ width: 150 }}>Consumo</th><th className="num">Decisões</th><th>Estado</th></tr></thead>
          <tbody>
            {contratos.map((c) => {
              const decisoes = decisoesDe(c.id);
              const vencidas = decisoes.filter((a) => (a.diasParaLimite ?? 1) < 0).length;
              const fracao = dados?.consumo.get(c.id) ?? 0;
              return (
                <tr key={c.id} className="click" onClick={() => navegar(`/contratos/${c.id}`)}>
                  <td><div className="prim">{c.numero}</div><div className="sec">{c.objeto}</div></td>
                  <td>{c.prestador.nome}<div className="sec">{c.prestador.nipc}</div></td>
                  <td className="tabnum">{c.dataInicioVigencia} – {c.dataTerminoContratual}</td>
                  <td className="num">{formatarMoeda(c.precoContratualAtual)}</td>
                  <td>
                    <Barra fracao={fracao} />
                    <div className="sec" style={{ marginTop: 3 }}>{pctConsumo(fracao)} executado</div>
                  </td>
                  <td className="num">
                    {decisoes.length === 0
                      ? <span className="sec">—</span>
                      : (
                        <span
                          className={`pill ${vencidas > 0 ? 'p-verm' : 'p-ambar'}`}
                          title={decisoes.map((a) => a.titulo).join(' · ')}
                        >{decisoes.length}{vencidas > 0 ? ` · ${vencidas} fora de prazo` : ''}</span>
                      )}
                  </td>
                  <td><Estado v={c.estado} /></td>
                </tr>
              );
            })}
            {dados !== undefined && contratos.length === 0 && <tr><td colSpan={7} className="vazio">Sem contratos. Crie um procedimento e um contrato.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
