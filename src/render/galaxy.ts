import * as THREE from 'three';
import { LY } from '../core/constants';
import { gauss, mulberry32 } from '../core/math';
import type { FrameContext } from './context';

/** Galactic (x → centre, y → l = 90°, z → north pole) to ICRS rotation, J2000. */
const GAL_TO_EQ = new THREE.Matrix3().set(
  -0.0548755604, 0.4941094279, -0.867666149,
  -0.8734370902, -0.44482963, -0.1980763734,
  -0.4838350155, 0.7469822445, 0.4559837762,
);

export const SUN_GALACTOCENTRIC_LY = 26673;
export const SUN_Z_LY = 65;

/** Direction and distance of the Galactic centre (Sagittarius A*) from the Sun, in ly (ICRS). */
export function galacticCentreLy(): THREE.Vector3 {
  return new THREE.Vector3(SUN_GALACTOCENTRIC_LY, 0, -SUN_Z_LY).applyMatrix3(GAL_TO_EQ);
}

export function galToIcrs(x: number, y: number, z: number, out: THREE.Vector3): THREE.Vector3 {
  return out.set(x + SUN_GALACTOCENTRIC_LY, y, z - SUN_Z_LY).applyMatrix3(GAL_TO_EQ);
}

const vert = /* glsl */ `
attribute vec3 aColor;
attribute float aExt;
uniform vec3 uCamLy;
uniform float uExtMix;
uniform float uK;
uniform float uCap;
uniform float uSmear;
uniform float uPixelRatio;
uniform float uPixelAngle;
uniform float uFade;
varying vec4 vC;
void main() {
  vec3 rel = position - uCamLy;
  float d = length(rel);
  float I = min(uK / (d * d + 16000000.0), uCap) * mix(1.0, aExt, uExtMix) * uFade;
  vec4 p = projectionMatrix * viewMatrix * vec4(rel / max(d, 1e-3) * 100.0, 1.0);
  p.z = 0.0;
  gl_Position = p;
  gl_PointSize = clamp(uSmear / max(d, 1.0) / uPixelAngle, 1.6, 8.0) * uPixelRatio;
  vC = vec4(aColor, I);
}
`;
const frag = /* glsl */ `
precision highp float;
varying vec4 vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float v = vC.a * exp(-r2 * 2.6);
  gl_FragColor = vec4(vC.rgb * v, v);
}
`;

