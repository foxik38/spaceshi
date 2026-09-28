import { noiseGLSL } from './noise';
import { atmosphereGLSL } from './atmosphere';

/** Parameter slots shared between Look.params and the shader's uParam[] array. */
export const PARAM_KEYS = [
  'relief', 'craters', 'craterScale', 'maria', 'cracks', 'iceCap', 'dust', 'volcanic', 'twoTone', 'seaLevel', 'cloud', 'bands',
  'turbulence', 'storm', 'stormLat', 'stormLon', 'stormSize', 'tholin', 'swirl', 'bigCrater', 'grooves', 'tiger', 'continentScale',
  'mountains', 'metal', 'sponge', 'chaotic', 'cantaloupe', 'hexagon', 'lava', 'sulfur', 'boulders',
] as const;
export type ParamKey = (typeof PARAM_KEYS)[number];

export const STYLE_ID: Record<string, number> = {
  rocky: 0, earth: 1, proc_earth: 2, venus: 3, gas: 4, io: 5, titan: 6, lava: 7,
};

const paramDefines = PARAM_KEYS.map((k, i) => `#define P_${k.toUpperCase()} ${i}`).join('\n');

export const bodyVertex = /* glsl */ `
uniform vec3 uQuadCenter;
uniform vec3 uQuadRight;
uniform vec3 uQuadUp;
uniform float uFull;
uniform vec2 uTanHalf;
uniform mat4 uProj;
varying vec3 vDir;
void main() {
  if (uFull > 0.5) {
    gl_Position = vec4(position.xy, 0.0, 1.0);
    vDir = vec3(position.xy * uTanHalf, -1.0);
  } else {
    vec3 vp = uQuadCenter + uQuadRight * position.x + uQuadUp * position.y;
    gl_Position = uProj * vec4(vp, 1.0);
    gl_Position.z = 0.0;
    vDir = vp;
  }
}
`;

export const bodyFragment = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;

varying vec3 vDir;

${paramDefines}

uniform mat3 uViewToBody;
uniform vec3 uCenterB;     // planet centre in body frame (unscaled)
uniform vec3 uCenterS;     // planet centre in scaled (de-flattened) body frame
uniform float uInvFlat;    // 1 / (1 - flattening)
uniform float uR;          // equatorial radius (m)
uniform float uCs;         // |c|^2 - R^2 for the ground sphere (scaled space, double-precision on CPU)
uniform float uCa;         // ... atmosphere top
uniform float uCc;         // ... cloud deck
uniform float uRa;
uniform float uRc;

uniform int uNumLights;
uniform vec3 uLightDirB[4];
uniform vec3 uLightCol[4];
uniform float uLightAng[4];
uniform int uOccN;
uniform vec4 uOcc[4];      // xyz relative to planet centre in body frame, w radius

uniform int uStyle;
uniform float uSeed;
uniform float uTime;
uniform float uParam[32];
uniform vec3 uPal[5];
uniform float uAirless;
uniform float uHasAtmo;
uniform float uExposure;
uniform float uAlbedoScale;
uniform float uPixelScale;   // angular size of one pixel (rad)

uniform sampler2D uMap;
uniform sampler2D uNight;
uniform sampler2D uSpec;
uniform sampler2D uNormalTex;
uniform sampler2D uCloudTex;
uniform float uHasMap;
uniform float uHasClouds;
uniform float uProcClouds;   // 0 none, 1 procedural cloud cover

uniform float uRingIn;
uniform float uRingOut;
uniform float uHasRings;
uniform vec3 uRingCol;
uniform sampler2D uRingTex;

uniform vec3 uMicroOff;      // camera position in body frame modulo the micro period (m)
uniform float uMicroAmt;     // 0..1 fade for ground-level detail

${noiseGLSL}
${atmosphereGLSL}

#define P(i) uParam[i]
#define SEED uint(uSeed)

vec3 gHitLocal;   // camera-to-hit vector in body frame (metres, precise)
float gPixM = 1.0;

float octFor(float freq, float pix, float maxO) {
  // number of octaves whose wavelength is above ~2 pixels
  return clamp(log2(1.0 / max(pix * freq, 1e-9)), 1.0, maxO);
}

// Ground-level detail: periodic noise in metres, evaluated on precise camera-relative coordinates.
const float MICRO_P = 65536.0;
vec4 microFbm(vec3 q, float pixM, uint seed) {
  vec4 s = vec4(0.0);
  float a = 0.5;
  float tot = 0.0;
  for (int k = 3; k < 17; k++) {
    float cell = MICRO_P / exp2(float(k));
    if (cell < pixM * 2.0) break;
    float fade = clamp((cell / pixM - 2.0) / 3.0, 0.0, 1.0);
    int per = 1 << k;
    vec4 n = noisedP(q / cell + vec3(float(k) * 3.7), per, seed + uint(k) * 3u);
    s.x += a * fade * n.x;
    s.yzw += a * fade * n.yzw / cell;
    tot += a * fade;
    a *= 0.55;
  }
  return s / max(tot, 1e-3);
}

struct Surf {
  vec3 albedo;
  float rough;     // 0 = smooth
  vec3 hg;         // height gradient in unit-sphere coordinates
  vec3 emis;       // self-emission
  float ocean;     // specular water mask
  float cloudDensity;
};

