/*
 * storage.js — remembers your party, your rules, and an unfinished walk.
 */

const KEY = 'randonnee.v2';

function read() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch (_) {
    return {};
  }
}

function write(obj) {
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch (_) {
    /* private mode, quota — not worth interrupting a game over */
  }
}

export function loadPrefs() {
  const d = read();
  return d.prefs || null;
}

export function savePrefs(prefs) {
  write({ ...read(), prefs });
}

export function loadGame() {
  const d = read();
  return d.game || null;
}

export function saveGame(game) {
  write({ ...read(), game });
}

export function clearGame() {
  const d = read();
  delete d.game;
  write(d);
}
