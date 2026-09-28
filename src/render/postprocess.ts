import * as THREE from 'three';

const fsVert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const downFrag = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uFirst;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
vec3 prefilter(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * contrib;
}
void main() {
  vec3 a = texture2D(tSrc, vUv + uTexel * vec2(-1.0, -1.0)).rgb;
  vec3 b = texture2D(tSrc, vUv + uTexel * vec2( 1.0, -1.0)).rgb;
  vec3 c = texture2D(tSrc, vUv + uTexel * vec2(-1.0,  1.0)).rgb;
  vec3 d = texture2D(tSrc, vUv + uTexel * vec2( 1.0,  1.0)).rgb;
  vec3 e = texture2D(tSrc, vUv).rgb;
  vec3 col;
  if (uFirst > 0.5) {
    a = prefilter(a); b = prefilter(b); c = prefilter(c); d = prefilter(d); e = prefilter(e);
    // Karis average suppresses fireflies from sub-pixel bright stars
    float wa = 1.0 / (1.0 + dot(a, vec3(0.2126, 0.7152, 0.0722)));
    float wb = 1.0 / (1.0 + dot(b, vec3(0.2126, 0.7152, 0.0722)));
    float wc = 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)));
    float wd = 1.0 / (1.0 + dot(d, vec3(0.2126, 0.7152, 0.0722)));
    float we = 1.0 / (1.0 + dot(e, vec3(0.2126, 0.7152, 0.0722)));
    col = (a * wa + b * wb + c * wc + d * wd + e * we * 2.0) / (wa + wb + wc + wd + 2.0 * we);
  } else {
    col = (a + b + c + d) * 0.15 + e * 0.4;
  }
  if (any(isnan(col)) || any(isinf(col))) col = vec3(0.0);
  gl_FragColor = vec4(min(col, vec3(60000.0)), 1.0);
}
`;

const upFrag = /* glsl */ `
precision highp float;
uniform sampler2D tSrc;
uniform vec2 uTexel;
uniform float uRadius;
varying vec2 vUv;
void main() {
  vec2 o = uTexel * uRadius;
  vec3 s = texture2D(tSrc, vUv).rgb * 4.0;
  s += texture2D(tSrc, vUv + vec2(-o.x, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2( o.x, 0.0)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0, -o.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(0.0,  o.y)).rgb * 2.0;
  s += texture2D(tSrc, vUv + vec2(-o.x, -o.y)).rgb;
  s += texture2D(tSrc, vUv + vec2( o.x, -o.y)).rgb;
  s += texture2D(tSrc, vUv + vec2(-o.x,  o.y)).rgb;
  s += texture2D(tSrc, vUv + vec2( o.x,  o.y)).rgb;
  gl_FragColor = vec4(s / 16.0, 1.0);
}
`;

const compFrag = /* glsl */ `
precision highp float;
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uExposure;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uAberration;
uniform float uSaturation;
uniform vec2 uRes;
varying vec2 vUv;

vec3 aces(vec3 x) {
  // Narkowicz ACES fit
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
void main() {
  vec2 uv = vUv;
  vec2 cc = uv - 0.5;
  float r2 = dot(cc, cc);
  vec2 ab = cc * r2 * uAberration;
  vec3 col;
  col.r = texture2D(tScene, uv + ab).r;
  col.g = texture2D(tScene, uv).g;
  col.b = texture2D(tScene, uv - ab).b;
  vec3 bl = texture2D(tBloom, uv).rgb;
  col += bl * uBloom;
  col *= uExposure;
  float lum0 = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(lum0), col, uSaturation);
  col = aces(col * 1.08);
  col = mix(col, col * col * (3.0 - 2.0 * col), 0.22);
  col *= 1.0 - uVignette * smoothstep(0.15, 0.85, r2 * 2.2);
  col = pow(col, vec3(1.0 / 2.2));
  // dithering to hide banding in dark gradients
  float n = hash12(gl_FragCoord.xy + fract(uTime) * 61.0) - 0.5;
  col += n / 255.0 * (1.0 + uGrain * 10.0);
  gl_FragColor = vec4(col, 1.0);
}
`;

/** HDR post chain: dual-filter bloom + ACES tone-mapping + vignette/aberration/dither. */
export class PostProcessor {
  sceneRT: THREE.WebGLRenderTarget;
  private mips: THREE.WebGLRenderTarget[] = [];
  private quad: THREE.Mesh;
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private scene = new THREE.Scene();
  private down: THREE.ShaderMaterial;
  private up: THREE.ShaderMaterial;
  private comp: THREE.ShaderMaterial;
  private levels = 7;
  bloomStrength = 0.7;
  bloomRadius = 1.0;
  threshold = 0.9;
  vignette = 0.28;
  grain = 0.0;
  aberration = 0.0025;
  exposure = 1;

  constructor(private renderer: THREE.WebGLRenderer) {
    const opts = { type: THREE.HalfFloatType, format: THREE.RGBAFormat, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false };
    this.sceneRT = new THREE.WebGLRenderTarget(4, 4, { ...opts, depthBuffer: true });
    for (let i = 0; i < this.levels; i++) this.mips.push(new THREE.WebGLRenderTarget(4, 4, opts));
    const mk = (frag: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: fsVert, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false, blending: THREE.NoBlending });
    this.down = mk(downFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uFirst: { value: 0 }, uThreshold: { value: 0.9 }, uKnee: { value: 0.5 } });
    this.up = mk(upFrag, { tSrc: { value: null }, uTexel: { value: new THREE.Vector2() }, uRadius: { value: 1 } });
    this.comp = mk(compFrag, {
      tScene: { value: null }, tBloom: { value: null }, uBloom: { value: 0.7 }, uExposure: { value: 1 }, uTime: { value: 0 },
      uVignette: { value: 0.28 }, uGrain: { value: 0 }, uAberration: { value: 0.0025 }, uSaturation: { value: 1.22 }, uRes: { value: new THREE.Vector2() },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.down);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  resize(w: number, h: number) {
    this.sceneRT.setSize(w, h);
    let mw = Math.max(2, w >> 1), mh = Math.max(2, h >> 1);
    for (const m of this.mips) {
      m.setSize(mw, mh);
      mw = Math.max(2, mw >> 1); mh = Math.max(2, mh >> 1);
    }
  }

  private draw(mat: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = mat;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.cam);
  }

  render(time: number, toScreen = true) {
    const r = this.renderer;
    const prevAuto = r.autoClear;
    r.autoClear = false;
    // downsample chain
    let src: THREE.WebGLRenderTarget = this.sceneRT;
    if (this.bloomStrength > 0.001) {
      for (let i = 0; i < this.levels; i++) {
        const dst = this.mips[i];
        const u = this.down.uniforms;
        u.tSrc.value = src.texture;
        u.uTexel.value.set(1 / src.width, 1 / src.height);
        u.uFirst.value = i === 0 ? 1 : 0;
        u.uThreshold.value = this.threshold;
        this.draw(this.down, dst);
        src = dst;
      }
      // upsample with additive accumulation (each level = its own blur + coarser result)
      for (let i = this.levels - 2; i >= 0; i--) {
        const coarse = this.mips[i + 1];
        const dst = this.mips[i];
        // blend coarse into dst additively
        const u = this.up.uniforms;
        u.tSrc.value = coarse.texture;
        u.uTexel.value.set(1 / coarse.width, 1 / coarse.height);
        u.uRadius.value = this.bloomRadius;
        this.up.blending = THREE.CustomBlending;
        this.up.blendEquation = THREE.AddEquation;
        this.up.blendSrc = THREE.OneFactor;
        this.up.blendDst = THREE.OneFactor;
        this.up.transparent = true;
        this.draw(this.up, dst);
      }
    }
    const cu = this.comp.uniforms;
    cu.tScene.value = this.sceneRT.texture;
    cu.tBloom.value = this.mips[0].texture;
    cu.uBloom.value = this.bloomStrength > 0.001 ? this.bloomStrength : 0;
    cu.uExposure.value = this.exposure;
    cu.uTime.value = time;
    cu.uVignette.value = this.vignette;
    cu.uGrain.value = this.grain;
    cu.uAberration.value = this.aberration;
    this.draw(this.comp, toScreen ? null : this.sceneRT);
    r.autoClear = prevAuto;
  }
}
