import * as THREE from 'three';
import { OBLIQUITY, TAU } from '../core/constants';
import { solveKeplerE, solveKeplerH } from '../core/math';

/** Keplerian orbital elements relative to a reference plane, with optional linear secular drift. */
export interface Elements {
  /** Semi-major axis in metres (negative for hyperbolic orbits, e > 1). */
  a: number;
  e: number;
  /** Inclination, longitude of ascending node, argument of periapsis (radians). */
  i: number;
  Om: number;
  w: number;
  /** Mean anomaly at epoch t0 (radians). */
  M0: number;
  t0: number;
  /** Override mean motion (rad/s) — otherwise derived from the gravitational parameter. */
  n?: number;
  /** Secular drift of Om and w (rad/s), e.g. lunar nodal regression. */
  dOm?: number;
  dw?: number;
  /** Reference plane: ecliptic J2000, ICRS equator, or the parent body's equator. */
  plane: 'ecliptic' | 'icrs' | 'parent';
}

const _q = new THREE.Quaternion();
const _ecl = _q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), OBLIQUITY).clone();

/** Quaternion that rotates vectors from the ecliptic frame into ICRS (equatorial) axes. */
export const ECLIPTIC_TO_ICRS = _ecl;

export function meanMotion(el: Elements, mu: number): number {
  return el.n ?? Math.sqrt(mu / Math.abs(el.a * el.a * el.a));
}

export function orbitalPeriod(el: Elements, mu: number): number {
  return el.e < 1 ? TAU / meanMotion(el, mu) : Infinity;
}

/**
 * Position and velocity relative to the primary, expressed in the elements' reference plane axes
 * (NOT yet rotated into ICRS). Outputs are written into the provided vectors.
 */
export function stateInPlane(el: Elements, mu: number, t: number, pos: THREE.Vector3, vel: THREE.Vector3) {
  const n = meanMotion(el, mu);
  const dt = t - el.t0;
  const M = el.M0 + n * dt;
  const e = el.e;
  let x: number, y: number, vx: number, vy: number;
  if (e < 1) {
    const E = solveKeplerE(M, e);
    const cE = Math.cos(E), sE = Math.sin(E);
    const b = el.a * Math.sqrt(1 - e * e);
    const den = 1 - e * cE;
    x = el.a * (cE - e);
    y = b * sE;
    vx = (-el.a * n * sE) / den;
    vy = (b * n * cE) / den;
  } else {
    const H = solveKeplerH(M, e);
    const ch = Math.cosh(H), sh = Math.sinh(H);
    const a = el.a; // negative
    const b = -a * Math.sqrt(e * e - 1);
    const dH = n / (e * ch - 1);
    x = a * (ch - e);
    y = b * sh;
    vx = a * sh * dH;
    vy = b * ch * dH;
  }
  const Om = el.Om + (el.dOm ?? 0) * dt;
  const w = el.w + (el.dw ?? 0) * dt;
  const cO = Math.cos(Om), sO = Math.sin(Om);
  const ci = Math.cos(el.i), si = Math.sin(el.i);
  const cw = Math.cos(w), sw = Math.sin(w);
  // rotation matrix columns P (periapsis dir) and Q for R = Rz(Om) Rx(i) Rz(w)
  const Px = cO * cw - sO * sw * ci, Py = sO * cw + cO * sw * ci, Pz = sw * si;
  const Qx = -cO * sw - sO * cw * ci, Qy = -sO * sw + cO * cw * ci, Qz = cw * si;
  pos.set(x * Px + y * Qx, x * Py + y * Qy, x * Pz + y * Qz);
  vel.set(vx * Px + vy * Qx, vx * Py + vy * Qy, vx * Pz + vy * Qz);
}

/**
 * Osculating elements from a state vector given in the reference plane axes.
 * `t` becomes the epoch t0.
 */
