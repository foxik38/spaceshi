import * as THREE from 'three';
import { AU, G } from '../core/constants';
import { solveKeplerE, solveKeplerH } from '../core/math';
import type { Body } from '../sim/body';
import { ECLIPTIC_TO_ICRS, meanMotion, orbitPath, type Elements } from '../sim/kepler';
import { equatorPlaneQuat } from '../sim/universe';
import type { FrameContext } from './context';

const vert = /* glsl */ `
attribute float aT;
uniform float uPhase;
uniform float uClosed;
uniform float uTrail;
varying float vA;
varying vec3 vView;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vView = mv.xyz;
  gl_Position = projectionMatrix * mv;
  gl_Position.z = 0.0;
  float f = uPhase - aT;
  if (uClosed > 0.5) f = fract(f);
  float lit = f >= 0.0 ? pow(clamp(1.0 - f / uTrail, 0.0, 1.0), 2.2) : 0.0;
  vA = mix(0.16, 1.0, lit);
}
`;

const frag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
uniform vec4 uOcc[6];
uniform int uOccN;
varying float vA;
varying vec3 vView;
void main() {
  float pp = dot(vView, vView);
  for (int i = 0; i < 6; i++) {
    if (i >= uOccN) break;
    vec3 c = uOcc[i].xyz;
    float s = dot(c, vView) / pp;
    if (s > 0.0) {
      float d2 = dot(c, c) - s * s * pp;
      if (d2 < uOcc[i].w * uOcc[i].w * 1.06) discard;
    }
  }
  gl_FragColor = vec4(uColor * vA * uAlpha, vA * uAlpha);
}
`;

interface Entry {
  body: Body;
  line: THREE.Line;
  mat: THREE.ShaderMaterial;
  geo: THREE.BufferGeometry;
  hyper: boolean;
  hmax: number;
  builtAt: number;
  count: number;
}

const COLORS: Record<string, [number, number, number]> = {
  planet: [0.55, 0.78, 1.0], gas_giant: [0.55, 0.78, 1.0], ice_giant: [0.55, 0.78, 1.0], dwarf_planet: [0.72, 0.72, 0.9],
  moon: [0.55, 0.7, 0.85], asteroid: [0.7, 0.66, 0.6], comet: [0.5, 0.9, 0.8], satellite: [0.5, 0.95, 0.65], probe: [0.5, 0.95, 0.65],
  star: [1, 0.9, 0.6], default: [0.6, 0.75, 0.95],
};
const SEL: [number, number, number] = [1.0, 0.72, 0.36];
const _pos = new THREE.Vector3(), _rel = new THREE.Vector3(), _q = new THREE.Quaternion();

/** Orbit paths for every body on Kepler rails; brightest just behind the body, fading around the ellipse. */
export class OrbitLines {
  scene = new THREE.Scene();
  private entries = new Map<Body, Entry>();
  enabled = true;
  /** Show orbits of moons, satellites and probes around planets (off by default). */
  moonOrbits = false;
  private gc = 0;

  private source(b: Body, t: number): { el: Elements; parent: Body } | null {
    if (b.dynamic) return b.osc ? { el: b.osc.el, parent: b.osc.parent } : null;
    const el = b.elementsAt ? b.elementsAt(t) : b.elements;
    if (!el || !b.parent) return null;
    return { el, parent: b.parent };
  }

  private build(b: Body, t: number): Entry | null {
    const src = this.source(b, t);
    if (!src) return null;
    const el = src.el;
    const count = el.e < 1 ? (el.e > 0.6 ? 512 : 320) : 400;
    const arr = new Float32Array(count * 3);
    const info = orbitPath(el, t, count, arr, 800 * AU);
    this.rotateToIcrs(arr, el, src.parent);
    const aT = new Float32Array(count);
    for (let i = 0; i < count; i++) aT[i] = info.hyper ? i / (count - 1) : i / count;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.setAttribute('aT', new THREE.BufferAttribute(aT, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e30);
    const c = COLORS[b.kind] ?? COLORS.default;
    const mat = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uPhase: { value: 0 }, uClosed: { value: info.hyper ? 0 : 1 }, uTrail: { value: 0.75 }, uColor: { value: new THREE.Vector3(...c) }, uAlpha: { value: 0.5 },
        uOcc: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, uOccN: { value: 0 },
      },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const line = info.hyper ? new THREE.Line(geo, mat) : new THREE.LineLoop(geo, mat);
    line.frustumCulled = false;
    this.scene.add(line);
    return { body: b, line, mat, geo, hyper: info.hyper, hmax: info.hmax, builtAt: t, count };
  }

  private rotateToIcrs(arr: Float32Array, el: Elements, parent: Body) {
    let q: THREE.Quaternion | null = null;
    if (el.plane === 'ecliptic') q = ECLIPTIC_TO_ICRS;
    else if (el.plane === 'parent' && parent.spin) q = equatorPlaneQuat(parent.spin.pole, _q);
    if (!q) return;
    for (let i = 0; i < arr.length; i += 3) {
      _rel.set(arr[i], arr[i + 1], arr[i + 2]).applyQuaternion(q);
      arr[i] = _rel.x; arr[i + 1] = _rel.y; arr[i + 2] = _rel.z;
    }
  }

  private rebuild(e: Entry, t: number) {
    const b = e.body;
    const src = this.source(b, t);
    if (!src) return;
    const el = src.el;
    const pos = e.geo.getAttribute('position') as THREE.BufferAttribute;
    const info = orbitPath(el, t, e.count, pos.array as Float32Array, 800 * AU);
    this.rotateToIcrs(pos.array as Float32Array, el, src.parent);
    pos.needsUpdate = true;
    e.hmax = info.hmax;
    e.builtAt = t;
  }

  update(ctx: FrameContext, bodies: Body[], selected: Body | null, hovered: Body | null, resolved: Body[], t: number, showAll: boolean) {
    let rebuilds = 0;
    const occ = resolved.filter((b) => b.screenRadiusPx > 6).sort((a, b) => b.screenRadiusPx - a.screenRadiusPx).slice(0, 6);
    for (const b of bodies) {
      const en = this.entries.get(b);
      let entry = en;
      if (b.customRails) { if (en) en.line.visible = false; continue; }
      const src = this.source(b, t);
      if (!src) { if (en) en.line.visible = false; continue; }
      const parent = src.parent;
      // orbits around planets and moons are hidden unless explicitly enabled
      if (!this.moonOrbits && (parent.parent || !parent.isLuminous && parent.kind !== 'black_hole')) { if (en) en.line.visible = false; continue; }
      const isSel = b === selected || b === hovered;
      // apparent size of the orbit on screen
      _pos.copy(parent.pos).sub(ctx.camPos);
      const dParent = _pos.length();
      const el = src.el;
      const scale = el.e < 1 ? Math.abs(el.a) * (1 + el.e) : Math.abs(el.a) * Math.max(el.e - 1, 0.5) * 2;
      const px = scale / Math.max(dParent, 1) / ctx.pixelAngle;
      let visible = this.enabled && showAll;
      if (isSel) visible = true;
      if (visible && !isSel) {
        if (px < 14) visible = false;
        else if (b.kind === 'asteroid' && (dParent > 6 * AU || b.radius < 2e5)) visible = false;
        else if (b.kind === 'comet' && dParent > 120 * AU) visible = false;
        else if ((b.kind === 'satellite') && px < 24) visible = false;
        else if (b.kind === 'moon' && b.radius < 5e4 && px < 60) visible = false;
      }
      if (!visible) { if (entry) entry.line.visible = false; continue; }
      if (entry && (el.e >= 1) !== entry.hyper) {
        this.scene.remove(entry.line); entry.geo.dispose(); entry.mat.dispose(); this.entries.delete(b); entry = undefined;
      }
      if (!entry) {
        const built = this.build(b, t);
        if (!built) continue;
        entry = built;
        this.entries.set(b, entry);
      }
      if (b.dynamic) {
        if (rebuilds < 12 && (this.gc % 3 === 0 || isSel)) { this.rebuild(entry, t); rebuilds++; }
      } else if (rebuilds < 6 && (b.elementsAt || el.dOm || el.dw) && Math.abs(t - entry.builtAt) > (b.kind === 'moon' ? 8 * 86400 : 60 * 86400)) {
        this.rebuild(entry, t);
        rebuilds++;
      }
      entry.line.visible = true;
      entry.line.position.copy(_pos.copy(parent.pos).sub(ctx.camPos));
      // current phase parameter
      const mu = G * (parent.mass + b.mass);
      const n = meanMotion(el, mu);
      const M = el.M0 + n * (t - el.t0);
      let phase: number;
      if (el.e < 1) phase = (((solveKeplerE(M, el.e) / (Math.PI * 2)) % 1) + 1) % 1;
      else phase = Math.min(1, Math.max(0, (solveKeplerH(M, el.e) / entry.hmax + 1) / 2));
      const u = entry.mat.uniforms;
      u.uPhase.value = phase;
      const c = isSel ? SEL : COLORS[b.kind] ?? COLORS.default;
      u.uColor.value.set(c[0], c[1], c[2]);
      const fade = Math.min(1, (px - 14) / 40);
      u.uAlpha.value = isSel ? 0.95 : (b.kind === 'planet' || b.kind === 'gas_giant' || b.kind === 'ice_giant' ? 0.55 : 0.36) * Math.max(0.15, fade);
      // occluders in view space
      let n2 = 0;
      for (const o of occ) {
        if (n2 >= 6) break;
        const v = (u.uOcc.value as THREE.Vector4[])[n2++];
        _rel.copy(o.pos).sub(ctx.camPos).applyQuaternion(ctx.camQuatInv);
        v.set(_rel.x, _rel.y, _rel.z, o.radius * 1.002);
      }
      u.uOccN.value = n2;
    }
    // drop entries for removed bodies (checked occasionally)
    if (++this.gc % 120 === 0) {
      const alive = new Set(bodies);
      for (const [b, e] of this.entries) {
        if (!alive.has(b)) { this.scene.remove(e.line); e.geo.dispose(); e.mat.dispose(); this.entries.delete(b); }
      }
    }
  }
}
