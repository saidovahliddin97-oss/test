// Управление: мышь, клавиатура, сенсорный джойстик и кнопка ускорения.

const JOY_RADIUS = 48;

export class Input {
  constructor({ canvas, joyZone, joyBase, joyKnob, boostBtn }) {
    this.mouse = null;
    this.keyTurn = 0;
    this.keys = new Set();
    this.boostKeys = new Set();
    this.joy = null; // { x, y } — нормализованный вектор джойстика
    this.enabled = false;

    // ----- Мышь -----
    canvas.addEventListener('mousemove', (e) => { this.mouse = { x: e.clientX, y: e.clientY }; this.keyTurn = 0; });
    canvas.addEventListener('mousedown', (e) => { if (e.button === 0) this.boostKeys.add('mouse'); });
    addEventListener('mouseup', () => this.boostKeys.delete('mouse'));
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ----- Клавиатура -----
    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (['ArrowLeft', 'KeyA'].includes(e.code)) this.keys.add('l');
      else if (['ArrowRight', 'KeyD'].includes(e.code)) this.keys.add('r');
      else if (['Space', 'ArrowUp', 'KeyW', 'ShiftLeft'].includes(e.code)) this.boostKeys.add(e.code);
      else return;
      if (this.enabled) e.preventDefault();
      this.updateKeyTurn();
    });
    addEventListener('keyup', (e) => {
      if (['ArrowLeft', 'KeyA'].includes(e.code)) this.keys.delete('l');
      if (['ArrowRight', 'KeyD'].includes(e.code)) this.keys.delete('r');
      this.boostKeys.delete(e.code);
      this.updateKeyTurn();
    });
    addEventListener('blur', () => this.clear());

    // ----- Джойстик -----
    let joyPointer = null;
    const moveKnob = (e) => {
      const rect = joyBase.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      let dx = e.clientX - cx;
      let dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      if (d > JOY_RADIUS) { dx *= JOY_RADIUS / d; dy *= JOY_RADIUS / d; }
      joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
      this.joy = d > 8 ? { x: dx, y: dy } : this.joy;
    };
    joyZone.addEventListener('pointerdown', (e) => {
      joyPointer = e.pointerId;
      joyZone.setPointerCapture(e.pointerId);
      joyBase.classList.add('active');
      moveKnob(e);
    });
    joyZone.addEventListener('pointermove', (e) => { if (e.pointerId === joyPointer) moveKnob(e); });
    const endJoy = (e) => {
      if (e.pointerId !== joyPointer) return;
      joyPointer = null;
      joyKnob.style.transform = '';
      joyBase.classList.remove('active');
    };
    joyZone.addEventListener('pointerup', endJoy);
    joyZone.addEventListener('pointercancel', endJoy);

    // ----- Кнопка ускорения -----
    boostBtn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      boostBtn.setPointerCapture(e.pointerId);
      this.boostKeys.add('touch');
      boostBtn.classList.add('active');
    });
    const endBoost = () => { this.boostKeys.delete('touch'); boostBtn.classList.remove('active'); };
    boostBtn.addEventListener('pointerup', endBoost);
    boostBtn.addEventListener('pointercancel', endBoost);
  }

  updateKeyTurn() {
    this.keyTurn = (this.keys.has('r') ? 1 : 0) - (this.keys.has('l') ? 1 : 0);
  }

  clear() {
    this.keys.clear();
    this.boostKeys.clear();
    this.keyTurn = 0;
  }

  // Применяет ввод к змейке игрока. headScreen — позиция головы на экране.
  apply(snake, headScreen) {
    if (this.keyTurn) {
      snake.targetAngle = snake.angle + this.keyTurn * 1.2;
    } else if (this.joy) {
      snake.targetAngle = Math.atan2(this.joy.y, this.joy.x);
    } else if (this.mouse) {
      const dx = this.mouse.x - headScreen.x;
      const dy = this.mouse.y - headScreen.y;
      if (dx * dx + dy * dy > 100) snake.targetAngle = Math.atan2(dy, dx);
    }
    snake.boosting = this.boostKeys.size > 0;
  }

  reset() {
    this.clear();
    this.joy = null;
    this.mouse = null;
  }
}
