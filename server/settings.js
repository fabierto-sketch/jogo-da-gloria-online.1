'use strict';

/**
 * Definições gerais do jogo, controladas pelo administrador e guardadas na base de dados.
 */

const fs = require('fs');
const path = require('path');
const { cleanText } = require('./security');

const FUN = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'fun.json'), 'utf8'));
const MODE_IDS = ['classic', 'bo3', 'bo5', 'championship', 'surprise', 'casual'];
const CARDS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'cartas.json'), 'utf8'));

const DEFAULTS = {
  defaultMode: 'bo3',
  reactionsEnabled: true,
  tauntsEnabled: true,
  chatEnabled: true,
  autoNextSeconds: 6,
  welcomeMessage: '',
  playersCanClearHistory: true,
  origin: 'Porto',
  destination: 'São Gonçalo · RJ',
  reunionDate: '',
  customKnowme: [],
  customTalk: [],
  customChallenges: [],
  surpriseChallenges: FUN.challenges,
};

class Settings {
  constructor(db) {
    this.db = db;
    this.values = { ...DEFAULTS };
  }

  async load() {
    const rows = await this.db.query('SELECT key, value FROM settings');
    for (const r of rows) {
      if (r.key in DEFAULTS) {
        try {
          this.values[r.key] = JSON.parse(r.value);
        } catch {
          /* ignora valor corrompido */
        }
      }
    }
    return this;
  }

  get(key) {
    return this.values[key];
  }

  all() {
    return { ...this.values };
  }

  /** Valida e guarda. Devolve { ok, errors, values }. */
  async update(input) {
    const errors = [];
    const next = {};
    if (input.defaultMode !== undefined) {
      if (MODE_IDS.includes(input.defaultMode)) next.defaultMode = input.defaultMode;
      else errors.push('Modo por omissão inválido.');
    }
    for (const k of ['origin', 'destination']) {
      if (input[k] !== undefined) {
        const v = cleanText(input[k], 40);
        if (v) next[k] = v;
        else errors.push('Indique os nomes dos lugares de partida e de chegada.');
      }
    }
    if (input.reunionDate !== undefined) {
      const v = String(input.reunionDate || '').trim();
      if (!v || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)))) next.reunionDate = v;
      else errors.push('Data do reencontro inválida (use AAAA-MM-DD).');
    }
    for (const k of ['customKnowme', 'customTalk', 'customChallenges']) {
      if (input[k] !== undefined) {
        const list = (Array.isArray(input[k]) ? input[k] : String(input[k]).split('\n')).map((t) => cleanText(t, 200)).filter((t) => t.length >= 5);
        if (list.length <= 300) next[k] = [...new Set(list)];
        else errors.push('Máximo de 300 cartas por baralho.');
      }
    }
    for (const k of ['reactionsEnabled', 'tauntsEnabled', 'chatEnabled', 'playersCanClearHistory']) {
      if (input[k] !== undefined) next[k] = !!input[k];
    }
    if (input.autoNextSeconds !== undefined) {
      const n = Number(input.autoNextSeconds);
      if (Number.isInteger(n) && n >= 0 && n <= 60) next.autoNextSeconds = n;
      else errors.push('O avanço automático tem de estar entre 0 e 60 segundos.');
    }
    if (input.welcomeMessage !== undefined) next.welcomeMessage = cleanText(input.welcomeMessage, 200);
    if (input.surpriseChallenges !== undefined) {
      const list = (Array.isArray(input.surpriseChallenges) ? input.surpriseChallenges : String(input.surpriseChallenges).split('\n'))
        .map((t) => cleanText(t, 160))
        .filter((t) => t.length >= 5);
      if (list.length >= 3 && list.length <= 300) next.surpriseChallenges = [...new Set(list)];
      else errors.push('Indique entre 3 e 300 desafios (um por linha).');
    }
    if (errors.length) return { ok: false, errors };
    const now = Date.now();
    for (const [k, v] of Object.entries(next)) {
      await this.db.run(
        'INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, $3) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at',
        [k, JSON.stringify(v), now]
      );
      this.values[k] = v;
    }
    return { ok: true, values: this.all() };
  }

  /** Repõe os desafios originais. */
  async resetChallenges() {
    return this.update({ surpriseChallenges: FUN.challenges });
  }
}

/** Baralhos em jogo: os de origem mais os escritos pelo administrador. */
function decks(settings) {
  return {
    knowme: [...CARDS.knowme, ...settings.get('customKnowme')],
    talk: [...CARDS.talk, ...settings.get('customTalk')],
    challenge: [...CARDS.challenges, ...settings.get('customChallenges')],
    quiz: CARDS.quiz,
    fortune: CARDS.fortune,
  };
}

module.exports = { Settings, DEFAULTS, MODE_IDS, FUN, CARDS, decks };
