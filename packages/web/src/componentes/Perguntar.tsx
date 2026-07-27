import { useRef, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import { ServicoAssistente, AgenteLocal, encaminhar, type Interpretacao } from '@chora/api/nucleo';
import type { Contrato, Proveniencia } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { hoje, mensagemErro } from '../comum.js';
import { Faturacao } from '../telas/Faturacao.js';
import { lerDocumento, ROT_TIPO_DOC, type DocumentoLido } from '../assistente/documentos.js';
import { configModelo } from '../assistente/config-modelo.js';

const ROT_PROV: Record<Proveniencia, string> = { REGRA: 'Regra', PROJECAO: 'Projeção', MODELO: 'Modelo' };
const COR_PROV: Record<Proveniencia, string> = { REGRA: 'p-azul', PROJECAO: 'p-ard', MODELO: 'p-ambar' };

/** Uma entrada da conversa. */
interface Turno {
  id: number;
  pergunta: string;
  documentos?: DocumentoLido[];
  resposta?: Interpretacao;
  erro?: string;
  /** A ação já foi confirmada e executada neste turno. */
  executado?: { texto: string };
  aPensar?: boolean;
}

/**
 * PERGUNTAR — a camada que dissolve os menus, agora com capacidade de agir.
 *
 * A inteligência está na arquitetura, não no modelo: a frase é encaminhada para
 * uma capacidade de uma lista fechada, os parâmetros são validados por esquema,
 * e a execução passa pelos mesmos serviços que os botões dos ecrãs — com as
 * mesmas regras. Um modelo local pode ajudar a encaminhar quando os padrões não
 * chegam, mas nunca calcula, nunca decide e nunca executa.
 *
 * As CONSULTAS respondem já. As AÇÕES mostram primeiro o que vai acontecer, com
 * as regras avaliadas em seco, e só executam depois de confirmadas.
 */
export function Perguntar({ contratos }: { contratos: Contrato[] }): ReactNode {
  const [q, setQ] = useState('');
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [aPensar, setAPensar] = useState(false);
  const refFicheiro = useRef<HTMLInputElement | null>(null);
  const proximo = useRef(1);

  const servico = new ServicoAssistente(app.ctx);
  const sugestoes = servico.sugestoes(app.papeisAtuais()).slice(0, 4);

  function novoTurno(t: Omit<Turno, 'id'>): number {
    const id = proximo.current++;
    setTurnos((ts) => [...ts, { ...t, id }]);
    return id;
  }
  function atualizar(id: number, patch: Partial<Turno>): void {
    setTurnos((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  }

  /**
   * Encaminha a frase. Os padrões primeiro — determinísticos, instantâneos e
   * sempre disponíveis. O modelo local só entra quando eles não chegam, e o que
   * devolve é revalidado pelo serviço como qualquer outro encaminhamento.
   */
  async function resolverEncaminhamento(frase: string): Promise<Parameters<ServicoAssistente['interpretar']>[2]> {
    const det = encaminhar(frase);
    if (det !== undefined) return det;
    const cfg = configModelo();
    if (!cfg.ativo) return undefined;
    return new AgenteLocal(cfg).encaminhar(frase, servico.capacidades());
  }

  async function perguntar(texto: string): Promise<void> {
    if (texto.trim() === '' || aPensar) return;
    setQ(''); setAPensar(true);
    const id = novoTurno({ pergunta: texto, aPensar: true });
    try {
      const e = await resolverEncaminhamento(texto);
      const resposta = await servico.interpretar(texto, app.utilizador(), e);
      atualizar(id, { resposta, aPensar: false });
    } catch (err) {
      atualizar(id, { erro: mensagemErro(err), aPensar: false });
    } finally { setAPensar(false); }
  }

  /** Documentos largados na conversa: lê, classifica e propõe o que fazer. */
  async function receberFicheiros(files: FileList | null): Promise<void> {
    if (files === null || files.length === 0) return;
    setAPensar(true);
    const id = novoTurno({ pergunta: `${files.length} documento(s) carregado(s)`, aPensar: true });
    try {
      const lidos: DocumentoLido[] = [];
      for (const f of Array.from(files)) lidos.push(await lerDocumento(f));
      const fatura = lidos.find((d) => d.tipo === 'FATURA' || d.tipo === 'NOTA_CREDITO');
      if (fatura === undefined) {
        atualizar(id, {
          documentos: lidos, aPensar: false,
          resposta: { mensagem: 'Li os documentos mas não encontrei nenhuma fatura. Carregue a fatura para eu abrir a conferência.' },
        });
        return;
      }
      const campo = (nome: string): string | undefined => fatura.campos.find((c) => c.campo === nome)?.valor;
      const resposta = await servico.interpretar('registar fatura a partir dos documentos', app.utilizador(), {
        capacidade: 'fatura.registar',
        parametros: {
          ...(campo('numeroContrato') !== undefined ? { contratoNumero: campo('numeroContrato') } : {}),
          ...(campo('numero') !== undefined ? { numeroFatura: campo('numero') } : {}),
          ...(campo('nifPrestador') !== undefined ? { nifPrestador: campo('nifPrestador') } : {}),
          ...(campo('montanteSemIva') !== undefined ? { montanteSemIvaEuros: Number(campo('montanteSemIva')) } : {}),
        },
        confianca: 0.9, origem: 'PADRAO',
      });
      atualizar(id, { documentos: lidos, resposta, aPensar: false });
    } catch (err) {
      atualizar(id, { erro: mensagemErro(err), aPensar: false });
    } finally { setAPensar(false); }
  }

  async function confirmar(turno: Turno): Promise<void> {
    const r = turno.resposta;
    if (r?.capacidade === undefined || r.parametros === undefined) return;
    setAPensar(true);
    try {
      const resultado = await servico.executar(r.capacidade.nome, r.parametros, turno.pergunta, app.utilizador());
      atualizar(turno.id, { executado: { texto: resultado.texto } });
    } catch (err) {
      atualizar(turno.id, { erro: mensagemErro(err) });
    } finally { setAPensar(false); }
  }

  return (
    <div>
      {turnos.length > 0 && (
        <div style={{ maxHeight: '55vh', overflowY: 'auto', marginBottom: 12, display: 'grid', gap: 10 }}>
          {turnos.map((t) => <TurnoConversa key={t.id} turno={t} onConfirmar={() => void confirmar(t)} onLimpar={() => setTurnos((ts) => ts.filter((x) => x.id !== t.id))} />)}
        </div>
      )}

      <div style={{ display: 'flex', gap: 9, alignItems: 'center', background: 'var(--superficie)', border: '1px solid var(--linha-forte)', borderRadius: 9, padding: '8px 12px', boxShadow: 'var(--sombra)' }}>
        <span style={{ fontSize: 15, color: 'var(--marca)' }} aria-hidden="true">⌕</span>
        <input
          aria-label="Perguntar ou pedir uma ação sobre os contratos"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void perguntar(q); }}
          placeholder="Pergunte ou peça — ex.: onde posso colocar mais um arquiteto?"
          style={{ flex: 1, border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}
        />
        <button className="btn sm" title="Carregar documentos" onClick={() => refFicheiro.current?.click()}>📎</button>
        <button className="btn sm pri" disabled={aPensar || q.trim() === ''} onClick={() => void perguntar(q)}>{aPensar ? 'A pensar…' : 'Perguntar'}</button>
        <input
          ref={refFicheiro} type="file" accept="application/pdf" multiple style={{ display: 'none' }}
          onChange={(e) => { void receberFicheiros(e.target.files); e.target.value = ''; }}
        />
      </div>

      {turnos.length === 0 && (
        <div style={{ display: 'flex', gap: 7, marginTop: 10, flexWrap: 'wrap' }}>
          {sugestoes.map((s) => (
            <button key={s} className="btn sm" style={{ fontWeight: 400 }} onClick={() => void perguntar(s)}>{s}</button>
          ))}
        </div>
      )}
      <div className="sec" style={{ marginTop: 8, fontSize: 11.5 }}>
        Só faço o que está em <b>Regras e alertas → Funções do assistente</b>. As alterações são sempre mostradas antes
        de serem executadas, e passam pelas mesmas regras dos ecrãs.
      </div>
    </div>
  );
}

function TurnoConversa({ turno, onConfirmar, onLimpar }: { turno: Turno; onConfirmar: () => void; onLimpar: () => void }): ReactNode {
  const r = turno.resposta;
  return (
    <div className="cartao" style={{ margin: 0 }}>
      <div className="corpo">
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span className="prim" style={{ fontSize: 13 }}>{turno.pergunta}</span>
          <button className="ligacao" style={{ marginLeft: 'auto' }} onClick={onLimpar}>remover</button>
        </div>

        {turno.aPensar === true && <div className="sec" style={{ marginTop: 8 }}>A ler…</div>}
        {turno.erro !== undefined && <div className="erro-cx" style={{ marginTop: 8 }}>⚠ {turno.erro}</div>}

        {turno.documentos !== undefined && <Documentos docs={turno.documentos} />}

        {r?.mensagem !== undefined && (
          <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6 }}>
            {r.mensagem}
            {(r.sugestoes?.length ?? 0) > 0 && (
              <div className="sec" style={{ marginTop: 6, fontSize: 12.5 }}>Experimente: {r.sugestoes!.map((s) => `«${s}»`).join(' · ')}</div>
            )}
          </div>
        )}

        {r?.resultado !== undefined && <Resultado resultado={r.resultado} origem={r.origem} />}
        {r?.simulacao !== undefined && turno.executado === undefined && (
          <Simulacao simulacao={r.simulacao} onConfirmar={onConfirmar} />
        )}
        {turno.executado !== undefined && (
          <div className="aviso" style={{ marginTop: 10, borderColor: 'var(--verde)' }}>✓ {turno.executado.texto}</div>
        )}
      </div>
    </div>
  );
}

