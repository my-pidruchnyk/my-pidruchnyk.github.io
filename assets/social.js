/* «Ми в соцмережах» — кнопка в шапці головної (поруч із «Вхід для вчителя»).
   Натискання відкриває меню з вибором: канал із новинами або чат для пропозицій.
   Розмітку вставляє app.js (window.Social.html()), усі події — тут, делеговано (головна перемальовується через innerHTML).
   Стилі — у кінці assets/app.css (кольори з поточної теми через --cy-*). */
(() => {
  'use strict';

  const LINKS = [
    {
      id: 'channel',
      href: 'https://t.me/mypidruchnyk_ua',
      ico: '📢',
      title: 'Канал з новинами',
      note: 'Оновлення сайту, гайди й поради',
    },
    {
      id: 'chat',
      href: 'https://t.me/+LvAKNmPzuSFkNDZi',
      ico: '💬',
      title: 'Чат — запропонувати ідею',
      note: 'Пропозиції, питання, помилки в тезах',
    },
  ];

  // логотип Telegram: паперовий літачок на блакитному колі
  const TG_LOGO = `
    <svg class="soc-logo" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <circle cx="12" cy="12" r="12" fill="#2aabee"/>
      <path fill="#fff" d="M5.4 11.8l10.9-4.2c.5-.2.95.12.8.86l-1.86 8.76c-.13.62-.5.77-1.02.48l-2.8-2.07-1.36 1.31c-.15.15-.28.28-.57.28l.2-2.86 5.2-4.7c.23-.2-.05-.32-.35-.12l-6.43 4.05-2.77-.87c-.6-.19-.61-.6.13-.89z"/>
    </svg>`;

  function html() {
    return `
      <div class="soc-wrap">
        <button type="button" class="cy-soc-btn" id="btn-soc" aria-haspopup="menu" aria-expanded="false" aria-controls="soc-menu"
                title="Ми в соцмережах">
          ${TG_LOGO}<span class="t-txt">Ми в соцмережах</span>
        </button>
        <div class="soc-menu" id="soc-menu" role="menu" aria-label="Ми в Telegram" hidden>
          <div class="soc-head">${TG_LOGO}<span>Ми в Telegram</span></div>
          ${LINKS.map((l, i) => `
            <a class="soc-item" role="menuitem" href="${l.href}" target="_blank" rel="noopener" data-soc="${l.id}" style="--i:${i}">
              <span class="soc-ico" aria-hidden="true">${l.ico}</span>
              <span class="soc-txt"><b>${l.title}</b><small>${l.note}</small></span>
              <span class="soc-go" aria-hidden="true">↗</span>
            </a>`).join('')}
        </div>
      </div>`;
  }

  const btn = () => document.getElementById('btn-soc');
  const menu = () => document.getElementById('soc-menu');
  const isOpen = () => btn()?.getAttribute('aria-expanded') === 'true';

  function open() {
    const b = btn(), m = menu();
    if (!b || !m) return;
    b.setAttribute('aria-expanded', 'true');
    m.hidden = false;
    requestAnimationFrame(() => m.classList.add('open'));
    m.querySelector('.soc-item')?.focus({ preventScroll: true });
  }

  function close(focusBtn = false) {
    const b = btn(), m = menu();
    if (!b || !m || !isOpen()) return;
    b.setAttribute('aria-expanded', 'false');
    m.classList.remove('open');
    setTimeout(() => { if (!m.classList.contains('open')) m.hidden = true; }, 220);
    if (focusBtn) b.focus();
  }

  // клік повз відкрите меню лише закриває його і далі НЕ проходить
  // (інакше той самий клік відкрив би картку предмета під курсором) — як у меню тем
  document.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null;
    if (!isOpen() || t?.closest('#soc-menu, #btn-soc')) return;
    e.preventDefault();
    e.stopPropagation();
    close();
  }, true);

  document.addEventListener('click', e => {
    const t = e.target instanceof Element ? e.target : null;
    if (t?.closest('#btn-soc')) { isOpen() ? close() : open(); return; }
    if (t?.closest('.soc-item')) setTimeout(() => close(), 150);  // посилання відкривається в новій вкладці
  });

  document.addEventListener('keydown', e => {
    if (!isOpen()) return;
    if (e.key === 'Escape') { e.preventDefault(); close(true); return; }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const items = [...document.querySelectorAll('.soc-item')];
      const i = items.indexOf(document.activeElement);
      const n = e.key === 'Home' ? 0 : e.key === 'End' ? items.length - 1
        : (i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      e.preventDefault();
      items[n].focus();
    }
  });

  window.Social = { html, open, close, links: LINKS };
})();
