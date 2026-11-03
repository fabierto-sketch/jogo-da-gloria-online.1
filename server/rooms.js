'use strict';

/**
 * Salas, jogadores, modos de jogo, pontuação, reações e chat — em tempo real.
 *
 * Fases de uma sala:
 *   lobby      → escolher o modo e a peça; espera pelos dois jogadores
 *   playing    → viagem em curso (dados, casas e cartas resolvidos no servidor)
 *   between    → partida terminada, encontro a decorrer (próxima partida)
 *   matchover  → encontro terminado (vencedor do melhor de 3/5, campeonato, etc.)
 *
 * O estado é guardado na base de dados após cada alteração: atualizar a página
 * ou reiniciar o servidor não perde nada.
 */

const crypto = require('crypto');
const logger = require('./logger');
const { RateLimiter, cleanText, randomToken, socketIp } = require('./security');
const { Game, other, boardMap } = require('./game-engine');
const { decks: buildDecks } = require('./settings');
const { FUN } = require('./settings');

const SEATS = ['X', 'O'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_REGEX = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 200);

const MODES = {
  classic: { id: 'classic', name: 'Partida clássica', emoji: '⚔️', description: 'Uma única viagem decide tudo.', single: true, scoring: true },
  bo3: { id: 'bo3', name: 'Melhor de três', emoji: '🥉', description: 'Vence quem ganhar duas viagens.', target: 2, scoring: true },
  bo5: { id: 'bo5', name: 'Melhor de cinco', emoji: '🏅', description: 'Vence quem ganhar três viagens.', target: 3, scoring: true },
  championship: { id: 'championship', name: 'Campeonato', emoji: '🏆', description: 'Viagens sucessivas com classificação; terminam quando quiserem.', endless: true, scoring: true },
  surprise: { id: 'surprise', name: 'Desafio surpresa', emoji: '🎁', description: 'Cada viagem tem um desafio extra para quem perder.', endless: true, scoring: true, challenges: true },
  casual: { id: 'casual', name: 'Jogo descontraído', emoji: '😌', description: 'Sem pontuação, só pelo prazer de jogar e conversar.', endless: true, scoring: false },
};

const REACTIONS = {
  clap: { emoji: '👏', label: 'Aplausos' },
  heart: { emoji: '❤️', label: 'Coração' },
  laugh: { emoji: '😂', label: 'Gargalhada' },
  fire: { emoji: '🔥', label: 'Que sorte!' },
  kiss: { emoji: '😘', label: 'Beijinho' },
  plane: { emoji: '✈️', label: 'Estou a chegar!' },
  wow: { emoji: '😮', label: 'Uau' },
  party: { emoji: '🎉', label: 'Celebrar' },
  cry: { emoji: '😭', label: 'Ai…' },
  taunt: { emoji: '😏', label: 'Provocar' },
};

const ERRORS = {
  INVALID_CODE: 'Código de sala inválido. O código tem 6 caracteres.',
  ROOM_NOT_FOUND: 'Sala não encontrada. Confirma o código ou o convite.',
  ROOM_CLOSED: 'Esta sala foi encerrada pelo administrador.',
  ROOM_FULL: 'Esta sala já tem dois jogadores.',
  NAME_REQUIRED: 'Escreve o teu nome para entrar.',
  NOT_IN_ROOM: 'Não estás nesta sala.',
  WAITING_OPPONENT: 'Aguarda que o adversário entre.',
  OPPONENT_OFFLINE: 'O adversário está desligado. Aguarda que volte.',
  NOT_YOUR_TURN: 'Ainda não é a tua vez.',
  CARD_PENDING: 'Primeiro resolvam a carta em jogo.',
  NO_CARD: 'Não há nenhuma carta por resolver.',
  INVALID_ANSWER: 'Resposta inválida.',
  INVALID_TOKEN: 'Peça inválida.',
  GAME_OVER: 'Esta viagem já terminou.',
  STALE_MOVE: 'Ação repetida ou fora de sincronia.',
  WRONG_PHASE: 'Essa ação não está disponível agora.',
  INVALID_MODE: 'Modo de jogo inválido.',
  NOT_ALLOWED: 'Não tens permissão para isso.',
  DISABLED: 'Esta funcionalidade foi desativada pelo administrador.',
  INVALID_MESSAGE: 'Mensagem inválida.',
  RATE_LIMITED: 'Calma! Demasiados pedidos seguidos.',
  NO_REQUEST: 'Não há nenhum pedido pendente.',
  SERVER_ERROR: 'Ocorreu um erro inesperado. Tenta novamente.',
};

const hashToken = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const json = (v) => JSON.stringify(v);
const parse = (v, d) => {
  if (!v) return d;
  try {
    return JSON.parse(v);
  } catch {
    return d;
  }
};
const newId = () => crypto.randomBytes(9).toString('base64url');
const normalizeCode = (v) => (typeof v === 'string' ? v.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) : '');

