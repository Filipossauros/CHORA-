import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { decisoesPendentes, reprogramarPortaria, vigenciaLiquidaMeses, ESTADOS_CONTRATO, LIMITE_VIGENCIA_MESES, type Alerta, type Afetacao, type Alteracao, type Contrato, type EstadoContrato, type EventoAuditoria, type PerfilContratual, type RegistoTempo, type TipoAlteracao } from '@chora/domain';
import { app, AZURE_USERS, nomeAzure, prestadorAzure } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, Estado, centParaEuros, eurosParaCent, formatarHoras, formatarMoeda, hoje, horasParaMin, mensagemErro, notificarMudanca, pct, useAsync } from '../comum.js';
import { calcularCapacidade } from '../capacidade.js';
import { ExtrairDocumento } from '../componentes/ExtrairDocumento.js';
import { Entregaveis } from './Entregaveis.js';
import { DecisoesDoContrato } from './Hoje.js';

const RECURSOS_AZURE = AZURE_USERS.filter((u) => u.prestador !== undefined);
function rotularOperacao(op: string): string {
  if (op.startsWith('ALTERAR_ESTADO')) return 'Alteração de estado';
  if (op.startsWith('ESTADO:')) return 'Transição de estado';
  if (op.startsWith('INATIVAR')) return 'Inativação';
  const m: Record<string, string> = { CRIAR: 'Criação', ATUALIZAR: 'Atualização de dados', EXCECAO: 'Exceção fundamentada' };
  return m[op] ?? op;
}
function resumirEvento(e: { operacao: string; regraViolada?: string; depois?: unknown }): string {
  const dep = e.depois as { notaAlteracaoEstado?: string; motivoInativacao?: string } | undefined;
  if (e.operacao.startsWith('ALTERAR_ESTADO:')) return `${e.operacao.slice('ALTERAR_ESTADO:'.length).replace('->', ' → ')}${dep?.notaAlteracaoEstado !== undefined ? ` · ${dep.notaAlteracaoEstado}` : ''}`;
  if (e.operacao.startsWith('INATIVAR')) return dep?.motivoInativacao ?? 'Inativação do contrato';
  if (e.operacao === 'ATUALIZAR') return 'Dados do contrato atualizados';
  if (e.operacao === 'CRIAR') return 'Contrato criado';
  return e.regraViolada ?? '—';
}

/**
 * FICHA — o que o contrato é e como vai: dados contratuais seguidos da execução
 * física e financeira. AFETAÇÕES — quem trabalha nele: perfis, pessoas afetas e
 * o histórico de substituições e inativações. MODIFICAÇÕES — o que lhe
 * aconteceu. «Entregáveis» só existe nos contratos chave-na-mão, onde o preço se
 * reparte por resultados em vez de horas.
 */
const TABS = ['Ficha', 'Ações', 'Afetações', 'Entregáveis', 'Modificações'] as const;
type Tab = (typeof TABS)[number];
/**
 * «Ações» só existe quando há decisões pendentes — um separador vazio é ruído.
 * «Entregáveis» só nos contratos de preço fixo.
 */
function tabsDe(c: Contrato, decisoes: number): readonly Tab[] {
  return TABS.filter((t) => {
    if (t === 'Entregáveis') return c.tipologia === 'CHAVE_NA_MAO';
    if (t === 'Ações') return decisoes > 0;
    return true;
  });
}

