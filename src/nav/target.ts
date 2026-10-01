import * as THREE from 'three';
import type { Body } from '../sim/body';

/** Something the camera can fly to, orbit or select: a simulated body, catalogue star, galaxy, nebula… */
export interface NavTarget {
  id: string;
  name: string;
  kind: string;
  /** Characteristic radius in metres used to choose the arrival distance. */
  radius: number;
  getPos(out: THREE.Vector3): THREE.Vector3;
  body?: Body;
  /** Arrival distance = radius × standoff (default 3.4). */
  standoff?: number;
}

export function bodyTarget(b: Body): NavTarget {
  let radius = b.radius;
  const ring = b.look.rings?.[0];
  if (ring && ring.opacity > 0.3) radius = Math.max(radius, ring.outer * 0.55);
  else if (b.atmosphere) radius = Math.max(radius, b.radius * 1.02);
  return {
    id: b.id, name: b.name, kind: b.kind, radius, body: b,
    getPos: (out) => out.copy(b.pos),
    standoff: b.kind === 'black_hole' ? 12 : 3.4,
  };
}
