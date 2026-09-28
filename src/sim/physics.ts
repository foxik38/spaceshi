import * as THREE from 'three';
import { G } from '../core/constants';
import { Body } from './body';
import { elementsFromState, stateInPlane } from './kepler';

/** Tunables for the integrator. */
const ETA_MASSIVE = 0.03;   // step = ETA × min local dynamical time
const ETA_TEST = 0.045;
const MAX_SUBSTEPS = 240;   // per test particle per macro-step, beyond this it drops to an analytic orbit
const BUDGET = 2.2e6;       // pair interactions per frame
const SOFT2 = 1e6;

const CBRT2 = Math.cbrt(2);
const W1 = 1 / (2 - CBRT2), W0 = -CBRT2 / (2 - CBRT2);
const YC = [W1 / 2, (W0 + W1) / 2, (W0 + W1) / 2, W1 / 2];
const YD = [W1, W0, W1];

export interface CollisionEvent {
  a: Body;         // survivor
  b: Body;         // absorbed
  pos: THREE.Vector3;
  energy: number;  // relative kinetic energy of impact, J
  relSpeed: number;
  time: number;
}

export interface PhysicsStats {
  massive: number;
  test: number;
  onRails: number;
  stepsLastFrame: number;
  warpCapped: boolean;
  maxWarp: number;
}

interface TestPlan { b: Body; sub: number; dt: number; src: number[] }

const _a = new THREE.Vector3(), _b = new THREE.Vector3();

/** Live N-body engine used by the sandbox. */
export class Physics {
  enabled = false;
  time = 0;
  massive: Body[] = [];
  test: Body[] = [];
  onCollision?: (e: CollisionEvent) => void;
  onRemove?: (b: Body) => void;
  stats: PhysicsStats = { massive: 0, test: 0, onRails: 0, stepsLastFrame: 0, warpCapped: false, maxWarp: Infinity };

  // scratch (massive)
  private px = new Float64Array(0);
  private py = new Float64Array(0);
  private pz = new Float64Array(0);
  private vx = new Float64Array(0);
  private vy = new Float64Array(0);
  private vz = new Float64Array(0);
  private ax = new Float64Array(0);
  private ay = new Float64Array(0);
  private az = new Float64Array(0);
  private m = new Float64Array(0);
  private sx = new Float64Array(0);  // start-of-step snapshot for interpolation
  private sy = new Float64Array(0);
  private sz = new Float64Array(0);
  private svx = new Float64Array(0);
  private svy = new Float64Array(0);
  private svz = new Float64Array(0);

  private members = new Set<Body>();
  private mp = new THREE.Vector3();

  /** Convert `roots` and everything under them to live bodies, starting from their current states at time t. */
  enable(t: number, roots: Body[], all: Body[]) {
    this.time = t;
    const rootSet = new Set(roots);
    const belongs = (b: Body) => { for (let p: Body | null = b; p; p = p.parent) if (rootSet.has(p)) return true; return false; };
    for (const b of all) {
      if (!belongs(b) || this.members.has(b)) continue;
      this.addBody(b);
    }
    this.enabled = true;
    this.rebuild();
  }

  /** Register one body as dynamic (keeps its current state). */
  addBody(b: Body) {
    if (b.customRails) return;
    if (!b.natural) b.natural = { parent: b.parent, elements: b.elements, elementsAt: b.elementsAt, mass: b.mass, radius: b.radius };
    b.dynamic = true;
    b.massive = b.userCreated || b.isLuminous || b.kind === 'black_hole' || b.kind === 'neutron_star' || b.mass > 5e22 && (b.kind === 'planet' || b.kind === 'gas_giant' || b.kind === 'ice_giant' || b.kind === 'dwarf_planet');
    b.fallback = undefined;
    this.members.add(b);
  }

  has(b: Body) { return this.members.has(b); }

  /** Promote/demote a body between test particle and gravity source (e.g. after the user edits or grabs it). */
  setMassive(b: Body, on: boolean) { b.massive = on; this.rebuild(); }

  remove(b: Body) {
    this.members.delete(b);
    b.dynamic = false;
    this.rebuild();
  }

