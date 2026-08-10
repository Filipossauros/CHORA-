import { type ReactNode } from 'react';
import type { PapelAplicacional } from '@chora/domain';
import { app } from '../porta/aplicacao-local.js';
import { temAcesso } from './Shell.js';
import polvoFaturas from '../ativos/polvo-faturas.png';

/**
 * GUARDA DE ROTA — o que esconder um item de menu não faz.
 *
 * Tirar o destino da lateral evita que alguém lá vá por engano. Não evita que
 * alguém lá vá de propósito: basta escrever o endereço, ou mudar o `hash` pela
 * consola. É esta guarda que responde a isso — e responde com uma recusa
 * legível, não com um ecrã em branco nem com dados.
 *
 * Não substitui a verificação nos serviços: cada operação continua a verificar
 * o papel antes de qualquer efeito. Esta guarda é a primeira porta, não a
 * única.
 */
export function Protegida({ acesso, children }: {
  acesso: Parameters<typeof temAcesso>[1];
  children: ReactNode;
}): ReactNode {
  const papeis = app.papeisAtuais();
  if (temAcesso(papeis, acesso)) return <>{children}</>;
  return <SemAcesso papeis={papeis} />;
}

const ROTULO: Record<PapelAplicacional, string> = {
  ADMINISTRADOR: 'administrador',
  GESTOR_CONTRATO: 'gestor de contrato',
  VALIDADOR: 'validador',
  ELEMENTO_EQUIPA_TECNICA: 'elemento da equipa técnica',
};

/**
 * O destino de quem entra sem ter onde ir. O validador e o elemento têm um
 * ecrã cada; qualquer outro endereço traz-lhes esta recusa e o caminho de volta.
 */
export function SemAcesso({ papeis }: { papeis: ReadonlyArray<PapelAplicacional> }): ReactNode {
  const casa = app.podeAprovar() ? '/aprovacoes' : '/registos';
  return (
    <div className="entrada" style={{ background: 'var(--fundo)' }}>
      <div className="cartao-login">
        <div className="fig"><img src={polvoFaturas} alt="" /></div>
        <h1>Este ecrã não é seu</h1>
        <div className="sub">
          Entrou como <b>{papeis.map((p) => ROTULO[p]).join(' e ')}</b>, e este papel
          não abre esta parte da aplicação.
          <br />
          Não é a interface a escondê-lo: os serviços recusam a operação da mesma
          maneira, venha o pedido de onde vier.
        </div>
        <a className="btn pri btn-entrar" href={`#${casa}`}>Voltar ao que lhe compete</a>
      </div>
    </div>
  );
}
