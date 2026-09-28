import { poleFromRaDec, type Atmosphere, type SurfaceStyle } from '../sim/body';
import type { Body } from '../sim/body';
import { createBody, type OrbitSpec } from './builders';

interface MoonDef {
  id: string; name: string;
  /** semi-major axis km, eccentricity, inclination deg, period days */
  a: number; e: number; i: number; P: number;
  /** mean radius km, or triaxial [a,b,c] semi-axes in km */
  R: number | [number, number, number];
  mass: number;
  albedo?: number;
  style?: SurfaceStyle;
  pal?: keyof typeof PAL | string[];
  /** 'e' = relative to ecliptic (irregular moons) */
  plane?: 'e' | 'p';
  rotHours?: number; // undefined = tidally locked
  T?: number;
  params?: Record<string, number>;
  desc?: string; facts?: string[]; discovered?: string;
  atmosphere?: Atmosphere;
  aliases?: string[];
  Om?: number; w?: number; M?: number; dOm?: number; dw?: number;
  retro?: boolean;
  textures?: Record<string, string>;
}

const PAL = {
  grayice: ['#a9a59e', '#7d7871', '#d5d1ca', '#58544e', '#efece8'],
  darkrock: ['#5a534b', '#3d372f', '#8d857b', '#28231e', '#b9b2a8'],
  brightice: ['#e9e6e0', '#cfcac2', '#fbfaf8', '#a5a097', '#ffffff'],
  brownice: ['#8a8378', '#5b544c', '#cfc9bf', '#3f3a34', '#f0ede8'],
  carbon: ['#4a4540', '#2f2b27', '#6f6860', '#1d1a17', '#8f877e'],
  reddish: ['#8a5f48', '#5e3d2d', '#b58a70', '#3d2519', '#d8c4b6'],
  moon: ['#9a9a9a', '#6b6b6b', '#cfcfcf', '#3f3f42', '#e6e6e6'],
} as const;

const km = (v: number) => v * 1e3;

function moonBody(parent: Body, m: MoonDef, groupName: string): Body {
  const shape = Array.isArray(m.R) ? (m.R.map(km) as [number, number, number]) : undefined;
  const meanR = Array.isArray(m.R) ? Math.cbrt(m.R[0] * m.R[1] * m.R[2]) : m.R;
  const orbit: OrbitSpec = {
    aKm: m.a, e: m.e, i: m.i, P: m.P, plane: m.plane === 'e' ? 'ecliptic' : 'parent',
    Om: m.Om, w: m.w, M: m.M, dOm: m.dOm, dw: m.dw,
  };
  const pal = Array.isArray(m.pal) ? m.pal : (PAL as Record<string, readonly string[]>)[m.pal ?? 'grayice'] as string[];
  const style: SurfaceStyle = m.style ?? (meanR < 200 ? 'asteroid' : 'ice');
  const b = createBody({
    id: m.id, name: m.name, kind: 'moon', mass: m.mass, radius: km(meanR), shape, albedo: m.albedo ?? 0.2, temperature: m.T, parent,
    orbit, poleRaDec: undefined, group: groupName, atmosphere: m.atmosphere, description: m.desc, facts: m.facts, discovered: m.discovered,
    aliases: m.aliases,
    look: { style, seed: 100 + m.id.length * 31 + m.name.charCodeAt(0), palette: pal, params: { relief: 0.8, craters: 0.6, ...(m.params ?? {}) }, textures: m.textures },
    typeLabel: m.plane === 'e' && meanR < 100 ? 'Irregular moon' : meanR < 250 ? 'Small moon' : 'Moon',
  });
  // spin: locked moons follow the parent, others tumble at a fixed rate about the parent's pole
  if (parent.spin) {
    const pole = m.id === 'moon' ? poleFromRaDec(270, 66.5607) : parent.spin.pole.clone();
    b.spin = { pole, rate: 0, w0: 0, locked: m.rotHours === undefined };
    if (m.rotHours !== undefined) b.spin.rate = (2 * Math.PI) / (m.rotHours * 3600);
    else b.spin.rate = ((2 * Math.PI) / (m.P * 86400)) * (m.retro || m.i > 90 ? -1 : 1);
  }
  return b;
}