function armDensity(r: number, phi: number): number {
  // four logarithmic arms with a 12° pitch; returns a multiplier >= 1
  const pitch = 12 * (Math.PI / 180);
  let d = 0;
  for (let k = 0; k < 4; k++) {
    const phiArm = (k * Math.PI) / 2 + Math.log(Math.max(r, 500) / 3000) / Math.tan(pitch);
    let dphi = ((phi - phiArm) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
    d += Math.exp(-(dphi * dphi) / (2 * 0.22 * 0.22));
  }
  return 1 + 3.2 * d * Math.exp(-r / 26000);
}

/** Procedural Milky Way: ~250k luminous samples of a disc/arms/bar/halo model, with dust reddening for the Sun's viewpoint. */
export class MilkyWay {
  scene = new THREE.Scene();
  material: THREE.ShaderMaterial;
  points: THREE.Points;
  enabled = true;

  constructor(count = 250000) {
    const rand = mulberry32(90210);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), ext = new Float32Array(count);
    const v = new THREE.Vector3();
    const gal = new THREE.Vector3();
    const barAngle = 27 * (Math.PI / 180);
    const dust = (x: number, y: number, z: number) => {
      const r = Math.hypot(x, y);
      const phi = Math.atan2(y, x);
      const arm = armDensity(r, phi) - 1;
      return Math.exp(-Math.abs(z) / 350) * (0.25 + 0.6 * arm) * Math.exp(-r / 14000) * (r > 1800 ? 1 : r / 1800);
    };
    for (let i = 0; i < count; i++) {
      const u = rand();
      let x: number, y: number, z: number;
      let cr: number, cg: number, cb: number;
      if (u < 0.6) {
        // thin disc with spiral arms (rejection sampling)
        let r = 0, phi = 0;
        for (let t = 0; t < 30; t++) {
          r = -8500 * (Math.log(1 - rand()) + Math.log(1 - rand()));
          phi = rand() * Math.PI * 2;
          if (r < 60000 && rand() * 4.4 < armDensity(r, phi)) break;
        }
        x = r * Math.cos(phi); y = r * Math.sin(phi);
        z = -980 * Math.sign(rand() - 0.5) * Math.log(1 - rand());
        const arm = Math.min(1, (armDensity(r, phi) - 1) / 3);
        const old = Math.exp(-r / 12000);
        cr = 0.85 + 0.15 * old - 0.2 * arm; cg = 0.85 + 0.05 * old - 0.05 * arm; cb = 0.8 - 0.2 * old + 0.2 * arm;
      } else if (u < 0.74) {
        // bulge + bar
        const bx = gauss(rand) * 2400, by = gauss(rand) * 900;
        x = bx * Math.cos(barAngle) - by * Math.sin(barAngle); y = bx * Math.sin(barAngle) + by * Math.cos(barAngle);
        z = gauss(rand) * 850;
        cr = 1.0; cg = 0.83; cb = 0.55;
      } else if (u < 0.92) {
        // thick disc
        const r = -12000 * (Math.log(1 - rand()) + Math.log(1 - rand())), phi = rand() * Math.PI * 2;
        x = r * Math.cos(phi); y = r * Math.sin(phi); z = gauss(rand) * 3200;
        cr = 1.0; cg = 0.88; cb = 0.7;
      } else {
        // stellar halo
        const r = 3000 + Math.pow(rand(), 2.2) * 90000, cz = 2 * rand() - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - cz * cz);
        x = r * s * Math.cos(a); y = r * s * Math.sin(a); z = r * cz;
        cr = 1.0; cg = 0.78; cb = 0.6;
      }
      galToIcrs(x, y, z, v);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      const j = 0.85 + 0.3 * rand();
      col[i * 3] = Math.min(1, cr * j); col[i * 3 + 1] = Math.min(1, cg * j); col[i * 3 + 2] = Math.min(1, cb * j);
      // extinction along the line of sight from the Sun (galactic frame), 10 samples
      gal.set(x + SUN_GALACTOCENTRIC_LY, y, z - SUN_Z_LY);
      let tau = 0;
      const len = gal.length();
      if (len > 1) {
        const steps = 10;
        for (let s = 0; s < steps; s++) {
          const f = (s + 0.5) / steps;
          tau += dust(-SUN_GALACTOCENTRIC_LY + f * (x + SUN_GALACTOCENTRIC_LY), f * y, SUN_Z_LY + f * (z - SUN_Z_LY)) * (len / steps) * 0.00018;
        }
      }
      ext[i] = Math.exp(-tau * 2.4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aExt', new THREE.BufferAttribute(ext, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uCamLy: { value: new THREE.Vector3() }, uExtMix: { value: 1 }, uK: { value: 8e8 }, uCap: { value: 0.16 }, uSmear: { value: 400 },
        uPixelRatio: { value: 1 }, uPixelAngle: { value: 0.001 }, uFade: { value: 1 },
      },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(ctx: FrameContext, pixelRatio: number, brightness: number) {
    const u = this.material.uniforms;
    u.uCamLy.value.copy(ctx.camPos).multiplyScalar(1 / LY);
    u.uPixelRatio.value = pixelRatio;
    u.uPixelAngle.value = ctx.pixelAngle;
    const dSun = ctx.camPos.length() / LY;
    // dust lanes were baked for the Sun's viewpoint; fade them out as we leave the neighbourhood
    u.uExtMix.value = 1 - Math.min(1, Math.max(0, (dSun - 3000) / 20000));
    u.uFade.value = brightness;
    // far away the whole galaxy should still read as one object: raise brightness with distance from the galaxy centre
    const dGc = ctx.camPos.clone().sub(galacticCentreLy().multiplyScalar(LY)).length() / LY;
    u.uK.value = 8e8 * Math.min(25, 1 + Math.max(0, dGc - 30000) / 15000);
  }
}

// ------------------------------------------------------------------ distant galaxies

const wvert = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
uniform vec3 uCamLy;
uniform float uPixelRatio;
uniform float uPixelAngle;
uniform float uK;
varying vec4 vC;
void main() {
  vec3 rel = position - uCamLy;
  float d = length(rel);
  vec4 p = projectionMatrix * viewMatrix * vec4(rel / max(d, 1e-3) * 100.0, 1.0);
  p.z = 0.0;
  gl_Position = p;
  float px = aSize / max(d, 1.0) / uPixelAngle;
  float I = uK * aSize * aSize / (d * d + aSize * aSize * 4.0);
  gl_PointSize = clamp(1.4 + px, 1.4, 22.0) * uPixelRatio;
  vC = vec4(aColor, min(I, 1.5) * (1.0 - smoothstep(0.0, aSize * 1.0, aSize * 0.8 - d) * 0.0));
}
`;

/** Procedural background galaxies laid out on a cosmic-web-like distribution (filaments and voids). */
export class CosmicWeb {
  scene = new THREE.Scene();
  material: THREE.ShaderMaterial;
  points: THREE.Points;

  constructor(count = 70000, radiusLy = 6e8) {
    const rand = mulberry32(1337);
    const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), size = new Float32Array(count);
    // filament nodes: galaxies are placed along random segments between "cluster" nodes
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < 90; i++) {
      const r = radiusLy * Math.cbrt(rand()), cz = 2 * rand() - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - cz * cz);
      nodes.push(new THREE.Vector3(r * s * Math.cos(a), r * s * Math.sin(a), r * cz));
    }
    const edges: [number, number][] = [];
    for (let i = 0; i < nodes.length; i++) {
      const near = nodes.map((n, j) => ({ j, d: n.distanceTo(nodes[i]) })).filter((o) => o.j !== i).sort((p, q) => p.d - q.d).slice(0, 3);
      for (const n of near) edges.push([i, n.j]);
    }
    const p = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const u = rand();
      if (u < 0.55) {
        const [a, b] = edges[Math.floor(rand() * edges.length)];
        const t = rand();
        p.copy(nodes[a]).lerp(nodes[b], t);
        const scatter = 1.2e7 + 2.5e7 * rand();
        p.x += gauss(rand) * scatter; p.y += gauss(rand) * scatter; p.z += gauss(rand) * scatter;
      } else if (u < 0.75) {
        const n = nodes[Math.floor(rand() * nodes.length)];
        p.copy(n); const s = 1.5e7; p.x += gauss(rand) * s; p.y += gauss(rand) * s; p.z += gauss(rand) * s;
      } else {
        const r = radiusLy * Math.cbrt(rand()), cz = 2 * rand() - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - cz * cz);
        p.set(r * s * Math.cos(a), r * s * Math.sin(a), r * cz);
      }
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      const elliptical = rand() < 0.4;
      col[i * 3] = elliptical ? 1.0 : 0.72; col[i * 3 + 1] = elliptical ? 0.88 : 0.84; col[i * 3 + 2] = elliptical ? 0.7 : 1.0;
      size[i] = (elliptical ? 40000 : 70000) * (0.4 + rand() * 1.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e12);
    this.material = new THREE.ShaderMaterial({
      vertexShader: wvert, fragmentShader: frag, uniforms: { uCamLy: { value: new THREE.Vector3() }, uPixelRatio: { value: 1 }, uPixelAngle: { value: 0.001 }, uK: { value: 0.25 } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(ctx: FrameContext, pixelRatio: number) {
    const u = this.material.uniforms;
    u.uCamLy.value.copy(ctx.camPos).multiplyScalar(1 / LY);
    u.uPixelRatio.value = pixelRatio;
    u.uPixelAngle.value = ctx.pixelAngle;
  }
}
