import * as THREE from 'three';
import { LY } from '../core/constants';
import { hashString } from '../core/math';
import type { DsoCatalog } from '../data/dsoCatalog';
import { noiseGLSL } from './shaders/noise';
import type { FrameContext } from './context';

const vert = /* glsl */ `
attribute vec3 iPos;      // ly (ICRS, relative to Sun)
attribute vec4 iA;        // size (ly), angle (rad), axis ratio, class (0 elliptical,1 lenticular,2 spiral,3 irregular,4 emission,5 reflection,6 planetary,7 snr,8 globular,9 open,10 generic nebula)
attribute vec4 iB;        // rgb colour, flux (relative)
attribute float iSeed;
uniform vec3 uCamLy;
uniform float uPixelAngle;
uniform float uPixelRatio;
varying vec2 vUv;
varying vec4 vA;
varying vec4 vB;
varying float vSeed;
varying float vFade;
varying float vSbScale;
void main() {
  vec3 rel = iPos - uCamLy;
  float d = length(rel);
  float size = iA.x;
  float minSize = 3.2 * uPixelAngle * d;
  float eff = max(size, minSize);
  // inside the object: stop drawing the billboard
  float inside = smoothstep(0.35, 1.1, d / size);
  vFade = inside;
  vSbScale = (size * size) / (eff * eff);
  vec3 c = (viewMatrix * vec4(rel, 0.0)).xyz;
  vec3 fwd = normalize(c);
  vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(right, fwd);
  vec2 q = position.xy;
  vec3 vp = c + (right * q.x + up * q.y) * eff * 0.5 * 1.25;
  vec4 p = projectionMatrix * vec4(vp, 1.0);
  p.z = 0.0;
  if (c.z >= -1e-3 || inside < 0.001) p = vec4(2.0, 2.0, 2.0, 1.0);
  gl_Position = p;
  vUv = q * 1.25;
  vA = iA; vB = iB; vSeed = iSeed;
}
`;

