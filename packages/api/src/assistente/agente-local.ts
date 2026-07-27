import type { CapacidadePublica } from './tipos.js';
import type { Encaminhamento } from './router.js';

/**
 * MODELO LOCAL — o encaminhador de último recurso.
 *
 * Fala com um runtime local compatível com a API do Ollama (`/api/chat`), que é
 * a forma mais direta de correr o Gemma numa máquina de trabalho. A escolha do
 * modelo é configurável; a predefinição é `gemma3:4b`, que chega para esta
 * tarefa e corre em CPU — não se lhe pede que raciocine, pede-se que escolha uma
 * função de uma lista e lhe preencha os campos.
 *
 * O que este adaptador NÃO faz, por desenho:
 *  · não calcula nada — não recebe dados de negócio, só a lista de funções;
 *  · não executa nada — devolve um encaminhamento que o servidor revalida;
 *  · não inventa funções — o nome é verificado contra o catálogo à chegada.
 *
 * E falha em silêncio: sem runtime, com erro ou com resposta ininteligível,
 * devolve `undefined` e a aplicação segue com o router determinístico. É isso
 * que permite publicar a demo sem modelo nenhum.
 */

export interface ConfigModeloLocal {
  /** Base do runtime local. Omissão: o porto normal do Ollama. */
  url: string;
  modelo: string;
  /** Ao fim disto desiste-se e usa-se o router determinístico. */
  timeoutMs: number;
}

export const CONFIG_MODELO_OMISSAO: ConfigModeloLocal = {
  url: 'http://localhost:11434',
  modelo: 'gemma3:4b',
  timeoutMs: 20_000,
};

/**
 * Instrução do sistema. Curta de propósito: quanto mais se explica a um modelo
 * pequeno, mais ele divaga. O que o prende é o esquema da resposta, não o texto.
 */
function instrucao(capacidades: ReadonlyArray<CapacidadePublica>): string {
  const lista = capacidades
    .map((c) => {
      const params = c.parametros.map((p) => `${p.nome}${p.obrigatorio ? '' : '?'}: ${p.tipo} — ${p.descricao}`).join('; ');
      return `- ${c.nome} — ${c.descricao}\n  parâmetros: ${params || 'nenhum'}\n  exemplo: «${c.exemplos[0] ?? ''}»`;
    })
    .join('\n');
  return (
    'És um encaminhador de pedidos de uma aplicação de gestão de contratos públicos portugueses.\n' +
    'A tua ÚNICA tarefa é escolher uma função da lista abaixo e extrair os parâmetros da frase do utilizador.\n' +
    'Nunca calcules valores, datas ou percentagens. Nunca inventes números de contrato ou nomes.\n' +
    'Copia os valores tal como aparecem na frase. Se não houver função adequada, devolve capacidade vazia.\n\n' +
    `FUNÇÕES:\n${lista}\n\n` +
    'Responde APENAS com JSON: {"capacidade": "nome.da.funcao", "parametros": {…}, "confianca": 0.0-1.0}'
  );
}

/** Esquema da resposta, para os runtimes que suportam saída estruturada. */
const ESQUEMA_RESPOSTA = {
  type: 'object',
  properties: {
    capacidade: { type: 'string' },
    parametros: { type: 'object' },
    confianca: { type: 'number' },
  },
  required: ['capacidade', 'parametros'],
} as const;

export class AgenteLocal {
  constructor(private readonly config: ConfigModeloLocal = CONFIG_MODELO_OMISSAO) {}

  /** O runtime responde? Serve o ecrã de definições, não o caminho crítico. */
  async disponivel(): Promise<{ ok: boolean; modelos?: string[]; erro?: string }> {
    try {
      const r = await this.pedir('/api/tags', undefined, 4000);
      const modelos = ((r as { models?: Array<{ name: string }> }).models ?? []).map((m) => m.name);
      return { ok: true, modelos };
    } catch (e) {
      return { ok: false, erro: e instanceof Error ? e.message : 'indisponível' };
    }
  }

  /**
   * Encaminha a frase. Devolve `undefined` sempre que algo corra mal — o
   * chamador já tem um caminho que funciona sem isto.
   */
  async encaminhar(frase: string, capacidades: ReadonlyArray<CapacidadePublica>): Promise<Encaminhamento | undefined> {
    try {
      const r = await this.pedir('/api/chat', {
        model: this.config.modelo,
        stream: false,
        format: ESQUEMA_RESPOSTA,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: instrucao(capacidades) },
          { role: 'user', content: frase },
        ],
      }, this.config.timeoutMs);

      const conteudo = (r as { message?: { content?: string } }).message?.content;
      if (typeof conteudo !== 'string') return undefined;
      const parsed = JSON.parse(conteudo) as { capacidade?: unknown; parametros?: unknown; confianca?: unknown };
      if (typeof parsed.capacidade !== 'string' || parsed.capacidade === '') return undefined;
      // O nome tem de existir no catálogo — o servidor volta a verificá-lo, mas
      // não vale a pena propagar lixo.
      if (!capacidades.some((c) => c.nome === parsed.capacidade)) return undefined;
      return {
        capacidade: parsed.capacidade,
        parametros: (typeof parsed.parametros === 'object' && parsed.parametros !== null ? parsed.parametros : {}) as Record<string, unknown>,
        confianca: typeof parsed.confianca === 'number' ? Math.max(0, Math.min(1, parsed.confianca)) : 0.5,
        origem: 'MODELO',
      };
    } catch {
      return undefined;
    }
  }

  private async pedir(caminho: string, corpo: unknown, timeoutMs: number): Promise<unknown> {
    const controlador = new AbortController();
    const t = setTimeout(() => controlador.abort(), timeoutMs);
    try {
      const r = await fetch(`${this.config.url}${caminho}`, {
        method: corpo === undefined ? 'GET' : 'POST',
        signal: controlador.signal,
        ...(corpo !== undefined ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(corpo) } : {}),
      });
      if (!r.ok) throw new Error(`O runtime local respondeu ${r.status}.`);
      return await r.json();
    } finally {
      clearTimeout(t);
    }
  }
}
