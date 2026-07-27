import { z } from 'zod';
import {
  RN_701, RN_702, RN_208,
  folgaParaPerfil, folgaParaValorHora, execucaoDoProjeto, previsaoDoProjeto,
  preverContrato, complementaresAcumulados, vigenciaLiquidaMeses, valorLegal,
  eurosTexto, dataTexto, formatarDiasUteis,
  type FonteResposta, type Proveniencia,
} from '@chora/domain';
import type { Capacidade, ContextoExecucao, ResultadoCapacidade, Simulacao, RegraAvaliada } from './tipos.js';
import { ServicoAfetacoes } from '../servicos/afetacoes.js';
import { ServicoAlertas } from '../servicos/alertas.js';
import { ErroValidacao } from '../erros/problema.js';

const F = (proveniencia: Proveniencia, referencia: string): FonteResposta => ({ proveniencia, referencia });
const horas = (min: number): number => Math.round(min / 60);
const euros = (c: number): number => +(c / 100).toFixed(2);

/** Normaliza para comparar números de contrato e nomes sem acentos nem caixa. */
const norm = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toUpperCase().replace(/\s+/g, ' ');

/** Resolve o contrato pelo número, com erro legível quando não existe. */
async function contratoPorNumero(numero: string, e: ContextoExecucao): Promise<import('@chora/domain').Contrato> {
  const alvo = norm(numero).replace(/\s/g, '');
  const c = (await e.ctx.repos.contratos.todos((x) => norm(x.numero).replace(/\s/g, '') === alvo))[0];
  if (c === undefined) throw new ErroValidacao(`Não há nenhum contrato com o número ${numero}.`);
  return c;
}

/** Resolve o projeto pelo nome ou identificador. */
async function projetoPorReferencia(ref: string, e: ContextoExecucao): Promise<{ id: string; nome: string }> {
  const projetos = await e.ctx.repos.projetos.todos();
  const alvo = norm(ref);
  const exato = projetos.find((p) => norm(p.nome) === alvo || norm(p.id) === alvo);
  if (exato !== undefined) return { id: exato.id, nome: exato.nome };
  const parcial = projetos.filter((p) => norm(p.nome).includes(alvo) || alvo.includes(norm(p.nome)));
  if (parcial.length === 1) return { id: parcial[0]!.id, nome: parcial[0]!.nome };
  if (parcial.length > 1) {
    throw new ErroValidacao(`«${ref}» corresponde a mais do que um projeto: ${parcial.map((p) => p.nome).join(', ')}. Seja mais específico.`);
  }
  throw new ErroValidacao(`Não conheço o projeto «${ref}». Projetos existentes: ${projetos.map((p) => p.nome).join(', ') || 'nenhum'}.`);
}

/** Contratos associados a um projeto (relação N:N). */
async function contratosDoProjeto(projetoId: string, e: ContextoExecucao): Promise<string[]> {
  return (await e.ctx.repos.contratoProjetos.todos((a) => a.projetoId === projetoId)).map((a) => a.contratoId);
}

/** Avalia uma regra em seco, para a simulação. */
function avaliar<T>(regra: { codigo: string; descricao: string; avaliar(d: T): { ok: boolean; mensagem?: string } }, dados: T): RegraAvaliada {
  const r = regra.avaliar(dados);
  return { codigo: regra.codigo, descricao: regra.descricao, ok: r.ok, ...(r.ok ? {} : { mensagem: r.mensagem }) };
}

// ─── CONSULTAS ──────────────────────────────────────────────────────────────

const saldoContrato: Capacidade<{ contratoNumero: string }> = {
  nome: 'contrato.saldo',
  titulo: 'Saldo por executar de um contrato',
  descricao: 'Quanto falta executar de um contrato, e se o ritmo recente chega para o consumir até ao término.',
  tipo: 'CONSULTA',
  parametros: z.object({ contratoNumero: z.string().min(1) }),
  parametrosDescricao: [{ nome: 'contratoNumero', tipo: 'texto', obrigatorio: true, descricao: 'Número do contrato, ex.: C-2026-001' }],
  regras: [],
  exemplos: ['Qual o saldo por executar do C-2026-001?', 'Quanto falta gastar no C-2026-003?'],
  async executar({ contratoNumero }, e) {
    const contrato = await contratoPorNumero(contratoNumero, e);
    const aprovados = await e.ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO');
    const p = preverContrato(contrato, aprovados, e.hoje);
    return {
      texto:
        `O contrato ${contrato.numero} tem ${eurosTexto(p.valorRestante)} por executar, de ${eurosTexto(p.valorAtual)} contratados ` +
        `(${Math.round((p.valorExecutado / Math.max(1, p.valorAtual)) * 100)}% executado). ` +
        (p.gapNoTermino > 0
          ? `Ao ritmo das últimas semanas, sobram ${eurosTexto(p.gapNoTermino)} por executar no término (${dataTexto(contrato.dataTerminoContratual)}).`
          : 'Ao ritmo atual, o valor é integralmente executado até ao término.'),
      fontes: [F('REGRA', 'Execução aprovada registada'), F('PROJECAO', 'Ritmo das últimas 6 semanas')],
    };
  },
};

