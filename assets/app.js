/* Читалка підручників: вибір предмета → сторінка зліва, тези справа.
   Адреса: #<slug>.<сторінка> (лише літери/цифри/крапка/дефіс — так працює і на claude.ai, і на будь-якому хостингу). */
(() => {
  'use strict';
  const app = document.getElementById('app');
  const KIND = { cover: 'Обкладинка', toc: 'Зміст', text: 'Тема', exercises: 'Завдання', image: 'Ілюстрація', empty: 'Порожня сторінка', intro: 'Вступ', answers: 'Відповіді', index: 'Покажчик' };
  const state = { books: null, book: null, theses: {}, texts: null, page: 1, busy: false };
  const cache = new Map();
  // масштаб шрифту конспекту: кроки A−/A+, 1 = як у макеті
  const FS = [0.85, 1, 1.15, 1.3, 1.5, 1.75];

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('p8:' + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('p8:' + k, JSON.stringify(v)); } catch { /* приватний режим */ } },
  };
  const getJSON = async url => {
    if (!cache.has(url)) cache.set(url, fetch(url).then(r => { if (!r.ok) throw new Error(r.status + ' ' + url); return r.json(); }));
    try { return await cache.get(url); } catch (e) { cache.delete(url); throw e; }
  };
  const pageUrl = (slug, n) => `books/${slug}/pages/${String(n).padStart(4, '0')}.webp`;
  const ready = b => (b.pages || 0) > 0;
  // Номер, НАДРУКОВАНИЙ у книжці (page_offset/page_scale з scripts/page_labels.py); адреса й файли — за номером PDF.
  // page_scale 2 — PDF з розворотів: на одній сторінці PDF дві сторінки книжки («78–79»).
  const label = (b, i) => {
    if (b.page_offset == null) return String(i);
    const s = b.page_scale || 1, p = s * i - b.page_offset;
    if (p < 1) return '';
    return s === 2 ? `${p}–${p + 1}` : String(p);
  };
  const fromLabel = (b, x) => (b.page_offset == null ? x : Math.floor((x + b.page_offset) / (b.page_scale || 1)));
  const lastLabel = b => { const l = label(b, b.pages); return l.includes('–') ? l.split('–')[1] : l; };

  function parseHash() {
    const m = location.hash.slice(1).match(/^([a-z0-9-]+)(?:\.(\d+))?$/i);
    return m ? { slug: m[1], page: m[2] ? +m[2] : null } : null;
  }
  function go(slug, page) {
    const h = slug ? `#${slug}.${page}` : '#';
    if (location.hash !== h) history.replaceState(null, '', h === '#' ? location.pathname + location.search : h);
  }

  /* ---------- Вибір предмета: «Дія» × кіберпанк (макет design/landing-ideas/04a) ---------- */
  // неон — за групою предметів; невідома група — блакитний
  const NEON = { 'Мови й література': '#00f0ff', 'Математика': '#ff2bd6', 'Природничі науки': '#7dff4d', 'Суспільство': '#ffe14d', 'Технології': '#ff8a3d', "Мистецтво й здоров'я": '#b77dff' };
  const ICON = {
    'ukr-mova': '✍️', 'ukr-lit': '📖', 'zar-lit': '🌍', english: '💬', algebra: '➗', geometria: '📐',
    fizyka: '⚡', khimiia: '🧪', biolohiia: '🧬', heohrafiia: '🗺️', 'istoriia-ukr': '🏰', vsesvitnia: '🏛️',
    hromadianska: '🤝', pidpryiemnytstvo: '💰', informatyka: '💻', tekhnolohii: '🛠️', mystetstvo: '🎨', zdorovia: '🍎',
  };
  // знахідний відмінок для «Продовжимо …?» (з назвою в називному виходить «Продовжимо фізика?»)
  const ACC = {
    'ukr-mova': 'українську мову', 'ukr-lit': 'українську літературу', 'zar-lit': 'зарубіжну літературу', english: 'англійську',
    algebra: 'алгебру', geometria: 'геометрію', fizyka: 'фізику', khimiia: 'хімію', biolohiia: 'біологію', heohrafiia: 'географію',
    'istoriia-ukr': 'історію України', vsesvitnia: 'всесвітню історію', hromadianska: 'громадянську освіту',
    pidpryiemnytstvo: 'підприємництво', informatyka: 'інформатику', tekhnolohii: 'технології', mystetstvo: 'мистецтво', zdorovia: "«Здоров'я, безпека та добробут»",
  };
  const num = n => n.toLocaleString('uk-UA');

  // SR/KR modal
  const ROMAN = ['І','ІІ','ІІІ','IV','V','VI'];

  function showWorkModal(type) {
    if (document.getElementById('work-modal')) return;
    const subjects = state.books ? state.books.subjects : [];
    const modal = document.createElement('div');
    modal.id = 'work-modal';
    modal.className = 'auth-modal-overlay';
    document.body.appendChild(modal);

    const subjectOptions = subjects.map(s => `<option value="${s.slug}">${s.subject}</option>`).join('');
    const rangeHtml = type === 'sr'
      ? `<div class="pdf-cfg-group"><label>Параграф:<select id="wm-pf"></select></label></div>`
      : `<div class="pdf-cfg-group wm-range-row">
           <label>З параграфа:<select id="wm-pf"></select></label>
           <label>По параграф:<select id="wm-pt"></select></label>
         </div>`;

    modal.innerHTML = `
      <div class="auth-modal-backdrop" id="wm-bd"></div>
      <div class="auth-modal-box wm-box" role="dialog" aria-modal="true">
        <header class="auth-modal-head">
          <h3 class="auth-modal-title">${type==='sr'?'📝 Самостійні роботи (СР)':'📊 Контрольні роботи (КР)'}</h3>
          <button class="auth-modal-close" id="wm-close">✕</button>
        </header>
        <div class="auth-modal-body">
          <div class="pdf-cfg-group"><label>Предмет:<select id="wm-subj">${subjectOptions}</select></label></div>
          <div class="pdf-cfg-group">
            <label>Кількість варіантів:
              <div class="wm-variant-btns" id="wm-vbtns">
                ${ROMAN.map((r,i)=>`<button type="button" class="wm-vbtn${i===0?' active':''}" data-v="${i+1}">Варіант ${r}</button>`).join('')}
              </div>
            </label>
          </div>
          ${rangeHtml}
          <div class="wm-sliders">
            <div class="wm-slider-row">
              <span class="wm-sl-label">Класичні тести</span>
              <input type="range" id="sl-tests" min="0" max="100" value="70">
              <span class="wm-sl-val" id="sv-tests">70%</span>
            </div>
            <div class="wm-slider-row">
              <span class="wm-sl-label">Відповідність (1-А…)</span>
              <input type="range" id="sl-match" min="0" max="100" value="20">
              <span class="wm-sl-val" id="sv-match">20%</span>
            </div>
            <div class="wm-slider-row">
              <span class="wm-sl-label">Відкриті короткі</span>
              <input type="range" id="sl-open" min="0" max="100" value="10">
              <span class="wm-sl-val" id="sv-open">10%</span>
            </div>
            <div class="wm-slider-sum" id="wm-sum">Разом: 100%</div>
          </div>
          <div class="wm-hint">${type==='sr'
            ? '8–10 питань на варіант · один параграф'
            : '12 питань на варіант · діапазон параграфів'}</div>
          <button type="button" class="auth-submit-btn" id="wm-gen">⚡ Згенерувати</button>
          <div id="wm-preview"></div>
        </div>
      </div>`;

    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-modal-open');

    // --- close ---
    const close = () => { modal.remove(); document.body.classList.remove('auth-modal-open'); };
    document.getElementById('wm-close').addEventListener('click', close);
    document.getElementById('wm-bd').addEventListener('click', close);

    // --- variant count buttons ---
    let variantCount = 1;
    document.getElementById('wm-vbtns').addEventListener('click', e => {
      const btn = e.target.closest('.wm-vbtn');
      if (!btn) return;
      variantCount = +btn.dataset.v;
      document.querySelectorAll('.wm-vbtn').forEach(b => b.classList.toggle('active', b===btn));
    });

    // --- linked sliders (sum = 100) ---
    const sliders = [
      { el: document.getElementById('sl-tests'), val: document.getElementById('sv-tests') },
      { el: document.getElementById('sl-match'), val: document.getElementById('sv-match') },
      { el: document.getElementById('sl-open'),  val: document.getElementById('sv-open')  },
    ];
    const sumEl = document.getElementById('wm-sum');
    sliders.forEach((s, idx) => {
      s.el.addEventListener('input', () => {
        let v = +s.el.value;
        const others = sliders.filter((_,i) => i!==idx);
        const otherSum = others.reduce((a,o)=>a + +o.el.value, 0);
        if (v + otherSum > 100) {
          const excess = v + otherSum - 100;
          // distribute excess from others proportionally
          let left = excess;
          for (const o of others) {
            const cut = Math.min(+o.el.value, left);
            o.el.value = +o.el.value - cut;
            o.val.textContent = o.el.value + '%';
            left -= cut;
            if (!left) break;
          }
        }
        const total = sliders.reduce((a,o)=>a + +o.el.value, 0);
        sumEl.textContent = `Разом: ${total}%`;
        sumEl.style.color = total===100 ? '' : '#ff4d4d';
        s.val.textContent = v + '%';
      });
    });

    // --- load paragraphs ---
    const pfSel = document.getElementById('wm-pf');
    const ptSel = document.getElementById('wm-pt');
    const subjSel = document.getElementById('wm-subj');

    async function loadParagraphs(slug) {
      pfSel.innerHTML = '';
      if (ptSel) ptSel.innerHTML = '';
      try {
        const data = await (await fetch(`books/${slug}/theses.json`)).json();
        const pages = data.pages || {};
        const nums = [...new Set(Object.values(pages)
          .map(t => { const m = t.title&&t.title.match(/§\s*(\d+)/); return m?+m[1]:null; })
          .filter(Boolean))].sort((a,b)=>a-b);
        if (nums.length) {
          nums.forEach(n => {
            pfSel.add(new Option(`§ ${n}`, n));
            if (ptSel) ptSel.add(new Option(`§ ${n}`, n));
          });
          if (ptSel) ptSel.value = Math.min(nums[0]+4, nums[nums.length-1]);
        } else {
          const pc = state.books.subjects.find(s=>s.slug===slug)?.pages||200;
          for (let i=1;i<=pc;i+=20) {
            const end=Math.min(i+19,pc);
            pfSel.add(new Option(`с. ${i}`, i));
            if (ptSel) ptSel.add(new Option(`с. ${end}`, end));
          }
          if (ptSel) ptSel.value = Math.min(60,pc);
        }
      } catch {
        pfSel.add(new Option('—', 1));
      }
    }
    subjSel.addEventListener('change', () => loadParagraphs(subjSel.value));
    loadParagraphs(subjSel.value);

    // --- generate ---
    document.getElementById('wm-gen').addEventListener('click', async () => {
      const btn = document.getElementById('wm-gen');
      btn.disabled = true;
      btn.textContent = 'Генерую…';
      const slug = subjSel.value;
      const book = state.books.subjects.find(s=>s.slug===slug);
      const pFrom = +pfSel.value;
      const pTo = ptSel ? +ptSel.value : pFrom;
      let allTheses = {};
      try { allTheses = (await (await fetch(`books/${slug}/theses.json`)).json()).pages || {}; } catch {}

      const generated = [];
      for (let v=1; v<=variantCount; v++) {
        let qs;
        if (type==='sr') {
          // 8-10 questions, single paragraph
          const full = window.Quiz.genForRange(book, pFrom, pFrom, allTheses);
          const cnt = 8 + Math.floor(Math.random()*3);
          qs = full.slice(0, Math.min(cnt, full.length));
        } else {
          // exactly 12 questions, range
          qs = window.Quiz.genForRange(book, pFrom, pTo, allTheses);
        }
        generated.push({ label: `Варіант ${ROMAN[v-1]}`, questions: qs, pFrom, pTo });
      }

      btn.disabled = false;
      btn.textContent = '⚡ Згенерувати';

      // render preview
      const preview = document.getElementById('wm-preview');
      const tabs = generated.map((v,i) =>
        `<button class="wm-tab${i===0?' active':''}" data-vi="${i}">${v.label}</button>`).join('');
      const panels = generated.map((v,i) => {
        const qList = v.questions.map((q,qi) =>
          `<li class="wm-q"><span class="wm-qn">${qi+1}.</span> ${q.title}</li>`).join('');
        return `<div class="wm-panel${i===0?'':' hidden'}" data-vi="${i}">
          <ul class="wm-qlist">${qList}</ul>
          <div class="wm-panel-btns">
            <button class="wm-btn-quiz auth-submit-btn" data-vi="${i}">▶ Пройти цей варіант інтерактивно</button>
            <button class="wm-btn-pdf" data-vi="${i}">📄 Завантажити PDF</button>
          </div>
        </div>`;
      }).join('');

      preview.innerHTML = `<div class="wm-tabs">${tabs}</div><div class="wm-panels">${panels}</div>`;

      // tab switching
      preview.querySelectorAll('.wm-tab').forEach(t => {
        t.addEventListener('click', () => {
          preview.querySelectorAll('.wm-tab').forEach(x=>x.classList.remove('active'));
          preview.querySelectorAll('.wm-panel').forEach(x=>x.classList.add('hidden'));
          t.classList.add('active');
          preview.querySelector(`.wm-panel[data-vi="${t.dataset.vi}"]`).classList.remove('hidden');
        });
      });

      // quiz buttons
      preview.querySelectorAll('.wm-btn-quiz').forEach(b => {
        b.addEventListener('click', () => {
          const v = generated[+b.dataset.vi];
          if (type==='sr') window.Quiz.openSingleParagraphQuiz({book, paragraphFrom:v.pFrom, paragraphTo:v.pFrom, allTheses, rangeLabel:`§ ${v.pFrom}`});
          else window.Quiz.openRangeQuiz({book, paragraphFrom:v.pFrom, paragraphTo:v.pTo, allTheses, rangeLabel:`§ ${v.pFrom} – § ${v.pTo}`});
        });
      });

      // pdf buttons
      preview.querySelectorAll('.wm-btn-pdf').forEach(b => {
        b.addEventListener('click', () => {
          const v = generated[+b.dataset.vi];
          if (window.PdfExport) {
            window.PdfExport.openExportDialog({
              subject: book?.subject||'Підручник',
              title: `${type==='sr'?'СР':'КР'} – ${v.label}`,
              grade: '8 клас',
              questions: v.questions,
              includeAnswers: !!window.isTeacher?.()
            });
          }
        });
      });
    });
  }

  // Replace hub‑card click handler to open our modals
  function initHubHandlers(){
    document.querySelectorAll('.cy-hub-card').forEach(card=>{
      const hub = card.dataset.hub;
      if(hub==='sr') card.addEventListener('click',()=>showWorkModal('sr'));
      else if(hub==='kr') card.addEventListener('click',()=>showWorkModal('kr'));
      else card.addEventListener('click',()=>window.TeacherAuth?.openHubModal(hub));
    });
  }

  // Call after renderHome
  const originalRenderHome = renderHome;
  function renderHome(){
    originalRenderHome();
    initHubHandlers();
  }

    document.title = 'Підручники 8 клас';
    const all = state.books.subjects;
    const groups = new Map();
    for (const b of all) {
      if (!groups.has(b.group)) groups.set(b.group, []);
      groups.get(b.group).push(b);
    }
    const nReady = all.filter(ready).length;
    const nPages = all.reduce((s, b) => s + (b.pages || 0), 0);
    // остання відкрита книжка (state 'recent' пише show()); закладка на обкладинці — теж закладка
    const rb = all.find(b => b.slug === store.get('recent') && ready(b));
    const rp = rb && Math.min(store.get('last:' + rb.slug) || 1, rb.pages);
    const hello = rb
      ? `<div><div class="cy-sys">// система готова · ${nReady} підручників · ${num(nPages)} сторінок</div>
          <h2>Привіт! Продовжимо <span>${esc(ACC[rb.slug] || rb.subject)}</span>?<i class="cy-cur" aria-hidden="true"></i></h2>
          <p>${label(rb, rp) ? `Закладка на сторінці ${label(rb, rp)} з ${lastLabel(rb)}.` : 'Закладка на початку книжки.'} Тези вже чекають поруч.</p>
          <div class="cy-bar" role="progressbar" aria-label="Прочитано" aria-valuemin="0" aria-valuemax="${rb.pages}" aria-valuenow="${rp}"><i style="width:${Math.round(rp / rb.pages * 100)}%"></i></div></div>
        <button class="cy-go" data-slug="${esc(rb.slug)}">Продовжити →</button>`
      : `<div><div class="cy-sys">// система готова · ${nReady} з ${all.length} підручників · ${num(nPages)} сторінок</div>
          <h2>Привіт! Обери <span>предмет</span><i class="cy-cur" aria-hidden="true"></i></h2>
          <p>Ліворуч сторінка підручника, праворуч короткі тези саме цієї сторінки.</p></div>
        <button class="cy-go" id="to-list">До предметів ↓</button>`;
    const isTeacher = !!window.isTeacher?.();
    app.innerHTML = `
      <main class="cy">
        <div class="cy-sky" aria-hidden="true"></div><div class="cy-floor" aria-hidden="true"></div>
        <div class="cy-wrap">
          <header class="cy-top">
            <h1>Підручники</h1>
            <span class="cy-lv">${state.books.grade} клас</span>
            <button class="cy-teacher-btn ${isTeacher ? 'authorized' : ''}" id="btn-teacher-top" type="button" title="${isTeacher ? 'Кабінет вчителя (авторизовано)' : 'Вхід для вчителя'}">
              <span class="t-ico" aria-hidden="true">👩‍🏫</span>
              <span class="t-txt">${isTeacher ? 'Вчитель ✓' : 'Вхід для вчителя'}</span>
            </button>
            <span class="cy-me" aria-hidden="true">${state.books.grade}</span>
          </header>
          <section class="cy-hello">${hello}</section>
          
          <!-- 4 ключові розділи контролю знань (хаби) -->
          <section class="cy-hubs" aria-label="Розділи оцінювання та контролю знань">
            <div class="cy-hubs-grid">
              <button type="button" class="cy-hub-card active" data-hub="tests" style="--hub-c: #00f0ff;">
                <div class="cy-hub-head">
                  <span class="cy-hub-ico" aria-hidden="true">⚡</span>
                  <span class="cy-hub-badge ready">Активно</span>
                </div>
                <h4 class="cy-hub-title">Тести</h4>
                <p class="cy-hub-desc">12 інтерактивних запитань до кожної сторінки конспекту</p>
                <div class="cy-hub-foot">
                  <span>18 предметів</span>
                  <span class="cy-arr" aria-hidden="true">→</span>
                </div>
              </button>

              <button type="button" class="cy-hub-card" data-hub="sr" style="--hub-c: #7dff4d;">
                <div class="cy-hub-head">
                  <span class="cy-hub-ico" aria-hidden="true">📝</span>
                  <span class="cy-hub-badge active">Активно</span>
                </div>
                <h4 class="cy-hub-title">Самостійні роботи (СР)</h4>
                <p class="cy-hub-desc">Тренувальні та діагностичні завдання за темами програми</p>
                <div class="cy-hub-foot">
                  <span>Завдання та PDF</span>
                  <span class="cy-arr" aria-hidden="true">→</span>
                </div>
              </button>

              <button type="button" class="cy-hub-card" data-hub="kr" style="--hub-c: #ff2bd6;">
                <div class="cy-hub-head">
                  <span class="cy-hub-ico" aria-hidden="true">📊</span>
                  <span class="cy-hub-badge active">Активно</span>
                </div>
                <h4 class="cy-hub-title">Контрольні роботи (КР)</h4>
                <p class="cy-hub-desc">Тематичні та семестрові зрізи знань для оцінювання</p>
                <div class="cy-hub-foot">
                  <span>Оцінювання</span>
                  <span class="cy-arr" aria-hidden="true">→</span>
                </div>
              </button>

              <button type="button" class="cy-hub-card" data-hub="exams" style="--hub-c: #ffe14d;">
                <div class="cy-hub-head">
                  <span class="cy-hub-ico" aria-hidden="true">🎓</span>
                  <span class="cy-hub-badge active">Активно</span>
                </div>
                <h4 class="cy-hub-title">Екзамени</h4>
                <p class="cy-hub-desc">Підсумкова річна атестація та комплексні зрізи</p>
                <div class="cy-hub-foot">
                  <span>Підсумкові зрізи</span>
                  <span class="cy-arr" aria-hidden="true">→</span>
                </div>
              </button>
            </div>
          </section>

          ${[...groups].map(([g, list], i) => `
            <section class="cy-group" style="--n:${NEON[g] || '#00f0ff'}" aria-label="${esc(g)}"${i ? '' : ' id="list"'}>
              <h3>${esc(g)}</h3>
              <div class="cy-grid">
                ${list.map(b => {
                  const last = store.get('last:' + b.slug);
                  const meta = ready(b)
                    ? `<span>${b.pages} с. · тези</span>${b.demo ? '<span class="demo">демо</span>' : ''}${last > 1 && label(b, last) ? `<span class="res">▶ с. ${label(b, last)}</span>` : ''}`
                    : `<span>${esc(b.note || 'чекає на PDF')}</span>`;
                  return `<button class="cy-card" data-slug="${esc(b.slug)}" ${ready(b) ? '' : 'disabled'}>
                      <span class="cy-ico" aria-hidden="true">${ICON[b.slug] || '📘'}</span>
                      <span><b>${esc(b.subject)}</b><span class="cy-meta">${meta}</span></span>
                      <span class="cy-arr" aria-hidden="true">→</span>
                    </button>`;
                }).join('')}
              </div>
            </section>`).join('')}
        </div>
      </main>`;
    app.querySelectorAll('.cy-card:not([disabled]), .cy-go[data-slug]').forEach(el =>
      el.addEventListener('click', () => openBook(el.dataset.slug)));
    document.getElementById('to-list')?.addEventListener('click', () => document.getElementById('list').scrollIntoView({ behavior: 'smooth' }));
    document.getElementById('btn-teacher-top')?.addEventListener('click', () => window.TeacherAuth?.openAuthModal());
    // hub handlers overridden by initHubHandlers
