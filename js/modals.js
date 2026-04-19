/**
 * ============================================================================
 * modals.js - מערכת חלונות קופצים (Modals, Confirm, Prompt, Sheet)
 * ============================================================================
 *
 * API ציבורי:
 *
 *   Modal.open(options)            - פתיחת modal מותאם
 *   Modal.close(id?)               - סגירת modal (ברירת מחדל: העליון)
 *   Modal.closeAll()               - סגירת כל ה-modals
 *   Modal.alert({title, message})  - חלון הודעה פשוט
 *   Modal.confirm({...})           - חלון אישור Yes/No
 *   Modal.sheet({...})             - bottom sheet
 *
 * דוגמאות שימוש:
 *
 *   // הודעה פשוטה
 *   await Modal.alert({
 *     title: 'שמור בהצלחה',
 *     message: 'הרשימה נשמרה בהיסטוריה',
 *   });
 *
 *   // אישור
 *   const ok = await Modal.confirm({
 *     title: 'למחוק את הרשימה?',
 *     message: 'פעולה זו אינה ניתנת לביטול',
 *     confirmText: 'מחק',
 *     variant: 'danger',
 *   });
 *   if (ok) State.clearAll();
 *
 *   // חלון מותאם
 *   Modal.open({
 *     title: 'בחירת רשתות',
 *     content: htmlContent,
 *     size: 'md',
 *     buttons: [
 *       { text: 'בטל', variant: 'ghost', close: true },
 *       { text: 'שמור', variant: 'primary', onClick: () => save() },
 *     ],
 *   });
 * ============================================================================
 */


// ============================================================================
// State פנימי - stack של modals פתוחים
// ============================================================================

const modalStack = [];
let nextModalId = 1;
let currentScrollY = 0;


// ============================================================================
// עזרי HTML
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}

function iconByVariant(variant) {
  const icons = {
    info: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <line x1="12" y1="16" x2="12" y2="12"/>
      <line x1="12" y1="8" x2="12.01" y2="8"/>
    </svg>`,
    warning: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
      <line x1="12" y1="9" x2="12" y2="13"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
    danger: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"/>
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>
    </svg>`,
    success: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
    </svg>`,
    question: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="10"/>
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
      <line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>`,
  };
  return icons[variant] || icons.info;
}


// ============================================================================
// נעילה של scroll ברקע
// ============================================================================

function lockBodyScroll() {
  if (modalStack.length === 0) {
    currentScrollY = window.scrollY;
    document.body.classList.add('modal-open');
  }
}

function unlockBodyScroll() {
  if (modalStack.length === 0) {
    document.body.classList.remove('modal-open');
    window.scrollTo(0, currentScrollY);
  }
}


// ============================================================================
// יצירת modal element
// ============================================================================

