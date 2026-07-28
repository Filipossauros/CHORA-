import { z } from 'zod';
import {
  folgaParaPerfil, folgaParaValorHora, execucaoDoProjeto, previsaoDoProjeto,
  avaliarCarteira, contratosATerminar, resumoCarteira,
  preverContrato, complementaresAcumulados, vigenciaLiquidaMeses, valorLegal,
  estadoEntregavel, eurosTexto, dataTexto, formatarDiasUteis, dentroDoIntervalo,
} from '@chora/domain';
import type { Capacidade } from '../tipos.js';
import { ServicoAlertas } from '../../servicos/alertas.js';
import { F, K, horas, euros, contratoDe, projetoDe, pessoaDe, periodoDe, DESC_CONTRATO, DESC_PERIODO } from './comum.js';

const zContrato = z.object({ contratoNumero: z.string().optional() });
const zContratoPeriodo = z.object({
  contratoNumero: z.string().optional(), periodoDe: z.string().optional(), periodoAte: z.string().optional(),
});

// ─── CONTRATO ───────────────────────────────────────────────────────────────

export const saldoContrato: Capacidade<z.infer<typeof zContrato>> = {
  nome: 'contrato.saldo',
  titulo: 'Saldo por executar de um contrato',
  descricao: 'Quanto falta executar, e se o ritmo recente chega para o consumir até ao término.',
  tipo: 'CONSULTA',
  parametros: zContrato,
  parametrosDescricao: [DESC_CONTRATO],
  regras: [],
  exemplos: ['Qual o saldo por executar do C-2026-001?', 'Quanto falta gastar no contrato de outsourcing?'],
  async executar({ contratoNumero }, e) {
    const contrato = await contratoDe(contratoNumero, e);
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
      proximos: p.gapNoTermino > 0
        ? [
          { rotulo: 'Prorrogar a vigência', frase: `Prorrogar a vigência do ${contrato.numero}` },
          { rotulo: 'Transitar o saldo para o ano seguinte', frase: `Transitar o saldo do ${contrato.numero}` },
          { rotulo: 'Ver quem está afeto', frase: `Quem está afeto ao ${contrato.numero}?` },
        ]
        : [{ rotulo: 'Ver a vigência', frase: `Qual a vigência do ${contrato.numero}?` }],
    };
  },
};

export const complementaresContrato: Capacidade<z.infer<typeof zContrato>> = {
  nome: 'contrato.complementares',
  titulo: 'Margem para trabalhos complementares',
  descricao: 'Quanto ainda cabe em serviços complementares antes do teto legal de 50% do preço inicial.',
  tipo: 'CONSULTA',
  parametros: zContrato,
  parametrosDescricao: [DESC_CONTRATO],
  regras: ['RN-301', 'RN-302'],
  exemplos: ['Quanto posso ainda gastar em complementares no C-2026-003?'],
  async executar({ contratoNumero }, e) {
    const contrato = await contratoDe(contratoNumero, e);
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
      ...(folga > 0 ? { proximos: [{ rotulo: 'Registar complementares', frase: `Registar trabalhos complementares no ${contrato.numero}` }] } : {}),
    };
  },
};

export const vigenciaContrato: Capacidade<z.infer<typeof zContrato>> = {
  nome: 'contrato.vigencia',
  titulo: 'Vigência de um contrato',
  descricao: 'Até quando vigora e qual a vigência líquida, descontadas as suspensões.',
  tipo: 'CONSULTA',
  parametros: zContrato,
  parametrosDescricao: [DESC_CONTRATO],
  regras: ['RN-202'],
  exemplos: ['Até quando vigora o C-2026-001?', 'E a vigência?'],
  async executar({ contratoNumero }, e) {
    const contrato = await contratoDe(contratoNumero, e);
    const alteracoes = await e.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id);
    const liquida = vigenciaLiquidaMeses(contrato.dataInicioVigencia, contrato.dataTerminoContratual, alteracoes);
    return {
      texto:
        `O contrato ${contrato.numero} vigora de ${dataTexto(contrato.dataInicioVigencia)} a ${dataTexto(contrato.dataTerminoContratual)}. ` +
        `A vigência líquida, descontadas as suspensões, é de ${liquida.toFixed(1)} meses (o limite legal são 36).`,
      fontes: [F('REGRA', 'RN-202 — limite de vigência de 36 meses'), F('REGRA', 'RN-205 — suspensões deslocam o prazo')],
      proximos: [{ rotulo: 'Prorrogar a vigência', frase: `Prorrogar a vigência do ${contrato.numero}` }],
    };
  },
};

