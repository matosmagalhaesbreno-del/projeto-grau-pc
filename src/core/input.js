// Entrada: teclado (com rampas para simular analógico) e controle (gamepad).
export class Input {
  constructor() {
    this.keys = new Set();
    this.pressed = new Set();
    this.state = { throttle: 0, frontBrake: 0, rearBrake: 0, steer: 0, lean: 0, clutch: false, analog: false };
    this._steer = 0;
    this._lean = 0;
    this.padPrev = [];
    this.mouse = { dx: 0, dy: 0, down: false, wheel: 0 };
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
      this.onAny && this.onAny();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    window.addEventListener('mousedown', (e) => { if (e.button === 2 || e.button === 1) this.mouse.down = true; this.onAny && this.onAny(); });
    window.addEventListener('mouseup', (e) => { if (e.button === 2 || e.button === 1) this.mouse.down = false; });
    window.addEventListener('mousemove', (e) => { if (this.mouse.down) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } });
    window.addEventListener('wheel', (e) => { this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  k(...codes) { return codes.some((c) => this.keys.has(c)); }
  hit(code) { return this.pressed.has(code); }
  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; }

  update(dt) {
    const s = this.state;
    s.analog = false;
    s.throttle = this.k('KeyW', 'ArrowUp') ? 1 : 0;
    s.rearBrake = this.k('KeyS', 'ArrowDown') ? 1 : 0;
    s.frontBrake = this.k('Space') ? 1 : 0;
    s.clutch = this.k('ShiftLeft', 'ShiftRight');
    const st = (this.k('KeyD', 'ArrowRight') ? 1 : 0) - (this.k('KeyA', 'ArrowLeft') ? 1 : 0);
    this._steer += (st - this._steer) * Math.min(1, dt * (st === 0 ? 9 : 6));
    s.steer = this._steer;
    // peso do corpo: Q / Ctrl = para trás (ajuda o grau), E = para frente
    const ln = (this.k('KeyE') ? 1 : 0) - (this.k('KeyQ', 'ControlLeft', 'ControlRight') ? 1 : 0);
    this._lean += (ln - this._lean) * Math.min(1, dt * 8);
    s.lean = this._lean;
    // controle
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      const b = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
      const ax = (i) => { const v = p.axes[i] || 0; return Math.abs(v) < 0.12 ? 0 : v; };
      if (b(7) > 0.02) { s.throttle = Math.max(s.throttle, b(7)); s.analog = true; }
      s.frontBrake = Math.max(s.frontBrake, b(6));
      s.rearBrake = Math.max(s.rearBrake, b(5) > 0.5 ? 1 : 0, b(1) > 0.5 ? 1 : 0);
      if (b(4) > 0.5) s.clutch = true;
      if (ax(0)) s.steer = ax(0);
      if (ax(3)) s.lean = ax(3);
      const pr = (i) => b(i) > 0.5 && !this.padPrev[i];
      if (pr(3)) this.pressed.add('KeyC');
      if (pr(9)) this.pressed.add('Escape');
      if (pr(8)) this.pressed.add('KeyR');
      if (pr(0)) this.pressed.add('KeyX');
      if (pr(2)) this.pressed.add('KeyZ');
      if (pr(12)) this.pressed.add('KeyH');
      this.padPrev = p.buttons.map((x) => x.value > 0.5);
      break;
    }
  }
}
