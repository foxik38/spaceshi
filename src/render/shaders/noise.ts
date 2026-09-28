/** GLSL noise library shared by planet, star and small-body shaders (GLSL ES 3.00). */
export const noiseGLSL = /* glsl */ `
uint ihash(uint x) {
  x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
  return x;
}
uint ihash3(ivec3 p, uint seed) {
  return ihash(uint(p.x) * 73856093u ^ uint(p.y) * 19349663u ^ uint(p.z) * 83492791u ^ seed * 2654435761u);
}
float hash1(ivec3 p, uint seed) { return float(ihash3(p, seed) & 0xffffffu) / 16777216.0; }
vec3 hash3v(ivec3 p, uint seed) {
  uint h = ihash3(p, seed);
  return vec3(float(h & 1023u), float((h >> 10) & 1023u), float((h >> 20) & 1023u)) / 1023.0;
}

// Value noise with analytic gradient (Inigo Quilez). Returns (value in [-1,1], d/dx, d/dy, d/dz).
vec4 noised(vec3 x, uint seed) {
  vec3 pf = floor(x);
  ivec3 p = ivec3(pf);
  vec3 w = x - pf;
  vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  float a = hash1(p, seed);
  float b = hash1(p + ivec3(1, 0, 0), seed);
  float c = hash1(p + ivec3(0, 1, 0), seed);
  float d = hash1(p + ivec3(1, 1, 0), seed);
  float e = hash1(p + ivec3(0, 0, 1), seed);
  float f = hash1(p + ivec3(1, 0, 1), seed);
  float g = hash1(p + ivec3(0, 1, 1), seed);
  float h = hash1(p + ivec3(1, 1, 1), seed);
  float k0 = a, k1 = b - a, k2 = c - a, k3 = e - a;
  float k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f;
  float k7 = -a + b + c - d + e - f - g + h;
  return vec4(
    -1.0 + 2.0 * (k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z),
    2.0 * du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                    k2 + k4 * u.x + k5 * u.z + k7 * u.z * u.x,
                    k3 + k5 * u.y + k6 * u.x + k7 * u.x * u.y));
}

// Periodic variant: lattice wraps every 'per' cells (per must be a power of two).
vec4 noisedP(vec3 x, int per, uint seed) {
  vec3 pf = floor(x);
  ivec3 p = ivec3(pf);
  vec3 w = x - pf;
  vec3 u = w * w * w * (w * (w * 6.0 - 15.0) + 10.0);
  vec3 du = 30.0 * w * w * (w * (w - 2.0) + 1.0);
  int m = per - 1;
  ivec3 p0 = p & ivec3(m), p1 = (p + 1) & ivec3(m);
  float a = hash1(ivec3(p0.x, p0.y, p0.z), seed);
  float b = hash1(ivec3(p1.x, p0.y, p0.z), seed);
  float c = hash1(ivec3(p0.x, p1.y, p0.z), seed);
  float d = hash1(ivec3(p1.x, p1.y, p0.z), seed);
  float e = hash1(ivec3(p0.x, p0.y, p1.z), seed);
  float f = hash1(ivec3(p1.x, p0.y, p1.z), seed);
  float g = hash1(ivec3(p0.x, p1.y, p1.z), seed);
  float h = hash1(ivec3(p1.x, p1.y, p1.z), seed);
  float k0 = a, k1 = b - a, k2 = c - a, k3 = e - a;
  float k4 = a - b - c + d, k5 = a - c - e + g, k6 = a - b - e + f;
  float k7 = -a + b + c - d + e - f - g + h;
  return vec4(
    -1.0 + 2.0 * (k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y + k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z),
    2.0 * du * vec3(k1 + k4 * u.y + k6 * u.z + k7 * u.y * u.z,
                    k2 + k4 * u.x + k5 * u.z + k7 * u.z * u.x,
                    k3 + k5 * u.y + k6 * u.x + k7 * u.x * u.y));
}

const mat3 ROT = mat3(0.00, 0.80, 0.60, -0.80, 0.36, -0.48, -0.60, -0.48, 0.64);

// Fractal Brownian motion with analytic gradient. 'octs' may be fractional: the last octave fades in.
vec4 fbmd(vec3 p, float octs, uint seed) {
  float a = 1.0, tot = 0.0;
  vec4 s = vec4(0.0);
  mat3 m = mat3(1.0);
  for (int i = 0; i < 16; i++) {
    float fi = float(i);
    if (fi >= octs) break;
    float fade = clamp(octs - fi, 0.0, 1.0);
    vec4 n = noised(m * p + vec3(fi * 17.3, fi * 5.1, fi * 9.7), seed + uint(i));
    s.x += a * fade * n.x;
    s.yzw += a * fade * (transpose(m) * n.yzw);
    tot += a * fade;
    m = ROT * m * 2.03;
    a *= 0.5;
  }
  return s * 0.5; // fixed normalisation so that fading out fine octaves really removes their energy
}

float fbm(vec3 p, float octs, uint seed) { return fbmd(p, octs, seed).x; }

// Anisotropy-preserving fBm (no per-octave rotation): for stretched domains such as planetary cloud bands.
float fbmA(vec3 p, float octs, uint seed) {
  float a = 1.0, s = 0.0;
  for (int i = 0; i < 10; i++) {
    float fi = float(i);
    if (fi >= octs) break;
    float fade = clamp(octs - fi, 0.0, 1.0);
    s += a * fade * noised(p + vec3(fi * 17.3, fi * 5.1, fi * 9.7), seed + uint(i)).x;
    p *= 2.03;
    a *= 0.5;
  }
  return s * 0.5;
}

// Ridged multifractal (sharp mountain crests). Returns (height 0..1, gradient).
vec4 ridged(vec3 p, float octs, uint seed) {
  float a = 0.5, tot = 0.0;
  vec4 s = vec4(0.0);
  mat3 m = mat3(1.0);
  for (int i = 0; i < 12; i++) {
    float fi = float(i);
    if (fi >= octs) break;
    float fade = clamp(octs - fi, 0.0, 1.0);
    vec4 n = noised(m * p + vec3(fi * 11.3, fi * 3.7, fi * 7.1), seed + 31u + uint(i));
    float r = 1.0 - abs(n.x);
    vec3 g = -sign(n.x) * n.yzw;
    s.x += a * fade * r * r;
    s.yzw += a * fade * 2.0 * r * (transpose(m) * g);
    tot += a * fade;
    m = ROT * m * 2.1;
    a *= 0.5;
  }
  return s * 1.0;
}

// Layered craters: single jittered crater per cell; returns (height, gradient) in units of p.
// 'density' 0..1, 'scale0' base cells across unit length, 'layers' count, lod-limited by 'pix' (footprint).
vec4 craters(vec3 p, float scale0, int layers, float density, float pix, uint seed, out float bright, out float bowl) {
  vec4 res = vec4(0.0);
  bright = 0.0; bowl = 0.0;
  float sc = scale0;
  mat3 m = mat3(1.0);
  for (int i = 0; i < 9; i++) {
    if (i >= layers) break;
    float cellPix = 1.0 / sc;
    if (cellPix < pix * 2.5) break; // sub-pixel: skip
    float fade = clamp((cellPix / pix - 2.5) / 3.0, 0.0, 1.0);
    vec3 q = m * p * sc;
    vec3 cf = floor(q);
    ivec3 cell = ivec3(cf);
    vec3 h = hash3v(cell, seed + uint(i) * 101u);
    float present = hash1(cell, seed + 7u + uint(i) * 13u);
    if (present < density) {
      vec3 center = cf + 0.2 + 0.6 * h;
      float r = mix(0.18, 0.34, hash1(cell, seed + 99u + uint(i)));
      r = r * r * 3.2 + 0.08;
      vec3 dv = q - center;
      float d = length(dv);
      float x = d / r;
      if (x < 1.6) {
        // bowl + raised rim + ejecta blanket falloff
        float bowl = -(1.0 - x * x);
        float rim = exp(-((x - 1.0) * 5.0) * ((x - 1.0) * 5.0)) * 0.55;
        float hgt, dh;
        if (x < 1.0) { hgt = bowl * 0.9 + rim; dh = 2.0 * x * 0.9 + rim * (-2.0) * 5.0 * 5.0 * (x - 1.0); }
        else { hgt = rim * 1.0 * (1.0 - smoothstep(1.0, 1.6, x)) ; dh = -2.0 * 25.0 * (x - 1.0) * rim; }
        // constant depth/diameter ratio: height scales as 1/sc, so the slope wrt p is scale-independent
        float amp = r * 0.35 * fade;
        res.x += hgt * amp / sc;
        bright += rim * fade * (x > 0.85 ? 1.0 : 0.0) * (1.0 - smoothstep(1.0, 1.6, x)) * 1.6;
        bowl = max(bowl, (x < 1.0 ? (1.0 - x * x) : 0.0) * fade);
        vec3 dir = dv / max(d, 1e-4);
        res.yzw += transpose(m) * (dir * (dh / r) * amp);
      }
    }
    m = ROT * m;
    sc *= 2.13;
  }
  return res;
}

float remap01(float x, float a, float b) { return clamp((x - a) / (b - a), 0.0, 1.0); }
`;