export const quemEstaNoContrato: Capacidade<z.infer<typeof zContrato>> = {
  nome: 'contrato.quem-esta',
  titulo: 'Quem está afeto a um contrato',
  descricao: 'Pessoas afetas por perfil, com as horas que consumiram e as que restam.',
  tipo: 'CONSULTA',
  parametros: zContrato,
  parametrosDescricao: [DESC_CONTRATO],
  regras: [],
  exemplos: ['Quem está afeto ao C-2026-001?', 'Quem trabalha no contrato de outsourcing?'],
  async executar({ contratoNumero }, e) {
    const contrato = await contratoDe(contratoNumero, e);
    const [perfis, afetacoes, aprovados] = await Promise.all([
      e.ctx.repos.perfis.todos((p) => p.contratoId === contrato.id),
      e.ctx.repos.afetacoes.todos((a) => a.contratoId === contrato.id && a.ativa),
      e.ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO'),
    ]);
    if (afetacoes.length === 0) {
      return {
        texto: `Não há ninguém afeto ao contrato ${contrato.numero}${perfis.length > 0 ? `, apesar de ter ${perfis.length} perfil(is) contratual(is)` : ''}.`,
        fontes: [F('REGRA', 'Afetações ativas')], semResultado: true,
        proximos: [{ rotulo: 'Afetar alguém', frase: `Afetar uma pessoa ao ${contrato.numero}` }],
      };
    }
    const linhas = afetacoes.map((a) => {
      const perfil = perfis.find((p) => p.id === a.perfilId);
      const consumidas = aprovados.filter((r) => r.recursoId === a.recursoId && r.perfilId === a.perfilId).reduce((s, r) => s + r.duracao, 0);
      return [
        e.ctx.diretorio.nome(a.recursoId) ?? a.recursoId,
        perfil?.nome ?? a.perfilId,
        horas(consumidas),
        a.vigenteDe,
      ];
    });
    return {
      texto: `${afetacoes.length} pessoa(s) afeta(s) ao contrato ${contrato.numero} (${contrato.prestador.nome}).`,
      tabela: {
        titulo: `Afetações ativas do ${contrato.numero}`,
        colunas: ['Pessoa', 'Perfil', 'Horas aprovadas', 'Desde'], linhas,
        chaves: K('PESSOA', afetacoes.map((a) => a.recursoId)),
      },
      fontes: [F('REGRA', 'Afetações ativas'), F('REGRA', 'Registos de tempo aprovados')],
      proximos: [{ rotulo: 'Substituir alguém', frase: `Substituir uma pessoa no ${contrato.numero}` }],
    };
  },
};

// ─── CARTEIRA ───────────────────────────────────────────────────────────────

export const riscoCarteira: Capacidade<Record<string, never>> = {
  nome: 'carteira.risco',
  titulo: 'Contratos em risco',
  descricao: 'Todos os contratos em execução ordenados por exposição, com os motivos e os números que os sustentam.',
  tipo: 'CONSULTA',
  parametros: z.object({}),
  parametrosDescricao: [],
  regras: [],
  exemplos: ['Que contratos estão em risco?', 'Com o que me devo preocupar na carteira?'],
  async executar(_p, e) {
    const [contratos, perfis, afetacoes, aprovados] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.perfis.todos(),
      e.ctx.repos.afetacoes.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
    ]);
    const riscos = avaliarCarteira(contratos, perfis, afetacoes, aprovados, e.hoje);
    if (riscos.length === 0) {
      return { texto: 'Nenhum contrato da carteira apresenta motivo de preocupação.', fontes: [F('PROJECAO', 'Ritmo das últimas 6 semanas')] };
    }
    const pior = riscos[0]!;
    return {
      texto:
        `${riscos.length} contrato(s) com motivo de atenção. O mais exposto é o ${pior.numero}: ` +
        pior.motivos.map((m) => m.descricao).join(' ') +
        ' A lista está ordenada pela soma dos motivos, e cada motivo traz o número que o sustenta.',
      tabela: {
        titulo: 'Contratos em risco',
        colunas: ['Contrato', 'Objeto', 'Motivos', 'Por executar no término', 'Dias até ao fim'],
        linhas: riscos.map((r) => [
          r.numero, r.objeto, r.motivos.map((m) => m.descricao).join(' '), euros(r.gapNoTermino), r.diasAteTermino,
        ]),
        chaves: K('CONTRATO', riscos.map((r) => r.contratoId)),
      },
      fontes: [F('PROJECAO', 'Ritmo das últimas 6 semanas'), F('REGRA', 'Prazo de lançamento de novo procedimento')],
      proximos: [{ rotulo: `Ver o ${pior.numero}`, frase: `Qual o saldo do ${pior.numero}?` }],
    };
  },
};

export const contratosTerminam: Capacidade<{ periodoDe?: string; periodoAte?: string }> = {
  nome: 'carteira.terminam',
  titulo: 'Contratos a terminar',
  descricao: 'O que acaba num período, com o prazo-limite para lançar o procedimento seguinte em tempo útil.',
  tipo: 'CONSULTA',
  parametros: z.object({ periodoDe: z.string().optional(), periodoAte: z.string().optional() }),
  parametrosDescricao: [...DESC_PERIODO],
  regras: [],
  exemplos: ['Que contratos terminam este ano?', 'O que acaba no próximo trimestre?'],
  async executar(p, e) {
    const periodo = periodoDe(p, e);
    const [contratos, aprovados] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
    ]);
    const lista = contratosATerminar(contratos, aprovados, periodo.de, periodo.ate, e.hoje);
    if (lista.length === 0) {
      return { texto: `Nenhum contrato termina em ${periodo.rotulo}.`, fontes: [F('REGRA', 'Vigência contratual')], semResultado: true };
    }
    const tardios = lista.filter((c) => c.diasParaLancarProcedimento < 0);
    return {
      texto:
        `${lista.length} contrato(s) terminam em ${periodo.rotulo}, deixando ${eurosTexto(lista.reduce((s, c) => s + c.valorPorExecutar, 0))} por executar.` +
        (tardios.length > 0
          ? ` Em ${tardios.length}, o prazo para lançar o procedimento seguinte já passou — o serviço fica descoberto se nada for feito.`
          : ' O prazo para lançar os procedimentos seguintes ainda vai a tempo.'),
      tabela: {
        titulo: `Contratos a terminar em ${periodo.rotulo}`,
        colunas: ['Contrato', 'Objeto', 'Termina', 'Por executar', 'Lançar procedimento até', 'Dias'],
        linhas: lista.map((c) => [
          c.numero, c.objeto, c.dataTermino, euros(c.valorPorExecutar), c.dataLimiteProcedimento, c.diasParaLancarProcedimento,
        ]),
        chaves: K('CONTRATO', lista.map((c) => c.contratoId)),
      },
      fontes: [F('REGRA', 'Vigência contratual'), F('REGRA', 'Prazo de instrução do procedimento (base legal versionada)')],
    };
  },
};