vec2 sphereUV(vec3 n) {
  return vec2(atan(n.y, n.x) * 0.15915494 + 0.5, asin(clamp(n.z, -1.0, 1.0)) * 0.31830989 + 0.5);
}

vec4 texSph(sampler2D tex, vec3 n) {
  vec2 uv = sphereUV(n);
  vec2 uv2 = vec2(fract(uv.x + 0.5), uv.y);
  vec2 dx1 = dFdx(uv), dy1 = dFdy(uv), dx2 = dFdx(uv2), dy2 = dFdy(uv2);
  bool alt = (dot(dx1, dx1) + dot(dy1, dy1)) > (dot(dx2, dx2) + dot(dy2, dy2));
  return alt ? textureGrad(tex, uv, dx2, dy2) : textureGrad(tex, uv, dx1, dy1);
}

// ---------------------------------------------------------------- rocky / icy / dusty surfaces
Surf surfRocky(vec3 n, float pix) {
  Surf s;
  s.emis = vec3(0.0); s.ocean = 0.0; s.cloudDensity = 0.0; s.rough = 1.0;
  float oc = octFor(1.6, pix, 7.0);
  vec4 c = fbmd(n * 1.6 + 7.0, oc, SEED);
  float om = octFor(3.0, pix, 12.0);
  vec4 t = fbmd(n * 3.0, om, SEED + 5u);
  float mount = P(P_MOUNTAINS);
  vec4 rg = vec4(0.0);
  if (mount > 0.0) rg = ridged(n * 2.2 + 3.1, octFor(2.2, pix, 10.0), SEED + 9u);
  float h = 0.3 * t.x + mount * (rg.x - 0.4);
  vec3 hg = 0.3 * t.yzw + mount * rg.yzw;

  float bright, bowl;
  vec4 cr = craters(n, 3.0 * max(P(P_CRATERSCALE), 0.25), 9, P(P_CRATERS), pix, SEED + 21u, bright, bowl);
  // large basin (Herschel/Rheasilvia style)
  if (P(P_BIGCRATER) > 0.0) {
    vec3 bc = normalize(vec3(0.6, 0.2, -0.3));
    float d = acos(clamp(dot(n, bc), -1.0, 1.0));
    float r = 0.55;
    float x = d / r;
    float prof = (x < 1.0 ? -(1.0 - x * x) * 0.5 + 0.0 : 0.0) + 0.25 * exp(-((x - 1.0) * 4.0) * ((x - 1.0) * 4.0));
    h += prof * 0.15 * P(P_BIGCRATER);
    vec3 tang = normalize(cross(cross(n, bc), n) + 1e-6);
    float dprof = (x < 1.0 ? x * 1.0 : 0.0) - 2.0 * 0.25 * 16.0 * (x - 1.0) * exp(-((x - 1.0) * 4.0) * ((x - 1.0) * 4.0));
    hg += -tang * (dprof / r) * 0.15 * P(P_BIGCRATER) * (d < r * 1.6 ? 1.0 : 0.0);
  }
  hg += cr.yzw;
  h += cr.x;

  float tone = 0.5 + 0.5 * c.x;
  vec3 pal0 = uPal[0], pal1 = uPal[1], pal2 = uPal[2], pal3 = uPal[3], pal4 = uPal[4];
  vec3 col = mix(pal1, pal0, smoothstep(0.25, 0.75, tone + 0.25 * t.x));
  if (uHasMap > 0.5) {
    // real albedo map for large-scale structure (e.g. lunar maria); procedural craters are layered on top
    float mv = texSph(uMap, n).r;
    col = mix(pal3, pal2, smoothstep(0.22, 0.62, mv)) * (0.85 + 0.2 * t.x);
  }
  // maria: dark, smooth basins
  float maria = 0.0;
  if (P(P_MARIA) > 0.0) {
    float mm = smoothstep(0.1, 0.35, c.x * 0.7 + 0.25 * fbm(n * 0.9 + 3.0, 3.0, SEED + 3u) - 0.1);
    maria = mm * P(P_MARIA);
    col = mix(col, pal3, maria);
    hg *= (1.0 - 0.6 * maria);
  }
  col = mix(col, pal2, clamp(bright * 0.3, 0.0, 0.45));
  col *= 1.0 + 0.25 * clamp(cr.x * 30.0, -1.0, 0.5);
  // iron-oxide dust / mars-like dark terrain
  if (P(P_DUST) > 0.0) {
    float dm = smoothstep(0.15, 0.6, fbm(n * 2.6 + 11.0, octFor(2.6, pix, 6.0), SEED + 13u) * 0.5 + 0.5 - 0.15 * n.z * n.z);
    col = mix(col, mix(pal3, pal1, 0.35), (1.0 - dm) * 0.65 * P(P_DUST));
    col = mix(col, pal2, dm * 0.25 * P(P_DUST));
  }
  // cracks / lineae (Europa, Enceladus, Ganymede grooves)
  float crack = P(P_CRACKS);
  if (crack > 0.0) {
    vec3 w = n * 5.0 + 0.6 * fbmd(n * 3.0, 3.0, SEED + 44u).yzw;
    float l1 = abs(noised(w, SEED + 50u).x);
    float l2 = abs(noised(w * 2.1 + 5.0, SEED + 52u).x);
    float width = max(0.045, pix * 14.0);
    float lin = (1.0 - smoothstep(0.0, width, l1)) + 0.7 * (1.0 - smoothstep(0.0, width * 0.8, l2));
    lin = clamp(lin, 0.0, 1.0) * crack;
    col = mix(col, pal3, lin * 0.75);
    hg += 0.15 * lin * vec3(0.0);
  }
  // Enceladus tiger stripes: parallel south-polar rifts
  if (P(P_TIGER) > 0.0) {
    float lat = n.z;
    float m = smoothstep(-0.5, -0.9, lat);
    float st = abs(sin(n.x * 30.0 + 2.0 * fbm(n * 6.0, 3.0, SEED + 61u)));
    float ln = (1.0 - smoothstep(0.0, 0.25, st)) * m;
    col = mix(col, vec3(0.35, 0.55, 0.65), ln * 0.7);
  }
  // Iapetus: dark leading hemisphere
  if (P(P_TWOTONE) > 0.0) {
    float dk = smoothstep(-0.05, 0.1, n.y + 0.25 * fbm(n * 3.0, 4.0, SEED + 71u));
    col = mix(col, pal1, dk * 0.92);
  }
  // Triton cantaloupe terrain and Charon's red pole
  if (P(P_CANTALOUPE) > 0.0) {
    vec4 cw = craters(n * 1.0 + 20.0, 9.0, 3, 0.9, pix, SEED + 81u, bright, bowl);
    col = mix(col, pal1, clamp(bowl * 0.5, 0.0, 0.5));
    hg += cw.yzw * 0.6;
  }
  // ice caps
  float capw = P(P_ICECAP);
  if (capw > 0.0) {
    float edge = 1.0 - 0.22 * capw + 0.05 * fbm(n * 6.0, 4.0, SEED + 91u);
    float cap = smoothstep(edge, edge + 0.03, abs(n.z));
    col = mix(col, pal4, cap);
  }
  // Pluto-style tholin patches
  if (P(P_THOLIN) > 0.0) {
    float th = smoothstep(0.0, 0.5, fbm(n * 2.2 + 4.0, octFor(2.2, pix, 5.0), SEED + 101u));
    col = mix(col, pal1, th * 0.6 * P(P_THOLIN));
    col = mix(col, pal4, smoothstep(0.55, 0.9, fbm(n * 1.3 + 9.0, 3.0, SEED + 103u)) * 0.5);
  }
  // Io: sulphur patches and dark volcanic paterae
  if (P(P_VOLCANIC) > 0.0) {
    float v = fbm(n * 3.5 + 2.0, octFor(3.5, pix, 7.0), SEED + 111u);
    vec3 sc = mix(pal0, pal1, smoothstep(-0.2, 0.5, v));
    sc = mix(sc, pal2, smoothstep(0.3, 0.7, fbm(n * 6.0, 4.0, SEED + 113u)));
    float pb, pw;
    vec4 pv = craters(n + 40.0, 14.0, 2, 0.5, pix, SEED + 121u, pb, pw);
    sc = mix(sc, pal3, smoothstep(0.4, 0.9, pw) * 0.95);
    sc = mix(sc, vec3(0.75, 0.25, 0.1), smoothstep(0.1, 0.35, pw) * (1.0 - smoothstep(0.35, 0.6, pw)) * 0.7);
    col = mix(col, sc, P(P_VOLCANIC));
    s.emis = vec3(1.0, 0.35, 0.08) * smoothstep(0.85, 1.0, pw) * 0.6 * P(P_VOLCANIC);
  }
  // Phobos-like grooves, asteroid metal sheen, boulders
  if (P(P_GROOVES) > 0.0) {
    float g = abs(sin(dot(n, normalize(vec3(0.3, 1.0, 0.2))) * 60.0 + 4.0 * fbm(n * 4.0, 3.0, SEED + 131u)));
    col *= 1.0 - 0.25 * (1.0 - smoothstep(0.0, 0.3, g)) * P(P_GROOVES);
  }
  if (P(P_METAL) > 0.0) { col = mix(col, vec3(dot(col, vec3(0.33))) * vec3(1.1, 1.05, 1.0), 0.5 * P(P_METAL)); s.rough = 0.6; }
  if (P(P_BOULDERS) > 0.0) {
    float pb2, pw2;
    vec4 bo = craters(n + 55.0, 60.0, 3, 0.7, pix, SEED + 141u, pb2, pw2);
    hg += -bo.yzw * 1.2;
    col *= 1.0 - 0.3 * pw2;
  }

  // ground-level micro detail (periodic noise in metres, camera-relative to keep precision)
  if (uMicroAmt > 0.001) {
    vec4 mf = microFbm(gHitLocal + uMicroOff, gPixM, SEED + 400u);
    col *= 1.0 + 0.45 * uMicroAmt * mf.x;
    hg += mf.yzw * uR * 0.9 * uMicroAmt;
  }
  s.albedo = col;
  s.hg = hg * (P(P_RELIEF) > 0.0 ? 1.0 : 0.0);
  return s;
}

