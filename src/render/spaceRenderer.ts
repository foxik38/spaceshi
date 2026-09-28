import * as THREE from 'three';
import { AU, SOLAR_CONSTANT } from '../core/constants';
import { blackbodyRGB, clamp } from '../core/math';
import type { Body } from '../sim/body';
import type { Universe } from '../sim/universe';
import type { StarCatalog } from '../data/starCatalog';
import { angularRadius, isInFrustum, type FrameContext } from './context';
import { Belt, createBelts } from './belts';
import { CosmicWeb, MilkyWay } from './galaxy';
import { DeepSky } from './deepSky';
import { BlackHoleItem } from './blackHole';
import type { DsoCatalog } from '../data/dsoCatalog';
import { Constellations, EclipticGrid, type ConstellationData } from './overlays';
import { OrbitLines } from './orbitLines';
import { PointLayer } from './pointLayer';
import { PostProcessor } from './postprocess';
import { fluxAt, SphereBody, StarBody, type LightInfo } from './sphereBody';
import { StarField, type StarLike } from './starfield';

export interface RenderSettings {
  bloom: number;
  exposure: number;
  starBrightness: number;
  renderScale: number;
  showStars: boolean;
}

export const defaultSettings: RenderSettings = { bloom: 0.9, exposure: 1, starBrightness: 1, renderScale: 1, showStars: true };

interface DrawItem {
  scene: THREE.Scene;
  bh?: BlackHoleItem;
  dist: number;
  sortKey: number;
}

export class SpaceRenderer {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  post: PostProcessor;
  settings: RenderSettings = { ...defaultSettings };
  ctx!: FrameContext;
  starField?: StarField;
  exoField?: StarField;
  private hideExo: number[] = [];
  points = new PointLayer();
  /** Extra layers drawn behind (bg) and in front of (fg) the resolved bodies. */
  bgLayers: THREE.Scene[] = [];
  fgLayers: THREE.Scene[] = [];
  /** Called once per frame after the frame context is prepared and before anything is drawn. */
  frameHooks: ((ctx: FrameContext) => void)[] = [];
  orbitLines = new OrbitLines();
  belts: Belt[] = [];
  beltScene = new THREE.Scene();
  constellations?: Constellations;
  milkyWay?: MilkyWay;
  cosmicWeb?: CosmicWeb;
  deepSky?: DeepSky;
  showGalaxies = true;
  grid = new EclipticGrid();
  showBelts = true;
  showOrbits = true;
  selectedBody: Body | null = null;
  hoveredBody: Body | null = null;
  private orbitVersion = -1;
  private spheres = new Map<Body, SphereBody>();
  private stars = new Map<Body, StarBody>();
  private holes = new Map<Body, BlackHoleItem>();
  private resVec = new THREE.Vector2();
  private items: DrawItem[] = [];
  private lights: Body[] = [];
  /** Bodies that were drawn as resolved discs this frame (screen radius in px). */
  resolved: Body[] = [];
  dotProviders: ((ctx: FrameContext, layer: PointLayer) => void)[] = [];
  private hideStars: number[] = [];
  private dots: { b: Body; dir: THREE.Vector3; dist: number; color: [number, number, number]; I: number; size: number }[] = [];
  private occluders: { dir: THREE.Vector3; ang: number; dist: number }[] = [];
  private exposureSmooth = 1;
  localFlux = 1;
  glare = 1;
  width = 1;
  height = 1;
  private pixelRatio = 1;
  frameCount = 0;
  frameDt = 1 / 60;
  /** Multiplier applied to the render scale by the adaptive-resolution controller (0.5 – 1). */
  autoFactor = 1;

