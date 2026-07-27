import * as pdfjs from 'pdfjs-dist';
import trabalhador from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = trabalhador;

/**
 * LEITURA DE DOCUMENTOS — por ordem de fiabilidade, não de sofisticação.
 *
 * A camada de texto do PDF é exata e não custa nada: as faturas e os relatórios
 * que chegam por correio eletrónico são quase sempre digitais, e nesses o texto
 * já lá está. Só o que vem digitalizado precisaria de OCR, e nesse caso a
 * aplicação diz que não conseguiu ler em vez de adivinhar.
 *
 * A classificação e a extração de campos são DETERMINÍSTICAS: padrões de NIF,
 * número de contrato, número de fatura e totais. Um modelo pode ajudar quando
 * isto falha, mas não substitui o que uma expressão regular acerta sempre — e
 * sobretudo não deve inventar um montante que não está no documento.
 */

export type TipoDocumentoLido = 'FATURA' | 'RELATORIO_HORAS' | 'NOTA_CREDITO' | 'AUTO_ENTREGA' | 'DESCONHECIDO';

export interface CampoLido {
  campo: string;
  rotulo: string;
  valor: string;
  /** 0..1. Os padrões acertam ou não acertam — daí valores altos ou ausência. */
  confianca: number;
}

export interface DocumentoLido {
  ficheiro: string;
  tipo: TipoDocumentoLido;
  campos: CampoLido[];
  /** Texto extraído, truncado — serve o modelo quando os padrões não chegam. */
  texto: string;
  /** Por que razão a leitura ficou incompleta. */
  observacao?: string;
}

/** Extrai a camada de texto de todas as páginas. Vazio se o PDF for imagem. */
async function textoDoPdf(ficheiro: File): Promise<string> {
  const doc = await pdfjs.getDocument({ data: await ficheiro.arrayBuffer() }).promise;
  const partes: string[] = [];
  for (let i = 1; i <= doc.numPages; i += 1) {
    const pagina = await doc.getPage(i);
    const conteudo = await pagina.getTextContent();
    partes.push(conteudo.items.map((it) => ('str' in it ? it.str : '')).join(' '));
  }
  return partes.join('\n');
}

const semAcentos = (t: string): string => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/**
 * Classifica pelo que o documento diz de si. A ordem importa: uma nota de
 * crédito também contém a palavra «fatura», e um relatório de horas anexo a uma
 * fatura contém as duas — por isso o combinado é reconhecido em primeiro lugar.
 */
export function classificar(texto: string): TipoDocumentoLido {
  const t = semAcentos(texto);
  if (/nota\s+de\s+credito|\bnc[-\s]?\d/.test(t)) return 'NOTA_CREDITO';
  if (/auto\s+de\s+(entrega|rececao)|termo\s+de\s+entrega/.test(t)) return 'AUTO_ENTREGA';
  const temFatura = /\bfatura\b|\bfactura\b|\bft[-\s/]?\d/.test(t);
  const temHoras = /relatorio\s+de\s+horas|mapa\s+de\s+horas|horas\s+prestadas|timesheet/.test(t);
  if (temFatura) return 'FATURA';
  if (temHoras) return 'RELATORIO_HORAS';
  return 'DESCONHECIDO';
}

/** Campos que os padrões conseguem apanhar com certeza. */
export function extrairCampos(texto: string): CampoLido[] {
  const campos: CampoLido[] = [];
  const t = texto.replace(/\s+/g, ' ');

  const numeroFatura = t.match(/\b(?:fatura|factura|ft|nota\s+de\s+credito|nc)\s*(?:n\.?º?|nr\.?|no\.?)?\s*[:\s]\s*([A-Z]{0,4}[-/\s]?\d{2,6}[-/]?\d{0,6})/i);
  if (numeroFatura?.[1] !== undefined) {
    campos.push({ campo: 'numero', rotulo: 'N.º da fatura', valor: numeroFatura[1].trim().replace(/\s+/g, ''), confianca: 0.9 });
  }

  const contrato = t.match(/\bC[-\s]?\d{4}[-\s]?[A-Z0-9]+\b/i);
  if (contrato?.[0] !== undefined) {
    campos.push({ campo: 'numeroContrato', rotulo: 'N.º do contrato', valor: contrato[0].replace(/\s+/g, '-').toUpperCase(), confianca: 0.95 });
  }

  // NIF/NIPC português: nove dígitos, precedido da menção. Sem a menção não se
  // arrisca — nove dígitos podem ser um IBAN truncado ou um número de encomenda.
  const nif = t.match(/\b(?:nif|nipc|contribuinte)\s*[:\s]\s*(\d{9})\b/i);
  if (nif?.[1] !== undefined) {
    campos.push({ campo: 'nifPrestador', rotulo: 'NIF do prestador', valor: nif[1], confianca: 0.92 });
  }

  const total = t.match(/\b(?:total|valor)\s*(?:s\/?\s*iva|sem\s+iva|liquido|il[ií]quido)?\s*[:\s]\s*([\d.\s]+,\d{2})/i);
  if (total?.[1] !== undefined) {
    campos.push({
      campo: 'montanteSemIva', rotulo: 'Montante s/ IVA',
      valor: total[1].replace(/[.\s]/g, '').replace(',', '.'), confianca: 0.85,
    });
  }

  return campos;
}

/** Lê um PDF: texto, tipo e campos. Nunca lança — devolve o que conseguiu. */
export async function lerDocumento(ficheiro: File): Promise<DocumentoLido> {
  try {
    const texto = await textoDoPdf(ficheiro);
    if (texto.trim().length < 20) {
      return {
        ficheiro: ficheiro.name, tipo: 'DESCONHECIDO', campos: [], texto: '',
        observacao: 'O PDF não tem camada de texto (é uma digitalização). Preencha os campos à mão.',
      };
    }
    const tipo = classificar(texto);
    return {
      ficheiro: ficheiro.name, tipo,
      campos: tipo === 'FATURA' || tipo === 'NOTA_CREDITO' ? extrairCampos(texto) : [],
      texto: texto.slice(0, 4000),
      ...(tipo === 'DESCONHECIDO' ? { observacao: 'Não reconheci o tipo de documento.' } : {}),
    };
  } catch {
    return {
      ficheiro: ficheiro.name, tipo: 'DESCONHECIDO', campos: [], texto: '',
      observacao: 'Não consegui ler o ficheiro.',
    };
  }
}

export const ROT_TIPO_DOC: Record<TipoDocumentoLido, string> = {
  FATURA: 'Fatura',
  RELATORIO_HORAS: 'Relatório de horas',
  NOTA_CREDITO: 'Nota de crédito',
  AUTO_ENTREGA: 'Auto de entrega',
  DESCONHECIDO: 'Por identificar',
};