function createModalElement(options) {
  const {
    id,
    variant = '',
    size = 'md',
    isSheet = false,
    isConfirm = false,
    icon = null,
    title = '',
    subtitle = '',
    content = '',
    buttons = [],
    dismissable = true,
    stackLevel = 1,
  } = options;

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.dataset.modalId = String(id);
  if (isSheet) backdrop.classList.add('sheet-variant');
  backdrop.classList.add('stack-' + Math.min(stackLevel, 3));
  backdrop.setAttribute('role', 'dialog');
  backdrop.setAttribute('aria-modal', 'true');

  // בניית HTML
  const modalClasses = ['modal'];
  if (isSheet) modalClasses.push('sheet');
  if (isConfirm) modalClasses.push('confirm');
  else modalClasses.push('size-' + size);

  let iconHtml = '';
  if (icon || variant) {
    const iconContent = icon || iconByVariant(variant);
    const iconVariantClass = variant ? `variant-${variant}` : '';
    iconHtml = `<div class="modal-icon ${iconVariantClass}" aria-hidden="true">${iconContent}</div>`;
  }

  let headerHtml = '';
  if (title || dismissable) {
    headerHtml = `
      <div class="modal-header">
        ${isConfirm ? '' : iconHtml}
        <div class="modal-header-content">
          ${title ? `<h2 class="modal-title">${escapeHtml(title)}</h2>` : ''}
          ${subtitle ? `<div class="modal-subtitle">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        ${dismissable && !isConfirm ? `
          <button class="modal-close" aria-label="סגור" data-modal-close>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        ` : ''}
      </div>
    `;
  }

  let footerHtml = '';
  if (buttons.length > 0) {
    const buttonsHtml = buttons.map((btn, idx) => {
      const btnClasses = ['btn'];
      btnClasses.push(`btn-${btn.variant || 'secondary'}`);
      if (btn.size) btnClasses.push(`btn-${btn.size}`);
      if (btn.flex) btnClasses.push('flex-1');

      return `
        <button
          type="button"
          class="${btnClasses.join(' ')}"
          data-modal-btn="${idx}"
        >${escapeHtml(btn.text)}</button>
      `;
    }).join('');

    footerHtml = `<div class="modal-footer">${buttonsHtml}</div>`;
  }

  // ב-confirm modal - הכפתורים והתוכן בצורה שונה
  let modalContent;
  if (isConfirm) {
    modalContent = `
      <div class="${modalClasses.join(' ')}">
        ${iconHtml ? `<div class="modal-header" style="padding-bottom:0"><div class="modal-header-content" style="width:100%;text-align:center">${iconHtml}</div></div>` : ''}
        ${title || subtitle ? `
          <div class="modal-header" style="padding-top:${iconHtml ? '0' : '22px'};padding-bottom:4px;">
            <div class="modal-header-content">
              ${title ? `<h2 class="modal-title">${escapeHtml(title)}</h2>` : ''}
            </div>
          </div>
        ` : ''}
        <div class="modal-body">
          ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
          ${content}
        </div>
        ${footerHtml}
      </div>
    `;
  } else {
    modalContent = `
      <div class="${modalClasses.join(' ')}">
        ${headerHtml}
        <div class="modal-body">
          ${typeof content === 'string' ? content : ''}
        </div>
        ${footerHtml}
      </div>
    `;
  }

  backdrop.innerHTML = modalContent;

  // אם התוכן הוא HTMLElement - נחליף
  if (content instanceof HTMLElement) {
    const bodyEl = backdrop.querySelector('.modal-body');
    if (bodyEl) {
      bodyEl.innerHTML = '';
      bodyEl.appendChild(content);
    }
  }

  return backdrop;
}


// ============================================================================
// פתיחת modal
// ============================================================================

function openModal(options) {
  const id = nextModalId++;
  const stackLevel = modalStack.length + 1;

  const backdrop = createModalElement({ ...options, id, stackLevel });

  // הוספה ל-DOM
  const root = document.getElementById('modal-root') || document.body;
  root.appendChild(backdrop);

  // רישום ב-stack
  const record = {
    id,
    backdrop,
    options,
    resolve: null,
    _resolved: false,
  };
  modalStack.push(record);

  // נעילת scroll
  lockBodyScroll();

  // חיבור listeners לסגירה
  backdrop.addEventListener('click', (e) => {
    // לחיצה על הרקע - סגירה אם dismissable
    if (e.target === backdrop && options.dismissable !== false) {
      closeModal(id);
    }
  });

  // כפתור X
  const closeBtn = backdrop.querySelector('[data-modal-close]');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => closeModal(id));
  }

  // כפתורי footer
  const btns = backdrop.querySelectorAll('[data-modal-btn]');
  btns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.modalBtn, 10);
      const btnDef = options.buttons[idx];
      if (!btnDef) return;

      // הרצת handler
      let shouldClose = btnDef.close !== false;
      if (typeof btnDef.onClick === 'function') {
        const result = btnDef.onClick();
        if (result === false) shouldClose = false;
      }

      if (shouldClose) {
        closeModal(id, btnDef.value);
      }
    });
  });

  // הוספת class is-open בפריים הבא (כדי שה-transition יעבוד)
  requestAnimationFrame(() => {
    backdrop.classList.add('is-open');

    // פוקוס אוטומטי על הכפתור הראשי (אם יש)
    setTimeout(() => {
      const primaryBtn = backdrop.querySelector('.btn-primary, .btn-danger');
      if (primaryBtn) primaryBtn.focus();
    }, 100);
  });

  // החזרת Promise
  return new Promise((resolve) => {
    record.resolve = resolve;
  });
}


// ============================================================================
// סגירת modal
// ============================================================================

function closeModal(id = null, value = undefined) {
  let record;
  if (id === null) {
    // סגירת ה-modal העליון
    record = modalStack[modalStack.length - 1];
  } else {
    record = modalStack.find(r => r.id === id);
  }

  if (!record || record._resolved) return;

  record._resolved = true;

  // הסרת class is-open לאנימציה
  record.backdrop.classList.remove('is-open');

  // הסרה מה-stack
  const idx = modalStack.indexOf(record);
  if (idx !== -1) modalStack.splice(idx, 1);

  // הסרה מ-DOM אחרי סיום האנימציה
  setTimeout(() => {
    if (record.backdrop.parentNode) {
      record.backdrop.parentNode.removeChild(record.backdrop);
    }
    unlockBodyScroll();
  }, 300);

  // Resolve של ה-Promise
  if (record.resolve) {
    record.resolve(value);
  }
}


// ============================================================================
// ESC לסגירת ה-modal העליון
// ============================================================================

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalStack.length > 0) {
    const top = modalStack[modalStack.length - 1];
    if (top.options.dismissable !== false) {
      closeModal(top.id);
    }
  }
});


// ============================================================================
// ========== API ציבורי =====================================================
// ============================================================================

export const Modal = {

  /**
   * פתיחת modal מותאם
   * @param {object} options
   * @returns {Promise<any>} נפתר עם ערך הכפתור שנלחץ
   */
  open(options) {
    return openModal(options);
  },

  /**
   * סגירת modal
   */
  close(id = null, value = undefined) {
    closeModal(id, value);
  },

  /**
   * סגירת כל ה-modals
   */
  closeAll() {
    while (modalStack.length > 0) {
      closeModal(modalStack[modalStack.length - 1].id);
    }
  },

  /**
   * חלון הודעה פשוט (OK)
   * @returns {Promise<void>}
   */
  alert(options) {
    const {
      title = 'הודעה',
      message = '',
      variant = 'info',
      okText = 'הבנתי',
    } = (typeof options === 'string' ? { message: options } : options);

    return openModal({
      isConfirm: true,
      variant,
      title,
      subtitle: message,
      content: '',
      dismissable: true,
      buttons: [
        { text: okText, variant: 'primary', flex: true, value: true },
      ],
    });
  },

  /**
   * חלון אישור Yes/No
   * @returns {Promise<boolean>} true אם אישר, undefined אם ביטל
   */
  confirm(options) {
    const {
      title = 'אישור',
      message = '',
      variant = 'question',
      confirmText = 'אישור',
      cancelText = 'ביטול',
    } = options;

    return openModal({
      isConfirm: true,
      variant,
      title,
      subtitle: message,
      content: '',
      dismissable: true,
      buttons: [
        { text: cancelText, variant: 'ghost', flex: true, value: false },
        {
          text: confirmText,
          variant: variant === 'danger' ? 'danger' : 'primary',
          flex: true,
          value: true
        },
      ],
    });
  },

  /**
   * Bottom Sheet (נפתח מלמטה)
   */
  sheet(options) {
    return openModal({ ...options, isSheet: true });
  },

  /**
   * בדיקה אם יש modal פתוח
   */
  isOpen() {
    return modalStack.length > 0;
  },

  /**
   * מספר modals פתוחים
   */
  stackSize() {
    return modalStack.length;
  },
};


// ============================================================================
// חשיפה ל-console לדיבוג
// ============================================================================

if (typeof window !== 'undefined') {
  window.__modal = Modal;
}
