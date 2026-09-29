import { noiseGLSL } from './noise';

export const starFragment = /* glsl */ `
precision highp float;
precision highp int;
varying vec3 vDir;

uniform mat3 uViewToBody;
uniform vec3 uCenterB;
uniform float uR;
uniform float uCs;
uniform vec3 uColor;        // linear star colour (max component 1)
uniform float uDisc;        // disc radiance multiplier
uniform float uTime;
uniform float uSeed;
uniform float uExposure;
uniform float uGran;        // granulation strength 0..1
uniform float uSpots;
uniform float uCorona;      // corona strength
uniform float uPixelScale;
uniform float uLimb;        // limb darkening coefficient

${noiseGLSL}
#define SEED uint(uSeed)

void main() {
  vec3 rd = normalize(vDir);
  vec3 d = uViewToBody * rd;
  float b = dot(d, uCenterB);
  float disc = b * b - uCs;
  vec3 col = vec3(0.0);
  float alpha = 0.0;
  float dist = length(uCenterB);

  // impact parameter of the ray relative to the sphere radius
  float perp2 = max(dot(uCenterB, uCenterB) - b * b, 0.0);
  float x = sqrt(perp2) / uR;

  if (disc >= 0.0 && b > 0.0) {
    float t = uCs / (b + sqrt(disc));
    vec3 p = d * t - uCenterB;
    vec3 n = p / uR;
    float mu = clamp(dot(n, -d), 0.0, 1.0);
    float pix = clamp(length(fwidth(n)), 1e-7, 0.5);
    // granulation: two scales of convective cells drifting slowly
    float gscale = 60.0;
    vec4 g1 = fbmd(n * gscale + vec3(uTime * 0.4), clamp(log2(1.0 / (pix * gscale)) - 0.85, 0.0, 9.0), SEED);
    float gran = 0.5 + 0.5 * g1.x;
    // individual ~1000 km granules with dark intergranular lanes (only resolved once a pixel is smaller than a granule)
    float lanes = 1.0;
    float lo = clamp(log2(1.0 / (pix * 700.0)) - 0.85, 0.0, 4.0);
    if (lo > 0.0) {
      vec4 gc = ridged(n * 700.0 + vec3(uTime * 0.6), lo, SEED + 15u);
      lanes = 1.0 - 0.32 * smoothstep(0.5, 0.85, gc.x) * uGran;
    }
    vec4 g2 = fbmd(n * 9.0 + vec3(0.0, uTime * 0.1, 0.0), 5.0, SEED + 4u);
    float supergran = 0.5 + 0.5 * g2.x;
    // sunspots: dark umbra inside a fibrous, lighter penumbra
    float sv = 0.5 + 0.5 * fbm(n * 3.2 + 7.0, 4.0, SEED + 9u);
    float latMask = smoothstep(0.75, 0.15, abs(n.z)) * uSpots;
    float fib = 0.8 + 0.2 * fbm(n * 55.0 + 2.0, clamp(log2(1.0 / (pix * 55.0)) - 0.85, 0.0, 6.0), SEED + 19u);
    float spots = latMask * (0.42 * smoothstep(0.60, 0.70, sv) * fib + 0.58 * smoothstep(0.70, 0.79, sv));
    float limb = 1.0 - uLimb * (1.0 - mu) - 0.15 * (1.0 - mu) * (1.0 - mu);
    limb = max(limb, 0.05);
    float lum = limb * (1.0 - uGran * 0.28 * (1.0 - gran)) * (0.92 + 0.16 * supergran) * lanes * (1.0 - 0.7 * spots);
    vec3 tint = mix(uColor, uColor * vec3(1.0, 0.86, 0.7), 1.0 - mu);   // limb reddening
    // cooler (darker) material glows orange, hot cores stay white: lanes, spots and the limb gain colour contrast
    tint = mix(tint * vec3(1.0, 0.72, 0.42), tint, smoothstep(0.35, 0.95, lum));
    col = tint * lum * uDisc;
    // faculae near the limb
    col += uColor * uDisc * 0.12 * (1.0 - mu) * smoothstep(0.5, 0.9, gran) * uGran;
    alpha = 1.0;
  } else {
    // corona / chromosphere glow outside the disc
    float xr = max(x, 1.0);
    float ang = atan(dot(d, vec3(0.0, 0.0, 1.0)), dot(d, vec3(1.0, 0.0, 0.0)));
    float streamers = 0.75 + 0.25 * fbm(vec3(cos(ang * 2.0), sin(ang * 2.0), 1.0) * 2.0 + uTime * 0.08, 3.0, SEED + 12u);
    float chromo = exp(-(xr - 1.0) * 18.0) * 0.9;
    float inner = exp(-(xr - 1.0) * 2.2) * 0.55;
    float outer = pow(1.0 / xr, 2.3) * 0.5;
    float g = (chromo * vec3(1.0, 0.45, 0.4).x + (inner + outer) * streamers) * uCorona;
    col = uColor * g * uDisc * 0.5;
    alpha = 0.0;
  }
  vec3 o = col * uExposure;
  if (any(isnan(o)) || any(isinf(o))) o = vec3(0.0);
  gl_FragColor = vec4(clamp(o, vec3(0.0), vec3(3000.0)), alpha);
}
`;
