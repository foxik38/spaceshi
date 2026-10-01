import * as THREE from 'three';
import { AU } from '../core/constants';
import { gauss, hashString, mulberry32 } from '../core/math';
import type { Body } from '../sim/body';
import { isInFrustum, type FrameContext } from './context';

const N_DUST = 150;
const N_ION = 220;
const CAP = 2600;
const ACTIVE_RADIUS = 3.3 * AU;

const vertex = /* glsl */ `
attribute vec3 iCenter;   // camera-relative centre (m)
attribute float iRadius;  // metres
attribute vec4 iColor;    // rgb, peak intensity
varying vec2 vQ;
varying vec4 vC;
void main() {
  vec4 vc = viewMatrix * vec4(iCenter, 1.0);
  vQ = position.xy;
  vC = iColor;
  if (-vc.z < 1e-2) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec4 p = projectionMatrix * (vc + vec4(position.xy * iRadius, 0.0, 0.0));
  p.z = 0.0;
  gl_Position = p;
}
`;
const fragment = /* glsl */ `
precision highp float;
varying vec2 vQ;
varying vec4 vC;
void main() {
  float r2 = dot(vQ, vQ);
  if (r2 > 1.0) discard;
  float v = vC.a * exp(-r2 * 4.2) * (1.0 - r2);
  gl_FragColor = vec4(vC.rgb * v, v);
}
`;

interface Scatter { s: Float32Array; ds: Float32Array; jitter: Float32Array; side: Float32Array }

function makeScatter(seed: number, n: number, power: number): Scatter {
  const rnd = mulberry32(seed);
  const s = new Float32Array(n), ds = new Float32Array(n), jitter = new Float32Array(n), side = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    s[i] = Math.pow((i + 0.5) / n, power);
    ds[i] = Math.pow((i + 1) / n, power) - Math.pow(i / n, power);
    jitter[i] = 0.75 + 0.5 * rnd();
    side[i * 2] = gauss(rnd); side[i * 2 + 1] = gauss(rnd);
  }
  return { s, ds, jitter, side };
}

const _a = new THREE.Vector3(), _v = new THREE.Vector3(), _c = new THREE.Vector3(), _p1 = new THREE.Vector3(), _p2 = new THREE.Vector3();
const _w = new THREE.Vector3(), _view = new THREE.Vector3();

/**
 * Comet tails as chains of overlapping soft sprites.
 *
 * Activity follows the sublimation rule of thumb (gas production ~ 1/r²) and switches on inside ~3.3 AU. The dust
 * tail points away from the Sun but lags behind the orbital motion, which curves it; the ion tail is a narrow,
 * straight, blue plasma stream swept directly anti-sunward by the solar wind. Scatter is seeded per comet, so the
 * tails do not shimmer. Sprite brightness is normalised by their spacing so the column density stays smooth.
 */
export class CometTails {
  enabled = true;
  scene = new THREE.Scene();
  private comets: Body[] = [];
  private seenCount = -1;
  private scatter = new Map<string, { dust: Scatter; ion: Scatter }>();
  private center = new Float32Array(CAP * 3);
  private radius = new Float32Array(CAP);
  private color = new Float32Array(CAP * 4);
  private geo = new THREE.InstancedBufferGeometry();
  private count = 0;