export const resumoDaCarteira: Capacidade<Record<string, never>> = {
  nome: 'carteira.resumo',
  titulo: 'Retrato financeiro da carteira',
  descricao: 'Contratado, executado, faturado e por executar no conjunto dos contratos em execução.',
  tipo: 'CONSULTA',
  parametros: z.object({}),
  parametrosDescricao: [],
  regras: [],
  exemplos: ['Qual o retrato financeiro da carteira?', 'Quanto temos contratado no total?'],
  async executar(_p, e) {
    const [contratos, aprovados, faturas] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
      e.ctx.repos.faturas.todos(),
    ]);
    const r = resumoCarteira(contratos, aprovados, faturas);
    return {
      texto:
        `${r.contratos} contratos em execução, com ${eurosTexto(r.contratado)} contratados. ` +
        `Executados ${eurosTexto(r.executado)}, dos quais ${eurosTexto(r.faturadoValidado)} já em faturas validadas — ` +
        `restam ${eurosTexto(r.porFaturar)} de trabalho aprovado por faturar. Por executar: ${eurosTexto(r.porExecutar)}.`,
      tabela: {
        titulo: 'Carteira por tipologia',
        colunas: ['Tipologia', 'Contratos', 'Contratado', 'Executado'],
        linhas: r.porTipologia.map((t) => [t.tipologia, t.contratos, euros(t.contratado), euros(t.executado)]),
      },
      fontes: [F('REGRA', 'Preço contratual atual'), F('REGRA', 'Registos aprovados e faturas validadas')],
      proximos: [{ rotulo: 'Ver os contratos em risco', frase: 'Que contratos estão em risco?' }],
    };
  },
};

// ─── CAPACIDADE ─────────────────────────────────────────────────────────────

export const folgaPorPerfil: Capacidade<{ perfil: string; projeto?: string }> = {
  nome: 'capacidade.folga-por-perfil',
  titulo: 'Onde cabe mais gente de um perfil',
  descricao: 'Contratos com horas por consumir num perfil equivalente, e quantas pessoas a tempo inteiro comportam até ao término.',
  tipo: 'CONSULTA',
  parametros: z.object({ perfil: z.string().min(2), projeto: z.string().optional() }),
  parametrosDescricao: [
    { nome: 'perfil', tipo: 'texto', obrigatorio: true, descricao: 'Designação do perfil, ex.: arquiteto de software' },
    { nome: 'projeto', tipo: 'texto', obrigatorio: false, descricao: 'Restringe a um projeto' },
  ],
  regras: [],
  exemplos: ['Onde posso colocar mais um arquiteto?', 'Que contratos comportam mais um consultor funcional?'],
  async executar({ perfil, projeto }, e) {
    const [contratosTodos, perfis, afetacoes, aprovados] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.perfis.todos(),
      e.ctx.repos.afetacoes.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
    ]);
    let contratos = contratosTodos;
    let ambito = '';
    if (projeto !== undefined) {
      const p = await projetoDe(projeto, e);
      const ids = new Set((await e.ctx.repos.contratoProjetos.todos((a) => a.projetoId === p.id)).map((a) => a.contratoId));
      contratos = contratosTodos.filter((c) => ids.has(c.id));
      ambito = ` no projeto ${p.nome}`;
    }

    const folgas = folgaParaPerfil(perfil, contratos, perfis, afetacoes, aprovados, e.hoje);
    if (folgas.length === 0) {
      return {
        texto: `Nenhum contrato em execução${ambito} tem perfil equivalente a «${perfil}» com horas por consumir. Pode ser preciso criar o perfil num contrato com valor disponível.`,
        fontes: [F('REGRA', 'Saldos de perfil sobre execução aprovada')], semResultado: true,
        proximos: [{ rotulo: 'Ver folga por valor/hora', frase: 'Que contratos têm folga para um perfil a 50 euros por hora?' }],
      };
    }
    const comEspaco = folgas.filter((f) => f.pessoasComportadas >= 1);
    const melhor = folgas[0]!;
    return {
      texto:
        (comEspaco.length > 0
          ? `${comEspaco.length} contrato(s)${ambito} comportam pelo menos mais uma pessoa a tempo inteiro no perfil «${perfil}». `
          : `Nenhum contrato${ambito} comporta uma pessoa a tempo inteiro até ao término, mas há horas para afetação parcial. `) +
        `O maior espaço está no ${melhor.contratoNumero} (${melhor.perfilNome}): ${horas(melhor.minutosDisponiveis)} h por consumir ` +
        `em ${formatarDiasUteis(melhor.diasUteisRestantes)} de vigência, a ${eurosTexto(melhor.valorHora)}/h. ` +
        'Mobilizar exige coincidência de perfil e de entidade executante (RN-701); entidade diferente já é subcontratação (RN-702).',
      tabela: {
        titulo: `Folga para o perfil «${perfil}»${ambito}`,
        colunas: ['Contrato', 'Perfil', 'Horas disponíveis', 'Valor/hora', 'Dias úteis até ao fim', 'Pessoas a tempo inteiro', 'Já afetas', 'NIPC'],
        linhas: folgas.map((f) => [
          f.contratoNumero, f.perfilNome, horas(f.minutosDisponiveis), euros(f.valorHora),
          f.diasUteisRestantes, f.pessoasComportadas, f.pessoasAfetas, f.entidadeNipc,
        ]),
        chaves: K('CONTRATO', folgas.map((f) => f.contratoId)),
      },
      fontes: [
        F('REGRA', 'Saldos de perfil sobre execução aprovada'),
        F('REGRA', 'RN-701 — substituição exige perfil e entidade coincidentes'),
        F('PROJECAO', 'Dias úteis até ao término × 8 h por pessoa'),
      ],
      proximos: [{ rotulo: `Afetar alguém ao ${melhor.contratoNumero}`, frase: `Afetar uma pessoa ao perfil ${melhor.perfilNome} do ${melhor.contratoNumero}` }],
    };
  },
};

