/* 🔍 Пошук по всіх підручниках (на головній, під привітанням).
   Дані вже є на сайті: books/<slug>/theses.json (тези, ~1,5 МБ стиснуто на всі книжки) і text.json (текст сторінок,
   ~3,3 МБ). Тези вантажаться, щойно користувач торкнувся поля пошуку; текст сторінок — у фоні після першого запиту,
   результати з нього доповнюють список. Усе в браузері — без серверів.
   Українські закінчення: «фотосинтезу» знаходить «фотосинтез», «клітини» — «клітина» (обрізаємо закінчення запиту
   і шукаємо початок слова). Кілька слів — сторінка має містити всі.
   Перехід: location.hash = '#slug.n' (app.js слухає hashchange). */
(() => {
  'use strict';

  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const norm = s => String(s ?? '')
    .replace(/-\s*\n\s*/g, '')                 // перенос слова в тексті сторінки: «фото-\nсинтез»
    .toLowerCase()
    .replace(/[’ʼ`‘´]/g, "'")
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ');
  const LETTER = /[\p{L}\p{N}']/u;

  let books = null;                 // books.json → subjects
  let docs = null;                  // [{ slug, n, label, subject, color, title, th, tx }]
  let loadingTheses = null, loadingText = null, textReady = false;

  const label = (b, i) => {         // та сама формула, що label() в app.js
    if (b.page_offset == null) return String(i);
    const s = b.page_scale || 1, p = s * i - b.page_offset;
    if (p < 1) return '';
    return s === 2 ? `${p}–${p + 1}` : String(p);
  };

  async function getJSON(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${r.status} ${url}`);
    return r.json();
  }

  function loadTheses() {
    if (loadingTheses) return loadingTheses;
    loadingTheses = (async () => {
      books = (await getJSON('books.json')).subjects.filter(b => b.pages);
      const all = await Promise.all(books.map(b => getJSON(`books/${b.slug}/theses.json`).then(t => [b, t.pages || {}]).catch(() => [b, {}])));
      docs = [];
      for (const [b, pages] of all) {
        for (const [k, t] of Object.entries(pages)) {
          const n = parseInt(k, 10);
          if (!n || !t) continue;
          const terms = (t.terms || []).map(x => `${x.term} — ${x.def}`).join(' • ');
          docs.push({
            slug: b.slug, n, label: label(b, n), subject: b.subject, color: b.color,
            title: t.title || '',
            raw: [...(t.points || []), terms, t.example].filter(Boolean).join(' • '),   // заголовок показуємо окремо
            tt: norm(t.title), th: norm([...(t.points || []), t.example].filter(Boolean).join(' ')), tm: norm(terms), tx: '',
          });
        }
      }
      docs.sort((a, b) => a.slug.localeCompare(b.slug) || a.n - b.n);
    })();
    return loadingTheses;
  }

  function loadText() {
    if (loadingText) return loadingText;
    loadingText = (async () => {
      await loadTheses();
      const byKey = new Map(docs.map(d => [`${d.slug}.${d.n}`, d]));
      await Promise.all(books.map(async b => {
        let t;
        try { t = await getJSON(`books/${b.slug}/text.json`); } catch { return; }
        for (const [k, txt] of Object.entries(t)) {
          const n = parseInt(k, 10);
          if (!n || !txt) continue;
          let d = byKey.get(`${b.slug}.${n}`);
          if (!d) {   // сторінка без тез — шукаємо лише в тексті
            d = { slug: b.slug, n, label: label(b, n), subject: b.subject, color: b.color, title: '', raw: '', tt: '', th: '', tm: '', tx: '' };
            docs.push(d); byKey.set(`${b.slug}.${n}`, d);
          }
          d.rawText = String(txt);
          d.tx = norm(txt);
        }
      }));
      textReady = true;
    })();
    return loadingText;
  }

  // запит → основи слів: довгим словам обрізаємо закінчення (знайде інші відмінки)
  function stems(q) {
    return norm(q).split(/[^\p{L}\p{N}']+/u).filter(w => w.length >= 2).map(w => {
      if (/\d/.test(w)) return w;
      if (w.length >= 8) return w.slice(0, -2);
      if (w.length >= 5) return w.slice(0, -1);
      return w;
    });
  }

  // скільки разів основа трапляється на початку слова
  function hits(hay, stem) {
    if (!hay) return 0;
    let c = 0, i = hay.indexOf(stem);
    while (i !== -1 && c < 20) {
      if (!i || !LETTER.test(hay[i - 1])) c++;
      i = hay.indexOf(stem, i + stem.length);
    }
    return c;
  }

  function search(q) {
    const ss = stems(q);
    if (!ss.length || !docs) return [];
    const res = [];
    for (const d of docs) {
      let score = 0, ok = true;
      for (const s of ss) {
        const h = hits(d.tt, s) * 12 + hits(d.tm, s) * 6 + hits(d.th, s) * 4 + Math.min(hits(d.tx, s), 8);
        if (!h) { ok = false; break; }
        score += h;
      }
      if (ok) res.push({ d, score });
    }
    res.sort((a, b) => b.score - a.score || a.d.slug.localeCompare(b.d.slug) || a.d.n - b.d.n);
    return res;
  }

  // фрагмент навколо першого збігу (з тез, якщо є, інакше з тексту сторінки), збіги — <mark>
  function snippet(d, ss) {
    const src = [d.raw, d.rawText || ''];
    for (const raw of src) {
      if (!raw) continue;
      const flat = raw.replace(/-\s*\n\s*/g, '').replace(/\s+/g, ' ');
      const low = norm(flat);
      let at = -1;
      for (const s of ss) {
        let i = low.indexOf(s);
        while (i > 0 && LETTER.test(low[i - 1])) i = low.indexOf(s, i + 1);
        if (i !== -1 && (at === -1 || i < at)) at = i;
      }
      if (at === -1) continue;
      const from = Math.max(0, at - 50), to = Math.min(flat.length, at + 110);
      let piece = (from ? '…' : '') + flat.slice(from, to) + (to < flat.length ? '…' : '');
      return markAll(esc(piece), ss);
    }
    return '';
  }

  // підсвітити збіги (початок слова + решта слова) у вже екранованому тексті
  function markAll(out, ss) {
    for (const s of ss) {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}'])(${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\p{L}'-]*)`, 'giu');
      out = out.replace(re, '$1<mark>$2</mark>');
    }
    return out;
  }

  const plural = (n, one, few, many) => {
    const a = n % 10, b = n % 100;
    return `${n} ${a === 1 && b !== 11 ? one : a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many}`;
  };

  function render(q) {
    const box = document.getElementById('srch-results');
    if (!box) return;
    const ss = stems(q);
    if (!ss.length) { box.hidden = true; box.innerHTML = ''; return; }
    if (!docs) { box.hidden = false; box.innerHTML = '<p class="srch-note">Завантажую підручники…</p>'; return; }
    const res = search(q);
    const subjects = new Set(res.map(r => r.d.slug)).size;
    const more = textReady ? '' : '<p class="srch-note srch-wait">Шукаю також у повному тексті сторінок…</p>';
    if (!res.length) {
      box.hidden = false;
      box.innerHTML = `<p class="srch-note">${textReady ? `Нічого не знайшлося за запитом «${esc(q.trim())}». Спробуй інше слово або коротшу форму.` : 'У тезах не знайшлося…'}</p>${more}`;
      return;
    }
    const top = res.slice(0, 40);
    box.hidden = false;
    box.innerHTML = `
      <p class="srch-count">Знайдено ${plural(res.length, 'сторінку', 'сторінки', 'сторінок')} у ${plural(subjects, 'підручнику', 'підручниках', 'підручниках')}${res.length > top.length ? ` · показано ${top.length} найкращих` : ''}</p>
      <ul class="srch-list" role="listbox" aria-label="Результати пошуку">
        ${top.map(({ d }, i) => `
          <li role="option" id="srch-opt-${i}" aria-selected="false">
            <a class="srch-item" href="#${d.slug}.${d.n}" style="--sc:${esc(d.color || 'var(--cy-c)')}" tabindex="-1">
              <span class="srch-meta"><b>${esc(d.subject)}</b><span>${d.label ? `с. ${esc(d.label)}` : 'обкладинка'}</span></span>
              ${d.title ? `<span class="srch-title">${markAll(esc(d.title), ss)}</span>` : ''}
              <span class="srch-snip">${snippet(d, ss)}</span>
            </a>
          </li>`).join('')}
      </ul>${more}`;
  }

  let timer = null, lastQ = '';
  function onInput(e) {
    const q = e.target.value;
    lastQ = q;
    document.querySelector('.cy-search')?.classList.toggle('has-q', !!q);
    clearTimeout(timer);
    timer = setTimeout(async () => {
      render(q);
      if (stems(q).length) {
        await loadTheses();
        if (lastQ === q) render(q);
        loadText().then(() => { if (lastQ === q) render(q); });
      }
    }, 180);
  }

  function html() {
    return `
      <section class="cy-search" role="search">
        <label class="srch-field">
          <span class="srch-ico" aria-hidden="true">🔍</span>
          <input type="search" id="srch-input" placeholder="Пошук по всіх підручниках — наприклад, «фотосинтез»"
                 autocomplete="off" spellcheck="false" aria-label="Пошук по всіх підручниках" aria-controls="srch-results">
          <kbd class="srch-kbd" aria-hidden="true">/</kbd>
        </label>
        <div class="srch-results" id="srch-results" hidden></div>
      </section>`;
  }

  // події — делеговано (головна перемальовується через innerHTML)
  document.addEventListener('focusin', e => { if (e.target.id === 'srch-input') loadTheses(); });
  document.addEventListener('input', e => { if (e.target.id === 'srch-input') onInput(e); });
  document.addEventListener('keydown', e => {
    const input = document.getElementById('srch-input');
    if (!input) return;
    // «/» — до поля пошуку (якщо не друкуємо в іншому полі)
    if (e.key === '/' && !e.target.closest('input, textarea, select, [contenteditable]')) {
      e.preventDefault(); input.focus(); input.select(); return;
    }
    if (e.target !== input && !e.target.closest('#srch-results')) return;
    const items = [...document.querySelectorAll('.srch-item')];
    const cur = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown' && items.length) { e.preventDefault(); items[Math.min(cur + 1, items.length - 1)].focus(); }
    else if (e.key === 'ArrowUp' && items.length) { e.preventDefault(); (cur <= 0 ? input : items[cur - 1]).focus(); }
    else if (e.key === 'Enter' && e.target === input && items.length) { e.preventDefault(); items[0].click(); }
    else if (e.key === 'Escape') { input.value = ''; onInput({ target: input }); input.focus(); }
  });

  window.Search = { html, search, stems };
})();
