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
   4) «магнітні» шестерня й велика кнопка — злегка тягнуться за курсором;
   5) вікна відкриваються й закриваються «як на Mac» — ефект джина від кнопки, на яку натиснули. */
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
    + '.quiz-submit-btn, .qcd-confirm-btn, .qpdf-btn, .tm-item, .bar .back, .nb-margin-quiz, .cy-soc-btn, .soc-item';
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

  /* ---------- 5. Вікна «як на Mac» (ефект джина) ----------
     Відкриття: вікно «виливається» з кнопки/картки, на яку натиснули, — стискається в лійку, що тягнеться
     до неї, і розправляється. Закриття: «засмоктується» назад у ту саму кнопку.
     Вікна при закритті одразу чистять вміст (innerHTML = '') або видаляються (overlay.remove()), тож
     закриття малюємо на «привиді» — знятому з DOM вузлі вікна, який ненадовго вставляємо назад. */
  const OVERLAY = '.auth-modal-overlay, .quiz-overlay';
  const BOX = '.auth-modal-box, .quiz-dialog';
  const lastRect = new WeakMap();   // вікно → його останнє положення на екрані (для «привида»)
  const origins = new WeakMap();    // оверлей → кнопка, з якої відкрили
  let lastPress = null;             // { el, rect, t } — останнє натискання (з нього «виливається» вікно)

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const visibleRect = el => {
    if (!el?.isConnected) return null;
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2 ? r : null;
  };

  // форма «лійки»: p = 0 — сильно стиснута до шийки, p = 1 — звичайний прямокутник (точок завжди однаково — інакше не анімується)
  function funnel(p, nx, neckBottom) {
    const N = 12, L = [], R = [];
    for (let i = 0; i <= N; i++) {
      const v = i / N;
      const d = neckBottom ? v : 1 - v;                 // 0 — широкий край, 1 — шийка
      const k = (1 - p) * d * d * (3 - 2 * d);          // плавне стискання (smoothstep)
      const w = 1 - k * 0.86;
      const c = 0.5 + (nx - 0.5) * k;
      L.push(`${((c - w / 2) * 100).toFixed(2)}% ${(v * 100).toFixed(2)}%`);
      R.unshift(`${((c + w / 2) * 100).toFixed(2)}% ${(v * 100).toFixed(2)}%`);
    }
    return `polygon(${L.concat(R).join(',')})`;
  }

  function genieFrames(box, src) {
    const bx = box.left + box.width / 2, by = box.top + box.height / 2;
    const scx = src.left + src.width / 2, scy = src.top + src.height / 2;
    const dx = scx - bx, dy = scy - by;
    const sx = clamp(src.width / box.width, 0.03, 1), sy = clamp(src.height / box.height, 0.03, 1);
    const neckBottom = dy > 0;
    const nx = clamp((scx - box.left) / box.width, 0.04, 0.96);
    const lerp = (a, b, t) => a + (b - a) * t;
    const tf = (t, ts) => `translate(${(dx * (1 - t)).toFixed(1)}px, ${(dy * (1 - t)).toFixed(1)}px) scale(${lerp(sx, 1, ts).toFixed(4)}, ${lerp(sy, 1, t).toFixed(4)})`;
    return [
      { offset: 0,   transform: tf(0, 0),      clipPath: funnel(0, nx, neckBottom),    opacity: 0.35 },
      { offset: 0.3, transform: tf(0.62, 0.2), clipPath: funnel(0.15, nx, neckBottom), opacity: 1 },
      { offset: 0.6, transform: tf(0.93, 0.7), clipPath: funnel(0.6, nx, neckBottom),  opacity: 1 },
      { offset: 1,   transform: tf(1, 1),      clipPath: funnel(1, nx, neckBottom),    opacity: 1 },
    ];
  }

  // запам'ятати, звідки натиснули, і де зараз відкриті вікна (до того, як клік їх закриє)
  function remember(target) {
    const el = target instanceof Element ? target.closest('button, a, [role="button"], .cy-hub-card, .cy-card') : null;
    if (el) lastPress = { el, rect: el.getBoundingClientRect(), t: performance.now() };
    document.querySelectorAll(`:is(${OVERLAY})[aria-hidden="false"] :is(${BOX})`).forEach(b => lastRect.set(b, b.getBoundingClientRect()));
  }
  document.addEventListener('pointerdown', e => remember(e.target), true);
  document.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') remember(document.activeElement);
  }, true);

  function genieOpen(overlay) {
    const box = overlay.querySelector(BOX);
    const press = lastPress && performance.now() - lastPress.t < 1500 ? lastPress : null;
    if (!box || !press || overlay.contains(press.el)) return;
    origins.set(overlay, press.el);
    overlay.classList.add('m-genie');
    const end = box.getBoundingClientRect();
    const src = visibleRect(press.el) || press.rect;
    if (!end.width || !src.width) { overlay.classList.remove('m-genie'); return; }
    const a = box.animate(genieFrames(end, src), { duration: 620, easing: 'cubic-bezier(.36, .02, .2, 1)' });
    a.finished.catch(() => {}).finally(() => overlay.classList.remove('m-genie'));
    lastRect.set(box, end);
  }

  function genieClose(overlay, box) {
    const rect = lastRect.get(box);
    const src = visibleRect(origins.get(overlay));
    origins.delete(overlay);
    if (!rect || !src) return;
    const ghost = document.createElement('div');
    ghost.className = `${overlay.className} m-genie m-ghost`.replace(/\s+/g, ' ').trim();
    ghost.setAttribute('aria-hidden', 'true');
    const bd = document.createElement('div');
    bd.className = overlay.classList.contains('quiz-overlay') ? 'quiz-backdrop' : 'auth-modal-backdrop';
    box.querySelectorAll('[id]').forEach(n => n.removeAttribute('id'));
    box.removeAttribute('id');
    Object.assign(box.style, {
      position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, maxWidth: 'none', maxHeight: 'none', margin: '0',
    });
    ghost.append(bd, box);
    document.body.appendChild(ghost);
    const frames = genieFrames(rect, src).reverse().map(f => ({ ...f, offset: 1 - f.offset }));
    bd.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease', fill: 'forwards' });
    box.animate(frames, { duration: 520, easing: 'cubic-bezier(.6, 0, .75, .3)', fill: 'forwards' })
      .finished.catch(() => {}).finally(() => ghost.remove());
  }

  const canAnimate = typeof Element.prototype.animate === 'function';  // старі браузери — вікна без «джина»
  new MutationObserver(records => {
    if (!active() || !canAnimate) return;
    for (const r of records) {
      if (r.type === 'attributes') {
        const o = r.target;
        if (!o.matches?.(OVERLAY) || o.classList.contains('m-ghost')) continue;
        if (o.getAttribute('aria-hidden') === 'false' && r.oldValue !== 'false') genieOpen(o);
        continue;
      }
      for (const n of r.removedNodes) {
        if (!(n instanceof Element) || n.classList.contains('m-ghost')) continue;
        // закриття: вміст вікна стерли (innerHTML = '') або прибрали весь оверлей
        if (n.matches(BOX) && r.target.matches?.(OVERLAY) && r.target.getAttribute('aria-hidden') !== 'false') genieClose(r.target, n);
        else if (n.matches(OVERLAY)) { const b = n.querySelector(BOX); if (b) genieClose(n, b); }
      }
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-hidden'], attributeOldValue: true });
})();
