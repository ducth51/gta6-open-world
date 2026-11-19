// Keyboard and mouse: held keys, keys tapped this frame, pointer-locked mouse look, buttons and the
// wheel. Screenshot scenes and the autopilot can drive it through `virtual`.

export class Input {
  constructor(element) {
    this.element = element;
    this.held = new Set();
    this.tapped = new Set();
    this.mouseDX = 0; this.mouseDY = 0;
    this.buttons = { left: false, right: false };
    this.clicked = { left: false, right: false };
    this.wheel = 0;
    this.locked = false;
    this.enabled = true;
    this.virtual = null;
    this.sensitivity = 1;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space') e.preventDefault();
      if (!this.held.has(e.code)) this.tapped.add(e.code);
      this.held.add(e.code);
    });
    addEventListener('keyup', (e) => this.held.delete(e.code));
    addEventListener('blur', () => { this.held.clear(); this.buttons.left = this.buttons.right = false; });
    element.addEventListener('mousedown', (e) => {
      if (e.button === 0) { this.buttons.left = true; this.clicked.left = true; }
      if (e.button === 2) { this.buttons.right = true; this.clicked.right = true; }
      if (this.enabled && !this.locked) this.requestLock();
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.buttons.left = false;
      if (e.button === 2) this.buttons.right = false;
    });
    element.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === element; });
  }

  requestLock() {
    try { const p = this.element.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch { /* not allowed here */ }
  }

  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  down(code) { return this.enabled && (this.held.has(code) || !!this.virtual?.held?.has(code)); }
  tap(code) { return this.enabled && (this.tapped.has(code) || !!this.virtual?.tapped?.has(code)); }
  /** Any of the codes tapped this frame (menus listen regardless of `enabled`). */
  tapAny(...codes) { return codes.some((c) => this.tapped.has(c)); }

  axis(neg, pos) { return (this.down(pos) ? 1 : 0) - (this.down(neg) ? 1 : 0); }
  get fire() { return this.enabled && (this.buttons.left || !!this.virtual?.fire); }
  get aim() { return this.enabled && (this.buttons.right || !!this.virtual?.aim); }

  takeMouse() {
    const d = { x: this.mouseDX * 0.0022 * this.sensitivity, y: this.mouseDY * 0.0022 * this.sensitivity };
    this.mouseDX = this.mouseDY = 0;
    return d;
  }

  takeWheel() { const w = this.wheel; this.wheel = 0; return w; }

  endFrame() {
    this.tapped.clear();
    this.clicked.left = this.clicked.right = false;
    if (this.virtual?.tapped) this.virtual.tapped.clear();
  }
}