function emptyStats() {
  return {
    games: 0,
    draws: 0,
    X: { wins: 0, losses: 0, streak: 0, best: 0, points: 0, known: 0, quiz: 0, challenges: 0, talks: 0, rolls: 0 },
    O: { wins: 0, losses: 0, streak: 0, best: 0, points: 0, known: 0, quiz: 0, challenges: 0, talks: 0, rolls: 0 },
  };
}

function mergeStats(saved) {
  const base = emptyStats();
  return { ...base, ...saved, X: { ...base.X, ...(saved.X || {}) }, O: { ...base.O, ...(saved.O || {}) } };
}

const TOKENS = ['man', 'woman', 'car', 'plane', 'dog', 'cat', 'rabbit', 'bear', 'heart', 'star'];

function freshState(mode) {
  return { phase: 'lobby', mode, tokens: { X: 'man', O: 'woman' }, match: null, game: null, nextStarter: 'X', challenge: null, challengeDone: null, autoNextAt: null, clearRequest: null, lastResult: null };
}

class RoomManager {
  constructor({ db, settings }) {
    this.db = db;
    this.settings = settings;
    this.rooms = new Map();
    this.loading = new Map();
    this.timers = new Map();
    this.io = null;
  }

  attach(io) {
    this.io = io;
  }

  /* ================================================================ */
  /* Persistência                                                      */
  /* ================================================================ */

  async getRoom(code) {
    if (this.rooms.has(code)) return this.rooms.get(code);
    if (this.loading.has(code)) return this.loading.get(code);
    const p = this.loadRoom(code).finally(() => this.loading.delete(code));
    this.loading.set(code, p);
    return p;
  }

  async loadRoom(code) {
    const row = await this.db.one('SELECT * FROM rooms WHERE code = $1', [code]);
    if (!row) return null;
    const players = await this.db.query('SELECT * FROM players WHERE room_code = $1 AND active = 1', [code]);
    const room = {
      code,
      label: row.label || '',
      status: row.status || 'open',
      createdAt: Number(row.created_at),
      lastActivity: Number(row.last_activity),
      state: { ...freshState(this.settings.get('defaultMode')), ...parse(row.state, {}) },
      stats: mergeStats(parse(row.stats, {})),
      seats: { X: null, O: null },
      lock: Promise.resolve(),
      lastReact: { X: 0, O: 0 },
    };
    for (const p of players) {
      room.seats[p.seat] = { tokenHash: p.token_hash, name: p.name, joinedAt: Number(p.joined_at), lastSeen: Number(p.last_seen), connected: false, socketId: null };
    }
    this.rooms.set(code, room);
    this.scheduleAutoNext(room);
    return room;
  }

  async save(room) {
    room.lastActivity = Date.now();
    await this.db.run('UPDATE rooms SET state = $2, stats = $3, last_activity = $4, status = $5 WHERE code = $1', [
      room.code,
      json(room.state),
      json(room.stats),
      room.lastActivity,
      room.status,
    ]);
  }

  withLock(room, fn) {
    const run = room.lock.then(fn, fn);
    room.lock = run.catch(() => {});
    return run;
  }

