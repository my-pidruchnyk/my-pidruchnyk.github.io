/* Модуль тестування знань до сторінок підручника (Quiz).
   Дозволяє учневі перевірити засвоєння конспекту в інтерактивному форматі:
   - Відкриття за кнопкою без перешкод для читання
   - Зміна масштабу шрифту (кнопки А− / А+)
   - Вільна зміна відповідей до моменту підтвердження
   - Вікно-попередження перед завершенням тесту
   - Підсвічування правильних (зелений) та неправильних (червоний) відповідей
   - Детальний розбір кожної помилки під неправильним варіантом
   - Фінальний екран з переходом до наступної сторінки */
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

  // Перемішування масиву без мутації оригіналу
  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Допоміжна функція для створення коротких, лаконічних формулювань
  function shortText(text, max = 68) {
    if (!text) return '';
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 25 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  /* Генератор 12 лаконічних запитань з конспекту сторінки та теми */
  function generateQuestions(theses, allTheses, pageNum) {
    if (!theses) return [];

    // Якщо в конспекті вже є 12 готових авторських тестів
    if (Array.isArray(theses.tests) && theses.tests.length === 12) return theses.tests;

    const TARGET_COUNT = 12;
    const questions = [];
    const usedTitles = new Set();

    // Збираємо базу понять, тез і формул з поточної сторінки та всього підручника
    const curTerms = Array.isArray(theses.terms) ? [...theses.terms] : [];
    const curPoints = Array.isArray(theses.points) ? [...theses.points] : [];
    const curFormulas = Array.isArray(theses.formulas) ? [...theses.formulas] : [];

    const poolTerms = [];
    const poolPoints = [];
    const poolFormulas = [];

    if (allTheses) {
      // Спочатку сторінки поблизу (той самий параграф / розділ)
      const curP = parseInt(pageNum, 10) || 1;
      const pagesSorted = Object.keys(allTheses).map(n => parseInt(n, 10)).filter(Boolean)
        .sort((a, b) => Math.abs(a - curP) - Math.abs(b - curP));

      for (const p of pagesSorted) {
        const t = allTheses[String(p)];
        if (!t) continue;
        if (Array.isArray(t.terms)) {
          for (const item of t.terms) {
            if (item.term && item.def) poolTerms.push(item);
          }
        }
        if (Array.isArray(t.points)) {
          for (const pt of t.points) {
            if (pt && pt.length > 15) poolPoints.push(pt);
          }
        }
        if (Array.isArray(t.formulas)) {
          for (const f of t.formulas) {
            if (f) poolFormulas.push(f);
          }
        }
      }
    }

    // Резервні терміни та визначення, якщо в підручнику мало даних
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

    // 1. Питання типу "Визначення → Термін" (короткі варіанти відповідей з 1-2 слів, до 4 шт.)
    const termsToUse = [...curTerms, ...poolTerms];
    for (const item of termsToUse) {
      if (questions.filter(q => q.id.startsWith('q_term_')).length >= 4 || questions.length >= TARGET_COUNT) break;
      const qTitle = `Який термін означає: «${shortText(item.def, 58)}»?`;
      if (usedTitles.has(qTitle)) continue;

      const correctTerm = item.term;
      const dists = [];
      for (const other of shuffle(poolTerms)) {
        if (dists.length >= 3) break;
        if (other.term !== correctTerm && !dists.includes(other.term)) {
          dists.push(other.term);
        }
      }
      while (dists.length < 3) dists.push(`Термін ${dists.length + 1}`);

      const opts = shuffle([correctTerm, ...dists.slice(0, 3)]);
      usedTitles.add(qTitle);
      questions.push({
        id: `q_term_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: opts.indexOf(correctTerm),
        explanation: `Правильно: «${item.term}». Визначення: ${item.def}.`
      });
    }

    // 2. Лаконічні питання за тезами теми (завжди 4 варіанти відповідей)
    const pointsToUse = [...curPoints, ...poolPoints];
    for (let i = 0; i < pointsToUse.length; i++) {
      if (questions.filter(q => q.id.startsWith('q_tf_')).length >= 4 || questions.length >= TARGET_COUNT) break;
      const pt = pointsToUse[i];
      let statement = shortText(pt, 65);
      const isTrue = (i % 3 !== 2);
      let qTitle;

      if (isTrue) {
        qTitle = `Чи правильне твердження: «${statement}»?`;
        if (usedTitles.has(qTitle)) continue;
        usedTitles.add(qTitle);
        questions.push({
          id: `q_tf_${questions.length + 1}`,
          title: qTitle,
          options: [
            'Так, це твердження повністю правильне',
            'Ні, це твердження є помилковим',
            'Це твердження стосується іншої теми',
            'Це твердження діє лише як виняток'
          ],
          correctIndex: 0,
          explanation: `Це твердження повністю правильне: «${pt}».`
        });
      } else {
        qTitle = `«${statement}» — чи це твердження помилкове?`;
        if (usedTitles.has(qTitle)) continue;
        usedTitles.add(qTitle);
        questions.push({
          id: `q_tf_${questions.length + 1}`,
          title: qTitle,
          options: [
            'Ні, твердження є повністю вірним',
            'Так, це твердження помилкове',
            'Твердження стосується зовсім іншого розділу',
            'Твердження суперечить основним законам'
          ],
          correctIndex: 0,
          explanation: `Це твердження насправді є вірним: «${pt}».`
        });
      }
    }

    // 3. Формули (до 2 шт.)
    const formulasToUse = [...curFormulas, ...poolFormulas];
    for (const f of formulasToUse) {
      if (questions.filter(q => q.id.startsWith('q_form_')).length >= 2 || questions.length >= TARGET_COUNT) break;
      const qTitle = 'Яка формула стосується цієї теми?';
      if (usedTitles.has(qTitle)) continue;
      const dists = [];
      for (const otherF of shuffle(poolFormulas)) {
        if (dists.length >= 3) break;
        if (otherF !== f && !dists.includes(otherF)) dists.push(otherF);
      }
      while (dists.length < 3) dists.push(`x = y · ${dists.length + 2}`);
      const opts = shuffle([f, ...dists.slice(0, 3)]);
      usedTitles.add(qTitle);
      questions.push({
        id: `q_form_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: opts.indexOf(f),
        explanation: `Формула теми: ${f}.`
      });
    }

    // 4. Питання типу "Термін → Визначення" (лаконічне пояснення, до 3 шт.)
    for (const item of termsToUse) {
      if (questions.filter(q => q.id.startsWith('q_def_')).length >= 3 || questions.length >= TARGET_COUNT) break;
      const qTitle = `«${item.term}» — це:`;
      if (usedTitles.has(qTitle)) continue;

      const correctDef = shortText(item.def, 45);
      const dists = [];
      for (const other of shuffle(poolTerms)) {
        if (dists.length >= 3) break;
        const d = shortText(other.def, 45);
        if (d !== correctDef && !dists.includes(d)) dists.push(d);
      }
      while (dists.length < 3) dists.push(`Параметр стану системи №${dists.length + 1}`);

      const opts = shuffle([correctDef, ...dists.slice(0, 3)]);
      usedTitles.add(qTitle);
      questions.push({
        id: `q_def_${questions.length + 1}`,
        title: qTitle,
        options: opts,
        correctIndex: opts.indexOf(correctDef),
        explanation: `Згідно з темою: «${item.term}» — це ${item.def}.`
      });
    }

    // 5. Питання на вибір ключової тези до заповнення 12
    for (const pt of pointsToUse) {
      if (questions.length >= TARGET_COUNT) break;
      const qTitle = 'Оберіть правильний факт з теми:';
      const correctOpt = shortText(pt, 50);
      const dists = [];
      for (const other of shuffle(poolPoints)) {
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

    // Гарантуємо, що кожне питання має рівно 4 варіанти (А, Б, В, Г)
    for (const q of questions) {
      while (q.options.length < 4) {
        q.options.push(`Додатковий варіант ${q.options.length + 1}`);
      }
    }

    // Гарантуємо рівно 12 запитань
    return questions.slice(0, TARGET_COUNT);
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
      this.answers = []; // збережені вибори користувача: [optionIndex, ...]
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
          // Якщо відкрите вікно підтвердження — закриваємо його, інакше закриваємо весь тест
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
      if (Array.isArray(theses.tests) && theses.tests.length) return true;
      if (Array.isArray(theses.test) && theses.test.length) return true;
      if (Array.isArray(theses.points) && theses.points.length) return true;
      if (Array.isArray(theses.terms) && theses.terms.length) return true;
      return false;
    }

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

    close() {
      this.active = false;
      this.el.setAttribute('aria-hidden', 'true');
      this.el.innerHTML = '';
      document.body.classList.remove('quiz-open');
    }

    selectAnswer(qIndex, optIndex) {
      if (this.isSubmitted) return; // Після перевірки змінювати заборонено
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

      // Прив'язка кліків до варіантів
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
      const count = this.answers.filter(a => a !== null).length;
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

      // Прокрутка до початку результатів
      const wrap = document.getElementById('quiz-scrollable');
      if (wrap) wrap.scrollTop = 0;
    }

    render() {
      const total = this.questions.length;
      const answeredCount = this.answers.filter(a => a !== null).length;
      let score = 0;

      if (this.isSubmitted) {
        score = this.questions.reduce((acc, q, idx) => {
          return acc + (this.answers[idx] === q.correctIndex ? 1 : 0);
        }, 0);
      }

      this.el.innerHTML = `
        <div class="quiz-backdrop" id="quiz-backdrop"></div>
        <div class="quiz-dialog" role="dialog" aria-modal="true" aria-labelledby="quiz-title">
          <header class="quiz-header">
            <div class="quiz-header-meta">
              <span class="quiz-book-tag">${esc(this.book?.subject || 'Підручник')}</span>
              <span class="quiz-page-tag">с. ${esc(this.pageLabel)}</span>
            </div>
            <h2 id="quiz-title" class="quiz-title">
              ${this.isSubmitted ? 'Результати перевірки знань' : 'Тест до матеріалу сторінки'}
            </h2>
            <div class="quiz-header-actions">
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
                <p>Для цієї сторінки тест ще не створено або вона не містить навчального матеріалу.</p>
              </div>
            ` : `
              <div class="quiz-questions-list">
                ${this.questions.map((q, idx) => {
                  const userAnswer = this.answers[idx];
                  const isWrong = this.isSubmitted && userAnswer !== q.correctIndex;
                  const isCorrect = this.isSubmitted && userAnswer === q.correctIndex;

                  return `
                    <section class="quiz-q-card ${isWrong ? 'card-wrong' : ''} ${isCorrect ? 'card-correct' : ''}">
                      <div class="quiz-q-num">
                        <span>Питання ${idx + 1} з ${total}</span>
                        ${this.isSubmitted ? (
                          isCorrect 
                            ? '<span class="q-status-badge ok">✓ Правильно</span>' 
                            : '<span class="q-status-badge err">✗ Помилка</span>'
                        ) : ''}
                      </div>
                      <h3 class="quiz-q-title">${esc(q.title)}</h3>
                      <div class="quiz-options-grid" id="quiz-options-${idx}"></div>
                      
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
                      ? 'Ви блискуче засвоїли матеріал цієї сторінки. Можна сміливо переходити далі!' 
                      : 'Ознайомтеся з детальним розбором вище, щоб заповнити прогалини та краще запам\'ятати тему.'}
                  </p>
                  <div class="qfs-buttons">
                    <button type="button" class="qfs-btn-primary" id="btn-next-page">
                      <span>Перейти до наступної сторінки</span>
                      <span class="qfs-arr">→</span>
                    </button>
                    <button type="button" class="qfs-btn-secondary" id="btn-retry-quiz">
                      ↺ Пройти ще раз
                    </button>
                    <button type="button" class="qfs-btn-ghost" id="btn-done-reading">
                      Повернутися до читання
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

          <!-- Модальне вікно підтвердження відправки на перевірку -->
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

      // Рендеримо варіанти відповідей
      this.questions.forEach((_, idx) => this.renderQuestionOptions(idx));
      this.updateSubmitButtonState();

      // Навішуємо обробники подій
      document.getElementById('quiz-backdrop')?.addEventListener('click', () => this.close());
      document.getElementById('quiz-btn-close')?.addEventListener('click', () => this.close());

      this.el.querySelectorAll('[data-qfs]').forEach(btn => {
        btn.addEventListener('click', () => this.setFontScale(+btn.dataset.qfs));
      });

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
  }

  // Експортуємо глобальний екземпляр
  window.Quiz = new QuizEngine();
})();
