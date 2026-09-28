import * as THREE from 'three';
import './style.css';
import { AU, LY, YEAR } from './core/constants';
import { formatDistance, formatSpeed } from './core/units';
import { DsoCatalog } from './data/dsoCatalog';
import { StarCatalog } from './data/starCatalog';
import { buildSolarSystem } from './data/solarSystem';
import { CameraRig } from './nav/cameraRig';
import { Input } from './nav/input';
import { bodyTarget, type NavTarget } from './nav/target';
import { SpaceRenderer } from './render/spaceRenderer';
import { baseUrl } from './render/textures';
import { RATE_STEPS, formatSimTime } from './sim/clock';
import { Universe } from './sim/universe';
import { bodySelectable, type Selectable } from './app/selectable';
import { Labeler } from './ui/labels';
import { Loading } from './ui/loading';
import { UI } from './ui/ui';
import type { AppAPI, SearchResult } from './ui/api';

export class App implements AppAPI {
  universe = new Universe();
  canvas: HTMLCanvasElement;
  renderer: SpaceRenderer;
  rig: CameraRig;
  input: Input;
  ui!: UI;
  labeler!: Labeler;
  stars?: StarCatalog;
  dso?: DsoCatalog;
  selected: Selectable | null = null;
  hasSandbox = false;
  layers: Record<string, boolean> = { labels: true, orbits: true, stars: true, constellations: false, belts: true, galaxies: true, bodies: true, grid: false };
  private rateIdx = 0;
  private rateDir: 1 | -1 = 1;
  private last = performance.now();
  private fps = 60;
  private frameNo = 0;
  private nearStarCache = 1e30;
  private nearDsoCache = 1e30;
  private hoverCand: string | null = null;
  private loading = new Loading();
  private root: HTMLElement;

