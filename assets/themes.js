/* Теми сайту + шестерня-перемикач (замість кружечка «8» у шапці головної).
   - Тема ставиться на <html data-theme="…" data-tone="light|dark"> ще ДО малювання (скрипт у <head>) — без «спалаху».
   - Вибір зберігається в localStorage `p8:theme`; «Неон» = поточний дизайн = без атрибута.
   - app.js не змінюється: головна перемальовується через innerHTML, тож шестерню підставляємо MutationObserver-ом
     на місце .cy-me щоразу, коли вона з'являється.
   - Шрифти теми вантажаться лише для обраної теми (не всі 14 одразу).
   Палітри й «фішки» тем — assets/themes.css; макет-лабораторія — design/theme-ideas/themes.html. */
(() => {
  'use strict';

  const KEY = 'p8:theme';
  const G = 'https://fonts.googleapis.com/css2?display=swap&family=';
  const THEMES = [
    { id: 'neon',       name: 'Неон',            note: 'Кіберпанк «Дія» — як зараз',      tone: 'dark',  sw: ['#07060f', '#00f0ff', '#ff2bd6'] },
    { id: 'chalk',      name: 'Крейдяна дошка',  note: 'Дошка, крейда, дерев\'яна рама',  tone: 'dark',  sw: ['#23382f', '#ffe873', '#ff9ecb'], fonts: ['Neucha'] },
    { id: 'blueprint',  name: 'Креслення',       note: 'Синька й міліметрівка',            tone: 'dark',  sw: ['#0d4a9e', '#ffffff', '#ff8a5c'], fonts: ['IBM+Plex+Mono:wght@400;600;700'] },
    { id: 'pixel',      name: '8-біт',           note: 'Кишенькова консоль 1989',          tone: 'light', sw: ['#0f380f', '#306230', '#9bbc0f'], fonts: ['Press+Start+2P'] },
    { id: 'bauhaus',    name: 'Баухаус',         note: 'Коло, трикутник, квадрат',         tone: 'light', sw: ['#d62828', '#003f88', '#f4b400'], fonts: ['Jost:wght@400;500;700;800'] },
    { id: 'scrapbook',  name: 'Скрапбук',        note: 'Крафт, скотч і наліпки',           tone: 'light', sw: ['#c9a77c', '#d1495b', '#ffd23f'], fonts: ['Caveat:wght@600;700', 'Nunito:wght@400;600;800'] },
    { id: 'petrykivka', name: 'Петриківка',      note: 'Орнамент і квітка-розпис',         tone: 'light', sw: ['#b3261e', '#1f6b3a', '#e0a526'], fonts: ['Kurale', 'Lora:ital,wght@0,400;0,600;1,400'] },
    { id: 'space',      name: 'Обсерваторія',    note: 'Зорі й полярне сяйво',             tone: 'dark',  sw: ['#050816', '#7cf5c3', '#b48cff'], fonts: ['Montserrat+Alternates:wght@500;700', 'Manrope:wght@400;600;800'] },
    { id: 'aero',       name: 'Frutiger Aero',   note: 'Глянцеве скло 2000-х',             tone: 'light', sw: ['#2eaaee', '#6fd04b', '#ffffff'], fonts: ['Comfortaa:wght@500;700', 'Nunito:wght@400;600;800'] },
    { id: 'newspaper',  name: 'Газета 1920-х',   note: 'Растр, лінійки, буквиця',          tone: 'light', sw: ['#f1ece0', '#1a1a1a', '#9b1c1c'], fonts: ['Playfair+Display:ital,wght@0,700;0,900;1,700', 'PT+Serif:ital,wght@0,400;0,700;1,400'] },
    { id: 'crt',        name: 'Термінал',        note: 'Бурштиновий кінескоп',             tone: 'dark',  sw: ['#0c0802', '#ffb000', '#ff6a00'] },
  ];
  const byId = id => THEMES.find(t => t.id === id) || THEMES[0];
  const root = document.documentElement;

  const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
  const save = id => { try { id === 'neon' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, JSON.stringify(id)); } catch {} };

  function loadFonts(t) {
    if (!t.fonts) return;
    const href = G + t.fonts.join('&family=');
    if (document.querySelector(`link[data-theme-fonts="${t.id}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = href; l.dataset.themeFonts = t.id;
    document.head.appendChild(l);
  }

  function apply(id) {
    const t = byId(id);
    if (t.id === 'neon') { root.removeAttribute('data-theme'); root.removeAttribute('data-tone'); }
    else { root.setAttribute('data-theme', t.id); root.setAttribute('data-tone', t.tone); }
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = t.sw[0];
    loadFonts(t);
    return t;
  }

  // 1) одразу, ще в <head>
  let current = apply(read() || 'neon').id;

  // 2) шестерня й меню — коли з'явиться DOM
  const GEAR_SVG = `
    <svg class="gear-svg" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="gear-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style="stop-color:var(--gear-a, var(--cy-c, #00f0ff))"/>
          <stop offset="1" style="stop-color:var(--gear-b, var(--cy-m, #ff2bd6))"/>
        </linearGradient>
      </defs>
      <path class="gear-body" fill="url(#gear-grad)" d="${gearPath(50, 50, 48, 38, 10)}"/>
      <circle class="gear-ring" cx="50" cy="50" r="27" fill="none" stroke-width="2.5"/>
      <g class="gear-bolts">${[0, 1, 2, 3, 4].map(i => {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        return `<circle cx="${(50 + 32.5 * Math.cos(a)).toFixed(2)}" cy="${(50 + 32.5 * Math.sin(a)).toFixed(2)}" r="2.2"/>`;
      }).join('')}</g>
    </svg>`;

  // зубчасте колесо: n зубів, трапеції між радіусами rIn і rOut
  function gearPath(cx, cy, rOut, rIn, n) {
    const pts = [];
    const step = (Math.PI * 2) / n;
    for (let i = 0; i < n; i++) {
      const a = i * step - Math.PI / 2;
      const p = (r, da) => [cx + r * Math.cos(a + da), cy + r * Math.sin(a + da)];
      pts.push(p(rIn, -step * 0.5), p(rIn, -step * 0.28), p(rOut, -step * 0.18), p(rOut, step * 0.18), p(rIn, step * 0.28));
    }
    return 'M' + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L') + ' Z';
  }

  let spins = 0;
  const spin = (turns = 1) => {
    spins += turns;
    document.querySelectorAll('.gear-svg').forEach(s => s.style.setProperty('--gear-rot', `${spins * 120}deg`));
  };

  function menuHTML() {
    return `
      <div class="theme-menu" id="theme-menu" role="menu" aria-label="Тема сайту" hidden>
        <div class="tm-head"><span>Тема сайту</span><kbd>Esc</kbd></div>
        <div class="tm-list">
          ${THEMES.map((t, i) => `
            <button type="button" class="tm-item" role="menuitemradio" data-theme-id="${t.id}"
                    aria-checked="${t.id === current}" style="--i:${i};--s1:${t.sw[0]};--s2:${t.sw[1]};--s3:${t.sw[2]}">
              <span class="tm-sw" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="tm-txt"><b>${t.name}</b><small>${t.note}</small></span>
              <span class="tm-check" aria-hidden="true">✓</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function mount(me) {
    const grade = me.textContent.trim() || '8';
    const wrap = document.createElement('div');
    wrap.className = 'gear-wrap';
    wrap.innerHTML = `
      <button type="button" class="gear-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="theme-menu"
              title="Тема сайту">${GEAR_SVG}<span class="gear-num">${grade}</span></button>
      ${menuHTML()}`;
    me.replaceWith(wrap);
    wrap.querySelector('.gear-svg').style.setProperty('--gear-rot', `${spins * 120}deg`);
  }

  const openMenu = () => document.querySelector('.gear-btn[aria-expanded="true"]');

  function toggle(btn, force) {
    const menu = btn.parentElement.querySelector('.theme-menu');
    const open = force ?? btn.getAttribute('aria-expanded') !== 'true';
    btn.setAttribute('aria-expanded', String(open));
    spin(open ? 1 : -1);
    if (open) {
      menu.hidden = false;
      requestAnimationFrame(() => menu.classList.add('open'));
      (menu.querySelector('[aria-checked="true"]') || menu.querySelector('.tm-item'))?.focus({ preventScroll: true });
    } else {
      menu.classList.remove('open');
      setTimeout(() => { if (!menu.classList.contains('open')) menu.hidden = true; }, 220);
    }
  }

  function choose(id) {
    current = apply(id).id;
    save(current);
    document.querySelectorAll('.tm-item').forEach(b => b.setAttribute('aria-checked', String(b.dataset.themeId === current)));
    spin(2);  // «клац» — шестерня докручується при зміні теми
  }

  function init() {
    const scan = () => document.querySelectorAll('.cy-me').forEach(mount);
    scan();
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });

    // клік поза відкритим меню лише закриває його і далі НЕ проходить
    // (інакше той самий клік відкрив би картку предмета під курсором)
    document.addEventListener('click', e => {
      const b = openMenu();
      if (!b || e.target.closest('.theme-menu, .gear-btn')) return;
      e.preventDefault();
      e.stopPropagation();
      toggle(b, false);
    }, true);

    document.addEventListener('click', e => {
      const btn = e.target.closest('.gear-btn');
      if (btn) { toggle(btn); return; }
      const item = e.target.closest('.tm-item');
      if (item) { choose(item.dataset.themeId); const b = openMenu(); if (b) setTimeout(() => toggle(b, false), 260); b?.focus(); }
    });

    document.addEventListener('keydown', e => {
      const b = openMenu();
      if (!b) return;
      if (e.key === 'Escape') { e.preventDefault(); toggle(b, false); b.focus(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Home' || e.key === 'End') {
        const items = [...document.querySelectorAll('.tm-item')];
        const i = items.indexOf(document.activeElement);
        const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
          : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        e.preventDefault(); items[n].focus();
      }
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.SiteThemes = { list: THEMES.map(t => t.id), apply: choose, get current() { return current; } };
})();