const complementaresContrato: Capacidade<{ contratoNumero: string }> = {
  nome: 'contrato.complementares',
  titulo: 'Margem para trabalhos complementares',
  descricao: 'Quanto ainda cabe em serviços complementares antes de se atingir o teto legal de 50% do preço inicial.',
  tipo: 'CONSULTA',
  parametros: z.object({ contratoNumero: z.string().min(1) }),
  parametrosDescricao: [{ nome: 'contratoNumero', tipo: 'texto', obrigatorio: true, descricao: 'Número do contrato' }],
  regras: ['RN-301', 'RN-302'],
  exemplos: ['Quanto posso ainda gastar em complementares no C-2026-003?'],
  async executar({ contratoNumero }, e) {
    const contrato = await contratoPorNumero(contratoNumero, e);
    const alteracoes = await e.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id);
    const pct = valorLegal('COMPLEMENTARES_MAX_PCT', 0.5);
    const teto = Math.floor(contrato.precoContratualInicial * pct);
    const acumulado = complementaresAcumulados(alteracoes);
    const folga = Math.max(0, teto - acumulado);
    return {
      texto:
        `${eurosTexto(folga)}. O contrato ${contrato.numero} tem ${eurosTexto(contrato.precoContratualInicial)} de preço inicial, ` +
        `o que fixa o teto de complementares em ${eurosTexto(teto)} (${Math.round(pct * 100)}%). Já foram acumulados ${eurosTexto(acumulado)}.` +
        (folga === 0 ? ' O teto está esgotado: qualquer acréscimo seria ilegal, não apenas desaconselhado.' : ''),
      fontes: [F('REGRA', 'RN-301 — limite de 50% (CCP, art. 370.º n.º 4)'), F('REGRA', 'RN-302 — alerta aos 40%')],
    };
  },
};

const vigenciaContrato: Capacidade<{ contratoNumero: string }> = {
  nome: 'contrato.vigencia',
  titulo: 'Vigência de um contrato',
  descricao: 'Até quando o contrato vigora e qual a vigência líquida, descontadas as suspensões.',
  tipo: 'CONSULTA',
  parametros: z.object({ contratoNumero: z.string().min(1) }),
  parametrosDescricao: [{ nome: 'contratoNumero', tipo: 'texto', obrigatorio: true, descricao: 'Número do contrato' }],
  regras: ['RN-202'],
  exemplos: ['Até quando vigora o C-2026-001?', 'Qual a vigência do C-2026-BH2?'],
  async executar({ contratoNumero }, e) {
    const contrato = await contratoPorNumero(contratoNumero, e);
    const alteracoes = await e.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id);
    const liquida = vigenciaLiquidaMeses(contrato.dataInicioVigencia, contrato.dataTerminoContratual, alteracoes);
    return {
      texto:
        `O contrato ${contrato.numero} vigora de ${dataTexto(contrato.dataInicioVigencia)} a ${dataTexto(contrato.dataTerminoContratual)}. ` +
        `A vigência líquida, descontadas as suspensões, é de ${liquida.toFixed(1)} meses.`,
      fontes: [F('REGRA', 'RN-202 — limite de vigência de 36 meses'), F('REGRA', 'RN-205 — suspensões deslocam o prazo')],
    };
  },
};

