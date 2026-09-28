import { AU, C, G, L_SUN, M_EARTH, M_JUP, M_SUN, R_EARTH, R_JUP, R_SUN, SIGMA_SB } from '../core/constants';
import { blackbodyRGB, hashString, mulberry32 } from '../core/math';
import { Body, poleFromRaDec, type BodyKind, type Look } from '../sim/body';
import { classFromTeff, luminosityFromMassMS, radiusFromMassMS, teffFromMassMS } from '../sim/stellar';

export interface Preset {
  id: string;
  label: string;
  group: 'Stars' | 'Compact objects' | 'Planets' | 'Giants' | 'Small bodies';
  kind: BodyKind;
  /** default mass in kg */
  mass: number;
  /** slider range for the custom mass control (log10 kg) */
  massRange: [number, number];
  build(seed: number): Partial<{ radius: number; look: Look; atmosphere: Body['atmosphere']; temperature: number; albedo: number; luminosity: number; spectral: string; typeLabel: string; shape: [number, number, number]; flattening: number }>;
}

const rnd = (seed: number) => mulberry32(seed);
const pick = <T,>(r: () => number, a: T[]) => a[Math.floor(r() * a.length)];

const EARTH_ATMO = { height: 100e3, scaleHeight: 8500, rayleigh: [5.8e-6, 13.5e-6, 33.1e-6] as [number, number, number], mie: 4e-6, mieG: 0.8, mieHeight: 1200, absorb: [0.65e-6, 1.88e-6, 0.09e-6] as [number, number, number], pressure: 101325, composition: 'N₂, O₂ (user-defined)' };

function star(m: number): ReturnType<Preset['build']> {
  const msun = m / M_SUN;
  const L = luminosityFromMassMS(msun) * L_SUN;
  const T = teffFromMassMS(msun);
  const R = radiusFromMassMS(msun) * R_SUN;
  const cls = classFromTeff(T);
  return {
    radius: R, luminosity: L, temperature: T, albedo: 0, spectral: cls + 'V',
    look: { style: 'sun', seed: 7, palette: ['#ffffff'], params: { granulation: 1, spots: T < 6500 ? 0.5 : 0 } },
  };
}

const ROCKY_PAL: Record<string, string[]> = {
  mercury: ['#8c8580', '#5a5652', '#b5aca4', '#77706a', '#cfc8c0'],
  desert: ['#c9a06a', '#8f6a3f', '#dcc08c', '#4a3a28', '#f2ece2'],
  lava: ['#2a1c18', '#1a100e', '#6e3a20', '#ff6a20', '#3a2a24'],
  ice: ['#dfe6ea', '#b8c6d0', '#f4f8fa', '#7d93a3', '#ffffff'],
};

