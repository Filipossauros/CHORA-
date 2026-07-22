import { Fragment, useState, type ReactNode } from 'react';
import { JobAlertas } from '@chora/api/nucleo';
import type { Alerta } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Estado, useAsync } from '../comum.js';

export function Alertas(): ReactNode {
  const podeGerir = app.papeisAtuais().some((p) => p === 'GESTOR_CONTRATO' || p === 'GESTOR_TECNICO');
  const base = useAsync(() => app.ctx.repos.alertas.todos(), []);
  const [aberto, setAberto] = useState<string>();
  const [sugestao, setSugestao] = useState<Record<string, string>>({});

  async function executar(): Promise<void> {
    await new JobAlertas(app.ctx).executar();
    base.recarregar();
  }

  /** Stub de recurso a IA: propõe uma ação de execução a partir do alerta. */
  async function sugerir(a: Alerta): Promise<void> {
    setAberto(a.id);
    if (sugestao[a.id] === undefined) {
      const texto = await sugestaoIA(a);
      setSugestao((s) => ({ ...s, [a.id]: texto }));
    }
  }

  const sev = (s: string): string => (s === 'CRITICO' ? 'REJEITADO' : s === 'AVISO' ? 'AGUARDA_VISTO' : 'RECEBIDA');
  return (
    <>
      <Cabecalho titulo="Alertas" sub="Preocupações de execução do contrato (secção 11)" acoes={podeGerir ? <button className="btn" onClick={() => void executar()}>Executar job de alertas</button> : undefined} />
      <div className="cartao"><table>
        <thead><tr><th>Severidade</th><th>Código</th><th>Título</th><th>Detalhe</th><th></th></tr></thead>
        <tbody>{(base.dados ?? []).map((a) => (
          <Fragment key={a.id}>
            <tr>
              <td><Estado v={sev(a.severidade)} /></td>
              <td><code>{a.codigo}</code></td>
              <td className="prim">{a.titulo}</td>
              <td>{a.detalhe}</td>
              <td style={{ whiteSpace: 'nowrap' }}><button className="btn sm" onClick={() => void sugerir(a)}>✨ Sugestão (IA)</button></td>
            </tr>
            {aberto === a.id && (
              <tr>
                <td colSpan={5}>
                  <div className="aviso" style={{ margin: 0 }}>
                    <b>Sugestão (IA · protótipo):</b> {sugestao[a.id] ?? 'A analisar…'}
                    <div className="sec" style={{ marginTop: 4 }}>Sugestão gerada por stub determinístico; não constitui parecer jurídico.</div>
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        ))}
        {base.dados?.length === 0 && <tr><td colSpan={5} className="vazio">Sem alertas.</td></tr>}</tbody>
      </table></div>
    </>
  );
}

/**
 * Stub de IA (secção 14 — ponto de extensão). Devolve uma sugestão de ação de
 * execução consoante o código do alerta. Para o valor disponível reduzido,
 * verifica se já existe pedido de trabalhos complementares.
 */
async function sugestaoIA(a: Alerta): Promise<string> {
  if (a.codigo === 'AL-VALOR-DISPONIVEL') {
    const alteracoes = await app.ctx.repos.alteracoes.todos((x) => x.contratoId === a.contratoId);
    const jaPediu = alteracoes.some((x) => x.tipo === 'SERVICOS_COMPLEMENTARES');
    return jaPediu
      ? 'Já existe um pedido de trabalhos complementares registado. Acompanhe a tramitação e, se necessário, o visto prévio do Tribunal de Contas antes de novo consumo.'
      : 'Pondere solicitar trabalhos complementares (dentro do limite de 50% do valor inicial, RN-301), fundamentando a necessidade, antes que o saldo se esgote.';
  }
  const MAPA: Record<string, string> = {
    'AL-TERMINO-3M': 'Prepare a caducidade ou uma eventual prorrogação/novo procedimento em tempo útil; confirme entregáveis pendentes.',
    'AL-TERMINO-6M': 'Planeie a transição: confirme o saldo de horas e o calendário de execução até ao término.',
    'AL-VIGENCIA-36M': 'Reveja o prazo de vigência e fundamente a exceção ao limite (RN-202) se aplicável.',
    'AL-COMPLEMENTARES-40': 'Acompanhe o acumulado de trabalhos complementares face ao limite legal de 50% (RN-301).',
    'AL-COMPLEMENTARES-45': 'Está próximo do limite de 50% de trabalhos complementares; evite novos acréscimos sem análise.',
    'AL-PERFIL-80': 'O perfil aproxima-se do esgotamento; reequilibre afetações ou reveja o planeamento de horas.',
    'AL-PERFIL-90': 'O perfil está quase esgotado; suspenda novos registos ou pondere reforço dentro do contrato.',
    'AL-VISTO-PENDENTE': 'Confirme a submissão ao Tribunal de Contas; não deve haver execução relevante sem visto (salvo visto tácito).',
    'AL-HABILITACAO': 'Solicite ao prestador a renovação do documento de habilitação antes de expirar.',
    'AL-PUBLICITACAO': 'Publicite a alteração no Portal BASE dentro do prazo legal.',
    'AL-FATURA-PRAZO': 'Priorize a conferência e o pagamento da fatura para cumprir o prazo.',
  };
  return MAPA[a.codigo] ?? 'Reveja a situação do contrato e atue conforme o enquadramento aplicável do CCP.';
}