// ---------------------------------------------------------------- procedural earth-like planet
Surf surfEarthLike(vec3 n, float pix) {
  Surf s;
  s.emis = vec3(0.0); s.rough = 0.5; s.cloudDensity = 0.0;
  float cs = max(P(P_CONTINENTSCALE), 0.3);
  float oc = octFor(1.3 * cs, pix, 12.0);
  vec4 hh = fbmd(n * 1.3 * cs + 5.0, oc, SEED);
  vec4 rg = ridged(n * 2.0 * cs + 1.0, octFor(2.0 * cs, pix, 10.0), SEED + 7u);
  float height = hh.x * 0.75 + 0.25 * (rg.x - 0.35) * smoothstep(0.0, 0.3, hh.x);
  float sea = P(P_SEALEVEL);
  float land = smoothstep(sea - 0.01, sea + 0.01, height);
  vec3 hg = (hh.yzw * 0.75 + 0.25 * rg.yzw * smoothstep(0.0, 0.3, hh.x)) * land;
  float lat = abs(n.z);
  float temp = 1.0 - lat * 1.25 - max(height - sea, 0.0) * 0.9 + 0.12 * fbm(n * 5.0, 3.0, SEED + 3u);
  float moist = 0.5 + 0.5 * fbm(n * 2.5 + 9.0, octFor(2.5, pix, 7.0), SEED + 11u);
  vec3 forest = uPal[1], desert = uPal[2], snow = uPal[3], water = uPal[0], deep = uPal[4];
  vec3 landCol = mix(desert, forest, smoothstep(0.35, 0.65, moist * (0.5 + temp * 0.6)));
  landCol = mix(landCol, vec3(0.32, 0.3, 0.26), smoothstep(0.35, 0.8, height - sea + 0.2 * rg.x) * 0.7);
  landCol = mix(landCol, snow, smoothstep(0.15, 0.0, temp));
  float depth = clamp((sea - height) * 3.0, 0.0, 1.0);
  vec3 seaCol = mix(water, deep, depth);
  float ice = smoothstep(0.12, 0.0, temp + 0.05 * hh.x);
  vec3 col = mix(seaCol, landCol, land);
  col = mix(col, snow, ice);
  if (uMicroAmt > 0.001) {
    vec4 mf = microFbm(gHitLocal + uMicroOff, gPixM, SEED + 402u);
    col *= 1.0 + 0.4 * uMicroAmt * mf.x * land;
    hg += mf.yzw * uR * 0.7 * uMicroAmt * land;
  }
  s.albedo = col;
  s.hg = hg;
  s.ocean = (1.0 - land) * (1.0 - ice);
  return s;
}

