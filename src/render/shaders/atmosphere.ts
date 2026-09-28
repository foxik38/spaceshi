/** Single-scattering atmosphere (Rayleigh + Mie + absorption), ray-marched analytically against the planet sphere. */
export const atmosphereGLSL = /* glsl */ `
uniform vec3 uRayleigh;   // 1/m at surface
uniform float uMieK;      // 1/m at surface
uniform float uMieG;
uniform vec3 uMieCol;
uniform vec3 uAbsorb;     // 1/m
uniform float uHR;        // Rayleigh scale height (m)
uniform float uHM;        // Mie scale height (m)
uniform float uOzone;     // 1 = ozone-layer shaped absorption
uniform float uAtmoGain;

const float PI = 3.14159265359;

float phaseR(float mu) { return 3.0 / (16.0 * PI) * (1.0 + mu * mu); }
float phaseM(float mu, float g) {
  float g2 = g * g;
  return 3.0 / (8.0 * PI) * ((1.0 - g2) * (1.0 + mu * mu)) / ((2.0 + g2) * pow(max(1.0 + g2 - 2.0 * g * mu, 1e-3), 1.5));
}

// Densities at altitude h: x=rayleigh, y=mie, z=absorber
vec3 atmoDensity(float h) {
  float dR = exp(-h / uHR);
  float dM = exp(-h / uHM);
  float tent = max(0.0, 1.0 - abs(h - 25000.0) / 15000.0);
  float dA = mix(dR, tent, uOzone);
  return vec3(dR, dM, dA);
}

vec3 extinctionAt(vec3 dens) {
  return uRayleigh * dens.x + vec3(uMieK * 1.11) * dens.y + uAbsorb * dens.z;
}

// Optical depth from point p (relative to planet centre, scaled space) toward direction L, out to the atmosphere top.
// Returns vec3(-1) style large value if the ray hits the planet.
vec3 lightOpticalDepth(vec3 p, vec3 L, float R, float Ra) {
  float b = dot(p, L);
  float c = dot(p, p) - Ra * Ra;
  float disc = b * b - c;
  float tExit = -b + sqrt(max(disc, 0.0));
  // planet occlusion
  float cg = dot(p, p) - R * R;
  float dg = b * b - cg;
  float shadow = 0.0;
  if (dg > 0.0 && b < 0.0) {
    // closest approach altitude relative to planet radius for a soft terminator
    float dmin = sqrt(max(dot(p, p) - b * b, 0.0));
    shadow = 1.0 - smoothstep(R * 0.998, R * 1.004, dmin);
  }
  const int NS = 5;
  float ds = tExit / float(NS);
  vec3 od = vec3(0.0);
  for (int i = 0; i < NS; i++) {
    vec3 q = p + L * ((float(i) + 0.5) * ds);
    float h = max(length(q) - R, 0.0);
    od += extinctionAt(atmoDensity(h)) * ds;
  }
  return od + shadow * 1e3;
}

// Marches the view ray through the atmosphere between t0 and t1 (o is ray origin relative to centre in scaled space).
void atmoScatter(vec3 o, vec3 d, float t0, float t1, vec3 L, vec3 lightCol, float R, float Ra,
                 out vec3 inscatter, out vec3 transmittance) {
  float len = t1 - t0;
  inscatter = vec3(0.0);
  transmittance = vec3(1.0);
  if (len <= 0.0) return;
  const int NV = 14;
  float ds = len / float(NV);
  float mu = dot(normalize(d), L);
  float pr = phaseR(mu), pm = phaseM(mu, uMieG);
  vec3 od = vec3(0.0);
  vec3 sum = vec3(0.0);
  for (int i = 0; i < NV; i++) {
    float t = t0 + (float(i) + 0.5) * ds;
    vec3 p = o + d * t;
    float h = max(length(p) - R, 0.0);
    vec3 dens = atmoDensity(h);
    vec3 ext = extinctionAt(dens);
    od += ext * ds;
    vec3 lod = lightOpticalDepth(p, L, R, Ra);
    vec3 Tl = exp(-(od + lod));
    sum += Tl * (uRayleigh * dens.x * pr + uMieK * dens.y * pm * uMieCol) * ds;
  }
  inscatter = sum * lightCol * uAtmoGain;
  transmittance = exp(-od);
}

// Sunlight transmittance to a surface point (scaled-space position relative to centre).
vec3 sunTransmittance(vec3 p, vec3 L, float R, float Ra) {
  return exp(-lightOpticalDepth(p, L, R, Ra));
}
`;
