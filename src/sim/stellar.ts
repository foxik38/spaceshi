import { L_SUN, M_SUN, R_SUN, T_SUN, G, C, SIGMA_SB, AU } from '../core/constants';
import { clamp, tempFromBV } from '../core/math';

/** Spectral class anchor points: [class index (O0=0 … M9=69), Teff]. */
const TEFF_TABLE: [string, number, number][] = [
  // class letter, subtype, Teff
  ['O', 5, 41000], ['O', 9, 31000], ['B', 0, 29000], ['B', 2, 20800], ['B', 5, 15200], ['B', 8, 11400],
  ['A', 0, 9700], ['A', 2, 8800], ['A', 5, 8100], ['F', 0, 7220], ['F', 2, 6810], ['F', 5, 6440], ['F', 8, 6200],
  ['G', 0, 5920], ['G', 2, 5770], ['G', 5, 5660], ['G', 8, 5490], ['K', 0, 5280], ['K', 2, 4990], ['K', 4, 4600],
  ['K', 7, 4100], ['M', 0, 3850], ['M', 1, 3660], ['M', 2, 3560], ['M', 3, 3430], ['M', 4, 3210], ['M', 5, 3060],
  ['M', 6, 2810], ['M', 7, 2680], ['M', 8, 2570], ['M', 9, 2380],
];
const ORDER = 'OBAFGKM';

export interface SpectralInfo {
  letter: string;      // O B A F G K M L T Y D …
  sub: number;         // 0–9
  lumClass: string;    // 'V', 'III', 'I', 'D' …
  teff: number;
  valid: boolean;
}

/** Parse strings like "G2V", "K0III-IV", "M5.5Ve", "DA4", "B9p" into approximate class information. */
export function parseSpectral(spect: string): SpectralInfo {
  const s = (spect || '').trim();
  const fail: SpectralInfo = { letter: '', sub: 5, lumClass: 'V', teff: NaN, valid: false };
  if (!s) return fail;
  let m = s.match(/^(?:sd|d|g|k|m)?([OBAFGKMLTY])\s?(\d(?:\.\d)?)?/i);
  if (/^D[A-Z]?\d?/.test(s)) {
    const t = s.match(/^D[A-Z]*\s?(\d+(?:\.\d+)?)?/);
    const idx = t && t[1] ? Number(t[1]) : 5;
    return { letter: 'D', sub: idx, lumClass: 'D', teff: clamp(50400 / Math.max(idx, 0.5), 4000, 80000), valid: true };
  }
  if (!m) return fail;
  const letter = m[1].toUpperCase();
  const sub = m[2] ? Number(m[2]) : 5;
  let lum = 'V';
  if (/Ia|Ib|I(?![IV])/.test(s.slice(1))) lum = 'I';
  else if (/III/.test(s)) lum = 'III';
  else if (/II/.test(s)) lum = 'II';
  else if (/IV/.test(s)) lum = 'IV';
  else if (/V/.test(s)) lum = 'V';
  else if (/^(sd)/.test(s)) lum = 'VI';
  else if (/^g/.test(s)) lum = 'III';
  else if (/^d/.test(s)) lum = 'V';
  let teff: number;
  if ('LTY'.includes(letter)) teff = letter === 'L' ? 2200 - sub * 100 : letter === 'T' ? 1300 - sub * 70 : 500 - sub * 30;
  else teff = teffFromClass(letter, sub);
  return { letter, sub, lumClass: lum, teff, valid: true };
}

export function teffFromClass(letter: string, sub: number): number {
  const li = ORDER.indexOf(letter);
  if (li < 0) return 5772;
  const key = li * 10 + sub;
  let prev = TEFF_TABLE[0], next = TEFF_TABLE[TEFF_TABLE.length - 1];
  for (let i = 0; i < TEFF_TABLE.length; i++) {
    const k = ORDER.indexOf(TEFF_TABLE[i][0]) * 10 + TEFF_TABLE[i][1];
    if (k <= key) prev = TEFF_TABLE[i];
    if (k >= key) { next = TEFF_TABLE[i]; break; }
  }
  const kp = ORDER.indexOf(prev[0]) * 10 + prev[1];
  const kn = ORDER.indexOf(next[0]) * 10 + next[1];
  if (kn === kp) return prev[2];
  const f = (key - kp) / (kn - kp);
  return Math.exp(Math.log(prev[2]) * (1 - f) + Math.log(next[2]) * f);
}

