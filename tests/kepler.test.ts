import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { AU, G, M_SUN, DEG } from '../src/core/constants';
import { elementsFromState, orbitalPeriod, stateInPlane, type Elements } from '../src/sim/kepler';
import { blackbodyRGB } from '../src/core/math';

const mu = G * M_SUN;

describe('kepler', () => {
  it('period of a 1 AU orbit is ~1 year', () => {
    const el: Elements = { a: AU, e: 0.0167, i: 0, Om: 0, w: 0, M0: 0, t0: 0, plane: 'icrs' };
    expect(orbitalPeriod(el, mu) / 86400).toBeCloseTo(365.25, 0);
  });

  it('conserves energy and round-trips through state vectors (elliptic)', () => {
    const el: Elements = { a: 2.7 * AU, e: 0.31, i: 12 * DEG, Om: 80 * DEG, w: 130 * DEG, M0: 1.1, t0: 0, plane: 'icrs' };
    const r = new THREE.Vector3(), v = new THREE.Vector3();
    stateInPlane(el, mu, 1e7, r, v);
    const energy = v.lengthSq() / 2 - mu / r.length();
    expect(energy).toBeCloseTo(-mu / (2 * el.a), -3);
    const back = elementsFromState(r, v, mu, 1e7, 'icrs');
    expect(back.a / el.a).toBeCloseTo(1, 9);
    expect(back.e).toBeCloseTo(el.e, 9);
    expect(back.i).toBeCloseTo(el.i, 9);
    expect(back.Om).toBeCloseTo(el.Om, 9);
    expect(back.w).toBeCloseTo(el.w, 9);
    const r2 = new THREE.Vector3(), v2 = new THREE.Vector3();
    stateInPlane(back, mu, 1e7 + 5e6, r2, v2);
    const r3 = new THREE.Vector3(), v3 = new THREE.Vector3();
    stateInPlane(el, mu, 1e7 + 5e6, r3, v3);
    expect(r2.distanceTo(r3) / AU).toBeLessThan(1e-9);
  });

  it('handles hyperbolic escape trajectories', () => {
    const el: Elements = { a: -30 * AU, e: 1.6, i: 0.3, Om: 1, w: 2, M0: -0.5, t0: 0, plane: 'icrs' };
    const r = new THREE.Vector3(), v = new THREE.Vector3();
    stateInPlane(el, mu, 1e8, r, v);
    const energy = v.lengthSq() / 2 - mu / r.length();
    expect(energy).toBeCloseTo(-mu / (2 * el.a), -2);
    const back = elementsFromState(r, v, mu, 1e8, 'icrs');
    expect(back.e).toBeCloseTo(1.6, 8);
    const r2 = new THREE.Vector3(), v2 = new THREE.Vector3();
    stateInPlane(back, mu, 1e8 + 3e7, r2, v2);
    const r3 = new THREE.Vector3(), v3 = new THREE.Vector3();
    stateInPlane(el, mu, 1e8 + 3e7, r3, v3);
    expect(r2.distanceTo(r3) / AU).toBeLessThan(1e-7);
  });
});

describe('blackbody', () => {
  it('is warm at low T, white near 6500K and blue at high T', () => {
    const [r1, , b1] = blackbodyRGB(3000);
    expect(r1).toBeGreaterThan(b1);
    const [r2, g2, b2] = blackbodyRGB(6500);
    expect(Math.abs(r2 - b2)).toBeLessThan(0.15);
    expect(g2).toBeGreaterThan(0.9);
    const [r3, , b3] = blackbodyRGB(20000);
    expect(b3).toBeGreaterThan(r3);
  });
});
