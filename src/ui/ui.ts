import { h, icon, sliderRow, toggleRow, icons } from './dom';
import type { AppAPI, SearchResult } from './api';
import type { Selectable, StatRow } from '../app/selectable';
import * as THREE from 'three';

const SECTION: Record<string, string> = {
  Type: 'Overview', Orbits: 'Overview', Orbiting: 'Overview', 'Distance from you': 'Overview', 'Distance from Sun': 'Overview', Morphology: 'Overview',
  'Apparent magnitude (from you)': 'Overview', Discovered: 'Overview', 'Look-back time': 'Overview',
  'Semi-major axis': 'Orbit', 'Orbital period': 'Orbit', Eccentricity: 'Orbit', Inclination: 'Orbit', 'Distance from primary': 'Orbit', 'Orbital speed': 'Orbit', Orbit: 'Orbit',
  Atmosphere: 'Atmosphere', 'Surface pressure': 'Atmosphere',
  Constellation: 'Catalogue', Hipparcos: 'Catalogue', 'Henry Draper': 'Catalogue', Gliese: 'Catalogue', Catalogue: 'Catalogue', 'Sky position': 'Catalogue',
};
const SECTION_ORDER = ['Overview', 'Physical', 'Orbit', 'Atmosphere', 'Catalogue'];

