import { Fragment, useState, type ReactNode } from 'react';
import * as XLSX from 'xlsx';
import type { Contrato, Fatura, TipoFaturacao } from '@chora/domain';
import { executarRelatorio, folhasDaTabela, nomeFicheiroTabela, type RelatorioAdHoc, type ResultadoRelatorio } from '@chora/api/nucleo';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, formatarDuracao, formatarMoeda, hoje, mensagemErro, useAsync } from '../comum.js';

const ROT_TIPO: Record<TipoFaturacao, string> = {
  BOLSA_HORAS: 'Bolsa de horas', ENTREGAVEL: 'Entregável', LICENCIAMENTO: 'Licenciamento',
};

/** Linha do relatório de faturação: uma fatura aprovada e o que sobrava depois. */
interface LinhaFaturacao {
  fatura: Fatura;
  mes: string;
  aprovado: number;
  disponivelApos: number;
}

type Seccao = 'faturacao' | 'consumo' | 'guardados';

/**
 * RELATÓRIOS — três leituras, cada uma com o seu âmbito à vista.
 *
 * A confusão anterior não vinha do número de quadros: vinha de os controlos não
 * pertencerem ao que governavam. Havia um seletor de contrato no cabeçalho que
 * só mexia no primeiro quadro e um seletor de ano dentro do segundo, com o
 * terceiro a seguir esse ano sem o dizer. Agora cada secção declara o seu âmbito
 * — um ano, um contrato, ou nenhum — e traz o respetivo controlo ao lado do
 * título.
 *
 * A terceira secção é de outra natureza: são relatórios que a aplicação não sabe
 * produzir e que alguém compôs no assistente, pergunta a pergunta. Ficam aqui
 * porque é aqui que se procuram relatórios, e apagam-se aqui pela mesma razão.
 */
export function Relatorios(): ReactNode {
  const [seccao, setSeccao] = useState<Seccao>('faturacao');
  const [contratoId, setContratoId] = useState('');
  const [ano, setAno] = useState(hoje().slice(0, 4));

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const resumo = await app.contratos.resumoExecucao(cid) as { saldosPerfis: Array<{ perfilId: string; nome: string; minutosPrevistos: number; minutosConsumidos: number; valorConsumido: number; valorPrevisto: number }> };
    const faturas = await app.ctx.repos.faturas.todos((f) => f.estado === 'VALIDADA');
    const guardados = await app.relatoriosAdHoc.listar();
    return { contratos, cid, resumo, faturas, guardados };
  }, [contratoId]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, resumo, faturas, guardados } = base.dados;
  const anos = [...new Set(faturas.map((f) => (f.dataAprovacao ?? f.dataRececao).slice(0, 4)))].sort().reverse();
  const doAno = faturas.filter((f) => (f.dataAprovacao ?? f.dataRececao).startsWith(ano));

  const seletorAno = (
    <select value={ano} onChange={(e) => setAno(e.target.value)} aria-label="Ano">
      {(anos.length > 0 ? anos : [ano]).map((a) => <option key={a} value={a}>{a}</option>)}
    </select>
  );
  const seletorContrato = (
    <select value={cid} onChange={(e) => setContratoId(e.target.value)} aria-label="Contrato">
      {contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}
    </select>
  );

  return (
    <>
      <Cabecalho titulo="Relatórios" sub="Faturação do ano · consumo de um contrato · relatórios compostos no assistente" />

      <div className="abas" style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <button className={`btn sm ${seccao === 'faturacao' ? 'pri' : ''}`} onClick={() => setSeccao('faturacao')}>
          Faturação ({doAno.length})
        </button>
        <button className={`btn sm ${seccao === 'consumo' ? 'pri' : ''}`} onClick={() => setSeccao('consumo')}>
          Consumo por perfil
        </button>
        <button className={`btn sm ${seccao === 'guardados' ? 'pri' : ''}`} onClick={() => setSeccao('guardados')}>
          Guardados ({guardados.length})
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {seccao === 'faturacao' && <><span className="sec">Ano</span>{seletorAno}</>}
          {seccao === 'consumo' && <><span className="sec">Contrato</span>{seletorContrato}</>}
        </span>
      </div>

      {seccao === 'faturacao' && (
        <>
          <FaturasValidadas contratos={contratos} faturas={doAno} ano={ano} />
          <FaturacaoAprovada contratos={contratos} faturas={doAno} ano={ano} />
        </>
      )}

      {seccao === 'consumo' && (
        <ConsumoPorPerfil numero={contratos.find((c) => c.id === cid)?.numero ?? cid} saldos={resumo.saldosPerfis} />
      )}

      {seccao === 'guardados' && <Guardados relatorios={guardados} onMudanca={base.recarregar} />}
    </>
  );
}

