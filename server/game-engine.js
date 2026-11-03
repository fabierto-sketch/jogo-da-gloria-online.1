'use strict';

/**
 * Jogo da Glória «A Viagem» — regras executadas apenas no servidor.
 *
 * 63 casas (0 = partida no Porto, 63 = o Reencontro). Dois dados.
 * Casas especiais clássicas com nomes da viagem e cartas para um casal:
 *   conheces (o outro julga), conversa (o outro confirma), quiz PT×BR
 *   (o servidor corrige), desafio (o outro julga) e sorte.
 * Para ganhar: chegar ao 63 com a conta certa (o excesso faz recuar) e
 * responder bem à pergunta final, escolhida pelo outro jogador.
 */

const crypto = require('crypto');

const LAST = 63;
const PLANES = [5, 9, 14, 18, 23, 27, 32, 36, 41, 45, 50, 54, 59];
const CARDS = {
  knowme: [3, 15, 29, 38, 47, 57],
  talk: [8, 20, 34, 44, 55],
  quiz: [4, 11, 17, 25, 33, 40, 49, 61],
  challenge: [7, 13, 22, 35, 46, 60],
  fortune: [10, 16, 24, 30, 39, 48, 56],
};
const SPECIAL = {
  6: { kind: 'bridge', to: 12, again: true, name: 'Ponte D. Luís', text: 'Ponte D. Luís! Atravessas o Douro até à casa 12 e jogas outra vez. 🌉' },
  19: { kind: 'skip', turns: 1, name: 'Saudade', text: 'Saudade… ficas uma vez sem jogar a olhar para as fotos. 💭' },
  26: { kind: 'again', name: 'Correio do amor', text: 'Chegou uma carta de amor! Jogas outra vez. 💌' },
  31: { kind: 'skip', turns: 2, name: 'Jet lag', text: 'Jet lag! Ficas duas vezes sem jogar. 😴' },
  42: { kind: 'goto', to: 30, name: 'Fuso horário', text: 'Fuso horário trocado! Voltas à casa 30. 🕐' },
  52: { kind: 'skip', turns: 3, name: 'Alfândega', text: 'Alfândega! Ficas retido três vezes. 🛃' },
  53: { kind: 'again', name: 'Bilhete dourado', text: 'Bilhete dourado! Jogas outra vez. 🎫' },
  58: { kind: 'goto', to: 30, name: 'Voo cancelado', text: 'Voo cancelado! Voltas à casa 30 para apanhar outro voo. ❌' },
};
const BAD = new Set(['skip', 'goto']);
const REWARD = { knowme: { ok: 2, fail: 0 }, talk: { ok: 1, fail: 0 }, quiz: { ok: 2, fail: -1 }, challenge: { ok: 3, fail: -2 } };
const FINAL_FALLBACK = 56;
const other = (s) => (s === 'X' ? 'O' : 'X');

function squareInfo(n) {
  if (n === 0) return { kind: 'start' };
  if (n === LAST) return { kind: 'final' };
  if (PLANES.includes(n)) return { kind: 'plane' };
  if (SPECIAL[n]) return SPECIAL[n];
  for (const [kind, list] of Object.entries(CARDS)) if (list.includes(n)) return { kind: 'card', deck: kind };
  return { kind: 'plain' };
}

/** Mapa completo das casas (para o cliente desenhar o tabuleiro). */
function boardMap() {
  return Array.from({ length: LAST + 1 }, (_, n) => ({ n, ...squareInfo(n) }));
}