//      card.addEventListener('click', () => window.TeacherAuth?.openHubModal(card.dataset.hub));
    });
  }

  /* ---------- Читалка ---------- */
  async function openBook(slug, page) {
    const b = state.books.subjects.find(x => x.slug === slug);
    if (!b || !ready(b)) { go(); renderHome(); return; }
    state.book = b; state.texts = null;
    state.page = Math.min(Math.max(page || store.get('last:' + slug) || 1, 1), b.pages);
    try { state.theses = (await getJSON(`books/${slug}/theses.json`)).pages || {}; } catch { state.theses = {}; }
    renderReader();
  }

  function renderReader() {
    const b = state.book;
    const isTeacher = !!window.isTeacher?.();
    document.title = `${b.subject} · 8 клас`;
    app.innerHTML = `
      <div class="reader" style="--n:${NEON[b.group] || '#00f0ff'}">
        <div class="cy-sky" aria-hidden="true"></div>
        <header class="bar">
          <button class="back" id="back" title="До списку предметів">← Предмети</button>
          <div class="title"><span class="dot"></span><b>${esc(b.title || b.subject)}</b></div>
          <button class="cy-teacher-btn compact ${isTeacher ? 'authorized' : ''}" id="btn-teacher-reader" type="button" title="${isTeacher ? 'Кабінет вчителя (авторизовано)' : 'Вхід для вчителя'}">
            <span class="t-ico" aria-hidden="true">👩‍🏫</span>
            <span class="t-txt">${isTeacher ? 'Вчитель ✓' : 'Вчитель'}</span>
          </button>
          <nav class="pager" aria-label="Сторінки">
            <button id="prev" aria-label="Попередня сторінка">‹</button>
            <input id="pnum" type="text" inputmode="numeric" aria-label="Номер сторінки, як надруковано в підручнику">
            <span class="of">з ${lastLabel(b)}</span>
            <button id="next" aria-label="Наступна сторінка">›</button>
          </nav>
        </header>
        <div class="split">
          <section class="stage" id="stage" aria-label="Сторінка підручника">
            <div class="sheet" id="sheet"><img id="img" alt=""></div>
            <button class="hit l" id="hitl" aria-label="Попередня сторінка"></button>
            <button class="hit r" id="hitr" aria-label="Наступна сторінка"></button>
            <div class="stage-tools"><button id="zoom">Збільшити</button></div>
          </section>
          <aside class="notebook" id="notes" aria-label="Конспект сторінки">
            <button class="nb-toggle" id="nbtoggle" aria-controls="nbbody"><i aria-hidden="true">‹</i><span>Конспект</span></button>
            <div id="nbbody" aria-live="polite"></div>
          </aside>
        </div>
      </div>`;
    const $ = id => document.getElementById(id);
    $('back').onclick = () => { go(); renderHome(); };
    $('btn-teacher-reader')?.addEventListener('click', () => window.TeacherAuth?.openAuthModal());
    $('prev').onclick = $('hitl').onclick = () => turn(-1);
    $('next').onclick = $('hitr').onclick = () => turn(1);
    $('pnum').onchange = e => { const x = parseInt(e.target.value, 10); show(Number.isFinite(x) ? fromLabel(b, x) : state.page, 0); };
    // конспект: згорнути/розгорнути (лишається смужка-поле, по якій його відкривають знову) і розмір шрифту
    $('nbtoggle').onclick = () => { store.set('nbClosed', !store.get('nbClosed')); applyNotebook(); };
    $('notes').addEventListener('click', e => {
      const btn = e.target.closest('[data-fs]');
      if (!btn) return;
      const i = Math.min(Math.max(fsIndex() + +btn.dataset.fs, 0), FS.length - 1);
      store.set('nbFont', FS[i]);
      applyNotebook();
    });
    applyNotebook();
    $('zoom').onclick = () => {
      const z = $('stage').classList.toggle('zoom');
      $('zoom').textContent = z ? 'Вмістити' : 'Збільшити';
    };
    // свайп на телефоні
    let x0 = null, y0 = null;
    $('stage').addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    $('stage').addEventListener('touchend', e => {
      if (x0 == null || $('stage').classList.contains('zoom')) return;
      const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1);
      x0 = null;
    }, { passive: true });
    show(state.page, 0);
  }

  function turn(d) { show(state.page + d, d); }

  function fsIndex() { const i = FS.indexOf(store.get('nbFont')); return i < 0 ? FS.indexOf(1) : i; }

  // стан конспекту з localStorage → класи/атрибути; викликається після кожного renderNotes (кнопки A−/A+ перемальовуються)
  function applyNotebook() {
    const el = document.getElementById('notes');
    if (!el) return;
    const closed = !!store.get('nbClosed'), i = fsIndex();
    el.closest('.split').classList.toggle('nb-closed', closed);
    el.classList.toggle('closed', closed);
    el.style.setProperty('--nb-fs', FS[i]);
    const t = document.getElementById('nbtoggle');
    t.setAttribute('aria-expanded', String(!closed));
    t.title = closed ? 'Показати конспект' : 'Сховати конспект';
    t.setAttribute('aria-label', t.title);
    el.querySelectorAll('[data-fs]').forEach(b => { b.disabled = +b.dataset.fs < 0 ? i === 0 : i === FS.length - 1; });
    const pct = el.querySelector('.nb-font');
    if (pct) pct.title = `Шрифт конспекту: ${Math.round(FS[i] * 100)}%`;
  }

  function show(n, dir) {
    const b = state.book;
    n = Math.min(Math.max(n, 1), b.pages);
    const img = document.getElementById('img');
    if (!img) return;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (dir && n !== state.page && img.complete && img.naturalWidth && !reduce) {
      // стара сторінка перегортається поверх нової
      document.querySelectorAll('.flip').forEach(f => f.remove());
      const flip = document.createElement('div');
      flip.className = 'flip ' + (dir > 0 ? 'next' : 'prev');
      flip.innerHTML = `<img src="${img.src}" alt="">`;
      document.getElementById('sheet').appendChild(flip);
      flip.addEventListener('animationend', () => flip.remove());
    }
    state.page = n;
    img.src = pageUrl(b.slug, n);
    const lb = label(b, n);
    img.alt = `${b.subject}, сторінка ${lb || n}`;
    const pn = document.getElementById('pnum');
    pn.value = lb;
    pn.placeholder = lb ? '' : 'обкл.';
    document.getElementById('prev').disabled = n <= 1;
    document.getElementById('next').disabled = n >= b.pages;
    store.set('last:' + b.slug, n);
    store.set('recent', b.slug);
    go(b.slug, n);
    renderNotes();
    for (const k of [n + 1, n + 2, n - 1]) if (k >= 1 && k <= b.pages) new Image().src = pageUrl(b.slug, k);
  }

  function renderNotes() {
    const el = document.getElementById('nbbody');
    const n = state.page, t = state.theses[String(n)], lb = label(state.book, n);
    let html = `<div class="nb-page${lb.includes("–") ? " wide" : ""}" aria-label="Сторінка ${lb || n}">${lb || '·'}</div>`;
    const font = `<span class="nb-font" role="group" aria-label="Розмір шрифту конспекту">
        <button data-fs="-1" aria-label="Зменшити шрифт конспекту">A−</button><button data-fs="1" aria-label="Збільшити шрифт конспекту">A+</button></span>`;
    if (!t) {
      html += `<div class="nb-head">${font}</div>`;
      html += `<div class="empty"><b>Тез ще немає</b><span>Для сторінки ${lb || n} конспект ще не згенеровано. Сторінку можна читати зліва.</span></div>`;
    } else {
      if (window.Quiz && window.Quiz.hasQuestions(t, state.book, state.page)) {
        html += `<button class="nb-margin-quiz" id="btn-quiz-launch" type="button" aria-label="Пройти тест до сторінки (12 питань)" title="Пройти тест (12 питань)">
          <span class="nb-mq-ico" aria-hidden="true">⚡</span>
          <span class="nb-mq-txt">ТЕСТ</span>
          <span class="nb-mq-cnt">12</span>
        </button>`;
      }
      html += `<div class="nb-head"><span class="nb-kind">${esc(KIND[t.kind] || 'Сторінка')}</span>${font}</div>`;
      if (t.title) html += `<h2>${esc(t.title)}</h2>`;
      if (t.points?.length) html += `<ul class="points">${t.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`;
      if (t.formulas?.length) html += `<h3>Формули</h3>${t.formulas.map(f => `<div class="formula">${esc(f)}</div>`).join(' ')}`;
      if (t.terms?.length) html += `<h3>Запам'ятай</h3><dl class="terms">${t.terms.map(x => `<div><dt>${esc(x.term)}</dt><dd>${esc(x.def)}</dd></div>`).join('')}</dl>`;
      if (t.example) html += `<h3>Приклад</h3><p class="example">${esc(t.example)}</p>`;
    }
    html += `<details class="raw" id="raw"><summary>Текст сторінки</summary><pre id="rawtext">…</pre></details>`;
    el.innerHTML = html;
    document.getElementById('notes').scrollTop = 0;
    applyNotebook();
    const triggerQuiz = () => {
      if (window.Quiz) {
        window.Quiz.open({
          book: state.book,
          page: state.page,
          pageLabel: lb || String(state.page),
          theses: state.theses,
          onNextPage: () => turn(1)
        });
      }
    };
    document.getElementById('btn-quiz-launch')?.addEventListener('click', triggerQuiz);
    document.getElementById('raw').addEventListener('toggle', async e => {
      if (!e.target.open) return;
      try {
        state.texts ??= await getJSON(`books/${state.book.slug}/text.json`);
        document.getElementById('rawtext').textContent = state.texts[String(state.page)] || '(на сторінці немає текстового шару — скан або малюнок)';
      } catch { document.getElementById('rawtext').textContent = 'Не вдалося завантажити текст сторінки.'; }
    });
  }

  document.addEventListener('keydown', e => {
    if (!state.book || !document.getElementById('img') || e.target.closest('input, textarea')) return;
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { turn(1); e.preventDefault(); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { turn(-1); e.preventDefault(); }
    else if (e.key === 'Home') show(1, -1);
    else if (e.key === 'End') show(state.book.pages, 1);
  });

  function route() {
    const raw = location.hash.slice(1);
    if (['tests', 'sr', 'kr', 'exams', 'hub-tests', 'hub-sr', 'hub-kr', 'hub-exams'].includes(raw)) {
      state.book = null;
      renderHome();
      const k = raw.replace('hub-', '');
      window.TeacherAuth?.openHubModal(k);
      return;
    }
    const h = parseHash();
    if (h) openBook(h.slug, h.page); else { state.book = null; renderHome(); }
  }

  getJSON('books.json').then(data => { state.books = data; route(); })
    .catch(() => { app.innerHTML = '<p class="loading">Не вдалося завантажити список предметів (books.json). Оновіть сторінку.</p>'; });
  window.addEventListener('hashchange', () => { if (state.books) route(); });
})();