const decisoesPendentes: Capacidade<{ contratoNumero?: string }> = {
  nome: 'decisoes.pendentes',
  titulo: 'Decisões pendentes',
  descricao: 'O que está por decidir, com a data-limite mais apertada em primeiro lugar.',
  tipo: 'CONSULTA',
  parametros: z.object({ contratoNumero: z.string().optional() }),
  parametrosDescricao: [{ nome: 'contratoNumero', tipo: 'texto', obrigatorio: false, descricao: 'Restringe a um contrato; sem ele, toda a carteira' }],
  regras: [],
  exemplos: ['O que tenho de decidir com urgência?', 'Que decisões estão pendentes no C-2026-001?'],
  async executar({ contratoNumero }, e) {
    const contrato = contratoNumero !== undefined ? await contratoPorNumero(contratoNumero, e) : undefined;
    const pendentes = await new ServicoAlertas(e.ctx).pendentes(contrato?.id);
    const alvo = contrato !== undefined ? `o contrato ${contrato.numero}` : 'a carteira';
    if (pendentes.length === 0) {
      return { texto: `Não há decisões pendentes para ${alvo}.`, fontes: [F('REGRA', 'Catálogo de alertas')] };
    }
    const vencidas = pendentes.filter((a) => (a.diasParaLimite ?? 1) < 0);
    const proxima = [...pendentes].sort((a, b) => (a.diasParaLimite ?? 9e9) - (b.diasParaLimite ?? 9e9))[0]!;
    return {
      texto:
        `Há ${pendentes.length} decisão(ões) pendente(s) para ${alvo}` +
        (vencidas.length > 0 ? `, das quais ${vencidas.length} com o prazo já vencido` : '') +
        `. A mais urgente é «${proxima.titulo}»` +
        (proxima.dataLimiteAcao !== undefined
          ? `, com data-limite em ${dataTexto(proxima.dataLimiteAcao)}.`
          : '.'),
      tabela: {
        titulo: 'Decisões pendentes',
        colunas: ['Contrato', 'Decisão', 'Data-limite', 'Dias'],
        linhas: pendentes
          .sort((a, b) => (a.diasParaLimite ?? 9e9) - (b.diasParaLimite ?? 9e9))
          .map((a) => [a.contratoId, a.titulo, a.dataLimiteAcao ?? '—', a.diasParaLimite ?? '—']),
      },
      fontes: [F('REGRA', 'Catálogo de alertas — decisões abertas ou em curso')],
    };
  },
};

const folgaPorPerfil: Capacidade<{ perfil: string }> = {
  nome: 'capacidade.folga-por-perfil',
  titulo: 'Onde cabe mais gente de um perfil',
  descricao: 'Contratos com horas por consumir num perfil equivalente ao indicado, e quantas pessoas a tempo inteiro comportam até ao término.',
  tipo: 'CONSULTA',
  parametros: z.object({ perfil: z.string().min(2) }),
  parametrosDescricao: [{ nome: 'perfil', tipo: 'texto', obrigatorio: true, descricao: 'Designação do perfil, ex.: arquiteto de software' }],
  regras: [],
  exemplos: [
    'Que contratos têm folga para comportar mais pessoas do perfil arquiteto?',
    'Onde posso colocar mais um consultor funcional?',
  ],
  async executar({ perfil }, e) {
    const [contratos, perfis, afetacoes, aprovados] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.perfis.todos(),
      e.ctx.repos.afetacoes.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
    ]);
    const folgas = folgaParaPerfil(perfil, contratos, perfis, afetacoes, aprovados, e.hoje);
    if (folgas.length === 0) {
      return {
        texto: `Nenhum contrato em execução tem perfil equivalente a «${perfil}» com horas por consumir. Pode ser preciso criar o perfil num contrato com valor disponível — pergunte por folga a um dado valor/hora.`,
        fontes: [F('REGRA', 'Saldos de perfil sobre execução aprovada')], semResultado: true,
      };
    }
    const comEspaco = folgas.filter((f) => f.pessoasComportadas >= 1);
    const melhor = folgas[0]!;
    return {
      texto:
        (comEspaco.length > 0
          ? `${comEspaco.length} contrato(s) comportam pelo menos mais uma pessoa a tempo inteiro no perfil «${perfil}». `
          : `Nenhum contrato comporta uma pessoa a tempo inteiro até ao término, mas há horas disponíveis para afetação parcial. `) +
        `O maior espaço está no ${melhor.contratoNumero} (${melhor.perfilNome}): ${horas(melhor.minutosDisponiveis)} h por consumir ` +
        `em ${formatarDiasUteis(melhor.diasUteisRestantes)} de vigência, a ${eurosTexto(melhor.valorHora)}/h. ` +
        'A mobilização exige coincidência de perfil e de entidade executante (RN-701); entidade diferente já é subcontratação (RN-702).',
      tabela: {
        titulo: `Folga para o perfil «${perfil}»`,
        colunas: ['Contrato', 'Perfil', 'Horas disponíveis', 'Valor/hora', 'Dias úteis até ao fim', 'Pessoas a tempo inteiro', 'Já afetas', 'NIPC'],
        linhas: folgas.map((f) => [
          f.contratoNumero, f.perfilNome, horas(f.minutosDisponiveis), euros(f.valorHora),
          f.diasUteisRestantes, f.pessoasComportadas, f.pessoasAfetas, f.entidadeNipc,
        ]),
      },
      fontes: [
        F('REGRA', 'Saldos de perfil sobre execução aprovada'),
        F('REGRA', 'RN-701 — substituição exige perfil e entidade coincidentes'),
        F('PROJECAO', 'Dias úteis até ao término × 8 h por pessoa'),
      ],
    };
  },
};