export function ContratoDetalhe(): ReactNode {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const tabPedido = params.get('tab');
  // Uma decisão que remeta para uma modificação traz o tipo de ato no URL: o
  // formulário abre já nesse tipo, em vez de o obrigar a procurar na lista.
  const tipoPedido = params.get('modificacao') ?? undefined;
  const [tab, setTab] = useState<Tab>((TABS as readonly string[]).includes(tabPedido ?? '') ? (tabPedido as Tab) : 'Ficha');
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  // O ciclo de vida do contrato (estado) é competência do gestor de contrato (RN-501).
  const ehGestorContrato = app.papeisAtuais().includes('GESTOR_CONTRATO');
  const [erro, setErro] = useState<string>();
  const [editar, setEditar] = useState(false);

  // A mesma rota /contratos/:id é reutilizada entre contratos (não remonta):
  // ao mudar de contrato, repõe o separador pedido no URL (ou a Ficha) e fecha a edição.
  useEffect(() => {
    setTab((TABS as readonly string[]).includes(tabPedido ?? '') ? (tabPedido as Tab) : 'Ficha');
    setEditar(false);
    setErro(undefined);
  }, [id, tabPedido]);

  const base = useAsync(async () => {
    const contrato = await app.ctx.repos.contratos.obter(id);
    const perfis = await app.ctx.repos.perfis.todos((p) => p.contratoId === id);
    const afetacoes = await app.ctx.repos.afetacoes.todos((a) => a.contratoId === id);
    const alteracoes = await app.ctx.repos.alteracoes.todos((a) => a.contratoId === id);
    const aprovados = await app.ctx.repos.registosTempo.todos((r) => r.contratoId === id && r.estado === 'APROVADO');
    const eventos = (await app.ctx.repos.eventosAuditoria.todos((e) => e.entidade === 'Contrato' && e.entidadeId === id)).sort((a, b) => (a.ocorridoEm < b.ocorridoEm ? 1 : -1));
    const idsAfetacao = new Set(afetacoes.map((a) => a.id));
    const eventosAfetacoes = (await app.ctx.repos.eventosAuditoria.todos((e) => e.entidade === 'Afetacao' && idsAfetacao.has(e.entidadeId))).sort((a, b) => (a.ocorridoEm < b.ocorridoEm ? 1 : -1));
    const recursos = await app.ctx.repos.recursos.todos();
    const resumo = await app.contratos.resumoExecucao(id) as ResumoExec;
    const decisoes = decisoesPendentes(await app.ctx.repos.alertas.todos((a) => a.contratoId === id));
    return { contrato, perfis, afetacoes, alteracoes, aprovados, eventos, eventosAfetacoes, recursos, resumo, decisoes };
  }, [id]);

  const dados = base.dados;
  if (dados === undefined || dados.contrato === null) return <p className="vazio">A carregar…</p>;
  const c = dados.contrato;
  const tabs = tabsDe(c, dados.decisoes.length);
  // Um separador pedido no URL que não exista nesta tipologia cai na Ficha.
  const tabAtiva: Tab = tabs.includes(tab) ? tab : 'Ficha';

  return (
    <>
      <Cabecalho titulo={`${c.numero} · ${c.objeto}`} sub="Detalhe do contrato (fase de execução)" acoes={<><DecisoesResumo alertas={dados.decisoes} /><Estado v={c.estado} /></>} />
      {erro !== undefined && erro !== '' && <div className="erro-cx">⚠ {erro}</div>}
      <div className="seps">{tabs.map((t) => <button key={t} className={`sep${tabAtiva === t ? ' ativo' : ''}`} onClick={() => setTab(t)}>{t}</button>)}</div>

      {tabAtiva === 'Entregáveis' && <Entregaveis contrato={c} podeGerir={podeGerir} onErro={setErro} />}

      {tabAtiva === 'Ações' && (
        <DecisoesDoContrato
          contrato={c} decisoes={dados.decisoes} podeGerir={podeGerir}
          onMudou={() => { base.recarregar(); notificarMudanca(); }} onErro={setErro}
        />
      )}

      {/* FICHA — o contrato e como vai: dados contratuais e, a seguir, a execução. */}
      {tabAtiva === 'Ficha' && (editar ? <FichaEdicao contrato={c} podeAlterarEstado={ehGestorContrato} onGravado={() => { setEditar(false); base.recarregar(); }} onErro={setErro} /> : (
        <>
          <div className="cartao" style={{ marginBottom: 16 }}>
            {podeGerir && <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '10px 12px 0' }}><button className="btn" onClick={() => { setEditar(true); setErro(undefined); }}>Alterar dados</button></div>}
            <div className="corpo g3">
            <Campo k="Prestador" v={c.prestador.nome} /><Campo k="NIPC" v={c.prestador.nipc} /><Campo k="Tipologia" v={c.tipologia === 'CHAVE_NA_MAO' ? 'Chave-na-mão' : 'Bolsa de horas'} />
            <Campo k="Nº procedimento de origem" v={c.numeroProcedimento ?? '—'} /><Campo k="Tipo de procedimento" v={(c.tipoProcedimento ?? '—').replace(/_/g, ' ').toLowerCase()} /><Campo k="Nº do lote" v={c.numeroLote !== undefined ? String(c.numeroLote) : '—'} />
            <Campo k="Valor inicial do contrato" v={formatarMoeda(c.precoContratualInicial)} /><Campo k="Valor atual do contrato" v={formatarMoeda(c.precoContratualAtual)} /><Campo k="Vigência" v={`${c.dataInicioVigencia} – ${c.dataTerminoContratual}`} />
            <Campo k="Visto prévio do TdC necessário" v={c.vistoTribunalContasNecessario ? 'Sim' : 'Não'} /><Campo k="Data de obtenção do visto do TdC" v={c.dataVistoTribunalContas ?? '—'} /><Campo k="Nº portaria de extensão de encargos" v={c.numeroPortariaExtensaoEncargos ?? c.portariaExtensaoEncargos?.numero ?? '—'} />
            <Campo k="Gestor do contrato" v={c.gestores.map((g) => nomeAzure(g.utilizadorId)).join(', ')} />
            {c.motivoInativacao !== undefined && <Campo k="Motivo de inativação" v={c.motivoInativacao} />}
            {c.notaAlteracaoEstado !== undefined && <Campo k="Nota da última alteração de estado" v={c.notaAlteracaoEstado} />}
          </div></div>

          <LinhaSeccao rotulo="Execução física e financeira" />

          <div className="grelha-kpi">
            <div className="kpi"><div className="rot">Valor inicial do contrato</div><div className="val">{formatarMoeda(dados.resumo.valorInicialContrato)}</div></div>
            <div className="kpi"><div className="rot">Valor atual do contrato</div><div className="val">{formatarMoeda(dados.resumo.valorAtualContrato)}</div></div>
            <div className="kpi"><div className="rot">Valor executado</div><div className="val">{formatarMoeda(dados.resumo.valorExecutado)}</div><div className="sub">{pct(dados.resumo.valorAtualContrato > 0 ? dados.resumo.valorExecutado / dados.resumo.valorAtualContrato : 0)} do valor atual</div></div>
            <div className="kpi"><div className="rot">Valor disponível</div><div className="val" style={{ color: dados.resumo.valorDisponivel <= dados.resumo.valorAtualContrato * 0.4 ? 'var(--ambar)' : undefined }}>{formatarMoeda(dados.resumo.valorDisponivel)}</div><div className="sub">{pct(dados.resumo.valorAtualContrato > 0 ? dados.resumo.valorDisponivel / dados.resumo.valorAtualContrato : 0)} do valor atual</div></div>
          </div>

          <div className="cartao" style={{ marginBottom: 16 }}><h3>Trabalhos complementares (limite legal 50% — RN-301)</h3><div className="corpo">
            <Barra fracao={dados.resumo.complementares.percentagem} />
            <div className="sec" style={{ marginTop: 6 }}>{dados.resumo.complementares.atingido ? 'Limite de 50% ATINGIDO' : `Máximo admissível disponível: ${formatarMoeda(dados.resumo.complementares.disponivel)}`}</div>
          </div></div>

          {c.portariaExtensaoEncargos !== undefined && <Portaria contrato={c} />}

          <div className="cartao" style={{ marginBottom: 16 }}><h3>Saldos por perfil — horas e valor restantes</h3><table>
            <thead><tr><th>Perfil</th><th className="num">Horas restantes</th><th style={{ width: 130 }}>Consumo horas</th><th className="num">Valor restante</th></tr></thead>
            <tbody>{dados.resumo.saldosPerfis.map((s) => { const frac = s.minutosPrevistos > 0 ? s.minutosConsumidos / s.minutosPrevistos : 0; return (
              <tr key={s.perfilId}><td className="prim">{s.nome}</td><td className="num">{formatarHoras(s.minutosRestantes)}<div className="sec">de {formatarHoras(s.minutosPrevistos)}</div></td><td><Barra fracao={frac} /></td><td className="num">{formatarMoeda(s.valorRestante)}<div className="sec">de {formatarMoeda(s.valorPrevisto)}</div></td></tr>
            ); })}{dados.resumo.saldosPerfis.length === 0 && <tr><td colSpan={4} className="vazio">Sem perfis.</td></tr>}</tbody>
          </table></div>

          {dados.perfis.length > 0 && <Capacidade contrato={c} perfis={dados.perfis} afetacoes={dados.afetacoes} aprovados={dados.aprovados} />}
        </>
      ))}

      {/* AFETAÇÕES — quem trabalha no contrato: perfis, pessoas e o histórico. */}
      {tabAtiva === 'Afetações' && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: podeGerir ? '1fr 320px' : '1fr', gap: 16 }}>
            <div className="cartao"><h3>Perfis contratuais{c.tipologia === 'CHAVE_NA_MAO' ? ' (bolsa de horas do contrato)' : ' (bolsa de horas)'}</h3><table>
              <thead><tr><th>Perfil</th><th className="num">Horas</th><th className="num">€/hora vigente</th></tr></thead>
              <tbody>{dados.perfis.map((p) => { const ultimo = p.precos[p.precos.length - 1]; return (
                <tr key={p.id}><td><div className="prim">{p.nome}</div>{p.consomeBolsaValor && <div className="sec">consome bolsa de valor</div>}</td><td className="num">{formatarHoras(p.quantidadePrevista)}</td><td className="num">{ultimo ? formatarMoeda(ultimo.valorHora) : '—'}</td></tr>
              ); })}{dados.perfis.length === 0 && <tr><td colSpan={3} className="vazio">{c.tipologia === 'CHAVE_NA_MAO' ? 'Sem perfis. Num contrato chave-na-mão os perfis são facultativos — servem apenas a bolsa de horas para trabalhos não previstos.' : 'Sem perfis.'}</td></tr>}</tbody>
            </table></div>
            {podeGerir && <NovoPerfil contrato={c} onCriado={() => base.recarregar()} onErro={setErro} />}
          </div>

          <GestaoAfetacoes contrato={c} perfis={dados.perfis} afetacoes={dados.afetacoes} podeGerir={podeGerir} onMudou={() => base.recarregar()} onErro={setErro} />

          <HistoricoAfetacoes eventos={dados.eventosAfetacoes} afetacoes={dados.afetacoes} perfis={dados.perfis} />
        </>
      )}

      {tabAtiva === 'Modificações' && (
        <>
          {ehGestorContrato && <GestaoAlteracoes contrato={c} resumo={dados.resumo} alteracoes={dados.alteracoes} tipoInicial={tipoPedido} onMudou={() => base.recarregar()} onErro={setErro} />}
          <div className="cartao" style={{ marginBottom: 16 }}><h3>Registo de modificações (auditoria do contrato)</h3><table>
            <thead><tr><th>Quando</th><th>Operação</th><th>Detalhe</th><th>Autor</th></tr></thead>
            <tbody>{dados.eventos.map((e) => <tr key={e.id}><td className="tabnum">{e.ocorridoEm.replace('T', ' ').slice(0, 16)}</td><td>{rotularOperacao(e.operacao)}</td><td className="sec">{resumirEvento(e)}</td><td>{nomeAzure(e.utilizadorId)}</td></tr>)}
            {dados.eventos.length === 0 && <tr><td colSpan={4} className="vazio">Sem modificações registadas.</td></tr>}</tbody>
          </table></div>
          <div className="cartao"><h3>Modificações contratuais formais</h3><table>
            <thead><tr><th>Efeitos em</th><th>Família</th><th>Tipo</th><th>Detalhe</th><th>Fundamentação</th><th className="num">Valor</th></tr></thead>
            <tbody>{dados.alteracoes.map((a) => <tr key={a.id}><td className="tabnum">{a.dataEfeito}</td><td className="sec">{familiaModificacao(a.tipo)}</td><td>{rotularTipoAlt(a.tipo)}</td><td className="sec">{detalheModificacao(a)}</td><td>{a.fundamentacao}</td><td className="num">{a.valorAcrescido !== undefined ? formatarMoeda(a.valorAcrescido) : '—'}</td></tr>)}
            {dados.alteracoes.length === 0 && <tr><td colSpan={6} className="vazio">Sem modificações contratuais formais.</td></tr>}</tbody>
          </table></div>
        </>
      )}
    </>
  );
}

