import { useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Registos } from './Registos.js';
import { Aprovacoes } from './Aprovacoes.js';

const ABAS = ['Registos de tempo', 'Aprovações'] as const;
type Aba = (typeof ABAS)[number];

/**
 * Registos e aprovações num só destino: são dois passos do mesmo fluxo
 * operacional e não justificavam dois menus.
 */
export function Operacao(): ReactNode {
  const [params, setParams] = useSearchParams();
  const pedida = params.get('aba');
  const [aba, setAba] = useState<Aba>((ABAS as readonly string[]).includes(pedida ?? '') ? (pedida as Aba) : 'Registos de tempo');

  function mudar(a: Aba): void {
    setAba(a);
    setParams(a === 'Registos de tempo' ? {} : { aba: a }, { replace: true });
  }

  return (
    <>
      <div className="seps">
        {ABAS.map((a) => (
          <button key={a} className={`sep${aba === a ? ' ativo' : ''}`} onClick={() => mudar(a)}>{a}</button>
        ))}
      </div>
      {aba === 'Registos de tempo' ? <Registos /> : <Aprovacoes />}
    </>
  );
}
