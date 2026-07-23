import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './estilo.css';
import { app } from './porta/aplicacao-local.js';
import { Shell } from './app/Shell.js';
import { Painel } from './telas/Painel.js';
import { Contratos } from './telas/Contratos.js';
import { ContratoDetalhe } from './telas/ContratoDetalhe.js';
import { NovoContrato } from './telas/NovoContrato.js';
import { Recursos } from './telas/Recursos.js';
import { Registos } from './telas/Registos.js';
import { Aprovacoes } from './telas/Aprovacoes.js';
import { Faturacao } from './telas/Faturacao.js';
import { Relatorios } from './telas/Relatorios.js';
import { Alertas } from './telas/Alertas.js';
import { Auditoria } from './telas/Auditoria.js';
import { Acessos } from './telas/Acessos.js';

const rotas = [
  { path: '/', element: <Painel /> },
  { path: '/contratos', element: <Contratos /> },
  { path: '/contratos/novo', element: <NovoContrato /> },
  { path: '/contratos/:id', element: <ContratoDetalhe /> },
  { path: '/recursos', element: <Recursos /> },
  { path: '/registos', element: <Registos /> },
  { path: '/aprovacoes', element: <Aprovacoes /> },
  { path: '/faturacao', element: <Faturacao /> },
  { path: '/faturacao/:id', element: <Faturacao /> },
  { path: '/relatorios', element: <Relatorios /> },
  { path: '/alertas', element: <Alertas /> },
  { path: '/auditoria', element: <Auditoria /> },
  { path: '/acessos', element: <Acessos /> },
];

const router = createHashRouter(rotas.map((r) => ({ ...r, element: <Shell>{r.element}</Shell> })));

async function arrancar(): Promise<void> {
  await app.inicializar();
  const el = document.getElementById('raiz');
  if (el !== null) createRoot(el).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
}
void arrancar();