// ---------------------------------------------------------------- gas / ice giants
vec3 bandPalette(float v) {
  // v in 0..1 across five palette entries
  float x = clamp(v, 0.0, 0.9999) * 4.0;
  int i = int(floor(x));
  float f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  vec3 a = uPal[0], b = uPal[1];
  if (i == 0) { a = uPal[0]; b = uPal[1]; }
  else if (i == 1) { a = uPal[1]; b = uPal[2]; }
  else if (i == 2) { a = uPal[2]; b = uPal[3]; }
  else { a = uPal[3]; b = uPal[4]; }
  return mix(a, b, f);
}

Surf surfGas(vec3 n, float pix) {
  Surf s;
  s.emis = vec3(0.0); s.ocean = 0.0; s.cloudDensity = 0.0; s.rough = 1.0;
  float z = n.z;
  float bands = max(P(P_BANDS), 0.05);
  float turb = P(P_TURBULENCE);
  // differential rotation: zonal shear that varies with latitude
  float shear = sin(z * 9.0 * bands + 1.3) * 0.02 + sin(z * 23.0 * bands) * 0.008;
  float ang = uTime * shear;
  float ca = cos(ang), sa = sin(ang);
  vec3 q = vec3(ca * n.x - sa * n.y, sa * n.x + ca * n.y, z);
  // warp coordinates by a noise field to produce eddies at band boundaries
  float oct = octFor(10.0 * bands, pix, 9.0);
  vec4 w1 = fbmd(vec3(q.xy * 2.2, q.z * 10.0 * bands) + 3.0, oct, SEED);
  vec4 w2 = fbmd(vec3(q.xy * 5.0, q.z * 26.0 * bands) + vec3(uTime * 0.01, 0.0, 0.0), octFor(26.0 * bands, pix, 8.0), SEED + 4u);
  float edgeBoost = 0.5 + 0.5 * abs(sin(z * 9.0 * bands + 1.3));
  float lat = z * 6.0 * bands + turb * (0.14 * w1.x + 0.06 * w2.x * edgeBoost);
  float band = 0.5 + 0.5 * (0.7 * sin(lat * 3.14159 * 1.0 + 0.5) + 0.3 * sin(lat * 3.14159 * 2.3 + 1.7));
  band = clamp(band + 0.10 * w2.x * turb, 0.0, 1.0);
  vec3 col = bandPalette(band);
  // fine cloud streaks
  col *= 1.0 + 0.08 * w2.x * turb;
  // Great Red Spot-like storm
  float st = P(P_STORM);
  if (st > 0.0) {
    float slat = radians(P(P_STORMLAT));
    float slon = radians(P(P_STORMLON));
    vec3 sc = vec3(cos(slat) * cos(slon), cos(slat) * sin(slon), sin(slat));
    // local tangent coordinates
    vec3 e1 = normalize(cross(vec3(0.0, 0.0, 1.0), sc));
    vec3 e2 = cross(sc, e1);
    vec3 dv = n - sc;
    float sx = dot(dv, e1) / (P(P_STORMSIZE) * 1.9);
    float sy = dot(dv, e2) / (P(P_STORMSIZE) * 1.0);
    float r = sqrt(sx * sx + sy * sy);
    if (r < 1.6) {
      float rot = (1.0 - min(r, 1.0)) * 3.0 - uTime * 0.005;
      float cr = cos(rot), sr = sin(rot);
      vec2 sp = vec2(cr * sx - sr * sy, sr * sx + cr * sy);
      float swirl = fbm(vec3(sp * 2.5, 1.7), 4.0, SEED + 77u);
      float body = 1.0 - smoothstep(0.7, 1.0, r);
      vec3 spotCol = mix(uPal[3], uPal[2], 0.5 + 0.5 * swirl);
      spotCol = mix(spotCol, vec3(0.62, 0.22, 0.12), 0.65);
      col = mix(col, spotCol, body * st);
      // lighter collar around the storm
      col = mix(col, uPal[4], smoothstep(1.0, 1.3, r) * (1.0 - smoothstep(1.3, 1.6, r)) * 0.25 * st);
    }
  }
  // polar hexagon-ish darkening
  float pole = smoothstep(0.86, 0.98, abs(z));
  col = mix(col, col * vec3(0.72, 0.8, 0.95), pole * 0.7);
  s.albedo = col;
  s.hg = vec3(0.0);
  return s;
}

