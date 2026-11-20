/* Модуль авторизації вчителів та навігаційних розділів (Auth & Hubs)
   - Авторизація викладача за кодом доступу (збереження сесії в localStorage)
   - Індикація статусу вчителя у шапці сайту
   - Підтримка ролей для майбутнього доступу до PDF-відповідей
   - Навігаційні заглушки для розділів «Тести», «СР», «КР», «Екзамени» */
(() => {
  'use strict';

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem('p8:' + k)); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('p8:' + k, JSON.stringify(v)); } catch {} },
  };

  // Очищення старих сесій (скидання для всіх попередніх користувачів)
  const AUTH_VERSION = 'v2_secure';
  if (store.get('authVersion') !== AUTH_VERSION) {
    store.set('teacherAuth', null);
    store.set('authVersion', AUTH_VERSION);
  }

  // Криптографічний хеш SHA-256 пароля доступу (сам пароль відсутній у вихідному коді)
  const TEACHER_HASH = '7f3e171155610062546e671937aa21571202817591b9121b5d0fe52e0c1ad408';

  async function sha256Hex(str) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }
    // Простий резервний хеш якщо SubtleCrypto недоступний
    let h = 0;
    for (let i = 0; i < str.length; i++) h = ((h << 5) - h + str.charCodeAt(i)) | 0;
    return String(h);
  }

  const HUB_INFO = {
    tests: {
      title: 'Тести до підручників',
      icon: '⚡',
      color: '#00f0ff',
      status: 'Активний розділ',
      desc: 'Інтерактивні експрес-тести (по 12 питань) інтегровані безпосередньо у кожну тему підручника.',
      action: 'До списку предметів ↓',
      isTests: true
    },
    sr: {
      title: 'Самостійні роботи (СР)',
      icon: '📝',
      color: '#7dff4d',
      status: 'Розділ у розробці',
      desc: 'Тренувальні та діагностичні самостійні роботи за окремими темами програми 8 класу.',
      details: 'Для учнів тут незабаром з\'являться інтерактивні завдання. Для авторизованих вчителів — офіційні бланки та відповіді у форматі PDF.'
    },
    kr: {
      title: 'Контрольні роботи (КР)',
      icon: '📊',
      color: '#ff2bd6',
      status: 'Розділ у розробці',
      desc: 'Тематичні та підсумкові контрольні зрізи знань у 2–4 варіантах.',
      details: 'Розділ створюється для зручного контролю та оцінювання. Вчителям буде надано прямий доступ до методичних вказівок та PDF-відповідей.'
    },
    exams: {
      title: 'Екзамени та ДПА',
      icon: '🎓',
      color: '#ffe14d',
      status: 'Розділ у розробці',
      desc: 'Підсумкова атестація, комплексні річні роботи та підготовка до моніторингів.',
      details: 'Матеріали для підсумкової перевірки знань за 8 клас. Відповіді та критерії оцінювання будуть доступні вчителю після авторизації.'
    }
  };

  class TeacherAuthEngine {
    constructor() {
      this.initModalContainer();
      this.initEvents();
    }

    isAuthorized() {
      const s = store.get('teacherAuth');
      return !!(s && s.authorized === true);
    }

    getTeacherData() {
      return store.get('teacherAuth');
    }

    async login(passcode) {
      if (!passcode) return false;
      const clean = String(passcode).trim().toUpperCase();
      const hash = await sha256Hex(clean);
      if (hash === TEACHER_HASH) {
        store.set('teacherAuth', {
          authorized: true,
          role: 'teacher',
          loginTime: Date.now()
        });
        this.updateHeaderButtons();
        return true;
      }
      return false;
    }

    logout() {
      store.set('teacherAuth', null);
      this.updateHeaderButtons();
    }

    initModalContainer() {
      let modal = document.getElementById('auth-hub-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'auth-hub-modal';
        modal.className = 'auth-modal-overlay';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
      }
      this.el = modal;
    }

    initEvents() {
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && this.el && this.el.getAttribute('aria-hidden') === 'false') {
          this.closeModal();
        }
      });
    }

    updateHeaderButtons() {
      const isAuth = this.isAuthorized();
      document.querySelectorAll('.cy-teacher-btn').forEach(btn => {
        btn.classList.toggle('authorized', isAuth);
        const txt = btn.querySelector('.t-txt');
        if (txt) txt.textContent = isAuth ? 'Вчитель ✓' : 'Вхід для вчителя';
        btn.title = isAuth ? 'Кабінет вчителя (авторизовано)' : 'Вхід для вчителя';
      });
    }

    openAuthModal() {
      const isAuth = this.isAuthorized();
      const authData = this.getTeacherData();

      this.el.innerHTML = `
        <div class="auth-modal-backdrop" id="auth-backdrop"></div>
        <div class="auth-modal-box" role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
          <header class="auth-modal-head">
            <span class="auth-head-ico">${isAuth ? '🎓' : '👩‍🏫'}</span>
            <h3 id="auth-modal-title" class="auth-modal-title">
              ${isAuth ? 'Кабінет вчителя' : 'Вхід для вчителя'}
            </h3>
            <button type="button" class="auth-modal-close" id="auth-close-btn" aria-label="Закрити">✕</button>
          </header>

          <div class="auth-modal-body">
            ${isAuth ? `
              <div class="auth-status-card">
                <div class="auth-status-badge">✓ Статус підтверджено</div>
                <h4>Викладач 8 класу</h4>
                <p>Ваша сесія активна. Статус вчителя зберігається на цьому пристрої.</p>
                <div class="auth-privilege-info">
                  <strong>Доступ до матеріалів:</strong>
                  <span>У наступних етапах тут буде активовано прямий доступ до відповідей та розв'язків у PDF до підручників і робіт.</span>
                </div>
              </div>
              <div class="auth-actions">
                <button type="button" class="auth-logout-btn" id="btn-auth-logout">Вийти з кабінету</button>
                <button type="button" class="auth-cancel-btn" id="btn-auth-cancel">Закрити</button>
              </div>
            ` : `
              <p class="auth-intro">
                Введіть код доступу вчителя для отримання статусу викладача та доступу до методичних матеріалів і відповідей у PDF.
              </p>
              <form id="teacher-login-form" class="auth-form" onsubmit="return false;">
                <label for="teacher-code-input" class="auth-label">Код доступу (пароль вчителя):</label>
                <div class="auth-input-wrap">
                  <input type="password" id="teacher-code-input" class="auth-input" placeholder="Введіть код..." autocomplete="current-password" required>
                  <button type="button" class="auth-toggle-pwd" id="auth-toggle-pwd" title="Показати/приховати код">👁</button>
                </div>
                <div class="auth-error-msg" id="auth-error-msg" hidden>Невірний код доступу. Спробуйте ще раз.</div>
                <div class="auth-actions">
                  <button type="submit" class="auth-submit-btn" id="btn-auth-submit">Увійти як вчитель</button>
                  <button type="button" class="auth-cancel-btn" id="btn-auth-cancel">Скасувати</button>
                </div>
              </form>
            `}
          </div>
        </div>
      `;

      this.el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('auth-modal-open');

      document.getElementById('auth-backdrop')?.addEventListener('click', () => this.closeModal());
      document.getElementById('auth-close-btn')?.addEventListener('click', () => this.closeModal());
      document.getElementById('btn-auth-cancel')?.addEventListener('click', () => this.closeModal());

      if (isAuth) {
        document.getElementById('btn-auth-logout')?.addEventListener('click', () => {
          this.logout();
          this.closeModal();
        });
      } else {
        const input = document.getElementById('teacher-code-input');
        input?.focus();

        const form = document.getElementById('teacher-login-form');
        form?.addEventListener('submit', async () => {
          const submitBtn = document.getElementById('btn-auth-submit');
          if (submitBtn) submitBtn.disabled = true;
          const ok = await this.login(input.value);
          if (submitBtn) submitBtn.disabled = false;
          if (ok) {
            this.closeModal();
          } else {
            const err = document.getElementById('auth-error-msg');
            if (err) err.hidden = false;
            input.focus();
            input.select();
          }
        });

        document.getElementById('auth-toggle-pwd')?.addEventListener('click', () => {
          if (input.type === 'password') {
            input.type = 'text';
          } else {
            input.type = 'password';
          }
        });
      }
    }

    openHubModal(hubKey) {
      if (hubKey === 'tests' || hubKey === 'hub-tests') {
        if (window.Quiz?.openTestCenterModal) {
          window.Quiz.openTestCenterModal();
          return;
        }
      }
      const info = HUB_INFO[hubKey];
      if (!info) return;

      this.el.innerHTML = `
        <div class="auth-modal-backdrop" id="hub-backdrop"></div>
        <div class="auth-modal-box" role="dialog" aria-modal="true" aria-labelledby="hub-modal-title" style="--hub-c: ${info.color}">
          <header class="auth-modal-head" style="border-bottom-color: color-mix(in srgb, ${info.color} 35%, transparent);">
            <span class="auth-head-ico" style="color: ${info.color}">${info.icon}</span>
            <h3 id="hub-modal-title" class="auth-modal-title">${info.title}</h3>
            <button type="button" class="auth-modal-close" id="hub-close-btn" aria-label="Закрити">✕</button>
          </header>

          <div class="auth-modal-body">
            <div class="hub-modal-card" style="border-left-color: ${info.color};">
              <span class="hub-modal-tag" style="background: color-mix(in srgb, ${info.color} 20%, transparent); color: ${info.color}; border: 1px solid ${info.color};">
                ${info.status}
              </span>
              <p class="hub-modal-desc">${info.desc}</p>
              ${info.details ? `<p class="hub-modal-details">${info.details}</p>` : ''}
            </div>

            ${info.isTests ? `
              <div class="hub-tests-guide">
                <p><strong>Як пройти тест:</strong></p>
                <ol>
                  <li>Оберіть будь-який предмет зі списку нижче.</li>
                  <li>Відкрийте тему чи параграф, що вас цікавить.</li>
                  <li>Натисніть неонову кнопку <strong>«⚡ ТЕСТ»</strong> на полях зошита праворуч.</li>
                </ol>
              </div>
            ` : ''}

            <div class="auth-actions">
              ${info.isTests ? `
                <button type="button" class="auth-submit-btn" id="btn-to-subjects">Перейти до предметів ↓</button>
              ` : `
                <button type="button" class="auth-cancel-btn" id="hub-ok-btn">Зрозуміло</button>
              `}
            </div>
          </div>
        </div>
      `;

      this.el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('auth-modal-open');

      document.getElementById('hub-backdrop')?.addEventListener('click', () => this.closeModal());
      document.getElementById('hub-close-btn')?.addEventListener('click', () => this.closeModal());
      document.getElementById('hub-ok-btn')?.addEventListener('click', () => this.closeModal());

      document.getElementById('btn-to-subjects')?.addEventListener('click', () => {
        this.closeModal();
        document.getElementById('list')?.scrollIntoView({ behavior: 'smooth' });
      });
    }

    closeModal() {
      if (this.el) {
        this.el.setAttribute('aria-hidden', 'true');
        this.el.innerHTML = '';
      }
      document.body.classList.remove('auth-modal-open');
    }
  }

  window.TeacherAuth = new TeacherAuthEngine();
  window.isTeacher = () => window.TeacherAuth.isAuthorized();
})();
