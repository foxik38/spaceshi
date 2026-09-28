import * as THREE from 'three';
import { AU, G, M_SUN, R_EARTH, DEG, TAU } from '../core/constants';
import { gauss, mulberry32 } from '../core/math';
import type { Body } from '../sim/body';
import { ECLIPTIC_TO_ICRS } from '../sim/kepler';
import type { FrameContext } from './context';

const vert = /* glsl */ `
attribute vec4 aA;      // a, e, i, Om
attribute vec4 aB;      // w, M0, n, size
uniform float uTime;
uniform vec3 uParentRel;
uniform mat3 uPlane;
uniform float uPixelRatio;
uniform float uPixelAngle;
uniform float uRock;
uniform float uBright;
uniform vec3 uColor;
uniform float uFadeNear;
uniform float uFadeFar;
varying vec4 vC;
varying vec3 vView;
void main() {
  float a = aA.x, e = aA.y, inc = aA.z, Om = aA.w;
  float M = aB.y + aB.z * uTime;
  float E = M + e * sin(M);
  for (int i = 0; i < 7; i++) E -= (E - e * sin(E) - M) / (1.0 - e * cos(E));
  float x = a * (cos(E) - e), y = a * sqrt(1.0 - e * e) * sin(E);
  float cO = cos(Om), sO = sin(Om), ci = cos(inc), si = sin(inc), cw = cos(aB.x), sw = sin(aB.x);
  vec3 P = vec3(cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si);
  vec3 Q = vec3(-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si);
  vec3 rel = uParentRel + uPlane * (x * P + y * Q);
  vView = (viewMatrix * vec4(rel, 0.0)).xyz;
  float d = length(rel);
  vec4 p = projectionMatrix * viewMatrix * vec4(rel / max(d, 1.0) * 100.0, 1.0);
  p.z = 0.0;
  gl_Position = p;
  float px = uRock * aB.w / max(d, 1.0) / uPixelAngle;
  gl_PointSize = clamp(1.3 + px, 1.0, 10.0) * uPixelRatio;
  float fade = 1.0 - smoothstep(uFadeNear, uFadeFar, d);
  float near = clamp(d / 200.0, 0.0, 1.0);
  vC = vec4(uColor * (0.75 + 0.5 * fract(aB.w * 7.13)), uBright * fade * near);
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec4 vC;
varying vec3 vView;
uniform vec4 uOcc[6];
uniform int uOccN;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float pp = dot(vView, vView);
  for (int i = 0; i < 6; i++) {
    if (i >= uOccN) break;
    vec3 c = uOcc[i].xyz;
    float s = dot(c, vView) / pp;
    if (s > 0.0 && dot(c, c) - s * s * pp < uOcc[i].w * uOcc[i].w) discard;
  }
  float v = vC.a * exp(-r2 * 2.0);
  gl_FragColor = vec4(vC.rgb * v, v);
}
`;

export interface BeltOptions {
  name: string;
  count: number;
  parent: Body;
  plane: 'ecliptic' | 'icrs';
  color: [number, number, number];
  rock: number;
  brightness: number;
  fadeNear?: number;
  fadeFar?: number;
  gen: (rand: () => number, i: number) => { a: number; e: number; i: number; Om: number; w: number; M: number; n?: number };
}

const rayleigh = (r: () => number, s: number) => s * Math.sqrt(-2 * Math.log(Math.max(r(), 1e-9)));

