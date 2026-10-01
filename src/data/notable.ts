import * as THREE from 'three';
import { C, DEG, G, LY, M_SUN, R_SUN, TAU } from '../core/constants';
import { raDecToXYZ } from '../core/math';
import { Body, poleFromRaDec, type BodyKind } from '../sim/body';
import type { Universe } from '../sim/universe';

interface NotableDef {
  id: string;
  name: string;
  kind: BodyKind;
  typeLabel: string;
  massSun: number;
  ra: number;
  dec: number;
  distLy: number;
  radiusM?: number;
  temperature?: number;
  luminosity?: number;
  disk?: number;
  description: string;
  facts?: string[];
  discovered?: string;
  spinPeriodS?: number;
  aliases?: string[];
}

const DEFS: NotableDef[] = [
  {
    id: 'sgr-a-star', name: 'Sagittarius A*', kind: 'black_hole', typeLabel: 'Supermassive black hole', massSun: 4.297e6, ra: 266.41683, dec: -29.00781, distLy: 26673, disk: 1,
    aliases: ['Sgr A*', 'Milky Way core', 'Galactic centre'],
    description: 'The supermassive black hole at the centre of the Milky Way. Stars such as S2 whip around it in 16 years at 3% of the speed of light; the Event Horizon Telescope imaged its shadow in 2022.',
    facts: ['Its event horizon is about 12 million km across — smaller than Mercury\'s orbit.', 'Discovered as a radio source in 1974; Nobel Prize in Physics 2020 (Genzel & Ghez).'], discovered: '1974',
  },
  {
    id: 'cyg-x-1', name: 'Cygnus X-1', kind: 'black_hole', typeLabel: 'Stellar-mass black hole (X-ray binary)', massSun: 21.2, ra: 299.59032, dec: 35.20161, distLy: 7200, disk: 1,
    aliases: ['Cyg X-1'],
    description: 'The first widely accepted black hole (1971). It devours gas from a blue supergiant companion, HDE 226868, heating it into a brilliant X-ray-emitting accretion disc.',
    facts: ['Subject of the famous 1974 Hawking–Thorne bet.'], discovered: '1964 (X-ray source), black hole confirmed 1971',
  },
  {
    id: 'm87-star', name: 'M87*', kind: 'black_hole', typeLabel: 'Supermassive black hole', massSun: 6.5e9, ra: 187.70593, dec: 12.39112, distLy: 53.5e6, disk: 1,
    aliases: ['Messier 87 black hole', 'Pōwehi'],
    description: 'The first black hole ever imaged (Event Horizon Telescope, 2019): a 6.5-billion-solar-mass monster whose shadow is larger than our Solar System, launching a jet 5,000 light-years long.',
    discovered: '1918 (jet); shadow imaged 2019',
  },
  {
    id: 'ton-618', name: 'TON 618', kind: 'black_hole', typeLabel: 'Ultramassive black hole (quasar)', massSun: 6.6e10, ra: 187.10, dec: 31.477, distLy: 1.04e10, disk: 1,
    description: 'One of the most massive black holes known, powering a hyperluminous quasar. Its event horizon spans ~1,300 AU — several times the size of our Solar System.',
    discovered: '1957',
  },
  {
    id: '3c-273', name: '3C 273', kind: 'black_hole', typeLabel: 'Quasar (accreting black hole)', massSun: 8.86e8, ra: 187.27792, dec: 2.05239, distLy: 2.44e9, disk: 1,
    description: 'The first quasar ever identified (1963) and the optically brightest in our sky, shining as brightly as 4 trillion Suns.',
    discovered: '1963, Maarten Schmidt',
  },
  {
    id: 'gaia-bh1', name: 'Gaia BH1', kind: 'black_hole', typeLabel: 'Dormant stellar-mass black hole', massSun: 9.62, ra: 262.17123, dec: -0.58108, distLy: 1560, disk: 0,
    description: 'The nearest known black hole, found in 2022 from the wobble of a Sun-like companion star. It is not accreting, so it is truly dark.',
    discovered: '2022, Gaia mission',
  },
  {
    id: 'gaia-bh3', name: 'Gaia BH3', kind: 'black_hole', typeLabel: 'Dormant stellar-mass black hole', massSun: 32.7, ra: 294.83, dec: 14.93, distLy: 1926, disk: 0,
    description: 'The most massive stellar-mass black hole known in the Milky Way (33 M☉), announced in 2024.',
    discovered: '2024, Gaia mission',
  },
  {
    id: 'crab-pulsar', name: 'Crab Pulsar (PSR B0531+21)', kind: 'neutron_star', typeLabel: 'Pulsar (neutron star)', massSun: 1.4, ra: 83.63308, dec: 22.01450, distLy: 6500, radiusM: 10e3, temperature: 1.6e6, luminosity: 3.2e31, spinPeriodS: 0.0334,
    aliases: ['Crab Nebula pulsar'],
    description: 'The 12-km-wide neutron star left by the supernova of 1054 AD, spinning 30 times per second and lighting up the Crab Nebula with its relativistic wind.',
    discovered: '1968',
  },
  {
    id: 'vela-pulsar', name: 'Vela Pulsar', kind: 'neutron_star', typeLabel: 'Pulsar (neutron star)', massSun: 1.4, ra: 128.8361, dec: -45.1764, distLy: 936, radiusM: 10e3, temperature: 1.2e6, luminosity: 1e30, spinPeriodS: 0.0893,
    description: 'A young neutron star in the Vela supernova remnant, spinning 11 times per second; it "glitches" occasionally, speeding up abruptly.',
    discovered: '1968',
  },
  {
    id: 'psr-b1919', name: 'PSR B1919+21', kind: 'neutron_star', typeLabel: 'Pulsar (first discovered)', massSun: 1.4, ra: 290.4333, dec: 21.8833, distLy: 2300, radiusM: 10e3, temperature: 1e6, luminosity: 1e29, spinPeriodS: 1.3373,
    aliases: ['LGM-1'],
    description: 'The first pulsar ever found (Jocelyn Bell Burnell, 1967) — so regular that it was jokingly nicknamed LGM-1, "Little Green Men".',
    discovered: '1967',
  },
];