const ROT_ESTADO: Record<EstadoContrato, string> = {
  EM_PREPARACAO: 'Em preparação', AGUARDA_VISTO: 'Aguarda visto TdC', EM_VIGOR: 'Em vigor',
  SUSPENSO: 'Suspenso', TERMINADO: 'Terminado', RESOLVIDO: 'Resolvido', CADUCADO: 'Caducado', REVOGADO: 'Revogado',
};
const ESTADOS_TERMINAIS: EstadoContrato[] = ['TERMINADO', 'RESOLVIDO', 'CADUCADO', 'REVOGADO'];

/** Formulário de alteração dos dados do contrato + alteração livre de estado. */
function FichaEdicao({ contrato, podeAlterarEstado, onGravado, onErro }: { contrato: Contrato; podeAlterarEstado: boolean; onGravado: () => void; onErro: (m?: string) => void }): ReactNode {
  const [f, setF] = useState({
    objeto: contrato.objeto,
    // valor em euros como texto para permitir apagar a célula (não fica "0" preso)
    precoContratualAtual: centParaEuros(contrato.precoContratualAtual),
    dataTerminoContratual: contrato.dataTerminoContratual,
    vistoTribunalContasNecessario: contrato.vistoTribunalContasNecessario,
    dataVistoTribunalContas: contrato.dataVistoTribunalContas ?? '',
    vistoTacito: contrato.vistoTacito ?? false,
    numeroPortariaExtensaoEncargos: contrato.numeroPortariaExtensaoEncargos ?? '',
  });
  const [novoEstado, setNovoEstado] = useState<EstadoContrato>(contrato.estado);
  const [nota, setNota] = useState('');

  /** Persiste os dados do formulário. Devolve true se gravou. */
  async function persistir(): Promise<boolean> {
    if (f.precoContratualAtual.trim() === '') { onErro('O valor atual do contrato não pode ficar vazio.'); return false; }
    const valor = eurosParaCent(f.precoContratualAtual);
    if (valor < 0) { onErro('O valor atual do contrato tem de ser um número não negativo.'); return false; }
    await app.contratos.atualizar(contrato.id, {
      objeto: f.objeto,
      precoContratualAtual: valor,
      dataTerminoContratual: f.dataTerminoContratual,
      vistoTribunalContasNecessario: f.vistoTribunalContasNecessario,
      vistoTacito: f.vistoTacito,
      ...(f.dataVistoTribunalContas !== '' ? { dataVistoTribunalContas: f.dataVistoTribunalContas } : {}),
      ...(f.numeroPortariaExtensaoEncargos !== '' ? { numeroPortariaExtensaoEncargos: f.numeroPortariaExtensaoEncargos } : {}),
    }, app.utilizador());
    return true;
  }

  async function guardar(): Promise<void> {
    onErro();
    try { if (await persistir()) onGravado(); } catch (e) { onErro(mensagemErro(e)); }
  }

  async function alterarEstado(): Promise<void> {
    onErro();
    const envolveTerminal = ESTADOS_TERMINAIS.includes(novoEstado) || ESTADOS_TERMINAIS.includes(contrato.estado);
    if (envolveTerminal && !window.confirm(`Vai alterar o estado de "${ROT_ESTADO[contrato.estado]}" para "${ROT_ESTADO[novoEstado]}". Esta é uma operação sensível (estado terminal). Confirmar?`)) return;
    try {
      // Persiste primeiro os dados do formulário (ex.: data do visto), para que a
      // passagem a EM_VIGOR considere o visto acabado de registar.
      if (!(await persistir())) return;
      await app.contratos.alterarEstado(contrato.id, novoEstado, nota, app.utilizador());
      onGravado();
    } catch (e) { onErro(mensagemErro(e)); }
  }

  const estadosSelecionaveis = ESTADOS_CONTRATO.filter((s) => s !== 'EM_PREPARACAO');

  return (
    <>
    <div className="duas">
      <div className="cartao"><h3>Alterar dados do contrato</h3><div className="corpo">
        <div className="campo"><label>Objeto</label><input value={f.objeto} onChange={(e) => setF({ ...f, objeto: e.target.value })} /></div>
        <div className="g2">
          <div className="campo"><label>Valor atual do contrato (€)</label><input type="number" min={0} step="0.01" value={f.precoContratualAtual} onChange={(e) => setF({ ...f, precoContratualAtual: e.target.value })} placeholder="ex.: 100000" /></div>
          <div className="campo"><label>Data de término do contrato</label><input type="date" value={f.dataTerminoContratual} onChange={(e) => setF({ ...f, dataTerminoContratual: e.target.value })} /></div>
        </div>
        <div className="campo"><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={f.vistoTribunalContasNecessario} onChange={(e) => setF({ ...f, vistoTribunalContasNecessario: e.target.checked })} /> Visto prévio do Tribunal de Contas necessário</label></div>
        {f.vistoTribunalContasNecessario && (
          <div style={{ border: '1px solid var(--linha)', borderRadius: 8, padding: 10, marginBottom: 10 }}>
            <div className="sec" style={{ marginBottom: 6 }}>Visto do Tribunal de Contas — o contrato só entra em vigor com o visto assegurado (data de obtenção ou visto tácito).</div>
            <div className="g2">
              <div className="campo" style={{ margin: 0 }}><label>Data de obtenção do visto</label><input type="date" value={f.dataVistoTribunalContas} onChange={(e) => setF({ ...f, dataVistoTribunalContas: e.target.value })} /></div>
              <div className="campo" style={{ margin: 0 }}><label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 22 }}><input type="checkbox" checked={f.vistoTacito} onChange={(e) => setF({ ...f, vistoTacito: e.target.checked })} /> Visto tácito</label></div>
            </div>
          </div>
        )}
        <div className="campo"><label>Nº portaria de extensão de encargos</label><input value={f.numeroPortariaExtensaoEncargos} onChange={(e) => setF({ ...f, numeroPortariaExtensaoEncargos: e.target.value })} /></div>
        <button className="btn pri" onClick={() => void guardar()}>Guardar alterações</button>
      </div></div>
      <div className="cartao"><h3>Alterar estado do contrato</h3><div className="corpo">
        {podeAlterarEstado ? (
          <>
            <div className="aviso" style={{ marginBottom: 12 }}>Ao aplicar, as alterações de dados acima são gravadas primeiro (ex.: data do visto). Permite corrigir/reverter o estado; fica registado na auditoria e a nota visível na ficha.</div>
            <div className="campo"><label>Estado atual</label><div style={{ marginTop: 2 }}><Estado v={contrato.estado} /></div></div>
            <div className="campo"><label>Novo estado</label><select value={novoEstado} onChange={(e) => setNovoEstado(e.target.value as EstadoContrato)}>{estadosSelecionaveis.map((s) => <option key={s} value={s}>{ROT_ESTADO[s]}</option>)}</select></div>
            <div className="campo"><label>Nota / motivo (obrigatório)</label><textarea rows={3} value={nota} onChange={(e) => setNota(e.target.value)} /></div>
            <button className="btn" disabled={nota.trim() === '' || novoEstado === contrato.estado} onClick={() => void alterarEstado()}>Aplicar novo estado</button>
          </>
        ) : (
          <div className="sec">A alteração do estado do contrato é competência do <b>Gestor de Contrato</b> (RN-501). Estado atual: <Estado v={contrato.estado} /></div>
        )}
      </div></div>
    </div>
    <div style={{ marginTop: 16 }}>
      <ExtrairDocumento
        tipo="PORTARIA"
        onConfirmar={async (campos) => {
          const numero = campos['numero'];
          if (numero !== undefined && numero.trim() !== '') {
            setF((prev) => ({ ...prev, numeroPortariaExtensaoEncargos: numero }));
          }
        }}
      />
    </div>
    {podeAlterarEstado && <EliminarContrato contrato={contrato} onErro={onErro} />}
    </>
  );
}

