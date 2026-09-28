import { App } from './app';

const root = document.getElementById('app')!;

function fail(title: string, detail: string) {
  root.innerHTML = '';
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;inset:0;display:grid;place-content:center;gap:10px;padding:24px;background:#000;color:#c9d1d9;font:14px/1.5 system-ui,sans-serif;text-align:center';
  const h = document.createElement('div');
  h.textContent = title;
  h.style.cssText = 'font-size:18px;letter-spacing:.14em;text-transform:uppercase;color:#e6edf3';
  const p = document.createElement('div');
  p.textContent = detail;
  p.style.cssText = 'max-width:520px;color:#8b949e';
  box.append(h, p);
  root.appendChild(box);
}

/** Spaceshi needs WebGL2 with renderable floating-point targets (HDR pipeline). */
function checkGraphics(): string | null {
  const gl = document.createElement('canvas').getContext('webgl2');
  if (!gl) return 'This browser or device does not expose WebGL 2. Try a current Chrome, Edge or Firefox with hardware acceleration enabled.';
  if (!gl.getExtension('EXT_color_buffer_float') && !gl.getExtension('EXT_color_buffer_half_float')) {
    return 'Floating-point render targets are unavailable, which the HDR pipeline needs. Enable hardware acceleration or update your graphics driver.';
  }
  return null;
}

const problem = checkGraphics();
if (problem) {
  fail('Graphics not supported', problem);
} else {
  const report = (e: unknown) => { console.error(e); fail('Something went wrong', String((e as Error)?.message ?? e)); };
  try {
    const app = new App(root);
    (window as unknown as { __app: App }).__app = app;
    app.start().catch(report);
  } catch (e) { report(e); }
}
