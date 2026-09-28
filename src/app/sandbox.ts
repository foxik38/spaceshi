import * as THREE from 'three';
import { C, G, YEAR } from '../core/constants';
import { formatDistance, formatMass } from '../core/units';
import { PRESET_BY_ID, createUserBody } from '../data/presets';
import type { Body } from '../sim/body';
import { ECLIPTIC_TO_ICRS } from '../sim/kepler';
import type { Universe } from '../sim/universe';
import type { FrameContext } from '../render/context';
import { Effects } from '../render/effects';
import { equilibriumTemperature } from '../sim/stellar';

export type ReleaseMode = 'circular' | 'keep' | 'stop' | 'throw';

export interface SandboxHost {
  universe: Universe;
  ctx(): FrameContext;
  toast(msg: string): void;
  onSelectionBody(b: Body | null): void;
  selectedBody(): Body | null;
  reselect(b: Body): void;
}

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1);

/** Controller for sandbox actions: live physics, creating/editing/deleting bodies, grabbing and throwing. */
export class Sandbox {
  releaseMode: ReleaseMode = 'circular';
  throwScale = 1;
  grabbed: Body | null = null;
  effects = new Effects();
  private grabDepth = 1;
  private grabRay = new THREE.Vector3();
  private samples: { t: number; p: THREE.Vector3 }[] = [];
  private prevVel = new THREE.Vector3();
  private prevParent: Body | null = null;
  /** catalogue bodies the user deleted (restored on reset) */
  private deleted: { body: Body; parent: Body | null }[] = [];
  onChange?: () => void;

  constructor(private host: SandboxHost) {
    const phys = host.universe.physics;
    phys.onCollision = (e) => {
      const r = Math.max(e.a.radius, e.b.radius);
      this.effects.burst(e.a, e.pos, r, e.energy);
      host.toast(`${e.b.name} collided with ${e.a.name} — impact energy ${e.energy.toExponential(1)} J`);
      if (host.selectedBody() === e.b) host.reselect(e.a);
      this.onChange?.();
    };
    phys.onRemove = (b) => {
      host.universe.detach(b);
      if (!b.userCreated) this.deleted.push({ body: b, parent: b.natural?.parent ?? null });
    };
  }

  get live() { return this.host.universe.physics.enabled; }

  /** Switch the star systems on: every body becomes a live gravitating object. */
  enableLive(announce = true) {
    const u = this.host.universe;
    if (u.physics.enabled) return;
    u.update(u.clock.t);
    u.physics.enable(u.clock.t, u.roots, u.bodies);
    for (const b of u.bodies) if (b.userCreated && !u.physics.has(b)) u.physics.addBody(b);
    u.physics.rebuild();
    if (announce) this.host.toast('Live N-body physics on — everything now obeys gravity');
    this.onChange?.();
  }

  freeze() {
    const u = this.host.universe;
    u.physics.freeze(u.clock.t);
    this.host.toast('Orbits frozen onto their current osculating ellipses');
    this.onChange?.();
  }

  restoreNatural() {
    const u = this.host.universe;
    u.physics.restoreNatural();
    for (const b of [...u.bodies]) if (b.userCreated) u.detach(b);
    for (const { body, parent } of this.deleted.splice(0)) u.restore(body, parent);
    u.update(u.clock.t);
    this.host.toast('Natural solar system restored');
    this.onChange?.();
  }

  // ---------------------------------------------------------------- dominant body helpers
  dominant(b: Body): Body | null { return this.host.universe.physics.dominant(b) ?? b.parent; }

  relVelocity(b: Body, out = new THREE.Vector3()): THREE.Vector3 {
    const d = this.dominant(b);
    return d ? out.copy(b.vel).sub(d.vel) : out.copy(b.vel);
  }

