import { AU, G, M_SUN } from '../core/constants';
import { hashString } from '../core/math';
import type { Body } from '../sim/body';
import { elementsFromState } from '../sim/kepler';
import { createBody } from './builders';
import * as THREE from 'three';

interface AsteroidDef {
  id: string; name: string; a: number; e: number; i: number; Om: number; w: number;
  /** mean radius km, or triaxial semi-axes km */
  R: number | [number, number, number]; mass: number; albedo: number; rotHours: number;
  type: string; pal: string[]; desc?: string; facts?: string[]; discovered?: string; group?: string; kind?: 'asteroid' | 'comet';
  params?: Record<string, number>;
}

const P = {
  C: ['#4a4540', '#2f2b27', '#6f6860', '#1d1a17', '#8f877e'],
  S: ['#8a7d6c', '#5e5447', '#b7a891', '#3d362d', '#d8ccb8'],
  M: ['#8b8a8a', '#5c5b5b', '#bdbcbb', '#3a3a3a', '#dcdcdc'],
  V: ['#9c8f80', '#6d6256', '#c9b9a5', '#463c33', '#e8dcc9'],
  D: ['#5a4a42', '#3a2e28', '#84695a', '#241b17', '#a08574'],
};

const ASTEROIDS: AsteroidDef[] = [
  { id: 'vesta', name: '4 Vesta', a: 2.3615, e: 0.0887, i: 7.14, Om: 103.85, w: 151.2, R: [286, 279, 223].map((v) => v / 1) as [number, number, number], mass: 2.5908e20, albedo: 0.42, rotHours: 5.342, type: 'V-type (basaltic)', pal: P.V,
    desc: 'The second most massive asteroid, a differentiated protoplanet with a giant south-polar impact basin (Rheasilvia) whose central peak rises 22 km — twice the height of Everest. Source of the HED meteorites.', discovered: '1807, Heinrich Olbers', params: { craters: 1, bigCrater: 1 } },
  { id: 'pallas', name: '2 Pallas', a: 2.7723, e: 0.2313, i: 34.93, Om: 173.03, w: 310.05, R: [291, 278, 250], mass: 2.04e20, albedo: 0.16, rotHours: 7.81, type: 'B-type', pal: P.S, discovered: '1802, Heinrich Olbers', desc: 'The third-largest asteroid, on a steeply inclined orbit (35°).' },
  { id: 'hygiea', name: '10 Hygiea', a: 3.1421, e: 0.1146, i: 3.83, Om: 283.2, w: 312.3, R: 216.5, mass: 8.32e19, albedo: 0.07, rotHours: 27.6, type: 'C-type', pal: P.C, discovered: '1849, Annibale de Gasparis', desc: 'The fourth-largest asteroid, nearly spherical — a candidate dwarf planet.' },
  { id: 'interamnia', name: '704 Interamnia', a: 3.0587, e: 0.1546, i: 17.3, Om: 280.3, w: 94.1, R: 158.5, mass: 3.5e19, albedo: 0.07, rotHours: 8.7, type: 'F-type', pal: P.C, discovered: '1910' },
  { id: 'juno', name: '3 Juno', a: 2.6693, e: 0.2562, i: 12.98, Om: 169.9, w: 248.4, R: 117, mass: 2.7e19, albedo: 0.24, rotHours: 7.21, type: 'S-type', pal: P.S, discovered: '1804, Karl Harding' },
  { id: 'davida', name: '511 Davida', a: 3.1668, e: 0.1879, i: 15.94, Om: 107.6, w: 339.7, R: 149, mass: 3.6e19, albedo: 0.05, rotHours: 5.13, type: 'C-type', pal: P.C, discovered: '1903' },
  { id: 'psyche', name: '16 Psyche', a: 2.9227, e: 0.1339, i: 3.1, Om: 150.3, w: 228.2, R: [140, 116, 94], mass: 2.29e19, albedo: 0.12, rotHours: 4.196, type: 'M-type (metallic)', pal: P.M,
    desc: 'Possibly the exposed iron–nickel core of a shattered protoplanet, and the target of NASA\'s Psyche mission (launched 2023).', discovered: '1852, Annibale de Gasparis', params: { craters: 0.6, metal: 1 } },
  { id: 'eros', name: '433 Eros', a: 1.4582, e: 0.2229, i: 10.83, Om: 304.3, w: 178.9, R: [17.0, 5.5, 5.5], mass: 6.687e15, albedo: 0.25, rotHours: 5.27, type: 'S-type', pal: P.S, group: 'Near-Earth asteroids',
    desc: 'The first near-Earth asteroid discovered (1898) and first orbited (NEAR Shoemaker, 2000) and landed on by a spacecraft.', discovered: '1898, Gustav Witt', params: { craters: 0.8, elongated: 1 } },
  { id: 'ida', name: '243 Ida', a: 2.861, e: 0.0455, i: 1.14, Om: 324.0, w: 108.6, R: [29.9, 12.7, 9.3], mass: 4.2e16, albedo: 0.24, rotHours: 4.63, type: 'S-type', pal: P.S, desc: 'First asteroid found to have a moon, Dactyl (Galileo probe, 1993).', discovered: '1884, Johann Palisa' },
  { id: 'gaspra', name: '951 Gaspra', a: 2.209, e: 0.1735, i: 4.1, Om: 253.2, w: 130.9, R: [9.1, 5.2, 4.4], mass: 1e16, albedo: 0.22, rotHours: 7.04, type: 'S-type', pal: P.S },
  { id: 'mathilde', name: '253 Mathilde', a: 2.646, e: 0.266, i: 6.74, Om: 179.7, w: 157.5, R: [33, 24, 23], mass: 1.033e17, albedo: 0.04, rotHours: 417.7, type: 'C-type', pal: P.C, desc: 'A carbon-rich rubble pile with huge craters that rotates once every 17 days.' },
  { id: 'lutetia', name: '21 Lutetia', a: 2.435, e: 0.1645, i: 3.06, Om: 80.9, w: 250.2, R: [61, 47.5, 38], mass: 1.7e18, albedo: 0.2, rotHours: 8.17, type: 'M-type', pal: P.M, desc: 'Visited by Rosetta in 2010.' },
  { id: 'itokawa', name: '25143 Itokawa', a: 1.324, e: 0.28, i: 1.62, Om: 69.1, w: 162.8, R: [0.268, 0.147, 0.104], mass: 3.51e10, albedo: 0.53, rotHours: 12.13, type: 'S-type', pal: P.S, group: 'Near-Earth asteroids', desc: 'A peanut-shaped rubble pile; Hayabusa returned samples from it in 2010.' },
  { id: 'ryugu', name: '162173 Ryugu', a: 1.1896, e: 0.1902, i: 5.88, Om: 251.6, w: 211.4, R: 0.448, mass: 4.5e11, albedo: 0.04, rotHours: 7.63, type: 'Cb-type', pal: P.C, group: 'Near-Earth asteroids', desc: 'A dark, diamond-shaped rubble pile sampled by Hayabusa2 (2018–2019).' },
  { id: 'bennu', name: '101955 Bennu', a: 1.1264, e: 0.2037, i: 6.03, Om: 2.06, w: 66.2, R: 0.2625, mass: 7.33e10, albedo: 0.046, rotHours: 4.3, type: 'B-type', pal: P.C, group: 'Near-Earth asteroids', desc: 'Sampled by OSIRIS-REx (2020); the material returned to Earth in 2023. Has a small chance of hitting Earth in the 2180s.', params: { boulders: 1 } },
  { id: 'apophis', name: '99942 Apophis', a: 0.9224, e: 0.1914, i: 3.34, Om: 204.4, w: 126.7, R: [0.19, 0.16, 0.12], mass: 6.1e10, albedo: 0.23, rotHours: 30.4, type: 'Sq-type', pal: P.S, group: 'Near-Earth asteroids', desc: 'Will pass within 32,000 km of Earth on 13 April 2029 — closer than geostationary satellites — visible to the naked eye.' },
  { id: 'didymos', name: '65803 Didymos', a: 1.6444, e: 0.3838, i: 3.41, Om: 73.2, w: 319.3, R: 0.39, mass: 5.28e11, albedo: 0.15, rotHours: 2.26, type: 'Xk-type', pal: P.S, group: 'Near-Earth asteroids', desc: 'Binary asteroid; NASA\'s DART spacecraft deliberately hit its moon Dimorphos in September 2022, shortening its orbit by 33 minutes.' },
  { id: 'phaethon', name: '3200 Phaethon', a: 1.271, e: 0.89, i: 22.3, Om: 265.2, w: 322.2, R: 2.9, mass: 1.4e14, albedo: 0.1, rotHours: 3.6, type: 'B-type', pal: P.C, group: 'Near-Earth asteroids', desc: 'Parent body of the Geminid meteor shower; it comes closer to the Sun (0.14 AU) than any other named asteroid.' },
  { id: 'chiron', name: '2060 Chiron', a: 13.7, e: 0.379, i: 6.93, Om: 209.2, w: 339.5, R: 108, mass: 4e18, albedo: 0.09, rotHours: 5.9, type: 'Centaur', pal: P.D, group: 'Centaurs', desc: 'The first centaur discovered: an icy body between Saturn and Uranus that behaves like both an asteroid and a comet.', discovered: '1977, Charles Kowal' },
  { id: 'chariklo', name: '10199 Chariklo', a: 15.8, e: 0.17, i: 23.4, Om: 300.4, w: 242.0, R: 120, mass: 6e18, albedo: 0.04, rotHours: 7.0, type: 'Centaur', pal: P.D, group: 'Centaurs', desc: 'The largest known centaur and the first minor planet found to have rings.' },
  { id: 'arrokoth', name: '486958 Arrokoth', a: 44.2, e: 0.037, i: 2.45, Om: 159.0, w: 174.4, R: [17.9, 7.0, 4.9], mass: 7.5e14, albedo: 0.21, rotHours: 15.9, type: 'Cold classical KBO', pal: ['#a2593a', '#6f3a26', '#c98a6c', '#43231a', '#e2c7b8'], group: 'Kuiper belt',
    desc: 'A contact-binary "snowman" — the most distant object ever explored by a spacecraft (New Horizons flyby, 1 Jan 2019). Its red colour comes from radiation-processed organics.', discovered: '2014, New Horizons KBO Search Team', params: { craters: 0.15, bilobed: 1 } },
];

