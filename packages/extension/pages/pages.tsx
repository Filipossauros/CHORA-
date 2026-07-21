import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Contexto } from '@chora/api/nucleo';
import { RegistoTempoPage } from '../src/paineis/registo-tempo/RegistoTempoPage.js';
import { Aprovacoes } from '../src/hubs/aprovacoes/Aprovacoes.js';
import { AreaGestor } from '../src/hubs/area-gestor/AreaGestor.js';
import { ClienteMemoria, obterContexto } from './cliente-memoria.js';

/**
 * Demonstração estática do CHORA+ para GitHub Pages. Corre o domínio, os
 * serviços e o seed inteiramente no browser — sem servidor e sem rede. As
 * regras de negócio e a autorização por papel são as reais.
 */

const UTILIZADORES = [
  { id: 'oid-gestor-contrato', rotulo: 'Gestor de Contrato' },
  { id: 'oid-gestor-tecnico', rotulo: 'Gestor Técnico' },
  { id: 'oid-recurso-01', rotulo: 'Elemento — recurso 01' },
  { id: 'oid-recurso-02', rotulo: 'Elemento — recurso 02' },
];

const VISTAS = ['V1 · Registo de tempo', 'V2 · Aprovações', 'V3 · Área do Gestor'] as const;
type Vista = (typeof VISTAS)[number];

function App() {
  const [ctx, setCtx] = useState<Contexto | undefined>(undefined);
  const [utilizadorId, setUtilizadorId] = useState(UTILIZADORES[0]!.id);
  const [vista, setVista] = useState<Vista>('V2 · Aprovações');
  const [workItemId, setWorkItemId] = useState(1001);

  useEffect(() => { void obterContexto().then(setCtx); }, []);

  const cliente = useMemo(
    () => (ctx === undefined ? undefined : new ClienteMemoria(ctx, utilizadorId)),
    [ctx, utilizadorId],
  );

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif' }}>
      <header style={{ background: '#0b3b6f', color: '#fff', padding: '10px 16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>CHORA+ · demonstração</strong>
        <label>Utilizador{' '}
          <select value={utilizadorId} onChange={(e) => setUtilizadorId(e.target.value)}>
            {UTILIZADORES.map((u) => <option key={u.id} value={u.id}>{u.rotulo}</option>)}
          </select>
        </label>
        <label>Vista{' '}
          <select value={vista} onChange={(e) => setVista(e.target.value as Vista)}>
            {VISTAS.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </label>
        {vista === 'V1 · Registo de tempo' && (
          <label>Work item{' '}
            <input type="number" value={workItemId} onChange={(e) => setWorkItemId(Number(e.target.value))} style={{ width: 80 }} />
          </label>
        )}
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.85 }}>em memória · sem servidor</span>
      </header>

      <main style={{ padding: 4 }}>
        {cliente === undefined ? (
          <p style={{ padding: 16 }}>A preparar dados de demonstração…</p>
        ) : (
          <div key={utilizadorId}>
            {vista === 'V1 · Registo de tempo' && (
              <RegistoTempoPage cliente={cliente} utilizadorId={utilizadorId} projetoId="proj-P1" workItemId={workItemId} />
            )}
            {vista === 'V2 · Aprovações' && <Aprovacoes cliente={cliente} />}
            {vista === 'V3 · Área do Gestor' && <AreaGestor cliente={cliente} />}
          </div>
        )}
      </main>

      <footer style={{ padding: '8px 16px', fontSize: 12, color: '#555', borderTop: '1px solid #ddd' }}>
        Protótipo CHORA+ — as regras RN-xxx e a autorização por papel correm no browser. Recarregar a página repõe os dados de seed.
      </footer>
    </div>
  );
}

const raiz = document.getElementById('raiz');
if (raiz !== null) createRoot(raiz).render(<App />);