export function classFromTeff(T: number): string {
  let best = TEFF_TABLE[0], bd = Infinity;
  for (const e of TEFF_TABLE) {
    const d = Math.abs(Math.log(e[2] / T));
    if (d < bd) { bd = d; best = e; }
  }
  if (T < 2300) return T > 1300 ? 'L' + Math.round(clamp((2200 - T) / 100, 0, 9)) : T > 600 ? 'T' + Math.round(clamp((1300 - T) / 70, 0, 9)) : 'Y0';
  return best[0] + best[1];
}

/** Main-sequence mass (solar) from luminosity (solar) by inverting the piecewise mass–luminosity relation. */
export function massFromLuminosityMS(L: number): number {
  if (L < 0.033) return Math.pow(L / 0.23, 1 / 2.3);
  if (L < 16) return Math.pow(L, 0.25);
  if (L < 1.4 * Math.pow(55, 3.5) * 1.0) return Math.pow(L / 1.4, 1 / 3.5);
  return L / 32000;
}

/** Luminosity (solar) from mass (solar), main sequence. */
export function luminosityFromMassMS(m: number): number {
  if (m < 0.43) return 0.23 * Math.pow(m, 2.3);
  if (m < 2) return Math.pow(m, 4);
  if (m < 55) return 1.4 * Math.pow(m, 3.5);
  return 32000 * m;
}

/** Main-sequence effective temperature from mass (solar): smooth fit. */
export function teffFromMassMS(m: number): number {
  const L = luminosityFromMassMS(m);
  const R = radiusFromMassMS(m);
  return T_SUN * Math.pow(L / (R * R), 0.25);
}

export function radiusFromMassMS(m: number): number {
  if (m < 1) return Math.pow(m, 0.8);
  return Math.pow(m, 0.57);
}

export function radiusFromLT(Lsolar: number, T: number): number {
  return Math.sqrt(Lsolar) * Math.pow(T_SUN / T, 2);
}

export interface StarPhysics {
  mass: number;        // kg
  radius: number;      // m
  luminosity: number;  // W
  teff: number;        // K
  typeLabel: string;
  kind: 'star' | 'white_dwarf' | 'brown_dwarf';
  spectral: string;
}

/**
 * Best-effort physical parameters for a catalogue star from whatever is known:
 * spectral type string, absolute magnitude / luminosity, and B–V colour index.
 */
export function inferStar(opts: { spect?: string; lumSolar?: number; absmag?: number; bv?: number }): StarPhysics {
  const sp = parseSpectral(opts.spect ?? '');
  let L = opts.lumSolar && opts.lumSolar > 0 ? opts.lumSolar : NaN;
  if (!Number.isFinite(L) && opts.absmag !== undefined) L = Math.pow(10, (4.83 - opts.absmag) / 2.5);
  let T = sp.valid ? sp.teff : NaN;
  if (opts.bv !== undefined && opts.bv < 90 && (!sp.valid || sp.lumClass === 'D')) T = tempFromBV(opts.bv);
  if (!Number.isFinite(T) && opts.bv !== undefined && opts.bv < 90) T = tempFromBV(opts.bv);
  if (!Number.isFinite(T)) T = 5000;
  if (!Number.isFinite(L)) L = luminosityFromMassMS(teffToMassMS(T));

  if (sp.valid && sp.letter === 'D') {
    const mass = 0.6 * M_SUN;
    const radius = 0.0125 * R_SUN * Math.pow(0.6 / Math.max(0.3, 0.6), 1 / 3);
    const lum = 4 * Math.PI * radius * radius * SIGMA_SB * Math.pow(T, 4);
    return { mass, radius, luminosity: opts.lumSolar ? opts.lumSolar * L_SUN : lum, teff: T, typeLabel: `White dwarf (${opts.spect})`, kind: 'white_dwarf', spectral: opts.spect ?? 'D' };
  }
  const isBD = sp.valid && 'LTY'.includes(sp.letter);
  let mSolar: number;
  const lc = sp.lumClass;
  if (lc === 'I') mSolar = clamp(massFromLuminosityMS(L) * 0.9, 8, 60);
  else if (lc === 'II') mSolar = clamp(massFromLuminosityMS(L) * 0.8, 5, 15);
  else if (lc === 'III') mSolar = clamp(Math.pow(Math.max(L, 1) / 30, 0.2) * 1.6, 0.9, 6);
  else if (lc === 'IV') mSolar = clamp(massFromLuminosityMS(L * 0.4), 0.9, 4);
  else mSolar = massFromLuminosityMS(L);
  if (isBD) mSolar = clamp(0.06 - (sp.letter === 'L' ? 0 : sp.letter === 'T' ? 0.02 : 0.04), 0.012, 0.075);
  const R = radiusFromLT(L, T);
  const radius = (isBD ? 0.1 : R) * R_SUN;
  const lumW = L * L_SUN;
  const label = describeStar(sp, T, opts.spect);
  return { mass: mSolar * M_SUN, radius: Math.max(radius, 0.08 * R_SUN), luminosity: lumW, teff: T, typeLabel: label, kind: isBD ? 'brown_dwarf' : 'star', spectral: opts.spect || classFromTeff(T) + 'V' };
}