  constructor() {
    const quad = new THREE.PlaneGeometry(2, 2);
    this.geo.index = quad.index;
    this.geo.setAttribute('position', quad.getAttribute('position'));
    this.geo.setAttribute('iCenter', new THREE.InstancedBufferAttribute(this.center, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iRadius', new THREE.InstancedBufferAttribute(this.radius, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('iColor', new THREE.InstancedBufferAttribute(this.color, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex, fragmentShader: fragment,
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendEquation: THREE.AddEquation,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor,
    });
    const mesh = new THREE.Mesh(this.geo, mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }

  private refresh(bodies: Body[]) {
    if (bodies.length === this.seenCount) return;
    this.seenCount = bodies.length;
    this.comets = bodies.filter((b) => b.kind === 'comet');
  }

  private push(ctx: FrameContext, world: THREE.Vector3, radius: number, r: number, g: number, b: number, intensity: number) {
    if (this.count >= CAP || intensity < 1e-4) return;
    const i = this.count++;
    _view.copy(world).sub(ctx.camPos);
    this.center[i * 3] = _view.x; this.center[i * 3 + 1] = _view.y; this.center[i * 3 + 2] = _view.z;
    this.radius[i] = radius;
    this.color[i * 4] = r; this.color[i * 4 + 1] = g; this.color[i * 4 + 2] = b; this.color[i * 4 + 3] = intensity;
  }

  update(ctx: FrameContext, bodies: Body[]) {
    this.count = 0;
    if (this.enabled) {
      this.refresh(bodies);
      for (const b of this.comets) this.buildTails(ctx, b);
    }
    this.geo.instanceCount = this.count;
    for (const k of ['iCenter', 'iRadius', 'iColor']) (this.geo.getAttribute(k) as THREE.InstancedBufferAttribute).needsUpdate = true;
    this.scene.visible = this.count > 0;
  }

  private buildTails(ctx: FrameContext, b: Body) {
    const sun = b.parent;
    if (!sun || !sun.isLuminous) return;
    _a.copy(b.pos).sub(sun.pos);
    const r = _a.length();
    if (r > ACTIVE_RADIUS || r < 1e6) return;
    const act = Math.min(20, (ACTIVE_RADIUS / r) ** 2 - 1);
    if (act < 0.08) return;
    _a.multiplyScalar(1 / r);

    const km = (b.shape ? Math.max(b.shape[0], b.shape[1], b.shape[2]) : b.radius) / 1e3;
    const sizeF = Math.min(3.5, Math.max(0.6, Math.sqrt(km / 3)));
    const lumRatio = sun.luminosity / 3.828e26;
    const Ldust = 2.5e9 * act * sizeF * Math.sqrt(lumRatio);
    const Lion = Ldust * 1.8;

    _c.copy(b.pos).sub(ctx.camPos);
    const dist = _c.length();
    if (dist < 1) return;
    const extent = Lion / dist;
    if (extent / ctx.pixelAngle < 3) return;
    _view.copy(_c).applyQuaternion(ctx.camQuatInv);
    if (!isInFrustum(ctx, _view, Math.min(1.5, extent))) return;

    let sc = this.scatter.get(b.id);
    if (!sc) {
      const seed = hashString(b.id);
      sc = { dust: makeScatter(seed ^ 0x51ed, N_DUST, 1.8), ion: makeScatter(seed ^ 0xc0de, N_ION, 1.0) };
      this.scatter.set(b.id, sc);
    }

    // orthonormal basis around the tail axis
    _p1.crossVectors(_a, Math.abs(_a.z) < 0.9 ? _w.set(0, 0, 1) : _w.set(1, 0, 0)).normalize();
    _p2.crossVectors(_a, _p1);
    // the dust lags behind the orbital motion: bend towards -v (perpendicular to the tail axis)
    _v.copy(b.vel).sub(sun.vel);
    _v.addScaledVector(_a, -_v.dot(_a));
    const vperp = _v.length();
    if (vperp > 1) _v.multiplyScalar(-1 / vperp); else _v.set(0, 0, 0);
    const bend = 0.28 * Math.min(1.3, Math.max(0.25, vperp / 30e3));

    // brightness scales with local sunlight and the observer's exposure
    const flux = (AU / r) ** 2 * lumRatio;
    const e = Math.min(8, ctx.exposure * flux);
    const A = 0.16 * Math.sqrt(Math.min(act, 9)) * e;

    // coma
    this.push(ctx, b.pos, 2.5e6 * Math.sqrt(act) * sizeF + 2e5, 0.9, 0.96, 1, 0.35 * A);
    this.push(ctx, b.pos, 4e5 * Math.sqrt(act) * sizeF + 5e4, 1, 1, 1, 0.5 * A);

    // dust tail: yellowish white, wide, curved
    for (let i = 0; i < N_DUST; i++) {
      const s = sc.dust.s[i];
      const w = 0.03 + 0.15 * s;                         // half-width relative to length
      const rho = w * Ldust;
      const sh = 0.55 * rho;
      _w.copy(b.pos)
        .addScaledVector(_a, Ldust * s)
        .addScaledVector(_v, bend * Ldust * s * s)
        .addScaledVector(_p1, sc.dust.side[i * 2] * sh * 0.3)
        .addScaledVector(_p2, sc.dust.side[i * 2 + 1] * sh * 0.3);
      const B = A * Math.exp(-2.6 * s) / (1 + 9 * s);
      const I = Math.min(B * (sc.dust.ds[i] / w) * 0.6, 1.2) * sc.dust.jitter[i];
      this.push(ctx, _w, rho * 1.25 + 3e5, 1, 0.93, 0.78, I);
    }
    // ion tail: blue, narrow, straight
    for (let i = 0; i < N_ION; i++) {
      const s = sc.ion.s[i];
      const w = 0.007 + 0.016 * s;
      const rho = w * Lion;
      _w.copy(b.pos)
        .addScaledVector(_a, Lion * s)
        .addScaledVector(_p1, sc.ion.side[i * 2] * rho * 0.07)
        .addScaledVector(_p2, sc.ion.side[i * 2 + 1] * rho * 0.07);
      const B = A * 0.75 * Math.exp(-1.9 * s) / (1 + 5 * s);
      const I = Math.min(B * (sc.ion.ds[i] / w) * 0.6, 1.2) * sc.ion.jitter[i];
      this.push(ctx, _w, rho * 1.2 + 2e5, 0.5, 0.7, 1, I);
    }
  }
}
