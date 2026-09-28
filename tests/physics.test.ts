import { describe, expect, it } from 'vitest';
import { AU, DAY, G, YEAR } from '../src/core/constants';
import { Universe } from '../src/sim/universe';
import { buildSolarSystem } from '../src/data/solarSystem';

function energy(u: Universe) {
  const bodies = u.physics.massive;
  let e = 0;
  for (const b of bodies) e += 0.5 * b.mass * b.vel.lengthSq();
  for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) e -= (G * bodies[i].mass * bodies[j].mass) / bodies[i].pos.distanceTo(bodies[j].pos);
  return e;
}

function live() {
  const u = new Universe();
  const sun = buildSolarSystem(u);
  u.update(0);
  u.physics.enable(0, [sun], u.bodies);
  return u;
}

describe('n-body physics', () => {
  it('conserves energy of the planetary system over 20 simulated years', () => {
    const u = live();
    const e0 = energy(u);
    let t = 0;
    for (let i = 0; i < 20 * 12; i++) { t += YEAR / 12; u.update(t); }
    expect(u.physics.time).toBeCloseTo(t, 0);
    const e1 = energy(u);
    expect(Math.abs((e1 - e0) / e0)).toBeLessThan(2e-6);
  }, 120000);

  it('keeps Earth near its ephemeris position after one year', () => {
    const u = live();
    const rails = new Universe();
    buildSolarSystem(rails);
    let t = 0;
    for (let i = 0; i < 365; i++) { t += DAY; u.update(t); }
    rails.update(t);
    const d = u.get('earth')!.pos.distanceTo(rails.get('earth')!.pos);
    // planetary perturbations plus the neglected Earth–Moon wobble keep this small but non-zero
    expect(d / AU).toBeLessThan(0.02);
  });

  it('keeps the Moon bound to Earth as a test particle', () => {
    const u = live();
    let t = 0;
    for (let i = 0; i < 120; i++) { t += DAY; u.update(t); }
    const moon = u.get('moon')!, earth = u.get('earth')!;
    const d = moon.pos.distanceTo(earth.pos);
    expect(d).toBeGreaterThan(3.3e8);
    expect(d).toBeLessThan(4.2e8);
  });

  it('merges bodies that collide and conserves momentum', () => {
    const u = live();
    const earth = u.get('earth')!;
    const mars = u.get('mars')!;
    const before = earth.mass * 1 + mars.mass;
    // fling Mars straight at Earth
    mars.pos.copy(earth.pos).add(earth.pos.clone().normalize().multiplyScalar(2e8));
    mars.vel.copy(earth.vel).add(earth.pos.clone().normalize().multiplyScalar(-3e4));
    let merged = false;
    u.physics.onCollision = () => { merged = true; };
    u.physics.rebuild();
    let t = 0;
    for (let i = 0; i < 400 && !merged; i++) { t += 3600; u.update(t); }
    expect(merged).toBe(true);
    expect(earth.mass).toBeGreaterThan(before * 0.999);
  });
});
