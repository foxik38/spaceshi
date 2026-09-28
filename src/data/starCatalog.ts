import { blackbodyRGB, tempFromBV } from '../core/math';
import { LY } from '../core/constants';
import { teffFromClass } from '../sim/stellar';

export interface StarMeta {
  index: number;
  name: string;
  spect: string;
  mag: number;
  lum: number;
  con: string;
  hip: number;
  hd: number;
  gl: string;
  distLy: number;
  comp: number;
}

/** Real stars (HYG database): positions in light-years relative to the Sun, ICRS axes. */
export class StarCatalog {
  count = 0;
  nNear = 0;
  /** x,y,z in ly */
  pos!: Float32Array;
  absMag!: Float32Array;
  /** linear RGB */
  color!: Float32Array;
  ci!: Float32Array;
  /** ly per year, only for the first nNear stars */
  vel!: Float32Array;
  meta: StarMeta[] = [];
  metaByIndex = new Map<number, StarMeta>();
  private nameIndex: { lower: string; meta: StarMeta }[] = [];

  static async load(baseUrl: string): Promise<StarCatalog> {
    const [binBuf, metaJson] = await Promise.all([
      fetch(`${baseUrl}data/stars.bin`).then((r) => r.arrayBuffer()),
      fetch(`${baseUrl}data/stars-meta.json`).then((r) => r.json()),
    ]);
    const cat = new StarCatalog();
    const dv = new DataView(binBuf);
    cat.count = dv.getUint32(0, true);
    cat.nNear = dv.getUint32(4, true);
    const raw = new Float32Array(binBuf, 8, cat.count * 5);
    cat.vel = new Float32Array(binBuf.slice(8 + cat.count * 5 * 4, 8 + cat.count * 5 * 4 + cat.nNear * 12));
    cat.pos = new Float32Array(cat.count * 3);
    cat.absMag = new Float32Array(cat.count);
    cat.ci = new Float32Array(cat.count);
    cat.color = new Float32Array(cat.count * 3);
    const cache = new Map<number, [number, number, number]>();
    for (let i = 0; i < cat.count; i++) {
      cat.pos[i * 3] = raw[i * 5]; cat.pos[i * 3 + 1] = raw[i * 5 + 1]; cat.pos[i * 3 + 2] = raw[i * 5 + 2];
      cat.absMag[i] = raw[i * 5 + 3];
      cat.ci[i] = raw[i * 5 + 4];
    }
    const fields: string[] = metaJson.fields;
    const ix = (n: string) => fields.indexOf(n);
    for (const row of metaJson.rows as any[]) {
      const m: StarMeta = {
        index: row[ix('index')], name: row[ix('name')], spect: row[ix('spect')], mag: row[ix('mag')], lum: row[ix('lum')] ?? 0, con: row[ix('con')],
        hip: row[ix('hip')], hd: row[ix('hd')], gl: row[ix('gl')], distLy: row[ix('distLy')], comp: row[ix('comp')],
      };
      cat.meta.push(m);
      cat.metaByIndex.set(m.index, m);
      cat.nameIndex.push({ lower: (m.name + ' ' + (m.gl || '') + (m.hd ? ' hd ' + m.hd : '') + (m.hip ? ' hip ' + m.hip : '')).toLowerCase(), meta: m });
    }
    // colours (quantised by temperature to keep this fast)
    for (let i = 0; i < cat.count; i++) {
      const meta = cat.metaByIndex.get(i);
      let T: number;
      if (cat.ci[i] < 90) T = tempFromBV(cat.ci[i]);
      else if (meta?.spect) T = spectTemp(meta.spect);
      else T = 4200;
      const key = Math.round(T / 40);
      let c = cache.get(key);
      if (!c) { c = blackbodyRGB(key * 40); cache.set(key, c); }
      cat.color[i * 3] = c[0]; cat.color[i * 3 + 1] = c[1]; cat.color[i * 3 + 2] = c[2];
    }
    return cat;
  }

  search(q: string, limit = 8): StarMeta[] {
    const s = q.trim().toLowerCase();
    if (s.length < 2) return [];
    const out: StarMeta[] = [];
    for (const e of this.nameIndex) {
      if (e.lower.includes(s)) {
        out.push(e.meta);
        if (out.length >= limit * 6) break;
      }
    }
    out.sort((a, b) => {
      const an = a.name.toLowerCase(), bn = b.name.toLowerCase();
      const sa = an.startsWith(s) ? 0 : 1, sb = bn.startsWith(s) ? 0 : 1;
      return sa - sb || a.distLy - b.distLy;
    });
    return out.slice(0, limit);
  }

  positionLy(i: number, out: [number, number, number], years = 0) {
    out[0] = this.pos[i * 3]; out[1] = this.pos[i * 3 + 1]; out[2] = this.pos[i * 3 + 2];
    if (i < this.nNear) {
      out[0] += this.vel[i * 3] * years; out[1] += this.vel[i * 3 + 1] * years; out[2] += this.vel[i * 3 + 2] * years;
    }
    return out;
  }

  distanceLy(i: number): number { return Math.hypot(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]); }
}

function spectTemp(s: string): number {
  const m = s.match(/^[a-z]*([OBAFGKMLT])(\d(?:\.\d)?)?/i);
  if (!m) return 4500;
  return teffFromClass(m[1].toUpperCase(), m[2] ? Number(m[2]) : 5);
}

export { LY };
