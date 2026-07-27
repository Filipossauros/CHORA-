import { useEffect, useState, type ReactNode } from 'react';
import { ErroApi } from './erro-api.js';

export function formatarMoeda(cent: number): string {
  return new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(cent / 100);
}
/** Horas (unidade de maior granularidade — sem minutos). Recebe minutos internos. */
export function formatarHoras(minutos: number): string {
  return `${Math.round(minutos / 60)} h`;
}
/** Compat: formata em horas. */
export const formatarDuracao = formatarHoras;
/** Converte horas ↔ minutos (armazenamento interno em minutos). */
export const horasParaMin = (h: number): number => Math.round(h) * 60;
export const minParaHoras = (m: number): number => Math.round(m / 60);
/** Converte euros (texto do formulário) ↔ cêntimos (armazenamento interno). */
export const eurosParaCent = (s: string | number): number => Math.round((parseFloat(String(s).replace(',', '.')) || 0) * 100);
export const centParaEuros = (c: number): string => String(c / 100);
export function pct(fracao: number): string { return `${Math.round(fracao * 100)}%`; }
export function hoje(): string { return new Date().toISOString().slice(0, 10); }

const CORES_ESTADO: Record<string, string> = {
  RASCUNHO: 'p-ard', SUBMETIDO: 'p-azul', APROVADO: 'p-verde', REJEITADO: 'p-verm', ANULADO: 'p-ard',
  EM_VIGOR: 'p-verde', AGUARDA_VISTO: 'p-ambar', SUSPENSO: 'p-ard', TERMINADO: 'p-ard', EM_PREPARACAO: 'p-ard',
  RECEBIDA: 'p-ard', EM_CONFERENCIA: 'p-azul', VALIDADA: 'p-verde', INVALIDADA: 'p-verm',
  AGUARDA_NOTA_CREDITO: 'p-ambar',
  Ativa: 'p-verde', Inativa: 'p-ard',
};
/** Rótulos explícitos para estados cujo nome, por si só, seria ambíguo. */
const ROTULOS_ESTADO: Record<string, string> = {
  AGUARDA_VISTO: 'Aguarda visto TdC',
  AGUARDA_NOTA_CREDITO: 'Aguarda nota de crédito',
};
export function Estado({ v }: { v: string }): ReactNode {
  const rot = ROTULOS_ESTADO[v] ?? v.charAt(0) + v.slice(1).toLowerCase().replace(/_/g, ' ');
  return <span className={`pill ${CORES_ESTADO[v] ?? 'p-ard'}`}>{rot}</span>;
}

/** Severidade de alerta (secção 11) — não reutiliza pills de estado de contrato. */
export function Severidade({ v }: { v: string }): ReactNode {
  const mapa: Record<string, { cor: string; rot: string }> = {
    CRITICO: { cor: 'p-verm', rot: 'Crítico' },
    AVISO: { cor: 'p-ambar', rot: 'Aviso' },
    INFO: { cor: 'p-azul', rot: 'Informativo' },
  };
  const s = mapa[v] ?? { cor: 'p-ard', rot: v };
  return <span className={`pill ${s.cor}`}>{s.rot}</span>;
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
/**
 * Sinal de que os dados mudaram, para vistas que não estão no ecrã atual
 * reagirem — nomeadamente o contador de decisões no menu, que de outro modo
 * ficaria desatualizado após uma dispensa ou um ato.
 */
const EVENTO_DADOS = 'chora:dados';
export function notificarMudanca(): void {
  window.dispatchEvent(new CustomEvent(EVENTO_DADOS));
}
export function useMudancas(aoMudar: () => void): void {
  useEffect(() => {
    window.addEventListener(EVENTO_DADOS, aoMudar);
    return () => window.removeEventListener(EVENTO_DADOS, aoMudar);
  });
}

export function mensagemErro(e: unknown): string {
  if (e instanceof ErroApi) return e.mensagem;
  if (typeof e === 'object' && e !== null && 'codigo' in e && 'message' in e) {
    const v = e as { codigo: string; message: string };
    return `${v.message} (${v.codigo})`;
  }
  return e instanceof Error ? e.message : 'Erro inesperado.';
}
