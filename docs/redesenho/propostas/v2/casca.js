/*
 * A casca das maquetas: desenha a lateral uma só vez, para todas as páginas.
 * `data-ativo` diz qual o destino aceso; `data-decisoes` a contagem.
 *
 * O menu proposto tem TRÊS destinos de trabalho. Hoje tem onze (cinco no menu,
 * seis na gaveta). O que sai não é apagado — fica em espera, e o que é de
 * administração vive na gaveta, fora do caminho diário.
 */
const TRABALHO = [
  ['Decisões', 'decisoes.html'],
  ['Contratos', 'contratos.html'],
  ['Registos e aprovações', 'registos.html'],
];
const GAVETA = [
  ['Recursos', '#'],
  ['Regras e alertas', '#'],
  ['Auditoria', '#'],
  ['Acessos', '#'],
];

const d = document.body.dataset;
const ativo = d.ativo ?? '';
const n = d.decisoes ?? '9';

const item = ([rot, href]) => {
  const on = rot === ativo ? ' on' : '';
  const ct = rot === 'Decisões' && n !== '0'
    ? `<span class="ct urg">${n}</span>` : '';
  return `<a class="nav${on}" href="${href}">${rot}${ct}</a>`;
};

document.body.insertAdjacentHTML('afterbegin', `
  <aside class="rail">
    <div class="marca">
      <div class="sig">C+</div>
      <div><b>CHORA+</b><span>Controlo de horas</span></div>
    </div>
    <div class="grupo">Trabalho</div>
    ${TRABALHO.map(item).join('')}
    <div class="grupo">Configurações e outros</div>
    ${GAVETA.map(item).join('')}
    <div class="fim"></div>
    <div class="quem"><b>Gestor de Contrato</b>Sessão iniciada</div>
  </aside>
`);

// Envolve o resto da página no painel, para a maqueta não repetir a estrutura.
const pal = document.createElement('div');
pal.className = 'pal';
while (document.body.children.length > 1) pal.append(document.body.children[1]);
document.body.append(pal);
document.body.classList.add('app');

// Abrir e fechar uma decisão da fila.
document.addEventListener('click', (e) => {
  const linha = e.target.closest('.dec');
  if (linha === null) return;
  const painel = linha.nextElementSibling;
  if (painel?.classList.contains('aberto')) {
    painel.hidden = !painel.hidden;
  }
});
