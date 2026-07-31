/*
 * render.js — draws the trail as one tall SVG and drives token movement.
 */

const NS = 'http://www.w3.org/2000/svg';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtAlt = (m) => String(m).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202F'); // narrow no-break space

/* ---------- decorative shapes ---------- */

function decorShape(d) {
  const { x, y, s, r, kind } = d;
  switch (kind) {
    case 'foret': {
      const h = 5.5 * s;
      const w = 2.4 * s;
      return `<path class="d-pine" d="M ${x} ${y - h} L ${x + w} ${y} L ${x + w * 0.45} ${y} L ${x + w * 0.45} ${y + h * 0.22} L ${x - w * 0.45} ${y + h * 0.22} L ${x - w * 0.45} ${y} L ${x - w} ${y} Z"/>`;
    }
    case 'vallee': {
      const w = 7 * s;
      return `<path class="d-field" d="M ${x - w} ${y} q ${w} ${-2.2 * s} ${2 * w} 0"/>`;
    }
    case 'alpage': {
      const w = 1.5 * s;
      const h = 2.9 * s;
      // grass, splaying outward — straight strokes read as arrowheads
      return `<path class="d-tuft" d="M ${x} ${y} q ${-w * 0.3} ${-h * 0.6} ${-w} ${-h * 0.8}
        M ${x} ${y} q ${w * 0.15} ${-h * 0.6} ${w * 0.1} ${-h}
        M ${x} ${y} q ${w * 0.4} ${-h * 0.55} ${w * 1.1} ${-h * 0.7}"/>`;
    }
    case 'pierrier': {
      const w = 2.6 * s;
      const h = 1.7 * s;
      return `<path class="d-rock" d="M ${x - w} ${y} l ${w * 0.5} ${-h} l ${w} 0 l ${w * 0.5} ${h} Z"/>`;
    }
    case 'glacier': {
      const w = 6 * s + r * 4;
      return `<path class="d-crev" d="M ${x - w} ${y} q ${w * 0.6} ${1.6} ${w * 2} ${r > 0.5 ? 0.6 : -0.9}"/>`;
    }
    default:
      return '';
  }
}

/* ---------- main board markup ---------- */