// ---------------------------------------------------------------- opaque-cloud worlds (Venus, Titan haze)
Surf surfVenus(vec3 n, float pix) {
  Surf s;
  s.emis = vec3(0.0); s.ocean = 0.0; s.cloudDensity = 0.0; s.rough = 1.0; s.hg = vec3(0.0);
  float ang = uTime * 0.003;
  vec3 q = vec3(cos(ang) * n.x - sin(ang) * n.y, sin(ang) * n.x + cos(ang) * n.y, n.z);
  vec4 w = fbmd(q * 2.0 + 1.0, octFor(2.0, pix, 6.0), SEED);
  vec3 qq = q * 3.0 + 0.5 * w.yzw;
  float sw = fbm(vec3(qq.xy * 1.0, qq.z * 3.0), octFor(3.0, pix, 8.0), SEED + 5u);
  float uv = smoothstep(-0.3, 0.6, sw + 0.3 * sin(q.z * 8.0 + 2.0 * w.x));
  vec3 col = mix(uPal[3], uPal[0], smoothstep(0.0, 1.0, 0.5 + 0.5 * sw));
  col = mix(col, uPal[2], uv * 0.6);
  col = mix(col, uPal[1], (1.0 - abs(n.z)) * 0.2);
  s.albedo = col;
  return s;
}

Surf surfTitan(vec3 n, float pix) {
  Surf s = surfRocky(n, pix);
  // haze-shrouded: low contrast, orange, faint banding
  float hz = fbm(vec3(n.xy * 1.5, n.z * 6.0), 4.0, SEED + 3u);
  vec3 haze = mix(uPal[0], uPal[2], 0.5 + 0.5 * hz);
  haze = mix(haze, uPal[1], smoothstep(0.55, 0.95, abs(n.z)) * 0.5);
  s.albedo = mix(s.albedo * 0.5, haze, 0.8);
  s.hg *= 0.15;
  return s;
}

// ---------------------------------------------------------------- Earth (textured)
Surf surfEarth(vec3 n, float pix, out float spec) {
  Surf s;
  s.emis = vec3(0.0); s.cloudDensity = 0.0; s.rough = 0.8;
  vec3 day = texSph(uMap, n).rgb;
  spec = texSph(uSpec, n).r;
  s.ocean = smoothstep(0.35, 0.65, spec);
  float oc = octFor(200.0, pix, 10.0);
  // fine procedural detail on land, faded in as pixels shrink below the texel size
  float texel = 1.0 / 2048.0 * 6.2832;
  float fadeIn = smoothstep(texel * 1.0, texel * 0.15, pix);
  vec3 col = day;
  vec3 hg = vec3(0.0);
  if (fadeIn > 0.0) {
    vec4 dn = fbmd(n * 250.0, octFor(250.0, pix, 9.0), SEED + 7u);
    col *= 1.0 + 0.35 * fadeIn * dn.x * (1.0 - s.ocean);
    hg += dn.yzw * 0.004 * fadeIn * (1.0 - s.ocean);
  }
  if (uMicroAmt > 0.001) {
    vec4 mf = microFbm(gHitLocal + uMicroOff, gPixM, SEED + 401u);
    float land = 1.0 - s.ocean;
    col *= 1.0 + 0.5 * uMicroAmt * mf.x * land;
    hg += mf.yzw * uR * 0.55 * uMicroAmt * land;
  }
  vec3 nm = texSph(uNormalTex, n).xyz * 2.0 - 1.0;
  vec3 T = normalize(cross(vec3(0.0, 0.0, 1.0), n));
  vec3 B = cross(n, T);
  hg += -(nm.x * T + nm.y * B) * 0.0 * P(P_RELIEF);
  s.albedo = col;
  s.hg = hg;
  s.ocean *= 1.0;
  return s;
}