function teffToMassMS(T: number): number {
  // crude inverse of teffFromMassMS via bisection
  let lo = 0.08, hi = 60;
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (teffFromMassMS(mid) < T) lo = mid; else hi = mid;
  }
  return lo;
}

export function describeStar(sp: SpectralInfo, T: number, spect?: string): string {
  const tag = spect ? ` (${spect})` : '';
  if (sp.valid && 'LTY'.includes(sp.letter)) return `${sp.letter}-type brown dwarf${tag}`;
  const letter = sp.valid ? sp.letter : classFromTeff(T)[0];
  const lumName: Record<string, string> = { I: 'supergiant', II: 'bright giant', III: 'giant', IV: 'subgiant', V: 'main-sequence star', VI: 'subdwarf', D: 'white dwarf' };
  const lc = sp.valid ? sp.lumClass : 'V';
  const color = { O: 'blue', B: 'blue-white', A: 'white', F: 'yellow-white', G: 'yellow', K: 'orange', M: 'red' }[letter] ?? '';
  if (letter === 'M' && lc === 'V') return `Red dwarf${tag}`;
  return `${letter}-type ${color} ${lumName[lc] ?? 'star'}${tag}`;
}

// ---- derived properties ----------------------------------------------------------------------

/** Conservative habitable zone (Kopparapu 2013 simplified), in metres. */
export function habitableZone(lumW: number, teff = 5772): [number, number] {
  const L = lumW / L_SUN;
  const t = teff - T_SUN;
  const sIn = 1.7763 + 1.4335e-4 * t + 3.3954e-9 * t * t; // runaway greenhouse
  const sOut = 0.3207 + 5.4471e-5 * t + 1.5275e-9 * t * t; // maximum greenhouse
  return [Math.sqrt(L / sIn) * AU, Math.sqrt(L / sOut) * AU];
}

/** Planetary equilibrium temperature for a given Bond albedo (K). */
export function equilibriumTemperature(starLumW: number, distance: number, albedo: number): number {
  return Math.pow((starLumW * (1 - albedo)) / (16 * Math.PI * SIGMA_SB * distance * distance), 0.25);
}

export const schwarzschildRadius = (mass: number) => (2 * G * mass) / (C * C);
export const hawkingTemperature = (mass: number) => 1.227e23 / mass; // ħc³/(8πGMk_B) ≈ 1.227e23 K·kg / M
export const hillRadius = (a: number, e: number, m: number, M: number) => a * (1 - e) * Math.cbrt(m / (3 * M));
export const rocheLimitRigid = (rPrimary: number, rhoPrimary: number, rhoSat: number) => 1.26 * rPrimary * Math.cbrt(rhoPrimary / rhoSat);
export const solarMass = (kg: number) => kg / M_SUN;
