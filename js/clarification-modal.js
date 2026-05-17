/**
 * ============================================================================
 * clarification-modal.js - UI של מודאל הבהרה (שלב B צ'אט 2/3)
 * ============================================================================
 *
 * מטרה:
 *   בעת לחיצה על "חשב סל", cart.js בונה queue של פריטים שצריכים הבהרה
 *   (חלב: 3%/1%/סויה, לחם: לבן/מלא/...). הקובץ הזה אחראי על ה-UI:
 *   מציג מודאל אחד עם chips, מנהל מעבר בין פריטים, מחזיר את הבחירות.
 *
 * עקרונות ארכיטקטוניים:
 *   - API יחיד ופשוט: openClarificationFlow(queue) → Promise<Map>
 *   - תמיכה גנרית גם ב-variants וגם ב-dimensions (לעתיד, כי הקטלוג
 *     הנוכחי משתמש רק ב-variants).
 *   - הפריט המקורי לא משתנה. אנחנו מחזירים items מועשרים חדשים.
 *   - "דלג" שונה מ"סגירה": דלג = לא נשלח לוורקר.
 *     סגירה (X / ESC) = ביטול חישוב כולו.
 *   - כל ה-state פנימי. cart.js לא יודע כלום על איך זה עובד בפנים.
 *
 * שימוש (מ-cart.js):
 *   import { openClarificationFlow } from './clarification-modal.js';
 *   const result = await openClarificationFlow(queue);
 *   if (result.cancelled) return;  // המשתמש סגר את החישוב
 *   // result.choices: Map<itemId, enrichedItem>
 *   const finalItems = items.map(item =>
 *     result.choices.get(item.id) || item
 *   );
 *
 * זרימה פנימית:
 *   queue: [item1, item2, item3]
 *        ↓
 *   render(item1) → user picks chip → "הבא" → applyVariantChoice → choices.set(item1.id, enriched)
 *        ↓
 *   render(item2) → user clicks "אחר" → types text → "הבא" → applyCustomChoice → choices.set
 *        ↓
 *   render(item3) → user clicks "דלג" → applySkipChoice → choices.set
 *        ↓
 *   modal closes → resolve({ cancelled: false, choices })
 * ============================================================================
 */

import { Modal } from './modals.js?v=1';
import {
  findBaseForItem,
  applyVariantChoice,
  applyCustomChoice,
  applySkipChoice,
} from './clarification.js?v=1';
import {
  getClarification,
  saveClarification,
} from './clarification-memory.js?v=1';


// ============================================================================
// State פנימי - חי רק במהלך flow אחד
// ============================================================================

/**
 * @typedef {Object} FlowState
 * @property {Array} queue            - תור הפריטים שצריכים הבהרה
 * @property {number} currentIndex    - אינדקס הפריט הנוכחי
 * @property {Map} choices            - Map<itemId, enrichedItem>
 * @property {string|null} selectedVariantId - chip שנבחר (variants mode)
 * @property {Object} selectedDims    - {dimId: optionId, ...} (dimensions mode)
 * @property {boolean} customMode     - האם במצב "אחר"
 * @property {string} customText      - הטקסט שהמשתמש הקליד
 * @property {HTMLElement} container  - body של ה-Modal
 * @property {Function} resolveFlow   - resolve של ה-Promise הראשי
 * @property {number} modalId         - id של ה-modal הפתוח
 */

/** @type {FlowState|null} */
let flow = null;


// ============================================================================
// עזר: escape
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}


// ============================================================================
// קביעת ברירת המחדל - איזה chip מסומן מראש
// ============================================================================

/**
 * עבור variants: מחזיר את ה-id של defaultVariant מה-base, או הראשון.
 * @param {object} base
 * @returns {string|null}
 */
