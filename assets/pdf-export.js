/* Універсальний модуль експорту робіт та тестів у PDF (PdfExport)
   - 100% підтримка української кирилиці (і, ї, є, ґ, апостроф)
   - Вибір макета: «По варіантах» (з шапкою учня) або «Компактно / На одному аркуші» (з лінією відрізу)
   - Опція «Додати сторінку з ключами (відповідями)» — доступна ВИКЛЮЧНО для авторизованих вчителів
   - Використовується у всіх 4 розділах (Тести, СР, КР, Екзамени) */
(() => {
  'use strict';

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

  class PdfExportEngine {
    constructor() {
      this.initModalContainer();
      this.initEvents();
    }

    initModalContainer() {
      let modal = document.getElementById('pdf-export-modal');
      if (!modal) {
        modal = document.createElement('div');
        modal.id = 'pdf-export-modal';
        modal.className = 'auth-modal-overlay';
        modal.setAttribute('aria-hidden', 'true');
        document.body.appendChild(modal);
      }
      this.el = modal;
    }

    initEvents() {
      document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && this.el && this.el.getAttribute('aria-hidden') === 'false') {
          this.closeDialog();
        }
      });
    }

    /* Відкриття діалогу налаштування PDF перед завантаженням */
    openExportDialog(options) {
      this.currentOptions = options;
      const isTeacher = !!window.isTeacher?.();

      this.el.innerHTML = `
        <div class="auth-modal-backdrop" id="pdf-backdrop"></div>
        <div class="auth-modal-box pdf-dialog-box" role="dialog" aria-modal="true" aria-labelledby="pdf-modal-title">
          <header class="auth-modal-head">
            <span class="auth-head-ico">📄</span>
            <div class="pdf-head-meta">
              <h3 id="pdf-modal-title" class="auth-modal-title">Експорт тесту в PDF</h3>
              <span class="pdf-sub">${esc(options.subject || 'Підручник')} · ${esc(options.title || 'Тест')}</span>
            </div>
            <button type="button" class="auth-modal-close" id="pdf-close-btn" aria-label="Закрити">✕</button>
          </header>

          <div class="auth-modal-body">
            <!-- Вибір макета -->
            <div class="pdf-cfg-group">
              <label class="pdf-cfg-label">Оберіть макет сторінки:</label>
              <div class="pdf-layouts-grid">
                <label class="pdf-layout-card">
                  <input type="radio" name="pdf-layout" value="variants" checked>
                  <div class="plc-content">
                    <span class="plc-ico">📑</span>
                    <strong>По варіантах</strong>
                    <small>Кожен варіант з окремої сторінки, шапка для ПІБ та класу, стандартний шрифт.</small>
                  </div>
                </label>

                <label class="pdf-layout-card">
                  <input type="radio" name="pdf-layout" value="compact">
                  <div class="plc-content">
                    <span class="plc-ico">✂️</span>
                    <strong>Компактно / На одному аркуші</strong>
                    <small>У 2 колонки з пунктирною лінією відрізу — економний друк роздатки.</small>
                  </div>
                </label>
              </div>
            </div>

            <!-- Кількість варіантів -->
            <div class="pdf-cfg-group">
              <label class="pdf-cfg-label" for="pdf-variants-count">Кількість варіантів:</label>
              <select id="pdf-variants-count" class="pdf-select">
                <option value="1">1 варіант (${options.questions ? options.questions.length : 10} питань)</option>
                <option value="2" selected>2 варіанти (перемішані запитання)</option>
              </select>
            </div>

            <!-- Доступ для вчителя: ключі та відповіді -->
            ${isTeacher ? `
              <div class="pdf-teacher-box">
                <div class="ptb-head">
                  <span class="ptb-badge">👩‍🏫 Доступно вчителю</span>
                </div>
                <label class="pdf-checkbox-label">
                  <input type="checkbox" id="pdf-include-keys" checked>
                  <span><strong>Додати сторінку з ключами (відповідями)</strong></span>
                </label>
                <small class="ptb-desc">Містить готову таблицю правильних відповідей та методичний розбір кожного питання за конспектом.</small>
              </div>
            ` : `
              <div class="pdf-student-notice">
                <span>🔒 Відповіді та ключі доступні лише після <button type="button" class="btn-inline-teacher" id="btn-login-prompt">авторизації вчителя</button>.</span>
              </div>
            `}

            <div class="auth-actions">
              <button type="button" class="auth-submit-btn" id="btn-generate-pdf">
                <span>Зберегти / Друк у PDF</span>
                <span class="cy-arr">→</span>
              </button>
              <button type="button" class="auth-cancel-btn" id="btn-pdf-cancel">Скасувати</button>
            </div>
          </div>
        </div>
      `;

      this.el.setAttribute('aria-hidden', 'false');
      document.body.classList.add('auth-modal-open');

      document.getElementById('pdf-backdrop')?.addEventListener('click', () => this.closeDialog());
      document.getElementById('pdf-close-btn')?.addEventListener('click', () => this.closeDialog());
      document.getElementById('btn-pdf-cancel')?.addEventListener('click', () => this.closeDialog());
      document.getElementById('btn-login-prompt')?.addEventListener('click', () => {
        this.closeDialog();
        window.TeacherAuth?.openAuthModal();
      });

      document.getElementById('btn-generate-pdf')?.addEventListener('click', () => {
        const layout = document.querySelector('input[name="pdf-layout"]:checked')?.value || 'variants';
        const numVariants = parseInt(document.getElementById('pdf-variants-count')?.value, 10) || 1;
        const includeKeys = isTeacher && (document.getElementById('pdf-include-keys')?.checked === true);

        this.generateAndPrintPdf({
          ...this.currentOptions,
          layout,
          numVariants,
          includeKeys
        });
        this.closeDialog();
      });
    }

    closeDialog() {
      if (this.el) {
        this.el.setAttribute('aria-hidden', 'true');
        this.el.innerHTML = '';
      }
      document.body.classList.remove('auth-modal-open');
    }

    /* Генерація чистого HTML-документа для безпомилкового векторного друку в PDF */
    generateAndPrintPdf(cfg) {
      const {
        title = 'Тестова робота',
        subject = 'Підручник',
        grade = '8 клас',
        questions = [],
        layout = 'variants',
        numVariants = 1,
        includeKeys = false,
        meta = ''
      } = cfg;

      // Підготовка варіантів: або передано масив готових варіантів, або один набір
      const variantsData = [];
      if (Array.isArray(cfg.variants) && cfg.variants.length > 0) {
        cfg.variants.forEach((v, idx) => {
          variantsData.push({
            num: v.num || idx + 1,
            label: v.label || `Варіант ${idx + 1}`,
            questions: [...v.questions]
          });
        });
      } else {
        variantsData.push({ num: 1, label: cfg.variantLabel || 'Варіант 1', questions: [...questions] });

        if (numVariants > 1) {
          const q2 = questions.map((q, idx) => {
            // Зберігаємо структуру, але перемішуємо варіанти
            const originalCorrectText = q.options[q.correctIndex];
            const shuffledOpts = shuffle(q.options);
            return {
              ...q,
              id: `v2_${idx + 1}`,
              options: shuffledOpts,
              correctIndex: shuffledOpts.indexOf(originalCorrectText)
            };
          });
          variantsData.push({ num: 2, label: 'Варіант 2', questions: shuffle(q2) });
        }
      }

      // Генерація HTML-документа
      const printHtml = `
<!DOCTYPE html>
<html lang="uk">
<head>
<meta charset="utf-8">
<title>${esc(subject)} — ${esc(title)}</title>
<style>
  @page {
    size: A4 portrait;
    margin: ${layout === 'compact' ? '8mm 10mm' : '12mm 14mm'};
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #111;
    background: #fff;
    margin: 0;
    padding: 0;
    line-height: 1.35;
    font-size: ${layout === 'compact' ? '10.5pt' : '11pt'};
  }
  .page-break {
    page-break-before: always;
  }
  .no-break {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  
  /* Шапка тесту */
  .doc-header {
    border-bottom: 2px solid #222;
    padding-bottom: 8px;
    margin-bottom: 12px;
  }
  .doc-title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    font-weight: bold;
    margin-bottom: 6px;
  }
  .doc-subj { font-size: 14pt; }
  .doc-var {
    font-size: 13pt;
    text-transform: uppercase;
    background: #f0f0f0;
    padding: 2px 10px;
    border-radius: 4px;
    border: 1px solid #ccc;
  }
  .doc-meta { font-size: 10pt; color: #555; margin-bottom: 8px; }
  .student-form-row {
    display: flex;
    gap: 16px;
    font-size: 10.5pt;
    margin-top: 6px;
  }
  .student-field { flex: 1; border-bottom: 1px solid #222; padding-bottom: 2px; }

  /* Питання */
  .questions-container {
    display: grid;
    gap: ${layout === 'compact' ? '10px' : '14px'};
  }
  .q-item {
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .q-title {
    font-weight: 600;
    margin-bottom: 4px;
    color: #000;
  }
  .q-opts-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px 12px;
    margin-left: 4px;
  }
  .q-opt {
    display: flex;
    gap: 6px;
    font-size: ${layout === 'compact' ? '9.5pt' : '10.5pt'};
  }
  .q-letter {
    font-weight: bold;
    color: #333;
    min-width: 16px;
  }

  /* Компактний макет з лінією відрізу */
  .compact-wrap {
    display: flex;
    gap: 16px;
  }
  .compact-col {
    flex: 1;
    position: relative;
  }
  .compact-col + .compact-col {
    border-left: 1.5px dashed #777;
    padding-left: 16px;
  }
  .cut-notice {
    text-align: center;
    font-size: 8pt;
    color: #777;
    margin-bottom: 8px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
  }

  /* Сторінка ключів для вчителя */
  .keys-page {
    page-break-before: always;
  }
  .keys-head {
    border-bottom: 2px solid #0f766e;
    padding-bottom: 8px;
    margin-bottom: 14px;
  }
  .keys-badge {
    background: #0f766e;
    color: #fff;
    padding: 3px 8px;
    font-size: 9pt;
    font-weight: bold;
    border-radius: 4px;
    text-transform: uppercase;
  }
  .keys-title { font-size: 15pt; font-weight: bold; margin: 6px 0 2px; }
  .keys-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 16px;
    font-size: 10.5pt;
  }
  .keys-table th, .keys-table td {
    border: 1px solid #ccc;
    padding: 6px 10px;
    text-align: left;
  }
  .keys-table th { background: #f3f4f6; font-weight: 600; }
  .keys-explain-list {
    display: grid;
    gap: 8px;
    font-size: 10pt;
  }
  .key-exp-item {
    padding: 6px 10px;
    background: #f9fafb;
    border-left: 3px solid #0f766e;
    border-radius: 4px;
  }

  @media screen {
    body { padding: 20px; background: #e5e7eb; }
    .print-sheet {
      max-width: 800px;
      margin: 0 auto 30px;
      background: #fff;
      padding: 30px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.1);
    }
  }
</style>
</head>
<body>
  ${layout === 'compact' && variantsData.length === 2 ? `
    <!-- Компактний макет у 2 колонки на 1 аркуші -->
    <div class="print-sheet">
      <div class="cut-notice">✂ Лінія відрізу між варіантами ✂</div>
      <div class="compact-wrap">
        ${variantsData.map(v => `
          <div class="compact-col">
            <div class="doc-header">
              <div class="doc-title-row">
                <span class="doc-subj">${esc(subject)}</span>
                <span class="doc-var">${esc(v.label || ('В-' + v.num))}</span>
              </div>
              <div class="doc-meta">${esc(title)} · ${esc(grade)}</div>
              <div class="student-form-row">
                <div class="student-field">Учень: </div>
                <div style="width: 70px;" class="student-field">Клас: </div>
              </div>
            </div>

            <div class="questions-container">
              ${v.questions.map((q, idx) => `
                <div class="q-item">
                  <div class="q-title">${idx + 1}. ${esc(q.title)}</div>
                  <div class="q-opts-grid">
                    ${q.options.map((opt, oIdx) => `
                      <div class="q-opt">
                        <span class="q-letter">${['А', 'Б', 'В', 'Г'][oIdx]})</span>
                        <span>${esc(opt)}</span>
                      </div>
                    `).join('')}
                  </div>
                </div>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  ` : `
    <!-- Стандартний макет по окремих варіантах -->
    ${variantsData.map((v, vIdx) => `
      <div class="print-sheet ${vIdx > 0 ? 'page-break' : ''}">
        <div class="doc-header">
          <div class="doc-title-row">
            <span class="doc-subj">${esc(subject)} — ${esc(grade)}</span>
            <span class="doc-var">${esc(v.label || ('Варіант ' + v.num))}</span>
          </div>
          <div class="doc-meta">${esc(title)}${meta ? ' · ' + esc(meta) : ''}</div>
          <div class="student-form-row">
            <div class="student-field">Прізвище, ім'я: </div>
            <div style="width: 90px;" class="student-field">Клас: </div>
            <div style="width: 100px;" class="student-field">Дата: </div>
          </div>
        </div>

        <div class="questions-container">
          ${v.questions.map((q, idx) => `
            <div class="q-item">
              <div class="q-title">${idx + 1}. ${esc(q.title)}</div>
              <div class="q-opts-grid">
                ${q.options.map((opt, oIdx) => `
                  <div class="q-opt">
                    <span class="q-letter">${['А', 'Б', 'В', 'Г'][oIdx]})</span>
                    <span>${esc(opt)}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `).join('')}
  `}

  <!-- Сторінка ключів відповідей для вчителя -->
  ${includeKeys ? `
    <div class="print-sheet keys-page">
      <div class="keys-head">
        <span class="keys-badge">МАТЕРІАЛИ ДЛЯ ВЧИТЕЛЯ</span>
        <div class="keys-title">Ключі відповідей та методичний розбір</div>
        <div class="doc-meta">${esc(subject)} · ${esc(title)} · ${esc(grade)}</div>
      </div>

      ${variantsData.map(v => `
        <h4 style="margin: 14px 0 6px; font-size: 12pt;">${esc(v.label || ('Варіант ' + v.num))} — правильні відповіді</h4>
        <table class="keys-table">
          <thead>
            <tr>
              <th style="width: 50px;">№</th>
              <th style="width: 80px;">Відповідь</th>
              <th>Зміст правильного варіанта</th>
            </tr>
          </thead>
          <tbody>
            ${v.questions.map((q, idx) => `
              <tr>
                <td><strong>${idx + 1}</strong></td>
                <td><strong>${['А', 'Б', 'В', 'Г'][q.correctIndex]}</strong></td>
                <td>${esc(q.options[q.correctIndex])}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <div class="keys-explain-list">
          <div style="font-weight: bold; margin-bottom: 4px;">Обґрунтування та розбір за підручником:</div>
          ${v.questions.map((q, idx) => `
            <div class="key-exp-item">
              <strong>${idx + 1}. ${esc(q.title)}</strong><br>
              <span style="color: #0f766e;">✓ ${['А', 'Б', 'В', 'Г'][q.correctIndex]}: ${esc(q.options[q.correctIndex])}</span><br>
              <small style="color: #444;">${esc(q.explanation || 'Згідно з конспектом теми.')}</small>
            </div>
          `).join('')}
        </div>
      `).join('<div style="margin: 24px 0; border-top: 1px dashed #ccc;"></div>')}
    </div>
  ` : ''}

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 250);
    };
  </script>
</body>
</html>
      `;

      // Відкриття друку у відокремленому вікні
      const printWindow = window.open('', '_blank', 'width=900,height=800');
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(printHtml);
        printWindow.document.close();
      } else {
        // Якщо блокувальник спливаючих вікон заблокував window.open, використовуємо iframe
        let frame = document.getElementById('pdf-print-frame');
        if (!frame) {
          frame = document.createElement('iframe');
          frame.id = 'pdf-print-frame';
          frame.style.position = 'fixed';
          frame.style.right = '0';
          frame.style.bottom = '0';
          frame.style.width = '0';
          frame.style.height = '0';
          frame.style.border = '0';
          document.body.appendChild(frame);
        }
        frame.contentDocument.open();
        frame.contentDocument.write(printHtml);
        frame.contentDocument.close();
        setTimeout(() => {
          frame.contentWindow.focus();
          frame.contentWindow.print();
        }, 500);
      }
    }
  }

  window.PdfExport = new PdfExportEngine();
})();
