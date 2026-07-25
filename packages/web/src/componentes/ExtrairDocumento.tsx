import { useState, type ReactNode } from 'react';
import { AgenteStub, type CampoExtraido, type ExtracaoDocumento, type TipoDocumentoExtraivel } from '@chora/domain';
import { mensagemErro } from '../comum.js';

const ROT_TIPO: Record<TipoDocumentoExtraivel, string> = {
  CONTRATO: 'Contrato assinado',
  PORTARIA: 'Portaria de extensão de encargos',
  FATURA: 'Fatura',
};

/**
 * EXTRAÇÃO DE DOCUMENTOS — onde a IA começa a valer.
 *
 * Hoje todos estes campos são escritos à mão a partir de um PDF, o que é a
 * maior fonte de erro e o maior custo de adoção. O agente lê e propõe; o gestor
 * confirma. **Nada é gravado sem confirmação humana** e cada campo mostra a
 * confiança — abaixo de 80% é sinalizado para revisão atenta.
 */
export function ExtrairDocumento({ tipo, onConfirmar }: {
  tipo: TipoDocumentoExtraivel;
  onConfirmar?: (campos: Record<string, string>) => void | Promise<void>;
}): ReactNode {
  const [ficheiro, setFicheiro] = useState('');
  const [extracao, setExtracao] = useState<ExtracaoDocumento>();
  const [valores, setValores] = useState<Record<string, string>>({});
  const [aLer, setALer] = useState(false);
  const [erro, setErro] = useState<string>();
  const [gravado, setGravado] = useState(false);

  async function ler(nome: string): Promise<void> {
    setALer(true); setErro(undefined); setGravado(false);
    try {
      const r = await new AgenteStub().extrairDocumento(tipo, nome);
      setExtracao(r);
      setValores(Object.fromEntries(r.campos.map((c) => [c.campo, c.valor])));
    } catch (e) { setErro(mensagemErro(e)); }
    finally { setALer(false); }
  }

  async function confirmar(): Promise<void> {
    setErro(undefined);
    try { await onConfirmar?.(valores); setGravado(true); }
    catch (e) { setErro(mensagemErro(e)); }
  }

  return (
    <div className="cartao">
      <h3>
        Ler documento <span className="sec" style={{ fontWeight: 400 }}>· {ROT_TIPO[tipo]}</span>
        <span className="pill p-ambar" style={{ marginLeft: 'auto' }}>Modelo</span>
      </h3>
      <div className="corpo">
        <div className="aviso" style={{ marginBottom: 12 }}>
          O agente lê o documento e propõe os campos; nada é gravado sem a sua confirmação.
          Os valores propostos são indicativos — confirme sempre contra o original.
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="campo" style={{ flex: 1, marginBottom: 0 }}>
            <label>Ficheiro</label>
            <input
              value={ficheiro}
              onChange={(e) => setFicheiro(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && ficheiro.trim() !== '') void ler(ficheiro); }}
              placeholder="ex.: portaria-2026-144.pdf"
            />
          </div>
          <button className="btn pri" disabled={aLer || ficheiro.trim() === ''} onClick={() => void ler(ficheiro)}>
            {aLer ? 'A ler…' : 'Ler documento'}
          </button>
        </div>

        {erro !== undefined && <div className="erro-cx">⚠ {erro}</div>}

        {extracao !== undefined && (
          <>
            {extracao.observacao !== undefined && <div className="aviso" style={{ marginBottom: 12 }}>{extracao.observacao}</div>}
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead><tr><th>Campo</th><th>Valor proposto</th><th className="num">Confiança</th></tr></thead>
                <tbody>
                  {extracao.campos.map((c) => (
                    <tr key={c.campo}>
                      <td>{c.rotulo}<div className="sec"><code>{c.campo}</code></div></td>
                      <td>
                        <input
                          aria-label={c.rotulo}
                          value={valores[c.campo] ?? ''}
                          onChange={(e) => setValores({ ...valores, [c.campo]: e.target.value })}
                          style={{ width: '100%' }}
                        />
                      </td>
                      <td className="num"><Confianca v={c.confianca} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
              <button className="btn pri" onClick={() => void confirmar()}>Confirmar e gravar</button>
              <button className="btn" onClick={() => { setExtracao(undefined); setGravado(false); }}>Descartar</button>
              {gravado && <span className="pill p-verde">Gravado</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Confianca({ v }: { v: number }): ReactNode {
  const cls = v >= 0.9 ? 'p-verde' : v >= 0.8 ? 'p-azul' : 'p-ambar';
  const rot = v >= 0.9 ? 'alta' : v >= 0.8 ? 'média' : 'baixa';
  return <span className={`pill ${cls}`} title={`${Math.round(v * 100)}%`}>{rot} · {Math.round(v * 100)}%</span>;
}

export type { CampoExtraido };
