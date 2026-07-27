import type { Contrato } from '../entidades/contrato.js';
import type { Fatura } from '../entidades/faturacao.js';
import type { RegistoTempo } from '../entidades/registo-tempo.js';
import type { Cent, DataISO } from '../tipos/primitivos.js';
import type { LinhaOrcamento } from './orcamento.js';

/**
 * O PROJETO COMO UNIDADE DE LEITURA FINANCEIRA.
 *
 * Os contratos são o instrumento; o projeto é o que a organização reconhece. Um
 * projeto atravessa vários contratos e um contrato serve vários projetos, pelo
 * que a pergunta «quanto já gastei no projeto X» não tem resposta na ficha de
 * nenhum contrato — tem de ser somada aqui.
 *
 * Distingue-se sempre o EXECUTADO (trabalho aprovado, tenha sido faturado ou
 * não) do FATURADO E VALIDADO (o que já foi aceite para pagamento). São números
 * diferentes e confundi-los é o erro clássico: o executado antecipa a despesa
 * que vem a caminho, o validado é a que já está reconhecida.
 */

/** Linha de execução de um contrato dentro de um projeto. */
export interface ExecucaoContratoProjeto {
  contratoId: string;
  numero: string;
  objeto: string;
  precoContratualAtual: Cent;
  /** Trabalho aprovado imputado ao contrato (registos de tempo). */
  valorExecutado: Cent;
  /** Faturas validadas — montante aprovado, líquido de notas de crédito. */
  valorValidado: Cent;
  /** Preço contratual menos o executado. */
  valorPorExecutar: Cent;
  minutosAprovados: number;
  /** O contrato serve mais projetos além deste? A imputação não é exclusiva. */
  partilhado: boolean;
}

export interface ExecucaoProjeto {
  projetoId: string;
  contratos: ExecucaoContratoProjeto[];
  totalExecutado: Cent;
  totalValidado: Cent;
  totalContratado: Cent;
  totalPorExecutar: Cent;
  /** Execução por mês (AAAA-MM), pela data do registo aprovado. */
  porMes: Array<{ mes: string; valor: Cent; minutos: number }>;
}

/** Linha do previsto: o que ainda vai ser investido, e de onde vem a previsão. */
export interface PrevisaoContratoProjeto {
  origem: 'CONTRATO_EM_VIGOR' | 'ORCAMENTO';
  contratoId?: string;
  numero: string;
  objeto: string;
  /** Por executar num contrato vigente, ou encargo orçamentado. */
  valor: Cent;
  /** Ano em que o encargo cai (só nas linhas de orçamento). */
  ano?: number;
}

export interface PrevisaoProjeto {
  projetoId: string;
  linhas: PrevisaoContratoProjeto[];
  /** Valor por executar em contratos já em vigor. */
  totalEmContratosVigentes: Cent;
  /** Encargo previsto no orçamento preparado (se existir). */
  totalOrcamentado: Cent;
  total: Cent;
}

const mesDe = (d: DataISO): string => d.slice(0, 7);

/**
 * EXECUTADO num projeto: soma o que os contratos do projeto já consumiram.
 *
 * `contratosDoProjeto` recebe os identificadores associados ao projeto — a
 * relação é N:N e vive fora do domínio, por isso entra como argumento.
 */
