import {
  criarContexto, semear, ServicoRegistosTempo, ServicoContratos, JobAlertas,
  paraProblema, ErroProibido, FakeTokenValidator, UTILIZADORES_DEV, podeExecutar,
  type Contexto, type ContextoUtilizador, type NovoRegisto,
} from '@chora/api/nucleo';
import { relogioSistema } from '@chora/domain';
import type { IClienteApi } from '../src/comum/cliente-api.js';
import { ErroApi } from '../src/comum/cliente-api.js';

/**
 * Cliente que corre a API inteiramente no browser (GitHub Pages). Reencaminha os
 * pedidos das vistas para os serviços reais sobre repositórios em memória — as
 * regras de negócio (RN-xxx) e a autorização por papel são exatamente as mesmas.
 * Sem servidor, sem rede: os dados reiniciam ao recarregar a página.
 */

let contextoPartilhado: Contexto | undefined;
let jaSemeado = false;

export async function obterContexto(): Promise<Contexto> {
  if (contextoPartilhado === undefined) {
    const tokenValidator = new FakeTokenValidator(UTILIZADORES_DEV, relogioSistema);
    contextoPartilhado = criarContexto({ tokenValidator, relogio: relogioSistema });
  }
  if (!jaSemeado) {
    await semear(contextoPartilhado);
    await new JobAlertas(contextoPartilhado).executar(); // popula os alertas da V3
    jaSemeado = true;
  }
  return contextoPartilhado;
}

function utilizadorDe(id: string): ContextoUtilizador {
  const u = UTILIZADORES_DEV.find((x) => x.utilizadorId === id);
  return {
    utilizadorId: id,
    papeis: u?.papeis ?? ['ELEMENTO_EQUIPA_TECNICA'],
    projetoId: 'proj-P1',
    validoAte: relogioSistema.agora(),
  };
}

export class ClienteMemoria implements IClienteApi {
  constructor(
    private readonly ctx: Contexto,
    private readonly utilizadorId: string,
  ) {}

  private get u(): ContextoUtilizador {
    return utilizadorDe(this.utilizadorId);
  }

  private erro(e: unknown): never {
    const { status, corpo } = paraProblema(e);
    throw new ErroApi(corpo, status);
  }

  async get<T>(caminho: string): Promise<T> {
    const url = new URL(caminho, 'http://memoria');
    const p = url.pathname;
    const q = url.searchParams;
    const r = this.ctx.repos;
    const podeVerTerceiros = podeExecutar(this.u.papeis, 'registo.ver.terceiros');
    try {
      if (p === '/api/v1/afetacoes') {
        const dados = (await r.afetacoes.todos()).filter(
          (a) => (podeVerTerceiros || a.recursoId === this.u.utilizadorId) &&
            (q.get('recursoId') === null || a.recursoId === q.get('recursoId')) &&
            (q.get('ativa') === null || a.ativa === (q.get('ativa') === 'true')),
        );
        return { dados, total: dados.length, pagina: 1, tamanho: dados.length } as T;
      }
      if (p.startsWith('/api/v1/work-items/')) {
        const wid = Number(p.split('/')[4]);
        const dados = await r.registosTempo.todos((x) => x.workItemId === wid && (podeVerTerceiros || x.recursoId === this.u.utilizadorId));
        return { dados, total: dados.length, pagina: 1, tamanho: dados.length } as T;
      }
      if (p === '/api/v1/registos-tempo') {
        const dados = (await r.registosTempo.todos((x) =>
          (podeVerTerceiros || x.recursoId === this.u.utilizadorId) &&
          (q.get('estado') === null || x.estado === q.get('estado')) &&
          (q.get('contratoId') === null || x.contratoId === q.get('contratoId')),
        )).sort((a, b) => (a.data < b.data ? 1 : -1));
        return { dados, total: dados.length, pagina: 1, tamanho: dados.length } as T;
      }
      if (p === '/api/v1/registos-tempo/meus') {
        const dados = await r.registosTempo.todos((x) => x.recursoId === this.u.utilizadorId);
        return { dados, total: dados.length, pagina: 1, tamanho: dados.length } as T;
      }
      if (p === '/api/v1/contratos') {
        const dados = await r.contratos.todos();
        return { dados, total: dados.length, pagina: 1, tamanho: dados.length } as T;
      }
      const mResumo = p.match(/^\/api\/v1\/contratos\/([^/]+)\/resumo-execucao$/);
      if (mResumo) {
        return (await new ServicoContratos(this.ctx).resumoExecucao(mResumo[1]!)) as T;
      }
      if (p === '/api/v1/alertas') {
        const dados = (await r.alertas.todos()).filter((a) => podeVerTerceiros || a.destinatarioId === this.u.utilizadorId);
        return { dados, total: dados.length, pagina: 1, tamanho: dados.length } as T;
      }
      throw new Error(`Rota não suportada na demonstração: GET ${p}`);
    } catch (e) {
      this.erro(e);
    }
  }

  async post<T>(caminho: string, corpo?: unknown): Promise<T> {
    const p = new URL(caminho, 'http://memoria').pathname;
    const servico = new ServicoRegistosTempo(this.ctx);
    try {
      if (p === '/api/v1/registos-tempo') {
        return (await servico.criar(corpo as NovoRegisto, this.u)) as T;
      }
      const mSub = p.match(/^\/api\/v1\/registos-tempo\/([^/]+)\/submeter$/);
      if (mSub) return (await servico.submeter(mSub[1]!, this.u)) as T;
      const mAnu = p.match(/^\/api\/v1\/registos-tempo\/([^/]+)\/anular$/);
      if (mAnu) return (await servico.anular(mAnu[1]!, (corpo as { motivo: string }).motivo, this.u)) as T;
      if (p === '/api/v1/registos-tempo/_aprovar' || p === '/api/v1/registos-tempo:aprovar') {
        if (!podeExecutar(this.u.papeis, 'registo.aprovar')) throw new ErroProibido('Sem competência para aprovar.');
        return { resultados: await servico.aprovar((corpo as { ids: string[] }).ids, this.u) } as T;
      }
      if (p === '/api/v1/registos-tempo/_rejeitar' || p === '/api/v1/registos-tempo:rejeitar') {
        const b = corpo as { ids: string[]; motivo: string };
        return { resultados: await servico.rejeitar(b.ids, b.motivo, this.u) } as T;
      }
      throw new Error(`Rota não suportada na demonstração: POST ${p}`);
    } catch (e) {
      this.erro(e);
    }
  }

  async patch<T>(_caminho: string, _corpo?: unknown): Promise<T> {
    throw new Error('PATCH não usado pelas vistas na demonstração.');
  }
}
