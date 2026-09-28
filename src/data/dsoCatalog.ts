import { LY } from '../core/constants';
import { DEG, } from '../core/constants';

export type DsoType =
  | 'G' | 'GPair' | 'GTrpl' | 'GGroup' | 'OCl' | 'GCl' | 'PN' | 'Neb' | 'HII' | 'Cl+N' | 'RfN' | 'EmN' | 'SNR' | 'Nova' | '*Ass' | 'DrkN';

export interface Dso {
  index: number;
  id: string;
  messier: string;
  common: string;
  type: DsoType;
  ra: number;
  dec: number;
  distLy: number;
  majArcmin: number;
  minArcmin: number;
  posAngle: number;
  mag: number;
  hubble: string;
  estimated: boolean;
  /** Position in ly (ICRS) */
  x: number; y: number; z: number;
  /** Physical diameter in ly */
  sizeLy: number;
  label: string;
}

export const DSO_LABEL: Record<string, string> = {
  G: 'Galaxy', GPair: 'Galaxy pair', GTrpl: 'Galaxy triplet', GGroup: 'Galaxy group', OCl: 'Open star cluster', GCl: 'Globular cluster',
  PN: 'Planetary nebula', Neb: 'Nebula', HII: 'H II region (emission nebula)', 'Cl+N': 'Cluster with nebulosity', RfN: 'Reflection nebula',
  EmN: 'Emission nebula', SNR: 'Supernova remnant', Nova: 'Nova', '*Ass': 'Stellar association', DrkN: 'Dark nebula',
};

/** NGC/IC/Messier deep-sky objects (OpenNGC) with positions derived from literature or redshift distances. */
export class DsoCatalog {
  objects: Dso[] = [];
  private nameIndex: { lower: string; obj: Dso }[] = [];

  static async load(baseUrl: string): Promise<DsoCatalog> {
    const json = await fetch(`${baseUrl}data/dso.json`).then((r) => r.json());
    const cat = new DsoCatalog();
    const f: string[] = json.fields;
    const ix = (n: string) => f.indexOf(n);
    let i = 0;
    for (const r of json.rows as any[]) {
      const ra = r[ix('ra')], dec = r[ix('dec')], d = r[ix('distLy')];
      const cd = Math.cos(dec * DEG);
      const maj = r[ix('majArcmin')] ?? 0, min = r[ix('minArcmin')] ?? maj;
      const type = r[ix('type')] as DsoType;
      const sizeArc = maj > 0 ? maj : type === 'G' ? 0.6 : 3;
      const sizeLy = d * sizeArc * (Math.PI / 180 / 60);
      const o: Dso = {
        index: i++, id: r[ix('id')], messier: r[ix('messier')], common: r[ix('common')], type, ra, dec, distLy: d,
        majArcmin: maj, minArcmin: min, posAngle: r[ix('posAngle')] ?? 0, mag: r[ix('mag')] ?? 99, hubble: r[ix('hubble')], estimated: !!r[ix('estimated')],
        x: d * cd * Math.cos(ra * DEG), y: d * cd * Math.sin(ra * DEG), z: d * Math.sin(dec * DEG),
        sizeLy: Math.max(sizeLy, 1), label: DSO_LABEL[type] ?? type,
      };
      cat.objects.push(o);
      const nm = [o.id, o.messier, o.common].filter(Boolean).join(' ');
      cat.nameIndex.push({ lower: nm.toLowerCase().replace(/\s+/g, ' '), obj: o });
    }
    return cat;
  }

  displayName(o: Dso): string {
    if (o.common) return o.common;
    if (o.messier) return `${o.messier} (${o.id})`;
    return o.id;
  }

  search(q: string, limit = 8): Dso[] {
    const s = q.trim().toLowerCase().replace(/\s+/g, ' ');
    if (s.length < 2) return [];
    const out: Dso[] = [];
    for (const e of this.nameIndex) if (e.lower.includes(s)) { out.push(e.obj); if (out.length > 60) break; }
    out.sort((a, b) => (b.messier ? 1 : 0) - (a.messier ? 1 : 0) || (b.common ? 1 : 0) - (a.common ? 1 : 0) || a.mag - b.mag);
    return out.slice(0, limit);
  }
}

export { LY };
