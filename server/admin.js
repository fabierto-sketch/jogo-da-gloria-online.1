'use strict';

/**
 * API do painel de administração.
 * - Palavra-passe exclusivamente em ADMIN_PASSWORD (nunca no navegador).
 * - Sessões no servidor/base de dados (só o hash do token), cookie HttpOnly + SameSite=Strict.
 * - Todas as rotas (exceto login/sessão) exigem sessão; alterações exigem X-Requested-With.
 */

const express = require('express');
const crypto = require('crypto');
const { randomToken, safeEqual, rateLimitMiddleware, RateLimiter } = require('./security');
const { normalizeCode, CODE_REGEX, MODES } = require('./rooms');
const { hasTurn } = require('./webrtc');
const logger = require('./logger');

const COOKIE = 'gloria_admin';
const TTL = Number(process.env.ADMIN_SESSION_HOURS || 12) * 3_600_000;
const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');

function cookies(header) {
  const out = {};
  for (const part of (header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

function createAdminRouter({ db, manager, settings, io, startedAt }) {
  const router = express.Router();
  const failed = new RateLimiter({ windowMs: 15 * 60_000, max: 8 });
  const configured = () => typeof process.env.ADMIN_PASSWORD === 'string' && process.env.ADMIN_PASSWORD.length >= 6;
  if (!configured()) logger.warn('ADMIN_PASSWORD não está definida (mínimo 6 caracteres). A administração está desativada.');
  setInterval(() => db.run('DELETE FROM admin_sessions WHERE expires_at < $1', [Date.now()]).catch(() => {}), 30 * 60_000).unref();

  const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
  const setCookie = (req, res, v, ms) =>
    res.setHeader('Set-Cookie', [`${COOKIE}=${v}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', `Max-Age=${Math.floor(ms / 1000)}`, ...(req.secure ? ['Secure'] : [])].join('; '));

  async function session(req) {
    const token = cookies(req.headers.cookie)[COOKIE];
    if (!token || token.length > 100) return null;
    const row = await db.one('SELECT token_hash, expires_at FROM admin_sessions WHERE token_hash = $1', [hash(token)]);
    return row && Number(row.expires_at) > Date.now() ? { tokenHash: row.token_hash } : null;
  }

  const requireAdmin = wrap(async (req, res, next) => {
    const s = await session(req);
    if (!s) {
      logger.warn(`Acesso administrativo negado: ${req.method} ${req.originalUrl} [${req.ip}]`);
      return res.status(401).json({ ok: false, error: 'UNAUTHORIZED', message: 'Acesso reservado ao administrador.' });
    }
    if (req.method !== 'GET' && req.get('X-Requested-With') !== 'jogo-da-gloria') return res.status(403).json({ ok: false, error: 'FORBIDDEN' });
    req.adminSession = s;
    next();
  });

  const invite = (req, code) => `${(process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '')}/?sala=${code}`;
  const roomCode = (req, res) => {
    const code = normalizeCode(req.params.code);
    if (!CODE_REGEX.test(code)) {
      res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND', message: 'Sala não encontrada.' });
      return null;
    }
    return code;
  };
  const notFound = (res) => res.status(404).json({ ok: false, error: 'ROOM_NOT_FOUND', message: 'Sala não encontrada.' });

  router.use(express.json({ limit: '200kb' }));
  router.use(rateLimitMiddleware({ windowMs: 60_000, max: 300 }));

  router.get('/session', wrap(async (req, res) => res.json({ ok: true, configured: configured(), authenticated: !!(await session(req)) })));

  router.post(
    '/login',
    wrap(async (req, res) => {
      if (!configured()) return res.status(503).json({ ok: false, error: 'NOT_CONFIGURED', message: 'Defina ADMIN_PASSWORD no servidor.' });
      if (!failed.hit(req.ip)) {
        logger.warn(`Login de administrador bloqueado temporariamente [${req.ip}]`);
        return res.status(429).json({ ok: false, error: 'RATE_LIMITED', message: 'Demasiadas tentativas. Aguarde 15 minutos.' });
      }
      const password = req.body && typeof req.body.password === 'string' ? req.body.password : '';
      if (!safeEqual(password, process.env.ADMIN_PASSWORD)) {
        logger.warn(`Tentativa de login de administrador falhada [${req.ip}]`);
        return res.status(401).json({ ok: false, error: 'INVALID_PASSWORD', message: 'Palavra-passe incorreta.' });
      }
      failed.reset(req.ip);
      const token = randomToken(32);
      const now = Date.now();
      await db.run('INSERT INTO admin_sessions (token_hash, created_at, expires_at, ip) VALUES ($1, $2, $3, $4)', [hash(token), now, now + TTL, req.ip]);
      setCookie(req, res, token, TTL);
      logger.admin(`Administrador autenticado [${req.ip}]`);
      res.json({ ok: true });
    })
  );

  router.post(
    '/logout',
    wrap(async (req, res) => {
      const s = await session(req);
      if (s) await db.run('DELETE FROM admin_sessions WHERE token_hash = $1', [s.tokenHash]);
      setCookie(req, res, '', 0);
      res.json({ ok: true });
    })
  );

  router.post(
    '/sessions/logout-all',
    requireAdmin,
    wrap(async (req, res) => {
      const n = await db.run('DELETE FROM admin_sessions');
      setCookie(req, res, '', 0);
      logger.admin(`Todas as sessões de administrador terminadas (${n})`);
      res.json({ ok: true, count: n });
    })
  );

  /* ---------- Salas ---------- */
  router.get(
    '/rooms',
    requireAdmin,
    wrap(async (req, res) => {
      const rooms = await manager.listRooms();
      res.json({ ok: true, rooms: rooms.map((r) => ({ ...r, inviteUrl: invite(req, r.code) })) });
    })
  );

  router.post(
    '/rooms',
    requireAdmin,
    wrap(async (req, res) => {
      try {
        const room = await manager.createRoom({ label: req.body && req.body.label });
        res.status(201).json({ ok: true, room: { ...room, inviteUrl: invite(req, room.code) } });
      } catch (err) {
        if (err.code === 'MAX_ROOMS') return res.status(400).json({ ok: false, error: err.code, message: err.message });
        throw err;
      }
    })
  );

  router.post(
    '/rooms/:code/close',
    requireAdmin,
    wrap(async (req, res) => {
      const code = roomCode(req, res);
      if (!code) return;
      if (!(await manager.closeRoom(code))) return notFound(res);
      res.json({ ok: true });
    })
  );

  router.post(
    '/rooms/:code/reopen',
    requireAdmin,
    wrap(async (req, res) => {
      const code = roomCode(req, res);
      if (!code) return;
      if (!(await manager.reopenRoom(code))) return notFound(res);
      res.json({ ok: true });
    })
  );

  router.post(
    '/rooms/:code/clear-history',
    requireAdmin,
    wrap(async (req, res) => {
      const code = roomCode(req, res);
      if (!code) return;
      const room = await manager.getRoom(code);
      if (!room) return notFound(res);
      await manager.withLock(room, () => manager.clearHistory(room));
      io.to(code).emit('history:cleared');
      manager.broadcast(room);
      logger.admin(`Histórico da sala ${code} apagado`);
      res.json({ ok: true });
    })
  );

  router.delete(
    '/rooms/:code',
    requireAdmin,
    wrap(async (req, res) => {
      const code = roomCode(req, res);
      if (!code) return;
      if (!(await manager.deleteRoom(code))) return notFound(res);
      res.json({ ok: true });
    })
  );

  /* ---------- Estatísticas ---------- */
  router.get(
    '/stats',
    requireAdmin,
    wrap(async (req, res) => {
      const [created, rooms, open, games, byWinner, matches, recent, daily, allStats] = await Promise.all([
        db.getMeta('rooms_created'),
        db.one('SELECT COUNT(*) AS n FROM rooms'),
        db.one("SELECT COUNT(*) AS n FROM rooms WHERE status = 'open'"),
        db.one('SELECT COUNT(*) AS n FROM games'),
        db.query('SELECT winner, COUNT(*) AS n FROM games GROUP BY winner'),
        db.one('SELECT COUNT(*) AS n FROM matches'),
        db.query('SELECT room_code, mode, variant, number, x_name, o_name, winner, summary, ended_at FROM games ORDER BY ended_at DESC LIMIT 25'),
        db.query('SELECT ended_at FROM games WHERE ended_at > $1', [Date.now() - 14 * 86_400_000]),
        db.query('SELECT summary, winner, starter FROM games'),
      ]);
      const totals = { rolls: 0, known: 0, quiz: 0, challenges: 0, talks: 0 };
      for (const row of allStats) {
        try {
          const sm = JSON.parse(row.summary || '{}');
          for (const seat of ['X', 'O']) for (const k of Object.keys(totals)) totals[k] += (sm.stats && sm.stats[seat] && sm.stats[seat][k]) || 0;
        } catch {
          /* ignora */
        }
      }
      const w = Object.fromEntries(byWinner.map((r) => [r.winner, Number(r.n)]));
      const perDay = {};
      for (let i = 13; i >= 0; i--) perDay[new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)] = 0;
      for (const g of daily) {
        const d = new Date(Number(g.ended_at)).toISOString().slice(0, 10);
        if (d in perDay) perDay[d]++;
      }
      res.json({
        ok: true,
        roomsCreated: Number(created || 0),
        rooms: Number(rooms.n),
        openRooms: Number(open.n),
        live: manager.liveStats(),
        games: Number(games.n),
        matches: Number(matches.n),
        winsX: w.X || 0,
        winsO: w.O || 0,
        draws: w.draw || 0,
        totals,
        perDay,
        recent: recent.map((g) => ({ ...g, summary: (() => { try { return JSON.parse(g.summary); } catch { return null; } })(), ended_at: Number(g.ended_at) })),
      });
    })
  );

  /* ---------- Definições ---------- */
  router.get('/settings', requireAdmin, (req, res) => res.json({ ok: true, settings: settings.all(), modes: Object.values(MODES) }));

  router.put(
    '/settings',
    requireAdmin,
    wrap(async (req, res) => {
      const r = await settings.update(req.body || {});
      if (!r.ok) return res.status(400).json({ ok: false, errors: r.errors, message: r.errors.join(' ') });
      logger.admin('Definições do jogo atualizadas');
      res.json({ ok: true, settings: r.values });
    })
  );

  router.post(
    '/settings/reset-challenges',
    requireAdmin,
    wrap(async (req, res) => {
      const r = await settings.resetChallenges();
      res.json({ ok: true, settings: r.values });
    })
  );

  router.get('/activity', requireAdmin, (req, res) => {
    const mem = process.memoryUsage();
    res.json({
      ok: true,
      server: { startedAt, uptimeSec: Math.round(process.uptime()), memoryMb: Math.round(mem.rss / 1048576), sockets: io.engine.clientsCount, database: db.kind, turnConfigured: hasTurn(), node: process.version },
      live: manager.liveStats(),
      log: logger.recent(150),
    });
  });

  return router;
}

module.exports = { createAdminRouter };
