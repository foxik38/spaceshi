import * as THREE from 'three';
import { hashString } from '../core/math';
import type { RingSpec } from '../sim/body';

const loader = new THREE.TextureLoader();
const cache = new Map<string, THREE.Texture>();
const dummy = (() => {
  const t = new THREE.DataTexture(new Uint8Array([128, 128, 255, 255]), 1, 1);
  t.needsUpdate = true;
  return t;
})();
const dummyBlack = (() => {
  const t = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
  t.needsUpdate = true;
  return t;
})();

export const baseUrl = (import.meta as any).env?.BASE_URL ?? './';

/** Loads (and caches) a texture from /textures. Returns a 1×1 placeholder until loaded. */
export function loadTexture(file: string | undefined, opts: { srgb?: boolean; anisotropy?: number } = {}): THREE.Texture {
  if (!file) return dummyBlack;
  const key = file + (opts.srgb === false ? ':lin' : '');
  const hit = cache.get(key);
  if (hit) return hit;
  const tex = loader.load(`${baseUrl}textures/${file}`, undefined, undefined, () => console.warn('texture failed', file));
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.anisotropy = opts.anisotropy ?? 8;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  cache.set(key, tex);
  return tex;
}

export const placeholderTexture = dummy;
export const blackTexture = dummyBlack;

// ---------------------------------------------------------------- rings

function vnoise(seed: number) {
  const tbl = new Float32Array(4096);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < tbl.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; tbl[i] = s / 4294967296; }
  return (x: number) => {
    const i = Math.floor(x), f = x - i;
    const a = tbl[i & 4095], b = tbl[(i + 1) & 4095];
    const u = f * f * (3 - 2 * f);
    return a + (b - a) * u;
  };
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gap = (r: number, c: number, w: number) => 1 - Math.exp(-Math.pow((r - c) / w, 2));
const narrow = (r: number, c: number, w: number) => Math.exp(-Math.pow((r - c) / w, 2));

/** Builds a 1D radial RGBA lookup (colour, opacity) for a ring system. */
export function makeRingTexture(spec: RingSpec): THREE.DataTexture {
  const N = 2048;
  const data = new Uint8Array(N * 4);
  const n1 = vnoise(hashString(String(spec.seed)) + 1), n2 = vnoise(spec.seed * 977 + 13), n3 = vnoise(spec.seed * 31 + 7);
  const col = new THREE.Color(spec.color);
  const profile = spec.profile ?? 'generic';
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1);
    const r = spec.inner + u * (spec.outer - spec.inner);
    let op = 0.5;
    let tint = 1;
    const fine = 0.65 + 0.35 * n1(u * 900) + 0.2 * (n2(u * 3200) - 0.5);
    if (profile === 'saturn') {
      const km = r / 1e3;
      if (km < 91975) { op = (0.1 + 0.16 * n3(u * 40)) * smooth(74658, 75500, km); tint = 0.55; }          // C ring
      else if (km < 117507) { const x = (km - 91975) / (117507 - 91975); op = (0.62 + 0.4 * n3(u * 60) + 0.25 * Math.sin(x * 14)) * (0.55 + 0.45 * smooth(0, 0.12, x)); tint = 1.0; op = Math.min(op, 1.3); } // B ring
      else if (km < 122340) { op = 0.06 + 0.07 * n3(u * 120); tint = 0.7; if (Math.abs(km - 119900) < 60) op += 0.3; }       // Cassini division
      else if (km < 136775) { op = (0.4 + 0.18 * n3(u * 90)) * gap(km, 133423, 30) * gap(km, 136500, 20); tint = 0.9; }           // A ring
      else { op = 0.0; }
      op += 0.5 * narrow(km, 140220, 60);                                                          // F ring
      op += 0.04 * (km < 74658 ? 1 : 0);
      op *= fine * 0.9 + 0.1;
      // ring particles are slightly brown in B
      if (km > 91975 && km < 117507) tint = 1.0;
    } else if (profile === 'uranus') {
      const km = r / 1e3;
      const rings: [number, number, number][] = [[41837, 3, 0.15], [42234, 4, 0.15], [42571, 3, 0.15], [44718, 4, 0.25], [45661, 4, 0.2], [47176, 2, 0.1], [47626, 4, 0.3], [48300, 5, 0.35], [50024, 4, 0.2], [51149, 25, 0.75]];
      op = 0;
      for (const [c, w, o] of rings) op += o * narrow(km, c, Math.max(w, 60));
      op = Math.min(op, 0.9);
      tint = 0.5;
    } else if (profile === 'neptune') {
      const km = r / 1e3;
      op = 0.4 * narrow(km, 41900, 80) + 0.35 * narrow(km, 53200, 100) + 0.3 * narrow(km, 57200, 120) + 0.35 * narrow(km, 62933, 150) + 0.06 * smooth(53000, 63000, km);
      tint = 0.5;
    } else if (profile === 'jupiter') {
      const km = r / 1e3;
      op = 0.5 * smooth(122500, 123500, km) * (1 - smooth(128000, 129500, km)) + 0.05;
      tint = 0.4;
    } else {
      op = spec.opacity * (0.5 + 0.5 * n1(u * 200)) * fine;
      for (const [a, b] of spec.gaps ?? []) if (u > a && u < b) op *= 0.03;
    }
    op = Math.min(1, Math.max(0, op * spec.opacity / (profile === 'saturn' || profile === 'generic' ? 0.92 : 1)));
    data[i * 4] = Math.min(255, Math.floor(col.r * 255 * tint));
    data[i * 4 + 1] = Math.min(255, Math.floor(col.g * 255 * tint));
    data[i * 4 + 2] = Math.min(255, Math.floor(col.b * 255 * tint));
    data[i * 4 + 3] = Math.floor(op * 255);
  }
  const tex = new THREE.DataTexture(data, N, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}
