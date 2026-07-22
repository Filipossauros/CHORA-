import {
  RN_302, RN_505, RN_703,
  calcularConsumoPerfil, valorPrevistoPerfil, mesesAteTermino, excedeLimiteVigencia,
  diaDeInstante,
  type Alerta, type SeveridadeAlerta,
} from '@chora/domain';
import type { Contexto } from '../contexto.js';

/**
 * Job de alertas (secção 11). Determinístico: percorre os contratos em vigor e
 * gera alertas a partir das regras consultivas e das projeções de prazo.
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

export class JobAlertas {
  constructor(
    private readonly ctx: Contexto,
    private readonly notifier: Notifier = new NotifierConsola(),
  ) {}

  private novoAlerta(
    contratoId: string, codigo: string, severidade: SeveridadeAlerta,
    titulo: string, detalhe: string, destinatarioId: string,
  ): Alerta {
    return {
      id: this.ctx.ids.novo('alr'), contratoId, codigo, severidade, titulo, detalhe,
      destinatarioId, geradoEm: this.ctx.relogio.agora(),
    };
  }

  private gestorPrincipal(gestores: ReadonlyArray<{ utilizadorId: string; principal: boolean }>): string {
    const p = gestores.find((g) => g.principal) ?? gestores[0];
    return p?.utilizadorId ?? 'sem-gestor';
  }

  async executar(): Promise<Alerta[]> {
    const hoje = diaDeInstante(this.ctx.relogio.agora());
    const gerados: Alerta[] = [];
    const contratos = await this.ctx.repos.contratos.todos((c) => c.estado === 'EM_VIGOR' || c.estado === 'SUSPENSO');

    for (const contrato of contratos) {
      const destinatario = this.gestorPrincipal(contrato.gestores);
      const alteracoes = await this.ctx.repos.alteracoes.todos((a) => a.contratoId === contrato.id);
      const perfis = await this.ctx.repos.perfis.todos((p) => p.contratoId === contrato.id);
      const aprovados = await this.ctx.repos.registosTempo.todos((r) => r.contratoId === contrato.id && r.estado === 'APROVADO');

      // AL-TERMINO-6M / -3M
      const meses = mesesAteTermino(contrato, hoje);
      if (meses <= 3 && meses >= 0) {
        gerados.push(this.novoAlerta(contrato.id, 'AL-TERMINO-3M', 'CRITICO', 'Término a menos de 3 meses', `Faltam ${meses.toFixed(1)} meses para o término.`, destinatario));
      } else if (meses <= 6 && meses >= 0) {
        gerados.push(this.novoAlerta(contrato.id, 'AL-TERMINO-6M', 'AVISO', 'Término a menos de 6 meses', `Faltam ${meses.toFixed(1)} meses para o término.`, destinatario));
      }

      // AL-VIGENCIA-36M
      if (excedeLimiteVigencia(contrato)) {
        gerados.push(this.novoAlerta(contrato.id, 'AL-VIGENCIA-36M', 'CRITICO', 'Vigência aproxima-se ou excede 36 meses', 'Rever prazo e exceção fundamentada (RN-202).', destinatario));
      }

      // AL-COMPLEMENTARES-40/-45 (RN-302 consultiva)
      const complementares = alteracoes.filter((a) => a.tipo === 'SERVICOS_COMPLEMENTARES').reduce((s, a) => s + (a.valorAcrescido ?? 0), 0);
      const rc = RN_302.avaliar({ precoContratualInicial: contrato.precoContratualInicial, complementaresAcumulados: complementares });
      if (!rc.ok && contrato.precoContratualInicial > 0) {
        const pct = complementares / contrato.precoContratualInicial;
        const sev: SeveridadeAlerta = pct >= 0.45 ? 'CRITICO' : 'AVISO';
        gerados.push(this.novoAlerta(contrato.id, pct >= 0.45 ? 'AL-COMPLEMENTARES-45' : 'AL-COMPLEMENTARES-40', sev, 'Consumo de serviços complementares', `Serviços complementares a ${(pct * 100).toFixed(0)}% do preço inicial.`, destinatario));
      }

      // AL-PERFIL-80/-90 (RN-505 consultiva)
      for (const p of perfis) {
        const consumo = calcularConsumoPerfil(p, aprovados);
        const previsto = valorPrevistoPerfil(p);
        const pctValor = previsto > 0 ? consumo.valorConsumido / previsto : 0;
        const rp = RN_505.avaliar({ percentagemHoras: consumo.percentagemHoras, percentagemValor: pctValor });
        if (!rp.ok) {
          const pico = Math.max(consumo.percentagemHoras, pctValor);
          const sev: SeveridadeAlerta = pico >= 0.9 ? 'CRITICO' : 'AVISO';
          gerados.push(this.novoAlerta(contrato.id, pico >= 0.9 ? 'AL-PERFIL-90' : 'AL-PERFIL-80', sev, `Consumo do perfil ${p.nome}`, `Consumo a ${(pico * 100).toFixed(0)}%.`, destinatario));
        }
      }

      // AL-VALOR-DISPONIVEL — o contrato tem 40% (ou menos) do valor por executar.
      // Sinaliza a necessidade de ponderar trabalhos complementares (secção 11).
      const valorExecutado = aprovados.reduce((s, r) => s + r.valorImputado, 0);
      const valorDisponivel = Math.max(0, contrato.precoContratualAtual - valorExecutado);
      if (contrato.precoContratualAtual > 0 && valorDisponivel <= contrato.precoContratualAtual * 0.4) {
        const pctDisp = valorDisponivel / contrato.precoContratualAtual;
        gerados.push(this.novoAlerta(contrato.id, 'AL-VALOR-DISPONIVEL', pctDisp <= 0.2 ? 'CRITICO' : 'AVISO', 'Valor disponível reduzido', `O contrato tem apenas ${(pctDisp * 100).toFixed(0)}% do valor disponível.`, destinatario));
      }

      // AL-VISTO-PENDENTE
      if (contrato.vistoTribunalContasNecessario && contrato.dataVistoTribunalContas === undefined && (contrato.vistoTacito ?? false) === false) {
        gerados.push(this.novoAlerta(contrato.id, 'AL-VISTO-PENDENTE', 'CRITICO', 'Visto do TdC pendente', 'Contrato em execução sem visto do Tribunal de Contas.', destinatario));
      }

      // AL-HABILITACAO (RN-703 consultiva)
      const docs = await this.ctx.repos.documentosHabilitacao.todos((d) => d.contratoId === contrato.id);
      for (const d of docs) {
        const rh = RN_703.avaliar({ validoAte: d.validoAte, hoje });
        if (!rh.ok) {
          gerados.push(this.novoAlerta(contrato.id, 'AL-HABILITACAO', 'AVISO', 'Documento de habilitação a expirar', `${d.tipo} válido até ${d.validoAte}.`, destinatario));
        }
      }

      // AL-PUBLICITACAO (alteração por publicitar há > 10 dias)
      for (const a of alteracoes) {
        const pub = a.publicitacaoPortalBase;
        if (pub !== undefined && pub.obrigatoria && pub.efetuadaEm === undefined) {
          gerados.push(this.novoAlerta(contrato.id, 'AL-PUBLICITACAO', 'AVISO', 'Alteração por publicitar', `Alteração ${a.id} por publicitar no Portal BASE.`, destinatario));
        }
      }
    }

    // AL-FATURA-PRAZO
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
}