  async systemMessage(room, text) {
    const msg = { id: newId(), seat: null, name: null, text, kind: 'system', at: Date.now() };
    await this.db.run('INSERT INTO chat_messages (id, room_code, seat, name, text, kind, at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      msg.id,
      room.code,
      null,
      null,
      text,
      'system',
      msg.at,
    ]);
    if (this.io) this.io.to(room.code).emit('chat:message', msg);
  }

  /* ================================================================ */
  /* Administração                                                     */
  /* ================================================================ */

  async createRoom({ label } = {}) {
    const n = await this.db.one('SELECT COUNT(*) AS n FROM rooms');
    if (Number(n.n) >= MAX_ROOMS) {
      const e = new Error('Limite de salas atingido.');
      e.code = 'MAX_ROOMS';
      throw e;
    }
    let code;
    do {
      code = Array.from({ length: 6 }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
    } while (await this.db.one('SELECT code FROM rooms WHERE code = $1', [code]));
    const now = Date.now();
    const clean = cleanText(label || '', 40);
    await this.db.run('INSERT INTO rooms (code, label, created_at, last_activity, status, state, stats) VALUES ($1, $2, $3, $3, $4, $5, $6)', [
      code,
      clean,
      now,
      'open',
      json(freshState(this.settings.get('defaultMode'))),
      json(emptyStats()),
    ]);
    const c = Number((await this.db.getMeta('rooms_created')) || 0) + 1;
    await this.db.setMeta('rooms_created', c);
    logger.admin(`Sala ${code} criada${clean ? ` (${clean})` : ''}`);
    return { code, label: clean };
  }

  kickAll(room, event, message) {
    if (!this.io) return;
    for (const seat of SEATS) {
      const s = this.socketOf(room, seat);
      if (s) {
        s.emit(event, { message });
        s.leave(room.code);
        s.data.code = null;
        s.data.seat = null;
      }
    }
  }

  /** Encerra a sala: os jogadores saem e ninguém entra até ser reaberta. */
  async closeRoom(code) {
    const room = await this.getRoom(code);
    if (!room) return false;
    return this.withLock(room, async () => {
      this.kickAll(room, 'room:closed', 'A sala foi encerrada pelo administrador.');
      await this.db.run('UPDATE players SET active = 0 WHERE room_code = $1', [code]);
      room.seats = { X: null, O: null };
      room.status = 'closed';
      if (room.state.phase === 'playing' || room.state.phase === 'between') room.state = { ...freshState(room.state.mode), tokens: room.state.tokens, nextStarter: room.state.nextStarter };
      await this.save(room);
      logger.admin(`Sala ${code} encerrada`);
      return true;
    });
  }

  async reopenRoom(code) {
    const room = await this.getRoom(code);
    if (!room) return false;
    room.status = 'open';
    await this.save(room);
    logger.admin(`Sala ${code} reaberta`);
    return true;
  }

  async deleteRoom(code) {
    const exists = await this.db.one('SELECT code FROM rooms WHERE code = $1', [code]);
    if (!exists) return false;
    const room = this.rooms.get(code);
    if (room) this.kickAll(room, 'room:closed', 'A sala foi eliminada pelo administrador.');
    this.rooms.delete(code);
    clearTimeout(this.timers.get(code));
    await this.db.tx(async (q) => {
      for (const t of ['players', 'games', 'matches', 'chat_messages']) await q(`DELETE FROM ${t} WHERE room_code = $1`, [code]);
      await q('DELETE FROM rooms WHERE code = $1', [code]);
    });
    logger.admin(`Sala ${code} eliminada`);
    return true;
  }

  async clearHistory(room) {
    await this.db.tx(async (q) => {
      for (const t of ['games', 'matches', 'chat_messages']) await q(`DELETE FROM ${t} WHERE room_code = $1`, [room.code]);
    });
    room.stats = emptyStats();
    room.state.clearRequest = null;
    if (room.state.match) room.state.match.scores = { X: 0, O: 0, draws: 0 };
    await this.save(room);
  }

  async listRooms() {
    const rows = await this.db.query('SELECT code, label, created_at, last_activity, status, state, stats FROM rooms ORDER BY created_at DESC');
    const players = await this.db.query('SELECT room_code, seat, name, last_seen FROM players WHERE active = 1');
    return rows.map((r) => {
      const live = this.rooms.get(r.code);
      const state = live ? live.state : parse(r.state, {});
      const stats = live ? live.stats : parse(r.stats, emptyStats());
      const seats = {};
      for (const seat of SEATS) {
        const p = players.find((x) => x.room_code === r.code && x.seat === seat);
        const lp = live && live.seats[seat];
        seats[seat] = p ? { name: p.name, connected: !!(lp && lp.connected), lastSeen: Number(lp ? lp.lastSeen : p.last_seen) } : null;
      }
      return {
        code: r.code,
        label: r.label,
        status: live ? live.status : r.status,
        createdAt: Number(r.created_at),
        lastActivity: Number(live ? live.lastActivity : r.last_activity),
        phase: state.phase || 'lobby',
        mode: state.mode,
        stats,
        seats,
      };
    });
  }

  liveStats() {
    let online = 0;
    let active = 0;
    for (const room of this.rooms.values()) {
      const n = SEATS.filter((s) => room.seats[s] && room.seats[s].connected).length;
      online += n;
      if (n) active++;
    }
    return { online, active };
  }

  /* ================================================================ */
  /* Estado público                                                    */
  /* ================================================================ */

  socketOf(room, seat) {
    const p = room.seats[seat];
    return (p && p.socketId && this.io && this.io.sockets.sockets.get(p.socketId)) || null;
  }

  publicState(room, seat) {
    const s = room.state;
    const mode = MODES[s.mode] || MODES.bo3;
    return {
      code: room.code,
      label: room.label,
      status: room.status,
      seats: Object.fromEntries(SEATS.map((seat) => [seat, room.seats[seat] ? { name: room.seats[seat].name, connected: room.seats[seat].connected } : null])),
      phase: s.phase,
      mode: s.mode,
      modeInfo: mode,
      tokens: s.tokens || { X: 'man', O: 'woman' },
      match: s.match,
      game: s.game ? Game.from(s.game).view() : null,
      challenge: s.challenge,
      challengeDone: s.challengeDone,
      autoNextAt: s.autoNextAt,
      clearRequest: s.clearRequest,
      lastResult: s.lastResult,
      stats: room.stats,
      serverTime: Date.now(),
    };
  }

  /** Envia a cada jogador a SUA vista do estado (sem a frota do adversário). */
  broadcast(room) {
    if (!this.io) return;
    for (const seat of SEATS) {
      const s = this.socketOf(room, seat);
      if (s) s.emit('room:state', this.publicState(room, seat));
    }
  }

  notify(room, event, exceptSeat) {
    for (const seat of SEATS) {
      if (seat === exceptSeat) continue;
      const s = this.socketOf(room, seat);
      if (s) s.emit('room:event', { ...event, at: Date.now() });
    }
  }

  async context(socket) {
    const { code, seat, tokenHash } = socket.data || {};
    if (!code || !seat) return null;
    const room = await this.getRoom(code);
    return this.validate(room, socket);
  }

  contextSync(socket) {
    const room = socket.data && socket.data.code && this.rooms.get(socket.data.code);
    return room ? this.validate(room, socket) : null;
  }

  validate(room, socket) {
    if (!room) return null;
    const { seat, tokenHash } = socket.data;
    const player = room.seats[seat];
    if (!player || player.tokenHash !== tokenHash || player.socketId !== socket.id) return null;
    return { room, seat, player };
  }

  /* ================================================================ */
  /* Jogo                                                              */
  /* ================================================================ */

  async startMatch(room) {
    const mode = MODES[room.state.mode];
    room.state.match = { id: newId(), mode: mode.id, scores: { X: 0, O: 0, draws: 0 }, games: 0, finished: false, winner: null, startedAt: Date.now(), target: mode.target || null };
    await this.db.run('INSERT INTO matches (id, room_code, mode, started_at, score) VALUES ($1, $2, $3, $4, $5)', [
      room.state.match.id,
      room.code,
      mode.id,
      room.state.match.startedAt,
      json(room.state.match.scores),
    ]);
    await this.startGame(room);
  }

  async startGame(room) {
    const mode = MODES[room.state.mode];
    const starter = room.state.nextStarter || 'X';
    room.state.nextStarter = other(starter);
    room.state.game = new Game({ id: newId(), starter }).toJSON();
    room.state.phase = 'playing';
    room.state.autoNextAt = null;
    room.state.lastResult = null;
    room.state.challengeDone = null;
    if (mode.challenges) {
      const list = this.settings.get('surpriseChallenges');
      room.state.challenge = { text: list[crypto.randomInt(list.length)] };
    } else room.state.challenge = null;
    await this.save(room);
  }

  /** Atualiza pontuação, estatísticas, histórico e verifica o fim do encontro. */
  async finishGame(room) {
    const s = room.state;
    const g = s.game;
    const mode = MODES[s.mode];
    const m = s.match;
    const winner = g.winner || 'draw';
    const summary = Game.from(g).summary();
    m.games += 1;
    if (winner === 'draw') m.scores.draws += 1;
    else m.scores[winner] += 1;

    if (mode.scoring) {
      const st = room.stats;
      st.games += 1;
      for (const seat of SEATS) for (const k of ['known', 'quiz', 'challenges', 'talks', 'rolls']) st[seat][k] += g.stats[seat][k] || 0;
      if (winner === 'draw') {
        st.draws += 1;
        for (const seat of SEATS) {
          st[seat].streak = 0;
          st[seat].points += 1;
        }
      } else {
        const loser = other(winner);
        st[winner].wins += 1;
        st[winner].points += 3;
        st[winner].streak += 1;
        st[winner].best = Math.max(st[winner].best, st[winner].streak);
        st[loser].losses += 1;
        st[loser].streak = 0;
      }
    }

    await this.db.run(
      `INSERT INTO games (id, room_code, match_id, mode, number, x_name, o_name, starter, winner, variant, summary, moves, challenge, challenge_done, casual, started_at, ended_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
      [
        g.id,
        room.code,
        m.id,
        s.mode,
        m.games,
        room.seats.X ? room.seats.X.name : '—',
        room.seats.O ? room.seats.O.name : '—',
        g.starter,
        winner,
        null,
        json(summary),
        json(g.log.map((l) => l.text)),
        s.challenge ? s.challenge.text : null,
        null,
        mode.scoring ? 0 : 1,
        g.startedAt,
        g.endedAt,
      ]
    );

    // Fim do encontro?
    let matchOver = false;
    if (mode.single) {
      matchOver = true;
      m.winner = winner;
    } else if (mode.target) {
      for (const seat of SEATS) if (m.scores[seat] >= mode.target) {
        matchOver = true;
        m.winner = seat;
      }
    }
    s.lastResult = { winner, gameId: g.id, summary };
    if (matchOver) await this.endMatch(room);
    else {
      s.phase = 'between';
      const secs = this.settings.get('autoNextSeconds');
      s.autoNextAt = secs > 0 && !mode.challenges ? Date.now() + secs * 1000 : null;
      await this.save(room);
      this.scheduleAutoNext(room);
    }

    const names = { X: room.seats.X ? room.seats.X.name : 'X', O: room.seats.O ? room.seats.O.name : 'O' };
    await this.systemMessage(room, `${names[winner]} chegou primeiro ao Reencontro e venceu a viagem ${m.games}! ❤️🏆`);
    if (matchOver && !mode.single) {
      await this.systemMessage(room, m.winner && m.winner !== 'draw' ? `${names[m.winner]} venceu o encontro (${MODES[s.mode].name})! 🎉` : 'O encontro terminou empatado.');
    }
    logger.game(`Sala ${room.code}: viagem ${m.games} — vitória de ${names[winner]} (${summary.rolls} lançamentos)`);
  }

  async endMatch(room) {
    const s = room.state;
    const m = s.match;
    if (!m) return;
    if (!m.winner) {
      if (m.scores.X > m.scores.O) m.winner = 'X';
      else if (m.scores.O > m.scores.X) m.winner = 'O';
      else m.winner = 'draw';
    }
    m.finished = true;
    m.endedAt = Date.now();
    s.phase = 'matchover';
    s.autoNextAt = null;
    await this.db.run('UPDATE matches SET ended_at = $2, winner = $3, score = $4 WHERE id = $1', [m.id, m.endedAt, m.winner, json(m.scores)]);
    await this.save(room);
  }

  scheduleAutoNext(room) {
    clearTimeout(this.timers.get(room.code));
    if (room.state.phase !== 'between' || !room.state.autoNextAt) return;
    const gameId = room.state.game && room.state.game.id;
    const t = setTimeout(() => {
      this.withLock(room, async () => {
        if (room.state.phase !== 'between' || !room.state.game || room.state.game.id !== gameId) return;
        if (!room.seats.X || !room.seats.O || !room.seats.X.connected || !room.seats.O.connected) return;
        await this.startGame(room);
        this.broadcast(room);
      }).catch((err) => logger.error(`Avanço automático falhou: ${err.message}`));
    }, Math.max(0, room.state.autoNextAt - Date.now()));
    t.unref();
    this.timers.set(room.code, t);
  }
}

/* ==================================================================== */
/* Eventos Socket.IO                                                     */
/* ==================================================================== */

function registerRoomHandlers(io, manager) {
  const { db, settings } = manager;
  const joinLimiter = new RateLimiter({ windowMs: 60_000, max: 25 });
  const lookupLimiter = new RateLimiter({ windowMs: 60_000, max: 60 });
  const chatLimiter = new RateLimiter({ windowMs: 10_000, max: 12 });
  const reply = (ack) => (typeof ack === 'function' ? ack : () => {});
  const fail = (ack, error) => ack({ ok: false, error, message: ERRORS[error] || error });

  io.on('connection', (socket) => {
    const ip = socketIp(socket);
    const limiter = new RateLimiter({ windowMs: 5_000, max: 120 });
    socket.use((packet, next) => {
      if (String(packet[0]).startsWith('rtc:') || limiter.hit(socket.id)) return next();
      const ack = packet[packet.length - 1];
      if (typeof ack === 'function') ack({ ok: false, error: 'RATE_LIMITED', message: ERRORS.RATE_LIMITED });
    });
    socket.on('error', () => {});

    function handle(event, fn, { needCtx = true } = {}) {
      socket.on(event, async (payload, ack) => {
        ack = reply(ack);
        try {
          if (!needCtx) return await fn(payload || {}, ack);
          const ctx = await manager.context(socket);
          if (!ctx) return fail(ack, 'NOT_IN_ROOM');
          await manager.withLock(ctx.room, async () => {
            const fresh = manager.contextSync(socket);
            if (!fresh) return fail(ack, 'NOT_IN_ROOM');
            await fn(payload || {}, ack, fresh);
          });
        } catch (err) {
          logger.error(`Erro em ${event}: ${err.message}`, { error: err.stack });
          fail(ack, 'SERVER_ERROR');
        }
      });
    }

    // Eventos desconhecidos (ex.: tentativas de criar salas por Socket.IO) são
    // recusados explicitamente: as salas só se criam no painel de administração.
    socket.onAny((event, ...args) => {
      if (socket.listeners(event).length) return;
      const ack = typeof args[args.length - 1] === 'function' ? args[args.length - 1] : null;
      if (/creat|criar|admin/i.test(event)) logger.warn(`Tentativa de ação reservada por Socket.IO («${String(event).slice(0, 40)}») recusada [${ip}]`);
      if (ack) ack({ ok: false, error: 'NOT_ALLOWED', message: 'Apenas o administrador pode criar salas, no painel de administração.' });
    });

    socket.on('net:ping', (_p, ack) => reply(ack)({ t: Date.now() }));

    socket.on('app:info', (_p, ack) => {
      reply(ack)({
        ok: true,
        welcomeMessage: settings.get('welcomeMessage'),
        modes: Object.values(MODES),
        reactions: settings.get('reactionsEnabled') ? REACTIONS : {},
        taunts: settings.get('tauntsEnabled'),
        chat: settings.get('chatEnabled'),
        board: boardMap(),
        tokens: TOKENS,
        trip: { origin: settings.get('origin'), destination: settings.get('destination'), date: settings.get('reunionDate') },
      });
    });

    handle(
      'room:lookup',
      async (p, ack) => {
        if (!lookupLimiter.hit(ip)) return fail(ack, 'RATE_LIMITED');
        const code = normalizeCode(p.code);
        if (!CODE_REGEX.test(code)) return fail(ack, 'INVALID_CODE');
        const room = await manager.getRoom(code);
        if (!room) return fail(ack, 'ROOM_NOT_FOUND');
        if (room.status === 'closed') return fail(ack, 'ROOM_CLOSED');
        const tokenHash = typeof p.token === 'string' && p.token.length <= 64 ? hashToken(p.token) : null;
        const mySeat = tokenHash ? SEATS.find((s) => room.seats[s] && room.seats[s].tokenHash === tokenHash) || null : null;
        ack({
          ok: true,
          code,
          label: room.label,
          seats: Object.fromEntries(SEATS.map((s) => [s, room.seats[s] ? { name: room.seats[s].name, connected: room.seats[s].connected } : null])),
          mySeat,
          full: !mySeat && !!room.seats.X && !!room.seats.O,
        });
      },
      { needCtx: false }
    );

    handle(
      'room:join',
      async (p, ack) => {
        if (!joinLimiter.hit(ip)) return fail(ack, 'RATE_LIMITED');
        const code = normalizeCode(p.code);
        if (!CODE_REGEX.test(code)) return fail(ack, 'INVALID_CODE');
        const room = await manager.getRoom(code);
        if (!room) return fail(ack, 'ROOM_NOT_FOUND');
        await manager.withLock(room, async () => {
          if (room.status === 'closed') return fail(ack, 'ROOM_CLOSED');
          if (socket.data.code && socket.data.code !== code) socket.leave(socket.data.code);
          const token = typeof p.token === 'string' && p.token.length <= 64 ? p.token : null;
          const tokenHash = token ? hashToken(token) : null;
          let seat = tokenHash ? SEATS.find((s) => room.seats[s] && room.seats[s].tokenHash === tokenHash) : null;
          let newToken = null;
          const reconnected = !!seat;
          const now = Date.now();
          if (seat) {
            const player = room.seats[seat];
            if (player.socketId && player.socketId !== socket.id) {
              const old = io.sockets.sockets.get(player.socketId);
              if (old) {
                old.emit('session:replaced', { message: 'Abriste esta sala noutra janela ou dispositivo.' });
                old.leave(code);
                old.data.code = null;
                old.data.seat = null;
              }
            }
            const name = cleanText(p.name, 20);
            if (name) player.name = name;
          } else {
            const name = cleanText(p.name, 20);
            if (!name) return fail(ack, 'NAME_REQUIRED');
            seat = SEATS.find((s) => !room.seats[s]);
            if (!seat) {
              logger.warn(`Sala ${code}: entrada recusada (sala cheia) para ${name} [${ip}]`);
              return fail(ack, 'ROOM_FULL');
            }
            newToken = randomToken(24);
            room.seats[seat] = { tokenHash: hashToken(newToken), name, joinedAt: now, lastSeen: now, connected: false, socketId: null };
            await db.run('INSERT INTO players (token_hash, room_code, seat, name, joined_at, last_seen, active) VALUES ($1, $2, $3, $4, $5, $5, 1)', [
              room.seats[seat].tokenHash,
              code,
              seat,
              name,
              now,
            ]);
            logger.game(`Sala ${code}: ${name} entrou como ${seat}`);
          }
          const player = room.seats[seat];
          player.socketId = socket.id;
          player.connected = true;
          player.lastSeen = now;
          await db.run('UPDATE players SET name = $2, last_seen = $3 WHERE token_hash = $1', [player.tokenHash, player.name, now]);
          Object.assign(socket.data, { code, seat, tokenHash: player.tokenHash });
          socket.join(code);
          const chat = await db.query('SELECT id, seat, name, text, kind, at FROM chat_messages WHERE room_code = $1 ORDER BY at DESC LIMIT 80', [code]);
          ack({ ok: true, token: newToken || token, seat, name: player.name, state: manager.publicState(room, seat), chat: chat.reverse().map((m) => ({ ...m, at: Number(m.at) })) });
          manager.notify(room, { type: reconnected ? 'reconnected' : 'joined', seat, name: player.name }, seat);
          if (!reconnected) await manager.systemMessage(room, `${player.name} entrou na sala como ${seat}.`);
          await manager.save(room);
          manager.broadcast(room);
          manager.scheduleAutoNext(room);
        });
      },
      { needCtx: false }
    );

    handle('room:leave', async (_p, ack, { room, seat, player }) => {
      room.seats[seat] = null;
      await db.run('UPDATE players SET active = 0 WHERE token_hash = $1', [player.tokenHash]);
      // Uma partida em curso fica suspensa; o encontro recomeça quando houver dois jogadores.
      if (room.state.phase === 'playing' || room.state.phase === 'between') {
        room.state.phase = 'lobby';
        room.state.game = null;
        room.state.match = null;
        room.state.autoNextAt = null;
      }
      room.state.clearRequest = null;
      await manager.save(room);
      socket.leave(room.code);
      socket.data.code = null;
      socket.data.seat = null;
      manager.notify(room, { type: 'left', seat, name: player.name });
      await manager.systemMessage(room, `${player.name} saiu da sala.`);
      manager.broadcast(room);
      ack({ ok: true });
    });

    handle('match:mode', async (p, ack, { room, player }) => {
      if (!['lobby', 'matchover'].includes(room.state.phase)) return fail(ack, 'WRONG_PHASE');
      if (!MODES[p.mode]) return fail(ack, 'INVALID_MODE');
      room.state.mode = p.mode;
      room.state.phase = 'lobby';
      await manager.save(room);
      manager.notify(room, { type: 'mode', name: player.name, mode: p.mode }, socket.data.seat);
      manager.broadcast(room);
      ack({ ok: true });
    });

    handle('match:token', async (p, ack, { room, seat }) => {
      if (!TOKENS.includes(p.token)) return fail(ack, 'INVALID_TOKEN');
      room.state.tokens = { ...(room.state.tokens || { X: 'man', O: 'woman' }), [seat]: p.token };
      await manager.save(room);
      manager.broadcast(room);
      ack({ ok: true });
    });

    handle('match:start', async (_p, ack, { room }) => {
      if (!['lobby', 'matchover'].includes(room.state.phase)) return fail(ack, 'WRONG_PHASE');
      if (!room.seats.X || !room.seats.O) return fail(ack, 'WAITING_OPPONENT');
      await manager.startMatch(room);
      await manager.systemMessage(room, `Começou a viagem: ${MODES[room.state.mode].name}. ${room.seats[room.state.game.starter].name} lança primeiro os dados. ✈️`);
      manager.broadcast(room);
      ack({ ok: true });
    });

    async function afterGameChange(room, game, ack, extra = {}) {
      room.state.game = game.toJSON();
      if (game.status === 'over') await manager.finishGame(room);
      else await manager.save(room);
      manager.broadcast(room);
      ack({ ok: true, ...extra });
    }

    /** Valida o estado comum às ações de jogo. */
    function gameFor(room, seat, p, ack) {
      const s = room.state;
      if (s.phase !== 'playing' || !s.game) return fail(ack, 'WRONG_PHASE'), null;
      const opp = room.seats[other(seat)];
      if (!opp) return fail(ack, 'WAITING_OPPONENT'), null;
      if (!opp.connected) return fail(ack, 'OPPONENT_OFFLINE'), null;
      if (p.n !== s.game.actions) return fail(ack, 'STALE_MOVE'), null;
      return Game.from(s.game);
    }

    handle('game:roll', async (p, ack, { room, seat }) => {
      const game = gameFor(room, seat, p, ack);
      if (!game) return;
      // dados fixos apenas nos testes automáticos (variável de ambiente própria)
      const forced = process.env.GLORIA_TEST_DICE === '1' && Array.isArray(p.dice) && p.dice.length === 2 && p.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6) ? p.dice : null;
      const res = game.roll(seat, buildDecks(settings), forced);
      if (!res.ok) return fail(ack, res.error);
      await afterGameChange(room, game, ack, { dice: res.dice });
    });

    handle('card:answer', async (p, ack, { room, seat }) => {
      const game = gameFor(room, seat, p, ack);
      if (!game) return;
      const res = game.answer(seat, p.choice, buildDecks(settings));
      if (!res.ok) return fail(ack, res.error);
      await afterGameChange(room, game, ack, { success: res.success });
    });

    handle('card:judge', async (p, ack, { room, seat }) => {
      const game = gameFor(room, seat, p, ack);
      if (!game) return;
      const res = game.judge(seat, !!p.ok, buildDecks(settings));
      if (!res.ok) return fail(ack, res.error);
      await afterGameChange(room, game, ack, { success: res.success });
    });

    handle('card:pass', async (p, ack, { room, seat }) => {
      const game = gameFor(room, seat, p, ack);
      if (!game) return;
      const res = game.pass(seat, buildDecks(settings));
      if (!res.ok) return fail(ack, res.error);
      await afterGameChange(room, game, ack);
    });

    handle('final:ask', async (p, ack, { room, seat }) => {
      const game = gameFor(room, seat, p, ack);
      if (!game) return;
      const res = game.ask(seat, cleanText(p.text || '', 200), buildDecks(settings));
      if (!res.ok) return fail(ack, res.error);
      await afterGameChange(room, game, ack);
    });

    handle('game:next', async (_p, ack, { room }) => {
      if (room.state.phase !== 'between') return fail(ack, 'WRONG_PHASE');
      if (!room.seats.X || !room.seats.O) return fail(ack, 'WAITING_OPPONENT');
      await manager.startGame(room);
      manager.broadcast(room);
      ack({ ok: true });
    });

    handle('match:end', async (_p, ack, { room, player }) => {
      if (!['between', 'playing'].includes(room.state.phase) || !room.state.match) return fail(ack, 'WRONG_PHASE');
      if (room.state.phase === 'playing' && room.state.game && room.state.game.actions > 0) return fail(ack, 'WRONG_PHASE');
      await manager.endMatch(room);
      await manager.systemMessage(room, `${player.name} terminou o encontro.`);
      manager.broadcast(room);
      ack({ ok: true });
    });

    handle('challenge:done', async (p, ack, { room, seat }) => {
      const s = room.state;
      const r = s.lastResult;
      if (!s.challenge || !r || r.winner === 'draw' || s.challengeDone !== null) return fail(ack, 'WRONG_PHASE');
      if (r.winner !== seat) return fail(ack, 'NOT_ALLOWED'); // só o vencedor confirma
      s.challengeDone = !!p.done;
      await db.run('UPDATE games SET challenge_done = $2 WHERE id = $1', [r.gameId, s.challengeDone ? 1 : 0]);
      await manager.save(room);
      if (s.challengeDone) await manager.systemMessage(room, 'Desafio cumprido! 🎁');
      manager.broadcast(room);
      ack({ ok: true });
    });

    handle('react', async (p, ack, { room, seat, player }) => {
      if (!settings.get('reactionsEnabled')) return fail(ack, 'DISABLED');
      const r = REACTIONS[p.kind];
      if (!r) return fail(ack, 'INVALID_MESSAGE');
      if (p.kind === 'taunt' && !settings.get('tauntsEnabled')) return fail(ack, 'DISABLED');
      const now = Date.now();
      if (now - room.lastReact[seat] < 600) return fail(ack, 'RATE_LIMITED');
      room.lastReact[seat] = now;
      const text = p.kind === 'taunt' ? FUN.taunts[crypto.randomInt(FUN.taunts.length)] : null;
      io.to(room.code).emit('react', { kind: p.kind, emoji: r.emoji, label: r.label, text, seat, name: player.name, at: now });
      ack({ ok: true });
    });

    handle('chat:send', async (p, ack, { room, seat, player }) => {
      if (!settings.get('chatEnabled')) return fail(ack, 'DISABLED');
      if (!chatLimiter.hit(socket.id)) return fail(ack, 'RATE_LIMITED');
      const text = cleanText(p.text, 500);
      if (!text) return fail(ack, 'INVALID_MESSAGE');
      const msg = { id: newId(), seat, name: player.name, text, kind: 'user', at: Date.now() };
      await db.run('INSERT INTO chat_messages (id, room_code, seat, name, text, kind, at) VALUES ($1, $2, $3, $4, $5, $6, $7)', [msg.id, room.code, seat, msg.name, text, 'user', msg.at]);
      io.to(room.code).emit('chat:message', msg);
      ack({ ok: true });
    });

    socket.on('chat:typing', () => {
      const ctx = manager.contextSync(socket);
      const o = ctx && manager.socketOf(ctx.room, other(ctx.seat));
      if (o) o.emit('chat:typing', { seat: ctx.seat });
    });

    handle('history:get', async (_p, ack, { room }) => {
      const games = await db.query(
        'SELECT id, mode, number, x_name, o_name, starter, winner, summary, challenge, challenge_done, casual, started_at, ended_at FROM games WHERE room_code = $1 ORDER BY ended_at DESC LIMIT 200',
        [room.code]
      );
      const matches = await db.query('SELECT id, mode, started_at, ended_at, winner, score FROM matches WHERE room_code = $1 ORDER BY started_at DESC LIMIT 50', [room.code]);
      ack({
        ok: true,
        stats: room.stats,
        games: games.map((g) => ({ ...g, summary: parse(g.summary, null), started_at: Number(g.started_at), ended_at: Number(g.ended_at), casual: !!Number(g.casual), challenge_done: g.challenge_done === null ? null : !!Number(g.challenge_done) })),
        matches: matches.map((m) => ({ ...m, started_at: Number(m.started_at), ended_at: m.ended_at ? Number(m.ended_at) : null, score: parse(m.score, null) })),
        canClear: settings.get('playersCanClearHistory'),
      });
    });

    handle('history:clear-request', async (_p, ack, { room, seat, player }) => {
      if (!settings.get('playersCanClearHistory')) return fail(ack, 'DISABLED');
      room.state.clearRequest = seat;
      await manager.save(room);
      manager.notify(room, { type: 'clear-request', seat, name: player.name }, seat);
      manager.broadcast(room);
      ack({ ok: true });
    });

    handle('history:clear-answer', async (p, ack, { room, seat, player }) => {
      if (!room.state.clearRequest || room.state.clearRequest === seat) return fail(ack, 'NO_REQUEST');
      if (!p.accept) {
        room.state.clearRequest = null;
        await manager.save(room);
        manager.notify(room, { type: 'clear-declined', name: player.name }, seat);
        manager.broadcast(room);
        return ack({ ok: true, cleared: false });
      }
      await manager.clearHistory(room);
      io.to(room.code).emit('history:cleared');
      await manager.systemMessage(room, 'O histórico da sala foi apagado com o acordo dos dois.');
      manager.broadcast(room);
      ack({ ok: true, cleared: true });
    });

    socket.on('disconnect', () => {
      const ctx = manager.contextSync(socket);
      if (!ctx) return;
      const { room, seat, player } = ctx;
      player.connected = false;
      player.lastSeen = Date.now();
      manager.notify(room, { type: 'disconnected', seat, name: player.name }, seat);
      manager.broadcast(room);
      db.run('UPDATE players SET last_seen = $2 WHERE token_hash = $1', [player.tokenHash, player.lastSeen]).catch(() => {});
    });
  });
}

module.exports = { RoomManager, registerRoomHandlers, MODES, REACTIONS, ERRORS, CODE_REGEX, normalizeCode, emptyStats, TOKENS };
