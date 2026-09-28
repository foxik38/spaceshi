import * as THREE from 'three';
import { LY, PC } from '../core/constants';
import type { Body } from '../sim/body';
import type { Universe } from '../sim/universe';
import type { StarCatalog } from '../data/starCatalog';
import type { DsoCatalog } from '../data/dsoCatalog';
import type { FrameContext } from '../render/context';
import { bodySelectable, dsoSelectable, starSelectable, type Selectable } from '../app/selectable';

export interface Candidate {
  id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  /** on-screen radius of the resolved disc in px (0 for point-like) */
  r: number;
  score: number;
  dist: number;
  make: () => Selectable;
}

const KIND_WEIGHT: Record<string, number> = {
  star: 10, black_hole: 11, neutron_star: 9, white_dwarf: 8, brown_dwarf: 6, planet: 9, gas_giant: 9.5, ice_giant: 9, dwarf_planet: 6.5, moon: 5, asteroid: 3.5,
  comet: 4.5, satellite: 4, probe: 5, galaxy: 8, nebula: 6.5, star_cluster: 6.5, quasar: 7,
};

const _v = new THREE.Vector3();

/** Projects bodies, catalogue stars and deep-sky objects to the screen; decides which get text labels. */
export class Labeler {
  container: HTMLElement;
  private pool: HTMLDivElement[] = [];
  private placed: { c: Candidate; el: HTMLDivElement }[] = [];
  /** All projected candidates (labelled or not) for hover/click picking. */
  candidates: Candidate[] = [];
  enabled = true;
  showStars = true;
  showBodies = true;
  showDeepSky = true;
  selectedId = '';
  hoveredId = '';
  private starMagLimit = 3.2;

  constructor(parent: HTMLElement, private universe: Universe, private stars?: StarCatalog, private dso?: DsoCatalog, private timeYears: () => number = () => 0) {
    this.container = document.createElement('div');
    this.container.id = 'labels';
    parent.appendChild(this.container);
  }

  setCatalogs(stars?: StarCatalog, dso?: DsoCatalog) { this.stars = stars; this.dso = dso; }

  private project(ctx: FrameContext, world: THREE.Vector3, out: { x: number; y: number; d: number }): boolean {
    _v.copy(world).sub(ctx.camPos).applyQuaternion(ctx.camQuatInv);
    if (_v.z >= -1e-9) return false;
    const ix = _v.x / -_v.z / ctx.tanHalfX, iy = _v.y / -_v.z / ctx.tanHalfY;
    if (Math.abs(ix) > 1.15 || Math.abs(iy) > 1.15) return false;
    out.x = (0.5 + 0.5 * ix) * ctx.width;
    out.y = (0.5 - 0.5 * iy) * ctx.height;
    out.d = _v.length();
    return true;
  }

  update(ctx: FrameContext, resolvedBodyIds: Set<string>, zoom: number) {
    this.candidates.length = 0;
    const scr = { x: 0, y: 0, d: 0 };
    const pixelAngle = ctx.pixelAngle;

    if (this.showBodies) {
      for (const b of this.universe.bodies) {
        if (b.hidden) continue;
        if (!this.project(ctx, b.pos, scr)) continue;
        const rpx = b.radius / scr.d / pixelAngle;
        // hide clutter: children too close (in pixels) to their parent, small bodies far from the camera
        if (b.parent) {
          const sep = _v.copy(b.pos).sub(b.parent.pos).length() / scr.d / pixelAngle;
          if (sep < 26 && rpx < 8) continue;
          if ((b.kind === 'asteroid' || b.kind === 'satellite' || b.kind === 'probe' || b.kind === 'comet') && rpx < 3) {
            const range = b.kind === 'comet' ? 60 * 1.5e11 : b.kind === 'asteroid' ? 4 * 1.5e11 : b.kind === 'probe' ? 1e13 : 4e8;
            if (scr.d > range && !(b.parent && sep > 60)) continue;
          }
        }
        const w = KIND_WEIGHT[b.kind] ?? 4;
        this.candidates.push({
          id: b.id, name: b.name, kind: b.kind, x: scr.x, y: scr.y, r: rpx > 3 ? rpx : 0, dist: scr.d,
          score: w + Math.log10(1 + rpx) * 2.2 + (resolvedBodyIds.has(b.id) ? 1 : 0), make: () => bodySelectable(b),
        });
      }
    }

    const cam = ctx.camPos;
    if (this.showStars && this.stars) {
      const cat = this.stars;
      const years = this.timeYears();
      const camLy = _v.copy(cam).multiplyScalar(1 / LY);
      const limit = this.starMagLimit + Math.log2(Math.max(zoom, 1)) * 1.1;
      const p: [number, number, number] = [0, 0, 0];
      const tmp = new THREE.Vector3();
      for (const m of cat.meta) {
        if (!m.name) continue;
        cat.positionLy(m.index, p, years);
        tmp.set(p[0] * LY, p[1] * LY, p[2] * LY);
        const dLy = Math.hypot(p[0] - camLy.x, p[1] - camLy.y, p[2] - camLy.z);
        if (dLy < 1e-6) continue;
        const appMag = cat.absMag[m.index] + 5 * Math.log10(dLy / 3.26156 / 10);
        const proper = !/^(HD|HIP|Gl|GJ|NN|LHS|LP|G |Wolf)/i.test(m.name) && !/^\d/.test(m.name);
        if (appMag > limit && !(dLy < 25 && appMag < 10.5 && proper) && !(dLy < 6)) continue;
        if (!this.project(ctx, tmp, scr)) continue;
        this.candidates.push({
          id: `star:${m.index}`, name: m.name, kind: 'star', x: scr.x, y: scr.y, r: 0, dist: scr.d,
          score: 5.5 - appMag * 0.6 + (proper ? 1.5 : 0), make: () => starSelectable(cat, m.index, () => this.timeYears()),
        });
      }
    }

    if (this.showDeepSky && this.dso) {
      const cat = this.dso;
      const tmp = new THREE.Vector3();
      for (const o of cat.objects) {
        if (!o.common && !o.messier) continue;
        tmp.set(o.x * LY, o.y * LY, o.z * LY);
        if (!this.project(ctx, tmp, scr)) continue;
        const angPx = (o.sizeLy * LY) / scr.d / pixelAngle;
        if (scr.d < o.sizeLy * LY * 0.35) continue; // inside it
        if (!(angPx >= 16 || (o.mag < 6.5 && angPx >= 3) || (o.common && angPx >= 10))) continue;
        this.candidates.push({
          id: `dso:${o.index}`, name: cat.displayName(o), kind: o.type === 'G' ? 'galaxy' : o.type.includes('Cl') ? 'star_cluster' : 'nebula', x: scr.x, y: scr.y,
          r: angPx > 6 ? angPx * 0.5 : 0, dist: scr.d, score: 4.5 + Math.log10(1 + angPx) * 2 - Math.min(o.mag, 14) * 0.15 + (o.common ? 1 : 0),
          make: () => dsoSelectable(cat, o),
        });
      }
    }

    this.layout(ctx);
  }