export const folgaPorValorHora: Capacidade<{ valorHoraEuros: number }> = {
  nome: 'capacidade.folga-por-valor-hora',
  titulo: 'Onde cabe um perfil a um dado valor/hora',
  descricao: 'Contratos com valor por executar que comporta um perfil ao preço/hora indicado, com perfil compatível já existente.',
  tipo: 'CONSULTA',
  parametros: z.object({ valorHoraEuros: z.number().positive() }),
  parametrosDescricao: [{ nome: 'valorHoraEuros', tipo: 'número', obrigatorio: true, descricao: 'Valor/hora em euros, ex.: 45' }],
  regras: [],
  exemplos: ['Que contratos comportam um perfil a 45 euros por hora?', 'Onde cabe alguém a 60 €/h?'],
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
        `nos ${formatarDiasUteis(melhor.diasUteisRestantes)} que restam. ` +
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
        chaves: K('CONTRATO', folgas.map((f) => f.contratoId)),
      },
      fontes: [F('REGRA', 'Preço contratual atual menos execução aprovada'), F('PROJECAO', 'Dias úteis até ao término × 8 h por pessoa')],
    };
  },
};

// ─── PESSOAS ────────────────────────────────────────────────────────────────

export const ondeEstaPessoa: Capacidade<{ pessoa: string }> = {
  nome: 'pessoa.onde-esta',
  titulo: 'Onde está afeta uma pessoa',
  descricao: 'Contratos e perfis onde a pessoa está afeta, com horas consumidas e histórico de substituições.',
  tipo: 'CONSULTA',
  parametros: z.object({ pessoa: z.string().min(2) }),
  parametrosDescricao: [{ nome: 'pessoa', tipo: 'texto', obrigatorio: true, descricao: 'Nome da pessoa' }],
  regras: [],
  exemplos: ['Onde está afeto o Diogo Marques?', 'Em que contratos trabalha a Carla?'],
  async executar({ pessoa }, e) {
    const p = pessoaDe(pessoa, e);
    const [afetacoes, contratos, perfis, aprovados] = await Promise.all([
      e.ctx.repos.afetacoes.todos((a) => a.recursoId === p.id),
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.perfis.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.recursoId === p.id && r.estado === 'APROVADO'),
    ]);
    if (afetacoes.length === 0) {
      return { texto: `${p.nome} não está afeto a nenhum contrato.`, fontes: [F('REGRA', 'Afetações')], semResultado: true };
    }
    const ativas = afetacoes.filter((a) => a.ativa);
    return {
      texto:
        `${p.nome} está afeto a ${ativas.length} contrato(s)` +
        (afetacoes.length > ativas.length ? `, e tem ${afetacoes.length - ativas.length} afetação(ões) já encerrada(s)` : '') +
        `, com ${horas(aprovados.reduce((s, r) => s + r.duracao, 0))} h aprovadas no total.`,
      tabela: {
        titulo: `Afetações de ${p.nome}`,
        colunas: ['Contrato', 'Perfil', 'Estado', 'Desde', 'Até', 'Horas aprovadas'],
        linhas: afetacoes.map((a) => [
          contratos.find((c) => c.id === a.contratoId)?.numero ?? a.contratoId,
          perfis.find((x) => x.id === a.perfilId)?.nome ?? a.perfilId,
          a.ativa ? 'ativa' : 'encerrada',
          a.vigenteDe, a.vigenteAte ?? '—',
          horas(aprovados.filter((r) => r.contratoId === a.contratoId && r.perfilId === a.perfilId).reduce((s, r) => s + r.duracao, 0)),
        ]),
        chaves: K('CONTRATO', afetacoes.map((a) => a.contratoId)),
      },
      fontes: [F('REGRA', 'Afetações e substituições'), F('REGRA', 'Registos de tempo aprovados')],
    };
  },
};

// ─── OPERAÇÃO ───────────────────────────────────────────────────────────────