export function execucaoDoProjeto(
  projetoId: string,
  contratosDoProjeto: ReadonlyArray<string>,
  contratos: ReadonlyArray<Contrato>,
  aprovados: ReadonlyArray<RegistoTempo>,
  faturas: ReadonlyArray<Fatura>,
  projetosPorContrato: (contratoId: string) => ReadonlyArray<string>,
): ExecucaoProjeto {
  const ids = new Set(contratosDoProjeto);
  const linhas: ExecucaoContratoProjeto[] = [];
  const porMes = new Map<string, { valor: Cent; minutos: number }>();

  for (const c of contratos.filter((x) => ids.has(x.id))) {
    const registos = aprovados.filter((r) => r.contratoId === c.id && r.estado === 'APROVADO');
    const valorExecutado = registos.reduce((s, r) => s + r.valorImputado, 0);
    const minutosAprovados = registos.reduce((s, r) => s + r.duracao, 0);
    const valorValidado = faturas
      .filter((f) => f.contratoId === c.id && f.estado === 'VALIDADA')
      .reduce((s, f) => s + (f.montanteAprovado ?? f.montanteSemIva), 0);

    for (const r of registos) {
      const m = mesDe(r.data);
      const atual = porMes.get(m) ?? { valor: 0, minutos: 0 };
      porMes.set(m, { valor: atual.valor + r.valorImputado, minutos: atual.minutos + r.duracao });
    }

    linhas.push({
      contratoId: c.id, numero: c.numero, objeto: c.objeto,
      precoContratualAtual: c.precoContratualAtual,
      valorExecutado, valorValidado,
      valorPorExecutar: Math.max(0, c.precoContratualAtual - valorExecutado),
      minutosAprovados,
      partilhado: projetosPorContrato(c.id).length > 1,
    });
  }

  return {
    projetoId,
    contratos: linhas.sort((a, b) => b.valorExecutado - a.valorExecutado),
    totalExecutado: linhas.reduce((s, l) => s + l.valorExecutado, 0),
    totalValidado: linhas.reduce((s, l) => s + l.valorValidado, 0),
    totalContratado: linhas.reduce((s, l) => s + l.precoContratualAtual, 0),
    totalPorExecutar: linhas.reduce((s, l) => s + l.valorPorExecutar, 0),
    porMes: [...porMes.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([mes, v]) => ({ mes, ...v })),
  };
}

/**
 * PREVISTO num projeto: o que falta executar nos contratos vigentes mais o que
 * o orçamento do ano seguinte já prevê. São duas naturezas diferentes — uma é
 * despesa contratada, a outra é intenção — e por isso somam-se mas apresentam-se
 * separadas.
 */
export function previsaoDoProjeto(
  projetoId: string,
  contratosDoProjeto: ReadonlyArray<string>,
  contratos: ReadonlyArray<Contrato>,
  aprovados: ReadonlyArray<RegistoTempo>,
  linhasOrcamento: ReadonlyArray<LinhaOrcamento>,
): PrevisaoProjeto {
  const ids = new Set(contratosDoProjeto);
  const linhas: PrevisaoContratoProjeto[] = [];

  for (const c of contratos.filter((x) => ids.has(x.id) && (x.estado === 'EM_VIGOR' || x.estado === 'SUSPENSO'))) {
    const executado = aprovados.filter((r) => r.contratoId === c.id && r.estado === 'APROVADO').reduce((s, r) => s + r.valorImputado, 0);
    const porExecutar = Math.max(0, c.precoContratualAtual - executado);
    if (porExecutar === 0) continue;
    linhas.push({ origem: 'CONTRATO_EM_VIGOR', contratoId: c.id, numero: c.numero, objeto: c.objeto, valor: porExecutar });
  }

  // As linhas de orçamento do projeto contam por ano, porque um encargo
  // plurianual não é uma despesa do ano seguinte.
  for (const l of linhasOrcamento.filter((x) => x.projetoId === projetoId)) {
    for (const r of l.reparticaoAnual) {
      if (r.montante === 0) continue;
      linhas.push({
        origem: 'ORCAMENTO', numero: l.contratoOrigemNumero ?? 'novo',
        objeto: l.designacao, valor: r.montante, ano: r.ano,
        ...(l.contratoOrigemId !== undefined ? { contratoId: l.contratoOrigemId } : {}),
      });
    }
  }

  const emVigor = linhas.filter((l) => l.origem === 'CONTRATO_EM_VIGOR').reduce((s, l) => s + l.valor, 0);
  const orcamentado = linhas.filter((l) => l.origem === 'ORCAMENTO').reduce((s, l) => s + l.valor, 0);
  return {
    projetoId,
    linhas: linhas.sort((a, b) => b.valor - a.valor),
    totalEmContratosVigentes: emVigor,
    totalOrcamentado: orcamentado,
    total: emVigor + orcamentado,
  };
}