export function createAsteroids(sun: Body): Body[] {
  const out: Body[] = [];
  for (const d of ASTEROIDS) {
    const shape = Array.isArray(d.R) ? (d.R.map((v) => v * 1e3) as [number, number, number]) : undefined;
    const meanR = Array.isArray(d.R) ? Math.cbrt(d.R[0] * d.R[1] * d.R[2]) : d.R;
    out.push(createBody({
      id: d.id, name: d.name, kind: 'asteroid', typeLabel: `Asteroid — ${d.type}`, mass: d.mass, radius: meanR * 1e3, shape, albedo: d.albedo, parent: sun,
      orbit: { aAU: d.a, e: d.e, i: d.i, Om: d.Om, w: d.w, plane: 'ecliptic' },
      poleRaDec: [(hashString(d.id) % 360), ((hashString(d.id + 'p') % 160) - 80)], rotHours: d.rotHours, group: d.group ?? 'Asteroid belt',
      look: { style: 'asteroid', seed: hashString(d.id) % 65535, palette: d.pal, params: { craters: 0.7, relief: 1, ...(d.params ?? {}) } },
      description: d.desc, facts: d.facts, discovered: d.discovered,
    }));
  }
  // Dimorphos orbits Didymos
  const didymos = out.find((b) => b.id === 'didymos')!;
  out.push(createBody({
    id: 'dimorphos', name: 'Dimorphos', kind: 'moon', typeLabel: 'Asteroid moon', mass: 4.3e9, radius: 80, albedo: 0.15, parent: didymos,
    orbit: { aKm: 1.19, e: 0.03, i: 0.0, P: 11.37 / 24, plane: 'ecliptic' }, poleRaDec: [0, 90], rotHours: 11.37, group: 'Near-Earth asteroids',
    look: { style: 'asteroid', seed: 8080, palette: P.S, params: { craters: 0.4, boulders: 1 } },
    description: 'Struck by the DART spacecraft on 26 September 2022 in the first planetary-defence test — it shortened Dimorphos\'s orbit by 33 minutes.',
  }));
  return out;
}