export const registosPorAprovar: Capacidade<z.infer<typeof zContratoPeriodo>> = {
  nome: 'registos.por-aprovar',
  titulo: 'Registos de tempo por aprovar',
  descricao: 'O que está submetido à espera de decisão, por pessoa e por contrato, com as horas e o valor em causa.',
  tipo: 'CONSULTA',
  parametros: zContratoPeriodo,
  parametrosDescricao: [DESC_CONTRATO, ...DESC_PERIODO],
  regras: [],
  exemplos: ['Que registos estão por aprovar?', 'O que tenho para aprovar no C-2026-001?'],
  async executar(p, e) {
    const submetidos = await e.ctx.repos.registosTempo.todos((r) => r.estado === 'SUBMETIDO');
    const contratos = await e.ctx.repos.contratos.todos();
    let lista = submetidos;
    let ambito = 'na carteira';
    if (p.contratoNumero !== undefined) {
      const c = await contratoDe(p.contratoNumero, e);
      lista = submetidos.filter((r) => r.contratoId === c.id);
      ambito = `no ${c.numero}`;
    }
    if (lista.length === 0) {
      return { texto: `Não há registos por aprovar ${ambito}.`, fontes: [F('REGRA', 'Registos no estado SUBMETIDO')] };
    }
    const porPessoa = new Map<string, { minutos: number; valor: number; n: number }>();
    for (const r of lista) {
      const k = `${r.recursoId}|${r.contratoId}`;
      const a = porPessoa.get(k) ?? { minutos: 0, valor: 0, n: 0 };
      porPessoa.set(k, { minutos: a.minutos + r.duracao, valor: a.valor + r.valorImputado, n: a.n + 1 });
    }
    return {
      texto:
        `${lista.length} registo(s) por aprovar ${ambito}: ${horas(lista.reduce((s, r) => s + r.duracao, 0))} h, ` +
        `no valor de ${eurosTexto(lista.reduce((s, r) => s + r.valorImputado, 0))}.`,
      tabela: {
        titulo: 'Registos por aprovar',
        colunas: ['Pessoa', 'Contrato', 'Registos', 'Horas', 'Valor'],
        linhas: [...porPessoa.entries()].map(([k, v]) => {
          const [recursoId, contratoId] = k.split('|');
          return [
            e.ctx.diretorio.nome(recursoId!) ?? recursoId!,
            contratos.find((c) => c.id === contratoId)?.numero ?? contratoId!,
            v.n, horas(v.minutos), euros(v.valor),
          ];
        }),
        chaves: K('PESSOA', [...porPessoa.keys()].map((k) => k.split('|')[0]!)),
      },
      fontes: [F('REGRA', 'Registos no estado SUBMETIDO')],
      proximos: [{ rotulo: 'Aprovar estes registos', frase: `Aprovar os registos ${ambito}` }],
    };
  },
};

export const estadoFaturas: Capacidade<z.infer<typeof zContratoPeriodo>> = {
  nome: 'faturas.estado',
  titulo: 'Estado das faturas',
  descricao: 'O que está por conferir, à espera de nota de crédito, validado ou invalidado num período.',
  tipo: 'CONSULTA',
  parametros: zContratoPeriodo,
  parametrosDescricao: [DESC_CONTRATO, ...DESC_PERIODO],
  operacao: 'gerir.faturas.compromissos',
  regras: [],
  exemplos: ['Que faturas estão por conferir?', 'Quanto faturámos este ano?'],
  async executar(p, e) {
    const periodo = periodoDe(p, e);
    const contratos = await e.ctx.repos.contratos.todos();
    let faturas = await e.ctx.repos.faturas.todos();
    let ambito = 'na carteira';
    if (p.contratoNumero !== undefined) {
      const c = await contratoDe(p.contratoNumero, e);
      faturas = faturas.filter((f) => f.contratoId === c.id);
      ambito = `no ${c.numero}`;
    }
    const noPeriodo = faturas.filter((f) => dentroDoIntervalo(f.dataAprovacao ?? f.dataRececao, periodo.de, periodo.ate));
    const abertas = faturas.filter((f) => f.estado === 'RECEBIDA' || f.estado === 'EM_CONFERENCIA' || f.estado === 'AGUARDA_NOTA_CREDITO');
    const validadas = noPeriodo.filter((f) => f.estado === 'VALIDADA');
    const aguardam = faturas.filter((f) => f.estado === 'AGUARDA_NOTA_CREDITO');

    return {
      texto:
        `Em ${periodo.rotulo} ${ambito}: ${validadas.length} fatura(s) validada(s), no valor aprovado de ` +
        `${eurosTexto(validadas.reduce((s, f) => s + (f.montanteAprovado ?? f.montanteSemIva), 0))}. ` +
        (abertas.length === 0
          ? 'Não há faturas por decidir.'
          : `Estão ${abertas.length} por decidir${aguardam.length > 0 ? `, das quais ${aguardam.length} à espera de nota de crédito` : ''}.`),
      tabela: {
        titulo: 'Faturas',
        colunas: ['Fatura', 'Contrato', 'Estado', 'Montante', 'Aprovado', 'Data'],
        linhas: [...abertas, ...validadas].map((f) => [
          f.numero,
          contratos.find((c) => c.id === f.contratoId)?.numero ?? f.contratoId,
          f.estado, euros(f.montanteSemIva), euros(f.montanteAprovado ?? 0), f.dataAprovacao ?? f.dataRececao,
        ]),
        chaves: K('FATURA', [...abertas, ...validadas].map((f) => f.id)),
      },
      fontes: [F('REGRA', 'Estados da fatura'), F('REGRA', 'RN-612 — líquido de nota de crédito')],
      ...(aguardam.length > 0
        ? { proximos: [{ rotulo: 'Registar nota de crédito', frase: `Registar a nota de crédito da fatura ${aguardam[0]!.numero}` }] }
        : {}),
    };
  },
};