const frag = /* glsl */ `
precision highp float;
precision highp int;
varying vec2 vUv;
varying vec4 vA;
varying vec4 vB;
varying float vSeed;
varying float vFade;
varying float vSbScale;
uniform float uGain;
${noiseGLSL}

vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }

vec3 galaxy(vec2 uv, float cls, float q, uint seed) {
  vec2 p = uv;
  p = rot(p, vA.y);
  p.y /= max(q, 0.12);
  float r = length(p);
  vec3 col = vec3(0.0);
  float I = 0.0;
  if (cls < 0.5) {                       // elliptical: de Vaucouleurs profile
    I = exp(-7.67 * (pow(max(r / 0.32, 1e-3), 0.25) - 1.0)) * 0.9;
    col = vB.rgb * vec3(1.0, 0.9, 0.75) * I;
  } else if (cls < 1.5) {                // lenticular
    float bulge = exp(-pow(max(r, 1e-4) / 0.07, 0.6) * 1.6);
    float disk = exp(-r / 0.24) * smoothstep(0.0, 0.03, r + 0.02);
    col = vec3(1.0, 0.86, 0.66) * (bulge * 1.1 + disk * 0.35);
  } else if (cls < 2.5) {                // spiral
    float th = atan(p.y, p.x);
    float bulge = exp(-pow(max(r, 1e-4) / 0.075, 0.55) * 1.7);
    float disk = exp(-r / 0.26);
    float arms = 2.0 + floor(float(seed % 3u));
    float tight = 3.2 + 3.0 * fract(float(seed) * 0.37);
    vec4 nz = noised(vec3(p * 6.0, float(seed % 97u)), seed);
    float phase = th * arms + log(r + 0.03) * tight + nz.x * 0.7;
    float cs = 0.5 + 0.5 * cos(phase);
    float arm = cs * cs * cs * smoothstep(0.04, 0.15, r) * exp(-r / 0.36);
    float knots = smoothstep(0.55, 0.85, fbm(vec3(p * 24.0, 3.0), 3.0, seed + 5u) * 0.5 + 0.5) * arm;
    col = vec3(1.0, 0.82, 0.58) * bulge * 1.3 + vec3(0.75, 0.82, 1.0) * disk * 0.22 + vec3(0.55, 0.7, 1.0) * arm * 0.85 + vec3(1.0, 0.45, 0.6) * knots * 0.7;
    // dust lanes darken the mid-plane of inclined discs
    float lane = exp(-(p.y / 0.03) * (p.y / 0.03)) * (1.0 - smoothstep(0.35, 0.9, q)) * smoothstep(0.05, 0.3, abs(p.x));
    col *= 1.0 - 0.75 * lane;
  } else {                               // irregular
    float n = fbm(vec3(p * 5.0, 2.0), 4.0, seed) * 0.5 + 0.5;
    float m = smoothstep(0.42, 0.85, n) * exp(-(r / 0.55) * (r / 0.55));
    col = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.6, 0.7), smoothstep(0.7, 1.0, n)) * m;
  }
  return col * smoothstep(1.0, 0.86, r * 1.0);
}

vec3 nebula(vec2 uv, float cls, uint seed) {
  float r = length(uv) * 0.8;
  float fall = smoothstep(1.0, 0.25, r);
  vec3 base = vB.rgb;
  float n = fbm(vec3(uv * 3.2, float(seed % 31u)), 5.0, seed) * 0.5 + 0.5;
  float n2 = fbm(vec3(uv * 8.0 + 4.0, 1.0), 4.0, seed + 9u) * 0.5 + 0.5;
  float d = smoothstep(0.32, 0.9, n) * fall;
  vec3 col = base * d * (0.5 + 0.9 * n2);
  if (cls > 5.5 && cls < 6.5) {          // planetary nebula: bright ring + fainter halo
    float ring = exp(-((r - 0.42) / 0.11) * ((r - 0.42) / 0.11)) * (0.7 + 0.5 * n2);
    col = mix(vec3(0.3, 0.9, 0.8), vec3(0.9, 0.3, 0.35), smoothstep(0.35, 0.6, r)) * (ring * 1.4 + exp(-r * r * 8.0) * 0.25);
  } else if (cls > 6.5 && cls < 7.5) {   // supernova remnant: filamentary shell
    float f = abs(fbm(vec3(uv * 7.0, 2.0), 5.0, seed) );
    float shell = exp(-((r - 0.62) / 0.18) * ((r - 0.62) / 0.18)) * (1.0 - smoothstep(0.0, 0.5, f));
    col = mix(vec3(0.4, 0.7, 1.0), vec3(1.0, 0.35, 0.45), n2) * (shell * 1.6 + d * 0.15);
  } else if (cls > 4.5 && cls < 5.5) {   // reflection: soft blue
    col = vec3(0.45, 0.6, 1.0) * (d * 0.9 + exp(-r * r * 5.0) * 0.25) * (0.6 + 0.6 * n2);
  }
  return col * fall;
}

vec3 cluster(vec2 uv, float cls, uint seed) {
  float r = length(uv) * 0.8;
  if (cls > 7.5 && cls < 8.5) {          // globular: King-like profile
    float I = 1.0 / (1.0 + (r / 0.16) * (r / 0.16)) * (1.0 - smoothstep(0.55, 1.0, r));
    return vec3(1.0, 0.9, 0.72) * I;
  }
  // open cluster: knotty, faint glow
  float n = fbm(vec3(uv * 9.0, float(seed % 13u)), 3.0, seed) * 0.5 + 0.5;
  float I = exp(-r * r * 4.0) * (0.5 + n) * 0.5;
  return vec3(0.75, 0.85, 1.0) * I;
}

void main() {
  float r = length(vUv);
  if (r > 1.25) discard;
  // the seed is an integer carried in a float varying: interpolation can land a hair below it, and truncating that
  // would give each scanline of a sprite a different hash (rectangular dashes), so round instead
  uint seed = uint(vSeed + 0.5);
  float cls = vA.w;
  vec3 c;
  if (cls < 3.5) c = galaxy(vUv * 0.8, cls, vA.z, seed);
  else if (cls > 7.5) c = cluster(vUv, cls, seed);
  else c = nebula(vUv, cls, seed);
  float flux = vB.a;
  c *= flux * uGain * vFade * vSbScale;
  gl_FragColor = vec4(c, max(max(c.r, c.g), c.b));
}
`;

