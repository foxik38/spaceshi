import * as THREE from 'three';
import { AU, C } from '../core/constants';
import { clamp, lerp } from '../core/math';
import type { Body } from '../sim/body';
import type { Universe } from '../sim/universe';
import type { Input } from './input';
import type { NavTarget } from './target';

export type NavMode = 'free' | 'orbit' | 'travel';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _f = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _m = new THREE.Matrix4();
const IDENT = new THREE.Quaternion();
const Z = new THREE.Vector3(0, 0, 1);

const smoother = (s: number) => s * s * s * (s * (s * 6 - 15) + 10);
const smooth = (a: number, b: number, x: number) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

interface TravelState {
  target: NavTarget;
  t: number;
  T: number;
  d0: number;
  d1: number;
  dir0: THREE.Vector3;
  dirF: THREE.Vector3;
  qStart: THREE.Quaternion;
  onArrive?: () => void;
}

export interface Proximity {
  /** Distance from the camera to the nearest solid surface / star, in metres. */
  distance: number;
  body: Body | null;
  /** Altitude above `body` surface. */
  altitude: number;
}

/** First-person "viewer" camera: free flight with distance-scaled speed, target orbiting and cinematic travel. */
export class CameraRig {
  pos = new THREE.Vector3(0, -3e11, 6e10);
  quat = new THREE.Quaternion();
  vel = new THREE.Vector3();
  mode: NavMode = 'free';
  fovBase = 60;
  fov = 60;
  zoom = 1;
  speedFactor = 0.6;
  /** Current speed (m/s) for the HUD. */
  speed = 0;
  target: NavTarget | null = null;
  frameBody: Body | null = null;
  frameRotating = false;
  travelProgress = 0;
  proximity: Proximity = { distance: 1e11, body: null, altitude: 1e11 };
  lockToTarget = false;

  private offset = new THREE.Vector3();
  private qFrame = new THREE.Quaternion();
  private pendYaw = 0;
  private pendPitch = 0;
  private az = 0;
  private el = 0.3;
  private dist = 1e9;
  private azT = 0;
  private elT = 0.3;
  private distT = 1e9;
  private travel?: TravelState;
  private zoomKey = false;
  /** Callback to compute distance to catalogue objects (stars/galaxies) not stored as bodies. */
  extraNearest?: (pos: THREE.Vector3) => number;
  onArrive?: (t: NavTarget) => void;
  onModeChange?: (m: NavMode) => void;
  history: NavTarget[] = [];

  constructor(private universe: Universe) {
    this.lookAtPoint(new THREE.Vector3(0, 0, 0));
    this.offset.copy(this.pos);
    this.qFrame.copy(this.quat);
  }

  lookAtPoint(p: THREE.Vector3, up: THREE.Vector3 = Z) {
    _f.copy(p).sub(this.pos);
    if (_f.lengthSq() < 1e-6) return;
    _m.lookAt(new THREE.Vector3(0, 0, 0), _f.normalize(), up);
    this.quat.setFromRotationMatrix(_m);
    this.syncFrameState();
  }

  /** Re-express the world pose in the current co-moving frame (call after directly editing pos/quat). */
  private syncFrameState() {
    if (this.frameBody) {
      const fq = this.frameRotating ? this.frameBody.orientation : IDENT;
      _q.copy(fq).invert();
      this.offset.copy(this.pos).sub(this.frameBody.pos).applyQuaternion(_q);
      this.qFrame.copy(_q).multiply(this.quat);
    } else {
      this.offset.copy(this.pos);
      this.qFrame.copy(this.quat);
    }
  }

  setMode(m: NavMode) {
    if (this.mode === m) return;
    this.mode = m;
    this.onModeChange?.(m);
  }

  /** Enter FREE mode immediately at the present position. */
  breakToFree() {
    if (this.mode === 'free') return;
    this.travel = undefined;
    this.lockToTarget = false;
    this.setMode('free');
    this.vel.set(0, 0, 0);
  }

