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

const agenteCCP = new AgenteCCPStub();

export function NovoContrato(): ReactNode {
  const navegar = useNavigate();
  const [erro, setErro] = useState<string>();
  const [f, setF] = useState({
    numero: '', numeroProcedimento: '', tipoProcedimento: 'CONCURSO_PUBLICO' as TipoProcedimento, numeroLote: '',
    objeto: '', precoTotal: '100000', nome: '', nipc: '',
    dataAssinatura: hoje(), dataInicio: hoje(), dataTermino: '',
    visto: false, dataVisto: '', dataPrevistaVisto: '', numeroPortaria: '',
    gestor: 'oid-gestor-contrato', tipologia: 'BOLSA_HORAS' as TipologiaContrato,
  });
  const [perfis, setPerfis] = useState<PerfilForm[]>([{ nome: '', horas: '', valorHora: '' }]);

  function upd(campo: string, valor: unknown): void { setF({ ...f, [campo]: valor }); }

  // Agente CCP (IA — stub): avalia se o valor atinge o limiar de visto prévio do TdC.
  const precoCent = eurosParaCent(f.precoTotal);
  const avaliacaoVisto = agenteCCP.avaliarVistoPrevio(precoCent);
  const alertaVisto = avaliacaoVisto.obrigatorio && !f.visto;

  // Estado inicial: se exige visto e este não está assegurado, o contrato não pode
  // entrar EM_VIGOR — fica AGUARDA_VISTO.
  const vistoAssegurado = !f.visto || f.dataVisto !== '' || (f.dataPrevistaVisto !== '' && f.dataPrevistaVisto <= hoje());
  const estadoInicial: EstadoContrato = vistoAssegurado ? 'EM_VIGOR' : 'AGUARDA_VISTO';

  async function gravar(): Promise<void> {
    setErro(undefined);
    if (precoCent <= 0) { setErro('Indique o preço contratual total (€ > 0).'); return; }
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
      ...(f.dataPrevistaVisto !== '' ? { dataPrevistaVistoTribunalContas: f.dataPrevistaVisto } : {}),
      ...(f.numeroPortaria !== '' ? { numeroPortariaExtensaoEncargos: f.numeroPortaria } : {}),
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
      navegar(`/contratos/${contrato.id}`);
    } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Novo contrato" sub="Registo de um contrato assinado (fase de execução)" acoes={<><button className="btn" onClick={() => navegar('/contratos')}>Cancelar</button><button className="btn pri" onClick={() => void gravar()} disabled={f.numero === '' || f.objeto === '' || f.dataTermino === ''}>Gravar contrato</button></>} />
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
          <div className="campo"><label>12b · Data prevista de obtenção do visto (opcional)</label><input type="date" value={f.dataPrevistaVisto} onChange={(e) => upd('dataPrevistaVisto', e.target.value)} disabled={!f.visto} /></div>
        </div>
        <div className="g3">
          <div className="campo"><label>13 · Nº portaria de extensão de encargos (opcional)</label><input value={f.numeroPortaria} onChange={(e) => upd('numeroPortaria', e.target.value)} /></div>
          <div className="campo"><label>14 · Gestor do contrato (utilizador Azure)</label><select value={f.gestor} onChange={(e) => upd('gestor', e.target.value)}>{AZURE_USERS.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
          <div className="campo"><label>15 · Tipologia do contrato</label><select value={f.tipologia} onChange={(e) => upd('tipologia', e.target.value)}><option value="BOLSA_HORAS">Bolsa de horas</option><option value="CHAVE_NA_MAO">Chave-na-mão</option></select></div>
        </div>
        {f.visto && !vistoAssegurado && <div className="aviso" style={{ marginTop: 2 }}>Visto necessário e ainda não assegurado: o contrato será criado no estado <b>Aguarda visto TdC</b> (não pode entrar em vigor sem visto obtido, tácito ou data prevista já atingida).</div>}

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
        <div className="aviso" style={{ marginTop: 12 }}>Validado ao gravar: número único <code>RN-101</code> e vigência <code>RN-201</code>/<code>RN-202</code>. O lote não é obrigatório.</div>
      </div></div>
    </>
  );
}