  rebuild() {
    this.massive = [];
    this.test = [];
    for (const b of this.members) (b.massive ? this.massive : this.test).push(b);
    this.massive.sort((p, q) => q.mass - p.mass);
    const n = this.massive.length;
    if (this.px.length < n) {
      const mk = () => new Float64Array(n + 16);
      this.px = mk(); this.py = mk(); this.pz = mk(); this.vx = mk(); this.vy = mk(); this.vz = mk(); this.ax = mk(); this.ay = mk(); this.az = mk(); this.m = mk();
      this.sx = mk(); this.sy = mk(); this.sz = mk(); this.svx = mk(); this.svy = mk(); this.svz = mk();
    }
  }

  /** Turn every live body back into a rails body around the body that currently dominates it (frozen osculating orbits). */
  freeze(t: number) {
    const bodies = [...this.members];
    for (const b of bodies) {
      const dom = this.dominant(b);
      if (!dom) { b.dynamic = false; continue; }
      const r = _a.copy(b.pos).sub(dom.pos), v = _b.copy(b.vel).sub(dom.vel);
      b.setParent(dom);
      b.elementsAt = undefined;
      b.elements = elementsFromState(r, v, G * (dom.mass + b.mass), t, 'icrs');
      b.dynamic = false;
      b.fallback = undefined;
    }
    this.members.clear();
    this.massive = []; this.test = [];
    this.enabled = false;
  }

  /** Restore the natural (catalogue) orbits. */
  restoreNatural() {
    for (const b of this.members) {
      b.dynamic = false;
      b.fallback = undefined;
      b.osc = undefined;
      if (b.natural) {
        b.setParent(b.natural.parent);
        b.elements = b.natural.elements;
        b.elementsAt = b.natural.elementsAt;
        b.mass = b.natural.mass;
        b.radius = b.natural.radius;
      }
    }
    this.members.clear();
    this.massive = []; this.test = [];
    this.enabled = false;
  }

  /** The massive body exerting the strongest pull on b (excluding itself). */
  dominant(b: Body): Body | null {
    let best: Body | null = null, bg = 0;
    const pool = this.massive.length ? this.massive : [...this.members];
    for (const o of pool) {
      if (o === b || o.mass <= 0) continue;
      const d2 = o.pos.distanceToSquared(b.pos) + 1;
      const g = o.mass / d2;
      if (g > bg) { bg = g; best = o; }
    }
    return best;
  }

  // ---------------------------------------------------------------------------- integration

  private load() {
    const n = this.massive.length;
    for (let i = 0; i < n; i++) {
      const b = this.massive[i];
      this.px[i] = b.pos.x; this.py[i] = b.pos.y; this.pz[i] = b.pos.z;
      this.vx[i] = b.vel.x; this.vy[i] = b.vel.y; this.vz[i] = b.vel.z;
      this.m[i] = b.mass;
    }
  }

  private store() {
    const n = this.massive.length;
    for (let i = 0; i < n; i++) {
      const b = this.massive[i];
      if (b.held) continue;
      b.pos.set(this.px[i], this.py[i], this.pz[i]);
      b.vel.set(this.vx[i], this.vy[i], this.vz[i]);
    }
  }