  /** Cinematic fly-to: exponential approach in log-distance with smooth ease and automatic aiming. */
  travelTo(target: NavTarget, opts: { instant?: boolean; standoff?: number } = {}) {
    const tp = target.getPos(new THREE.Vector3());
    const rel = _v.copy(this.pos).sub(tp);
    const d0 = Math.max(rel.length(), 1);
    const d1 = Math.max(target.radius * (opts.standoff ?? target.standoff ?? 3.4), 2);
    const dir0 = d0 > 1 ? rel.clone().normalize() : new THREE.Vector3(1, 0, 0.3).normalize();
    // finish on the sunlit side of the target
    const dirF = dir0.clone();
    const star = this.nearestStar(tp, target.body);
    if (star) {
      const ls = star.pos.clone().sub(tp).normalize();
      dirF.addScaledVector(ls, 0.55).normalize();
      if (dirF.lengthSq() < 0.5) dirF.copy(dir0);
    }
    const ratio = Math.max(d0 / d1, 1.0001);
    const T = clamp(2.0 + 0.95 * Math.log10(ratio), 1.6, 13);
    if (this.target && this.target.id !== target.id) { this.history.push(this.target); if (this.history.length > 30) this.history.shift(); }
    this.target = target;
    this.travel = { target, t: 0, T: opts.instant ? 0.001 : T, d0, d1, dir0, dirF, qStart: this.quat.clone() };
    this.lockToTarget = false;
    this.setMode('travel');
  }

  /** Orbit the given target at the current distance (no fly-in). */
  orbit(target: NavTarget) {
    const tp = target.getPos(new THREE.Vector3());
    this.target = target;
    this.travel = undefined;
    this.setMode('orbit');
    this.deriveOrbitFromPosition(tp, target);
  }

  private deriveOrbitFromPosition(tp: THREE.Vector3, target: NavTarget) {
    _v.copy(this.pos).sub(tp);
    this.dist = this.distT = Math.max(_v.length(), target.radius * 1.0001 + 1);
    const body = target.body;
    const spin = body?.spin;
    // express in frame axes
    const inv = _q.identity();
    if (body && this.frameBody === body && this.frameRotating) inv.copy(body.orientation).invert();
    _v.applyQuaternion(inv);
    const up = this.orbitUp(target, _w);
    void up;
    const vlen = _v.length() || 1;
    const upF = this.frameRotating && body ? Z : spin ? spin.pole : Z;
    const sinEl = clamp(_v.dot(upF) / vlen, -1, 1);
    this.el = this.elT = Math.asin(sinEl);
    // azimuth about the up axis
    _f.copy(upF).multiplyScalar(_v.dot(upF));
    _u.copy(_v).sub(_f);
    const ref = Math.abs(upF.z) > 0.9 ? _r.set(1, 0, 0) : _r.set(0, 0, 1).cross(upF).normalize();
    const ref2 = _f.crossVectors(upF, ref);
    this.az = this.azT = Math.atan2(_u.dot(ref2), _u.dot(ref));
  }

  private orbitUp(target: NavTarget, out: THREE.Vector3) {
    const body = target.body;
    if (body?.spin) return out.copy(body.spin.pole);
    return out.copy(Z);
  }

