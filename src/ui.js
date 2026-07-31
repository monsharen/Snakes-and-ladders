/*
 * ui.js — everything the thumb touches.
 */

import { buildTrail, BANDS } from './trail.js';
import { renderBoard, TokenLayer, Camera, wait, fmtAlt } from './render.js';
import { Die } from './dice.js';
import { createGame, playTurn, current, serialize, DEFAULT_RULES, MAX_GRIT } from './game.js';
import * as audio from './audio.js';
import { loadPrefs, savePrefs, loadGame, saveGame, clearGame } from './storage.js';

const $ = (id) => document.getElementById(id);

// Proper names throughout: the journal narrates in the third person, and
// "You rolls a 4" is not a sentence. Rename them in setup.
const DEFAULT_NAMES = ['Ines', 'Camille', 'Rune', 'Sabine'];

const JOURNAL_COLOURS = {
  climb: 'var(--ascent)',
  fall: 'var(--descent)',
  refuge: 'var(--grit)',
  grit: 'var(--grit)',
  view: '#9FB0BE',
  summit: 'var(--snow)',
  bounce: 'var(--descent)',
};

export class App {
  constructor() {
    this.trail = buildTrail();
    this.die = new Die($('die'));
    this.openSheets = new Set();
    this.prefs = normalizePrefs(loadPrefs());
    audio.setEnabled(this.prefs.sound !== false);

    this.wireChrome();
    this.wireSetup();
    this.wireMenu();

    const saved = loadGame();
    if (saved && saved.v === 2 && saved.winner === null) this.restore(saved);
    else this.openSetup();
  }

  /* ============================ chrome ============================ */

