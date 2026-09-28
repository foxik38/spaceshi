import { AU, DAY, DEG, G, L_SUN, M_SUN, R_SUN, TAU } from '../core/constants';
import type { Atmosphere } from '../sim/body';
import type { Body } from '../sim/body';
import type { Elements } from '../sim/kepler';
import { createBody } from './builders';

/** JPL "Keplerian elements for approximate positions of the major planets" (1800–2050 AD fit). */
interface JPLRow { a: [number, number]; e: [number, number]; I: [number, number]; L: [number, number]; w: [number, number]; O: [number, number] }
const JPL: Record<string, JPLRow> = {
  mercury: { a: [0.38709927, 0.00000037], e: [0.20563593, 0.00001906], I: [7.00497902, -0.00594749], L: [252.2503235, 149472.67411175], w: [77.45779628, 0.16047689], O: [48.33076593, -0.12534081] },
  venus: { a: [0.72333566, 0.0000039], e: [0.00677672, -0.00004107], I: [3.39467605, -0.0007889], L: [181.9790995, 58517.81538729], w: [131.60246718, 0.00268329], O: [76.67984255, -0.27769418] },
  earth: { a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668], L: [100.46457166, 35999.37244981], w: [102.93768193, 0.32327364], O: [0.0, 0.0] },
  mars: { a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131], L: [-4.55343205, 19140.30268499], w: [-23.94362959, 0.44441088], O: [49.55953891, -0.29257343] },
  jupiter: { a: [5.202887, -0.00011607], e: [0.04838624, -0.00013253], I: [1.30439695, -0.00183714], L: [34.39644051, 3034.74612775], w: [14.72847983, 0.21252668], O: [100.47390909, 0.20469106] },
  saturn: { a: [9.53667594, -0.0012506], e: [0.05386179, -0.00050991], I: [2.48599187, 0.00193609], L: [49.95424423, 1222.49362201], w: [92.59887831, -0.41897216], O: [113.66242448, -0.28867794] },
  uranus: { a: [19.18916464, -0.00196176], e: [0.04725744, -0.00004397], I: [0.77263783, -0.00242939], L: [313.23810451, 428.48202785], w: [170.9542763, 0.40805281], O: [74.01692503, 0.04240589] },
  neptune: { a: [30.06992276, 0.00026291], e: [0.00859048, 0.00005105], I: [1.77004347, 0.00035372], L: [-55.12002969, 218.45945325], w: [44.96476227, -0.32241464], O: [131.78422574, -0.00508664] },
  pluto: { a: [39.48211675, -0.00031596], e: [0.2488273, 0.0000517], I: [17.14001206, 0.00004818], L: [238.92903833, 145.20780515], w: [224.06891629, -0.04062942], O: [110.30393684, -0.01183482] },
};

function jplElements(key: string): (t: number) => Elements {
  const r = JPL[key];
  const el: Elements = { a: 0, e: 0, i: 0, Om: 0, w: 0, M0: 0, t0: 0, plane: 'ecliptic' };
  const perCentury = 36525 * DAY;
  const dM = ((r.L[1] - r.w[1]) * DEG) / perCentury;
  return (t: number) => {
    const T = t / perCentury;
    el.a = (r.a[0] + r.a[1] * T) * AU;
    el.e = r.e[0] + r.e[1] * T;
    el.i = (r.I[0] + r.I[1] * T) * DEG;
    const L = r.L[0] + r.L[1] * T, w = r.w[0] + r.w[1] * T, O = r.O[0] + r.O[1] * T;
    el.Om = O * DEG;
    el.w = (w - O) * DEG;
    el.M0 = ((((L - w) % 360) + 360) % 360) * DEG;
    el.t0 = t;
    el.n = dM;
    return el;
  };
}

const ECL_POLE: [number, number] = [270, 66.5607];