function pickDefaultVariantId(base) {
  if (!base || !Array.isArray(base.variants) || base.variants.length === 0) {
    return null;
  }
  // 1. אם ה-base מצביע על defaultVariant - שימוש בו
  if (base.defaultVariant) {
    const exists = base.variants.find(v => v.id === base.defaultVariant);
    if (exists) return exists.id;
  }
  // 2. אם variant יש isDefault: true - שימוש בו
  const flagged = base.variants.find(v => v.isDefault);
  if (flagged) return flagged.id;
  // 3. ברירת מחדל - הראשון
  return base.variants[0].id;
}


/**
 * עבור dimensions: מחזיר {dimId: optionId, ...} עם ברירות המחדל.
 * @param {object} base
 * @returns {Object}
 */
function pickDefaultDimensions(base) {
  const result = {};
  if (!base || !Array.isArray(base.dimensions)) return result;

  base.dimensions.forEach(dim => {
    if (!Array.isArray(dim.options) || dim.options.length === 0) return;
    const flagged = dim.options.find(o => o.isDefault);
    result[dim.id] = flagged ? flagged.id : dim.options[0].id;
  });

  return result;
}


// ============================================================================
// HTML rendering
// ============================================================================

/**
 * מרכזי - בונה את כל ה-HTML של הפריט הנוכחי לפי ה-state.
 */
function renderCurrent() {
  if (!flow || !flow.container) return;

  const item = flow.queue[flow.currentIndex];
  if (!item) return;

  const base = findBaseForItem(item.name);
  if (!base) {
    // לא אמור לקרות (buildClarificationQueue אמור לסנן), אבל ליתר ביטחון
    handleNext();
    return;
  }

  const total = flow.queue.length;
  const current = flow.currentIndex + 1;
  const isLast = flow.currentIndex === flow.queue.length - 1;

  let html = '';

  // ============= מצב "אחר" =============
  if (flow.customMode) {
    html += `
      <div class="clarification-content">
        <div class="clarification-progress">פריט ${current} מתוך ${total}</div>
        <div class="clarification-item-name">${escapeHtml(item.name)}</div>

        <div class="clarification-custom-wrapper">
          <label class="clarification-custom-label">
            תאר את המוצר במילותיך
            <span class="clarification-custom-hint">(כל מילה תחפש בנפרד)</span>
          </label>
          <input
            type="text"
            class="clarification-custom-input"
            id="clarification-custom-input"
            placeholder="לדוגמה: חלב עזים אורגני"
            value="${escapeHtml(flow.customText)}"
            autocomplete="off"
            dir="rtl"
          />
        </div>

        <button class="clarification-back-btn" data-action="back-to-chips">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"/>
          </svg>
          חזור לאפשרויות
        </button>
      </div>

      <div class="clarification-actions">
        <button class="btn btn-ghost btn-skip" data-action="skip">דלג על המוצר</button>
        <button class="btn btn-primary btn-next" data-action="next-custom">
          ${isLast ? 'סיים' : 'הבא'}
        </button>
      </div>
    `;

    flow.container.innerHTML = html;
    attachEventListeners();

    // פוקוס אוטומטי לשדה הטקסט
    setTimeout(() => {
      const input = document.getElementById('clarification-custom-input');
      if (input) {
        input.focus();
        // העברת cursor לסוף הטקסט
        input.setSelectionRange(input.value.length, input.value.length);
      }
    }, 50);

    return;
  }

  // ============= מצב רגיל (chips) =============

  html += `
    <div class="clarification-content">
      <div class="clarification-progress">פריט ${current} מתוך ${total}</div>
      <div class="clarification-item-name">${escapeHtml(item.name)}</div>
  `;

  // יש dimensions? (לעתיד - כרגע אף base לא משתמש)
  if (Array.isArray(base.dimensions) && base.dimensions.length > 0) {
    html += renderDimensions(base);
  }
  // אחרת - variants
  else if (Array.isArray(base.variants) && base.variants.length > 0) {
    html += renderVariants(base);
  }

  // כפתור "אחר"
  html += `
      <div class="clarification-other-divider"></div>
      <button class="clarification-other-btn" data-action="open-custom">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
        כתוב משהו אחר
      </button>
    </div>

    <div class="clarification-actions">
      <button class="btn btn-ghost btn-skip" data-action="skip">דלג על המוצר</button>
      <button class="btn btn-primary btn-next" data-action="next">
        ${isLast ? 'סיים' : 'הבא'}
      </button>
    </div>
  `;

  flow.container.innerHTML = html;
  attachEventListeners();
}