export function renderBoard(container, trail, players) {
  const { width: W, height: H } = trail;

  const bandDefs = trail.bands
    .map(
      (b) => `<rect class="band band-${b.key}" x="0" y="${b.yTop.toFixed(1)}" width="${W}" height="${(b.yBottom - b.yTop).toFixed(1)}" fill="${b.tint}"/>`
    )
    .join('');

  const bandRules = trail.bands
    .map((b) => {
      if (b.key === 'vallee') return '';
      return `<g class="band-rule"><line x1="0" y1="${b.yBottom.toFixed(1)}" x2="${W}" y2="${b.yBottom.toFixed(1)}"/></g>`;
    })
    .join('');

  const bandLabels = trail.bands
    .filter((b) => b.key !== 'sommet') // the summit names itself, on the node
    .map(
      (b) =>
        `<text class="band-label" x="3" y="${(b.yBottom - 8).toFixed(1)}">${esc(b.name.toUpperCase())} <tspan class="band-note">· ${esc(b.note)}</tspan></text>`
    )
    .join('');

  const decor = trail.decor.map(decorShape).join('');

  const contours = trail.contours
    .map(
      (c) =>
        `<path class="contour${c.major ? ' major' : ''}" d="${c.d}"/>` +
        (c.major ? `<text class="contour-alt" x="4" y="${(c.y + 6.2).toFixed(1)}">${fmtAlt(c.altitude)}</text>` : '')
    )
    .join('');

  // summit massif silhouette behind the top of the trail
  const peak = `
    <path class="massif far" d="M 0 ${(trail.bands[5].yBottom + 30).toFixed(1)} L 22 78 L 38 104 L 56 52 L 74 96 L 100 66 L 100 ${(trail.bands[5].yBottom + 30).toFixed(1)} Z"/>
    <path class="massif near" d="M 8 ${(trail.bands[5].yBottom + 30).toFixed(1)} L 34 62 L 50 22 L 68 70 L 92 ${(trail.bands[5].yBottom + 30).toFixed(1)} Z"/>
    <g class="cairn">
      <ellipse cx="50" cy="19" rx="3.4" ry="1.5"/>
      <ellipse cx="50" cy="15.4" rx="2.5" ry="1.3"/>
      <ellipse cx="50" cy="12.3" rx="1.5" ry="1.1"/>
    </g>`;

  const linkMarkup = trail.links
    .map((l) => {
      const cls = l.dir === 'up' ? 'link up' : 'link down';
      return `<g class="${cls}" data-link="${l.id}">
        <path class="link-halo" d="${l.d}"/>
        <path class="link-line" id="path-${l.id}" d="${l.d}"/>
      </g>`;
    })
    .join('');

  const nodeMarkup = trail.nodes
    .map((nd) => {
      if (nd.n === 0) {
        return `<g class="node trailhead" data-n="0" transform="translate(${nd.x} ${nd.y})">
            <circle class="node-disc" r="5.6"/>
            <path class="node-glyph" d="M -2.2 1.8 L 0 -2.4 L 2.2 1.8 Z"/>
            <text class="node-caption" y="9.6">DÉPART · ${fmtAlt(trail.baseAltitude)} m</text>
          </g>`;
      }
      if (nd.n === trail.summit) {
        return `<g class="node summit" data-n="${nd.n}" transform="translate(${nd.x} ${nd.y})">
            <circle class="node-halo" r="11"/>
            <circle class="node-disc" r="8"/>
            <path class="node-glyph" d="M -3.4 2.6 L 0 -3.6 L 3.4 2.6 Z"/>
            <text class="node-caption" y="13.4">LE SOMMET · ${fmtAlt(trail.summitAltitude)} m</text>
          </g>`;
      }
      const extra =
        nd.kind === 'refuge'
          ? `<path class="node-glyph" d="M -2.4 1.8 L -2.4 -0.3 L 0 -2.3 L 2.4 -0.3 L 2.4 1.8 Z"/>`
          : nd.kind === 'view'
          ? `<circle class="node-glyph-dot" r="1.15"/>`
          : '';
      return `<g class="node kind-${nd.kind}" data-n="${nd.n}" transform="translate(${nd.x} ${nd.y})">
          <circle class="node-disc" r="5.4"/>
          <text class="node-num" y="1.75">${nd.n}</text>
          ${extra}
        </g>`;
    })
    .join('');

  const tokenMarkup = players
    .map(
      (p, i) => `<g class="token" id="token-${i}" data-p="${i}" style="--pc: var(--p${i + 1})">
        <circle class="tok-shadow" cy="1.1" r="4.4"/>
        <circle class="tok-body" r="4.2"/>
        <circle class="tok-ring" r="4.2"/>
        <text class="tok-mark" y="1.35">${esc(p.name.trim().slice(0, 1).toUpperCase() || String(i + 1))}</text>
      </g>`
    )
    .join('');

  container.innerHTML = `
<svg id="board" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMin meet" role="img"
     aria-label="A mountain trail of ${trail.summit} waypoints, climbing from the valley to the summit">
  <defs>
    <linearGradient id="sky" x1="0" y1="1" x2="0.15" y2="0">
      <stop offset="0"    stop-color="#0F1710"/>
      <stop offset="0.22" stop-color="#131E17"/>
      <stop offset="0.44" stop-color="#152530"/>
      <stop offset="0.66" stop-color="#1B3242"/>
      <stop offset="0.86" stop-color="#264458"/>
      <stop offset="1"    stop-color="#35607A"/>
    </linearGradient>
    <linearGradient id="haze" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#DCE9F2" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#DCE9F2" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect x="0" y="0" width="${W}" height="${H}" fill="url(#sky)"/>
  <g class="bands" opacity="0.24">${bandDefs}</g>
  <g class="massifs">${peak}</g>
  <rect x="0" y="0" width="${W}" height="${(H * 0.2).toFixed(0)}" fill="url(#haze)"/>
  <g class="contours">${contours}</g>
  <g class="decor">${decor}</g>
  <g class="band-rules">${bandRules}</g>
  <g class="band-labels">${bandLabels}</g>

  <g class="trail">
    <path class="trail-bed" d="${trail.path}"/>
    <path class="trail-line" d="${trail.path}"/>
  </g>

  <g class="links">${linkMarkup}</g>
  <g class="nodes">${nodeMarkup}</g>
  <g class="tokens" id="tokens">${tokenMarkup}</g>
</svg>`;

  return container.querySelector('#board');
}

/* ---------- token placement ---------- */

