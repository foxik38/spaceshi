import * as THREE from 'three';
import { PC, AU, SOLAR_CONSTANT, L_SUN } from '../core/constants';
import { blackbodyRGB } from '../core/math';
import { Body, equatorialRadius } from '../sim/body';
import { bodyFragment, bodyVertex, PARAM_KEYS, STYLE_ID } from './shaders/body';
import { starFragment } from './shaders/star';
import { type FrameContext } from './context';
import { blackTexture, loadTexture, makeRingTexture, placeholderTexture } from './textures';

export interface LightInfo {
  star: Body;
  dir: THREE.Vector3;       // world-space unit vector from the body to the star
  dist: number;
  flux: number;             // relative to the solar constant at 1 AU
  color: [number, number, number];
}

/** Solar-flux-relative intensity of `star` at `dist` metres. */
export function fluxAt(star: Body, dist: number): number {
  return (star.luminosity / (4 * Math.PI * dist * dist)) / SOLAR_CONSTANT;
}

const quadGeometry = new THREE.PlaneGeometry(2, 2);

/** Animation clock for shaders: simulation time scaled and wrapped so float32 stays precise (wraps every ~6 sim-years). */
function animTime(ctx: FrameContext): number {
  const x = (ctx.time * 1e-5) % 2000;
  return x < 0 ? x + 2000 : x;
}

const _c = new THREE.Vector3(), _cv = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3();
const _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _m4 = new THREE.Matrix4();
const _tmp = new THREE.Vector3();

function palette(b: Body): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < 5; i++) {
    const c = new THREE.Color(b.look.palette[i] ?? b.look.palette[0] ?? '#888888');
    out.push(new THREE.Vector3(c.r, c.g, c.b));
  }
  return out;
}

export function styleId(b: Body): number {
  const s = b.look.style;
  switch (s) {
    case 'earth': return STYLE_ID.earth;
    case 'ocean': case 'desert': case 'tundra': return STYLE_ID.proc_earth;
    case 'venus': return STYLE_ID.venus;
    case 'jupiter': case 'saturn': case 'uranus': case 'neptune': case 'gas': case 'hotjupiter': return STYLE_ID.gas;
    case 'titan': return STYLE_ID.titan;
    default: return STYLE_ID.rocky;
  }
}

/** Analytic ray-cast planet/moon renderer: one screen-aligned quad whose fragment shader intersects the sphere. */
export class SphereBody {
  scene = new THREE.Scene();
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  body: Body;
  private ringTex?: THREE.Texture;
  private hasClouds = false;

