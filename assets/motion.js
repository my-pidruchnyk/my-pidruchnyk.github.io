/* Рух і плавність (v14.7) — доповнює assets/motion.css.
   Підключається в <head> (як themes.js): клас режиму ставиться ДО малювання, тож картки,
   які мають з'явитися під час прокручування, не блимають. Сторінки перемальовуються через innerHTML —
   нові елементи підхоплює MutationObserver.
   Режим руху (перемикач «Анімації» в меню шестерні, localStorage p8:motion):
     'auto' — як у системі (prefers-reduced-motion), 'on' — завжди, 'off' — ніколи.
   Результат — html.m-on або html.m-off; window.P8Motion — для themes.js (меню) і app.js (перегортання).
   Що робить при m-on:
   1) поява заголовків груп і карток предметів, коли докручуєш до них (по черзі, з невеликою затримкою);
   2) нахил карток за курсором + пляма світла (лише миша; на сенсорних екранах — ні);
   3) хвиля від кліку на кнопках і картках;
   4) «магнітні» шестерня й велика кнопка — злегка тягнуться за курсором. */
(() => {
  'use strict';

  const root = document.documentElement;
  const KEY = 'p8:motion';
  const MODES = ['auto', 'on', 'off'];
  const sys = matchMedia('(prefers-reduced-motion: reduce)');

  const read = () => { try { const m = JSON.parse(localStorage.getItem(KEY)); return MODES.includes(m) ? m : 'auto'; } catch { return 'auto'; } };
  const save = m => { try { m === 'auto' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, JSON.stringify(m)); } catch {} };

  let mode = read();
  const isOn = () => mode === 'on' || (mode === 'auto' && !sys.matches);
  const listeners = new Set();

  function applyMode() {
    const on = isOn();
    root.classList.toggle('m-on', on);
    root.classList.toggle('m-off', !on);
    listeners.forEach(fn => fn());
  }

  applyMode();
  sys.addEventListener?.('change', () => { if (mode === 'auto') applyMode(); });

  window.P8Motion = {
    modes: MODES,
    get mode() { return mode; },
    get on() { return isOn(); },
    get system() { return !sys.matches; },  // чи дозволяє рух сама система
    set(m) { if (!MODES.includes(m)) return; mode = m; save(m); applyMode(); },
    onChange(fn) { listeners.add(fn); },
  };

  const active = () => root.classList.contains('m-on');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const REVEAL = '.cy-group h3, .cy-card';
  const TILT = '.cy-card:not(:disabled), .cy-hub-card';
  const RIPPLE = '.cy-card:not(:disabled), .cy-hub-card, .cy-go, .cy-teacher-btn, .auth-submit-btn, .qfs-btn, '
    + '.quiz-submit-btn, .qcd-confirm-btn, .qpdf-btn, .tm-item, .bar .back, .nb-margin-quiz';
  const MAGNET = '.gear-btn, .cy-go';

  /* шар ефектів усередині елемента (обрізається по його кутах; сам елемент НЕ отримує overflow:hidden,
     щоб не обрізати «скотч» і «квіти» тем, що виходять за край картки) */
  function fx(el) {
    let layer = el.querySelector(':scope > .m-fx');
    if (!layer) {
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      layer = document.createElement('span');
      layer.className = 'm-fx';
      layer.setAttribute('aria-hidden', 'true');
      el.appendChild(layer);
    }
    return layer;
  }

  /* ---------- 1. Поява при прокручуванні ---------- */
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(entries => {
        let i = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target;
          el.style.setProperty('--m-d', `${Math.min(i++ * 45, 420)}ms`);
          el.classList.add('m-in');
          io.unobserve(el);
          setTimeout(() => el.style.removeProperty('--m-d'), 1400);
        }
      }, { rootMargin: '0px 0px -5% 0px', threshold: 0.05 })
    : null;

  function scan() {
    document.querySelectorAll(`:is(${REVEAL}):not(.m-seen)`).forEach(el => {
      el.classList.add('m-seen');
      if (io) io.observe(el); else el.classList.add('m-in');
    });
    document.querySelectorAll('.cy-go').forEach(fx);  // відблиск на великій кнопці
  }

  let queued = false;
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => { queued = false; scan(); });
  };

  function init() {
    scan();
    new MutationObserver(queue).observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ---------- 2. Нахил за курсором + 4. магніт ---------- */
  if (finePointer) {
    let tiltEl = null, magEl = null, px = 0, py = 0, raf = 0;

    const releaseTilt = el => {
      el.classList.remove('m-tilt');
      for (const p of ['--m-rx', '--m-ry']) el.style.removeProperty(p);
    };
    const releaseMag = el => {
      el.classList.remove('m-mag');
      for (const p of ['--m-px', '--m-py']) el.style.removeProperty(p);
    };

    function frame() {
      raf = 0;
      if (tiltEl) {
        const r = tiltEl.getBoundingClientRect();
        const x = (px - r.left) / r.width, y = (py - r.top) / r.height;
        const max = tiltEl.classList.contains('cy-hub-card') ? 7 : 4;
        tiltEl.style.setProperty('--m-rx', `${((0.5 - y) * max).toFixed(2)}deg`);
        tiltEl.style.setProperty('--m-ry', `${((x - 0.5) * max).toFixed(2)}deg`);
        const layer = fx(tiltEl);
        layer.style.setProperty('--m-mx', `${(x * 100).toFixed(1)}%`);
        layer.style.setProperty('--m-my', `${(y * 100).toFixed(1)}%`);
      }
      if (magEl) {
        const r = magEl.getBoundingClientRect();
        const dx = px - (r.left + r.width / 2), dy = py - (r.top + r.height / 2);
        const k = magEl.classList.contains('gear-btn') ? 0.22 : 0.12;
        magEl.style.setProperty('--m-px', `${(dx * k).toFixed(1)}px`);
        magEl.style.setProperty('--m-py', `${(dy * k).toFixed(1)}px`);
      }
    }

    document.addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse' || !active()) return;
      const t = e.target instanceof Element ? e.target : null;
      const tilt = t?.closest(TILT) || null;
      if (tilt !== tiltEl) {
        if (tiltEl) releaseTilt(tiltEl);
        tiltEl = tilt;
        if (tiltEl) tiltEl.classList.add('m-tilt');
      }
      const mag = t?.closest(MAGNET) || null;
      if (mag !== magEl) {
        if (magEl) releaseMag(magEl);
        magEl = mag;
        if (magEl) magEl.classList.add('m-mag');
      }
      px = e.clientX; py = e.clientY;
      if ((tiltEl || magEl) && !raf) raf = requestAnimationFrame(frame);
    }, { passive: true });

    // курсор пішов з вікна або рух вимкнули — усе повертається на місце
    const releaseAll = () => {
      if (tiltEl) releaseTilt(tiltEl);
      if (magEl) releaseMag(magEl);
      tiltEl = magEl = null;
    };
    document.addEventListener('pointerout', e => { if (!e.relatedTarget) releaseAll(); });
    listeners.add(() => { if (!active()) releaseAll(); });
  }

  /* ---------- 3. Хвиля від кліку ---------- */
  document.addEventListener('pointerdown', e => {
    if (e.button !== 0 || !active()) return;
    const el = e.target instanceof Element ? e.target.closest(RIPPLE) : null;
    if (!el || el.disabled) return;
    const layer = fx(el);
    const r = el.getBoundingClientRect();
    const size = Math.hypot(r.width, r.height) * 2;
    const dot = document.createElement('i');
    dot.className = 'm-ripple';
    dot.style.cssText = `left:${e.clientX - r.left}px;top:${e.clientY - r.top}px;width:${size}px;height:${size}px`;
    layer.appendChild(dot);
    dot.addEventListener('animationend', () => dot.remove());
  }, { passive: true });
})();