export function elementsFromState(r: THREE.Vector3, v: THREE.Vector3, mu: number, t: number, plane: Elements['plane']): Elements {
  const rl = r.length();
  const v2 = v.lengthSq();
  const h = new THREE.Vector3().crossVectors(r, v);
  const hl = h.length();
  const ev = new THREE.Vector3().crossVectors(v, h).multiplyScalar(1 / mu).sub(r.clone().multiplyScalar(1 / rl));
  const e = ev.length();
  const energy = v2 / 2 - mu / rl;
  const a = Math.abs(energy) < 1e-30 ? Infinity : -mu / (2 * energy);
  const inc = Math.acos(THREE.MathUtils.clamp(h.z / hl, -1, 1));
  const nvec = new THREE.Vector3(-h.y, h.x, 0);
  const nl = nvec.length();
  let Om = 0, w = 0;
  if (nl > 1e-12 * hl) {
    Om = Math.atan2(nvec.y, nvec.x);
    if (e > 1e-10) {
      w = Math.acos(THREE.MathUtils.clamp(nvec.dot(ev) / (nl * e), -1, 1));
      if (ev.z < 0) w = TAU - w;
    }
  } else if (e > 1e-10) {
    // equatorial orbit: measure periapsis from the x-axis
    w = Math.atan2(ev.y, ev.x);
    if (h.z < 0) w = -w;
  }
  // true anomaly
  let nu: number;
  if (e > 1e-10) {
    nu = Math.acos(THREE.MathUtils.clamp(ev.dot(r) / (e * rl), -1, 1));
    if (r.dot(v) < 0) nu = TAU - nu;
  } else if (nl > 1e-12 * hl) {
    nu = Math.acos(THREE.MathUtils.clamp(nvec.dot(r) / (nl * rl), -1, 1));
    if (r.z < 0) nu = TAU - nu;
  } else {
    nu = Math.atan2(r.y, r.x);
  }
  let M: number;
  if (e < 1) {
    const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    M = E - e * Math.sin(E);
  } else {
    const nuw = nu > Math.PI ? nu - TAU : nu;
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nuw / 2));
    M = e * Math.sinh(H) - H;
  }
  return { a, e, i: inc, Om, w, M0: M, t0: t, plane };
}

/**
 * Sample the orbit path as points relative to the primary, in the elements' reference-plane axes.
 * Returns the parameter range: for ellipses u = E (0…2π), for hyperbolae u = H (−Hmax…Hmax).
 */
export function orbitPath(el: Elements, t: number, count: number, out: Float32Array, rMax = 1e15): { hyper: boolean; hmax: number } {
  const dt = t - el.t0;
  const Om = el.Om + (el.dOm ?? 0) * dt;
  const w = el.w + (el.dw ?? 0) * dt;
  const cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(el.i), si = Math.sin(el.i), cw = Math.cos(w), sw = Math.sin(w);
  const Px = cO * cw - sO * sw * ci, Py = sO * cw + cO * sw * ci, Pz = sw * si;
  const Qx = -cO * sw - sO * cw * ci, Qy = -sO * sw + cO * cw * ci, Qz = cw * si;
  const e = el.e;
  let hyper = false, hmax = 0;
  if (e >= 1) {
    hyper = true;
    const a = Math.abs(el.a);
    hmax = Math.acosh(Math.min(Math.max((rMax / a + 1) / e, 1.0001), 1e6));
  }
  for (let i = 0; i < count; i++) {
    const f = i / (hyper ? count - 1 : count);
    let x: number, y: number;
    if (!hyper) {
      const E = f * Math.PI * 2;
      x = el.a * (Math.cos(E) - e);
      y = el.a * Math.sqrt(1 - e * e) * Math.sin(E);
    } else {
      const H = (f * 2 - 1) * hmax;
      x = el.a * (Math.cosh(H) - e);
      y = -el.a * Math.sqrt(e * e - 1) * Math.sinh(H);
    }
    out[i * 3] = x * Px + y * Qx;
    out[i * 3 + 1] = x * Py + y * Qy;
    out[i * 3 + 2] = x * Pz + y * Qz;
  }
  return { hyper, hmax };
}
