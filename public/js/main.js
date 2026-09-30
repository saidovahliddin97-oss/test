// Интерфейс, состояния игры и главный цикл.
import { Game, SKINS, WORLD_SIZE, segmentColor } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';

const $ = (id) => document.getElementById(id);

const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* приватный режим */ }
  },
};

const settings = { skin: 'violet', glow: true, names: true, ...store.get('snaky-settings', {}) };
let best = store.get('snaky-best', 0);

const game = new Game();
const renderer = new Renderer($('canvas'));
const input = new Input({
  canvas: $('canvas'),
  joyZone: $('joy-zone'),
  joyBase: $('joy-base'),
  joyKnob: $('joy-knob'),
  boostBtn: $('boost-btn'),
});
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;

// state: menu | playing | paused | dying | over
let state = 'menu';
let dyingTimer = 0;
let settingsReturn = 'menu';
let deathInfo = null;
let hudTimer = 0;

const cam = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2, zoom: renderer.baseZoom };
let menuFocus = null;

// ---------- Экраны ----------
const SCREENS = ['menu', 'pause', 'gameover', 'settings'];

function show(screen) {
  for (const s of SCREENS) $(s).hidden = s !== screen;
  const inGame = state === 'playing' || state === 'dying' || state === 'paused';
  $('hud').hidden = !inGame;
  $('touch').hidden = !(isTouch && state === 'playing');
  input.enabled = state === 'playing';
}

function setState(next, screen = null) {
  state = next;
  show(screen);
}

// ---------- Меню ----------
$('name-input').value = store.get('snaky-name', '');
$('best-score').textContent = best;

function playerName() {
  const name = $('name-input').value.trim().slice(0, 16);
  return name || 'Player';
}

function startGame() {
  store.set('snaky-name', $('name-input').value.trim());
  game.reset();
  const skin = SKINS.find((s) => s.id === settings.skin) || SKINS[0];
  const p = game.addPlayer(playerName(), skin);
  cam.x = p.head.x;
  cam.y = p.head.y;
  input.reset();
  deathInfo = null;
  setState('playing');
  updateHud(true);
}

function pause() {
  if (state !== 'playing') return;
  input.clear();
  setState('paused', 'pause');
}

function resume() {
  if (state !== 'paused') return;
  setState('playing');
}

function toMenu() {
  $('best-score').textContent = best;
  setState('menu', 'menu');
}

function openSettings(from) {
  settingsReturn = from;
  renderSkins();
  $('opt-glow').checked = settings.glow;
  $('opt-names').checked = settings.names;
  show('settings');
}

function closeSettings() {
  store.set('snaky-settings', settings);
  show(settingsReturn);
}

$('play-btn').addEventListener('click', startGame);
$('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') startGame(); });
$('menu-settings-btn').addEventListener('click', () => openSettings('menu'));
$('exit-btn').addEventListener('click', () => {
  window.close();
  setTimeout(() => toast('Чтобы выйти, просто закройте вкладку 👋'), 150);
});
$('pause-btn').addEventListener('click', pause);
$('resume-btn').addEventListener('click', resume);
$('pause-close').addEventListener('click', resume);
$('pause-settings-btn').addEventListener('click', () => openSettings('pause'));
$('pause-menu-btn').addEventListener('click', toMenu);
$('again-btn').addEventListener('click', startGame);
$('go-menu-btn').addEventListener('click', toMenu);
$('settings-close').addEventListener('click', closeSettings);
$('settings-done').addEventListener('click', closeSettings);
$('opt-glow').addEventListener('change', (e) => { settings.glow = e.target.checked; });
$('opt-names').addEventListener('change', (e) => { settings.names = e.target.checked; });

function renderSkins() {
  const box = $('skins');
  box.innerHTML = '';
  for (const skin of SKINS) {
    const b = document.createElement('button');
    b.className = 'skin' + (skin.id === settings.skin ? ' selected' : '');
    b.title = skin.name;
    b.setAttribute('aria-label', skin.name);
    const stops = Array.from({ length: 6 }, (_, i) => segmentColor(skin, i * 3, 18)).join(',');
    b.style.background = `linear-gradient(135deg, ${stops})`;
    b.addEventListener('click', () => { settings.skin = skin.id; renderSkins(); });
    box.appendChild(b);
  }
}

addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (!$('settings').hidden) closeSettings();
    else if (state === 'playing') pause();
    else if (state === 'paused') resume();
  } else if (e.code === 'Enter' && state === 'over' && e.target.tagName !== 'INPUT') {
    startGame();
  }
});

document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

// ---------- HUD ----------
function esc(s) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function boardRow(rank, name, score, me) {
  return `<li class="${me ? 'me' : ''}"><span class="rank">${rank}.</span><span class="name">${esc(name)}</span><span class="pts">${Math.floor(score)}</span></li>`;
}

