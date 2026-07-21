import * as React from 'react';
import { formatarDuracao } from './formatacao.js';

/**
 * Componentes partilhados (secção 10.4): BarraConsumo, EtiquetaEstado,
 * PainelViolacoes. Usam tokens de tema do host (variáveis CSS), não cores fixas
 * (secção 10.1).
 */

export function BarraConsumo({ consumido, disponivel, rotulo }: { consumido: number; disponivel: number; rotulo: string }): React.JSX.Element {
  const fracao = disponivel > 0 ? Math.min(1, consumido / disponivel) : 0;
  const cor = fracao >= 0.9 ? 'var(--status-error, #c00)' : fracao >= 0.8 ? 'var(--status-warning, #c80)' : 'var(--status-success, #093)';
  return (
    <div style={{ margin: '4px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
        <span>{rotulo}</span>
        <span>{formatarDuracao(consumido)} / {formatarDuracao(disponivel)}</span>
      </div>
      <div style={{ background: 'var(--palette-neutral-8, #eee)', height: 8, borderRadius: 4 }}>
        <div style={{ width: `${fracao * 100}%`, height: 8, borderRadius: 4, background: cor }} />
      </div>
    </div>
  );
}

const CORES_ESTADO: Record<string, string> = {
  RASCUNHO: 'var(--palette-neutral-20, #999)',
  SUBMETIDO: 'var(--status-info, #06c)',
  APROVADO: 'var(--status-success, #093)',
  REJEITADO: 'var(--status-error, #c00)',
  ANULADO: 'var(--palette-neutral-40, #666)',
};

export function EtiquetaEstado({ estado }: { estado: string }): React.JSX.Element {
  return (
    <span style={{ padding: '1px 6px', borderRadius: 8, fontSize: 11, color: '#fff', background: CORES_ESTADO[estado] ?? '#888' }}>
      {estado}
    </span>
  );
}

export interface Violacao { regra?: string; detalhe: string; }

export function PainelViolacoes({ violacoes }: { violacoes: Violacao[] }): React.JSX.Element | null {
  if (violacoes.length === 0) return null;
  return (
    <div style={{ border: '1px solid var(--status-error, #c00)', borderRadius: 4, padding: 8, margin: '8px 0' }}>
      <strong>Regras violadas</strong>
      <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
        {violacoes.map((v, i) => (
          <li key={i}>{v.regra !== undefined ? `[${v.regra}] ` : ''}{v.detalhe}</li>
        ))}
      </ul>
    </div>
  );
}