/**
 * רינדור chips של variants (חד-ממדי).
 */
function renderVariants(base) {
  const html = base.variants.map(v => {
    const isSelected = v.id === flow.selectedVariantId;
    return `
      <button
        class="clarification-chip ${isSelected ? 'is-selected' : ''}"
        data-action="select-variant"
        data-variant-id="${escapeHtml(v.id)}"
      >
        <span class="clarification-chip-check" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </span>
        <span class="clarification-chip-label">${escapeHtml(v.label || v.id)}</span>
      </button>
    `;
  }).join('');

  return `<div class="clarification-chips">${html}</div>`;
}


/**
 * רינדור dimensions (רב-ממדי) - לעתיד.
 * כל dimension היא שורה משלה עם chips.
 */
function renderDimensions(base) {
  return base.dimensions.map(dim => {
    const chipsHtml = (dim.options || []).map(opt => {
      const isSelected = flow.selectedDims[dim.id] === opt.id;
      return `
        <button
          class="clarification-chip ${isSelected ? 'is-selected' : ''}"
          data-action="select-dim"
          data-dim-id="${escapeHtml(dim.id)}"
          data-option-id="${escapeHtml(opt.id)}"
        >
          <span class="clarification-chip-check" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </span>
          <span class="clarification-chip-label">${escapeHtml(opt.label || opt.id)}</span>
        </button>
      `;
    }).join('');

    return `
      <div class="clarification-dimension">
        <div class="clarification-dim-label">${escapeHtml(dim.label || dim.id)}</div>
        <div class="clarification-chips">${chipsHtml}</div>
      </div>
    `;
  }).join('');
}


// ============================================================================
// אירועים
// ============================================================================

function attachEventListeners() {
  if (!flow || !flow.container) return;

  flow.container.querySelectorAll('[data-action]').forEach(el => {
    el.addEventListener('click', handleClick);
  });

  // אנטר בשדה "אחר" = "הבא"
  const customInput = document.getElementById('clarification-custom-input');
  if (customInput) {
    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        flow.customText = customInput.value;
        handleNext();
      }
    });
    // עדכון live של customText כדי שלא יאבד בעת re-render
    customInput.addEventListener('input', (e) => {
      flow.customText = e.target.value;
    });
  }
}


function handleClick(e) {
  const el = e.currentTarget;
  const action = el.dataset.action;

  switch (action) {
    case 'select-variant': {
      const variantId = el.dataset.variantId;
      if (variantId) {
        flow.selectedVariantId = variantId;
        renderCurrent();
      }
      break;
    }

    case 'select-dim': {
      const dimId = el.dataset.dimId;
      const optionId = el.dataset.optionId;
      if (dimId && optionId) {
        flow.selectedDims[dimId] = optionId;
        renderCurrent();
      }
      break;
    }

    case 'open-custom': {
      flow.customMode = true;
      flow.customText = '';
      renderCurrent();
      break;
    }

    case 'back-to-chips': {
      flow.customMode = false;
      renderCurrent();
      break;
    }

    case 'next': {
      handleNext();
      break;
    }

    case 'next-custom': {
      // לקח את הערך מהשדה הפיזי, ליתר ביטחון
      const input = document.getElementById('clarification-custom-input');
      if (input) flow.customText = input.value;
      handleNext();
      break;
    }

    case 'skip': {
      handleSkip();
      break;
    }
  }
}


// ============================================================================
// החלת בחירה ומעבר לפריט הבא
// ============================================================================

/**
 * המשתמש לחץ "הבא" - מחיל את הבחירה הנוכחית ומתקדם.
 */