/**
 * Criação manual de um perfil contratual no detalhe. Nos contratos chave-na-mão
 * os perfis servem a componente de bolsa de horas (trabalhos não previstos) e
 * são facultativos — o que é obrigatório é o valor da bolsa.
 */
function NovoPerfil({ contrato, onCriado, onErro }: { contrato: Contrato; onCriado: () => void; onErro: (m?: string) => void }): ReactNode {
  const [p, setP] = useState({ nome: '', horas: '', valorHora: '' });
  async function criar(): Promise<void> {
    onErro();
    const horas = Number(p.horas); const valorHoraCent = eurosParaCent(p.valorHora);
    if (p.nome.trim() === '' || !Number.isFinite(horas) || horas <= 0 || valorHoraCent <= 0) {
      onErro('Indique nome, horas (> 0) e valor/hora (€ > 0) do perfil.'); return;
    }
    try {
      await app.estrutura.criarPerfil(contrato.id, { nome: p.nome.trim(), quantidadePrevista: horasParaMin(horas), consomeBolsaValor: false, consomeTrabalhosComplementares: false, perfilDeGestao: false, valorHora: valorHoraCent, vigenteDe: contrato.dataInicioVigencia }, app.utilizador());
      setP({ nome: '', horas: '', valorHora: '' });
      onCriado();
    } catch (e) { onErro(mensagemErro(e)); }
  }
  return (
    <div className="cartao"><h3>Novo perfil</h3><div className="corpo">
      <div className="campo"><label>Nome do perfil</label><input value={p.nome} onChange={(e) => setP({ ...p, nome: e.target.value })} placeholder="ex.: Programador Sénior" /></div>
      <div className="campo"><label>Horas contratadas</label><input type="number" min={1} value={p.horas} onChange={(e) => setP({ ...p, horas: e.target.value })} /></div>
      <div className="campo"><label>Valor/hora (€)</label><input type="number" min={0} step="0.01" value={p.valorHora} onChange={(e) => setP({ ...p, valorHora: e.target.value })} /></div>
      <div className="aviso" style={{ marginBottom: 10 }}>O total dos perfis não pode exceder o valor do contrato <code>RN-105</code>.</div>
      <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} onClick={() => void criar()}>Criar perfil</button>
    </div></div>
  );
}

/** Decisões pendentes do contrato, no cabeçalho — o detalhe abre já a dizer o que está mal. */
function DecisoesResumo({ alertas }: { alertas: Alerta[] }): ReactNode {
  const navegar = useNavigate();
  if (alertas.length === 0) return <span className="pill p-verde">Sem decisões pendentes</span>;
  const criticas = alertas.filter((a) => a.severidade === 'CRITICO').length;
  return (
    <button
      className={`pill ${criticas > 0 ? 'p-verm' : 'p-ambar'}`}
      style={{ border: 'none', cursor: 'pointer', font: 'inherit', fontWeight: 600 }}
      title={alertas.map((a) => a.titulo).join(' · ')}
      onClick={() => navegar('/')}
    >{alertas.length} decisõe(s) pendente(s)</button>
  );
}

function Campo({ k, v }: { k: string; v: string }): ReactNode {
  return <div className="campo" style={{ margin: 0 }}><label>{k}</label><div style={{ fontWeight: 600, fontSize: 13.5 }}>{v}</div></div>;
}

/** Separador de secção dentro de um separador, para o olho não confundir blocos. */
function LinhaSeccao({ rotulo }: { rotulo: string }): ReactNode {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '20px 0 12px', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', color: 'var(--texto-fraco)', fontWeight: 700 }}>
      {rotulo}<span style={{ flex: 1, height: 1, background: 'var(--linha)' }} />
    </div>
  );
}

/**
 * Repartição plurianual da portaria de extensão de encargos: quanto está coberto
 * em cada ano económico. É o que a reprogramação atualiza quando se registam
 * trabalhos complementares com reprogramação financeira.
 */
function Portaria({ contrato }: { contrato: Contrato }): ReactNode {
  const p = contrato.portariaExtensaoEncargos;
  if (p === undefined) return null;
  const total = p.reparticaoAnual.reduce((s, r) => s + r.montante, 0);
  return (
    <div className="cartao" style={{ marginBottom: 16 }}><h3>Portaria de extensão de encargos {p.numero}<span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>de {p.data}</span></h3><table>
      <thead><tr><th>Ano económico</th><th className="num">Montante repartido</th></tr></thead>
      <tbody>
        {p.reparticaoAnual.map((r) => (
          <tr key={r.ano}><td className="tabnum">{r.ano}</td><td className="num">{formatarMoeda(r.montante)}</td></tr>
        ))}
        <tr><td className="prim">Total coberto</td><td className="num prim">{formatarMoeda(total)}</td></tr>
      </tbody>
    </table></div>
  );
}

/**
 * REPROGRAMAÇÃO DA PORTARIA no registo de trabalhos complementares.
 *
 * O acréscimo de despesa só tem cobertura depois de a portaria o repartir pelos
 * anos económicos em que vai ser executado. A portaria tem de estar previamente
 * carregada — a aplicação reprograma a repartição, não emite portarias —, e o
 * cálculo é mostrado antes de gravar, para o gestor conferir o que vai pedir.
 */
