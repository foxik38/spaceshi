import * as THREE from 'three';
import { AU, C, DAY, G, LY, M_SUN, R_SUN, YEAR, L_SUN, PC } from '../core/constants';
import { formatNumber } from '../core/math';
import { formatDistance, formatDuration, formatMass, formatRadius, formatSpeed, formatTemperature } from '../core/units';
import { Body, equatorialRadius } from '../sim/body';
import { orbitalPeriod } from '../sim/kepler';
import { habitableZone, hawkingTemperature, inferStar, schwarzschildRadius } from '../sim/stellar';
import type { DsoCatalog, Dso } from '../data/dsoCatalog';
import type { StarCatalog } from '../data/starCatalog';
import type { NavTarget } from '../nav/target';
import { bodyTarget } from '../nav/target';

export interface StatRow { label: string; value: string }

export type SelectionSource =
  | { type: 'body'; body: Body }
  | { type: 'star'; index: number }
  | { type: 'dso'; index: number };

export interface Selectable extends NavTarget {
  subtitle: string;
  source: SelectionSource;
  description?: string;
  facts?: string[];
  procedural?: boolean;
  stats(camPos: THREE.Vector3, time: number): StatRow[];
}

const V = new THREE.Vector3();

function row(label: string, value: string, out: StatRow[]) { out.push({ label, value }); }

export function bodySelectable(b: Body, ctx?: { universe?: { bodies: Body[] } }): Selectable {
  const base = bodyTarget(b);
  return {
    ...base,
    subtitle: b.typeLabel,
    source: { type: 'body', body: b },
    description: b.description || undefined,
    facts: b.facts.length ? b.facts : undefined,
    procedural: b.procedural,
    stats: (camPos, time) => bodyStats(b, camPos, time, ctx),
  };
}

