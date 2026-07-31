/*
 * Captura as maquetas das propostas: um recorte de 1440×1000 (o que se vê ao
 * abrir) e a página inteira, por ficheiro.
 *
 *   node docs/redesenho/propostas/capturar-proposta.mjs [nome…]
 *
 * Sem argumentos captura todas. O Chromium e o Playwright são os do ambiente.
 */
import pw from '/opt/node22/lib/node_modules/playwright/index.js';
import { readdir } from 'node:fs/promises';

const DIR = '/home/user/CHORA-/docs/redesenho/propostas';
const alvos = process.argv.slice(2);
const ficheiros = (await readdir(DIR))
  .filter((f) => f.endsWith('.html'))
  .filter((f) => alvos.length === 0 || alvos.some((a) => f.includes(a)));

const b = await pw.chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });

for (const f of ficheiros.sort()) {
  const base = f.replace(/\.html$/, '');
  await p.goto(`file://${DIR}/${f}`, { waitUntil: 'networkidle' });
  await p.waitForTimeout(500);
  // Ecrãs de conversa abrem no fim, não no princípio — capturar como se veem.
  if (await p.evaluate(() => document.body.dataset.captura === 'fim')) {
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await p.waitForTimeout(250);
  }
  await p.screenshot({ path: `${DIR}/${base}.png` });

  // Na página inteira o que é «sticky» tem de deixar de o ser: o Chromium
  // desenha-o na posição de scroll e a lateral apareceria só no fundo.
  await p.addStyleTag({ content: '.lateral,.choro,.doca,.doca-inf{position:static!important;background-image:none!important} .lateral{height:auto!important}' });
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.screenshot({ path: `${DIR}/${base}-completo.png`, fullPage: true });
  const h = await p.evaluate(() => document.body.scrollHeight);
  console.log(`${base.padEnd(18)} ${h} px`);
}

await b.close();
