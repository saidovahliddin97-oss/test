// Симуляция мира: змейки, еда, боты, столкновения.

export const WORLD_SIZE = 6000;
export const START_LEN = 10;

const CELL = 120;
const GRID_N = Math.ceil(WORLD_SIZE / CELL);
const SCORE_PER_SEG = 40;
const BASE_SPEED = 185;
const BOOST_SPEED = 360;
const BOOST_COST = 30; // очков в секунду
const FOOD_TARGET = 1500;
const FOOD_MAX = 2600;
const BOT_COUNT = 16;
const SPAWN_SHIELD = 2; // секунды неуязвимости после появления

const FOOD_COLORS = ['#A855F7', '#3B82F6', '#22D3EE', '#7ED957', '#FFC23D', '#FF3D8B', '#FF8A3D'];

const BOT_NAMES = [
  'SnakeMaster', 'Turbo', 'Queen', 'Ghost', 'Viper', 'Neon', 'Zigzag', 'Noodle',
  'Blitz', 'Mamba', 'Pixel', 'Kobra', 'Shadow', 'Rocket', 'Luna', 'Spark', 'Nova', 'Slinky',
];

export const SKINS = [
  { id: 'violet', name: 'Фиалка', colors: ['#C084FC', '#E040FB', '#9333EA'] },
  { id: 'sunny', name: 'Солнце', colors: ['#FFD84D', '#FFB020', '#FF8A3D'] },
  { id: 'ocean', name: 'Океан', colors: ['#38BDF8', '#2F6BFF', '#1D4ED8'] },
  { id: 'lime', name: 'Лайм', colors: ['#A3E635', '#22C55E', '#15803D'] },
  { id: 'candy', name: 'Конфета', colors: ['#FF7AB6', '#FF3D8B', '#E11D48'] },
  { id: 'aqua', name: 'Лёд', colors: ['#A5F3FC', '#22D3EE', '#0891B2'] },
  { id: 'rainbow', name: 'Радуга', rainbow: true },
];

// ---------- Утилиты ----------
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

