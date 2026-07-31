/*
 * simulate.mjs — play the game a few thousand times with no browser attached,
 * to check the trail is balanced and that no rule combination can stall.
 *
 *   node tools/simulate.mjs [games]
 *
 * game.js and trail.js are deliberately free of DOM dependencies, which is
 * what makes this possible: the animation is injected, so here we inject
 * nothing and the whole game runs instantly.
 */

import { buildTrail } from '../src/trail.js';
import { createGame, playTurn, DEFAULT_RULES } from '../src/game.js';

const GAMES = Number(process.argv[2] || 2000);
const trail = buildTrail();

// An io that does nothing, instantly.
const io = {
  roll: async () => 1 + Math.floor(Math.random() * 6),
  showValue: async () => {},
  askGrit: async () => ({ action: 'keep' }),
  walk: async () => {},
  link: async () => {},
  pause: async () => {},
  log: () => {},
  sync: () => {},
  win: async () => {},
};

async function play(rules, playerCount) {
  const state = createGame({
    trail,
    players: Array.from({ length: playerCount }, (_, i) => ({ name: `P${i}`, cpu: true })),
    rules,
  });
  let turns = 0;
  while (state.winner === null) {
    if (++turns > 5000) return { stalled: true, turns, rounds: state.round };
    await playTurn(state, io);
  }
  return {
    stalled: false,
    turns,
    rounds: state.round,
    winner: state.winner,
    climbs: state.players[state.winner].climbs,
    falls: state.players[state.winner].falls,
  };
}

function summarise(label, runs) {
  const rounds = runs.map((r) => r.rounds).sort((a, b) => a - b);
  const pick = (q) => rounds[Math.floor(rounds.length * q)];
  const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const wins = {};
  runs.forEach((r) => (wins[r.winner] = (wins[r.winner] || 0) + 1));
  const share = Object.keys(wins)
    .sort()
    .map((k) => `P${k} ${((wins[k] / runs.length) * 100).toFixed(1)}%`)
    .join('  ');
  console.log(
    `${label.padEnd(34)} rounds p10 ${String(pick(0.1)).padStart(3)} · median ${String(pick(0.5)).padStart(3)} · p90 ${String(
      pick(0.9)
    ).padStart(3)} · max ${String(rounds[rounds.length - 1]).padStart(4)}   ascents ${mean(
      runs.map((r) => r.climbs)
    ).toFixed(2)}  setbacks ${mean(runs.map((r) => r.falls)).toFixed(2)}   ${share}`
  );
}

const configs = [
  ['default, 2 hikers', { ...DEFAULT_RULES }, 2],
  ['default, 4 hikers', { ...DEFAULT_RULES }, 4],
  ['no grit, 2 hikers', { ...DEFAULT_RULES, grit: false }, 2],
  ['no exact finish, 2 hikers', { ...DEFAULT_RULES, exactFinish: false }, 2],
  ['no sixes-again, 2 hikers', { ...DEFAULT_RULES, sixesRepeat: false }, 2],
  ['everything off, 2 hikers', { exactFinish: false, sixesRepeat: false, grit: false }, 2],
];

let stalls = 0;
for (const [label, rules, count] of configs) {
  const runs = [];
  for (let i = 0; i < GAMES; i++) {
    const r = await play(rules, count);
    if (r.stalled) stalls++;
    else runs.push(r);
  }
  summarise(label, runs);
}

console.log(`\n${GAMES} games per configuration. Stalled games: ${stalls}`);
process.exit(stalls ? 1 : 0);
