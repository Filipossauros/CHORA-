import * as React from 'react';
import { useState } from 'react';
import { RN_405, type TipoDotacao } from '@chora/domain';
import type { IClienteApi } from '../../comum/cliente-api.js';
import { ErroApi } from '../../comum/cliente-api.js';
import { useAfetacoesAtivas, useRemoto } from '../../comum/hooks.js';
import { EtiquetaEstado, PainelViolacoes, type Violacao } from '../../comum/componentes.js';
import { formatarDuracao } from '../../comum/formatacao.js';

/**
 * V1 — Registo de tempo no work item (secção 10.3). Formulário compacto com
 * validação otimista no cliente espelhando RN-405 (a decisão final é do
 * servidor). Lista os registos do próprio utilizador naquele work item.
 */
interface Props {
  cliente: IClienteApi;
  utilizadorId: string;
  projetoId?: string;
  workItemId: number;
}

interface RegistoLido {
  id: string; data: string; duracao: number; estado: string; descricaoAtividade: string;
}

export function RegistoTempoPage({ cliente, utilizadorId, projetoId, workItemId }: Props): React.JSX.Element {
  const hoje = new Date().toISOString().slice(0, 10);
  const [data, setData] = useState(hoje);
  const [duracao, setDuracao] = useState(60);
  const [afetacaoId, setAfetacaoId] = useState('');
  const [tipo, setTipo] = useState<TipoDotacao>('HORAS_BASE');
  const [descricao, setDescricao] = useState('');
  const [violacoes, setViolacoes] = useState<Violacao[]>([]);

  const afetacoes = useAfetacoesAtivas(cliente, utilizadorId, projetoId);
  const registos = useRemoto<{ dados: RegistoLido[] }>(
    () => cliente.get(`/api/v1/work-items/${workItemId}/registos-tempo`),
    [workItemId],
  );

  async function submeter(): Promise<void> {
    setViolacoes([]);
    // Validação otimista (RN-405) antes de chamar o servidor.
    const rc = RN_405.avaliar({ duracao });
    if (!rc.ok) { setViolacoes([{ regra: 'RN-405', detalhe: rc.mensagem }]); return; }
    try {
      await cliente.post('/api/v1/registos-tempo', {
        afetacaoId, workItemId, data, duracao, descricaoAtividade: descricao, tipoDotacaoConsumida: tipo,
      });
      setDescricao('');
      registos.recarregar();
    } catch (e) {
      if (e instanceof ErroApi) {
        setViolacoes([{ ...(e.problema.regra !== undefined ? { regra: e.problema.regra } : {}), detalhe: e.problema.detail }]);
      } else {
        setViolacoes([{ detalhe: 'Erro inesperado.' }]);
      }
    }
  }

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', padding: 12, maxWidth: 480 }}>
      <h3>Registo de tempo</h3>
      <PainelViolacoes violacoes={violacoes} />
      <div style={{ display: 'grid', gap: 8 }}>
        <label>Data<input type="date" value={data} max={hoje} onChange={(e) => setData(e.target.value)} /></label>
        <label>Duração (min, múltiplos de 15)
          <input type="number" min={15} step={15} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))} />
          <span style={{ marginLeft: 8, color: '#666' }}>{formatarDuracao(duracao)}</span>
        </label>
        <label>Afetação
          <select value={afetacaoId} onChange={(e) => setAfetacaoId(e.target.value)}>
            <option value="">— selecionar —</option>
            {(afetacoes.dados?.dados ?? []).map((a) => (
              <option key={a.id} value={a.id}>{a.contratoId} · {a.perfilId}</option>
            ))}
          </select>
        </label>
        <label>Tipo de dotação
          <select value={tipo} onChange={(e) => setTipo(e.target.value as TipoDotacao)}>
            <option value="HORAS_BASE">Horas base</option>
            <option value="BOLSA_VALOR">Bolsa de valor</option>
            <option value="TRABALHOS_COMPLEMENTARES">Trabalhos complementares</option>
          </select>
        </label>
        <label>Descrição da atividade
          <textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} />
        </label>
        <button onClick={() => void submeter()} disabled={afetacaoId === '' || descricao === ''}>Registar</button>
      </div>

      <h4 style={{ marginTop: 16 }}>Os meus registos neste work item</h4>
      {registos.aCarregar ? <p>A carregar…</p> : (
        <table style={{ width: '100%', fontSize: 13 }}>
          <thead><tr><th>Data</th><th>Duração</th><th>Estado</th></tr></thead>
          <tbody>
            {(registos.dados?.dados ?? []).map((r) => (
              <tr key={r.id}>
                <td>{r.data}</td><td>{formatarDuracao(r.duracao)}</td><td><EtiquetaEstado estado={r.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