  wireChrome() {
    $('menuBtn').addEventListener('click', () => {
      this.syncMenu();
      this.openSheet('menuSheet');
    });
    $('journalBtn').addEventListener('click', () => this.openSheet('journalSheet'));
    $('ticker').addEventListener('click', () => this.openSheet('journalSheet'));
    $('scrim').addEventListener('click', () => this.closeTop());
    $('recentreBtn').addEventListener('click', () => {
      if (this.state) this.camera.centerOn(current(this.state).pos);
    });

    document.querySelectorAll('[data-close]').forEach((b) =>
      b.addEventListener('click', () => this.closeSheet(b.dataset.close))
    );

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeTop();
      if (e.key === ' ' && this.openSheets.size === 0) {
        e.preventDefault();
        if (!$('rollBtn').disabled) $('rollBtn').click();
      }
    });

    $('rollBtn').addEventListener('click', () => this.humanRoll());

    document.querySelectorAll('.grit-btn').forEach((b) =>
      b.addEventListener('click', () => this.resolveGrit(b.dataset.grit))
    );

    // first gesture anywhere unlocks WebAudio on iOS
    const unlock = () => {
      audio.unlock();
      window.removeEventListener('pointerdown', unlock);
    };
    window.addEventListener('pointerdown', unlock);

    window.addEventListener('resize', () => {
      if (this.state) this.drawAltimeter();
    });
  }

  openSheet(id) {
    $('scrim').hidden = false;
    $(id).hidden = false;
    this.openSheets.add(id);
  }

  closeSheet(id) {
    $(id).hidden = true;
    this.openSheets.delete(id);
    if (this.openSheets.size === 0) $('scrim').hidden = true;
  }

  closeTop() {
    const last = [...this.openSheets].pop();
    if (!last || last === 'setupSheet') return;
    this.closeSheet(last);
  }

  /* ============================ setup ============================ */

  wireSetup() {
    $('countSeg').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      this.prefs.count = Number(b.dataset.count);
      this.drawSetup();
    });

    $('hikers').addEventListener('click', (e) => {
      const b = e.target.closest('.who button');
      if (!b) return;
      const i = Number(b.closest('.hiker-row').dataset.i);
      this.prefs.hikers[i].cpu = b.dataset.who === 'cpu';
      this.drawSetup();
    });

    $('hikers').addEventListener('input', (e) => {
      if (e.target.matches('input[type="text"]')) {
        const i = Number(e.target.closest('.hiker-row').dataset.i);
        this.prefs.hikers[i].name = e.target.value;
      }
    });

    $('startBtn').addEventListener('click', () => {
      this.prefs.hikers.forEach((h, i) => {
        if (!h.name.trim()) h.name = DEFAULT_NAMES[i];
      });
      savePrefs(this.prefs);
      this.closeSheet('setupSheet');
      this.newGame();
    });
  }

  openSetup() {
    this.drawSetup();
    this.setupOpen = true;
    // Draw a live board behind the sheet so the first thing you see is the mountain.
    this.start(createGame({
      trail: this.trail,
      players: this.prefs.hikers.slice(0, this.prefs.count).map((h) => ({ name: h.name, cpu: !!h.cpu })),
      rules: this.prefs.rules,
    }), { preview: true });
    this.openSheet('setupSheet');
  }

  drawSetup() {
    [...$('countSeg').children].forEach((b) =>
      b.classList.toggle('on', Number(b.dataset.count) === this.prefs.count)
    );
    $('hikers').innerHTML = this.prefs.hikers
      .slice(0, this.prefs.count)
      .map(
        (h, i) => `
      <div class="hiker-row" data-i="${i}" style="--pc: var(--p${i + 1})">
        <input type="text" value="${escapeAttr(h.name)}" maxlength="14" aria-label="Hiker ${i + 1} name"
               autocomplete="off" autocapitalize="words" spellcheck="false">
        <div class="who">
          <button type="button" data-who="human" class="${h.cpu ? '' : 'on'}">You</button>
          <button type="button" data-who="cpu" class="${h.cpu ? 'on' : ''}">Auto</button>
        </div>
      </div>`
      )
      .join('');
  }

  /* ============================ menu ============================ */

  wireMenu() {
    const bind = (id, key) =>
      $(id).addEventListener('change', (e) => {
        this.prefs.rules[key] = e.target.checked;
        savePrefs(this.prefs);
      });
    bind('optGrit', 'grit');
    bind('optExact', 'exactFinish');
    bind('optSixes', 'sixesRepeat');

    $('optSound').addEventListener('change', (e) => {
      this.prefs.sound = e.target.checked;
      audio.setEnabled(e.target.checked);
      savePrefs(this.prefs);
      if (e.target.checked) audio.sfx.refuge();
    });

    $('newWalkBtn').addEventListener('click', () => {
      this.closeSheet('menuSheet');
      clearGame();
      this.openSetup();
    });

    $('howBtn').addEventListener('click', () => {
      this.closeSheet('menuSheet');
      this.pushLog({
        type: 'note',
        title: 'How it works',
        text:
          'Roll the die and walk that many waypoints up the trail. Land on an ascent and the mountain gives you something — a via ferrata, the last cable car. Land on a descent and it takes something back. Reach waypoint 61 to top out. Refuges hand you grit; grit buys you one step either way, or a second roll.',
      });
      this.openSheet('journalSheet');
    });

    $('winCloseBtn').addEventListener('click', () => this.closeSheet('winSheet'));
    $('winAgainBtn').addEventListener('click', () => {
      this.closeSheet('winSheet');
      clearGame();
      this.openSetup();
    });
  }

  syncMenu() {
    $('optGrit').checked = this.prefs.rules.grit !== false;
    $('optExact').checked = this.prefs.rules.exactFinish !== false;
    $('optSixes').checked = this.prefs.rules.sixesRepeat !== false;
    $('optSound').checked = this.prefs.sound !== false;
  }

  /* ============================ game lifecycle ============================ */

  newGame() {
    const players = this.prefs.hikers.slice(0, this.prefs.count).map((h) => ({ name: h.name, cpu: !!h.cpu }));
    this.start(createGame({ trail: this.trail, players, rules: this.prefs.rules }));
    this.pushLog({
      type: 'note',
      title: 'The trailhead',
      text: `${listNames(players.map((p) => p.name))} set off from ${fmtAlt(this.trail.baseAltitude)} m. It is ${fmtAlt(this.trail.summitAltitude - this.trail.baseAltitude)} metres of ascent to the top, and the forecast turns at four.`,
    });
  }

  restore(saved) {
    const state = createGame({
      trail: this.trail,
      players: saved.players.map((p) => ({ name: p.name, cpu: p.cpu })),
      rules: saved.rules,
    });
    saved.players.forEach((p, i) => Object.assign(state.players[i], p));
    state.turn = saved.turn;
    state.round = saved.round;
    state.sixStreak = saved.sixStreak || 0;
    state.log = saved.log || [];
    this.start(state, { restored: true });
  }

  start(state, { restored = false, preview = false } = {}) {
    this.state = state;
    this.preview = preview;
    const board = renderBoard($('boardHolder'), this.trail, state.players);
    this.board = board;
    this.tokens = new TokenLayer(board, this.trail, state.players);
    this.camera = new Camera($('boardScroll'), board, this.trail);

    // The altimeter is pure percentages, so it must be rebuilt before any
    // sync reads it — otherwise a change of party size leaves stale marks.
    this.drawAltimeter();

    // let layout settle before measuring
    requestAnimationFrame(() => {
      this.tokens.layout({ instant: true });
      if (preview) this.camera.centerOn(9, { smooth: false, bias: 0.18 });
      else this.camera.centerOn(current(state).pos, { smooth: false });
    });

    this.drawParty();
    this.drawJournal();
    this.syncDock();
    if (restored && state.log.length) this.setTicker(state.log[state.log.length - 1]);
    if (!preview) setTimeout(() => this.maybeCpu(), 700);
  }

  /* ============================ drawing ============================ */

  drawParty() {
    const s = this.state;
    $('party').dataset.n = String(s.players.length);
    $('party').innerHTML = s.players
      .map(
        (p, i) => `
      <div class="hiker-chip" data-i="${i}" style="--pc: var(--p${i + 1})">
        <div class="chip-name">${escapeHtml(p.name)}${p.cpu ? '<span class="cpu">AUTO</span>' : ''}</div>
        <div class="chip-alt">${fmtAlt(this.trail.nodes[p.pos].altitude)}<small>M</small></div>
        <div class="chip-grit">${Array.from({ length: MAX_GRIT }, (_, g) => `<i class="${g < p.grit ? 'on' : ''}"></i>`).join('')}</div>
      </div>`
      )
      .join('');
  }

  updateParty() {
    const s = this.state;
    [...$('party').children].forEach((chip, i) => {
      const p = s.players[i];
      chip.classList.toggle('is-active', i === s.turn && s.winner === null);
      chip.classList.toggle('has-won', s.winner === i);
      chip.querySelector('.chip-alt').innerHTML = `${fmtAlt(this.trail.nodes[p.pos].altitude)}<small>M</small>`;
      [...chip.querySelectorAll('.chip-grit i')].forEach((d, g) => d.classList.toggle('on', g < p.grit));
    });
  }

  drawAltimeter() {
    const rail = $('altimeter');
    const s = this.state;
    const pct = (n) => (1 - n / this.trail.summit) * 100;
    rail.innerHTML =
      '<div class="alti-rail"></div>' +
      BANDS.map((b) => {
        const first = b.key === 'sommet' ? this.trail.summit : b.rows[0] * 4 + 1;
        return `<div class="alti-tick" style="top:${pct(first).toFixed(2)}%"></div>`;
      }).join('') +
      s.players
        .map(
          (p, i) =>
            `<div class="alti-mark" data-i="${i}" style="--mc: var(--p${i + 1}); top:${pct(p.pos).toFixed(2)}%"></div>`
        )
        .join('');
  }

  updateAltimeter() {
    const s = this.state;
    const marks = $('altimeter').querySelectorAll('.alti-mark');
    if (marks.length !== s.players.length) return this.drawAltimeter();
    marks.forEach((el, i) => {
      el.style.top = `${((1 - s.players[i].pos / this.trail.summit) * 100).toFixed(2)}%`;
      el.classList.toggle('is-active', i === s.turn);
    });
  }

  syncDock() {
    const s = this.state;
    const p = current(s);
    const btn = $('rollBtn');
    const action = $('action');

    action.style.setProperty('--pc', `var(--p${s.turn + 1})`);
    btn.classList.toggle('is-turn', true);
    btn.style.setProperty('--pc', `var(--p${s.turn + 1})`);

    if (s.winner !== null) {
      $('rollName').textContent = `${s.players[s.winner].name} topped out`;
      $('rollSub').textContent = 'walk again from the menu';
      btn.disabled = true;
    } else if (s.busy) {
      $('rollName').textContent = `${p.name} is walking`;
      $('rollSub').textContent = `waypoint ${p.pos} · ${fmtAlt(this.trail.nodes[p.pos].altitude)} m`;
      btn.disabled = true;
    } else if (p.cpu) {
      $('rollName').textContent = `${p.name}’s turn`;
      $('rollSub').textContent = 'auto';
      btn.disabled = true;
    } else {
      $('rollName').textContent = `${p.name} — roll`;
      $('rollSub').textContent = `waypoint ${p.pos} · ${fmtAlt(this.trail.nodes[p.pos].altitude)} m`;
      btn.disabled = false;
    }

    const leader = [...s.players].sort((a, b) => b.pos - a.pos)[0];
    const band = BANDS.find((b) => b.key === this.trail.nodes[leader.pos].band);
    $('brandSub').textContent = `Round ${s.round} · ${band ? band.name : 'La Vallée'}`;

    this.updateParty();
    this.updateAltimeter();
  }

  /* ============================ journal ============================ */

  pushLog(entry) {
    const s = this.state;
    const item = { ...entry, round: s ? s.round : 1 };
    if (s) s.log.push(item);
    this.appendJournal(item);
    this.setTicker(item);
    $('journalSub').textContent = s ? `Round ${s.round}` : 'Round 1';
  }

  drawJournal() {
    $('journal').innerHTML = '';
    (this.state.log || []).forEach((e) => this.appendJournal(e));
  }

  appendJournal(e) {
    const li = document.createElement('li');
    const colour = JOURNAL_COLOURS[e.type];
    if (colour) li.style.setProperty('--jc', colour);
    else if (e.player != null) li.style.setProperty('--jc', `var(--p${e.player + 1})`);
    li.innerHTML = `
      <div>
        ${e.title ? `<div class="j-title">${escapeHtml(e.title)}</div>` : ''}
        <div class="j-text">${escapeHtml(e.text)}</div>
        <div class="j-meta">Round ${e.round || 1}${e.player != null && this.state ? ` · ${escapeHtml(this.state.players[e.player].name)}` : ''}</div>
      </div>`;
    // column-reverse list: newest first means prepending to the DOM start
    $('journal').prepend(li);
  }

  setTicker(e) {
    const t = $('ticker');
    $('tickerText').textContent = e ? (e.title ? `${e.title} — ${e.text}` : e.text) : '';
    t.classList.remove('flash');
    void t.offsetWidth;
    t.classList.add('flash');
  }

  /* ============================ turns ============================ */

  get io() {
    if (!this._io) this._io = this.buildIo();
    return this._io;
  }

  buildIo() {
    const self = this;
    return {
      async roll(player) {
        if (player.cpu) await wait(520);
        audio.haptic(12);
        const v = await self.die.roll({ onTick: () => audio.sfx.rollTick() });
        audio.sfx.rollLand();
        audio.haptic([0, 22]);
        return v;
      },

      async showValue(v) {
        self.die.show(v);
        audio.sfx.grit();
        await wait(320);
      },

      askGrit(player, value) {
        return self.askGrit(player, value);
      },

      async walk(player, waypoints) {
        self.syncDock();
        await self.tokens.walk(player.index, waypoints, {
          onStep: (n) => {
            audio.sfx.step();
            self.follow(n);
            self.updateAltimeter();
          },
        });
        self.tokens.pulseNode(player.pos);
        self.updateParty();
      },

      async link(player, link) {
        self.tokens.highlightLink(link.id, true);
        audio.haptic(link.dir === 'up' ? [0, 18, 60, 18] : [0, 70]);
        link.dir === 'up' ? audio.sfx.climb() : audio.sfx.fall();
        self.camera.centerOn(link.to);
        await self.tokens.glide(player.index, link.id, link.dir === 'up' ? 950 : 800);
        self.tokens.highlightLink(link.id, false);
        self.tokens.pulseNode(link.to);
        self.updateAltimeter();
        self.updateParty();
        await wait(240);
      },

      pause: (ms) => wait(ms),

      log(entry) {
        if (entry.type === 'refuge') audio.sfx.refuge();
        if (entry.type === 'view') audio.sfx.view();
        self.pushLog(entry);
      },

      sync() {
        self.syncDock();
        if (self.state.winner === null) saveGame(serialize(self.state));
        else clearGame();
        if (self.state.winner === null) setTimeout(() => self.maybeCpu(), 480);
      },

      async win(player) {
        audio.sfx.win();
        audio.haptic([0, 40, 80, 40, 80, 120]);
        self.camera.centerOn(self.trail.summit);
        await wait(900);
        self.showWin(player);
      },
    };
  }

  follow(n) {
    const y = this.camera.yToPixels(this.trail.nodes[n].y);
    const el = $('boardScroll');
    const top = el.scrollTop;
    const h = el.clientHeight;
    if (y < top + h * 0.3 || y > top + h * 0.7) this.camera.centerOn(n);
  }

  humanRoll() {
    const s = this.state;
    if (!s || this.preview || s.busy || s.winner !== null || current(s).cpu) return;
    playTurn(s, this.io);
    this.syncDock();
  }

  maybeCpu() {
    const s = this.state;
    if (!s || this.preview || s.busy || s.winner !== null) return;
    if (!current(s).cpu) return;
    playTurn(s, this.io);
    this.syncDock();
  }

  /* ---------- the grit window ---------- */

  askGrit(player, value) {
    return new Promise((resolve) => {
      const bar = $('gritBar');
      $('action').hidden = true;
      bar.hidden = false;
      $('gritPrompt').innerHTML = `${escapeHtml(player.name)} rolled <b>${value}</b>. Spend a grit, or keep it?`;
      $('gritMinusLbl').textContent = `walk ${value - 1}`;
      $('gritPlusLbl').textContent = `walk ${value + 1}`;
      bar.querySelector('[data-grit="minus"]').disabled = value <= 1;
      bar.querySelector('[data-grit="plus"]').disabled = value >= 6;
      this._gritResolve = (action) => {
        bar.hidden = true;
        $('action').hidden = false;
        this._gritResolve = null;
        resolve({ action });
      };
    });
  }

  resolveGrit(action) {
    if (this._gritResolve) {
      audio.haptic(10);
      this._gritResolve(action);
    }
  }

  /* ============================ the summit ============================ */

  showWin(player) {
    const s = this.state;
    const others = s.players.filter((p) => p.index !== player.index);
    const runnerUp = [...others].sort((a, b) => b.pos - a.pos)[0];
    const gap = runnerUp ? this.trail.nodes[player.pos].altitude - this.trail.nodes[runnerUp.pos].altitude : 0;

    $('winTitle').textContent = `${player.name} tops out`;
    $('winBlurb').textContent = blurbFor(player, gap, runnerUp);
    $('winStats').innerHTML = `
      <div><dd>${s.round}</dd><dt>Rounds</dt></div>
      <div><dd>${player.climbs}</dd><dt>Ascents</dt></div>
      <div><dd>${player.falls}</dd><dt>Setbacks</dt></div>`;
    this.openSheet('winSheet');
  }
}