  // ---------------------------------------------------------------- creating bodies
  add(presetId: string, opts: { name?: string; mass?: number; around?: Body | null; distance?: number; inclinationDeg?: number; atCamera?: boolean }): Body | null {
    const preset = PRESET_BY_ID.get(presetId);
    if (!preset) return null;
    const u = this.host.universe;
    this.enableLive(false);
    const b = createUserBody(preset, { name: opts.name, mass: opts.mass });
    const ctx = this.host.ctx();
    let parent: Body | null = opts.around ?? null;
    if (opts.atCamera || !parent) {
      // place in front of the camera, co-moving with the nearest massive body
      const fwd = _a.set(0, 0, -1).applyQuaternion(ctx.camQuat);
      const dist = opts.distance ?? Math.max(b.radius * 8, 1e7);
      b.pos.copy(ctx.camPos).addScaledVector(fwd, dist);
      let best: Body | null = null, bg = 0;
      for (const o of u.physics.massive) { const g = o.mass / (o.pos.distanceToSquared(b.pos) + 1); if (g > bg) { bg = g; best = o; } }
      parent = best;
      b.vel.copy(parent ? parent.vel : new THREE.Vector3());
    } else {
      this.placeInOrbit(b, parent, opts.distance ?? parent.radius * 4, opts.inclinationDeg ?? 0);
    }
    b.setParent(parent);
    u.add(b);
    u.physics.addBody(b);
    b.massive = true;
    u.physics.rebuild();
    this.retemp(b);
    this.onChange?.();
    return b;
  }

