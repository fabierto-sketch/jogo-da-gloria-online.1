/* ==========================================================================
   JOGO DA GLÓRIA ONLINE — aplicação do jogador
   ========================================================================== */
(function () {
  'use strict';

  const { TOKENS, tokenSVG, squareName, Board, Dice, demo, Sound, Confetti, Background, wait } = window.Gloria;
  const { initVideo } = window.GloriaVideo;
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
  const THEMES = [
    { id: 'classic', name: 'Oceano clássico' },
    { id: 'neon', name: 'Néon futurista' },
    { id: 'wood', name: 'Madeira premium' },
    { id: 'crystal', name: 'Cristal' },
    { id: 'blackgold', name: 'Preto e dourado' },
    { id: 'bluetech', name: 'Azul tecnológico' },
    { id: 'redblack', name: 'Vermelho e preto' },
    { id: 'romantic', name: 'Romântico' },
  ];
  const BOARD_COLORS = ['', 'linear-gradient(170deg,#3fa9d6,#0b4a78)', 'linear-gradient(170deg,#38d9a9,#087f5b)', 'linear-gradient(170deg,#74c0fc,#1864ab)', 'linear-gradient(170deg,#b197fc,#5f3dc4)', 'linear-gradient(170deg,#ffa8a8,#c2255c)', 'linear-gradient(170deg,#ffd8a8,#d9480f)', 'linear-gradient(170deg,#495057,#0b0d10)', 'linear-gradient(170deg,#99e9f2,#0b7285)'];

  /* ---------------- Preferências (só neste navegador) ---------------- */
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(`gloria.${k}`);
        return v === null ? d : JSON.parse(v);
      } catch {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem(`gloria.${k}`, JSON.stringify(v));
      } catch {
        /* sem armazenamento */
      }
    },
    del(k) {
      try {
        localStorage.removeItem(`gloria.${k}`);
      } catch {
        /* nada */
      }
    },
  };
  const prefs = Object.assign({ theme: 'classic', mode: 'dark', board: '', pieces: 'illustrated', bg: 'aurora', anim: 'full', sound: 'on', volume: 70 }, store.get('prefs', {}));
  const sound = new Sound();
  const confetti = new Confetti($('#confetti'));
  const background = new Background($('#bg-canvas'));

  function applyPrefs() {
    const b = document.body.dataset;
    b.theme = prefs.theme;
    b.mode = prefs.mode;
    b.pieces = prefs.pieces;
    b.bg = prefs.bg;
    b.anim = prefs.anim;
    const idx = BOARD_COLORS.indexOf(prefs.board);
    if (idx > 0) b.board = String(idx);
    else delete b.board;
    background.setMode(prefs.bg);
    sound.enabled = prefs.sound === 'on';
    sound.setVolume(prefs.volume / 100);
    $$('#home-mode use, #btn-mode use').forEach((u) => u.setAttribute('href', prefs.mode === 'dark' ? '#i-sun' : '#i-moon'));
    document.querySelector('meta[name="theme-color"]').content = getComputedStyle(document.body).getPropertyValue('--bg1').trim() || '#0d2a3f';
    store.set('prefs', prefs);
    renderStyleModal();
  }
  const toggleMode = () => {
    prefs.mode = prefs.mode === 'dark' ? 'light' : 'dark';
    applyPrefs();
  };
  $('#home-mode').onclick = toggleMode;
  $('#btn-mode').onclick = toggleMode;

  function renderStyleModal() {
    const grid = $('#opt-theme');
    if (!grid.childElementCount) {
      THEMES.forEach((t) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'theme-opt';
        b.dataset.v = t.id;
        const sw = document.createElement('span');
        sw.className = 'sw';
        sw.dataset.theme = t.id;
        sw.dataset.mode = 'dark';
        sw.style.background = 'linear-gradient(170deg, var(--sea1), var(--sea2))';
        sw.innerHTML = `<span class="sw-sea"><i style="background:var(--p-x)"></i><i style="background:var(--p-o)"></i><i style="background:var(--final1)"></i></span>`;
        const nm = document.createElement('span');
        nm.className = 'nm';
        nm.textContent = t.name;
        b.append(sw, nm);
        b.onclick = () => {
          prefs.theme = t.id;
          applyPrefs();
        };
        grid.appendChild(b);
      });
      const sws = $('#opt-board');
      BOARD_COLORS.forEach((c) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.v = c;
        b.title = c ? c : 'Cor do tema';
        b.style.background = c || 'conic-gradient(#7c9cff, #ff8a5b, #0ca678, #7c9cff)';
        b.onclick = () => {
          prefs.board = c;
          applyPrefs();
        };
        sws.appendChild(b);
      });
      for (const [id, key] of [['#opt-mode', 'mode'], ['#opt-pieces', 'pieces'], ['#opt-bg', 'bg'], ['#opt-anim', 'anim'], ['#opt-sound', 'sound']]) {
        $$(`${id} button`).forEach((b) => (b.onclick = () => {
          prefs[key] = b.dataset.v;
          applyPrefs();
          sound.play('click');
        }));
      }
      $('#opt-volume').oninput = (e) => {
        prefs.volume = Number(e.target.value);
        applyPrefs();
      };
    }
    $$('#opt-theme .theme-opt').forEach((b) => b.classList.toggle('on', b.dataset.v === prefs.theme));
    $$('#opt-board button').forEach((b) => b.classList.toggle('on', b.dataset.v === prefs.board));
    for (const [id, key] of [['#opt-mode', 'mode'], ['#opt-pieces', 'pieces'], ['#opt-bg', 'bg'], ['#opt-anim', 'anim'], ['#opt-sound', 'sound']]) {
      $$(`${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.v === prefs[key]));
    }
    $('#opt-volume').value = prefs.volume;
  }
  $('#home-style').onclick = () => openModal('#modal-style');
  $('#btn-style').onclick = () => openModal('#modal-style');

  /* ---------------- Utilitários ---------------- */
  function toast(message, { bad = false, duration = 3500, actions } = {}) {
    const t = document.createElement('div');
    t.className = `toast${bad ? ' bad' : ''}`;
    const span = document.createElement('span');
    span.textContent = message;
    t.appendChild(span);
    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      t.classList.add('out');
      setTimeout(() => t.remove(), 350);
    };
    if (actions) {
      const box = document.createElement('div');
      box.className = 'acts';
      actions.forEach(({ label, kind, onClick }) => {
        const b = document.createElement('button');
        b.className = `btn btn-sm ${kind || 'btn-glass'}`;
        b.textContent = label;
        b.onclick = () => {
          onClick();
          close();
        };
        box.appendChild(b);
      });
      t.appendChild(box);
    }
    $('#toasts').appendChild(t);
    if (duration) setTimeout(close, duration);
    return { close };
  }
  const openModal = (id) => ($(id).hidden = false);
  const closeModal = (id) => ($(id).hidden = true);
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => (e.target === m || e.target.closest('[data-close]')) && (m.hidden = true)));
  $$('[data-open]').forEach((b) => (b.onclick = () => openModal(b.dataset.open)));
  document.addEventListener('keydown', (e) => e.key === 'Escape' && $$('.modal').forEach((m) => m.id !== 'modal-call' && (m.hidden = true)));
  function confirmDialog(title, text, ok = 'Confirmar') {
    return new Promise((resolve) => {
      $('#confirm-title').textContent = title;
      $('#confirm-text').textContent = text;
      const btn = $('#confirm-ok');
      btn.textContent = ok;
      const m = $('#modal-confirm');
      m.hidden = false;
      const done = (v) => {
        m.hidden = true;
        btn.onclick = null;
        m.removeEventListener('click', cancel);
        resolve(v);
      };
      const cancel = (e) => (e.target === m || e.target.closest('[data-close]')) && done(false);
      btn.onclick = () => done(true);
      m.addEventListener('click', cancel);
    });
  }
  const fmtDate = (ts) => new Date(ts).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  /* ---------------- Ligação ---------------- */
  const socket = io({ reconnectionDelay: 800, reconnectionDelayMax: 4000 });
  const app = { code: null, token: null, seat: null, state: null, joined: false, info: null, socket };
  const emitAck = (ev, p, ms = 10000) =>
    new Promise((resolve) => {
      if (!socket.connected) return resolve({ ok: false, error: 'OFFLINE', message: 'Sem ligação ao servidor.' });
      socket.timeout(ms).emit(ev, p, (err, res) => resolve(err ? { ok: false, error: 'TIMEOUT', message: 'O servidor não respondeu.' } : res || { ok: false }));
    });
  const setConn = (k, t) => {
    $('#conn').className = `pill ${k}`;
    $('#conn-text').textContent = t;
  };
  socket.on('connect', async () => {
    setConn('ok', 'Ligado');
    app.info = await emitAck('app:info');
    renderInfo();
    if (app.joined && app.token) {
      const r = await emitAck('room:join', { code: app.code, token: app.token });
      if (r.ok) onJoined(r, { silent: true });
      else lostSeat(r.message);
    }
  });
  socket.on('disconnect', () => setConn('bad', 'Sem ligação'));
  socket.io.on('reconnect_attempt', () => setConn('warn', 'A religar…'));
  setInterval(() => {
    if (!socket.connected) return;
    const t0 = performance.now();
    socket.timeout(5000).emit('net:ping', null, (err) => {
      if (err) return setConn('warn', 'Ligação lenta');
      const ms = Math.round(performance.now() - t0);
      setConn(ms > 400 ? 'warn' : 'ok', `Ligado · ${ms} ms`);
    });
  }, 5000);
  socket.on('server:restarting', (p) => toast(p.message, { duration: 6000 }));

  let demoBoard = null;
  function renderCountdown() {
    const trip = (app.info && app.info.trip) || {};
    const el = $('#countdown');
    if (!trip.date) {
      el.hidden = false;
      el.innerHTML = '<span class="beat">❤️</span> <span>Cada viagem aproxima-vos do <strong>Reencontro</strong> — até Agosto!</span>';
      return;
    }
    const target = new Date(`${trip.date}T00:00:00`);
    const days = Math.ceil((target - new Date()) / 86400000);
    el.hidden = false;
    if (days > 0) el.innerHTML = `<span class="beat">❤️</span> Faltam <b>${days}</b> ${days === 1 ? 'dia' : 'dias'} para o Reencontro`;
    else if (days === 0) el.innerHTML = '<span class="beat">❤️</span> <b>É hoje!</b> Boa viagem! ✈️';
    else el.innerHTML = '<span class="beat">❤️</span> Juntos, finalmente! 🥰';
  }
  setInterval(renderCountdown, 60000);
  function renderInfo() {
    const info = app.info || {};
    const w = $('#welcome');
    w.hidden = !info.welcomeMessage;
    w.textContent = info.welcomeMessage || '';
    const ul = $('#rules-modes');
    ul.innerHTML = '';
    (info.modes || []).forEach((m) => {
      const li = document.createElement('li');
      li.innerHTML = '<b></b> — <span></span>';
      li.firstChild.textContent = `${m.emoji} ${m.name}`;
      li.lastChild.textContent = m.description;
      ul.appendChild(li);
    });
    const trip = info.trip || {};
    $('#trip-from').textContent = trip.origin || 'Porto';
    $('#trip-to').textContent = trip.destination || 'São Gonçalo · RJ';
    renderCountdown();
    if (!demoBoard && info.board) demoBoard = demo($('#demo-board'), info.board, trip);
    if (typeof ensureBoard === 'function') ensureBoard();
    const bar = $('#react-bar');
    bar.innerHTML = '';
    Object.entries(info.reactions || {}).forEach(([kind, r]) => {
      if (kind === 'taunt' && !info.taunts) return;
      const b = document.createElement('button');
      b.type = 'button';
      b.title = r.label;
      b.textContent = r.emoji;
      b.onclick = async () => {
        const res = await emitAck('react', { kind });
        if (!res.ok && res.error !== 'RATE_LIMITED') toast(res.message, { bad: true });
      };
      bar.appendChild(b);
    });
    $('#chat').hidden = info.chat === false;
  }

  /* ---------------- Início e entrada ---------------- */
  const joinCode = $('#join-code');
  const joinName = $('#join-name');
  joinName.value = store.get('name', '');
  const normalize = (v) => (v || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const roomInfo = (t, k = '') => {
    $('#room-info').textContent = t;
    $('#room-info').className = `room-info ${k}`;
  };
  $('#btn-enter').onclick = () => {
    openModal('#modal-join');
    (joinCode.value ? joinName : joinCode).focus();
  };
  async function lookup(code) {
    const r = await emitAck('room:lookup', { code, token: store.get(`token.${code}`) });
    if (normalize(joinCode.value) !== code) return r;
    if (!r.ok) roomInfo(r.message, 'bad');
    else if (r.mySeat) roomInfo(`O teu lugar (${r.mySeat}) está reservado — entra já!`, 'ok');
    else if (r.full) roomInfo('Esta sala já tem dois jogadores.', 'bad');
    else {
      const p = Object.values(r.seats).find(Boolean);
      roomInfo(p ? `${p.name} está à tua espera ${p.connected ? '🟢' : ''}` : `Sala ${code} pronta. Sê o primeiro!`, 'ok');
    }
    return r;
  }
  let lookupTimer;
  joinCode.addEventListener('input', () => {
    const code = normalize(joinCode.value);
    joinCode.value = code;
    $('#join-error').textContent = '';
    clearTimeout(lookupTimer);
    if (code.length < 6) return roomInfo('');
    if (!CODE_RE.test(code)) return roomInfo('Código inválido.', 'bad');
    lookupTimer = setTimeout(() => lookup(code), 250);
  });
  $('#join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const code = normalize(joinCode.value);
    const name = joinName.value.trim();
    const token = store.get(`token.${code}`);
    if (!CODE_RE.test(code)) return ($('#join-error').textContent = 'Introduz o código de 6 caracteres.');
    if (!name && !token) return ($('#join-error').textContent = 'Escreve o teu nome.');
    $('#join-btn').disabled = true;
    const r = await emitAck('room:join', { code, name, token });
    $('#join-btn').disabled = false;
    if (!r.ok) return ($('#join-error').textContent = r.message);
    if (name) store.set('name', name);
    onJoined(r);
  });

  function onJoined(r, { silent = false } = {}) {
    const first = !app.joined;
    Object.assign(app, { code: r.state.code, token: r.token, seat: r.seat, joined: true });
    store.set(`token.${app.code}`, r.token);
    history.replaceState(null, '', `/?sala=${app.code}`);
    closeModal('#modal-join');
    $('#screen-home').hidden = true;
    $('#screen-game').hidden = false;
    $('#room-code').textContent = app.code;
    if (first) {
      renderChat(r.chat || []);
      if (!silent) {
        sound.play('join');
        toast(`Bem-vindo a bordo! ✈️ Sala ${app.code}`);
      }
    }
    applyState(r.state);
    loadHistory();
  }
  function backHome(msg) {
    video.hangup(false);
    app.joined = false;
    app.state = null;
    $('#screen-game').hidden = true;
    $('#screen-home').hidden = false;
    $$('.modal').forEach((m) => (m.hidden = true));
    $('#celebrate').hidden = true;
    if (msg) {
      openModal('#modal-join');
      $('#join-error').textContent = msg;
      if (app.code) {
        joinCode.value = app.code;
        lookup(app.code);
      }
    }
  }
  function lostSeat(msg) {
    store.del(`token.${app.code}`);
    app.token = null;
    backHome(msg);
  }
  socket.on('session:replaced', (p) => {
    app.joined = false;
    backHome(p.message);
  });
  socket.on('room:closed', (p) => {
    lostSeat(p.message);
    toast(p.message, { bad: true, duration: 6000 });
  });

  /* ---------------- Jogo ---------------- */
  const otherSeat = () => (app.seat === 'X' ? 'O' : 'X');
  const other = (s) => (s === 'X' ? 'O' : 'X');
  const names = () => ({ X: app.state && app.state.seats.X ? app.state.seats.X.name : 'Jogador 1', O: app.state && app.state.seats.O ? app.state.seats.O.name : 'Jogador 2' });
  const video = initVideo({ socket, emitAck, toast, sound, app, openModal, closeModal });
  const dice = new Dice($('#dice'));
  let board = null;
  let lastGameId = null;
  let seenN = 0;
  let queue = Promise.resolve();
  let animating = false;
  let pending = false;
  let lastQuiz = null;

  function ensureBoard() {
    if (board || !app.info || !app.info.board) return board;
    board = new Board($('#board'), { map: app.info.board, trip: app.info.trip || {} });
    board.onTile = (n) => {
      const c = app.info.board[n];
      showComment(`Casa ${n}: ${squareName(c)}`);
    };
    return board;
  }

  socket.on('room:state', (s) => app.joined && s.code === app.code && applyState(s));

  async function act(event, payload = {}) {
    const g = app.state && app.state.game;
    if (!g || pending) return { ok: false };
    pending = true;
    renderControls(app.state);
    const r = await emitAck(event, { ...payload, n: g.actions });
    pending = false;
    if (!r.ok && r.error !== 'STALE_MOVE') {
      sound.play('error', { gain: 0.4 });
      toast(r.message, { bad: true, duration: 2500 });
    }
    renderControls(app.state);
    return r;
  }

  $('#btn-roll').onclick = async () => {
    dice.shake(true);
    sound.play('dice', { gain: 0.7 });
    const r = await act('game:roll');
    dice.shake(false);
    if (!r.ok) sound.play('error', { gain: 0.3 });
  };

  function applyState(s) {
    const prev = app.state;
    app.state = s;
    ensureBoard();
    const g = s.game;
    if (board) board.setTokens(s.tokens || { X: 'man', O: 'woman' });
    if (g && g.id !== lastGameId) {
      lastGameId = g.id;
      seenN = g.last ? g.last.n : 0;
      queue = Promise.resolve();
      animating = false;
      if (board) {
        board.place('X', g.pos.X, false);
        board.place('O', g.pos.O, false);
      }
      if (prev && prev.game) sound.play('whoosh', { gain: 0.5 });
    } else if (g && g.last && g.last.n > seenN) {
      const last = g.last;
      seenN = last.n;
      const snapshot = JSON.parse(JSON.stringify(g));
      animating = true;
      queue = queue.then(() => playSteps(last, snapshot)).catch(() => {}).then(() => {
        animating = false;
        syncBoard();
        renderCard(app.state);
        renderControls(app.state);
      });
    } else if (!g && board) {
      board.place('X', 0, false);
      board.place('O', 0, false);
    }
    renderPlayers(s);
    renderScore(s);
    renderStatus(s);
    renderPanels(s);
    renderLog(s);
    renderControls(s);
    if (!animating) {
      syncBoard();
      renderCard(s);
    }
    if (prev && prev.game && g && prev.game.id === g.id && prev.game.status === 'playing' && g.status === 'over') queue.then(() => celebrate(s));
    if (prev && prev.phase !== 'matchover' && s.phase === 'matchover' && s.match && s.modeInfo && !s.modeInfo.single) queue.then(() => setTimeout(() => matchOver(s), 2500));
    if (!prev || !prev.lastResult || !s.lastResult || prev.lastResult.gameId !== s.lastResult.gameId || prev.stats.games !== s.stats.games) loadHistory();
  }

  function syncBoard() {
    const g = app.state && app.state.game;
    if (!board || !g) return;
    if (board.pos.X !== g.pos.X || board.pos.O !== g.pos.O) {
      board.place('X', g.pos.X, true);
      board.place('O', g.pos.O, true);
    }
    board.setActive(g.status === 'playing' ? g.turn : null);
  }

  let bannerTimer;
  async function banner(text, kind = '', ms = 1700) {
    const b = $('#banner');
    b.textContent = text;
    b.className = `gbanner ${kind}`;
    b.hidden = false;
    clearTimeout(bannerTimer);
    await wait(ms);
    b.hidden = true;
  }

  async function playSteps(last, g) {
    if (!board) return;
    const n = names();
    $('#card').hidden = true;
    if (last.dice) {
      sound.play('dice', { gain: 0.8 });
      await dice.show(last.dice, true);
    }
    for (const st of last.steps) {
      const who = n[st.seat] || '';
      if (st.t === 'move') {
        await board.hop(st.seat, st.from, st.to, { sum: st.sum, onHop: () => sound.play('hop', { gain: 0.35, rate: 0.9 + Math.random() * 0.25 }) });
      } else if (st.t === 'fly') {
        sound.play('plane', { gain: 0.7 });
        if (st.text) banner(`${who}: ${st.text}`, 'good', 1800);
        await board.fly(st.seat, st.to);
        board.burst(st.to, '✨');
      } else if (st.t === 'jump' || st.t === 'slide') {
        if (st.text) {
          sound.play(st.bad ? 'boing' : 'chime', { gain: 0.7 });
          await banner(`${who}: ${st.text}`, st.bad ? 'bad' : 'good', 1700);
        }
        await board.fly(st.seat, st.to, 'sliding');
        if (st.bad) {
          board.tokens[st.seat].classList.add('sad');
          setTimeout(() => board.tokens[st.seat] && board.tokens[st.seat].classList.remove('sad'), 800);
        }
      } else if (st.t === 'swap') {
        sound.play('whoosh');
        board.tokens.X.classList.add('sliding');
        board.tokens.O.classList.add('sliding');
        board.place(st.a, st.posA);
        board.place(st.b, st.posB);
        await wait(800);
        board.tokens.X.classList.remove('sliding');
        board.tokens.O.classList.remove('sliding');
      } else if (st.t === 'msg' || st.t === 'fortune') {
        sound.play(st.bad ? 'boing' : st.t === 'fortune' ? 'chime' : 'reveal', { gain: 0.6 });
        if (st.bad && board.tokens[st.seat]) board.tokens[st.seat].classList.add('sad');
        await banner(`${st.t === 'fortune' ? '🍀 ' : ''}${who}: ${st.text}`, st.bad ? 'bad' : 'good', 2100);
        if (board.tokens[st.seat]) board.tokens[st.seat].classList.remove('sad');
      } else if (st.t === 'skip') {
        toast(`${who} fica sem jogar ⏸${st.left ? ` (ainda ${st.left})` : ''}`, { duration: 2200 });
      } else if (st.t === 'card') {
        sound.play('card');
        await wait(250);
      } else if (st.t === 'final') {
        sound.play('chime');
        board.burst(63, '❤️');
        await banner(`${who} chegou ao Reencontro! Agora, a pergunta final… ❤️`, 'good', 2200);
      } else if (st.t === 'result') {
        if (st.type === 'quiz' && lastQuiz) {
          const right = lastQuiz.options[st.correct];
          sound.play(st.success ? 'chime' : 'boing');
          await banner(st.success ? `Certo! 🎉 «${right}» (+2)` : `Errado… era «${right}» (−1)`, st.success ? 'good' : 'bad', 2200);
        } else if (st.type !== 'final') {
          sound.play(st.success ? 'chime' : 'boing');
          const txt = { knowme: ['Acertou! 💞 (+2)', 'Não acertou… 😅'], talk: ['Que bonito 💬 (+1)', 'Fica para a próxima 💬'], challenge: ['Desafio cumprido! 🎭 (+3)', 'Desafio recusado… (−2)'] }[st.type];
          if (txt) await banner(`${who}: ${st.success ? txt[0] : txt[1]}`, st.success ? 'good' : 'bad', 1800);
        } else if (!st.success) {
          sound.play('boing');
        }
      } else if (st.t === 'again') {
        await banner(`${who} joga outra vez! 🎲`, 'good', 1100);
      } else if (st.t === 'win') {
        board.burst(63, '❤️');
      }
    }
  }

  function renderPlayers(s) {
    const g = s.game;
    const toks = s.tokens || { X: 'man', O: 'woman' };
    for (const seat of ['X', 'O']) {
      const el = $(`.player[data-seat="${seat}"]`);
      const p = s.seats[seat];
      el.querySelector('.pname').textContent = p ? p.name : 'Lugar livre';
      let st = 'À espera de jogador';
      if (p) {
        if (!p.connected) st = 'Desligado';
        else if (g && g.status === 'playing' && s.phase === 'playing') {
          const bits = [`Casa ${g.pos[seat]}`];
          if (g.skip[seat]) bits.push(`⏸ ${g.skip[seat]}×`);
          if (g.shield[seat]) bits.push('🍀');
          st = bits.join(' · ');
        } else st = 'Online';
      }
      el.querySelector('.pstatus').textContent = st;
      el.querySelector('.tk-mini').innerHTML = tokenSVG(toks[seat]);
      el.classList.toggle('online', !!(p && p.connected));
      el.classList.toggle('offline', !!(p && !p.connected));
      el.classList.toggle('me', seat === app.seat);
      el.classList.toggle('turn', s.phase === 'playing' && !!g && g.status === 'playing' && g.turn === seat);
      el.querySelector('.pwins').textContent = s.modeInfo.scoring && s.match ? s.match.scores[seat] : s.stats[seat].wins;
    }
  }

  function renderScore(s) {
    const st = s.stats;
    const n = names();
    const pct = (k) => (st.games ? Math.round((k / st.games) * 100) : 0);
    $('#lbl-x').textContent = n.X;
    $('#lbl-o').textContent = n.O;
    $('#sc-x').textContent = st.X.wins;
    $('#sc-o').textContent = st.O.wins;
    $('#pct-x').textContent = `${pct(st.X.wins)}%`;
    $('#pct-o').textContent = `${pct(st.O.wins)}%`;
    $('#sc-games').textContent = st.games;
    for (const [id, k] of [['kn', 'known'], ['qz', 'quiz'], ['ch', 'challenges'], ['tk', 'talks']]) {
      $(`#${id}-x`).textContent = st.X[k] || 0;
      $(`#${id}-o`).textContent = st.O[k] || 0;
    }
    const lead = st.X.streak > st.O.streak ? 'X' : st.O.streak > st.X.streak ? 'O' : null;
    $('#sc-streak').textContent = lead ? `${n[lead]} ×${st[lead].streak} 🔥` : '—';
  }

  function setStatus(text, cls) {
    const el = $('#status');
    el.className = `status${cls ? ` ${cls}` : ''}`;
    el.textContent = text;
  }

  function renderStatus(s) {
    const n = names();
    const g = s.game;
    const both = s.seats.X && s.seats.O;
    const opp = s.seats[otherSeat()];
    const st = $('#status');
    st.style.cursor = '';
    st.onclick = null;
    if (!both) {
      setStatus('À espera do teu amor… copia o convite 💌');
      st.style.cursor = 'pointer';
      st.onclick = copyInvite;
    } else if (s.phase === 'lobby') setStatus('Escolham as peças e o modo, e comecem a viagem ✈️');
    else if (s.phase === 'playing' && g && g.status === 'playing') {
      if (opp && !opp.connected) setStatus(`${opp.name} desligou-se… a aguardar 🔌`);
      else if (g.pending) {
        const p = g.pending;
        if (p.type === 'final') setStatus(p.stage === 'ask' ? (p.judge === app.seat ? 'Escreve a pergunta final! ❤️' : `${n[p.judge]} está a escolher a pergunta final…`) : p.seat === app.seat ? 'Responde à pergunta final! ❤️' : `${n[p.seat]} está a responder…`, 'mine');
        else if (p.type === 'quiz') setStatus(p.seat === app.seat ? 'Responde ao quiz! 🇵🇹🇧🇷' : `${n[p.seat]} está a responder ao quiz…`, p.seat === app.seat ? 'mine' : '');
        else setStatus(p.judge === app.seat ? `Decide: ${n[p.seat]} ${p.type === 'challenge' ? 'cumpriu' : p.type === 'talk' ? 'respondeu' : 'acertou'}?` : `Responde à carta — ${n[p.judge]} vai decidir 💞`, 'mine');
      } else if (g.turn === app.seat) setStatus('A tua vez — lança os dados! 🎲', 'mine');
      else setStatus(`Vez de ${n[g.turn]}…`);
    } else if (g && g.status === 'over') {
      if (s.phase === 'matchover' && s.match && !s.modeInfo.single) {
        const w = s.match.winner;
        setStatus(w === app.seat ? 'Ganhaste o encontro! 🏆❤️' : `${n[w]} ganhou o encontro ❤️`, w === app.seat ? 'win' : '');
      } else setStatus(g.winner === app.seat ? 'Chegaste primeiro ao Reencontro! 🎉❤️' : `${n[g.winner]} chegou primeiro ao Reencontro ❤️`, g.winner === app.seat ? 'win' : '');
    }
    const bar = $('#match-bar');
    bar.hidden = !s.match || s.phase === 'lobby';
    if (s.match) {
      bar.innerHTML = '';
      const add = (prefix, text) => {
        const span = document.createElement('span');
        span.append(prefix, Object.assign(document.createElement('b'), { textContent: text }));
        bar.appendChild(span);
      };
      add(`${s.modeInfo.emoji} `, s.modeInfo.name);
      if (s.modeInfo.scoring) add('', `${n.X} ${s.match.scores.X} – ${s.match.scores.O} ${n.O}`);
      const num = s.match.games + (s.phase === 'playing' ? 1 : 0);
      bar.appendChild(Object.assign(document.createElement('span'), { innerHTML: `Viagem <b>${num}</b>${s.match.target ? ` · vence quem chegar a <b>${s.match.target}</b>` : ''}` }));
    }
  }

  function renderControls(s) {
    const g = s && s.game;
    const opp = s && s.seats[otherSeat()];
    const canRoll = !!g && s.phase === 'playing' && g.status === 'playing' && !g.pending && g.turn === app.seat && !!opp && opp.connected && !pending && !animating;
    const btn = $('#btn-roll');
    btn.disabled = !canRoll;
    btn.textContent = canRoll ? '🎲 Lançar os dados' : g && g.status === 'playing' && !g.pending && g.turn !== app.seat ? `Vez de ${names()[g.turn]}…` : '🎲 Lançar os dados';
    $('#arena').hidden = s.phase === 'lobby' && !g;
    if (g) {
      const n = names();
      $('#pos-x').innerHTML = `<span style="color:var(--p-x)">●</span> ${esc(n.X)}: casa <b>${g.pos.X}</b>`;
      $('#pos-o').innerHTML = `<span style="color:var(--p-o)">●</span> ${esc(n.O)}: casa <b>${g.pos.O}</b>`;
    }
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* Carta em jogo */
  const DECK_INFO = {
    knowme: { icon: '💞', name: 'Quanto me conheces?' },
    talk: { icon: '💬', name: 'Conversa a dois' },
    quiz: { icon: '🇵🇹🇧🇷', name: 'Portugal × Brasil' },
    challenge: { icon: '🎭', name: 'Desafio' },
    final: { icon: '❤️', name: 'Pergunta final do Reencontro' },
  };
  function renderCard(s) {
    const card = $('#card');
    const g = s && s.game;
    const p = g && g.status === 'playing' && s.phase === 'playing' ? g.pending : null;
    if (!p) {
      card.hidden = true;
      return;
    }
    const n = names();
    const info = DECK_INFO[p.type];
    card.dataset.deck = p.type;
    $('#card-icon').textContent = info.icon;
    $('#card-deck').textContent = info.name;
    const drawer = p.seat === app.seat;
    const judge = p.judge === app.seat;
    const fill = (t) => String(t || '').replace(/\{outro\}/g, n[other(p.seat)]);
    $('#card-text').textContent = p.type === 'final' && p.stage === 'ask' ? (judge ? `${n[p.seat]} chegou ao Reencontro! Escreve a pergunta final — se acertar, ganha.` : `Chegaste ao Reencontro! ${n[p.judge]} está a escolher a tua pergunta final… 💭`) : fill(p.text);
    const opts = $('#card-options');
    opts.innerHTML = '';
    const acts = $('#card-acts');
    acts.innerHTML = '';
    $('#card-ask').hidden = !(p.type === 'final' && p.stage === 'ask' && judge);
    let hint = '';
    const button = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.onclick = fn;
      acts.appendChild(b);
    };
    if (p.type === 'quiz') {
      lastQuiz = { options: p.options };
      p.options.forEach((o, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = `${'ABCD'[i]}) ${o}`;
        b.disabled = !drawer;
        b.onclick = () => act('card:answer', { choice: i });
        opts.appendChild(b);
      });
      hint = drawer ? 'Certo: +2 casas · Errado: −1 casa' : `À espera da resposta de ${n[p.seat]}…`;
    } else if (p.type === 'final') {
      if (p.stage === 'answer') {
        if (judge) {
          button('Acertou — vitória! ❤️', 'btn-primary', () => act('card:judge', { ok: true }));
          button('Não acertou (volta à 56)', 'btn-glass', () => act('card:judge', { ok: false }));
          hint = `${n[p.seat]} responde em voz alta ou no chat.`;
        } else hint = drawer ? `Responde em voz alta ou no chat — ${n[p.judge]} decide se acertaste.` : '';
      }
    } else {
      const labels = {
        knowme: [`Acertou ✓ (+2)`, 'Errou ✗', 'Passar', 'Responde em voz alta ou no chat'],
        talk: ['Respondeu ✓ (+1)', 'Não respondeu', 'Passar', 'Responde com o coração 💬'],
        challenge: ['Cumpriu ✓ (+3)', 'Não cumpriu ✗ (−2)', 'Recusar (−2)', 'Cumpre o desafio à frente da câmara!'],
      }[p.type];
      if (judge) {
        button(labels[0], 'btn-primary', () => act('card:judge', { ok: true }));
        button(labels[1], 'btn-glass', () => act('card:judge', { ok: false }));
        hint = `${n[p.seat]} está a responder… tu decides! 💞`;
      } else if (drawer) {
        button(labels[2], 'btn-glass btn-sm', () => act('card:pass'));
        hint = `${labels[3]} — ${n[p.judge]} vai decidir.`;
      }
    }
    $('#card-hint').textContent = hint;
    if (card.hidden) sound.play('card', { gain: 0.6 });
    card.hidden = false;
  }
  $('#final-send').onclick = () => {
    const text = $('#final-text').value.trim();
    if (!text) return toast('Escreve a pergunta (ou sorteia uma).', { duration: 2000 });
    act('final:ask', { text }).then((r) => r.ok && ($('#final-text').value = ''));
  };
  $('#final-random').onclick = () => act('final:ask', { text: '' });

  function renderLog(s) {
    const g = s.game;
    const list = $('#log');
    list.innerHTML = '';
    if (!g || !g.log || !g.log.length) {
      list.innerHTML = '<li class="empty">A viagem ainda não começou.</li>';
      return;
    }
    const n = names();
    g.log
      .slice(-40)
      .reverse()
      .forEach((l) => {
        const li = document.createElement('li');
        li.className = l.seat || '';
        li.textContent = l.seat ? `${n[l.seat]}: ${l.text}` : l.text;
        list.appendChild(li);
      });
  }

  function renderPanels(s) {
    const both = !!(s.seats.X && s.seats.O);
    $('#lobby').hidden = s.phase !== 'lobby';
    if (s.phase === 'lobby') {
      const info = app.info || {};
      const toks = s.tokens || {};
      const pick = $('#token-pick');
      pick.innerHTML = '';
      document.documentElement.style.setProperty('--me-ring', app.seat === 'X' ? 'var(--p-x)' : 'var(--p-o)');
      document.documentElement.style.setProperty('--other-ring', app.seat === 'X' ? 'var(--p-o)' : 'var(--p-x)');
      (info.tokens || []).forEach((id) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.innerHTML = `${tokenSVG(id)}<span></span>`;
        b.lastChild.textContent = (TOKENS[id] || {}).name || id;
        if (toks[app.seat] === id) b.classList.add('mine');
        if (toks[otherSeat()] === id) {
          b.classList.add('theirs');
          b.dataset.who = names()[otherSeat()];
        }
        b.onclick = async () => {
          const r = await emitAck('match:token', { token: id });
          if (!r.ok) toast(r.message, { bad: true });
          else sound.play('hop');
        };
        pick.appendChild(b);
      });
      const grid = $('#modes');
      grid.innerHTML = '';
      (info.modes || []).forEach((m) => grid.appendChild(optionCard(m, s.mode === m.id, () => emitAck('match:mode', { mode: m.id }))));
      const start = $('#btn-start');
      start.disabled = !both;
      start.textContent = both ? 'Começar a viagem ✈️' : 'À espera do teu amor…';
    }
    // Desafio surpresa
    const ch = $('#challenge');
    ch.hidden = !s.challenge || s.phase === 'lobby';
    if (!ch.hidden) {
      ch.innerHTML = '';
      const p = document.createElement('div');
      p.innerHTML = '🎁 <b>Desafio de quem perder:</b> <span></span>';
      p.lastChild.textContent = s.challenge.text;
      ch.appendChild(p);
      const r = s.lastResult;
      if (r && s.phase !== 'playing') {
        const info = document.createElement('div');
        if (s.challengeDone === true) info.textContent = '✅ Desafio cumprido!';
        else if (s.challengeDone === false) info.textContent = 'Ficou por cumprir… 😏';
        else if (r.winner === app.seat) {
          info.className = 'actions';
          info.append(`${names()[otherSeat()]} cumpriu? `);
          for (const [label, done, cls] of [['Cumprido ✓', true, 'btn-primary'], ['Ficou por cumprir', false, 'btn-glass']]) {
            const b = document.createElement('button');
            b.className = `btn btn-sm ${cls}`;
            b.textContent = label;
            b.onclick = () => emitAck('challenge:done', { done });
            info.appendChild(b);
          }
        } else info.textContent = `É contigo! ${names()[r.winner]} vai confirmar quando cumprires.`;
        ch.appendChild(info);
      }
    }
    const act2 = $('#actions');
    act2.innerHTML = '';
    const btn = (label, cls, fn) => {
      const b = document.createElement('button');
      b.className = `btn ${cls}`;
      b.textContent = label;
      b.onclick = fn;
      act2.appendChild(b);
      return b;
    };
    if (s.phase === 'between') {
      const nb = btn('Próxima viagem ✈️', 'btn-primary btn-lg', async () => {
        const r = await emitAck('game:next');
        if (!r.ok) toast(r.message, { bad: true });
      });
      nb.dataset.auto = s.autoNextAt || '';
      if (s.modeInfo.endless) btn('Terminar encontro', 'btn-glass', endMatch);
    } else if (s.phase === 'matchover') {
      btn('Jogar outra vez', 'btn-primary btn-lg', async () => {
        const r = await emitAck('match:start');
        if (!r.ok) toast(r.message, { bad: true });
      });
      btn('Mudar modo ou peças', 'btn-glass', () => emitAck('match:mode', { mode: s.mode }));
    } else if (s.phase === 'playing' && s.game && s.game.actions === 0) {
      btn(s.modeInfo.endless ? 'Terminar encontro' : 'Voltar à escolha do modo', 'btn-glass btn-sm', endMatch);
    }
    updateCountdown();
  }
  function optionCard(m, on, fn) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `mode${on ? ' on' : ''}`;
    b.innerHTML = '<span></span><b></b><small></small>';
    b.children[0].textContent = m.emoji;
    b.children[1].textContent = m.name;
    b.children[2].textContent = m.description;
    b.onclick = async () => {
      const r = await fn();
      if (r && !r.ok) toast(r.message, { bad: true });
      else sound.play('click');
    };
    return b;
  }
  async function endMatch() {
    const ok = await confirmDialog('Terminar o encontro?', 'O resultado fica registado no histórico.', 'Terminar');
    if (ok) {
      const r = await emitAck('match:end');
      if (!r.ok) toast(r.message, { bad: true });
    }
  }
  function updateCountdown() {
    const b = $('#actions [data-auto]');
    if (!b || !b.dataset.auto) return;
    const left = Math.max(0, Math.ceil((Number(b.dataset.auto) - Date.now()) / 1000));
    b.textContent = `Próxima viagem (${left}s)`;
  }
  setInterval(updateCountdown, 500);

  $('#btn-start').onclick = async () => {
    const r = await emitAck('match:start');
    if (!r.ok) toast(r.message, { bad: true });
  };

  let commentTimer;
  function showComment(text) {
    if (!text) return;
    const c = $('#comment');
    c.textContent = text;
    c.hidden = false;
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
    clearTimeout(commentTimer);
    commentTimer = setTimeout(() => (c.hidden = true), 3000);
  }

  function celebrate(s) {
    const g = s.game;
    const n = names();
    const mine = g.winner === app.seat;
    setTimeout(() => {
      sound.play('win');
      confetti.burst(mine ? ['#ff4d6d', '#ffb3c1', '#ffd43b', '#ffffff', '#63e6be'] : ['#ff4d6d', '#ffb3c1', '#ffffff']);
      $('#cel-piece').textContent = '❤️';
      $('#cel-title').textContent = mine ? 'Chegaste ao Reencontro!' : `${n[g.winner]} chegou primeiro!`;
      const lines = ['Agora só falta Agosto… ✈️', 'Que viagem bonita! ❤️', 'O amor atravessa oceanos 🌊', 'Até já, meu amor! 💌'];
      $('#cel-text').textContent = lines[Math.floor(Math.random() * lines.length)];
      const stats = $('#cel-stats');
      stats.innerHTML = '';
      const me = g.stats[app.seat];
      [
        ['🎲 Lançamentos', me.rolls],
        ['💞 Acertos', me.known],
        ['🇵🇹🇧🇷 Quiz', me.quiz],
        ['🎭 Desafios', me.challenges],
      ].forEach(([l, v]) => {
        const sp = document.createElement('span');
        sp.innerHTML = '<small></small> <b></b>';
        sp.firstChild.textContent = l;
        sp.lastChild.textContent = v;
        stats.appendChild(sp);
      });
      $('#celebrate').hidden = false;
      clearTimeout(celebrate.t);
      celebrate.t = setTimeout(() => ($('#celebrate').hidden = true), 6000);
    }, 400);
  }
  $('#cel-close').onclick = () => ($('#celebrate').hidden = true);
  $('#celebrate').onclick = (e) => e.target.id === 'celebrate' && ($('#celebrate').hidden = true);

  function matchOver(s) {
    const w = s.match.winner;
    const n = names();
    if (w && w !== 'draw') {
      confetti.burst(['#ffd43b', '#ff4d6d', '#fff3bf', '#ff922b']);
      toast(w === app.seat ? `🏆 Ganhaste o encontro ${s.match.scores.X}–${s.match.scores.O}!` : `🏆 ${n[w]} ganhou o encontro.`, { duration: 5000 });
    }
  }

  /* ---------------- Reações ---------------- */
  socket.on('react', (r) => {
    if (!app.joined) return;
    const layer = $('#reactions-layer');
    const el = document.createElement('div');
    el.className = 'float-react';
    el.style.left = `${15 + Math.random() * 65}%`;
    el.style.setProperty('--r', `${(Math.random() - 0.5) * 40}deg`);
    el.textContent = r.emoji;
    const label = document.createElement('small');
    label.textContent = r.text ? `${r.name}: ${r.text}` : r.seat === app.seat ? 'Tu' : r.name;
    el.appendChild(label);
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2300);
    sound.play(r.kind === 'clap' ? 'clap' : 'like', { gain: 0.6 });
  });

  /* ---------------- Eventos da sala ---------------- */
  let clearToast;
  socket.on('room:event', (e) => {
    if (!app.joined) return;
    if (e.type === 'joined') {
      sound.play('join');
      toast(`${e.name} entrou na sala 👋`);
    } else if (e.type === 'left') {
      toast(`${e.name} saiu da sala`, { bad: true });
      video.hangup(false);
    } else if (e.type === 'disconnected') toast(`${e.name} perdeu a ligação…`, { bad: true });
    else if (e.type === 'reconnected') toast(`${e.name} está de volta`, { duration: 2000 });
    else if (e.type === 'clear-request') {
      if (clearToast) clearToast.close();
      clearToast = toast(`${e.name} quer apagar o histórico da sala.`, {
        duration: 20000,
        actions: [
          { label: 'Não', onClick: () => emitAck('history:clear-answer', { accept: false }) },
          { label: 'Apagar', kind: 'btn-danger', onClick: () => emitAck('history:clear-answer', { accept: true }) },
        ],
      });
    } else if (e.type === 'clear-declined') toast(`${e.name} preferiu manter o histórico.`);
  });

  /* ---------------- Histórico ---------------- */
  let historyData = null;
  async function loadHistory() {
    const r = await emitAck('history:get');
    if (!r.ok) return;
    historyData = r;
    const list = $('#recent');
    list.innerHTML = '';
    if (!r.games.length) list.innerHTML = '<li class="empty">Ainda sem viagens.</li>';
    r.games.slice(0, 8).forEach((g) => {
      const li = document.createElement('li');
      const a = document.createElement('span');
      a.textContent = `❤️ ${g.winner === 'X' ? g.x_name : g.o_name}${g.summary && g.summary.rolls ? ` · ${g.summary.rolls} lançamentos` : ''}`;
      const b = document.createElement('small');
      b.textContent = new Date(g.ended_at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' });
      li.append(a, b);
      list.appendChild(li);
    });
    if (!$('#modal-history').hidden) renderHistory();
  }
  function renderHistory() {
    const r = historyData;
    if (!r) return;
    const st = r.stats;
    const n = names();
    const pct = (x) => (st.games ? `${Math.round((x / st.games) * 100)}%` : '—');
    const box = $('#hist-stats');
    box.innerHTML = '';
    [
      ['Viagens', st.games],
      [`Vitórias ${n.X}`, `${st.X.wins} · ${pct(st.X.wins)}`],
      [`Vitórias ${n.O}`, `${st.O.wins} · ${pct(st.O.wins)}`],
      [`💞 ${n.X} acertou`, st.X.known || 0],
      [`💞 ${n.O} acertou`, st.O.known || 0],
      ['🇵🇹🇧🇷 Quiz certo', (st.X.quiz || 0) + (st.O.quiz || 0)],
      ['🎭 Desafios cumpridos', (st.X.challenges || 0) + (st.O.challenges || 0)],
      ['💬 Conversas', (st.X.talks || 0) + (st.O.talks || 0)],
    ].forEach(([l, v]) => {
      const d = document.createElement('div');
      d.innerHTML = '<small></small><b></b>';
      d.firstChild.textContent = l;
      d.lastChild.textContent = v;
      box.appendChild(d);
    });
    const body = $('#hist-body');
    body.innerHTML = '';
    const modeName = (id) => (((app.info && app.info.modes) || []).find((m) => m.id === id) || { name: id }).name;
    if (!r.games.length) body.innerHTML = '<tr><td colspan="7" class="muted">Ainda sem viagens.</td></tr>';
    r.games.forEach((g) => {
      const tr = document.createElement('tr');
      const sm = (g.summary && g.summary.stats) || { X: {}, O: {} };
      const sum = (k) => `${sm.X[k] || 0} · ${sm.O[k] || 0}`;
      [fmtDate(g.ended_at), `${modeName(g.mode)}${g.casual ? ' · sem pontos' : ''}`, `❤️ ${g.winner === 'X' ? g.x_name : g.o_name}${g.challenge_done ? ' · 🎁' : ''}`, (g.summary && g.summary.rolls) || '—', sum('known'), sum('quiz'), sum('challenges')].forEach((t, i) => {
        const td = document.createElement('td');
        td.textContent = t;
        if (i === 2) td.className = 'res-win';
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    const btn = $('#btn-clear');
    btn.hidden = !r.canClear;
    const req = app.state && app.state.clearRequest;
    $('#clear-status').textContent = req === app.seat ? `À espera da confirmação de ${n[otherSeat()]}…` : req ? `${n[req]} pediu para apagar.` : 'Apagar exige o acordo dos dois jogadores.';
    btn.textContent = req && req !== app.seat ? 'Aceitar e apagar' : 'Apagar histórico';
  }
  $('#btn-history').onclick = async () => {
    await loadHistory();
    renderHistory();
    openModal('#modal-history');
  };
  $('#btn-clear').onclick = async () => {
    const req = app.state.clearRequest;
    if (req && req !== app.seat) return emitAck('history:clear-answer', { accept: true });
    const ok = await confirmDialog('Apagar o histórico?', 'Apaga partidas, estatísticas e chat desta sala. O outro jogador tem de confirmar.', 'Pedir para apagar');
    if (!ok) return;
    const r = await emitAck('history:clear-request');
    if (!r.ok) toast(r.message, { bad: true });
    else renderHistory();
  };
  socket.on('history:cleared', () => {
    renderChat([]);
    loadHistory();
    toast('Histórico apagado.');
  });

  /* ---------------- Chat ---------------- */
  const chatList = $('#chat-list');
  const chatInput = $('#chat-input');
  const EMOJIS = ['😀', '😂', '🤣', '😉', '😎', '🤔', '😮', '😏', '😅', '😭', '😡', '🥳', '👏', '👍', '👎', '🙏', '💪', '🔥', '⭐', '🏆', '🎉', '❤️', '💔', '❤️', '😘', '✈️', '🥰', '🍀', '🤝', '👀', '😈', '🫡', '☕'];
  const EMOJI_ONLY = /^(\p{Extended_Pictographic}|\p{Regional_Indicator}|‍|️|\s)+$/u;
  let unread = 0;
  function chatVisible() {
    if (document.hidden) return false;
    const r = $('#chat').getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0;
  }
  function setUnread(n) {
    unread = n;
    for (const id of ['#unread', '#fab-badge']) {
      $(id).hidden = !n;
      $(id).textContent = n;
    }
    document.title = n ? `(${n}) JOGO DA GLÓRIA ONLINE` : 'JOGO DA GLÓRIA ONLINE';
  }
  function addMessage(m) {
    const div = document.createElement('div');
    if (m.kind === 'system') {
      div.className = 'msg system';
      div.textContent = m.text;
    } else {
      const mine = m.seat === app.seat;
      div.className = `msg${mine ? ' mine' : ''}`;
      const who = document.createElement('div');
      who.className = 'who';
      who.textContent = `${mine ? 'Tu' : m.name} · ${new Date(m.at).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' })}`;
      const text = document.createElement('div');
      text.className = 'text';
      if (EMOJI_ONLY.test(m.text) && [...m.text.replace(/\s/g, '')].length <= 6) text.classList.add('big');
      text.textContent = m.text;
      div.append(who, text);
    }
    chatList.appendChild(div);
    chatList.scrollTop = chatList.scrollHeight;
  }
  function renderChat(list) {
    chatList.innerHTML = '';
    list.forEach(addMessage);
    setUnread(0);
  }
  socket.on('chat:message', (m) => {
    if (!app.joined) return;
    addMessage(m);
    $('#typing').hidden = true;
    if (m.kind !== 'system' && m.seat !== app.seat) {
      sound.play('chat');
      if (!chatVisible()) setUnread(unread + 1);
    }
  });
  const clearUnread = () => chatVisible() && unread && setUnread(0);
  document.addEventListener('visibilitychange', clearUnread);
  window.addEventListener('scroll', clearUnread, { passive: true });
  chatInput.addEventListener('focus', () => setUnread(0));
  $('#chat-fab').onclick = () => {
    $('#chat').scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => chatInput.focus(), 400);
    setUnread(0);
  };
  let typingTimer;
  socket.on('chat:typing', () => {
    $('#typing').hidden = false;
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => ($('#typing').hidden = true), 2500);
  });
  let lastTyping = 0;
  chatInput.addEventListener('input', () => {
    if (Date.now() - lastTyping > 1500) {
      lastTyping = Date.now();
      socket.emit('chat:typing');
    }
  });
  $('#chat-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = '';
    $('#emoji-picker').hidden = true;
    const r = await emitAck('chat:send', { text });
    if (!r.ok) {
      chatInput.value = text;
      toast(r.message, { bad: true });
    } else sound.play('send', { gain: 0.5 });
  });
  const picker = $('#emoji-picker');
  EMOJIS.forEach((em) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = em;
    b.onclick = () => {
      chatInput.value += em;
      chatInput.focus();
    };
    picker.appendChild(b);
  });
  $('#btn-emoji').onclick = () => (picker.hidden = !picker.hidden);
  document.addEventListener('click', (e) => !picker.hidden && !e.target.closest('#emoji-picker, #btn-emoji') && (picker.hidden = true));

  /* ---------------- Convite e saída ---------------- */
  async function copyInvite() {
    const url = `${location.origin}/?sala=${app.code}`;
    const text = `Vamos jogar ao Jogo da Glória? ✈️❤️\n${url}\nCódigo da sala: ${app.code}`;
    if (navigator.share && matchMedia('(pointer: coarse)').matches) {
      try {
        return await navigator.share({ title: 'Jogo da Glória Online', text });
      } catch {
        /* copiar */
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      toast('Convite copiado! Envia-o ao teu amor 💌');
    } catch {
      toast(`Convite: ${url}`, { duration: 8000 });
    }
  }
  $('#room-chip').onclick = copyInvite;
  $('#btn-leave').onclick = async () => {
    const ok = await confirmDialog('Sair da sala?', 'O teu lugar fica livre. Podes voltar a entrar com o mesmo convite.', 'Sair');
    if (!ok) return;
    await emitAck('room:leave');
    store.del(`token.${app.code}`);
    app.token = null;
    backHome('');
    toast('Saíste da sala.');
  };

  /* ---------------- Arranque ---------------- */
  applyPrefs();
  const urlCode = normalize(new URLSearchParams(location.search).get('sala') || '');
  if (urlCode) {
    joinCode.value = urlCode;
    openModal('#modal-join');
    const auto = async () => {
      const info = await lookup(urlCode);
      if (info && info.ok && info.mySeat) {
        const r = await emitAck('room:join', { code: urlCode, token: store.get(`token.${urlCode}`) });
        if (r.ok) onJoined(r);
      } else joinName.focus();
    };
    socket.connected ? auto() : socket.once('connect', auto);
  }
  window.__gloria = { app, socket, get board() { return board; }, dice };
})();