const EARTH_ATMO: Atmosphere = {
  height: 100e3, scaleHeight: 8500, rayleigh: [5.802e-6, 13.558e-6, 33.1e-6], mie: 3.996e-6, mieG: 0.8, mieHeight: 1200,
  absorb: [0.65e-6, 1.881e-6, 0.085e-6], pressure: 101325, composition: '78% N₂, 21% O₂, 0.9% Ar, 0.04% CO₂',
};

export function createSun(): Body {
  return createBody({
    id: 'sun', name: 'Sun', kind: 'star', typeLabel: 'G-type main-sequence star (G2V)',
    mass: M_SUN, radius: R_SUN, temperature: 5772, albedo: 0, luminosity: L_SUN, spectral: 'G2V', age: 4.603e9,
    poleRaDec: [286.13, 63.87], rotHours: 25.38 * 24, w0: 84.176, group: 'Solar System',
    aliases: ['Sol', 'Helios'],
    look: { style: 'sun', seed: 1, palette: ['#ffd9a0', '#ff9a3c', '#fff3d6'], params: { granulation: 1, spots: 0.6 } },
    description: 'The star at the centre of the Solar System, containing 99.86% of its mass. Fusing about 600 million tonnes of hydrogen into helium every second.',
    facts: ['Light takes 8 min 20 s to reach Earth.', 'Its core reaches about 15 million K.', 'Currently about halfway through its ~10 billion year main-sequence life.'],
  });
}

interface PlanetDef {
  id: string; name: string; kind: 'planet' | 'gas_giant' | 'ice_giant' | 'dwarf_planet';
  mass: number; radius: number; flattening?: number; temperature: number; albedo: number;
  pole: [number, number]; rotHours: number; w0: number;
  atmosphere?: Atmosphere; look: Parameters<typeof createBody>[0]['look'];
  description: string; facts: string[]; aliases?: string[]; discovered?: string; typeLabel?: string;
}

