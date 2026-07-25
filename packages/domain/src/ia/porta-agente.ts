import type { Cent, DataISO } from '../tipos/primitivos.js';
import { perfisSemelhantes, type CorrespondenciaPerfil } from './similaridade.js';

/**
 * PORTA DO AGENTE — o ponto único onde a aplicação fala com um modelo.
 *
 * O princípio é inegociável: **as regras decidem; o modelo lê, escreve e
 * explica.** Nada aqui bloqueia, calcula dinheiro ou prazos, nem decide
 * viabilidade jurídica — isso é das regras `RN-xxx` e dos cálculos
 * determinísticos.
 *
 * O protótipo traz um stub determinístico (`AgenteStub`), pelo que a aplicação
 * corre offline e reproduzível. Em produção, a mesma interface é servida por um
 * modelo com RAG sobre a legislação em vigor, sem tocar em quem a consome.
 */

/** Proveniência de um facto apresentado ao utilizador. Nunca se mistura. */
export type Proveniencia = 'REGRA' | 'PROJECAO' | 'MODELO';

export interface FonteResposta {
  proveniencia: Proveniencia;
  /** Regra, cálculo ou documento que sustenta o facto. */
  referencia: string;
}

// ─── Extração de documentos ────────────────────────────────────────────────

export type TipoDocumentoExtraivel = 'CONTRATO' | 'PORTARIA' | 'FATURA';

export interface CampoExtraido {
  campo: string;
  /** Rótulo legível, para confirmação humana. */
  rotulo: string;
  valor: string;
  /** 0..1 — abaixo de 0,8 exige confirmação atenta. */
  confianca: number;
}

export interface ExtracaoDocumento {
  tipo: TipoDocumentoExtraivel;
  ficheiro: string;
  campos: CampoExtraido[];
  /** Aviso quando algum campo ficou por extrair ou com confiança baixa. */
  observacao?: string;
}

// ─── Pergunta em linguagem natural ─────────────────────────────────────────

export interface ContextoPergunta {
  /** Factos já calculados pelas funções determinísticas, prontos a narrar. */
  factos: Record<string, string | number>;
  /** Fontes dos factos, para exibir a proveniência. */
  fontes: FonteResposta[];
}

export interface RespostaPergunta {
  /** Texto em pt-PT, redigido a partir dos factos — nunca inventado. */
  texto: string;
  fontes: FonteResposta[];
  /** Quando o agente não consegue responder com os factos disponíveis. */
  semResposta?: boolean;
}

export interface PortaAgente {
  /** Extrai campos estruturados de um documento, com confiança por campo. */
  extrairDocumento(tipo: TipoDocumentoExtraivel, ficheiro: string, conteudo?: string): Promise<ExtracaoDocumento>;
  /**
   * Redige a resposta a uma pergunta A PARTIR de factos já calculados. O agente
   * não calcula: recebe os números das funções determinísticas e narra-os.
   */
  responder(pergunta: string, contexto: ContextoPergunta): Promise<RespostaPergunta>;
  /** Correspondência entre nomes de perfil (papéis equivalentes). */
  corresponderPerfis(alvo: string, candidatos: ReadonlyArray<string>): Promise<CorrespondenciaPerfil[]>;
}

// ─── Stub determinístico ───────────────────────────────────────────────────

/** Campos que cada tipo de documento fornece, com um valor ilustrativo. */
const MODELOS_EXTRACAO: Record<TipoDocumentoExtraivel, Array<Omit<CampoExtraido, 'valor'> & { exemplo: string }>> = {
  PORTARIA: [
    { campo: 'numero', rotulo: 'N.º da portaria', confianca: 0.96, exemplo: 'P-2026/144' },
    { campo: 'data', rotulo: 'Data da portaria', confianca: 0.94, exemplo: '2025-12-18' },
    { campo: 'reparticao.2026', rotulo: 'Repartição 2026', confianca: 0.93, exemplo: '100000.00' },
    { campo: 'reparticao.2027', rotulo: 'Repartição 2027', confianca: 0.74, exemplo: '80000.00' },
  ],
  CONTRATO: [
    { campo: 'numero', rotulo: 'N.º do contrato', confianca: 0.97, exemplo: 'C-2026-010' },
    { campo: 'objeto', rotulo: 'Objeto', confianca: 0.88, exemplo: 'Serviços de desenvolvimento aplicacional' },
    { campo: 'precoContratualInicial', rotulo: 'Preço contratual', confianca: 0.95, exemplo: '120000.00' },
    { campo: 'dataInicioVigencia', rotulo: 'Início de vigência', confianca: 0.92, exemplo: '2026-09-01' },
    { campo: 'dataTerminoContratual', rotulo: 'Término contratual', confianca: 0.91, exemplo: '2028-08-31' },
    { campo: 'prestador.nipc', rotulo: 'NIPC do prestador', confianca: 0.89, exemplo: '500000001' },
  ],
  FATURA: [
    { campo: 'numero', rotulo: 'N.º da fatura', confianca: 0.95, exemplo: 'FT-2026/3312' },
    { campo: 'dataEmissao', rotulo: 'Data de emissão', confianca: 0.93, exemplo: '2026-07-31' },
    { campo: 'montanteSemIva', rotulo: 'Montante s/ IVA', confianca: 0.9, exemplo: '18400.00' },
    { campo: 'montanteIva', rotulo: 'IVA', confianca: 0.9, exemplo: '4232.00' },
  ],
};

/**
 * Stub determinístico da porta do agente. Não chama modelo nenhum: devolve uma
 * extração ilustrativa com confiança por campo e redige respostas a partir dos
 * factos recebidos. Serve a demo e os testes; a interface é que interessa.
 */
export class AgenteStub implements PortaAgente {
  async extrairDocumento(tipo: TipoDocumentoExtraivel, ficheiro: string): Promise<ExtracaoDocumento> {
    const campos = MODELOS_EXTRACAO[tipo].map(({ exemplo, ...resto }) => ({ ...resto, valor: exemplo }));
    const duvidosos = campos.filter((c) => c.confianca < 0.8);
    return {
      tipo, ficheiro, campos,
      ...(duvidosos.length > 0
        ? { observacao: `${duvidosos.length} campo(s) com confiança baixa — confirme antes de gravar: ${duvidosos.map((c) => c.rotulo).join(', ')}.` }
        : {}),
    };
  }

  async responder(_pergunta: string, contexto: ContextoPergunta): Promise<RespostaPergunta> {
    const entradas = Object.entries(contexto.factos);
    if (entradas.length === 0) {
      return {
        texto: 'Não consigo responder a essa pergunta com os dados disponíveis. Experimente perguntar sobre o saldo de um contrato, o limite de complementares, a vigência ou as decisões pendentes.',
        fontes: [], semResposta: true,
      };
    }
    // O stub apresenta os factos; um modelo real redigiria em prosa contínua.
    const corpo = entradas.map(([k, v]) => `${k}: ${v}`).join('\n');
    return { texto: corpo, fontes: contexto.fontes };
  }

  async corresponderPerfis(alvo: string, candidatos: ReadonlyArray<string>): Promise<CorrespondenciaPerfil[]> {
    return perfisSemelhantes(alvo, candidatos);
  }
}

/** Formata cêntimos em euros para os textos das respostas. */
export function eurosTexto(c: Cent): string {
  return `${(c / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
}

/** Formata uma data ISO em dd/mm/aaaa. */
export function dataTexto(d: DataISO): string {
  const [a, m, dia] = d.split('-');
  return `${dia}/${m}/${a}`;
}
