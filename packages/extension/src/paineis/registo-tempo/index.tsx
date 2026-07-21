import { createRoot } from 'react-dom/client';
import { inicializar } from '../../sdk.js';
import { RegistoTempoPage } from './RegistoTempoPage.js';

async function arrancar(): Promise<void> {
  const { cliente, utilizadorId, projetoId } = await inicializar();
  const workItemId = Number(new URLSearchParams(location.search).get('workItemId') ?? '0');
  const raiz = document.getElementById('raiz');
  if (raiz !== null) {
    createRoot(raiz).render(
      <RegistoTempoPage cliente={cliente} utilizadorId={utilizadorId} workItemId={workItemId} {...(projetoId !== undefined ? { projetoId } : {})} />,
    );
  }
}
void arrancar();
