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

  /* ---------- Банк помилок: localStorage `p8:mistakes` ----------
     Кожне неправильно розв'язане питання (з будь-якого тесту) зберігається один раз; правильна відповідь
     у режимі «Банк помилок» одразу прибирає його з банку. Ключ проти дублів — предмет + текст питання +
     правильна відповідь (id питань генеруються заново щоразу, а порядок варіантів перемішується). */
  const MB_KEY = 'mistakes';
  const norm = s => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
  const isAnswered = a => a !== null && a !== undefined && String(a).trim() !== '';

  // одна перевірка «правильно / ні» для всього модуля (та сама, що й у результатах тесту)
  function isAnswerCorrect(q, ans) {
    if (q.type === 'input') {
      // однаковими вважаємо різні апострофи (' ’ ʼ `), «е/ё»-подібні дрібниці не чіпаємо;
      // ігноруємо крапку/пробіли в кінці й подвійні пробіли — у тезах трапляються різні написання
      const clean = s => String(s ?? '').toLowerCase().replace(/[’ʼ`‘´]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!,;:]+$/, '');
      const user = clean(ans);
      const exp = clean(q.expectedAnswer);
      return user.length > 0 && user === exp;
    }
    return ans === q.correctIndex;
  }

  const correctTextOf = q => q.type === 'input' ? String(q.expectedAnswer ?? '') : String(q.options?.[q.correctIndex] ?? '');

  // 1 питання, 2–4 питання, 5+ питань (11–14 — питань)
  function questionsWord(n) {
    const d = n % 10, h = n % 100;
    return (d === 1 && h !== 11) || (d >= 2 && d <= 4 && (h < 12 || h > 14)) ? 'питання' : 'питань';
  }

  const MistakeBank = {
    all() { const v = store.get(MB_KEY); return Array.isArray(v) ? v : []; },
    count() { return this.all().length; },
    keyOf(subject, q) { return norm(subject) + '|' + norm(q.title) + '|' + norm(correctTextOf(q)); },
    write(list) { store.set(MB_KEY, list); this.notify(); },

    /* додати помилки; повертає, скільки з них нових (решта вже були в банку — оновлюємо, не дублюємо) */
    add(entries) {
      const list = this.all();
      const byKey = new Map(list.map(e => [e.key, e]));
      let fresh = 0;
      for (const e of entries) {
        const old = byKey.get(e.key);
        if (old) {
          Object.assign(old, e, { addedAt: old.addedAt, wrongCount: (old.wrongCount || 1) + 1, lastWrongAt: Date.now() });
        } else {
          const rec = { ...e, wrongCount: 1, addedAt: Date.now(), lastWrongAt: Date.now() };
          list.push(rec); byKey.set(e.key, rec); fresh++;
        }
      }
      if (entries.length) this.write(list);
      return fresh;
    },
    remove(keys) {
      if (!keys.length) return;
      const drop = new Set(keys);
      this.write(this.all().filter(e => !drop.has(e.key)));
    },
    bumpWrong(keys) {
      if (!keys.length) return;
      const hit = new Set(keys);
      this.write(this.all().map(e => hit.has(e.key) ? { ...e, wrongCount: (e.wrongCount || 1) + 1, lastWrongAt: Date.now() } : e));
    },
    clear() { this.write([]); },

    /* { предмет: кількість } — для вікна вибору */
    bySubject() {
      const m = new Map();
      for (const e of this.all()) m.set(e.subject, (m.get(e.subject) || 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'uk'));
    },

    badgeText(n = this.count()) { return n ? `${n} ${questionsWord(n)}` : 'Порожньо'; },
    footText(n = this.count()) { return n ? 'Повторити помилки' : 'Помилок поки немає'; },

    /* оновити лічильники на сторінці (картка на головній) без перемальовування */
    notify() {
      const n = this.count();
      document.querySelectorAll('[data-mistakes-badge]').forEach(el => {
        el.textContent = this.badgeText(n);
        el.classList.toggle('has', n > 0);
      });
      document.querySelectorAll('[data-mistakes-foot]').forEach(el => { el.textContent = this.footText(n); });
      window.dispatchEvent(new CustomEvent('p8:mistakes-changed', { detail: { count: n } }));
    },
  };
  // зміни з іншої вкладки
  window.addEventListener('storage', e => { if (e.key === 'p8:' + MB_KEY) MistakeBank.notify(); });

  function shortText(text, max = 68) {
    if (!text) return '';
    const clean = String(text).replace(/\s+/g, ' ').trim();
    if (clean.length <= max) return clean;
    const cut = clean.slice(0, max);
    const lastSpace = cut.lastIndexOf(' ');
    return (lastSpace > 25 ? cut.slice(0, lastSpace) : cut) + '…';
  }

  /* Хибне твердження з правдивого: термін із тез, що трапляється в реченні, підмінюємо іншим терміном
     того ж підручника. Повертає { text, swappedFrom, swappedTo } або null (у реченні немає відомого терміна).
     Підміна має бути в перших ~55 символах — питання показує твердження, обрізане до 65. */
  const LETTER = /[\p{L}\p{N}]/u;
  const PLAIN_TERM = /^[\p{L}][\p{L}\s'’-]*$/u;
  function falsify(pt, terms) {
    if (!pt) return null;
    const low = pt.toLowerCase();
    // лише «чисті» терміни з літер (без «…», ком, дужок) — інакше підміна дає уламки на кшталт «however, …»
    const cands = terms.filter(t => t && t.term && t.term.trim().length >= 4 && t.term.length <= 40 && PLAIN_TERM.test(t.term.trim()));
    for (const t of shuffle(cands)) {
      const word = t.term.trim();
      const idx = low.indexOf(word.toLowerCase());
      if (idx < 0 || idx > 55) continue;
      const before = idx ? low[idx - 1] : ' ';
      const after = low[idx + word.length] || ' ';
      if (LETTER.test(before) || LETTER.test(after)) continue;          // лише ціле слово/вираз
      const other = shuffle(cands).find(o => {
        const w = o.term.trim().toLowerCase();
        return w !== word.toLowerCase() && !low.includes(w);
      });
      if (!other) return null;
      const orig = pt.slice(idx, idx + word.length);
      let repl = other.term.trim();
      const isAcronym = repl.length > 1 && repl[1] === repl[1].toUpperCase() && repl[1] !== repl[1].toLowerCase();
      if (!isAcronym) {
        const upper = orig[0] === orig[0].toUpperCase() && orig[0] !== orig[0].toLowerCase();
        repl = (upper ? repl[0].toUpperCase() : repl[0].toLowerCase()) + repl.slice(1);
      }
      return { text: pt.slice(0, idx) + repl + pt.slice(idx + word.length), swappedFrom: orig, swappedTo: repl };
    }
    return falsifyNumber(pt);
  }

  /* Запасний спосіб: змінити число в реченні (рік, параграф, кількість): «1648» → «1658», «§ 16» → «§ 18». */
  function falsifyNumber(pt) {
    const re = /\d+/g;
    let m;
    while ((m = re.exec(pt))) {
      if (m.index > 55) break;
      const prev = pt[m.index - 1] || '', next = pt[m.index + m[0].length] || '';
      if (prev === ',' || prev === '.' || next === ',' && /\d/.test(pt[m.index + m[0].length + 1] || '')) continue;  // не чіпаємо дроби 3,14
      const n = parseInt(m[0], 10);
      const steps = m[0].length === 4 ? [10, 20, 30, 50] : n >= 20 ? [2, 3, 5, 10] : [1, 2, 3];
      let v = n + (Math.random() < 0.5 ? -1 : 1) * steps[Math.floor(Math.random() * steps.length)];
      if (v < 0 || v === n) v = n + steps[0];
      const repl = String(v);
      return { text: pt.slice(0, m.index) + repl + pt.slice(m.index + m[0].length), swappedFrom: m[0], swappedTo: repl };
    }
    return null;
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
    // Загальні терміни — ЛИШЕ як неправильні варіанти, коли власних замало; питаннями вони не стають
    // (інакше в тесті з літератури з'являлось «Який термін означає: кількісна характеристика…» → «Величина»).
    const fillerTerms = fallbackTerms.filter(fb => !poolTerms.some(t => t.term === fb.term));

    const cTerms = shuffle(curTerms);
    const pTerms = shuffle(poolTerms);
    const distTerms = () => shuffle(pTerms).concat(shuffle(fillerTerms));  // джерело неправильних варіантів
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

    // Без «запасних» загальних слів (Енергія, Рівняння…): вони потрапляли в тести не з того предмета.
    // Якщо однослівних термінів замало — відкритих завдань буде менше, решту доберуть інші типи.
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

    // 3–7. Класичні питання. Раніше кожен тип перебирав УСІ терміни книжки по черзі, тож 12 місць
    // займали «Який термін означає…» (переважно з ІНШИХ сторінок), а твердження, формули й факти сторінки
    // до тесту не доходили. Тепер: спершу матеріал ЦІЄЇ сторінки/діапазону, типи чергуються по колу;
    // питання з решти книжки — лише щоб добрати до потрібної кількості.
    const TF_YES = 'Так, твердження правильне';
    const TF_NO = 'Ні, твердження помилкове';
    const TF_EXTRA = ['Правильне лише частково', 'У підручнику про це не сказано'];

    // Визначення → Термін
    function* genDefTerm(terms) {
      for (const item of terms) {
        const qTitle = `Який термін означає: «${shortText(item.def, 58)}»?`;
        if (seenTitles.has(qTitle)) continue;
        const correctTerm = item.term;
        const dists = [];
        for (const other of distTerms()) {
          if (dists.length >= 3) break;
          if (other.term !== correctTerm && !dists.includes(other.term)) dists.push(other.term);
        }
        while (dists.length < 3) dists.push(`Термін ${dists.length + 1}`);
        const opts = shuffle([correctTerm, ...dists.slice(0, 3)]);
        seenTitles.add(qTitle);
        yield {
          id: `q_term_${questions.length + 1}`,
          title: qTitle,
          options: opts,
          correctIndex: opts.indexOf(correctTerm),
          explanation: `Правильно: «${item.term}». Визначення: ${item.def}.`
        };
      }
    }

    // «Чи правильне твердження…»: раніше відповідь завжди А і твердження завжди правдиве
    // («завжди тисни „Так“» працювало). Тепер ~половина тверджень хибні (у реченні з тез термін підмінено
    // іншим терміном того ж підручника), варіанти перемішуються.
    // службові рядки тез («Впр. 7: …», «№ 1 — …», «Заставка розділу…») — не матеріал для «так/ні»
    const META_POINT = /^\s*(впр\.|вправ|№|завдання|заставка|запитання|питання|unit\s*\d|розділ\s+\d+\s*[:(«]|рубрика|ілюстрац|фото|малюнок|обкладинк)/i;
    // баланс «так/ні» на весь тест: хибне — коли його вдається скласти й хибних не більше, ніж правдивих;
    // зайві правдиві пропускаємо (інакше «Так» був правильним у ~80–90% питань)
    let tfTrue = 0, tfFalse = 0;
    function* genTrueFalse(points) {
      for (const pt of points) {
        if (META_POINT.test(pt)) continue;
        const fake = tfFalse <= tfTrue ? falsify(pt, pTerms) : null;
        if (!fake && tfTrue > tfFalse) continue;
        const isTrue = !fake;
        const qTitle = `Чи правильне твердження: «${shortText(fake ? fake.text : pt, 65)}»?`;
        if (seenTitles.has(qTitle)) continue;
        seenTitles.add(qTitle);
        if (isTrue) tfTrue++; else tfFalse++;
        const correct = isTrue ? TF_YES : TF_NO;
        const opts = shuffle([TF_YES, TF_NO, ...TF_EXTRA]);
        yield {
          id: `q_tf_${questions.length + 1}`,
          title: qTitle,
          options: opts,
          correctIndex: opts.indexOf(correct),
          explanation: isTrue
            ? `Твердження правильне: «${pt}».`
            : `Твердження помилкове: замість «${fake.swappedTo}» має бути «${fake.swappedFrom}». У тезах: «${pt}».`
        };
      }
    }

    // Формули теми (ключ проти дублів — з формулою: раніше однаковий заголовок пропускав лише одну)
    function* genFormula(formulas) {
      for (const f of formulas) {
        const qTitle = 'Яка формула стосується цієї теми?';
        const formulaKey = `${qTitle}:${f}`;
        if (seenTitles.has(formulaKey)) continue;
        const dists = [];
        for (const otherF of shuffle(pFormulas)) {
          if (dists.length >= 3) break;
          if (otherF !== f && !dists.includes(otherF)) dists.push(otherF);
        }
        if (dists.length < 3) continue;  // без вигаданих «x = y · 2»: замало справжніх формул — пропускаємо
        const opts = shuffle([f, ...dists.slice(0, 3)]);
        seenTitles.add(formulaKey);
        yield {
          id: `q_form_${questions.length + 1}`,
          title: qTitle,
          options: opts,
          correctIndex: opts.indexOf(f),
          explanation: `Формула теми: ${f}.`
        };
      }
    }

    // Термін → Визначення
    function* genTermDef(terms) {
      for (const item of terms) {
        const qTitle = `«${item.term}» — це:`;
        if (seenTitles.has(qTitle)) continue;
        const correctDef = shortText(item.def, 45);
        const dists = [];
        for (const other of distTerms()) {
          if (dists.length >= 3) break;
          const d = shortText(other.def, 45);
          if (d !== correctDef && !dists.includes(d)) dists.push(d);
        }
        while (dists.length < 3) dists.push(`Параметр стану системи №${dists.length + 1}`);
        const opts = shuffle([correctDef, ...dists.slice(0, 3)]);
        seenTitles.add(qTitle);
        yield {
          id: `q_def_${questions.length + 1}`,
          title: qTitle,
          options: opts,
          correctIndex: opts.indexOf(correctDef),
          explanation: `Згідно з темою: «${item.term}» — це ${item.def}.`
        };
      }
    }

    // Ключовий факт ЦІЄЇ теми серед фактів з інших тем
    function* genFact(points) {
      for (const pt of points) {
        const qTitle = 'Оберіть правильний факт з теми:';
        const correctOpt = shortText(pt, 50);
        const titleKey = `${qTitle}:${correctOpt}`;
        if (seenTitles.has(titleKey)) continue;
        const dists = [];
        for (const other of shuffle(pPoints)) {
          if (dists.length >= 3) break;
          const d = shortText(other, 50);
          if (d !== correctOpt && !dists.includes(d) && !points.includes(other)) dists.push(d);
        }
        if (dists.length < 3) continue;
        seenTitles.add(titleKey);
        const opts = shuffle([correctOpt, ...dists.slice(0, 3)]);
        yield {
          id: `q_fact_${questions.length + 1}`,
          title: qTitle,
          options: opts,
          correctIndex: opts.indexOf(correctOpt),
          explanation: `Правильне твердження: «${pt}».`
        };
      }
    }

    // по колу: по одному питанню кожного типу, доки не набрали потрібну кількість або типи не вичерпались
    function roundRobin(gens) {
      const active = gens.filter(Boolean);
      while (questions.length < TARGET_COUNT && active.length) {
        for (let i = 0; i < active.length && questions.length < TARGET_COUNT;) {
          const r = active[i].next();
          if (r.done) active.splice(i, 1);
          else { questions.push(r.value); i++; }
        }
      }
    }

    // спершу — матеріал цієї сторінки / діапазону (усі типи)
    roundRobin([genDefTerm(cTerms), genTrueFalse(cPoints), genFormula(cFormulas), genTermDef(cTerms), genFact(cPoints)]);
    // добір — з решти книжки (без «формули/факту цієї теми», бо це вже не ця тема)
    roundRobin([genDefTerm(pTerms), genTrueFalse(pPoints), genTermDef(pTerms)]);

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
      this.mode = 'normal';         // 'mistakes' — проходження «Банку помилок»
      this.sectionLabel = '';       // параграф/сторінка — для запису помилок у банк
      this.bankResult = null;       // підсумок для банку після «Перевірити»
      this.mbSubject = null;        // предмет, обраний у «Банку помилок» (null — усі)

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
      this.onClose = null;
      this.mode = 'normal';
      this.bankResult = null;
      this.sectionLabel = `с. ${this.pageLabel}` + (this.theses?.title ? ` · ${this.theses.title}` : '');

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
    openWithQuestions({ book, questions, rangeLabel, onClose, sectionLabel, mode }) {
      this.book = book;
      this.page = 1;
      this.pageLabel = rangeLabel || '';
      this.theses = null;
      this.allTheses = null;
      this.onNextPage = null;
      this.onClose = onClose || null;
      this.mode = mode || 'normal';
      this.bankResult = null;
      this.sectionLabel = sectionLabel || rangeLabel || '';
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
      this.mode = 'normal';
      this.bankResult = null;
      this.sectionLabel = this.pageLabel;

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
      this.recordToBank();
      this.render();
      this.applyFontScale();

      const wrap = document.getElementById('quiz-scrollable');
      if (wrap) wrap.scrollTop = 0;
    }

    /* Після «Перевірити»: звичайний тест → неправильні відповіді в банк;
       тест з банку → правильно розв'язані одразу видаляються з банку. */
    recordToBank() {
      if (this.mode === 'mistakes') {
        const solved = [], wrongAgain = [];
        this.questions.forEach((q, i) => {
          if (isAnswerCorrect(q, this.answers[i])) solved.push(q.mbKey);
          else if (isAnswered(this.answers[i])) wrongAgain.push(q.mbKey);   // без відповіді — просто лишається
        });
        MistakeBank.remove(solved);
        MistakeBank.bumpWrong(wrongAgain);
        this.bankResult = { mode: 'mistakes', solved: solved.length, left: MistakeBank.count(),
          leftHere: this.mbSubject ? MistakeBank.all().filter(e => e.subject === this.mbSubject).length : MistakeBank.count() };
        return;
      }
      const entries = [];
      this.questions.forEach((q, i) => {
        const ans = this.answers[i];
        if (!isAnswered(ans) || isAnswerCorrect(q, ans)) return;   // зберігаємо лише дані неправильні відповіді
        const subject = q.subjectBlock || this.book?.subject || 'Підручник';
        entries.push({
          key: MistakeBank.keyOf(subject, q),
          subject,
          slug: this.book?.slug || null,
          section: q.sectionBlock || this.sectionLabel || this.pageLabel || '',
          type: q.type === 'input' ? 'input' : 'choice',
          title: q.title,
          options: Array.isArray(q.options) ? [...q.options] : [],
          correctIndex: q.type === 'input' ? null : q.correctIndex,
          correctText: correctTextOf(q),
          expectedAnswer: q.type === 'input' ? q.expectedAnswer : null,
          explanation: q.explanation || '',
        });
      });
      const fresh = MistakeBank.add(entries);
      this.bankResult = { mode: 'normal', wrong: entries.length, fresh, total: MistakeBank.count() };
    }

    /* Тест з «Банку помилок»: усі помилки або одного предмета */
    openMistakes(subject = null) {
      const recs = MistakeBank.all().filter(e => !subject || e.subject === subject);
      if (!recs.length) { this.openMistakesChooser(); return; }
      const questions = recs.map((e, i) => {
        const base = { id: `mb_${i + 1}`, mbKey: e.key, title: e.title, explanation: e.explanation,
          subjectBlock: e.subject, sectionBlock: e.section };
        if (e.type === 'input') return { ...base, type: 'input', expectedAnswer: e.expectedAnswer, options: [] };
        // варіанти перемішуємо заново — щоб не запам'ятовувати «правильна — друга»
        const opts = shuffle(e.options);
        return { ...base, options: opts, correctIndex: opts.indexOf(e.correctText) };
      });
      this.mbSubject = subject;
      this.openWithQuestions({
        book: { subject: subject || 'Усі предмети' },   // мітка 1 — предмет, мітка 2 — «Банк помилок»
        questions,
        rangeLabel: 'Банк помилок',
        mode: 'mistakes',
      });
    }

    /* Вікно вибору: пройти всі помилки або обрати предмет */
    openMistakesChooser() {
      let modal = document.getElementById('mistakes-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mistakes-modal';
        modal.className = 'auth-modal-overlay';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
      }
      const n = MistakeBank.count();
      const subjects = MistakeBank.bySubject();
      modal.innerHTML = `
        <div class="auth-modal-backdrop" id="mb-backdrop"></div>
        <div class="auth-modal-box mb-modal-box" role="dialog" aria-modal="true" aria-labelledby="mb-title">
          <header class="auth-modal-head">
            <span class="auth-head-ico mb-head-ico" aria-hidden="true">🔁</span>
            <div class="pdf-head-meta">
              <h3 id="mb-title" class="auth-modal-title">Банк помилок</h3>
              <span class="pdf-sub">Питання, у яких ви помилились у тестах</span>
            </div>
            <button type="button" class="auth-modal-close" id="mb-close-btn" aria-label="Закрити">✕</button>
          </header>
          <div class="auth-modal-body">
            ${n === 0 ? `
              <div class="mb-empty">
                <div class="mb-empty-ico" aria-hidden="true">🎉</div>
                <p><strong>Поки що помилок немає.</strong></p>
                <p>Пройдіть будь-який тест — питання, на які ви відповісте неправильно, з'являться тут автоматично.
                   Кожне зникне з банку, щойно ви відповісте на нього правильно.</p>
              </div>
              <div class="auth-actions"><button type="button" class="auth-submit-btn" id="mb-ok"><span>Зрозуміло</span></button></div>
            ` : `
              <p class="auth-intro">
                У банку <strong>${n} ${questionsWord(n)}</strong>. Відповісте правильно хоча б раз — питання
                одразу зникне з банку.
              </p>
              <div class="auth-actions">
                <button type="button" class="auth-submit-btn" id="mb-all">
                  <span>🔁 Пройти всі помилки (${n})</span><span class="cy-arr">→</span>
                </button>
              </div>
              ${subjects.length > 1 ? `
                <p class="mb-or">або оберіть предмет:</p>
                <div class="mb-subj-list">
                  ${subjects.map(([s, c]) => `
                    <button type="button" class="mb-subj" data-subject="${esc(s)}">
                      <span class="mb-subj-name">${esc(s)}</span>
                      <span class="mb-subj-count">${c} ${questionsWord(c)}</span>
                    </button>`).join('')}
                </div>` : ''}
              <button type="button" class="mb-clear" id="mb-clear">Очистити банк помилок</button>
            `}
          </div>
        </div>`;

      modal.setAttribute('aria-hidden', 'false');
      document.body.classList.add('auth-modal-open');
      const close = () => {
        modal.setAttribute('aria-hidden', 'true');
        modal.innerHTML = '';
        document.body.classList.remove('auth-modal-open');
        document.removeEventListener('keydown', onKey);
      };
      const onKey = e => { if (e.key === 'Escape') close(); };
      document.addEventListener('keydown', onKey);
      modal.querySelector('#mb-backdrop').addEventListener('click', close);
      modal.querySelector('#mb-close-btn').addEventListener('click', close);
      modal.querySelector('#mb-ok')?.addEventListener('click', close);
      modal.querySelector('#mb-all')?.addEventListener('click', () => { close(); this.openMistakes(null); });
      modal.querySelectorAll('.mb-subj').forEach(b => b.addEventListener('click', () => { close(); this.openMistakes(b.dataset.subject); }));
      modal.querySelector('#mb-clear')?.addEventListener('click', () => {
        if (confirm(`Видалити всі ${n} ${questionsWord(n)} з «Банку помилок»? Цю дію не можна скасувати.`)) {
          MistakeBank.clear();
          close();
        }
      });
      (modal.querySelector('#mb-all') || modal.querySelector('#mb-ok'))?.focus();
    }

    /* Рядок про «Банк помилок» у підсумку тесту */
    bankNoteHTML() {
      const r = this.bankResult;
      if (!r) return '';
      if (r.mode === 'mistakes') {
        const solved = r.solved
          ? `✅ Вивчено й прибрано з банку: <strong>${r.solved} ${questionsWord(r.solved)}</strong>.`
          : 'Цього разу жодне питання не прибрано з банку — спробуйте ще раз.';
        const left = r.left ? ` У банку лишилось: <strong>${r.left} ${questionsWord(r.left)}</strong>.` : ' 🎉 Банк помилок порожній!';
        return `<p class="qfs-bank">${solved}${left}</p>`;
      }
      if (!r.wrong) return '';
      const added = r.fresh
        ? `📌 До «Банку помилок» додано: <strong>${r.fresh} ${questionsWord(r.fresh)}</strong>`
        : '📌 Ці помилки вже є в «Банку помилок»';
      return `<p class="qfs-bank">${added} (усього в банку: ${r.total}). Повторіть їх з головної сторінки — картка «Банк помилок».</p>`;
    }

    /* Рендеринг основного вікна тесту */
    render() {
      const total = this.questions.length;
      const answeredCount = this.answers.filter(a => a !== null && a !== undefined && String(a).trim() !== '').length;
      let score = 0;

      if (this.isSubmitted) {
        score = this.questions.reduce((acc, q, idx) => acc + (isAnswerCorrect(q, this.answers[idx]) ? 1 : 0), 0);
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
                    isCorrect = isAnswerCorrect(q, userAnswer);
                    isWrong = !isCorrect;
                  }

                  return `
                    <section class="quiz-q-card ${isWrong ? 'card-wrong' : ''} ${isCorrect ? 'card-correct' : ''}">
                      <div class="quiz-q-num">
                        <span>Питання ${idx + 1} з ${total}</span>
                        ${isOpen ? '<span class="q-type-badge">Коротка відповідь (1 слово/число)</span>' : ''}
                        ${this.mode === 'mistakes' ? `<span class="q-src-badge">${esc(q.subjectBlock)}${q.sectionBlock ? ' · ' + esc(q.sectionBlock) : ''}</span>` : ''}
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
                  ${this.bankNoteHTML()}
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
                    ${this.mode !== 'mistakes' ? `
                      <button type="button" class="qfs-btn-secondary" id="btn-retry-quiz">
                        ↺ Пройти ще раз
                      </button>
                    ` : (this.bankResult?.leftHere ? `
                      <button type="button" class="qfs-btn-primary" id="btn-retry-quiz">
                        <span>🔁 Пройти залишок (${this.bankResult.leftHere})</span>
                      </button>
                    ` : '')}
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
        // у «Банку помилок» — лише те, що лишилось (розв'язане вже прибрано)
        if (this.mode === 'mistakes') { this.openMistakes(this.mbSubject); return; }
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
  window.Quiz.genForPage = generateQuestions;   // тест однієї сторінки (для перевірок і бота)
  window.MistakeBank = MistakeBank;
})();