/* Неоновий курсор — варіант 03 «Неоновий хвіст» з design/cursor-ideas.
   Лише миша (hover + точний вказівник); у полях вводу — звичайна каретка;
   «менше руху» в системі — без хвоста, лише точка. Кадри малюються, тільки поки хвіст не згас. */
(() => {
  'use strict';
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const HOT = 'a, button, [role="button"], summary, label, .hit';
  const NATIVE = 'input, textarea, select, [contenteditable="true"]';
  const cv = document.createElement('canvas');
  cv.className = 'neon-cursor'; cv.setAttribute('aria-hidden', 'true');
  document.body.append(cv);
  document.documentElement.classList.add('has-neon-cursor');
  const g = cv.getContext('2d');
  const pts = [];
  let x = 0, y = 0, on = false, hot = false, native = false, still = 0, raf = 0;

  // присвоєння canvas.width стирає малюнок — міняти розмір лише коли він справді інший
  const fit = () => {
    const r = devicePixelRatio || 1, w = Math.round(innerWidth * r), h = Math.round(innerHeight * r);
    if (cv.width === w && cv.height === h) return;
    cv.width = w; cv.height = h; g.setTransform(r, 0, 0, r, 0, 0); wake();
  };
  const wake = () => { if (!raf) raf = requestAnimationFrame(frame); };

  function frame() {
    raf = 0;
    const max = reduce.matches ? 1 : 22;
    g.clearRect(0, 0, innerWidth, innerHeight);
    if (!on || native) { pts.length = 0; return; }          // над полем вводу — системна каретка
    pts.push({ x, y });
    while (pts.length > max) pts.shift();
    g.lineCap = 'round';
    for (let i = 1; i < pts.length; i++) {                  // хвіст: від рожевого (старе) до блакитного (нове)
      const k = i / pts.length;
      g.strokeStyle = `rgba(${Math.round(255 * (1 - k))}, ${Math.round(43 + 197 * k)}, ${Math.round(214 + 41 * k)}, ${k})`;
      g.lineWidth = 1 + 5 * k; g.shadowBlur = 12 * k; g.shadowColor = g.strokeStyle;
      g.beginPath(); g.moveTo(pts[i - 1].x, pts[i - 1].y); g.lineTo(pts[i].x, pts[i].y); g.stroke();
    }
    g.shadowBlur = 14; g.shadowColor = '#00f0ff'; g.fillStyle = hot ? '#ff2bd6' : '#eaffff';
    g.beginPath(); g.arc(x, y, hot ? 5 : 3.5, 0, Math.PI * 2); g.fill();
    if (still++ < max + 2) wake();                          // миша стоїть — хвіст догасає й цикл засинає
  }

  fit();
  addEventListener('resize', fit);
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY; on = true; still = 0;
    const t = e.target instanceof Element ? e.target : null;
    native = !!t?.closest(NATIVE); hot = !native && !!t?.closest(HOT);
    wake();
  }, { passive: true });
  document.documentElement.addEventListener('mouseleave', () => { on = false; wake(); });
})();