const JUPITER: MoonDef[] = [
  { id: 'io', name: 'Io', a: 421700, e: 0.0041, i: 0.04, P: 1.769138, R: 1821.6, mass: 8.9319e22, albedo: 0.63, style: 'io', pal: ['#e6d66a', '#c98a2a', '#f4efb0', '#2a1c16', '#ffffff'], T: 110,
    params: { volcanic: 1, craters: 0.02, relief: 0.6 }, desc: 'The most volcanically active body in the Solar System, with over 400 active volcanoes driven by tidal heating from Jupiter. Its surface is painted in sulphur yellows, oranges and reds.',
    facts: ['Lava fountains reach 400 km high.', 'Locked in a 1:2:4 orbital resonance with Europa and Ganymede.'], discovered: '1610, Galileo Galilei',
    atmosphere: { height: 100e3, scaleHeight: 12e3, rayleigh: [0, 0, 0], mie: 1e-9, mieG: 0.5, pressure: 1e-4, composition: 'SO₂ (very thin, volcanic)' } },
  { id: 'europa', name: 'Europa', a: 671034, e: 0.0094, i: 0.47, P: 3.551181, R: 1560.8, mass: 4.7998e22, albedo: 0.67, style: 'europa', pal: ['#d8cfc0', '#a88a70', '#f0ece6', '#8a5a40', '#ffffff'], T: 102,
    params: { cracks: 1, craters: 0.05, relief: 0.35 }, desc: 'An ice-shelled moon hiding a global saltwater ocean with about twice the water of all Earth\'s oceans. One of the best places to search for extraterrestrial life.',
    facts: ['The crust is 15–25 km of ice over an ocean up to 100 km deep.', 'Its smooth surface is one of the youngest in the Solar System.'], discovered: '1610, Galileo Galilei' },
  { id: 'ganymede', name: 'Ganymede', a: 1070412, e: 0.0013, i: 0.18, P: 7.154553, R: 2634.1, mass: 1.4819e23, albedo: 0.43, style: 'ice', pal: 'brownice', T: 110,
    params: { craters: 0.6, cracks: 0.5, relief: 0.6, grooves: 1 }, desc: 'The largest moon in the Solar System — bigger than Mercury — and the only one with its own magnetic field.',
    facts: ['Has a subsurface saltwater ocean sandwiched between ice layers.', 'Larger than the planet Mercury but only half its mass.'], discovered: '1610, Galileo Galilei' },
  { id: 'callisto', name: 'Callisto', a: 1882709, e: 0.0074, i: 0.19, P: 16.689018, R: 2410.3, mass: 1.0759e23, albedo: 0.17, style: 'ice', pal: ['#5f574f', '#403830', '#a39b92', '#2b251f', '#d8d2ca'], T: 134,
    params: { craters: 1, relief: 0.7 }, desc: 'The most heavily cratered object in the Solar System; its ancient surface has barely changed in 4 billion years.', discovered: '1610, Galileo Galilei' },
  { id: 'amalthea', name: 'Amalthea', a: 181366, e: 0.0032, i: 0.37, P: 0.498, R: [125, 73, 64], mass: 2.08e18, albedo: 0.09, pal: 'reddish', desc: 'A reddish, elongated inner moon — the reddest object in the Solar System.', discovered: '1892, E. E. Barnard' },
  { id: 'thebe', name: 'Thebe', a: 221889, e: 0.0175, i: 1.08, P: 0.6745, R: [58, 49, 42], mass: 4.3e17, albedo: 0.05, pal: 'darkrock' },
  { id: 'metis', name: 'Metis', a: 128000, e: 0.0002, i: 0.06, P: 0.2948, R: [30, 20, 17], mass: 3.6e16, albedo: 0.06, pal: 'darkrock' },
  { id: 'adrastea', name: 'Adrastea', a: 129000, e: 0.0015, i: 0.03, P: 0.29826, R: [10, 8, 7], mass: 2e15, albedo: 0.1, pal: 'darkrock' },
  { id: 'himalia', name: 'Himalia', a: 11461000, e: 0.1513, i: 27.5, P: 250.56, R: 69.8, mass: 4.2e18, albedo: 0.03, plane: 'e', pal: 'carbon', rotHours: 7.78 },
  { id: 'elara', name: 'Elara', a: 11741000, e: 0.1948, i: 26.6, P: 259.64, R: 43, mass: 8.7e17, albedo: 0.04, plane: 'e', pal: 'carbon', rotHours: 12 },
  { id: 'lysithea', name: 'Lysithea', a: 11717000, e: 0.1322, i: 28.3, P: 259.2, R: 18, mass: 6.3e16, albedo: 0.04, plane: 'e', pal: 'carbon', rotHours: 12 },
  { id: 'leda', name: 'Leda', a: 11165000, e: 0.1636, i: 27.5, P: 240.9, R: 10, mass: 1.1e16, albedo: 0.04, plane: 'e', pal: 'carbon', rotHours: 10 },
  { id: 'themisto', name: 'Themisto', a: 7393000, e: 0.2, i: 43, P: 130, R: 4, mass: 6.9e14, albedo: 0.04, plane: 'e', pal: 'carbon', rotHours: 8 },
  { id: 'pasiphae', name: 'Pasiphae', a: 23624000, e: 0.409, i: 151.4, P: 743, R: 30, mass: 3e17, albedo: 0.04, plane: 'e', pal: 'carbon', rotHours: 9, retro: true },
  { id: 'sinope', name: 'Sinope', a: 23939000, e: 0.25, i: 158.1, P: 758, R: 19, mass: 7.5e16, albedo: 0.04, plane: 'e', pal: 'carbon', rotHours: 12, retro: true },
  { id: 'carme', name: 'Carme', a: 23404000, e: 0.2342, i: 165, P: 734, R: 23, mass: 1.3e17, albedo: 0.04, plane: 'e', pal: 'reddish', rotHours: 10, retro: true },
  { id: 'ananke', name: 'Ananke', a: 21276000, e: 0.244, i: 148.9, P: 629.8, R: 14, mass: 3e16, albedo: 0.04, plane: 'e', pal: 'carbon', rotHours: 10, retro: true },
];

