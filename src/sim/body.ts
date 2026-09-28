import * as THREE from 'three';
import { G, DEG } from '../core/constants';
import type { Elements } from './kepler';

export type BodyKind =
  | 'star' | 'brown_dwarf' | 'white_dwarf' | 'neutron_star' | 'black_hole'
  | 'planet' | 'gas_giant' | 'ice_giant' | 'dwarf_planet' | 'moon'
  | 'asteroid' | 'comet' | 'satellite' | 'probe'
  | 'nebula' | 'star_cluster' | 'galaxy' | 'quasar';

export type SurfaceStyle =
  | 'earth' | 'moon' | 'rocky' | 'mercury' | 'mars' | 'venus' | 'io' | 'europa' | 'ice' | 'titan' | 'lava' | 'ocean' | 'desert' | 'tundra'
  | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'gas' | 'hotjupiter'
  | 'asteroid' | 'comet' | 'star' | 'sun' | 'whitedwarf' | 'neutron' | 'blackhole' | 'artificial';

export interface Atmosphere {
  /** Height of the modelled atmosphere shell above the reference radius (m). */
  height: number;
  /** Rayleigh scale height (m). */
  scaleHeight: number;
  /** Rayleigh scattering coefficients at the surface (1/m) per RGB channel. */
  rayleigh: [number, number, number];
  /** Mie/aerosol extinction at the surface (1/m). */
  mie: number;
  mieG: number;
  /** Aerosol scale height (m); defaults to scaleHeight / 7. */
  mieHeight?: number;
  /** Per-channel tint of aerosol scattering (dust colours the Martian sky). */
  mieColor?: [number, number, number];
  /** Ozone-like absorption (1/m) per channel. */
  absorb?: [number, number, number];
  /** Surface pressure in Pa, informational. */
  pressure: number;
  composition: string;
}

export interface RingSpec {
  inner: number;
  outer: number;
  color: string;
  opacity: number;
  seed: number;
  /** Radial density profile preset. */
  profile?: 'saturn' | 'uranus' | 'neptune' | 'jupiter' | 'generic';
  /** Radial gaps as [inner, outer] fractions of the ring width. */
  gaps?: [number, number][];
}

export interface Look {
  style: SurfaceStyle;
  seed: number;
  palette: string[];
  /** Free-form numeric shader parameters (see render/planetMaterial). */
  params: Record<string, number>;
  textures?: { map?: string; night?: string; spec?: string; clouds?: string; normal?: string };
  cloudCover?: number;
  rings?: RingSpec[];
  /** Procedural mesh model for artificial objects (iss, hubble, jwst, voyager, probe, satellite). */
  model?: string;
}

export interface Spin {
  /** Unit vector of the north pole in ICRS axes. */
  pole: THREE.Vector3;
  /** Angular velocity (rad/s); negative = retrograde. */
  rate: number;
  /** Prime-meridian angle at J2000 (rad). */
  w0: number;
  /** Synchronous rotation: prime meridian always faces the parent. */
  locked?: boolean;
}

export function poleFromRaDec(raDeg: number, decDeg: number): THREE.Vector3 {
  const a = raDeg * DEG, d = decDeg * DEG;
  return new THREE.Vector3(Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d));
}

/** Equatorial radius accounting for polar flattening (radius is the volumetric mean). */
export function equatorialRadius(b: { radius: number; flattening: number }) {
  return b.radius * Math.pow(1 - b.flattening, -1 / 3);
}

export interface BodyInit {
  id: string;
  name: string;
  kind: BodyKind;
  typeLabel?: string;
  mass: number;
  radius: number;
}

const _n = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4();

/** A fully simulated astronomical object. Positions are absolute (ICRS axes, origin = Sun) in metres. */
export class Body {
  id: string;
  name: string;
  kind: BodyKind;
  typeLabel: string;
  mass: number;
  radius: number;
  /** Polar flattening (0 = sphere). */
  flattening = 0;
  /** Optional triaxial radii (a ≥ b ≥ c) for irregular bodies. */
  shape?: [number, number, number];

  parent: Body | null = null;
  children: Body[] = [];
  elements?: Elements;
  /** Time-dependent elements (e.g. JPL planetary polynomials); evaluated each update instead of `elements`. */
  elementsAt?: (t: number) => Elements;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  /** True when integrated by the N-body engine instead of following its Kepler rails. */
  dynamic = false;
  /** Sources of gravity (stars, planets, user bodies). Non-massive dynamic bodies are test particles. */
  massive = false;
  /** Held by the user (grab tool): the integrator leaves it alone. */
  held = false;
  /** While a dynamic test body is too fast to integrate at the current time-warp it follows an osculating orbit. */
  fallback?: { parent: Body; el: Elements };
  /** Osculating orbit relative to the dominant attractor, refreshed by the engine for display. */
  osc?: { parent: Body; el: Elements };
  /** Original data kept so the sandbox can restore the natural system. */
  natural?: { parent: Body | null; elements?: Elements; elementsAt?: (t: number) => Elements; mass: number; radius: number };
  /** Created by the user in the sandbox. */
  userCreated = false;
  /** Catalog star this body was materialised from (index into the star catalog), or -1. */
  catalogIndex = -1;