const PLANETS: PlanetDef[] = [
  {
    id: 'mercury', name: 'Mercury', kind: 'planet', mass: 3.3011e23, radius: 2.4397e6, temperature: 440, albedo: 0.088,
    pole: [281.0103, 61.4155], rotHours: 58.6462 * 24, w0: 329.5988,
    look: { style: 'mercury', seed: 11, palette: ['#8c8580', '#5a5652', '#b5aca4', '#77706a', '#cfc8c0'], params: { relief: 0.8, craters: 0.95, craterScale: 1 } },
    description: 'The smallest planet and closest to the Sun. Heavily cratered, with extreme temperature swings from 100 K at night to 700 K by day.',
    facts: ['A solar day on Mercury lasts 176 Earth days.', 'It has ice deposits in permanently shadowed polar craters.', 'Orbits the Sun in just 88 days.'],
  },
  {
    id: 'venus', name: 'Venus', kind: 'planet', mass: 4.8675e24, radius: 6.0518e6, temperature: 737, albedo: 0.76,
    pole: [272.76, 67.16], rotHours: -243.0185 * 24, w0: 160.2,
    atmosphere: { height: 90e3, scaleHeight: 15900, rayleigh: [9e-6, 14e-6, 30e-6], mie: 9e-5, mieG: 0.6, mieHeight: 9000, mieColor: [1, 0.86, 0.55], pressure: 9.2e6, composition: '96.5% CO₂, 3.5% N₂, sulphuric acid clouds' },
    look: { style: 'venus', seed: 12, palette: ['#efd9a0', '#dcb46c', '#fbeec6', '#bf8f48', '#fff6d8'], params: { swirl: 1 } },
    description: 'A runaway-greenhouse world wrapped in sulphuric-acid clouds. Its surface is hotter than Mercury\'s and the pressure equals 900 m under Earth\'s oceans.',
    facts: ['Rotates backwards (retrograde) once every 243 days — longer than its 225-day year.', 'The Sun rises in the west.', 'Surface pressure: about 92 bar.'],
  },
  {
    id: 'earth', name: 'Earth', kind: 'planet', mass: 5.9722e24, radius: 6.371e6, flattening: 1 / 298.257, temperature: 288, albedo: 0.306,
    pole: [0, 90], rotHours: 23.934472, w0: 280.46061837,
    atmosphere: EARTH_ATMO, aliases: ['Terra', 'Blue Marble', 'Home'],
    look: {
      style: 'earth', seed: 13, palette: ['#1b3f6b', '#4b6b3a', '#cbb98a', '#f2f4f6', '#0a1e3a'],
      params: { relief: 0.6, cloud: 1 },
      textures: { map: 'earth_atmos_2048.jpg', night: 'earth_lights_2048.png', spec: 'earth_specular_2048.jpg', clouds: 'earth_clouds_1024.png', normal: 'earth_normal_2048.jpg' },
    },
    description: 'Our home: the only place known to harbour life. 71% of the surface is liquid water, wrapped in a thin nitrogen–oxygen atmosphere.',
    facts: ['The only known planet with plate tectonics and liquid surface oceans.', 'Its Moon stabilises the axial tilt at ~23.4°.', 'Has a strong magnetic field generated by its liquid iron outer core.'],
  },
  {
    id: 'mars', name: 'Mars', kind: 'planet', mass: 6.4171e23, radius: 3.3895e6, flattening: 0.00589, temperature: 210, albedo: 0.25,
    pole: [317.68143, 52.8865], rotHours: 24.622962, w0: 176.63,
    atmosphere: { height: 70e3, scaleHeight: 11100, rayleigh: [1.0e-7, 2.4e-7, 6e-7], mie: 6e-6, mieG: 0.7, mieHeight: 11000, mieColor: [1.0, 0.72, 0.48], pressure: 610, composition: '95% CO₂, 2.8% N₂, 2% Ar' },
    look: { style: 'mars', seed: 14, palette: ['#c4693a', '#8a4527', '#e4a870', '#4a2a1c', '#f7f1ea'], params: { relief: 0.9, craters: 0.22, dust: 1.0, iceCap: 0.28, mountains: 0.25 } },
    description: 'The red planet: a cold desert world with the tallest volcano (Olympus Mons, 22 km) and the longest canyon system (Valles Marineris) in the Solar System.',
    facts: ['A day (sol) lasts 24 h 37 min.', 'Has two tiny moons, Phobos and Deimos.', 'Evidence of ancient river deltas and lakes.'],
  },
  {
    id: 'jupiter', name: 'Jupiter', kind: 'gas_giant', mass: 1.89813e27, radius: 6.9911e7, flattening: 0.06487, temperature: 165, albedo: 0.503,
    pole: [268.056595, 64.495303], rotHours: 9.92496, w0: 284.95,
    atmosphere: { height: 400e3, scaleHeight: 27000, rayleigh: [4.5e-6, 8e-6, 1.6e-5], mie: 8e-6, mieG: 0.6, mieHeight: 20000, pressure: 1e5, composition: '90% H₂, 10% He (1 bar level)' },
    look: {
      style: 'jupiter', seed: 15, palette: ['#f3e7d1', '#d8b48a', '#b96a38', '#6f3623', '#fff6e6'],
      params: { bands: 1, turbulence: 0.9, storm: 1, stormLat: -22, stormLon: 40, stormSize: 0.13 },
      rings: [{ inner: 1.22e8, outer: 1.29e8, color: '#6a5b4d', opacity: 0.05, seed: 3, profile: 'jupiter' }],
    },
    description: 'The largest planet: a gas giant with more than twice the mass of all other planets combined. The Great Red Spot is a storm wider than Earth that has raged for centuries.',
    facts: ['Rotates once in under 10 hours, the fastest of any planet.', '95 confirmed moons, including the four large Galilean moons.', 'Radiates more heat than it receives from the Sun.'],
  },
  {
    id: 'saturn', name: 'Saturn', kind: 'gas_giant', mass: 5.6834e26, radius: 5.8232e7, flattening: 0.09796, temperature: 134, albedo: 0.342,
    pole: [40.589, 83.537], rotHours: 10.656, w0: 38.9,
    atmosphere: { height: 500e3, scaleHeight: 59500, rayleigh: [4e-6, 7.5e-6, 1.5e-5], mie: 7e-6, mieG: 0.6, mieHeight: 30000, pressure: 1e5, composition: '96% H₂, 3% He' },
    look: {
      style: 'saturn', seed: 16, palette: ['#f2e2b0', '#dcbf7c', '#c39a55', '#9a7a45', '#faf0cc'],
      params: { bands: 0.8, turbulence: 0.5, storm: 0, hexagon: 1 },
      rings: [{ inner: 7.4658e7, outer: 1.40220e8, color: '#d9c7a0', opacity: 0.92, seed: 4, profile: 'saturn' }],
    },
    description: 'The ringed jewel of the Solar System. Its density is lower than water — it would float in a big enough bathtub. The rings are mostly water ice, spanning 280,000 km but only ~10 m thick in places.',
    facts: ['A persistent hexagonal jet stream circles its north pole.', '146 known moons.', 'Winds reach 1,800 km/h near the equator.'],
  },
  {
    id: 'uranus', name: 'Uranus', kind: 'ice_giant', mass: 8.681e25, radius: 2.5362e7, flattening: 0.0229, temperature: 76, albedo: 0.3,
    pole: [257.311, -15.175], rotHours: -17.24, w0: 203.81,
    atmosphere: { height: 300e3, scaleHeight: 27700, rayleigh: [3e-6, 9e-6, 2.4e-5], mie: 2e-6, mieG: 0.6, absorb: [7e-6, 1.5e-6, 0], pressure: 1e5, composition: '83% H₂, 15% He, 2% CH₄' },
    look: {
      style: 'uranus', seed: 17, palette: ['#a9e8ee', '#86d6de', '#c8f3f6', '#6cc0cc', '#e6fdfe'], params: { bands: 0.25 },
      rings: [{ inner: 4.1837e7, outer: 5.1149e7, color: '#4a4f52', opacity: 0.25, seed: 5, profile: 'uranus' }],
    },
    description: 'An ice giant that rolls around the Sun on its side — its axis is tilted 97.8°. Methane in the atmosphere absorbs red light, giving it a pale cyan colour.',
    facts: ['Coldest planetary atmosphere: 49 K minimum.', 'Discovered by William Herschel in 1781.', 'Has 13 known rings and 28 moons.'],
    discovered: '1781, William Herschel',
  },
  {
    id: 'neptune', name: 'Neptune', kind: 'ice_giant', mass: 1.02413e26, radius: 2.4622e7, flattening: 0.0171, temperature: 72, albedo: 0.29,
    pole: [299.36, 43.46], rotHours: 15.9722, w0: 249.978,
    atmosphere: { height: 300e3, scaleHeight: 20000, rayleigh: [3e-6, 1e-5, 3e-5], mie: 3e-6, mieG: 0.6, absorb: [1.2e-5, 3e-6, 0], pressure: 1e5, composition: '80% H₂, 19% He, 1.5% CH₄' },
    look: {
      style: 'neptune', seed: 18, palette: ['#3f6cf0', '#2f4fc4', '#79a0ff', '#1f3196', '#b4c8ff'], params: { bands: 0.5, storm: 0.7, stormLat: -20, stormLon: 200, stormSize: 0.1 },
      rings: [{ inner: 4.09e7, outer: 6.3e7, color: '#3f4a5a', opacity: 0.08, seed: 6, profile: 'neptune' }],
    },
    description: 'The windiest planet, with supersonic storms reaching 2,100 km/h. Its deep blue is due to methane and an as-yet unidentified component.',
    facts: ['Discovered in 1846 by mathematical prediction from Uranus\'s orbital perturbations.', 'Takes 164.8 years to orbit the Sun.', 'Its moon Triton orbits backwards and is probably a captured Kuiper Belt object.'],
    discovered: '1846, Le Verrier / Galle',
  },
];