function Reprogramacao({ contrato, acrescimo, dataEfeito, novaData, selecionada, onSelecionar }: {
  contrato: Contrato; acrescimo: number; dataEfeito: string; novaData: string;
  selecionada: string; onSelecionar: (numero: string) => void;
}): ReactNode {
  const portaria = contrato.portariaExtensaoEncargos;

  if (portaria === undefined) {
    return (
      <div className="erro-cx" style={{ marginBottom: 10 }}>
        Este contrato não tem portaria de extensão de encargos carregada. A reprogramação atualiza a repartição
        plurianual de uma portaria existente: carregue-a primeiro na ficha do contrato, ou desmarque a reprogramação
        financeira.
      </div>
    );
  }

  const anoInicio = Number(dataEfeito.slice(0, 4));
  const anoFim = Math.max(anoInicio, Number((novaData !== '' ? novaData : contrato.dataTerminoContratual).slice(0, 4)));
  const nova = reprogramarPortaria(portaria, acrescimo, anoInicio, anoFim);
  const antes = new Map(portaria.reparticaoAnual.map((r) => [r.ano, r.montante]));

  return (
    <div style={{ border: '1px solid var(--linha-forte)', borderRadius: 9, padding: 12, margin: '2px 0 10px' }}>
      <div className="campo"><label>Portaria de extensão de encargos a reprogramar</label>
        <select value={selecionada} onChange={(e) => onSelecionar(e.target.value)}>
          <option value="">— selecionar —</option>
          <option value={portaria.numero}>{portaria.numero} · de {portaria.data}</option>
        </select>
      </div>
      <div className="sec" style={{ marginBottom: 8 }}>
        O acréscimo de <b>{formatarMoeda(acrescimo)}</b> é repartido de {anoInicio} a {anoFim}, na proporção do que já
        está repartido nesses anos. Repartição resultante:
      </div>
      <table>
        <thead><tr><th>Ano</th><th className="num">Antes</th><th className="num">Acréscimo</th><th className="num">Depois</th></tr></thead>
        <tbody>
          {nova.reparticaoAnual.map((r) => {
            const anterior = antes.get(r.ano) ?? 0;
            const delta = r.montante - anterior;
            return (
              <tr key={r.ano}>
                <td className="tabnum">{r.ano}</td>
                <td className="num">{formatarMoeda(anterior)}</td>
                <td className="num" style={{ color: delta > 0 ? 'var(--verde)' : undefined }}>{delta > 0 ? `+${formatarMoeda(delta)}` : '—'}</td>
                <td className="num prim">{formatarMoeda(r.montante)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="aviso" style={{ margin: '10px 0 0' }}>
        A repartição é gravada no contrato ao registar a modificação. A portaria em si continua a carecer de emissão e
        autorização pelos membros do Governo competentes — a aplicação regista a reprogramação, não a autoriza.
      </div>
    </div>
  );
}

const ROT_OP_AFETACAO: Record<string, string> = {
  CRIAR: 'Afetação criada', SUBSTITUIR: 'Substituição de recurso', ATIVAR: 'Reativação', INATIVAR: 'Inativação',
};

/**
 * Histórico das afetações do contrato — substituições, inativações e
 * reativações. A tabela de afetações mostra o estado de agora; quem responde
 * por um contrato precisa também de saber quem esteve afeto e quando saiu.
 */
function HistoricoAfetacoes({ eventos, afetacoes, perfis }: {
  eventos: EventoAuditoria[]; afetacoes: Afetacao[]; perfis: PerfilContratual[];
}): ReactNode {
  const nomePerfil = (id: string): string => perfis.find((p) => p.id === id)?.nome ?? id;

  /** Descreve o movimento a partir do antes/depois guardados na auditoria. */
  function detalhe(e: { operacao: string; antes?: unknown; depois?: unknown }): string {
    const antes = e.antes as Afetacao | undefined;
    const depois = e.depois as Afetacao | undefined;
    if (e.operacao === 'SUBSTITUIR' && antes !== undefined && depois !== undefined) {
      return `${nomeAzure(antes.recursoId)} → ${nomeAzure(depois.recursoId)}`;
    }
    const alvo = depois ?? antes;
    return alvo !== undefined ? nomeAzure(alvo.recursoId) : '—';
  }

  return (
    <div className="cartao" style={{ marginTop: 16 }}><h3>Histórico de afetações · substituições e inativações</h3><table>
      <thead><tr><th>Quando</th><th>Movimento</th><th>Recurso</th><th>Perfil</th><th>Autor</th></tr></thead>
      <tbody>
        {eventos.map((e) => {
          const af = afetacoes.find((a) => a.id === e.entidadeId);
          return (
            <tr key={e.id}>
              <td className="tabnum">{e.ocorridoEm.replace('T', ' ').slice(0, 16)}</td>
              <td>{ROT_OP_AFETACAO[e.operacao] ?? e.operacao}</td>
              <td className="sec">{detalhe(e)}</td>
              <td className="sec">{af !== undefined ? nomePerfil(af.perfilId) : '—'}</td>
              <td>{nomeAzure(e.utilizadorId)}</td>
            </tr>
          );
        })}
        {eventos.length === 0 && <tr><td colSpan={5} className="vazio">Sem substituições nem inativações registadas.</td></tr>}
      </tbody>
    </table></div>
  );
}

type FamiliaMod = 'Modificações objetivas' | 'Modificações subjetivas' | 'Vicissitudes da execução' | 'Gestão orçamental plurianual';
interface DescritorMod {
  v: TipoAlteracao; r: string; familia: FamiliaMod; base: string;
  valor?: boolean; vigencia?: boolean; susp?: boolean; cessao?: boolean; transicao?: boolean;
  /** Admite reprogramação dos encargos plurianuais (portaria de extensão). */
  reprogramavel?: boolean;
  dataEfeitos?: boolean; // pede "Data de produção de efeitos" ao utilizador (senão é derivada)
}

/**
 * Tipos de modificação contratual, agrupados pelas famílias previstas no CCP.
 * `vigencia` marca os tipos que fixam uma NOVA data de vigência do contrato
 * (obrigatória); nesses, não se pede data de produção de efeitos.
 */
const TIPOS_ALT: DescritorMod[] = [
  { v: 'SERVICOS_COMPLEMENTARES', r: 'Trabalhos/serviços complementares', familia: 'Modificações objetivas', base: 'CCP, art. 370.º/454.º', valor: true, vigencia: true, reprogramavel: true },
  { v: 'PRORROGACAO', r: 'Prorrogação do prazo de vigência', familia: 'Modificações objetivas', base: 'CCP, art. 311.º e 440.º/48.º', vigencia: true },
  { v: 'REFORCO_BOLSA_VALOR', r: 'Reforço de bolsa de valor', familia: 'Modificações objetivas', base: 'CCP, art. 370.º', valor: true, dataEfeitos: true },
  { v: 'CESSAO_POSICAO_CONTRATUAL', r: 'Cessão da posição contratual', familia: 'Modificações subjetivas', base: 'CCP, art. 316.º e ss.', cessao: true, dataEfeitos: true },
  { v: 'SUSPENSAO', r: 'Suspensão da execução', familia: 'Vicissitudes da execução', base: 'CCP, art. 297.º-298.º', susp: true },
  { v: 'TRANSICAO_ANO_ECONOMICO', r: 'Transição para o ano económico seguinte', familia: 'Gestão orçamental plurianual', base: 'LCPA / DL 127/2012', transicao: true },
];
const FAMILIAS_MOD: FamiliaMod[] = ['Modificações objetivas', 'Modificações subjetivas', 'Vicissitudes da execução', 'Gestão orçamental plurianual'];
function rotularTipoAlt(t: TipoAlteracao): string { return TIPOS_ALT.find((x) => x.v === t)?.r ?? t.replace(/_/g, ' ').toLowerCase(); }
function familiaModificacao(t: TipoAlteracao): string { return TIPOS_ALT.find((x) => x.v === t)?.familia ?? '—'; }
function detalheModificacao(a: Alteracao): string {
  if (a.novaDataTermino !== undefined) return `nova vigência até ${a.novaDataTermino}${a.reprogramacaoFinanceira === true ? ` · com reprogramação financeira${a.portariaReprogramada !== undefined ? ` da portaria ${a.portariaReprogramada}` : ''}` : ''}`;
  if (a.tipo === 'SUSPENSAO' && a.suspensao !== undefined) return `${a.suspensao.dataInicio}${a.suspensao.dataFim !== undefined ? ` a ${a.suspensao.dataFim}` : ' (em aberto)'}${a.suspensao.suspendePrazoExecucao ? ' · desloca execução' : ''}`;
  if (a.tipo === 'CESSAO_POSICAO_CONTRATUAL' && a.novoPrestador !== undefined) return `novo prestador: ${a.novoPrestador.nome} (${a.novoPrestador.nipc})`;
  if (a.tipo === 'TRANSICAO_ANO_ECONOMICO') return 'transição de saldo para o ano seguinte';
  return '—';
}

const ALT_INICIAL = {
  tipo: 'SERVICOS_COMPLEMENTARES' as TipoAlteracao, dataEfeitos: hoje(), fundamentacao: '', valor: '',
  novaData: '', reprog: false, suspInicio: hoje(), suspFim: '', suspExecucao: true, excecao: '',
  novoNome: '', novoNipc: '', montante: '', executavelAte: '', portaria: '',
};

/** Registo de modificações contratuais formais, alinhado com os tipos do CCP. */
function GestaoAlteracoes({ contrato, resumo, alteracoes, tipoInicial, onMudou, onErro }: { contrato: Contrato; resumo: ResumoExec; alteracoes: Alteracao[]; tipoInicial?: string; onMudou: () => void; onErro: (m?: string) => void }): ReactNode {
  const tipoPedido = TIPOS_ALT.find((x) => x.v === tipoInicial)?.v;
  const [a, setA] = useState({ ...ALT_INICIAL, tipo: tipoPedido ?? ALT_INICIAL.tipo, dataEfeitos: hoje() });
  // Chegar de outra decisão com um tipo diferente no URL repõe a seleção.
  useEffect(() => {
    if (tipoPedido !== undefined) setA((prev) => ({ ...prev, tipo: tipoPedido }));
  }, [tipoPedido]);
  const tipoSel = TIPOS_ALT.find((x) => x.v === a.tipo)!;
  const temPortaria = contrato.numeroPortariaExtensaoEncargos !== undefined || contrato.portariaExtensaoEncargos !== undefined;
  const limiteTransicao = Math.floor(contrato.precoContratualInicial * 0.5);
  // Vigência resultante da nova data, DESCONTADOS os períodos de suspensão.
  const mesesNovaVigencia = a.novaData !== '' ? vigenciaLiquidaMeses(contrato.dataInicioVigencia, a.novaData, alteracoes) : 0;
  const vigenciaExcede = tipoSel.vigencia === true && mesesNovaVigencia > LIMITE_VIGENCIA_MESES;

  function mudar(patch: Partial<typeof a>): void { setA((prev) => ({ ...prev, ...patch })); }
  function reset(): void { setA({ ...ALT_INICIAL, dataEfeitos: hoje() }); }

  /** Data de produção de efeitos: escolhida pelo utilizador ou derivada do tipo. */
  function dataEfeito(): string {
    if (tipoSel.vigencia) return hoje();
    if (tipoSel.susp) return a.suspInicio;
    return a.dataEfeitos;
  }

  async function registar(): Promise<void> {
    onErro();
    try {
      if (tipoSel.transicao) {
        if (eurosParaCent(a.montante) <= 0 || a.executavelAte === '' || a.fundamentacao.trim() === '') { onErro('Indique montante (€ > 0), data limite de execução e fundamentação.'); return; }
        await app.contratos.transitarAnoEconomico(contrato.id, eurosParaCent(a.montante), a.executavelAte, a.fundamentacao, app.utilizador());
        reset(); onMudou(); return;
      }
      if (a.fundamentacao.trim() === '') { onErro('Indique a fundamentação da modificação.'); return; }
      if (tipoSel.valor && eurosParaCent(a.valor) <= 0) { onErro('Indique o valor acrescido (€ > 0).'); return; }
      if (tipoSel.vigencia && a.novaData === '') { onErro('Indique a nova data de vigência do contrato.'); return; }
      if (vigenciaExcede && a.excecao.trim() === '') { onErro('A nova vigência excede 36 meses: indique a fundamentação da exceção (RN-202).'); return; }
      // A reprogramação atualiza a repartição plurianual de uma portaria que tem
      // de existir no contrato: sem ela, o acréscimo fica sem cobertura.
      if (a.reprog && tipoSel.reprogramavel === true) {
        if (contrato.portariaExtensaoEncargos === undefined) { onErro('O contrato não tem portaria de extensão de encargos carregada. Carregue-a na ficha do contrato ou desmarque a reprogramação financeira.'); return; }
        if (a.portaria === '') { onErro('Indique a portaria de extensão de encargos a reprogramar.'); return; }
      }
      if (tipoSel.susp && a.suspInicio === '') { onErro('Indique a data de início da suspensão.'); return; }
      if (tipoSel.cessao && (a.novoNome.trim() === '' || a.novoNipc.trim() === '')) { onErro('Indique o novo prestador (nome e NIPC).'); return; }
      if (tipoSel.dataEfeitos && a.dataEfeitos === '') { onErro('Indique a data de produção de efeitos.'); return; }
      await app.estrutura.registarAlteracao(contrato.id, {
        tipo: a.tipo, dataEfeito: dataEfeito(), descricao: tipoSel.r, fundamentacao: a.fundamentacao,
        ...(tipoSel.valor ? { valorAcrescido: eurosParaCent(a.valor) } : {}),
        ...(tipoSel.vigencia ? { novaDataTermino: a.novaData, reprogramacaoFinanceira: a.reprog } : {}),
        ...(a.reprog && tipoSel.reprogramavel === true && a.portaria !== '' ? { portariaReprogramada: a.portaria } : {}),
        ...(tipoSel.susp ? { suspensao: { dataInicio: a.suspInicio, ...(a.suspFim !== '' ? { dataFim: a.suspFim } : {}), suspendePrazoExecucao: a.suspExecucao } } : {}),
        ...(tipoSel.cessao ? { novoPrestador: { nome: a.novoNome.trim(), nipc: a.novoNipc.trim() } } : {}),
        ...(a.excecao.trim() !== '' ? { excecaoVigencia: a.excecao } : {}),
      }, app.utilizador());
      reset(); onMudou();
    } catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div className="cartao" style={{ marginBottom: 16 }}><h3>Nova modificação contratual</h3><div className="corpo">
      <div className="g2">
        <div className="campo"><label>Tipo de modificação</label>
          <select value={a.tipo} onChange={(e) => mudar({ tipo: e.target.value as TipoAlteracao })}>
            {FAMILIAS_MOD.map((fam) => (
              <optgroup key={fam} label={fam}>
                {TIPOS_ALT.filter((x) => x.familia === fam).map((x) => <option key={x.v} value={x.v}>{x.r}</option>)}
              </optgroup>
            ))}
          </select>
        </div>
        {tipoSel.dataEfeitos && <div className="campo"><label>Data de produção de efeitos</label><input type="date" value={a.dataEfeitos} onChange={(e) => mudar({ dataEfeitos: e.target.value })} /></div>}
      </div>
      <div className="sec" style={{ marginTop: -4, marginBottom: 8 }}>Base legal: {tipoSel.base}</div>

      {tipoSel.valor && <div className="campo"><label>Valor acrescido (€)</label><input type="number" inputMode="decimal" min={0} step="0.01" value={a.valor} onChange={(e) => mudar({ valor: e.target.value })} placeholder="ex.: 42000,00" /></div>}

      {tipoSel.vigencia && (
        <>
          <div className="g2">
            <div className="campo"><label>Nova data de vigência</label><input type="date" value={a.novaData} onChange={(e) => mudar({ novaData: e.target.value })} /></div>
            <div className="campo"><label>Vigência resultante (líquida)</label><div style={{ marginTop: 2, fontWeight: 600 }}>{a.novaData !== '' ? `${mesesNovaVigencia.toFixed(1)} meses` : '—'}</div></div>
          </div>
          <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0 8px' }}><input type="checkbox" checked={a.reprog} onChange={(e) => mudar({ reprog: e.target.checked })} /> Houve reprogramação financeira dos encargos plurianuais</label>
          {a.reprog && tipoSel.reprogramavel === true && (
            <Reprogramacao contrato={contrato} acrescimo={eurosParaCent(a.valor)} dataEfeito={dataEfeito()} novaData={a.novaData} selecionada={a.portaria} onSelecionar={(numero) => mudar({ portaria: numero })} />
          )}
        </>
      )}

      {tipoSel.susp && (
        <>
          <div className="g2">
            <div className="campo"><label>Início da suspensão</label><input type="date" value={a.suspInicio} onChange={(e) => mudar({ suspInicio: e.target.value })} /></div>
            <div className="campo"><label>Fim (opcional)</label><input type="date" value={a.suspFim} onChange={(e) => mudar({ suspFim: e.target.value })} /></div>
          </div>
          <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '2px 0 8px' }}><input type="checkbox" checked={a.suspExecucao} onChange={(e) => mudar({ suspExecucao: e.target.checked })} /> A suspensão desloca o prazo de execução</label>
        </>
      )}

      {tipoSel.cessao && (
        <div className="g2">
          <div className="campo"><label>Novo prestador (nome)</label><input value={a.novoNome} onChange={(e) => mudar({ novoNome: e.target.value })} placeholder="ex.: Nova Prestadora, Lda." /></div>
          <div className="campo"><label>NIPC do novo prestador</label><input value={a.novoNipc} onChange={(e) => mudar({ novoNipc: e.target.value })} placeholder="ex.: 500000002" /></div>
        </div>
      )}


      {tipoSel.transicao ? (
        temPortaria ? (
          <div className="sec">O contrato tem portaria de extensão de encargos: a execução plurianual segue essa autorização (não há transição). Se a vigência ultrapassar o ano coberto, peça a reprogramação da portaria.</div>
        ) : (
          <>
            <div className="aviso" style={{ marginBottom: 10 }}>Saldo por executar: <b>{formatarMoeda(resumo.valorDisponivel)}</b>. Limite transitável (agente CCP, até 50% do valor contratualizado): <b>{formatarMoeda(limiteTransicao)}</b>. O saldo transitado pode ser executado até à data indicada.</div>
            <div className="g2">
              <div className="campo"><label>Montante a transitar (€)</label><input type="number" min={0} step="0.01" value={a.montante} onChange={(e) => mudar({ montante: e.target.value })} /></div>
              <div className="campo"><label>Executável até</label><input type="date" value={a.executavelAte} onChange={(e) => mudar({ executavelAte: e.target.value })} /></div>
            </div>
            {contrato.transicaoAnoEconomico !== undefined && <div className="sec" style={{ marginBottom: 8 }}>Já registada: {formatarMoeda(contrato.transicaoAnoEconomico.montante)} até {contrato.transicaoAnoEconomico.execucaoTransitadaAte}.</div>}
          </>
        )
      ) : null}

      <div className="campo"><label>Fundamentação</label><textarea rows={2} value={a.fundamentacao} onChange={(e) => mudar({ fundamentacao: e.target.value })} /></div>
      {vigenciaExcede && (
        <div className="campo"><label>Fundamentação da exceção aos 36 meses (RN-202)</label><textarea rows={2} value={a.excecao} onChange={(e) => mudar({ excecao: e.target.value })} /></div>
      )}

      {tipoSel.valor && <div className="aviso" style={{ marginBottom: 10 }}>Os trabalhos/serviços complementares (modificação objetiva) atualizam o valor do contrato, até 50% do preço inicial <code>RN-301</code>.</div>}
      {tipoSel.vigencia && <div className="aviso" style={{ marginBottom: 10 }}>Esta modificação fixa a <b>nova data de vigência</b> do contrato (obrigatória). A vigência é contada <b>descontando os períodos de suspensão</b> e não deve exceder 36 meses; acima disso exige exceção fundamentada <code>RN-202</code>.</div>}
      {tipoSel.susp && <div className="aviso" style={{ marginBottom: 10 }}>A suspensão que desloca a execução pode empurrar a vigência além dos 36 meses; nesse caso, aviso e exceção fundamentada <code>RN-204</code>. Períodos não se podem sobrepor <code>RN-205</code>.</div>}
      {tipoSel.cessao && <div className="aviso" style={{ marginBottom: 10 }}>A cessão da posição contratual substitui o prestador do contrato (modificação subjetiva). Confirme os requisitos de habilitação do cessionário.</div>}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="btn pri" onClick={() => void registar()}>{tipoSel.transicao ? 'Registar transição' : 'Registar modificação'}</button>
      </div>
    </div></div>
  );
}

/**
 * Eliminação definitiva do contrato. A auditoria é append-only (ADR-07): os
 * eventos de criação e de eliminação permanecem no registo mesmo depois de o
 * contrato desaparecer. Exige confirmação pelo número do contrato e motivo.
 */
function EliminarContrato({ contrato, onErro }: { contrato: Contrato; onErro: (m?: string) => void }): ReactNode {
  const navegar = useNavigate();
  const [confirmacao, setConfirmacao] = useState('');
  const [motivo, setMotivo] = useState('');
  const podeEliminar = confirmacao.trim() === contrato.numero && motivo.trim() !== '';

  async function eliminar(): Promise<void> {
    onErro();
    try {
      await app.contratos.eliminar(contrato.id, motivo, app.utilizador());
      navegar('/contratos');
    } catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div className="cartao" style={{ marginTop: 16, borderColor: 'var(--verm, #c0392b)' }}><h3>Eliminar contrato</h3><div className="corpo">
      <div className="aviso" style={{ marginBottom: 10 }}>
        A eliminação é <b>definitiva</b> e remove também perfis, modificações, afetações, registos de tempo,
        documentos, compromissos, faturas e alertas do contrato. Os eventos de <b>criação e eliminação ficam
        registados em Auditoria</b>.
      </div>
      <div className="g2">
        <div className="campo"><label>Escreva o número do contrato para confirmar</label><input value={confirmacao} onChange={(e) => setConfirmacao(e.target.value)} placeholder={contrato.numero} /></div>
        <div className="campo"><label>Motivo da eliminação</label><input value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="ex.: registo criado por engano" /></div>
      </div>
      <button className="btn perigo" disabled={!podeEliminar} onClick={() => void eliminar()}>Eliminar contrato definitivamente</button>
    </div></div>
  );
}

/**
 * Gestão de afetações do contrato (movida do antigo menu Afetações para o
 * separador do detalhe). Afetar recurso a um perfil, substituir e ativar/inativar.
 */
function GestaoAfetacoes({ contrato, perfis, afetacoes, podeGerir, onMudou, onErro }: { contrato: Contrato; perfis: PerfilContratual[]; afetacoes: Afetacao[]; podeGerir: boolean; onMudou: () => void; onErro: (m?: string) => void }): ReactNode {
  const [form, setForm] = useState({ perfilId: '', recursoId: '' });

  async function garantirRecurso(recursoId: string): Promise<void> {
    if ((await app.ctx.repos.recursos.obter(recursoId)) === null) {
      await app.recursos.criar(recursoId, contrato.prestador.nipc || '000000000', app.utilizador());
    }
  }
  async function criar(): Promise<void> {
    onErro();
    try {
      await garantirRecurso(form.recursoId);
      await app.afetacoes.criar({ contratoId: contrato.id, perfilId: form.perfilId, recursoId: form.recursoId }, app.utilizador());
      setForm({ perfilId: '', recursoId: '' });
      onMudou();
    } catch (e) { onErro(mensagemErro(e)); }
  }
  async function substituir(id: string): Promise<void> {
    const novo = prompt('Substituir por (utilizador Azure — oid), mesma entidade executante:');
    if (novo === null || novo.trim() === '') return;
    onErro();
    try { await garantirRecurso(novo.trim()); await app.afetacoes.substituir(id, novo.trim(), app.utilizador()); onMudou(); }
    catch (e) { onErro(mensagemErro(e)); }
  }
  async function alternar(id: string, ativa: boolean): Promise<void> {
    onErro();
    try { await app.afetacoes.definirAtiva(id, !ativa, app.utilizador()); onMudou(); }
    catch (e) { onErro(mensagemErro(e)); }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: podeGerir ? '1fr 340px' : '1fr', gap: 16 }}>
      <div className="cartao"><h3>Afetações do contrato · {afetacoes.filter((a) => a.ativa).length} ativas</h3><table>
        <thead><tr><th>Recurso</th><th>Perfil</th><th>Estado</th>{podeGerir && <th></th>}</tr></thead>
        <tbody>{afetacoes.map((a) => (
          <tr key={a.id}>
            <td className="prim">{nomeAzure(a.recursoId)}<div className="sec">{prestadorAzure(a.recursoId) ?? ''}</div></td>
            <td>{perfis.find((p) => p.id === a.perfilId)?.nome ?? a.perfilId}</td>
            <td><Estado v={a.ativa ? 'Ativa' : 'Inativa'} /></td>
            {podeGerir && <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => void alternar(a.id, a.ativa)}>{a.ativa ? 'Inativar' : 'Ativar'}</button> <button className="btn sm" onClick={() => void substituir(a.id)}>Substituir</button></td>}
          </tr>
        ))}{afetacoes.length === 0 && <tr><td colSpan={podeGerir ? 4 : 3} className="vazio">Sem afetações.</td></tr>}</tbody>
      </table></div>
      {podeGerir && (
        <div className="cartao"><h3>Nova afetação</h3><div className="corpo">
          <div className="campo"><label>Perfil (do contrato)</label><select value={form.perfilId} onChange={(e) => setForm({ ...form, perfilId: e.target.value })}><option value="">— selecionar —</option>{perfis.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}</select></div>
          <div className="campo"><label>Recurso (utilizador Azure)</label><select value={form.recursoId} onChange={(e) => setForm({ ...form, recursoId: e.target.value })}><option value="">— selecionar —</option>{RECURSOS_AZURE.map((r) => <option key={r.id} value={r.id}>{r.nome} · {r.prestador}</option>)}</select></div>
          <div className="aviso" style={{ marginBottom: 12 }}>A afetação mantém-se até indicação manual de inativação ou substituição.</div>
          <button className="btn pri" style={{ width: '100%', justifyContent: 'center' }} disabled={form.perfilId === '' || form.recursoId === '' || perfis.length === 0} onClick={() => void criar()}>Criar afetação</button>
          {perfis.length === 0 && <div className="sec" style={{ marginTop: 8 }}>Este contrato ainda não tem perfis. Defina perfis no separador Estrutura.</div>}
        </div></div>
      )}
    </div>
  );
}