const SATURN: MoonDef[] = [
  { id: 'mimas', name: 'Mimas', a: 185539, e: 0.0196, i: 1.53, P: 0.942, R: 198.2, mass: 3.7493e19, albedo: 0.96, pal: 'grayice', T: 64, params: { craters: 1, bigCrater: 1 }, desc: 'Home to the enormous Herschel crater, one-third of its diameter, that makes it resemble the Death Star.', discovered: '1789, William Herschel' },
  { id: 'enceladus', name: 'Enceladus', a: 238042, e: 0.0047, i: 0.02, P: 1.370218, R: 252.1, mass: 1.08022e20, albedo: 1.0, pal: 'brightice', T: 75, params: { craters: 0.25, cracks: 1, tiger: 1 }, desc: 'A small, brilliantly white ice world that spews geysers of water vapour from "tiger stripe" fractures near its south pole, fed by a subsurface ocean.', facts: ['The most reflective body in the Solar System (albedo ≈ 1).', 'Its plumes feed Saturn\'s E ring.'], discovered: '1789, William Herschel' },
  { id: 'tethys', name: 'Tethys', a: 294672, e: 0.0001, i: 1.86, P: 1.887802, R: 531.1, mass: 6.17449e20, albedo: 0.8, pal: 'brightice', T: 86, params: { craters: 0.8, bigCrater: 0.6 }, discovered: '1684, G. D. Cassini' },
  { id: 'dione', name: 'Dione', a: 377415, e: 0.0022, i: 0.02, P: 2.736915, R: 561.4, mass: 1.095452e21, albedo: 0.998, pal: 'grayice', T: 87, params: { craters: 0.7, cracks: 0.4 }, discovered: '1684, G. D. Cassini' },
  { id: 'rhea', name: 'Rhea', a: 527068, e: 0.001258, i: 0.35, P: 4.5175, R: 763.8, mass: 2.306518e21, albedo: 0.95, pal: 'grayice', T: 76, params: { craters: 0.9 }, desc: 'Saturn\'s second-largest moon, an ancient, cratered ball of ice and rock.', discovered: '1672, G. D. Cassini' },
  { id: 'titan', name: 'Titan', a: 1221870, e: 0.0288, i: 0.33, P: 15.945421, R: 2574.7, mass: 1.3452e23, albedo: 0.22, style: 'titan', pal: ['#d9a04a', '#b87a2b', '#e8c07a', '#7a4e1a', '#f4d9a0'], T: 94,
    params: { craters: 0.05, relief: 0.4 }, desc: 'The only moon with a dense atmosphere (1.5× Earth\'s pressure) and the only other world with stable surface liquids — lakes and seas of methane and ethane. Rivers, dunes and clouds give it an eerily Earth-like weather cycle.',
    facts: ['Landed on by ESA\'s Huygens probe in 2005.', 'Dragonfly, a nuclear-powered drone, is scheduled to arrive in 2034.'], discovered: '1655, Christiaan Huygens',
    atmosphere: { height: 600e3, scaleHeight: 21e3, rayleigh: [1.2e-6, 4e-6, 1.6e-5], mie: 3.2e-5, mieG: 0.7, mieHeight: 60e3, mieColor: [1, 0.62, 0.22], pressure: 146700, composition: '95% N₂, 5% CH₄, orange organic haze' } },
  { id: 'hyperion', name: 'Hyperion', a: 1481010, e: 0.123, i: 0.43, P: 21.276609, R: [180, 133, 103], mass: 5.6199e18, albedo: 0.3, pal: 'grayice', rotHours: 130, params: { craters: 1, sponge: 1 }, desc: 'A sponge-like, tumbling moon in chaotic rotation with a porous, deeply pitted surface.', discovered: '1848, Bond & Lassell' },
  { id: 'iapetus', name: 'Iapetus', a: 3560820, e: 0.0293, i: 15.47, P: 79.3215, R: 734.5, mass: 1.80565e21, albedo: 0.2, pal: ['#c9c4bc', '#2a2420', '#e9e6e0', '#1a1613', '#ffffff'], T: 100, params: { craters: 0.8, twoTone: 1, ridge: 1 },
    desc: 'The two-faced moon: its leading hemisphere is coal-black and its trailing hemisphere as bright as snow. A 20-km-high equatorial ridge makes it walnut-shaped.', discovered: '1671, G. D. Cassini' },
  { id: 'phoebe', name: 'Phoebe', a: 12947918, e: 0.1562, i: 173.04, P: 550.56, R: 106.5, mass: 8.292e18, albedo: 0.08, plane: 'e', pal: 'carbon', rotHours: 9.27, retro: true, params: { craters: 1 }, desc: 'A captured, dark, retrograde moon that probably originated in the Kuiper Belt; its debris paints one side of Iapetus.', discovered: '1899, W. H. Pickering' },
  { id: 'janus', name: 'Janus', a: 151472, e: 0.0068, i: 0.16, P: 0.6945, R: [101.5, 92.5, 76.5], mass: 1.898e18, albedo: 0.71, pal: 'grayice', desc: 'Shares almost the same orbit as Epimetheus; the two moons swap orbits every four years.' },
  { id: 'epimetheus', name: 'Epimetheus', a: 151422, e: 0.0098, i: 0.35, P: 0.6942, R: [64.9, 57.0, 53.1], mass: 5.266e17, albedo: 0.73, pal: 'grayice' },
  { id: 'prometheus', name: 'Prometheus', a: 139380, e: 0.0022, i: 0.008, P: 0.613, R: [68, 39.5, 29.7], mass: 1.5972e17, albedo: 0.6, pal: 'brightice', desc: 'A shepherd moon that sculpts the inner edge of Saturn\'s F ring.' },
  { id: 'pandora', name: 'Pandora', a: 141720, e: 0.0042, i: 0.05, P: 0.6285, R: [52, 40.5, 32], mass: 1.3712e17, albedo: 0.6, pal: 'brightice' },
  { id: 'atlas', name: 'Atlas', a: 137670, e: 0.0012, i: 0.003, P: 0.602, R: [20.5, 17.8, 9.4], mass: 6.6e15, albedo: 0.4, pal: 'brightice', desc: 'A flying-saucer-shaped moon at the edge of the A ring.' },
  { id: 'pan', name: 'Pan', a: 133584, e: 0.0, i: 0.0, P: 0.575, R: [17.2, 15.7, 10.4], mass: 4.95e15, albedo: 0.5, pal: 'brightice', desc: 'The "ravioli moon" that keeps the Encke Gap clear in Saturn\'s A ring.' },
  { id: 'daphnis', name: 'Daphnis', a: 136505, e: 0.0, i: 0.0, P: 0.594, R: 3.8, mass: 8.4e13, albedo: 0.4, pal: 'brightice' },
  { id: 'helene', name: 'Helene', a: 377396, e: 0.0071, i: 0.2, P: 2.7369, R: [21.5, 19, 13], mass: 2.5e16, albedo: 0.7, pal: 'brightice', desc: 'A Trojan companion of Dione that leads it by 60°.' },
  { id: 'telesto', name: 'Telesto', a: 294660, e: 0.0, i: 1.18, P: 1.8878, R: [16.5, 12, 10], mass: 7.2e15, albedo: 1.0, pal: 'brightice' },
  { id: 'calypso', name: 'Calypso', a: 294660, e: 0.0, i: 1.5, P: 1.8878, R: [15, 11.5, 7], mass: 4e15, albedo: 1.0, pal: 'brightice' },
  { id: 'methone', name: 'Methone', a: 194440, e: 0.0001, i: 0.01, P: 1.0096, R: 1.6, mass: 1.5e13, albedo: 0.6, pal: 'brightice' },
  { id: 'pallene', name: 'Pallene', a: 212280, e: 0.004, i: 0.18, P: 1.1537, R: 2.5, mass: 2.4e13, albedo: 0.6, pal: 'brightice' },
  { id: 'siarnaq', name: 'Siarnaq', a: 17531000, e: 0.296, i: 45.6, P: 895, R: 20, mass: 3.9e17, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 10 },
  { id: 'albiorix', name: 'Albiorix', a: 16182000, e: 0.477, i: 33.8, P: 783, R: 16, mass: 2.1e17, albedo: 0.06, plane: 'e', pal: 'reddish', rotHours: 13 },
  { id: 'paaliaq', name: 'Paaliaq', a: 15200000, e: 0.325, i: 46.2, P: 686, R: 11, mass: 7.25e16, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 18 },
  { id: 'kiviuq', name: 'Kiviuq', a: 11110000, e: 0.33, i: 46.7, P: 450, R: 8, mass: 3.3e16, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 22 },
  { id: 'ijiraq', name: 'Ijiraq', a: 11124000, e: 0.316, i: 46.7, P: 451, R: 6, mass: 1.2e16, albedo: 0.06, plane: 'e', pal: 'reddish', rotHours: 13 },
  { id: 'tarvos', name: 'Tarvos', a: 17983000, e: 0.53, i: 33.8, P: 926, R: 7.5, mass: 2.3e16, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 10 },
  { id: 'erriapus', name: 'Erriapus', a: 17343000, e: 0.474, i: 34.4, P: 871, R: 5, mass: 7.6e15, albedo: 0.06, plane: 'e', pal: 'reddish', rotHours: 28 },
  { id: 'skathi', name: 'Skathi', a: 15540000, e: 0.27, i: 152.6, P: 728, R: 4, mass: 3.5e15, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 12, retro: true },
  { id: 'mundilfari', name: 'Mundilfari', a: 18628000, e: 0.198, i: 167.5, P: 953, R: 3.5, mass: 2.3e15, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 7, retro: true },
  { id: 'suttungr', name: 'Suttungr', a: 19459000, e: 0.114, i: 175.8, P: 1017, R: 3.5, mass: 2.4e15, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 7, retro: true },
  { id: 'thrymr', name: 'Thrymr', a: 20314000, e: 0.453, i: 177.7, P: 1094, R: 3.5, mass: 2.4e15, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 8, retro: true },
  { id: 'ymir', name: 'Ymir', a: 23040000, e: 0.335, i: 173.5, P: 1315, R: 9, mass: 4.9e16, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 12, retro: true },
];