interface CometDef {
  id: string; name: string; q: number; e: number; i: number; Om: number; w: number; T: number; /* JD of perihelion */
  R: number | [number, number, number]; mass: number; rotHours: number; desc: string; facts?: string[]; discovered: string; kind?: 'comet'; typeLabel?: string;
  aliases?: string[];
}

const COMETS: CometDef[] = [
  { id: 'halley', name: '1P/Halley', q: 0.5859, e: 0.9671, i: 162.26, Om: 58.42, w: 111.33, T: 2446470.96, R: [7.5, 4.0, 4.0], mass: 2.2e14, rotHours: 52.8, aliases: ["Halley's Comet", 'Halley'],
    desc: 'The most famous periodic comet: returns every ~76 years and has been recorded since 240 BC. Last perihelion 9 Feb 1986; next: 28 July 2061.', facts: ['Retrograde orbit, inclined 162° to the ecliptic.', 'Currently near aphelion, beyond Neptune\'s orbit.'], discovered: 'Recorded since 240 BC' },
  { id: 'hale-bopp', name: 'C/1995 O1 (Hale–Bopp)', q: 0.9141, e: 0.99508, i: 89.43, Om: 282.47, w: 130.59, T: 2450544.64, R: 30, mass: 1.9e16, rotHours: 11.4, aliases: ['Hale-Bopp', 'Great Comet of 1997'],
    desc: 'One of the brightest and most widely observed comets of the 20th century, visible to the naked eye for 18 months. Its nucleus is ~60 km across, huge for a comet.', discovered: '1995, Alan Hale & Thomas Bopp' },
  { id: 'hyakutake', name: 'C/1996 B2 (Hyakutake)', q: 0.2301, e: 0.99989, i: 124.92, Om: 188.05, w: 130.17, T: 2450205.0, R: 2.1, mass: 1e13, rotHours: 6.3, aliases: ['Great Comet of 1996'], desc: 'A Great Comet that passed only 0.1 AU from Earth in March 1996, with a tail stretching across 100° of sky.', discovered: '1996, Yuji Hyakutake' },
  { id: 'encke', name: '2P/Encke', q: 0.3359, e: 0.8483, i: 11.78, Om: 334.57, w: 186.54, T: 2460240.4, R: 2.4, mass: 3e13, rotHours: 11, desc: 'Shortest known period of any bright comet (3.3 years). Parent of the Taurid meteor showers.', discovered: '1786, Pierre Méchain' },
  { id: '67p', name: '67P/Churyumov–Gerasimenko', q: 1.243, e: 0.6405, i: 3.87, Om: 36.33, w: 22.14, T: 2459521.5, R: [2.6, 2.3, 1.4], mass: 9.98e12, rotHours: 12.4, aliases: ['Rosetta comet', '67P', 'Chury'],
    desc: 'A rubber-duck-shaped comet orbited by ESA\'s Rosetta (2014–2016), which released the Philae lander onto its surface — the first soft landing on a comet.', discovered: '1969' },
  { id: 'swift-tuttle', name: '109P/Swift–Tuttle', q: 0.9595, e: 0.9632, i: 113.45, Om: 139.38, w: 152.98, T: 2448968.4, R: 13, mass: 1.5e15, rotHours: 60, desc: 'Parent of the Perseid meteor shower. At 26 km it is the largest object that regularly passes near Earth.', discovered: '1862' },
  { id: 'neowise', name: 'C/2020 F3 (NEOWISE)', q: 0.2944, e: 0.99919, i: 128.94, Om: 61.01, w: 37.28, T: 2459034.2, R: 2.5, mass: 5e13, rotHours: 7.5, desc: 'The spectacular naked-eye comet of July 2020. It will not return for about 6,800 years.', discovered: '2020, NEOWISE space telescope' },
  { id: 'tsuchinshan-atlas', name: 'C/2023 A3 (Tsuchinshan–ATLAS)', q: 0.3914, e: 1.00009, i: 139.1, Om: 21.56, w: 308.5, T: 2460581.2, R: 1.5, mass: 1e13, rotHours: 10, desc: 'The "Comet of the Century" candidate of October 2024; on a nearly parabolic path that may never return.', discovered: '2023' },
  { id: 'tempel-tuttle', name: '55P/Tempel–Tuttle', q: 0.9764, e: 0.9055, i: 162.49, Om: 235.27, w: 172.5, T: 2450872.6, R: 1.8, mass: 2e13, rotHours: 24, desc: 'Parent of the Leonid meteor storms; period 33 years.', discovered: '1865' },
  { id: 'oumuamua', name: "1I/ʻOumuamua", q: 0.2559, e: 1.1992, i: 122.74, Om: 24.6, w: 241.81, T: 2458006.0, R: [0.115, 0.03, 0.03], mass: 4e9, rotHours: 7.9, aliases: ['Oumuamua', '1I'],
    typeLabel: 'Interstellar object', desc: 'The first confirmed interstellar visitor (2017), a tumbling, elongated object that sped through the Solar System at 26 km/s at infinity and accelerated slightly without a visible tail.', discovered: '2017, Pan-STARRS' },
  { id: 'borisov', name: '2I/Borisov', q: 2.0066, e: 3.3565, i: 44.05, Om: 308.15, w: 209.12, T: 2458826.0, R: 0.5, mass: 1e12, rotHours: 24, typeLabel: 'Interstellar comet', desc: 'The first interstellar comet, discovered by amateur astronomer Gennady Borisov in 2019.', discovered: '2019, Gennady Borisov' },
  { id: '3i-atlas', name: '3I/ATLAS', q: 1.3564, e: 6.139, i: 175.11, Om: 322.16, w: 128.01, T: 2460979.0, R: 2.5, mass: 5e13, rotHours: 16, typeLabel: 'Interstellar comet', aliases: ['ATLAS'], desc: 'The third confirmed interstellar object, discovered in July 2025 moving at ~58 km/s relative to the Sun; it likely formed around another star billions of years ago.', discovered: '2025, ATLAS survey' },
];

export function createComets(sun: Body): Body[] {
  return COMETS.map((d) => {
    const shape = Array.isArray(d.R) ? (d.R.map((v) => v * 1e3) as [number, number, number]) : undefined;
    const meanR = Array.isArray(d.R) ? Math.cbrt(d.R[0] * d.R[1] * d.R[2]) : d.R;
    return createBody({
      id: d.id, name: d.name, kind: 'comet', typeLabel: d.typeLabel, mass: d.mass, radius: meanR * 1e3, shape, albedo: 0.04, parent: sun,
      orbit: { qAU: d.q, e: d.e, i: d.i, Om: d.Om, w: d.w, plane: 'ecliptic', perihelionJD: d.T }, poleRaDec: [hashString(d.id) % 360, (hashString(d.id + 'x') % 160) - 80],
      rotHours: d.rotHours, group: 'Comets', aliases: d.aliases, description: d.desc, facts: d.facts, discovered: d.discovered,
      look: { style: 'comet', seed: hashString(d.id) % 65535, palette: ['#3a3532', '#211d1b', '#7c736a', '#111', '#c9c2b8'], params: { craters: 0.3, relief: 1 } },
    });
  });
}

export { AU, G, M_SUN, THREE, elementsFromState };