float cloudCoverEarth(vec3 n, float pix) {
  vec4 c = texSph(uCloudTex, n);
  float d = c.a * dot(c.rgb, vec3(0.3333));
  float fine = fbm(n * 90.0, octFor(90.0, pix, 6.0), SEED + 200u);
  return clamp(d * (1.0 + 0.35 * fine) - 0.04 * fine, 0.0, 1.0);
}

float cloudCoverProc(vec3 n, float pix, float cover) {
  float ang = uTime * 0.0006;
  vec3 q = vec3(cos(ang) * n.x - sin(ang) * n.y, sin(ang) * n.x + cos(ang) * n.y, n.z);
  vec4 w = fbmd(q * 2.2 + 30.0, octFor(2.2, pix, 5.0), SEED + 300u);
  float c = fbm(q * 3.0 + w.yzw * 0.4 + 12.0, octFor(3.0, pix, 10.0), SEED + 301u);
  float band = 0.5 + 0.5 * cos(q.z * 9.0);
  return smoothstep(0.55 - cover * 0.6 - 0.1 * band, 0.75 - cover * 0.6, 0.5 + 0.5 * c);
}

// ---------------------------------------------------------------- shadows
float sphereShadow(vec3 P0, vec3 L, vec3 C, float r, float lightAng) {
  vec3 pc = C - P0;
  float t = dot(pc, L);
  if (t <= 0.0) return 1.0;
  float d = length(pc - t * L);
  float pen = t * lightAng;
  return smoothstep(r - pen, r + pen, d);
}

float occlusion(vec3 P0, vec3 L, float lightAng) {
  float v = 1.0;
  for (int i = 0; i < 4; i++) {
    if (i >= uOccN) break;
    v *= sphereShadow(P0, L, uOcc[i].xyz, uOcc[i].w, lightAng);
  }
  return v;
}

vec4 ringSample(float rho) {
  float u = (rho - uRingIn) / (uRingOut - uRingIn);
  if (u < 0.0 || u > 1.0) return vec4(0.0);
  return texture(uRingTex, vec2(u, 0.5));
}

// ring-plane shadow from light direction Lb onto point pb (body frame): returns opacity of the ring crossed
float ringShadow(vec3 pb, vec3 Lb) {
  if (uHasRings < 0.5 || abs(Lb.z) < 1e-4) return 0.0;
  float s = -pb.z / Lb.z;
  if (s <= 0.0) return 0.0;
  vec3 q = pb + Lb * s;
  return ringSample(length(q.xy)).a;
}

vec3 tonemapSafe(vec3 c) { if (any(isnan(c)) || any(isinf(c))) return vec3(0.0); return clamp(c, vec3(0.0), vec3(3000.0)); }

