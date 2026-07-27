import { Fragment, useState, type ReactNode } from 'react';
import type { Contrato, Fatura, TipoFaturacao } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { Cabecalho } from '../app/Shell.js';
import { Barra, formatarDuracao, formatarMoeda, hoje, useAsync } from '../comum.js';

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

export function Relatorios(): ReactNode {
  const [contratoId, setContratoId] = useState('');
  const [ano, setAno] = useState(hoje().slice(0, 4));

  const base = useAsync(async () => {
    const contratos = await app.ctx.repos.contratos.todos();
    const cid = contratoId || contratos[0]?.id || '';
    const resumo = await app.contratos.resumoExecucao(cid) as { saldosPerfis: Array<{ perfilId: string; nome: string; minutosPrevistos: number; minutosConsumidos: number; valorConsumido: number; valorPrevisto: number }> };
    const faturas = await app.ctx.repos.faturas.todos((f) => f.estado === 'VALIDADA');
    return { contratos, cid, resumo, faturas };
  }, [contratoId]);

  if (base.dados === undefined) return <p className="vazio">A carregar…</p>;
  const { contratos, cid, resumo, faturas } = base.dados;
  const anos = [...new Set(faturas.map((f) => (f.dataAprovacao ?? f.dataRececao).slice(0, 4)))].sort().reverse();

  return (
    <>
      <Cabecalho titulo="Relatórios" sub="Horas por perfil · faturação aprovada" acoes={
        <select value={cid} onChange={(e) => setContratoId(e.target.value)}>{contratos.map((c) => <option key={c.id} value={c.id}>{c.numero}</option>)}</select>
      } />

      <div className="cartao" style={{ marginBottom: 16 }}><h3>Horas consumidas por perfil<span className="sec" style={{ marginLeft: 8, fontWeight: 400 }}>{contratos.find((c) => c.id === cid)?.numero}</span></h3><table>
        <thead><tr><th>Perfil</th><th className="num">Consumidas / previstas</th><th style={{ width: 160 }}>Consumo</th><th className="num">Valor consumido</th></tr></thead>
        <tbody>{resumo.saldosPerfis.map((s) => { const frac = s.minutosPrevistos > 0 ? s.minutosConsumidos / s.minutosPrevistos : 0; return (
          <tr key={s.perfilId}><td className="prim">{s.nome}</td><td className="num">{formatarDuracao(s.minutosConsumidos)} / {formatarDuracao(s.minutosPrevistos)}</td><td><Barra fracao={frac} /></td><td className="num">{formatarMoeda(s.valorConsumido)}</td></tr>
        ); })}{resumo.saldosPerfis.length === 0 && <tr><td colSpan={4} className="vazio">Sem perfis neste contrato.</td></tr>}</tbody>
      </table></div>

      <FaturacaoAprovada contratos={contratos} faturas={faturas} ano={ano} anos={anos} onAno={setAno} />
      <FaturasValidadas contratos={contratos} faturas={faturas} ano={ano} />
    </>
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
  const doAno = faturas
    .filter((f) => (f.dataAprovacao ?? f.dataRececao).startsWith(ano))
    .sort((a, b) => ((a.dataAprovacao ?? a.dataRececao) < (b.dataAprovacao ?? b.dataRececao) ? 1 : -1));
  const total = doAno.reduce((s, f) => s + (f.montanteAprovado ?? f.montanteSemIva), 0);

  return (
    <div className="cartao" style={{ marginTop: 16 }}>
      <h3>
        Faturas validadas no projeto
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
 * FATURAÇÃO APROVADA por contrato e por mês.
 *
 * O «disponível» é corrido pela ordem das decisões: mostra quanto do contrato
 * sobrava DEPOIS de cada fatura, que é a leitura de quem acompanha o
 * esgotamento do valor. Conta-se o aprovado — o pagamento acontece no sistema
 * financeiro da empresa e a aplicação não tem visibilidade sobre ele.
 */
function FaturacaoAprovada({ contratos, faturas, ano, anos, onAno }: {
  contratos: Contrato[]; faturas: Fatura[]; ano: string; anos: string[]; onAno: (a: string) => void;
}): ReactNode {
  const doAno = faturas.filter((f) => (f.dataAprovacao ?? f.dataRececao).startsWith(ano));

  const porContrato = contratos
    .map((contrato) => {
      const suas = doAno
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
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <span className="sec">Total {formatarMoeda(totalGeral)}</span>
          <select value={ano} onChange={(e) => onAno(e.target.value)}>
            {(anos.length > 0 ? anos : [ano]).map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </span>
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