const CLASS: Record<string, number> = { G: 2, GPair: 2, GTrpl: 2, GGroup: 2, OCl: 9, GCl: 8, PN: 6, Neb: 10, HII: 4, 'Cl+N': 4, RfN: 5, EmN: 4, SNR: 7, Nova: 6, '*Ass': 9, DrkN: 10 };

function galaxyClass(hubble: string): number {
  const h = (hubble || '').trim();
  if (!h) return 2;
  if (/^(E|cD|D)/i.test(h)) return 0;
  if (/^S0/i.test(h)) return 1;
  if (/^(I|Irr|Sm|Sdm)/i.test(h)) return 3;
  return 2;
}

/** All NGC/IC/Messier objects as physically-sized procedural sprites (galaxies, nebulae, clusters). */
export class DeepSky {
  scene = new THREE.Scene();
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  enabled = true;

  constructor(cat: DsoCatalog) {
    const n = cat.objects.length;
    const iPos = new Float32Array(n * 3), iA = new Float32Array(n * 4), iB = new Float32Array(n * 4), iSeed = new Float32Array(n);
    cat.objects.forEach((o, i) => {
      iPos[i * 3] = o.x; iPos[i * 3 + 1] = o.y; iPos[i * 3 + 2] = o.z;
      const isGal = o.type === 'G' || o.type.startsWith('G') && o.type !== 'GCl';
      let cls = isGal ? galaxyClass(o.hubble) : CLASS[o.type] ?? 10;
      const maj = Math.max(o.majArcmin, 0.3), min = o.minArcmin > 0 ? o.minArcmin : maj;
      iA[i * 4] = o.sizeLy;
      iA[i * 4 + 1] = ((o.posAngle || 0) * Math.PI) / 180;
      iA[i * 4 + 2] = Math.min(1, Math.max(0.12, min / maj));
      iA[i * 4 + 3] = cls;
      // colour by class
      let c: [number, number, number] = [1, 1, 1];
      if (cls === 0) c = [1, 0.85, 0.65];
      else if (cls === 4) c = [1, 0.35, 0.42];
      else if (cls === 5) c = [0.45, 0.6, 1];
      else if (cls === 10) c = [0.75, 0.4, 0.9];
      iB[i * 4] = c[0]; iB[i * 4 + 1] = c[1]; iB[i * 4 + 2] = c[2];
      // flux relative: brighter (lower magnitude) objects glow more; extended objects need surface-brightness normalisation
      const mag = o.mag < 90 ? o.mag : 13;
      // surface brightness (mag / arcsec²) sets the displayed radiance; it stays constant with distance until the object shrinks below a few pixels
      const areaArcsec2 = Math.max(Math.PI * 0.25 * maj * min * 3600, 4);
      const sb = mag + 2.5 * Math.log10(areaArcsec2);
      iB[i * 4 + 3] = Math.min(6, Math.max(0.02, Math.pow(10, -0.4 * (sb - 22))));
      iSeed[i] = hashString(o.id) % 100000;
    });
    const quad = new THREE.PlaneGeometry(2, 2);
    const g = new THREE.InstancedBufferGeometry();
    g.index = quad.index;
    g.setAttribute('position', quad.getAttribute('position'));
    g.setAttribute('iPos', new THREE.InstancedBufferAttribute(iPos, 3));
    g.setAttribute('iA', new THREE.InstancedBufferAttribute(iA, 4));
    g.setAttribute('iB', new THREE.InstancedBufferAttribute(iB, 4));
    g.setAttribute('iSeed', new THREE.InstancedBufferAttribute(iSeed, 1));
    g.instanceCount = n;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e12);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: { uCamLy: { value: new THREE.Vector3() }, uPixelAngle: { value: 0.001 }, uPixelRatio: { value: 1 }, uGain: { value: 0.16 } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(g, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  update(ctx: FrameContext, pixelRatio: number, gain: number) {
    const u = this.material.uniforms;
    u.uCamLy.value.copy(ctx.camPos).multiplyScalar(1 / LY);
    u.uPixelAngle.value = ctx.pixelAngle;
    u.uPixelRatio.value = pixelRatio;
    u.uGain.value = gain;
  }
}