/**
 * Dashboard de capacidade (só bolsa de horas). A partir das horas contratadas por
 * perfil, das horas já consumidas e dos dias úteis que faltam até ao término,
 * estima a afetação-alvo (pessoas a tempo inteiro, 8 h/dia × 5 dias/semana) e
 * quantas pessoas ainda faltam afetar face a esse alvo. É um alvo teórico: não
 * desconta feriados, férias, faltas nem ramp-up.
 */
function Capacidade({ contrato, perfis, afetacoes, aprovados }: { contrato: Contrato; perfis: PerfilContratual[]; afetacoes: Afetacao[]; aprovados: RegistoTempo[] }): ReactNode {
  const hojeStr = hoje();
  const { dias, capacidadePessoaH, linhas, totalFalta, algumInfinito } = calcularCapacidade(contrato.dataTerminoContratual, hojeStr, perfis, afetacoes, aprovados);

  return (
    <>
      <div className="grelha-kpi">
        <div className="kpi"><div className="rot">Data de referência</div><div className="val" style={{ fontSize: 18 }}>{hojeStr}</div><div className="sub">momento da visualização</div></div>
        <div className="kpi"><div className="rot">Dias úteis até ao término</div><div className="val">{dias}</div><div className="sub">seg–sex até {contrato.dataTerminoContratual}</div></div>
        <div className="kpi"><div className="rot">Capacidade por pessoa</div><div className="val">{formatarHoras(capacidadePessoaH * 60)}</div><div className="sub">8 h/dia no período restante</div></div>
        <div className="kpi"><div className="rot">Pessoas em falta (total)</div><div className="val" style={{ color: totalFalta > 0 ? 'var(--ambar)' : 'var(--verde)' }}>{algumInfinito ? '—' : totalFalta}</div><div className="sub">{totalFalta > 0 ? 'abaixo do alvo' : 'afetação suficiente'}</div></div>
      </div>
      {dias <= 0 && <div className="aviso" style={{ marginBottom: 16 }}>Não há dias úteis até ao término (prazo esgotado ou término no passado): a afetação-alvo não é calculável.</div>}
      <div className="cartao"><h3>Afetação-alvo por perfil</h3><table>
        <thead><tr><th>Perfil</th><th className="num">Horas restantes</th><th className="num">Afetação-alvo (FTE)</th><th className="num">Pessoas afetas</th><th className="num">Pessoas em falta</th></tr></thead>
        <tbody>{linhas.map((l) => (
          <tr key={l.perfilId}>
            <td className="prim">{l.nome}</td>
            <td className="num">{formatarHoras(l.restantesH * 60)}</td>
            <td className="num">{Number.isFinite(l.alvo) ? `${l.alvo.toFixed(2)} → ${l.alvoTeto}` : '—'}</td>
            <td className="num">{l.afetas}</td>
            <td className="num" style={{ color: Number.isFinite(l.emFalta) && l.emFalta > 0 ? 'var(--ambar)' : undefined, fontWeight: 600 }}>{Number.isFinite(l.emFalta) ? l.emFalta : '—'}</td>
          </tr>
        ))}{linhas.length === 0 && <tr><td colSpan={5} className="vazio">Sem perfis.</td></tr>}</tbody>
      </table>
      <div className="aviso" style={{ margin: 12 }}>Afetação-alvo = horas restantes ÷ (8 h × dias úteis até ao término). Assume 8 h/dia, 5 dias/semana; alvo teórico, sem feriados/férias.</div>
      </div>
    </>
  );
}

interface ResumoExec {
  valorInicialContrato: number; valorAtualContrato: number; valorExecutado: number; valorDisponivel: number;
  complementares: { percentagem: number; atingido: boolean; disponivel: number };
  saldosPerfis: Array<{ perfilId: string; nome: string; minutosPrevistos: number; minutosConsumidos: number; minutosRestantes: number; valorPrevisto: number; valorRestante: number }>;
}
