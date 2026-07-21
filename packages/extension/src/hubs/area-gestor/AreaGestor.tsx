import * as React from 'react';
import { useState } from 'react';
import type { IClienteApi } from '../../comum/cliente-api.js';
import { useRemoto } from '../../comum/hooks.js';
import { BarraConsumo } from '../../comum/componentes.js';
import { formatarMoeda, formatarPercentagem } from '../../comum/formatacao.js';

/**
 * V3 — Área do Gestor do Contrato (secção 10.3). Separadores: ficha, estrutura,
 * execução física, execução financeira, alterações, alertas, relatórios.
 */
interface Props { cliente: IClienteApi }

interface ResumoExecucao {
  contratoId: string; estado: string;
  precoContratualInicial: number; precoContratualAtual: number;
  complementaresAcumulados: number; percentagemComplementares: number;
  valorImputadoTotal: number;
  execucaoFisica: Array<{ perfilId: string; nome: string; minutosConsumidos: number; minutosDisponiveis: number; valorConsumido: number; valorPrevisto: number }>;
}
interface ContratoLido { id: string; numero: string; estado: string }

const SEPARADORES = ['Execução física', 'Execução financeira', 'Alertas'] as const;

export function AreaGestor({ cliente }: Props): React.JSX.Element {
  const [contratoId, setContratoId] = useState('');
  const [sep, setSep] = useState<(typeof SEPARADORES)[number]>('Execução física');

  const contratos = useRemoto<{ dados: ContratoLido[] }>(() => cliente.get('/api/v1/contratos?tamanho=200'), []);
  const resumo = useRemoto<ResumoExecucao | undefined>(
    () => (contratoId === '' ? Promise.resolve(undefined) : cliente.get(`/api/v1/contratos/${contratoId}/resumo-execucao`)),
    [contratoId],
  );
  const alertas = useRemoto<{ dados: Array<{ id: string; codigo: string; severidade: string; titulo: string }> }>(
    () => cliente.get('/api/v1/alertas'),
    [contratoId],
  );

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', padding: 16 }}>
      <h2>Área do Gestor do Contrato</h2>
      <label>Contrato
        <select value={contratoId} onChange={(e) => setContratoId(e.target.value)}>
          <option value="">— selecionar —</option>
          {(contratos.dados?.dados ?? []).map((c) => <option key={c.id} value={c.id}>{c.numero} ({c.estado})</option>)}
        </select>
      </label>

      <div style={{ display: 'flex', gap: 8, margin: '12px 0' }}>
        {SEPARADORES.map((s) => (
          <button key={s} onClick={() => setSep(s)} style={{ fontWeight: sep === s ? 700 : 400 }}>{s}</button>
        ))}
      </div>

      {contratoId === '' && <p>Selecione um contrato.</p>}

      {sep === 'Execução física' && resumo.dados !== undefined && (
        <div>
          {resumo.dados.execucaoFisica.map((p) => (
            <BarraConsumo key={p.perfilId} rotulo={p.nome} consumido={p.minutosConsumidos} disponivel={p.minutosDisponiveis} />
          ))}
        </div>
      )}

      {sep === 'Execução financeira' && resumo.dados !== undefined && (
        <table style={{ fontSize: 13 }}>
          <tbody>
            <tr><td>Preço contratual inicial</td><td>{formatarMoeda(resumo.dados.precoContratualInicial)}</td></tr>
            <tr><td>Preço contratual atual</td><td>{formatarMoeda(resumo.dados.precoContratualAtual)}</td></tr>
            <tr><td>Valor imputado</td><td>{formatarMoeda(resumo.dados.valorImputadoTotal)}</td></tr>
            <tr><td>Serviços complementares</td><td>{formatarMoeda(resumo.dados.complementaresAcumulados)} ({formatarPercentagem(resumo.dados.percentagemComplementares)})</td></tr>
          </tbody>
        </table>
      )}

      {sep === 'Alertas' && (
        <ul style={{ fontSize: 13 }}>
          {(alertas.dados?.dados ?? []).map((a) => (
            <li key={a.id}><strong>{a.severidade}</strong> [{a.codigo}] {a.titulo}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
