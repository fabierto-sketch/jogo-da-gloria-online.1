/* ==========================================================================
   JOGO DA GLÓRIA ONLINE — tabuleiro em espiral, peças, dados, animações e sons
   ========================================================================== */
(function () {
  'use strict';

  const LAST = 63;
  const reduced = () => document.body.dataset.anim === 'off';
  const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? Math.min(ms, 60) : ms));

  /* ------------------------------------------------------------------ */
  /* Geometria: espiral de Arquimedes com casas a distâncias iguais      */
  /* ------------------------------------------------------------------ */
  function spiral(count = LAST, { cx = 500, cy = 500, rOut = 432, rIn = 150, turns = 2.72 } = {}) {
    const tMax = turns * Math.PI * 2;
    const pt = (t) => {
      const r = rOut - ((rOut - rIn) * t) / tMax;
      const a = 2.35 + t; // começa em baixo à esquerda e roda no sentido dos ponteiros do relógio
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), r };
    };
    // amostragem fina para medir o comprimento
    const samples = [];
    let len = 0;
    let prev = pt(0);
    samples.push({ t: 0, len: 0 });
    for (let i = 1; i <= 4000; i++) {
      const t = (tMax * i) / 4000;
      const p = pt(t);
      len += Math.hypot(p.x - prev.x, p.y - prev.y);
      samples.push({ t, len });
      prev = p;
    }
    const out = [];
    for (let k = 0; k < count; k++) {
      const target = (len * k) / (count - 1);
      let lo = 0;
      while (lo < samples.length - 1 && samples[lo + 1].len < target) lo++;
      const p = pt(samples[lo].t);
      const q = pt(samples[Math.min(samples.length - 1, lo + 8)].t);
      out.push({ x: p.x, y: p.y, angle: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI });
    }
    out.push({ x: cx, y: cy, angle: 0 }); // 63: o Reencontro, no centro
    return out;
  }
  const POS = spiral(LAST);

  const KIND_ICON = { start: '🏠', plane: '✈️', bridge: '🌉', final: '❤️' };
  const DECK = {
    knowme: { icon: '💞', name: 'Quanto me conheces?', cls: 'k-know' },
    talk: { icon: '💬', name: 'Conversa a dois', cls: 'k-talk' },
    quiz: { icon: '🇵🇹🇧🇷', name: 'Portugal × Brasil', cls: 'k-quiz' },
    challenge: { icon: '🎭', name: 'Desafio', cls: 'k-chal' },
    fortune: { icon: '🍀', name: 'Sorte do amor', cls: 'k-fort' },
  };
  const SPECIAL_ICON = { 19: '💭', 26: '💌', 31: '😴', 42: '🕐', 52: '🛃', 53: '🎫', 58: '❌' };
  function squareLook(c) {
    if (c.kind === 'card') return { icon: DECK[c.deck].icon, cls: DECK[c.deck].cls };
    if (c.kind === 'plane') return { icon: '✈️', cls: 'k-plane' };
    if (c.kind === 'bridge') return { icon: '🌉', cls: 'k-good' };
    if (c.kind === 'again') return { icon: SPECIAL_ICON[c.n] || '⭐', cls: 'k-good' };
    if (c.kind === 'skip' || c.kind === 'goto') return { icon: SPECIAL_ICON[c.n] || '⚠️', cls: 'k-bad' };
    if (c.kind === 'start') return { icon: '🏠', cls: 'k-start' };
    if (c.kind === 'final') return { icon: '❤️', cls: 'k-final' };
    return { icon: '', cls: 'k-plain' };
  }
  function squareName(c) {
    if (c.kind === 'card') return DECK[c.deck].name;
    if (c.kind === 'plane') return 'Avião — de avião em avião, jogas outra vez';
    if (c.name) return c.name;
    if (c.kind === 'start') return 'Partida';
    if (c.kind === 'final') return 'O Reencontro';
    return 'Casa';
  }

  /* ------------------------------------------------------------------ */
  /* Peças (desenho original)                                            */
  /* ------------------------------------------------------------------ */
  const TOKENS = {
    man: { name: 'Ele', svg: '<circle cx="50" cy="30" r="15" fill="#f1c7a3"/><path d="M35 26q2-16 16-15 14 1 15 15-5-7-15-7-11 0-16 7z" fill="#4a2c18"/><path d="M24 92q2-34 26-36 24 2 26 36z" fill="#2f6fd1"/><path d="M44 56l6 10 6-10" fill="#fff"/><circle cx="44" cy="31" r="1.8" fill="#2b1a10"/><circle cx="56" cy="31" r="1.8" fill="#2b1a10"/><path d="M45 38q5 4 10 0" stroke="#a0522d" stroke-width="2" fill="none" stroke-linecap="round"/>' },
    woman: { name: 'Ela', svg: '<path d="M30 46q-4-34 20-35 24 1 20 35z" fill="#3b2314"/><circle cx="50" cy="31" r="14" fill="#e8b48f"/><path d="M36 28q4-14 16-13 12 1 12 13-6-8-14-6-8 2-14 6z" fill="#3b2314"/><path d="M26 92q4-36 24-37 20 1 24 37z" fill="#e0447a"/><circle cx="44" cy="32" r="1.8" fill="#2b1a10"/><circle cx="56" cy="32" r="1.8" fill="#2b1a10"/><path d="M45 38q5 4 10 0" stroke="#c2185b" stroke-width="2" fill="none" stroke-linecap="round"/><circle cx="62" cy="20" r="4" fill="#ffd43b"/>' },
    car: { name: 'Carro', svg: '<path d="M14 64l8-20q3-6 10-6h36q7 0 10 6l8 20z" fill="#e03131"/><rect x="10" y="60" width="80" height="18" rx="7" fill="#c92a2a"/><path d="M28 46h44l5 14H23z" fill="#a5d8ff"/><path d="M50 46v14" stroke="#c92a2a" stroke-width="3"/><circle cx="28" cy="80" r="9" fill="#212529"/><circle cx="72" cy="80" r="9" fill="#212529"/><circle cx="28" cy="80" r="4" fill="#adb5bd"/><circle cx="72" cy="80" r="4" fill="#adb5bd"/><rect x="12" y="64" width="8" height="5" rx="2" fill="#ffe066"/><rect x="80" y="64" width="8" height="5" rx="2" fill="#ffe066"/>' },
    plane: { name: 'Avião', svg: '<path d="M50 10q6 0 6 10v22l32 18v8l-32-8v18l10 8v6l-16-4-16 4v-6l10-8V70l-32 8v-8l32-18V20q0-10 6-10z" fill="#f1f3f5" stroke="#1971c2" stroke-width="3" stroke-linejoin="round"/><path d="M46 24h8" stroke="#1971c2" stroke-width="3" stroke-linecap="round"/>' },
    dog: { name: 'Cão', svg: '<path d="M22 30q-6 22 8 26l6-28z" fill="#8a5a2b"/><path d="M78 30q6 22-8 26l-6-28z" fill="#8a5a2b"/><ellipse cx="50" cy="48" rx="26" ry="26" fill="#d9a066"/><ellipse cx="50" cy="62" rx="15" ry="11" fill="#f3d2a8"/><circle cx="41" cy="44" r="3.4" fill="#2b1a10"/><circle cx="59" cy="44" r="3.4" fill="#2b1a10"/><ellipse cx="50" cy="56" rx="5" ry="3.6" fill="#2b1a10"/><path d="M45 64q5 5 10 0" stroke="#2b1a10" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M50 70q2 8 6 4" fill="#ff6b81"/><path d="M28 80h44l-4 12H32z" fill="#4dabf7"/>' },
    cat: { name: 'Gato', svg: '<path d="M26 40L24 12l20 16zM74 40l2-28-20 16z" fill="#868e96"/><ellipse cx="50" cy="50" rx="27" ry="25" fill="#adb5bd"/><path d="M30 30l2-12 9 8zM70 30l-2-12-9 8z" fill="#ffc9c9"/><ellipse cx="41" cy="47" rx="4" ry="5" fill="#2f9e44"/><ellipse cx="59" cy="47" rx="4" ry="5" fill="#2f9e44"/><path d="M47 56h6l-3 3z" fill="#ff8787"/><path d="M50 59q-4 5-8 2M50 59q4 5 8 2" stroke="#495057" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M22 55l14 2M22 61l14-1M78 55l-14 2M78 61l-14-1" stroke="#495057" stroke-width="1.6"/><path d="M30 80h40l-3 12H33z" fill="#f783ac"/>' },
    rabbit: { name: 'Coelho', svg: '<ellipse cx="38" cy="22" rx="8" ry="20" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/><ellipse cx="62" cy="22" rx="8" ry="20" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/><ellipse cx="38" cy="22" rx="4" ry="13" fill="#ffc9c9"/><ellipse cx="62" cy="22" rx="4" ry="13" fill="#ffc9c9"/><ellipse cx="50" cy="56" rx="24" ry="22" fill="#f8f9fa" stroke="#dee2e6" stroke-width="2"/><circle cx="42" cy="52" r="3.2" fill="#343a40"/><circle cx="58" cy="52" r="3.2" fill="#343a40"/><ellipse cx="50" cy="60" rx="3.6" ry="2.6" fill="#ff8787"/><path d="M46 66h8v7h-8z" fill="#fff" stroke="#dee2e6"/><circle cx="36" cy="62" r="4" fill="#ffc9c9" opacity=".7"/><circle cx="64" cy="62" r="4" fill="#ffc9c9" opacity=".7"/>' },
    bear: { name: 'Ursinho', svg: '<circle cx="28" cy="28" r="11" fill="#a0522d"/><circle cx="72" cy="28" r="11" fill="#a0522d"/><circle cx="28" cy="28" r="5" fill="#e0a370"/><circle cx="72" cy="28" r="5" fill="#e0a370"/><circle cx="50" cy="52" r="28" fill="#b5651d"/><ellipse cx="50" cy="62" rx="13" ry="10" fill="#e0a370"/><circle cx="40" cy="47" r="3.4" fill="#2b1a10"/><circle cx="60" cy="47" r="3.4" fill="#2b1a10"/><ellipse cx="50" cy="58" rx="5" ry="3.6" fill="#2b1a10"/><path d="M45 66q5 4 10 0" stroke="#2b1a10" stroke-width="2" fill="none" stroke-linecap="round"/><path d="M62 78q8-6 12 0-4 8-12 0z" fill="#e64980"/>' },
    heart: { name: 'Coração', svg: '<path d="M50 88S12 64 12 38q0-18 18-20 12 0 20 12 8-12 20-12 18 2 18 20 0 26-38 50z" fill="#e03131"/><path d="M28 30q4-6 10-6" stroke="#fff" stroke-width="4" stroke-linecap="round" opacity=".7"/>' },
    star: { name: 'Estrela', svg: '<path d="M50 8l12 26 28 3-21 19 6 28-25-14-25 14 6-28-21-19 28-3z" fill="#fcc419" stroke="#e67700" stroke-width="3" stroke-linejoin="round"/><circle cx="43" cy="44" r="3" fill="#5c3c00"/><circle cx="57" cy="44" r="3" fill="#5c3c00"/><path d="M44 54q6 5 12 0" stroke="#5c3c00" stroke-width="2.4" fill="none" stroke-linecap="round"/>' },
  };
  const tokenSVG = (id) => `<svg viewBox="0 0 100 100" aria-hidden="true">${(TOKENS[id] || TOKENS.heart).svg}</svg>`;

  /* ------------------------------------------------------------------ */
  /* Tabuleiro                                                           */
  /* ------------------------------------------------------------------ */
  class Board {
    constructor(host, { map, trip = {} }) {
      this.host = host;
      this.map = map;
      this.tokens = {};
      this.pos = { X: 0, O: 0 };
      host.innerHTML = '';
      host.classList.add('gboard');
      const NS = 'http://www.w3.org/2000/svg';
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 1000 1000');
      svg.setAttribute('class', 'gb-svg');
      const path = POS.slice(0, LAST).map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
      let tiles = '';
      for (let n = 0; n < LAST; n++) {
        const p = POS[n];
        const c = map[n];
        const look = squareLook(c);
        tiles += `<g class="tile ${look.cls}" data-n="${n}" transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${p.angle.toFixed(1)})">
          <rect x="-34" y="-34" width="68" height="68" rx="16" class="tile-bg"/>
          <rect x="-34" y="-34" width="68" height="68" rx="16" class="tile-hi"/>
          <g transform="rotate(${(-p.angle).toFixed(1)})">
            ${n === 0 ? `<text class="tile-start" y="6">${esc(trip.origin || 'Porto')}</text>` : `<text class="tile-num" y="${look.icon ? -14 : 10}">${n}</text>`}
            ${look.icon && n !== 0 ? `<text class="tile-ico" y="20">${look.icon}</text>` : ''}
          </g>
        </g>`;
      }
      const deco = `
        <defs>
          <radialGradient id="g-sea" cx=".5" cy=".5" r=".6"><stop offset="0" style="stop-color:var(--sea1)"/><stop offset="1" style="stop-color:var(--sea2)"/></radialGradient>
          <radialGradient id="g-glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".9"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
          <pattern id="p-wave" width="80" height="40" patternUnits="userSpaceOnUse"><path d="M0 20q10-10 20 0t20 0 20 0 20 0" fill="none" style="stroke:var(--wave)" stroke-width="2"/></pattern>
        </defs>
        <rect x="0" y="0" width="1000" height="1000" rx="56" fill="url(#g-sea)"/>
        <rect x="0" y="0" width="1000" height="1000" rx="56" fill="url(#p-wave)" class="waves"/>
        <g class="compass" transform="translate(880 120)"><circle r="54" class="cmp-ring"/><path d="M0-48 9 0 0 48-9 0z" class="cmp-needle"/><path d="M-48 0 0 9 48 0 0-9z" class="cmp-needle2"/><text y="-60" class="cmp-n">N</text></g>
        <g class="isle" transform="translate(92 120)"><ellipse rx="56" ry="22" class="isle-sand"/><path d="M-8-4q-2-30 6-44M-2-48q-20-6-30 8M-2-48q20-8 30 6M-2-48q-8-16-26-14M-2-48q14-14 26-8" class="isle-palm"/></g>
        <g class="cloud" transform="translate(800 900)"><path d="M-50 0q0-22 24-20 6-20 28-14 22-6 28 16 22 0 20 18z" class="cloud-p"/></g>
        <g class="boat" transform="translate(150 880)"><path d="M-36 0h72l-12 16h-48z" class="boat-hull"/><path d="M0-50v48M2-48l30 40H2z" class="boat-sail"/></g>
        <path d="${path}" class="route"/>
        <path d="${path}" class="route-dash"/>`;
      const center = POS[LAST];
      const final = `<g class="final" transform="translate(${center.x} ${center.y})">
          <circle r="104" class="final-glow"/>
          <circle r="86" class="final-ring"/>
          <text class="final-heart" y="-6">❤️</text>
          <text class="final-title" y="34">O Reencontro</text>
          <text class="final-sub" y="58">${esc(trip.destination || 'São Gonçalo · RJ')}</text>
          <text class="final-num" y="-58">63</text>
        </g>`;
      svg.innerHTML = deco + tiles + final;
      this.svg = svg;
      this.layer = document.createElement('div');
      this.layer.className = 'gb-tokens';
      host.append(svg, this.layer);
      this.fx = document.createElement('div');
      this.fx.className = 'gb-fx';
      host.appendChild(this.fx);
      svg.addEventListener('click', (e) => {
        const t = e.target.closest('.tile');
        if (t && this.onTile) this.onTile(Number(t.dataset.n));
      });
    }

    setTokens(tokens) {
      for (const seat of ['X', 'O']) {
        let el = this.tokens[seat];
        if (!el) {
          el = document.createElement('div');
          el.className = `token token-${seat}`;
          el.innerHTML = '<span class="tk-shadow"></span><span class="tk-body"></span>';
          this.layer.appendChild(el);
          this.tokens[seat] = el;
          this.place(seat, this.pos[seat], false);
        }
        if (el.dataset.id !== tokens[seat]) {
          el.dataset.id = tokens[seat];
          el.querySelector('.tk-body').innerHTML = tokenSVG(tokens[seat]);
        }
      }
    }

    coords(seat, n) {
      const p = POS[Math.max(0, Math.min(LAST, n))];
      const same = this.pos.X === this.pos.O;
      const off = same ? (seat === 'X' ? -16 : 16) : 0;
      return { x: (p.x + off) / 10, y: (p.y - (n === LAST ? 34 : 6)) / 10 };
    }

    place(seat, n, animate = true) {
      this.pos[seat] = n;
      for (const s of ['X', 'O']) {
        const el = this.tokens[s];
        if (!el) continue;
        const c = this.coords(s, this.pos[s]);
        el.classList.toggle('no-anim', !animate);
        el.style.left = `${c.x}%`;
        el.style.top = `${c.y}%`;
      }
    }

    highlight(n, cls = 'lit') {
      const t = this.svg.querySelector(`.tile[data-n="${n}"]`);
      if (!t) return;
      t.classList.remove(cls);
      void t.getBoundingClientRect();
      t.classList.add(cls);
      setTimeout(() => t.classList.remove(cls), 900);
    }

    setActive(seat) {
      for (const s of ['X', 'O']) if (this.tokens[s]) this.tokens[s].classList.toggle('active', s === seat);
    }

    /** Salta casa a casa de `from` até `to` (com ressalto se passar do fim). */
    async hop(seat, from, to, { sum = null, onHop } = {}) {
      const path = [];
      if (sum !== null && from + sum > LAST) {
        for (let i = from + 1; i <= LAST; i++) path.push(i);
        for (let i = LAST - 1; i >= to; i--) path.push(i);
      } else if (to >= from) for (let i = from + 1; i <= to; i++) path.push(i);
      else for (let i = from - 1; i >= to; i--) path.push(i);
      const el = this.tokens[seat];
      for (const n of path) {
        el.classList.remove('hopping');
        void el.offsetWidth;
        el.classList.add('hopping');
        this.place(seat, n);
        this.highlight(n);
        if (onHop) onHop(n);
        await wait(240);
      }
      el.classList.remove('hopping');
    }

    async fly(seat, to, cls = 'flying') {
      const el = this.tokens[seat];
      el.classList.add(cls);
      this.place(seat, to);
      await wait(900);
      el.classList.remove(cls);
      this.highlight(to);
    }

    burst(n, emoji = '✨') {
      if (reduced()) return;
      const c = this.coords('X', n);
      for (let i = 0; i < 10; i++) {
        const s = document.createElement('span');
        s.className = 'gb-spark';
        s.textContent = emoji;
        s.style.left = `${c.x}%`;
        s.style.top = `${c.y}%`;
        const a = (Math.PI * 2 * i) / 10;
        s.style.setProperty('--dx', `${Math.cos(a) * (40 + Math.random() * 30)}px`);
        s.style.setProperty('--dy', `${Math.sin(a) * (40 + Math.random() * 30) - 20}px`);
        this.fx.appendChild(s);
        setTimeout(() => s.remove(), 1200);
      }
    }
  }
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  /* ------------------------------------------------------------------ */
  /* Dados 3D                                                            */
  /* ------------------------------------------------------------------ */
  const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
  const FACE_ROT = { 1: [0, 0], 2: [0, -90], 3: [-90, 0], 4: [90, 0], 5: [0, 90], 6: [0, 180] };
  class Dice {
    constructor(host) {
      this.host = host;
      host.classList.add('dice');
      this.cubes = [0, 1].map(() => {
        const wrap = document.createElement('div');
        wrap.className = 'die-wrap';
        const cube = document.createElement('div');
        cube.className = 'die';
        const faces = { 1: 'front', 2: 'right', 3: 'top', 4: 'bottom', 5: 'left', 6: 'back' };
        for (const [v, side] of Object.entries(faces)) {
          const f = document.createElement('div');
          f.className = `face ${side}`;
          for (let i = 1; i <= 9; i++) {
            const pip = document.createElement('i');
            if (PIPS[v].includes(i)) pip.className = 'pip';
            f.appendChild(pip);
          }
          cube.appendChild(f);
        }
        wrap.appendChild(cube);
        host.appendChild(wrap);
        return cube;
      });
      this.show([1, 1], false);
    }
    show(values, animate = true) {
      values.forEach((v, i) => {
        const [x, y] = FACE_ROT[v];
        const cube = this.cubes[i];
        const spin = animate && !reduced() ? 720 + 360 * Math.floor(Math.random() * 2) : 0;
        cube.style.transition = animate && !reduced() ? 'transform 1s cubic-bezier(.2,.7,.2,1)' : 'none';
        cube.style.transform = `rotateX(${x + spin}deg) rotateY(${y + spin}deg)`;
        if (animate) {
          cube.parentElement.classList.remove('thrown');
          void cube.offsetWidth;
          cube.parentElement.classList.add('thrown');
        }
      });
      return wait(animate ? 1000 : 0);
    }
    shake(on) {
      this.host.classList.toggle('shaking', on);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Demonstração na página inicial                                      */
  /* ------------------------------------------------------------------ */
  function demo(host, map, trip) {
    const b = new Board(host, { map, trip });
    b.setTokens({ X: 'man', O: 'woman' });
    let turn = 'X';
    const step = async () => {
      if (document.hidden) return;
      const from = b.pos[turn];
      if (from >= LAST) {
        b.place('X', 0, false);
        b.place('O', 0, false);
        return;
      }
      const sum = 2 + Math.floor(Math.random() * 6);
      const to = from + sum > LAST ? LAST - (from + sum - LAST) : from + sum;
      await b.hop(turn, from, to, { sum });
      if (to === LAST) b.burst(LAST, '❤️');
      turn = turn === 'X' ? 'O' : 'X';
    };
    setInterval(step, 2600);
    return b;
  }

  class Sound {
    constructor() {
      this.ctx = null;
      this.buffers = {};
      this.enabled = true;
      this.volume = 0.7;
      this.names = ['dice', 'hop', 'card', 'chime', 'boing', 'plane', 'notify', 'draw', 'win', 'lose', 'error', 'clap', 'chat', 'join', 'ring', 'click', 'like', 'whoosh', 'send', 'reveal'];
      const unlock = () => {
        this.init();
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      };
      ['pointerdown', 'keydown', 'touchstart'].forEach((e) => window.addEventListener(e, unlock, { passive: true }));
    }
    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
      this.names.forEach((n) =>
        fetch(`sounds/${n}.wav`).then((r) => r.arrayBuffer()).then((b) => this.ctx.decodeAudioData(b)).then((buf) => (this.buffers[n] = buf)).catch(() => {})
      );
    }
    setVolume(v) {
      this.volume = v;
      if (this.master) this.master.gain.value = v;
    }
    play(name, { rate = 1, gain = 1 } = {}) {
      if (!this.enabled || !this.ctx || !this.buffers[name]) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this.buffers[name];
      src.playbackRate.value = rate;
      const g = this.ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(this.master);
      src.start();
    }
  }

  /* ------------------------------------------------------------------ */
  /* Confetes                                                            */
  /* ------------------------------------------------------------------ */
  class Confetti {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.parts = [];
      this.running = false;
    }
    burst(colors) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.c.width = innerWidth * dpr;
      this.c.height = innerHeight * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < 240; i++) {
        const side = i % 2 ? 1 : -1;
        this.parts.push({
          x: side > 0 ? -10 : innerWidth + 10,
          y: innerHeight * (0.45 + Math.random() * 0.3),
          vx: side * (6 + Math.random() * 10),
          vy: -(8 + Math.random() * 12),
          s: 5 + Math.random() * 7,
          r: Math.random() * Math.PI,
          vr: (Math.random() - 0.5) * 0.35,
          c: colors[i % colors.length],
          shape: i % 3,
          born: performance.now(),
        });
      }
      if (!this.running) {
        this.running = true;
        requestAnimationFrame(() => this.frame());
      }
    }
    frame() {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      const now = performance.now();
      const dt = Math.min(4, (now - (this.last || now)) / 16.7 || 1);
      this.last = now;
      this.parts = this.parts.filter((p) => p.y < innerHeight + 40 && now - p.born < 6000);
      for (const p of this.parts) {
        p.vy += 0.3 * dt;
        p.vx *= Math.pow(0.985, dt);
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.r += p.vr * dt;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.r);
        ctx.fillStyle = p.c;
        if (p.shape === 0) ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        else if (p.shape === 1) {
          ctx.beginPath();
          ctx.arc(0, 0, p.s / 2.6, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(0, -p.s / 2);
          ctx.lineTo(p.s / 2, p.s / 2);
          ctx.lineTo(-p.s / 2, p.s / 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (this.parts.length) requestAnimationFrame(() => this.frame());
      else {
        this.running = false;
        ctx.clearRect(0, 0, innerWidth, innerHeight);
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Fundo: partículas ou estrelas                                       */
  /* ------------------------------------------------------------------ */
  class Background {
    constructor(canvas) {
      this.c = canvas;
      this.ctx = canvas.getContext('2d');
      this.mode = 'aurora';
      this.dots = [];
      this.resize();
      window.addEventListener('resize', () => this.resize());
      requestAnimationFrame((t) => this.frame(t));
    }
    resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = innerWidth;
      this.h = innerHeight;
      this.c.width = this.w * dpr;
      this.c.height = this.h * dpr;
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.seed();
    }
    seed() {
      const n = this.mode === 'stars' ? 140 : this.mode === 'particles' ? 46 : 0;
      this.dots = Array.from({ length: n }, () => ({ x: Math.random() * this.w, y: Math.random() * this.h, vx: (Math.random() - 0.5) * 0.3, vy: (Math.random() - 0.5) * 0.3, r: Math.random() * 1.6 + 0.4, p: Math.random() * 6 }));
    }
    setMode(m) {
      this.mode = m;
      this.seed();
    }
    frame(t) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);
      const anim = document.body.dataset.anim !== 'off';
      const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#7c9cff';
      if (this.mode === 'stars') {
        ctx.fillStyle = document.body.dataset.mode === 'light' ? 'rgba(40,50,90,0.5)' : '#fff';
        for (const d of this.dots) {
          ctx.globalAlpha = 0.25 + 0.75 * Math.abs(Math.sin((anim ? t / 900 : 0) + d.p));
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (this.mode === 'particles') {
        ctx.fillStyle = accent;
        ctx.strokeStyle = accent;
        for (const d of this.dots) {
          if (anim) {
            d.x = (d.x + d.vx + this.w) % this.w;
            d.y = (d.y + d.vy + this.h) % this.h;
          }
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.r + 0.8, 0, Math.PI * 2);
          ctx.fill();
        }
        for (let i = 0; i < this.dots.length; i++) {
          for (let j = i + 1; j < this.dots.length; j++) {
            const a = this.dots[i];
            const b = this.dots[j];
            const dist = Math.hypot(a.x - b.x, a.y - b.y);
            if (dist < 140) {
              ctx.globalAlpha = (1 - dist / 140) * 0.25;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
      }
      ctx.globalAlpha = 1;
      requestAnimationFrame((tt) => this.frame(tt));
    }
  }


  window.Gloria = { LAST, POS, DECK, TOKENS, tokenSVG, squareLook, squareName, Board, Dice, demo, Sound, Confetti, Background, wait };
})();
