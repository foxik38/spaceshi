import { AU } from '../core/constants';
import type { Body } from '../sim/body';
import type { Universe } from '../sim/universe';
import { equilibriumTemperature } from '../sim/stellar';
import { createAsteroids, createComets } from './smallBodies';
import { createDwarfPlanets, createPlanets, createPluto, createSun } from './planets';
import { createMoons } from './moons';
import { createSpacecraft } from './spacecraft';
import { addNotableObjects } from './notable';

/** Populate the universe with the Sun and everything that orbits it. */
export function buildSolarSystem(u: Universe): Body {
  const sun = createSun();
  u.add(sun);
  const planets = createPlanets(sun);
  const pluto = createPluto(sun);
  const dwarfs = createDwarfPlanets(sun);
  const asteroids = createAsteroids(sun);
  const comets = createComets(sun);
  const byId = new Map<string, Body>();
  [sun, ...planets, pluto, ...dwarfs, ...asteroids].forEach((b) => byId.set(b.id, b));
  const moons = createMoons(byId);
  [...planets, pluto, ...dwarfs, ...asteroids, ...moons, ...comets].forEach((b) => u.add(b));
  const craft = createSpacecraft(new Map([...byId, ...moons.map((m) => [m.id, m] as [string, Body])]));
  craft.forEach((b) => u.add(b));
  addNotableObjects(u);

  u.update(u.clock.t);
  // fill in equilibrium temperatures where none were provided
  for (const b of u.bodies) {
    if (b.temperature > 0 || b === sun) continue;
    let root: Body = b;
    while (root.parent) root = root.parent;
    const d = Math.max(b.pos.distanceTo(root.pos), 0.02 * AU);
    b.temperature = equilibriumTemperature(root.luminosity || sun.luminosity, d, Math.min(b.albedo, 0.9));
  }
  return sun;
}
