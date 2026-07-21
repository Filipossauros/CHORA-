import * as React from 'react';
import { useState } from 'react';
import type { IClienteApi } from '../../comum/cliente-api.js';
import { useRemoto } from '../../comum/hooks.js';
import { EtiquetaEstado } from '../../comum/componentes.js';
import { formatarDuracao } from '../../comum/formatacao.js';

/**
 * V2 — Listagem e aprovação (secção 10.3). Tabela com filtros, seleção múltipla,
 * aprovação/rejeição em lote com relatório de resultado por item.
 */
interface Props { cliente: IClienteApi }

interface RegistoLido {
  id: string; data: string; duracao: number; estado: string; recursoId: string; perfilId: string; contratoId: string;
}
interface ResultadoItem { id: string; ok: boolean; regra?: string; detalhe?: string }

export function Aprovacoes({ cliente }: Props): React.JSX.Element {
  const [estado, setEstado] = useState('SUBMETIDO');
  const [selecao, setSelecao] = useState<Set<string>>(new Set());
  const [resultados, setResultados] = useState<ResultadoItem[]>([]);

  const registos = useRemoto<{ dados: RegistoLido[] }>(
    () => cliente.get(`/api/v1/registos-tempo?estado=${estado}&tamanho=200`),
    [estado],
  );

  function alternar(id: string): void {
    setSelecao((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  async function aprovar(): Promise<void> {
    const r = await cliente.post<{ resultados: ResultadoItem[] }>('/api/v1/registos-tempo:aprovar', { ids: [...selecao] });
    setResultados(r.resultados);
    setSelecao(new Set());
    registos.recarregar();
  }

  async function rejeitar(): Promise<void> {
    const motivo = prompt('Motivo da rejeição:') ?? '';
    if (motivo.trim() === '') return;
    const r = await cliente.post<{ resultados: ResultadoItem[] }>('/api/v1/registos-tempo:rejeitar', { ids: [...selecao], motivo });
    setResultados(r.resultados);
    setSelecao(new Set());
    registos.recarregar();
  }

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', padding: 16 }}>
      <h2>Aprovações</h2>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <label>Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            <option>SUBMETIDO</option><option>APROVADO</option><option>REJEITADO</option><option>RASCUNHO</option>
          </select>
        </label>
        <button onClick={() => void aprovar()} disabled={selecao.size === 0}>Aprovar ({selecao.size})</button>
        <button onClick={() => void rejeitar()} disabled={selecao.size === 0}>Rejeitar ({selecao.size})</button>
      </div>

      {resultados.length > 0 && (
        <div style={{ margin: '8px 0', fontSize: 13 }}>
          {resultados.map((r) => (
            <div key={r.id} style={{ color: r.ok ? 'var(--status-success, #093)' : 'var(--status-error, #c00)' }}>
              {r.id}: {r.ok ? 'aprovado' : `falhou ${r.regra ?? ''} — ${r.detalhe ?? ''}`}
            </div>
          ))}
        </div>
      )}

      {registos.aCarregar ? <p>A carregar…</p> : (
        <table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
          <thead><tr><th></th><th>Data</th><th>Recurso</th><th>Perfil</th><th>Duração</th><th>Estado</th></tr></thead>
          <tbody>
            {(registos.dados?.dados ?? []).map((r) => (
              <tr key={r.id}>
                <td><input type="checkbox" checked={selecao.has(r.id)} onChange={() => alternar(r.id)} /></td>
                <td>{r.data}</td><td>{r.recursoId}</td><td>{r.perfilId}</td>
                <td>{formatarDuracao(r.duracao)}</td><td><EtiquetaEstado estado={r.estado} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