const URANUS: MoonDef[] = [
  { id: 'miranda', name: 'Miranda', a: 129900, e: 0.0013, i: 4.34, P: 1.413479, R: 235.8, mass: 6.59e19, albedo: 0.32, pal: 'grayice', T: 59, params: { chaotic: 1, cracks: 0.8, craters: 0.4 }, desc: 'A patchwork moon with the most dramatic terrain in the Solar System: 20-km-tall cliffs (Verona Rupes) and giant grooved "coronae".', discovered: '1948, Gerard Kuiper' },
  { id: 'ariel', name: 'Ariel', a: 190900, e: 0.0012, i: 0.04, P: 2.520379, R: 578.9, mass: 1.251e21, albedo: 0.53, pal: 'grayice', T: 58, params: { cracks: 0.7, craters: 0.5 }, discovered: '1851, William Lassell' },
  { id: 'umbriel', name: 'Umbriel', a: 266000, e: 0.0039, i: 0.13, P: 4.144176, R: 584.7, mass: 1.275e21, albedo: 0.26, pal: 'darkrock', T: 61, params: { craters: 0.9 }, discovered: '1851, William Lassell' },
  { id: 'titania', name: 'Titania', a: 436300, e: 0.0011, i: 0.08, P: 8.705867, R: 788.9, mass: 3.455e21, albedo: 0.35, pal: 'grayice', T: 60, params: { cracks: 0.6, craters: 0.6 }, desc: 'The largest moon of Uranus, named after the queen of the fairies in A Midsummer Night\'s Dream.', discovered: '1787, William Herschel' },
  { id: 'oberon', name: 'Oberon', a: 583500, e: 0.0014, i: 0.07, P: 13.463234, R: 761.4, mass: 3.076e21, albedo: 0.31, pal: 'reddish', T: 61, params: { craters: 0.9 }, discovered: '1787, William Herschel' },
  { id: 'puck', name: 'Puck', a: 86010, e: 0.0001, i: 0.32, P: 0.762, R: 81, mass: 2.9e18, albedo: 0.11, pal: 'darkrock' },
  { id: 'portia', name: 'Portia', a: 66097, e: 0.0001, i: 0.06, P: 0.513, R: 67.6, mass: 1.7e18, albedo: 0.09, pal: 'darkrock' },
  { id: 'juliet', name: 'Juliet', a: 64350, e: 0.0001, i: 0.07, P: 0.493, R: 46.8, mass: 5.6e17, albedo: 0.08, pal: 'darkrock' },
  { id: 'belinda', name: 'Belinda', a: 75260, e: 0.0001, i: 0.03, P: 0.624, R: 45, mass: 4.9e17, albedo: 0.08, pal: 'darkrock' },
  { id: 'cressida', name: 'Cressida', a: 61780, e: 0.0004, i: 0.04, P: 0.464, R: 39.8, mass: 3.4e17, albedo: 0.08, pal: 'darkrock' },
  { id: 'desdemona', name: 'Desdemona', a: 62680, e: 0.0001, i: 0.1, P: 0.474, R: 32, mass: 1.8e17, albedo: 0.08, pal: 'darkrock' },
  { id: 'rosalind', name: 'Rosalind', a: 69940, e: 0.0001, i: 0.28, P: 0.558, R: 36, mass: 2.5e17, albedo: 0.08, pal: 'darkrock' },
  { id: 'bianca', name: 'Bianca', a: 59170, e: 0.0009, i: 0.19, P: 0.435, R: 25.7, mass: 9.2e16, albedo: 0.08, pal: 'darkrock' },
  { id: 'ophelia', name: 'Ophelia', a: 53790, e: 0.0099, i: 0.1, P: 0.376, R: 21.4, mass: 5.3e16, albedo: 0.08, pal: 'darkrock' },
  { id: 'cordelia', name: 'Cordelia', a: 49770, e: 0.0003, i: 0.08, P: 0.335, R: 20.1, mass: 4.4e16, albedo: 0.08, pal: 'darkrock' },
  { id: 'mab', name: 'Mab', a: 97700, e: 0.0025, i: 0.13, P: 0.923, R: 12, mass: 1e16, albedo: 0.1, pal: 'grayice' },
  { id: 'sycorax', name: 'Sycorax', a: 12179000, e: 0.522, i: 159, P: 1288, R: 82.5, mass: 5.4e18, albedo: 0.07, plane: 'e', pal: 'reddish', rotHours: 6.9, retro: true },
  { id: 'caliban', name: 'Caliban', a: 7231000, e: 0.159, i: 141, P: 580, R: 36, mass: 7.3e17, albedo: 0.06, plane: 'e', pal: 'carbon', rotHours: 2.7, retro: true },
];