const folgaPorValorHora: Capacidade<{ valorHoraEuros: number }> = {
  nome: 'capacidade.folga-por-valor-hora',
  titulo: 'Onde cabe um perfil a um dado valor/hora',
  descricao: 'Contratos com valor por executar que comporta um perfil ao preço/hora indicado, com indicação de perfil compatível já existente.',
  tipo: 'CONSULTA',
  parametros: z.object({ valorHoraEuros: z.number().positive() }),
  parametrosDescricao: [{ nome: 'valorHoraEuros', tipo: 'número', obrigatorio: true, descricao: 'Valor/hora em euros, ex.: 45' }],
  regras: [],
  exemplos: [
    'Que contratos têm folga para comportar um perfil que custa 45 euros por hora?',
    'Onde cabe alguém a 60 €/h?',
  ],
  async executar({ valorHoraEuros }, e) {
    const [contratos, perfis, aprovados] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.perfis.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
    ]);
    const cent = Math.round(valorHoraEuros * 100);
    const folgas = folgaParaValorHora(cent, contratos, perfis, aprovados, e.hoje);
    if (folgas.length === 0) {
      return { texto: `Nenhum contrato em execução tem valor por executar que comporte um perfil a ${eurosTexto(cent)}/h.`, fontes: [], semResultado: true };
    }
    const melhor = folgas[0]!;
    return {
      texto:
        `${folgas.length} contrato(s) têm valor por executar. O maior é o ${melhor.contratoNumero}, com ${eurosTexto(melhor.valorDisponivel)} disponíveis — ` +
        `${melhor.horasComportadas.toLocaleString('pt-PT')} h a ${eurosTexto(cent)}/h, o que sustenta ${melhor.pessoasComportadas} pessoa(s) a tempo inteiro ` +
        `nos ${formatarDiasUteis(melhor.diasUteisRestantes)} que restam de vigência. ` +
        (melhor.perfilCompativel !== undefined
          ? `Já existe um perfil compatível («${melhor.perfilCompativel.nome}», a ${eurosTexto(melhor.perfilCompativel.valorHora)}/h): afete a esse em vez de criar outro.`
          : 'Não há perfil compatível: seria preciso criá-lo, o que é um ato de estrutura do contrato.'),
      tabela: {
        titulo: `Folga para um perfil a ${euros(cent)} €/h`,
        colunas: ['Contrato', 'Objeto', 'Valor disponível', 'Horas que compra', 'Pessoas a tempo inteiro', 'Perfil compatível', 'NIPC'],
        linhas: folgas.map((f) => [
          f.contratoNumero, f.contratoObjeto, euros(f.valorDisponivel), f.horasComportadas,
          f.pessoasComportadas, f.perfilCompativel?.nome ?? '— (criar)', f.entidadeNipc,
        ]),
      },
      fontes: [
        F('REGRA', 'Preço contratual atual menos execução aprovada'),
        F('PROJECAO', 'Dias úteis até ao término × 8 h por pessoa'),
      ],
    };
  },
};