  constructor(private canvas: HTMLCanvasElement, private universe: Universe) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, depth: true, preserveDrawingBuffer: false });
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.camera = new THREE.PerspectiveCamera(60, 1, 1e-2, 1e30);
    this.post = new PostProcessor(this.renderer);
    this.ctx = {
      camPos: new THREE.Vector3(), camQuat: new THREE.Quaternion(), camQuatInv: new THREE.Quaternion(), width: 1, height: 1, fov: 1, tanHalfY: 1, tanHalfX: 1,
      aspect: 1, time: 0, realTime: 0, exposure: 1, proj: this.camera.projectionMatrix, pixelAngle: 0.001,
    };
  }

  setStarCatalog(cat: StarCatalog) {
    this.starField = new StarField(cat);
  }

  setExoCatalog(cat: StarLike) { this.exoField = new StarField(cat); }
  hideExoStars(indices: number[]) { this.hideExo = indices; }

  initGalaxies(dso?: DsoCatalog) {
    this.milkyWay = new MilkyWay(230000);
    this.cosmicWeb = new CosmicWeb(60000);
    if (dso) this.deepSky = new DeepSky(dso);
  }

  setConstellations(data: ConstellationData[]) {
    this.constellations = new Constellations(data);
  }

  initBelts() {
    const sun = this.universe.get('sun'), earth = this.universe.get('earth'), jupiter = this.universe.get('jupiter');
    if (!sun || !earth || !jupiter) return;
    this.belts = createBelts(sun, earth, jupiter);
    for (const b of this.belts) this.beltScene.add(b.points);
  }

  resize(w: number, h: number, dpr: number) {
    this.width = w; this.height = h;
    this.pixelRatio = Math.min(dpr, 2) * this.settings.renderScale * this.autoFactor;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(w, h, false);
    const bw = Math.max(2, Math.floor(w * this.pixelRatio)), bh = Math.max(2, Math.floor(h * this.pixelRatio));
    this.post.resize(bw, bh);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  applySettings() {
    this.post.bloomStrength = this.settings.bloom;
    this.resize(this.width, this.height, window.devicePixelRatio || 1);
  }

  /** Called once per frame before rendering with the camera state. */
  beginFrame(camPos: THREE.Vector3, camQuat: THREE.Quaternion, fovDeg: number, realTime: number) {
    const c = this.ctx;
    c.camPos.copy(camPos);
    c.camQuat.copy(camQuat);
    c.camQuatInv.copy(camQuat).invert();
    this.camera.fov = fovDeg;
    this.camera.aspect = this.width / this.height;
    this.camera.updateProjectionMatrix();
    this.camera.quaternion.copy(camQuat);
    this.camera.position.set(0, 0, 0);
    this.camera.updateMatrixWorld(true);
    c.width = this.width; c.height = this.height;
    c.fov = (fovDeg * Math.PI) / 180;
    c.tanHalfY = Math.tan(c.fov / 2);
    c.aspect = this.width / this.height;
    c.tanHalfX = c.tanHalfY * c.aspect;
    c.time = this.universe.clock.t;
    c.realTime = realTime;
    c.pixelAngle = (2 * c.tanHalfY) / this.height;
    c.proj = this.camera.projectionMatrix;

    // local illumination -> exposure & star glare
    this.lights.length = 0;
    let f = 0;
    for (const b of this.universe.bodies) {
      if (b.isLuminous && b.luminosity > 0) {
        this.lights.push(b);
        const d = Math.max(b.pos.distanceTo(camPos), b.radius);
        f += fluxAt(b, d);
      }
    }
    this.localFlux = f;
    let target = f > 1e-10 ? Math.pow(f, -0.88) : 1e5;
    target = clamp(target, 0.03, 4e4) * this.settings.exposure;
    if (this.exposureSmooth < 0) this.exposureSmooth = target;
    else this.exposureSmooth += (target - this.exposureSmooth) * (1 - Math.exp(-this.frameDt / 0.45));
    c.exposure = this.exposureSmooth;
    this.glare = clamp(Math.sqrt(this.exposureSmooth / this.settings.exposure), 0.04, 1);
  }

  private lightsFor(b: Body): LightInfo[] {
    const out: LightInfo[] = [];
    for (const s of this.lights) {
      if (s === b) continue;
      const d = s.pos.distanceTo(b.pos);
      const flux = fluxAt(s, d);
      const T = s.temperature || 5772;
      out.push({ star: s, dir: s.pos.clone().sub(b.pos).multiplyScalar(1 / d), dist: d, flux, color: blackbodyRGB(T) });
    }
    out.sort((a, b2) => b2.flux - a.flux);
    return out.slice(0, 4);
  }

  private occludersFor(b: Body, light: LightInfo | undefined): { pos: THREE.Vector3; radius: number }[] {
    if (!light) return [];
    const cands: Body[] = [];
    if (b.parent) { cands.push(b.parent); for (const s of b.parent.children) if (s !== b) cands.push(s); if (b.parent.parent) cands.push(b.parent.parent); }
    for (const c of b.children) cands.push(c);
    const res: { pos: THREE.Vector3; radius: number; score: number }[] = [];
    const L = light.dir;
    for (const o of cands) {
      if (o.kind === 'star' || o.radius < 5e4) continue;
      const rel = o.pos.clone().sub(b.pos);
      const t = rel.dot(L);
      if (t <= 0) {
        // occluder behind the light direction? only sunward matters for eclipses of b
        if (o !== b.parent && !b.children.includes(o)) continue;
      }
      const perp = rel.sub(L.clone().multiplyScalar(t)).length();
      const reach = o.radius + b.radius * 1.2 + Math.abs(t) * (light.star.radius / light.dist);
      if (t > 0 && perp < reach) res.push({ pos: o.pos, radius: o.radius, score: o.radius / (perp + 1) });
      else if (t < 0 && perp < b.radius * 1.2 + o.radius) res.push({ pos: o.pos, radius: o.radius, score: 0 });
    }
    res.sort((a, c) => c.score - a.score);
    return res.slice(0, 4);
  }

  /** Classify bodies, update their draw objects and build the far→near draw list. */
  private prepare() {
    const ctx = this.ctx;
    this.items.length = 0;
    this.resolved.length = 0;
    this.dots.length = 0;
    this.occluders.length = 0;
    this.points.begin();
    const tmp = new THREE.Vector3();
    for (const b of this.universe.bodies) {
      if (b.hidden) continue;
      tmp.copy(b.pos).sub(ctx.camPos);
      const dist = tmp.length();
      b.distanceToCamera = dist;
      const ang = angularRadius(b.radius, dist);
      let rpx = ang / ctx.pixelAngle;
      // rings and atmospheres make the visible extent larger than the solid body
      let extent = b.radius;
      if (b.atmosphere) extent = Math.max(extent, b.radius + b.atmosphere.height);
      const ring = b.look.rings?.[0];
      if (ring) extent = Math.max(extent, ring.outer);
      const angExt = angularRadius(extent, dist);
      const rpxExt = angExt / ctx.pixelAngle;
      b.screenRadiusPx = rpx;
      const view = tmp.clone().applyQuaternion(ctx.camQuatInv);
      if (!isInFrustum(ctx, view, angExt)) continue;
      const star = b.isStellar || b.kind === 'black_hole';
      if (b.kind === 'black_hole') {
        // the lensing region is much larger than the horizon
        let hole = this.holes.get(b);
        if (!hole) { hole = new BlackHoleItem(b); this.holes.set(b, hole); }
        const infl = hole.influence;
        const angInfl = angularRadius(infl, dist);
        if (angInfl / ctx.pixelAngle >= 2.5 && isInFrustum(ctx, view, angInfl)) {
          this.resolved.push(b);
          this.items.push({ scene: hole.scene, bh: hole, dist, sortKey: dist });
          this.occluders.push({ dir: tmp.clone().multiplyScalar(1 / dist), ang: Math.asin(Math.min(1, b.radius * 2.6 / dist)), dist });
        } else this.pushDot(b, tmp, dist, 1);
        continue;
      }
      if (rpxExt >= 2.0) {
        this.resolved.push(b);
        let scene: THREE.Scene;
        if (b.isLuminous && b.kind !== 'brown_dwarf') {
          let sb = this.stars.get(b);
          if (!sb) { sb = new StarBody(b); this.stars.set(b, sb); }
          sb.update(ctx);
          scene = sb.scene;
        } else {
          let sp = this.spheres.get(b);
          if (!sp) { sp = new SphereBody(b); this.spheres.set(b, sp); }
          const lights = this.lightsFor(b);
          const occ = this.occludersFor(b, lights[0]);
          sp.update(ctx, lights, occ, dist);
          scene = sp.scene;
        }
        this.items.push({ scene, dist, sortKey: dist });
        this.occluders.push({ dir: tmp.clone().multiplyScalar(1 / dist), ang: angExt * 0.98, dist });
        // luminous bodies also keep their point glow until fully resolved
        if (star && rpx < 6) this.pushDot(b, tmp, dist, 0.4);
      } else {
        this.pushDot(b, tmp, dist, 1);
      }
    }
    this.items.sort((a, b) => b.sortKey - a.sortKey);
    for (const d of this.dots) {
      let hidden = false;
      for (const o of this.occluders) {
        if (o.dist < d.dist && Math.acos(clamp(o.dir.dot(d.dir), -1, 1)) < o.ang) { hidden = true; break; }
      }
      if (!hidden) this.points.push(d.dir, d.color[0], d.color[1], d.color[2], d.I, d.size);
    }
    for (const fn of this.dotProviders) fn(this.ctx, this.points);
    this.points.end(this.pixelRatio);
  }

  /** Emit a soft dot for an unresolved body using its apparent magnitude. */
  private pushDot(b: Body, rel: THREE.Vector3, dist: number, fade: number) {
    const dir = rel.clone().multiplyScalar(1 / dist);
    let m: number;
    let color: [number, number, number] = [0.9, 0.9, 1.0];
    if (b.kind === 'black_hole') {
      // unresolved black holes show up as a faint hot-gas glint
      m = 6.5 - 0.6 * Math.log10(Math.max(b.mass / 1.989e30, 1));
      color = [1, 0.7, 0.45];
    } else if (b.isLuminous && b.luminosity > 0) {
      m = -26.74 - 2.5 * Math.log10((b.luminosity / 3.828e26) * Math.pow(AU / dist, 2));
      color = blackbodyRGB(b.temperature || 5772);
    } else {
      // reflected light: sum over lights
      let fl = 0;
      for (const s of this.lights) {
        if (s === b) continue;
        const dS = s.pos.distanceTo(b.pos);
        fl += fluxAt(s, dS);
      }
      const p = Math.min(1, b.albedo * 1.4);
      const sunDir = this.lights[0] ? this.lights[0].pos.clone().sub(b.pos).normalize() : new THREE.Vector3(1, 0, 0);
      const cosPhase = clamp(-dir.dot(sunDir), -1, 1); // angle between sun and observer as seen from the body
      const alpha = Math.acos(clamp(dir.clone().negate().dot(sunDir), -1, 1));
      void cosPhase;
      const phase = (Math.sin(alpha) + (Math.PI - alpha) * Math.cos(alpha)) / Math.PI;
      const flux = fl * p * Math.pow(b.radius / dist, 2) * Math.max(phase, 0.001) * 0.66;
      m = -26.74 - 2.5 * Math.log10(Math.max(flux, 1e-30));
      const cc = blackbodyRGB(this.lights[0]?.temperature || 5772);
      const tint = b.look.palette[0] ? new THREE.Color(b.look.palette[0]) : null;
      color = tint ? [0.5 * cc[0] + 0.5 * tint.r * 1.6, 0.5 * cc[1] + 0.5 * tint.g * 1.6, 0.5 * cc[2] + 0.5 * tint.b * 1.6] : cc;
    }
    let I = Math.pow(10, -0.4 * (m - 7.2)) * this.settings.starBrightness * this.glare * fade;
    if (I < 0.01) return;
    I = Math.min(I, 300);
    const size = Math.min(1.5 + 0.9 * Math.log2(1 + I) * 0.5, 18);
    this.dots.push({ b, dir, dist, color, I: 0.55 * Math.sqrt(I), size });
  }

  /** The actual frame render, invoked by the composer's first pass. */
  renderScene(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    this.frameCount++;
    this.prepare();
    for (const fn of this.frameHooks) fn(this.ctx);
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 1);
    renderer.autoClear = false;
    renderer.clear(true, true, false);
    if (this.starField && this.settings.showStars) {
      this.starField.update(this.ctx, { brightness: this.settings.starBrightness, glare: this.glare, pixelRatio: this.pixelRatio, hide: this.hideStars });
      renderer.render(this.starField.scene, this.camera);
    }
    if (this.exoField && this.settings.showStars) {
      this.exoField.update(this.ctx, { brightness: this.settings.starBrightness, glare: this.glare, pixelRatio: this.pixelRatio, hide: this.hideExo });
      renderer.render(this.exoField.scene, this.camera);
    }
    if (this.showGalaxies) {
      if (this.milkyWay) { this.milkyWay.update(this.ctx, this.pixelRatio, this.settings.starBrightness * this.glare); renderer.render(this.milkyWay.scene, this.camera); }
      if (this.cosmicWeb) { this.cosmicWeb.update(this.ctx, this.pixelRatio); renderer.render(this.cosmicWeb.scene, this.camera); }
      if (this.deepSky) { this.deepSky.update(this.ctx, this.pixelRatio, 1.1 * this.glare); renderer.render(this.deepSky.scene, this.camera); }
    }
    for (const s of this.bgLayers) renderer.render(s, this.camera);
    for (const it of this.items) {
      if (it.bh && target) {
        this.post.snapshotScene();
        renderer.setRenderTarget(target);
        this.resVec.set(target.width, target.height);
        it.bh.update(this.ctx, this.post.lensRT.texture, this.resVec);
      }
      renderer.render(it.scene, this.camera);
    }
    if (this.constellations?.enabled) { this.constellations.update(this.ctx); renderer.render(this.constellations.scene, this.camera); }
    if (this.grid.enabled) {
      const sun = this.universe.get('sun');
      if (sun) { this.grid.update(this.ctx, sun.pos); renderer.render(this.grid.scene, this.camera); }
    }
    renderer.render(this.points.scene, this.camera);
    if (this.showBelts && this.belts.length) {
      const occ = this.resolved.filter((b) => b.screenRadiusPx > 6);
      const t = this.ctx.time;
      const earth = this.universe.get('earth');
      for (const b of this.belts) {
        const near = b.opts.parent === earth && b.opts.fadeFar !== undefined;
        const vis = !near || (earth!.pos.distanceTo(this.ctx.camPos) < (b.opts.fadeFar ?? 0) + 2e7);
        b.points.visible = vis;
        if (vis) b.update(this.ctx, t, this.pixelRatio, occ);
      }
      renderer.render(this.beltScene, this.camera);
    }
    if (this.showOrbits) {
      this.orbitLines.update(this.ctx, this.universe.bodies, this.selectedBody, this.hoveredBody, this.resolved, this.ctx.time, true);
      renderer.render(this.orbitLines.scene, this.camera);
    }
    for (const s of this.fgLayers) renderer.render(s, this.camera);
  }

  hideCatalogStars(indices: number[]) { this.hideStars = indices; }

  /** Jump the auto-exposure to its target immediately (used after teleports). */
  snapExposure() { this.exposureSmooth = -1; }

  /** Debug: bypass post-processing and draw straight to the canvas. */
  debugDirect = false;

  render() {
    if (this.debugDirect) { this.renderScene(this.renderer, null); return; }
    this.renderScene(this.renderer, this.post.sceneRT);
    this.post.bloomStrength = this.settings.bloom;
    this.post.render(this.ctx.realTime);
  }
}

export { SOLAR_CONSTANT };