function handleNext() {
  if (!flow) return;

  const item = flow.queue[flow.currentIndex];
  if (!item) return;

  let enriched;

  if (flow.customMode) {
    // מצב "אחר"
    const text = String(flow.customText || '').trim();
    if (text.length === 0) {
      // טקסט ריק - לא להחיל, להשאיר ב-state הנוכחי
      // (אופציה: להציג שגיאה. כרגע - פשוט לא להתקדם)
      return;
    }
    enriched = applyCustomChoice(item, text);
  } else {
    // מצב רגיל - variants או dimensions
    const base = findBaseForItem(item.name);

    if (base && Array.isArray(base.dimensions) && base.dimensions.length > 0) {
      // dimensions - בונה item מועשר ידנית (אין applyDimensionsChoice במודול)
      enriched = applyDimensionsChoiceLocal(item, base, flow.selectedDims);
    } else if (flow.selectedVariantId) {
      // variants רגיל
      enriched = applyVariantChoice(item, flow.selectedVariantId);

      // שמירת הבחירה בזיכרון Firestore (fire-and-forget, לא חוסם UI).
      // שומרים רק עבור variants - לא עבור custom או skip.
      if (base && base.id) {
        saveClarification(base.id, flow.selectedVariantId);
      }
    } else {
      // לא נבחר כלום? לא אמור לקרות (יש ברירת מחדל), אבל ליתר ביטחון
      enriched = item;
    }
  }

  flow.choices.set(item.id, enriched);
  advanceOrFinish();
}


/**
 * המשתמש לחץ "דלג".
 */
function handleSkip() {
  if (!flow) return;

  const item = flow.queue[flow.currentIndex];
  if (!item) return;

  flow.choices.set(item.id, applySkipChoice(item));
  advanceOrFinish();
}


/**
 * עובר לפריט הבא בתור, או מסיים את ה-flow.
 */
function advanceOrFinish() {
  if (!flow) return;

  if (flow.currentIndex < flow.queue.length - 1) {
    // עובר לפריט הבא
    flow.currentIndex++;
    setupForCurrentItem();
    renderCurrent();
  } else {
    // סיים את התור
    finishFlow(false);
  }
}


/**
 * אתחול ה-state בעת מעבר לפריט חדש (ברירות מחדל לפי הקטלוג).
 *
 * סדר עדיפויות לבחירת ה-chip המסומן מראש:
 *   1. זיכרון Firestore — אם המשתמש בחר בעבר variant ל-base הזה,
 *      ובלבד שה-variant עדיין קיים בקטלוג הנוכחי (validation).
 *   2. defaultVariant של ה-base בקטלוג.
 *   3. variant הראשון.
 */
function setupForCurrentItem() {
  if (!flow) return;

  const item = flow.queue[flow.currentIndex];
  if (!item) return;

  const base = findBaseForItem(item.name);

  // ניסיון לקרוא מהזיכרון. validation: ה-variant חייב עוד להיות בקטלוג
  // (אם הסרנו אותו בעדכון מאוחר יותר - נופלים ל-default).
  let chosenVariantId = null;
  if (base && base.id && Array.isArray(base.variants) && base.variants.length > 0) {
    const remembered = getClarification(base.id);
    if (remembered && base.variants.some(v => v.id === remembered)) {
      chosenVariantId = remembered;
    }
  }

  flow.selectedVariantId = chosenVariantId || pickDefaultVariantId(base);
  flow.selectedDims = pickDefaultDimensions(base);
  flow.customMode = false;
  flow.customText = '';
}


/**
 * בניית item מועשר ממצב dimensions.
 * (לעתיד - אם הקטלוג ירחיב לכלול dimensions, זה יעבוד.)
 */
