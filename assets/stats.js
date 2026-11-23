/* 📊 Лічильник відвідувань — GoatCounter (безкоштовно для некомерційних проєктів, без cookie,
   без збору особистих даних; https://www.goatcounter.com). Статистику бачить ЛИШЕ власник — у своєму
   кабінеті GoatCounter після входу (публічний доступ до статистики вимкнений за замовчуванням).

   Що рахуємо (анонімно):
   - перегляди: головна «/» і відкриття підручника «/<slug>» (назва — предмет, напр. «Фізика»);
     гортання сторінок усередині книжки окремо НЕ рахуємо — лише «який предмет відкрили»;
   - події: «тест/<slug>» — пройдено тест з предмета.
   Не рахуємо: локальну розробку (localhost), браузери з «Do Not Track», власника сайту
   (на своєму ПК один раз відкрити https://my-pidruchnyk.github.io/#toggle-goatcounter → «не рахувати мене»).

   Вмикається одним рядком: GC_CODE = 'код-сайту-в-goatcounter'. */
(() => {
  'use strict';

  const GC_CODE = 'mypidruchnyk';                                 // ← код сайту з GoatCounter (напр. 'mypidruchnyk')
  const SITE_HOST = 'my-pidruchnyk.github.io';
  const debug = (() => { try { return localStorage.getItem('p8:gc-debug') === '1'; } catch { return false; } })();

  const enabled = GC_CODE && (location.hostname === SITE_HOST || debug)
    && navigator.doNotTrack !== '1' && window.doNotTrack !== '1';
  let ready = false, queue = [];

  function send(o) {
    if (debug) console.info('[GoatCounter]', o);
    if (!enabled) return;
    if (!ready) { queue.push(o); return; }
    window.goatcounter?.count?.(o);
  }

  if (enabled && !debug) {
    window.goatcounter = { no_onload: true };           // рахуємо самі: сайт — одна сторінка з переходами
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://gc.zgo.at/count.js';
    s.dataset.goatcounter = `https://${GC_CODE}.goatcounter.com/count`;
    s.onload = () => { ready = true; queue.splice(0).forEach(o => window.goatcounter.count(o)); };
    document.head.appendChild(s);
  } else if (debug) {
    ready = true;
  }

  // який «екран» зараз: головна чи підручник (slug з адреси #slug.сторінка)
  let last = null;
  let names = {};                                       // slug → назва предмета (з books.json)
  function view() {
    const m = location.hash.match(/^#([a-z0-9-]+)(?:\.\d+)?$/i);
    const slug = m && names[m[1]] ? m[1] : null;        // лише справжні підручники
    const path = slug ? `/${slug}` : '/';
    if (path === last) return;
    last = path;
    send({ path, title: slug ? names[slug] : 'Головна' });
  }

  // заголовок вкладки змінюється при переході «головна ↔ підручник» (app.js) — по ньому й рахуємо;
  // перший перегляд — коли відомі назви предметів (books.json браузер уже має в кеші)
  function init() {
    fetch('books.json').then(r => r.json()).then(d => {
      for (const b of d.subjects || []) names[b.slug] = b.subject;
    }).catch(() => {}).finally(() => {
      view();
      const t = document.querySelector('title');
      if (t) new MutationObserver(view).observe(t, { childList: true, characterData: true, subtree: true });
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // події (напр. пройдено тест) — викликає quiz.js
  function event(name, title) {
    send({ path: name, title: title || name, event: true });
  }

  window.Stats = { event, get enabled() { return !!enabled; } };
})();