export class Belt {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  enabled = true;
  constructor(public opts: BeltOptions) {
    const rand = mulberry32(opts.name.length * 7919 + opts.count);
    const N = opts.count;
    const A = new Float32Array(N * 4), B = new Float32Array(N * 4);
    const mu = G * opts.parent.mass;
    for (let k = 0; k < N; k++) {
      const o = opts.gen(rand, k);
      A[k * 4] = o.a; A[k * 4 + 1] = o.e; A[k * 4 + 2] = o.i; A[k * 4 + 3] = o.Om;
      B[k * 4] = o.w; B[k * 4 + 1] = o.M; B[k * 4 + 2] = o.n ?? Math.sqrt(mu / (o.a * o.a * o.a)); B[k * 4 + 3] = 0.3 + rand() * 1.4;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('aA', new THREE.BufferAttribute(A, 4));
    g.setAttribute('aB', new THREE.BufferAttribute(B, 4));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e30);
    const plane = new THREE.Matrix3();
    if (opts.plane === 'ecliptic') plane.setFromMatrix4(new THREE.Matrix4().makeRotationFromQuaternion(ECLIPTIC_TO_ICRS));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uTime: { value: 0 }, uParentRel: { value: new THREE.Vector3() }, uPlane: { value: plane }, uPixelRatio: { value: 1 }, uPixelAngle: { value: 0.001 },
        uRock: { value: opts.rock }, uBright: { value: opts.brightness }, uColor: { value: new THREE.Vector3(...opts.color) },
        uFadeNear: { value: opts.fadeNear ?? 1e30 }, uFadeFar: { value: opts.fadeFar ?? 2e30 },
        uOcc: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uOccN: { value: 0 },
      },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
  }

  update(ctx: FrameContext, t: number, pixelRatio: number, occluders: Body[]) {
    const u = this.material.uniforms;
    u.uTime.value = t;
    u.uParentRel.value.copy(this.opts.parent.pos).sub(ctx.camPos);
    u.uPixelRatio.value = pixelRatio;
    u.uPixelAngle.value = ctx.pixelAngle;
    let n = 0;
    for (const o of occluders) {
      if (n >= 6) break;
      const v = (u.uOcc.value as THREE.Vector4[])[n++];
      const r = new THREE.Vector3().copy(o.pos).sub(ctx.camPos).applyQuaternion(ctx.camQuatInv);
      v.set(r.x, r.y, r.z, o.radius * 1.002);
    }
    u.uOccN.value = n;
  }
}

