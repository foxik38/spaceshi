import * as THREE from 'three';
import './style.css';
import { AU } from './core/constants';
import { StarCatalog } from './data/starCatalog';
import { buildSolarSystem } from './data/solarSystem';
import { CameraRig } from './nav/cameraRig';
import { Input } from './nav/input';
import { bodyTarget } from './nav/target';
import { SpaceRenderer } from './render/spaceRenderer';
import { baseUrl } from './render/textures';
import { Universe } from './sim/universe';

export class App {
  universe = new Universe();
  canvas: HTMLCanvasElement;
  renderer: SpaceRenderer;
  rig: CameraRig;
  input: Input;
  catalog?: StarCatalog;
  private last = performance.now();
  private fps = 60;

  constructor(root: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.id = 'view';
    this.canvas.tabIndex = 0;
    root.appendChild(this.canvas);
    buildSolarSystem(this.universe);
    this.renderer = new SpaceRenderer(this.canvas, this.universe);
    this.rig = new CameraRig(this.universe);
    this.input = new Input(this.canvas);
    window.addEventListener('resize', () => this.resize());
    this.resize();
  }

  resize() {
    this.renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
  }

  async start() {
    try {
      this.catalog = await StarCatalog.load(baseUrl);
      this.renderer.setStarCatalog(this.catalog);
    } catch (e) {
      console.warn('star catalog failed to load', e);
    }
    const earth = this.universe.get('earth')!;
    this.universe.update(this.universe.clock.t);
    const sun = this.universe.get('sun')!;
    const toSun = sun.pos.clone().sub(earth.pos).normalize();
    const start = earth.pos.clone().addScaledVector(toSun, 2.6e7).add(new THREE.Vector3(0, 0, 1.0e7));
    this.rig.teleport(start);
    this.rig.lookAtPoint(earth.pos);
    this.rig.orbit(bodyTarget(earth));
    requestAnimationFrame(this.frame);
  }

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
    return true;
  }

  private frame = (now: number) => {
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;
    const clock = this.universe.clock;
    if (!clock.paused) clock.t += dt * clock.rate;
    this.universe.update(clock.t);
    this.rig.update(dt, this.input, false);
    this.renderer.beginFrame(this.rig.pos, this.rig.quat, this.rig.fov, now / 1000);
    this.renderer.render();
    requestAnimationFrame(this.frame);
  };
}

export { AU };
