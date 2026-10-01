/** Keyboard / mouse / touch state gathered from DOM events. */
export class Input {
  keys = new Set<string>();
  /** Accumulated drag delta in pixels since last consumed. */
  dragX = 0;
  dragY = 0;
  wheel = 0;
  buttons = 0;
  dragging = false;
  moved = 0;
  mouseX = 0;
  mouseY = 0;
  private lastX = 0;
  private lastY = 0;
  private downX = 0;
  private downY = 0;
  private downTime = 0;
  onClick?: (x: number, y: number, button: number, dbl: boolean) => void;
  onKey?: (key: string, e: KeyboardEvent) => void;
  onHover?: (x: number, y: number) => void;
  private lastClickTime = 0;
  private lastClickX = 0;
  private lastClickY = 0;
  pinch = 0;
  private touches = new Map<number, { x: number; y: number }>();
  private lastPinchDist = 0;

  constructor(private el: HTMLElement) {
    el.addEventListener('pointerdown', this.pointerDown);
    window.addEventListener('pointermove', this.pointerMove);
    window.addEventListener('pointerup', this.pointerUp);
    window.addEventListener('pointercancel', this.pointerUp);
    el.addEventListener('wheel', this.onWheel, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', () => { this.keys.clear(); this.dragging = false; });
  }

  private typing(): boolean {
    const a = document.activeElement as HTMLElement | null;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || a.isContentEditable);
  }

  private keyDown = (e: KeyboardEvent) => {
    if (this.typing()) return;
    if (e.ctrlKey || e.metaKey) { if (['w', 'r', 'l', 't', 's', 'p', 'n'].includes(e.key.toLowerCase())) return; }
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (!e.repeat) this.onKey?.(k, e);
    this.keys.add(k);
    if (e.code === 'Space' || k.startsWith('Arrow') || k === 'Tab') e.preventDefault();
    if (k === ' ') this.keys.add('Space');
    if (e.shiftKey) this.keys.add('Shift');
    if (e.ctrlKey) this.keys.add('Control');
  };
  private keyUp = (e: KeyboardEvent) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    this.keys.delete(k);
    this.keys.delete(e.key);
    if (k === ' ') this.keys.delete('Space');
    if (!e.shiftKey) this.keys.delete('Shift');
    if (!e.ctrlKey) this.keys.delete('Control');
  };

  private pointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) { const [a, b] = [...this.touches.values()]; this.lastPinchDist = Math.hypot(a.x - b.x, a.y - b.y); }
    }
    this.buttons |= 1 << e.button;
    this.dragging = true;
    this.lastX = this.downX = e.clientX;
    this.lastY = this.downY = e.clientY;
    this.downTime = performance.now();
    this.moved = 0;
    try { this.el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  private pointerMove = (e: PointerEvent) => {
    this.mouseX = e.clientX; this.mouseY = e.clientY;
    if (e.pointerType === 'touch' && this.touches.has(e.pointerId)) {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size === 2) {
        const [a, b] = [...this.touches.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        this.wheel -= (d - this.lastPinchDist) * 2.2;
        this.lastPinchDist = d;
        return;
      }
    }
    if (this.dragging) {
      const dx = e.clientX - this.lastX, dy = e.clientY - this.lastY;
      this.dragX += dx; this.dragY += dy;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.lastX = e.clientX; this.lastY = e.clientY;
    } else this.onHover?.(e.clientX, e.clientY);
  };
  private pointerUp = (e: PointerEvent) => {
    this.touches.delete(e.pointerId);
    if (!this.dragging) return;
    const wasClick = this.moved < 6 && performance.now() - this.downTime < 500;
    this.buttons &= ~(1 << e.button);
    if (this.buttons === 0) this.dragging = false;
    if (wasClick && e.target === this.el) {
      const now = performance.now();
      const dbl = now - this.lastClickTime < 350 && Math.hypot(e.clientX - this.lastClickX, e.clientY - this.lastClickY) < 8;
      this.lastClickTime = dbl ? 0 : now;
      this.lastClickX = e.clientX; this.lastClickY = e.clientY;
      this.onClick?.(e.clientX, e.clientY, e.button, dbl);
    }
  };
  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const scale = e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? 400 : 1;
    this.wheel += e.deltaY * scale;
  };

  consumeDrag(): [number, number] {
    const r: [number, number] = [this.dragX, this.dragY];
    this.dragX = 0; this.dragY = 0;
    return r;
  }
  consumeWheel(): number { const w = this.wheel; this.wheel = 0; return w; }
  has(k: string) { return this.keys.has(k); }
}
