/*
 * game.js — rules and the turn loop.
 *
 * The classic principles are intact: roll, advance, get carried up or down,
 * first to the end wins. Two grown-up additions, both optional:
 *
 *   Grit    a small resource you earn at refuges and spend to nudge a roll
 *           by one or to roll again. Turns a pure race into a game with
 *           two or three real decisions in it.
 *   Exact   you must land exactly on the summit; overshooting walks you
 *           back down the far side.
 *
 * Animation is injected (the `io` object) so this file stays pure rules.
 */

export const DEFAULT_RULES = {
  exactFinish: true,
  sixesRepeat: true,
  grit: true,
};

export const MAX_GRIT = 3;

export function createGame({ trail, players, rules }) {
  return {
    trail,
    rules: { ...DEFAULT_RULES, ...rules },
    players: players.map((p, i) => ({
      ...p,
      index: i,
      pos: 0,
      grit: rules && rules.grit === false ? 0 : 1,
      rolls: 0,
      climbs: 0,
      falls: 0,
      best: 0,
    })),
    turn: 0,
    round: 1,
    sixStreak: 0,
    winner: null,
    log: [],
    busy: false,
  };
}

export const current = (s) => s.players[s.turn];

function bounceTarget(state, from, value) {
  const last = state.trail.summit;
  const raw = from + value;
  const walk = [];
  if (raw <= last) {
    for (let i = from + 1; i <= raw; i++) walk.push(i);
    return { target: raw, walk, bounced: false };
  }
  for (let i = from + 1; i <= last; i++) walk.push(i);
  if (!state.rules.exactFinish) return { target: last, walk, bounced: false };
  const over = raw - last;
  const target = last - over;
  for (let i = last - 1; i >= target; i--) walk.push(i);
  return { target, walk, bounced: true };
}

/* ---------- what a roll is worth, for the CPU ---------- */

function outcomeIndex(state, from, value) {
  const { target } = bounceTarget(state, from, value);
  if (target === state.trail.summit) return 1000;
  const link = state.trail.linkFrom(target);
  return link ? link.to : target;
}

function chooseGrit(state, player, value) {
  if (!state.rules.grit || player.grit <= 0) return { action: 'keep' };
  const base = outcomeIndex(state, player.pos, value);
  const options = [];
  if (value > 1) options.push({ action: 'minus', value: value - 1, score: outcomeIndex(state, player.pos, value - 1) });
  if (value < 6) options.push({ action: 'plus', value: value + 1, score: outcomeIndex(state, player.pos, value + 1) });
  const expected =
    [1, 2, 3, 4, 5, 6].reduce((acc, v) => acc + outcomeIndex(state, player.pos, v), 0) / 6;
  options.push({ action: 'reroll', value: null, score: expected });

  options.sort((a, b) => b.score - a.score);
  const best = options[0];
  // Spend only when it clearly pays: a whole terrain band, or the summit.
  const worthIt = best.score >= 1000 ? base < 1000 : best.score - base >= 7;
  return worthIt ? best : { action: 'keep' };
}

/* ---------- the turn ---------- */