/**
 * RELATÓRIOS GUARDADOS — as perguntas compostas no assistente.
 *
 * Guardam a RECEITA, não os dados: executar responde com os números de hoje. É
 * a diferença entre ter arquivado uma lista e ter construído um relatório — o
 * mesmo relatório serve a reunião deste mês e a do mês que vem. O retrato
 * congelado, aquele que tem de continuar a dizer o mesmo daqui a um ano, é o
 * Excel, que leva a data da execução e a receita na segunda folha.
 *
 * A execução repete os passos com as permissões de QUEM ABRE. Um relatório com
 * faturação não mostra faturação a quem não a pode consultar — garantia que um
 * retrato guardado não conseguiria dar, porque os dados já lá estariam escritos.
 */
function Guardados({ relatorios, onMudanca }: { relatorios: RelatorioAdHoc[]; onMudanca: () => void }): ReactNode {
  const [resultados, setResultados] = useState<Record<string, ResultadoRelatorio | undefined>>({});
  const [aCorrer, setACorrer] = useState<string | undefined>(undefined);
  const [erro, setErro] = useState<string | undefined>(undefined);

  async function executar(r: RelatorioAdHoc): Promise<void> {
    setACorrer(r.id); setErro(undefined);
    try {
      const resultado = await executarRelatorio(app.ctx, r, app.utilizador());
      setResultados((x) => ({ ...x, [r.id]: resultado }));
      // A execução ficou registada na definição: relê-la é o que faz aparecer
      // «última execução», que é o sinal de quando estes números foram vistos.
      onMudanca();
    } catch (e) { setErro(mensagemErro(e)); } finally { setACorrer(undefined); }
  }

  async function alternarPeriodo(r: RelatorioAdHoc): Promise<void> {
    try {
      await app.relatoriosAdHoc.definirPeriodoRelativo(r.id, !r.periodoRelativo, app.utilizador());
      setResultados((x) => ({ ...x, [r.id]: undefined }));
      onMudanca();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  async function apagar(r: RelatorioAdHoc): Promise<void> {
    if (!confirm(`Apagar «${r.titulo}»? Desaparece a definição; nenhum dado de contratos é afetado.`)) return;
    try {
      await app.relatoriosAdHoc.remover(r.id, app.utilizador());
      onMudanca();
    } catch (e) { setErro(mensagemErro(e)); }
  }

  if (relatorios.length === 0) {
    return (
      <div className="cartao"><div className="corpo">
        <p className="vazio" style={{ margin: 0 }}>Ainda não há relatórios guardados.</p>
        <div className="aviso" style={{ marginTop: 12 }}>
          Estes relatórios nascem no <b>«Perguntar»</b> do ecrã Hoje: faça uma pergunta que devolva uma lista
          (por exemplo, <i>que contratos comportam um perfil a 40 euros por hora?</i>), acrescente-lhe colunas
          (<i>acrescenta os consumos atuais</i>), filtre-a ou ordene-a, e depois diga
          <i> guarda esta lista nos relatórios</i>. Fica aqui a pergunta — não a resposta —, pronta a repetir.
        </div>
      </div></div>
    );
  }

  return (
    <>
      {erro !== undefined && <div className="erro-cx" style={{ marginBottom: 12 }}>⚠ {erro}</div>}
      {relatorios.map((r) => {
        const res = resultados[r.id];
        return (
          <div className="cartao" key={r.id} style={{ marginBottom: 12 }}>
            <h3>
              {r.titulo}
              <span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>
                {r.passos.length} passo(s) · criado {r.criadoEm.slice(0, 10)}
                {r.ultimaExecucao !== undefined && ` · última execução ${r.ultimaExecucao.em.slice(0, 10)} (${r.ultimaExecucao.linhas} linhas)`}
              </span>
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button className="btn sm pri" disabled={aCorrer === r.id} onClick={() => void executar(r)}>
                  {aCorrer === r.id ? 'A correr…' : res !== undefined ? '↻ Executar' : '▸ Executar'}
                </button>
                {res?.tabela !== undefined && (
                  <button className="btn sm" onClick={() => exportarAdHoc(r, res)}>⬇ Excel</button>
                )}
                <button className="btn sm" onClick={() => void apagar(r)}>Apagar</button>
              </span>
            </h3>

            <div className="corpo" style={{ paddingTop: 0 }}>
              <div className="sec" style={{ fontSize: 12.5 }}>
                {r.passos.map((p) => `«${p.frase}»`).join(' → ')}
              </div>
              {temPeriodo(r) && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
                  <span className={`pill ${r.periodoRelativo ? 'p-azul' : 'p-ard'}`}>
                    {r.periodoRelativo ? 'Período relativo' : 'Período fixo'}
                  </span>
                  <span className="sec">
                    {r.periodoRelativo
                      ? 'reinterpretado na data da execução — o relatório acompanha o calendário'
                      : 'congelado nas datas do dia em que foi guardado'}
                  </span>
                  <button className="ligacao" onClick={() => void alternarPeriodo(r)}>
                    passar a {r.periodoRelativo ? 'fixo' : 'relativo'}
                  </button>
                </div>
              )}
            </div>

            {res?.problema !== undefined && (
              <div className="erro-cx" style={{ margin: 12 }}>
                <b>Passo {res.problema.passo} ({res.problema.capacidade})</b> — {res.problema.motivo}
              </div>
            )}

            {res?.tabela !== undefined && (
              <>
                <div style={{ overflowX: 'auto' }}>
                  <table>
                    <thead><tr>{res.tabela.colunas.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                    <tbody>
                      {res.tabela.linhas.map((linha, i) => (
                        <tr key={i}>{linha.map((v, j) => <td key={j} className={typeof v === 'number' ? 'num tabnum' : undefined}>{v}</td>)}</tr>
                      ))}
                      {res.tabela.linhas.length === 0 && <tr><td colSpan={res.tabela.colunas.length} className="vazio">Sem linhas.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div className="sec" style={{ margin: 12, fontSize: 12.5 }}>
                  Executado em {res.executadoEm.slice(0, 16).replace('T', ' ')}
                  {res.periodo !== undefined && ` · período ${res.periodo.rotulo}`}
                  {' '}— estes são os números de agora.
                </div>
              </>
            )}
          </div>
        );
      })}
      <div className="aviso">
        Cada relatório é uma pergunta guardada, não uma folha arquivada: executar responde com os dados de hoje, e os
        passos voltam a passar pelas permissões de quem está a executar. Para congelar um retrato — o que se leva a uma
        reunião e tem de continuar a dizer o mesmo —, descarregue o Excel.
      </div>
    </>
  );
}

/** Só faz sentido oferecer o interruptor a quem tem recorte temporal. */
function temPeriodo(r: RelatorioAdHoc): boolean {
  const p = r.passos[0]?.parametros ?? {};
  return r.periodoRelativo || (typeof p['periodoDe'] === 'string' && typeof p['periodoAte'] === 'string');
}

/** Duas folhas: os dados e a receita. Sem a segunda, ninguém sabe o que lê. */
function exportarAdHoc(r: RelatorioAdHoc, res: ResultadoRelatorio): void {
  if (res.tabela === undefined) return;
  const wb = XLSX.utils.book_new();
  for (const folha of folhasDaTabela(res.tabela, {
    executadoEm: res.executadoEm,
    executadoPor: app.utilizador().utilizadorId,
    ...(res.periodo !== undefined ? { periodo: res.periodo.rotulo } : {}),
  })) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(folha.linhas), folha.nome.slice(0, 31));
  }
  XLSX.writeFile(wb, `${nomeFicheiroTabela(r.titulo)}-${res.executadoEm.slice(0, 10)}.xlsx`);
}

/** Consumo por perfil de um contrato — a leitura de quem gere a bolsa de horas. */
function ConsumoPorPerfil({ numero, saldos }: {
  numero: string;
  saldos: Array<{ perfilId: string; nome: string; minutosPrevistos: number; minutosConsumidos: number; valorConsumido: number; valorPrevisto: number }>;
}): ReactNode {
  return (
    <div className="cartao">
      <h3>
        Horas consumidas por perfil
        <span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>{numero}</span>
        <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => exportarPerfis(numero, saldos)}>⬇ Excel</button>
      </h3>
      <table>
        <thead><tr><th>Perfil</th><th className="num">Consumidas / previstas</th><th style={{ width: 160 }}>Consumo</th><th className="num">Valor consumido</th></tr></thead>
        <tbody>
          {saldos.map((s) => {
            const frac = s.minutosPrevistos > 0 ? s.minutosConsumidos / s.minutosPrevistos : 0;
            return (
              <tr key={s.perfilId}>
                <td className="prim">{s.nome}</td>
                <td className="num">{formatarDuracao(s.minutosConsumidos)} / {formatarDuracao(s.minutosPrevistos)}</td>
                <td><Barra fracao={frac} /></td>
                <td className="num">{formatarMoeda(s.valorConsumido)}</td>
              </tr>
            );
          })}
          {saldos.length === 0 && <tr><td colSpan={4} className="vazio">Sem perfis neste contrato.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

/**
 * LISTAGEM DE FATURAS VALIDADAS, uma por linha.
 *
 * O quadro por contrato e mês serve para acompanhar o esgotamento do valor; esta
 * listagem serve para responder pela decisão — quem pergunte «esta fatura foi
 * validada quando, por que valor e com que evidência?» encontra a resposta numa
 * linha, sem ter de abrir o contrato. Inclui a nota de crédito quando existe:
 * sem ela, o aprovado parece não bater certo com o faturado.
 */
function FaturasValidadas({ contratos, faturas, ano }: {
  contratos: Contrato[]; faturas: Fatura[]; ano: string;
}): ReactNode {
  const numeroContrato = (id: string): string => contratos.find((c) => c.id === id)?.numero ?? id;
  const doAno = [...faturas].sort((a, b) => ((a.dataAprovacao ?? a.dataRececao) < (b.dataAprovacao ?? b.dataRececao) ? 1 : -1));
  const total = doAno.reduce((s, f) => s + (f.montanteAprovado ?? f.montanteSemIva), 0);

  return (
    <div className="cartao" style={{ marginBottom: 16 }}>
      <h3>
        Faturas validadas
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="sec">{doAno.length} fatura(s) · {formatarMoeda(total)} em {ano}</span>
        </span>
      </h3>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead><tr>
            <th>Data de aprovação</th><th>Fatura</th><th>Contrato</th><th>Tipo</th><th>Período</th>
            <th className="num">Faturado</th><th className="num">Nota de crédito</th><th className="num">Aprovado</th><th>Evidência</th>
          </tr></thead>
          <tbody>
            {doAno.map((f) => (
              <tr key={f.id}>
                <td className="tabnum prim">{f.dataAprovacao ?? '—'}</td>
                <td>{f.numero}<div className="sec">emitida {f.dataEmissao} · recebida {f.dataRececao}</div></td>
                <td>{numeroContrato(f.contratoId)}</td>
                <td className="sec">{ROT_TIPO[f.tipo]}</td>
                <td className="tabnum sec">{f.periodoDe} a {f.periodoAte}</td>
                <td className="num tabnum">{formatarMoeda(f.montanteSemIva)}</td>
                <td className="num tabnum">{f.notaCredito !== undefined ? <>−{formatarMoeda(f.notaCredito.montante)}<div className="sec">{f.notaCredito.numero}</div></> : <span className="sec">—</span>}</td>
                <td className="num tabnum prim">{formatarMoeda(f.montanteAprovado ?? f.montanteSemIva)}</td>
                <td className="sec">{f.relatorioEvidenciaId !== undefined ? 'arquivada' : '—'}</td>
              </tr>
            ))}
            {doAno.length === 0 && <tr><td colSpan={9} className="vazio">Sem faturas validadas em {ano}.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="aviso" style={{ margin: 12 }}>
        Cada linha é uma decisão de validação, com a data em que foi tomada e o relatório de evidência que a suporta.
        O aprovado é o líquido: nas faturas corrigidas por nota de crédito, é o faturado menos a nota <code>RN-612</code>.
      </div>
    </div>
  );
}

/**
 * Exportação do consumo por perfil. Veio do menu «Previsões», que desapareceu:
 * projetar ritmos por contrato já se lê nas decisões do «Hoje», mas levar os
 * números para uma folha de cálculo continua a ser preciso — é o formato em que
 * se discutem com quem não abre a aplicação.
 */
function exportarPerfis(numero: string, saldos: Array<{ nome: string; minutosPrevistos: number; minutosConsumidos: number; valorConsumido: number; valorPrevisto: number }>): void {
  const ws = XLSX.utils.json_to_sheet(saldos.map((s) => ({
    'Perfil': s.nome,
    'Horas consumidas': +(s.minutosConsumidos / 60).toFixed(1),
    'Horas previstas': +(s.minutosPrevistos / 60).toFixed(1),
    'Horas restantes': +(Math.max(0, s.minutosPrevistos - s.minutosConsumidos) / 60).toFixed(1),
    'Consumo (%)': s.minutosPrevistos > 0 ? Math.round((s.minutosConsumidos / s.minutosPrevistos) * 100) : 0,
    'Valor consumido': s.valorConsumido / 100,
    'Valor previsto': s.valorPrevisto / 100,
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Consumo por perfil');
  XLSX.writeFile(wb, `consumo-perfis-${numero}.xlsx`);
}

/**
 * FATURAÇÃO APROVADA por contrato e por mês.
 *
 * O «disponível» é corrido pela ordem das decisões: mostra quanto do contrato
 * sobrava DEPOIS de cada fatura, que é a leitura de quem acompanha o
 * esgotamento do valor. Conta-se o aprovado — o pagamento acontece no sistema
 * financeiro da empresa e a aplicação não tem visibilidade sobre ele.
 */
function FaturacaoAprovada({ contratos, faturas, ano }: {
  contratos: Contrato[]; faturas: Fatura[]; ano: string;
}): ReactNode {
  const porContrato = contratos
    .map((contrato) => {
      const suas = faturas
        .filter((f) => f.contratoId === contrato.id)
        .sort((a, b) => ((a.dataAprovacao ?? a.dataRececao) < (b.dataAprovacao ?? b.dataRececao) ? -1 : 1));
      let acumulado = 0;
      const linhas: LinhaFaturacao[] = suas.map((f) => {
        const aprovado = f.montanteAprovado ?? f.montanteSemIva;
        acumulado += aprovado;
        return { fatura: f, mes: (f.dataAprovacao ?? f.dataRececao).slice(0, 7), aprovado, disponivelApos: Math.max(0, contrato.precoContratualAtual - acumulado) };
      });
      return { contrato, linhas, total: acumulado };
    })
    .filter((c) => c.linhas.length > 0);

  const totalGeral = porContrato.reduce((s, c) => s + c.total, 0);

  return (
    <div className="cartao">
      <h3>
        Faturação aprovada por contrato e mês
        <span style={{ marginLeft: 'auto' }} className="sec">Total {formatarMoeda(totalGeral)} em {ano}</span>
      </h3>
      <table>
        <thead><tr><th>Mês</th><th>Fatura</th><th>Tipo</th><th className="num">Montante aprovado</th><th className="num">Disponível no contrato</th></tr></thead>
        <tbody>
          {porContrato.map(({ contrato, linhas, total }) => (
            <Fragment key={contrato.id}>
              <tr>
                <td colSpan={3} className="prim">{contrato.numero}<div className="sec">{contrato.objeto}</div></td>
                <td className="num sec">contratado {formatarMoeda(contrato.precoContratualAtual)}</td>
                <td className="num sec">{linhas.length} fatura(s)</td>
              </tr>
              {linhas.map((l) => (
                <tr key={l.fatura.id}>
                  <td className="tabnum" style={{ paddingLeft: 22 }}>{l.mes}</td>
                  <td>{l.fatura.numero}</td>
                  <td className="sec">{ROT_TIPO[l.fatura.tipo]}</td>
                  <td className="num tabnum">{formatarMoeda(l.aprovado)}</td>
                  <td className="num tabnum">{formatarMoeda(l.disponivelApos)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3} className="sec" style={{ paddingLeft: 22 }}>subtotal {contrato.numero}</td>
                <td className="num prim">{formatarMoeda(total)}</td>
                <td className="num prim">{formatarMoeda(Math.max(0, contrato.precoContratualAtual - total))}</td>
              </tr>
            </Fragment>
          ))}
          {porContrato.length === 0 && <tr><td colSpan={5} className="vazio">Sem faturação aprovada em {ano}.</td></tr>}
        </tbody>
      </table>
      <div className="aviso" style={{ margin: 12 }}>
        Conta o montante <b>aprovado</b> na conferência. O pagamento é do sistema financeiro da empresa e não é acompanhado
        aqui. O disponível é corrido pela ordem das decisões: é quanto sobrava do contrato depois de cada fatura.
      </div>
    </div>
  );
}
