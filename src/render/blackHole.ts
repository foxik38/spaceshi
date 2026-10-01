import * as THREE from 'three';
import { noiseGLSL } from './shaders/noise';
import { bodyVertex } from './shaders/body';
import type { Body } from '../sim/body';
import type { FrameContext } from './context';

/**
 * Schwarzschild black-hole renderer.
 *
 * For each pixel inside the lensing region the null geodesic is integrated backwards from the camera in the
 * orbital plane (u = 1/r, d²u/dφ² = −u + 1.5 u² in units of the Schwarzschild radius) with a leapfrog scheme.
 * The result is one of: captured by the horizon (black shadow), crossing the accretion disc (relativistic Doppler
 * beaming + gravitational redshift + Keplerian turbulence), or escaping to infinity, in which case the already-
 * rendered sky behind the hole is re-sampled at the deflected direction (surface brightness is conserved by lensing).
 */
const fragment = /* glsl */ `
precision highp float;
precision highp int;
varying vec3 vDir;
uniform sampler2D tScene;
uniform vec2 uRes;
uniform vec3 uB;            // unit view-space direction from camera to the hole
uniform float uD;           // camera distance in Schwarzschild radii
uniform vec3 uN;            // accretion disc normal (view space)
uniform vec2 uDisk;         // inner / outer disc radius (rs)
uniform float uDiskOn;
uniform vec2 uTanHalf;
uniform float uThetaMax;
uniform float uTime;
uniform float uSeed;
${noiseGLSL}

const int MAXSTEPS = 210;

vec3 diskColor(float T) {
  // crude blackbody-like ramp: dull red -> orange -> yellow-white -> blue-white
  vec3 c = mix(vec3(0.55, 0.06, 0.02), vec3(1.0, 0.45, 0.10), smoothstep(0.15, 0.5, T));
  c = mix(c, vec3(1.0, 0.85, 0.55), smoothstep(0.45, 0.9, T));
  c = mix(c, vec3(0.75, 0.85, 1.0), smoothstep(0.9, 1.6, T));
  return c;
}

vec3 sampleScene(vec3 s) {
  if (s.z > -1e-3) return vec3(0.0);
  vec2 ndc = vec2(s.x / (-s.z) / uTanHalf.x, s.y / (-s.z) / uTanHalf.y);
  vec2 uv = ndc * 0.5 + 0.5;
  float edge = smoothstep(1.02, 0.94, max(abs(ndc.x), abs(ndc.y)));
  return texture2D(tScene, clamp(uv, vec2(0.001), vec2(0.999))).rgb * edge;
}

void main() {
  vec3 d = normalize(vDir);
  vec2 suv = gl_FragCoord.xy / uRes;
  vec3 base = texture2D(tScene, suv).rgb;
  float cosT = clamp(dot(d, uB), -1.0, 1.0);
  float theta = acos(cosT);
  float w = 1.0 - smoothstep(0.7 * uThetaMax, uThetaMax, theta);
  if (w <= 0.0) { gl_FragColor = vec4(base, 1.0); return; }

  vec3 e1 = -uB;
  vec3 tp = d - cosT * uB;
  float tl = length(tp);
  vec3 e2 = tl > 1e-7 ? tp / tl : normalize(cross(uB, abs(uB.x) < 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
  float sinT = sqrt(max(1.0 - cosT * cosT, 0.0));

  float u = 1.0 / uD;
  float b = uD * sinT / sqrt(max(1.0 - u, 1e-3));
  float rad = 1.0 / max(b * b, 1e-12) - u * u * (1.0 - u);
  float up = sqrt(max(rad, 0.0)) * (cosT > 0.0 ? 1.0 : -1.0);
  float phi = 0.0;
  vec3 prevP = (1.0 / u) * e1;
  vec3 acc = vec3(0.0);
  float trans = 1.0;
  bool captured = false, escaped = false;
  int planeHits = 0;
  float phiEsc = 0.0;
  float h = 0.046;
  for (int i = 0; i < MAXSTEPS; i++) {
    float uPrev = u, phiPrev = phi;
    float a = -u + 1.5 * u * u;
    up += 0.5 * h * a;
    u += h * up;
    a = -u + 1.5 * u * u;
    up += 0.5 * h * a;
    phi += h;
    if (u >= 1.0) { captured = true; break; }
    if (u <= 0.0) { escaped = true; phiEsc = phiPrev + h * uPrev / max(uPrev - u, 1e-9); break; }
    float r = 1.0 / u;
    vec3 er = cos(phi) * e1 + sin(phi) * e2;
    vec3 P = r * er;
    if (uDiskOn > 0.5) {
      float s0 = dot(prevP, uN), s1 = dot(P, uN);
      if (s0 * s1 < 0.0) {
        planeHits++;
        float f = s0 / (s0 - s1);
        vec3 X = mix(prevP, P, f);
        float rr = length(X);
        // Only the first few plane crossings are shaded: the primary image, the arc over the shadow and the underside.
        // Later crossings belong to the razor-thin photon ring, which this step size cannot resolve (it beads into a hairline).
        if (planeHits <= 1 && rr > uDisk.x && rr < uDisk.y) {
          vec3 vhat = normalize(cross(uN, X));
          float beta = min(sqrt(0.5 / max(rr - 1.0, 0.05)), 0.75);
          vec3 ephi = -sin(phi) * e1 + cos(phi) * e2;
          vec3 tang = normalize((-up / (u * u)) * er + (1.0 / u) * ephi);
          vec3 nph = -tang;
          float gk = sqrt(1.0 - beta * beta) / max(1.0 - beta * dot(vhat, nph), 0.05);
          float gg = sqrt(max(1.0 - 1.0 / rr, 0.02)) / sqrt(max(1.0 - 1.0 / uD, 0.02));
          float g = gk * gg;
          float T0 = 1.45 * pow(rr / uDisk.x, -0.75) * (1.0 - 0.35 * sqrt(uDisk.x / rr));
          float T = T0 * g;
          // turbulent Keplerian rings, advected by the differential rotation
          vec3 ax = normalize(cross(uN, abs(uN.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 ay = cross(uN, ax);
          // a static spiral twist plus differential rotation shears the noise into filaments rather than concentric rings
          float az = atan(dot(X, ay), dot(X, ax)) - 5.0 * pow(rr, -1.5) - uTime * 0.6 * pow(rr, -1.5);
          float turb = 0.6 + 0.4 * fbm(vec3(log(rr) * 2.4, cos(az) * 2.6, sin(az) * 2.6), 4.0, uint(uSeed));
          float I = 7.0 * pow(g, 3.0) * pow(max(T0, 0.0), 2.6) * turb;
          // soft-clip the Doppler-boosted side: unbounded HDR values would bloom into a grey veil across the shadow
          I = 1.5 * (1.0 - exp(-I / 1.5));
          float edge = smoothstep(uDisk.x, uDisk.x * 1.06, rr) * (1.0 - smoothstep(uDisk.y * 0.75, uDisk.y, rr));
          float alpha = clamp(0.85 * edge * (0.55 + 0.6 * turb), 0.0, 1.0);
          acc += trans * alpha * diskColor(T) * I;
          trans *= (1.0 - alpha);
        }
      }
    }
    prevP = P;
  }

  vec3 bg = vec3(0.0);
  if (escaped) {
    vec3 sdir = normalize(cos(phiEsc) * e1 + sin(phiEsc) * e2);
    bg = sampleScene(sdir);
  }
  vec3 lensed = bg * trans + acc;
  if (captured) lensed = acc;
  gl_FragColor = vec4(mix(base, lensed, w), 1.0);
}
`;

