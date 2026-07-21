import { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ClienteApi } from '../src/comum/cliente-api.js';
import { RegistoTempoPage } from '../src/paineis/registo-tempo/RegistoTempoPage.js';
import { Aprovacoes } from '../src/hubs/aprovacoes/Aprovacoes.js';
import { AreaGestor } from '../src/hubs/area-gestor/AreaGestor.js';

/**
 * Harness de PRÉ-VISUALIZAÇÃO local (não faz parte da extensão distribuída).
 * Substitui o SDK do Azure DevOps por um stub: o token é o próprio X-Dev-User,
 * aceite pelo FakeTokenValidator da API. Permite abrir as três vistas num
 * browser normal, contra a API local (porta 7071) com dados de seed.
 */

const BASE_API = (globalThis as { CHORA_API_BASE?: string }).CHORA_API_BASE ?? 'http://localhost:7071';

const UTILIZADORES = [
  { id: 'oid-gestor-contrato', rotulo: 'Gestor de Contrato' },
  { id: 'oid-gestor-tecnico', rotulo: 'Gestor Técnico' },
  { id: 'oid-recurso-01', rotulo: 'Elemento — recurso 01' },
  { id: 'oid-recurso-02', rotulo: 'Elemento — recurso 02' },
];

const VISTAS = ['V1 · Registo de tempo', 'V2 · Aprovações', 'V3 · Área do Gestor'] as const;
type Vista = (typeof VISTAS)[number];

function App() {
  const [utilizadorId, setUtilizadorId] = useState(UTILIZADORES[0]!.id);
  const [vista, setVista] = useState<Vista>('V2 · Aprovações');
  const [workItemId, setWorkItemId] = useState(1001);

  // Um cliente novo por utilizador: o token (Bearer) é o X-Dev-User.
  const cliente = useMemo(
    () => new ClienteApi({ baseUrl: BASE_API, obterToken: async () => utilizadorId, projetoId: 'proj-P1' }),
    [utilizadorId],
  );

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif' }}>
      <header style={{ background: '#0b3b6f', color: '#fff', padding: '10px 16px', display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <strong style={{ fontSize: 18 }}>CHORA+ · pré-visualização local</strong>
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
        <span style={{ marginLeft: 'auto', fontSize: 12, opacity: 0.8 }}>API: {BASE_API}</span>
      </header>

      <main style={{ padding: 4 }}>
        {vista === 'V1 · Registo de tempo' && (
          <RegistoTempoPage cliente={cliente} utilizadorId={utilizadorId} projetoId="proj-P1" workItemId={workItemId} />
        )}
        {vista === 'V2 · Aprovações' && <Aprovacoes cliente={cliente} />}
        {vista === 'V3 · Área do Gestor' && <AreaGestor cliente={cliente} />}
      </main>
    </div>
  );
}

const raiz = document.getElementById('raiz');
if (raiz !== null) createRoot(raiz).render(<App />);
