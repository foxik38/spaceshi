import * as THREE from 'three';
export interface StarLike { count: number; nNear: number; pos: Float32Array; absMag: Float32Array; color: Float32Array; vel: Float32Array }
import { YEAR, LY } from '../core/constants';
import type { FrameContext } from './context';

const vert = /* glsl */ `
attribute float aAbsMag;
attribute vec3 aColor;
attribute vec3 aVel;
uniform vec3 uCamLy;
uniform float uYears;
uniform float uMagLimit;
uniform float uBrightness;
uniform float uSizeScale;
uniform float uGlare;
uniform float uPixelRatio;
uniform float uMinDistLy;
uniform int uHide[4];
varying vec3 vColor;
varying float vI;
void main() {
  vec3 rel = position + aVel * uYears - uCamLy;
  float distLy = length(rel);
  bool hidden = false;
  for (int i = 0; i < 4; i++) { if (uHide[i] == gl_VertexID) hidden = true; }
  if (distLy < uMinDistLy || hidden) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vColor = vec3(0.0); vI = 0.0; return; }
  float distPc = distLy / 3.26156;
  float m = aAbsMag + 5.0 * log2(distPc / 10.0) * 0.30103;
  float I = min(pow(10.0, -0.4 * (m - uMagLimit)) * uBrightness * uGlare, 1500.0);
  vI = 0.55 * sqrt(I);
  vColor = aColor;
  vec4 p = projectionMatrix * viewMatrix * vec4(rel / distLy * 100.0, 1.0);
  p.z = 0.0;
  gl_Position = p;
  float size = uSizeScale * (1.5 + 0.9 * log2(1.0 + I) * 0.5);
  gl_PointSize = min(size, 26.0) * uPixelRatio;
}
`;

const frag = /* glsl */ `
precision highp float;
varying vec3 vColor;
varying float vI;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float core = exp(-r2 * 5.5);
  float halo = exp(-r2 * 1.6) * 0.06;
  float v = vI * (core + halo);
  gl_FragColor = vec4(vColor * v, v);
}
`;

/** All catalogue stars as GPU points; brightness is computed from real distance and absolute magnitude. */
export class StarField {
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  scene = new THREE.Scene();

  constructor(public catalog: StarLike) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(catalog.pos, 3));
    g.setAttribute('aAbsMag', new THREE.BufferAttribute(catalog.absMag, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(catalog.color, 3));
    const vel = new Float32Array(catalog.count * 3);
    if (catalog.nNear > 0) vel.set(catalog.vel.subarray(0, catalog.nNear * 3));
    g.setAttribute('aVel', new THREE.BufferAttribute(vel, 3));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uCamLy: { value: new THREE.Vector3() }, uYears: { value: 0 }, uMagLimit: { value: 7.2 }, uBrightness: { value: 1 },
        uSizeScale: { value: 1 }, uGlare: { value: 1 }, uPixelRatio: { value: 1 }, uMinDistLy: { value: 1e-7 },
        uHide: { value: [-1, -1, -1, -1] },
      },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  update(ctx: FrameContext, o: { brightness: number; glare: number; pixelRatio: number; hide: number[] }) {
    const u = this.material.uniforms;
    u.uCamLy.value.copy(ctx.camPos).multiplyScalar(1 / LY);
    u.uYears.value = ctx.time / YEAR;
    u.uBrightness.value = o.brightness;
    u.uGlare.value = o.glare;
    u.uPixelRatio.value = o.pixelRatio;
    const h = u.uHide.value as number[];
    for (let i = 0; i < 4; i++) h[i] = o.hide[i] ?? -1;
  }
}
