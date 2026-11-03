'use strict';

/**
 * Testes automáticos do Jogo da Glória Online (servidor real + base de dados real).
 *   npm test                                     → SQLite temporário
 *   TEST_DATABASE_URL=postgresql://... npm test  → PostgreSQL (a base é limpa!)
 */

process.env.ADMIN_PASSWORD = 'segredo-gloria-teste';
process.env.NODE_ENV = 'test';
process.env.GLORIA_TEST_DICE = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { io: ioc } = require('socket.io-client');
const { Game, boardMap, squareInfo, PLANES } = require('../server/game-engine');
const CARDS = require('../data/cartas.json');
const DECKS = { knowme: CARDS.knowme, talk: CARDS.talk, challenge: CARDS.challenges, quiz: CARDS.quiz, fortune: CARDS.fortune };

const SQLITE_FILE = path.join(os.tmpdir(), `gloria-test-${process.pid}.db`);
if (process.env.TEST_DATABASE_URL) process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
else {
  delete process.env.DATABASE_URL;
  process.env.SQLITE_FILE = SQLITE_FILE;
}
const { start } = require('../server');

let ctx;
let BASE;
let cookie;
const H = { 'X-Requested-With': 'jogo-da-gloria' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function resetDb() {
  if (process.env.DATABASE_URL) {
    const pg = require('pg');
    const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    await c.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
    await c.end();
  } else for (const f of [SQLITE_FILE, `${SQLITE_FILE}-wal`, `${SQLITE_FILE}-shm`]) fs.rmSync(f, { force: true });
}
async function boot() {
  ctx = await start({ port: 0 });
  BASE = `http://127.0.0.1:${ctx.server.address().port}`;
}
async function http(method, url, { body, headers = {}, auth = false } = {}) {
  const res = await fetch(BASE + url, { method, redirect: 'manual', headers: { 'Content-Type': 'application/json', ...(auth ? { Cookie: cookie, ...H } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const type = res.headers.get('content-type') || '';
  return { status: res.status, headers: res.headers, data: type.includes('json') ? await res.json() : await res.text() };
}
const connect = (opts = {}) =>
  new Promise((resolve, reject) => {
    const s = ioc(BASE, { transports: ['websocket'], forceNew: true, reconnection: false, ...opts });
    s.on('connect', () => resolve(track(s)));
    s.on('connect_error', reject);
  });
function track(s) {
  s.__events = [];
  s.__states = [];
  s.onAny((ev, d) => {
    s.__events.push(ev);
    if (ev === 'room:state') {
      s.__state = d;
      s.__states.push(d);
    }
  });
  return s;
}
const emit = (s, ev, p) => new Promise((r) => s.emit(ev, p, r));
function once(s, ev, ms = 3000, pred = () => true) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout: ${ev}`)), ms);
    const h = (d) => {
      if (!pred(d)) return;
      clearTimeout(t);
      s.off(ev, h);
      resolve(d);
    };
    s.on(ev, h);
  });
}
async function createRoom(label = 'Teste') {
  const r = await http('POST', '/api/admin/rooms', { auth: true, body: { label } });
  assert.equal(r.status, 201);
  return r.data.room;
}
async function seat(code) {
  const x = await connect();
  const o = await connect();
  const rx = await emit(x, 'room:join', { code, name: 'Ana' });
  assert.ok(rx.ok, rx.message);
  const ro = await emit(o, 'room:join', { code, name: 'Bruno' });
  assert.ok(ro.ok, ro.message);
  return { x, o, rx, ro };
}
const game = (code) => ctx.manager.rooms.get(code).state.game;
const sockOf = (S, seat) => (seat === 'X' ? S.x : S.o);
/** Resolve qualquer carta pendente (aceitando/acertando). */
async function resolvePending(code, S, ok = true) {
  const g = game(code);
  const p = g.pending;
  if (!p) return;
  let r;
  if (p.type === 'quiz') r = await emit(sockOf(S, p.seat), 'card:answer', { choice: ok ? p.answer : (p.answer + 1) % p.options.length, n: g.actions });
  else if (p.type === 'final' && p.stage === 'ask') {
    r = await emit(sockOf(S, p.judge), 'final:ask', { text: 'Qual é a minha cor preferida?', n: g.actions });
    assert.ok(r.ok, r.message);
    return resolvePending(code, S, ok);
  } else r = await emit(sockOf(S, p.judge), 'card:judge', { ok, n: g.actions });
  assert.ok(r.ok, r.message);
}
async function roll(code, S, dice) {
  const g = game(code);
  const r = await emit(sockOf(S, g.turn), 'game:roll', { n: g.actions, dice });
  if (r.error === 'RATE_LIMITED') {
    await sleep(1000);
    return roll(code, S, dice);
  }
  assert.ok(r.ok, r.message);
  return r;
}
/** Leva `seat` até à vitória: põe-no na casa 61, tira 1+1 e acerta a pergunta final. */
async function winGame(code, S, seat) {
  while (game(code).pending) await resolvePending(code, S, true);
  const g = game(code);
  g.pos[seat] = 61;
  g.turn = seat;
  g.skip = { X: 0, O: 0 };
  await roll(code, S, [1, 1]);
  assert.equal(game(code).pending.type, 'final');
  await resolvePending(code, S, true);
  assert.equal(game(code).status, 'over');
}

test('Jogo da Glória Online', async (t) => {
  await resetDb();
  await boot();
  t.after(async () => {
    await ctx.close();
    for (const f of [SQLITE_FILE, `${SQLITE_FILE}-wal`, `${SQLITE_FILE}-shm`]) fs.rmSync(f, { force: true });
  });

  await t.test('tabuleiro: 63 casas com casas especiais e cartas sem sobreposições', () => {
    const map = boardMap();
    assert.equal(map.length, 64);
    assert.equal(map[0].kind, 'start');
    assert.equal(map[63].kind, 'final');
    assert.equal(map.filter((c) => c.kind === 'plane').length, 13);
    assert.equal(map[6].kind, 'bridge');
    assert.equal(map[58].kind, 'goto');
    for (const deck of ['knowme', 'talk', 'quiz', 'challenge', 'fortune']) assert.ok(map.some((c) => c.deck === deck), deck);
    assert.ok(CARDS.knowme.length >= 30 && CARDS.talk.length >= 30 && CARDS.challenges.length >= 30 && CARDS.quiz.length >= 40);
    for (const q of CARDS.quiz) assert.ok(q.o.length === 4 && q.a >= 0 && q.a < 4, q.q);
  });

  await t.test('motor: movimento, ressalto no fim, aviões, ponte, casas más e regra do 1.º lançamento', () => {
    let g = new Game({ starter: 'X' });
    g.roll('X', DECKS, [1, 1]); // 2 → casa simples
    assert.equal(g.pos.X, 2);
    assert.equal(g.turn, 'O');
    assert.equal(g.roll('X', DECKS, [1, 1]).error, 'NOT_YOUR_TURN');
    g = new Game({ starter: 'X' });
    g.rolled.X = true;
    g.pos.X = 3;
    g.roll('X', DECKS, [1, 1]); // 5 = avião → 9 e joga outra vez
    assert.equal(g.pos.X, 9);
    assert.equal(g.turn, 'X');
    g = new Game({ starter: 'X' });
    g.rolled.X = true;
    g.pos.X = 4;
    g.roll('X', DECKS, [1, 1]); // 6 = ponte → 12, joga outra vez
    assert.equal(g.pos.X, 12);
    assert.equal(g.turn, 'X');
    g = new Game({ starter: 'X' });
    g.rolled.X = true;
    g.pos.X = 60;
    g.roll('X', DECKS, [3, 3]); // 66 → ressalto para 60 (desafio)
    assert.equal(g.pos.X, 60);
    assert.equal(g.pending.type, 'challenge');
    g = new Game({ starter: 'X' });
    g.rolled.X = true;
    g.pos.X = 49;
    g.roll('X', DECKS, [1, 2]); // 52 alfândega: 3 vezes sem jogar
    assert.equal(g.skip.X, 3);
    g.roll('O', DECKS, [1, 1]);
    assert.equal(g.turn, 'O', 'X ficou retido, O volta a jogar');
    g = new Game({ starter: 'X' });
    g.rolled.X = true;
    g.pos.X = 52;
    g.roll('X', DECKS, [3, 3]); // 58 voo cancelado → 30 (sorte)
    assert.ok(g.last.steps.some((s) => s.t === 'jump' && s.to === 30));
    g = new Game({ starter: 'X' });
    g.roll('X', DECKS, [6, 3]); // 1.º lançamento 6+3 → 26 e joga outra vez
    assert.equal(g.pos.X, 26);
    assert.equal(g.turn, 'X');
    g = new Game({ starter: 'O' });
    g.roll('O', DECKS, [4, 5]);
    assert.equal(g.pos.O, 53);
    g = new Game({ starter: 'X' });
    g.rolled.X = true;
    g.pos.X = 30;
    g.shield.X = true;
    g.roll('X', DECKS, [6, 6]); // 42 fuso horário, mas o amuleto protege
    assert.equal(g.pos.X, 42);
    assert.equal(g.shield.X, false);
  });

  await t.test('motor: cartas — quiz corrigido no servidor, julgamento só pelo outro, passar, prémios', () => {
    const g = new Game({ starter: 'X' });
    g.rolled.X = true;
    g.pos.X = 2;
    g.roll('X', DECKS, [1, 1]); // 4 = quiz
    assert.equal(g.pending.type, 'quiz');
    assert.ok(!('answer' in g.view().pending), 'a resposta certa nunca é enviada');
    assert.ok(!JSON.stringify(g.view()).includes('"answer"'));
    assert.equal(g.roll('X', DECKS, [1, 1]).error, 'CARD_PENDING');
    assert.equal(g.answer('O', 0, DECKS).error, 'NOT_ALLOWED');
    assert.equal(g.answer('X', 9, DECKS).error, 'INVALID_ANSWER');
    const right = g.pending.answer;
    assert.ok(g.answer('X', right, DECKS).success);
    assert.equal(g.pos.X, 6 > 4 ? 6 : 6); // +2 casas (sem efeitos de casa)
    assert.equal(g.turn, 'O');
    // conheces: só o outro julga
    const k = new Game({ starter: 'X' });
    k.rolled.X = true;
    k.roll('X', DECKS, [1, 2]); // 3 = conheces
    assert.equal(k.pending.type, 'knowme');
    assert.equal(k.judge('X', true, DECKS).error, 'NOT_ALLOWED');
    assert.ok(k.judge('O', true, DECKS).success);
    assert.equal(k.pos.X, 5);
    assert.equal(k.stats.X.known, 1);
    // desafio: passar recua 2
    const c = new Game({ starter: 'X' });
    c.rolled.X = true;
    c.pos.X = 5;
    c.roll('X', DECKS, [1, 1]); // 7 = desafio
    assert.equal(c.pending.type, 'challenge');
    assert.equal(c.pass('O', DECKS).error, 'NOT_ALLOWED');
    c.pass('X', DECKS);
    assert.equal(c.pos.X, 5);
    // sorte
    const f = new Game({ starter: 'X' });
    f.rolled.X = true;
    f.pos.X = 8;
    f.roll('X', DECKS, [1, 1]); // 10 = sorte
    assert.ok(f.last.steps.some((s) => s.t === 'fortune'));
  });

  await t.test('motor: chegada — conta certa, pergunta final escolhida pelo outro, vitória ou recuo', () => {
    const g = new Game({ starter: 'X' });
    g.rolled.X = true;
    g.pos.X = 61;
    g.roll('X', DECKS, [1, 1]);
    assert.equal(g.pos.X, 63);
    assert.equal(g.pending.type, 'final');
    assert.equal(g.pending.stage, 'ask');
    assert.equal(g.ask('X', 'batota', DECKS).error, 'NOT_ALLOWED');
    assert.ok(g.ask('O', 'Onde foi o nosso primeiro «olá»?', DECKS).ok);
    assert.equal(g.pending.text, 'Onde foi o nosso primeiro «olá»?');
    assert.equal(g.judge('X', true, DECKS).error, 'NOT_ALLOWED');
    g.judge('O', false, DECKS);
    assert.equal(g.pos.X, 56);
    assert.equal(g.status, 'playing');
    const w = new Game({ starter: 'O' });
    w.rolled.O = true;
    w.pos.O = 60;
    w.roll('O', DECKS, [1, 2]);
    w.ask('X', '', DECKS); // pergunta sorteada
    assert.ok(w.pending.random && w.pending.text.length > 5);
    w.judge('X', true, DECKS);
    assert.equal(w.status, 'over');
    assert.equal(w.winner, 'O');
  });

  await t.test('motor: 300 viagens aleatórias terminam sempre, sem casas fora do tabuleiro', () => {
    for (let i = 0; i < 300; i++) {
      const g = new Game({ starter: i % 2 ? 'X' : 'O' });
      let k = 0;
      while (g.status === 'playing' && k++ < 3000) {
        const p = g.pending;
        if (p && p.type === 'quiz') g.answer(p.seat, Math.floor(Math.random() * p.options.length), DECKS);
        else if (p && p.type === 'final' && p.stage === 'ask') g.ask(p.judge, '', DECKS);
        else if (p) g.judge(p.judge, Math.random() < 0.7, DECKS);
        else assert.ok(g.roll(g.turn, DECKS).ok);
        for (const s of ['X', 'O']) assert.ok(g.pos[s] >= 0 && g.pos[s] <= 63);
      }
      assert.equal(g.status, 'over');
    }
  });

  await t.test('servidor arranca, página inicial e saúde', async () => {
    assert.equal((await http('GET', '/healthz')).status, 200);
    const home = await http('GET', '/');
    assert.equal(home.status, 200);
    assert.match(home.data, /JOGO DA GLÓRIA/);
    assert.match(home.data, /ENTRAR NO JOGO/);
    assert.match((await http('GET', '/admin')).data, /Painel de Administração/);
    assert.equal((await http('GET', '/socket.io/socket.io.js')).status, 200);
    assert.equal((await http('GET', '/sala/ABC234')).headers.get('location'), '/?sala=ABC234');
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    assert.equal(pkg.scripts.start, 'node server.js');
    assert.match(fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8'), /process\.env\.PORT \|\| 3000/);
  });

  await t.test('palavra-passe nunca nos ficheiros públicos', () => {
    const dir = path.join(__dirname, '..', 'public');
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      if (fs.statSync(p).isFile()) assert.ok(!fs.readFileSync(p, 'utf8').includes(process.env.ADMIN_PASSWORD), f);
    }
  });

  await t.test('convidados não conseguem criar salas (API e Socket.IO)', async () => {
    assert.equal((await http('POST', '/api/admin/rooms', { body: {}, headers: H })).status, 401);
    assert.equal((await http('POST', '/api/admin/rooms', { body: {}, headers: { ...H, Cookie: 'gloria_admin=falso' } })).status, 401);
    assert.equal((await http('POST', '/api/rooms', { body: {} })).status, 403);
    assert.equal((await http('GET', '/api/admin/stats')).status, 401);
    const s = await connect();
    const r1 = await s.timeout(2000).emitWithAck('room:create', {});
    assert.equal(r1.ok, false);
    assert.equal(r1.error, 'NOT_ALLOWED');
    s.emit('admin:createRoom', {});
    await sleep(80);
    s.close();
    assert.equal(Number((await ctx.db.one('SELECT COUNT(*) AS n FROM rooms')).n), 0);
  });

  await t.test('autenticação do administrador', async () => {
    assert.equal((await http('POST', '/api/admin/login', { body: { password: 'errada' } })).status, 401);
    const ok = await http('POST', '/api/admin/login', { body: { password: process.env.ADMIN_PASSWORD } });
    assert.equal(ok.status, 200);
    const sc = ok.headers.get('set-cookie');
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Strict/);
    cookie = sc.split(';')[0];
    assert.equal((await http('GET', '/api/admin/session', { auth: true })).data.authenticated, true);
    assert.equal((await http('POST', '/api/admin/rooms', { body: {}, headers: { Cookie: cookie } })).status, 403, 'sem cabeçalho anti-CSRF');
  });

  let room;
  let S;
  await t.test('entrada por código e por convite; limite de dois jogadores', async () => {
    room = await createRoom('Duelo');
    assert.match(room.code, /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/);
    assert.equal(room.inviteUrl, `${BASE}/?sala=${room.code}`);
    const probe = await connect();
    assert.equal((await emit(probe, 'room:lookup', { code: 'ZZZZZZ' })).error, 'ROOM_NOT_FOUND');
    const x = await connect();
    assert.equal((await emit(x, 'room:join', { code: room.code, name: '  ' })).error, 'NAME_REQUIRED');
    const rx = await emit(x, 'room:join', { code: room.code.toLowerCase(), name: 'Ana' });
    assert.equal(rx.seat, 'X');
    const o = await connect();
    const joined = once(x, 'room:event', 2000, (e) => e.type === 'joined');
    const ro = await emit(o, 'room:join', { code: new URL(room.inviteUrl).searchParams.get('sala'), name: 'Bruno' });
    assert.equal(ro.seat, 'O');
    assert.equal((await joined).name, 'Bruno');
    const c = await connect();
    assert.equal((await emit(c, 'room:join', { code: room.code, name: 'Intruso' })).error, 'ROOM_FULL');
    assert.equal((await emit(probe, 'room:lookup', { code: room.code })).full, true);
    c.close();
    probe.close();
    S = { x, o, tokenX: rx.token, tokenO: ro.token };
  });

  await t.test('escolha da peça validada; viagem começa; turnos, duplicados e simultâneos', async () => {
    assert.ok((await emit(S.x, 'match:token', { token: 'car' })).ok);
    assert.equal((await emit(S.o, 'match:token', { token: 'dinossauro' })).error, 'INVALID_TOKEN');
    assert.ok((await emit(S.o, 'match:token', { token: 'cat' })).ok);
    const info = await emit(S.x, 'app:info');
    assert.equal(info.board.length, 64);
    assert.ok(info.tokens.includes('rabbit'));
    assert.equal(info.trip.destination, 'São Gonçalo · RJ');
    assert.ok((await emit(S.x, 'match:mode', { mode: 'classic' })).ok);
    assert.equal((await emit(S.x, 'game:roll', { n: 0 })).error, 'WRONG_PHASE');
    assert.ok((await emit(S.o, 'match:start')).ok);
    const r = ctx.manager.rooms.get(room.code);
    assert.deepEqual(r.state.tokens, { X: 'car', O: 'cat' });
    assert.equal(r.state.game.turn, 'X');
    assert.equal((await emit(S.o, 'game:roll', { n: 0 })).error, 'NOT_YOUR_TURN');
    assert.ok((await emit(S.x, 'game:roll', { n: 0, dice: [1, 1] })).ok);
    assert.equal(game(room.code).pos.X, 2);
    assert.equal((await emit(S.o, 'game:roll', { n: 0 })).error, 'STALE_MOVE', 'ação repetida');
    const [a, b] = await Promise.all([emit(S.o, 'game:roll', { n: 1, dice: [1, 1] }), emit(S.o, 'game:roll', { n: 1, dice: [1, 1] })]);
    assert.equal([a, b].filter((x) => x.ok).length, 1, 'só um dos dois lançamentos simultâneos conta');
  });

  await t.test('cartas pela sala: quiz sem fuga da resposta; só o outro julga', async () => {
    // força uma carta de quiz para X
    while (game(room.code).pending) await resolvePending(room.code, S);
    const g = game(room.code);
    g.turn = 'X';
    g.pos.X = 2;
    g.skip = { X: 0, O: 0 };
    await roll(room.code, S, [1, 1]); // 4 = quiz
    assert.equal(game(room.code).pending.type, 'quiz');
    await sleep(50);
    for (const sock of [S.x, S.o]) for (const st of sock.__states) assert.ok(!JSON.stringify(st).includes('"answer"'), 'resposta enviada ao navegador!');
    assert.equal((await emit(S.o, 'card:answer', { choice: 0, n: game(room.code).actions })).error, 'NOT_ALLOWED');
    const right = game(room.code).pending.answer;
    const res = await emit(S.x, 'card:answer', { choice: right, n: game(room.code).actions });
    assert.equal(res.success, true);
    assert.equal(game(room.code).pos.X, 6);
    // conheces → julgado só pelo outro
    const g2 = game(room.code);
    g2.turn = 'X';
    g2.pos.X = 13;
    await roll(room.code, S, [1, 1]); // 15 = conheces
    assert.equal(game(room.code).pending.type, 'knowme');
    assert.equal((await emit(S.x, 'card:judge', { ok: true, n: game(room.code).actions })).error, 'NOT_ALLOWED');
    assert.ok((await emit(S.o, 'card:judge', { ok: true, n: game(room.code).actions })).ok);
    assert.equal(game(room.code).pos.X, 17);
  });

  await t.test('chegada ao Reencontro: pergunta final do outro e vitória', async () => {
    while (game(room.code).pending) await resolvePending(room.code, S);
    const g = game(room.code);
    g.turn = 'O';
    g.pos.O = 59;
    await roll(room.code, S, [2, 2]);
    const p = game(room.code).pending;
    assert.equal(p.type, 'final');
    assert.equal((await emit(S.o, 'final:ask', { text: 'x', n: game(room.code).actions })).error, 'NOT_ALLOWED');
    assert.ok((await emit(S.x, 'final:ask', { text: 'Qual foi a primeira música que te dediquei?', n: game(room.code).actions })).ok);
    await sleep(40);
    assert.equal(S.o.__state.game.pending.text, 'Qual foi a primeira música que te dediquei?');
    assert.ok((await emit(S.x, 'card:judge', { ok: true, n: game(room.code).actions })).ok);
    const r = ctx.manager.rooms.get(room.code);
    assert.equal(r.state.game.winner, 'O');
    assert.equal(r.state.phase, 'matchover');
    assert.equal(r.stats.O.wins, 1);
    assert.equal(r.stats.X.known, 1);
    assert.equal(r.stats.X.quiz, 1);
  });

  await t.test('melhor de três: quem começa alterna; vence quem chega a 2', async () => {
    assert.ok((await emit(S.x, 'match:mode', { mode: 'bo3' })).ok);
    assert.ok((await emit(S.x, 'match:start')).ok);
    const r = ctx.manager.rooms.get(room.code);
    assert.equal(r.state.game.starter, 'O', 'quem começa alterna');
    await winGame(room.code, S, 'X');
    assert.equal(r.state.phase, 'between');
    assert.ok((await emit(S.o, 'game:next')).ok);
    await winGame(room.code, S, 'O');
    assert.ok((await emit(S.o, 'game:next')).ok);
    await winGame(room.code, S, 'X');
    assert.equal(r.state.phase, 'matchover');
    assert.equal(r.state.match.winner, 'X');
  });

  await t.test('melhor de cinco, campeonato, desafio surpresa e descontraído', async () => {
    const r = ctx.manager.rooms.get(room.code);
    assert.ok((await emit(S.o, 'match:mode', { mode: 'bo5' })).ok);
    assert.ok((await emit(S.o, 'match:start')).ok);
    let games = 0;
    while (r.state.phase !== 'matchover') {
      if (r.state.phase === 'between') await emit(S.x, 'game:next');
      await winGame(room.code, S, 'O');
      games++;
    }
    assert.equal(games, 3);
    assert.ok((await emit(S.x, 'match:mode', { mode: 'championship' })).ok);
    assert.ok((await emit(S.x, 'match:start')).ok);
    await winGame(room.code, S, 'X');
    assert.ok((await emit(S.o, 'match:end')).ok);
    assert.equal(r.state.phase, 'matchover');
    assert.ok((await emit(S.x, 'match:mode', { mode: 'surprise' })).ok);
    assert.ok((await emit(S.x, 'match:start')).ok);
    assert.ok(r.state.challenge.text.length > 10);
    await winGame(room.code, S, 'X');
    assert.equal((await emit(S.o, 'challenge:done', { done: true })).error, 'NOT_ALLOWED');
    assert.ok((await emit(S.x, 'challenge:done', { done: true })).ok);
    assert.ok((await emit(S.x, 'match:end')).ok);
    const before = JSON.stringify(r.stats);
    assert.ok((await emit(S.x, 'match:mode', { mode: 'casual' })).ok);
    assert.ok((await emit(S.x, 'match:start')).ok);
    await winGame(room.code, S, 'O');
    assert.equal(JSON.stringify(r.stats), before, 'descontraído não conta');
    assert.ok((await emit(S.x, 'match:end')).ok);
  });

  await t.test('pontuação e histórico consistentes', async () => {
    const h = await emit(S.o, 'history:get');
    assert.ok(h.ok);
    const scored = h.games.filter((g) => !g.casual);
    assert.equal(h.stats.X.wins, scored.filter((g) => g.winner === 'X').length);
    assert.equal(h.stats.O.wins, scored.filter((g) => g.winner === 'O').length);
    assert.equal(h.stats.games, scored.length);
    assert.ok(h.games.every((g) => g.ended_at > 0 && g.summary && g.summary.stats));
    assert.ok(h.matches.length >= 6);
  });

  await t.test('chat em tempo real, mensagens de sistema e reações', async () => {
    const msg = once(S.o, 'chat:message', 2000, (m) => m.kind === 'user');
    assert.ok((await emit(S.x, 'chat:send', { text: 'Boa sorte! 🍀 <b>x</b>' })).ok);
    assert.equal((await msg).text, 'Boa sorte! 🍀 <b>x</b>');
    assert.equal((await emit(S.x, 'chat:send', { text: ' ' })).error, 'INVALID_MESSAGE');
    const react = once(S.o, 'react');
    assert.ok((await emit(S.x, 'react', { kind: 'clap' })).ok);
    assert.equal((await react).emoji, '👏');
    await sleep(650);
    const taunt = once(S.o, 'react');
    assert.ok((await emit(S.x, 'react', { kind: 'taunt' })).ok);
    assert.ok((await taunt).text.length > 3);
    assert.equal((await emit(S.x, 'react', { kind: 'heart' })).error, 'RATE_LIMITED');
    assert.equal((await emit(S.x, 'react', { kind: 'bomba' })).error, 'INVALID_MESSAGE');
    const sys = await ctx.db.query("SELECT text FROM chat_messages WHERE room_code = $1 AND kind = 'system'", [room.code]);
    assert.ok(sys.some((m) => /entrou/.test(m.text)) && sys.some((m) => /venceu/.test(m.text)));
  });

  await t.test('sinalização da videochamada só entre os dois jogadores', async () => {
    const cfg = await emit(S.x, 'rtc:config');
    assert.ok(cfg.ok && cfg.iceServers.length);
    const inv = once(S.o, 'rtc:invite');
    assert.ok((await emit(S.x, 'rtc:invite')).ok);
    assert.equal((await inv).name, 'Ana');
    const sig = once(S.x, 'rtc:signal');
    await emit(S.o, 'rtc:signal', { description: { type: 'answer', sdp: 'v=0' } });
    assert.equal((await sig).description.type, 'answer');
    const outsider = await connect();
    assert.equal((await emit(outsider, 'rtc:invite')).error, 'NOT_IN_ROOM');
    outsider.close();
  });

  await t.test('desconexão, ação bloqueada e reconexão automática', async () => {
    assert.ok((await emit(S.x, 'match:mode', { mode: 'bo3' })).ok);
    assert.ok((await emit(S.x, 'match:start')).ok);
    const r = ctx.manager.rooms.get(room.code);
    const turnIsX = r.state.game.turn === 'X';
    const disc = once(turnIsX ? S.x : S.o, 'room:event', 2000, (e) => e.type === 'disconnected');
    (turnIsX ? S.o : S.x).close();
    await disc;
    const mover = turnIsX ? S.x : S.o;
    assert.equal((await emit(mover, 'game:roll', { n: 0 })).error, 'OPPONENT_OFFLINE');
    const token = turnIsX ? S.tokenO : S.tokenX;
    const auto = track(ioc(BASE, { transports: ['websocket'], forceNew: true, reconnectionDelay: 50, reconnectionDelayMax: 100 }));
    await once(auto, 'connect');
    let again = null;
    auto.on('connect', async () => (again = await emit(auto, 'room:join', { code: room.code, token })));
    const first = await emit(auto, 'room:join', { code: room.code, token });
    assert.ok(first.ok);
    assert.equal(first.state.game.id, r.state.game.id);
    auto.io.engine.close();
    await sleep(700);
    assert.ok(again && again.ok, 'voltou sozinho');
    if (turnIsX) S.o = auto;
    else S.x = auto;
    assert.ok((await emit(mover, 'game:roll', { n: 0, dice: [1, 1] })).ok);
    const replaced = once(auto, 'session:replaced');
    const dup = track(await connect());
    assert.ok((await emit(dup, 'room:join', { code: room.code, token })).ok);
    await replaced;
    auto.close();
    if (turnIsX) S.o = dup;
    else S.x = dup;
  });

  await t.test('persistência: posições, cartas e histórico sobrevivem ao reinício do servidor', async () => {
    const r = ctx.manager.rooms.get(room.code);
    const before = JSON.stringify({ game: r.state.game, match: r.state.match, stats: r.stats });
    const games = Number((await ctx.db.one('SELECT COUNT(*) AS n FROM games WHERE room_code = $1', [room.code])).n);
    S.x.close();
    S.o.close();
    await sleep(80);
    await ctx.close();
    await boot();
    const x = await connect();
    const rx = await emit(x, 'room:join', { code: room.code, token: S.tokenX });
    assert.ok(rx.ok, rx.message);
    const r2 = ctx.manager.rooms.get(room.code);
    assert.equal(JSON.stringify({ game: r2.state.game, match: r2.state.match, stats: r2.stats }), before);
    assert.ok(rx.chat.length > 5);
    const o = await connect();
    assert.ok((await emit(o, 'room:join', { code: room.code, token: S.tokenO })).ok);
    S.x = x;
    S.o = o;
    assert.equal((await emit(x, 'history:get')).games.length, games);
    assert.equal((await http('GET', '/api/admin/session', { auth: true })).data.authenticated, true);
    while (game(room.code).pending) await resolvePending(room.code, S);
    await roll(room.code, S, [1, 2]);
  });

  await t.test('abandonar e voltar a entrar na sala', async () => {
    const left = once(S.x, 'room:event', 2000, (e) => e.type === 'left');
    assert.ok((await emit(S.o, 'room:leave')).ok);
    await left;
    const r = ctx.manager.rooms.get(room.code);
    assert.equal(r.seats.O, null);
    assert.equal(r.state.phase, 'lobby');
    const back = await emit(S.o, 'room:join', { code: room.code, name: 'Bruno' });
    assert.ok(back.ok);
    assert.equal(back.seat, 'O');
    S.tokenO = back.token;
  });

  await t.test('apagar histórico só com acordo dos dois', async () => {
    assert.ok((await emit(S.x, 'history:clear-request')).ok);
    assert.equal((await emit(S.x, 'history:clear-answer', { accept: true })).error, 'NO_REQUEST');
    const cleared = once(S.x, 'history:cleared');
    assert.ok((await emit(S.o, 'history:clear-answer', { accept: true })).cleared);
    await cleared;
    const h = await emit(S.x, 'history:get');
    assert.equal(h.games.length, 0);
    assert.equal(h.stats.games, 0);
  });

  await t.test('administração: estatísticas, viagem, cartas próprias, encerrar, reabrir, apagar e eliminar', async () => {
    assert.ok((await emit(S.x, 'match:mode', { mode: 'classic' })).ok);
    assert.ok((await emit(S.x, 'match:start')).ok);
    await winGame(room.code, S, 'X');
    const st = await http('GET', '/api/admin/stats', { auth: true });
    assert.equal(st.status, 200);
    assert.ok(st.data.games >= 1 && st.data.totals.rolls >= 1);
    assert.equal(st.data.live.online, 2);
    assert.equal((await http('PUT', '/api/admin/settings', { auth: true, body: { reunionDate: '15/08/2027' } })).status, 400);
    const put = await http('PUT', '/api/admin/settings', { auth: true, body: { reunionDate: '2027-08-15', destination: 'São Gonçalo', reactionsEnabled: false, customKnowme: 'Qual é o meu doce preferido de festa?\n' } });
    assert.equal(put.status, 200);
    assert.equal((await emit(S.x, 'react', { kind: 'clap' })).error, 'DISABLED');
    const info = await emit(S.x, 'app:info');
    assert.equal(info.trip.date, '2027-08-15');
    assert.equal(info.trip.destination, 'São Gonçalo');
    const { decks } = require('../server/settings');
    assert.ok(decks(ctx.settings).knowme.includes('Qual é o meu doce preferido de festa?'));
    assert.ok((await http('PUT', '/api/admin/settings', { auth: true, body: { reactionsEnabled: true } })).data.ok);
    const list = await http('GET', '/api/admin/rooms', { auth: true });
    assert.ok(list.data.rooms.find((x) => x.code === room.code).seats.X.connected);
    const closed = once(S.x, 'room:closed');
    assert.equal((await http('POST', `/api/admin/rooms/${room.code}/close`, { auth: true })).status, 200);
    await closed;
    const probe = await connect();
    assert.equal((await emit(probe, 'room:join', { code: room.code, name: 'Novo' })).error, 'ROOM_CLOSED');
    assert.equal((await http('POST', `/api/admin/rooms/${room.code}/reopen`, { auth: true })).status, 200);
    assert.ok((await emit(probe, 'room:join', { code: room.code, name: 'Novo' })).ok);
    assert.equal((await http('POST', `/api/admin/rooms/${room.code}/clear-history`, { auth: true })).status, 200);
    assert.equal(Number((await ctx.db.one('SELECT COUNT(*) AS n FROM games WHERE room_code = $1', [room.code])).n), 0);
    const gone = once(probe, 'room:closed');
    assert.equal((await http('DELETE', `/api/admin/rooms/${room.code}`, { auth: true })).status, 200);
    await gone;
    assert.equal((await emit(probe, 'room:lookup', { code: room.code })).error, 'ROOM_NOT_FOUND');
    [probe, S.x, S.o].forEach((s) => s.close());
  });

  await t.test('duas salas em paralelo não se misturam', async () => {
    const r1 = await createRoom('A');
    const r2 = await createRoom('B');
    const p1 = await seat(r1.code);
    const p2 = await seat(r2.code);
    await emit(p1.x, 'match:start');
    await emit(p2.x, 'match:start');
    let leak = 0;
    p2.x.on('room:state', (s) => s.code !== r2.code && leak++);
    await winGame(r1.code, p1, 'X');
    assert.equal(leak, 0);
    assert.equal(ctx.manager.rooms.get(r2.code).state.game.actions, 0);
    [p1.x, p1.o, p2.x, p2.o].forEach((s) => s.close());
  });

  await t.test('limite de tentativas de login e terminar todas as sessões', async () => {
    assert.equal((await http('POST', '/api/admin/sessions/logout-all', { auth: true })).status, 200);
    assert.equal((await http('GET', '/api/admin/rooms', { auth: true })).status, 401);
    let last;
    for (let i = 0; i < 10; i++) last = await http('POST', '/api/admin/login', { body: { password: `x${i}` } });
    assert.equal(last.status, 429);
  });
});