  /** Custom position rule (e.g. Lagrange-point spacecraft); overrides Kepler rails when set. */
  customRails?: (self: Body, t: number) => void;

  spin?: Spin;
  orientation = new THREE.Quaternion();
  /** Current rotation angle about the pole (rad). */
  spinAngle = 0;

  temperature = 0; // K (effective for stars, mean surface/cloud-top otherwise)
  albedo = 0.3;
  luminosity = 0; // W (stars)
  spectral = '';
  age = 0; // years
  atmosphere?: Atmosphere;
  look: Look = { style: 'rocky', seed: 1, palette: ['#8a7f73', '#5d554d', '#b9ada0'], params: {} };
  description = '';
  facts: string[] = [];
  discovered = '';
  /** Names shown in search (in addition to `name`). */
  aliases: string[] = [];
  /** Category used for grouping in the UI: e.g. "Solar System", "Nearby stars". */
  group = '';
  /** Hidden bodies are simulated but not drawn. */
  hidden = false;
  /** Trail of previous positions relative to the parent (sandbox). */
  trail?: Float64Array;
  /** Marks a body whose data is procedurally invented rather than observed. */
  procedural = false;
  /** Per-frame flags used by the renderer. */
  screenRadiusPx = 0;
  distanceToCamera = 0;

  constructor(init: BodyInit) {
    this.id = init.id;
    this.name = init.name;
    this.kind = init.kind;
    this.typeLabel = init.typeLabel ?? defaultTypeLabel(init.kind);
    this.mass = init.mass;
    this.radius = init.radius;
  }

  get gm() { return G * this.mass; }

  /** Mean density in kg/m³. */
  get density() { return this.mass / ((4 / 3) * Math.PI * this.radius ** 3); }
  get surfaceGravity() { return (G * this.mass) / (this.radius * this.radius); }
  get escapeVelocity() { return Math.sqrt((2 * G * this.mass) / this.radius); }
  get isStellar() { return this.kind === 'star' || this.kind === 'white_dwarf' || this.kind === 'neutron_star' || this.kind === 'brown_dwarf'; }
  get isLuminous() { return this.luminosity > 0 && (this.kind === 'star' || this.kind === 'white_dwarf' || this.kind === 'neutron_star'); }

  setParent(p: Body | null) {
    if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this);
    this.parent = p;
    if (p) p.children.push(this);
  }

  /** Update the orientation quaternion (body frame: +z = north pole, +x = prime meridian). */
  updateOrientation(t: number) {
    const s = this.spin;
    if (!s) { this.orientation.identity(); return; }
    _z.copy(s.pole);
    if (s.locked && this.parent) {
      _x.copy(this.parent.pos).sub(this.pos);
      _x.addScaledVector(_z, -_x.dot(_z));
      if (_x.lengthSq() < 1e-12) _x.set(1, 0, 0);
      _x.normalize();
      this.spinAngle = 0;
    } else {
      _n.set(-_z.y, _z.x, 0);
      if (_n.lengthSq() < 1e-12) _n.set(1, 0, 0);
      _n.normalize();
      const w = s.w0 + s.rate * t;
      this.spinAngle = w;
      _y.crossVectors(_z, _n);
      _x.copy(_n).multiplyScalar(Math.cos(w)).addScaledVector(_y, Math.sin(w));
    }
    _y.crossVectors(_z, _x);
    _m.makeBasis(_x, _y, _z);
    this.orientation.setFromRotationMatrix(_m);
  }
}

export function defaultTypeLabel(k: BodyKind): string {
  switch (k) {
    case 'star': return 'Star';
    case 'brown_dwarf': return 'Brown dwarf';
    case 'white_dwarf': return 'White dwarf';
    case 'neutron_star': return 'Neutron star';
    case 'black_hole': return 'Black hole';
    case 'planet': return 'Terrestrial planet';
    case 'gas_giant': return 'Gas giant';
    case 'ice_giant': return 'Ice giant';
    case 'dwarf_planet': return 'Dwarf planet';
    case 'moon': return 'Moon';
    case 'asteroid': return 'Asteroid';
    case 'comet': return 'Comet';
    case 'satellite': return 'Artificial satellite';
    case 'probe': return 'Space probe';
    case 'nebula': return 'Nebula';
    case 'star_cluster': return 'Star cluster';
    case 'galaxy': return 'Galaxy';
    case 'quasar': return 'Quasar';
  }
}
