import * as THREE from 'three';
import { G } from '../core/constants';
import { Body } from './body';
import { ECLIPTIC_TO_ICRS, stateInPlane } from './kepler';
import { SimClock } from './clock';

const _rel = new THREE.Vector3(), _relV = new THREE.Vector3();
const _n = new THREE.Vector3(), _y = new THREE.Vector3(), _m = new THREE.Matrix4();
const _planeQ = new THREE.Quaternion();

/** Quaternion mapping a body's equatorial frame (x = ascending node on ICRS equator, z = pole) into ICRS axes. */
export function equatorPlaneQuat(pole: THREE.Vector3, out: THREE.Quaternion = _planeQ): THREE.Quaternion {
  _n.set(-pole.y, pole.x, 0);
  if (_n.lengthSq() < 1e-12) _n.set(1, 0, 0);
  _n.normalize();
  _y.crossVectors(pole, _n);
  _m.makeBasis(_n, _y, pole);
  return out.setFromRotationMatrix(_m);
}

/** Registry and rails-propagator for all simulated bodies. */
export class Universe {
  clock = new SimClock();
  bodies: Body[] = [];
  byId = new Map<string, Body>();
  /** Bodies with no parent (stars). */
  roots: Body[] = [];
  private order: Body[] = [];
  private orderDirty = true;
  /** Incremented whenever the set of bodies changes so that caches (labels, orbits…) can refresh. */
  version = 0;

  add(b: Body): Body {
    if (this.byId.has(b.id)) throw new Error(`duplicate body id ${b.id}`);
    this.bodies.push(b);
    this.byId.set(b.id, b);
    if (!b.parent) this.roots.push(b);
    this.orderDirty = true;
    this.version++;
    return b;
  }

  remove(b: Body) {
    for (const c of [...b.children]) this.remove(c);
    b.setParent(null);
    this.bodies = this.bodies.filter((x) => x !== b);
    this.roots = this.roots.filter((x) => x !== b);
    this.byId.delete(b.id);
    this.orderDirty = true;
    this.version++;
  }

  get(id: string): Body | undefined { return this.byId.get(id); }

  private rebuildOrder() {
    const seen = new Set<Body>();
    const out: Body[] = [];
    const visit = (b: Body) => {
      if (seen.has(b)) return;
      if (b.parent) visit(b.parent);
      seen.add(b);
      out.push(b);
    };
    this.bodies.forEach(visit);
    this.order = out;
    this.orderDirty = false;
  }

  /** Advance all bodies that follow analytic rails to simulation time t. */
  update(t: number) {
    if (this.orderDirty) this.rebuildOrder();
    for (const b of this.order) {
      if (b.dynamic) continue;
      if (b.customRails) { b.customRails(b, t); continue; }
      const p = b.parent;
      if (!p) continue; // catalog stars / roots are positioned by their owners
      const el = b.elementsAt ? b.elementsAt(t) : b.elements;
      if (!el) continue;
      stateInPlane(el, G * (p.mass + b.mass), t, _rel, _relV);
      if (el.plane === 'ecliptic') { _rel.applyQuaternion(ECLIPTIC_TO_ICRS); _relV.applyQuaternion(ECLIPTIC_TO_ICRS); }
      else if (el.plane === 'parent' && p.spin) { const q = equatorPlaneQuat(p.spin.pole); _rel.applyQuaternion(q); _relV.applyQuaternion(q); }
      b.pos.copy(p.pos).add(_rel);
      b.vel.copy(p.vel).add(_relV);
    }
    for (const b of this.order) b.updateOrientation(t);
  }

  /** Bodies in parent-first order. */
  ordered(): Body[] {
    if (this.orderDirty) this.rebuildOrder();
    return this.order;
  }
}
