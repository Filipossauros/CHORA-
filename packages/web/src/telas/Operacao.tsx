import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { app } from '../porta/aplicacao-local.js';
import { Registos } from './Registos.js';
import { Aprovacoes } from './Aprovacoes.js';

const ABAS = ['Registos de tempo', 'Aprovações'] as const;
type Aba = (typeof ABAS)[number];

/**
 * Registos e aprovações num só destino: são dois passos do mesmo fluxo
 * operacional e não justificavam dois menus.
 *
 * Quem só tem um dos dois passos não vê separadores nenhuns. Um separador
 * sozinho é uma escolha entre uma coisa — pior do que não haver escolha, porque
 * sugere que existe outra.
 */
export function Operacao({ so }: { so?: Aba }): ReactNode {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('aba');
  const disponiveis = ABAS.filter((a) => (a === 'Aprovações' ? app.podeAprovar() : true));
  const inicial: Aba = so ?? ((ABAS as readonly string[]).includes(pedida ?? '') ? (pedida as Aba) : disponiveis[0]!);
  const [aba, setAba] = useState<Aba>(inicial);
  const fixa = so !== undefined || disponiveis.length < 2;

  function mudar(a: Aba): void {
    setAba(a);
    setParams(a === 'Registos de tempo' ? {} : { aba: a }, { replace: true });
  }

  const mostrada = fixa ? inicial : aba;
  return (
    <>
      {!fixa && (
        <div className="seps">
          {disponiveis.map((a) => (
            <button key={a} className={`sep${aba === a ? ' ativo' : ''}`} onClick={() => mudar(a)}>{a}</button>
          ))}
        </div>
      )}
      {mostrada === 'Registos de tempo' ? <Registos /> : <Aprovacoes />}
    </>
  );
}