export const estadoEntregaveis: Capacidade<z.infer<typeof zContrato>> = {
  nome: 'entregaveis.estado',
  titulo: 'Estado dos entregáveis',
  descricao: 'Entregáveis por entregar, entregues por faturar e já faturados de um contrato chave-na-mão.',
  tipo: 'CONSULTA',
  parametros: zContrato,
  parametrosDescricao: [DESC_CONTRATO],
  regras: ['RN-608', 'RN-609'],
  exemplos: ['Que entregáveis estão por entregar no C-2026-CM1?', 'Como estão os entregáveis?'],
  async executar({ contratoNumero }, e) {
    const contrato = await contratoDe(contratoNumero, e);
    const entregaveis = await e.ctx.repos.entregaveis.todos((x) => x.contratoId === contrato.id);
    if (entregaveis.length === 0) {
      return {
        texto: `O contrato ${contrato.numero} não tem entregáveis registados${contrato.tipologia !== 'CHAVE_NA_MAO' ? ' (não é um contrato chave-na-mão)' : ''}.`,
        fontes: [], semResultado: true,
      };
    }
    const porEstado = new Map<string, number>();
    for (const x of entregaveis) porEstado.set(estadoEntregavel(x), (porEstado.get(estadoEntregavel(x)) ?? 0) + 1);
    const porFaturar = entregaveis.filter((x) => estadoEntregavel(x) === 'ENTREGUE');
    return {
      texto:
        `O contrato ${contrato.numero} tem ${entregaveis.length} entregáveis: ` +
        [...porEstado.entries()].map(([k, v]) => `${v} ${k.toLowerCase()}`).join(', ') + '. ' +
        (porFaturar.length > 0
          ? `${porFaturar.length} está(ão) entregue(s) por faturar, no valor de ${eurosTexto(porFaturar.reduce((s, x) => s + x.valor, 0))} — a entrega é o facto gerador da faturação (RN-608).`
          : 'Não há entregáveis entregues por faturar.'),
      tabela: {
        titulo: `Entregáveis do ${contrato.numero}`,
        colunas: ['Entregável', 'Valor', 'Estado', 'Data prevista', 'Entregue em'],
        linhas: entregaveis.map((x) => [x.designacao, euros(x.valor), estadoEntregavel(x), x.dataPrevista ?? '—', x.entregueEm ?? '—']),
        chaves: K('ENTREGAVEL', entregaveis.map((x) => x.id)),
      },
      fontes: [F('REGRA', 'RN-608 — só se fatura o que está entregue'), F('REGRA', 'RN-609 — montante igual ao valor do entregável')],
      ...(porFaturar.length > 0
        ? { proximos: [{ rotulo: 'Registar a fatura', frase: `Registar uma fatura do ${contrato.numero}` }] }
        : { proximos: [{ rotulo: 'Registar uma entrega', frase: `Registar a entrega de um entregável do ${contrato.numero}` }] }),
    };
  },
};

// ─── DECISÕES ───────────────────────────────────────────────────────────────

export const decisoesPendentes: Capacidade<z.infer<typeof zContrato>> = {
  nome: 'decisoes.pendentes',
  titulo: 'Decisões pendentes',
  descricao: 'O que está por decidir, com a data-limite mais apertada em primeiro lugar.',
  tipo: 'CONSULTA',
  parametros: zContrato,
  parametrosDescricao: [DESC_CONTRATO],
  regras: [],
  exemplos: ['O que tenho de decidir com urgência?', 'Que decisões estão pendentes no C-2026-001?'],
  async executar({ contratoNumero }, e) {
    const contrato = contratoNumero !== undefined ? await contratoDe(contratoNumero, e) : undefined;
    const pendentes = await new ServicoAlertas(e.ctx).pendentes(contrato?.id);
    const contratos = await e.ctx.repos.contratos.todos();
    const alvo = contrato !== undefined ? `o contrato ${contrato.numero}` : 'a carteira';
    if (pendentes.length === 0) {
      return { texto: `Não há decisões pendentes para ${alvo}.`, fontes: [F('REGRA', 'Catálogo de alertas')] };
    }
    const vencidas = pendentes.filter((a) => (a.diasParaLimite ?? 1) < 0);
    const ordenadas = [...pendentes].sort((a, b) => (a.diasParaLimite ?? 9e9) - (b.diasParaLimite ?? 9e9));
    const proxima = ordenadas[0]!;
    return {
      texto:
        `Há ${pendentes.length} decisão(ões) pendente(s) para ${alvo}` +
        (vencidas.length > 0 ? `, das quais ${vencidas.length} com o prazo já vencido` : '') +
        `. A mais urgente é «${proxima.titulo}»` +
        (proxima.dataLimiteAcao !== undefined ? `, com data-limite em ${dataTexto(proxima.dataLimiteAcao)}.` : '.'),
      tabela: {
        titulo: 'Decisões pendentes',
        colunas: ['Contrato', 'Decisão', 'Código', 'Data-limite', 'Dias'],
        linhas: ordenadas.map((a) => [
          contratos.find((c) => c.id === a.contratoId)?.numero ?? a.contratoId,
          a.titulo, a.codigo, a.dataLimiteAcao ?? '—', a.diasParaLimite ?? '—',
        ]),
        chaves: K('CONTRATO', ordenadas.map((a) => a.contratoId)),
      },
      fontes: [F('REGRA', 'Catálogo de alertas — decisões abertas ou em curso')],
      proximos: [{ rotulo: `Explicar «${proxima.titulo}»`, frase: `Explica a decisão ${proxima.codigo} do contrato ${contratos.find((c) => c.id === proxima.contratoId)?.numero ?? ''}` }],
    };
  },
};