const projetoExecutado: Capacidade<{ projeto: string }> = {
  nome: 'projeto.executado',
  titulo: 'Total já gasto num projeto',
  descricao: 'Soma o trabalho aprovado e a faturação validada de todos os contratos do projeto, por contrato e por mês. Exportável.',
  tipo: 'CONSULTA',
  parametros: z.object({ projeto: z.string().min(1) }),
  parametrosDescricao: [{ nome: 'projeto', tipo: 'texto', obrigatorio: true, descricao: 'Nome ou identificador do projeto' }],
  operacao: 'gerir.contratos',
  regras: [],
  exemplos: [
    'Qual o total de dinheiro já gasto no projeto Modernização documental?',
    'Quanto já se gastou no projeto P1?',
  ],
  async executar({ projeto }, e) {
    const p = await projetoPorReferencia(projeto, e);
    const ids = await contratosDoProjeto(p.id, e);
    const [contratos, aprovados, faturas, associacoes] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
      e.ctx.repos.faturas.todos(),
      e.ctx.repos.contratoProjetos.todos(),
    ]);
    const porContrato = new Map<string, string[]>();
    for (const a of associacoes) porContrato.set(a.contratoId, [...(porContrato.get(a.contratoId) ?? []), a.projetoId]);

    const x = execucaoDoProjeto(p.id, ids, contratos, aprovados, faturas, (cid) => porContrato.get(cid) ?? []);
    if (x.contratos.length === 0) {
      return { texto: `O projeto ${p.nome} não tem contratos associados.`, fontes: [], semResultado: true };
    }
    const partilhados = x.contratos.filter((c) => c.partilhado);
    return {
      texto:
        `O projeto ${p.nome} já consumiu ${eurosTexto(x.totalExecutado)} em trabalho aprovado, de ${eurosTexto(x.totalContratado)} contratados ` +
        `em ${x.contratos.length} contrato(s). Desse valor, ${eurosTexto(x.totalValidado)} estão em faturas já validadas — a diferença é trabalho ` +
        'aprovado ainda por faturar. Restam ' + eurosTexto(x.totalPorExecutar) + ' por executar.' +
        (partilhados.length > 0
          ? ` Atenção: ${partilhados.length} contrato(s) servem mais do que um projeto, pelo que o valor não é exclusivo deste.`
          : ''),
      tabela: {
        titulo: `Execução do projeto ${p.nome}`,
        colunas: ['Contrato', 'Objeto', 'Contratado', 'Executado', 'Validado', 'Por executar', 'Horas aprovadas', 'Partilhado'],
        linhas: x.contratos.map((c) => [
          c.numero, c.objeto, euros(c.precoContratualAtual), euros(c.valorExecutado), euros(c.valorValidado),
          euros(c.valorPorExecutar), horas(c.minutosAprovados), c.partilhado ? 'sim' : 'não',
        ]),
      },
      exportavel: {
        nome: `execucao-${p.nome}`,
        folhas: [
          {
            nome: 'Por contrato',
            linhas: x.contratos.map((c) => ({
              'Contrato': c.numero, 'Objeto': c.objeto,
              'Contratado': euros(c.precoContratualAtual), 'Executado': euros(c.valorExecutado),
              'Faturado e validado': euros(c.valorValidado), 'Por executar': euros(c.valorPorExecutar),
              'Horas aprovadas': horas(c.minutosAprovados), 'Partilhado com outros projetos': c.partilhado ? 'Sim' : 'Não',
            })),
          },
          {
            nome: 'Por mês',
            linhas: x.porMes.map((m) => ({ 'Mês': m.mes, 'Valor executado': euros(m.valor), 'Horas': horas(m.minutos) })),
          },
        ],
      },
      fontes: [
        F('REGRA', 'Registos de tempo aprovados'),
        F('REGRA', 'Faturas validadas — montante aprovado líquido de notas de crédito'),
      ],
    };
  },
};

