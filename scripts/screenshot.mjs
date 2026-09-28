#!/usr/bin/env node
/**
 * Headless screenshot helper for development:
 *   node scripts/screenshot.mjs <url> <out.png> [--eval "js to run in page"] [--wait ms] [--size 1280x720]
 * Uses Playwright's Chromium with software GL (SwiftShader) so it works on machines without a GPU.
 */
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const args = process.argv.slice(2);
const url = args[0], out = args[1];
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : def; };
const [w, h] = opt('--size', '1280x720').split('x').map(Number);
const evalJs = opt('--eval', '');
const wait = Number(opt('--wait', '4000'));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage({ viewport: { width: w, height: h } });
const logs = [];
page.on('console', (m) => { if (['error', 'warning'].includes(m.type()) || /shader|THREE|error/i.test(m.text())) logs.push(`[${m.type()}] ${m.text().slice(0, 1500)}`); });
page.on('pageerror', (e) => logs.push('[pageerror] ' + e.message));
await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(wait);
if (evalJs) { try { const r = await page.evaluate(evalJs); if (r !== undefined) console.log('eval ->', JSON.stringify(r)); } catch (e) { logs.push('[eval error] ' + e.message); } await page.waitForTimeout(Number(opt('--wait2', '2500'))); }
await page.screenshot({ path: out });
console.log(logs.slice(0, 20).join('\n') || 'no console errors');
await browser.close();
