import { useState, type ReactNode } from 'react';
import { estadoEntregavel, repartirChaveNaMao, type Contrato, type Entregavel } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Barra, eurosParaCent, formatarMoeda, hoje, mensagemErro, pct, useAsync } from '../comum.js';

/**
 * ENTREGÁVEIS de um contrato CHAVE-NA-MÃO.
 *
 * Num contrato de preço fixo não se paga tempo, paga-se resultado: o preço
 * reparte-se por entregáveis, cada um valendo uma fatia do contrato. É aqui que
 * se assinala a ENTREGA — o facto gerador da faturação (RN-608).
 */
export function Entregaveis({ contrato, podeGerir, onErro }: {
  contrato: Contrato; podeGerir: boolean; onErro: (m?: string) => void;
}): ReactNode {
  const base = useAsync(async () => {
    const lista = await app.entregaveis.listar(contrato.id);
    const faturas = await app.ctx.repos.faturas.todos((f) => f.contratoId === contrato.id);
    return { lista, faturas };
  }, [contrato.id, contrato.precoContratualAtual, contrato.bolsaHorasValor]);

  const lista = base.dados?.lista ?? [];
  const r = repartirChaveNaMao(contrato.precoContratualAtual, lista, contrato.bolsaHorasValor ?? 0);
  const recarregar = (): void => base.recarregar();

  return (
    <>
      <div className="grelha-kpi">
        <div className="kpi"><div className="rot">Entregáveis</div><div className="val">{formatarMoeda(r.totalEntregaveis)}</div><div className="sub">{lista.length} entregável(is) · {pct(r.totalEntregaveis / Math.max(1, contrato.precoContratualAtual))} do contrato</div></div>
        <div className="kpi"><div className="rot">Bolsa de horas</div><div className="val">{formatarMoeda(r.bolsaHorasValor)}</div><div className="sub">trabalhos não previstos</div></div>
        <div className="kpi"><div className="rot">Entregue por faturar</div><div className="val">{formatarMoeda(r.faturavelAgora)}</div><div className="sub">pode ser faturado já</div></div>
        <div className="kpi"><div className="rot">Por atribuir</div><div className="val">{formatarMoeda(r.porAtribuir)}</div><div className="sub">do preço contratual</div></div>
      </div>

      <div className="cartao">
        <h3>Entregáveis
          <span style={{ marginLeft: 'auto', width: 160 }}><Barra fracao={r.faturados / Math.max(1, r.totalEntregaveis)} /></span>
          <span className="sec" style={{ marginLeft: 8 }}>{pct(r.faturados / Math.max(1, r.totalEntregaveis))} faturado</span>
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ minWidth: 720 }}>
            <thead><tr><th>#</th><th>Entregável</th><th className="num">Valor</th><th className="num">% do contrato</th><th>Prevista</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              {lista.map((e) => (
                <LinhaEntregavel key={e.id} entregavel={e} podeGerir={podeGerir} onMudou={recarregar} onErro={onErro} />
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={7} className="vazio">Sem entregáveis registados. Um contrato chave-na-mão tem de os ter para poder faturar <code>RN-111</code>.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {podeGerir && (
        <div className="duas">
          <NovoEntregavel contrato={contrato} porAtribuir={r.porAtribuir} onCriado={recarregar} onErro={onErro} />
          <BolsaHoras contrato={contrato} porAtribuir={r.porAtribuir} onGravado={recarregar} onErro={onErro} />
        </div>
      )}
    </>
  );
}

const ROT_ESTADO: Record<string, { rot: string; cls: string }> = {
  PREVISTO: { rot: 'Previsto', cls: 'p-ard' },
  ENTREGUE: { rot: 'Entregue', cls: 'p-ambar' },
  FATURADO: { rot: 'Faturado', cls: 'p-verde' },
};

