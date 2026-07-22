import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Contrato, TipoProcedimento, TipologiaContrato } from '@chora/domain';
import { app, AZURE_USERS } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { hoje, horasParaMin, mensagemErro } from '../comum.js';

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

interface PerfilForm { nome: string; horas: number; valorHora: number }

export function NovoContrato(): ReactNode {
  const navegar = useNavigate();
  const [erro, setErro] = useState<string>();
  const [f, setF] = useState({
    numero: '', numeroProcedimento: '', tipoProcedimento: 'CONCURSO_PUBLICO' as TipoProcedimento, numeroLote: '',
    objeto: '', precoTotal: 100000, nome: '', nipc: '',
    dataAssinatura: hoje(), dataInicio: hoje(), dataTermino: '',
    visto: false, dataVisto: '', numeroPortaria: '',
    gestor: 'oid-gestor-contrato', tipologia: 'BOLSA_HORAS' as TipologiaContrato,
  });
  const [perfis, setPerfis] = useState<PerfilForm[]>([{ nome: '', horas: 0, valorHora: 0 }]);

  function upd(campo: string, valor: unknown): void { setF({ ...f, [campo]: valor }); }

  async function gravar(): Promise<void> {
    setErro(undefined);
    const agora = app.ctx.relogio.agora();
    const u = app.utilizador();
    const contrato: Contrato = {
      id: app.ctx.ids.novo('ctr'), numero: f.numero, objeto: f.objeto, estado: 'EM_VIGOR',
      tipologia: f.tipologia,
      numeroProcedimento: f.numeroProcedimento || undefined,
      tipoProcedimento: f.tipoProcedimento,
      numeroLote: f.numeroLote.trim() !== '' ? Number(f.numeroLote) : undefined,
      precoContratualInicial: f.precoTotal, precoContratualAtual: f.precoTotal,
      prestador: { nome: f.nome, nipc: f.nipc },
      dataAssinaturaCA: f.dataAssinatura, dataInicioVigencia: f.dataInicio, dataTerminoContratual: f.dataTermino,
      vistoTribunalContasNecessario: f.visto,
      ...(f.dataVisto !== '' ? { dataVistoTribunalContas: f.dataVisto } : {}),
      ...(f.numeroPortaria !== '' ? { numeroPortariaExtensaoEncargos: f.numeroPortaria } : {}),
      gestores: [{ utilizadorId: f.gestor, principal: true }],
      excecoes: [], criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    try {
      await app.contratos.criar(contrato, u);
      // Chave-na-mão: identificar os perfis com horas e valor/hora.
      if (f.tipologia === 'CHAVE_NA_MAO') {
        for (const p of perfis.filter((x) => x.nome.trim() !== '')) {
          await app.estrutura.criarPerfil(contrato.id, { nome: p.nome, quantidadePrevista: horasParaMin(p.horas), consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, valorHora: p.valorHora, vigenteDe: f.dataInicio }, u);
        }
      }
      navegar(`/contratos/${contrato.id}`);
    } catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <>
      <Cabecalho titulo="Novo contrato" sub="Registo de um contrato assinado (fase de execução)" acoes={<><button className="btn" onClick={() => navegar('/contratos')}>Cancelar</button><button className="btn pri" onClick={() => void gravar()} disabled={f.numero === '' || f.objeto === '' || f.dataTermino === ''}>Gravar contrato</button></>} />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div className="cartao"><div className="corpo">
        <div className="g3">
          <div className="campo"><label>1 · Número do contrato *</label><input value={f.numero} onChange={(e) => upd('numero', e.target.value)} placeholder="C-2026-004" /></div>
          <div className="campo"><label>2 · Número do procedimento de origem</label><input value={f.numeroProcedimento} onChange={(e) => upd('numeroProcedimento', e.target.value)} /></div>
          <div className="campo"><label>3 · Tipo de procedimento</label><select value={f.tipoProcedimento} onChange={(e) => upd('tipoProcedimento', e.target.value)}>{TIPOS_PROC.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}</select></div>
        </div>
        <div className="g3">
          <div className="campo"><label>4 · Número do lote (opcional)</label><input type="number" min={0} value={f.numeroLote} onChange={(e) => upd('numeroLote', e.target.value)} placeholder="—" /></div>
          <div className="campo" style={{ gridColumn: 'span 2' }}><label>5 · Objeto do contrato *</label><input value={f.objeto} onChange={(e) => upd('objeto', e.target.value)} /></div>
        </div>
        <div className="g3">
          <div className="campo"><label>6 · Preço contratual total (cêntimos) *</label><input type="number" value={f.precoTotal} onChange={(e) => upd('precoTotal', Number(e.target.value))} /></div>
          <div className="campo"><label>7 · Prestador de serviços *</label><input value={f.nome} onChange={(e) => upd('nome', e.target.value)} /></div>
          <div className="campo"><label>NIPC</label><input value={f.nipc} onChange={(e) => upd('nipc', e.target.value)} /></div>
        </div>
        <div className="g3">
          <div className="campo"><label>8 · Assinatura pelo cocontratante</label><input type="date" value={f.dataAssinatura} onChange={(e) => upd('dataAssinatura', e.target.value)} /></div>
          <div className="campo"><label>9 · Início de vigência *</label><input type="date" value={f.dataInicio} onChange={(e) => upd('dataInicio', e.target.value)} /></div>
          <div className="campo"><label>10 · Término do contrato *</label><input type="date" value={f.dataTermino} onChange={(e) => upd('dataTermino', e.target.value)} /></div>
        </div>
        <div className="g3">
          <div className="campo"><label>11 · Visto prévio do Tribunal de Contas</label><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 4 }}><input type="checkbox" checked={f.visto} onChange={(e) => upd('visto', e.target.checked)} /> Necessário</label></div>
          <div className="campo"><label>12 · Data de obtenção do visto (opcional)</label><input type="date" value={f.dataVisto} onChange={(e) => upd('dataVisto', e.target.value)} /></div>
          <div className="campo"><label>13 · Nº portaria de extensão de encargos (opcional)</label><input value={f.numeroPortaria} onChange={(e) => upd('numeroPortaria', e.target.value)} /></div>
        </div>
        <div className="g2">
          <div className="campo"><label>14 · Gestor do contrato (utilizador Azure)</label><select value={f.gestor} onChange={(e) => upd('gestor', e.target.value)}>{AZURE_USERS.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}</select></div>
          <div className="campo"><label>15 · Tipologia do contrato</label><select value={f.tipologia} onChange={(e) => upd('tipologia', e.target.value)}><option value="BOLSA_HORAS">Bolsa de horas</option><option value="CHAVE_NA_MAO">Chave-na-mão</option></select></div>
        </div>

        {f.tipologia === 'CHAVE_NA_MAO' && (
          <div style={{ border: '1px solid var(--linha)', borderRadius: 8, padding: 12, marginTop: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: 8 }}><b style={{ fontSize: 13 }}>Perfis contratuais (chave-na-mão)</b><button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setPerfis([...perfis, { nome: '', horas: 0, valorHora: 0 }])}>+ Perfil</button></div>
            {perfis.map((p, i) => (
              <div key={i} className="g3" style={{ marginBottom: 8 }}>
                <input placeholder="Nome do perfil" value={p.nome} onChange={(e) => setPerfis(perfis.map((x, j) => j === i ? { ...x, nome: e.target.value } : x))} />
                <input type="number" placeholder="Horas" value={p.horas} onChange={(e) => setPerfis(perfis.map((x, j) => j === i ? { ...x, horas: Number(e.target.value) } : x))} />
                <input type="number" placeholder="Valor/hora (cêntimos)" value={p.valorHora} onChange={(e) => setPerfis(perfis.map((x, j) => j === i ? { ...x, valorHora: Number(e.target.value) } : x))} />
              </div>
            ))}
          </div>
        )}
        <div className="aviso" style={{ marginTop: 12 }}>Validado ao gravar: número único <code>RN-101</code> e vigência <code>RN-201</code>/<code>RN-202</code>. O lote não é obrigatório.</div>
      </div></div>
    </>
  );
}
