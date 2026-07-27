import { CONFIG_MODELO_OMISSAO, type ConfigModeloLocal } from '@chora/api/nucleo';

/**
 * CONFIGURAÇÃO DO MODELO LOCAL.
 *
 * O modelo é OPCIONAL e desligado por omissão. Não é uma cautela decorativa: a
 * aplicação é estática e corre no browser, pelo que um modelo local implica um
 * runtime na máquina de quem a usa. Sem ele — que é o caso da demonstração — o
 * encaminhamento determinístico responde a tudo o que está no catálogo; o
 * modelo só acrescenta tolerância a frases que os padrões não apanham.
 *
 * Guarda-se em localStorage porque não há servidor onde guardar preferências.
 */
export interface ConfigAssistente extends ConfigModeloLocal {
  ativo: boolean;
}

const CHAVE = 'chora:modelo';

export const CONFIG_ASSISTENTE_OMISSAO: ConfigAssistente = { ...CONFIG_MODELO_OMISSAO, ativo: false };

export function configModelo(): ConfigAssistente {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (bruto === null) return CONFIG_ASSISTENTE_OMISSAO;
    return { ...CONFIG_ASSISTENTE_OMISSAO, ...(JSON.parse(bruto) as Partial<ConfigAssistente>) };
  } catch {
    return CONFIG_ASSISTENTE_OMISSAO;
  }
}

export function guardarConfigModelo(c: ConfigAssistente): void {
  localStorage.setItem(CHAVE, JSON.stringify(c));
}
