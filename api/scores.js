// Vercel Serverless Function: GET /api/scores — топ-10, POST /api/scores — сохранить результат.
// Хранилище: Upstash Redis (подключается в Vercel → Storage → Upstash Redis),
// переменные окружения KV_REST_API_URL / KV_REST_API_TOKEN (или UPSTASH_REDIS_REST_*).
// Без них используется память процесса — работает, но рекорды не переживают перезапуск.

const KEY = 'snake:scores';
const TOP = 10;
const MAX_SCORE = 20 * 20 * 10;

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const persistent = Boolean(REDIS_URL && REDIS_TOKEN);

const memory = [];

async function redis(command) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: JSON.stringify(command),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  return (await res.json()).result;
}

async function getTop() {
  if (!persistent) return memory.slice(0, TOP);
  const raw = await redis(['ZRANGE', KEY, 0, TOP - 1, 'REV', 'WITHSCORES']);
  const list = [];
  for (let i = 0; i < raw.length; i += 2) {
    list.push({ name: JSON.parse(raw[i]).name, score: Number(raw[i + 1]) });
  }
  return list;
}

async function addScore(name, score) {
  if (!persistent) {
    memory.push({ name, score });
    memory.sort((a, b) => b.score - a.score);
    memory.length = Math.min(memory.length, TOP);
    return;
  }
  const member = JSON.stringify({ name, t: Date.now(), r: Math.random().toString(36).slice(2, 8) });
  await redis(['ZADD', KEY, score, member]);
  // Храним только лучшие 100 записей.
  await redis(['ZREMRANGEBYRANK', KEY, 0, -101]);
}

export default async function handler(req, res) {
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ scores: await getTop(), persistent });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body || {};
      const name = String(body.name || '').trim().slice(0, 16);
      const score = Number(body.score);

      if (!name) return res.status(400).json({ error: 'Имя обязательно' });
      if (!Number.isInteger(score) || score <= 0 || score > MAX_SCORE || score % 10 !== 0) {
        return res.status(400).json({ error: 'Некорректный счёт' });
      }

      await addScore(name, score);
      return res.status(201).json({ scores: await getTop(), persistent });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
}