export const PRESETS: Preset[] = [
  { id: 'sun-like', label: 'Sun-like star', group: 'Stars', kind: 'star', mass: M_SUN, massRange: [29, 32], build: () => star(M_SUN) },
  { id: 'red-dwarf', label: 'Red dwarf', group: 'Stars', kind: 'star', mass: 0.2 * M_SUN, massRange: [29, 32], build: () => star(0.2 * M_SUN) },
  { id: 'blue-giant', label: 'Blue star (10 M☉)', group: 'Stars', kind: 'star', mass: 10 * M_SUN, massRange: [29, 32.5], build: () => star(10 * M_SUN) },
  { id: 'white-dwarf', label: 'White dwarf', group: 'Compact objects', kind: 'white_dwarf', mass: 0.6 * M_SUN, massRange: [29.5, 30.3],
    build: () => ({ radius: 7.0e6, temperature: 12000, luminosity: 4 * Math.PI * 7e6 ** 2 * SIGMA_SB * 12000 ** 4, albedo: 0, spectral: 'DA', typeLabel: 'White dwarf', look: { style: 'whitedwarf', seed: 3, palette: ['#ffffff'], params: {} } }) },
  { id: 'neutron-star', label: 'Neutron star', group: 'Compact objects', kind: 'neutron_star', mass: 1.4 * M_SUN, massRange: [30.2, 30.6],
    build: () => ({ radius: 12e3, temperature: 1e6, luminosity: 3e25, albedo: 0, typeLabel: 'Neutron star', look: { style: 'neutron', seed: 4, palette: ['#bcd4ff'], params: {} } }) },
  { id: 'stellar-bh', label: 'Stellar black hole (10 M☉)', group: 'Compact objects', kind: 'black_hole', mass: 10 * M_SUN, massRange: [30.2, 32.4],
    build: (seed) => ({ radius: (2 * G * 10 * M_SUN) / (C * C), temperature: 0, albedo: 0, typeLabel: 'Stellar-mass black hole', look: { style: 'blackhole', seed, palette: ['#000000'], params: {} } }) },
  { id: 'imbh', label: 'Intermediate black hole (10⁴ M☉)', group: 'Compact objects', kind: 'black_hole', mass: 1e4 * M_SUN, massRange: [32, 36],
    build: (seed) => ({ radius: (2 * G * 1e4 * M_SUN) / (C * C), temperature: 0, albedo: 0, typeLabel: 'Intermediate-mass black hole', look: { style: 'blackhole', seed, palette: ['#000000'], params: {} } }) },
  { id: 'earthlike', label: 'Earth-like planet', group: 'Planets', kind: 'planet', mass: M_EARTH, massRange: [22, 27],
    build: (seed) => ({ radius: R_EARTH, albedo: 0.3, atmosphere: EARTH_ATMO, typeLabel: 'Terrestrial planet (habitable-zone type)',
      look: { style: 'ocean', seed, palette: ['#1d4a7c', '#4d6d3c', '#c2ad7c', '#f0f3f5', '#0a2140'], params: { seaLevel: 0.02, continentScale: 1, cloud: 0.55, relief: 0.5 } } }) },
  { id: 'ocean-world', label: 'Ocean world', group: 'Planets', kind: 'planet', mass: 3 * M_EARTH, massRange: [22, 27],
    build: (seed) => ({ radius: 1.45 * R_EARTH, albedo: 0.32, atmosphere: EARTH_ATMO, typeLabel: 'Ocean planet',
      look: { style: 'ocean', seed, palette: ['#1a5c96', '#3f6e4a', '#b9a878', '#f4f6f8', '#0b2b52'], params: { seaLevel: 0.28, continentScale: 0.8, cloud: 0.7, relief: 0.4 } } }) },
  { id: 'desert-world', label: 'Desert planet', group: 'Planets', kind: 'planet', mass: 0.6 * M_EARTH, massRange: [22, 27],
    build: (seed) => ({ radius: 0.85 * R_EARTH, albedo: 0.28, typeLabel: 'Desert planet',
      atmosphere: { ...EARTH_ATMO, pressure: 30000, rayleigh: [3e-6, 7e-6, 16e-6], mieColor: [1, 0.82, 0.6], composition: 'Thin CO₂/N₂' },
      look: { style: 'desert', seed, palette: ['#8a6a48', '#a88656', '#d0b27a', '#f2ece2', '#5a4632'], params: { seaLevel: -0.6, continentScale: 1.1, cloud: 0.1, relief: 0.8 } } }) },
  { id: 'rocky-airless', label: 'Airless rocky planet', group: 'Planets', kind: 'planet', mass: 0.055 * M_EARTH, massRange: [21, 26],
    build: (seed) => ({ radius: 0.38 * R_EARTH, albedo: 0.1, typeLabel: 'Airless rocky planet', look: { style: 'mercury', seed, palette: ROCKY_PAL.mercury, params: { relief: 0.8, craters: 0.95 } } }) },
  { id: 'lava-world', label: 'Lava world', group: 'Planets', kind: 'planet', mass: 2 * M_EARTH, massRange: [22, 27],
    build: (seed) => ({ radius: 1.25 * R_EARTH, albedo: 0.08, typeLabel: 'Lava world', look: { style: 'io', seed, palette: ROCKY_PAL.lava, params: { volcanic: 1, craters: 0.05, relief: 0.6 } } }) },
  { id: 'ice-world', label: 'Ice world', group: 'Planets', kind: 'planet', mass: 0.4 * M_EARTH, massRange: [21, 26],
    build: (seed) => ({ radius: 0.75 * R_EARTH, albedo: 0.75, typeLabel: 'Ice planet', look: { style: 'ice', seed, palette: ROCKY_PAL.ice, params: { cracks: 0.4, craters: 0.3, relief: 0.5 } } }) },
  { id: 'jupiter-like', label: 'Gas giant (Jupiter-like)', group: 'Giants', kind: 'gas_giant', mass: M_JUP, massRange: [25.5, 28.5],
    build: (seed) => {
      const r = rnd(seed);
      const pals = [['#ece2d0', '#d5bb96', '#b08258', '#7a4b34', '#c9c2b8'], ['#e9e4d8', '#c9c0b0', '#9a8f80', '#5e5850', '#d4cec4'], ['#dfe4e8', '#b9c6cf', '#8798a6', '#54646f', '#cdd6dc']];
      return { radius: R_JUP * (0.9 + r() * 0.2), albedo: 0.5, flattening: 0.06, typeLabel: 'Gas giant',
        atmosphere: { height: 400e3, scaleHeight: 27000, rayleigh: [4.5e-6, 8e-6, 1.6e-5], mie: 8e-6, mieG: 0.6, mieHeight: 20000, pressure: 1e5, composition: 'H₂, He' },
        look: { style: 'jupiter', seed, palette: pick(r, pals), params: { profile: 0, turbulence: 1, storm: r() > 0.5 ? 1 : 0, stormLat: -20 + r() * 40 - 20, stormLon: r() * 360, stormSize: 0.06 } } };
    } },
  { id: 'saturn-like', label: 'Ringed giant (Saturn-like)', group: 'Giants', kind: 'gas_giant', mass: 0.3 * M_JUP, massRange: [25, 28],
    build: (seed) => ({ radius: 0.85 * R_JUP, albedo: 0.34, flattening: 0.09, typeLabel: 'Gas giant with rings',
      atmosphere: { height: 500e3, scaleHeight: 59500, rayleigh: [4e-6, 7.5e-6, 1.5e-5], mie: 7e-6, mieG: 0.6, mieHeight: 30000, pressure: 1e5, composition: 'H₂, He' },
      look: { style: 'saturn', seed, palette: ['#eadcb5', '#d9c391', '#bfa26c', '#8f7a52', '#c9bfa8'], params: { profile: 1, turbulence: 0.7 }, rings: [{ inner: 1.24 * 0.85 * R_JUP, outer: 2.35 * 0.85 * R_JUP, color: '#d9c7a0', opacity: 0.9, seed, profile: 'generic' }] } }) },
  { id: 'ice-giant', label: 'Ice giant', group: 'Giants', kind: 'ice_giant', mass: 15 * M_EARTH, massRange: [24.5, 27.5],
    build: (seed) => ({ radius: 3.9 * R_EARTH, albedo: 0.3, flattening: 0.02, typeLabel: 'Ice giant',
      atmosphere: { height: 300e3, scaleHeight: 25000, rayleigh: [3e-6, 9e-6, 2.4e-5], mie: 2e-6, mieG: 0.6, absorb: [7e-6, 1.5e-6, 0], pressure: 1e5, composition: 'H₂, He, CH₄' },
      look: { style: 'neptune', seed, palette: ['#6a8bcb', '#5674b8', '#88a5da', '#405c9c', '#b0c2e6'], params: { profile: 3, turbulence: 0.6, storm: 0.6, stormLat: -20, stormLon: 100, stormSize: 0.055 } } }) },
  { id: 'hot-jupiter', label: 'Hot Jupiter', group: 'Giants', kind: 'gas_giant', mass: 0.9 * M_JUP, massRange: [25.5, 28.5],
    build: (seed) => ({ radius: 1.35 * R_JUP, albedo: 0.05, flattening: 0.03, typeLabel: 'Hot Jupiter',
      atmosphere: { height: 500e3, scaleHeight: 90000, rayleigh: [3e-6, 5e-6, 8e-6], mie: 2e-6, mieG: 0.5, pressure: 1e5, composition: 'H₂, He, Na, TiO' },
      look: { style: 'jupiter', seed, palette: ['#c8a08a', '#a06a55', '#7a4038', '#3b2226', '#d8b8a0'], params: { profile: 0, turbulence: 0.9 } } }) },
  { id: 'moon', label: 'Moon (rocky)', group: 'Small bodies', kind: 'moon', mass: 7.3e22, massRange: [18, 24],
    build: (seed) => ({ radius: 1.74e6, albedo: 0.12, typeLabel: 'Moon', look: { style: 'moon', seed, palette: ['#9a9a9a', '#6b6b6b', '#cfcfcf', '#3f3f42', '#e6e6e6'], params: { craters: 1, relief: 0.8 } } }) },
  { id: 'ice-moon', label: 'Icy moon', group: 'Small bodies', kind: 'moon', mass: 4.8e22, massRange: [18, 24],
    build: (seed) => ({ radius: 1.56e6, albedo: 0.65, typeLabel: 'Icy moon', look: { style: 'europa', seed, palette: ['#d8cfc0', '#a88a70', '#f0ece6', '#8a5a40', '#ffffff'], params: { cracks: 1, craters: 0.05, relief: 0.35 } } }) },
  { id: 'dwarf-planet', label: 'Dwarf planet', group: 'Small bodies', kind: 'dwarf_planet', mass: 1.3e22, massRange: [19, 23],
    build: (seed) => ({ radius: 1.19e6, albedo: 0.5, typeLabel: 'Dwarf planet', look: { style: 'ice', seed, palette: ['#c9b9a6', '#7c5a44', '#eadfd0', '#4d3226', '#f7f1e8'], params: { relief: 0.8, craters: 0.35, tholin: 0.7 } } }) },
  { id: 'asteroid', label: 'Asteroid', group: 'Small bodies', kind: 'asteroid', mass: 1e17, massRange: [10, 21],
    build: (seed) => ({ radius: 25e3, albedo: 0.08, typeLabel: 'Asteroid', shape: [30e3, 24e3, 20e3], look: { style: 'asteroid', seed, palette: ['#6f6860', '#4a4540', '#a39a8e', '#2b2723', '#c9c2b8'], params: { craters: 0.8, relief: 1 } } }) },
  { id: 'comet', label: 'Comet', group: 'Small bodies', kind: 'comet', mass: 1e13, massRange: [10, 18],
    build: (seed) => ({ radius: 2.5e3, albedo: 0.04, typeLabel: 'Comet', look: { style: 'comet', seed, palette: ['#3a3532', '#211d1b', '#7c736a', '#111', '#c9c2b8'], params: { craters: 0.3, relief: 1 } } }) },
];