/** Build the standard set of small-body populations. */
export function createBelts(sun: Body, earth: Body, jupiter: Body): Belt[] {
  const belts: Belt[] = [];
  const kirkwood = [2.5, 2.82, 2.95, 3.27, 2.06];
  const mainBelt = new Belt({
    name: 'main-belt', count: 42000, parent: sun, plane: 'ecliptic', color: [0.85, 0.78, 0.68], rock: 60000, brightness: 0.34,
    gen: (r) => {
      let a = 0;
      for (let tries = 0; tries < 20; tries++) {
        const u = r();
        a = u < 0.3 ? 2.35 + gauss(r) * 0.2 : u < 0.72 ? 2.72 + gauss(r) * 0.15 : 3.05 + gauss(r) * 0.12;
        if (a > 2.1 && a < 3.3 && !kirkwood.some((k) => Math.abs(a - k) < 0.018)) break;
      }
      return { a: a * AU, e: Math.min(rayleigh(r, 0.09), 0.36), i: Math.min(rayleigh(r, 6), 32) * DEG, Om: r() * TAU, w: r() * TAU, M: r() * TAU };
    },
  });
  belts.push(mainBelt);
  belts.push(new Belt({
    name: 'hildas', count: 1600, parent: sun, plane: 'ecliptic', color: [0.8, 0.72, 0.62], rock: 30000, brightness: 0.3,
    gen: (r) => ({ a: (3.97 + gauss(r) * 0.04) * AU, e: 0.15 + gauss(r) * 0.04, i: Math.abs(gauss(r)) * 8 * DEG, Om: r() * TAU, w: r() * TAU, M: r() * TAU }),
  }));
  // Jupiter Trojans lead/trail Jupiter by 60° in mean longitude (L_J(J2000) = 34.4°, varpi = 14.7°)
  belts.push(new Belt({
    name: 'trojans', count: 4500, parent: sun, plane: 'ecliptic', color: [0.75, 0.62, 0.55], rock: 40000, brightness: 0.36,
    gen: (r, i) => {
      const lead = i % 2 === 0;
      const w = r() * TAU, Om = r() * TAU;
      const Lj = (34.4396 * DEG);
      const L = Lj + (lead ? 1 : -1) * (60 * DEG + gauss(r) * 9 * DEG);
      const a = (5.2 + gauss(r) * 0.12) * AU;
      const e = Math.abs(gauss(r)) * 0.07;
      const nJ = Math.sqrt((G * M_SUN) / (5.2 * AU) ** 3);
      return { a, e, i: Math.abs(gauss(r)) * 12 * DEG, Om, w, M: L - w - Om, n: nJ };
    },
  }));
  belts.push(new Belt({
    name: 'kuiper', count: 22000, parent: sun, plane: 'ecliptic', color: [0.65, 0.72, 0.85], rock: 200000, brightness: 0.3,
    gen: (r) => {
      const u = r();
      let a: number, e: number, inc: number;
      if (u < 0.5) { a = 42 + r() * 6; e = rayleigh(r, 0.05); inc = rayleigh(r, 5); }
      else if (u < 0.68) { a = 39.4 + gauss(r) * 0.25; e = 0.14 + Math.abs(gauss(r)) * 0.08; inc = rayleigh(r, 8); }
      else { a = 50 + Math.pow(r(), 2.2) * 120; const q = 33 + r() * 12; e = Math.min(0.9, 1 - q / a); inc = rayleigh(r, 15); }
      return { a: a * AU, e: Math.min(e, 0.92), i: Math.min(inc, 45) * DEG, Om: r() * TAU, w: r() * TAU, M: r() * TAU };
    },
  }));
  // Oort cloud: static isotropic shell (n = 0) of long-period comet nuclei
  belts.push(new Belt({
    name: 'oort', count: 9000, parent: sun, plane: 'icrs', color: [0.7, 0.85, 1.0], rock: 3e6, brightness: 0.22,
    gen: (r) => {
      const dist = Math.pow(10, 3.4 + r() * 1.6) * AU;
      return { a: dist, e: 0, i: Math.acos(1 - 2 * r()), Om: r() * TAU, w: 0, M: r() * TAU, n: 0 };
    },
  }));
  // Earth-orbiting populations, visible only when the camera is near Earth
  const muE = G * earth.mass;
  const aLeo = R_EARTH + 550e3;
  belts.push(new Belt({
    name: 'starlink', count: 4200, parent: earth, plane: 'icrs', color: [0.7, 0.9, 1.0], rock: 4, brightness: 0.6, fadeNear: 1.6e7, fadeFar: 5e7,
    gen: (r, i) => {
      const plane = i % 72, slot = Math.floor(i / 72);
      return { a: aLeo + (i % 3) * 5000, e: 0.0002, i: 53 * DEG, Om: (plane / 72) * TAU, w: 0, M: (slot / 58) * TAU + plane * 0.11 + r() * 0.02, n: Math.sqrt(muE / aLeo ** 3) };
    },
  }));
  belts.push(new Belt({
    name: 'gps', count: 31, parent: earth, plane: 'icrs', color: [1, 0.95, 0.6], rock: 6, brightness: 1.0, fadeNear: 3e8, fadeFar: 6e8,
    gen: (r, i) => ({ a: 26560e3, e: 0.005, i: 55 * DEG, Om: ((i % 6) / 6) * TAU, w: r() * TAU, M: ((i / 6) % 5) * 1.25 + r() * 0.2, n: Math.sqrt(muE / 26560e3 ** 3) }),
  }));
  belts.push(new Belt({
    name: 'geo', count: 560, parent: earth, plane: 'icrs', color: [0.9, 0.95, 1.0], rock: 8, brightness: 0.9, fadeNear: 4e8, fadeFar: 8e8,
    gen: (r, i) => ({ a: 42164e3, e: 0.0002 + r() * 0.0006, i: Math.abs(gauss(r)) * 1.2 * DEG, Om: r() * TAU, w: r() * TAU, M: (i / 560) * TAU * 2.9 + r() * 0.05, n: Math.sqrt(muE / 42164e3 ** 3) }),
  }));
  belts.push(new Belt({
    name: 'debris', count: 7000, parent: earth, plane: 'icrs', color: [0.75, 0.75, 0.8], rock: 1, brightness: 0.22, fadeNear: 1.0e7, fadeFar: 2.4e7,
    gen: (r) => {
      const a = R_EARTH + 350e3 + Math.pow(r(), 1.6) * 1500e3;
      return { a, e: Math.abs(gauss(r)) * 0.012, i: Math.acos(1 - 2 * r()), Om: r() * TAU, w: r() * TAU, M: r() * TAU };
    },
  }));
  return belts;
}