const projetoPrevisto: Capacidade<{ projeto: string }> = {
  nome: 'projeto.previsto',
  titulo: 'Total previsto investir num projeto',
  descricao: 'O que falta executar nos contratos vigentes mais o que o orçamento preparado já prevê, por ano. Exportável.',
  tipo: 'CONSULTA',
  parametros: z.object({ projeto: z.string().min(1) }),
  parametrosDescricao: [{ nome: 'projeto', tipo: 'texto', obrigatorio: true, descricao: 'Nome ou identificador do projeto' }],
  operacao: 'gerir.contratos',
  regras: [],
  exemplos: [
    'Qual o total de dinheiro previsto investir no projeto Assinatura digital?',
    'Quanto vamos investir no projeto P2?',
  ],
  async executar({ projeto }, e) {
    const p = await projetoPorReferencia(projeto, e);
    const ids = await contratosDoProjeto(p.id, e);
    const [contratos, aprovados, orcamentos] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
      e.ctx.repos.orcamentos.todos(),
    ]);
    // O orçamento mais recente é a intenção em vigor.
    const orcamento = [...orcamentos].sort((a, b) => b.ano - a.ano)[0];
    const x = previsaoDoProjeto(p.id, ids, contratos, aprovados, orcamento?.linhas ?? []);
    if (x.linhas.length === 0) {
      return { texto: `O projeto ${p.nome} não tem valor por executar nem encargo orçamentado.`, fontes: [], semResultado: true };
    }
    return {
      texto:
        `Está previsto investir ${eurosTexto(x.total)} no projeto ${p.nome}: ${eurosTexto(x.totalEmContratosVigentes)} por executar em ` +
        `contratos já em vigor` +
        (x.totalOrcamentado > 0
          ? ` e ${eurosTexto(x.totalOrcamentado)} de encargo previsto no orçamento de ${orcamento?.ano ?? '—'}.`
          : '. Não há orçamento preparado que acrescente encargo a este projeto.') +
        ' São naturezas diferentes: a primeira é despesa contratada, a segunda é intenção sujeita a autorização.',
      tabela: {
        titulo: `Investimento previsto no projeto ${p.nome}`,
        colunas: ['Origem', 'Contrato', 'Objeto', 'Ano', 'Valor'],
        linhas: x.linhas.map((l) => [
          l.origem === 'CONTRATO_EM_VIGOR' ? 'Contrato em vigor' : 'Orçamento',
          l.numero, l.objeto, l.ano ?? '—', euros(l.valor),
        ]),
      },
      exportavel: {
        nome: `previsao-${p.nome}`,
        folhas: [{
          nome: 'Investimento previsto',
          linhas: x.linhas.map((l) => ({
            'Origem': l.origem === 'CONTRATO_EM_VIGOR' ? 'Contrato em vigor' : 'Orçamento',
            'Contrato': l.numero, 'Objeto': l.objeto, 'Ano': l.ano ?? '', 'Valor': euros(l.valor),
          })),
        }],
      },
      fontes: [
        F('REGRA', 'Preço contratual atual menos execução aprovada'),
        F('PROJECAO', `Linhas do orçamento de ${orcamento?.ano ?? '—'}`),
      ],
    };
  },
};

// ─── AÇÕES ──────────────────────────────────────────────────────────────────

const zSubstituir = z.object({
  contratoNumero: z.string().min(1),
  perfil: z.string().min(1),
  pessoaEntra: z.string().min(1),
  pessoaSai: z.string().optional(),
});
type ParamsSubstituir = z.infer<typeof zSubstituir>;

/**
 * Resolve a afetação a substituir e a pessoa que entra. Falha com mensagem
 * legível — é preferível o assistente pedir precisão a executar sobre a pessoa
 * errada.
 */
async function resolverSubstituicao(p: ParamsSubstituir, e: ContextoExecucao): Promise<{
  contrato: import('@chora/domain').Contrato;
  perfil: import('@chora/domain').PerfilContratual;
  afetacao: import('@chora/domain').Afetacao;
  recursoEntra: { id: string; nome: string };
  nomeSai: string;
}> {
  const contrato = await contratoPorNumero(p.contratoNumero, e);
  const perfis = await e.ctx.repos.perfis.todos((x) => x.contratoId === contrato.id);
  const alvo = norm(p.perfil);
  const perfil = perfis.find((x) => norm(x.nome) === alvo) ?? perfis.find((x) => norm(x.nome).includes(alvo) || alvo.includes(norm(x.nome)));
  if (perfil === undefined) {
    throw new ErroValidacao(`O contrato ${contrato.numero} não tem perfil «${p.perfil}». Perfis existentes: ${perfis.map((x) => x.nome).join(', ') || 'nenhum'}.`);
  }

  const ativas = await e.ctx.repos.afetacoes.todos((a) => a.perfilId === perfil.id && a.ativa);
  if (ativas.length === 0) throw new ErroValidacao(`Não há ninguém afeto ao perfil ${perfil.nome} do contrato ${contrato.numero}: não há substituição a fazer.`);

  const candidatosEntra = e.ctx.diretorio.procurar(p.pessoaEntra);
  if (candidatosEntra.length === 0) throw new ErroValidacao(`Não encontrei ninguém chamado «${p.pessoaEntra}».`);
  if (candidatosEntra.length > 1) {
    throw new ErroValidacao(`«${p.pessoaEntra}» corresponde a mais do que uma pessoa: ${candidatosEntra.map((c) => c.nome).join(', ')}.`);
  }
  const recursoEntra = candidatosEntra[0]!;

  let afetacao = ativas[0]!;
  if (p.pessoaSai !== undefined) {
    const candidatosSai = e.ctx.diretorio.procurar(p.pessoaSai);
    const encontrada = ativas.find((a) => candidatosSai.some((c) => c.id === a.recursoId));
    if (encontrada === undefined) throw new ErroValidacao(`«${p.pessoaSai}» não está afeta ao perfil ${perfil.nome} do contrato ${contrato.numero}.`);
    afetacao = encontrada;
  } else if (ativas.length > 1) {
    const nomes = ativas.map((a) => e.ctx.diretorio.nome(a.recursoId) ?? a.recursoId);
    throw new ErroValidacao(`Há ${ativas.length} pessoas afetas ao perfil ${perfil.nome}: ${nomes.join(', ')}. Indique qual sai.`);
  }
  return { contrato, perfil, afetacao, recursoEntra, nomeSai: e.ctx.diretorio.nome(afetacao.recursoId) ?? afetacao.recursoId };
}

