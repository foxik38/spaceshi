import * as THREE from 'three';

/** Everything the per-object renderers need to know about the current frame. */
export interface FrameContext {
  /** Camera position in the universe frame (metres, double precision). */
  camPos: THREE.Vector3;
  /** Camera orientation (view -> world). */
  camQuat: THREE.Quaternion;
  camQuatInv: THREE.Quaternion;
  width: number;
  height: number;
  fov: number;            // vertical FOV in radians
  tanHalfY: number;
  tanHalfX: number;
  aspect: number;
  time: number;           // simulation time (s since J2000)
  realTime: number;       // wall-clock seconds
  exposure: number;       // multiplier applied to body shader output
  /** Procedural surface detail 0..1 (extra noise octaves and crater generations). */
  detail: number;
  proj: THREE.Matrix4;
  /** Angular size of one pixel in radians. */
  pixelAngle: number;
}

const _v = new THREE.Vector3();

/** Vector from the camera to a world position, expressed in view space. */
export function toView(ctx: FrameContext, world: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  return out.copy(world).sub(ctx.camPos).applyQuaternion(ctx.camQuatInv);
}

/** Angular radius (radians) of a sphere of radius r at distance d. */
export function angularRadius(r: number, d: number): number {
  return d <= r ? Math.PI / 2 : Math.asin(r / d);
}

export function isInFrustum(ctx: FrameContext, viewPos: THREE.Vector3, angRadius: number): boolean {
  // view space: camera looks down -Z
  const d = viewPos.length();
  if (d === 0) return true;
  const ax = Math.atan2(Math.abs(viewPos.x), -viewPos.z);
  const ay = Math.atan2(Math.abs(viewPos.y), -viewPos.z);
  if (viewPos.z >= 0 && angRadius < Math.PI / 2) {
    // behind camera
    const cosAngle = -viewPos.z / d;
    return Math.acos(Math.max(-1, Math.min(1, cosAngle))) < Math.atan(Math.hypot(ctx.tanHalfX, ctx.tanHalfY)) + angRadius;
  }
  return ax < Math.atan(ctx.tanHalfX) + angRadius + 0.05 && ay < Math.atan(ctx.tanHalfY) + angRadius + 0.05;
}

export { _v };
