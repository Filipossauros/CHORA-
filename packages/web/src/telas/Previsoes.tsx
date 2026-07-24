import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { preverPerfil, preverContrato, diasComFTE, type Contrato, type PerfilContratual, type RegistoTempo } from '@chora/domain';
import * as XLSX from 'xlsx';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, formatarHoras, formatarMoeda, hoje, pct, useAsync } from '../comum.js';

export function Previsoes(): ReactNode {
  const navegar = useNavigate();
  const [contratoId, setContratoId] = useState('');
  const [fte, setFte] = useState(2);
  const [horasDia, setHorasDia] = useState(8);

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const perfis = await app.ctx.repos.perfis.todos();
    const aprovados = await app.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO');
    return { contratos, cid, perfis, aprovados };
  }, [contratoId]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, perfis, aprovados } = base.dados;
  const hojeStr = hoje();
  const contrato = contratos.find((c) => c.id === cid);
  const aprovadosContrato = aprovados.filter((r) => r.contratoId === cid);
  const perfisContrato = perfis.filter((p) => p.contratoId === cid);

  const prevContrato = contrato !== undefined ? preverContrato(contrato, aprovadosContrato, hojeStr) : undefined;
  const prevPerfis = contrato !== undefined ? perfisContrato.map((p) => preverPerfil(p, aprovadosContrato, contrato, hojeStr)) : [];
  const totalRestantesMin = prevPerfis.reduce((s, x) => s + x.minutosRestantes, 0);
  const diasWhatIf = diasComFTE(totalRestantesMin, fte, horasDia);
  const dataWhatIf = diasWhatIf !== null ? new Date(new Date(`${hojeStr}T00:00:00`).getTime() + diasWhatIf * 86400000).toISOString().slice(0, 10) : null;

  function exportarXlsx(): void {
    if (contrato === undefined) return;
    const ws = XLSX.utils.json_to_sheet(prevPerfis.map((x) => ({
      'Perfil': x.nome,
      'Horas restantes': +(x.minutosRestantes / 60).toFixed(1),
      'Ritmo (h/dia)': +(x.ritmoDiaMin / 60).toFixed(2),
      'Dias p/ esgotar': x.diasParaEsgotar ?? '—',
      'Data esgotamento': x.dataEsgotamento ?? '—',
      'Esgota antes do término': x.esgotaAntesDoTermino === null ? '—' : x.esgotaAntesDoTermino ? 'Sim' : 'Não',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Previsão perfis');
    XLSX.writeFile(wb, `previsao-${contrato.numero}.xlsx`);
  }

  const carteira = contratos.map((c) => ({ c, prev: preverContrato(c, aprovados.filter((r) => r.contratoId === c.id), hojeStr) }));

  return (
    <>
      <Cabecalho titulo="Previsões" sub="Projeções determinísticas de esgotamento e execução — indicativas, não bloqueiam decisões" acoes={
        <select value={cid} onChange={(e) => setContratoId(e.target.value)}>{contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}</select>
      } />
      <div className="aviso" style={{ marginBottom: 12 }}>Pressupostos: ritmo = média das últimas ~6 semanas de registos aprovados; dias úteis não são descontados no what-if (8 h/dia por pessoa). Reproduzível e sem "caixa preta".</div>

      {prevContrato !== undefined && (
        <div className="grelha-kpi">
          <div className="kpi"><div className="rot">Valor executado</div><div className="val">{formatarMoeda(prevContrato.valorExecutado)}</div><div className="sub">de {formatarMoeda(prevContrato.valorAtual)}</div></div>
          <div className="kpi"><div className="rot">Ritmo recente</div><div className="val" style={{ fontSize: 18 }}>{formatarMoeda(Math.round(prevContrato.ritmoValorDia))}/dia</div></div>
          <div className="kpi"><div className="rot">Execução projetada no término</div><div className="val" style={{ color: prevContrato.execucaoProjetadaPct < 0.9 ? 'var(--ambar)' : 'var(--verde)' }}>{pct(prevContrato.execucaoProjetadaPct)}</div><div className="sub">gap: {formatarMoeda(prevContrato.gapNoTermino)}</div></div>
          <div className="kpi"><div className="rot">Esgotamento do valor</div><div className="val" style={{ fontSize: 18 }}>{prevContrato.dataEsgotamentoValor ?? '—'}</div><div className="sub">ao ritmo atual</div></div>
        </div>
      )}

      <div className="duas">
        <div className="cartao"><h3>Esgotamento de horas por perfil</h3><table>
          <thead><tr><th>Perfil</th><th className="num">Horas restantes</th><th className="num">Ritmo (h/dia)</th><th>Esgotamento previsto</th></tr></thead>
          <tbody>{prevPerfis.map((x) => (
            <tr key={x.perfilId}>
              <td className="prim">{x.nome}</td>
              <td className="num">{formatarHoras(x.minutosRestantes)}</td>
              <td className="num">{(x.ritmoDiaMin / 60).toFixed(1)}</td>
              <td>{x.dataEsgotamento === null ? <span className="sec">sem consumo recente</span> : <span style={{ color: x.esgotaAntesDoTermino ? 'var(--ambar)' : undefined }}>{x.dataEsgotamento}{x.esgotaAntesDoTermino ? ' (antes do término)' : ''}</span>}</td>
            </tr>
          ))}{prevPerfis.length === 0 && <tr><td colSpan={4} className="vazio">Sem perfis.</td></tr>}</tbody>
        </table>
        {prevPerfis.length > 0 && <div style={{ padding: 12 }}><button className="btn" onClick={exportarXlsx}>⬇ Exportar previsões (Excel)</button></div>}
        </div>

        <div className="cartao"><h3>Cenário what-if</h3><div className="corpo">
          <div className="sec" style={{ marginTop: 0 }}>Horas totais por consumir neste contrato: <b>{formatarHoras(totalRestantesMin)}</b>.</div>
          <div className="campo"><label>Pessoas a tempo inteiro: <b>{fte}</b></label><input type="range" min={1} max={12} value={fte} onChange={(e) => setFte(Number(e.target.value))} /></div>
          <div className="campo"><label>Horas por dia por pessoa: <b>{horasDia}</b></label><input type="range" min={4} max={10} value={horasDia} onChange={(e) => setHorasDia(Number(e.target.value))} /></div>
          <div className="grelha-kpi" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="kpi"><div className="rot">Dias para consumir tudo</div><div className="val">{diasWhatIf ?? '—'}</div></div>
            <div className="kpi"><div className="rot">Data prevista</div><div className="val" style={{ fontSize: 18 }}>{dataWhatIf ?? '—'}</div>{contrato !== undefined && dataWhatIf !== null && <div className="sub" style={{ color: dataWhatIf <= contrato.dataTerminoContratual ? 'var(--verde)' : 'var(--ambar)' }}>{dataWhatIf <= contrato.dataTerminoContratual ? 'dentro do término' : 'após o término'}</div>}</div>
          </div>
        </div></div>
      </div>

      <div className="cartao" style={{ marginTop: 16 }}><h3>Carteira — execução projetada por contrato</h3><table>
        <thead><tr><th>Contrato</th><th>Estado</th><th className="num">Executado / atual</th><th className="num">Projeção no término</th><th>Esgotamento do valor</th></tr></thead>
        <tbody>{carteira.map(({ c, prev }) => (
          <tr key={c.id} className="click" onClick={() => { setContratoId(c.id); }}>
            <td><div className="prim">{c.numero}</div><div className="sec">{c.objeto}</div></td>
            <td><Estado v={c.estado} /></td>
            <td className="num">{formatarMoeda(prev.valorExecutado)} / {formatarMoeda(prev.valorAtual)}</td>
            <td className="num" style={{ color: prev.execucaoProjetadaPct < 0.9 ? 'var(--ambar)' : undefined }}>{pct(prev.execucaoProjetadaPct)}</td>
            <td className="sec">{prev.dataEsgotamentoValor ?? '—'}</td>
          </tr>
        ))}</tbody>
      </table>
      <div style={{ padding: 12 }}><button className="btn sm" onClick={() => contrato && navegar(`/contratos/${contrato.id}?tab=Capacidade`)}>Ver capacidade do contrato →</button></div>
      </div>
    </>
  );
}