// Several hikers on one waypoint fan out around it.
function clusterOffsets(count) {
  if (count <= 1) return [{ dx: 0, dy: 0 }];
  const r = count === 2 ? 2.6 : 3.4;
  return Array.from({ length: count }, (_, i) => {
    const a = -Math.PI / 2 + (i / count) * Math.PI * 2;
    return { dx: Math.cos(a) * r, dy: Math.sin(a) * r * 0.85 };
  });
}

export class TokenLayer {
  constructor(boardEl, trail, players) {
    this.board = boardEl;
    this.trail = trail;
    this.players = players;
    this.els = players.map((_, i) => boardEl.querySelector(`#token-${i}`));
    this.free = new Map(); // players temporarily driven by an animation
  }

  positionOf(playerIndex) {
    const p = this.players[playerIndex];
    const node = this.trail.nodes[p.pos];
    const sharing = this.players
      .map((q, i) => ({ q, i }))
      .filter(({ q, i }) => q.pos === p.pos && !this.free.has(i));
    const idx = sharing.findIndex(({ i }) => i === playerIndex);
    const offs = clusterOffsets(sharing.length);
    const o = offs[Math.max(0, idx)] || { dx: 0, dy: 0 };
    return { x: node.x + o.dx, y: node.y + o.dy };
  }

  layout({ instant = false } = {}) {
    this.players.forEach((_, i) => {
      if (this.free.has(i)) return;
      const el = this.els[i];
      const { x, y } = this.positionOf(i);
      el.classList.toggle('instant', instant);
      el.setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
      if (instant) requestAnimationFrame(() => el.classList.remove('instant'));
    });
  }

  raise(i) {
    const el = this.els[i];
    el.parentNode.appendChild(el);
    el.classList.add('active');
  }

  lower(i) {
    this.els[i].classList.remove('active');
  }

  setRaw(i, x, y) {
    this.els[i].setAttribute('transform', `translate(${x.toFixed(2)} ${y.toFixed(2)})`);
  }

  // Walk the token through a list of waypoint indices, one hop at a time.
  async walk(playerIndex, waypoints, { stepMs = 165, onStep } = {}) {
    const el = this.els[playerIndex];
    this.raise(playerIndex);
    for (const n of waypoints) {
      this.players[playerIndex].pos = n;
      this.layout();
      if (onStep) onStep(n);
      await wait(stepMs);
    }
    el.classList.remove('hop');
    this.lower(playerIndex);
  }

  // Glide the token along a link's curve (via ferrata, rockfall, …).
  async glide(playerIndex, linkId, ms = 900) {
    const path = this.board.querySelector(`#path-${linkId}`);
    if (!path) return;
    const el = this.els[playerIndex];
    this.free.set(playerIndex, true);
    this.raise(playerIndex);
    el.classList.add('gliding');
    const total = path.getTotalLength();
    const t0 = performance.now();
    await new Promise((resolve) => {
      const tick = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
        const pt = path.getPointAtLength(e * total);
        this.setRaw(playerIndex, pt.x, pt.y);
        if (t < 1) requestAnimationFrame(tick);
        else resolve();
      };
      requestAnimationFrame(tick);
    });
    el.classList.remove('gliding');
    this.free.delete(playerIndex);
    this.lower(playerIndex);
    this.layout();
  }

  pulseNode(n, cls = 'lit') {
    const g = this.board.querySelector(`.node[data-n="${n}"]`);
    if (!g) return;
    g.classList.remove(cls);
    void g.getBoundingClientRect();
    g.classList.add(cls);
    setTimeout(() => g.classList.remove(cls), 1400);
  }

  highlightLink(id, on) {
    const g = this.board.querySelector(`[data-link="${id}"]`);
    if (g) g.classList.toggle('firing', on);
  }
}

/* ---------- camera ---------- */

export class Camera {
  constructor(scrollEl, boardEl, trail) {
    this.scroll = scrollEl;
    this.board = boardEl;
    this.trail = trail;
  }

  yToPixels(y) {
    const h = this.board.getBoundingClientRect().height;
    return (y / this.trail.height) * h;
  }

  centerOn(nodeIndex, { smooth = true, bias = 0.46 } = {}) {
    const node = this.trail.nodes[nodeIndex];
    if (!node) return;
    const target = this.yToPixels(node.y) - this.scroll.clientHeight * bias;
    const top = Math.max(0, Math.min(target, this.scroll.scrollHeight - this.scroll.clientHeight));
    this.scroll.scrollTo({ top, behavior: smooth ? 'smooth' : 'auto' });
  }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
export { fmtAlt };
