import * as THREE from 'three';
import { AU, LY, OBLIQUITY } from '../core/constants';
import type { FrameContext } from './context';
import { ECLIPTIC_TO_ICRS } from '../sim/kepler';

const skyLineVert = /* glsl */ `
uniform vec3 uCamLy;
varying float vA;
attribute float aFade;
void main() {
  vec3 rel = position - uCamLy;
  float d = max(length(rel), 1e-6);
  vec4 p = projectionMatrix * viewMatrix * vec4(rel / d * 100.0, 1.0);
  p.z = 0.0;
  gl_Position = p;
  vA = aFade;
}
`;
const skyLineFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
varying float vA;
void main() { gl_FragColor = vec4(uColor * uAlpha, uAlpha); }
`;

export interface ConstellationData { id: string; name: string; english: string; lines: number[][][] }

/** Constellation figures drawn between the real 3D positions of their stars. */
export class Constellations {
  scene = new THREE.Scene();
  material: THREE.ShaderMaterial;
  labelAnchors: { name: string; pos: THREE.Vector3 }[] = [];
  enabled = false;

  constructor(data: ConstellationData[]) {
    const verts: number[] = [];
    for (const c of data) {
      const sum = new THREE.Vector3();
      let cnt = 0;
      for (const line of c.lines) {
        for (let i = 0; i < line.length - 1; i++) {
          verts.push(...line[i], ...line[i + 1]);
        }
        for (const p of line) { sum.add(new THREE.Vector3(p[0], p[1], p[2])); cnt++; }
      }
      if (cnt) this.labelAnchors.push({ name: c.name, pos: sum.multiplyScalar(1 / cnt) });
    }
    const g = new THREE.BufferGeometry();
    const arr = new Float32Array(verts);
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    g.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(arr.length / 3).fill(1), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    this.material = new THREE.ShaderMaterial({
      vertexShader: skyLineVert, fragmentShader: skyLineFrag,
      uniforms: { uCamLy: { value: new THREE.Vector3() }, uColor: { value: new THREE.Vector3(0.45, 0.62, 1.0) }, uAlpha: { value: 0.28 } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(g, this.material);
    lines.frustumCulled = false;
    this.scene.add(lines);
  }

  update(ctx: FrameContext) {
    this.material.uniforms.uCamLy.value.copy(ctx.camPos).multiplyScalar(1 / LY);
  }
}

const gridVert = /* glsl */ `
varying float vA;
attribute float aFade;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_Position.z = 0.0;
  vA = aFade;
}
`;
const gridFrag = /* glsl */ `
precision highp float;
uniform vec3 uColor;
uniform float uAlpha;
varying float vA;
void main() { gl_FragColor = vec4(uColor * uAlpha * vA, uAlpha * vA); }
`;

/** Ecliptic plane grid: concentric rings at powers of ten AU and 30° spokes, centred on the Sun. */
export class EclipticGrid {
  scene = new THREE.Scene();
  group = new THREE.Group();
  material: THREE.ShaderMaterial;
  enabled = false;

  constructor() {
    const verts: number[] = [];
    const fades: number[] = [];
    const radii = [0.25, 0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000];
    const seg = 180;
    for (const r of radii) {
      const R = r * AU;
      const f = /^(1|10|100|1000)$/.test(String(r)) ? 1.0 : 0.45;
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        verts.push(Math.cos(a0) * R, Math.sin(a0) * R, 0, Math.cos(a1) * R, Math.sin(a1) * R, 0);
        fades.push(f, f);
      }
    }
    const maxR = radii[radii.length - 1] * AU;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      verts.push(0, 0, 0, Math.cos(a) * maxR, Math.sin(a) * maxR, 0);
      fades.push(0.5, 0.15);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts), 3));
    g.setAttribute('aFade', new THREE.BufferAttribute(new Float32Array(fades), 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e30);
    this.material = new THREE.ShaderMaterial({
      vertexShader: gridVert, fragmentShader: gridFrag, uniforms: { uColor: { value: new THREE.Vector3(0.35, 0.55, 0.9) }, uAlpha: { value: 0.16 } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const lines = new THREE.LineSegments(g, this.material);
    lines.frustumCulled = false;
    lines.quaternion.copy(ECLIPTIC_TO_ICRS);
    this.group.add(lines);
    this.scene.add(this.group);
  }

  update(ctx: FrameContext, sunPos: THREE.Vector3) {
    this.group.position.copy(sunPos).sub(ctx.camPos);
    this.group.updateMatrixWorld(true);
  }
}

export { OBLIQUITY };
