import * as THREE from 'three';
import { AU, DAY, DEG, G, M_SUN, R_EARTH, YEAR } from '../core/constants';
import { hashString } from '../core/math';
import type { Body } from '../sim/body';
import { elementsFromState } from '../sim/kepler';
import { createBody, type BodySpec } from './builders';

const EPOCH_JD = 2461041.5; // 2026-01-01
const EPOCH_T = (EPOCH_JD - 2451545.0) * DAY;

function probeBody(sun: Body, s: Omit<BodySpec, 'kind' | 'parent'> & { rAU: number; raDeg: number; decDeg: number; vKms: number; vTransKms?: number; model?: string }): Body {
  const b = createBody({
    ...s, kind: 'probe', parent: sun, group: 'Spacecraft', albedo: 0.4,
    look: { style: 'artificial', seed: hashString(s.id) % 9999, palette: ['#c9c3b6', '#8a8578', '#e8d8a0', '#2a3a5a', '#ffffff'], params: {}, model: s.model ?? 'probe' },
  });
  const ra = s.raDeg * DEG, dec = s.decDeg * DEG;
  const rhat = new THREE.Vector3(Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec));
  const that = new THREE.Vector3(0, 0, 1).cross(rhat).normalize();
  const r = rhat.clone().multiplyScalar(s.rAU * AU);
  const v = rhat.clone().multiplyScalar(s.vKms * 1e3).addScaledVector(that, (s.vTransKms ?? 0.4) * 1e3);
  b.elements = elementsFromState(r, v, G * M_SUN, EPOCH_T, 'icrs');
  return b;
}

function orbiter(parent: Body, id: string, name: string, o: {
  altKm?: number; aKm?: number; e?: number; i: number; Om?: number; M?: number; w?: number; mass: number; radius: number; model?: string; kind?: 'satellite' | 'probe';
  desc?: string; facts?: string[]; discovered?: string; plane?: 'ecliptic' | 'parent'; aliases?: string[];
}): Body {
  const a = o.aKm !== undefined ? o.aKm : (parent.radius / 1e3 + (o.altKm ?? 400));
  return createBody({
    id, name, kind: o.kind ?? 'satellite', mass: o.mass, radius: o.radius, albedo: 0.4, parent, group: 'Spacecraft',
    orbit: { aKm: a, e: o.e ?? 0.0005, i: o.i, Om: o.Om, w: o.w, M: o.M, plane: o.plane ?? 'parent' },
    description: o.desc, facts: o.facts, discovered: o.discovered, aliases: o.aliases,
    look: { style: 'artificial', seed: hashString(id) % 9999, palette: ['#c9c3b6', '#8a8578', '#e8d8a0', '#2a3a5a', '#ffffff'], params: {}, model: o.model ?? 'satellite' },
  });
}

/** Spacecraft parked at a Sun–Earth Lagrange point (with a small halo orbit around it). */
function lagrange(sun: Body, earth: Body, id: string, name: string, dir: 1 | -1, o: { mass: number; radius: number; model: string; desc: string; facts?: string[]; discovered: string; haloKm: number; aliases?: string[] }): Body {
  const b = createBody({
    id, name, kind: 'probe', typeLabel: `Space telescope at Sun–Earth L${dir > 0 ? 2 : 1}`, mass: o.mass, radius: o.radius, albedo: 0.4, parent: earth, group: 'Spacecraft',
    description: o.desc, facts: o.facts, discovered: o.discovered, aliases: o.aliases,
    look: { style: 'artificial', seed: hashString(id) % 9999, palette: ['#d8d0a0', '#8a8578', '#f0d890', '#2a3a5a', '#ffffff'], params: {}, model: o.model },
  });
  const rad = new THREE.Vector3(), tmp = new THREE.Vector3(), perp = new THREE.Vector3(), up = new THREE.Vector3(0, 0, 1);
  b.customRails = (self, t) => {
    rad.copy(earth.pos).sub(sun.pos);
    const d = rad.length();
    rad.multiplyScalar(1 / d);
    perp.crossVectors(up, rad).normalize();
    const phi = (t / (0.5 * YEAR)) * Math.PI * 2;
    tmp.copy(rad).multiplyScalar(dir * 1.5e9).addScaledVector(perp, Math.cos(phi) * o.haloKm * 1e3).addScaledVector(up, Math.sin(phi) * o.haloKm * 0.7e3);
    self.pos.copy(earth.pos).add(tmp);
    self.vel.copy(earth.vel);
  };
  return b;
}