  /** Place a body on a circular prograde orbit around `around` at distance `d` from its centre. */
  placeInOrbit(b: Body, around: Body, d: number, inclDeg = 0) {
    const stellar = !around.parent;
    const n = stellar || !around.spin ? _a.copy(Z).applyQuaternion(ECLIPTIC_TO_ICRS) : _a.copy(around.spin.pole);
    if (inclDeg) {
      const axis = _b.crossVectors(n, Math.abs(n.x) < 0.9 ? _c.set(1, 0, 0) : _c.set(0, 1, 0)).normalize();
      n.applyAxisAngle(axis, (inclDeg * Math.PI) / 180);
    }
    const e1 = _b.crossVectors(n, Math.abs(n.z) > 0.9 ? _c.set(1, 0, 0) : Z).normalize().clone();
    const e2 = new THREE.Vector3().crossVectors(n, e1).normalize();
    const phi = Math.random() * Math.PI * 2;
    const rad = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi));
    const tan = e1.clone().multiplyScalar(-Math.sin(phi)).addScaledVector(e2, Math.cos(phi));
    b.pos.copy(around.pos).addScaledVector(rad, d);
    const v = Math.sqrt((G * (around.mass + b.mass)) / d);
    b.vel.copy(around.vel).addScaledVector(tan, v);
  }

  private retemp(b: Body) {
    if (b.isLuminous || b.kind === 'black_hole' || b.kind === 'neutron_star') return;
    let star: Body | null = null, bl = 0;
    for (const o of this.host.universe.bodies) { if (o.isLuminous && o.luminosity > 0) { const f = o.luminosity / (o.pos.distanceToSquared(b.pos) + 1); if (f > bl) { bl = f; star = o; } } }
    b.temperature = star ? equilibriumTemperature(star.luminosity, Math.max(star.pos.distanceTo(b.pos), 1e8), Math.min(b.albedo, 0.9)) : 3;
  }

  // ---------------------------------------------------------------- editing
  setMass(b: Body, mass: number) {
    this.enableLive(false);
    if (!b.natural) b.natural = { parent: b.parent, elements: b.elements, elementsAt: b.elementsAt, mass: b.mass, radius: b.radius };
    const ratio = mass / b.mass;
    b.mass = mass;
    if (b.kind === 'black_hole') b.radius = (2 * G * mass) / (C * C);
    else if (b.kind === 'star' || b.kind === 'neutron_star') { /* radius handled by preset relations; keep */ }
    else if (b.kind === 'gas_giant' || b.kind === 'ice_giant') b.radius *= Math.pow(ratio, 0.06);
    else b.radius *= Math.pow(ratio, 0.27);
    if (!this.host.universe.physics.has(b)) this.host.universe.physics.addBody(b);
    this.host.universe.physics.setMassive(b, true);
    this.retemp(b);
    this.onChange?.();
  }

  setRadius(b: Body, r: number) { b.radius = r; this.onChange?.(); }

  circularize(b: Body) {
    const dom = this.dominant(b);
    if (!dom) return;
    const rel = _a.copy(b.pos).sub(dom.pos);
    const d = rel.length();
    const v = this.relVelocity(b, _b);
    // keep the current orbital plane and direction of revolution
    const h = _c.crossVectors(rel, v);
    if (h.lengthSq() < 1e-6) h.copy(Z);
    const tan = _d.crossVectors(h.normalize(), rel.clone().normalize()).normalize();
    b.vel.copy(dom.vel).addScaledVector(tan, Math.sqrt((G * (dom.mass + b.mass)) / d));
    this.onChange?.();
  }

  stop(b: Body) { const d = this.dominant(b); b.vel.copy(d ? d.vel : new THREE.Vector3()); this.onChange?.(); }
  reverse(b: Body) { const d = this.dominant(b); if (!d) return; const rv = this.relVelocity(b, _b).multiplyScalar(-1); b.vel.copy(d.vel).add(rv); this.onChange?.(); }
  scaleSpeed(b: Body, f: number) { const d = this.dominant(b); if (!d) return; const rv = this.relVelocity(b, _b).multiplyScalar(f); b.vel.copy(d.vel).add(rv); this.onChange?.(); }

  remove(b: Body) {
    const u = this.host.universe;
    if (this.grabbed === b) this.grabbed = null;
    if (u.physics.enabled && u.physics.has(b)) { u.physics.remove(b); }
    if (!b.userCreated) this.deleted.push({ body: b, parent: b.natural?.parent ?? b.parent });
    u.detach(b);
    this.host.toast(`${b.name} removed`);
    this.onChange?.();
  }

  // ---------------------------------------------------------------- grab / throw
  grab(b: Body, cursorRay: THREE.Vector3) {
    this.enableLive(false);
    const u = this.host.universe;
    if (!u.physics.has(b)) u.physics.addBody(b);
    u.physics.setMassive(b, true);
    this.grabbed = b;
    b.held = true;
    const ctx = this.host.ctx();
    this.grabDepth = b.pos.distanceTo(ctx.camPos);
    this.grabRay.copy(cursorRay);
    this.prevVel.copy(b.vel);
    this.prevParent = this.dominant(b);
    this.samples = [];
    this.host.toast(`Holding ${b.name} — click to release`);
  }

  /** Update the held body from the current cursor ray (world direction). */
  drag(cursorRay: THREE.Vector3, wheel: number) {
    const b = this.grabbed;
    if (!b) return;
    const ctx = this.host.ctx();
    if (wheel) this.grabDepth *= Math.exp(wheel * 0.0012);
    b.pos.copy(ctx.camPos).addScaledVector(cursorRay, this.grabDepth);
    this.samples.push({ t: performance.now() / 1000, p: b.pos.clone() });
    if (this.samples.length > 12) this.samples.shift();
    b.vel.set(0, 0, 0);
  }

  release() {
    const b = this.grabbed;
    if (!b) return;
    b.held = false;
    this.grabbed = null;
    const dom = this.dominant(b);
    switch (this.releaseMode) {
      case 'circular': {
        if (dom) {
          const rel = _a.copy(b.pos).sub(dom.pos);
          const d = rel.length();
          // keep the previous direction of revolution when possible
          const oldRel = _b.copy(b.pos); void oldRel;
          const h = _c.crossVectors(rel, this.prevVel.clone().sub(this.prevParent?.vel ?? new THREE.Vector3(0, 0, 0)));
          if (h.lengthSq() < 1e-3) h.copy(Z).applyQuaternion(ECLIPTIC_TO_ICRS);
          const tan = _d.crossVectors(h.normalize(), rel.clone().normalize()).normalize();
          b.vel.copy(dom.vel).addScaledVector(tan, Math.sqrt((G * (dom.mass + b.mass)) / d));
        }
        break;
      }
      case 'keep': b.vel.copy(this.prevVel); break;
      case 'stop': b.vel.copy(dom ? dom.vel : new THREE.Vector3()); break;
      case 'throw': {
        const s = this.samples;
        if (s.length >= 2) {
          const a = s[Math.max(0, s.length - 6)], z = s[s.length - 1];
          const dt = Math.max(z.t - a.t, 1e-3);
          b.vel.copy(dom ? dom.vel : new THREE.Vector3()).add(z.p.clone().sub(a.p).multiplyScalar((this.throwScale / dt) * 0.35));
        } else b.vel.copy(dom ? dom.vel : new THREE.Vector3());
        break;
      }
    }
    this.retemp(b);
    this.host.toast(`${b.name} released`);
    this.onChange?.();
  }

  host_universe_stats() { return this.host.universe.physics.stats; }

  describe(b: Body): string {
    const v = this.relVelocity(b).length();
    return `${formatMass(b.mass)}  ·  v ${(v / 1000).toFixed(2)} km/s  ·  ${formatDistance(this.dominant(b)?.pos.distanceTo(b.pos) ?? 0)} from ${this.dominant(b)?.name ?? '—'}`;
  }
}

export { YEAR };