void main() {
  vec3 rd = normalize(vDir);
  vec3 dB = uViewToBody * rd;
  vec3 dS = vec3(dB.xy, dB.z * uInvFlat);
  float a = dot(dS, dS);
  float b = dot(dS, uCenterS);

  // --- ground intersection
  float tG = -1.0;
  bool hitG = false;
  {
    float disc = b * b - a * uCs;
    if (disc >= 0.0) {
      float sq = sqrt(disc);
      float den = b + sq;
      if (den > 0.0) {
        float t0 = uCs / den;
        if (t0 > 0.0) { tG = t0; hitG = true; }
      }
    }
  }
  // --- atmosphere shell
  float ta0 = 0.0, ta1 = 0.0;
  bool hitA = false;
  if (uHasAtmo > 0.5) {
    float disc = b * b - a * uCa;
    if (disc >= 0.0) {
      float sq = sqrt(disc);
      float den = b + sq;
      if (den > 0.0) {
        ta1 = den / a;
        ta0 = uCa / den;
        hitA = ta1 > 0.0;
        ta0 = max(ta0, 0.0);
      }
    }
  }
  // --- cloud deck
  float tC = -1.0;
  bool hitC = false;
  if (uHasClouds + uProcClouds > 0.5) {
    float disc = b * b - a * uCc;
    if (disc >= 0.0) {
      float sq = sqrt(disc);
      float den = b + sq;
      if (den > 0.0) {
        float t0 = uCc / den;
        float t1 = den / a;
        if (t0 > 0.0) tC = t0; else if (t1 > 0.0 && !hitG) tC = t1;
        hitC = tC > 0.0 && (!hitG || tC < tG);
      }
    }
  }
  // --- rings
  float tR = -1.0;
  vec4 ringHit = vec4(0.0);
  vec3 ringPos = vec3(0.0);
  if (uHasRings > 0.5 && abs(dB.z) > 1e-7) {
    float t = uCenterB.z / dB.z;
    if (t > 0.0) {
      vec3 pr = dB * t - uCenterB;
      float rho = length(pr.xy);
      ringHit = ringSample(rho);
      if (ringHit.a > 0.002) { tR = t; ringPos = pr; }
    }
  }

  vec3 outCol = vec3(0.0);
  float outA = 0.0;
  float pix = clamp(uPixelScale, 1e-8, 0.4);
  // analytic silhouette coverage (anti-aliased limb)
  float cov = 1.0;
  if (hitG) {
    float c2 = dot(uCenterS, uCenterS);
    float perp2 = max(c2 - b * b / a, 0.0);
    float pw = sqrt(c2) * uPixelScale;
    cov = clamp((uR - sqrt(perp2)) / max(pw, 1e-3) + 0.5, 0.0, 1.0);
  }

  // primary light for atmosphere
  vec3 L0 = uLightDirB[0];
  vec3 L0s = normalize(vec3(L0.xy, L0.z * uInvFlat));
  vec3 lightCol0 = uLightCol[0];

  vec3 skyIn = vec3(0.0);
  vec3 skyT = vec3(1.0);
  float atmoEnd = hitG ? tG : ta1;

  if (hitA) {
    vec3 o = -uCenterS;
    atmoScatter(o, dS, ta0, atmoEnd, L0s, lightCol0, uR, uRa, skyIn, skyT);
  }

  if (hitG) {
    vec3 ps = dS * tG - uCenterS;          // hit position, scaled body frame, relative to centre
    float rl = length(ps);
    vec3 n = ps / max(rl, 1e-3);
    // camera-to-hit offset (precise) is dS*tG; used for micro detail later
    vec3 pb = vec3(ps.xy, ps.z);
    vec3 Vb = -dB;

    float pixSph = min(length(fwidth(n)), 0.5);
    pixSph = max(pixSph, 1e-8);
    gHitLocal = dS * tG;
    gPixM = max(tG * uPixelScale, 1e-3);

    Surf sf;
    float specMap = 0.0;
    if (uStyle == 1) sf = surfEarth(n, pixSph, specMap);
    else if (uStyle == 2) sf = surfEarthLike(n, pixSph);
    else if (uStyle == 3) sf = surfVenus(n, pixSph);
    else if (uStyle == 4) sf = surfGas(n, pixSph);
    else if (uStyle == 6) sf = surfTitan(n, pixSph);
    else sf = surfRocky(n, pixSph);

    // bump-mapped normal
    vec3 hgT = sf.hg - dot(sf.hg, n) * n;
    float reliefK = (uStyle == 1) ? 0.0 : 0.9 * P(P_RELIEF);
    vec3 N = normalize(n - hgT * reliefK);

    vec3 total = vec3(0.0);
    float cav = 1.0 - clamp(length(hgT) * reliefK * 0.35, 0.0, 0.35);
    vec3 albedo = sf.albedo * uAlbedoScale * cav;
    float cloudShadowView = 0.0;
    for (int i = 0; i < 4; i++) {
      if (i >= uNumLights) break;
      vec3 Lb = uLightDirB[i];
      float mu0g = dot(n, Lb);
      float mu0 = dot(N, Lb);
      float mu = max(dot(N, Vb), 0.0);
      vec3 lc = uLightCol[i];
      // atmospheric extinction of the incoming light
      vec3 Tsun = vec3(1.0);
      if (hitA || uHasAtmo > 0.5) {
        vec3 Ls = normalize(vec3(Lb.xy, Lb.z * uInvFlat));
        Tsun = sunTransmittance(ps, Ls, uR, uRa);
      }
      float vis = occlusion(pb, Lb, uLightAng[i]);
      if (uHasRings > 0.5) vis *= 1.0 - 0.92 * ringShadow(pb, Lb);
      // procedural clouds cast shadows
      if (uHasClouds > 0.5) {
        vec3 cn = normalize(n + Lb * 0.0022 * (1.0 / max(mu0g, 0.2)) * 0.0);
        vis *= 1.0 - 0.55 * cloudCoverEarth(normalize(n - (Lb - dot(Lb, n) * n) * 0.006), pixSph);
      }
      float diff;
      if (uAirless > 0.5) {
        // Lommel–Seeliger with a Lambert component
        float m0 = max(mu0, 0.0);
        diff = (0.6 * m0 / (m0 + mu + 0.02) + 0.4 * m0) * 1.6;
      } else {
        diff = max(mu0 + 0.14, 0.0) / 1.14 * 1.05;
      }
      diff *= (uHasAtmo > 0.5 ? smoothstep(-0.14, 0.14, mu0g) : smoothstep(-0.03, 0.06, mu0g)) * vis;
      total += albedo * lc * Tsun * diff;
      // ocean glint
      if (sf.ocean > 0.01) {
        vec3 H = normalize(Lb + Vb);
        float g = pow(max(dot(N, H), 0.0), 220.0) * (0.25 + 0.75 * pow(1.0 - mu, 3.0));
        total += lc * Tsun * g * sf.ocean * 1.6 * vis * smoothstep(0.0, 0.1, mu0g);
      }
    }
    // dim ambient (starlight / earthshine) and scattered skylight on the ground
    total += albedo * 0.0006;
    if (uHasAtmo > 0.5) {
      vec3 Ls0 = L0s;
      vec3 Tsun0 = sunTransmittance(ps, Ls0, uR, uRa);
      float up = max(dot(n, L0) * 0.5 + 0.5, 0.0);
      total += albedo * lightCol0 * Tsun0 * normalize(uRayleigh + vec3(1e-9)) * 0.22 * up * up * clamp(uPixelScale * 0.0 + 1.0, 0.0, 1.0) * (0.4 + 0.6 * smoothstep(-0.2, 0.3, dot(n, L0)));
    }
    total += sf.emis;

    // city lights on Earth's night side
    if (uStyle == 1) {
      vec3 lights = texSph(uNight, n).rgb;
      float nightMask = 1.0 - smoothstep(-0.12, 0.05, dot(n, uLightDirB[0]));
      total += lights * vec3(1.0, 0.72, 0.4) * 2.2 * nightMask * (1.0 - sf.ocean * 0.0);
    }

    vec3 surfCol = total * skyT;
    outCol = surfCol + skyIn;
    outA = 1.0;
    if (cov < 0.999) {
      // blend toward the sky seen just past the limb
      vec3 si2 = vec3(0.0), st2 = vec3(1.0);
      if (uHasAtmo > 0.5) {
        float tb = max(ta0, 0.0);
        atmoScatter(-uCenterS, dS, tb, ta1, L0s, lightCol0, uR, uRa, si2, st2);
      }
      float a2 = uHasAtmo > 0.5 ? 1.0 - dot(st2, vec3(0.3333)) : 0.0;
      outCol = mix(si2, outCol, cov);
      outA = mix(a2, 1.0, cov);
    }
  } else if (hitA) {
    float aT = 1.0 - dot(skyT, vec3(0.3333));
    outCol = skyIn;
    outA = clamp(aT, 0.0, 1.0);
  }

  // --- cloud layer
  if (hitC) {
    vec3 pc = dS * tC - uCenterS;
    vec3 nc = normalize(pc);
    float pixC = max(min(length(fwidth(nc)), 0.5), 1e-8);
    float dens = (uHasClouds > 0.5) ? cloudCoverEarth(nc, pixC) : cloudCoverProc(nc, pixC, uProcClouds - 1.0 + 0.5);
    if (dens > 0.003) {
      vec3 cc = vec3(0.0);
      for (int i = 0; i < 4; i++) {
        if (i >= uNumLights) break;
        vec3 Lb = uLightDirB[i];
        float m0 = dot(nc, Lb);
        vec3 Ls = normalize(vec3(Lb.xy, Lb.z * uInvFlat));
        vec3 Tsun = (uHasAtmo > 0.5) ? sunTransmittance(pc, Ls, uR, uRa) : vec3(1.0);
        float vis = occlusion(pc, Lb, uLightAng[i]);
        cc += uLightCol[i] * Tsun * (max(m0, 0.0) * 0.95 + 0.03) * vis * smoothstep(-0.03, 0.08, m0);
      }
      cc *= vec3(1.0) * (uHasClouds > 0.5 ? 0.95 : 0.9);
      // cloud in front of ground / sky: blend using view transmittance approximated by sky transmittance
      float da = dens * (uHasClouds > 0.5 ? 1.0 : 0.95);
      vec3 cloudFinal = cc * skyT + skyIn * 0.0;
      outCol = mix(outCol, cloudFinal + skyIn, da);
      outA = max(outA, da);
    }
  }

  // --- rings
  if (tR > 0.0) {
    bool front = !hitG || tR < tG;
    bool inAtmoFront = false;
    // ring lighting
    vec3 rc = vec3(0.0);
    for (int i = 0; i < 4; i++) {
      if (i >= uNumLights) break;
      vec3 Lb = uLightDirB[i];
      float sideView = sign(-uCenterB.z + 1e-9);      // camera side of ring plane (z of camera in body frame)
      float sideSun = sign(Lb.z + 1e-9);
      float m0 = max(abs(Lb.z), 0.04);
      float tau = -log(max(1.0 - ringHit.a, 0.02));
      float sameSide = (sideView * sideSun > 0.0) ? 1.0 : 0.0;
      float lit = sameSide > 0.5 ? (0.55 + 0.45 * m0) : exp(-tau / m0) * 0.9 + 0.08;
      // planet shadow on the rings
      vec3 pp = ringPos;
      float sh = 1.0;
      {
        float bb = dot(pp, Lb);
        float dmin = sqrt(max(dot(pp, pp) - bb * bb, 0.0));
        if (bb < 0.0) sh = smoothstep(uR * 0.98, uR * 1.03, dmin);
      }
      sh *= occlusion(pp, Lb, uLightAng[i]);
      rc += ringHit.rgb * uRingCol * uLightCol[i] * lit * sh * 1.7;
    }
    float ra = ringHit.a;
    if (front) {
      outCol = rc * ra + outCol * (1.0 - ra);
      outA = ra + outA * (1.0 - ra);
    } else {
      // ring behind the planet's atmosphere limb (visible only where the planet is not opaque)
      float back = (1.0 - outA);
      outCol += rc * ra * back * dot(skyT, vec3(0.3333));
      outA += ra * back;
    }
  }

  gl_FragColor = vec4(tonemapSafe(outCol) * uExposure, clamp(outA, 0.0, 1.0));
}
`;
