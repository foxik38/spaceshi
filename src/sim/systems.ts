import * as THREE from 'three';
import { AU, DAY, DEG, G, L_SUN, LY, M_EARTH, M_JUP, M_SUN, R_EARTH, R_JUP, R_SUN, TAU, YEAR } from '../core/constants';
import { gauss, hashString, mulberry32 } from '../core/math';
import { PRESET_BY_ID, createUserBody } from '../data/presets';
import type { ExoCatalog, ExoPlanetRow, ExoSystem } from '../data/exoCatalog';
import type { StarCatalog } from '../data/starCatalog';
import { Body, poleFromRaDec } from './body';
import { equilibriumTemperature, inferStar } from './stellar';
import type { Universe } from './universe';

export const ACTIVATION_RADIUS = 0.05 * LY; // ~3,100 AU

const LETTERS = 'bcdefghijklmnop';

function radiusFromMassEarth(m: number): number {
  if (m < 2) return Math.pow(m, 0.28);
  if (m < 100) return 1.21 * Math.pow(m / 2, 0.59);
  return 12.1 * Math.pow(100 / m, 0.02) * Math.pow(Math.min(m, 4000) / 100, 0.02);
}
function massFromRadiusEarth(r: number): number {
  if (r < 1.21) return Math.pow(r, 1 / 0.28);
  if (r < 12) return 2 * Math.pow(r / 1.21, 1 / 0.59);
  return 300;
}

function randomPole(rand: () => number): THREE.Vector3 {
  const z = 2 * rand() - 1, a = rand() * TAU, s = Math.sqrt(1 - z * z);
  return new THREE.Vector3(s * Math.cos(a), s * Math.sin(a), z);
}

interface ActiveSystem { star: Body; bodies: Body[]; key: string; }

/** Creates star systems on demand around catalogue stars and exoplanet hosts. */
export class SystemManager {
  active = new Map<string, ActiveSystem>();
  private exoByHyg = new Map<number, ExoSystem>();
  private frame = 0;
  onActivate?: (s: Body) => void;

  constructor(private universe: Universe, private stars?: StarCatalog, private exo?: ExoCatalog) {
    if (stars && exo) this.matchExo();
  }

  /** Link exoplanet hosts to HYG stars at the same place (so their real planets appear around the real star). */
  private matchExo() {
    const stars = this.stars!, exo = this.exo!;
    for (const s of exo.systems) {
      if (s.distLy > 120) continue;
      let best = -1, bd = Infinity;
      const tol = Math.max(0.5, 0.03 * s.distLy);
      for (let i = 0; i < stars.nNear; i++) {
        const dx = stars.pos[i * 3] - s.x, dy = stars.pos[i * 3 + 1] - s.y, dz = stars.pos[i * 3 + 2] - s.z;
        const d = Math.hypot(dx, dy, dz);
        if (d < tol && d < bd) { bd = d; best = i; }
      }
      if (best >= 0) { this.exoByHyg.set(best, s); exo.absMag[s.index] = 40; } // hide the duplicate dot
    }
  }

  /** Real exoplanet host data for a catalogue star, if any. */
  exoFor(index: number): ExoSystem | undefined { return this.exoByHyg.get(index); }

  // ---------------------------------------------------------------------- star bodies
  private starBody(id: string, name: string, phys: ReturnType<typeof inferStar>, posLy: [number, number, number], velLyYr: [number, number, number], seed: number, catalogIndex: number): Body {
    const b = new Body({ id, name, kind: phys.kind, typeLabel: phys.typeLabel, mass: phys.mass, radius: phys.radius });
    b.luminosity = phys.luminosity;
    b.temperature = phys.teff;
    b.spectral = phys.spectral;
    b.albedo = 0;
    b.group = 'Nearby stars';
    b.catalogIndex = catalogIndex;
    const rand = mulberry32(seed);
    b.spin = { pole: randomPole(rand), rate: TAU / ((5 + rand() * 30) * DAY), w0: rand() * TAU };
    b.look = { style: phys.kind === 'white_dwarf' ? 'whitedwarf' : 'sun', seed: seed % 65535, palette: ['#fff'], params: { granulation: 1, spots: phys.teff < 6500 ? 0.5 : 0 } };
    const p0 = new THREE.Vector3(posLy[0] * LY, posLy[1] * LY, posLy[2] * LY);
    const v = new THREE.Vector3(velLyYr[0] * LY / YEAR, velLyYr[1] * LY / YEAR, velLyYr[2] * LY / YEAR);
    b.pos.copy(p0).addScaledVector(v, this.universe.clock.t);
    b.vel.copy(v);
    b.customRails = (self, t) => { self.pos.copy(p0).addScaledVector(v, t); self.vel.copy(v); };
    return b;
  }

