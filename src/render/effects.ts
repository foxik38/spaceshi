import * as THREE from 'three';
import type { Body } from '../sim/body';
import type { FrameContext } from './context';
import type { PointLayer } from './pointLayer';

interface Burst {
  host: Body;
  offset: THREE.Vector3;
  t0: number;
  radius: number;
  strength: number;
  dirs: THREE.Vector3[];
  speeds: number[];
  color: [number, number, number];
}

/** Impact flashes and debris clouds, drawn as dots attached to the body that survived the collision. */
export class Effects {
  bursts: Burst[] = [];

  burst(host: Body, at: THREE.Vector3, radius: number, energy: number, color: [number, number, number] = [1, 0.7, 0.4]) {
    const dirs: THREE.Vector3[] = [], speeds: number[] = [];
    for (let i = 0; i < 160; i++) {
      const d = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      dirs.push(d);
      speeds.push(0.4 + Math.random() * 0.6);
    }
    // impact energy (J) sets how violent the effect looks: 1e28 J ≈ a planetary collision
    const strength = Math.max(0.25, Math.min(1.6, Math.log10(Math.max(energy, 1)) / 28));
    this.bursts.push({ host, offset: at.clone().sub(host.pos), t0: performance.now() / 1000, radius, strength, dirs, speeds, color });
    if (this.bursts.length > 12) this.bursts.shift();
  }

  provide(ctx: FrameContext, layer: PointLayer) {
    const now = performance.now() / 1000;
    const world = new THREE.Vector3(), dir = new THREE.Vector3();
    this.bursts = this.bursts.filter((b) => now - b.t0 < 11);
    for (const b of this.bursts) {
      const age = now - b.t0;
      const center = b.host.pos.clone().add(b.offset);
      // flash
      if (age < 1.6) {
        dir.copy(center).sub(ctx.camPos);
        const d = dir.length();
        dir.multiplyScalar(1 / d);
        const f = Math.exp(-age * 2.2);
        layer.push(dir, 1, 0.82, 0.55, 24 * f * b.strength, 10 + 110 * f * b.strength);
      }
      // expanding debris
      const spread = b.radius * (1 + 7 * (1 - Math.exp(-age / 2.6)));
      const fade = Math.max(0, 1 - age / 10.5);
      for (let i = 0; i < b.dirs.length; i++) {
        world.copy(center).addScaledVector(b.dirs[i], spread * b.speeds[i]);
        dir.copy(world).sub(ctx.camPos);
        const d = dir.length();
        if (d < 1) continue;
        dir.multiplyScalar(1 / d);
        const heat = Math.max(0, 1 - age / 4);
        layer.push(dir, 1, 0.45 + 0.4 * heat, 0.25 + 0.3 * heat, (0.9 + 2.2 * heat) * fade * b.strength, 1.6 + 1.2 * heat);
      }
    }
  }
}