export async function playTurn(state, io) {
  if (state.winner !== null || state.busy) return;
  state.busy = true;
  const p = current(state);

  try {
    let value = await io.roll(p);
    p.rolls++;

    if (state.rules.grit && p.grit > 0) {
      const decision = p.cpu ? chooseGrit(state, p, value) : await io.askGrit(p, value);
      if (decision && decision.action !== 'keep') {
        p.grit--;
        if (decision.action === 'reroll') {
          io.log({ type: 'grit', player: p.index, text: `${p.name} isn’t having that. Rolls again.` });
          value = await io.roll(p, { reroll: true });
          p.rolls++;
        } else {
          const delta = decision.action === 'plus' ? 1 : -1;
          value = Math.max(1, Math.min(6, value + delta));
          io.log({
            type: 'grit',
            player: p.index,
            text: `${p.name} digs in and finds ${delta > 0 ? 'one more step' : 'the sense to stop short'} — ${value}.`,
          });
          await io.showValue(value);
        }
      }
    }

    const from = p.pos;
    const { target, walk, bounced } = bounceTarget(state, from, value);

    io.log({
      type: 'roll',
      player: p.index,
      text: `${p.name} rolls ${value} and walks to ${target}.`,
      value,
    });

    await io.walk(p, walk);
    p.pos = target;
    p.best = Math.max(p.best, target);

    if (bounced) {
      io.log({
        type: 'bounce',
        player: p.index,
        text: `Over the top and onto the far side — ${p.name} has to come back up to ${target}.`,
      });
    }

    if (target === state.trail.summit) {
      state.winner = p.index;
      io.log({ type: 'summit', player: p.index, text: `${p.name} stands on the summit. ${fmt(state.trail.summitAltitude)} m.` });
      await io.win(p);
      return;
    }

    // Landing on something.
    const link = state.trail.linkFrom(target);
    if (link) {
      await io.pause(280);
      io.log({
        type: link.dir === 'up' ? 'climb' : 'fall',
        player: p.index,
        title: link.name,
        text: link.blurb,
      });
      await io.link(p, link);
      p.pos = link.to;
      p.best = Math.max(p.best, link.to);
      if (link.dir === 'up') p.climbs++;
      else p.falls++;

      if (p.pos === state.trail.summit) {
        state.winner = p.index;
        io.log({ type: 'summit', player: p.index, text: `${p.name} tops out. ${fmt(state.trail.summitAltitude)} m.` });
        await io.win(p);
        return;
      }
    } else if (state.trail.refuges[target]) {
      if (state.rules.grit && p.grit < MAX_GRIT) {
        p.grit++;
        io.log({
          type: 'refuge',
          player: p.index,
          title: state.trail.refuges[target],
          text: `${p.name} stops for soup and twenty minutes off their feet. +1 grit.`,
        });
      } else {
        io.log({
          type: 'refuge',
          player: p.index,
          title: state.trail.refuges[target],
          text: `${p.name} passes the hut. The shutters are open and someone is playing cards.`,
        });
      }
      await io.pause(220);
    } else if (state.trail.viewpoints[target]) {
      io.log({ type: 'view', player: p.index, title: 'Viewpoint', text: state.trail.viewpoints[target] });
      await io.pause(220);
    }

    // Sixes.
    if (state.rules.sixesRepeat && value === 6) {
      state.sixStreak++;
      if (state.sixStreak >= 3) {
        io.log({ type: 'note', player: p.index, text: `Three sixes. ${p.name} is going too fast for the altitude — turn ends.` });
        state.sixStreak = 0;
        advance(state);
      } else {
        io.log({ type: 'note', player: p.index, text: `A six. ${p.name} goes again.` });
      }
    } else {
      state.sixStreak = 0;
      advance(state);
    }
  } finally {
    state.busy = false;
    io.sync();
  }
}

function advance(state) {
  state.turn = (state.turn + 1) % state.players.length;
  if (state.turn === 0) state.round++;
}

const fmt = (m) => String(m).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F');

/* ---------- standings, for the dock ---------- */

export function standings(state) {
  return state.players
    .map((p) => ({ ...p }))
    .sort((a, b) => b.pos - a.pos || a.index - b.index);
}

export function serialize(state) {
  return {
    v: 2,
    rules: state.rules,
    turn: state.turn,
    round: state.round,
    sixStreak: state.sixStreak,
    winner: state.winner,
    log: state.log.slice(-60),
    players: state.players.map((p) => ({
      name: p.name,
      cpu: p.cpu,
      pos: p.pos,
      grit: p.grit,
      rolls: p.rolls,
      climbs: p.climbs,
      falls: p.falls,
      best: p.best,
    })),
  };
}