export function bodyStats(b: Body, camPos: THREE.Vector3, time: number, ctx?: { universe?: { bodies: Body[] } }): StatRow[] {
  const s: StatRow[] = [];
  row('Type', b.typeLabel, s);
  if (b.parent) row(b.kind === 'moon' ? 'Orbits' : 'Orbiting', b.parent.name, s);
  row('Distance from you', formatDistance(b.pos.distanceTo(camPos)), s);
  if (b.kind === 'black_hole') {
    const rs = schwarzschildRadius(b.mass);
    row('Mass', formatMass(b.mass), s);
    row('Event horizon radius', formatRadius(rs), s);
    row('Photon sphere', formatRadius(rs * 1.5), s);
    row('Innermost stable orbit', formatRadius(rs * 3), s);
    row('Hawking temperature', `${formatNumber(hawkingTemperature(b.mass), 3)} K`, s);
    row('Mean density (inside horizon)', `${formatNumber(b.mass / ((4 / 3) * Math.PI * rs ** 3), 3)} kg/m³`, s);
    if (b.spin) row('Spin period', formatDuration((2 * Math.PI) / Math.abs(b.spin.rate)), s);
    return s;
  }
  row('Mass', formatMass(b.mass), s);
  row('Radius', formatRadius(equatorialRadius(b)), s);
  if (b.shape) row('Dimensions', b.shape.map((v) => formatRadius(v * 2)).join(' × '), s);
  row('Mean density', `${formatNumber(b.density, 3)} kg/m³`, s);
  row('Surface gravity', `${formatNumber(b.surfaceGravity, 3)} m/s²  (${formatNumber(b.surfaceGravity / 9.80665, 3)} g)`, s);
  row('Escape velocity', formatSpeed(b.escapeVelocity), s);
  if (b.isStellar) {
    row('Spectral class', b.spectral || '—', s);
    row('Effective temperature', formatTemperature(b.temperature), s);
    if (b.luminosity > 0) row('Luminosity', `${formatNumber(b.luminosity / L_SUN, 3)} L☉`, s);
    if (b.age > 0) row('Age', formatDuration(b.age * YEAR), s);
    if (b.luminosity > 0) {
      const [hi, ho] = habitableZone(b.luminosity, b.temperature);
      row('Habitable zone', `${(hi / AU).toFixed(2)} – ${(ho / AU).toFixed(2)} AU`, s);
      const dist = Math.max(b.pos.distanceTo(camPos), b.radius);
      const m = -26.74 - 2.5 * Math.log10((b.luminosity / L_SUN) * Math.pow(AU / dist, 2));
      row('Apparent magnitude (from you)', m.toFixed(2), s);
    }
  } else {
    row('Temperature', formatTemperature(b.temperature), s);
    if (b.albedo > 0) row('Bond albedo', b.albedo.toFixed(2), s);
  }
  if (b.spin) {
    const per = (2 * Math.PI) / Math.abs(b.spin.rate);
    row('Rotation period', `${formatDuration(per)}${b.spin.rate < 0 ? ' (retrograde)' : ''}${b.spin.locked ? ' — tidally locked' : ''}`, s);
    if (b.parent) {
      const h = V.crossVectors(b.pos.clone().sub(b.parent.pos), b.vel.clone().sub(b.parent.vel));
      if (h.lengthSq() > 0) {
        const tilt = Math.acos(THREE.MathUtils.clamp(h.normalize().dot(b.spin.pole), -1, 1)) * (180 / Math.PI);
        row('Axial tilt', `${tilt.toFixed(1)}°`, s);
      }
    }
  }
  if (b.atmosphere) {
    row('Atmosphere', b.atmosphere.composition, s);
    row('Surface pressure', b.atmosphere.pressure >= 1000 ? `${formatNumber(b.atmosphere.pressure / 1000, 3)} kPa  (${formatNumber(b.atmosphere.pressure / 101325, 3)} atm)` : `${formatNumber(b.atmosphere.pressure, 3)} Pa`, s);
  } else if (!b.isStellar) row('Atmosphere', 'None / negligible', s);
  if (b.parent && b.elements) {
    const el = b.elementsAt ? b.elementsAt(time) : b.elements;
    const mu = G * (b.parent.mass + b.mass);
    const rel = b.pos.clone().sub(b.parent.pos);
    const speed = b.vel.clone().sub(b.parent.vel).length();
    if (el.e < 1) {
      row('Semi-major axis', formatDistance(el.a), s);
      row('Orbital period', formatDuration(orbitalPeriod(el, mu)), s);
    } else row('Orbit', `hyperbolic, e = ${el.e.toFixed(3)}`, s);
    row('Eccentricity', el.e.toFixed(4), s);
    row('Inclination', `${((el.i * 180) / Math.PI).toFixed(2)}°`, s);
    row('Distance from primary', formatDistance(rel.length()), s);
    row('Orbital speed', formatSpeed(speed), s);
  }
  if (b.kind !== 'moon' && b.children.length) {
    const moons = b.children.filter((c) => c.kind === 'moon');
    if (moons.length) row('Known moons (in game)', String(moons.length), s);
  }
  if (b.discovered) row('Discovered', b.discovered, s);
  void ctx; void C; void DAY; void M_SUN; void R_SUN;
  return s;
}