export function createPlanets(sun: Body): Body[] {
  const out: Body[] = [];
  for (const d of PLANETS) {
    const b = createBody({
      id: d.id, name: d.name, kind: d.kind, mass: d.mass, radius: d.radius, flattening: d.flattening, temperature: d.temperature, albedo: d.albedo,
      parent: sun, poleRaDec: d.pole, rotHours: d.rotHours, w0: d.w0, atmosphere: d.atmosphere, look: d.look, description: d.description,
      facts: d.facts, aliases: d.aliases, discovered: d.discovered ?? 'Known since antiquity', group: 'Solar System', typeLabel: d.typeLabel,
    });
    b.elementsAt = jplElements(d.id);
    b.elements = b.elementsAt(0);
    out.push(b);
  }
  return out;
}

interface DwarfDef { id: string; name: string; mass: number; radius: number; shape?: [number, number, number]; a: number; e: number; i: number; Om: number; w: number; M: number;
  rotHours: number; albedo: number; T: number; style: 'ice' | 'rocky' | 'io' | 'mars'; palette: string[]; desc: string; facts?: string[]; discovered: string; pole?: [number, number]; extra?: Record<string, number>; }

const DWARFS: DwarfDef[] = [
  { id: 'ceres', name: 'Ceres', mass: 9.3835e20, radius: 4.697e5, a: 2.767, e: 0.0785, i: 10.588, Om: 80.26, w: 73.42, M: 240, rotHours: 9.074, albedo: 0.09, T: 168, style: 'rocky',
    palette: ['#6f6a64', '#4a4642', '#c9c6c0', '#3a3733', '#efeeea'], desc: 'The largest object in the asteroid belt and the only dwarf planet in the inner Solar System. Bright salt deposits in Occator crater hint at a subsurface brine reservoir.', discovered: '1801, Giuseppe Piazzi', pole: [291.42, 66.76], extra: { craters: 0.9 } },
  { id: 'eris', name: 'Eris', mass: 1.66e22, radius: 1.163e6, a: 67.78, e: 0.4407, i: 44.04, Om: 35.95, w: 151.64, M: 200, rotHours: 25.9, albedo: 0.96, T: 30, style: 'ice',
    palette: ['#e6e2dc', '#c9c2b6', '#f8f6f2', '#9d9587', '#ffffff'], desc: 'The most massive known dwarf planet, slightly smaller than Pluto but 27% heavier. Its discovery triggered the redefinition of "planet" in 2006.', discovered: '2005, Brown, Trujillo & Rabinowitz' },
  { id: 'haumea', name: 'Haumea', mass: 4.006e21, radius: 8.16e5, shape: [1.161e6, 8.52e5, 5.13e5], a: 43.13, e: 0.1953, i: 28.21, Om: 121.79, w: 240.2, M: 148, rotHours: 3.915, albedo: 0.66, T: 32, style: 'ice',
    palette: ['#dcd8d4', '#b9a99c', '#f4f2f0', '#8a4a3a', '#ffffff'], desc: 'A rapidly spinning, egg-shaped dwarf planet that completes a rotation every 3.9 hours, with two moons and a ring.', discovered: '2004' },
  { id: 'makemake', name: 'Makemake', mass: 3.1e21, radius: 7.15e5, a: 45.79, e: 0.159, i: 28.98, Om: 79.62, w: 294.8, M: 158, rotHours: 22.8, albedo: 0.82, T: 30, style: 'mars',
    palette: ['#b9724e', '#8a5236', '#e0b090', '#5d3826', '#f2e8de'], desc: 'A reddish Kuiper Belt dwarf planet covered in methane ice.', discovered: '2005' },
  { id: 'gonggong', name: 'Gonggong', mass: 1.75e21, radius: 6.15e5, a: 67.5, e: 0.50, i: 30.87, Om: 336.84, w: 206.6, M: 165, rotHours: 22.4, albedo: 0.14, T: 25, style: 'mars',
    palette: ['#a5573a', '#6d3a2a', '#cf9a78', '#4a281e', '#e6d9cf'], desc: 'A red, distant dwarf planet on an eccentric orbit with the moon Xiangliu.', discovered: '2007' },
  { id: 'quaoar', name: 'Quaoar', mass: 1.2e21, radius: 5.55e5, a: 43.7, e: 0.04, i: 7.99, Om: 188.8, w: 148.3, M: 300, rotHours: 17.7, albedo: 0.12, T: 44, style: 'mars',
    palette: ['#8f5d44', '#5b3a2c', '#c5a08a', '#3b251c', '#e9ddd2'], desc: 'A Kuiper Belt object with a ring well outside its Roche limit, which challenges ring-formation theories.', discovered: '2002' },
  { id: 'sedna', name: 'Sedna', mass: 8.3e20, radius: 5.0e5, a: 506, e: 0.8549, i: 11.93, Om: 144.5, w: 311.5, M: 357.6, rotHours: 10.3, albedo: 0.32, T: 12, style: 'mars',
    palette: ['#b04a2e', '#7a301f', '#d98c6a', '#4a2016', '#f0dcd0'], desc: 'One of the reddest objects in the Solar System, on an extreme 11,400-year orbit reaching ~940 AU. Its perihelion is in 2076.', discovered: '2003, Brown, Trujillo & Rabinowitz' },
  { id: 'orcus', name: 'Orcus', mass: 6.4e20, radius: 4.58e5, a: 39.2, e: 0.227, i: 20.56, Om: 268.7, w: 73.0, M: 165, rotHours: 10.5, albedo: 0.23, T: 42, style: 'ice',
    palette: ['#a09c98', '#77726c', '#d0ccc8', '#5a5650', '#f0eeec'], desc: 'A plutino in a 2:3 resonance with Neptune, often called the "anti-Pluto" because its orbit mirrors Pluto\'s.', discovered: '2004' },
];