function LinhaEntregavel({ entregavel: e, podeGerir, onMudou, onErro }: {
  entregavel: Entregavel; podeGerir: boolean; onMudou: () => void; onErro: (m?: string) => void;
}): ReactNode {
  const [aEntregar, setAEntregar] = useState(false);
  const [f, setF] = useState({ entregueEm: hoje(), nota: '' });
  const estado = estadoEntregavel(e);
  const rot = ROT_ESTADO[estado]!;

  async function registarEntrega(): Promise<void> {
    onErro();
    try { await app.entregaveis.registarEntrega(e.id, f.entregueEm, f.nota, app.utilizador()); setAEntregar(false); onMudou(); }
    catch (err) { onErro(mensagemErro(err)); }
  }
  async function anular(): Promise<void> {
    onErro();
    const motivo = window.prompt('Motivo da anulação da entrega:');
    if (motivo === null || motivo.trim() === '') return;
    try { await app.entregaveis.anularEntrega(e.id, motivo, app.utilizador()); onMudou(); }
    catch (err) { onErro(mensagemErro(err)); }
  }
  async function remover(): Promise<void> {
    onErro();
    if (!window.confirm(`Remover o entregável «${e.designacao}»?`)) return;
    try { await app.entregaveis.remover(e.id, app.utilizador()); onMudou(); }
    catch (err) { onErro(mensagemErro(err)); }
  }

  return (
    <>
      <tr>
        <td className="tabnum">{e.ordem}</td>
        <td><div className="prim">{e.designacao}</div>{e.descricao !== undefined && <div className="sec">{e.descricao}</div>}</td>
        <td className="num tabnum">{formatarMoeda(e.valor)}</td>
        <td className="num tabnum">{pct(e.percentagemContrato)}</td>
        <td className="tabnum">{e.dataPrevista ?? '—'}</td>
        <td>
          <span className={`pill ${rot.cls}`}>{rot.rot}</span>
          {e.entregueEm !== undefined && <div className="sec">em {e.entregueEm}</div>}
        </td>
        <td style={{ whiteSpace: 'nowrap' }}>
          {podeGerir && estado === 'PREVISTO' && <button className="btn sm pri" onClick={() => setAEntregar(!aEntregar)}>Registar entrega</button>}
          {podeGerir && estado === 'ENTREGUE' && <button className="btn sm" onClick={() => void anular()}>Anular entrega</button>}
          {podeGerir && estado === 'PREVISTO' && <button className="btn sm" style={{ marginLeft: 6, borderColor: 'transparent', color: 'var(--texto-suave)' }} onClick={() => void remover()}>Remover</button>}
          {estado === 'FATURADO' && <span className="sec">liquidado</span>}
        </td>
      </tr>
      {aEntregar && (
        <tr>
          <td colSpan={7}>
            <div style={{ border: '1px solid var(--marca)', borderRadius: 9, padding: 13 }}>
              <div className="aviso" style={{ marginBottom: 11 }}>
                A entrega é o <b>facto gerador da faturação</b>: só depois de assinalada é possível emitir a fatura do entregável, e pelo montante exato de {formatarMoeda(e.valor)} <code>RN-608</code> <code>RN-609</code>.
              </div>
              <div className="g2">
                <div className="campo"><label>Data da entrega</label><input type="date" value={f.entregueEm} onChange={(ev) => setF({ ...f, entregueEm: ev.target.value })} /></div>
                <div className="campo"><label>Nota de receção (opcional)</label><input value={f.nota} onChange={(ev) => setF({ ...f, nota: ev.target.value })} placeholder="ex.: aceite sem reservas" /></div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn sm pri" onClick={() => void registarEntrega()}>Confirmar entrega</button>
                <button className="btn sm" onClick={() => setAEntregar(false)}>Cancelar</button>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function NovoEntregavel({ contrato, porAtribuir, onCriado, onErro }: {
  contrato: Contrato; porAtribuir: number; onCriado: () => void; onErro: (m?: string) => void;
}): ReactNode {
  const [f, setF] = useState({ designacao: '', descricao: '', modo: 'VALOR' as 'VALOR' | 'PCT', valor: '', percentagem: '', dataPrevista: '' });

  async function criar(): Promise<void> {
    onErro();
    if (f.designacao.trim() === '') { onErro('Indique a designação do entregável.'); return; }
    try {
      await app.entregaveis.criar(contrato.id, {
        designacao: f.designacao,
        ...(f.descricao.trim() !== '' ? { descricao: f.descricao } : {}),
        ...(f.modo === 'VALOR' ? { valor: eurosParaCent(f.valor) } : { percentagemContrato: (Number(f.percentagem.replace(',', '.')) || 0) / 100 }),
        ...(f.dataPrevista !== '' ? { dataPrevista: f.dataPrevista } : {}),
      }, app.utilizador());
      setF({ designacao: '', descricao: '', modo: f.modo, valor: '', percentagem: '', dataPrevista: '' });
      onCriado();
    } catch (e) { onErro(mensagemErro(e)); }
  }

  const previsto = f.modo === 'VALOR'
    ? eurosParaCent(f.valor)
    : Math.round(contrato.precoContratualAtual * ((Number(f.percentagem.replace(',', '.')) || 0) / 100));

  return (
    <div className="cartao"><h3>Novo entregável</h3><div className="corpo">
      <div className="campo"><label>Designação</label><input value={f.designacao} onChange={(e) => setF({ ...f, designacao: e.target.value })} placeholder="ex.: E5 · Migração de dados" /></div>
      <div className="campo"><label>Descrição (opcional)</label><input value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
      <div className="campo"><label>Como indicar o valor</label>
        <select value={f.modo} onChange={(e) => setF({ ...f, modo: e.target.value as 'VALOR' | 'PCT' })}>
          <option value="VALOR">Em euros</option>
          <option value="PCT">Em percentagem do contrato</option>
        </select>
      </div>
      <div className="g2">
        {f.modo === 'VALOR' ? (
          <div className="campo"><label>Valor (€)</label><input type="number" inputMode="decimal" min={0} step="0.01" value={f.valor} onChange={(e) => setF({ ...f, valor: e.target.value })} placeholder="ex.: 30000,00" /></div>
        ) : (
          <div className="campo"><label>Percentagem do contrato (%)</label><input type="number" inputMode="decimal" min={0} max={100} step="0.01" value={f.percentagem} onChange={(e) => setF({ ...f, percentagem: e.target.value })} placeholder="ex.: 15" /></div>
        )}
        <div className="campo"><label>Data prevista (opcional)</label><input type="date" value={f.dataPrevista} onChange={(e) => setF({ ...f, dataPrevista: e.target.value })} /></div>
      </div>
      <div className="aviso" style={{ marginBottom: 10 }}>
        Corresponde a <b>{formatarMoeda(previsto)}</b> ({pct(previsto / Math.max(1, contrato.precoContratualAtual))} do contrato). Por atribuir: <b>{formatarMoeda(porAtribuir)}</b>. Entregáveis e bolsa de horas não podem exceder o preço contratual <code>RN-112</code>.
      </div>
      <button className="btn pri" onClick={() => void criar()}>Criar entregável</button>
    </div></div>
  );
}

function BolsaHoras({ contrato, porAtribuir, onGravado, onErro }: {
  contrato: Contrato; porAtribuir: number; onGravado: () => void; onErro: (m?: string) => void;
}): ReactNode {
  const [valor, setValor] = useState(contrato.bolsaHorasValor !== undefined ? String(contrato.bolsaHorasValor / 100) : '');

  async function gravar(): Promise<void> {
    onErro();
    try { await app.entregaveis.definirBolsaHoras(contrato.id, eurosParaCent(valor), app.utilizador()); onGravado(); }
    catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div className="cartao"><h3>Bolsa de horas</h3><div className="corpo">
      <div className="aviso" style={{ marginBottom: 11 }}>
        A bolsa de horas de um contrato chave-na-mão reserva-se a <b>trabalhos não previstos</b>. Por ser uma reserva, o <b>único elemento obrigatório é o valor</b> — os perfis e as horas registam-se no separador Execução, à medida que surgem.
      </div>
      <div className="campo"><label>Valor da bolsa de horas (€)</label><input type="number" inputMode="decimal" min={0} step="0.01" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ex.: 30000,00" /></div>
      <div className="sec" style={{ marginBottom: 10 }}>Por atribuir no contrato: <b>{formatarMoeda(porAtribuir)}</b>.</div>
      <button className="btn pri" onClick={() => void gravar()}>Gravar valor da bolsa</button>
    </div></div>
  );
}
