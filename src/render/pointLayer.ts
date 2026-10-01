import * as THREE from 'three';

const vert = /* glsl */ `
attribute vec3 aDir;
attribute vec4 aColorI;   // rgb colour, intensity
attribute float aSize;
uniform float uPixelRatio;
varying vec4 vC;
void main() {
  vC = aColorI;
  vec4 p = projectionMatrix * viewMatrix * vec4(aDir * 100.0, 1.0);
  p.z = 0.0;
  gl_Position = p;
  gl_PointSize = min(aSize, 64.0) * uPixelRatio;
}
`;
const frag = /* glsl */ `
precision highp float;
varying vec4 vC;
void main() {
  vec2 q = gl_PointCoord * 2.0 - 1.0;
  float r2 = dot(q, q);
  if (r2 > 1.0) discard;
  float v = vC.a * (exp(-r2 * 5.0) + 0.05 * exp(-r2 * 1.5));
  gl_FragColor = vec4(vC.rgb * v, v);
}
`;

export interface DotItem {
  dir: THREE.Vector3;
  color: [number, number, number];
  intensity: number;
  size: number;
}

/** Dynamic set of soft dots for unresolved bodies (planets, moons, spacecraft, etc.). */
export class PointLayer {
  scene = new THREE.Scene();
  points: THREE.Points;
  material: THREE.ShaderMaterial;
  private dir: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private geo = new THREE.BufferGeometry();
  private cap: number;
  count = 0;

  constructor(capacity = 20000) {
    this.cap = capacity;
    this.dir = new Float32Array(capacity * 3);
    this.col = new Float32Array(capacity * 4);
    this.size = new Float32Array(capacity);
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(capacity * 3), 3));
    this.geo.setAttribute('aDir', new THREE.BufferAttribute(this.dir, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aColorI', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e12);
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag, uniforms: { uPixelRatio: { value: 1 } },
      transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.points = new THREE.Points(this.geo, this.material);
    this.points.frustumCulled = false;
    this.scene.add(this.points);
  }

  begin() { this.count = 0; }

  push(dir: THREE.Vector3, r: number, g: number, b: number, intensity: number, size: number) {
    if (this.count >= this.cap) return;
    const i = this.count++;
    this.dir[i * 3] = dir.x; this.dir[i * 3 + 1] = dir.y; this.dir[i * 3 + 2] = dir.z;
    this.col[i * 4] = r; this.col[i * 4 + 1] = g; this.col[i * 4 + 2] = b; this.col[i * 4 + 3] = intensity;
    this.size[i] = size;
  }

  end(pixelRatio: number) {
    this.geo.setDrawRange(0, this.count);
    (this.geo.getAttribute('aDir') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aColorI') as THREE.BufferAttribute).needsUpdate = true;
    (this.geo.getAttribute('aSize') as THREE.BufferAttribute).needsUpdate = true;
    this.material.uniforms.uPixelRatio.value = pixelRatio;
  }
}