  private accel(n: number) {
    const { px, py, pz, ax, ay, az, m } = this;
    for (let i = 0; i < n; i++) { ax[i] = 0; ay[i] = 0; az[i] = 0; }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
        const r2 = dx * dx + dy * dy + dz * dz + SOFT2;
        const inv = 1 / (r2 * Math.sqrt(r2));
        const fi = G * m[j] * inv, fj = G * m[i] * inv;
        ax[i] += dx * fi; ay[i] += dy * fi; az[i] += dz * fi;
        ax[j] -= dx * fj; ay[j] -= dy * fj; az[j] -= dz * fj;
      }
    }
  }

  /** Shortest local dynamical time among the massive bodies (sets the global step). */
  private massiveTimescale(n: number): number {
    let tmin = Infinity;
    const { px, py, pz, vx, vy, vz, m } = this;
    for (let i = 0; i < n; i++) {
      if (this.massive[i].held) continue;
      // the timescale is set by the strongest neighbour
      let bestG = 0, bd = 1, bvr = 0;
      for (let j = 0; j < n; j++) {
        if (j === i) continue;
        const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i];
        const d2 = dx * dx + dy * dy + dz * dz + 1;
        const g = (m[j] + m[i]) / d2;
        if (g > bestG) { bestG = g; bd = Math.sqrt(d2); bvr = Math.hypot(vx[j] - vx[i], vy[j] - vy[i], vz[j] - vz[i]); }
      }
      if (bestG > 0) {
        const tdyn = Math.sqrt((bd * bd * bd) / (G * (bestG * bd * bd)));
        tmin = Math.min(tmin, tdyn, bd / Math.max(bvr, 1) * 0.2);
      }
    }
    return tmin;
  }

  /** Advance the live system to simulation time `target`. Returns the time actually reached (may lag at extreme warp). */
  advanceTo(target: number): number {
    if (!this.enabled) { this.time = target; return target; }
    let remaining = target - this.time;
    if (Math.abs(remaining) < 1e-9) return this.time;
    const dir = Math.sign(remaining);
    let n = this.massive.length;
    this.load();
    let steps = 0;
    let budget = BUDGET;
    this.stats.warpCapped = false;
    const frameStart = this.time;
    // Decide which test particles can be integrated this frame; the rest ride analytic orbits.
    let activeTests = this.planTests(Math.abs(remaining), budget);
    while (Math.abs(remaining) > 1e-9) {
      const tmin = this.massiveTimescale(n);
      let h = Math.min(Math.abs(remaining), Math.max(ETA_MASSIVE * tmin, 1));
      if (!Number.isFinite(h)) h = Math.abs(remaining);
      const cost = n * n * 3 + activeTests.reduce((s, p) => s + p.sub * p.src.length, 0);
      if (budget < cost && steps > 0) { this.stats.warpCapped = true; break; }
      budget -= cost;
      this.snapshot(n);
      this.yoshida(n, dir * h);
      this.time += dir * h;
      remaining -= dir * h;
      this.stepTests(activeTests, n, dir * h);
      if (this.collide(n)) {
        this.rebuild();
        n = this.massive.length;
        this.load();
        activeTests = this.planTests(Math.abs(remaining), budget);
      }
      steps++;
      if (steps > 20000) { this.stats.warpCapped = true; break; }
    }
    this.store();
    this.finalizeFallback();
    this.stats.stepsLastFrame = steps;
    this.stats.massive = n; this.stats.test = this.test.length;
    this.stats.onRails = this.test.filter((b) => b.fallback).length;
    this.stats.maxWarp = Math.abs(this.time - frameStart);
    return this.time;
  }

  private snapshot(n: number) {
    this.sx.set(this.px.subarray(0, n)); this.sy.set(this.py.subarray(0, n)); this.sz.set(this.pz.subarray(0, n));
    this.svx.set(this.vx.subarray(0, n)); this.svy.set(this.vy.subarray(0, n)); this.svz.set(this.vz.subarray(0, n));
  }

  private yoshida(n: number, h: number) {
    const { px, py, pz, vx, vy, vz, ax, ay, az } = this;
    for (let k = 0; k < 4; k++) {
      for (let i = 0; i < n; i++) { px[i] += YC[k] * h * vx[i]; py[i] += YC[k] * h * vy[i]; pz[i] += YC[k] * h * vz[i]; }
      if (k < 3) {
        this.accel(n);
        for (let i = 0; i < n; i++) { vx[i] += YD[k] * h * ax[i]; vy[i] += YD[k] * h * ay[i]; vz[i] += YD[k] * h * az[i]; }
      }
    }
    // held bodies keep their (externally set) position
    for (let i = 0; i < n; i++) if (this.massive[i].held) { const b = this.massive[i]; px[i] = b.pos.x; py[i] = b.pos.y; pz[i] = b.pos.z; vx[i] = 0; vy[i] = 0; vz[i] = 0; }
  }

  // ------------------------------------------------------------------------- test particles

  private planTests(span: number, budget: number): TestPlan[] {
    const n = this.massive.length;
    const out: TestPlan[] = [];
    const tmin = this.massiveTimescale(n);
    const hEst = Math.min(span, Math.max(ETA_MASSIVE * (Number.isFinite(tmin) ? tmin : span), 1));
    const list: TestPlan[] = [];
    for (const b of this.test) {
      if (b.held) continue;
      const dom = this.dominant(b);
      if (!dom) continue;
      const r = b.pos.distanceTo(dom.pos);
      const tdyn = Math.sqrt((r * r * r) / (G * dom.mass));
      const dt = ETA_TEST * tdyn;
      const sub = Math.max(1, Math.ceil(hEst / dt));
      // gravity sources that matter for this particle (always includes the far star that accelerates the whole subsystem)
      let gmax = 0;
      const gs = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const o = this.massive[i];
        if (o === b) continue;
        gs[i] = o.mass / (o.pos.distanceToSquared(b.pos) + 1);
        if (gs[i] > gmax) gmax = gs[i];
      }
      const src: number[] = [];
      for (let i = 0; i < n; i++) if (gs[i] >= gmax * 1e-6) src.push(i);
      list.push({ b, sub, dt, src });
    }
    // demote the fastest particles to analytic orbits if they need too many substeps or exceed the budget
    list.sort((p, q) => p.sub - q.sub);
    let cost = 0;
    const steps = Math.max(1, span / hEst);
    for (const p of list) {
      const c = p.sub * p.src.length * steps;
      if (p.sub > MAX_SUBSTEPS || cost + c > budget * 0.6) {
        this.toFallback(p.b);
      } else {
        this.fromFallback(p.b);
        out.push(p);
        cost += c;
      }
    }
    return out;
  }

  private toFallback(b: Body) {
    if (b.fallback) return;
    const dom = this.dominant(b);
    if (!dom) return;
    const r = _a.copy(b.pos).sub(dom.pos), v = _b.copy(b.vel).sub(dom.vel);
    b.fallback = { parent: dom, el: elementsFromState(r, v, G * (dom.mass + b.mass), this.time, 'icrs') };
  }

  private fromFallback(b: Body) {
    if (!b.fallback) return;
    // evaluate the analytic orbit at the current time to get a state, then integrate from there
    const { parent, el } = b.fallback;
    const r = new THREE.Vector3(), v = new THREE.Vector3();
    stateInPlane(el, G * (parent.mass + b.mass), this.time, r, v);
    b.pos.copy(parent.pos).add(r);
    b.vel.copy(parent.vel).add(v);
    b.fallback = undefined;
  }

  /** Update the states of bodies riding analytic orbits so they follow their (dynamic) primaries. */
  private finalizeFallback() {
    const r = new THREE.Vector3(), v = new THREE.Vector3();
    // parents first: sort by mass descending is enough since parents are massive bodies (already stored)
    for (const b of this.test) {
      const f = b.fallback;
      if (!f) continue;
      stateInPlane(f.el, G * (f.parent.mass + b.mass), this.time, r, v);
      b.pos.copy(f.parent.pos).add(r);
      b.vel.copy(f.parent.vel).add(v);
    }
  }

  private hermite(i: number, tau: number, h: number, out: THREE.Vector3) {
    // cubic Hermite between snapshot (start) and current (end) massive states; tau in [0,1]
    const t2 = tau * tau, t3 = t2 * tau;
    const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + tau, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    out.set(
      h00 * this.sx[i] + h10 * h * this.svx[i] + h01 * this.px[i] + h11 * h * this.vx[i],
      h00 * this.sy[i] + h10 * h * this.svy[i] + h01 * this.py[i] + h11 * h * this.vy[i],
      h00 * this.sz[i] + h10 * h * this.svz[i] + h01 * this.pz[i] + h11 * h * this.vz[i],
    );
  }

  private stepTests(list: TestPlan[], n: number, h: number) {
    if (!list.length) return;
    const mp = this.mp;
    const pos = new THREE.Vector3(), vel = new THREE.Vector3(), acc = new THREE.Vector3();
    void n;
    for (const p of list) {
      const b = p.b;
      const sub = p.sub;
      const dtp = h / sub;
      const src = p.src;
      pos.copy(b.pos); vel.copy(b.vel);
      // leapfrog (kick-drift-kick) in the interpolated field of the relevant sources
      const field = (tau: number, at: THREE.Vector3, out: THREE.Vector3) => {
        out.set(0, 0, 0);
        for (let q = 0; q < src.length; q++) {
          const i = src[q];
          this.hermite(i, tau, h, mp);
          const dx = mp.x - at.x, dy = mp.y - at.y, dz = mp.z - at.z;
          const r2 = dx * dx + dy * dy + dz * dz + SOFT2;
          const f = (G * this.m[i]) / (r2 * Math.sqrt(r2));
          out.x += dx * f; out.y += dy * f; out.z += dz * f;
        }
      };
      field(0, pos, acc);
      for (let k = 0; k < sub; k++) {
        const tau0 = k / sub, tau1 = (k + 1) / sub;
        vel.addScaledVector(acc, dtp / 2);
        pos.addScaledVector(vel, dtp);
        field(tau1, pos, acc);
        vel.addScaledVector(acc, dtp / 2);
        void tau0;
      }
      b.pos.copy(pos); b.vel.copy(vel);
    }
  }

  // ------------------------------------------------------------------------------ collisions

  private collide(n: number): boolean {
    // massive–massive mergers
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const A = this.massive[i], B = this.massive[j];
        if (A.held || B.held) continue;
        const dx = this.px[j] - this.px[i], dy = this.py[j] - this.py[i], dz = this.pz[j] - this.pz[i];
        const rr = A.radius + B.radius;
        if (dx * dx + dy * dy + dz * dz < rr * rr) {
          this.mergePair(i, j);
          this.store();
          return true;
        }
      }
    }
    return false;
  }

  private mergePair(i: number, j: number) {
    let A = this.massive[i], B = this.massive[j];
    if (B.mass > A.mass) { [A, B] = [B, A]; [i, j] = [j, i]; }
    const mt = A.mass + B.mass;
    const relV = Math.hypot(this.vx[i] - this.vx[j], this.vy[i] - this.vy[j], this.vz[i] - this.vz[j]);
    const mu = (A.mass * B.mass) / mt;
    const pos = new THREE.Vector3(this.px[j], this.py[j], this.pz[j]);
    // conserve momentum
    A.vel.set((A.mass * this.vx[i] + B.mass * this.vx[j]) / mt, (A.mass * this.vy[i] + B.mass * this.vy[j]) / mt, (A.mass * this.vz[i] + B.mass * this.vz[j]) / mt);
    A.pos.set((A.mass * this.px[i] + B.mass * this.px[j]) / mt, (A.mass * this.py[i] + B.mass * this.py[j]) / mt, (A.mass * this.pz[i] + B.mass * this.pz[j]) / mt);
    if (A.kind === 'black_hole') A.radius = (2 * G * mt) / (299792458 ** 2);
    else A.radius = Math.cbrt(A.radius ** 3 + B.radius ** 3);
    A.temperature = (A.temperature * A.mass + B.temperature * B.mass) / mt;
    A.mass = mt;
    if (A.isLuminous) A.luminosity += B.isLuminous ? B.luminosity : 0;
    // keep the stored arrays consistent for the caller
    this.px[i] = A.pos.x; this.py[i] = A.pos.y; this.pz[i] = A.pos.z;
    this.vx[i] = A.vel.x; this.vy[i] = A.vel.y; this.vz[i] = A.vel.z;
    this.onCollision?.({ a: A, b: B, pos, energy: 0.5 * mu * relV * relV, relSpeed: relV, time: this.time });
    this.removeBody(B);
  }

  private removeBody(b: Body) {
    this.members.delete(b);
    b.dynamic = false;
    this.onRemove?.(b);
  }

  /** Absorb test particles that hit a massive body (call once per frame after integration). */
  resolveImpacts() {
    for (const t of [...this.test]) {
      if (t.held || t.fallback) continue;
      for (const m of this.massive) {
        if (m === t) continue;
        const d = t.pos.distanceTo(m.pos);
        if (d < m.radius + t.radius) {
          const rel = _a.copy(t.vel).sub(m.vel).length();
          // momentum transfer (test particles are light but conserve it anyway)
          const mt = m.mass + t.mass;
          m.vel.multiplyScalar(m.mass / mt).addScaledVector(t.vel, t.mass / mt);
          m.mass = mt;
          this.onCollision?.({ a: m, b: t, pos: t.pos.clone(), energy: 0.5 * t.mass * rel * rel, relSpeed: rel, time: this.time });
          this.removeBody(t);
          break;
        }
      }
    }
    if (this.test.some((t) => !this.members.has(t))) this.rebuild();
  }

  /** Recompute osculating orbits (for display) around each body's dominant attractor. */
  updateOsculating(maxBodies = 400) {
    let k = 0;
    for (const b of this.members) {
      if (k++ > maxBodies) break;
      const dom = this.dominant(b);
      if (!dom) { b.osc = undefined; continue; }
      const r = _a.copy(b.pos).sub(dom.pos), v = _b.copy(b.vel).sub(dom.vel);
      if (r.lengthSq() === 0) continue;
      const el = elementsFromState(r, v, G * (dom.mass + b.mass), this.time, 'icrs');
      if (!Number.isFinite(el.a) || !Number.isFinite(el.e)) { b.osc = undefined; continue; }
      b.osc = { parent: dom, el };
    }
  }
}
