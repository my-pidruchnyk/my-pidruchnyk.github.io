/* 🔊 Озвучення конспекту — вбудований у браузер синтезатор мовлення (Web Speech API), безкоштовно й без сервісів.
   Читає те, що видно в конспекті: заголовок, тези, «Запам'ятай» (термін — визначення), приклад; формули пропускає.
   Кожен пункт — окрема фраза (Chrome обриває довгі фрази ~через 15 с), пункт, що звучить, підсвічується.
   Голос: український (uk-UA), якщо він є на пристрої; якщо немає — підказка (Edge і Android зазвичай мають).
   Кнопку малює app.js (renderNotes), сторінка змінилась — читання зупиняється (Speech.stop()). */
(() => {
  'use strict';

  const synth = window.speechSynthesis;
  const available = !!(synth && window.SpeechSynthesisUtterance);
  let voices = [];
  let playing = false;
  let session = 0;          // щоб «хвости» старого читання не підсвічували нову сторінку
  let btn = null;

  const loadVoices = () => { voices = available ? synth.getVoices() : []; };
  if (available) {
    loadVoices();
    synth.addEventListener?.('voiceschanged', loadVoices);
  }

  // найкращий український голос: «Natural/Online» (Edge), потім Google, потім будь-який uk
  function ukVoice() {
    const uk = voices.filter(v => /^uk(-|_|$)/i.test(v.lang));
    const score = v => (/natural|online/i.test(v.name) ? 3 : 0) + (/google/i.test(v.name) ? 2 : 0) + (v.localService ? 0 : 1);
    return uk.sort((a, b) => score(b) - score(a))[0] || null;
  }

  function setBtn(state) {
    if (!btn) return;
    btn.classList.toggle('playing', state);
    btn.setAttribute('aria-pressed', String(state));
    btn.querySelector('.tts-txt').textContent = state ? 'Стоп' : 'Слухати';
    btn.querySelector('.tts-ico').textContent = state ? '⏹' : '🔊';
    btn.title = state ? 'Зупинити читання' : 'Прочитати конспект уголос';
  }

  function clearMarks() {
    document.querySelectorAll('.tts-now').forEach(el => el.classList.remove('tts-now'));
  }

  function stop() {
    session++;
    if (available) synth.cancel();
    playing = false;
    clearMarks();
    setBtn(false);
  }

  // що читаємо: [{el, text}] — у порядку, як у конспекті
  function collect(root) {
    const items = [];
    const push = (el, text) => {
      text = String(text || '').replace(/\s+/g, ' ').replace(/[«»"]/g, '').trim();
      if (text) items.push({ el, text });
    };
    for (const el of root.querySelectorAll('h2, .points li, h3, .terms > div, .example')) {
      if (el.matches('h3')) {
        // заголовки розділів читаємо лише перед тим, що справді читатимемо (не «Формули»)
        if (/формул/i.test(el.textContent)) continue;
        push(el, el.textContent);
      } else if (el.matches('.terms > div')) {
        push(el, `${el.querySelector('dt')?.textContent || ''} — ${el.querySelector('dd')?.textContent || ''}`);
      } else {
        push(el, el.textContent);
      }
    }
    return items;
  }

  function hint(root, text) {
    let h = root.querySelector('.tts-hint');
    if (!h) {
      h = document.createElement('p');
      h.className = 'tts-hint';
      h.setAttribute('role', 'status');
      root.querySelector('.nb-head')?.after(h);
    }
    h.textContent = text;
  }

  function play(button, root) {
    if (!available) { hint(root, 'Цей браузер не вміє читати вголос. Спробуй Chrome, Edge або Safari.'); return; }
    stop();
    btn = button;
    const items = collect(root);
    if (!items.length) return;
    const voice = ukVoice();
    if (!voice) hint(root, 'На цьому пристрої немає українського голосу — читатиме з акцентом. Найкраще звучить у браузері Edge або на Android.');
    const my = ++session;
    playing = true;
    setBtn(true);
    items.forEach((it, i) => {
      const u = new SpeechSynthesisUtterance(it.text);
      u.lang = 'uk-UA';
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onstart = () => {
        if (my !== session) return;
        clearMarks();
        it.el.classList.add('tts-now');
        it.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      };
      if (i === items.length - 1) u.onend = () => { if (my === session) stop(); };
      u.onerror = e => { if (my === session && e.error !== 'interrupted' && e.error !== 'canceled') stop(); };
      synth.speak(u);
    });
  }

  function toggle(button, root) {
    if (playing && btn === button) stop();
    else play(button, root);
  }

  // пішли зі сторінки / сховали вкладку надовго — не говоримо в порожнечу
  window.addEventListener('pagehide', stop);

  window.Speech = { available, toggle, stop, get playing() { return playing; } };
})();
