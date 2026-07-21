import { useEffect, useState, type ReactNode } from 'react';
import { ErroApi } from './erro-api.js';

export function formatarMoeda(cent: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cent / 100);
}
export function formatarDuracao(minutos: number): string {
  const h = Math.floor(minutos / 60); const m = minutos % 60;
  return h === 0 ? `${m}m` : `${h}h ${String(m).padStart(2, '0')}m`;
}
export function pct(fracao: number): string { return `${Math.round(fracao * 100)}%`; }
export function hoje(): string { return new Date().toISOString().slice(0, 10); }

const CORES_ESTADO: Record<string, string> = {
  RASCUNHO: 'p-ard', SUBMETIDO: 'p-azul', APROVADO: 'p-verde', REJEITADO: 'p-verm', ANULADO: 'p-ard',
  EM_VIGOR: 'p-verde', AGUARDA_VISTO: 'p-ambar', SUSPENSO: 'p-ard', TERMINADO: 'p-ard', EM_PREPARACAO: 'p-ard',
  RECEBIDA: 'p-ard', EM_CONFERENCIA: 'p-azul', VALIDADA: 'p-verde', INVALIDADA: 'p-verm', DEVOLVIDA: 'p-ambar', PAGA: 'p-verde',
  Ativa: 'p-verde', Inativa: 'p-ard',
};
export function Estado({ v }: { v: string }): ReactNode {
  const rot = v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');
  return <span className={`pill ${CORES_ESTADO[v] ?? 'p-ard'}`}>{rot}</span>;
}

export function Barra({ fracao }: { fracao: number }): ReactNode {
  const f = Math.max(0, Math.min(1, fracao));
  const cor = f >= 0.9 ? 'var(--vermelho)' : f >= 0.8 ? 'var(--ambar)' : 'var(--verde)';
  return (
    <div className="mini">
      <div className="barra"><i style={{ width: `${f * 100}%`, background: cor }} /></div>
      <span className="pct">{pct(fracao)}</span>
    </div>
  );
}

/** Hook de carregamento assíncrono com recarga. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]): { dados: T | undefined; aCarregar: boolean; erro: string | undefined; recarregar: () => void } {
  const [dados, setDados] = useState<T | undefined>(undefined);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let vivo = true; setACarregar(true); setErro(undefined);
    fn().then((r) => { if (vivo) setDados(r); }).catch((e: unknown) => { if (vivo) setErro(mensagemErro(e)); }).finally(() => { if (vivo) setACarregar(false); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { dados, aCarregar, erro, recarregar: () => setTick((t) => t + 1) };
}

/** Extrai a mensagem apresentável de um erro (código de regra quando existe). */
export function mensagemErro(e: unknown): string {
  if (e instanceof ErroApi) return e.mensagem;
  if (typeof e === 'object' && e !== null && 'codigo' in e && 'message' in e) {
    const v = e as { codigo: string; message: string };
    return `${v.message} (${v.codigo})`;
  }
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