const quadGeometry = new THREE.PlaneGeometry(2, 2);
const _c = new THREE.Vector3(), _cv = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _n = new THREE.Vector3();

export class BlackHoleItem {
  scene = new THREE.Scene();
  material: THREE.ShaderMaterial;
  mesh: THREE.Mesh;

  constructor(public body: Body) {
    this.material = new THREE.ShaderMaterial({
      vertexShader: bodyVertex, fragmentShader: fragment,
      uniforms: {
        uQuadCenter: { value: new THREE.Vector3() }, uQuadRight: { value: new THREE.Vector3() }, uQuadUp: { value: new THREE.Vector3() },
        uFull: { value: 1 }, uTanHalf: { value: new THREE.Vector2(1, 1) }, uProj: { value: new THREE.Matrix4() },
        tScene: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uB: { value: new THREE.Vector3(0, 0, -1) }, uD: { value: 100 },
        uN: { value: new THREE.Vector3(0, 1, 0) }, uDisk: { value: new THREE.Vector2(3, 14) }, uDiskOn: { value: 1 }, uThetaMax: { value: 0.3 },
        uTime: { value: 0 }, uSeed: { value: body.look.seed },
      },
      transparent: false, depthTest: false, depthWrite: false, blending: THREE.NoBlending, side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(quadGeometry, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** Radius (m) of the region in which light bending is computed: impact parameters up to ~28 Schwarzschild radii. */
  get influence() { return this.body.radius * 28; }

  update(ctx: FrameContext, sceneTex: THREE.Texture, res: THREE.Vector2) {
    const b = this.body, u = this.material.uniforms;
    _c.copy(b.pos).sub(ctx.camPos);
    _cv.copy(_c).applyQuaternion(ctx.camQuatInv);
    const d = _cv.length();
    const rs = b.radius;
    u.tScene.value = sceneTex;
    u.uRes.value.copy(res);
    u.uB.value.copy(_cv).multiplyScalar(1 / d);
    u.uD.value = Math.max(d / rs, 1.001);
    _n.copy(b.spin ? b.spin.pole : _n.set(0, 0, 1)).applyQuaternion(ctx.camQuatInv).normalize();
    u.uN.value.copy(_n);
    const dm = b.look.params.disk ?? 1;
    u.uDiskOn.value = dm > 0.5 ? 1 : 0;
    u.uDisk.value.set(3.0, 3 + 11 * Math.min(1.5, Math.max(0.5, b.look.params.diskSize ?? 1)));
    u.uTime.value = ctx.realTime;
    u.uTanHalf.value.set(ctx.tanHalfX, ctx.tanHalfY);
    u.uProj.value.copy(ctx.proj);
    const D = u.uD.value as number;
    const bmax = 28;
    u.uThetaMax.value = Math.min(Math.PI, Math.asin(Math.min(1, (bmax * Math.sqrt(Math.max(1 - 1 / D, 0.001))) / D)) * 1.15 + 0.002);
    // quad placement (same construction as the sphere renderer)
    const bound = this.influence;
    const full = d < bound * 1.05 || bound / d > 0.85;
    u.uFull.value = full ? 1 : 0;
    if (!full) {
      _f.copy(_cv).multiplyScalar(1 / d);
      _r.crossVectors(_f, _r.set(0, 1, 0));
      if (_r.lengthSq() < 1e-8) _r.set(1, 0, 0);
      _r.normalize();
      _u.crossVectors(_r, _f);
      const half = (bound / Math.sqrt(1 - (bound / d) * (bound / d))) * 1.1;
      u.uQuadCenter.value.copy(_cv);
      u.uQuadRight.value.copy(_r).multiplyScalar(half);
      u.uQuadUp.value.copy(_u).multiplyScalar(half);
    }
  }
}