  activateStar(index: number): Body | null {
    const stars = this.stars;
    if (!stars) return null;
    const id = `star:${index}`;
    const ex = this.active.get(id);
    if (ex) return ex.star;
    const meta = stars.metaByIndex.get(index);
    const name = meta?.name || meta?.gl || `HYG ${index}`;
    const hostExo = this.exoFor(index);
    let phys = inferStar({ spect: meta?.spect, lumSolar: meta?.lum, absmag: stars.absMag[index], bv: stars.ci[index] });
    if (hostExo && hostExo.massSun > 0 && phys.kind === 'star' && !meta?.spect) {
      phys = { ...phys, mass: hostExo.massSun * M_SUN };
    }
    const p: [number, number, number] = [stars.pos[index * 3], stars.pos[index * 3 + 1], stars.pos[index * 3 + 2]];
    const v: [number, number, number] = index < stars.nNear ? [stars.vel[index * 3], stars.vel[index * 3 + 1], stars.vel[index * 3 + 2]] : [0, 0, 0];
    const star = this.starBody(id, name, phys, p, v, hashString(id), index);
    star.description = meta ? `A real star ${meta.distLy.toFixed(1)} light-years from the Sun${meta.con ? ' in ' + meta.con : ''}.` : '';
    this.universe.add(star);
    const bodies: Body[] = [star];
    if (phys.kind === 'star' || phys.kind === 'brown_dwarf') {
      if (hostExo) bodies.push(...this.planetsFromExo(star, hostExo));
      else bodies.push(...this.generatePlanets(star, hashString(id + 'sys')));
    }
    for (const b of bodies.slice(1)) this.universe.add(b);
    this.universe.update(this.universe.clock.t);
    for (const b of bodies) this.finish(b, star);
    this.active.set(id, { star, bodies, key: id });
    this.onActivate?.(star);
    return star;
  }

  activateExo(index: number): Body | null {
    const exo = this.exo;
    if (!exo) return null;
    const sys = exo.systems[index];
    const id = `exo:${index}`;
    const ex = this.active.get(id);
    if (ex) return ex.star;
    const L = sys.lumSun * L_SUN;
    const phys = inferStar({ lumSolar: sys.lumSun, spect: undefined, absmag: 4.83 - 2.5 * Math.log10(sys.lumSun) });
    phys.mass = sys.massSun * M_SUN; phys.radius = sys.radiusSun * R_SUN; phys.teff = sys.teff; phys.luminosity = L;
    const star = this.starBody(id, sys.name, phys, [sys.x, sys.y, sys.z], [0, 0, 0], hashString(id), -1);
    star.description = `Host star of ${sys.planets.length} confirmed exoplanet${sys.planets.length > 1 ? 's' : ''}, ${sys.distLy.toFixed(0)} light-years away (Open Exoplanet Catalogue).`;
    star.group = 'Exoplanet hosts';
    this.universe.add(star);
    const planets = this.planetsFromExo(star, sys);
    for (const b of planets) this.universe.add(b);
    const bodies = [star, ...planets];
    this.universe.update(this.universe.clock.t);
    for (const b of bodies) this.finish(b, star);
    this.active.set(id, { star, bodies, key: id });
    this.onActivate?.(star);
    return star;
  }

  private finish(b: Body, star: Body) {
    if (b === star) return;
    if (!b.temperature) b.temperature = equilibriumTemperature(star.luminosity, Math.max(b.pos.distanceTo(star.pos), 1e8), Math.min(b.albedo, 0.9));
  }

