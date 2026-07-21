import { createRoot } from 'react-dom/client';
import { inicializar } from '../../sdk.js';
import { AreaGestor } from './AreaGestor.js';

async function arrancar(): Promise<void> {
  const { cliente } = await inicializar();
  const raiz = document.getElementById('raiz');
  if (raiz !== null) createRoot(raiz).render(<AreaGestor cliente={cliente} />);
}
void arrancar();
