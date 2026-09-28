import * as THREE from 'three';
import { M_EARTH, M_SUN } from '../core/constants';
import { formatDistance, formatMass } from '../core/units';
import { PRESETS } from '../data/presets';
import type { Body } from '../sim/body';
import type { Sandbox, ReleaseMode } from '../app/sandbox';
import { h, toggleRow } from './dom';
import type { UI } from './ui';

const log = (v: number) => Math.log10(v);

/** Sandbox popover: live physics, adding objects, editing the selected object. */
export class SandboxPanel {
  el: HTMLElement;
  private status!: HTMLElement;
  private presetSel!: HTMLSelectElement;
  private nameInput!: HTMLInputElement;
  private massSlider!: HTMLInputElement;
  private massOut!: HTMLElement;
  private distSlider!: HTMLInputElement;
  private distOut!: HTMLElement;
  private inclSlider!: HTMLInputElement;
  private inclOut!: HTMLElement;
  private placeSel!: HTMLSelectElement;
  private selBox!: HTMLElement;
  private selName!: HTMLElement;
  private selInfo!: HTMLElement;
  private selMass!: HTMLInputElement;
  private selMassOut!: HTMLElement;
  private grabBtn!: HTMLButtonElement;
  private liveToggle!: HTMLInputElement;
  private selected: Body | null = null;
  private lastMassLog = 0;

  constructor(private ui: UI, private sb: Sandbox, private getCursorRay: () => THREE.Vector3, private getSelected: () => Body | null, private startGrab: (b: Body) => void) {
    this.el = h('div', { class: 'pop panel', id: 'pop-sandbox', style: { width: '330px' } });
    this.build();
    ui.registerPop('sandbox', this.el);
    sb.onChange = () => this.refresh();
  }

  private build() {
    const sb = this.sb;
    const liveRow = toggleRow('Live N-body gravity', sb.live, (v) => { if (v) sb.enableLive(); else sb.freeze(); this.refresh(); });
    this.liveToggle = liveRow.querySelector('input') as HTMLInputElement;
    this.status = h('div', { style: { color: 'var(--dim)', fontSize: '11px', lineHeight: '1.5', padding: '2px 0 6px', fontFamily: 'var(--mono)' } });
    this.el.append(
      h('h3', {}, 'Physics'), liveRow, this.status,
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' } },
        h('button', { class: 'btn', title: 'Bake the current orbits into fixed Keplerian ellipses', onclick: () => sb.freeze() }, 'Freeze orbits'),
        h('button', { class: 'btn danger', title: 'Remove all your objects and restore the real solar system', onclick: () => { sb.restoreNatural(); } }, 'Reset system')),
    );

    // ---- add object
    this.presetSel = h('select', { style: { width: '100%' } }) as HTMLSelectElement;
    const groups = new Map<string, HTMLElement>();
    for (const p of PRESETS) {
      if (!groups.has(p.group)) { const g = h('optgroup', { label: p.group }); groups.set(p.group, g); this.presetSel.appendChild(g); }
      groups.get(p.group)!.appendChild(h('option', { value: p.id }, p.label));
    }
    this.presetSel.value = 'earthlike';
    this.nameInput = h('input', { type: 'text', placeholder: 'Name (optional)', style: { width: '100%' } }) as HTMLInputElement;
    const massRow = this.slider('Mass', 20, 34, 0.02, 24.8, (v, o) => (o.textContent = this.fmtMass(Math.pow(10, v))));
    this.massSlider = massRow.input; this.massOut = massRow.out;
    this.placeSel = h('select', { style: { width: '100%' } }, h('option', { value: 'orbit' }, 'Orbit the selected object'), h('option', { value: 'camera' }, 'In front of me — then position it')) as HTMLSelectElement;
    const distRow = this.slider('Orbit radius', 6, 16.5, 0.02, 8, (v, o) => (o.textContent = formatDistance(Math.pow(10, v))));
    this.distSlider = distRow.input; this.distOut = distRow.out;
    const inclRow = this.slider('Inclination', 0, 180, 1, 0, (v, o) => (o.textContent = `${v}°`));
    this.inclSlider = inclRow.input; this.inclOut = inclRow.out;
    this.presetSel.addEventListener('change', () => this.onPreset());
    this.el.append(
      h('h3', {}, 'Add object'),
      this.presetSel, h('div', { style: { height: '6px' } }), this.nameInput,
      massRow.row, this.placeSel, distRow.row, inclRow.row,
      h('div', { style: { marginTop: '8px' } }, h('button', { class: 'btn primary', onclick: () => this.add() }, 'Add to simulation')),
    );