const NEPTUNE: MoonDef[] = [
  { id: 'triton', name: 'Triton', a: 354759, e: 0.000016, i: 157.345, P: 5.876854, R: 1353.4, mass: 2.139e22, albedo: 0.76, pal: ['#d9c9bd', '#a5806f', '#f3ece6', '#6f4f44', '#ffffff'], T: 38, retro: true,
    params: { craters: 0.1, cantaloupe: 1, relief: 0.4 }, desc: 'A captured Kuiper Belt object orbiting backwards, with nitrogen geysers, a pink south-polar cap and the coldest measured surface (38 K) of any world visited by spacecraft.',
    facts: ['Its retrograde orbit is decaying; in ~3.6 billion years it will break apart into a ring.'], discovered: '1846, William Lassell',
    atmosphere: { height: 30e3, scaleHeight: 8e3, rayleigh: [1e-8, 3e-8, 1e-7], mie: 1e-8, mieG: 0.6, pressure: 1.4, composition: 'N₂ (very thin), haze' } },
  { id: 'nereid', name: 'Nereid', a: 5513400, e: 0.7507, i: 32.55, P: 360.13, R: 170, mass: 3.1e19, albedo: 0.155, pal: 'grayice', rotHours: 11.5, params: { craters: 0.7 }, desc: 'Has one of the most eccentric orbits of any moon (e = 0.75).', discovered: '1949, Gerard Kuiper' },
  { id: 'proteus', name: 'Proteus', a: 117647, e: 0.0005, i: 0.08, P: 1.122, R: [218, 208, 201], mass: 5.03e19, albedo: 0.096, pal: 'darkrock', params: { craters: 0.8 }, desc: 'The second-largest Neptunian moon and almost as large as gravity allows a non-spherical body to be.' },
  { id: 'larissa', name: 'Larissa', a: 73548, e: 0.0014, i: 0.2, P: 0.555, R: [108, 102, 84], mass: 4.2e18, albedo: 0.09, pal: 'darkrock' },
  { id: 'galatea', name: 'Galatea', a: 61953, e: 0.0001, i: 0.05, P: 0.429, R: [102, 92, 72], mass: 2.12e18, albedo: 0.08, pal: 'darkrock' },
  { id: 'despina', name: 'Despina', a: 52526, e: 0.0001, i: 0.07, P: 0.335, R: [90, 74, 64], mass: 1.9e18, albedo: 0.09, pal: 'darkrock' },
  { id: 'thalassa', name: 'Thalassa', a: 50075, e: 0.0002, i: 0.21, P: 0.311, R: [54, 50, 26], mass: 3.5e17, albedo: 0.09, pal: 'darkrock' },
  { id: 'naiad', name: 'Naiad', a: 48227, e: 0.0003, i: 4.75, P: 0.294, R: [48, 30, 26], mass: 1.9e17, albedo: 0.09, pal: 'darkrock' },
  { id: 'hippocamp', name: 'Hippocamp', a: 105283, e: 0.0, i: 0.06, P: 0.95, R: 17.4, mass: 1.1e16, albedo: 0.09, pal: 'darkrock' },
  { id: 'neso', name: 'Neso', a: 48387000, e: 0.53, i: 131, P: 9741, R: 30, mass: 1.5e17, albedo: 0.09, plane: 'e', pal: 'carbon', rotHours: 12, retro: true },
];