function updateHud(force = false) {
  const p = game.player;
  if (!p) return;
  $('hud-score').textContent = Math.floor(p.score);
  $('hud-length').textContent = p.segs.length;
  if (!force && hudTimer > 0) return;
  hudTimer = 0.25;

  const board = game.leaderboard();
  const top = innerWidth < 420 ? 3 : 5;
  let html = board.slice(0, top).map((s, i) => boardRow(i + 1, s.name, s.score, s === p)).join('');
  const myRank = board.indexOf(p);
  if (myRank >= top) html += '<li class="gap">···</li>' + boardRow(myRank + 1, p.name, p.score, true);
  $('hud-board').innerHTML = html;
}

let toastTimer = 0;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
}

// ---------- События мира ----------
function handleEvents() {
  for (const ev of game.events) {
    if (ev.type !== 'death') continue;
    if (ev.victim === game.player) {
      deathInfo = ev;
      state = 'dying';
      dyingTimer = 1.4;
      input.clear();
      $('touch').hidden = true;
    } else if (ev.killer === game.player) {
      toast(`💥 Вы победили ${ev.victim.name}!`);
    }
  }
  game.events.length = 0;
}

function gameOver() {
  const p = game.player;
  const score = Math.floor(p.score);
  const reason = deathInfo?.killer ? `Вас подрезал ${deathInfo.killer.name}` : 'Вы врезались в границу арены';
  $('go-reason').textContent = reason;
  $('go-score').textContent = score;
  $('go-length').textContent = p.segs.length;
  $('go-kills').textContent = p.kills;
  const isRecord = score > best;
  $('go-record').hidden = !isRecord;
  if (isRecord) {
    best = score;
    store.set('snaky-best', best);
  }
  setState('over', 'gameover');
  submitScore(p.name, score);
}

// ---------- Мировой рейтинг (Vercel API) ----------
function renderWorld(list, persistent) {
  const me = playerName();
  $('world-board').innerHTML = list.length
    ? list.slice(0, 5).map((s, i) => boardRow(i + 1, s.name, s.score, s.name === me)).join('')
    : '<li class="muted">Пока пусто — станьте первым!</li>';
  if (!persistent) $('world-board').insertAdjacentHTML('beforeend', '<li class="muted">Хранилище не подключено</li>');
}

// На статическом хостинге (GitHub Pages) API нет — тогда блок рейтинга просто скрыт.
let apiAvailable = null;

async function submitScore(name, score) {
  if (apiAvailable === false) return;
  $('world-board').innerHTML = '<li class="muted">Загрузка…</li>';
  try {
    const res = score > 0
      ? await fetch('api/scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, score }),
      })
      : await fetch('api/scores');
    if (!res.ok || !(res.headers.get('content-type') || '').includes('json')) throw new Error(res.status);
    const data = await res.json();
    apiAvailable = true;
    $('world-top').hidden = false;
    renderWorld(data.scores, data.persistent);
  } catch {
    if (apiAvailable) {
      $('world-board').innerHTML = '<li class="muted">Сервер недоступен</li>';
    } else {
      apiAvailable = false;
      $('world-top').hidden = true;
    }
  }
}

// ---------- Камера ----------
function updateCamera(dt) {
  let target = null;
  const p = game.player;
  if (p && (state === 'playing' || state === 'paused')) {
    target = p;
  } else if (state === 'menu' || state === 'over') {
    // На фоне меню камера следит за одним из ботов.
    if (!menuFocus || !menuFocus.alive) menuFocus = game.leaderboard()[Math.floor(Math.random() * 4)] || null;
    target = menuFocus;
  }
  if (target) {
    const k = Math.min(1, dt * 6);
    cam.x += (target.head.x - cam.x) * k;
    cam.y += (target.head.y - cam.y) * k;
  }
  const r = target ? target.radius : 10;
  const zoomTarget = renderer.baseZoom * (1.08 - Math.min(0.42, (r - 10) * 0.024));
  cam.zoom += (zoomTarget - cam.zoom) * Math.min(1, dt * 2);
}

// ---------- Главный цикл ----------
let last = performance.now();

function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (state === 'playing' && game.player) {
    input.apply(game.player, renderer.worldToScreen(cam, game.player.head.x, game.player.head.y));
  }
  if (state !== 'paused') {
    game.update(dt);
    handleEvents();
  }
  if (state === 'dying') {
    dyingTimer -= dt;
    if (dyingTimer <= 0) gameOver();
  }

  updateCamera(dt);
  renderer.draw(game, cam, settings, now / 1000);

  if (state === 'playing' || state === 'dying') {
    hudTimer -= dt;
    updateHud();
  }
  requestAnimationFrame(frame);
}

show('menu');
requestAnimationFrame(frame);
