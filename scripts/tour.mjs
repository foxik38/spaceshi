#!/usr/bin/env node
/** Dev helper: capture a series of views. usage: node scripts/tour.mjs <outDir> "id:dist:phase:elev" ... [--size 640x360] */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
import { mkdirSync } from 'node:fs';
const args = process.argv.slice(2);
const out = args[0];
const sizeIdx = args.indexOf('--size');
const [w, h] = (sizeIdx >= 0 ? args[sizeIdx + 1] : '640x360').split('x').map(Number);
const views = args.slice(1).filter((a, i, arr) => a !== '--size' && arr[i - 1] !== '--size');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.push(`[${m.type()}] ${m.text().slice(0, 800)}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(process.env.URL || 'http://localhost:5173/');
await page.waitForTimeout(5000);
await page.evaluate("document.body.classList.add('ui-hidden')");
for (const v of views) {
  const [id, dist, phase, elev, extra] = v.split(':');
  const js = v.startsWith('js:') ? v.slice(3) : `window.__app.view('${id}', ${dist ?? 4}, ${phase ?? 60}, ${elev ?? 10}, ${extra ?? 0})`;
  await page.evaluate(js);
  await page.waitForTimeout(Number(process.env.SETTLE || 6000));
  await page.screenshot({ path: `${out}/${(id || 'view').replace(/[^a-z0-9]/gi, '_')}_${(dist ?? '')}.png` });
  console.log('shot', v);
}
console.log(logs.slice(0, 20).join('\n') || 'no console errors');
await browser.close();
