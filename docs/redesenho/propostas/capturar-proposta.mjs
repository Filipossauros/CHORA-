import pw from '/opt/node22/lib/node_modules/playwright/index.js';
const { chromium } = pw;
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
const p = await b.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
await p.goto('file:///home/user/CHORA-/docs/redesenho/propostas/hoje-v2.html', { waitUntil: 'networkidle' });
// Na captura de página inteira a barra do assistente não pode ficar colada:
// ficaria a meio do ecrã, por cima de um cartão.
await p.addStyleTag({ content: '.assist{position:static !important;box-shadow:none !important}' });
await p.waitForTimeout(400);
await p.screenshot({ path: '/home/user/CHORA-/docs/redesenho/propostas/hoje-v2-completo.png', fullPage: true });
console.log('altura', await p.evaluate(() => document.body.scrollHeight));
await b.close();
