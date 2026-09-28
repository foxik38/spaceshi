import { h, icon, sliderRow, toggleRow } from './dom';
import type { AppAPI, SearchResult } from './api';
import type { Selectable, StatRow } from '../app/selectable';
import * as THREE from 'three';

const LOGO = `<svg viewBox="0 0 32 32"><defs><radialGradient id="lg" cx="35%" cy="30%"><stop offset="0" stop-color="#ffe2b0"/><stop offset="1" stop-color="#e5883a"/></radialGradient></defs><circle cx="16" cy="16" r="8" fill="url(#lg)"/><ellipse cx="16" cy="16" rx="14.5" ry="4.2" fill="none" stroke="#cfe8ff" stroke-width="1.5" transform="rotate(-22 16 16)" opacity=".9"/></svg>`;

export class UI {
  root: HTMLElement;
  private results!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private info!: HTMLElement;
  private infoBody!: HTMLElement;
  private date!: HTMLElement;
  private rate!: HTMLElement;
  private sub!: HTMLElement;
  private pauseBtn!: HTMLElement;
  private statusEls: Record<string, HTMLElement> = {};
  private toastBox!: HTMLElement;
  private hint!: HTMLElement;
  private help!: HTMLElement;
  private pops = new Map<string, HTMLElement>();
  private resultsData: SearchResult[] = [];
  private active = 0;
  private selected: Selectable | null = null;
  private lastStatsT = 0;
  private hintTimer = 0;
  extraInfoActions?: (sel: Selectable, box: HTMLElement) => void;

  constructor(parent: HTMLElement, private api: AppAPI) {
    this.root = h('div', { id: 'ui' });
    parent.appendChild(this.root);
    this.buildTopLeft();
    this.buildTime();
    this.buildToolbar();
    this.buildInfo();
    this.buildStatus();
    this.buildHelp();
    this.toastBox = h('div', { id: 'toast' });
    this.hint = h('div', { id: 'hint' }, 'Drag to look · W A S D to fly · Scroll to change speed · / to search · G to fly to selection · H for help');
    this.root.append(h('div', { id: 'cross' }), this.hint, this.toastBox);
    this.hintTimer = window.setTimeout(() => (this.hint.style.opacity = '0'), 14000);
  }