  private layout(ctx: FrameContext) {
    const list = this.candidates.slice().sort((a, b) => b.score - a.score);
    const boxes: { x0: number; y0: number; x1: number; y1: number }[] = [];
    const chosen: Candidate[] = [];
    const max = 60;
    if (this.enabled) {
      for (const c of list) {
        if (chosen.length >= max) break;
        const w = c.name.length * 6.6 + 20;
        const x0 = c.x + 10 + Math.max(0, c.r * 0.7), y0 = c.y - 9, x1 = x0 + w, y1 = y0 + 18;
        if (x1 < 0 || x0 > ctx.width || y1 < 0 || y0 > ctx.height) continue;
        const force = c.id === this.selectedId || c.id === this.hoveredId;
        if (!force) {
          let hit = false;
          for (const b of boxes) if (x0 < b.x1 && x1 > b.x0 && y0 < b.y1 && y1 > b.y0) { hit = true; break; }
          if (hit) continue;
        }
        boxes.push({ x0, y0, x1, y1 });
        chosen.push(c);
      }
    } else {
      for (const c of list) if (c.id === this.selectedId || c.id === this.hoveredId) chosen.push(c);
    }
    while (this.pool.length < chosen.length) {
      const el = document.createElement('div');
      el.className = 'lbl';
      el.innerHTML = '<span class="mk"></span><span class="tx"></span>';
      this.container.appendChild(el);
      this.pool.push(el);
    }
    for (let i = 0; i < this.pool.length; i++) {
      const el = this.pool[i];
      const c = chosen[i];
      if (!c) { el.style.display = 'none'; continue; }
      el.style.display = '';
      const mk = el.firstChild as HTMLElement, tx = el.lastChild as HTMLElement;
      if (tx.textContent !== c.name) tx.textContent = c.name;
      const cls = `lbl k-${c.kind}${c.id === this.selectedId ? ' sel' : ''}${c.id === this.hoveredId ? ' hov' : ''}`;
      if (el.className !== cls) el.className = cls;
      const size = Math.max(8, Math.min(2 * c.r + 10, 240));
      mk.style.width = mk.style.height = `${size}px`;
      mk.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
      tx.style.transform = `translate(${size / 2 + 4}px, -50%)`;
      el.style.transform = `translate(${c.x.toFixed(1)}px, ${c.y.toFixed(1)}px)`;
    }
  }

  /** Nearest candidate to the cursor (accounts for disc radius). */
  pick(x: number, y: number, maxPx = 16): Candidate | null {
    let best: Candidate | null = null;
    let bd = Infinity;
    for (const c of this.candidates) {
      const d = Math.hypot(c.x - x, c.y - y) - c.r;
      const eff = d - c.score * 0.35;
      if (d < maxPx && eff < bd) { bd = eff; best = c; }
    }
    return best;
  }

  /** Nearest catalogue star of any brightness (used on click when nothing else is close). */
  pickStar(ctx: FrameContext, x: number, y: number, maxPx = 12): Candidate | null {
    const cat = this.stars;
    if (!cat) return null;
    const camLy = _v.copy(ctx.camPos).multiplyScalar(1 / LY).clone();
    const years = this.timeYears();
    let best = -1, bd = Infinity;
    const p: [number, number, number] = [0, 0, 0];
    const w = new THREE.Vector3();
    const scr = { x: 0, y: 0, d: 0 };
    for (let i = 0; i < cat.count; i++) {
      cat.positionLy(i, p, years);
      const dLy = Math.hypot(p[0] - camLy.x, p[1] - camLy.y, p[2] - camLy.z);
      if (dLy < 1e-6) continue;
      const appMag = cat.absMag[i] + 5 * Math.log10(dLy / 3.26156 / 10);
      if (appMag > 8.5) continue;
      w.set(p[0] * LY, p[1] * LY, p[2] * LY);
      if (!this.project(ctx, w, scr)) continue;
      const d = Math.hypot(scr.x - x, scr.y - y);
      const eff = d + appMag * 1.2;
      if (d < maxPx && eff < bd) { bd = eff; best = i; }
    }
    if (best < 0) return null;
    const meta = cat.metaByIndex.get(best);
    return { id: `star:${best}`, name: meta?.name || meta?.gl || `HYG ${best}`, kind: 'star', x, y, r: 0, score: 1, dist: 0, make: () => starSelectable(cat, best, () => this.timeYears()) };
  }
}

export { PC };
export type { Body };
