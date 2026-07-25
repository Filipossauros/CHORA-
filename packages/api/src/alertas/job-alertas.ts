import {
  RN_302, RN_505,
  calcularConsumoPerfil, valorPrevistoPerfil, mesesAteTermino, excedeLimiteVigencia,
  portariaExigeReprogramacao, anoFinalPortaria, montantePortariaAno, mesesGanhosComReprogramacao,
  terminoExecucaoAjustado, periodosSuspensao, mesesEntre, vigenciaLiquidaMeses, LIMITE_VIGENCIA_MESES,
  preverPerfil, preverContrato, ritmoValorDia, escadaOpcoesPerfil,
  janelaTransicaoAno, janelaReprogramacaoPortaria, janelaModificacao, janelaNovoProcedimento,
  fimAnoEconomico, diaDeInstante, diasEntre, adicionarDias,
  type Alerta, type OpcaoAlerta, type SeveridadeAlerta, type Contrato, type DataISO,
  type JanelaDecisao,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';

/**
 * Job de alertas (secção 11). Determinístico: percorre os contratos em vigor e
 * gera alertas a partir das regras consultivas, das projeções e do cruzamento
 * de tempo × dinheiro × cobertura orçamental × capacidade.
 *
 * Cada alerta composto transporta a JANELA DE DECISÃO (até quando é preciso
 * agir), o IMPACTO quantificado e, quando aplicável, a ESCADA DE OPÇÕES.
 * O `Notifier` do protótipo escreve em consola e persiste `notificadoEm`.
 */
export interface Notifier {
  notificar(alerta: Alerta, destinatario: string): Promise<void>;
}

export class NotifierConsola implements Notifier {
  async notificar(alerta: Alerta, destinatario: string): Promise<void> {
    // eslint-disable-next-line no-console
    console.log(`[ALERTA:${alerta.codigo}] ${alerta.titulo} → ${destinatario}`);
  }
}

/** Campos opcionais que enriquecem um alerta. */
interface Extras {
  janela?: JanelaDecisao;
  impactoValor?: number;
  impactoMinutos?: number;
  opcoes?: OpcaoAlerta[];
}

const eur = (c: number): string =>
  `${(c / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const horas = (min: number): string => `${Math.round(min / 60)} h`;

export class JobAlertas {
  constructor(
    private readonly ctx: Contexto,
    private readonly notifier: Notifier = new NotifierConsola(),
  ) {}

  private novoAlerta(
    contratoId: string, codigo: string, severidade: SeveridadeAlerta,
    titulo: string, detalhe: string, destinatarioId: string, extras: Extras = {},
  ): Alerta {
    const { janela, impactoValor, impactoMinutos, opcoes } = extras;
    return {
      id: this.ctx.ids.novo('alr'), contratoId, codigo,
      // Quando há janela de decisão, a severidade escala com a proximidade do
      // limite; nunca desce abaixo da severidade base da regra.
      severidade: janela !== undefined ? maiorSeveridade(severidade, janela.severidade) : severidade,
      titulo, detalhe, destinatarioId, geradoEm: this.ctx.relogio.agora(),
      ...(janela !== undefined ? {
        dataLimiteAcao: janela.dataLimiteAcao,
        diasParaLimite: janela.diasParaLimite,
        eventoAncora: janela.eventoAncora,
      } : {}),
      ...(impactoValor !== undefined ? { impactoValor } : {}),
      ...(impactoMinutos !== undefined ? { impactoMinutos } : {}),
      ...(opcoes !== undefined && opcoes.length > 0 ? { opcoes } : {}),
    };
  }

  private gestorPrincipal(gestores: ReadonlyArray<{ utilizadorId: string; principal: boolean }>): string {
    const p = gestores.find((g) => g.principal) ?? gestores[0];
    return p?.utilizadorId ?? 'sem-gestor';
  }

  /** Sufixo com a data-limite, para o detalhe do alerta. */
  private prazo(j: JanelaDecisao): string {
    if (j.diasParaLimite < 0) return ` O prazo para agir terminou em ${j.dataLimiteAcao} (há ${-j.diasParaLimite} dias).`;
    return ` Tem de agir até ${j.dataLimiteAcao} (faltam ${j.diasParaLimite} dias), por causa do ${j.eventoAncora}.`;
  }

  async executar(): Promise<Alerta[]> {
    const hoje = diaDeInstante(this.ctx.relogio.agora());
    const gerados: Alerta[] = [];
    const todosContratos = await this.ctx.repos.contratos.todos();
    const todosPerfis = await this.ctx.repos.perfis.todos();
    const recursos = await this.ctx.repos.recursos.todos();
    const contratos = todosContratos.filter((c) => c.estado === 'EM_VIGOR' || c.estado === 'SUSPENSO');

    for (const contrato of contratos) {
      const destinatario = this.gestorPrincipal(contrato.gestores);
      const alteracoes = await this.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id);
      const perfis = todosPerfis.filter((p) => p.contratoId === contrato.id);
      const aprovados = await this.ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO');

      const meses = mesesAteTermino(contrato, hoje);
      const valorExecutado = aprovados.reduce((s, r) => s + r.valorImputado, 0);
      const valorDisponivel = Math.max(0, contrato.precoContratualAtual - valorExecutado);
      const temPortaria = contrato.portariaExtensaoEncargos !== undefined || contrato.numeroPortariaExtensaoEncargos !== undefined;

      gerados.push(
        ...this.tempoDinheiro(contrato, hoje, meses, valorDisponivel, temPortaria, aprovados, destinatario),
        ...this.coberturaPlurianual(contrato, hoje, alteracoes, aprovados, destinatario),
        ...this.capacidade(contrato, hoje, perfis, alteracoes, aprovados, todosContratos, todosPerfis, recursos, destinatario),
        ...this.fimDeCiclo(contrato, hoje, meses, destinatario),
        ...this.higiene(contrato, hoje, alteracoes, aprovados, destinatario),
      );
    }

    // AL-FATURA-PRAZO (transversal às faturas por pagar)
    const faturas = await this.ctx.repos.faturas.todos((f) => f.dataLimitePagamento !== undefined && f.estado !== 'PAGA');
    for (const f of faturas) {
      const limite = f.dataLimitePagamento;
      if (limite !== undefined) {
        const sev: SeveridadeAlerta = limite < hoje ? 'CRITICO' : 'AVISO';
        const contrato = await this.ctx.repos.contratos.obter(f.contratoId);
        const destinatario = contrato !== null ? this.gestorPrincipal(contrato.gestores) : 'sem-gestor';
        gerados.push(this.novoAlerta(f.contratoId, 'AL-FATURA-PRAZO', sev, 'Prazo de pagamento de fatura', `Fatura ${f.numero} com prazo ${limite}.`, destinatario));
      }
    }

    for (const alerta of gerados) {
      const notificado: Alerta = { ...alerta, notificadoEm: this.ctx.relogio.agora() };
      await this.ctx.repos.alertas.guardar(notificado);
      await this.notifier.notificar(notificado, notificado.destinatarioId);
    }
    return gerados;
  }

  // ─── A · Tempo × dinheiro ────────────────────────────────────────────────
  private tempoDinheiro(
    contrato: Contrato, hoje: DataISO, meses: number, valorDisponivel: number,
    temPortaria: boolean, aprovados: Parameters<typeof preverContrato>[1], destinatario: string,
  ): Alerta[] {
    const out: Alerta[] = [];

    // AL-FOLGA-SEM-TEMPO — ao ritmo recente sobra dinheiro quando a vigência acaba.
    const previsao = preverContrato(contrato, aprovados, hoje);
    if (meses > 0 && previsao.gapNoTermino > 0 && contrato.precoContratualAtual > 0) {
      const pct = previsao.gapNoTermino / contrato.precoContratualAtual;
      if (pct >= 0.1) {
        const j = janelaModificacao(hoje, contrato.dataTerminoContratual);
        out.push(this.novoAlerta(contrato.id, 'AL-FOLGA-SEM-TEMPO', pct >= 0.25 ? 'CRITICO' : 'AVISO',
          'Folga financeira sem tempo para a executar',
          `Ao ritmo recente, o contrato termina a ${contrato.dataTerminoContratual} deixando ${eur(previsao.gapNoTermino)} por executar (${(pct * 100).toFixed(0)}% do valor atual). Pondere reforçar o ritmo, prorrogar a vigência ou transitar o saldo.` + this.prazo(j),
          destinatario, { janela: j, impactoValor: previsao.gapNoTermino }));
      }
    }

    // AL-FIM-ANO-ECONOMICO — saldo + sem portaria + fecho do ano a aproximar-se.
    if (valorDisponivel > 0 && !temPortaria && contrato.transicaoAnoEconomico === undefined) {
      const j = janelaTransicaoAno(hoje);
      if (j.diasParaLimite <= 120) {
        out.push(this.novoAlerta(contrato.id, 'AL-FIM-ANO-ECONOMICO', 'AVISO',
          'Transição de saldo a pedir antes do fecho do ano',
          `O contrato tem ${eur(valorDisponivel)} por executar e não tem portaria de extensão de encargos. Para o saldo poder ser executado em ${Number(hoje.slice(0, 4)) + 1}, a transição tem de ser pedida antes do fecho de ${fimAnoEconomico(hoje)}.` + this.prazo(j),
          destinatario, { janela: j, impactoValor: valorDisponivel }));
      }
    }

    // AL-EXECUCAO-EXCEDE-ANO — projeção do ano acima da dotação repartida.
    const ano = Number(hoje.slice(0, 4));
    const dotacaoAno = montantePortariaAno(contrato, ano);
    if (dotacaoAno > 0) {
      const executadoAno = aprovados.filter((r) => r.data.startsWith(String(ano))).reduce((s, r) => s + r.valorImputado, 0);
      const diasRestantesAno = Math.max(0, diasEntre(hoje, fimAnoEconomico(hoje)));
      const projetadoAno = executadoAno + ritmoValorDia(aprovados, hoje) * diasRestantesAno;
      if (projetadoAno > dotacaoAno) {
        out.push(this.novoAlerta(contrato.id, 'AL-EXECUCAO-EXCEDE-ANO', 'CRITICO',
          'Execução projetada excede a dotação do ano',
          `A execução projetada para ${ano} (${eur(Math.round(projetadoAno))}) excede o montante repartido pela portaria para esse ano (${eur(dotacaoAno)}). É necessário reprogramar a portaria ou conter a execução.`,
          destinatario, { impactoValor: Math.round(projetadoAno - dotacaoAno) }));
      } else if (projetadoAno > dotacaoAno * 0.9) {
        out.push(this.novoAlerta(contrato.id, 'AL-PORTARIA-ANO-INSUFICIENTE', 'AVISO',
          'Dotação do ano esgota-se antes do fim do ano',
          `Ao ritmo recente, a dotação de ${ano} (${eur(dotacaoAno)}) fica praticamente esgotada antes de ${fimAnoEconomico(hoje)} (projeção: ${eur(Math.round(projetadoAno))}).`,
          destinatario));
      }
    }

    // AL-VALOR-DISPONIVEL
    if (contrato.precoContratualAtual > 0 && valorDisponivel <= contrato.precoContratualAtual * 0.4) {
      const pctDisp = valorDisponivel / contrato.precoContratualAtual;
      out.push(this.novoAlerta(contrato.id, 'AL-VALOR-DISPONIVEL', pctDisp <= 0.2 ? 'CRITICO' : 'AVISO',
        'Valor disponível reduzido', `O contrato tem apenas ${(pctDisp * 100).toFixed(0)}% do valor disponível.`,
        destinatario, { impactoValor: valorDisponivel }));
    }
    return out;
  }

  // ─── B · Cobertura orçamental plurianual ─────────────────────────────────
  private coberturaPlurianual(
    contrato: Contrato, hoje: DataISO,
    alteracoes: Parameters<typeof mesesGanhosComReprogramacao>[1],
    _aprovados: unknown, destinatario: string,
  ): Alerta[] {
    const out: Alerta[] = [];
    const anoFinal = anoFinalPortaria(contrato);
    if (anoFinal === undefined) return out;

    // AL-PORTARIA-REPROGRAMAR — a vigência já ultrapassa o ano coberto.
    if (portariaExigeReprogramacao(contrato)) {
      const j = janelaReprogramacaoPortaria(hoje, anoFinal + 1);
      out.push(this.novoAlerta(contrato.id, 'AL-PORTARIA-REPROGRAMAR', 'AVISO',
        'Portaria de extensão de encargos a reprogramar',
        `A vigência vai até ${contrato.dataTerminoContratual} mas a portaria só reparte encargos até ${anoFinal}: sem reprogramação não há cobertura orçamental para o período remanescente.` + this.prazo(j),
        destinatario, { janela: j }));
    }

    // AL-PORTARIA-LIMITA-VIGENCIA — a portaria trava o contrato abaixo do máximo legal.
    const ganhos = mesesGanhosComReprogramacao(contrato, alteracoes);
    if (ganhos >= 1 && !portariaExigeReprogramacao(contrato)) {
      const j = janelaReprogramacaoPortaria(hoje, anoFinal + 1);
      out.push(this.novoAlerta(contrato.id, 'AL-PORTARIA-LIMITA-VIGENCIA', 'AVISO',
        'Portaria limita a vigência abaixo do máximo legal',
        `A portaria cobre encargos até ${anoFinal}, mas o contrato admitiria mais ${ganhos.toFixed(0)} meses de vigência dentro do limite legal de ${LIMITE_VIGENCIA_MESES} meses (líquidos de suspensões). Reprogramar a portaria permite levar a vigência ao máximo.` + this.prazo(j),
        destinatario, { janela: j }));
    }
    return out;
  }

  // ─── C · Capacidade e perfis ─────────────────────────────────────────────
  private capacidade(
    contrato: Contrato, hoje: DataISO,
    perfis: Awaited<ReturnType<Contexto['repos']['perfis']['todos']>>,
    alteracoes: Awaited<ReturnType<Contexto['repos']['alteracoes']['todos']>>,
    aprovados: Awaited<ReturnType<Contexto['repos']['registosTempo']['todos']>>,
    todosContratos: Awaited<ReturnType<Contexto['repos']['contratos']['todos']>>,
    todosPerfis: Awaited<ReturnType<Contexto['repos']['perfis']['todos']>>,
    recursos: Awaited<ReturnType<Contexto['repos']['recursos']['todos']>>,
    destinatario: string,
  ): Alerta[] {
    const out: Alerta[] = [];

    for (const p of perfis) {
      const consumo = calcularConsumoPerfil(p, aprovados.filter((r) => r.perfilId === p.id));
      const previsto = valorPrevistoPerfil(p);
      const pctValor = previsto > 0 ? consumo.valorConsumido / previsto : 0;

      // AL-PERFIL-ESGOTA-ANTES-TERMINO — preditivo, com escada de opções.
      const prev = preverPerfil(p, aprovados, contrato, hoje);
      if (prev.esgotaAntesDoTermino === true && prev.dataEsgotamento !== null) {
        const j = janelaModificacao(hoje, prev.dataEsgotamento);
        const opcoes = escadaOpcoesPerfil({
          perfilEmRisco: p, contrato, contratos: todosContratos, perfis: todosPerfis,
          alteracoes, aprovados, recursos, hoje,
        });
        out.push(this.novoAlerta(contrato.id, 'AL-PERFIL-ESGOTA-ANTES-TERMINO', 'AVISO',
          `Perfil ${p.nome} esgota-se antes do término`,
          `Ao ritmo recente, as horas do perfil «${p.nome}» esgotam-se a ${prev.dataEsgotamento}, antes do término da vigência (${contrato.dataTerminoContratual}). Restam ${horas(prev.minutosRestantes)}.` + this.prazo(j),
          destinatario, { janela: j, impactoMinutos: prev.minutosRestantes, opcoes }));
      }

      // AL-PERFIL-80 / -90 (RN-505 consultiva)
      const rp = RN_505.avaliar({ percentagemHoras: consumo.percentagemHoras, percentagemValor: pctValor });
      if (!rp.ok) {
        const pico = Math.max(consumo.percentagemHoras, pctValor);
        out.push(this.novoAlerta(contrato.id, pico >= 0.9 ? 'AL-PERFIL-90' : 'AL-PERFIL-80', pico >= 0.9 ? 'CRITICO' : 'AVISO',
          `Consumo do perfil ${p.nome}`, `Consumo a ${(pico * 100).toFixed(0)}%.`, destinatario));
      }
    }

    // AL-CAPACIDADE-INSUFICIENTE — as horas de todos os perfis não chegam ao término.
    if (perfis.length > 0) {
      const minutosRestantes = perfis.reduce((s, p) => {
        const c = calcularConsumoPerfil(p, aprovados.filter((r) => r.perfilId === p.id));
        return s + Math.max(0, p.quantidadePrevista - c.minutosConsumidos);
      }, 0);
      const previsoes = perfis.map((p) => preverPerfil(p, aprovados, contrato, hoje));
      const ritmoTotal = previsoes.reduce((s, p) => s + p.ritmoDiaMin, 0);
      const diasAteTermino = Math.max(0, diasEntre(hoje, contrato.dataTerminoContratual));
      const necessarios = ritmoTotal * diasAteTermino;
      if (ritmoTotal > 0 && necessarios > minutosRestantes) {
        out.push(this.novoAlerta(contrato.id, 'AL-CAPACIDADE-INSUFICIENTE', 'CRITICO',
          'Capacidade insuficiente até ao término',
          `Ao ritmo recente seriam necessárias ${horas(necessarios)} até ao término, mas só restam ${horas(minutosRestantes)} em todos os perfis: faltam ${horas(necessarios - minutosRestantes)}.`,
          destinatario, { impactoMinutos: Math.round(necessarios - minutosRestantes) }));
      }
    }

    // AL-COMPLEMENTARES-40/-45 (RN-302 consultiva)
    const complementares = alteracoes.filter((a) => a.tipo === 'SERVICOS_COMPLEMENTARES').reduce((s, a) => s + (a.valorAcrescido ?? 0), 0);
    const rc = RN_302.avaliar({ precoContratualInicial: contrato.precoContratualInicial, complementaresAcumulados: complementares });
    if (!rc.ok && contrato.precoContratualInicial > 0) {
      const pct = complementares / contrato.precoContratualInicial;
      out.push(this.novoAlerta(contrato.id, pct >= 0.45 ? 'AL-COMPLEMENTARES-45' : 'AL-COMPLEMENTARES-40', pct >= 0.45 ? 'CRITICO' : 'AVISO',
        'Consumo de serviços complementares', `Serviços complementares a ${(pct * 100).toFixed(0)}% do preço inicial.`, destinatario));
    }
    return out;
  }

  // ─── D · Fim de ciclo ────────────────────────────────────────────────────
  private fimDeCiclo(contrato: Contrato, hoje: DataISO, meses: number, destinatario: string): Alerta[] {
    const out: Alerta[] = [];

    // AL-NOVO-PROCEDIMENTO — trabalha para trás a partir do término.
    const exigeVisto = contrato.vistoTribunalContasNecessario;
    // Antecedência generosa (6 meses sobre a data-limite): é um alerta de
    // planeamento. A severidade escala com a janela, pelo que um aviso distante
    // aparece como INFO e não gera ruído.
    const j = janelaNovoProcedimento(hoje, contrato.dataTerminoContratual, exigeVisto);
    if (j.diasParaLimite <= 180) {
      out.push(this.novoAlerta(contrato.id, 'AL-NOVO-PROCEDIMENTO', 'AVISO',
        'Novo procedimento a lançar em tempo útil',
        `Para haver contrato quando este terminar (${contrato.dataTerminoContratual}), o procedimento tem de ser lançado a tempo${exigeVisto ? ', incluindo o acréscimo de prazo do visto prévio do Tribunal de Contas' : ''}.` + this.prazo(j),
        destinatario, { janela: j }));
    }

    if (meses <= 3 && meses >= 0) {
      out.push(this.novoAlerta(contrato.id, 'AL-TERMINO-3M', 'CRITICO', 'Término a menos de 3 meses', `Faltam ${meses.toFixed(1)} meses para o término.`, destinatario));
    } else if (meses <= 6 && meses >= 0) {
      out.push(this.novoAlerta(contrato.id, 'AL-TERMINO-6M', 'AVISO', 'Término a menos de 6 meses', `Faltam ${meses.toFixed(1)} meses para o término.`, destinatario));
    }

    if (excedeLimiteVigencia(contrato)) {
      out.push(this.novoAlerta(contrato.id, 'AL-VIGENCIA-36M', 'CRITICO', 'Vigência aproxima-se ou excede 36 meses', 'Rever prazo e exceção fundamentada (RN-202).', destinatario));
    }
    return out;
  }

  // ─── E · Higiene e risco de auditoria ────────────────────────────────────
  private higiene(
    contrato: Contrato, hoje: DataISO,
    alteracoes: Awaited<ReturnType<Contexto['repos']['alteracoes']['todos']>>,
    aprovados: Awaited<ReturnType<Contexto['repos']['registosTempo']['todos']>>,
    destinatario: string,
  ): Alerta[] {
    const out: Alerta[] = [];
    const suspensoes = periodosSuspensao(alteracoes);

    // AL-SUSPENSAO-VIGENCIA (RN-204 consultiva)
    const projetadaMeses = mesesEntre(contrato.dataInicioVigencia, terminoExecucaoAjustado(contrato, alteracoes));
    const temExcecaoVigencia = contrato.excecoes.some((e) => e.regra === 'RN-204' || e.regra === 'RN-202');
    if (projetadaMeses > LIMITE_VIGENCIA_MESES && !excedeLimiteVigencia(contrato) && !temExcecaoVigencia) {
      out.push(this.novoAlerta(contrato.id, 'AL-SUSPENSAO-VIGENCIA', 'AVISO',
        'Suspensão empurra a vigência além dos 36 meses',
        `A deslocação por suspensões projeta a vigência para ${projetadaMeses.toFixed(0)} meses; pondere exceção fundamentada (RN-204).`, destinatario));
    }

    // AL-SUSPENSAO-ABERTA — suspensão sem fim há mais de 90 dias.
    for (const s of suspensoes) {
      if (s.dataFim === undefined && diasEntre(s.dataInicio, hoje) > 90) {
        out.push(this.novoAlerta(contrato.id, 'AL-SUSPENSAO-ABERTA', 'AVISO',
          'Suspensão sem data de fim',
          `Há uma suspensão em aberto desde ${s.dataInicio} (${diasEntre(s.dataInicio, hoje)} dias). O prazo de execução está parado por tempo indeterminado — delimite o período ou levante a suspensão.`,
          destinatario));
        break;
      }
    }

    // AL-EXECUCAO-FORA-VIGENCIA — registos aprovados fora da vigência ou em suspensão.
    const transitadaAte = contrato.transicaoAnoEconomico?.execucaoTransitadaAte;
    const limiteExecucao = transitadaAte !== undefined && transitadaAte > contrato.dataTerminoContratual ? transitadaAte : contrato.dataTerminoContratual;
    const forbidden = aprovados.filter((r) =>
      r.data < contrato.dataInicioVigencia || r.data > limiteExecucao ||
      suspensoes.some((s) => s.suspendePrazoExecucao && r.data >= s.dataInicio && r.data <= (s.dataFim ?? '9999-12-31')));
    if (forbidden.length > 0) {
      const valor = forbidden.reduce((s, r) => s + r.valorImputado, 0);
      out.push(this.novoAlerta(contrato.id, 'AL-EXECUCAO-FORA-VIGENCIA', 'CRITICO',
        'Execução registada fora da vigência',
        `Há ${forbidden.length} registo(s) aprovado(s) com data fora da vigência (${contrato.dataInicioVigencia} a ${limiteExecucao}) ou dentro de período suspenso, no valor de ${eur(valor)}. Reveja e corrija.`,
        destinatario, { impactoValor: valor }));
    }

    // AL-VISTO-PENDENTE
    if (contrato.vistoTribunalContasNecessario && contrato.dataVistoTribunalContas === undefined && (contrato.vistoTacito ?? false) === false) {
      out.push(this.novoAlerta(contrato.id, 'AL-VISTO-PENDENTE', 'CRITICO', 'Visto do TdC pendente', 'Contrato em execução sem visto do Tribunal de Contas.', destinatario));
    }
    return out;
  }
}

/** A mais grave de duas severidades. */
function maiorSeveridade(a: SeveridadeAlerta, b: SeveridadeAlerta): SeveridadeAlerta {
  const ordem: Record<SeveridadeAlerta, number> = { INFO: 0, AVISO: 1, CRITICO: 2 };
  return ordem[a] >= ordem[b] ? a : b;
}

// Reexportado para conveniência de quem importa o job.
export { adicionarDias, vigenciaLiquidaMeses };
