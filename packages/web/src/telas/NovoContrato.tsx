import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { AgenteCCPStub, type Contrato, type EstadoContrato, type TipoProcedimento, type TipologiaContrato } from '@chora/domain';
import { app, AZURE_USERS } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { eurosParaCent, formatarMoeda, hoje, horasParaMin, mensagemErro } from '../comum.js';

const TIPOS_PROC: Array<{ v: TipoProcedimento; r: string }> = [
  { v: 'AJUSTE_DIRETO', r: 'Ajuste direto' },
  { v: 'CONSULTA_PREVIA', r: 'Consulta prévia' },
  { v: 'CONCURSO_PUBLICO', r: 'Concurso público' },
  { v: 'CONCURSO_LIMITADO', r: 'Concurso limitado por prévia qualificação' },
  { v: 'PROCEDIMENTO_NEGOCIACAO', r: 'Procedimento de negociação' },
  { v: 'DIALOGO_CONCORRENCIAL', r: 'Diálogo concorrencial' },
  { v: 'PARCERIA_INOVACAO', r: 'Parceria para a inovação' },
  { v: 'ACORDO_QUADRO', r: 'Acordo-quadro' },
  { v: 'SISTEMA_AQUISICAO_DINAMICA', r: 'Sistema de aquisição dinâmica' },
];

interface PerfilForm { nome: string; horas: string; valorHora: string }
/** Linha de entregável no registo: o valor indica-se em euros OU em % do contrato. */
interface EntregavelForm { designacao: string; modo: 'VALOR' | 'PCT'; valor: string; percentagem: string; dataPrevista: string }
const ENTREGAVEL_VAZIO: EntregavelForm = { designacao: '', modo: 'VALOR', valor: '', percentagem: '', dataPrevista: '' };
/** Valor em cêntimos de uma linha de entregável, seja qual for o modo de indicação. */
function valorEntregavel(e: EntregavelForm, precoCent: number): number {
  return e.modo === 'VALOR' ? eurosParaCent(e.valor) : Math.round(precoCent * ((Number(e.percentagem.replace(',', '.')) || 0) / 100));
}

const agenteCCP = new AgenteCCPStub();