const rand = (n) => crypto.randomInt(n);
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class Game {
  constructor({ id = null, starter = 'X', now = Date.now() } = {}) {
    this.id = id;
    this.starter = starter;
    this.turn = starter;
    this.pos = { X: 0, O: 0 };
    this.skip = { X: 0, O: 0 };
    this.shield = { X: false, O: false };
    this.rolled = { X: false, O: false }; // já fizeram o primeiro lançamento?
    this.pending = null; // carta ou pergunta final por resolver
    this.actions = 0; // contador de ações (proteção contra duplicados)
    this.last = null; // última ação (para animar)
    this.log = [];
    this.stats = { X: { rolls: 0, cards: 0, known: 0, quiz: 0, challenges: 0, talks: 0 }, O: { rolls: 0, cards: 0, known: 0, quiz: 0, challenges: 0, talks: 0 } };
    this.used = { knowme: [], talk: [], quiz: [], challenge: [], fortune: [] };
    this.status = 'playing';
    this.winner = null;
    this.startedAt = now;
    this.endedAt = null;
  }

  static from(o) {
    const g = new Game();
    Object.assign(g, JSON.parse(JSON.stringify(o)));
    return g;
  }

  toJSON() {
    const { id, starter, turn, pos, skip, shield, rolled, pending, actions, last, log, stats, used, status, winner, startedAt, endedAt } = this;
    return { id, starter, turn, pos, skip, shield, rolled, pending, actions, last, log, stats, used, status, winner, startedAt, endedAt };
  }

  /** Regista no diário de bordo uma descrição legível dos passos. */
  logSteps(steps, dice = null) {
    const DECK_NAMES = { knowme: 'Quanto me conheces?', talk: 'Conversa a dois', quiz: 'Portugal × Brasil', challenge: 'Desafio' };
    for (const st of steps) {
      let text = null;
      if (st.t === 'move') text = `🎲 ${dice ? `${dice[0]}+${dice[1]}` : st.sum}: casa ${st.from} → ${st.to}`;
      else if (st.t === 'card') text = `tirou a carta «${DECK_NAMES[st.deck]}»`;
      else if (st.t === 'result') text = st.type === 'final' ? (st.success ? 'acertou a pergunta final! ❤️' : 'falhou a pergunta final 💫') : st.passed ? 'passou a carta' : st.success ? 'acertou / cumpriu ✓' : 'não acertou ✗';
      else if (st.t === 'skip') text = 'ficou sem jogar ⏸';
      else if (st.t === 'final') text = 'chegou ao Reencontro! ❤️';
      else if (st.t === 'win') text = 'venceu a viagem! 🏆';
      else if (st.text) text = st.text;
      if (text) this.note(text, st.seat || st.a || null);
    }
  }

  note(text, seat = null) {
    this.log.push({ n: this.actions, seat, text, at: Date.now() });
    if (this.log.length > 80) this.log.shift();
  }

  draw(deck, decks) {
    const list = decks[deck] || [];
    if (!list.length) return null;
    let free = list.map((_, i) => i).filter((i) => !this.used[deck].includes(i));
    if (!free.length) {
      this.used[deck] = [];
      free = list.map((_, i) => i);
    }
    const i = free[rand(free.length)];
    this.used[deck].push(i);
    return { index: i, card: list[i] };
  }

  /** Passa a vez, saltando quem tem rondas a cumprir. */
  advanceTurn(steps) {
    let next = other(this.turn);
    for (let guard = 0; guard < 8 && this.skip[next] > 0; guard++) {
      this.skip[next] -= 1;
      steps.push({ t: 'skip', seat: next, left: this.skip[next] });
      next = other(next);
    }
    this.turn = next;
  }

  /** Move de forma simples (prémios das cartas) — sem efeitos de casas. */
  nudge(seat, delta, steps) {
    const from = this.pos[seat];
    let to = Math.max(0, Math.min(LAST - 1, from + delta));
    if (from + delta >= LAST) to = LAST - 1; // os prémios nunca dão a vitória diretamente
    this.pos[seat] = to;
    if (to !== from) steps.push({ t: 'slide', seat, from, to });
  }

  /**
   * Resolve a casa onde o jogador caiu. Pode encadear (avião → avião),
   * criar uma carta pendente ou dar direito a jogar outra vez.
   * @returns {{again:boolean}}
   */
  land(seat, steps, decks, depth = 0) {
    const n = this.pos[seat];
    const info = squareInfo(n);
    if (depth > 6) return { again: false };
    if (info.kind === 'final') {
      this.pending = { type: 'final', seat, judge: other(seat), stage: 'ask', text: null };
      steps.push({ t: 'final', seat });
      return { again: false };
    }
    if (info.kind === 'plane') {
      const next = PLANES.find((p) => p > n);
      if (next) {
        this.pos[seat] = next;
        steps.push({ t: 'fly', seat, from: n, to: next, text: `De avião em avião! Voas da casa ${n} para a ${next} e jogas outra vez. ✈️` });
        return { again: true };
      }
      steps.push({ t: 'msg', seat, text: 'Último avião da viagem! Jogas outra vez. ✈️' });
      return { again: true };
    }
    if (SPECIAL[n]) {
      const sp = SPECIAL[n];
      if (BAD.has(sp.kind) && this.shield[seat]) {
        this.shield[seat] = false;
        steps.push({ t: 'msg', seat, text: `O amuleto protegeu-te de «${sp.name}»! 🍀` });
        return { again: false };
      }
      if (sp.kind === 'bridge') {
        this.pos[seat] = sp.to;
        steps.push({ t: 'jump', seat, from: n, to: sp.to, text: sp.text });
        return { again: true };
      }
      if (sp.kind === 'again') {
        steps.push({ t: 'msg', seat, text: sp.text });
        return { again: true };
      }
      if (sp.kind === 'skip') {
        this.skip[seat] = sp.turns;
        steps.push({ t: 'msg', seat, text: sp.text, bad: true });
        return { again: false };
      }
      if (sp.kind === 'goto') {
        this.pos[seat] = sp.to;
        steps.push({ t: 'jump', seat, from: n, to: sp.to, text: sp.text, bad: true });
        return { again: false };
      }
    }
    if (info.kind === 'card') {
      if (info.deck === 'fortune') return this.fortune(seat, steps, decks, depth);
      const drawn = this.draw(info.deck, decks);
      if (!drawn) return { again: false };
      this.stats[seat].cards += 1;
      const p = { type: info.deck, seat, judge: info.deck === 'quiz' ? null : other(seat), index: drawn.index };
      if (info.deck === 'quiz') {
        const order = shuffle([0, 1, 2, 3].slice(0, drawn.card.o.length));
        p.text = drawn.card.q;
        p.options = order.map((i) => drawn.card.o[i]);
        p.answer = order.indexOf(drawn.card.a); // nunca é enviado ao navegador
      } else p.text = drawn.card;
      this.pending = p;
      steps.push({ t: 'card', seat, deck: info.deck });
      return { again: false };
    }
    return { again: false };
  }

  fortune(seat, steps, decks, depth) {
    const drawn = this.draw('fortune', decks);
    const f = drawn ? drawn.card : { kind: 'again', text: 'Sorte! Joga outra vez.' };
    steps.push({ t: 'fortune', seat, text: f.text, kind: f.kind });
    if (f.kind === 'forward' || f.kind === 'back') {
      const from = this.pos[seat];
      const to = Math.max(0, Math.min(LAST - 1, from + (f.kind === 'forward' ? f.n : -f.n)));
      this.pos[seat] = to;
      steps.push({ t: 'slide', seat, from, to });
      if (squareInfo(to).kind === 'card' && squareInfo(to).deck === 'fortune') return { again: false };
      return this.land(seat, steps, decks, depth + 1);
    }
    if (f.kind === 'again') return { again: true };
    if (f.kind === 'swap') {
      const o = other(seat);
      [this.pos[seat], this.pos[o]] = [this.pos[o], this.pos[seat]];
      steps.push({ t: 'swap', a: seat, b: o, posA: this.pos[seat], posB: this.pos[o] });
      return { again: false };
    }
    if (f.kind === 'oppback') {
      this.nudge(other(seat), -f.n, steps);
      return { again: false };
    }
    if (f.kind === 'shield') {
      this.shield[seat] = true;
      return { again: false };
    }
    if (f.kind === 'nextplane') {
      const next = PLANES.find((p) => p > this.pos[seat]);
      if (next) {
        const from = this.pos[seat];
        this.pos[seat] = next;
        steps.push({ t: 'fly', seat, from, to: next });
      }
      return { again: false };
    }
    return { again: false };
  }

  /** Lançar os dados. `forced` permite fixar os dados nos testes. */
  roll(seat, decks, forced = null) {
    if (this.status !== 'playing') return { ok: false, error: 'GAME_OVER' };
    if (this.pending) return { ok: false, error: 'CARD_PENDING' };
    if (seat !== this.turn) return { ok: false, error: 'NOT_YOUR_TURN' };
    const dice = forced || [1 + rand(6), 1 + rand(6)];
    const sum = dice[0] + dice[1];
    const steps = [];
    const from = this.pos[seat];
    this.stats[seat].rolls += 1;
    this.actions += 1;
    let target;
    const first = !this.rolled[seat];
    this.rolled[seat] = true;
    // regra clássica do primeiro lançamento: 6+3 → 26, 5+4 → 53
    if (first && from === 0 && ((dice.includes(6) && dice.includes(3)) || (dice.includes(5) && dice.includes(4)))) {
      target = dice.includes(6) ? 26 : 53;
      steps.push({ t: 'msg', seat, text: `Primeiro lançamento mágico (${dice[0]}+${dice[1]})! Vais direto para a casa ${target}. ✨` });
      this.pos[seat] = target;
      steps.push({ t: 'jump', seat, from, to: target });
    } else {
      target = from + sum;
      let bounce = false;
      if (target > LAST) {
        target = LAST - (target - LAST);
        bounce = true;
      }
      this.pos[seat] = target;
      steps.push({ t: 'move', seat, from, to: target, sum, bounce });
      if (bounce) steps.push({ t: 'msg', seat, text: `Passaste do Reencontro! Recuas até à casa ${target}. ↩️` });
    }
    const r = this.land(seat, steps, decks);
    if (!this.pending && this.status === 'playing') {
      if (r.again) steps.push({ t: 'again', seat });
      else this.advanceTurn(steps);
    }
    this.last = { n: this.actions, seat, dice, steps };
    this.logSteps(steps, dice);
    return { ok: true, dice, steps };
  }

  /** O jogador responde ao quiz (corrigido pelo servidor). */
  answer(seat, choice, decks) {
    const p = this.pending;
    if (!p || p.type !== 'quiz') return { ok: false, error: 'NO_CARD' };
    if (seat !== p.seat) return { ok: false, error: 'NOT_ALLOWED' };
    if (!Number.isInteger(choice) || choice < 0 || choice >= p.options.length) return { ok: false, error: 'INVALID_ANSWER' };
    const right = choice === p.answer;
    return this.resolveCard(right, { choice, right, correct: p.answer }, decks);
  }

  /** O outro jogador julga a carta (conheces, conversa, desafio, final). */
  judge(seat, ok, decks) {
    const p = this.pending;
    if (!p || p.type === 'quiz' || (p.type === 'final' && p.stage !== 'answer')) return { ok: false, error: 'NO_CARD' };
    if (seat !== p.judge) return { ok: false, error: 'NOT_ALLOWED' };
    return this.resolveCard(!!ok, { ok: !!ok }, decks);
  }

  /** Quem tirou a carta pode passar (conta como não cumprido). */
  pass(seat, decks) {
    const p = this.pending;
    if (!p || p.type === 'final' || p.type === 'quiz') return { ok: false, error: 'NO_CARD' };
    if (seat !== p.seat) return { ok: false, error: 'NOT_ALLOWED' };
    return this.resolveCard(false, { passed: true }, decks);
  }

  /** Pergunta final: o outro escreve a pergunta (ou deixa o jogo escolher). */
  ask(seat, text, decks) {
    const p = this.pending;
    if (!p || p.type !== 'final' || p.stage !== 'ask') return { ok: false, error: 'NO_CARD' };
    if (seat !== p.judge) return { ok: false, error: 'NOT_ALLOWED' };
    let q = typeof text === 'string' ? text.trim() : '';
    if (!q) {
      const d = this.draw('knowme', decks);
      q = d ? d.card : 'Diz-me porque é que me amas.';
      p.random = true;
    }
    p.text = q;
    p.stage = 'answer';
    this.actions += 1;
    this.last = { n: this.actions, seat, dice: null, steps: [{ t: 'asked', seat }] };
    return { ok: true };
  }

  resolveCard(success, extra, decks) {
    const p = this.pending;
    const seat = p.seat;
    const steps = [{ t: 'result', seat, type: p.type, success, ...extra }];
    this.pending = null;
    this.actions += 1;
    if (p.type === 'final') {
      if (success) {
        this.status = 'over';
        this.winner = seat;
        this.endedAt = Date.now();
        steps.push({ t: 'win', seat });
      } else {
        const from = this.pos[seat];
        this.pos[seat] = FINAL_FALLBACK;
        steps.push({ t: 'jump', seat, from, to: FINAL_FALLBACK, text: `Quase! Voltas à casa ${FINAL_FALLBACK} e tentas outra vez. 💫`, bad: true });
        this.advanceTurn(steps);
      }
      this.last = { n: this.actions, seat, dice: null, steps };
      this.logSteps(steps);
      return { ok: true, success, steps };
    }
    const st = this.stats[seat];
    if (success) {
      if (p.type === 'knowme') st.known += 1;
      if (p.type === 'quiz') st.quiz += 1;
      if (p.type === 'challenge') st.challenges += 1;
      if (p.type === 'talk') st.talks += 1;
    }
    const delta = success ? REWARD[p.type].ok : REWARD[p.type].fail;
    if (delta) this.nudge(seat, delta, steps);
    this.advanceTurn(steps);
    this.last = { n: this.actions, seat, dice: null, steps };
    this.logSteps(steps);
    return { ok: true, success, steps };
  }

  summary() {
    return { pos: this.pos, stats: this.stats, rolls: this.stats.X.rolls + this.stats.O.rolls };
  }

  /** Estado público: sem a resposta certa do quiz. */
  view() {
    const g = this.toJSON();
    if (g.pending) {
      const { answer, index, ...rest } = g.pending;
      g.pending = rest;
    }
    delete g.used;
    return g;
  }
}

module.exports = { Game, boardMap, squareInfo, LAST, PLANES, CARDS, SPECIAL, REWARD, other };
