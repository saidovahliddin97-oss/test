// Отрисовка мира на canvas.
import { WORLD_SIZE } from './game.js';

const GRID_STEP = 64;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    addEventListener('resize', () => this.resize());
  }

  resize() {
    this.w = innerWidth;
    this.h = innerHeight;
    this.dpr = Math.min(2, devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  // Базовый масштаб: на маленьких экранах видно чуть больше поля.
  get baseZoom() {
    const m = Math.min(this.w, this.h);
    return m < 500 ? 0.8 : m < 800 ? 0.9 : 1;
  }

  worldToScreen(cam, x, y) {
    return { x: this.w / 2 + (x - cam.x) * cam.zoom, y: this.h / 2 + (y - cam.y) * cam.zoom };
  }

  draw(game, cam, settings, time) {
    const { ctx, dpr, w, h } = this;
    const z = cam.zoom;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#05090F';
    ctx.fillRect(0, 0, w, h);

    ctx.setTransform(dpr * z, 0, 0, dpr * z, dpr * (w / 2 - cam.x * z), dpr * (h / 2 - cam.y * z));
    const view = {
      l: cam.x - w / 2 / z,
      r: cam.x + w / 2 / z,
      t: cam.y - h / 2 / z,
      b: cam.y + h / 2 / z,
    };

    this.drawArena(view, z);
    this.drawFood(game.food, view, settings, time);

    const leader = game.snakes.reduce((a, s) => (!a || s.score > a.score ? s : a), null);
    const order = [...game.snakes].sort((a, b) => (a.isPlayer ? 1 : 0) - (b.isPlayer ? 1 : 0));
    for (const s of order) this.drawSnake(s, view, settings, time, s === leader && s.score > 0, game.time);
  }

  drawArena(v, z) {
    const { ctx } = this;
    ctx.fillStyle = '#080F1A';
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);

    const l = Math.max(0, Math.floor(v.l / GRID_STEP) * GRID_STEP);
    const r = Math.min(WORLD_SIZE, v.r);
    const t = Math.max(0, Math.floor(v.t / GRID_STEP) * GRID_STEP);
    const b = Math.min(WORLD_SIZE, v.b);
    ctx.beginPath();
    for (let x = l; x <= r; x += GRID_STEP) { ctx.moveTo(x, Math.max(0, v.t)); ctx.lineTo(x, b); }
    for (let y = t; y <= b; y += GRID_STEP) { ctx.moveTo(Math.max(0, v.l), y); ctx.lineTo(r, y); }
    ctx.strokeStyle = 'rgba(96, 120, 200, 0.11)';
    ctx.lineWidth = 1 / z;
    ctx.stroke();

    // Светящаяся граница арены.
    ctx.strokeStyle = 'rgba(255, 61, 139, 0.18)';
    ctx.lineWidth = 34;
    ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    ctx.strokeStyle = '#FF3D8B';
    ctx.lineWidth = 5;
    ctx.strokeRect(0, 0, WORLD_SIZE, WORLD_SIZE);
  }

  drawFood(food, v, settings, time) {
    const { ctx } = this;
    for (const f of food) {
      if (f.x < v.l - 30 || f.x > v.r + 30 || f.y < v.t - 30 || f.y > v.b + 30) continue;
      const pulse = 1 + Math.sin(time * 3 + f.phase) * 0.15;
      ctx.fillStyle = f.color;
      if (settings.glow) {
        ctx.globalAlpha = 0.18;
        ctx.beginPath();
        ctx.arc(f.x, f.y, f.r * 2.6 * pulse, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.beginPath();
      ctx.arc(f.x - f.r * 0.3, f.y - f.r * 0.3, f.r * 0.35, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawSnake(s, v, settings, time, isLeader, gameTime) {
    const { ctx } = this;
    const segs = s.segs;
    const n = segs.length;
    const r = s.radius;
    const span = n * s.spacing + r * 2;
    const hd = segs[0];
    if (hd.x < v.l - span || hd.x > v.r + span || hd.y < v.t - span || hd.y > v.b + span) return;

    const colors = s.colors();
    const shielded = gameTime - s.spawnTime < 2;
    if (shielded) ctx.globalAlpha = 0.55 + Math.sin(time * 14) * 0.25;

    // Свечение вдоль тела.
    if (settings.glow) {
      ctx.save();
      ctx.globalAlpha *= s.boosting ? 0.45 : 0.2;
      ctx.strokeStyle = colors[Math.floor(n / 3)];
      ctx.lineWidth = r * 2 + (s.boosting ? 22 : 12);
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(segs[n - 1].x, segs[n - 1].y);
      for (let i = n - 2; i >= 0; i--) ctx.lineTo(segs[i].x, segs[i].y);
      ctx.stroke();
      ctx.restore();
    }

    // Сегменты от хвоста к голове; хвост сужается.
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
    const taper = Math.min(8, n * 0.4);
    for (let i = n - 1; i >= 0; i--) {
      const p = segs[i];
      const k = i > n - 1 - taper ? 0.6 + 0.4 * ((n - 1 - i) / taper) : 1;
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * k, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }

    this.drawHead(s, colors[0]);
    ctx.globalAlpha = 1;

    if (isLeader) this.drawCrown(hd.x, hd.y - r * 2.1, r);

    if (settings.names && !s.isPlayer) {
      ctx.font = '600 13px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText(s.name, hd.x, hd.y + r + 20);
    }
  }

  drawHead(s, color) {
    const { ctx } = this;
    const { x, y } = s.head;
    const r = s.radius * 1.08;
    const a = s.angle;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const look = s.targetAngle;
    for (const side of [-1, 1]) {
      const ex = x + Math.cos(a) * r * 0.38 + Math.cos(a + Math.PI / 2) * r * 0.46 * side;
      const ey = y + Math.sin(a) * r * 0.38 + Math.sin(a + Math.PI / 2) * r * 0.46 * side;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(ex, ey, r * 0.36, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#0B1020';
      ctx.beginPath();
      ctx.arc(ex + Math.cos(look) * r * 0.14, ey + Math.sin(look) * r * 0.14, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  drawCrown(x, y, size) {
    const { ctx } = this;
    const w = size * 1.3;
    const h = size * 0.9;
    ctx.save();
    ctx.translate(x - w / 2, y - h / 2);
    ctx.fillStyle = '#FFC23D';
    ctx.strokeStyle = '#B7791F';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, h);
    ctx.lineTo(0, h * 0.25);
    ctx.lineTo(w * 0.27, h * 0.6);
    ctx.lineTo(w * 0.5, 0);
    ctx.lineTo(w * 0.73, h * 0.6);
    ctx.lineTo(w, h * 0.25);
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}
