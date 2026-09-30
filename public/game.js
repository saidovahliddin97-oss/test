(() => {
  const GRID = 20;
  const START_SPEED = 140; // мс на шаг
  const MIN_SPEED = 60;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const cell = canvas.width / GRID;

  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayText = document.getElementById('overlay-text');
  const startBtn = document.getElementById('start');
  const saveForm = document.getElementById('save-form');
  const nameInput = document.getElementById('name');
  const scoresEl = document.getElementById('scores');
  const storageNote = document.getElementById('storage-note');

  const DIRS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
  };

  let snake, dir, queue, food, score, speed, timer, state; // state: idle | running | paused | over
  let best = Number(safeGet('snake-best')) || 0;
  bestEl.textContent = best;
  nameInput.value = safeGet('snake-name') || '';

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* игнорируем */ }
  }

  function reset() {
    const mid = Math.floor(GRID / 2);
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    dir = DIRS.right;
    queue = [];
    score = 0;
    speed = START_SPEED;
    scoreEl.textContent = 0;
    placeFood();
  }

  function placeFood() {
    const free = [];
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if (!snake.some((s) => s.x === x && s.y === y)) free.push({ x, y });
      }
    }
    food = free[Math.floor(Math.random() * free.length)];
  }

  function start() {
    reset();
    state = 'running';
    overlay.hidden = true;
    saveForm.hidden = true;
    loop();
  }

  function loop() {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (state !== 'running') return;
      step();
      draw();
      if (state === 'running') loop();
    }, speed);
  }

  function step() {
    // Берём следующий поворот из очереди, чтобы быстрые нажатия не терялись.
    while (queue.length) {
      const next = queue.shift();
      if (next.x !== -dir.x || next.y !== -dir.y) { dir = next; break; }
    }

    const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
    const eating = food && head.x === food.x && head.y === food.y;
    const body = eating ? snake : snake.slice(0, -1);

    const hitWall = head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID;
    const hitSelf = body.some((s) => s.x === head.x && s.y === head.y);
    if (hitWall || hitSelf) return gameOver();

    snake.unshift(head);
    if (eating) {
      score += 10;
      scoreEl.textContent = score;
      speed = Math.max(MIN_SPEED, speed - 3);
      placeFood();
      if (!food) return gameOver(true);
    } else {
      snake.pop();
    }
  }

  function gameOver(won = false) {
    state = 'over';
    clearTimeout(timer);
    if (score > best) {
      best = score;
      bestEl.textContent = best;
      safeSet('snake-best', best);
    }
    overlayTitle.textContent = won ? 'Победа!' : 'Игра окончена';
    overlayText.innerHTML = `Ваш счёт: <b>${score}</b>`;
    startBtn.textContent = 'Ещё раз';
    saveForm.hidden = score === 0;
    overlay.hidden = false;
    if (!saveForm.hidden && !nameInput.value) nameInput.focus();
  }

  function togglePause() {
    if (state === 'running') {
      state = 'paused';
      clearTimeout(timer);
      overlayTitle.textContent = 'Пауза';
      overlayText.textContent = 'Нажмите пробел, чтобы продолжить';
      startBtn.textContent = 'Продолжить';
      saveForm.hidden = true;
      overlay.hidden = false;
    } else if (state === 'paused') {
      state = 'running';
      overlay.hidden = true;
      loop();
    }
  }

  function turn(name) {
    const d = DIRS[name];
    if (!d || state !== 'running') return;
    const last = queue[queue.length - 1] || dir;
    if (d === last || (d.x === -last.x && d.y === -last.y)) return;
    if (queue.length < 3) queue.push(d);
  }

  // ---------- Отрисовка ----------
  function draw() {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#172033';
    for (let x = 0; x < GRID; x++) {
      for (let y = 0; y < GRID; y++) {
        if ((x + y) % 2) ctx.fillRect(x * cell, y * cell, cell, cell);
      }
    }

    if (food) {
      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(food.x * cell + cell / 2, food.y * cell + cell / 2, cell * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }

    snake.forEach((s, i) => {
      const t = i / snake.length;
      ctx.fillStyle = i === 0 ? '#4ade80' : `hsl(142, 70%, ${45 - t * 20}%)`;
      roundRect(s.x * cell + 1, s.y * cell + 1, cell - 2, cell - 2, 5);
    });

    // Глаза
    const h = snake[0];
    ctx.fillStyle = '#0f172a';
    const cx = h.x * cell + cell / 2;
    const cy = h.y * cell + cell / 2;
    const ox = dir.y !== 0 ? cell * 0.2 : 0;
    const oy = dir.x !== 0 ? cell * 0.2 : 0;
    for (const sgn of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(cx + dir.x * cell * 0.15 + ox * sgn, cy + dir.y * cell * 0.15 + oy * sgn, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.fill();
  }

  // ---------- Управление ----------
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up',
    ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left',
    ArrowRight: 'right', KeyD: 'right',
  };

  document.addEventListener('keydown', (e) => {
    if (e.target === nameInput) return;
    if (KEYS[e.code]) {
      e.preventDefault();
      turn(KEYS[e.code]);
    } else if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      if (state === 'running' || state === 'paused') togglePause();
      else start();
    }
  });

  startBtn.addEventListener('click', () => (state === 'paused' ? togglePause() : start()));

  document.querySelectorAll('.dpad button').forEach((b) =>
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); turn(b.dataset.dir); })
  );

  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    touchStart = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    touchStart = null;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
    turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
  });

  // ---------- Таблица рекордов (Vercel API) ----------
  async function loadScores() {
    try {
      const res = await fetch('/api/scores');
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      renderScores(data.scores);
      storageNote.textContent = data.persistent
        ? ''
        : 'Хранилище не подключено: рекорды сбрасываются при перезапуске сервера.';
    } catch {
      scoresEl.innerHTML = '<li class="muted">Сервер недоступен</li>';
    }
  }

  function renderScores(list) {
    scoresEl.innerHTML = '';
    if (!list.length) {
      scoresEl.innerHTML = '<li class="muted">Пока пусто — будьте первым!</li>';
      return;
    }
    for (const s of list) {
      const li = document.createElement('li');
      li.textContent = s.name;
      const b = document.createElement('span');
      b.textContent = s.score;
      li.appendChild(b);
      scoresEl.appendChild(li);
    }
  }

  saveForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    safeSet('snake-name', name);
    const btn = saveForm.querySelector('button');
    btn.disabled = true;
    try {
      const res = await fetch('/api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score }),
      });
      if (!res.ok) throw new Error(res.status);
      renderScores((await res.json()).scores);
      saveForm.hidden = true;
    } catch {
      alert('Не удалось сохранить результат');
    } finally {
      btn.disabled = false;
    }
  });

  reset();
  draw();
  state = 'idle';
  loadScores();
})();