    // ---- selected object
    this.selName = h('div', { style: { fontWeight: '600', color: '#fff' } });
    this.selInfo = h('div', { style: { color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--mono)', lineHeight: '1.5', margin: '3px 0 8px' } });
    const mr = this.slider('Mass', 10, 36, 0.01, 24, (v, o) => (o.textContent = this.fmtMass(Math.pow(10, v))));
    this.selMass = mr.input; this.selMassOut = mr.out;
    this.selMass.addEventListener('input', () => {
      if (this.selected) { this.sb.setMass(this.selected, Math.pow(10, Number(this.selMass.value))); }
    });
    this.grabBtn = h('button', { class: 'btn', title: 'Pick the object up with the cursor (X)', onclick: () => { const b = this.getSelected(); if (!b) return; if (this.sb.grabbed) this.sb.release(); else this.startGrab(b); } }, 'Grab (X)') as HTMLButtonElement;
    const relSel = h('select', {}, h('option', { value: 'circular' }, 'Release into circular orbit'), h('option', { value: 'keep' }, 'Keep previous velocity'), h('option', { value: 'stop' }, 'Release at rest'), h('option', { value: 'throw' }, 'Throw with cursor speed')) as HTMLSelectElement;
    relSel.addEventListener('change', () => { this.sb.releaseMode = relSel.value as ReleaseMode; });
    const btn = (label: string, fn: (b: Body) => void, cls = '') => h('button', { class: 'btn ' + cls, onclick: () => { const b = this.getSelected(); if (b) fn(b); } }, label);
    this.selBox = h('div', {},
      this.selName, this.selInfo, mr.row,
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0' } }, this.grabBtn, btn('Circularize', (b) => sb.circularize(b)), btn('Stop', (b) => sb.stop(b)), btn('Reverse', (b) => sb.reverse(b))),
      h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0' } }, btn('Speed −20%', (b) => sb.scaleSpeed(b, 0.8)), btn('Speed +25%', (b) => sb.scaleSpeed(b, 1.25)), btn('Delete', (b) => sb.remove(b), 'danger')),
      relSel,
      h('div', { style: { color: 'var(--faint)', fontSize: '11px', marginTop: '8px', lineHeight: '1.5' } }, 'Tip: drag the velocity arrow that appears on the selected object to redirect it; the orbit path updates live.'),
    );
    this.el.append(h('h3', {}, 'Selected object'), this.selBox);
    this.onPreset();
    this.setSelected(null);
  }

  private slider(label: string, min: number, max: number, step: number, value: number, onInput: (v: number, out: HTMLElement) => void) {
    const out = h('span', { style: { width: '92px', textAlign: 'right', color: 'var(--dim)', fontSize: '11px', fontFamily: 'var(--mono)' } });
    const input = h('input', { type: 'range', min, max, step, value, style: { flex: '1' } }) as HTMLInputElement;
    input.addEventListener('input', () => onInput(Number(input.value), out));
    onInput(value, out);
    const row = h('div', { class: 'row' }, h('label', { style: { flex: 'none', width: '78px' } }, label), input, out);
    return { row, input, out };
  }

  private fmtMass(kg: number) {
    if (kg >= 0.1 * M_SUN) return `${(kg / M_SUN).toFixed(2)} M☉`;
    if (kg >= 0.05 * M_EARTH) return `${(kg / M_EARTH).toFixed(2)} M⊕`;
    return `${kg.toExponential(1)} kg`;
  }

  private onPreset() {
    const p = PRESETS.find((x) => x.id === this.presetSel.value)!;
    this.massSlider.min = String(p.massRange[0]); this.massSlider.max = String(p.massRange[1]);
    this.massSlider.value = String(log(p.mass));
    this.massOut.textContent = this.fmtMass(p.mass);
  }

  private add() {
    const around = this.getSelected();
    const atCamera = this.placeSel.value === 'camera' || !around;
    const dist = Math.pow(10, Number(this.distSlider.value));
    const b = this.sb.add(this.presetSel.value, {
      name: this.nameInput.value.trim() || undefined, mass: Math.pow(10, Number(this.massSlider.value)), around: atCamera ? null : around,
      distance: atCamera ? undefined : Math.max(dist, (around?.radius ?? 0) * 1.5), inclinationDeg: Number(this.inclSlider.value), atCamera,
    });
    if (b) {
      this.ui.toast(atCamera ? `${b.name} created — move it, then click to drop` : `${b.name} added in orbit around ${around!.name}`);
      this.nameInput.value = '';
      if (atCamera) this.startGrab(b);
      else this.ui.selectBody?.(b);
    }
  }

  /** Called when the app selection changes. */
  setSelected(b: Body | null) {
    this.selected = b;
    this.selBox.style.display = b ? '' : 'none';
    (this.selBox.previousElementSibling as HTMLElement).style.display = b ? '' : 'none';
    if (b) {
      this.selName.textContent = b.name;
      const v = Math.min(36, Math.max(10, log(b.mass)));
      this.selMass.value = String(v);
      this.selMassOut.textContent = this.fmtMass(b.mass);
      // default orbit radius for new objects: a few radii of the selection
      const d = b.isStellar ? 1.496e11 : b.radius * 4;
      this.distSlider.value = String(Math.min(16.5, Math.max(6, log(d))));
      this.distOut.textContent = formatDistance(Math.pow(10, Number(this.distSlider.value)));
    }
  }

  refresh() {
    const s = this.sb.host_universe_stats();
    this.liveToggle.checked = this.sb.live;
    this.status.textContent = this.sb.live
      ? `LIVE · ${s.massive} gravity sources · ${s.test} test bodies${s.onRails ? ` (${s.onRails} on analytic orbits)` : ''}${s.warpCapped ? '\nTime warp is limited by physics accuracy.' : ''}`
      : 'Ephemeris mode: bodies follow real Keplerian orbits. Any edit switches to live gravity.';
    this.status.style.whiteSpace = 'pre-line';
    this.grabBtn.classList.toggle('on', !!this.sb.grabbed);
    this.grabBtn.textContent = this.sb.grabbed ? 'Release (X)' : 'Grab (X)';
    if (this.selected) this.selInfo.textContent = this.sb.describe(this.selected);
  }
}
