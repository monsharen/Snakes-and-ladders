/*
 * main.js — boot.
 */

import { App } from './ui.js';

function boot() {
  window.randonnee = new App();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// Installable, and playable on a train with no signal.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      /* not fatal — the game runs the same without it */
    });
  });
}

// iOS Safari: stop a two-finger drag from bouncing the whole page behind the map.
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false }
);
