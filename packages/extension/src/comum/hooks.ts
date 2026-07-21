import { useEffect, useState } from 'react';
import type { ClienteApi } from './cliente-api.js';
import type { Pagina } from './tipos.js';

/** Estado genérico de carregamento de dados. */
export interface EstadoRemoto<T> {
  dados: T | undefined;
  aCarregar: boolean;
  erro: string | undefined;
}

export function useRemoto<T>(carregar: () => Promise<T>, deps: unknown[]): EstadoRemoto<T> & { recarregar: () => void } {
  const [dados, setDados] = useState<T | undefined>(undefined);
  const [aCarregar, setACarregar] = useState(true);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let ativo = true;
    setACarregar(true);
    setErro(undefined);
    carregar()
      .then((r) => { if (ativo) setDados(r); })
      .catch((e: unknown) => { if (ativo) setErro(e instanceof Error ? e.message : 'Erro'); })
      .finally(() => { if (ativo) setACarregar(false); });
    return () => { ativo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { dados, aCarregar, erro, recarregar: () => setTick((t) => t + 1) };
}

/** Afetações ativas do utilizador para um projeto/data (RN-401). */
export interface AfetacaoResumo {
  id: string;
  contratoId: string;
  perfilId: string;
  projetoIds: string[];
}

export function useAfetacoesAtivas(cliente: ClienteApi, recursoId: string, projetoId?: string) {
  return useRemoto<Pagina<AfetacaoResumo>>(
    () => cliente.get(`/api/v1/afetacoes?recursoId=${recursoId}&ativa=true${projetoId !== undefined ? `&projetoId=${projetoId}` : ''}`),
    [recursoId, projetoId],
  );
}