export function createPluto(sun: Body): Body {
  const b = createBody({
    id: 'pluto', name: 'Pluto', kind: 'dwarf_planet', mass: 1.303e22, radius: 1.1883e6, temperature: 44, albedo: 0.52, parent: sun,
    poleRaDec: [132.993, -6.163], rotHours: 6.3872 * 24, w0: 302.695, group: 'Solar System', discovered: '1930, Clyde Tombaugh',
    atmosphere: { height: 200e3, scaleHeight: 50e3, rayleigh: [1e-8, 3e-8, 1e-7], mie: 2e-8, mieG: 0.7, mieHeight: 30e3, pressure: 1, composition: 'N₂, CH₄, CO (thin, seasonal)' },
    look: { style: 'ice', seed: 21, palette: ['#c9b9a6', '#7c5a44', '#eadfd0', '#4d3226', '#f7f1e8'], params: { relief: 0.8, craters: 0.35, tholin: 0.7, cracks: 0.2 } },
    description: 'The most famous dwarf planet, with a giant nitrogen-ice heart (Tombaugh Regio), mountains of water ice, and a hazy blue atmosphere. Pluto and its moon Charon orbit a point outside Pluto.',
    facts: ['Visited by New Horizons in July 2015.', 'Takes 248 Earth years to orbit the Sun.', 'Five known moons: Charon, Styx, Nix, Kerberos, Hydra.'],
  });
  b.elementsAt = jplElements('pluto');
  b.elements = b.elementsAt(0);
  return b;
}

export function createDwarfPlanets(sun: Body): Body[] {
  return DWARFS.map((d) => createBody({
    id: d.id, name: d.name, kind: 'dwarf_planet', mass: d.mass, radius: d.radius, shape: d.shape, temperature: d.T, albedo: d.albedo, parent: sun,
    orbit: { aAU: d.a, e: d.e, i: d.i, Om: d.Om, w: d.w, M: d.M, plane: 'ecliptic' },
    poleRaDec: d.pole ?? [(d.Om + 90) % 360, 60], rotHours: d.rotHours, group: 'Solar System', discovered: d.discovered,
    look: { style: d.style, seed: 30 + d.id.length * 7, palette: d.palette, params: { relief: 0.7, craters: 0.35, ...(d.extra ?? {}) } },
    description: d.desc, facts: d.facts,
  }));
}

export { AU, G, L_SUN, TAU };