const EARTH_MOON: MoonDef = {
  id: 'moon', name: 'Moon', a: 384399, e: 0.0549, i: 5.145, P: 27.554550, R: 1737.4, mass: 7.342e22, albedo: 0.11, style: 'moon', pal: 'moon', T: 220, plane: 'e',
  Om: 125.0445479, w: 318.3087, M: 134.9633964, dOm: -19.3413, dw: 60.0315,
  params: { craters: 1, relief: 0.8, maria: 1 }, aliases: ['Luna', 'The Moon'],
  desc: 'Earth\'s only natural satellite, and the fifth largest moon in the Solar System. Its gravity drives our tides and slows our rotation by ~2 ms per century.',
  facts: ['Always shows the same face to Earth (tidal locking).', 'Drifting away from Earth by 3.8 cm per year.', 'Twelve humans walked on its surface between 1969 and 1972.'],
  discovered: 'Prehistoric', textures: { map: 'moon_1024.jpg' },
};

const MARS: MoonDef[] = [
  { id: 'phobos', name: 'Phobos', a: 9376, e: 0.0151, i: 1.08, P: 0.31891, R: [13.0, 11.4, 9.1], mass: 1.0659e16, albedo: 0.07, pal: 'carbon', T: 233, params: { craters: 1, groovesPhobos: 1 }, desc: 'The larger, inner moon of Mars; it orbits so close that it rises in the west and sets in the east twice a day. Doomed to break up or crash into Mars in ~50 million years.', discovered: '1877, Asaph Hall' },
  { id: 'deimos', name: 'Deimos', a: 23463, e: 0.00033, i: 1.79, P: 1.2624, R: [7.8, 6.0, 5.1], mass: 1.4762e15, albedo: 0.07, pal: 'carbon', T: 233, params: { craters: 0.6 }, discovered: '1877, Asaph Hall' },
];