const substituirAfetacao: Capacidade<ParamsSubstituir> = {
  nome: 'afetacao.substituir',
  titulo: 'Substituir a pessoa afeta a um perfil',
  descricao: 'Encerra a afetação atual e cria a sucessora com outra pessoa, no mesmo perfil e na mesma entidade executante.',
  tipo: 'ACAO',
  parametros: zSubstituir,
  parametrosDescricao: [
    { nome: 'contratoNumero', tipo: 'texto', obrigatorio: true, descricao: 'Número do contrato' },
    { nome: 'perfil', tipo: 'texto', obrigatorio: true, descricao: 'Perfil contratual onde a troca acontece' },
    { nome: 'pessoaEntra', tipo: 'texto', obrigatorio: true, descricao: 'Nome de quem passa a estar afeto' },
    { nome: 'pessoaSai', tipo: 'texto', obrigatorio: false, descricao: 'Nome de quem sai; só necessário se houver mais do que uma pessoa no perfil' },
  ],
  operacao: 'gerir.afetacoes',
  regras: ['RN-701', 'RN-702', 'RN-208'],
  exemplos: [
    'Troca a pessoa X para o perfil Y do contrato Z',
    'Substitui a Carla Andrade pelo Diogo Marques no perfil Técnico Júnior do C-2026-001',
  ],

  async simular(p, e): Promise<Simulacao> {
    const { contrato, perfil, afetacao, recursoEntra, nomeSai } = await resolverSubstituicao(p, e);
    const [recursoAntigo, recursoNovo] = await Promise.all([
      e.ctx.repos.recursos.obter(afetacao.recursoId),
      e.ctx.repos.recursos.obter(recursoEntra.id),
    ]);
    const aprovados = await e.ctx.repos.registosTempo.todos((r) => r.perfilId === perfil.id && r.estado === 'APROVADO');
    const consumidos = aprovados.reduce((s, r) => s + r.duracao, 0);
    const doQueSai = aprovados.filter((r) => r.recursoId === afetacao.recursoId).reduce((s, r) => s + r.duracao, 0);
    const restantes = Math.max(0, perfil.quantidadePrevista - consumidos);

    const entidadeAntiga = recursoAntigo?.entidadeExecutanteNipc ?? '';
    const entidadeNova = recursoNovo?.entidadeExecutanteNipc ?? '';
    const regras: RegraAvaliada[] = [
      avaliar(RN_701, {
        perfilAntigo: perfil.id, perfilNovo: perfil.id,
        entidadeAntiga, entidadeNova, encerraAnterior: true,
      }),
      avaliar(RN_702, { entidadeExecutanteNipc: entidadeNova }),
      avaliar(RN_208, { estado: contrato.estado }),
    ];

    const avisos: string[] = [];
    if (recursoNovo === null) avisos.push(`${recursoEntra.nome} ainda não está registado como recurso: será preciso criá-lo antes de o afetar.`);
    else if (!recursoNovo.ativo) avisos.push(`${recursoEntra.nome} está inativo.`);
    if (entidadeNova !== '' && entidadeNova !== entidadeAntiga) {
      avisos.push(`As entidades executantes não coincidem (${entidadeAntiga} → ${entidadeNova}): não é substituição, é subcontratação ou cessão.`);
    }
    if (restantes === 0) avisos.push('O perfil não tem horas por consumir: a sucessora não teria trabalho imputável.');

    return {
      titulo: `Substituição de afetação · ${contrato.numero} · ${perfil.nome}`,
      efeitos: [
        `Sai ${nomeSai}${entidadeAntiga !== '' ? ` (entidade ${entidadeAntiga})` : ''}.`,
        `Entra ${recursoEntra.nome}${entidadeNova !== '' ? ` (entidade ${entidadeNova})` : ''}.`,
        `A afetação atual é encerrada em ${dataTexto(e.hoje)} e criada uma sucessora que a referencia.`,
        `As ${horas(doQueSai)} h já registadas por ${nomeSai} mantêm-se imputadas ao perfil e não são afetadas.`,
        `Restam ${horas(restantes)} h no perfil, que passam a poder ser executadas por ${recursoEntra.nome}.`,
      ],
      regras, avisos,
      bloqueada: regras.some((r) => !r.ok) || recursoNovo === null,
    };
  },

  async executar(p, e) {
    const { contrato, perfil, afetacao, recursoEntra, nomeSai } = await resolverSubstituicao(p, e);
    const r = await new ServicoAfetacoes(e.ctx).substituir(afetacao.id, recursoEntra.id, e.utilizador);
    return {
      texto:
        `Substituição registada no contrato ${contrato.numero}, perfil ${perfil.nome}: ${nomeSai} sai e ${recursoEntra.nome} entra. ` +
        `A afetação anterior foi encerrada e criada a sucessora ${r.sucessora.id}, que a referencia para efeitos de histórico.`,
      fontes: [
        F('REGRA', 'RN-701 — substituição com perfil e entidade coincidentes'),
        F('REGRA', 'Registo de auditoria da operação SUBSTITUIR'),
      ],
    };
  },
};