  // ------------------------------------------------------------------ real planets
  private planetsFromExo(star: Body, sys: ExoSystem): Body[] {
    const out: Body[] = [];
    const rand = mulberry32(hashString(sys.name));
    const Mstar = star.mass;
    sys.planets.forEach((row: ExoPlanetRow, k) => {
      const [name, massMj, radiusRj, periodD, aAU, ecc, , tempK, year, method, peri, node] = row;
      let a = aAU ? aAU * AU : 0;
      if (!a && periodD) a = Math.cbrt((G * Mstar * (periodD * DAY) ** 2) / (4 * Math.PI ** 2));
      if (!(a > 0)) return;
      let mE = massMj ? (massMj * M_JUP) / M_EARTH : 0;
      let rE = radiusRj ? (radiusRj * R_JUP) / R_EARTH : 0;
      if (!mE && rE) mE = massFromRadiusEarth(rE);
      if (!rE && mE) rE = radiusFromMassEarth(mE);
      if (!mE) { mE = 5; rE = radiusFromMassEarth(5); }
      const teq = tempK ?? equilibriumTemperature(star.luminosity, a, 0.3);
      const presetId = pickPreset(mE, teq, a / AU, rand);
      const b = createUserBody(PRESET_BY_ID.get(presetId)!, { name, mass: mE * M_EARTH });
      b.userCreated = false;
      b.id = `${star.id}:${LETTERS[k] ?? k}`;
      b.radius = rE * R_EARTH;
      b.temperature = teq;
      b.group = 'Exoplanets';
      b.procedural = false;
      b.discovered = year ? `${year}${method ? ' (' + method + ')' : ''}` : '';
      b.description = `A confirmed exoplanet: its mass, size and orbit come from the Open Exoplanet Catalogue; the surface appearance shown here is an illustrative guess.`;
      b.setParent(star);
      const inc = (rand() - 0.5) * 4 * DEG;
      b.elements = {
        a, e: Math.min(ecc ?? 0.02, 0.95), i: Math.abs(inc), Om: (node ?? rand() * 360) * DEG, w: (peri ?? rand() * 360) * DEG, M0: rand() * TAU, t0: 0, plane: 'parent',
      };
      b.look.seed = hashString(b.id) % 65535;
      out.push(b);
    });
    return out;
  }

  // -------------------------------------------------------------- procedural planets
  private generatePlanets(star: Body, seed: number): Body[] {
    const rand = mulberry32(seed);
    const out: Body[] = [];
    const Lsun = star.luminosity / L_SUN;
    const msun = star.mass / M_SUN;
    let n: number;
    if (star.kind === 'brown_dwarf') n = rand() < 0.3 ? 1 : 0;
    else if (msun < 0.6) n = Math.max(0, Math.round(3.6 + gauss(rand) * 1.8));
    else n = Math.max(0, Math.round(2.8 + gauss(rand) * 2));
    n = Math.min(n, 9);
    const frost = 2.7 * Math.sqrt(Math.max(Lsun, 1e-4)) * AU;
    let a = msun < 0.6 ? (0.012 + rand() * 0.03) * AU * Math.max(Math.sqrt(Lsun) * 6, 0.3) : (0.05 + rand() * 0.3) * Math.sqrt(Math.max(Lsun, 0.02)) * AU;
    for (let k = 0; k < n; k++) {
      a *= 1.35 + rand() * 0.85;
      const outer = a > frost;
      let mE: number;
      if (!outer) mE = Math.pow(10, -1.1 + rand() * 1.9) * (rand() < 0.1 ? 3 : 1);
      else mE = rand() < 0.5 ? Math.pow(10, 1.3 + rand() * 1.7) : Math.pow(10, 1 + rand() * 0.7);
      if (k === 0 && msun > 0.7 && rand() < 0.04) mE = Math.pow(10, 2.2 + rand() * 0.6);
      const teq = equilibriumTemperature(star.luminosity, a, 0.3);
      const presetId = pickPreset(mE, teq, a / AU, rand);
      const b = createUserBody(PRESET_BY_ID.get(presetId)!, { name: `${star.name} ${LETTERS[k]}`, mass: mE * M_EARTH });
      b.userCreated = false;
      b.id = `${star.id}:${LETTERS[k]}`;
      b.procedural = true;
      b.group = 'Procedural planets';
      b.temperature = teq;
      b.radius = radiusFromMassEarth(mE) * R_EARTH;
      b.description = 'No planets have been detected around this star; this system is procedurally generated from typical planetary statistics so that you can explore it.';
      b.setParent(star);
      const e = Math.abs(gauss(rand)) * 0.08;
      b.elements = { a, e: Math.min(e, 0.4), i: Math.abs(gauss(rand)) * 2 * DEG, Om: rand() * TAU, w: rand() * TAU, M0: rand() * TAU, t0: 0, plane: 'parent' };
      b.look.seed = hashString(b.id) % 65535;
      out.push(b);
      // moons
      const nm = mE > 30 ? Math.floor(rand() * 4) : mE > 0.5 && rand() < 0.25 ? 1 : 0;
      for (let m = 0; m < nm; m++) {
        const mm = mE > 30 ? Math.pow(10, -3 + rand() * 1.6) : Math.pow(10, -2.4 + rand() * 0.8);
        const preset = PRESET_BY_ID.get(rand() < 0.5 ? 'moon' : 'ice-moon')!;
        const mb = createUserBody(preset, { name: `${b.name} ${['I', 'II', 'III', 'IV'][m]}`, mass: mm * M_EARTH });
        mb.userCreated = false;
        mb.id = `${b.id}:m${m}`;
        mb.kind = 'moon';
        mb.procedural = true;
        mb.group = 'Procedural planets';
        mb.radius = Math.max(radiusFromMassEarth(mm) * R_EARTH, 1e5);
        const hill = a * Math.cbrt(b.mass / (3 * star.mass));
        const am = Math.max(b.radius * (3 + m * 2.4 + rand() * 2), 1) * 1.0;
        mb.setParent(b);
        mb.elements = { a: Math.min(am * (1 + rand()), hill * 0.4), e: rand() * 0.05, i: rand() * 0.06, Om: rand() * TAU, w: rand() * TAU, M0: rand() * TAU, t0: 0, plane: 'parent' };
        b.spin = b.spin ?? { pole: poleFromRaDec(0, 90), rate: 7e-5, w0: 0 };
        mb.spin = { pole: b.spin.pole.clone(), rate: TAU / (2 * DAY), w0: 0, locked: true };
        mb.look.seed = hashString(mb.id) % 65535;
        out.push(mb);
      }
    }
    return out;
  }

