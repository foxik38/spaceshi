import { blackbodyRGB, raDecToXYZ } from '../core/math';
import { LY_PER_PC } from '../core/constants';
import { luminosityFromMassMS, radiusFromMassMS, teffFromMassMS } from '../sim/stellar';
import { M_SUN, R_SUN } from '../core/constants';

export type ExoPlanetRow = [string, number | null, number | null, number | null, number | null, number | null, number | null, number | null, number | null, string | null, number | null, number | null];

export interface ExoSystem {
  index: number;
  name: string;
  ra: number;
  dec: number;
  distPc: number;
  distLy: number;
  massSun: number;
  radiusSun: number;
  teff: number;
  age: number;
  planets: ExoPlanetRow[];
  /** position, ly (ICRS) */
  x: number; y: number; z: number;
  lumSun: number;
}

/** Confirmed exoplanet host systems (Open Exoplanet Catalogue). */
export class ExoCatalog {
  systems: ExoSystem[] = [];
  // packed arrays for rendering (mirror of StarCatalog fields)
  count = 0;
  nNear = 0;
  pos!: Float32Array;
  absMag!: Float32Array;
  color!: Float32Array;
  vel = new Float32Array(0);

  static async load(baseUrl: string): Promise<ExoCatalog> {
    const json = await fetch(`${baseUrl}data/exo.json`).then((r) => r.json());
    const cat = new ExoCatalog();
    let i = 0;
    for (const s of json.systems as any[]) {
      const xyz = raDecToXYZ(s.ra, s.dec, s.d * LY_PER_PC);
      const m = s.m ?? (s.t ? massFromT(s.t) : 0.8);
      const r = s.r ?? radiusFromMassMS(m);
      const T = s.t ?? teffFromMassMS(m);
      const lum = r * r * Math.pow(T / 5772, 4);
      cat.systems.push({
        index: i++, name: s.n, ra: s.ra, dec: s.dec, distPc: s.d, distLy: s.d * LY_PER_PC, massSun: m, radiusSun: r, teff: T, age: s.age ?? 0,
        planets: s.p, x: xyz[0], y: xyz[1], z: xyz[2], lumSun: lum,
      });
    }
    const n = cat.systems.length;
    cat.count = n;
    cat.pos = new Float32Array(n * 3);
    cat.absMag = new Float32Array(n);
    cat.color = new Float32Array(n * 3);
    cat.systems.forEach((s, k) => {
      cat.pos[k * 3] = s.x; cat.pos[k * 3 + 1] = s.y; cat.pos[k * 3 + 2] = s.z;
      cat.absMag[k] = 4.83 - 2.5 * Math.log10(Math.max(s.lumSun, 1e-5));
      const c = blackbodyRGB(s.teff);
      const w = 0.2;
      cat.color[k * 3] = c[0] + (1 - c[0]) * w; cat.color[k * 3 + 1] = c[1] + (1 - c[1]) * w; cat.color[k * 3 + 2] = c[2] + (1 - c[2]) * w;
    });
    return cat;
  }

  search(q: string, limit = 6): ExoSystem[] {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: ExoSystem[] = [];
    for (const e of this.systems) {
      const names = [e.name, ...e.planets.map((p) => p[0])];
      if (names.some((n) => n.toLowerCase().includes(s))) { out.push(e); if (out.length > 40) break; }
    }
    out.sort((a, b) => (b.name.toLowerCase().startsWith(s) ? 1 : 0) - (a.name.toLowerCase().startsWith(s) ? 1 : 0) || a.distLy - b.distLy);
    return out.slice(0, limit);
  }
}

function massFromT(T: number): number {
  let lo = 0.08, hi = 60;
  for (let i = 0; i < 40; i++) { const mid = Math.sqrt(lo * hi); if (teffFromMassMS(mid) < T) lo = mid; else hi = mid; }
  return lo;
}

export { M_SUN, R_SUN, luminosityFromMassMS };