export const explicarDecisao: Capacidade<{ codigo?: string; contratoNumero?: string }> = {
  nome: 'decisoes.explicar',
  titulo: 'Explicar uma decisão pendente',
  descricao: 'Porque existe a decisão, o prazo, e a escada de opções com o prazo próprio de cada uma.',
  tipo: 'CONSULTA',
  parametros: z.object({ codigo: z.string().optional(), contratoNumero: z.string().optional() }),
  parametrosDescricao: [
    { nome: 'codigo', tipo: 'texto', obrigatorio: false, descricao: 'Código do alerta, ex.: AL-FOLGA-SEM-TEMPO' },
    DESC_CONTRATO,
  ],
  regras: [],
  exemplos: ['Explica a decisão AL-FOLGA-SEM-TEMPO do C-2026-001', 'Porque é que este contrato está sinalizado?'],
  async executar({ codigo, contratoNumero }, e) {
    const contrato = await contratoDe(contratoNumero, e);
    const pendentes = await new ServicoAlertas(e.ctx).pendentes(contrato.id);
    const alerta = codigo !== undefined
      ? pendentes.find((a) => a.codigo.toUpperCase() === codigo.toUpperCase())
      : [...pendentes].sort((a, b) => (a.diasParaLimite ?? 9e9) - (b.diasParaLimite ?? 9e9))[0];
    if (alerta === undefined) {
      return { texto: `Não há nenhuma decisão pendente${codigo !== undefined ? ` com o código ${codigo}` : ''} no contrato ${contrato.numero}.`, fontes: [], semResultado: true };
    }
    const opcoes = alerta.opcoes ?? [];
    return {
      texto:
        `${alerta.titulo} (${alerta.codigo}) — ${alerta.detalhe}` +
        (opcoes.length > 0
          ? `\n\nHá ${opcoes.length} caminho(s) possível(eis), do menor para o maior atrito jurídico. Cada um tem prazo próprio: passado esse prazo, perde-se essa opção e não as outras.`
          : '') +
        (alerta.notaJuridica !== undefined ? `\n\n${alerta.notaJuridica}` : ''),
      ...(opcoes.length > 0
        ? {
          tabela: {
            titulo: 'Opções, por atrito jurídico crescente',
            colunas: ['#', 'Opção', 'Viabilidade', 'Prazo próprio', 'Dias', 'Fundamento'],
            linhas: opcoes.map((o) => [o.ordem, `${o.titulo} — ${o.detalhe}`, o.viabilidade, o.dataLimite ?? '—', o.diasParaLimite ?? '—', o.fundamento ?? '—']),
          },
        }
        : {}),
      fontes: [F('REGRA', `Catálogo de alertas — ${alerta.codigo}`), F('PROJECAO', 'Janela de decisão calculada para trás a partir do evento-âncora')],
      proximos: [{ rotulo: 'Dispensar esta decisão', frase: `Dispensar a decisão ${alerta.codigo} do ${contrato.numero}` }],
    };
  },
};

// ─── ORÇAMENTO ──────────────────────────────────────────────────────────────

export const resumoOrcamentoAnual: Capacidade<{ ano?: number }> = {
  nome: 'orcamento.resumo',
  titulo: 'Resumo do orçamento de um ano',
  descricao: 'Encargo por projeto, o que já está coberto por portaria e o que falta autorizar, com a competência do CA.',
  tipo: 'CONSULTA',
  parametros: z.object({ ano: z.number().int().optional() }),
  parametrosDescricao: [{ nome: 'ano', tipo: 'número', obrigatorio: false, descricao: 'Ano orçamentado; por omissão, o mais recente' }],
  operacao: 'gerir.contratos',
  regras: ['RN-115'],
  exemplos: ['Como está o orçamento de 2027?', 'Qual o resumo do orçamento?'],
  async executar({ ano }, e) {
    const orcamentos = await e.ctx.repos.orcamentos.todos();
    const o = ano !== undefined ? orcamentos.find((x) => x.ano === ano) : [...orcamentos].sort((a, b) => b.ano - a.ano)[0];
    if (o === undefined) {
      return { texto: ano !== undefined ? `Não há orçamento preparado para ${ano}.` : 'Ainda não há nenhum orçamento preparado.', fontes: [], semResultado: true };
    }
    const { resumirOrcamento } = await import('@chora/domain');
    const r = resumirOrcamento(o.ano, o.linhas);
    const projetos = await e.ctx.repos.projetos.todos();
    return {
      texto:
        `Orçamento de ${o.ano} (${o.estado === 'FECHADO' ? 'fechado' : 'em preparação'}): ${eurosTexto(r.cobertura.find((c) => c.ano === o.ano)?.encargo ?? 0)} de encargo, ` +
        `${eurosTexto(r.totalACobrir)} por autorizar em todos os anos. ` +
        (r.anosAcimaDaCompetenciaCA.length > 0
          ? `Atenção: ${r.anosAcimaDaCompetenciaCA.join(', ')} excede(m) ${eurosTexto(r.limiteAnualCA)} num só ano, pelo que a portaria carece de despacho conjunto dos membros do Governo (RN-115).`
          : `Nenhum ano futuro excede ${eurosTexto(r.limiteAnualCA)}: as portarias cabem na competência do Conselho de Administração.`),
      tabela: {
        titulo: `Orçamento ${o.ano} por projeto`,
        colunas: ['Projeto', 'Linhas', `Encargo ${o.ano}`, 'Anos seguintes'],
        linhas: r.projetos.map((p) => [
          projetos.find((x) => x.id === p.projetoId)?.nome ?? p.projetoId,
          p.linhas.length, euros(p.totalAnoOrcamentado), euros(p.totalPlurianual),
        ]),
      },
      fontes: [F('REGRA', 'RN-115 — competência do CA para extensão de encargos'), F('PROJECAO', 'Proposta a partir da carteira')],
    };
  },
};