  constructor(root: HTMLElement) {
    this.root = root;
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'view';
    this.canvas.tabIndex = 0;
    root.appendChild(this.canvas);
    this.loading.set(0.05, 'Building the Solar System…');
    buildSolarSystem(this.universe);
    this.renderer = new SpaceRenderer(this.canvas, this.universe);
    this.rig = new CameraRig(this.universe);
    this.rig.extraNearest = () => Math.min(this.nearStarCache, this.nearDsoCache);
    this.input = new Input(this.canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  }

  async start() {
    this.loading.set(0.15, 'Loading 109,000 stars…');
    try {
      this.stars = await StarCatalog.load(baseUrl);
      this.renderer.setStarCatalog(this.stars);
    } catch (e) { console.warn('star catalog failed to load', e); }
    this.loading.set(0.6, 'Loading galaxies, clusters and nebulae…');
    try { this.dso = await DsoCatalog.load(baseUrl); } catch (e) { console.warn('deep-sky catalog failed to load', e); }
    this.loading.set(0.85, 'Building interface…');
    this.ui = new UI(this.root, this);
    this.labeler = new Labeler(this.root, this.universe, this.stars, this.dso, () => this.universe.clock.t / YEAR);
    // labels must sit under the UI but above the canvas
    this.root.insertBefore(this.labeler.container, this.ui.root);
    this.wireInput();

    const earth = this.universe.get('earth')!;
    this.universe.update(this.universe.clock.t);
    this.view('earth', 3.6, 55, 12);
    this.select(bodySelectable(earth));
    this.loading.set(1, 'Ready');
    this.loading.done();
    requestAnimationFrame(this.frame);
  }

  // ------------------------------------------------------------------ input wiring
  private wireInput() {
    this.input.onClick = (x, y, button, dbl) => {
      if (button !== 0) return;
      let c = this.labeler.pick(x, y);
      if (!c) c = this.labeler.pickStar(this.renderer.ctx, x, y);
      if (c) {
        this.select(c.make());
        if (dbl) this.gotoSelected();
      } else if (!dbl) this.select(null);
    };
    this.input.onHover = (x, y) => {
      const c = this.labeler.pick(x, y, 14);
      this.labeler.hoveredId = c?.id ?? '';
      this.canvas.style.cursor = c ? 'pointer' : '';
      this.hoverCand = c?.id ?? null;
    };
    this.input.onKey = (k, e) => {
      if (this.ui.helpOpen && k !== 'h' && k !== 'Escape') return;
      switch (k) {
        case '/': e.preventDefault(); this.ui.focusSearch(); break;
        case 'g': this.gotoSelected(); break;
        case 'c': this.orbitSelected(); break;
        case 'Backspace': this.previousTarget(); break;
        case 'Home': this.goHome(); break;
        case 'Escape':
          if (this.ui.helpOpen) this.ui.toggleHelp();
          else if (this.rig.mode === 'travel') this.rig.breakToFree();
          else { this.select(null); this.ui.closePops(); }
          break;
        case ' ': this.togglePause(); break;
        case ',': this.stepRate(-1); break;
        case '.': this.stepRate(1); break;
        case 'b': this.reverseTime(); break;
        case 't': this.timeNow(); break;
        case 'l': this.setLayer('labels', !this.layers.labels); break;
        case 'o': this.setLayer('orbits', !this.layers.orbits); break;
        case 'u': document.body.classList.toggle('ui-hidden'); break;
        case 'p': this.photoMode(); break;
        case 'h': this.ui.toggleHelp(); break;
      }
    };
  }

  // ------------------------------------------------------------------ AppAPI
  search(q: string): SearchResult[] {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const cam = this.rig.pos;
    const out: SearchResult[] = [];
    const scored: { r: SearchResult; sc: number }[] = [];
    for (const b of this.universe.bodies) {
      const names = [b.name, ...b.aliases, b.id];
      let sc = -1;
      for (const n of names) {
        const l = n.toLowerCase();
        if (l === s) sc = Math.max(sc, 100);
        else if (l.startsWith(s)) sc = Math.max(sc, 80);
        else if (l.includes(s)) sc = Math.max(sc, 50);
      }
      if (sc < 0) continue;
      sc += b.kind === 'star' || b.kind === 'planet' || b.kind === 'gas_giant' || b.kind === 'ice_giant' ? 10 : b.kind === 'moon' ? 3 : 0;
      scored.push({ sc, r: { key: b.id, name: b.name, type: b.typeLabel, kind: b.kind, distance: formatDistance(b.pos.distanceTo(cam)), make: () => bodySelectable(b) } });
    }
    scored.sort((a, b) => b.sc - a.sc);
    out.push(...scored.slice(0, 7).map((x) => x.r));
    if (this.stars) {
      for (const m of this.stars.search(s, 5)) {
        out.push({
          key: `star:${m.index}`, name: m.name, type: `Star · ${m.spect || '?'}`, kind: 'star', distance: `${m.distLy.toFixed(m.distLy < 100 ? 1 : 0)} ly`,
          make: () => this.labelerSelectable(`star:${m.index}`),
        });
      }
    }
    if (this.dso) {
      for (const o of this.dso.search(s, 5)) {
        out.push({ key: `dso:${o.index}`, name: this.dso.displayName(o), type: o.label, kind: o.type === 'G' ? 'galaxy' : 'nebula', distance: formatDistance(o.distLy * LY), make: () => this.labelerSelectable(`dso:${o.index}`) });
      }
    }
    return out;
  }

  private labelerSelectable(id: string): Selectable {
    // reuse the factories that live in the labeler's candidate builders
    return this.makeSelectable(id)!;
  }

  makeSelectable(id: string): Selectable | null {
    if (id.startsWith('star:') && this.stars) {
      return this.starSel(Number(id.slice(5)));
    }
    if (id.startsWith('dso:') && this.dso) return this.dsoSel(Number(id.slice(4)));
    const b = this.universe.get(id);
    return b ? bodySelectable(b) : null;
  }

  private starSel(i: number): Selectable {
    return starSelectableFactory(this.stars!, i, () => this.universe.clock.t / YEAR);
  }
  private dsoSel(i: number): Selectable {
    return dsoSelectableFactory(this.dso!, this.dso!.objects[i]);
  }

  select(s: Selectable | null) {
    this.selected = s;
    this.labeler.selectedId = s?.id ?? '';
    this.ui.setSelected(s, this.rig.pos, this.universe.clock.t);
  }

  gotoSelected() {
    if (!this.selected) { this.ui.toast('Select something first — click an object or press / to search'); return; }
    this.rig.travelTo(this.selected as NavTarget);
    this.ui.toast(`Travelling to ${this.selected.name}`);
  }

  orbitSelected() {
    if (!this.selected) return;
    this.rig.orbit(this.selected as NavTarget);
  }

  private previousTarget() {
    const t = this.rig.history.pop();
    if (t) {
      const sel = this.makeSelectable(t.id);
      if (sel) { this.select(sel); this.rig.travelTo(sel as NavTarget); }
    }
  }

  goHome() {
    const sun = this.universe.get('sun')!;
    const t: NavTarget = { id: 'solar-system', name: 'Solar System', kind: 'star', radius: 14 * AU, body: sun, getPos: (o) => o.copy(sun.pos), standoff: 3.4 };
    this.rig.travelTo(t);
    this.select(bodySelectable(sun));
  }

  stepRate(dir: 1 | -1) {
    const clock = this.universe.clock;
    if (clock.paused) { clock.paused = false; }
    else this.rateIdx = Math.max(0, Math.min(RATE_STEPS.length - 1, this.rateIdx + dir));
    clock.rate = this.rateDir * RATE_STEPS[this.rateIdx].value;
  }
  togglePause() { this.universe.clock.paused = !this.universe.clock.paused; }
  reverseTime() { this.rateDir = this.rateDir === 1 ? -1 : 1; this.universe.clock.rate = this.rateDir * RATE_STEPS[this.rateIdx].value; this.universe.clock.paused = false; }
  timeNow() { this.universe.clock.setNow(); this.rateIdx = 0; this.rateDir = 1; this.universe.clock.paused = false; this.ui.toast('Time reset to now'); }
  rateLabel() { return this.universe.clock.paused ? 'paused' : `${this.rateDir < 0 ? '◂ ' : ''}${RATE_STEPS[this.rateIdx].label}`; }
  dateLabel() { return formatSimTime(this.universe.clock.t); }
  paused() { return this.universe.clock.paused; }

  setLayer(key: string, on: boolean) {
    this.layers[key] = on;
    if (key === 'labels') this.labeler.enabled = on;
    if (key === 'stars') this.renderer.settings.showStars = on;
    if (key === 'bodies') this.labeler.showBodies = on;
    if (key === 'galaxies') this.labeler.showDeepSky = on;
  }
  getLayer(key: string) { return this.layers[key]; }

  setSetting(key: string, v: number) {
    const s = this.renderer.settings;
    switch (key) {
      case 'fov': this.rig.fovBase = v; break;
      case 'bloom': s.bloom = v; break;
      case 'exposure': s.exposure = v; break;
      case 'stars': s.starBrightness = v; break;
      case 'scale': s.renderScale = v; this.renderer.applySettings(); break;
      case 'speed': this.rig.speedFactor = v; break;
    }
  }
  getSetting(key: string) {
    const s = this.renderer.settings;
    switch (key) {
      case 'fov': return this.rig.fovBase;
      case 'bloom': return s.bloom;
      case 'exposure': return s.exposure;
      case 'stars': return s.starBrightness;
      case 'scale': return s.renderScale;
      case 'speed': return this.rig.speedFactor;
    }
    return 0;
  }

  photoMode() {
    document.body.classList.toggle('ui-hidden');
    if (document.body.classList.contains('ui-hidden')) {
      setTimeout(() => this.saveScreenshot(), 250);
    }
  }

  saveScreenshot() {
    this.renderer.render();
    this.canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `spaceshi-${Date.now()}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      this.ui.toast('Screenshot saved — press P again to bring the interface back');
    });
  }

  // ------------------------------------------------------------------ dev helper
  /** Dev helper: place the camera at `distR` radii from a body, `phaseDeg` away from the sunward direction. */
  view(id: string, distR = 4, phaseDeg = 60, elevDeg = 10, extra = 0) {
    const b = this.universe.get(id);
    if (!b) return false;
    this.universe.update(this.universe.clock.t);
    const sun = this.universe.get('sun')!;
    const toSun = sun.pos.clone().sub(b.pos).normalize();
    const up = new THREE.Vector3(0, 0, 1);
    const side = up.clone().cross(toSun).normalize();
    const ph = (phaseDeg * Math.PI) / 180, el = (elevDeg * Math.PI) / 180;
    const dir = toSun.clone().multiplyScalar(Math.cos(ph)).addScaledVector(side, Math.sin(ph)).multiplyScalar(Math.cos(el)).addScaledVector(up, Math.sin(el)).normalize();
    const d = b.radius * distR + extra;
    this.rig.teleport(b.pos.clone().addScaledVector(dir, d));
    this.rig.lookAtPoint(b.pos);
    this.rig.orbit(bodyTarget(b));
    this.renderer.snapExposure();
    return true;
  }

  // ------------------------------------------------------------------ frame loop
  private updateProximity() {
    if (this.frameNo % 4 !== 0) return;
    if (this.stars) {
      const cat = this.stars, p = this.rig.pos;
      const cx = p.x / LY, cy = p.y / LY, cz = p.z / LY;
      let best = Infinity;
      for (let i = 0; i < cat.nNear; i++) {
        const dx = cat.pos[i * 3] - cx, dy = cat.pos[i * 3 + 1] - cy, dz = cat.pos[i * 3 + 2] - cz;
        const d = dx * dx + dy * dy + dz * dz;
        if (d < best) best = d;
      }
      this.nearStarCache = Math.max(Math.sqrt(best) * LY - 7e8, 1e6);
    }
    if (this.dso && this.frameNo % 16 === 0) {
      const p = this.rig.pos;
      let best = Infinity;
      for (const o of this.dso.objects) {
        const d = Math.hypot(o.x * LY - p.x, o.y * LY - p.y, o.z * LY - p.z) - o.sizeLy * LY * 0.25;
        if (d < best) best = d;
      }
      this.nearDsoCache = Math.max(best, 1e6);
    }
  }

  private frame = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.frameNo++;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    const clock = this.universe.clock;
    if (!clock.paused) clock.t += dt * clock.rate;
    this.universe.update(clock.t);
    this.updateProximity();
    this.rig.update(dt, this.input, this.ui.searchFocused || this.ui.helpOpen);
    this.renderer.frameDt = dt;
    this.renderer.beginFrame(this.rig.pos, this.rig.quat, this.rig.fov, now / 1000);
    this.renderer.render();
    // overlays
    const resolvedIds = new Set(this.renderer.resolved.map((b) => b.id));
    this.labeler.update(this.renderer.ctx, resolvedIds, this.rig.zoom);
    this.ui.updateTime();
    this.ui.refreshStats(this.rig.pos, clock.t, now / 1000);
    this.updateStatus();
    requestAnimationFrame(this.frame);
  };

  private updateStatus() {
    if (this.frameNo % 6 !== 0) return;
    const fb = this.rig.frameBody;
    const chain: string[] = [];
    for (let b = fb; b; b = b.parent) chain.unshift(b.name);
    const rig = this.rig;
    let dist = rig.proximity.altitude;
    let tname = '—';
    if (this.selected) {
      const p = this.selected.getPos(new THREE.Vector3());
      dist = Math.max(p.distanceTo(rig.pos) - this.selected.radius, 0);
      tname = this.selected.name;
    }
    this.ui.updateStatus({
      frame: chain.length ? chain.join(' › ') : 'Interstellar space',
      target: tname,
      dist: formatDistance(dist),
      speed: rig.mode === 'orbit' ? 'orbiting' : formatSpeed(rig.speed),
      fov: `${rig.fov.toFixed(0)}°`,
      fps: this.fps.toFixed(0),
    });
  }
}

import { dsoSelectable as dsoSelectableFactory, starSelectable as starSelectableFactory } from './app/selectable';