const PLUTO: MoonDef[] = [
  { id: 'charon', name: 'Charon', a: 19591, e: 0.0002, i: 0.0, P: 6.3872, R: 606, mass: 1.586e21, albedo: 0.37, pal: ['#8d8985', '#6a6560', '#b7b3ae', '#7a3b30', '#dcd8d2'], T: 53, params: { craters: 0.4, chasma: 1, redCap: 1 },
    desc: 'Half the diameter of Pluto: the two are mutually tidally locked and orbit a barycentre in the space between them.', discovered: '1978, James Christy' },
  { id: 'styx', name: 'Styx', a: 42656, e: 0.0058, i: 0.81, P: 20.16, R: [8, 5, 4.5], mass: 7.5e15, albedo: 0.5, pal: 'grayice', rotHours: 80 },
  { id: 'nix', name: 'Nix', a: 48694, e: 0.002, i: 0.13, P: 24.85, R: [25, 17, 15], mass: 4.5e16, albedo: 0.5, pal: 'grayice', rotHours: 43 },
  { id: 'kerberos', name: 'Kerberos', a: 57783, e: 0.0033, i: 0.39, P: 32.17, R: [9, 5, 5], mass: 1.65e16, albedo: 0.5, pal: 'darkrock', rotHours: 130 },
  { id: 'hydra', name: 'Hydra', a: 64738, e: 0.0059, i: 0.24, P: 38.2, R: [25.5, 18, 15.5], mass: 4.8e16, albedo: 0.5, pal: 'grayice', rotHours: 10 },
];