export function angleDiff(a, b) {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// Цвет сегмента i из n: плавный градиент по палитре скина + лёгкие полоски.
export function segmentColor(skin, i, n) {
  const shade = Math.floor(i / 3) % 2 ? 0.9 : 1;
  if (skin.rainbow) return `hsl(${(i * 14) % 360}, 90%, ${Math.round(60 * shade)}%)`;
  const stops = skin._rgb || (skin._rgb = skin.colors.map(hexToRgb));
  const t = n > 1 ? (i / (n - 1)) * (stops.length - 1) : 0;
  const k = Math.min(stops.length - 2, Math.floor(t));
  const f = t - k;
  const a = stops[k];
  const b = stops[k + 1];
  const c = [0, 1, 2].map((j) => Math.round((a[j] + (b[j] - a[j]) * f) * shade));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// ---------- Змейка ----------
let nextId = 1;

export class Snake {
  constructor({ name, skin, x, y, angle, score = 0, isPlayer = false, time = 0 }) {
    this.id = nextId++;
    this.name = name;
    this.skin = skin;
    this.isPlayer = isPlayer;
    this.score = score;
    this.angle = angle;
    this.targetAngle = angle;
    this.alive = true;
    this.boosting = false;
    this.kills = 0;
    this.dropTimer = 0;
    this.aiTimer = 0;
    this.aggro = Math.random();
    this.spawnTime = time;
    this.segs = [];
    const sp = this.spacing;
    for (let i = 0; i < this.targetLength; i++) {
      this.segs.push({ x: x - Math.cos(angle) * sp * i, y: y - Math.sin(angle) * sp * i });
    }
    this._colors = null;
  }

  get targetLength() { return START_LEN + Math.floor(this.score / SCORE_PER_SEG); }
  get radius() { return 10 + Math.min(18, Math.sqrt(this.score) * 0.28); }
  get spacing() { return this.radius * 0.5; }
  get head() { return this.segs[0]; }

  colors() {
    const n = this.segs.length;
    if (!this._colors || this._colors.length !== n) {
      this._colors = Array.from({ length: n }, (_, i) => segmentColor(this.skin, i, n));
    }
    return this._colors;
  }
}

// ---------- Мир ----------
export class Game {
  constructor() {
    this.segGrid = Array.from({ length: GRID_N * GRID_N }, () => []);
    this.foodGrid = Array.from({ length: GRID_N * GRID_N }, () => []);
    this.reset();
  }

  reset() {
    this.time = 0;
    this.snakes = [];
    this.food = [];
    this.player = null;
    this.events = [];
    this.botRespawn = 0;
    for (let i = 0; i < FOOD_TARGET; i++) this.randomFood();
    for (let i = 0; i < BOT_COUNT; i++) this.addBot(true);
    this.buildSegGrid();
  }

  // ----- Еда -----
  addFood(x, y, value, color, r) {
    this.food.push({
      x: clamp(x, 20, WORLD_SIZE - 20),
      y: clamp(y, 20, WORLD_SIZE - 20),
      value,
      color: color || pick(FOOD_COLORS),
      r: r || 4 + value / 4,
      phase: Math.random() * Math.PI * 2,
      eaten: false,
    });
  }

  randomFood() {
    const value = pick([5, 5, 5, 10, 10, 15]);
    this.addFood(rand(60, WORLD_SIZE - 60), rand(60, WORLD_SIZE - 60), value);
  }

  // ----- Змейки -----
  safeSpot(minDist = 500) {
    let best = null;
    let bestD = -1;
    for (let tries = 0; tries < 40; tries++) {
      const x = rand(400, WORLD_SIZE - 400);
      const y = rand(400, WORLD_SIZE - 400);
      let d = Infinity;
      for (const s of this.snakes) {
        if (!s.alive) continue;
        for (let i = 0; i < s.segs.length; i += 4) {
          d = Math.min(d, Math.hypot(s.segs[i].x - x, s.segs[i].y - y));
        }
      }
      if (d > minDist) return { x, y };
      if (d > bestD) { bestD = d; best = { x, y }; }
    }
    return best;
  }

  addBot(initial = false) {
    const used = new Set(this.snakes.filter((s) => s.alive).map((s) => s.name));
    const names = BOT_NAMES.filter((n) => !used.has(n));
    const { x, y } = this.safeSpot();
    const score = initial ? Math.floor(rand(0, 1) ** 2 * 2200) : Math.floor(rand(0, 400));
    const bot = new Snake({
      name: names.length ? pick(names) : pick(BOT_NAMES),
      skin: pick(SKINS),
      x, y,
      angle: rand(0, Math.PI * 2),
      score,
      time: this.time,
    });
    this.snakes.push(bot);
    return bot;
  }

  addPlayer(name, skin) {
    const { x, y } = this.safeSpot(700);
    const angle = Math.atan2(WORLD_SIZE / 2 - y, WORLD_SIZE / 2 - x);
    this.player = new Snake({ name, skin, x, y, angle, isPlayer: true, time: this.time });
    this.snakes.push(this.player);
    return this.player;
  }

  kill(s, killer) {
    if (!s.alive) return;
    s.alive = false;
    s.boosting = false;
    // Тело превращается в еду.
    const n = Math.min(s.segs.length, 90);
    const total = s.score * 0.7 + 60;
    const value = Math.max(5, Math.round(total / n));
    const colors = s.colors();
    const step = s.segs.length / n;
    for (let k = 0; k < n; k++) {
      const i = Math.floor(k * step);
      const p = s.segs[i];
      const j = s.radius * 0.6;
      this.addFood(p.x + rand(-j, j), p.y + rand(-j, j), value, colors[i], 5 + Math.min(8, value / 6));
    }
    if (killer && killer.alive) killer.kills++;
    this.events.push({ type: 'death', victim: s, killer });
  }

  // ----- Пространственная сетка -----
  cellIndex(x, y) {
    const cx = clamp(Math.floor(x / CELL), 0, GRID_N - 1);
    const cy = clamp(Math.floor(y / CELL), 0, GRID_N - 1);
    return cy * GRID_N + cx;
  }

  forCells(grid, x, y, radius, fn) {
    const x0 = clamp(Math.floor((x - radius) / CELL), 0, GRID_N - 1);
    const x1 = clamp(Math.floor((x + radius) / CELL), 0, GRID_N - 1);
    const y0 = clamp(Math.floor((y - radius) / CELL), 0, GRID_N - 1);
    const y1 = clamp(Math.floor((y + radius) / CELL), 0, GRID_N - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const cell = grid[cy * GRID_N + cx];
        for (let i = 0; i < cell.length; i++) if (fn(cell[i]) === false) return;
      }
    }
  }

  buildSegGrid() {
    for (const c of this.segGrid) c.length = 0;
    for (const s of this.snakes) {
      if (!s.alive) continue;
      for (let i = 0; i < s.segs.length; i++) {
        const p = s.segs[i];
        this.segGrid[this.cellIndex(p.x, p.y)].push({ s, x: p.x, y: p.y });
      }
    }
  }

  buildFoodGrid() {
    for (const c of this.foodGrid) c.length = 0;
    for (const f of this.food) this.foodGrid[this.cellIndex(f.x, f.y)].push(f);
  }

  // ----- Шаг симуляции -----
  update(dt) {
    this.time += dt;

    for (const s of this.snakes) {
      if (!s.alive) continue;
      if (!s.isPlayer) this.think(s, dt);
      this.move(s, dt);
    }

    this.buildSegGrid();
    this.collide();
    this.buildFoodGrid();
    this.eat(dt);

    this.snakes = this.snakes.filter((s) => s.alive);

    const bots = this.snakes.filter((s) => !s.isPlayer).length;
    if (bots < BOT_COUNT) {
      this.botRespawn -= dt;
      if (this.botRespawn <= 0) {
        this.addBot();
        this.botRespawn = rand(1, 3);
      }
    }

    for (let k = 0; k < 20 && this.food.length < FOOD_TARGET; k++) this.randomFood();
    if (this.food.length > FOOD_MAX) this.food.splice(0, this.food.length - FOOD_MAX);
  }

  move(s, dt) {
    const r = s.radius;
    const turnRate = 4.6 - Math.min(2.2, (r - 10) * 0.13);
    const turn = turnRate * dt;
    s.angle += clamp(angleDiff(s.targetAngle, s.angle), -turn, turn);

    if (s.boosting && (s.score <= 0 || s.segs.length <= START_LEN)) s.boosting = false;
    const speed = s.boosting ? BOOST_SPEED : BASE_SPEED;

    const segs = s.segs;
    segs[0].x += Math.cos(s.angle) * speed * dt;
    segs[0].y += Math.sin(s.angle) * speed * dt;

    const sp = s.spacing;
    for (let i = 1; i < segs.length; i++) {
      const a = segs[i - 1];
      const b = segs[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d > sp) {
        const k = sp / d;
        b.x = a.x + dx * k;
        b.y = a.y + dy * k;
      }
    }

    if (s.boosting) {
      s.score = Math.max(0, s.score - BOOST_COST * dt);
      s.dropTimer -= dt;
      if (s.dropTimer <= 0) {
        s.dropTimer = 0.25;
        const tail = segs[segs.length - 1];
        const colors = s.colors();
        this.addFood(tail.x + rand(-4, 4), tail.y + rand(-4, 4), 6, colors[colors.length - 1], 5);
      }
    }

    const target = s.targetLength;
    while (segs.length < target) {
      const t = segs[segs.length - 1];
      segs.push({ x: t.x, y: t.y });
    }
    while (segs.length > target && segs.length > 2) segs.pop();
  }

  collide() {
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const h = s.head;
      const r = s.radius;

      if (h.x < r || h.y < r || h.x > WORLD_SIZE - r || h.y > WORLD_SIZE - r) {
        this.kill(s, null);
        continue;
      }
      if (this.time - s.spawnTime < SPAWN_SHIELD) continue;

      let killer = null;
      this.forCells(this.segGrid, h.x, h.y, r + 30, (e) => {
        if (e.s === s || !e.s.alive) return;
        const rr = (r + e.s.radius) * 0.78;
        const dx = e.x - h.x;
        const dy = e.y - h.y;
        if (dx * dx + dy * dy < rr * rr) { killer = e.s; return false; }
      });
      if (killer) this.kill(s, killer);
    }
  }

  eat(dt) {
    let eaten = false;
    for (const s of this.snakes) {
      if (!s.alive) continue;
      const h = s.head;
      const r = s.radius;
      const magnet = r * 2.4 + 40;
      this.forCells(this.foodGrid, h.x, h.y, magnet, (f) => {
        if (f.eaten) return;
        const dx = h.x - f.x;
        const dy = h.y - f.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > magnet * magnet) return;
        const eatR = r + f.r;
        if (d2 < eatR * eatR) {
          f.eaten = true;
          eaten = true;
          s.score += f.value;
          if (s.isPlayer) this.events.push({ type: 'eat', value: f.value });
        } else {
          const k = Math.min(1, dt * 7);
          f.x += dx * k;
          f.y += dy * k;
        }
      });
    }
    if (eaten) this.food = this.food.filter((f) => !f.eaten);
  }

  // ----- ИИ ботов -----
  clearance(s, angle, look) {
    const h = s.head;
    const r = s.radius;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const margin = r + 30;
    for (const t of [0.3, 0.6, 1]) {
      const x = h.x + cos * look * t;
      const y = h.y + sin * look * t;
      if (x < margin || y < margin || x > WORLD_SIZE - margin || y > WORLD_SIZE - margin) return t - 0.3;
      let hit = false;
      this.forCells(this.segGrid, x, y, r + 40, (e) => {
        if (e.s === s) return;
        const rr = r + e.s.radius + 14;
        const dx = e.x - x;
        const dy = e.y - y;
        if (dx * dx + dy * dy < rr * rr) { hit = true; return false; }
      });
      if (hit) return t - 0.3;
    }
    return 1;
  }

  think(s, dt) {
    s.aiTimer -= dt;
    if (s.aiTimer > 0) return;
    s.aiTimer = rand(0.08, 0.18);

    const h = s.head;
    const r = s.radius;
    const look = 110 + r * 4;

    // 1. Уклонение от препятствий.
    if (this.clearance(s, s.angle, look) < 1) {
      let best = s.angle + Math.PI;
      let bestC = -1;
      for (const off of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
        const c = this.clearance(s, s.angle + off, look) - Math.abs(off) * 0.01;
        if (c > bestC) { bestC = c; best = s.angle + off; }
      }
      s.targetAngle = best;
      s.boosting = false;
      return;
    }

    // 2. Охота на игрока: попытаться отрезать путь.
    const p = this.player;
    if (p && p.alive && s.aggro > 0.55 && s.score > 150) {
      const d = Math.hypot(p.head.x - h.x, p.head.y - h.y);
      if (d < 480 && d > 60) {
        const ax = p.head.x + Math.cos(p.angle) * (120 + p.radius * 3);
        const ay = p.head.y + Math.sin(p.angle) * (120 + p.radius * 3);
        s.targetAngle = Math.atan2(ay - h.y, ax - h.x);
        s.boosting = d < 320 && s.score > 300 && Math.random() < 0.6;
        return;
      }
    }

    // 3. Поиск еды.
    let best = null;
    let bestScore = 0;
    this.forCells(this.foodGrid, h.x, h.y, 380, (f) => {
      const d = Math.hypot(f.x - h.x, f.y - h.y);
      const a = Math.abs(angleDiff(Math.atan2(f.y - h.y, f.x - h.x), s.angle));
      const score = f.value / (d + 40 + a * 120);
      if (score > bestScore) { bestScore = score; best = f; }
    });
    s.boosting = false;
    if (best) {
      s.targetAngle = Math.atan2(best.y - h.y, best.x - h.x);
      if (best.value >= 20 && s.score > 400 && Math.random() < 0.15) s.boosting = true;
    } else if (Math.random() < 0.2) {
      s.targetAngle = s.angle + rand(-1, 1);
    }
  }

  leaderboard() {
    return [...this.snakes].sort((a, b) => b.score - a.score);
  }
}
