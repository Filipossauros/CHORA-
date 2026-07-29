/**
 * Recaptura as imagens do manifesto de UI.
 *
 * Antes de correr:
 *   pnpm --filter @chora/web build
 *   cd packages/web && pnpm exec vite preview --port 4231 --strictPort &
 *
 * Depois:
 *   node docs/redesenho/capturar.mjs
 *
 * O caminho do Playwright é o da instalação global deste ambiente; noutro sítio,
 * troque por `import { chromium } from 'playwright'`.
 */
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;

const B = 'http://localhost:4231/CHORA-/';
const OUT = join(dirname(fileURLToPath(import.meta.url)), 'capturas');
mkdirSync(OUT, { recursive: true });

const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
p.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
p.on('dialog', (d) => void d.accept());

const feito = [];
async function tirar(nome, rota, { espera = 1600, antes, tema = 'light' } = {}) {
  await p.emulateMedia({ colorScheme: tema });
  await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
  if (rota !== null) {
    await p.goto(B + '#' + rota, { waitUntil: 'networkidle' });
    await p.waitForTimeout(espera);
  }
  await p.evaluate((t) => document.documentElement.setAttribute('data-theme', t), tema);
  if (antes !== undefined) await antes();
  await p.waitForTimeout(400);
  const ficheiro = `${OUT}/${nome}.png`;
  await p.screenshot({ path: ficheiro, fullPage: true });
  feito.push(nome);
  console.log('✓', nome);
}

async function carregarCenario(nome) {
  await p.goto(B + '#/dados', { waitUntil: 'networkidle' });
  await p.waitForTimeout(1400);
  await p.locator('.cartao').filter({ hasText: nome }).first()
    .locator('button', { hasText: /Carregar|Recarregar/ }).click();
  await p.waitForTimeout(2600);
}

await p.goto(B + '#/', { waitUntil: 'networkidle' });
await p.waitForTimeout(3400);

// ── COBERTURA: os ecrãs com dados densos ─────────────────────────────────────
await tirar('01-hoje-fila', '/', { espera: 2600 });
await tirar('02-contratos-lista', '/contratos');

// Detalhe de um contrato de bolsa de horas.
await p.goto(B + '#/contratos', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.locator('tbody tr').filter({ hasText: 'C-2026-001' }).first().click();
await p.waitForTimeout(1800);
const rotaDetalhe = new URL(p.url()).hash.slice(1);
await tirar('03-contrato-ficha', null);
await tirar('04-contrato-afetacoes', null, { antes: async () => {
  await p.locator('.sep', { hasText: 'Afetações' }).click(); await p.waitForTimeout(900);
} });
await tirar('05-contrato-modificacoes', null, { antes: async () => {
  await p.locator('.sep', { hasText: 'Modificações' }).click(); await p.waitForTimeout(900);
} });

// Detalhe de um chave-na-mão, para o separador Entregáveis.
await p.goto(B + '#/contratos', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
const cm = p.locator('tbody tr').filter({ hasText: 'C-2026-CM1' }).first();
if (await cm.count() > 0) {
  await cm.click();
  await p.waitForTimeout(1800);
  await tirar('06-contrato-entregaveis', null, { antes: async () => {
    const sep = p.locator('.sep', { hasText: 'Entregáveis' });
    if (await sep.count() > 0) { await sep.click(); await p.waitForTimeout(900); }
  } });
}

await tirar('07-contrato-novo', '/contratos/novo');
await tirar('08-registos-aprovacoes', '/registos');
await tirar('09-faturacao', '/faturacao');
await tirar('10-relatorios-faturacao', '/relatorios', { espera: 2000 });
await tirar('11-relatorios-consumo', null, { antes: async () => {
  await p.locator('button', { hasText: 'Consumo por perfil' }).click(); await p.waitForTimeout(900);
} });
await tirar('12-orcamentacao', '/orcamentacao', { espera: 2400 });
await tirar('13-regras-negocio', '/regras', { espera: 1800 });
await tirar('14-regras-alertas', null, { antes: async () => {
  await p.locator('button', { hasText: 'Alertas (' }).click(); await p.waitForTimeout(900);
} });
await tirar('15-regras-assistente', null, { antes: async () => {
  await p.locator('button', { hasText: 'Funções do assistente' }).click(); await p.waitForTimeout(900);
} });
await tirar('16-recursos', '/recursos');
await tirar('17-auditoria', '/auditoria');
await tirar('18-acessos', '/acessos');
await tirar('19-dados-demonstracao', '/dados');

// ── ASSISTENTE: a conversa com tabela de trabalho ────────────────────────────
await carregarCenario('Capacidades do assistente');
await p.goto(B + '#/', { waitUntil: 'networkidle' });
await p.waitForTimeout(2600);
async function perguntar(texto) {
  await p.locator('input[aria-label^="Perguntar"]').fill(texto);
  await p.locator('button', { hasText: 'Perguntar' }).click();
  await p.waitForTimeout(1900);
}
await perguntar('Qual o saldo do contrato de outsourcing?');
await tirar('20-assistente-esclarecimento', null);
await perguntar('Que contratos comportam um perfil a 40 euros por hora?');
await perguntar('Acrescenta os consumos atuais de cada contrato');
await tirar('21-assistente-tabela-composta', null);
await perguntar('Troca a Carla Andrade por Diogo Marques no perfil Arquiteto de Software Sénior do C-2026-001');
await tirar('22-assistente-simulacao', null);

// ── HOJE em cenário pequeno + TEMA ESCURO ────────────────────────────────────
await carregarCenario('Decisões do «Hoje»');
await tirar('23-hoje-cenario-pequeno', '/', { espera: 2600 });
await tirar('24-hoje-escuro', '/', { espera: 2600, tema: 'dark' });

await carregarCenario('Ciclo de faturação');
await tirar('25-faturacao-escuro', '/faturacao', { tema: 'dark' });

await p.goto(B + '#/contratos', { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
await p.locator('tbody tr').first().click();
await p.waitForTimeout(1800);
await tirar('26-contrato-escuro', null, { tema: 'dark' });

// ── VAZIO: os estados sem dados ──────────────────────────────────────────────
await carregarCenario('Vazio');
await tirar('27-vazio-hoje', '/', { espera: 2400 });
await tirar('28-vazio-contratos', '/contratos');

await carregarCenario('Cobertura de regras');
console.log('\n' + feito.length + ' capturas em ' + OUT);
await b.close();