  constructor(body: Body) {
    this.body = body;
    const u: Record<string, THREE.IUniform> = {
      uQuadCenter: { value: new THREE.Vector3() }, uQuadRight: { value: new THREE.Vector3() }, uQuadUp: { value: new THREE.Vector3() },
      uFull: { value: 0 }, uTanHalf: { value: new THREE.Vector2(1, 1) }, uProj: { value: new THREE.Matrix4() },
      uViewToBody: { value: new THREE.Matrix3() }, uCenterB: { value: new THREE.Vector3() }, uCenterS: { value: new THREE.Vector3() },
      uInvAxes: { value: new THREE.Vector3(1, 1, 1) }, uR: { value: 1 }, uCs: { value: 1 }, uCa: { value: 1 }, uCc: { value: 1 }, uRa: { value: 1 }, uRc: { value: 1 },
      uNumLights: { value: 0 },
      uLightDirB: { value: [0, 1, 2, 3].map(() => new THREE.Vector3(1, 0, 0)) },
      uLightCol: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
      uLightAng: { value: [0, 0, 0, 0] },
      uOccN: { value: 0 }, uOcc: { value: [0, 1, 2, 3].map(() => new THREE.Vector4()) },
      uStyle: { value: styleId(body) }, uSeed: { value: body.look.seed }, uTime: { value: 0 },
      uParam: { value: new Array(40).fill(0) }, uPal: { value: palette(body) },
      uAirless: { value: body.atmosphere ? 0 : 1 }, uHasAtmo: { value: body.atmosphere ? 1 : 0 },
      uExposure: { value: 1 }, uAlbedoScale: { value: 1 }, uPixelScale: { value: 0.001 }, uDetail: { value: 1 },
      uMap: { value: blackTexture }, uNight: { value: blackTexture }, uSpec: { value: blackTexture }, uNormalTex: { value: placeholderTexture },
      uCloudTex: { value: blackTexture }, uHasMap: { value: 0 }, uHasClouds: { value: 0 }, uProcClouds: { value: 0 },
      uRingIn: { value: 0 }, uRingOut: { value: 0 }, uHasRings: { value: 0 }, uRingCol: { value: new THREE.Vector3(1, 1, 1) }, uRingTex: { value: blackTexture },
      uMicroOff: { value: new THREE.Vector3() }, uMicroAmt: { value: 0 },
      uRayleigh: { value: new THREE.Vector3() }, uMieK: { value: 0 }, uMieG: { value: 0.7 }, uMieCol: { value: new THREE.Vector3(1, 1, 1) },
      uAbsorb: { value: new THREE.Vector3() }, uHR: { value: 8000 }, uHM: { value: 1200 }, uOzone: { value: 0 }, uAtmoGain: { value: 1 },
    };
    this.material = new THREE.ShaderMaterial({
      vertexShader: bodyVertex, fragmentShader: bodyFragment, uniforms: u,
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
    });
    this.mesh = new THREE.Mesh(quadGeometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    this.applyStatic();
  }

  /** (Re)apply body-dependent constants: textures, palette, atmosphere, rings. */
  applyStatic() {
    const b = this.body, u = this.material.uniforms;
    u.uStyle.value = styleId(b);
    u.uSeed.value = b.look.seed;
    u.uPal.value = palette(b);
    const tx = b.look.textures;
    if (tx?.map) { u.uMap.value = loadTexture(tx.map); u.uHasMap.value = 1; }
    if (tx?.night) u.uNight.value = loadTexture(tx.night);
    if (tx?.spec) u.uSpec.value = loadTexture(tx.spec, { srgb: false });
    if (tx?.normal) u.uNormalTex.value = loadTexture(tx.normal, { srgb: false });
    if (tx?.clouds) { u.uCloudTex.value = loadTexture(tx.clouds); u.uHasClouds.value = 1; this.hasClouds = true; }
    const cover = b.look.params.cloud;
    if (!tx?.clouds && cover !== undefined && b.look.style !== 'jupiter') u.uProcClouds.value = 1 + cover;
    const arr = u.uParam.value as number[];
    PARAM_KEYS.forEach((k, i) => { arr[i] = b.look.params[k] ?? 0; });
    if (b.look.style === 'earth') arr[PARAM_KEYS.indexOf('relief')] = 0.6;
    const a = b.atmosphere;
    u.uAirless.value = a ? 0 : 1;
    u.uHasAtmo.value = a ? 1 : 0;
    if (a) {
      const giant = b.kind === 'gas_giant' || b.kind === 'ice_giant';
      const rk = giant ? 0.16 : 1;
      u.uRayleigh.value.set(a.rayleigh[0] * rk, a.rayleigh[1] * rk, a.rayleigh[2] * rk);
      u.uMieK.value = a.mie * (giant ? 0.12 : 1); u.uMieG.value = a.mieG;
      u.uMieCol.value.set(...(a.mieColor ?? [1, 1, 1]));
      u.uAbsorb.value.set(...(a.absorb ?? [0, 0, 0]));
      u.uHR.value = a.scaleHeight; u.uHM.value = a.mieHeight ?? a.scaleHeight / 7;
      u.uOzone.value = b.look.style === 'earth' ? 1 : 0;
      u.uAtmoGain.value = b.look.style === 'earth' ? 4.6 : b.kind === 'gas_giant' || b.kind === 'ice_giant' ? 5 : 4.5;
    }
    const ring = b.look.rings?.[0];
    if (ring) {
      this.ringTex = makeRingTexture(ring);
      u.uRingTex.value = this.ringTex;
      u.uHasRings.value = 1;
      u.uRingIn.value = ring.inner; u.uRingOut.value = ring.outer;
    } else u.uHasRings.value = 0;
    if (a && b.look.style === 'jupiter') { u.uProcClouds.value = 0; }
  }

  /** Outer bounding radius of everything this shader draws. */
  get boundRadius(): number {
    const b = this.body;
    const R = b.shape ? b.shape[0] : equatorialRadius(b);
    let r = R;
    if (b.atmosphere) r = Math.max(r, R + b.atmosphere.height);
    const ring = b.look.rings?.[0];
    if (ring) r = Math.max(r, ring.outer);
    return r * 1.03;
  }

  update(ctx: FrameContext, lights: LightInfo[], occluders: { pos: THREE.Vector3; radius: number }[], distance: number) {
    const b = this.body, u = this.material.uniforms;
    const R = b.shape ? b.shape[0] : equatorialRadius(b);
    const ax = b.shape ? [1, b.shape[1] / b.shape[0], b.shape[2] / b.shape[0]] : [1, 1, 1 - b.flattening];
    const iax = [1 / ax[0], 1 / ax[1], 1 / ax[2]];
    const atmoTop = b.atmosphere ? R + b.atmosphere.height : R;
    const cloudR = this.hasClouds || u.uProcClouds.value > 0 ? R + (b.look.style === 'earth' ? 9000 : R * 0.004) : R;

    // body-frame transforms
    _qi.copy(b.orientation).invert();
    _c.copy(b.pos).sub(ctx.camPos); // camera->centre in world axes (double)
    const cB = _tmp.copy(_c).applyQuaternion(_qi);
    u.uCenterB.value.copy(cB);
    u.uCenterS.value.set(cB.x * iax[0], cB.y * iax[1], cB.z * iax[2]);
    const csx = cB.x * iax[0], csy = cB.y * iax[1], csz = cB.z * iax[2];
    const c2 = csx * csx + csy * csy + csz * csz;
    u.uCs.value = c2 - R * R;
    u.uCa.value = c2 - atmoTop * atmoTop;
    u.uCc.value = c2 - cloudR * cloudR;
    u.uR.value = R; u.uRa.value = atmoTop; u.uRc.value = cloudR;
    u.uInvAxes.value.set(iax[0], iax[1], iax[2]);
    _q.copy(ctx.camQuat); // view -> world
    _q.premultiply(_qi);  // view -> body
    _m4.makeRotationFromQuaternion(_q);
    (u.uViewToBody.value as THREE.Matrix3).setFromMatrix4(_m4);

    // lights
    u.uNumLights.value = Math.min(4, lights.length);
    for (let i = 0; i < 4; i++) {
      const L = lights[i];
      if (!L) break;
      _f.copy(L.dir).applyQuaternion(_qi);
      (u.uLightDirB.value as THREE.Vector3[])[i].copy(_f);
      (u.uLightCol.value as THREE.Vector3[])[i].set(L.color[0] * L.flux, L.color[1] * L.flux, L.color[2] * L.flux);
      (u.uLightAng.value as number[])[i] = L.star.radius / L.dist;
    }
    // occluders (eclipse shadows)
    const n = Math.min(4, occluders.length);
    u.uOccN.value = n;
    for (let i = 0; i < n; i++) {
      _f.copy(occluders[i].pos).sub(b.pos).applyQuaternion(_qi);
      (u.uOcc.value as THREE.Vector4[])[i].set(_f.x, _f.y, _f.z, occluders[i].radius);
    }
    u.uTime.value = animTime(ctx);
    u.uExposure.value = ctx.exposure;
    u.uPixelScale.value = ctx.pixelAngle;
    u.uDetail.value = ctx.detail;
    u.uTanHalf.value.set(ctx.tanHalfX, ctx.tanHalfY);
    u.uProj.value.copy(ctx.proj);
    // ground-level detail: camera position in the body frame reduced modulo the noise period (kept in double on the CPU)
    const P = 65536;
    const alt = Math.sqrt(c2) - R;
    u.uMicroAmt.value = 1 - Math.min(1, Math.max(0, (alt - 2e4) / 2.5e5));
    u.uMicroOff.value.set(((-cB.x % P) + P) % P, ((-cB.y % P) + P) % P, ((-cB.z % P) + P) % P);

    // quad placement
    _cv.copy(_c).applyQuaternion(ctx.camQuatInv);
    const bound = this.boundRadius;
    const d = _cv.length();
    const full = d < bound * 1.02 || bound / d > 0.85;
    u.uFull.value = full ? 1 : 0;
    if (!full) {
      _f.copy(_cv).multiplyScalar(1 / d);
      _r.crossVectors(_f, _r.set(0, 1, 0));
      if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0);
      _r.normalize();
      _u.crossVectors(_r, _f);
      const half = (bound / Math.sqrt(1 - (bound / d) * (bound / d))) * 1.02;
      u.uQuadCenter.value.copy(_cv);
      u.uQuadRight.value.copy(_r).multiplyScalar(half);
      u.uQuadUp.value.copy(_u).multiplyScalar(half);
    }
    void distance;
  }
}

