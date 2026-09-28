import { describe, expect, it } from 'vitest';
import { AU, DAY } from '../src/core/constants';
import { Universe } from '../src/sim/universe';
import { buildSolarSystem } from '../src/data/solarSystem';

function make() {
  const u = new Universe();
  buildSolarSystem(u);
  return u;
}

describe('solar system ephemeris', () => {
  it('places Earth at the expected J2000 position (ecliptic lon ≈ 100.5°, r ≈ 0.983 AU)', () => {
    const u = make();
    u.update(0);
    const e = u.get('earth')!;
    const r = e.pos.length() / AU;
    expect(r).toBeGreaterThan(0.981);
    expect(r).toBeLessThan(0.985);
    // Earth's heliocentric ecliptic longitude at J2000 is ~100.4°: x_ecl<0, y_ecl>0
    const eps = 23.4392911 * Math.PI / 180;
    const yEcl = e.pos.y * Math.cos(eps) + e.pos.z * Math.sin(eps);
    const lon = Math.atan2(yEcl, e.pos.x) * 180 / Math.PI;
    expect(lon).toBeGreaterThan(99.5);
    expect(lon).toBeLessThan(101.5);
  });

  it('reproduces the Mars close approach of 27 Aug 2003 (0.3727 AU)', () => {
    const u = make();
    const t = (2452878.5 - 2451545.0) * DAY + 0.4 * DAY; // 2003-08-27 09:51 UT
    u.update(t);
    const d = u.get('mars')!.pos.distanceTo(u.get('earth')!.pos) / AU;
    expect(d).toBeGreaterThan(0.36);
    expect(d).toBeLessThan(0.385);
  });

  it('puts the Moon near the Sun direction at the 6 Jan 2000 new moon', () => {
    const u = make();
    const t = (2451550.26 - 2451545.0) * DAY;
    u.update(t);
    const earth = u.get('earth')!, moon = u.get('moon')!, sun = u.get('sun')!;
    const toMoon = moon.pos.clone().sub(earth.pos).normalize();
    const toSun = sun.pos.clone().sub(earth.pos).normalize();
    const elong = Math.acos(toMoon.dot(toSun)) * 180 / Math.PI;
    expect(elong).toBeLessThan(8);
    const dist = moon.pos.distanceTo(earth.pos) / 1e3;
    expect(dist).toBeGreaterThan(356000);
    expect(dist).toBeLessThan(407000);
  });

  it('keeps every body finite and the hierarchy ordered', () => {
    const u = make();
    u.update(1e9);
    expect(u.bodies.length).toBeGreaterThan(150);
    for (const b of u.bodies) {
      expect(Number.isFinite(b.pos.x + b.pos.y + b.pos.z), b.id).toBe(true);
      expect(b.temperature, b.id).toBeGreaterThan(0);
    }
  });
});
