/* 🔥 Прогрес і серія днів — усе в браузері (localStorage `p8:progress`), без акаунтів і серверів.
   - Сторінку зараховано «прочитаною», якщо вона була відкрита ≥ 8 с (гортання сторінок не рахується).
   - День навчання — будь-який день, коли прочитано сторінку або пройдено тест.
   - Серія — скільки днів поспіль ти вчишся; не вчився сьогодні, але вчився вчора — серія ще жива.
   Гачки: app.js → Progress.page(slug, n) при показі сторінки, Progress.leave() на головній;
          quiz.js → Progress.test({ correct, total }) після «Перевірити»;
          app.js → Progress.html() — блок під привітанням на головній. */
(() => {
  'use strict';

  const KEY = 'p8:progress';
  const READ_MS = 8000;
  const pad = n => String(n).padStart(2, '0');
  const dayKey = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, k) => { const x = new Date(d); x.setDate(x.getDate() + k); return x; };

  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(KEY));
      if (s && s.v === 1) return s;
    } catch { /* приватний режим / зіпсовані дані */ }
    return { v: 1, days: {}, pages: {}, tests: { count: 0, correct: 0, total: 0 }, best: 0 };
  }
  let st = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { /* немає місця / приватний режим */ } };

  function streak() {
    let d = new Date();
    if (!st.days[dayKey(d)]) d = addDays(d, -1);          // сьогодні ще не вчився — рахуємо від учора
    let n = 0;
    while (st.days[dayKey(d)]) { n++; d = addDays(d, -1); }
    return n;
  }

  function touchDay(kind) {
    const k = dayKey();
    const day = st.days[k] || (st.days[k] = { pages: 0, tests: 0 });
    day[kind]++;
    st.best = Math.max(st.best || 0, streak());
    save();
  }

  // ---- сторінки ----
  let timer = null;
  function page(slug, n) {
    clearTimeout(timer);
    if (!slug || !n) return;
    timer = setTimeout(() => {
      st = load();                                        // інша вкладка могла щось додати
      const list = st.pages[slug] || (st.pages[slug] = []);
      if (!list.includes(n)) list.push(n);
      touchDay('pages');
    }, READ_MS);
  }
  function leave() { clearTimeout(timer); }

  // ---- тести ----
  function test({ correct = 0, total = 0 } = {}) {
    if (!total) return;
    st = load();
    st.tests.count++;
    st.tests.correct += correct;
    st.tests.total += total;
    touchDay('tests');
  }

  function stats() {
    st = load();
    const today = dayKey();
    const pagesRead = Object.values(st.pages).reduce((s, l) => s + l.length, 0);
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const d = addDays(new Date(), -i);
      week.push({ key: dayKey(d), active: !!st.days[dayKey(d)], today: i === 0, wd: ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][d.getDay()] });
    }
    return {
      streak: streak(),
      best: Math.max(st.best || 0, streak()),
      activeToday: !!st.days[today],
      pagesRead,
      pagesToday: st.days[today]?.pages || 0,
      tests: st.tests.count,
      accuracy: st.tests.total ? Math.round(st.tests.correct / st.tests.total * 100) : null,
      daysTotal: Object.keys(st.days).length,
      week,
    };
  }

  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`;
  };

  function html() {
    const s = stats();
    const weekHtml = s.week.map(d =>
      `<span class="pg-day${d.active ? ' on' : ''}${d.today ? ' today' : ''}" title="${d.key}${d.active ? ' — вчився' : ''}">
         <i aria-hidden="true">${d.active ? '🔥' : ''}</i><small>${d.wd}</small></span>`).join('');

    if (!s.daysTotal) {
      return `
        <section class="cy-progress empty" aria-label="Мій прогрес">
          <div class="pg-streak"><span class="pg-fire" aria-hidden="true">🔥</span>
            <div><b>Почни свою серію!</b><span>Прочитай будь-яку сторінку — і тут з'являться твої дні навчання поспіль, прочитані сторінки й тести.</span></div>
          </div>
          <div class="pg-week" aria-label="Останні 7 днів">${weekHtml}</div>
        </section>`;
    }

    const msg = s.activeToday
      ? (s.streak > 1 ? 'Сьогодні вже вчився — так тримати!' : 'Перший день серії — завтра продовжимо?')
      : `Прочитай сторінку сьогодні, щоб не перервати серію`;
    return `
      <section class="cy-progress${s.activeToday ? ' lit' : ''}" aria-label="Мій прогрес">
        <div class="pg-streak">
          <span class="pg-fire" aria-hidden="true">🔥</span>
          <div><b>${s.streak ? `${plural(s.streak, 'день', 'дні', 'днів')} поспіль` : 'Серію перервано'}</b>
            <span>${s.streak ? msg : 'Прочитай сторінку — і почнеться нова серія'}${s.best > 1 ? ` · рекорд: ${plural(s.best, 'день', 'дні', 'днів')}` : ''}</span></div>
        </div>
        <div class="pg-week" aria-label="Останні 7 днів">${weekHtml}</div>
        <div class="pg-stat"><b>${s.pagesRead}</b><span>${plural(s.pagesRead, 'сторінку', 'сторінки', 'сторінок').replace(/^\d+ /, '')} прочитано${s.pagesToday ? ` · сьогодні ${s.pagesToday}` : ''}</span></div>
        <div class="pg-stat"><b>${s.tests}</b><span>${plural(s.tests, 'тест', 'тести', 'тестів').replace(/^\d+ /, '')} пройдено${s.accuracy !== null ? ` · ${s.accuracy}% правильних` : ''}</span></div>
      </section>`;
  }

  window.Progress = { page, leave, test, stats, html };
})();