/* ============================ helpers ============================ */

// Stored preferences come from an older version of the game, a half-finished
// edit, or a browser someone has been poking at. Always end up with exactly
// four well-formed hikers and a party size that can be drawn.
function normalizePrefs(saved) {
  const p = saved && typeof saved === 'object' ? saved : {};
  const hikers = DEFAULT_NAMES.map((name, i) => {
    const h = Array.isArray(p.hikers) ? p.hikers[i] : null;
    return {
      name: h && typeof h.name === 'string' && h.name.trim() ? h.name.slice(0, 14) : name,
      cpu: h ? !!h.cpu : i > 0,
    };
  });
  const count = Math.min(4, Math.max(2, Number(p.count) || 2));
  return {
    count,
    hikers,
    rules: { ...DEFAULT_RULES, ...(p.rules || {}) },
    sound: p.sound !== false,
  };
}

function blurbFor(p, gap, runnerUp) {
  if (p.falls === 0 && p.climbs > 0) return 'A clean line. No rockfall, no wrong turns, nothing to write up afterwards except the light.';
  if (p.falls >= 3) return 'Three times the mountain sent them back down, and three times they went again. The summit does not record the arguments.';
  if (runnerUp && gap < 200) return `${runnerUp.name} is barely below, still moving. Close enough to shout down to.`;
  return 'Wind on the cairn, cloud coming up the north side, and nobody else within an hour of here.';
}

function listNames(names) {
  if (names.length <= 1) return names[0] || 'Nobody';
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeAttr = escapeHtml;