/** Distinctive compact objects placed at their catalogue positions: black holes, quasars and pulsars. */
export function addNotableObjects(u: Universe) {
  for (const d of DEFS) {
    const mass = d.massSun * M_SUN;
    const radius = d.radiusM ?? (2 * G * mass) / (C * C);
    const b = new Body({ id: d.id, name: d.name, kind: d.kind, typeLabel: d.typeLabel, mass, radius });
    b.aliases = d.aliases ?? [];
    b.group = 'Notable objects';
    b.description = d.description;
    b.facts = d.facts ?? [];
    b.discovered = d.discovered ?? '';
    b.temperature = d.temperature ?? 0;
    b.luminosity = d.luminosity ?? 0;
    const xyz = raDecToXYZ(d.ra, d.dec, d.distLy * LY);
    b.pos.set(xyz[0], xyz[1], xyz[2]);
    const pole = poleFromRaDec((d.ra + 40) % 360, 30 - 60 * ((d.ra % 7) / 7));
    b.spin = { pole, rate: TAU / (d.spinPeriodS ?? 3600), w0: 0 };
    b.look = {
      style: d.kind === 'black_hole' ? 'blackhole' : 'neutron', seed: Math.abs(Math.round(d.ra * 100)) % 65535, palette: ['#000000'],
      params: d.kind === 'black_hole' ? { disk: d.disk ?? 1, diskSize: d.id === 'm87-star' || d.id === 'ton-618' ? 1.3 : 1 } : {},
    };
    u.add(b);
  }
  void DEG; void R_SUN; void THREE;
}