function Documentos({ docs }: { docs: DocumentoLido[] }): ReactNode {
  return (
    <table style={{ marginTop: 8 }}>
      <tbody>
        {docs.map((d) => (
          <tr key={d.ficheiro}>
            <td className="prim">{d.ficheiro}
              {d.observacao !== undefined && <div className="sec">{d.observacao}</div>}
            </td>
            <td><span className={`pill ${d.tipo === 'DESCONHECIDO' ? 'p-ard' : 'p-azul'}`}>{ROT_TIPO_DOC[d.tipo]}</span></td>
            <td className="sec">{d.campos.map((c) => `${c.rotulo}: ${c.valor}`).join(' · ') || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Resultado({ resultado, origem }: { resultado: NonNullable<Interpretacao['resultado']>; origem?: string }): ReactNode {
  function exportar(): void {
    const e = resultado.exportavel;
    if (e === undefined) return;
    const wb = XLSX.utils.book_new();
    for (const folha of e.folhas) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(folha.linhas), folha.nome.slice(0, 31));
    XLSX.writeFile(wb, `${e.nome}-${hoje()}.xlsx`);
  }

  return (
    <>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{resultado.texto}</div>

      {resultado.tabela !== undefined && (
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table>
            <thead><tr>{resultado.tabela.colunas.map((c) => <th key={c} className={/valor|horas|pessoas|dias|contratado|executado|validado/i.test(c) ? 'num' : undefined}>{c}</th>)}</tr></thead>
            <tbody>
              {resultado.tabela.linhas.map((linha, i) => (
                <tr key={i}>{linha.map((c, j) => <td key={j} className={typeof c === 'number' ? 'num tabnum' : undefined}>{c}</td>)}</tr>
              ))}
              {resultado.tabela.linhas.length === 0 && <tr><td colSpan={resultado.tabela.colunas.length} className="vazio">Sem linhas.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {resultado.ui !== undefined && (
        <div style={{ marginTop: 12, border: '1px solid var(--marca)', borderRadius: 9, padding: 12, background: 'var(--fundo)' }}>
          <div className="sec" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 8 }}>{resultado.ui.titulo}</div>
          {resultado.ui.ecra === 'FATURACAO' && (
            <Faturacao
              embebido
              inicial={{
                numero: String(resultado.ui.props['numero'] ?? ''),
                numeroContrato: String(resultado.ui.props['numeroContrato'] ?? ''),
                nifPrestador: String(resultado.ui.props['nifPrestador'] ?? ''),
                montanteSemIva: String(resultado.ui.props['montanteSemIva'] ?? ''),
              }}
            />
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--linha)', alignItems: 'center' }}>
        {resultado.fontes?.map((f, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span className={`pill ${COR_PROV[f.proveniencia]}`}>{ROT_PROV[f.proveniencia]}</span>
            <span className="sec">{f.referencia}</span>
          </span>
        ))}
        {origem === 'MODELO' && <span className="pill p-ambar" title="A frase foi encaminhada por um modelo local; o cálculo não.">Encaminhado por modelo</span>}
        {resultado.exportavel !== undefined && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={exportar}>⬇ Excel</button>}
      </div>
    </>
  );
}

/**
 * A simulação de uma ação. Cada efeito sai de um cálculo e cada regra de uma
 * avaliação real — é isto que separa «isto implica tal e tal» de uma frase
 * inventada por um modelo.
 */
function Simulacao({ simulacao, onConfirmar }: { simulacao: NonNullable<Interpretacao['simulacao']>; onConfirmar: () => void }): ReactNode {
  return (
    <div style={{ marginTop: 10, border: `1px solid ${simulacao.bloqueada ? 'var(--vermelho)' : 'var(--marca)'}`, borderRadius: 9, padding: 13, background: 'var(--superficie)' }}>
      <div className="prim" style={{ fontSize: 13, marginBottom: 9 }}>{simulacao.titulo}</div>

      <div className="sec" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>O que acontece</div>
      <ul style={{ margin: '5px 0 12px', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7 }}>
        {simulacao.efeitos.map((e, i) => <li key={i}>{e}</li>)}
      </ul>

      <div className="sec" style={{ fontSize: 11.5, textTransform: 'uppercase', letterSpacing: '.03em' }}>Regras avaliadas</div>
      <ul style={{ margin: '5px 0 12px', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.7, listStyle: 'none' }}>
        {simulacao.regras.map((r) => (
          <li key={r.codigo} style={{ color: r.ok ? undefined : 'var(--vermelho)' }}>
            {r.ok ? '✓' : '✗'} <code>{r.codigo}</code> {r.ok ? r.descricao : (r.mensagem ?? r.descricao)}
          </li>
        ))}
      </ul>

      {simulacao.avisos.length > 0 && (
        <div className={simulacao.bloqueada ? 'erro-cx' : 'aviso'} style={{ marginBottom: 10 }}>
          {simulacao.avisos.map((a, i) => <div key={i}>{a}</div>)}
        </div>
      )}

      {simulacao.bloqueada
        ? <div className="sec" style={{ fontSize: 12.5 }}>A ação está bloqueada por regra: não é oferecida confirmação.</div>
        : <button className="btn sm pri" onClick={onConfirmar}>Confirmar</button>}
    </div>
  );
}