const TNO_MOONS: [string, MoonDef][] = [
  ['eris', { id: 'dysnomia', name: 'Dysnomia', a: 37273, e: 0.006, i: 78, P: 15.786, R: 350, mass: 8.8e19, albedo: 0.05, pal: 'darkrock', plane: 'e' }],
  ['haumea', { id: 'hiiaka', name: 'Hiʻiaka', a: 49880, e: 0.05, i: 126, P: 49.46, R: 160, mass: 1.79e19, albedo: 0.8, pal: 'brightice', plane: 'e', rotHours: 9.8 }],
  ['haumea', { id: 'namaka', name: 'Namaka', a: 25657, e: 0.25, i: 113, P: 18.28, R: 85, mass: 1.79e18, albedo: 0.8, pal: 'brightice', plane: 'e', rotHours: 18 }],
  ['orcus', { id: 'vanth', name: 'Vanth', a: 9000, e: 0.0, i: 90, P: 9.54, R: 221, mass: 1.2e20, albedo: 0.12, pal: 'darkrock', plane: 'e' }],
  ['quaoar', { id: 'weywot', name: 'Weywot', a: 13300, e: 0.14, i: 14, P: 12.4, R: 41, mass: 1.5e17, albedo: 0.1, pal: 'darkrock', plane: 'e', rotHours: 12 }],
  ['gonggong', { id: 'xiangliu', name: 'Xiangliu', a: 24021, e: 0.29, i: 75, P: 25.22, R: 50, mass: 2.0e17, albedo: 0.2, pal: 'darkrock', plane: 'e', rotHours: 12 }],
];

export function createMoons(byId: Map<string, Body>): Body[] {
  const out: Body[] = [];
  const add = (parentId: string, defs: MoonDef[], group: string) => {
    const parent = byId.get(parentId);
    if (!parent) return;
    for (const m of defs) {
      const b = moonBody(parent, m, group);
      byId.set(b.id, b);
      out.push(b);
    }
  };
  add('earth', [EARTH_MOON], 'Solar System');
  add('mars', MARS, 'Solar System');
  add('jupiter', JUPITER, 'Solar System');
  add('saturn', SATURN, 'Solar System');
  add('uranus', URANUS, 'Solar System');
  add('neptune', NEPTUNE, 'Solar System');
  add('pluto', PLUTO, 'Solar System');
  for (const [pid, m] of TNO_MOONS) add(pid, [m], 'Solar System');
  return out;
}
