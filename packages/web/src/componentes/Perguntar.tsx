import { useState, type ReactNode } from 'react';
import { responderPergunta, type Contrato, type Proveniencia, type RespostaPergunta } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { hoje, mensagemErro } from '../comum.js';

const ROT_PROV: Record<Proveniencia, string> = { REGRA: 'Regra', PROJECAO: 'Projeção', MODELO: 'Modelo' };
const COR_PROV: Record<Proveniencia, string> = { REGRA: 'p-azul', PROJECAO: 'p-ard', MODELO: 'p-ambar' };

/**
 * PERGUNTAR — a camada que dissolve os menus.
 *
 * Nada aqui é calculado por um modelo: a pergunta é encaminhada para as funções
 * determinísticas do domínio e a resposta é narrada com a PROVENIÊNCIA sempre
 * visível (regra, projeção ou modelo). O utilizador deixa de navegar para
 * descobrir um número e passa a perguntá-lo.
 */
export function Perguntar({ contratos }: { contratos: Contrato[] }): ReactNode {
  const [q, setQ] = useState('');
  const [resposta, setResposta] = useState<RespostaPergunta>();
  const [aPensar, setAPensar] = useState(false);
  const [erro, setErro] = useState<string>();

  const numeroExemplo = contratos[0]?.numero ?? 'C-2026-001';
  const sugestoes = [
    `Quanto posso ainda gastar em complementares no ${numeroExemplo}?`,
    `Qual o saldo por executar do ${numeroExemplo}?`,
    'O que tenho de decidir com urgência?',
  ];

  async function perguntar(texto: string): Promise<void> {
    if (texto.trim() === '') return;
    setQ(texto); setAPensar(true); setErro(undefined);
    try {
      const [perfis, alteracoes, aprovados, alertas] = await Promise.all([
        app.ctx.repos.perfis.todos(),
        app.ctx.repos.alteracoes.todos(),
        app.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
        app.ctx.repos.alertas.todos(),
      ]);
      setResposta(responderPergunta(texto, { contratos, perfis, alteracoes, aprovados, alertas, hoje: hoje() }));
    } catch (e) { setErro(mensagemErro(e)); }
    finally { setAPensar(false); }
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', gap: 9, alignItems: 'center', background: 'var(--superficie)', border: '1px solid var(--linha-forte)', borderRadius: 9, padding: '8px 12px', boxShadow: 'var(--sombra)' }}>
        <span style={{ fontSize: 15, color: 'var(--marca)' }} aria-hidden="true">⌕</span>
        <input
          aria-label="Perguntar sobre os contratos"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void perguntar(q); }}
          placeholder="Pergunte — ex.: quanto posso gastar em complementares no…?"
          style={{ flex: 1, border: 'none', background: 'transparent', padding: 0, fontSize: 13 }}
        />
        <button className="btn sm pri" disabled={aPensar || q.trim() === ''} onClick={() => void perguntar(q)}>{aPensar ? 'A responder…' : 'Perguntar'}</button>
      </div>

      {resposta === undefined && erro === undefined && (
        <div style={{ display: 'flex', gap: 7, marginTop: 8, flexWrap: 'wrap' }}>
          {sugestoes.map((s) => (
            <button key={s} className="btn sm" style={{ fontWeight: 400 }} onClick={() => void perguntar(s)}>{s}</button>
          ))}
        </div>
      )}

      {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}

      {resposta !== undefined && (
        <div className="cartao" style={{ marginTop: 12, marginBottom: 0 }}>
          <div className="corpo">
            <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{resposta.texto}</div>
            {resposta.fontes.length > 0 && (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12, paddingTop: 11, borderTop: '1px solid var(--linha)', alignItems: 'center' }}>
                {resposta.fontes.map((f, i) => (
                  <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span className={`pill ${COR_PROV[f.proveniencia]}`}>{ROT_PROV[f.proveniencia]}</span>
                    <span className="sec">{f.referencia}</span>
                  </span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button className="btn sm" onClick={() => { setResposta(undefined); setQ(''); }}>Nova pergunta</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