  private nearestStar(from: THREE.Vector3, exclude?: Body): Body | null {
    let best: Body | null = null, bd = Infinity;
    for (const b of this.universe.bodies) {
      if (!b.isLuminous || b === exclude) continue;
      const d = b.pos.distanceToSquared(from);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }

  private computeProximity() {
    let bestAlt = Infinity, bestBody: Body | null = null;
    for (const b of this.universe.bodies) {
      if (b.hidden) continue;
      const alt = b.pos.distanceTo(this.pos) - b.radius;
      if (alt < bestAlt) { bestAlt = alt; bestBody = b; }
    }
    let dist = bestAlt;
    if (this.extraNearest) dist = Math.min(dist, this.extraNearest(this.pos));
    this.proximity = { distance: Math.max(dist, 0.1), body: bestBody, altitude: bestAlt };
  }

  /** Pick the body whose sphere of influence contains `p`, for stable co-moving reference frames. */
  private chooseFrame(): Body | null {
    if (this.target?.body && (this.mode === 'orbit' || this.mode === 'travel')) return this.target.body;
    let cur: Body | null = null;
    let best = Infinity;
    for (const r of this.universe.roots) {
      const d = r.pos.distanceTo(this.pos);
      const soi = r.isStellar ? 3e4 * AU : 1e9;
      if (d < soi && d < best) { best = d; cur = r; }
    }
    while (cur) {
      let next: Body | null = null;
      let nd = Infinity;
      for (const c of cur.children) {
        const soi = this.soi(c);
        const d = c.pos.distanceTo(this.pos);
        if (d < soi * (this.frameBody === c ? 1.15 : 1) && d < nd) { nd = d; next = c; }
      }
      if (!next) break;
      cur = next;
    }
    return cur;
  }

  private soi(b: Body): number {
    if (!b.parent) return 1e20;
    const a = b.pos.distanceTo(b.parent.pos);
    return Math.max(a * Math.pow(b.mass / b.parent.mass, 0.4), b.radius * 3);
  }

  update(dt: number, input: Input, blocked: boolean) {
    dt = Math.min(dt, 0.1);
    // 1. rebuild world state from the co-moving frame
    if (this.frameBody) {
      const fq = this.frameRotating ? this.frameBody.orientation : IDENT;
      this.pos.copy(this.offset).applyQuaternion(fq).add(this.frameBody.pos);
      this.quat.copy(fq).multiply(this.qFrame);
    } else {
      this.pos.copy(this.offset);
      this.quat.copy(this.qFrame);
    }
    this.computeProximity();

    // 2. FOV zoom
    const zoomHeld = !blocked && input.has('z');
    if (zoomHeld) {
      const w = input.consumeWheel();
      this.zoom = clamp(this.zoom * Math.exp(-w * 0.0012), 1, 200);
      if (Math.abs(w) < 1 && this.zoom < 6) this.zoom = Math.max(this.zoom, 6);
    } else if (this.zoomKey) this.zoom = lerp(this.zoom, 1, 1 - Math.exp(-dt * 6));
    this.zoomKey = zoomHeld;
    const fovTarget = this.fovBase / this.zoom;
    this.fov += (fovTarget - this.fov) * (1 - Math.exp(-dt * 10));
    const fovScale = this.fov / 60;

    // 3. mode logic
    const [dx, dy] = input.consumeDrag();
    const anyMove = !blocked && ['w', 'a', 's', 'd', 'r', 'f', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((k) => input.has(k));
    if (this.mode === 'travel') this.updateTravel(dt, anyMove || input.has('Escape'));
    else if (this.mode === 'orbit') this.updateOrbit(dt, dx, dy, input, blocked, fovScale, anyMove);
    else this.updateFree(dt, dx, dy, input, blocked, fovScale);

    // 4. choose frame & store state relative to it
    this.computeProximity();
    const nf = this.chooseFrame();
    let rot = false;
    if (nf && nf.spin) {
      const alt = nf.pos.distanceTo(this.pos) - nf.radius;
      rot = alt < nf.radius * (this.frameRotating && nf === this.frameBody ? 2.6 : 1.8);
    }
    if (nf !== this.frameBody || rot !== this.frameRotating) {
      // orbit parameters are expressed in frame axes: rederive after a switch
      const wasOrbit = this.mode === 'orbit';
      this.frameBody = nf;
      this.frameRotating = rot;
      if (wasOrbit && this.target) this.deriveOrbitFromPosition(this.target.getPos(new THREE.Vector3()), this.target);
    }
    if (this.frameBody) {
      const fq = this.frameRotating ? this.frameBody.orientation : IDENT;
      _q.copy(fq).invert();
      this.offset.copy(this.pos).sub(this.frameBody.pos).applyQuaternion(_q);
      this.qFrame.copy(_q).multiply(this.quat);
    } else {
      this.offset.copy(this.pos);
      this.qFrame.copy(this.quat);
    }
  }

  // ------------------------------------------------------------------ free flight
  private updateFree(dt: number, dx: number, dy: number, input: Input, blocked: boolean, fovScale: number) {
    const sens = 0.0021 * fovScale;
    if (!blocked && input.dragging) { this.pendYaw -= dx * sens; this.pendPitch -= dy * sens; }
    const keyRot = 1.1 * fovScale;
    if (!blocked) {
      if (input.has('ArrowLeft')) this.pendYaw += keyRot * dt;
      if (input.has('ArrowRight')) this.pendYaw -= keyRot * dt;
      if (input.has('ArrowUp')) this.pendPitch += keyRot * dt;
      if (input.has('ArrowDown')) this.pendPitch -= keyRot * dt;
    }
    let roll = 0;
    if (!blocked) { if (input.has('q')) roll += 1; if (input.has('e')) roll -= 1; }
    const f = 1 - Math.exp(-dt / 0.055);
    const yaw = this.pendYaw * f, pitch = this.pendPitch * f;
    this.pendYaw -= yaw; this.pendPitch -= pitch;
    _q.setFromEuler(new THREE.Euler(pitch, yaw, roll * 0.9 * dt, 'YXZ'));
    this.quat.multiply(_q);

    // auto-level near large bodies
    const pb = this.proximity.body;
    if (pb && roll === 0 && pb.radius > 5e4) {
      const rel = _v.copy(this.pos).sub(pb.pos);
      const alt = rel.length() - pb.radius;
      const k = 1 - smooth(pb.radius * 0.5, pb.radius * 2.2, alt);
      if (k > 0.001) {
        rel.normalize();
        _f.set(0, 0, -1).applyQuaternion(this.quat);
        _u.set(0, 1, 0).applyQuaternion(this.quat);
        const want = _w.copy(rel).addScaledVector(_f, -rel.dot(_f));
        if (want.lengthSq() > 1e-4) {
          want.normalize();
          const ang = Math.atan2(_r.crossVectors(_u, want).dot(_f), _u.dot(want));
          _q.setFromAxisAngle(_f, ang * Math.min(1, dt * 2.5 * k));
          this.quat.premultiply(_q);
        }
      }
    }
    this.quat.normalize();

    // wheel adjusts the speed factor (log scale)
    const w = input.consumeWheel();
    if (w !== 0 && !blocked) this.speedFactor = clamp(this.speedFactor * Math.exp(-w * 0.0015), 1e-4, 200);

    // translation
    let fw = 0, st = 0, up = 0;
    if (!blocked) {
      fw = (input.has('w') ? 1 : 0) - (input.has('s') ? 1 : 0);
      st = (input.has('d') ? 1 : 0) - (input.has('a') ? 1 : 0);
      up = (input.has('r') ? 1 : 0) - (input.has('f') ? 1 : 0);
    }
    const boost = input.has('Shift') ? 8 : input.has('Control') ? 0.1 : 1;
    const prox = this.proximity;
    let speed = clamp(this.speedFactor * prox.distance, 1.5, C * 3e9) * boost;
    // dimmer speeds when flying very close to a surface
    _v.set(st, up, -fw);
    if (_v.lengthSq() > 0) _v.normalize().multiplyScalar(speed).applyQuaternion(this.quat);
    const a = 1 - Math.exp(-dt / (fw || st || up ? 0.28 : 0.55));
    this.vel.lerp(_v, a);
    this.pos.addScaledVector(this.vel, dt);
    this.speed = this.vel.length();
    this.collide();
  }

  private collide() {
    const b = this.proximity.body;
    if (!b || b.kind === 'black_hole') return;
    const rel = _v.copy(this.pos).sub(b.pos);
    const d = rel.length();
    const minAlt = Math.max(1.8, Math.min(b.radius * 1e-4, 40));
    if (d < b.radius + minAlt) {
      rel.multiplyScalar((b.radius + minAlt) / d);
      this.pos.copy(b.pos).add(rel);
      const n = rel.normalize();
      const vn = this.vel.dot(n);
      if (vn < 0) this.vel.addScaledVector(n, -vn);
    }
  }

  // ------------------------------------------------------------------ orbit
  private updateOrbit(dt: number, dx: number, dy: number, input: Input, blocked: boolean, fovScale: number, anyMove: boolean) {
    const t = this.target;
    if (!t) { this.setMode('free'); return; }
    if (anyMove) { this.breakToFree(); return; }
    const sens = 0.0055 * fovScale;
    if (!blocked && input.dragging) { this.azT -= dx * sens; this.elT = clamp(this.elT + dy * sens, -1.5, 1.5); }
    const w = input.consumeWheel();
    if (!blocked && w !== 0) this.distT *= Math.exp(w * 0.0013);
    const R = t.body ? t.body.radius : t.radius;
    const minD = R * 1.000005 + 2;
    // zooming past the surface hands over to free flight so the user can look around the horizon
    if (t.body && this.distT < R * 1.03 && w < 0 && t.body.radius > 2e4) {
      this.distT = R + Math.max(2, R * 1e-4);
      this.breakToFree();
      this.pendPitch += 0.5;
      return;
    }
    this.distT = clamp(this.distT, minD, 1e27);
    const k = 1 - Math.exp(-dt / 0.09);
    this.az += (this.azT - this.az) * k;
    this.el += (this.elT - this.el) * k;
    this.dist = Math.exp(lerp(Math.log(this.dist), Math.log(this.distT), 1 - Math.exp(-dt / 0.12)));
    this.placeFromOrbit(t);
    this.speed = 0;
  }

  private placeFromOrbit(t: NavTarget) {
    const tp = t.getPos(_v);
    const body = t.body;
    const rotating = !!body && this.frameBody === body && this.frameRotating;
    const upF = rotating ? Z : body?.spin ? body.spin.pole : Z;
    // build basis about upF
    const ref = Math.abs(upF.z) > 0.9 ? _r.set(1, 0, 0) : _r.set(0, 0, 1).cross(upF).normalize();
    const ref2 = _f.crossVectors(upF, ref);
    const ce = Math.cos(this.el), se = Math.sin(this.el);
    _u.copy(ref).multiplyScalar(Math.cos(this.az) * ce).addScaledVector(ref2, Math.sin(this.az) * ce).addScaledVector(upF, se);
    _u.multiplyScalar(this.dist);
    if (rotating) _u.applyQuaternion(body!.orientation);
    this.pos.copy(tp).add(_u);
    // look at target
    const worldUp = rotating ? _w.copy(Z).applyQuaternion(body!.orientation) : _w.copy(upF);
    _f.copy(tp).sub(this.pos).normalize();
    if (Math.abs(_f.dot(worldUp)) > 0.9995) worldUp.set(1, 0, 0);
    _m.lookAt(_r.set(0, 0, 0), _f, worldUp);
    this.quat.setFromRotationMatrix(_m);
  }

  // ------------------------------------------------------------------ travel
  private updateTravel(dt: number, cancel: boolean) {
    const tr = this.travel;
    if (!tr) { this.setMode('free'); return; }
    if (cancel) { this.breakToFree(); return; }
    tr.t += dt;
    const s = clamp(tr.t / tr.T, 0, 1);
    this.travelProgress = s;
    const e = smoother(s);
    const d = Math.exp(lerp(Math.log(tr.d0), Math.log(tr.d1), e));
    const tp = tr.target.getPos(_w);
    const dirBlend = smooth(0.35, 1, s);
    _u.copy(tr.dir0);
    if (dirBlend > 0) {
      // spherical interpolation between start and final approach directions
      const ang = Math.acos(clamp(tr.dir0.dot(tr.dirF), -1, 1));
      if (ang > 1e-4) {
        const sa = Math.sin(ang);
        _u.copy(tr.dir0).multiplyScalar(Math.sin((1 - dirBlend) * ang) / sa).addScaledVector(tr.dirF, Math.sin(dirBlend * ang) / sa);
      }
    }
    const prev = _r.copy(this.pos);
    this.pos.copy(tp).addScaledVector(_u.normalize(), d);
    this.speed = this.pos.distanceTo(prev) / Math.max(dt, 1e-4);
    // aim at the target
    const up = tr.target.body?.spin ? tr.target.body.spin.pole : Z;
    _f.copy(tp).sub(this.pos).normalize();
    const worldUp = _v.copy(up);
    if (Math.abs(_f.dot(worldUp)) > 0.9995) worldUp.set(1, 0, 0);
    _m.lookAt(_r.set(0, 0, 0), _f, worldUp);
    _q2.setFromRotationMatrix(_m);
    this.quat.copy(tr.qStart).slerp(_q2, smooth(0, 0.3, s));
    if (s >= 1) {
      this.travel = undefined;
      const t = tr.target;
      this.orbit(t);
      this.onArrive?.(t);
    }
  }

  /** Snap to a position/orientation, e.g. after loading. */
  teleport(pos: THREE.Vector3, quat?: THREE.Quaternion) {
    this.pos.copy(pos);
    if (quat) this.quat.copy(quat);
    this.vel.set(0, 0, 0);
    this.frameBody = null;
    this.frameRotating = false;
    this.syncFrameState();
    this.breakToFree();
  }
}