export class UI {
  root: HTMLElement;
  private results!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private info!: HTMLElement;
  private infoBody!: HTMLElement;
  private date!: HTMLElement;
  private rate!: HTMLElement;
  private pauseBtn!: HTMLElement;
  private toolbar!: HTMLElement;
  private toolBtns = new Map<string, HTMLElement>();
  private valueEls = new Map<string, HTMLElement>();
  private statSig = '';
  private wasPaused = false;
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
    this.buildTopBar();
    this.buildToolbar();
    this.buildInfo();
    this.buildStatus();
    this.buildHelp();
    this.toastBox = h('div', { id: 'toast' });
    this.root.append(h('div', { id: 'cross' }), this.toastBox);
    this.hint.textContent = 'Drag: look   WASD: fly   Scroll: speed   /: search   G: go to selection   H: help';
    this.hintTimer = window.setTimeout(() => (this.hint.style.opacity = '0'), 16000);
  }

  // ---------------------------------------------------------------- top bar: title, search, time
  private buildTopBar() {
    this.searchInput = h('input', { type: 'text', placeholder: 'Search', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Search the universe' }) as HTMLInputElement;
    this.results = h('div', { id: 'results', class: 'panel' });
    const box = h('div', { id: 'search' }, this.searchInput, h('kbd', {}, '/'), this.results);
    this.date = h('div', { class: 'date' }, '—');
    this.rate = h('div', { id: 'rate' }, '1×');
    const tb = (ic: keyof typeof icons, tip: string, fn: () => void) => h('button', { class: 'tb', title: tip, html: icon(ic), onclick: fn });
    this.pauseBtn = tb('pause', 'Pause / resume  (Space)', () => this.api.togglePause());
    const time = h('div', { id: 'timeblock' },
      this.date,
      tb('slower', 'Slower  ( , )', () => this.api.stepRate(-1)), this.pauseBtn, tb('faster', 'Faster  ( . )', () => this.api.stepRate(1)),
      this.rate,
      tb('reverse', 'Reverse time  (B)', () => this.api.reverseTime()), tb('now', 'Jump to the present  (T)', () => this.api.timeNow()));
    this.hint = h('div', { class: 'hint' });
    this.root.appendChild(h('div', { id: 'topbar' }, h('div', { class: 'name' }, 'SPACESHI'), box, h('div', { class: 'spacer' }), time));
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
        h('span', { class: 'nm' }, r.name), h('span', { class: 'tp' }, r.type), h('span', { class: 'ds' }, r.distance));
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

  // ---------------------------------------------------------------- toolbar
  private buildToolbar() {
    const tb = h('div', { id: 'toolbar' });
    this.toolbar = tb;
    const add = (id: string, ic: keyof typeof icons, tip: string, fn: () => void, pop?: string) => {
      const btn = h('button', { class: 'btn', 'data-tip': tip, 'aria-label': tip, html: icon(ic), onclick: () => { fn(); if (pop) this.togglePop(pop); } });
      tb.appendChild(btn);
      this.toolBtns.set(id, btn);
      return btn;
    };
    add('home', 'home', 'Solar system overview  (Home)', () => this.api.goHome());
    add('orbits', 'orbit', 'Orbit paths on / off  (O)', () => this.api.setLayer('orbits', !this.api.getLayer('orbits')));
    add('layers', 'layers', 'Layers', () => {}, 'layers');
    add('sandbox', 'sandbox', 'Sandbox', () => {}, 'sandbox');
    add('settings', 'settings', 'Settings', () => {}, 'settings');
    add('camera', 'camera', 'Photo mode  (P)', () => this.api.photoMode());
    tb.appendChild(h('div', { class: 'grow' }));
    add('help', 'help', 'Controls  (H)', () => this.toggleHelp());
    if (!this.api.hasSandbox) this.toolBtns.get('sandbox')!.style.display = 'none';
    this.root.appendChild(tb);

    const layers = h('div', { class: 'pop panel', id: 'pop-layers' }, h('h3', {}, 'Layers'));
    for (const [k, label] of [['labels', 'Labels'], ['orbits', 'Orbit lines'], ['stars', 'Stars'], ['constellations', 'Constellation lines'], ['belts', 'Asteroid, Kuiper and Oort populations'], ['galaxies', 'Galaxies and nebulae'], ['bodies', 'Solar-system objects'], ['grid', 'Ecliptic grid']] as const) {
      layers.appendChild(toggleRow(label, this.api.getLayer(k), (v) => this.api.setLayer(k, v)));
    }
    const settings = h('div', { class: 'pop panel', id: 'pop-settings' }, h('h3', {}, 'Display'));
    settings.append(
      sliderRow('Field of view', 30, 110, 1, this.api.getSetting('fov'), (v) => this.api.setSetting('fov', v), (v) => `${v}°`),
      sliderRow('Bloom', 0, 2, 0.05, this.api.getSetting('bloom'), (v) => this.api.setSetting('bloom', v), (v) => v.toFixed(2)),
      sliderRow('Exposure', 0.3, 3, 0.05, this.api.getSetting('exposure'), (v) => this.api.setSetting('exposure', v), (v) => v.toFixed(2)),
      sliderRow('Star brightness', 0.3, 3, 0.05, this.api.getSetting('stars'), (v) => this.api.setSetting('stars', v), (v) => v.toFixed(2)),
      sliderRow('Render scale', 0.5, 2, 0.25, this.api.getSetting('scale'), (v) => this.api.setSetting('scale', v), (v) => `${v}×`),
      h('h3', {}, 'Motion'),
      sliderRow('Flight speed', -2, 3, 0.05, Math.log10(this.api.getSetting('speed')), (v) => this.api.setSetting('speed', Math.pow(10, v)), (v) => `${Math.pow(10, v).toFixed(2)}`),
      h('h3', {}, 'Audio'),
      toggleRow('Ambient sound', this.api.getSetting('audio') > 0, (v) => this.api.setSetting('audio', v ? 1 : 0)),
    );
    this.root.append(layers, settings);
    this.pops.set('layers', layers);
    this.pops.set('settings', settings);
  }

  registerPop(name: string, el: HTMLElement) { this.root.appendChild(el); this.pops.set(name, el); }

  togglePop(name: string) {
    for (const [k, el] of this.pops) {
      if (k === name) el.classList.toggle('open');
      else el.classList.remove('open');
    }
    this.syncToolbar();
  }
  closePops() { for (const el of this.pops.values()) el.classList.remove('open'); this.syncToolbar(); }
  private syncToolbar() {
    for (const [k, btn] of this.toolBtns) if (this.pops.has(k)) btn.classList.toggle('on', !!this.pops.get(k)?.classList.contains('open'));
  }

  // ---------------------------------------------------------------- info panel
  private buildInfo() {
    this.info = h('div', { id: 'info' });
    this.infoBody = h('div');
    this.info.appendChild(this.infoBody);
    this.root.appendChild(this.info);
  }

  setSelected(sel: Selectable | null, camPos: THREE.Vector3, time: number) {
    this.selected = sel;
    this.statSig = '';
    if (!sel) { this.info.classList.remove('open'); return; }
    this.info.classList.add('open');
    const body = this.infoBody;
    body.innerHTML = '';
    const actions = h('div', { class: 'actions' },
      h('button', { class: 'btn primary', title: 'Fly there  (G)', onclick: () => this.api.gotoSelected() }, 'Go to'),
      h('button', { class: 'btn', title: 'Orbit at the current distance  (C)', onclick: () => this.api.orbitSelected() }, 'Orbit'));
    body.append(
      h('div', { class: 'ih' }, h('h2', {}, sel.name), h('button', { class: 'close', title: 'Close  (Esc)', onclick: () => this.api.select(null) }, '×')),
      h('div', { class: 'isub' }, sel.subtitle),
      actions,
    );
    if (sel.procedural) body.appendChild(h('span', { class: 'badge' }, 'Procedurally generated'));
    this.extraInfoActions?.(sel, actions);
    const stats = h('div', { id: 'stats' });
    body.appendChild(stats);
    this.fillStats(camPos, time);
    if (sel.description) body.appendChild(h('p', { class: 'desc' }, sel.description));
    if (sel.facts?.length) body.appendChild(h('ul', {}, ...sel.facts.map((f) => h('li', {}, f))));
    this.info.scrollTop = 0;
  }

  private fillStats(camPos: THREE.Vector3, time: number) {
    if (!this.selected) return;
    const host = this.infoBody.querySelector('#stats') as HTMLElement | null;
    if (!host) return;
    const rows: StatRow[] = this.selected.stats(camPos, time);
    const sig = rows.map((r) => r.label).join('|');
    if (sig !== this.statSig) {
      this.statSig = sig;
      this.valueEls.clear();
      host.innerHTML = '';
      const groups = new Map<string, StatRow[]>();
      for (const r of rows) {
        const g = SECTION[r.label] ?? 'Physical';
        if (!groups.has(g)) groups.set(g, []);
        groups.get(g)!.push(r);
      }
      for (const g of SECTION_ORDER) {
        const list = groups.get(g);
        if (!list) continue;
        const sec = h('section', {}, h('h4', {}, g));
        for (const r of list) {
          const v = h('span', { class: 'v' }, r.value);
          this.valueEls.set(r.label, v);
          sec.appendChild(h('div', { class: 'r' }, h('span', { class: 'l' }, r.label), v));
        }
        host.appendChild(sec);
      }
    } else {
      for (const r of rows) {
        const el = this.valueEls.get(r.label);
        if (el && el.textContent !== r.value) el.textContent = r.value;
      }
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
      return h('div', { class: 'cell' }, h('span', { class: 'k' }, label), v);
    };
    this.root.appendChild(h('div', { id: 'status' }, mk('frame', 'Location'), mk('target', 'Target'), mk('dist', 'Distance'), mk('speed', 'Speed'), mk('fov', 'FOV'), mk('fps', 'FPS'), this.hint));
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
    this.toolBtns.get('orbits')?.classList.toggle('on', this.api.getLayer('orbits'));
    const p = this.api.paused();
    if (p !== this.wasPaused) { this.pauseBtn.innerHTML = icon(p ? 'play' : 'pause'); this.wasPaused = p; }
  }

  // ---------------------------------------------------------------- toasts / help
  toast(msg: string, ms = 2600) {
    const t = h('div', { class: 'toast' }, msg);
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
        h('div', { class: 'lead' }, 'You are a free-floating observer. Speed automatically scales with how close you are to the nearest object.'),
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