export function createSpacecraft(byId: Map<string, Body>): Body[] {
  const sun = byId.get('sun')!, earth = byId.get('earth')!, mars = byId.get('mars')!, jupiter = byId.get('jupiter')!, moon = byId.get('moon')!;
  const out: Body[] = [];

  // Deep-space probes: approximate state on 2026-01-01
  out.push(probeBody(sun, {
    id: 'voyager1', name: 'Voyager 1', mass: 825.5, radius: 3, rAU: 169.8, raDeg: 258.3, decDeg: 12.1, vKms: 16.95, model: 'voyager',
    typeLabel: 'Space probe (interstellar)', discovered: 'Launched 5 September 1977', aliases: ['Voyager-1'],
    description: 'The most distant human-made object, travelling out of the Solar System at 17 km/s. It crossed the heliopause in 2012 and is still transmitting, carrying the Golden Record.',
    facts: ['Will reach one light-day from Earth in late 2026.', 'Its nearest approach to another star (Gliese 445) will be in ~40,000 years.'],
  }));
  out.push(probeBody(sun, {
    id: 'voyager2', name: 'Voyager 2', mass: 825.5, radius: 3, rAU: 141.6, raDeg: 300.3, decDeg: -59.5, vKms: 15.4, model: 'voyager',
    typeLabel: 'Space probe (interstellar)', discovered: 'Launched 20 August 1977', aliases: ['Voyager-2'],
    description: 'The only spacecraft to have visited Uranus (1986) and Neptune (1989). Entered interstellar space in 2018.',
  }));
  out.push(probeBody(sun, { id: 'pioneer10', name: 'Pioneer 10', mass: 259, radius: 2, rAU: 137, raDeg: 80.0, decDeg: 26.0, vKms: 11.8, model: 'voyager', typeLabel: 'Space probe (inactive)', discovered: 'Launched 3 March 1972',
    description: 'First spacecraft to cross the asteroid belt and to fly past Jupiter. Contact was lost in 2003.' }));
  out.push(probeBody(sun, { id: 'pioneer11', name: 'Pioneer 11', mass: 259, radius: 2, rAU: 118, raDeg: 283.0, decDeg: -9.0, vKms: 11.2, model: 'voyager', typeLabel: 'Space probe (inactive)', discovered: 'Launched 6 April 1973',
    description: 'First spacecraft to fly past Saturn (1979). Contact was lost in 1995.' }));
  out.push(probeBody(sun, { id: 'newhorizons', name: 'New Horizons', mass: 478, radius: 1.5, rAU: 64.0, raDeg: 289.5, decDeg: -20.5, vKms: 13.6, model: 'probe', typeLabel: 'Space probe (Kuiper belt)', discovered: 'Launched 19 January 2006',
    description: 'Flew past Pluto in July 2015 and the Kuiper belt object Arrokoth on 1 January 2019; now exploring the outer heliosphere.' }));

  // Sun-orbiting
  out.push(createBody({
    id: 'parker', name: 'Parker Solar Probe', kind: 'probe', mass: 685, radius: 3, albedo: 0.4, parent: sun, group: 'Spacecraft',
    orbit: { aAU: 0.387, e: 0.881, i: 3.4, Om: 200, w: 250, plane: 'ecliptic' }, discovered: 'Launched 12 August 2018',
    description: 'The fastest human-made object, reaching 192 km/s at perihelion, 6.1 million km above the solar surface — flying through the Sun\'s corona.',
    look: { style: 'artificial', seed: 5, palette: ['#c9c3b6', '#8a8578', '#e8d8a0', '#2a3a5a', '#ffffff'], params: {}, model: 'probe' },
  }));
  out.push(createBody({
    id: 'solar-orbiter', name: 'Solar Orbiter', kind: 'probe', mass: 1800, radius: 4, albedo: 0.4, parent: sun, group: 'Spacecraft',
    orbit: { aAU: 0.6, e: 0.52, i: 12, Om: 60, w: 100, plane: 'ecliptic' }, discovered: 'Launched 10 February 2020',
    description: 'ESA/NASA mission imaging the Sun\'s poles for the first time.',
    look: { style: 'artificial', seed: 6, palette: ['#c9c3b6', '#8a8578', '#e8d8a0', '#2a3a5a', '#ffffff'], params: {}, model: 'probe' },
  }));

  // Lagrange points
  out.push(lagrange(sun, earth, 'jwst', 'James Webb Space Telescope', 1, {
    mass: 6161, radius: 11, model: 'jwst', haloKm: 500000, discovered: 'Launched 25 December 2021', aliases: ['JWST', 'Webb'],
    desc: 'The most powerful space telescope ever built: a 6.5 m gold-coated beryllium mirror observing infrared light from behind a tennis-court-sized sunshield.',
    facts: ['Orbits the Sun–Earth L2 point 1.5 million km from Earth.', 'Its instruments are kept below 50 K.'],
  }));
  out.push(lagrange(sun, earth, 'soho', 'SOHO', -1, {
    mass: 1850, radius: 4, model: 'satellite', haloKm: 600000, discovered: 'Launched 2 December 1995', aliases: ['Solar and Heliospheric Observatory'],
    desc: 'A joint ESA/NASA solar observatory at the Sun–Earth L1 point, monitoring the Sun continuously for 30 years and discovering over 5,000 comets.',
  }));
  out.push(lagrange(sun, earth, 'gaia', 'Gaia', 1, {
    mass: 2030, radius: 5, model: 'satellite', haloKm: 700000, discovered: 'Launched 19 December 2013',
    desc: 'ESA\'s astrometry mission that mapped the positions and motions of almost two billion stars, the basis of modern galactic astronomy.',
  }));

  // Earth orbit
  const earthSats: [string, string, Parameters<typeof orbiter>[3]][] = [
    ['iss', 'International Space Station', { altKm: 420, i: 51.64, mass: 4.5e5, radius: 55, model: 'iss', aliases: ['ISS'],
      desc: 'The largest structure ever built in space: a crewed laboratory that has been continuously inhabited since November 2000. It orbits Earth every 92 minutes.',
      facts: ['Travels at 7.66 km/s — 16 sunrises and sunsets per day.', 'Spans 109 m, about the length of a football field.'], discovered: 'Assembly began 20 November 1998' }],
    ['tiangong', 'Tiangong Space Station', { altKm: 390, i: 41.47, mass: 1e5, radius: 30, model: 'iss', desc: 'China\'s modular space station, operational since 2022.', discovered: 'Core module launched 29 April 2021' }],
    ['hubble', 'Hubble Space Telescope', { altKm: 535, i: 28.47, mass: 11110, radius: 7, model: 'hubble', aliases: ['HST'],
      desc: 'Launched in 1990, Hubble has made over 1.5 million observations and helped pin down the age of the universe at 13.8 billion years.', facts: ['Orbits every 95 minutes.', 'Its 2.4 m mirror was famously flawed at launch and repaired in 1993.'], discovered: 'Launched 24 April 1990' }],
    ['chandra', 'Chandra X-ray Observatory', { aKm: 80900, e: 0.7233, i: 76, mass: 4790, radius: 8, model: 'satellite', desc: 'NASA\'s X-ray telescope on a highly elliptical 64-hour orbit that takes it a third of the way to the Moon.', discovered: 'Launched 23 July 1999' }],
    ['tess', 'TESS', { aKm: 241500, e: 0.55, i: 37, mass: 362, radius: 3, model: 'satellite', desc: 'The Transiting Exoplanet Survey Satellite, in a 13.7-day orbit in 2:1 resonance with the Moon.', discovered: 'Launched 18 April 2018' }],
    ['vanguard1', 'Vanguard 1', { aKm: 8689, e: 0.1897, i: 34.25, mass: 1.47, radius: 0.16, desc: 'Launched in 1958, the oldest human-made object still in orbit.', discovered: 'Launched 17 March 1958' }],
    ['goes16', 'GOES-16', { aKm: 42164, e: 0.0001, i: 0.05, Om: 0, M: 200, mass: 5192, radius: 6, model: 'satellite', desc: 'Weather satellite in geostationary orbit over the Americas.', discovered: 'Launched 19 November 2016' }],
    ['meteosat', 'Meteosat-11', { aKm: 42164, e: 0.0001, i: 0.05, Om: 0, M: 100, mass: 2000, radius: 5, model: 'satellite', desc: 'Europe\'s geostationary weather satellite.', discovered: 'Launched 15 July 2015' }],
    ['gps-iif', 'GPS IIF-12', { aKm: 26560, e: 0.005, i: 55, Om: 30, M: 90, mass: 1633, radius: 5, model: 'satellite', desc: 'One of the ~31 satellites of the GPS constellation, orbiting every 11 h 58 min at 20,200 km altitude.' }],
  ];
  for (const [id, name, o] of earthSats) out.push(orbiter(earth, id, name, o));

  out.push(orbiter(moon, 'lro', 'Lunar Reconnaissance Orbiter', { altKm: 60, e: 0.003, i: 90, mass: 1850, radius: 4, model: 'satellite', kind: 'probe', desc: 'Mapping the Moon in high resolution since 2009.', discovered: 'Launched 18 June 2009' }));
  out.push(orbiter(mars, 'mro', 'Mars Reconnaissance Orbiter', { altKm: 300, e: 0.009, i: 93, mass: 2180, radius: 5, model: 'satellite', kind: 'probe', desc: 'Its HiRISE camera can resolve objects 30 cm across on the Martian surface.', discovered: 'Launched 12 August 2005' }));
  out.push(orbiter(mars, 'maven', 'MAVEN', { aKm: 3396 + 3175, e: 0.46, i: 75, mass: 2454, radius: 4, model: 'satellite', kind: 'probe', desc: 'Studying how Mars lost its atmosphere.', discovered: 'Launched 18 November 2013' }));
  out.push(orbiter(jupiter, 'juno-probe', 'Juno', { aKm: 2.97e6, e: 0.9745, i: 90, mass: 3625, radius: 10, model: 'probe', kind: 'probe', desc: 'Polar-orbiting Jupiter, skimming the cloud tops every 33 days to map the planet\'s gravity, magnetic field and deep interior.', discovered: 'Launched 5 August 2011' }));
  void R_EARTH;
  return out;
}
