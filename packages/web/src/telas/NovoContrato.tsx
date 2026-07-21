import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Contrato } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { hoje, mensagemErro, useAsync } from '../comum.js';

export function NovoContrato(): ReactNode {
  const navegar = useNavigate();
  const [erro, setErro] = useState<string>();
  const [f, setF] = useState({ numero: '', loteId: '', objeto: '', nome: '', nipc: '', precoInicial: 100000, unidade: 'HORA', dataInicio: hoje(), dataTermino: '', visto: false, gestor: 'oid-gestor-contrato', designadoEm: hoje() });
  const lotes = useAsync(() => app.ctx.repos.lotes.todos(), []);

  async function gravar(): Promise<void> {
    setErro(undefined);
    const agora = app.ctx.relogio.agora();
    const u = app.utilizador();
    const contrato: Contrato = {
      id: app.ctx.ids.novo('ctr'), loteId: f.loteId, numero: f.numero, objeto: f.objeto, estado: 'EM_PREPARACAO',
      precoContratualInicial: f.precoInicial, precoContratualAtual: f.precoInicial, unidadeMedida: f.unidade as never,
      prestador: { nome: f.nome, nipc: f.nipc },
      dataAssinaturaCA: f.dataInicio, dataInicioVigencia: f.dataInicio, dataTerminoContratual: f.dataTermino, dataTerminoOriginal: f.dataTermino,
      vistoTribunalContasNecessario: f.visto,
      gestores: [{ utilizadorId: f.gestor, principal: true, designadoEm: f.designadoEm }],
      excecoes: [], criadoEm: agora, criadoPor: u.utilizadorId, atualizadoEm: agora, atualizadoPor: u.utilizadorId,
    };
    try {
      await app.contratos.validar(contrato);
      await app.ctx.repos.contratos.guardar(contrato);
      navegar(`/contratos/${contrato.id}`);
    } catch (e) { setErro(mensagemErro(e)); }
  }

  const lotesLivres = (lotes.dados ?? []);
  return (
    <>
      <Cabecalho titulo="Novo contrato" sub="Contratos › Criar" acoes={<><button className="btn" onClick={() => navegar('/contratos')}>Cancelar</button><button className="btn pri" onClick={() => void gravar()} disabled={f.numero === '' || f.loteId === '' || f.dataTermino === ''}>Gravar contrato</button></>} />
      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}
      <div className="cartao"><div className="corpo">
        <div className="g3">
          <div className="campo"><label>Nº do contrato *</label><input value={f.numero} onChange={(e) => setF({ ...f, numero: e.target.value })} placeholder="C-2026-004" /></div>
          <div className="campo"><label>Lote *</label><select value={f.loteId} onChange={(e) => setF({ ...f, loteId: e.target.value })}><option value="">— selecionar —</option>{lotesLivres.map((l) => <option key={l.id} value={l.id}>{l.numero} · {l.designacao}</option>)}</select></div>
          <div className="campo"><label>Unidade</label><select value={f.unidade} onChange={(e) => setF({ ...f, unidade: e.target.value })}><option value="HORA">Hora</option><option value="DIA_HOMEM">Dia-homem</option><option value="FTE_MES">FTE-mês</option></select></div>
        </div>
        <div className="campo"><label>Objeto *</label><input value={f.objeto} onChange={(e) => setF({ ...f, objeto: e.target.value })} /></div>
        <div className="g3">
          <div className="campo"><label>Prestador *</label><input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} /></div>
          <div className="campo"><label>NIPC *</label><input value={f.nipc} onChange={(e) => setF({ ...f, nipc: e.target.value })} /></div>
          <div className="campo"><label>Valor inicial do contrato (cêntimos) *</label><input type="number" value={f.precoInicial} onChange={(e) => setF({ ...f, precoInicial: Number(e.target.value) })} /></div>
        </div>
        <div className="g3">
          <div className="campo"><label>Início de vigência *</label><input type="date" value={f.dataInicio} onChange={(e) => setF({ ...f, dataInicio: e.target.value })} /></div>
          <div className="campo"><label>Término contratual *</label><input type="date" value={f.dataTermino} onChange={(e) => setF({ ...f, dataTermino: e.target.value })} /></div>
          <div className="campo"><label>Gestor designado em *</label><input type="date" value={f.designadoEm} onChange={(e) => setF({ ...f, designadoEm: e.target.value })} /></div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.visto} onChange={(e) => setF({ ...f, visto: e.target.checked })} /> Sujeito a visto prévio do Tribunal de Contas</label>
        <div className="aviso" style={{ marginTop: 12 }}>Regras validadas ao gravar: número único <code>RN-101</code>, lote livre <code>RN-102</code>, vigência <code>RN-201</code>/<code>RN-202</code> e gestor designado <code>RN-107</code>.</div>
      </div></div>
    </>
  );
}
