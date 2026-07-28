import { useState, type ReactNode } from 'react';
import { CATALOGO_CENARIOS } from '@chora/api/nucleo';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { mensagemErro, useAsync } from '../comum.js';

/** Rótulos das contagens do resumo, pela ordem em que fazem sentido ler-se. */
const ROTULOS: Array<[string, string]> = [
  ['contratos', 'Contratos'],
  ['perfis', 'Perfis'],
  ['afetacoes', 'Afetações'],
  ['registosTempo', 'Registos de tempo'],
  ['faturas', 'Faturas'],
  ['alteracoes', 'Modificações'],
  ['procedimentos', 'Procedimentos'],
];

/**
 * DADOS DE DEMONSTRAÇÃO — que conjunto de dados está carregado.
 *
 * O conjunto único servia dois patrões incompatíveis: cobrir todas as regras,
 * o que exige amplitude, e demonstrar, o que exige foco. Vinte contratos
 * construídos para disparar cada um o seu alerta são cobertura exemplar e
 * demonstração péssima — na fila do «Hoje» não se distingue o que se está a
 * ver.
 *
 * Trocar de cenário SUBSTITUI tudo. Não é uma limitação técnica: acumular
 * cenários traria de volta exatamente o problema que se está a resolver.
 */
export function DadosDemonstracao(): ReactNode {
  const [aCarregar, setACarregar] = useState<string | undefined>(undefined);
  const [erro, setErro] = useState<string | undefined>(undefined);
  const atual = app.cenarioAtual();

  const estado = useAsync(async () => app.resumo(), [atual]);

  async function carregar(id: string, nome: string): Promise<void> {
    if (!confirm(
      `Carregar «${nome}»?\n\nTudo o que está na aplicação é apagado e substituído — incluindo contratos criados por si, ` +
      'registos, faturas e relatórios guardados.',
    )) return;
    setACarregar(id); setErro(undefined);
    try {
      await app.carregarCenario(id);
      location.reload();
    } catch (e) { setErro(mensagemErro(e)); setACarregar(undefined); }
  }

  const resumo = estado.dados ?? {};
  const total = Object.values(resumo).reduce((s, n) => s + n, 0);

  return (
    <>
      <Cabecalho titulo="Dados de demonstração" sub="Que conjunto de dados a aplicação tem carregado" />

      <div className="aviso" style={{ marginBottom: 12 }}>
        Os dados vivem no <b>browser</b> (localStorage) e são só seus — trocar de cenário não afeta mais ninguém.
        Carregar um cenário <b>substitui tudo</b>: o que estiver feito por cima, incluindo contratos criados à mão e
        relatórios guardados, desaparece. O cenário escolhido fica memorizado e sobrevive a recarregamentos e a
        atualizações da aplicação.
      </div>

      {erro !== undefined && <div className="erro-cx" style={{ marginBottom: 12 }}>⚠ {erro}</div>}

      {CATALOGO_CENARIOS.map((c) => {
        const carregado = c.id === atual;
        return (
          <div className="cartao" key={c.id} style={{ marginBottom: 12, ...(carregado ? { borderColor: 'var(--marca)' } : {}) }}>
            <h3>
              {c.nome}
              {carregado && <span className="pill p-azul" style={{ marginLeft: 8 }}>carregado</span>}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button
                  className={`btn sm ${carregado ? '' : 'pri'}`}
                  disabled={aCarregar !== undefined}
                  onClick={() => void carregar(c.id, c.nome)}
                >
                  {aCarregar === c.id ? 'A carregar…' : carregado ? '↻ Recarregar' : '▸ Carregar'}
                </button>
              </span>
            </h3>
            <div className="corpo" style={{ paddingTop: 0 }}>
              <p style={{ margin: '0 0 8px', fontSize: 13, lineHeight: 1.6 }}>{c.descricao}</p>
              <div className="sec" style={{ fontSize: 12.5 }}>{c.conteudo}</div>

              {carregado && total > 0 && (
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10, fontSize: 12.5 }}>
                  {ROTULOS.filter(([k]) => (resumo[k] ?? 0) > 0).map(([k, rot]) => (
                    <span key={k}><b className="prim">{resumo[k]}</b> <span className="sec">{rot.toLowerCase()}</span></span>
                  ))}
                </div>
              )}
              {carregado && total === 0 && (
                <div className="sec" style={{ marginTop: 10, fontSize: 12.5 }}>
                  A aplicação está vazia. Comece em <b>Contratos → + Novo contrato</b> — é o percurso que os cenários
                  semeados nunca obrigam a percorrer.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </>
  );
}
