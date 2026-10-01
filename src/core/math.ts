import { DEG } from './constants';

export const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG (mulberry32). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Box–Muller gaussian from a uniform generator. */
export function gauss(rand: () => number): number {
  const u = Math.max(rand(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Solve Kepler's equation for elliptical orbits (M = E - e sin E). */
export function solveKeplerE(M: number, e: number): number {
  M = ((M % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  if (M > Math.PI) M -= 2 * Math.PI;
  let E = e < 0.8 ? M : M + 0.85 * e * Math.sign(Math.sin(M) || 1);
  for (let i = 0; i < 60; i++) {
    const f = E - e * Math.sin(E) - M;
    let d = f / (1 - e * Math.cos(E));
    // damp the step for near-parabolic orbits where the derivative can vanish
    const lim = 1.0;
    if (d > lim) d = lim; else if (d < -lim) d = -lim;
    E -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return E;
}

/** Solve the hyperbolic Kepler equation M = e sinh H - H. */
export function solveKeplerH(M: number, e: number): number {
  let H = Math.asinh(M / e);
  for (let i = 0; i < 50; i++) {
    const f = e * Math.sinh(H) - H - M;
    const d = f / (e * Math.cosh(H) - 1);
    H -= d;
    if (Math.abs(d) < 1e-13) break;
  }
  return H;
}

/**
 * Blackbody colour (linear sRGB, normalised so max component = 1) for a temperature in kelvin.
 * Planckian-locus fit by Kim et al. (2002), valid ~1667–25000 K, extended by clamping.
 */
export function blackbodyRGB(T: number): [number, number, number] {
  T = clamp(T, 1667, 25000);
  const T2 = T * T, T3 = T2 * T;
  const x = T <= 4000
    ? -0.2661239e9 / T3 - 0.234358e6 / T2 + 0.8776956e3 / T + 0.17991
    : -3.0258469e9 / T3 + 2.1070379e6 / T2 + 0.2226347e3 / T + 0.24039;
  const x2 = x * x, x3 = x2 * x;
  const y = T <= 2222
    ? -1.1063814 * x3 - 1.3481102 * x2 + 2.18555832 * x - 0.20219683
    : T <= 4000
      ? -0.9549476 * x3 - 1.37418593 * x2 + 2.09137015 * x - 0.16748867
      : 3.081758 * x3 - 5.8733867 * x2 + 3.75112997 * x - 0.37001483;
  const Y = 1, X = (x / y) * Y, Z = ((1 - x - y) / y) * Y;
  let r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  let g = -0.969266 * X + 1.8760108 * Y + 0.041556 * Z;
  let b = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  r = Math.max(r, 0); g = Math.max(g, 0); b = Math.max(b, 0);
  const m = Math.max(r, g, b) || 1;
  return [r / m, g / m, b / m];
}

/** Effective temperature from B–V colour index (Ballesteros 2012). */
export function tempFromBV(bv: number): number {
  bv = clamp(bv, -0.4, 2.2);
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** Convert RA/Dec (degrees) and distance to a cartesian equatorial (ICRS) vector. */
export function raDecToXYZ(raDeg: number, decDeg: number, dist: number, out: [number, number, number] = [0, 0, 0]) {
  const ra = raDeg * DEG, dec = decDeg * DEG, c = Math.cos(dec);
  out[0] = dist * c * Math.cos(ra);
  out[1] = dist * c * Math.sin(ra);
  out[2] = dist * Math.sin(dec);
  return out;
}

export function formatNumber(v: number, digits = 3): string {
  if (!Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6 || a < 1e-3) {
    const [m, e] = v.toExponential(digits - 1).split('e');
    return `${m}×10${superscript(Number(e))}`;
  }
  return Number(v.toPrecision(digits)).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export function superscript(n: number): string {
  return String(n).split('').map((c) => SUP[c] ?? c).join('');
}