  // ---------------------------------------------------------------- search
  private buildTopLeft() {
    this.searchInput = h('input', { type: 'text', placeholder: 'Search the universe…', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
    this.results = h('div', { id: 'results', class: 'panel' });
    const box = h('div', { id: 'search' }, h('span', { class: 'ico', html: icon('search') }), this.searchInput, h('kbd', {}, '/'), this.results);
    this.root.appendChild(h('div', { id: 'topleft' },
      h('div', { class: 'brand' }, h('span', { html: LOGO }), h('b', {}, 'SPACESHI'), h('small', {}, 'universe sandbox')),
      box));
    this.searchInput.addEventListener('input', () => this.runSearch());
    this.searchInput.addEventListener('focus', () => this.runSearch());
    this.searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { this.active = Math.min(this.active + 1, this.resultsData.length - 1); this.renderResults(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { this.active = Math.max(this.active - 1, 0); this.renderResults(); e.preventDefault(); }
      else if (e.key === 'Enter') { const r = this.resultsData[this.active]; if (r) this.pick(r, !e.shiftKey); e.preventDefault(); }
      else if (e.key === 'Escape') { this.closeSearch(); this.searchInput.blur(); }
      e.stopPropagation();
    });
    document.addEventListener('pointerdown', (e) => { if (!box.contains(e.target as Node)) this.results.classList.remove('open'); });
  }

  focusSearch() { this.searchInput.focus(); this.searchInput.select(); }
  closeSearch() { this.results.classList.remove('open'); }

  private runSearch() {
    this.resultsData = this.api.search(this.searchInput.value);
    this.active = 0;
    this.renderResults();
  }

  private renderResults() {
    this.results.innerHTML = '';
    this.results.classList.toggle('open', this.resultsData.length > 0 || this.searchInput.value.length > 1);
    if (!this.resultsData.length && this.searchInput.value.length > 1) {
      this.results.appendChild(h('div', { class: 'res' }, h('span', { class: 'nm' }, 'No matches')));
    }
    this.resultsData.forEach((r, i) => {
      const el = h('div', { class: 'res' + (i === this.active ? ' active' : '') },
        h('span', { class: 'dot k-' + r.kind }), h('span', { class: 'nm' }, r.name), h('span', { class: 'tp' }, r.type), h('span', { class: 'ds' }, r.distance));
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); this.pick(r, true); });
      this.results.appendChild(el);
    });
  }

  private pick(r: SearchResult, go: boolean) {
    const sel = r.make();
    this.api.select(sel);
    if (go) this.api.gotoSelected();
    this.closeSearch();
    this.searchInput.blur();
  }

  // ---------------------------------------------------------------- time
  private buildTime() {
    this.date = h('div', { class: 'date' }, '—');
    this.sub = h('div', { class: 'sub' }, h('span', {}, 'Simulation time (UTC)'), h('span', {}));
    this.rate = h('div', { id: 'rate' }, '1×');
    const b = (ic: keyof typeof import('./dom').icons, tip: string, fn: () => void) => h('button', { class: 'btn icon', title: tip, html: icon(ic), onclick: fn });
    this.pauseBtn = b('pause', 'Pause / resume (Space)', () => this.api.togglePause());
    this.root.appendChild(h('div', { id: 'timepanel', class: 'panel' },
      this.date, this.sub,
      h('div', { class: 'ctrls' },
        b('slower', 'Slower ( , )', () => this.api.stepRate(-1)), this.pauseBtn, b('faster', 'Faster ( . )', () => this.api.stepRate(1)),
        this.rate, b('reverse', 'Reverse time (B)', () => this.api.reverseTime()), h('button', { class: 'btn icon', title: 'Jump to now (T)', html: icon('now'), onclick: () => this.api.timeNow() }))));
  }

  // ---------------------------------------------------------------- toolbar
  private buildToolbar() {
    const tb = h('div', { id: 'toolbar', class: 'panel' });
    const add = (ic: keyof typeof import('./dom').icons, tip: string, fn: () => void, pop?: string) => {
      const btn = h('button', { class: 'btn', 'data-tip': tip, html: icon(ic), onclick: () => { fn(); if (pop) this.togglePop(pop, btn); } });
      tb.appendChild(btn);
      return btn;
    };
    add('home', 'Home — Sun & planets', () => this.api.goHome());
    tb.appendChild(h('div', { class: 'sep' }));
    add('layers', 'Layers', () => {}, 'layers');
    add('settings', 'Settings', () => {}, 'settings');
    if (this.api.hasSandbox) add('sandbox', 'Sandbox tools', () => {}, 'sandbox');
    add('camera', 'Photo mode (P)', () => this.api.photoMode());
    tb.appendChild(h('div', { class: 'sep' }));
    add('help', 'Help (H)', () => this.toggleHelp());
    this.root.appendChild(tb);

    const layers = h('div', { class: 'pop panel', id: 'pop-layers' }, h('h3', {}, 'Layers'));
    for (const [k, label] of [['labels', 'Labels'], ['orbits', 'Orbit lines'], ['stars', 'Stars'], ['constellations', 'Constellation lines'], ['belts', 'Asteroid & Kuiper belts'], ['galaxies', 'Galaxies & nebulae'], ['bodies', 'Solar-system objects'], ['grid', 'Ecliptic grid']] as const) {
      layers.appendChild(toggleRow(label, this.api.getLayer(k), (v) => this.api.setLayer(k, v)));
    }
    const settings = h('div', { class: 'pop panel', id: 'pop-settings' }, h('h3', {}, 'Display'));
    settings.append(
      sliderRow('Field of view', 30, 110, 1, this.api.getSetting('fov'), (v) => this.api.setSetting('fov', v), (v) => `${v}°`),
      sliderRow('Bloom', 0, 2, 0.05, this.api.getSetting('bloom'), (v) => this.api.setSetting('bloom', v), (v) => v.toFixed(2)),
      sliderRow('Exposure', 0.3, 3, 0.05, this.api.getSetting('exposure'), (v) => this.api.setSetting('exposure', v), (v) => v.toFixed(2)),
      sliderRow('Star brightness', 0.3, 3, 0.05, this.api.getSetting('stars'), (v) => this.api.setSetting('stars', v), (v) => v.toFixed(2)),
      sliderRow('Render scale', 0.5, 2, 0.25, this.api.getSetting('scale'), (v) => this.api.setSetting('scale', v), (v) => `${v}×`),
      h('h3', { style: { marginTop: '12px' } }, 'Motion'),
      sliderRow('Flight speed', -2, 3, 0.05, Math.log10(this.api.getSetting('speed')), (v) => this.api.setSetting('speed', Math.pow(10, v)), (v) => `${Math.pow(10, v).toFixed(2)}`),
      toggleRow('Audio ambience', this.api.getSetting('audio') > 0, (v) => this.api.setSetting('audio', v ? 1 : 0)),
    );
    this.root.append(layers, settings);
    this.pops.set('layers', layers);
    this.pops.set('settings', settings);
  }

  registerPop(name: string, el: HTMLElement) { this.root.appendChild(el); this.pops.set(name, el); }

  togglePop(name: string, btn?: HTMLElement) {
    for (const [k, el] of this.pops) {
      if (k === name) el.classList.toggle('open');
      else el.classList.remove('open');
    }
    void btn;
  }
  closePops() { for (const el of this.pops.values()) el.classList.remove('open'); }

  // ---------------------------------------------------------------- info panel
  private buildInfo() {
    this.info = h('div', { id: 'info', class: 'panel' });
    this.infoBody = h('div');
    this.info.appendChild(this.infoBody);
    this.root.appendChild(this.info);
  }

  setSelected(sel: Selectable | null, camPos: THREE.Vector3, time: number) {
    this.selected = sel;
    if (!sel) { this.info.classList.remove('open'); return; }
    this.info.classList.add('open');
    const body = this.infoBody;
    body.innerHTML = '';
    const actions = h('div', { class: 'actions' },
      h('button', { class: 'btn accent', html: icon('rocket') + ' Go to', title: 'Fly there (G)', onclick: () => this.api.gotoSelected() }),
      h('button', { class: 'btn', html: icon('target') + ' Orbit', title: 'Orbit at the current distance (C)', onclick: () => this.api.orbitSelected() }));
    actions.querySelectorAll('svg').forEach((s) => { (s as SVGElement).setAttribute('style', 'width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:1.8;vertical-align:-2px;margin-right:4px'); });
    body.append(
      h('div', { class: 'hd' }, h('div', { style: { flex: '1' } }, h('h2', {}, sel.name), h('div', { class: 'sub' }, sel.subtitle)),
        h('button', { class: 'close', title: 'Close (Esc)', onclick: () => this.api.select(null) }, '×')),
      actions,
    );
    if (sel.procedural) body.appendChild(h('span', { class: 'badge' }, 'procedurally generated'));
    this.extraInfoActions?.(sel, actions);
    const table = h('table');
    table.id = 'stats';
    body.appendChild(table);
    this.fillStats(camPos, time);
    if (sel.description) body.appendChild(h('p', {}, sel.description));
    if (sel.facts?.length) body.appendChild(h('ul', {}, ...sel.facts.map((f) => h('li', {}, f))));
    this.info.scrollTop = 0;
  }

  private fillStats(camPos: THREE.Vector3, time: number) {
    if (!this.selected) return;
    const table = this.infoBody.querySelector('#stats') as HTMLTableElement | null;
    if (!table) return;
    const rows: StatRow[] = this.selected.stats(camPos, time);
    if (table.rows.length !== rows.length) {
      table.innerHTML = '';
      for (const r of rows) {
        const tr = table.insertRow();
        tr.insertCell().textContent = r.label;
        tr.insertCell().textContent = r.value;
      }
    } else {
      rows.forEach((r, i) => {
        const tr = table.rows[i];
        if (tr.cells[0].textContent !== r.label) tr.cells[0].textContent = r.label;
        if (tr.cells[1].textContent !== r.value) tr.cells[1].textContent = r.value;
      });
    }
  }

  refreshStats(camPos: THREE.Vector3, time: number, realNow: number) {
    if (realNow - this.lastStatsT < 0.25) return;
    this.lastStatsT = realNow;
    this.fillStats(camPos, time);
  }

  // ---------------------------------------------------------------- status bar
  private buildStatus() {
    const mk = (k: string, label: string) => {
      const v = h('span', { class: 'v' }, '—');
      this.statusEls[k] = v;
      return h('div', {}, h('span', { class: 'k' }, label), v);
    };
    this.root.appendChild(h('div', { id: 'status', class: 'panel' }, mk('frame', 'Location'), mk('target', 'Target'), mk('dist', 'Distance'), mk('speed', 'Speed'), mk('fov', 'Field of view'), mk('fps', 'FPS')));
  }

  updateStatus(v: Record<string, string>) {
    for (const [k, val] of Object.entries(v)) {
      const el = this.statusEls[k];
      if (el && el.textContent !== val) el.textContent = val;
    }
  }

  updateTime() {
    const d = this.api.dateLabel();
    if (this.date.textContent !== d) this.date.textContent = d;
    const r = this.api.rateLabel();
    if (this.rate.textContent !== r) this.rate.textContent = r;
    const p = this.api.paused();
    this.pauseBtn.innerHTML = icon(p ? 'play' : 'pause');
  }

  // ---------------------------------------------------------------- toasts / help
  toast(msg: string, ms = 2600) {
    const t = h('div', { class: 'toast panel' }, msg);
    this.toastBox.appendChild(t);
    setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 450); }, ms);
    while (this.toastBox.children.length > 4) this.toastBox.firstChild!.remove();
  }

  setHint(text: string) { this.hint.textContent = text; this.hint.style.opacity = '1'; clearTimeout(this.hintTimer); this.hintTimer = window.setTimeout(() => (this.hint.style.opacity = '0'), 9000); }

  private buildHelp() {
    const k = (keys: string[], desc: string) => h('div', { class: 'k' }, h('span', {}, ...keys.map((x) => h('kbd', {}, x))), h('span', {}, desc));
    this.help = h('div', { id: 'help', onclick: (e: Event) => { if (e.target === this.help) this.toggleHelp(); } },
      h('div', { class: 'card panel' },
        h('h2', {}, 'CONTROLS'),
        h('div', { style: { color: 'var(--dim)', fontSize: '13px' } }, 'You are a free-floating observer. Speed automatically scales with how close you are to the nearest object.'),
        h('div', { class: 'cols' },
          h('div', {}, h('h4', {}, 'Movement'),
            k(['W', 'A', 'S', 'D'], 'Fly'), k(['R', 'F'], 'Up / down'), k(['Q', 'E'], 'Roll'), k(['Shift'], 'Boost ×8'), k(['Ctrl'], 'Precision ×0.1'),
            k(['Scroll'], 'Flight speed (or zoom when orbiting)'), k(['Drag'], 'Look around / orbit target'), k(['Z'], 'Hold: telescope zoom (scroll adjusts)')),
          h('div', {}, h('h4', {}, 'Navigation'),
            k(['/'], 'Search everything'), k(['Click'], 'Select object'), k(['Double-click', 'G'], 'Fly to selection'), k(['C'], 'Orbit selection'), k(['Backspace'], 'Previous target'), k(['Home'], 'Solar system overview'), k(['Esc'], 'Deselect / stop autopilot')),
          h('div', {}, h('h4', {}, 'Time'),
            k(['Space'], 'Pause'), k([',', '.'], 'Slower / faster'), k(['B'], 'Reverse time'), k(['T'], 'Jump to now')),
          h('div', {}, h('h4', {}, 'Interface'),
            k(['L'], 'Toggle labels'), k(['O'], 'Toggle orbit lines'), k(['U'], 'Hide interface'), k(['P'], 'Photo mode / screenshot'), k(['H'], 'This help'))),
        h('div', { style: { marginTop: '16px', color: 'var(--dim)', fontSize: '12px' } }, 'Sandbox: select a body and use the Sandbox tools (left toolbar) to grab, fling, edit or delete it, or add new planets, stars and black holes.')));
    document.body.appendChild(this.help);
  }

  toggleHelp() { this.help.classList.toggle('open'); }
  get helpOpen() { return this.help.classList.contains('open'); }
  get searchFocused() { return document.activeElement === this.searchInput; }
}
