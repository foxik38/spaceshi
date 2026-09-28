import * as THREE from 'three';
import { formatSpeed } from '../core/units';
import type { Body } from '../sim/body';
import type { Sandbox } from '../app/sandbox';
import type { FrameContext } from '../render/context';

const NS = 'http://www.w3.org/2000/svg';
const len = (s: number) => 12 + 60 * Math.log10(1 + s / 300);
const unlen = (px: number) => 300 * (Math.pow(10, (Math.max(px, 12) - 12) / 60) - 1);

/** On-screen velocity arrow for the selected body; drag its tip to redirect the body (in the camera plane). */
export class VelocityGizmo {
  private svg: SVGSVGElement;
  private line: SVGLineElement;
  private handle: SVGCircleElement;
  private text: SVGTextElement;
  private dragging = false;
  private center = { x: 0, y: 0 };
  private body: Body | null = null;
  private ctx: FrameContext | null = null;
  private prevPaused = false;

  constructor(parent: HTMLElement, private sb: Sandbox, private setPaused: (p: boolean) => boolean) {
    this.svg = document.createElementNS(NS, 'svg') as SVGSVGElement;
    this.svg.setAttribute('style', 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;overflow:visible;display:none');
    this.line = document.createElementNS(NS, 'line') as SVGLineElement;
    this.line.setAttribute('stroke', '#9dbfe6'); this.line.setAttribute('stroke-width', '1.5');
    this.handle = document.createElementNS(NS, 'circle') as SVGCircleElement;
    this.handle.setAttribute('r', '6'); this.handle.setAttribute('fill', '#000'); this.handle.setAttribute('stroke', '#9dbfe6'); this.handle.setAttribute('stroke-width', '1.5');
    this.handle.setAttribute('style', 'pointer-events:auto;cursor:grab');
    this.text = document.createElementNS(NS, 'text') as SVGTextElement;
    this.text.setAttribute('fill', '#d5dae1'); this.text.setAttribute('font-size', '11'); this.text.setAttribute('font-family', 'ui-monospace, Menlo, Consolas, monospace');
    this.svg.append(this.line, this.handle, this.text);
    parent.appendChild(this.svg);
    this.handle.addEventListener('pointerdown', (e) => { this.dragging = true; this.handle.setPointerCapture(e.pointerId); this.prevPaused = this.setPaused(true); e.stopPropagation(); e.preventDefault(); });
    this.handle.addEventListener('pointermove', (e) => { if (this.dragging) this.onDrag(e.clientX, e.clientY); });
    const end = (e: PointerEvent) => { if (!this.dragging) return; this.dragging = false; try { this.handle.releasePointerCapture(e.pointerId); } catch { /* ignore */ } this.setPaused(this.prevPaused); this.sb.onChange?.(); };
    this.handle.addEventListener('pointerup', end);
    this.handle.addEventListener('pointercancel', end);
  }

  private onDrag(px: number, py: number) {
    const b = this.body, ctx = this.ctx;
    if (!b || !ctx) return;
    this.sb.enableLive(false);
    const dom = this.sb.dominant(b);
    if (!dom) return;
    const hx = px - this.center.x, hy = py - this.center.y;
    const hl = Math.hypot(hx, hy);
    const speed = unlen(hl);
    // current relative velocity in view space
    const v = this.sb.relVelocity(b, new THREE.Vector3()).applyQuaternion(ctx.camQuatInv);
    const plane = new THREE.Vector3(hl > 1e-6 ? hx / hl : 0, hl > 1e-6 ? -hy / hl : 0, 0).multiplyScalar(hl > 12.5 ? speed : 0);
    const nv = new THREE.Vector3(plane.x, plane.y, v.z);
    b.vel.copy(dom.vel).add(nv.applyQuaternion(ctx.camQuat));
  }

  update(ctx: FrameContext, body: Body | null, visible: boolean) {
    this.ctx = ctx;
    this.body = body;
    if (!body || !visible) { this.svg.style.display = 'none'; return; }
    const rel = new THREE.Vector3().copy(body.pos).sub(ctx.camPos).applyQuaternion(ctx.camQuatInv);
    if (rel.z >= -1e-9) { this.svg.style.display = 'none'; return; }
    const x = (0.5 + 0.5 * (rel.x / -rel.z / ctx.tanHalfX)) * ctx.width;
    const y = (0.5 - 0.5 * (rel.y / -rel.z / ctx.tanHalfY)) * ctx.height;
    this.center = { x, y };
    const v = this.sb.relVelocity(body, new THREE.Vector3());
    const speed = v.length();
    const vv = v.clone().applyQuaternion(ctx.camQuatInv);
    const inPlane = Math.hypot(vv.x, vv.y);
    let ax = 0, ay = 0, L = 12;
    if (inPlane > 1e-9) { L = len(inPlane); ax = vv.x / inPlane; ay = -vv.y / inPlane; }
    else { ax = 1; ay = 0; }
    const rpx = body.screenRadiusPx || 0;
    const off = Math.min(rpx + 4, 400);
    if (!this.dragging) {
      this.line.setAttribute('x1', String(x + ax * off)); this.line.setAttribute('y1', String(y + ay * off));
      this.line.setAttribute('x2', String(x + ax * (L + off))); this.line.setAttribute('y2', String(y + ay * (L + off)));
      this.handle.setAttribute('cx', String(x + ax * (L + off))); this.handle.setAttribute('cy', String(y + ay * (L + off)));
      this.text.setAttribute('x', String(x + ax * (L + off) + 10)); this.text.setAttribute('y', String(y + ay * (L + off) - 8));
      // during a drag `center` must be the arrow origin, not the disc edge
    }
    this.center = { x: x + ax * off * 0, y: y + ay * off * 0 };
    this.text.textContent = formatSpeed(speed);
    this.svg.style.display = '';
  }
}
