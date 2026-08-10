import { StrictMode, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
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
import { Login } from './telas/Login.js';
import { Protegida } from './app/Protegida.js';

/**
 * A raiz não é o mesmo ecrã para toda a gente. Para quem gere é a fila de
 * decisões; para quem só valida ou só regista, a fila não existe — e mandá-los
 * para uma recusa logo à entrada seria mau acolhimento. Vão direitos ao seu.
 */
function Inicio(): ReactNode {
  if (app.podeGerir()) return <Hoje />;
  return <Navigate to={app.podeAprovar() ? '/aprovacoes' : '/registos'} replace />;
}

/*
 * Cada rota declara quem lá entra. Esconder o item do menu evita o engano;
 * a guarda evita a insistência — escrever o endereço, ou mudar o `hash` pela
 * consola, dá a recusa e não os dados.
 */
const rotas = [
  { path: '/', element: <Inicio /> },
  { path: '/contratos', element: <Protegida acesso="gestao"><Contratos /></Protegida> },
  { path: '/contratos/novo', element: <Protegida acesso="gestao"><NovoContrato /></Protegida> },
  { path: '/contratos/:id', element: <Protegida acesso="gestao"><ContratoDetalhe /></Protegida> },
  { path: '/recursos', element: <Protegida acesso="gestao"><Recursos /></Protegida> },
  { path: '/registos', element: <Protegida acesso="registo"><Operacao /></Protegida> },
  { path: '/aprovacoes', element: <Protegida acesso="aprovacao"><Operacao so="Aprovações" /></Protegida> },
  { path: '/faturacao', element: <Protegida acesso="gestao"><Faturacao /></Protegida> },
  { path: '/faturacao/:id', element: <Protegida acesso="gestao"><Faturacao /></Protegida> },
  { path: '/relatorios', element: <Protegida acesso="gestao"><Relatorios /></Protegida> },
  { path: '/orcamentacao', element: <Protegida acesso="gestao"><Orcamentacao /></Protegida> },
  { path: '/regras', element: <Protegida acesso="gestao"><Regras /></Protegida> },
  { path: '/auditoria', element: <Protegida acesso="gestao"><Auditoria /></Protegida> },
  { path: '/acessos', element: <Protegida acesso="admin"><Acessos /></Protegida> },
  { path: '/dados', element: <Protegida acesso="gestao"><DadosDemonstracao /></Protegida> },
  // Endereço inexistente: quem o escreveu vai para o que lhe compete.
  { path: '*', element: <Inicio /> },
];

const router = createHashRouter(rotas.map((r) => ({ ...r, element: <Shell>{r.element}</Shell> })));

/**
 * Dentro do Azure DevOps quem autentica é o host, pelo SDK: a extensão já chega
 * com o utilizador resolvido. Pedir-lhe que entre outra vez seria pedir duas
 * vezes a mesma coisa.
 */
const embebido = new URLSearchParams(location.search).get('host') === 'ado';

/**
 * A porta. Sem sessão iniciada não há aplicação — nem sequer as rotas são
 * montadas, para não haver caminho por onde um ecrã apareça a quem não entrou.
 */
function Raiz(): ReactNode {
  const [sessao, setSessao] = useState(app.sessao());
  if (sessao === undefined && !embebido) {
    return (
      <Login
        onEntrar={(id) => {
          app.setUtilizador(id);
          // Entrar leva sempre a casa. Sem isto, quem entra num endereço que
          // ficou no URL — o de outra sessão, ou um que lhe mandaram — aterra
          // numa recusa em vez de aterrar no seu trabalho.
          location.hash = '#/';
          setSessao(id);
        }}
      />
    );
  }
  return <RouterProvider router={router} />;
}

async function arrancar(): Promise<void> {
  await app.inicializar();
  const el = document.getElementById('raiz');
  if (el !== null) createRoot(el).render(<StrictMode><Raiz /></StrictMode>);
}
void arrancar();