export function NovoContrato(): ReactNode {
  const navegar = useNavigate();
  const [erro, setErro] = useState<string>();
  const [f, setF] = useState({
    numero: '', numeroProcedimento: '', tipoProcedimento: 'CONCURSO_PUBLICO' as TipoProcedimento, numeroLote: '',
    objeto: '', precoTotal: '100000', nome: '', nipc: '',
    dataAssinatura: hoje(), dataInicio: hoje(), dataTermino: '',
    visto: false, dataVisto: '', numeroPortaria: '',
    gestor: 'oid-gestor-contrato', tipologia: 'BOLSA_HORAS' as TipologiaContrato,
    licencaDe: '', licencaAte: '',
  });
  const [perfis, setPerfis] = useState<PerfilForm[]>([{ nome: '', horas: '', valorHora: '' }]);
  const [entregaveis, setEntregaveis] = useState<EntregavelForm[]>([{ ...ENTREGAVEL_VAZIO }]);
  const [bolsaHoras, setBolsaHoras] = useState('');

  function upd(campo: string, valor: unknown): void { setF({ ...f, [campo]: valor }); }

  // Agente CCP (IA — stub): avalia se o valor atinge o limiar de visto prévio do TdC.
  const precoCent = eurosParaCent(f.precoTotal);
  const avaliacaoVisto = agenteCCP.avaliarVistoPrevio(precoCent);
  const alertaVisto = avaliacaoVisto.obrigatorio && !f.visto;

  // Estado inicial: se exige visto e este não está assegurado (sem data de
  // obtenção), o contrato não pode entrar EM_VIGOR — fica AGUARDA_VISTO.
  const vistoOk = !f.visto || f.dataVisto !== '';
  const estadoInicial: EstadoContrato = vistoOk ? 'EM_VIGOR' : 'AGUARDA_VISTO';

  // Chave-na-mão: o preço reparte-se por entregáveis (valor e/ou % do contrato);
  // a bolsa de horas é uma reserva opcional para trabalhos não previstos, cujo
  // único elemento obrigatório é o valor. Ambos têm de caber no preço (RN-112).
  const chaveNaMao = f.tipologia === 'CHAVE_NA_MAO';
  // O licenciamento não tem execução a acompanhar: tem valor, período de licença
  // e uma fatura. O que é obrigatório é a vigência da licença (RN-113/RN-114).
  const licenciamento = f.tipologia === 'LICENCIAMENTO';
  const licencaOk = !licenciamento || (f.licencaDe !== '' && f.licencaAte !== '' && f.licencaAte > f.licencaDe);
  const entregaveisPreenchidos = entregaveis.filter((e) => e.designacao.trim() !== '');
  const totalEntregaveis = entregaveisPreenchidos.reduce((s, e) => s + valorEntregavel(e, precoCent), 0);
  const bolsaCent = eurosParaCent(bolsaHoras);
  const porAtribuir = precoCent - totalEntregaveis - bolsaCent;
  const entregaveisSemValor = entregaveisPreenchidos.filter((e) => valorEntregavel(e, precoCent) <= 0).length;
  const estruturaOk = !chaveNaMao || (entregaveisPreenchidos.length > 0 && entregaveisSemValor === 0 && porAtribuir >= 0);

  async function gravar(): Promise<void> {
    setErro(undefined);
    if (precoCent <= 0) { setErro('Indique o preço contratual total (€ > 0).'); return; }
    if (licenciamento && !licencaOk) { setErro('Indique o período de vigência do licenciamento, com fim posterior ao início (RN-113).'); return; }
    if (chaveNaMao) {
      if (entregaveisPreenchidos.length === 0) { setErro('Um contrato chave-na-mão tem de ter pelo menos um entregável identificado (RN-111).'); return; }
      if (entregaveisSemValor > 0) { setErro('Cada entregável tem de ter valor: indique-o em euros ou em percentagem do contrato (RN-111).'); return; }
      if (porAtribuir < 0) { setErro('Os entregáveis e a bolsa de horas excedem o preço contratual (RN-112).'); return; }
    }
    const agora = app.ctx.relogio.agora();
    const u = app.utilizador();
    const contrato: Contrato = {
      id: app.ctx.ids.novo('ctr'), numero: f.numero, objeto: f.objeto, estado: estadoInicial,
      tipologia: f.tipologia,
      numeroProcedimento: f.numeroProcedimento || undefined,
      tipoProcedimento: f.tipoProcedimento,
      numeroLote: f.numeroLote.trim() !== '' ? Number(f.numeroLote) : undefined,
      precoContratualInicial: precoCent, precoContratualAtual: precoCent,
      prestador: { nome: f.nome, nipc: f.nipc },
      dataAssinaturaCA: f.dataAssinatura, dataInicioVigencia: f.dataInicio, dataTerminoContratual: f.dataTermino,
      vistoTribunalContasNecessario: f.visto,
      ...(f.dataVisto !== '' ? { dataVistoTribunalContas: f.dataVisto } : {}),
      ...(f.numeroPortaria !== '' ? { numeroPortariaExtensaoEncargos: f.numeroPortaria } : {}),
      ...(licenciamento && f.licencaDe !== '' && f.licencaAte !== '' ? { vigenciaLicenciamento: { de: f.licencaDe, ate: f.licencaAte } } : {}),
      gestores: [{ utilizadorId: f.gestor, principal: true }],
      excecoes: [], criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    try {
      await app.contratos.criar(contrato, u);
      // Bolsa de horas: perfis contratuais (horas + valor/hora em euros).
      if (f.tipologia === 'BOLSA_HORAS') {
        for (const p of perfis.filter((x) => x.nome.trim() !== '')) {
          await app.estrutura.criarPerfil(contrato.id, { nome: p.nome, quantidadePrevista: horasParaMin(Number(p.horas) || 0), consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, valorHora: eurosParaCent(p.valorHora), vigenteDe: f.dataInicio }, u);
        }
      }
      // Chave-na-mão: entregáveis (obrigatórios) e bolsa de horas (opcional; se
      // existir, o valor é o único elemento obrigatório da componente).
      if (chaveNaMao) {
        if (bolsaCent > 0) await app.entregaveis.definirBolsaHoras(contrato.id, bolsaCent, u);
        for (const e of entregaveisPreenchidos) {
          await app.entregaveis.criar(contrato.id, {
            designacao: e.designacao,
            ...(e.modo === 'VALOR' ? { valor: eurosParaCent(e.valor) } : { percentagemContrato: (Number(e.percentagem.replace(',', '.')) || 0) / 100 }),
            ...(e.dataPrevista !== '' ? { dataPrevista: e.dataPrevista } : {}),
          }, u);
        }
      }
      navegar(`/contratos/${contrato.id}`);
    } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Novo contrato" sub="Registo de um contrato assinado (fase de execução)" acoes={<><button className="btn" onClick={() => navegar('/contratos')}>Cancelar</button><button className="btn pri" onClick={() => void gravar()} disabled={f.numero === '' || f.objeto === '' || f.dataTermino === '' || !estruturaOk || !licencaOk}>Gravar contrato</button></>} />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      {alertaVisto && (
        <div className="aviso" style={{ marginBottom: 12, borderColor: 'var(--ambar)' }}>
          <b>✨ Agente CCP (IA):</b> o valor do contrato ({formatarMoeda(precoCent)}) atinge o limiar de <b>visto prévio do Tribunal de Contas</b> ({formatarMoeda(avaliacaoVisto.limiar)}). Assinale o campo 11 «Visto prévio necessário» e indique a data (obtida ou prevista); sem visto assegurado o contrato não pode entrar em vigor.
          <div className="sec" style={{ marginTop: 3 }}>{avaliacaoVisto.referencia}</div>
        </div>
      )}
      <div className="cartao"><div className="corpo">
        <div className="g3">
          <div className="campo"><label>1 · Número do contrato *</label><input value={f.numero} onChange={(e) => upd('numero', e.target.value)} placeholder="C-2026-004" /></div>
          <div className="campo"><label>2 · Número do procedimento de origem</label><input value={f.numeroProcedimento} onChange={(e) => upd('numeroProcedimento', e.target.value)} /></div>
          <div className="campo"><label>3 · Tipo de procedimento concursal</label><select value={f.tipoProcedimento} onChange={(e) => upd('tipoProcedimento', e.target.value)}>{TIPOS_PROC.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}</select></div>
        </div>
        <div className="g3">
          <div className="campo"><label>4 · N.º do lote do procedimento (opcional)</label><input type="number" min={0} value={f.numeroLote} onChange={(e) => upd('numeroLote', e.target.value)} placeholder="—" /></div>
          <div className="campo" style={{ gridColumn: 'span 2' }}><label>5 · Objeto do contrato *</label><input value={f.objeto} onChange={(e) => upd('objeto', e.target.value)} /></div>
        </div>
        <div className="g3">
          <div className="campo"><label>6 · Preço contratual total (€) *</label><input type="number" min={0} step="0.01" value={f.precoTotal} onChange={(e) => upd('precoTotal', e.target.value)} /></div>
          <div className="campo"><label>7 · Prestador de serviços *</label><input value={f.nome} onChange={(e) => upd('nome', e.target.value)} /></div>
          <div className="campo"><label>NIPC</label><input value={f.nipc} onChange={(e) => upd('nipc', e.target.value)} /></div>
        </div>
        <div className="g3">
          <div className="campo"><label>8 · Data de assinatura pelo cocontratante</label><input type="date" value={f.dataAssinatura} onChange={(e) => upd('dataAssinatura', e.target.value)} /></div>
          <div className="campo"><label>9 · Início de vigência do contrato *</label><input type="date" value={f.dataInicio} onChange={(e) => upd('dataInicio', e.target.value)} /></div>
          <div className="campo"><label>10 · Data de término do contrato *</label><input type="date" value={f.dataTermino} onChange={(e) => upd('dataTermino', e.target.value)} /></div>
        </div>
        <div className="g3">
          <div className="campo"><label>11 · Visto prévio do Tribunal de Contas</label><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 4 }}><input type="checkbox" checked={f.visto} onChange={(e) => upd('visto', e.target.checked)} /> Necessário</label></div>
          <div className="campo"><label>12 · Data de obtenção do visto do TdC (opcional)</label><input type="date" value={f.dataVisto} onChange={(e) => upd('dataVisto', e.target.value)} disabled={!f.visto} /></div>
          <div className="campo"><label>13 · Nº portaria de extensão de encargos (opcional)</label><input value={f.numeroPortaria} onChange={(e) => upd('numeroPortaria', e.target.value)} /></div>
        </div>
        <div className="g2">
          <div className="campo"><label>14 · Gestor do contrato (utilizador Azure) · obrigatório <code>RN-116</code></label><select value={f.gestor} onChange={(e) => upd('gestor', e.target.value)}>{AZURE_USERS.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
          <div className="campo"><label>15 · Tipologia do contrato</label><select value={f.tipologia} onChange={(e) => upd('tipologia', e.target.value)}><option value="BOLSA_HORAS">Bolsa de horas</option><option value="CHAVE_NA_MAO">Chave-na-mão</option><option value="LICENCIAMENTO">Licenciamento</option></select></div>
        </div>
        {f.visto && !vistoOk && <div className="aviso" style={{ marginTop: 2 }}>Visto necessário e ainda sem data de obtenção: o contrato será criado no estado <b>Aguarda visto TdC</b> (não pode entrar em vigor sem visto obtido ou tácito).</div>}

        {f.tipologia === 'BOLSA_HORAS' && (
          <div style={{ border: '1px solid var(--linha)', borderRadius: 8, padding: 12, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><b style={{ fontSize: 13 }}>Perfis contratuais (bolsa de horas)</b><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setPerfis([...perfis, { nome: '', horas: '', valorHora: '' }])}>+ Perfil</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 180px 36px', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--texto-suave)', fontWeight: 600 }}>
              <span>Nome do perfil</span><span>Horas</span><span>Valor/hora (€)</span><span></span>
            </div>
            {perfis.map((p, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 180px 36px', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <input placeholder="Nome do perfil" value={p.nome} onChange={(e) => setPerfis(perfis.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                <input type="number" min={0} placeholder="Horas" value={p.horas} onChange={(e) => setPerfis(perfis.map((x, j) => j === i ? { ...x, horas: e.target.value } : x))} />
                <input type="number" min={0} step="0.01" placeholder="Valor/hora (€)" value={p.valorHora} onChange={(e) => setPerfis(perfis.map((x, j) => j === i ? { ...x, valorHora: e.target.value } : x))} />
                <button className="btn sm" title="Eliminar perfil" disabled={perfis.length === 1} onClick={() => setPerfis(perfis.filter((_, j) => j !== i))} style={{ justifyContent: 'center' }}>✕</button>
              </div>
            ))}
          </div>
        )}
        {licenciamento && (
          <div style={{ border: '1px solid var(--linha)', borderRadius: 8, padding: 12, marginTop: 10 }}>
            <div style={{ marginBottom: 4 }}><b style={{ fontSize: 13 }}>Vigência do licenciamento (obrigatório)</b></div>
            <div className="sec" style={{ marginBottom: 8 }}>
              O período coberto pelas licenças, que pode ser mais curto do que o contrato — é ele que determina quando é
              preciso renovar. Tem de caber na vigência do contrato <code>RN-114</code>.
            </div>
            <div className="g2">
              <div className="campo"><label>Licenças de *</label><input type="date" value={f.licencaDe} onChange={(e) => upd('licencaDe', e.target.value)} /></div>
              <div className="campo"><label>Licenças até *</label><input type="date" value={f.licencaAte} onChange={(e) => upd('licencaAte', e.target.value)} /></div>
            </div>
            <div className="aviso" style={{ marginBottom: 0 }}>
              Um contrato de licenciamento não tem perfis nem entregáveis, e admite uma <b>única fatura</b> pela totalidade
              do valor <code>RN-610</code> <code>RN-611</code>.
            </div>
          </div>
        )}

        {chaveNaMao && (
          <div style={{ border: '1px solid var(--linha)', borderRadius: 8, padding: 12, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}><b style={{ fontSize: 13 }}>Entregáveis (obrigatório)</b><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setEntregaveis([...entregaveis, { ...ENTREGAVEL_VAZIO }])}>+ Entregável</button></div>
            <div className="sec" style={{ marginBottom: 8 }}>Num contrato chave-na-mão não se paga tempo, paga-se resultado: o preço reparte-se por entregáveis, cada um valendo uma fatia do contrato — indicada em euros ou em percentagem do valor total.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 150px 36px', gap: 8, marginBottom: 6, fontSize: 11, color: 'var(--texto-suave)', fontWeight: 600 }}>
              <span>Designação</span><span>Indicar por</span><span>Valor / %</span><span>Data prevista</span><span></span>
            </div>
            {entregaveis.map((e, i) => {
              const mudar = (patch: Partial<EntregavelForm>): void => setEntregaveis(entregaveis.map((x, j) => j === i ? { ...x, ...patch } : x));
              const cent = valorEntregavel(e, precoCent);
              return (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 150px 150px 150px 36px', gap: 8, alignItems: 'center' }}>
                    <input placeholder="ex.: E1 · Análise e desenho" value={e.designacao} onChange={(ev) => mudar({ designacao: ev.target.value })} />
                    <select value={e.modo} onChange={(ev) => mudar({ modo: ev.target.value as 'VALOR' | 'PCT' })}><option value="VALOR">Euros</option><option value="PCT">% do contrato</option></select>
                    {e.modo === 'VALOR'
                      ? <input type="number" inputMode="decimal" min={0} step="0.01" placeholder="€" value={e.valor} onChange={(ev) => mudar({ valor: ev.target.value })} />
                      : <input type="number" inputMode="decimal" min={0} max={100} step="0.01" placeholder="%" value={e.percentagem} onChange={(ev) => mudar({ percentagem: ev.target.value })} />}
                    <input type="date" value={e.dataPrevista} onChange={(ev) => mudar({ dataPrevista: ev.target.value })} />
                    <button className="btn sm" title="Eliminar entregável" disabled={entregaveis.length === 1} onClick={() => setEntregaveis(entregaveis.filter((_, j) => j !== i))} style={{ justifyContent: 'center' }}>✕</button>
                  </div>
                  {e.designacao.trim() !== '' && (
                    <div className="sec" style={{ marginTop: 3 }}>{formatarMoeda(cent)} · {precoCent > 0 ? Math.round((cent / precoCent) * 1000) / 10 : 0}% do contrato</div>
                  )}
                </div>
              );
            })}
            <div className="campo" style={{ maxWidth: 320, marginTop: 10 }}><label>Bolsa de horas do contrato (€) — opcional</label><input type="number" inputMode="decimal" min={0} step="0.01" value={bolsaHoras} onChange={(e) => setBolsaHoras(e.target.value)} placeholder="ex.: 30000,00" /></div>
            <div className="sec" style={{ marginBottom: 8 }}>A bolsa de horas reserva-se a <b>trabalhos não previstos</b>. Por ser uma reserva, o <b>valor é o único elemento obrigatório</b> — os perfis e as horas registam-se depois, no detalhe do contrato, à medida que surgem.</div>
            <div className="aviso" style={{ marginBottom: 0, ...(porAtribuir < 0 ? { borderColor: 'var(--vermelho)' } : {}) }}>
              Entregáveis <b>{formatarMoeda(totalEntregaveis)}</b> + bolsa de horas <b>{formatarMoeda(bolsaCent)}</b> = <b>{formatarMoeda(totalEntregaveis + bolsaCent)}</b> de {formatarMoeda(precoCent)}.
              {porAtribuir < 0
                ? <> Excede o preço contratual em <b>{formatarMoeda(-porAtribuir)}</b> <code>RN-112</code>.</>
                : <> Por atribuir: <b>{formatarMoeda(porAtribuir)}</b>.</>}
            </div>
          </div>
        )}
        <div className="aviso" style={{ marginTop: 12 }}>Validado ao gravar: número único <code>RN-101</code> e vigência <code>RN-201</code>/<code>RN-202</code>. O lote não é obrigatório.{chaveNaMao && <> Nos contratos chave-na-mão, pelo menos um entregável com valor <code>RN-111</code> e o teto do preço contratual <code>RN-112</code>.</>}</div>
      </div></div>
    </>
  );
}
