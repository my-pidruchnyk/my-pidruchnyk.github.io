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
  const WM_ROMAN = ['І','ІІ','ІІІ','IV','V','VI'];

  /* ---- Модал Екзамени (Крок 4) ---- */
  function showExamsModal() {
    if (document.getElementById('em-overlay')) return;
    const subjects = state.books.subjects;
    const overlay = document.createElement('div');
    overlay.id = 'em-overlay';
    overlay.className = 'auth-modal-overlay';
    document.body.appendChild(overlay);

    // Початково обрані популярні предмети
    const defaultSelected = ['algebra', 'heohrafiia', 'fizyka'];

    overlay.innerHTML = `
      <div class="auth-modal-backdrop" id="em-bd"></div>
      <div class="auth-modal-box em-box" role="dialog" aria-modal="true" aria-labelledby="em-title">
        <header class="auth-modal-head">
          <h3 id="em-title" class="auth-modal-title">🎓 Конструктор комплексних екзаменів</h3>
          <button type="button" class="auth-modal-close" id="em-close" aria-label="Закрити">✕</button>
        </header>
        <div class="auth-modal-body">
          <!-- 1. Мультиселект предметів -->
          <div class="em-section">
            <label class="em-sec-lbl">Оберіть предмети для екзамену (від 1 до кількох):</label>
            <div class="em-subj-chips" id="em-subj-chips">
              ${subjects.map(s => {
                const checked = defaultSelected.includes(s.slug);
                return `
                  <label class="em-chip${checked ? ' active' : ''}">
                    <input type="checkbox" value="${s.slug}" ${checked ? 'checked' : ''}>
                    <span>${esc(s.subject)}</span>
                  </label>
                `;
              }).join('')}
            </div>
          </div>

          <!-- 2. Ваги предметів (%) з автобалансом до 100% -->
          <div class="em-section">
            <div class="em-sec-head">
              <label class="em-sec-lbl">Розподіл предметних блоків (% питань):</label>
              <span class="em-sum-badge" id="em-weight-sum">Разом: 100%</span>
            </div>
            <div class="em-weights-list" id="em-weights-list"></div>
          </div>

          <!-- 3. Налаштування обсягу та варіантів -->
          <div class="em-cfg-grid">
            <div class="em-cfg-item">
              <label class="em-field-lbl" for="em-total-q">Обсяг запитань у варіанті:</label>
              <select id="em-total-q" class="em-select">
                <option value="20">20 запитань</option>
                <option value="21">21 запитання</option>
                <option value="24" selected>24 запитання (оптимально)</option>
                <option value="25">25 запитань</option>
              </select>
            </div>
            <div class="em-cfg-item">
              <span class="em-field-lbl">Кількість варіантів:</span>
              <div class="wm-vbtns" id="em-vbtns">
                ${WM_ROMAN.slice(0, 4).map((r, i) => `<button type="button" class="wm-vbtn${i === 0 ? ' active' : ''}" data-v="${i + 1}">Варіант ${r}</button>`).join('')}
              </div>
            </div>
          </div>

          <!-- 4. Охоплення параграфів за кожним предметом -->
          <div class="em-section">
            <label class="em-sec-lbl">Охоплення навчального матеріалу:</label>
            <div class="em-ranges-list" id="em-ranges-list"></div>
          </div>

          <!-- 5. Типи завдань -->
          <div class="em-section">
            <div class="em-sec-head">
              <label class="em-sec-lbl">Співвідношення типів завдань:</label>
              <span class="em-sum-badge" id="em-types-sum">Разом: 100%</span>
            </div>
            <div class="wm-sliders">
              <div class="wm-slider-row">
                <span class="wm-sl-lbl">Тести (вибір 1 з 4)</span>
                <input type="range" id="em-sl-t" min="0" max="100" value="70">
                <span class="wm-sl-val" id="em-sv-t">70%</span>
              </div>
              <div class="wm-slider-row">
                <span class="wm-sl-lbl">Відповідність (1-А, 2-Б…)</span>
                <input type="range" id="em-sl-m" min="0" max="100" value="20">
                <span class="wm-sl-val" id="em-sv-m">20%</span>
              </div>
              <div class="wm-slider-row">
                <span class="wm-sl-lbl">Відкриті (коротке слово/число)</span>
                <input type="range" id="em-sl-o" min="0" max="100" value="10">
                <span class="wm-sl-val" id="em-sv-o">10%</span>
              </div>
            </div>
          </div>

          <button type="button" class="auth-submit-btn" id="em-gen">⚡ Згенерувати екзамен</button>
          <div id="em-preview"></div>
        </div>
      </div>
    `;

    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-modal-open');

    const close = () => { overlay.remove(); document.body.classList.remove('auth-modal-open'); };
    document.getElementById('em-close').addEventListener('click', close);
    document.getElementById('em-bd').addEventListener('click', close);

    // Кількість варіантів
    let variantCount = 1;
    document.getElementById('em-vbtns').addEventListener('click', e => {
      const btn = e.target.closest('.wm-vbtn');
      if (!btn) return;
      variantCount = +btn.dataset.v;
      document.querySelectorAll('#em-vbtns .wm-vbtn').forEach(b => b.classList.toggle('active', b === btn));
    });

    // Слайдери типів завдань (автобаланс до 100%)
    const TYPE_SL = [
      { el: document.getElementById('em-sl-t'), val: document.getElementById('em-sv-t') },
      { el: document.getElementById('em-sl-m'), val: document.getElementById('em-sv-m') },
      { el: document.getElementById('em-sl-o'), val: document.getElementById('em-sv-o') },
    ];
    const typeSumEl = document.getElementById('em-types-sum');
    TYPE_SL.forEach((s, idx) => {
      s.el.addEventListener('input', () => {
        const others = TYPE_SL.filter((_, i) => i !== idx);
        let excess = TYPE_SL.reduce((a, o) => a + +o.el.value, 0) - 100;
        if (excess > 0) {
          for (const o of others) {
            const cut = Math.min(+o.el.value, excess);
            o.el.value = +o.el.value - cut;
            o.val.textContent = o.el.value + '%';
            excess -= cut;
            if (excess <= 0) break;
          }
        }
        s.val.textContent = s.el.value + '%';
        const total = TYPE_SL.reduce((a, o) => a + +o.el.value, 0);
        typeSumEl.textContent = `Разом: ${total}%`;
        typeSumEl.style.color = total === 100 ? '' : '#ff4d4d';
      });
    });

    // Обрані предмети та їх ваги
    let selectedSlugs = [...defaultSelected];
    let subjectWeights = {};
    const equalShare = Math.floor(100 / selectedSlugs.length);
    selectedSlugs.forEach((slug, i) => {
      subjectWeights[slug] = i === 0 ? 100 - equalShare * (selectedSlugs.length - 1) : equalShare;
    });

    // Кеш завантажених тез
    const thesesCache = {};
    async function getBookTheses(slug) {
      if (thesesCache[slug]) return thesesCache[slug];
      try {
        const res = await fetch(`books/${slug}/theses.json`);
        thesesCache[slug] = (await res.json()).pages || {};
      } catch {
        thesesCache[slug] = {};
      }
      return thesesCache[slug];
    }

    // Рендер повзунків ваги предметів та селекторів охоплення
    async function updateSubjectControls() {
      const weightsList = document.getElementById('em-weights-list');
      const rangesList = document.getElementById('em-ranges-list');
      const weightSumEl = document.getElementById('em-weight-sum');

      if (selectedSlugs.length === 0) {
        weightsList.innerHTML = '<p class="em-empty-notice">⚠️ Будь ласка, оберіть хоча б один предмет вище.</p>';
        rangesList.innerHTML = '<p class="em-empty-notice">Немає обраних предметів.</p>';
        weightSumEl.textContent = 'Разом: 0%';
        return;
      }

      // Перевірка та балансування ваг
      const slugsWithWeights = selectedSlugs.filter(s => subjectWeights[s] != null);
      if (slugsWithWeights.length !== selectedSlugs.length) {
        const share = Math.floor(100 / selectedSlugs.length);
        selectedSlugs.forEach((s, idx) => {
          subjectWeights[s] = idx === 0 ? 100 - share * (selectedSlugs.length - 1) : share;
        });
      }

      // 1. Повзунки ваги
      weightsList.innerHTML = selectedSlugs.map(slug => {
        const b = subjects.find(s => s.slug === slug);
        const w = subjectWeights[slug] ?? 0;
        return `
          <div class="em-weight-row" data-slug="${slug}">
            <div class="em-weight-info">
              <span class="em-weight-title">${esc(b ? b.subject : slug)}</span>
              <span class="em-weight-val" id="em-wv-${slug}">${w}%</span>
            </div>
            <input type="range" class="em-weight-slider" data-slug="${slug}" min="5" max="100" value="${w}">
          </div>
        `;
      }).join('');

      // Прив'язка подій до повзунків ваги предметів з автобалансом
      weightsList.querySelectorAll('.em-weight-slider').forEach(slider => {
        slider.addEventListener('input', () => {
          const changedSlug = slider.dataset.slug;
          const newVal = +slider.value;
          subjectWeights[changedSlug] = newVal;
          document.getElementById(`em-wv-${changedSlug}`).textContent = newVal + '%';

          const otherSlugs = selectedSlugs.filter(s => s !== changedSlug);
          if (otherSlugs.length > 0) {
            let otherSum = otherSlugs.reduce((sum, s) => sum + (subjectWeights[s] || 0), 0);
            const targetOtherSum = 100 - newVal;
            if (otherSum <= 0) {
              const even = Math.floor(targetOtherSum / otherSlugs.length);
              otherSlugs.forEach((s, idx) => {
                subjectWeights[s] = idx === 0 ? targetOtherSum - even * (otherSlugs.length - 1) : even;
              });
            } else {
              const ratio = targetOtherSum / otherSum;
              let accumulated = 0;
              otherSlugs.forEach((s, idx) => {
                if (idx === otherSlugs.length - 1) {
                  subjectWeights[s] = Math.max(0, targetOtherSum - accumulated);
                } else {
                  const val = Math.max(0, Math.round(subjectWeights[s] * ratio));
                  subjectWeights[s] = val;
                  accumulated += val;
                }
              });
            }
            // Оновлюємо відображення інших повзунків
            otherSlugs.forEach(s => {
              const slEl = weightsList.querySelector(`.em-weight-slider[data-slug="${s}"]`);
              const valEl = document.getElementById(`em-wv-${s}`);
              if (slEl) slEl.value = subjectWeights[s];
              if (valEl) valEl.textContent = subjectWeights[s] + '%';
            });
          }

          const totalWeight = selectedSlugs.reduce((sum, s) => sum + (subjectWeights[s] || 0), 0);
          weightSumEl.textContent = `Разом: ${totalWeight}%`;
          weightSumEl.style.color = totalWeight === 100 ? '' : '#ff4d4d';
        });
      });

      // 2. Селектори охоплення параграфів
      rangesList.innerHTML = selectedSlugs.map(slug => {
        const b = subjects.find(s => s.slug === slug);
        return `
          <div class="em-range-row" data-slug="${slug}">
            <span class="em-range-subj">${esc(b ? b.subject : slug)}:</span>
            <div class="em-range-controls">
              <label class="em-range-mode">
                <input type="radio" name="range-mode-${slug}" value="all" checked>
                <span>Весь підручник</span>
              </label>
              <label class="em-range-mode">
                <input type="radio" name="range-mode-${slug}" value="custom">
                <span>Діапазон §</span>
              </label>
              <div class="em-custom-range em-hidden" id="em-cr-${slug}">
                <select class="em-pf" id="em-pf-${slug}"></select>
                <span>—</span>
                <select class="em-pt" id="em-pt-${slug}"></select>
              </div>
            </div>
          </div>
        `;
      }).join('');

      // Завантаження параграфів для кожного обраного предмета
      for (const slug of selectedSlugs) {
        const theses = await getBookTheses(slug);
        const pf = document.getElementById(`em-pf-${slug}`);
        const pt = document.getElementById(`em-pt-${slug}`);
        if (!pf || !pt) continue;

        const nums = [...new Set(
          Object.values(theses)
            .map(t => { const m = t.title && t.title.match(/§\s*(\d+)/); return m ? +m[1] : null; })
            .filter(Boolean)
        )].sort((a, b) => a - b);

        if (nums.length > 0) {
          nums.forEach(n => {
            pf.add(new Option(`§ ${n}`, n));
            pt.add(new Option(`§ ${n}`, n));
          });
          pt.value = nums[nums.length - 1];
        } else {
          const b = subjects.find(s => s.slug === slug);
          const pc = b?.pages || 200;
          for (let p = 1; p <= pc; p += 20) {
            const end = Math.min(p + 19, pc);
            pf.add(new Option(`с. ${p}`, p));
            pt.add(new Option(`с. ${end}`, end));
          }
          pt.value = Math.min(60, pc);
        }

        // Перемикач радіокнопок весь / діапазон
        const crBox = document.getElementById(`em-cr-${slug}`);
        const radioModes = rangesList.querySelectorAll(`input[name="range-mode-${slug}"]`);
        radioModes.forEach(r => {
          r.addEventListener('change', () => {
            crBox?.classList.toggle('em-hidden', r.value !== 'custom');
          });
        });
      }

      const totalWeight = selectedSlugs.reduce((sum, s) => sum + (subjectWeights[s] || 0), 0);
      weightSumEl.textContent = `Разом: ${totalWeight}%`;
    }

    // Обробка зміни чекбоксів предметів
    document.getElementById('em-subj-chips').addEventListener('change', e => {
      const chk = e.target.closest('input[type="checkbox"]');
      if (!chk) return;
      const slug = chk.value;
      chk.closest('.em-chip')?.classList.toggle('active', chk.checked);

      if (chk.checked) {
        if (!selectedSlugs.includes(slug)) selectedSlugs.push(slug);
      } else {
        selectedSlugs = selectedSlugs.filter(s => s !== slug);
        delete subjectWeights[slug];
      }

      // Перераховуємо ваги
      if (selectedSlugs.length > 0) {
        const share = Math.floor(100 / selectedSlugs.length);
        selectedSlugs.forEach((s, idx) => {
          subjectWeights[s] = idx === 0 ? 100 - share * (selectedSlugs.length - 1) : share;
        });
      }
      updateSubjectControls();
    });

    updateSubjectControls();

    // ⚡ Кнопка Генерації
    document.getElementById('em-gen').addEventListener('click', async () => {
      if (selectedSlugs.length === 0) {
        alert('Будь ласка, оберіть хоча б один предмет для екзамену.');
        return;
      }

      const genBtn = document.getElementById('em-gen');
      genBtn.disabled = true;
      genBtn.textContent = 'Формую екзаменаційні варіанти…';

      const totalTargetQ = +document.getElementById('em-total-q').value || 24;
      const testsPct = +document.getElementById('em-sl-t').value;
      const matchPct = +document.getElementById('em-sl-m').value;
      const openPct  = +document.getElementById('em-sl-o').value;
      const ratios = { tests: testsPct, match: matchPct, open: openPct };

      // Розрахунок кількості запитань на кожен предмет
      const subjectQuestionCounts = {};
      let allocatedQ = 0;
      selectedSlugs.forEach((slug, idx) => {
        if (idx === selectedSlugs.length - 1) {
          subjectQuestionCounts[slug] = Math.max(1, totalTargetQ - allocatedQ);
        } else {
          const count = Math.max(1, Math.round(totalTargetQ * ((subjectWeights[slug] || 0) / 100)));
          subjectQuestionCounts[slug] = count;
          allocatedQ += count;
        }
      });

      // Збір параметрів діапазонів
      const subjectRanges = {};
      for (const slug of selectedSlugs) {
        const mode = document.querySelector(`input[name="range-mode-${slug}"]:checked`)?.value || 'all';
        const theses = await getBookTheses(slug);
        const book = subjects.find(s => s.slug === slug);
        let pFrom = 1;
        let pTo = book?.pages || 200;

        if (mode === 'custom') {
          pFrom = +document.getElementById(`em-pf-${slug}`)?.value || 1;
          pTo = +document.getElementById(`em-pt-${slug}`)?.value || pFrom;
        } else {
          const nums = [...new Set(
            Object.values(theses)
              .map(t => { const m = t.title && t.title.match(/§\s*(\d+)/); return m ? +m[1] : null; })
              .filter(Boolean)
          )].sort((a, b) => a - b);
          if (nums.length > 0) {
            pFrom = nums[0];
            pTo = nums[nums.length - 1];
          }
        }
        subjectRanges[slug] = { pFrom, pTo, theses, book };
      }

      // Генерація варіантів з гарантією унікальності запитань між варіантами
      const generated = [];
      const usedTitlesBySubject = {};
      selectedSlugs.forEach(slug => { usedTitlesBySubject[slug] = new Set(); });

      for (let v = 0; v < variantCount; v++) {
        const variantQuestions = [];
        for (const slug of selectedSlugs) {
          const cfg = subjectRanges[slug];
          const count = subjectQuestionCounts[slug] || 2;
          const qs = window.Quiz.genForRange(cfg.book, cfg.pFrom, cfg.pTo, cfg.theses, {
            targetCount: count,
            usedTitles: usedTitlesBySubject[slug],
            ratios
          });

          // Додаємо мітку блоку предмета для кожного питання
          // § у заголовках тез є не в усіх книжках — тоді діапазон це сторінки
          const hasPara = Object.values(cfg.theses || {}).some(t => /§\s*\d/.test(t?.title || ''));
          const sectionBlock = `${hasPara ? '§' : 'с.'} ${cfg.pFrom}${cfg.pTo !== cfg.pFrom ? '–' + cfg.pTo : ''}`;
          qs.forEach(q => {
            q.subjectBlock = cfg.book?.subject || slug;
            q.sectionBlock = sectionBlock;
          });
          variantQuestions.push(...qs);
        }

        generated.push({
          label: `Варіант ${WM_ROMAN[v]}`,
          questions: variantQuestions
        });
      }

      genBtn.disabled = false;
      genBtn.textContent = '⚡ Згенерувати екзамен';

      // Рендер результатів (вкладки варіантів, прямий PDF експорт, інтерактив)
      const preview = document.getElementById('em-preview');
      const isTeacher = !!window.isTeacher?.();

      const tabsHtml = generated.map((v, i) =>
        `<button type="button" class="wm-tab${i === 0 ? ' active' : ''}" data-vi="${i}">${v.label}</button>`).join('');

      const pdfBarHtml = `
        <div class="wm-pdf-bar">
          <div class="wm-pdf-opts">
            <label class="wm-pdf-opt">
              <span>Макет PDF:</span>
              <select id="em-pdf-layout">
                <option value="variants" selected>По окремих сторінках (з шапкою учня)</option>
                <option value="compact">Компактно (2 колонки з лінією відрізу)</option>
              </select>
            </label>
            ${isTeacher ? `
              <label class="wm-pdf-chk">
                <input type="checkbox" id="em-pdf-keys" checked>
                <span>Ключі з відповідями для вчителя</span>
              </label>
            ` : ''}
          </div>
          ${generated.length > 1 ? `
            <button type="button" class="wm-btn-pdf primary" id="em-btn-pdf-all">📑 Завантажити всі ${generated.length} варіанти у PDF</button>
          ` : ''}
        </div>
      `;

      const panelsHtml = generated.map((v, i) => {
        let lastBlock = '';
        const qList = v.questions.map((q, qi) => {
          let blockHead = '';
          if (q.subjectBlock && q.subjectBlock !== lastBlock) {
            lastBlock = q.subjectBlock;
            blockHead = `<li class="em-q-block-header">📚 Предметний блок: ${esc(q.subjectBlock)}</li>`;
          }
          return `
            ${blockHead}
            <li class="wm-q">
              <span class="wm-qn">${qi + 1}.</span>
              <span class="em-q-text">${esc(q.title)}</span>
              ${q.type === 'input' ? '<span class="q-type-badge">Відкрите</span>' : ''}
            </li>
          `;
        }).join('');

        return `
          <div class="wm-panel${i !== 0 ? ' wm-hidden' : ''}" data-vi="${i}">
            <div class="wm-panel-btns">
              <button type="button" class="auth-submit-btn wm-btn-quiz" data-vi="${i}">▶ Пройти ${v.label} інтерактивно (${v.questions.length} завдань)</button>
              <button type="button" class="wm-btn-pdf em-btn-pdf-single" data-vi="${i}">📄 Завантажити ${v.label} у PDF</button>
            </div>
            <ul class="wm-qlist em-qlist">${qList}</ul>
          </div>
        `;
      }).join('');

      preview.innerHTML = `${pdfBarHtml}<div class="wm-tabs">${tabsHtml}</div><div class="wm-panels">${panelsHtml}</div>`;

      // Перемикання вкладок
      preview.querySelectorAll('.wm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const vi = +tab.dataset.vi;
          preview.querySelectorAll('.wm-tab').forEach(t => t.classList.toggle('active', t === tab));
          preview.querySelectorAll('.wm-panel').forEach(p => p.classList.toggle('wm-hidden', +p.dataset.vi !== vi));
        });
      });

      // Інтерактивне проходження екзамену
      preview.querySelectorAll('.wm-btn-quiz').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = generated[+btn.dataset.vi];
          const em = document.getElementById('em-overlay');
          if (em) em.style.display = 'none';

          window.Quiz.openWithQuestions({
            book: { subject: 'Комплексний екзамен' },
            questions: v.questions,
            rangeLabel: `Підсумковий екзамен · ${v.label}`,
            onClose: () => {
              if (em) em.style.display = '';
            }
          });
        });
      });

      const getPdfOptions = () => {
        const layout = document.getElementById('em-pdf-layout')?.value || 'variants';
        const includeKeys = isTeacher && (document.getElementById('em-pdf-keys')?.checked === true);
        return { layout, includeKeys };
      };

      const examTitle = `Комплексний екзамен (${selectedSlugs.map(s => subjects.find(b => b.slug === s)?.subject || s).join(', ')})`;

      // Завантажити поточний варіант у PDF
      preview.querySelectorAll('.em-btn-pdf-single').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = generated[+btn.dataset.vi];
          const { layout, includeKeys } = getPdfOptions();
          if (window.PdfExport) {
            window.PdfExport.generateAndPrintPdf({
              subject: 'Комплексний екзамен',
              title: `${examTitle} — ${v.label}`,
              grade: '8 клас',
              questions: v.questions,
              variantLabel: v.label,
              layout,
              includeKeys
            });
          }
        });
      });

      // Завантажити всі варіанти одразу в PDF
      document.getElementById('em-btn-pdf-all')?.addEventListener('click', () => {
        const { layout, includeKeys } = getPdfOptions();
        if (window.PdfExport) {
          window.PdfExport.generateAndPrintPdf({
            subject: 'Комплексний екзамен',
            title: `${examTitle} (${generated.length} варіанти)`,
            grade: '8 клас',
            variants: generated.map((g, idx) => ({
              num: idx + 1,
              label: g.label,
              questions: g.questions
            })),
            layout,
            includeKeys
          });
        }
      });
    });
  }

  /* ---- Модал СР / КР ---- */
  function showWorkModal(type) {
    if (document.getElementById('wm-overlay')) return;
    const subjects = state.books.subjects;
    const overlay = document.createElement('div');
    overlay.id = 'wm-overlay';
    overlay.className = 'auth-modal-overlay';
    document.body.appendChild(overlay);

    const subjOpts = subjects.map(s => `<option value="${s.slug}">${esc(s.subject)}</option>`).join('');
    const rangeHtml = type === 'sr'
      ? `<div class="pdf-cfg-group"><label>Параграф: <select id="wm-pf"></select></label></div>`
      : `<div class="pdf-cfg-group wm-range-row">
           <label>З параграфа: <select id="wm-pf"></select></label>
           <label>По параграф: <select id="wm-pt"></select></label>
         </div>`;

    overlay.innerHTML = `
      <div class="auth-modal-backdrop" id="wm-bd"></div>
      <div class="auth-modal-box wm-box" role="dialog" aria-modal="true" aria-labelledby="wm-title">
        <header class="auth-modal-head">
          <h3 id="wm-title" class="auth-modal-title">${type === 'sr' ? '📝 Самостійні роботи (СР)' : '📊 Контрольні роботи (КР)'}</h3>
          <button type="button" class="auth-modal-close" id="wm-close" aria-label="Закрити">✕</button>
        </header>
        <div class="auth-modal-body">
          <div class="pdf-cfg-group"><label>Предмет: <select id="wm-subj">${subjOpts}</select></label></div>
          <div class="pdf-cfg-group">
            <span class="wm-label">Кількість варіантів:</span>
            <div class="wm-vbtns" id="wm-vbtns">
              ${WM_ROMAN.map((r,i) => `<button type="button" class="wm-vbtn${i===0?' active':''}" data-v="${i+1}">Варіант ${r}</button>`).join('')}
            </div>
          </div>
          ${rangeHtml}
          <div class="wm-sliders">
            <div class="wm-slider-row"><span class="wm-sl-lbl">Класичні тести</span><input type="range" id="sl-t" min="0" max="100" value="70"><span class="wm-sl-val" id="sv-t">70%</span></div>
            <div class="wm-slider-row"><span class="wm-sl-lbl">Відповідність (1-А…)</span><input type="range" id="sl-m" min="0" max="100" value="20"><span class="wm-sl-val" id="sv-m">20%</span></div>
            <div class="wm-slider-row"><span class="wm-sl-lbl">Відкриті короткі</span><input type="range" id="sl-o" min="0" max="100" value="10"><span class="wm-sl-val" id="sv-o">10%</span></div>
            <div class="wm-sl-sum" id="wm-sum">Разом: 100%</div>
          </div>
          <p class="wm-hint">${type === 'sr' ? '10 питань на варіант · один параграф' : '10 питань на варіант · діапазон параграфів'}</p>
          <button type="button" class="auth-submit-btn" id="wm-gen">⚡ Згенерувати</button>
          <div id="wm-preview"></div>
        </div>
      </div>`;

    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('auth-modal-open');

    const close = () => { overlay.remove(); document.body.classList.remove('auth-modal-open'); };
    document.getElementById('wm-close').addEventListener('click', close);
    document.getElementById('wm-bd').addEventListener('click', close);

    // Variant count
    let variantCount = 1;
    document.getElementById('wm-vbtns').addEventListener('click', e => {
      const btn = e.target.closest('.wm-vbtn');
      if (!btn) return;
      variantCount = +btn.dataset.v;
      document.querySelectorAll('#wm-vbtns .wm-vbtn').forEach(b => b.classList.toggle('active', b === btn));
    });

    // Linked sliders (sum stays 100)
    const SL = [
      { el: document.getElementById('sl-t'), val: document.getElementById('sv-t') },
      { el: document.getElementById('sl-m'), val: document.getElementById('sv-m') },
      { el: document.getElementById('sl-o'), val: document.getElementById('sv-o') },
    ];
    const sumEl = document.getElementById('wm-sum');
    SL.forEach((s, idx) => {
      s.el.addEventListener('input', () => {
        const others = SL.filter((_, i) => i !== idx);
        let excess = SL.reduce((a, o) => a + +o.el.value, 0) - 100;
        if (excess > 0) {
          for (const o of others) {
            const cut = Math.min(+o.el.value, excess);
            o.el.value = +o.el.value - cut;
            o.val.textContent = o.el.value + '%';
            excess -= cut;
            if (excess <= 0) break;
          }
        }
        s.val.textContent = s.el.value + '%';
        const total = SL.reduce((a, o) => a + +o.el.value, 0);
        sumEl.textContent = `Разом: ${total}%`;
        sumEl.style.color = total === 100 ? '' : '#ff4d4d';
      });
    });

    // Load paragraphs
    const pfSel = document.getElementById('wm-pf');
    const ptSel = document.getElementById('wm-pt');
    const subjSel = document.getElementById('wm-subj');

    async function loadParagraphs(slug) {
      pfSel.innerHTML = '';
      if (ptSel) ptSel.innerHTML = '';
      try {
        const data = await (await fetch(`books/${slug}/theses.json`)).json();
        const nums = [...new Set(
          Object.values(data.pages || {})
            .map(t => { const m = t.title && t.title.match(/§\s*(\d+)/); return m ? +m[1] : null; })
            .filter(Boolean)
        )].sort((a, b) => a - b);
        if (nums.length) {
          nums.forEach(n => { pfSel.add(new Option(`§ ${n}`, n)); if (ptSel) ptSel.add(new Option(`§ ${n}`, n)); });
          if (ptSel && nums.length > 1) ptSel.value = nums[Math.min(4, nums.length - 1)];
        } else {
          const pc = subjects.find(s => s.slug === slug)?.pages || 200;
          for (let i = 1; i <= pc; i += 20) {
            const end = Math.min(i + 19, pc);
            pfSel.add(new Option(`с. ${i}`, i));
            if (ptSel) ptSel.add(new Option(`с. ${end}`, end));
          }
          if (ptSel) ptSel.value = Math.min(60, pc);
        }
      } catch { pfSel.add(new Option('—', 1)); }
    }
    subjSel.addEventListener('change', () => loadParagraphs(subjSel.value));
    loadParagraphs(subjSel.value);

    // Generate
    document.getElementById('wm-gen').addEventListener('click', async () => {
      const genBtn = document.getElementById('wm-gen');
      genBtn.disabled = true; genBtn.textContent = 'Генерую…';
      const slug = subjSel.value;
      const book = subjects.find(s => s.slug === slug);
      const pFrom = +pfSel.value;
      const pTo = ptSel ? +ptSel.value : pFrom;
      let allTheses = {};
      try { allTheses = (await (await fetch(`books/${slug}/theses.json`)).json()).pages || {}; } catch {}

      const testsPct = +document.getElementById('sl-t').value;
      const matchPct = +document.getElementById('sl-m').value;
      const openPct  = +document.getElementById('sl-o').value;

      const generated = [];
      const usedTitles = new Set();
      for (let v = 0; v < variantCount; v++) {
        const qs = window.Quiz.genForRange(book, pFrom, pTo, allTheses, {
          targetCount: 10,
          usedTitles,
          ratios: { tests: testsPct, match: matchPct, open: openPct }
        });
        // підпис діапазону для «Банку помилок» — як у списках вибору (§ … або сторінки)
        const sectionLabel = [pfSel.selectedOptions[0]?.text, ptSel?.selectedOptions[0]?.text]
          .filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).join(' – ');
        generated.push({ label: `Варіант ${WM_ROMAN[v]}`, questions: qs, pFrom, pTo, book, allTheses, sectionLabel });
      }

      genBtn.disabled = false; genBtn.textContent = '⚡ Згенерувати';

      const preview = document.getElementById('wm-preview');
      const isTeacher = !!window.isTeacher?.();
      const tabsHtml = generated.map((v, i) =>
        `<button type="button" class="wm-tab${i === 0 ? ' active' : ''}" data-vi="${i}">${v.label}</button>`).join('');

      const pdfBarHtml = `
        <div class="wm-pdf-bar">
          <div class="wm-pdf-opts">
            <label class="wm-pdf-opt">
              <span>Макет PDF:</span>
              <select id="wm-pdf-layout">
                <option value="variants" selected>По окремих сторінках (з шапкою учня)</option>
                <option value="compact">Компактно (2 колонки з лінією відрізу)</option>
              </select>
            </label>
            ${isTeacher ? `
              <label class="wm-pdf-chk">
                <input type="checkbox" id="wm-pdf-keys" checked>
                <span>Ключі з відповідями для вчителя</span>
              </label>
            ` : ''}
          </div>
          ${generated.length > 1 ? `
            <button type="button" class="wm-btn-pdf primary" id="wm-btn-pdf-all">📑 Завантажити всі ${generated.length} варіанти у PDF</button>
          ` : ''}
        </div>
      `;

      const panelsHtml = generated.map((v, i) => {
        const qList = v.questions.map((q, qi) =>
          `<li class="wm-q"><span class="wm-qn">${qi + 1}.</span>${esc(q.title)}</li>`).join('');
        return `<div class="wm-panel${i !== 0 ? ' wm-hidden' : ''}" data-vi="${i}">
          <div class="wm-panel-btns">
            <button type="button" class="auth-submit-btn wm-btn-quiz" data-vi="${i}">▶ Пройти ${v.label} інтерактивно</button>
            <button type="button" class="wm-btn-pdf wm-btn-pdf-single" data-vi="${i}">📄 Завантажити ${v.label} у PDF</button>
          </div>
          <ul class="wm-qlist">${qList}</ul>
        </div>`;
      }).join('');

      preview.innerHTML = `${pdfBarHtml}<div class="wm-tabs">${tabsHtml}</div><div class="wm-panels">${panelsHtml}</div>`;

      preview.querySelectorAll('.wm-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          const vi = +tab.dataset.vi;
          preview.querySelectorAll('.wm-tab').forEach(t => t.classList.toggle('active', t === tab));
          preview.querySelectorAll('.wm-panel').forEach(p => p.classList.toggle('wm-hidden', +p.dataset.vi !== vi));
        });
      });

      preview.querySelectorAll('.wm-btn-quiz').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = generated[+btn.dataset.vi];
          const wm = document.getElementById('wm-overlay');
          if (wm) wm.style.display = 'none';

          window.Quiz.openWithQuestions({
            book: v.book,
            questions: v.questions,
            rangeLabel: `${v.book?.subject || 'Підручник'} · ${v.label}`,
            sectionLabel: v.sectionLabel,
            onClose: () => {
              if (wm) wm.style.display = '';
            }
          });
        });
      });

      const getPdfOptions = () => {
        const layout = document.getElementById('wm-pdf-layout')?.value || 'variants';
        const includeKeys = isTeacher && (document.getElementById('wm-pdf-keys')?.checked === true);
        return { layout, includeKeys };
      };

      // Пряме завантаження вибраного варіанта в PDF (без 2-го вікна)
      preview.querySelectorAll('.wm-btn-pdf-single').forEach(btn => {
        btn.addEventListener('click', () => {
          const v = generated[+btn.dataset.vi];
          const { layout, includeKeys } = getPdfOptions();
          if (window.PdfExport) {
            window.PdfExport.generateAndPrintPdf({
              subject: v.book?.subject || 'Підручник',
              title: `${type === 'sr' ? 'Самостійна робота' : 'Контрольна робота'} (${v.label})`,
              grade: '8 клас',
              questions: v.questions,
              variantLabel: v.label,
              layout,
              includeKeys
            });
          }
        });
      });

      // Пряме завантаження всіх варіантів одразу в PDF (без 2-го вікна)
      document.getElementById('wm-btn-pdf-all')?.addEventListener('click', () => {
        const { layout, includeKeys } = getPdfOptions();
        if (window.PdfExport) {
          window.PdfExport.generateAndPrintPdf({
            subject: book?.subject || 'Підручник',
            title: `${type === 'sr' ? 'Самостійна робота' : 'Контрольна робота'} (${generated.length} варіанти)`,
            grade: '8 клас',
            variants: generated.map((g, idx) => ({
              num: idx + 1,
              label: g.label,
              questions: g.questions
            })),
            layout,
            includeKeys
          });
        }
      });
    });
  }

  function renderHome() {
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
            ${window.Social ? window.Social.html() : ''}
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
                  <span class="cy-hub-badge ready">Активно</span>
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
                  <span class="cy-hub-badge ready">Активно</span>
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
                  <span class="cy-hub-badge ready">Активно</span>
                </div>
                <h4 class="cy-hub-title">Екзамени</h4>
                <p class="cy-hub-desc">Підсумкова річна атестація та комплексні зрізи</p>
                <div class="cy-hub-foot">
                  <span>Підсумкові зрізи</span>
                  <span class="cy-arr" aria-hidden="true">→</span>
                </div>
              </button>

              <!-- Банк помилок: колір — з активної теми (CSS-змінні), лічильник оновлює quiz.js (MistakeBank) -->
              <button type="button" class="cy-hub-card hub-mistakes" data-hub="mistakes">
                <div class="cy-hub-head">
                  <span class="cy-hub-ico" aria-hidden="true">🔁</span>
                  <span class="cy-hub-badge mb-badge${window.MistakeBank?.count() ? ' has' : ''}" data-mistakes-badge>${window.MistakeBank?.badgeText() || 'Порожньо'}</span>
                </div>
                <h4 class="cy-hub-title">Банк помилок</h4>
                <p class="cy-hub-desc">Питання, у яких ви помилились, — повторюйте, доки не відповісте правильно</p>
                <div class="cy-hub-foot">
                  <span data-mistakes-foot>${window.MistakeBank?.footText() || 'Помилок поки немає'}</span>
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
    app.querySelectorAll('.cy-hub-card').forEach(card => {
      const hub = card.dataset.hub;
      card.addEventListener('click', () => {
        if (hub === 'sr') showWorkModal('sr');
        else if (hub === 'kr') showWorkModal('kr');
        else if (hub === 'exams') showExamsModal();
        else if (hub === 'mistakes') window.Quiz?.openMistakesChooser();
        else window.TeacherAuth?.openHubModal(hub);
      });
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
    // перемикач «Анімації» (motion.js); без нього — системне «менше руху»
    const reduce = window.P8Motion ? !window.P8Motion.on : matchMedia('(prefers-reduced-motion: reduce)').matches;
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