// ─── PROJETO ────────────────────────────────────────────────────────────────

export const projetoExecutado: Capacidade<{ projeto?: string }> = {
  nome: 'projeto.executado',
  titulo: 'Total já gasto num projeto',
  descricao: 'Trabalho aprovado e faturação validada dos contratos do projeto, por contrato e por mês. Exportável.',
  tipo: 'CONSULTA',
  parametros: z.object({ projeto: z.string().optional() }),
  parametrosDescricao: [{ nome: 'projeto', tipo: 'texto', obrigatorio: false, descricao: 'Nome do projeto' }],
  operacao: 'gerir.contratos',
  regras: [],
  exemplos: ['Quanto já se gastou no projeto Modernização documental?'],
  async executar({ projeto }, e) {
    const p = await projetoDe(projeto, e);
    const ids = (await e.ctx.repos.contratoProjetos.todos((a) => a.projetoId === p.id)).map((a) => a.contratoId);
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
        `em ${x.contratos.length} contrato(s). Desse valor, ${eurosTexto(x.totalValidado)} estão em faturas validadas — a diferença é trabalho ` +
        `aprovado ainda por faturar. Restam ${eurosTexto(x.totalPorExecutar)} por executar.` +
        (partilhados.length > 0 ? ` Atenção: ${partilhados.length} contrato(s) servem mais do que um projeto, pelo que o valor não é exclusivo deste.` : ''),
      tabela: {
        titulo: `Execução do projeto ${p.nome}`,
        colunas: ['Contrato', 'Objeto', 'Contratado', 'Executado', 'Validado', 'Por executar', 'Horas aprovadas', 'Partilhado'],
        linhas: x.contratos.map((c) => [
          c.numero, c.objeto, euros(c.precoContratualAtual), euros(c.valorExecutado), euros(c.valorValidado),
          euros(c.valorPorExecutar), horas(c.minutosAprovados), c.partilhado ? 'sim' : 'não',
        ]),
        chaves: K('CONTRATO', x.contratos.map((c) => c.contratoId)),
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
          { nome: 'Por mês', linhas: x.porMes.map((m) => ({ 'Mês': m.mes, 'Valor executado': euros(m.valor), 'Horas': horas(m.minutos) })) },
        ],
      },
      fontes: [F('REGRA', 'Registos de tempo aprovados'), F('REGRA', 'Faturas validadas — líquido de notas de crédito')],
      proximos: [{ rotulo: 'Ver o que está previsto investir', frase: `Quanto está previsto investir no projeto ${p.nome}?` }],
    };
  },
};

export const projetoPrevisto: Capacidade<{ projeto?: string }> = {
  nome: 'projeto.previsto',
  titulo: 'Total previsto investir num projeto',
  descricao: 'O que falta executar nos contratos vigentes mais o que o orçamento prevê, por ano. Exportável.',
  tipo: 'CONSULTA',
  parametros: z.object({ projeto: z.string().optional() }),
  parametrosDescricao: [{ nome: 'projeto', tipo: 'texto', obrigatorio: false, descricao: 'Nome do projeto' }],
  operacao: 'gerir.contratos',
  regras: [],
  exemplos: ['Quanto está previsto investir no projeto Assinatura digital?'],
  async executar({ projeto }, e) {
    const p = await projetoDe(projeto, e);
    const ids = (await e.ctx.repos.contratoProjetos.todos((a) => a.projetoId === p.id)).map((a) => a.contratoId);
    const [contratos, aprovados, orcamentos] = await Promise.all([
      e.ctx.repos.contratos.todos(),
      e.ctx.repos.registosTempo.todos((r) => r.estado === 'APROVADO'),
      e.ctx.repos.orcamentos.todos(),
    ]);
    const orcamento = [...orcamentos].sort((a, b) => b.ano - a.ano)[0];
    const x = previsaoDoProjeto(p.id, ids, contratos, aprovados, orcamento?.linhas ?? []);
    if (x.linhas.length === 0) {
      return { texto: `O projeto ${p.nome} não tem valor por executar nem encargo orçamentado.`, fontes: [], semResultado: true };
    }
    return {
      texto:
        `Está previsto investir ${eurosTexto(x.total)} no projeto ${p.nome}: ${eurosTexto(x.totalEmContratosVigentes)} por executar em contratos já em vigor` +
        (x.totalOrcamentado > 0
          ? ` e ${eurosTexto(x.totalOrcamentado)} de encargo previsto no orçamento de ${orcamento?.ano ?? '—'}.`
          : '. Não há orçamento preparado que acrescente encargo a este projeto.') +
        ' São naturezas diferentes: a primeira é despesa contratada, a segunda é intenção sujeita a autorização.',
      tabela: {
        titulo: `Investimento previsto no projeto ${p.nome}`,
        colunas: ['Origem', 'Contrato', 'Objeto', 'Ano', 'Valor'],
        linhas: x.linhas.map((l) => [
          l.origem === 'CONTRATO_EM_VIGOR' ? 'Contrato em vigor' : 'Orçamento', l.numero, l.objeto, l.ano ?? '—', euros(l.valor),
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
      fontes: [F('REGRA', 'Preço contratual atual menos execução aprovada'), F('PROJECAO', `Linhas do orçamento de ${orcamento?.ano ?? '—'}`)],
    };
  },
};
