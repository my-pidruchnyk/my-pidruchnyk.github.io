/* Модуль тестування знань до сторінок підручника та Центру тестування (Quiz).
   - Експрес-тести до сторінок конспекту
   - Центр тестування з головного екрана: вибір предмета та діапазону параграфів
   - Генерація рівно 12 запитань за обраними темами (по 4 варіанти в кожному)
   - Повна підтримка доступності (А−/А+), вільної зміни відповідей та вікна підтвердження
   - Детальний розбір помилок за конспектом
   - Прямий експорт згенерованого тесту в PDF через модуль PdfExport */
(() => {
  'use strict';

  const FS = [0.85, 1, 1.15, 1.3, 1.5, 1.75];

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('p8:' + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('p8:' + k, JSON.stringify(v)); } catch {} },
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function shortText(text, max = 68) {
    if (!text) return '';
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 25 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  /* Універсальний конструктор запитань (10 для СР/КР або 12 для Тестів) */
  function buildQuestions({
    curTerms = [],
    curPoints = [],
    curFormulas = [],
    poolTerms = [],
    poolPoints = [],
    poolFormulas = []
  }, targetCount = 10, usedTitles = null, sliderRatios = null) {
    const TARGET_COUNT = targetCount || 10;
    const questions = [];
    const seenTitles = usedTitles || new Set();

    const fallbackTerms = [
      { term: 'Величина', def: 'кількісна характеристика властивості тіла або процесу' },
      { term: 'Процес', def: 'послідовна зміна станів об’єкта або системи' },
      { term: 'Закон', def: 'необхідний і сталий зв’язок між явищами' },
      { term: 'Система', def: 'сукупність взаємопов’язаних елементів' },
      { term: 'Одиниця виміру', def: 'фіксована міра для кількісного порівняння' },
      { term: 'Параметр', def: 'величина, що описує стан досліджуваної системи' }
    ];
    for (const fb of fallbackTerms) {
      if (poolTerms.length < 15) poolTerms.push(fb);
    }

    const cTerms = shuffle(curTerms);
    const pTerms = shuffle(poolTerms);
    const cPoints = shuffle(curPoints);
    const pPoints = shuffle(poolPoints);
    const cFormulas = shuffle(curFormulas);
    const pFormulas = shuffle(poolFormulas);

    let targetMatch = 0;
    let targetOpen = 0;
    if (sliderRatios) {
      targetMatch = Math.max(0, Math.round(TARGET_COUNT * (sliderRatios.match || 0) / 100));
      targetOpen  = Math.max(0, Math.round(TARGET_COUNT * (sliderRatios.open  || 0) / 100));
      if (targetMatch + targetOpen >= TARGET_COUNT) {
        targetMatch = Math.min(targetMatch, Math.floor(TARGET_COUNT / 2));
        targetOpen  = Math.min(targetOpen, TARGET_COUNT - targetMatch - 1);
      }
    }

    // 1. Завдання на відповідність (1-А, 2-Б, 3-В)
    const allTermsForMatch = [...cTerms, ...pTerms];
    let termMatchIdx = 0;
    while (questions.filter(q => q.id.startsWith('q_match_')).length < targetMatch && termMatchIdx + 3 <= allTermsForMatch.length && questions.length < TARGET_COUNT) {
      const trio = allTermsForMatch.slice(termMatchIdx, termMatchIdx + 3);
      termMatchIdx += 3;
      const qTitle = 'Установіть відповідність між термінами (1–3) та їх значеннями:\n' +
        '1. ' + trio[0].term + '\n2. ' + trio[1].term + '\n3. ' + trio[2].term + '\n\n' +
        'А — ' + shortText(trio[0].def, 45) + '\nБ — ' + shortText(trio[1].def, 45) + '\nВ — ' + shortText(trio[2].def, 45);

      if (seenTitles.has(qTitle)) continue;
      seenTitles.add(qTitle);

      const correctPattern = '1-А, 2-Б, 3-В';
      const dists = ['1-Б, 2-А, 3-В', '1-В, 2-Б, 3-А', '1-А, 2-В, 3-Б'];
      const opts = shuffle([correctPattern, ...dists]);

      questions.push({
        id: `q_match_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: opts.indexOf(correctPattern),
        explanation: `Правильна відповідність: ${trio[0].term} — ${trio[0].def}; ${trio[1].term} — ${trio[1].def}; ${trio[2].term} — ${trio[2].def}.`
      });
    }

    // 2. Відкриті короткі завдання з полем вільного вводу (відповідь — 1 слово або число)
    const singleWordTerms = [...cTerms, ...pTerms].filter(item => {
      if (!item || !item.term || !item.def) return false;
      const clean = item.term.trim();
      return /^[a-zA-Zа-яА-ЯіІїЇєЄґҐ0-9\-]+$/.test(clean) && !clean.includes(' ');
    });

    const fallbackSingleWords = [
      { term: 'Величина', def: 'кількісна характеристика властивості тіла або процесу' },
      { term: 'Процес', def: 'послідовна зміна станів об’єкта або системи' },
      { term: 'Закон', def: 'необхідний і сталий зв’язок між явищами' },
      { term: 'Система', def: 'сукупність взаємопов’язаних елементів' },
      { term: 'Параметр', def: 'величина, що описує стан досліджуваної системи' },
      { term: 'Енергія', def: 'загальна кількісна міра руху і взаємодії всіх видів матерії' },
      { term: 'Рівняння', def: 'аналітичний запис рівності двох виразів із невідомими' },
      { term: 'Функція', def: 'відповідність між елементами двох множин' },
      { term: 'Графік', def: 'наочне геометричне зображення залежності між величинами' }
    ];
    for (const fb of fallbackSingleWords) {
      if (singleWordTerms.length < 15) singleWordTerms.push(fb);
    }

    for (const item of shuffle(singleWordTerms)) {
      if (questions.filter(q => q.type === 'input').length >= targetOpen || questions.length >= TARGET_COUNT) break;
      const termWord = item.term.trim();
      const qTitle = `Завдання з короткою відповіддю:\nВкажіть науковий термін, що означає: «${shortText(item.def, 75)}».\n(Запишіть відповідь одним словом)`;
      if (seenTitles.has(qTitle)) continue;
      seenTitles.add(qTitle);

      questions.push({
        id: `q_open_${questions.length + 1}`,
        type: 'input',
        title: qTitle,
        expectedAnswer: termWord,
        options: [],
        explanation: `Правильна відповідь: «${termWord}». Визначення: ${item.def}.`
      });
    }

    // 3. Класичні: Визначення → Термін
    const termsToUse = [...cTerms, ...pTerms];
    for (const item of termsToUse) {
      if (questions.length >= TARGET_COUNT) break;
      const qTitle = `Який термін означає: «${shortText(item.def, 58)}»?`;
      if (seenTitles.has(qTitle)) continue;

      const correctTerm = item.term;
      const dists = [];
      for (const other of shuffle(pTerms)) {
        if (dists.length >= 3) break;
        if (other.term !== correctTerm && !dists.includes(other.term)) {
          dists.push(other.term);
        }
      }
      while (dists.length < 3) dists.push(`Термін ${dists.length + 1}`);

      const opts = shuffle([correctTerm, ...dists.slice(0, 3)]);
      seenTitles.add(qTitle);
      questions.push({
        id: `q_term_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: opts.indexOf(correctTerm),
        explanation: `Правильно: «${item.term}». Визначення: ${item.def}.`
      });
    }

    // 4. Класичні: Лаконічні питання за тезами (True/False)
    const pointsToUse = [...cPoints, ...pPoints];
    for (let i = 0; i < pointsToUse.length; i++) {
      if (questions.length >= TARGET_COUNT) break;
      const pt = pointsToUse[i];
      const statement = shortText(pt, 65);
      const isTrue = (i % 2 === 0);
      const qTitle = isTrue
        ? `Чи правильне твердження: «${statement}»?`
        : `«${statement}» — чи це твердження помилкове?`;

      if (seenTitles.has(qTitle)) continue;
      seenTitles.add(qTitle);

      const opts = isTrue ? [
        'Так, це твердження повністю правильне',
        'Ні, це твердження є помилковим',
        'Це твердження стосується іншої теми',
        'Це твердження діє лише як виняток'
      ] : [
        'Ні, твердження є повністю вірним',
        'Так, це твердження помилкове',
        'Твердження стосується зовсім іншого розділу',
        'Твердження суперечить основним законам'
      ];

      questions.push({
        id: `q_tf_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: 0,
        explanation: `Це твердження є науково обґрунтованим: «${pt}».`
      });
    }

    // 5. Формули (якщо є)
    const formulasToUse = [...cFormulas, ...pFormulas];
    for (const f of formulasToUse) {
      if (questions.length >= TARGET_COUNT) break;
      const qTitle = 'Яка формула стосується цієї теми?';
      if (seenTitles.has(qTitle)) continue;
      const dists = [];
      for (const otherF of shuffle(pFormulas)) {
        if (dists.length >= 3) break;
        if (otherF !== f && !dists.includes(otherF)) dists.push(otherF);
      }
      while (dists.length < 3) dists.push(`x = y · ${dists.length + 2}`);
      const opts = shuffle([f, ...dists.slice(0, 3)]);
      seenTitles.add(qTitle);
      questions.push({
        id: `q_form_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: opts.indexOf(f),
        explanation: `Формула теми: ${f}.`
      });
    }

    // 6. Класичні: Термін → Визначення
    for (const item of termsToUse) {
      if (questions.length >= TARGET_COUNT) break;
      const qTitle = `«${item.term}» — це:`;
      if (seenTitles.has(qTitle)) continue;

      const correctDef = shortText(item.def, 45);
      const dists = [];
      for (const other of shuffle(pTerms)) {
        if (dists.length >= 3) break;
        const d = shortText(other.def, 45);
        if (d !== correctDef && !dists.includes(d)) dists.push(d);
      }
      while (dists.length < 3) dists.push(`Параметр стану системи №${dists.length + 1}`);

      const opts = shuffle([correctDef, ...dists.slice(0, 3)]);
      seenTitles.add(qTitle);
      questions.push({
        id: `q_def_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: opts.indexOf(correctDef),
        explanation: `Згідно з темою: «${item.term}» — це ${item.def}.`
      });
    }

    // 7. Вибір ключового факту з пулу
    for (const pt of pointsToUse) {
      if (questions.length >= TARGET_COUNT) break;
      const qTitle = 'Оберіть правильний факт з теми:';
      const correctOpt = shortText(pt, 50);
      const titleKey = `${qTitle}:${correctOpt}`;
      if (seenTitles.has(titleKey)) continue;
      seenTitles.add(titleKey);

      const dists = [];
      for (const other of shuffle(pPoints)) {
        if (dists.length >= 3) break;
        const d = shortText(other, 50);
        if (d !== correctOpt && !dists.includes(d)) dists.push(d);
      }
      while (dists.length < 3) dists.push(`Не стосується даного розділу`);
      const opts = shuffle([correctOpt, ...dists.slice(0, 3)]);

      questions.push({
        id: `q_fact_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: opts.indexOf(correctOpt),
        explanation: `Правильне твердження: «${pt}».`
      });
    }

    // Гарантуємо рівно 4 варіанти (А, Б, В, Г) для кожного тестового питання (крім відкритого типу)
    for (const q of questions) {
      if (q.type === 'input') continue;
      while (q.options.length < 4) {
        q.options.push(`Додатковий варіант ${q.options.length + 1}`);
      }
    }

    return questions.slice(0, TARGET_COUNT);
  }

  const build12Questions = (args) => buildQuestions(args, 12);

  /* Генератор запитань для однієї сторінки конспекту */
  function generateQuestions(theses, allTheses, pageNum) {
    if (!theses) return [];
    if (Array.isArray(theses.tests) && theses.tests.length === 12) return theses.tests;

    const curTerms = Array.isArray(theses.terms) ? [...theses.terms] : [];
    const curPoints = Array.isArray(theses.points) ? [...theses.points] : [];
    const curFormulas = Array.isArray(theses.formulas) ? [...theses.formulas] : [];

    const poolTerms = [];
    const poolPoints = [];
    const poolFormulas = [];

    if (allTheses) {
      const curP = parseInt(pageNum, 10) || 1;
      const pagesSorted = Object.keys(allTheses).map(n => parseInt(n, 10)).filter(Boolean)
        .sort((a, b) => Math.abs(a - curP) - Math.abs(b - curP));

      for (const p of pagesSorted) {
        const t = allTheses[String(p)];
        if (!t) continue;
        if (Array.isArray(t.terms)) {
          for (const item of t.terms) if (item.term && item.def) poolTerms.push(item);
        }
        if (Array.isArray(t.points)) {
          for (const pt of t.points) if (pt && pt.length > 15) poolPoints.push(pt);
        }
        if (Array.isArray(t.formulas)) {
          for (const f of t.formulas) if (f) poolFormulas.push(f);
        }
      }
    }

    return build12Questions({ curTerms, curPoints, curFormulas, poolTerms, poolPoints, poolFormulas });
  }

  /* Генератор запитань за обраним діапазоном параграфів/сторінок */
  function generateQuestionsForRange(book, pFrom, pTo, allTheses, options = {}) {
    if (!allTheses) return [];
    const fromNum = parseInt(pFrom, 10) || 1;
    const toNum = parseInt(pTo, 10) || fromNum;

    const rangePages = [];
    for (const [pStr, t] of Object.entries(allTheses)) {
      if (!t) continue;
      const m = t.title ? t.title.match(/§\s*(\d+)/) : null;
      const pIndex = parseInt(pStr, 10);
      let inRange = false;

      if (m) {
        const paraNum = parseInt(m[1], 10);
        inRange = (paraNum >= fromNum && paraNum <= toNum);
      } else {
        inRange = (pIndex >= fromNum && pIndex <= toNum);
      }

      if (inRange) rangePages.push(t);
    }

    const primaryTheses = rangePages.length ? rangePages : Object.values(allTheses);

    const curTerms = [];
    const curPoints = [];
    const curFormulas = [];
    for (const t of primaryTheses) {
      if (Array.isArray(t.terms)) for (const item of t.terms) if (item.term && item.def) curTerms.push(item);
      if (Array.isArray(t.points)) for (const pt of t.points) if (pt && pt.length > 15) curPoints.push(pt);
      if (Array.isArray(t.formulas)) for (const f of t.formulas) if (f) curFormulas.push(f);
    }

    const poolTerms = [];
    const poolPoints = [];
    const poolFormulas = [];
    for (const t of Object.values(allTheses)) {
      if (Array.isArray(t.terms)) for (const item of t.terms) if (item.term && item.def) poolTerms.push(item);
      if (Array.isArray(t.points)) for (const pt of t.points) if (pt && pt.length > 15) poolPoints.push(pt);
      if (Array.isArray(t.formulas)) for (const f of t.formulas) if (f) poolFormulas.push(f);
    }

    const targetCount = (typeof options === 'number') ? options : (options && options.targetCount ? options.targetCount : 12);
    const usedTitles = (options && options.usedTitles instanceof Set) ? options.usedTitles : null;
    const ratios = (options && options.ratios) ? options.ratios : null;

    return buildQuestions({ curTerms, curPoints, curFormulas, poolTerms, poolPoints, poolFormulas }, targetCount, usedTitles, ratios);
  }

  class QuizEngine {
    constructor() {
      this.active = false;
      this.book = null;
      this.page = 1;
      this.pageLabel = '';
      this.theses = null;
      this.allTheses = null;
      this.questions = [];
      this.answers = [];
      this.isSubmitted = false;
      this.onNextPage = null;

      this.initModalContainer();
      this.initGlobalEvents();
    }

    initModalContainer() {
      let modal = document.getElementById('quiz-overlay');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'quiz-overlay';
        modal.className = 'quiz-overlay';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
      }
      this.el = modal;
    }

    initGlobalEvents() {
      document.addEventListener('keydown', e => {
        if (!this.active) return;
        if (e.key === 'Escape') {
          const conf = document.getElementById('quiz-confirm-dialog');
          if (conf && !conf.hidden) {
            this.closeConfirm();
          } else {
            this.close();
          }
        }
      });
    }

    fsIndex() {
      const cur = store.get('quizFont');
      const i = FS.indexOf(cur);
      return i < 0 ? FS.indexOf(1) : i;
    }

    setFontScale(delta) {
      const i = Math.min(Math.max(this.fsIndex() + delta, 0), FS.length - 1);
      store.set('quizFont', FS[i]);
      this.applyFontScale();
    }

    applyFontScale() {
      const i = this.fsIndex();
      if (this.el) {
        this.el.style.setProperty('--quiz-fs', FS[i]);
      }
      const bMin = this.el?.querySelector('[data-qfs="-1"]');
      const bMax = this.el?.querySelector('[data-qfs="1"]');
      if (bMin) bMin.disabled = i === 0;
      if (bMax) bMax.disabled = i === FS.length - 1;
    }

    hasQuestions(theses) {
      if (!theses) return false;
      const excludedKinds = ['cover', 'intro', 'toc', 'empty', 'answers', 'index', 'image'];
      if (theses.kind && excludedKinds.includes(theses.kind)) return false;

      const t = String(theses.title || '').toLowerCase();
      if (
        t.includes('обкладинк') ||
        t.includes('форзац') ||
        t.includes('титул') ||
        t.includes('вихідні дані') ||
        t.includes('зміст') ||
        t.includes('правила безпеки') ||
        t.includes('інструкція з безпеки')
      ) {
        return false;
      }

      const hasContent = (Array.isArray(theses.terms) && theses.terms.length > 0) ||
                         (Array.isArray(theses.points) && theses.points.length > 0) ||
                         (Array.isArray(theses.tests) && theses.tests.length > 0);
      return hasContent;
    }

    /* Відкриття тесту до конкретної сторінки */
    open({ book, page, pageLabel, theses, onNextPage }) {
      this.book = book;
      this.page = page;
      this.pageLabel = pageLabel || String(page);
      this.theses = theses?.[String(page)] || null;
      this.allTheses = theses;
      this.onNextPage = onNextPage;

      this.questions = generateQuestions(this.theses, this.allTheses, this.page);
      this.answers = new Array(this.questions.length).fill(null);
      this.isSubmitted = false;
      this.active = true;

      document.body.classList.add('quiz-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.render();
      this.applyFontScale();
    }

    /* Відкриття тесту з готовими питаннями (для СР/КР preview) */
    openWithQuestions({ book, questions, rangeLabel, onClose }) {
      this.book = book;
      this.page = 1;
      this.pageLabel = rangeLabel || '';
      this.theses = null;
      this.allTheses = null;
      this.onNextPage = null;
      this.onClose = onClose || null;
      this.questions = questions;
      this.answers = new Array(questions.length).fill(null);
      this.isSubmitted = false;
      this.active = true;
      document.body.classList.add('quiz-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.render();
      this.applyFontScale();
    }

    /* Відкриття тесту за діапазоном параграфів */
    openRangeQuiz({ book, paragraphFrom, paragraphTo, allTheses, rangeLabel }) {
      this.book = book;
      this.page = 1;
      this.pageLabel = rangeLabel || `§ ${paragraphFrom} – § ${paragraphTo}`;
      this.theses = null;
      this.allTheses = allTheses;
      this.onNextPage = null;
      this.onClose = null;

      this.questions = generateQuestionsForRange(book, paragraphFrom, paragraphTo, allTheses);
      this.answers = new Array(this.questions.length).fill(null);
      this.isSubmitted = false;
      this.active = true;

      document.body.classList.add('quiz-open');
      this.el.setAttribute('aria-hidden', 'false');
      this.render();
      this.applyFontScale();
    }

    close() {
      this.active = false;
      this.el.setAttribute('aria-hidden', 'true');
      this.el.innerHTML = '';
      document.body.classList.remove('quiz-open');
      if (typeof this.onClose === 'function') {
        const cb = this.onClose;
        this.onClose = null;
        cb();
      }
    }

    selectAnswer(qIndex, optIndex) {
      if (this.isSubmitted) return;
      this.answers[qIndex] = optIndex;
      this.renderQuestionOptions(qIndex);
      this.updateSubmitButtonState();
    }

    renderQuestionOptions(qIndex) {
      const q = this.questions[qIndex];
      const optContainer = document.getElementById(`quiz-options-${qIndex}`);
      if (!optContainer) return;

      const letters = ['A', 'Б', 'В', 'Г'];
      optContainer.innerHTML = q.options.map((opt, oIdx) => {
        const isSelected = this.answers[qIndex] === oIdx;
        let stateClass = '';
        let badgeContent = letters[oIdx] || String(oIdx + 1);

        if (this.isSubmitted) {
          const isCorrect = oIdx === q.correctIndex;
          if (isSelected) {
            stateClass = isCorrect ? ' correct' : ' wrong';
            badgeContent = isCorrect ? '✓' : '✗';
          } else if (isCorrect) {
            stateClass = ' should-be-correct';
          }
        } else if (isSelected) {
          stateClass = ' selected';
        }

        return `
          <button type="button" 
                  class="quiz-opt-btn${stateClass}" 
                  data-q="${qIndex}" 
                  data-o="${oIdx}" 
                  ${this.isSubmitted ? 'disabled' : ''} 
                  aria-pressed="${isSelected}">
            <span class="quiz-opt-badge">${badgeContent}</span>
            <span class="quiz-opt-text">${esc(opt)}</span>
            ${this.isSubmitted && oIdx === q.correctIndex && !isSelected ? '<span class="quiz-correct-tag">(Правильна відповідь)</span>' : ''}
          </button>
        `;
      }).join('');

      if (!this.isSubmitted) {
        optContainer.querySelectorAll('.quiz-opt-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            this.selectAnswer(+btn.dataset.q, +btn.dataset.o);
          });
        });
      }
    }

    updateSubmitButtonState() {
      const btn = document.getElementById('quiz-btn-submit');
      if (!btn) return;
      const count = this.answers.filter(a => a !== null && a !== undefined && String(a).trim() !== '').length;
      btn.textContent = count === this.questions.length 
        ? 'Перевірити тест' 
        : `Перевірити тест (${count} з ${this.questions.length})`;
    }

    openConfirm() {
      const conf = document.getElementById('quiz-confirm-dialog');
      if (conf) {
        conf.hidden = false;
        conf.querySelector('#btn-confirm-cancel')?.focus();
      }
    }

    closeConfirm() {
      const conf = document.getElementById('quiz-confirm-dialog');
      if (conf) conf.hidden = true;
    }

    submitTest() {
      this.closeConfirm();
      this.isSubmitted = true;
      this.render();
      this.applyFontScale();

      const wrap = document.getElementById('quiz-scrollable');
      if (wrap) wrap.scrollTop = 0;
    }

    /* Рендеринг основного вікна тесту */
    render() {
      const total = this.questions.length;
      const answeredCount = this.answers.filter(a => a !== null && a !== undefined && String(a).trim() !== '').length;
      let score = 0;

      if (this.isSubmitted) {
        score = this.questions.reduce((acc, q, idx) => {
          if (q.type === 'input') {
            const user = String(this.answers[idx] ?? '').trim().toLowerCase();
            const exp = String(q.expectedAnswer ?? '').trim().toLowerCase();
            return acc + (user === exp && user.length > 0 ? 1 : 0);
          }
          return acc + (this.answers[idx] === q.correctIndex ? 1 : 0);
        }, 0);
      }

      this.el.innerHTML = `
        <div class="quiz-backdrop" id="quiz-backdrop"></div>
        <div class="quiz-dialog" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
          <header class="quiz-header">
            <div class="quiz-header-meta">
              <span class="quiz-book-tag">${esc(this.book?.subject || 'Підручник')}</span>
              <span class="quiz-page-tag">${esc(this.pageLabel)}</span>
            </div>
            <h2 id="quiz-title" class="quiz-title">
              ${this.isSubmitted ? 'Результати тесту' : (this.pageLabel ? `${esc(this.pageLabel)} (${this.questions.length} завдань)` : `Тест на ${this.questions.length} питань`)}
            </h2>
            <div class="quiz-header-actions">
              <button type="button" class="qpdf-btn" id="quiz-btn-pdf" title="Завантажити цей тест у PDF">📄 PDF</button>
              <div class="quiz-font-ctrl" role="group" aria-label="Розмір шрифту тесту">
                <button type="button" class="qfs-btn" data-qfs="-1" title="Зменшити шрифт">А−</button>
                <button type="button" class="qfs-btn" data-qfs="1" title="Збільшити шрифт">А+</button>
              </div>
              <button type="button" class="quiz-close-btn" id="quiz-btn-close" aria-label="Закрити тест" title="Закрити">✕</button>
            </div>
          </header>

          <div class="quiz-body" id="quiz-scrollable">
            ${total === 0 ? `
              <div class="quiz-empty">
                <p>За вказаними параметрами не знайдено запитань або сторінка не містить навчального матеріалу.</p>
              </div>
            ` : `
              <div class="quiz-questions-list">
                ${this.questions.map((q, idx) => {
                  const userAnswer = this.answers[idx];
                  const isOpen = q.type === 'input';
                  let isWrong = false;
                  let isCorrect = false;

                  if (this.isSubmitted) {
                    if (isOpen) {
                      const user = String(userAnswer ?? '').trim().toLowerCase();
                      const exp = String(q.expectedAnswer ?? '').trim().toLowerCase();
                      isCorrect = (user === exp && user.length > 0);
                      isWrong = !isCorrect;
                    } else {
                      isWrong = userAnswer !== q.correctIndex;
                      isCorrect = userAnswer === q.correctIndex;
                    }
                  }

                  return `
                    <section class="quiz-q-card ${isWrong ? 'card-wrong' : ''} ${isCorrect ? 'card-correct' : ''}">
                      <div class="quiz-q-num">
                        <span>Питання ${idx + 1} з ${total}</span>
                        ${isOpen ? '<span class="q-type-badge">Коротка відповідь (1 слово/число)</span>' : ''}
                        ${this.isSubmitted ? (
                          isCorrect 
                            ? '<span class="q-status-badge ok">✓ Правильно</span>' 
                            : '<span class="q-status-badge err">✗ Помилка</span>'
                        ) : ''}
                      </div>
                      <h3 class="quiz-q-title">${esc(q.title)}</h3>
                      ${isOpen ? `
                        <div class="quiz-open-input-wrap">
                          <input type="text"
                                 class="quiz-text-input ${isCorrect ? 'inp-ok' : ''} ${isWrong ? 'inp-err' : ''}"
                                 data-q="${idx}"
                                 placeholder="Введіть відповідь (1 слово або число)..."
                                 value="${esc(userAnswer ?? '')}"
                                 ${this.isSubmitted ? 'disabled' : ''}
                                 autocomplete="off"
                                 spellcheck="false">
                          ${this.isSubmitted && isWrong ? `
                            <div class="quiz-open-feedback">
                              Правильна відповідь: <strong>${esc(q.expectedAnswer)}</strong>
                            </div>
                          ` : ''}
                        </div>
                      ` : `
                        <div class="quiz-options-grid" id="quiz-options-${idx}"></div>
                      `}
                      
                      ${isWrong ? `
                        <div class="quiz-mistake-card" role="alert">
                          <div class="qmc-header">
                            <span class="qmc-icon">⚠️</span>
                            <strong>Розбір помилки на основі конспекту:</strong>
                          </div>
                          <p class="qmc-text">${esc(q.explanation)}</p>
                        </div>
                      ` : ''}

                      ${isCorrect ? `
                        <div class="quiz-success-card">
                          <span class="qsc-icon">✓</span>
                          <span><strong>Чудово!</strong> ${esc(q.explanation)}</span>
                        </div>
                      ` : ''}
                    </section>
                  `;
                }).join('')}
              </div>

              ${this.isSubmitted ? `
                <div class="quiz-final-summary">
                  <div class="qfs-trophy">${score === total ? '🏆' : (score > 0 ? '🎯' : '💡')}</div>
                  <h3 class="qfs-title">
                    ${score === total ? 'Тест пройдено на відмінно!' : 'Тест пройдено!'}
                  </h3>
                  <p class="qfs-score-line">
                    Ваш результат: <strong>${score} з ${total}</strong> правильних відповідей (${Math.round((score / total) * 100)}%)
                  </p>
                  <p class="qfs-desc">
                    ${score === total 
                      ? 'Ви блискуче засвоїли матеріал обраної теми. Результати можна роздрукувати або зберегти у PDF!' 
                      : 'Ознайомтеся з детальним розбором вище, щоб заповнити прогалини та краще запам\'ятати тему.'}
                  </p>
                  <div class="qfs-buttons">
                    <button type="button" class="qfs-btn-secondary" id="btn-quiz-pdf-export">
                      📄 Завантажити у PDF
                    </button>
                    ${this.onNextPage ? `
                      <button type="button" class="qfs-btn-primary" id="btn-next-page">
                        <span>Наступна сторінка</span>
                        <span class="qfs-arr">→</span>
                      </button>
                    ` : ''}
                    <button type="button" class="qfs-btn-secondary" id="btn-retry-quiz">
                      ↺ Пройти ще раз
                    </button>
                    <button type="button" class="qfs-btn-ghost" id="btn-done-reading">
                      Повернутися
                    </button>
                  </div>
                </div>
              ` : ''}
            `}
          </div>

          ${!this.isSubmitted && total > 0 ? `
            <footer class="quiz-footer">
              <div class="quiz-footer-status">
                <span>Обрано відповідей: <strong>${answeredCount}</strong> з <strong>${total}</strong></span>
              </div>
              <button type="button" class="quiz-submit-btn" id="quiz-btn-submit">
                Перевірити тест
              </button>
            </footer>
          ` : ''}

          <!-- Модальне вікно підтвердження -->
          <div class="quiz-confirm-dialog" id="quiz-confirm-dialog" hidden role="alertdialog" aria-modal="true">
            <div class="qcd-box">
              <div class="qcd-icon">⚠️</div>
              <h3 class="qcd-title">Підтвердження перевірки</h3>
              <p class="qcd-message">
                Зараз відбудеться перевірка тесту, і результати потім змінити буде не можна. Ви впевнені?
              </p>
              ${answeredCount < total ? `
                <p class="qcd-warn">Зверніть увагу: ви обрали відповіді лише на ${answeredCount} з ${total} питань.</p>
              ` : ''}
              <div class="qcd-actions">
                <button type="button" class="qcd-cancel-btn" id="btn-confirm-cancel">
                  Редагувати відповіді
                </button>
                <button type="button" class="qcd-confirm-btn" id="btn-confirm-proceed">
                  Так, перевірити
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      this.questions.forEach((q, idx) => {
        if (q.type !== 'input') this.renderQuestionOptions(idx);
      });

      this.el.querySelectorAll('.quiz-text-input').forEach(inp => {
        inp.addEventListener('input', () => {
          this.answers[+inp.dataset.q] = inp.value.trim();
          this.updateSubmitButtonState();
        });
      });
      this.updateSubmitButtonState();

      document.getElementById('quiz-backdrop')?.addEventListener('click', () => this.close());
      document.getElementById('quiz-btn-close')?.addEventListener('click', () => this.close());

      this.el.querySelectorAll('[data-qfs]').forEach(btn => {
        btn.addEventListener('click', () => this.setFontScale(+btn.dataset.qfs));
      });

      // Експорт у PDF
      const exportPdf = () => {
        if (window.PdfExport && this.questions?.length) {
          window.PdfExport.openExportDialog({
            subject: this.book?.subject || 'Підручник',
            title: this.pageLabel ? `Тест: ${this.pageLabel}` : 'Тематичний тест',
            grade: '8 клас',
            questions: this.questions
          });
        }
      };
      document.getElementById('quiz-btn-pdf')?.addEventListener('click', exportPdf);
      document.getElementById('btn-quiz-pdf-export')?.addEventListener('click', exportPdf);

      document.getElementById('quiz-btn-submit')?.addEventListener('click', () => this.openConfirm());
      document.getElementById('btn-confirm-cancel')?.addEventListener('click', () => this.closeConfirm());
      document.getElementById('btn-confirm-proceed')?.addEventListener('click', () => this.submitTest());

      document.getElementById('btn-next-page')?.addEventListener('click', () => {
        this.close();
        if (typeof this.onNextPage === 'function') this.onNextPage();
      });

      document.getElementById('btn-retry-quiz')?.addEventListener('click', () => {
        this.answers = new Array(this.questions.length).fill(null);
        this.isSubmitted = false;
        this.render();
        this.applyFontScale();
      });

      document.getElementById('btn-done-reading')?.addEventListener('click', () => this.close());
    }

    /* ЕКРАН НАЛАШТУВАННЯ ТЕСТУ (Центр тестування) з головного екрана */
    async openTestCenterModal(booksList) {
      // Отримуємо список книг
      let subjects = booksList;
      if (!subjects || !subjects.length) {
        try {
          const res = await fetch('books.json');
          const data = await res.json();
          subjects = data.subjects || [];
        } catch {
          subjects = [];
        }
      }

      let modal = document.getElementById('test-center-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'test-center-modal';
        modal.className = 'auth-modal-overlay';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
      }

      modal.innerHTML = `
        <div class="auth-modal-backdrop" id="tc-backdrop"></div>
        <div class="auth-modal-box tc-modal-box" role="dialog" aria-modal="true" aria-labelledby="tc-title">
          <header class="auth-modal-head">
            <span class="auth-head-ico" style="color: #00f0ff">⚡</span>
            <div class="pdf-head-meta">
              <h3 id="tc-title" class="auth-modal-title">Центр тестування</h3>
              <span class="pdf-sub">Генератор тесту на 12 запитань за параграфами</span>
            </div>
            <button type="button" class="auth-modal-close" id="tc-close-btn" aria-label="Закрити">✕</button>
          </header>

          <div class="auth-modal-body">
            <p class="auth-intro">
              Оберіть предмет та діапазон тем. Система автоматично сформує <strong>12 лаконічних завдань</strong> для проходження онлайн або завантаження у PDF.
            </p>

            <div class="tc-form">
              <div class="pdf-cfg-group">
                <label class="pdf-cfg-label" for="tc-subject-select">Предмет:</label>
                <select id="tc-subject-select" class="pdf-select">
                  ${subjects.map(s => `<option value="${s.slug}">${s.subject} (${s.group})</option>`).join('')}
                </select>
              </div>

              <div class="tc-range-grid">
                <div class="pdf-cfg-group">
                  <label class="pdf-cfg-label" for="tc-from">З параграфа (або теми):</label>
                  <select id="tc-from" class="pdf-select"></select>
                </div>
                <div class="pdf-cfg-group">
                  <label class="pdf-cfg-label" for="tc-to">По параграф (або тему):</label>
                  <select id="tc-to" class="pdf-select"></select>
                </div>
              </div>

              <div class="tc-stats-box" id="tc-stats-box">
                <span class="tc-pulse-dot"></span>
                <span id="tc-stats-text">Завантаження змісту...</span>
              </div>

              <div class="auth-actions" style="margin-top: 14px;">
                <button type="button" class="auth-submit-btn" id="btn-tc-start-quiz">
                  <span>⚡ Почати тест</span>
                  <span class="cy-arr">→</span>
                </button>
                <button type="button" class="auth-cancel-btn" id="btn-tc-export-pdf" title="Експортувати цей діапазон у PDF">
                  📄 Завантажити в PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      `;

      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('auth-modal-open');

      const closeTc = () => {
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = '';
        document.body.classList.remove('auth-modal-open');
      };

      document.getElementById('tc-backdrop')?.addEventListener('click', closeTc);
      document.getElementById('tc-close-btn')?.addEventListener('click', closeTc);

      // Логіка оновлення параграфів при зміні предмета
      const subjSelect = document.getElementById('tc-subject-select');
      const fromSelect = document.getElementById('tc-from');
      const toSelect = document.getElementById('tc-to');
      const statsText = document.getElementById('tc-stats-text');

      let currentTheses = null;
      let currentBook = null;

      const loadSubjectParagraphs = async (slug) => {
        currentBook = subjects.find(s => s.slug === slug);
        statsText.textContent = 'Аналіз конспектів та тем...';

        try {
          const res = await fetch(`books/${slug}/theses.json`);
          const data = await res.json();
          currentTheses = data.pages || {};

          // Знаходимо параграфи з позначкою §
          const pNums = [];
          for (const t of Object.values(currentTheses)) {
            if (t.title) {
              const m = t.title.match(/§\s*(\d+)/);
              if (m) pNums.push(parseInt(m[1], 10));
            }
          }

          fromSelect.innerHTML = '';
          toSelect.innerHTML = '';

          if (pNums.length) {
            const minP = 1;
            const maxP = Math.max(...pNums);

            for (let i = minP; i <= maxP; i++) {
              fromSelect.add(new Option(`§ ${i}`, String(i)));
              toSelect.add(new Option(`§ ${i}`, String(i)));
            }

            fromSelect.value = String(minP);
            toSelect.value = String(Math.min(minP + 4, maxP));
            statsText.textContent = `Доступно ${maxP} параграфів · Формат: 12 питань з 4 варіантами (А, Б, В, Г)`;
          } else {
            // Предмети без позначки § (за темами / сторінками)
            const pagesCount = currentBook?.pages || 200;
            const step = 20;
            for (let p = 1; p <= pagesCount; p += step) {
              const endP = Math.min(p + step - 1, pagesCount);
              fromSelect.add(new Option(`с. ${p}`, String(p)));
              toSelect.add(new Option(`с. ${endP}`, String(endP)));
            }
            toSelect.value = String(Math.min(60, pagesCount));
            statsText.textContent = `Тематичний діапазон · Формат: 12 запитань (А, Б, В, Г)`;
          }
        } catch {
          statsText.textContent = 'Конспект завантажено · Готово до тестування';
        }
      };

      subjSelect.addEventListener('change', () => loadSubjectParagraphs(subjSelect.value));
      await loadSubjectParagraphs(subjSelect.value);

      // Кнопка "Почати тест"
      document.getElementById('btn-tc-start-quiz')?.addEventListener('click', () => {
        closeTc();
        const pFrom = fromSelect.value;
        const pTo = toSelect.value;
        const rangeLabel = fromSelect.selectedOptions[0]?.text.includes('§')
          ? `${fromSelect.selectedOptions[0].text} – ${toSelect.selectedOptions[0].text}`
          : `${fromSelect.selectedOptions[0].text} – ${toSelect.selectedOptions[0].text}`;

        this.openRangeQuiz({
          book: currentBook,
          paragraphFrom: pFrom,
          paragraphTo: pTo,
          allTheses: currentTheses,
          rangeLabel
        });
      });

      // Кнопка "Завантажити в PDF"
      document.getElementById('btn-tc-export-pdf')?.addEventListener('click', () => {
        closeTc();
        const pFrom = fromSelect.value;
        const pTo = toSelect.value;
        const rangeLabel = fromSelect.selectedOptions[0]?.text.includes('§')
          ? `${fromSelect.selectedOptions[0].text} – ${toSelect.selectedOptions[0].text}`
          : `${fromSelect.selectedOptions[0].text} – ${toSelect.selectedOptions[0].text}`;

        const generatedQs = generateQuestionsForRange(currentBook, pFrom, pTo, currentTheses);

        if (window.PdfExport) {
          window.PdfExport.openExportDialog({
            subject: currentBook?.subject || 'Підручник',
            title: `Тематичний тест: ${rangeLabel}`,
            grade: '8 клас',
            questions: generatedQs
          });
        }
      });
    }
  }

  window.Quiz = new QuizEngine();
  window.Quiz.genForRange = generateQuestionsForRange;
})();