  // ----------------------------------------------------------------------- lifecycle
  /** Activate systems the camera is close to; retire distant ones (unless still in use). */
  update(camPos: THREE.Vector3, keep: (star: Body) => boolean) {
    if (++this.frame % 20 !== 0) return;
    const stars = this.stars, exo = this.exo;
    const cx = camPos.x / LY, cy = camPos.y / LY, cz = camPos.z / LY;
    const r = ACTIVATION_RADIUS / LY;
    const r2 = r * r;
    if (stars) {
      for (let i = 0; i < stars.count; i++) {
        const dx = stars.pos[i * 3] - cx;
        if (dx > r || dx < -r) continue;
        const dy = stars.pos[i * 3 + 1] - cy;
        if (dy > r || dy < -r) continue;
        const dz = stars.pos[i * 3 + 2] - cz;
        if (dx * dx + dy * dy + dz * dz < r2 && !this.active.has(`star:${i}`)) this.activateStar(i);
      }
    }
    if (exo) {
      for (let i = 0; i < exo.count; i++) {
        if (exo.absMag[i] > 30) continue;
        const dx = exo.pos[i * 3] - cx;
        if (dx > r || dx < -r) continue;
        const dy = exo.pos[i * 3 + 1] - cy, dz = exo.pos[i * 3 + 2] - cz;
        if (dx * dx + dy * dy + dz * dz < r2 && !this.active.has(`exo:${i}`)) this.activateExo(i);
      }
    }
    for (const [id, sys] of [...this.active]) {
      const d = sys.star.pos.distanceTo(camPos);
      if (d > ACTIVATION_RADIUS * 4 && !keep(sys.star) && !sys.bodies.some((b) => b.userCreated || b.dynamic)) this.deactivate(id);
    }
  }

  deactivate(id: string) {
    const sys = this.active.get(id);
    if (!sys) return;
    this.universe.remove(sys.star);
    this.active.delete(id);
  }

  /** Indices of catalogue stars that currently exist as full bodies (their point sprites are hidden). */
  hiddenCatalogIndices(): number[] {
    const out: number[] = [];
    for (const s of this.active.values()) if (s.star.catalogIndex >= 0) out.push(s.star.catalogIndex);
    return out.slice(0, 4);
  }
  hiddenExoIndices(): number[] {
    const out: number[] = [];
    for (const [id] of this.active) if (id.startsWith('exo:')) out.push(Number(id.slice(4)));
    return out.slice(0, 4);
  }
}

function pickPreset(mE: number, teq: number, aAU: number, rand: () => number): string {
  if (mE > 100) return aAU < 0.1 ? 'hot-jupiter' : rand() < 0.2 ? 'saturn-like' : 'jupiter-like';
  if (mE > 5) return teq > 1200 && aAU < 0.05 ? 'hot-jupiter' : 'ice-giant';
  if (teq > 1000) return 'lava-world';
  if (mE < 0.12) return 'rocky-airless';
  if (teq > 330) return 'desert-world';
  if (teq > 200) { const u = rand(); return u < 0.5 ? 'earthlike' : u < 0.75 ? 'ocean-world' : 'desert-world'; }
  return 'ice-world';
}
