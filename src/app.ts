import * as THREE from 'three';
import './style.css';
import { AU, LY, YEAR } from './core/constants';
import { formatDistance, formatSpeed } from './core/units';
import { DsoCatalog } from './data/dsoCatalog';
import { ExoCatalog } from './data/exoCatalog';
import { SystemManager } from './sim/systems';
import { StarCatalog } from './data/starCatalog';
import { buildSolarSystem } from './data/solarSystem';
import { CameraRig } from './nav/cameraRig';
import { Input } from './nav/input';
import { bodyTarget, type NavTarget } from './nav/target';
import { SpaceRenderer } from './render/spaceRenderer';
import { CometTails } from './render/cometTails';
import { Ambience } from './app/audio';
import { baseUrl } from './render/textures';
import { RATE_STEPS, formatSimTime } from './sim/clock';
import { Universe } from './sim/universe';
import { bodySelectable, exoSelectable, type Selectable } from './app/selectable';
import { Sandbox } from './app/sandbox';
import { SandboxPanel } from './ui/sandboxPanel';
import { VelocityGizmo } from './ui/gizmo';
import { Labeler } from './ui/labels';
import { Loading } from './ui/loading';
import { UI } from './ui/ui';
import { h } from './ui/dom';
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
  exo?: ExoCatalog;
  systems?: SystemManager;
  selected: Selectable | null = null;
  hasSandbox = true;
  sandbox!: Sandbox;
  sandboxPanel!: SandboxPanel;
  gizmo!: VelocityGizmo;
  layers: Record<string, boolean> = { labels: true, orbits: true, moonOrbits: false, stars: true, constellations: false, belts: true, galaxies: true, bodies: true, grid: false };
  private rateIdx = 0;
  private rateDir: 1 | -1 = 1;
  private last = performance.now();
  private fps = 60;
  private ambience = new Ambience();
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
    this.loading.set(0.45, 'Loading exoplanet systems…');
    try { this.exo = await ExoCatalog.load(baseUrl); } catch (e) { console.warn('exoplanet catalog failed to load', e); }
    this.loading.set(0.6, 'Loading galaxies, clusters and nebulae…');
    try { this.dso = await DsoCatalog.load(baseUrl); } catch (e) { console.warn('deep-sky catalog failed to load', e); }
    try {
      const con = await fetch(`${baseUrl}data/constellations.json`).then((r) => r.json());
      this.renderer.setConstellations(con);
    } catch (e) { console.warn('constellations failed to load', e); }
    this.renderer.initBelts();
    this.loading.set(0.75, 'Generating the Milky Way…');
    this.renderer.initGalaxies(this.dso);
    this.systems = new SystemManager(this.universe, this.stars, this.exo);
    if (this.exo) this.renderer.setExoCatalog(this.exo);
    this.systems.onActivate = (star) => {
      if (this.universe.physics.enabled) this.universe.physics.enable(this.universe.clock.t, [star], this.universe.bodies);
    };
    this.loading.set(0.85, 'Building interface…');
    this.ui = new UI(this.root, this);
    this.labeler = new Labeler(this.root, this.universe, this.stars, this.dso, () => this.universe.clock.t / YEAR);
    // labels must sit under the UI but above the canvas
    this.root.insertBefore(this.labeler.container, this.ui.root);
    this.wireInput();
    this.sandbox = new Sandbox({
      universe: this.universe, ctx: () => this.renderer.ctx, toast: (m) => this.ui.toast(m),
      onSelectionBody: () => {}, selectedBody: () => this.selectedBody(), reselect: (b) => this.select(bodySelectable(b)),
    });
    this.sandboxPanel = new SandboxPanel(this.ui, this.sandbox, () => this.cursorRay(), () => this.selectedBody(), (b) => this.sandbox.grab(b, this.cursorRay()));
    this.ui.selectBody = (b) => this.select(bodySelectable(b));
    this.gizmo = new VelocityGizmo(this.ui.root, this.sandbox, (p) => { const prev = this.universe.clock.paused; this.universe.clock.paused = p; return prev; });
    this.renderer.dotProviders.push((ctx, layer) => this.sandbox.effects.provide(ctx, layer));
    const tails = new CometTails();
    this.renderer.bgLayers.push(tails.scene);
    this.renderer.frameHooks.push((ctx) => tails.update(ctx, this.universe.bodies));
    this.ui.extraInfoActions = (sel, box) => {
      if (sel.source.type !== 'body') return;
      const b = sel.source.body;
      box.appendChild(h('button', { class: 'btn', title: 'Open sandbox tools for this object', onclick: () => { this.ui.togglePop('sandbox'); } }, 'Edit'));
      void b;
    };

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
      if (this.sandbox?.grabbed) { this.sandbox.release(); return; }
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
      this.renderer.hoveredBody = c && !c.id.includes(':') ? this.universe.get(c.id) ?? null : null;
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
        case 'x': {
          const b = this.selectedBody();
          if (this.sandbox.grabbed) this.sandbox.release();
          else if (b) this.sandbox.grab(b, this.cursorRay());
          break;
        }
        case 'Delete': { const b = this.selectedBody(); if (b && this.sandbox) { this.sandbox.remove(b); this.select(null); } break; }
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
    if (this.exo) {
      for (const e of this.exo.search(s, 5)) {
        out.push({ key: `exo:${e.index}`, name: e.name, type: `Exoplanet host · ${e.planets.length}`, kind: 'star', distance: `${e.distLy.toFixed(0)} ly`, make: () => exoSelectable(e) });
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
    if (id.startsWith('exo:') && this.exo) return exoSelectable(this.exo.systems[Number(id.slice(4))]);
    const b = this.universe.get(id);
    return b ? bodySelectable(b) : null;
  }

  private starSel(i: number): Selectable {
    return starSelectableFactory(this.stars!, i, () => this.universe.clock.t / YEAR);
  }
  private dsoSel(i: number): Selectable {
    return dsoSelectableFactory(this.dso!, this.dso!.objects[i]);
  }

  selectedBody(): import('./sim/body').Body | null {
    return this.selected?.source.type === 'body' ? this.selected.source.body : null;
  }

  /** World-space direction of the ray through the mouse cursor. */
  cursorRay(): THREE.Vector3 {
    const c = this.renderer.ctx;
    const nx = (this.input.mouseX / c.width) * 2 - 1, ny = 1 - (this.input.mouseY / c.height) * 2;
    return new THREE.Vector3(nx * c.tanHalfX, ny * c.tanHalfY, -1).normalize().applyQuaternion(c.camQuat);
  }

  select(s: Selectable | null) {
    this.selected = s;
    this.sandboxPanel?.setSelected(this.selectedBody());
    this.labeler.selectedId = s?.id ?? '';
    this.renderer.selectedBody = s?.source.type === 'body' ? s.source.body : null;
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
    if (key === 'orbits') this.renderer.showOrbits = on;
    if (key === 'moonOrbits') this.renderer.orbitLines.moonOrbits = on;
    if (key === 'belts') this.renderer.showBelts = on;
    if (key === 'constellations' && this.renderer.constellations) this.renderer.constellations.enabled = on;
    if (key === 'grid') this.renderer.grid.enabled = on;
    if (key === 'stars') this.renderer.settings.showStars = on;
    if (key === 'galaxies') this.renderer.showGalaxies = on;
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
      case 'audio': this.ambience.set(v > 0); break;
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
      case 'audio': return this.ambience.enabled || this.ambience.pending ? 1 : 0;
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
    let sun = this.universe.get('sun')!;
    let bd = Infinity;
    for (const o of this.universe.bodies) if (o.isLuminous && o !== b) { const d = o.pos.distanceToSquared(b.pos); if (d < bd) { bd = d; sun = o; } }
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

  /** Dev helper: teleport to a point (ly, ICRS) and look at another point (ly). */
  viewLy(p: [number, number, number], look: [number, number, number], fov = 60) {
    this.rig.teleport(new THREE.Vector3(p[0] * LY, p[1] * LY, p[2] * LY));
    this.rig.lookAtPoint(new THREE.Vector3(look[0] * LY, look[1] * LY, look[2] * LY));
    this.rig.fovBase = fov; this.rig.fov = fov;
    this.renderer.snapExposure();
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
    if (this.sandbox?.grabbed) this.sandbox.drag(this.cursorRay(), this.input.consumeWheel());
    this.rig.dragLocked = !!this.sandbox?.grabbed;
    const reached = this.universe.update(clock.t);
    if (this.universe.physics.enabled) {
      clock.t = reached;
      this.universe.physics.resolveImpacts();
      if (this.frameNo % 3 === 0) this.universe.physics.updateOsculating();
    }
    this.systems?.update(this.rig.pos, (star) => this.selected?.id === star.id || this.rig.target?.id === star.id);
    if (this.systems) { this.renderer.hideCatalogStars(this.systems.hiddenCatalogIndices()); this.renderer.hideExoStars(this.systems.hiddenExoIndices()); }
    this.updateProximity();
    this.rig.update(dt, this.input, this.ui.searchFocused || this.ui.helpOpen);
    this.renderer.frameDt = dt;
    if (this.frameNo % 4 === 0) {
      const px = this.rig.proximity;
      this.ambience.update({
        speed: this.rig.speed, kind: px.body?.kind ?? 'none', logMass: Math.log10(Math.max(px.body?.mass ?? 1, 1)),
        altitudeRatio: px.body ? px.altitude / Math.max(px.body.radius, 1) : Infinity,
      });
    }
    this.renderer.beginFrame(this.rig.pos, this.rig.quat, this.rig.fov, now / 1000);
    this.renderer.render();
    // overlays
    const resolvedIds = new Set(this.renderer.resolved.map((b) => b.id));
    this.labeler.update(this.renderer.ctx, resolvedIds, this.rig.zoom);
    this.ui.updateTime();
    if (this.sandbox) {
      this.gizmo.update(this.renderer.ctx, this.selectedBody(), this.ui.isPopOpen('sandbox') && this.universe.physics.enabled);
      if (this.frameNo % 12 === 0) this.sandboxPanel.refresh();
    }
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