function applyDimensionsChoiceLocal(item, base, selectedDims) {
  const baseSearch  = Array.isArray(base.baseSearchTerms)  ? base.baseSearchTerms  : [];
  const baseExclude = Array.isArray(base.baseExcludeTerms) ? base.baseExcludeTerms : [];

  const allSearchTerms = [...baseSearch];
  const allExcludeTerms = [...baseExclude];

  (base.dimensions || []).forEach(dim => {
    const selectedOptId = selectedDims[dim.id];
    (dim.options || []).forEach(opt => {
      if (opt.id === selectedOptId) {
        if (Array.isArray(opt.searchTerms)) allSearchTerms.push(...opt.searchTerms);
      } else {
        // אופציות לא-נבחרות הופכות ל-excludeTerms
        if (Array.isArray(opt.searchTerms)) allExcludeTerms.push(...opt.searchTerms);
      }
    });
  });

  return {
    ...item,
    _clarified: true,
    _clarificationKind: 'dimensions',
    selectedDimensions: { ...selectedDims },
    searchTerms:  allSearchTerms,
    excludeTerms: allExcludeTerms,
  };
}


// ============================================================================
// סיום / ביטול
// ============================================================================

/**
 * סוגר את ה-flow ומחזיר תוצאה ל-cart.js.
 * @param {boolean} cancelled - true אם המשתמש סגר את המודאל ב-X / ESC
 */
function finishFlow(cancelled) {
  if (!flow) return;

  const result = {
    cancelled,
    choices: flow.choices,
  };

  const resolveFn = flow.resolveFlow;
  const modalId = flow.modalId;

  flow = null;  // ניקוי state לפני סגירה

  // סגירת המודאל (אם לא נסגר כבר)
  if (modalId != null) {
    Modal.close(modalId);
  }

  // resolve של ה-Promise הראשי
  if (typeof resolveFn === 'function') {
    resolveFn(result);
  }
}


// ============================================================================
// API ציבורי
// ============================================================================

/**
 * פותח את flow ההבהרה ומחזיר Promise עם הבחירות.
 *
 * @param {Array} queue - פריטים שצריכים הבהרה (מ-buildClarificationQueue)
 * @returns {Promise<{cancelled: boolean, choices: Map<string, object>}>}
 *
 * דוגמת שימוש ב-cart.js:
 *   const { cancelled, choices } = await openClarificationFlow(queue);
 *   if (cancelled) { renderError('החישוב בוטל'); return; }
 *   const finalItems = uncheckedItems.map(item =>
 *     choices.get(item.id) || item
 *   );
 */
export function openClarificationFlow(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    // אין מה לעשות - מחזיר Map ריק מיד
    return Promise.resolve({ cancelled: false, choices: new Map() });
  }

  return new Promise((resolve) => {
    // יצירת ה-container
    const container = document.createElement('div');
    container.className = 'clarification-container';

    // אתחול ה-state
    flow = {
      queue,
      currentIndex: 0,
      choices: new Map(),
      selectedVariantId: null,
      selectedDims: {},
      customMode: false,
      customText: '',
      container,
      resolveFlow: resolve,
      modalId: null,
    };

    setupForCurrentItem();

    // פתיחת ה-Modal
    // dismissable: true → סגירה ב-X / ESC = ביטול חישוב
    Modal.open({
      title: 'בוא נדייק את הסל',
      size: 'md',
      content: container,
      dismissable: true,
      // ⚠️ buttons ריק כי הכפתורים שלנו בתוך ה-content (לשליטה מלאה)
      buttons: [],
    }).then((modalResult) => {
      // אם ה-flow לא הסתיים דרך finishFlow (כלומר המשתמש סגר ב-X / ESC) -
      // נחזיר cancelled=true. אם flow כבר התאפס - finishFlow כבר קרא resolve.
      if (flow !== null) {
        finishFlow(true);
      }
    });

    // שמירת ה-modalId אחרי שה-Modal נפתח
    // (Modal.open מחזיר Promise, אבל גם פותח sync. נצטרך לאתר את ה-id)
    // הפתרון: מסתמכים על העובדה שהמודאל שזה עתה נפתח הוא העליון בערימה.
    // ל-Modal.close(null) ממילא סוגר את העליון - אז לא חייבים לדעת את ה-id.

    // רינדור ראשוני
    renderCurrent();
  });
}
