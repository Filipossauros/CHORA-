import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import './estilo.css';
import { app } from './porta/aplicacao-local.js';
import { Shell } from './app/Shell.js';
import { Hoje } from './telas/Hoje.js';
import { Contratos } from './telas/Contratos.js';
import { ContratoDetalhe } from './telas/ContratoDetalhe.js';
import { NovoContrato } from './telas/NovoContrato.js';
import { Recursos } from './telas/Recursos.js';
import { Operacao } from './telas/Operacao.js';
import { Faturacao } from './telas/Faturacao.js';
import { Relatorios } from './telas/Relatorios.js';
import { Orcamentacao } from './telas/Orcamentacao.js';
import { Regras } from './telas/Regras.js';
import { Auditoria } from './telas/Auditoria.js';
import { Acessos } from './telas/Acessos.js';
import { DadosDemonstracao } from './telas/DadosDemonstracao.js';

const rotas = [
  // "Hoje" é a entrada: a fila única de decisões.
  { path: '/', element: <Hoje /> },
  { path: '/contratos', element: <Contratos /> },
  { path: '/contratos/novo', element: <NovoContrato /> },
  { path: '/contratos/:id', element: <ContratoDetalhe /> },
  { path: '/recursos', element: <Recursos /> },
  { path: '/registos', element: <Operacao /> },
  { path: '/aprovacoes', element: <Operacao /> },
  { path: '/faturacao', element: <Faturacao /> },
  { path: '/faturacao/:id', element: <Faturacao /> },
  { path: '/relatorios', element: <Relatorios /> },
  { path: '/orcamentacao', element: <Orcamentacao /> },
  { path: '/regras', element: <Regras /> },
  { path: '/auditoria', element: <Auditoria /> },
  { path: '/acessos', element: <Acessos /> },
  { path: '/dados', element: <DadosDemonstracao /> },
];

const router = createHashRouter(rotas.map((r) => ({ ...r, element: <Shell>{r.element}</Shell> })));

async function arrancar(): Promise<void> {
  await app.inicializar();
  const el = document.getElementById('raiz');
  if (el !== null) createRoot(el).render(<StrictMode><RouterProvider router={router} /></StrictMode>);
}
void arrancar();
