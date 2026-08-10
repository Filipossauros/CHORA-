import { useMemo, useState, type ReactNode } from 'react';
import { CATALOGO_REGRAS, CATALOGO_ALERTAS, FAMILIAS_ALERTAS } from '@chora/domain';
import { ServicoAssistente, AgenteLocal, type CapacidadePublica } from '@chora/api/nucleo';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Severidade } from '../comum.js';
import { configModelo, guardarConfigModelo, type ConfigAssistente } from '../assistente/config-modelo.js';

/** Área derivada do código RN-xxx, para agrupar. */
function area(codigo: string): string {
  const n = Number(codigo.replace(/[^0-9]/g, '').slice(0, 1));
  return { 1: 'Contrato', 2: 'Prazos e vigência', 3: 'Modificações e complementares', 4: 'Registo de tempo', 5: 'Aprovação e consumo', 6: 'Faturação', 7: 'Afetações e habilitação' }[n] ?? 'Outras';
}

export function Regras(): ReactNode {
  const [q, setQ] = useState('');
  const [aba, setAba] = useState<'negocio' | 'alertas' | 'assistente'>('negocio');
  const t = q.trim().toLowerCase();

  const regras = useMemo(() => [...CATALOGO_REGRAS]
    .filter((r) => t === '' || `${r.codigo} ${r.descricao} ${r.base}`.toLowerCase().includes(t))
    .sort((a, b) => (a.codigo < b.codigo ? -1 : 1)), [t]);

  const alertas = useMemo(() => CATALOGO_ALERTAS
    .filter((a) => t === '' || `${a.codigo} ${a.titulo} ${a.descricao} ${a.familia} ${a.regraRelacionada ?? ''} ${a.base ?? ''} ${a.notaJuridica ?? ''}`.toLowerCase().includes(t)), [t]);

  const comJanela = alertas.filter((a) => a.temJanelaDecisao === true).length;

  const capacidades = useMemo(() => new ServicoAssistente(app.ctx).capacidades()
    .filter((c) => t === '' || `${c.nome} ${c.titulo} ${c.descricao} ${c.regras.join(' ')} ${c.exemplos.join(' ')}`.toLowerCase().includes(t)), [t]);

  return (
    <>
      <Cabecalho titulo="Regras e alertas" sub="Todas as regras de negócio e todos os alertas da aplicação — transparentes e auditáveis" acoes={
        <input placeholder="Pesquisar…" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: 240 }} />
      } />
      <div className="aviso" style={{ marginBottom: 12 }}>
        As <b>regras de negócio</b> (RN-xxx) são a única camada que <b>bloqueia</b> ou condiciona decisões.
        Os <b>alertas</b> (AL-xxx) sinalizam preocupações de execução e são sempre consultivos; os que têm
        <b> janela de decisão</b> indicam a data-limite para agir, calculada para trás a partir do
        evento-âncora com o prazo de instrução do ato (parametrizado na base legal versionada).
      </div>

      <div className="abas" style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button className={`btn sm ${aba === 'negocio' ? 'pri' : ''}`} onClick={() => setAba('negocio')}>Regras de negócio ({regras.length})</button>
        <button className={`btn sm ${aba === 'alertas' ? 'pri' : ''}`} onClick={() => setAba('alertas')}>Alertas ({alertas.length}{comJanela > 0 ? ` · ${comJanela} com janela` : ''})</button>
        <button className={`btn sm ${aba === 'assistente' ? 'pri' : ''}`} onClick={() => setAba('assistente')}>Funções do assistente ({capacidades.length})</button>
      </div>

      {aba === 'assistente' ? (
        <FuncoesAssistente capacidades={capacidades} />
      ) : aba === 'negocio' ? (
        <div className="cartao"><table>
          <thead><tr><th>Código</th><th>Regra</th><th>Área</th><th>Base legal</th><th>Efeito</th><th>Exceção</th></tr></thead>
          <tbody>{regras.map((r) => (
            <tr key={r.codigo}>
              <td className="prim"><code>{r.codigo}</code></td>
              <td>{r.descricao}</td>
              <td className="sec">{area(r.codigo)}</td>
              <td className="sec">{r.base && r.base !== '—' ? r.base : '—'}</td>
              <td><span className={`pill ${r.bloqueia === false ? 'p-azul' : 'p-verm'}`}>{r.bloqueia === false ? 'Consultiva' : 'Bloqueia'}</span></td>
              <td>{r.excecaoFundamentavel ? <span className="pill p-ambar">Fundamentável</span> : '—'}</td>
            </tr>
          ))}{regras.length === 0 && <tr><td colSpan={6} className="vazio">Sem regras para a pesquisa.</td></tr>}</tbody>
        </table></div>
      ) : (
        <>
          {FAMILIAS_ALERTAS.map((fam) => {
            const daFamilia = alertas.filter((a) => a.familia === fam);
            if (daFamilia.length === 0) return null;
            return (
              <div className="cartao" key={fam} style={{ marginBottom: 16 }}>
                <h3>{fam}</h3>
                <table>
                  <thead><tr><th>Código</th><th>Alerta</th><th>Condição</th><th>Severidade base</th><th>Janela de decisão</th><th>Regra ligada</th><th>Base legal</th><th>Nota jurídica das ações</th></tr></thead>
                  <tbody>{daFamilia.map((a) => (
                    <tr key={a.codigo}>
                      <td className="prim"><code>{a.codigo}</code></td>
                      <td>{a.titulo}</td>
                      <td className="sec">{a.descricao}</td>
                      <td><Severidade v={a.severidadeBase} /></td>
                      <td className="sec">{a.temJanelaDecisao === true ? <span className="pill p-ambar" title={a.eventoAncora}>{a.eventoAncora ?? 'sim'}</span> : '—'}</td>
                      <td className="sec">{a.regraRelacionada !== undefined ? <code>{a.regraRelacionada}</code> : '—'}</td>
                      <td className="sec">{a.base ?? '—'}</td>
                      <td className="sec">{a.notaJuridica ?? '—'}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            );
          })}
          {alertas.length === 0 && <div className="cartao"><table><tbody><tr><td className="vazio">Sem alertas para a pesquisa.</td></tr></tbody></table></div>}
        </>
      )}
    </>
  );
}

const ROT_PAPEL: Record<string, string> = {
  GESTOR_CONTRATO: 'Gestor de contrato',
  ADMINISTRADOR: 'Administrador',
  VALIDADOR: 'Validador',
  ELEMENTO_EQUIPA_TECNICA: 'Elemento da equipa',
};

/**
 * FUNÇÕES DO ASSISTENTE — a lista fechada do que o chat pode fazer.
 *
 * É a peça de transparência que falta a qualquer assistente: quem usa tem de
 * poder ver, sem ler código, o que é que aquilo consegue mexer. A tabela é
 * gerada do próprio catálogo, pelo que não pode ficar desatualizada — se uma
 * capacidade não estiver aqui, não existe.
 */
function FuncoesAssistente({ capacidades }: { capacidades: CapacidadePublica[] }): ReactNode {
  const consultas = capacidades.filter((c) => c.tipo === 'CONSULTA');
  const acoes = capacidades.filter((c) => c.tipo === 'ACAO');
  return (
    <>
      <div className="aviso" style={{ marginBottom: 12 }}>
        O assistente <b>só faz o que está nesta tabela</b>. Uma frase que não corresponda a nenhuma destas funções não
        executa nada. As <b>consultas</b> leem e respondem; as <b>ações</b> mostram primeiro o que vai acontecer, com as
        regras avaliadas em seco, e só se executam depois de confirmadas — pelos mesmos serviços que os botões dos ecrãs.
        O modelo de linguagem, quando existe, apenas escolhe a função e preenche os campos: nunca calcula valores, datas
        ou juízos de conformidade.
      </div>

      <div className="cartao" style={{ marginBottom: 16 }}>
        <h3>Consultas<span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>leem e respondem</span></h3>
        <TabelaFuncoes lista={consultas} />
      </div>
      <div className="cartao" style={{ marginBottom: 16 }}>
        <h3>Ações<span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>alteram dados, sempre com confirmação</span></h3>
        <TabelaFuncoes lista={acoes} />
      </div>

      <ModeloLocal />
    </>
  );
}

function TabelaFuncoes({ lista }: { lista: CapacidadePublica[] }): ReactNode {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table>
        <thead><tr><th>Função</th><th>O que faz</th><th>Parâmetros</th><th>Regras avaliadas</th><th>Quem pode</th><th>Exemplo</th></tr></thead>
        <tbody>
          {lista.map((c) => (
            <tr key={c.nome}>
              <td className="prim"><code>{c.nome}</code><div className="sec">{c.titulo}</div></td>
              <td className="sec">{c.descricao}</td>
              <td className="sec">
                {c.parametros.length === 0 ? '—' : c.parametros.map((p) => (
                  <div key={p.nome}><code>{p.nome}</code>{p.obrigatorio ? '' : '?'} <span style={{ opacity: 0.75 }}>{p.descricao}</span></div>
                ))}
              </td>
              <td className="sec">{c.regras.length === 0 ? '—' : c.regras.map((r) => <code key={r} style={{ marginRight: 4 }}>{r}</code>)}</td>
              <td className="sec">{c.papeis.map((p) => ROT_PAPEL[p] ?? p).join(', ')}</td>
              <td className="sec">«{c.exemplos[0]}»</td>
            </tr>
          ))}
          {lista.length === 0 && <tr><td colSpan={6} className="vazio">Nenhuma.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Configuração do modelo local. Desligado por omissão: sem ele o assistente
 * responde na mesma, pelo encaminhamento determinístico. Ligá-lo só acrescenta
 * tolerância a frases que os padrões não apanham — e continua a não calcular
 * nada.
 */
function ModeloLocal(): ReactNode {
  const [cfg, setCfg] = useState<ConfigAssistente>(() => configModelo());
  const [estado, setEstado] = useState<string>();

  function guardar(novo: ConfigAssistente): void {
    setCfg(novo); guardarConfigModelo(novo);
  }

  async function testar(): Promise<void> {
    setEstado('a testar…');
    const r = await new AgenteLocal(cfg).disponivel();
    setEstado(r.ok
      ? `Ligado. Modelos disponíveis: ${(r.modelos ?? []).join(', ') || 'nenhum instalado'}.`
      : `Sem ligação: ${r.erro ?? 'indisponível'}.`);
  }

  return (
    <div className="cartao">
      <h3>Modelo de linguagem local<span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>opcional</span></h3>
      <div className="corpo">
        <div className="aviso" style={{ marginBottom: 12 }}>
          O assistente funciona <b>sem modelo nenhum</b>: o encaminhamento por padrões cobre as funções do catálogo e é
          o que corre na demonstração. Ligar um modelo local acrescenta tolerância a frases fora do padrão — e nada
          mais: ele escolhe a função e preenche os campos, tudo o resto é calculado pela aplicação e revalidado antes de
          executar. Nenhum dado sai da máquina.
        </div>
        <label className="check" style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
          <input type="checkbox" checked={cfg.ativo} onChange={(e) => guardar({ ...cfg, ativo: e.target.checked })} />
          Usar modelo local quando os padrões não chegarem
        </label>
        <div className="g2">
          <div className="campo"><label>Endereço do runtime</label>
            <input value={cfg.url} onChange={(e) => guardar({ ...cfg, url: e.target.value })} placeholder="http://localhost:11434" />
          </div>
          <div className="campo"><label>Modelo</label>
            <input value={cfg.modelo} onChange={(e) => guardar({ ...cfg, modelo: e.target.value })} placeholder="gemma3:4b" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn sm" onClick={() => void testar()}>Testar ligação</button>
          {estado !== undefined && <span className="sec" style={{ fontSize: 12.5 }}>{estado}</span>}
        </div>
        <div className="sec" style={{ marginTop: 10, fontSize: 12 }}>
          Compatível com a API do Ollama. Para o browser poder falar com o runtime local, este tem de aceitar a origem
          da aplicação (no Ollama, a variável <code>OLLAMA_ORIGINS</code>).
        </div>
      </div>
    </div>
  );
}