// ---------------------------------------------------------------- catalogue stars
export function starSelectable(cat: StarCatalog, index: number, timeYears: () => number): Selectable {
  const meta = cat.metaByIndex.get(index);
  const name = meta?.name || (meta?.gl) || `Star ${index}`;
  const phys = inferStar({ spect: meta?.spect, lumSolar: meta?.lum, absmag: cat.absMag[index], bv: cat.ci[index] });
  const pos: [number, number, number] = [0, 0, 0];
  return {
    id: `star:${index}`, name, kind: phys.kind === 'white_dwarf' ? 'white_dwarf' : 'star', radius: phys.radius, standoff: 5,
    getPos: (out) => { cat.positionLy(index, pos, timeYears()); return out.set(pos[0] * LY, pos[1] * LY, pos[2] * LY); },
    subtitle: phys.typeLabel,
    source: { type: 'star', index },
    description: meta ? `A real star ${meta.distLy.toFixed(1)} light-years from the Sun${meta.con ? ' in the constellation ' + meta.con : ''}. Positions from the HYG database (Hipparcos, Yale Bright Star and Gliese catalogues).` : undefined,
    stats: (camPos, time) => {
      const s: StatRow[] = [];
      const p = cat.positionLy(index, [0, 0, 0], time / YEAR);
      const d = V.set(p[0] * LY, p[1] * LY, p[2] * LY).distanceTo(camPos);
      row('Type', phys.typeLabel, s);
      row('Distance from you', formatDistance(d), s);
      row('Distance from Sun', `${cat.distanceLy(index).toFixed(2)} ly  (${(cat.distanceLy(index) / (PC / LY)).toFixed(2)} pc)`, s);
      row('Spectral class', meta?.spect || phys.spectral, s);
      row('Effective temperature', formatTemperature(phys.teff), s);
      row('Luminosity', `${formatNumber(phys.luminosity / L_SUN, 3)} L☉`, s);
      row('Radius (est.)', formatRadius(phys.radius), s);
      row('Mass (est.)', formatMass(phys.mass), s);
      const absM = cat.absMag[index];
      row('Absolute magnitude', absM.toFixed(2), s);
      const appM = absM + 5 * Math.log10(Math.max(d / PC, 1e-12) / 10);
      row('Apparent magnitude (from you)', appM.toFixed(2), s);
      if (meta?.con) row('Constellation', meta.con, s);
      if (meta?.hip) row('Hipparcos', `HIP ${meta.hip}`, s);
      if (meta?.hd) row('Henry Draper', `HD ${meta.hd}`, s);
      if (meta?.gl) row('Gliese', meta.gl, s);
      if (phys.luminosity > 0) {
        const [hi, ho] = habitableZone(phys.luminosity, phys.teff);
        row('Habitable zone', `${(hi / AU).toFixed(2)} – ${(ho / AU).toFixed(2)} AU`, s);
      }
      return s;
    },
  };
}

// ---------------------------------------------------------------- deep-sky objects
export function dsoSelectable(cat: DsoCatalog, o: Dso): Selectable {
  const name = cat.displayName(o);
  const kind = o.type === 'G' || o.type.startsWith('G') ? 'galaxy' : o.type === 'OCl' || o.type === 'GCl' || o.type === '*Ass' ? 'star_cluster' : 'nebula';
  return {
    id: `dso:${o.index}`, name, kind, radius: Math.max(o.sizeLy * 0.5 * LY, 1e12), standoff: 2.4,
    getPos: (out) => out.set(o.x * LY, o.y * LY, o.z * LY),
    subtitle: o.label + (o.hubble ? ` (${o.hubble})` : ''),
    source: { type: 'dso', index: o.index },
    description: o.estimated ? 'Distance is estimated from the object\'s apparent size — treat its exact placement as approximate.' : undefined,
    stats: (camPos) => {
      const s: StatRow[] = [];
      row('Type', o.label, s);
      if (o.hubble) row('Morphology', o.hubble, s);
      row('Distance from you', formatDistance(V.set(o.x * LY, o.y * LY, o.z * LY).distanceTo(camPos)), s);
      row('Distance from Sun', `${formatLy(o.distLy)}${o.estimated ? ' (estimated)' : ''}`, s);
      row('Diameter', formatLy(o.sizeLy), s);
      if (o.mag < 90) row('Apparent magnitude', o.mag.toFixed(1), s);
      if (o.id) row('Catalogue', [o.id, o.messier].filter(Boolean).join(' · '), s);
      row('Sky position', `RA ${(o.ra / 15).toFixed(2)} h, Dec ${o.dec >= 0 ? '+' : ''}${o.dec.toFixed(2)}°`, s);
      if (o.type === 'G' && o.distLy > 2e7) row('Look-back time', formatDuration(o.distLy * YEAR), s);
      return s;
    },
  };
}

export function formatLy(ly: number): string {
  if (ly < 1000) return `${ly.toFixed(ly < 10 ? 2 : 0)} ly`;
  if (ly < 1e6) return `${(ly / 1e3).toFixed(1)} kly`;
  if (ly < 1e9) return `${(ly / 1e6).toFixed(1)} Mly`;
  return `${(ly / 1e9).toFixed(2)} Gly`;
}
