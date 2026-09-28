import * as THREE from 'three';
import { AU, DAY, DEG, G, M_SUN, TAU, YEAR } from '../core/constants';
import { hashString, mulberry32 } from '../core/math';
import { Body, poleFromRaDec, type BodyKind, type Look, type Atmosphere, type RingSpec } from '../sim/body';
import type { Elements } from '../sim/kepler';
import { equilibriumTemperature } from '../sim/stellar';

export interface OrbitSpec {
  /** Semi-major axis in km (moons) — or use aAU. */
  aKm?: number;
  aAU?: number;
  e: number;
  /** Degrees */
  i: number;
  Om?: number;
  w?: number;
  M?: number;
  /** Orbital period in days (overrides the Kepler-derived mean motion). */
  P?: number;
  plane?: Elements['plane'];
  dOm?: number; // deg / year
  dw?: number;  // deg / year
  /** For comets: perihelion distance (AU) instead of a; a = q / (1 - e). */
  qAU?: number;
  /** Time of perihelion as Julian date (sets M0=0 at that instant). */
  perihelionJD?: number;
}

/** Deterministic pseudo-random angles for elements we do not have, seeded from the body's name. */
function rnd(name: string, salt: number) { return mulberry32(hashString(name) + salt * 7919)(); }

export function makeElements(name: string, o: OrbitSpec): Elements {
  let a: number;
  if (o.qAU !== undefined) a = (o.qAU * AU) / (1 - o.e);
  else a = o.aKm !== undefined ? o.aKm * 1e3 : (o.aAU as number) * AU;
  const el: Elements = {
    a,
    e: o.e,
    i: o.i * DEG,
    Om: (o.Om ?? rnd(name, 1) * 360) * DEG,
    w: (o.w ?? rnd(name, 2) * 360) * DEG,
    M0: (o.M ?? rnd(name, 3) * 360) * DEG,
    t0: 0,
    plane: o.plane ?? 'parent',
  };
  if (o.P !== undefined) el.n = TAU / (o.P * DAY) * (o.e >= 1 ? 1 : 1);
  if (o.dOm) el.dOm = (o.dOm * DEG) / YEAR;
  if (o.dw) el.dw = (o.dw * DEG) / YEAR;
  if (o.perihelionJD !== undefined) {
    // M0 = 0 at time of perihelion
    el.t0 = (o.perihelionJD - 2451545.0) * DAY;
    el.M0 = 0;
  }
  return el;
}

export interface BodySpec {
  id: string;
  name: string;
  kind: BodyKind;
  typeLabel?: string;
  mass: number;
  /** Mean radius in metres. */
  radius: number;
  shape?: [number, number, number];
  flattening?: number;
  temperature?: number;
  albedo?: number;
  parent?: Body | null;
  orbit?: OrbitSpec;
  /** Rotation. period in hours (negative = retrograde). `locked` = synchronous. */
  rotHours?: number;
  poleRaDec?: [number, number];
  w0?: number;
  locked?: boolean;
  atmosphere?: Atmosphere;
  look?: Partial<Look>;
  description?: string;
  facts?: string[];
  discovered?: string;
  aliases?: string[];
  group?: string;
  luminosity?: number;
  spectral?: string;
  age?: number;
}

export function createBody(s: BodySpec): Body {
  const b = new Body({ id: s.id, name: s.name, kind: s.kind, typeLabel: s.typeLabel, mass: s.mass, radius: s.radius });
  if (s.shape) b.shape = s.shape;
  if (s.flattening) b.flattening = s.flattening;
  b.albedo = s.albedo ?? 0.3;
  b.atmosphere = s.atmosphere;
  b.description = s.description ?? '';
  b.facts = s.facts ?? [];
  b.discovered = s.discovered ?? '';
  b.aliases = s.aliases ?? [];
  b.group = s.group ?? '';
  b.luminosity = s.luminosity ?? 0;
  b.spectral = s.spectral ?? '';
  b.age = s.age ?? 0;
  b.look = {
    style: 'rocky', seed: hashString(s.id) % 100000, palette: ['#8a7f73', '#5d554d', '#b9ada0', '#3f3a35', '#e8e2da'], params: {},
    ...s.look,
  };
  if (s.parent) b.setParent(s.parent);
  if (s.orbit && s.parent) b.elements = makeElements(s.name, s.orbit);
  if (s.poleRaDec) {
    const pole = poleFromRaDec(s.poleRaDec[0], s.poleRaDec[1]);
    const hours = s.rotHours ?? 24;
    b.spin = { pole, rate: (TAU / (Math.abs(hours) * 3600)) * Math.sign(hours || 1), w0: (s.w0 ?? 0) * DEG, locked: s.locked };
    if (s.locked && b.elements) {
      // synchronous: rotation rate equals mean motion (informational)
      const mu = G * (s.parent?.mass ?? M_SUN);
      const n = b.elements.n ?? Math.sqrt(mu / Math.abs(b.elements.a ** 3));
      b.spin.rate = n * (b.elements.i > Math.PI / 2 ? -1 : 1);
    }
  }
  if (s.temperature !== undefined) b.temperature = s.temperature;
  return b;
}

/** Equilibrium temperature of a body around a star `dist` metres away. */
export function estimateTemperature(starLum: number, dist: number, albedo: number) {
  return equilibriumTemperature(starLum, dist, albedo);
}

export const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

export const RING_PRESETS: Record<string, RingSpec[]> = {};
