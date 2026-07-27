import { Fragment, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import {
  variarMinutos, MINUTOS_FTE_ANO,
  type LinhaOrcamento, type OrigemLinha, type PerfilOrcamentado, type TipologiaContrato,
} from '@chora/domain';
import type { OrcamentoComResumo } from '@chora/api/nucleo';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { formatarMoeda, hoje, mensagemErro, useAsync } from '../comum.js';

const ROT_TIPOLOGIA: Record<TipologiaContrato, string> = {
  BOLSA_HORAS: 'Bolsa de horas', CHAVE_NA_MAO: 'Chave-na-mão', LICENCIAMENTO: 'Licenciamento',
};

const ROT_ORIGEM: Record<OrigemLinha, { rot: string; cor: string }> = {
  CONTINUIDADE: { rot: 'Continuidade', cor: 'p-verde' },
  SUBSTITUICAO: { rot: 'Substituição', cor: 'p-ambar' },
  RENOVACAO: { rot: 'Renovação', cor: 'p-azul' },
  NOVO: { rot: 'Novo', cor: 'p-ard' },
};

/** Variações oferecidas por linha. O ± FTE é a unidade em que se pensa equipa. */
const VARIACOES: Array<{ rot: string; pct?: number; ftes?: number }> = [
  { rot: 'manter', pct: 0 },
  { rot: '+1 FTE', ftes: 1 },
  { rot: '+2 FTE', ftes: 2 },
  { rot: '−1 FTE', ftes: -1 },
  { rot: '+20 %', pct: 20 },
  { rot: '−20 %', pct: -20 },
  { rot: '−50 %', pct: -50 },
];

const horas = (min: number): string => `${Math.round(min / 60).toLocaleString('pt-PT')} h`;

/**
 * ORÇAMENTAÇÃO — o que a unidade precisa de contratar no ano seguinte.
 *
 * Substituiu o menu «Previsões», que projetava ritmos de execução por contrato:
 * essa leitura já vive no «Hoje», nas decisões com prazo, e na lista de
 * contratos. O que faltava era a pergunta de setembro — que contratos vou ter de
 * ter em N+1 e quanto custam — e é essa que este ecrã responde.
 *
 * O orçamento nasce da carteira: cada contrato em vigor entra classificado como
 * continuidade, substituição ou renovação. Ao gestor pede-se o DELTA, não a
 * lista. E separa-se sempre o encargo do que falta autorizar, porque uma
 * portaria já aprovada não é despesa nova.
 */
export function Orcamentacao(): ReactNode {
  const podeGerir = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const anoSeguinte = Number(hoje().slice(0, 4)) + 1;
  const [ano, setAno] = useState(anoSeguinte);
  const [erro, setErro] = useState<string>();
  const [versao, setVersao] = useState(0);

  const base = useAsync(async () => {
    const existentes = await app.orcamentos.listar();
    const doAno = existentes.find((o) => o.ano === ano);
    const dados: OrcamentoComResumo | undefined = doAno !== undefined ? await app.orcamentos.obter(doAno.id) : undefined;
    return { anos: existentes.map((o) => o.ano), dados };
  }, [ano, versao]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { anos, dados } = base.dados;
  const recarregar = (): void => setVersao((v) => v + 1);

  async function criar(): Promise<void> {
    setErro(undefined);
    try { await app.orcamentos.criar(ano, app.utilizador()); recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  async function guardar(linha: LinhaOrcamento): Promise<void> {
    if (dados === undefined) return;
    setErro(undefined);
    try { await app.orcamentos.guardarLinha(dados.orcamento.id, linha, app.utilizador()); recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  async function remover(linhaId: string): Promise<void> {
    if (dados === undefined) return;
    setErro(undefined);
    try { await app.orcamentos.removerLinha(dados.orcamento.id, linhaId, app.utilizador()); recarregar(); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  async function alternarFecho(): Promise<void> {
    if (dados === undefined) return;
    setErro(undefined);
    try {
      const u = app.utilizador();
      if (dados.orcamento.estado === 'FECHADO') await app.orcamentos.reabrir(dados.orcamento.id, u);
      else await app.orcamentos.fechar(dados.orcamento.id, u);
      recarregar();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  function exportar(): void {
    if (dados === undefined) return;
    const nome = (id: string): string => dados.projetos.find((p) => p.id === id)?.nome ?? id;
    const linhas = dados.resumo.projetos.flatMap((p) => p.linhas.map((l) => ({
      'Projeto': nome(p.projetoId),
      'Origem': ROT_ORIGEM[l.origem].rot,
      'Contrato de origem': l.contratoOrigemNumero ?? '—',
      'Designação': l.designacao,
      'Tipologia': ROT_TIPOLOGIA[l.tipologia],
      [`Encargo ${dados.orcamento.ano}`]: (l.reparticaoAnual.find((r) => r.ano === dados.orcamento.ano)?.montante ?? 0) / 100,
      'Encargo anos seguintes': l.reparticaoAnual.filter((r) => r.ano > dados.orcamento.ano).reduce((s, r) => s + r.montante, 0) / 100,
      'Coberto por portaria': l.cobertoPorPortaria.reduce((s, r) => s + r.montante, 0) / 100,
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Orçamento');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dados.resumo.cobertura.map((c) => ({
      'Ano': c.ano, 'Encargo': c.encargo / 100, 'Coberto por portaria': c.coberto / 100,
      'A autorizar': c.aCobrir / 100,
      'Acima da competência do CA': c.excedeCompetenciaCA ? 'Sim' : 'Não',
    }))), 'Cobertura plurianual');
    XLSX.writeFile(wb, `orcamento-${dados.orcamento.ano}.xlsx`);
  }

  return (
    <>
      <Cabecalho titulo={`Orçamento ${ano}`} sub="Que contratos vão ser precisos, quanto custam e o que falta autorizar" acoes={
        <>
          {dados !== undefined && <button className="btn" onClick={exportar}>⬇ Excel</button>}
          {dados !== undefined && podeGerir && (
            <button className="btn" onClick={() => void alternarFecho()}>
              {dados.orcamento.estado === 'FECHADO' ? 'Reabrir' : 'Fechar orçamento'}
            </button>
          )}
          <select value={ano} onChange={(e) => setAno(Number(e.target.value))}>
            {[...new Set([...anos, anoSeguinte, anoSeguinte + 1])].sort((a, b) => b - a).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </>
      } />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}

      {dados === undefined ? (
        <div className="cartao"><div className="corpo">
          <p className="sec" style={{ marginTop: 0 }}>
            Ainda não há orçamento para {ano}. A aplicação propõe-o a partir da carteira: cada contrato em vigor entra
            classificado como continuidade, substituição ou renovação, com as horas do ano corrente já preenchidas.
            O que fica por decidir é o aumento ou a redução de recursos.
          </p>
          <button className="btn pri" disabled={!podeGerir} onClick={() => void criar()}>Preparar orçamento de {ano} →</button>
        </div></div>
      ) : (
        <>
          <Totais dados={dados} />
          {dados.resumo.projetos.map((p) => (
            <Projeto
              key={p.projetoId}
              nome={dados.projetos.find((x) => x.id === p.projetoId)?.nome ?? (p.projetoId === 'sem-projeto' ? 'Sem projeto atribuído' : p.projetoId)}
              total={p.totalAnoOrcamentado} plurianual={p.totalPlurianual} linhas={p.linhas} ano={dados.orcamento.ano}
              editavel={podeGerir && dados.orcamento.estado !== 'FECHADO'}
              onGuardar={(l) => void guardar(l)} onRemover={(id) => void remover(id)}
            />
          ))}
          <Cobertura dados={dados} />
        </>
      )}
    </>
  );
}

function Totais({ dados }: { dados: OrcamentoComResumo }): ReactNode {
  const { resumo, orcamento } = dados;
  const doAno = resumo.cobertura.find((c) => c.ano === orcamento.ano);
  const plurianual = resumo.cobertura.filter((c) => c.ano > orcamento.ano).reduce((s, c) => s + c.encargo, 0);
  return (
    <div className="grelha-kpi" style={{ marginBottom: 16 }}>
      <div className="kpi"><div className="rot">Encargo {orcamento.ano}</div><div className="val">{formatarMoeda(doAno?.encargo ?? 0)}</div><div className="sub">{orcamento.linhas.length} contrato(s)</div></div>
      <div className="kpi"><div className="rot">Já coberto por portaria</div><div className="val" style={{ fontSize: 19 }}>{formatarMoeda(doAno?.coberto ?? 0)}</div><div className="sub">despesa já autorizada</div></div>
      <div className="kpi"><div className="rot">A autorizar</div><div className="val" style={{ fontSize: 19 }}>{formatarMoeda(resumo.totalACobrir)}</div><div className="sub">todos os anos</div></div>
      <div className="kpi">
        <div className="rot">Encargos {orcamento.ano + 1}+</div>
        <div className="val" style={{ fontSize: 19, color: resumo.anosAcimaDaCompetenciaCA.length > 0 ? 'var(--vermelho)' : undefined }}>{formatarMoeda(plurianual)}</div>
        <div className="sub">{resumo.anosAcimaDaCompetenciaCA.length > 0 ? '⚠ acima da competência do CA' : 'dentro da competência do CA'}</div>
      </div>
    </div>
  );
}

function Projeto({ nome, total, plurianual, linhas, ano, editavel, onGuardar, onRemover }: {
  nome: string; total: number; plurianual: number; linhas: LinhaOrcamento[]; ano: number;
  editavel: boolean; onGuardar: (l: LinhaOrcamento) => void; onRemover: (id: string) => void;
}): ReactNode {
  const [aberto, setAberto] = useState(true);
  return (
    <div className="cartao" style={{ marginBottom: 16 }}>
      <h3>
        <button className="ligacao" onClick={() => setAberto(!aberto)} style={{ fontWeight: 700 }}>{aberto ? '▾' : '▸'} {nome}</button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 14, alignItems: 'baseline' }}>
          {plurianual > 0 && <span className="sec">{formatarMoeda(plurianual)} em anos seguintes</span>}
          <span className="tabnum" style={{ fontWeight: 700 }}>{formatarMoeda(total)}</span>
        </span>
      </h3>
      {aberto && (
        <div className="corpo" style={{ display: 'grid', gap: 12 }}>
          {linhas.map((l) => <Linha key={l.id} linha={l} ano={ano} editavel={editavel} onGuardar={onGuardar} onRemover={onRemover} />)}
        </div>
      )}
    </div>
  );
}

/**
 * Uma necessidade de contratação. O que se edita é o delta face ao ano
 * corrente — as horas de referência ficam à vista, porque orçamentar sem ver o
 * que se consumiu é adivinhar.
 */
function Linha({ linha, ano, editavel, onGuardar, onRemover }: {
  linha: LinhaOrcamento; ano: number; editavel: boolean; onGuardar: (l: LinhaOrcamento) => void; onRemover: (id: string) => void;
}): ReactNode {
  const origem = ROT_ORIGEM[linha.origem];
  const doAno = linha.reparticaoAnual.find((r) => r.ano === ano)?.montante ?? 0;
  const seguintes = linha.reparticaoAnual.filter((r) => r.ano > ano);
  const coberto = linha.cobertoPorPortaria.find((r) => r.ano === ano)?.montante ?? 0;

  function variarPerfil(p: PerfilOrcamentado, v: { pct?: number; ftes?: number }): void {
    const minutosPropostos = v.ftes !== undefined
      ? Math.max(0, p.minutosReferencia + v.ftes * MINUTOS_FTE_ANO)
      : variarMinutos(p.minutosReferencia, v.pct ?? 0);
    const perfis = linha.perfis.map((x) => (x.nome === p.nome ? { ...x, minutosPropostos } : x));
    const total = perfis.reduce((s, x) => s + x.minutosPropostos, 0);
    const ref = perfis.reduce((s, x) => s + x.minutosReferencia, 0);
    onGuardar({ ...linha, perfis, variacao: total > ref ? 'AUMENTO' : total < ref ? 'REDUCAO' : 'MANUTENCAO' });
  }

  return (
    <div style={{ border: '1px solid var(--linha)', borderLeft: '3px solid var(--linha-forte)', borderRadius: 9, padding: '11px 13px', background: 'var(--superficie)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span className="prim" style={{ fontSize: 13 }}>{linha.contratoOrigemNumero ?? 'NOVO'} · {linha.designacao}</span>
        <span className={`pill ${origem.cor}`}>{origem.rot}</span>
        <span className="pill p-ard">{ROT_TIPOLOGIA[linha.tipologia]}</span>
        <span style={{ marginLeft: 'auto' }} className="tabnum">{formatarMoeda(doAno)}</span>
        {editavel && <button className="ligacao" title="Retirar do orçamento" onClick={() => onRemover(linha.id)}>remover</button>}
      </div>
      <div className="sec" style={{ marginTop: 4, fontSize: 12.5 }}>{linha.motivo}</div>

      {linha.perfis.length > 0 && (
        <table style={{ marginTop: 9 }}>
          <thead><tr><th>Perfil</th><th className="num">{ano - 1}</th><th>Variação</th><th className="num">{ano}</th><th className="num">Valor</th></tr></thead>
          <tbody>
            {linha.perfis.map((p) => (
              <tr key={p.nome}>
                <td className="prim">{p.nome}<div className="sec">{formatarMoeda(p.valorHora)}/h</div></td>
                <td className="num tabnum sec">{horas(p.minutosReferencia)}</td>
                <td>
                  <select
                    disabled={!editavel}
                    value={rotuloVariacao(p)}
                    onChange={(e) => { const v = VARIACOES.find((x) => x.rot === e.target.value); if (v !== undefined) variarPerfil(p, v); }}
                  >
                    {VARIACOES.map((v) => <option key={v.rot} value={v.rot}>{v.rot}</option>)}
                    {!VARIACOES.some((v) => v.rot === rotuloVariacao(p)) && <option value={rotuloVariacao(p)}>{rotuloVariacao(p)}</option>}
                  </select>
                </td>
                <td className="num tabnum">{horas(p.minutosPropostos)}</td>
                <td className="num tabnum">{formatarMoeda(p.valor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {linha.entregaveis.length > 0 && (
        <table style={{ marginTop: 9 }}>
          <thead><tr><th>Entregável</th><th className="num">Valor</th><th>Ano</th></tr></thead>
          <tbody>{linha.entregaveis.map((e, i) => (
            <tr key={i}>
              <td className="prim">{e.designacao}</td>
              <td className="num tabnum">{formatarMoeda(e.valor)}</td>
              <td>
                <select disabled={!editavel} value={e.ano} onChange={(ev) => {
                  const entregaveis = linha.entregaveis.map((x, j) => (j === i ? { ...x, ano: Number(ev.target.value) } : x));
                  onGuardar({ ...linha, entregaveis });
                }}>
                  {[ano, ano + 1, ano + 2].map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}

      {linha.licencas !== undefined && (
        <div style={{ marginTop: 9, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="campo" style={{ margin: 0, maxWidth: 150 }}>
            <label>Nº de licenças</label>
            <input
              type="number" min={0} disabled={!editavel} value={linha.licencas.propostas}
              onChange={(e) => onGuardar({ ...linha, licencas: { ...linha.licencas!, propostas: Math.max(0, Number(e.target.value)) } })}
            />
          </div>
          <div className="sec" style={{ paddingBottom: 6, fontSize: 12.5 }}>
            {formatarMoeda(linha.licencas.valorUnitario)} por bloco de licenças · referência {linha.licencas.referencia}
          </div>
        </div>
      )}

      {(seguintes.length > 0 || coberto > 0) && (
        <div className="sec" style={{ marginTop: 9, fontSize: 12.5, paddingTop: 8, borderTop: '1px solid var(--linha)' }}>
          {coberto > 0 && <>Coberto por portaria em {ano}: <b>{formatarMoeda(coberto)}</b>. </>}
          {seguintes.length > 0 && <>Anos seguintes: {seguintes.map((r) => `${r.ano} — ${formatarMoeda(r.montante)}`).join(' · ')}.</>}
        </div>
      )}
    </div>
  );
}

/** Rótulo da variação atualmente aplicada a um perfil. */
function rotuloVariacao(p: PerfilOrcamentado): string {
  const delta = p.minutosPropostos - p.minutosReferencia;
  if (delta === 0) return 'manter';
  for (const v of VARIACOES) {
    if (v.ftes !== undefined && delta === v.ftes * MINUTOS_FTE_ANO) return v.rot;
    if (v.pct !== undefined && v.pct !== 0 && variarMinutos(p.minutosReferencia, v.pct) === p.minutosPropostos) return v.rot;
  }
  const pct = p.minutosReferencia > 0 ? Math.round((delta / p.minutosReferencia) * 100) : 0;
  return `${pct > 0 ? '+' : ''}${pct} %`;
}

/**
 * COBERTURA PLURIANUAL — o que é preciso, o que já está autorizado, o que falta.
 *
 * É aqui que a RN-115 se lê: o limite de 500 000 € afere-se ANO A ANO e só
 * sobre os anos futuros, porque o ano orçamentado tem cabimento próprio. Um só
 * ano acima do limite muda o prazo de instrução em meses — e isso decide-se
 * agora, não com o procedimento já lançado.
 */
function Cobertura({ dados }: { dados: OrcamentoComResumo }): ReactNode {
  const { resumo, orcamento } = dados;
  const acima = resumo.anosAcimaDaCompetenciaCA;
  return (
    <div className="cartao">
      <h3>Cobertura plurianual <code>RN-115</code></h3>
      <table>
        <thead><tr><th>Ano</th><th className="num">Encargo</th><th className="num">Coberto por portaria</th><th className="num">A autorizar</th><th>Competência</th></tr></thead>
        <tbody>
          {resumo.cobertura.map((c) => (
            <tr key={c.ano} style={{ background: c.excedeCompetenciaCA ? 'var(--vermelho-b)' : undefined }}>
              <td className="prim tabnum">{c.ano}{c.ano === orcamento.ano && <span className="sec" style={{ marginLeft: 6, fontWeight: 400 }}>ano orçamentado</span>}</td>
              <td className="num tabnum">{formatarMoeda(c.encargo)}</td>
              <td className="num tabnum">{formatarMoeda(c.coberto)}</td>
              <td className="num tabnum prim">{formatarMoeda(c.aCobrir)}</td>
              <td className="sec">
                {c.ano === orcamento.ano
                  ? 'cabimento do ano'
                  : c.excedeCompetenciaCA ? <span className="pill p-verm">Despacho conjunto</span> : <span className="pill p-verde">Conselho de Administração</span>}
              </td>
            </tr>
          ))}
          {resumo.cobertura.length === 0 && <tr><td colSpan={5} className="vazio">Sem encargos orçamentados.</td></tr>}
        </tbody>
      </table>
      {acima.length > 0 ? (
        <div className="erro-cx" style={{ margin: 12 }}>
          O encargo a autorizar para {acima.join(', ')} excede {formatarMoeda(resumo.limiteAnualCA)} num só ano, pelo que a portaria
          de extensão de encargos ultrapassa a competência do Conselho de Administração e carece de portaria conjunta dos
          membros do Governo <code>RN-115</code>. Pondere repartir por mais do que um procedimento, faseá-lo por anos ou
          reduzir o encargo plurianual — o prazo de instrução do despacho conjunto conta-se em meses.
        </div>
      ) : (
        <div className="aviso" style={{ margin: 12 }}>
          Nenhum ano futuro excede {formatarMoeda(resumo.limiteAnualCA)}: as portarias de extensão de encargos cabem na competência
          do Conselho de Administração <code>RN-115</code>. O limite afere-se ano a ano e só sobre os anos futuros — o ano
          orçamentado tem cabimento próprio.
        </div>
      )}
    </div>
  );
}