const registarFatura: Capacidade<{ contratoNumero?: string; numeroFatura?: string; nifPrestador?: string; montanteSemIvaEuros?: number }> = {
  nome: 'fatura.registar',
  titulo: 'Registar e conferir uma fatura',
  descricao: 'Abre o ecrã de conferência de faturas na conversa, com os campos já preenchidos a partir do que foi lido nos documentos.',
  tipo: 'ACAO',
  parametros: z.object({
    contratoNumero: z.string().optional(),
    numeroFatura: z.string().optional(),
    nifPrestador: z.string().optional(),
    montanteSemIvaEuros: z.number().optional(),
  }),
  parametrosDescricao: [
    { nome: 'contratoNumero', tipo: 'texto', obrigatorio: false, descricao: 'Número do contrato lido na fatura' },
    { nome: 'numeroFatura', tipo: 'texto', obrigatorio: false, descricao: 'Número da fatura' },
    { nome: 'nifPrestador', tipo: 'texto', obrigatorio: false, descricao: 'NIF do prestador lido na fatura' },
    { nome: 'montanteSemIvaEuros', tipo: 'número', obrigatorio: false, descricao: 'Montante sem IVA, em euros' },
  ],
  operacao: 'gerir.faturas.compromissos',
  regras: ['RN-601', 'RN-602', 'RN-603', 'RN-604', 'RN-607', 'RN-613'],
  exemplos: ['Quero validar esta fatura', 'Regista esta fatura do C-2026-001'],
  async executar(p, e) {
    const contrato = p.contratoNumero !== undefined ? await contratoPorNumero(p.contratoNumero, e).catch(() => null) : null;
    return {
      texto: contrato !== null
        ? `Registo de fatura do contrato ${contrato.numero} (${contrato.prestador.nome}). Confirme os campos e siga a conferência aqui mesmo.`
        : 'Registo de fatura. Indique o número do contrato para a aplicação identificar o que a fatura liquida (RN-613).',
      ui: {
        ecra: 'FATURACAO',
        titulo: 'Registar e conferir fatura',
        props: {
          numeroContrato: p.contratoNumero ?? '',
          numero: p.numeroFatura ?? '',
          nifPrestador: p.nifPrestador ?? '',
          montanteSemIva: p.montanteSemIvaEuros !== undefined ? String(p.montanteSemIvaEuros) : '',
        },
      },
      fontes: [F('REGRA', 'RN-613 — a fatura identifica o contrato e o prestador')],
    };
  },
};

/**
 * O catálogo. Tudo o que o assistente pode fazer está nesta lista.
 *
 * A ordem não é indiferente: as primeiras alimentam as sugestões oferecidas a
 * quem não sabe o que perguntar, e por isso abrem com as que ninguém adivinha
 * que existem — as de capacidade e as de projeto. O saldo de um contrato
 * qualquer pessoa pensa em perguntar.
 */
export const CAPACIDADES: ReadonlyArray<Capacidade<never>> = [
  folgaPorPerfil, folgaPorValorHora, projetoExecutado, projetoPrevisto,
  decisoesPendentes, saldoContrato, complementaresContrato, vigenciaContrato,
  substituirAfetacao, registarFatura,
] as unknown as ReadonlyArray<Capacidade<never>>;

export function capacidadePorNome(nome: string): Capacidade<never> | undefined {
  return CAPACIDADES.find((c) => c.nome === nome);
}

export type { ResultadoCapacidade };
