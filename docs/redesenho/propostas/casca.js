/*
 * CHORA+ — CASCA COMUM DAS PROPOSTAS
 *
 * A lateral e a barra do assistente são iguais em todos os ecrãs. Repeti-las em
 * cada maqueta garantia que ao fim de sete ficheiros já não seriam iguais. Aqui
 * escrevem-se uma vez.
 *
 * Uso, no corpo do documento:
 *   <div class="app" data-ativo="contratos" data-hoje="11"> … </div>
 *
 * O Choramingas fica recolhido no fundo da lateral em todos os ecrãs. Para
 * mostrar a barra aberta, acrescente `data-choramingas="aberto"` ao .app e, se
 * quiser mudar o texto do campo, `data-dica="…"`.
 *
 * Nota: isto é andaime de maqueta. Na aplicação a casca é o componente Shell.
 */
(() => {
  const ic = (d, extra = '') =>
    `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"${extra}>${d}</svg>`;

  const MENU = [
    { id: 'hoje', rot: 'Hoje', contador: true,
      ic: '<path d="M3 9.6 12 3l9 6.6V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1V9.6Z"/>' },
    { grupo: 'Trabalho' },
    { id: 'contratos', rot: 'Contratos',
      ic: '<path d="M6 3h9l4 4v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/>' },
    { id: 'registos', rot: 'Registos e aprovações',
      ic: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="m8.5 12.5 2.4 2.4 4.6-5"/>' },
    { id: 'faturacao', rot: 'Faturação',
      ic: '<circle cx="12" cy="12" r="9"/><path d="M14.6 9.3A3 3 0 1 0 12 15M9.4 11.2h5M9.4 13.4h5"/>' },
    { grupo: 'Análise' },
    { id: 'relatorios', rot: 'Relatórios', ic: '<path d="M5 20V11M12 20V4M19 20v-6"/>' },
    { gaveta: 'Configurações e outros' },
    { id: 'regras', rot: 'Regras e alertas',
      ic: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 8-3 8h18s-3-1-3-8Z"/><path d="M10.3 21a2 2 0 0 0 3.4 0"/>' },
    { id: 'orcamentacao', rot: 'Orçamentação',
      ic: '<circle cx="12" cy="12" r="9"/><path d="M12 3v9l6.5 3.4"/>' },
    { id: 'recursos', rot: 'Recursos',
      ic: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 20c0-3.4 2.8-5.2 6.2-5.2s6.2 1.8 6.2 5.2"/><path d="M16.4 5.6a3.4 3.4 0 0 1 0 5M21.2 20c0-2.7-1.1-4.2-2.8-4.8"/>' },
    { id: 'auditoria', rot: 'Auditoria',
      ic: '<path d="M7 3h10a2 2 0 0 1 2 2v16l-7-3.4L5 21V5a2 2 0 0 1 2-2Z"/>' },
    { id: 'acessos', rot: 'Acessos',
      ic: '<rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8.4 10V7a3.6 3.6 0 0 1 7.2 0v3"/>' },
    { id: 'dados', rot: 'Dados de demonstração',
      ic: '<ellipse cx="12" cy="6" rx="7.5" ry="3.2"/><path d="M4.5 6v12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V6"/><path d="M4.5 12c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2"/>' },
  ];

  function lateral(ativo, contadorHoje) {
    let h = `<div class="marca">
      <div class="logo">C+</div>
      <div><b>CHORA+</b><span>Controlo de horas</span></div>
    </div>`;
    let emGaveta = false;
    for (const it of MENU) {
      if (it.grupo) { h += `<div class="grupo">${it.grupo}</div>`; continue; }
      if (it.gaveta) {
        emGaveta = true;
        h += `<div class="gaveta"><div class="grupo">${it.gaveta}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="m6 9 6 6 6-6"/></svg>
        </div>`;
        continue;
      }
      const cnt = it.contador && contadorHoje ? `<span class="cnt">${contadorHoje}</span>` : '';
      h += `<div class="nav${it.id === ativo ? ' on' : ''}">${ic(it.ic)}${it.rot}${cnt}</div>`;
    }
    if (emGaveta) h += '</div>';
    const aberto = document.querySelector('.app')?.dataset.choramingas === 'aberto';
    h += `<div class="fim"></div>
      <div class="lancador${aberto ? ' on' : ''}">
        <div class="fig"><img class="mascote" src="ativos/choramingas-aceno.png" alt="Choramingas"></div>
        <div><b>Choramingas</b><span>${aberto ? 'A conversar' : 'Perguntar ou pedir'}</span></div>
        <svg class="seta" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="m9 6 6 6-6 6"/></svg>
      </div>`;
    return h;
  }

  const DICA_OMISSAO = 'Pergunte ou peça — ex.: onde posso colocar mais um arquiteto?';
  const SUGS_OMISSAO = [
    'Que contratos estão em risco?',
    'Onde posso colocar mais um arquiteto?',
    'Que registos estão por aprovar?',
  ];

  /** A barra do Choramingas, aberta a partir do lançador da lateral. */
  function choramingas(dica, sugs) {
    const el = document.createElement('div');
    el.className = 'choro';
    el.innerHTML = `<div class="painel">
        <div class="topo">
          <div class="fig"><img class="mascote" src="ativos/choramingas-aceno.png" alt="Choramingas"></div>
          <b>Choramingas</b>
          <span class="sub">33 capacidades · responde com os dados a que tem acesso</span>
          <span class="fechar" title="Fechar">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </span>
        </div>
        <div class="linha">
          <input placeholder="${dica}">
          <button class="btn ico sm" title="Carregar documentos">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M21.4 11.1 12.9 2.6a4 4 0 0 0-5.7 5.7l8.5 8.5a2.5 2.5 0 0 0 3.5-3.5l-7.8-7.8"/></svg>
          </button>
          <button class="btn azul">Perguntar</button>
        </div>
        <div class="sugs">${sugs.map((s) => `<span class="sug">${s}</span>`).join('')}</div>
        <div class="nota">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="flex:0 0 14px"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v4h1"/></svg>
          Mostra sempre antes de executar; as regras são as mesmas dos ecrãs.
          <span class="dir">Abrir a conversa inteira →</span>
        </div>
      </div>`;
    return el;
  }

  function montar() {
    const app = document.querySelector('.app');
    if (!app) return;
    if (!app.querySelector('.lateral')) {
      const aside = document.createElement('aside');
      aside.className = 'lateral';
      aside.innerHTML = lateral(app.dataset.ativo, app.dataset.hoje);
      app.prepend(aside);
    }
    if (app.dataset.choramingas === 'aberto' && !app.querySelector('.choro')) {
      const sugs = app.dataset.sugestoes ? app.dataset.sugestoes.split('|') : SUGS_OMISSAO;
      app.querySelector('.principal')?.append(choramingas(app.dataset.dica || DICA_OMISSAO, sugs));
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
