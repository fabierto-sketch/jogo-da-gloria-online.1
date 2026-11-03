/* ==========================================================================
   JOGO DO GALO ONLINE — painel de administração
   A palavra-passe nunca é guardada no navegador: o login devolve apenas um
   cookie de sessão HttpOnly. Todas as permissões são validadas no servidor.
   ========================================================================== */
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const PHASES = { lobby: 'À espera', playing: 'Em viagem', between: 'Entre viagens', matchover: 'Encontro terminado' };
  const REASON_TXT = { checkmate: 'xeque-mate', resign: 'desistência', timeout: 'tempo', agreement: 'acordo', stalemate: 'afogamento', repetition: 'repetição', insufficient: 'material insuf.', fifty: '50 lances', 'timeout-insufficient': 'tempo' };
  let modes = [];
  let rooms = [];
  let refreshTimer = null;
  let tab = 'overview';

  /* Preferências visuais do jogo (tema/modo) — só aparência */
  try {
    const p = JSON.parse(localStorage.getItem('gloria.prefs') || '{}');
    if (p.theme) document.body.dataset.theme = p.theme;
    if (p.mode) document.body.dataset.mode = p.mode;
  } catch {
    /* sem preferências */
  }
  $('#btn-mode').onclick = () => {
    const b = document.body.dataset;
    b.mode = b.mode === 'dark' ? 'light' : 'dark';
    try {
      const p = JSON.parse(localStorage.getItem('gloria.prefs') || '{}');
      p.mode = b.mode;
      localStorage.setItem('gloria.prefs', JSON.stringify(p));
    } catch {
      /* nada */
    }
  };

  function toast(msg, bad = false) {
    const t = document.createElement('div');
    t.className = `toast${bad ? ' bad' : ''}`;
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => {
      t.classList.add('out');
      setTimeout(() => t.remove(), 400);
    }, 3200);
  }

  async function api(method, url, body) {
    let res;
    try {
      res = await fetch(url, {
        method,
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'jogo-da-gloria' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      return { ok: false, status: 0, message: 'Sem ligação ao servidor.' };
    }
    let data = {};
    try {
      data = await res.json();
    } catch {
      /* vazio */
    }
    if (res.status === 401 && !url.endsWith('/login')) showLogin();
    return { status: res.status, ...data };
  }

  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };
  const btn = (label, cls, fn) => {
    const b = el('button', `btn ${cls}`, label);
    b.type = 'button';
    b.onclick = fn;
    return b;
  };
  const ago = (ts) => {
    const s = Math.round((Date.now() - ts) / 1000);
    if (s < 60) return 'agora';
    if (s < 3600) return `há ${Math.round(s / 60)} min`;
    if (s < 172800) return `há ${Math.round(s / 3600)} h`;
    return `há ${Math.round(s / 86400)} dias`;
  };
  const fmt = (ts) => new Date(ts).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  const modeName = (id) => (modes.find((m) => m.id === id) || { name: id || '—' }).name;
  const inviteText = (url, code) => `Vamos jogar ao Jogo da Glória? ✈️❤️\n${url}\nCódigo da sala: ${code}`;
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Convite copiado!');
    } catch {
      prompt('Copia o convite:', text);
    }
  }
  function confirmDialog(title, text, ok = 'Confirmar') {
    return new Promise((resolve) => {
      const m = $('#modal-confirm');
      $('#confirm-title').textContent = title;
      $('#confirm-text').textContent = text;
      $('#confirm-ok').textContent = ok;
      m.hidden = false;
      const done = (v) => {
        m.hidden = true;
        m.onclick = null;
        $('#confirm-ok').onclick = null;
        resolve(v);
      };
      $('#confirm-ok').onclick = () => done(true);
      m.onclick = (e) => (e.target === m || e.target.closest('[data-close]')) && done(false);
    });
  }

  /* ---------------- Sessão ---------------- */
  function showLogin() {
    clearInterval(refreshTimer);
    $('#panel-view').hidden = true;
    $('#login-view').hidden = false;
    $('#login-password').focus();
  }
  function showPanel() {
    $('#login-view').hidden = true;
    $('#panel-view').hidden = false;
    loadSettings().then(refresh);
    clearInterval(refreshTimer);
    refreshTimer = setInterval(refresh, 5000);
  }
  async function boot() {
    const r = await api('GET', '/api/admin/session');
    if (r.authenticated) return showPanel();
    showLogin();
    if (r.configured === false) $('#login-error').textContent = 'A administração está desativada: defina ADMIN_PASSWORD (mínimo 6 caracteres) nas variáveis de ambiente do servidor.';
  }
  $('#login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const input = $('#login-password');
    const r = await api('POST', '/api/admin/login', { password: input.value });
    input.value = ''; // nunca fica guardada
    if (!r.ok) return ($('#login-error').textContent = r.message || 'Não foi possível entrar.');
    $('#login-error').textContent = '';
    showPanel();
  });
  $('#btn-logout').onclick = async () => {
    await api('POST', '/api/admin/logout');
    showLogin();
  };
  $('#btn-logout-all').onclick = async () => {
    if (!(await confirmDialog('Terminar todas as sessões?', 'Todos os administradores autenticados (incluindo tu) terão de voltar a entrar.', 'Terminar'))) return;
    await api('POST', '/api/admin/sessions/logout-all');
    showLogin();
  };

  /* ---------------- Separadores ---------------- */
  $$('#admin-tabs button').forEach((b) =>
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      $$('#admin-tabs button').forEach((x) => x.classList.toggle('on', x === b));
      $$('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== tab));
      refresh();
    })
  );
  function refresh() {
    if ($('#panel-view').hidden) return;
    if (tab === 'overview') loadStats();
    else if (tab === 'rooms') loadRooms();
    else if (tab === 'activity') loadActivity();
  }

  /* ---------------- Criar sala ---------------- */
  $('#create-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const b = e.target.querySelector('button');
    b.disabled = true;
    const r = await api('POST', '/api/admin/rooms', { label: $('#room-label').value.trim() });
    b.disabled = false;
    if (!r.ok) return toast(r.message || 'Não foi possível criar a sala.', true);
    $('#room-label').value = '';
    $('#new-room').hidden = false;
    $('#new-code').textContent = r.room.code;
    $('#new-link').textContent = r.room.inviteUrl;
    $('#new-link').href = r.room.inviteUrl;
    $('#btn-new-join').href = r.room.inviteUrl;
    $('#btn-new-copy').onclick = () => copy(inviteText(r.room.inviteUrl, r.room.code));
    toast(`Sala ${r.room.code} criada ✨`);
    loadStats();
  });

  /* ---------------- Visão geral ---------------- */
  async function loadStats() {
    const r = await api('GET', '/api/admin/stats');
    if (!r.ok) return;
    const k = $('#kpis');
    k.innerHTML = '';
    [
      ['Salas criadas', r.roomsCreated],
      ['Salas existentes', r.rooms],
      ['Salas ativas agora', r.live.active, 'live'],
      ['Jogadores online', r.live.online, 'live'],
      ['Viagens jogadas', r.games],
      ['Encontros', r.matches],
      ['Lançamentos de dados', r.totals.rolls],
      ['💞 Acertos sobre o outro', r.totals.known],
      ['🎭 Desafios cumpridos', r.totals.challenges],
    ].forEach(([l, v, c]) => {
      const d = el('div', `kpi${c ? ` ${c}` : ''}`);
      d.append(el('small', '', l), el('b', '', String(v)));
      k.appendChild(d);
    });
    // Gráfico por dia
    const chart = $('#chart');
    chart.innerHTML = '';
    const entries = Object.entries(r.perDay);
    const max = Math.max(1, ...entries.map(([, n]) => n));
    entries.forEach(([day, n]) => {
      const col = el('div', 'col');
      col.title = `${day}: ${n} partida(s)`;
      const bar = el('i');
      bar.style.height = `${(n / max) * 100}%`;
      col.append(el('b', '', n ? String(n) : ''), bar, el('span', '', day.slice(8, 10)));
      chart.appendChild(col);
    });
    // Cartas
    const res = $('#results');
    res.innerHTML = '';
    const t = r.totals;
    const top = Math.max(1, t.known, t.quiz, t.challenges, t.talks);
    [['💞 Quanto me conheces', t.known], ['🇵🇹🇧🇷 Quiz certo', t.quiz], ['🎭 Desafios', t.challenges], ['💬 Conversas', t.talks]].forEach(([l, n]) => {
      const row = el('div', 'r');
      const track = el('div', 'track');
      const fill = el('div', 'fill');
      fill.style.width = `${(n / top) * 100}%`;
      fill.style.background = 'linear-gradient(90deg, var(--accent), var(--accent2))';
      track.appendChild(fill);
      row.append(el('span', '', l), track, el('b', '', String(n)));
      res.appendChild(row);
    });
    res.appendChild(el('p', 'muted small', `${r.games} viagens · ${t.rolls} lançamentos de dados.`));
    // Últimas partidas
    const tb = $('#recent-games');
    tb.innerHTML = '';
    if (!r.recent.length) {
      const tr = el('tr');
      const td = el('td', 'muted', 'Ainda sem partidas.');
      td.colSpan = 6;
      tr.appendChild(td);
      tb.appendChild(tr);
    }
    r.recent.forEach((g) => {
      const tr = el('tr');
      const sm = g.summary || {};
      [fmt(g.ended_at), g.room_code, modeName(g.mode), `${g.x_name} ❤️ ${g.o_name}`, `🏆 ${g.winner === 'X' ? g.x_name : g.o_name}`, String(sm.rolls || '—')].forEach((t, i) => tr.appendChild(el('td', i === 4 ? 'res-win' : '', t)));
      tb.appendChild(tr);
    });
  }

  /* ---------------- Salas ---------------- */
  async function loadRooms() {
    const r = await api('GET', '/api/admin/rooms');
    if (!r.ok) return;
    rooms = r.rooms;
    $('#rooms-updated').textContent = `· atualizado às ${new Date().toLocaleTimeString('pt-PT')}`;
    renderRooms();
  }
  $('#rooms-filter').onchange = renderRooms;
  $('#rooms-search').oninput = renderRooms;
  function renderRooms() {
    const filter = $('#rooms-filter').value;
    const q = $('#rooms-search').value.trim().toLowerCase();
    const list = rooms.filter((room) => {
      const live = ['X', 'O'].some((s) => room.seats[s] && room.seats[s].connected);
      if (filter === 'live' && !live) return false;
      if (filter === 'open' && room.status !== 'open') return false;
      if (filter === 'closed' && room.status !== 'closed') return false;
      return !q || room.code.toLowerCase().includes(q) || (room.label || '').toLowerCase().includes(q);
    });
    const box = $('#rooms');
    box.innerHTML = '';
    $('#rooms-empty').hidden = rooms.length > 0;
    list.forEach((room) => box.appendChild(roomCard(room)));
  }
  function roomCard(room) {
    const online = ['X', 'O'].filter((s) => room.seats[s] && room.seats[s].connected).length;
    const card = el('div', `room-card glass${room.status === 'closed' ? ' closed' : ''}`);
    const top = el('div', 'room-top');
    top.append(el('span', 'room-code', room.code), el('span', 'room-label', room.label || ''));
    top.appendChild(room.status === 'closed' ? el('span', 'badge closed', 'Fechada') : el('span', `badge${online ? ' live' : ''}`, online ? `${online} online` : PHASES[room.phase] || 'À espera'));
    card.appendChild(top);
    ['X', 'O'].forEach((s) => {
      const p = room.seats[s];
      const row = el('div', 'room-player');
      const dot = el('span', `dot${p && p.connected ? ' on' : ''}`);
      row.append(dot, el('span', 'seat', s === 'X' ? '①' : '②'), el('span', '', p ? p.name : 'Lugar livre'));
      if (p && !p.connected && p.lastSeen) row.appendChild(el('small', 'muted', `· visto ${ago(p.lastSeen)}`));
      row.appendChild(el('span', 'score', `${room.stats[s].wins} vit.`));
      card.appendChild(row);
    });
    const meta = el('div', 'room-meta');
    meta.append(
      el('span', '', `Criada ${fmt(room.createdAt)}`),
      el('span', '', `Atividade ${ago(room.lastActivity)}`),
      el('span', '', `${room.stats.games} viagens`),
      el('span', '', `Modo: ${modeName(room.mode)} · ${PHASES[room.phase] || room.phase}`)
    );
    card.appendChild(meta);
    const acts = el('div', 'room-actions');
    acts.append(
      btn('Copiar convite', 'btn-primary', () => copy(inviteText(room.inviteUrl, room.code))),
      (() => {
        const a = el('a', 'btn btn-glass', 'Abrir');
        a.href = room.inviteUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        return a;
      })()
    );
    if (room.status === 'closed') acts.appendChild(btn('Reabrir', 'btn-glass', () => action('POST', `/api/admin/rooms/${room.code}/reopen`, `Sala ${room.code} reaberta.`)));
    else
      acts.appendChild(
        btn('Fechar', 'btn-glass', async () => {
          if (await confirmDialog(`Fechar a sala ${room.code}?`, 'Os jogadores são desligados e ninguém pode entrar até a reabrires. O histórico mantém-se.', 'Fechar sala'))
            action('POST', `/api/admin/rooms/${room.code}/close`, `Sala ${room.code} fechada.`);
        })
      );
    acts.appendChild(
      btn('Limpar histórico', 'btn-glass', async () => {
        if (await confirmDialog(`Limpar o histórico de ${room.code}?`, 'Apaga partidas, estatísticas e chat desta sala. Não pode ser anulado.', 'Limpar'))
          action('POST', `/api/admin/rooms/${room.code}/clear-history`, 'Histórico apagado.');
      })
    );
    acts.appendChild(
      btn('Eliminar', 'btn-danger', async () => {
        if (await confirmDialog(`Eliminar a sala ${room.code}?`, 'A sala, os jogadores e todo o histórico são apagados definitivamente.', 'Eliminar'))
          action('DELETE', `/api/admin/rooms/${room.code}`, `Sala ${room.code} eliminada.`);
      })
    );
    card.appendChild(acts);
    return card;
  }
  async function action(method, url, okMsg) {
    const r = await api(method, url);
    if (!r.ok) return toast(r.message || 'Operação falhou.', true);
    toast(okMsg);
    loadRooms();
  }

  /* ---------------- Definições ---------------- */
  async function loadSettings() {
    const r = await api('GET', '/api/admin/settings');
    if (!r.ok) return;
    modes = r.modes;
    const sel = $('#s-defaultMode');
    sel.innerHTML = '';
    modes.forEach((m) => {
      const o = el('option', '', `${m.emoji} ${m.name}`);
      o.value = m.id;
      sel.appendChild(o);
    });
    fillSettings(r.settings);
  }
  function fillSettings(s) {
    $('#s-defaultMode').value = s.defaultMode;
    $('#s-origin').value = s.origin || '';
    $('#s-destination').value = s.destination || '';
    $('#s-reunionDate').value = s.reunionDate || '';
    $('#s-customKnowme').value = (s.customKnowme || []).join('\n');
    $('#s-customTalk').value = (s.customTalk || []).join('\n');
    $('#s-customChallenges').value = (s.customChallenges || []).join('\n');
    $('#s-autoNextSeconds').value = s.autoNextSeconds;
    $('#s-welcomeMessage').value = s.welcomeMessage || '';
    for (const k of ['chatEnabled', 'reactionsEnabled', 'tauntsEnabled', 'playersCanClearHistory']) $(`#s-${k}`).checked = !!s[k];
    $('#s-surpriseChallenges').value = (s.surpriseChallenges || []).join('\n');
  }
  const settingsMsg = (t, ok) => {
    const m = $('#settings-msg');
    m.textContent = t;
    m.className = `small full ${ok ? 'ok' : 'bad'}`;
  };
  $('#settings-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      defaultMode: $('#s-defaultMode').value,
      origin: $('#s-origin').value,
      destination: $('#s-destination').value,
      reunionDate: $('#s-reunionDate').value,
      customKnowme: $('#s-customKnowme').value.split('\n'),
      customTalk: $('#s-customTalk').value.split('\n'),
      customChallenges: $('#s-customChallenges').value.split('\n'),
      autoNextSeconds: Number($('#s-autoNextSeconds').value),
      welcomeMessage: $('#s-welcomeMessage').value,
      surpriseChallenges: $('#s-surpriseChallenges').value.split('\n'),
    };
    for (const k of ['chatEnabled', 'reactionsEnabled', 'tauntsEnabled', 'playersCanClearHistory']) body[k] = $(`#s-${k}`).checked;
    const r = await api('PUT', '/api/admin/settings', body);
    if (!r.ok) return settingsMsg(r.message || 'Não foi possível guardar.', false);
    fillSettings(r.settings);
    settingsMsg('Definições guardadas ✓', true);
    toast('Definições guardadas.');
  });
  $('#btn-reset-challenges').onclick = async () => {
    if (!(await confirmDialog('Repor os desafios originais?', 'A lista atual de desafios surpresa será substituída.', 'Repor'))) return;
    const r = await api('POST', '/api/admin/settings/reset-challenges');
    if (r.ok) {
      fillSettings(r.settings);
      settingsMsg('Desafios repostos ✓', true);
    }
  };

  /* ---------------- Atividade ---------------- */
  async function loadActivity() {
    const r = await api('GET', '/api/admin/activity');
    if (!r.ok) return;
    const s = r.server;
    const box = $('#server-info');
    box.innerHTML = '';
    const up = s.uptimeSec > 3600 ? `${Math.floor(s.uptimeSec / 3600)} h ${Math.floor((s.uptimeSec % 3600) / 60)} min` : `${Math.floor(s.uptimeSec / 60)} min`;
    [
      ['Base de dados', s.database === 'postgres' ? 'PostgreSQL' : 'SQLite (local)'],
      ['Ligado há', up],
      ['Ligações abertas', s.sockets],
      ['Jogadores online', r.live.online],
      ['Memória', `${s.memoryMb} MB`],
      ['TURN', s.turnConfigured ? 'Configurado' : 'Só STUN'],
      ['Node.js', s.node],
    ].forEach(([l, v]) => {
      const d = el('div', 'kpi');
      d.append(el('small', '', l), el('b', '', String(v)));
      d.lastChild.style.fontSize = '1.1rem';
      box.appendChild(d);
    });
    const ul = $('#activity');
    ul.innerHTML = '';
    if (!r.log.length) ul.appendChild(el('li', 'muted', 'Sem atividade registada desde o último arranque.'));
    r.log.forEach((e) => {
      const li = el('li');
      const t = el('time', '', fmt(e.at));
      li.append(t, el('span', `type ${e.type}`, e.type), el('span', '', e.message));
      ul.appendChild(li);
    });
  }

  boot();
})();
