/*
 * dice.js — one die, rolled with a little ceremony.
 */

const FACES = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

export class Die {
  constructor(el) {
    this.el = el;
    this.value = 6;
    this.el.innerHTML = Array.from({ length: 9 }, (_, i) => `<i data-i="${i}"></i>`).join('');
    this.pips = Array.from(this.el.querySelectorAll('i'));
    this.show(6);
  }

  show(v) {
    this.value = v;
    const on = new Set(FACES[v] || []);
    this.pips.forEach((pip, i) => pip.classList.toggle('on', on.has(i)));
    this.el.dataset.face = String(v);
  }

  async roll({ onTick, duration = 760 } = {}) {
    const final = 1 + Math.floor(Math.random() * 6);
    this.el.classList.add('rolling');
    const start = performance.now();
    let last = 0;
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = (now - start) / duration;
        if (t >= 1) return resolve();
        // faces flip fast at first, then settle
        const gap = 45 + 190 * t * t * t;
        if (now - last > gap) {
          last = now;
          // show a face that isn't the current one, but never spin on it
          let v = 1 + Math.floor(Math.random() * 6);
          if (v === this.value) v = (v % 6) + 1;
          this.show(v);
          if (onTick) onTick(v);
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    this.el.classList.remove('rolling');
    this.show(final);
    this.el.classList.add('settled');
    setTimeout(() => this.el.classList.remove('settled'), 420);
    return final;
  }
}