export const PRESET_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

let counter = 1;

/** Build a fresh user-created Body from a preset; caller positions it and registers it. */
export function createUserBody(preset: Preset, opts: { name?: string; mass?: number } = {}): Body {
  const id = `user-${Date.now().toString(36)}-${counter++}`;
  const name = opts.name || `${preset.label.replace(/ \(.*\)/, '')} ${counter - 1}`;
  const mass = opts.mass ?? preset.mass;
  const seed = hashString(id) % 100000;
  const data = preset.build(seed);
  const b = new Body({ id, name, kind: preset.kind, typeLabel: data.typeLabel, mass, radius: data.radius ?? R_EARTH });
  // scale radius with mass for custom masses (rough mass–radius relations)
  if (opts.mass && opts.mass !== preset.mass) {
    const f = mass / preset.mass;
    if (preset.kind === 'star') { const s = star(mass); Object.assign(data, s); b.radius = s.radius!; }
    else if (preset.kind === 'black_hole') b.radius = (2 * G * mass) / (C * C);
    else if (preset.kind === 'gas_giant' || preset.kind === 'ice_giant') b.radius = (data.radius ?? R_JUP) * Math.pow(f, 0.06);
    else if (preset.kind === 'white_dwarf') b.radius = (data.radius ?? 7e6) * Math.pow(f, -1 / 3);
    else if (preset.kind !== 'neutron_star') b.radius = (data.radius ?? R_EARTH) * Math.pow(f, 0.27);
  }
  b.userCreated = true;
  b.procedural = false;
  b.flattening = data.flattening ?? 0;
  if (data.shape) b.shape = data.shape;
  b.albedo = data.albedo ?? 0.3;
  b.atmosphere = data.atmosphere;
  b.luminosity = data.luminosity ?? 0;
  b.temperature = data.temperature ?? 0;
  b.spectral = data.spectral ?? '';
  b.look = data.look ?? b.look;
  b.description = 'Created in the sandbox.';
  b.group = 'Sandbox';
  const r = rnd(seed);
  b.spin = { pole: poleFromRaDec(r() * 360, Math.asin(2 * r() - 1) * (180 / Math.PI)), rate: (2 * Math.PI) / ((6 + r() * 40) * 3600), w0: r() * Math.PI * 2 };
  return b;
}

export { AU, M_JUP, blackbodyRGB };
