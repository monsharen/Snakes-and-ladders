/*
 * audio.js — small synthesised sounds. No files, no network, easy to mute.
 */

let ctx = null;
let enabled = true;

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setEnabled(v) {
  enabled = !!v;
}

let engaged = false;

export function unlock() {
  engaged = true;
  if (enabled) ac();
}

function tone({ freq = 440, dur = 0.18, type = 'sine', gain = 0.06, at = 0, slideTo = null }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + at;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noise({ dur = 0.09, gain = 0.05, at = 0, freq = 1400, q = 1.4 }) {
  const c = ac();
  if (!c || !enabled) return;
  const t0 = c.currentTime + at;
  const len = Math.ceil(c.sampleRate * dur);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(c.destination);
  src.start(t0);
}

export const sfx = {
  rollTick: () => noise({ dur: 0.05, gain: 0.035, freq: 2200, q: 2.2 }),
  rollLand: () => {
    noise({ dur: 0.13, gain: 0.07, freq: 900, q: 1 });
    tone({ freq: 180, dur: 0.1, type: 'triangle', gain: 0.05 });
  },
  step: () => noise({ dur: 0.045, gain: 0.022, freq: 620, q: 1.1 }),
  climb: () => {
    [0, 0.09, 0.18].forEach((at, i) => tone({ freq: 392 * Math.pow(1.26, i), dur: 0.3, type: 'sine', gain: 0.05, at }));
  },
  fall: () => {
    tone({ freq: 300, slideTo: 88, dur: 0.62, type: 'sawtooth', gain: 0.045 });
    noise({ dur: 0.5, gain: 0.05, freq: 300, q: 0.7 });
  },
  refuge: () => {
    tone({ freq: 523.25, dur: 0.3, type: 'sine', gain: 0.045 });
    tone({ freq: 783.99, dur: 0.36, type: 'sine', gain: 0.03, at: 0.1 });
  },
  view: () => tone({ freq: 880, dur: 0.4, type: 'sine', gain: 0.028 }),
  grit: () => tone({ freq: 233, slideTo: 466, dur: 0.24, type: 'triangle', gain: 0.05 }),
  win: () => {
    [261.63, 329.63, 392.0, 523.25, 659.25].forEach((f, i) =>
      tone({ freq: f, dur: 0.9, type: 'sine', gain: 0.05, at: i * 0.13 })
    );
  },
};

export function haptic(pattern) {
  // Browsers reject vibrate before the first real gesture — asking anyway
  // just fills the console with warnings.
  if (engaged && navigator.vibrate) {
    try {
      navigator.vibrate(pattern);
    } catch (_) {
      /* ignore */
    }
  }
}