/** Star surface renderer: photosphere with limb darkening/granulation plus a corona, same ray-cast approach. */
export class StarBody {
  scene = new THREE.Scene();
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;
  body: Body;

  constructor(body: Body) {
    this.body = body;
    this.material = new THREE.ShaderMaterial({
      vertexShader: bodyVertex, fragmentShader: starFragment,
      uniforms: {
        uQuadCenter: { value: new THREE.Vector3() }, uQuadRight: { value: new THREE.Vector3() }, uQuadUp: { value: new THREE.Vector3() },
        uFull: { value: 0 }, uTanHalf: { value: new THREE.Vector2(1, 1) }, uProj: { value: new THREE.Matrix4() },
        uViewToBody: { value: new THREE.Matrix3() }, uCenterB: { value: new THREE.Vector3() }, uR: { value: 1 }, uCs: { value: 1 },
        uColor: { value: new THREE.Vector3(1, 1, 1) }, uDisc: { value: 30 }, uTime: { value: 0 }, uSeed: { value: body.look.seed },
        uExposure: { value: 1 }, uGran: { value: 1 }, uSpots: { value: 0.5 }, uCorona: { value: 1 }, uPixelScale: { value: 0.001 }, uLimb: { value: 0.6 },
      },
      transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    this.mesh = new THREE.Mesh(quadGeometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    const [r, g, bl] = blackbodyRGB(body.temperature || 5772);
    this.material.uniforms.uColor.value.set(r, g, bl);
    const T = body.temperature || 5772;
    this.material.uniforms.uDisc.value = Math.min(8, Math.max(0.5, 0.8 * Math.pow(T / 5772, 2.0)));
    this.material.uniforms.uGran.value = T < 8000 ? 1.9 : 0.5;
    this.material.uniforms.uSpots.value = T < 6500 ? (body.look.params.spots ?? 0.4) : 0;
    this.material.uniforms.uLimb.value = T < 4500 ? 0.75 : T < 7500 ? 0.6 : 0.4;
  }

  get boundRadius() { return this.body.radius * 14; }

  update(ctx: FrameContext) {
    const b = this.body, u = this.material.uniforms;
    _qi.copy(b.orientation).invert();
    _c.copy(b.pos).sub(ctx.camPos);
    const cB = _tmp.copy(_c).applyQuaternion(_qi);
    u.uCenterB.value.copy(cB);
    const R = b.radius;
    u.uR.value = R;
    u.uCs.value = cB.lengthSq() - R * R;
    _q.copy(ctx.camQuat).premultiply(_qi);
    _m4.makeRotationFromQuaternion(_q);
    (u.uViewToBody.value as THREE.Matrix3).setFromMatrix4(_m4);
    u.uTime.value = animTime(ctx);
    u.uExposure.value = 1;
    u.uTanHalf.value.set(ctx.tanHalfX, ctx.tanHalfY);
    u.uProj.value.copy(ctx.proj);
    _cv.copy(_c).applyQuaternion(ctx.camQuatInv);
    const bound = this.boundRadius, d = _cv.length();
    const full = d < bound * 1.02 || bound / d > 0.85;
    u.uFull.value = full ? 1 : 0;
    if (!full) {
      _f.copy(_cv).multiplyScalar(1 / d);
      _r.crossVectors(_f, _r.set(0, 1, 0));
      if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0);
      _r.normalize();
      _u.crossVectors(_r, _f);
      const half = (bound / Math.sqrt(1 - (bound / d) * (bound / d))) * 1.02;
      u.uQuadCenter.value.copy(_cv);
      u.uQuadRight.value.copy(_r).multiplyScalar(half);
      u.uQuadUp.value.copy(_u).multiplyScalar(half);
    }
  }
}

export { PC, AU, L_SUN };
