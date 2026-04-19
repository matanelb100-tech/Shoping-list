/**
 * ============================================================================
 * item-editor.js - עורך מוצר (כמות, יחידה, מחיקה)
 * ============================================================================
 *
 * פותח modal לעריכת מוצר קיים:
 *   - שינוי כמות (עם כפתורי + / -)
 *   - שינוי יחידה (יחידות / ק"ג / גרם / ליטר)
 *   - מחיקה מהרשימה
 *
 * API:
 *   import { openItemEditor } from './item-editor.js';
 *   openItemEditor(itemId);
 * ============================================================================
 */

import { State } from './state.js?v=1';
import { Modal } from './modals.js?v=1';


// ============================================================================
// הגדרת יחידות זמינות
// ============================================================================

const UNITS = [
  { id: 'units', label: 'יחידות', short: 'יח׳',   step: 1,    min: 1 },
  { id: 'kg',    label: 'ק״ג',    short: 'ק״ג',  step: 0.5,  min: 0.1 },
  { id: 'g',     label: 'גרם',    short: 'גרם',  step: 100,  min: 50 },
  { id: 'L',     label: 'ליטר',   short: 'ל׳',   step: 1,    min: 0.5 },
  { id: 'ml',    label: 'מ״ל',    short: 'מ״ל',  step: 100,  min: 50 },
];


// ============================================================================
// עזרי פורמט
// ============================================================================

function formatNumber(num) {
  // החזרה נקייה - בלי .0 מיותרים
  if (Number.isInteger(num)) return String(num);
  return parseFloat(num.toFixed(2)).toString();
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}


// ============================================================================
// יצירת התוכן של ה-modal
// ============================================================================

function buildEditorContent(item) {
  const container = document.createElement('div');
  container.className = 'item-editor-container';

  container.innerHTML = `
    <div class="item-editor-name">
      ${escapeHtml(item.name)}
    </div>

    <div class="quantity-editor">
      <div class="quantity-editor-input">
        <button type="button" class="quantity-btn" data-action="decrease" aria-label="הפחת">−</button>
        <input
          type="text"
          class="quantity-value"
          id="item-editor-value"
          value="${formatNumber(item.quantity || 1)}"
          inputmode="decimal"
          aria-label="כמות"
        />
        <button type="button" class="quantity-btn" data-action="increase" aria-label="הוסף">+</button>
      </div>

      <div class="quantity-unit-selector" role="tablist" aria-label="בחירת יחידה">
        ${UNITS.map(unit => `
          <button
            type="button"
            class="quantity-unit-btn ${item.unit === unit.id ? 'is-active' : ''}"
            data-unit="${unit.id}"
            role="tab"
            aria-selected="${item.unit === unit.id}"
          >${unit.label}</button>
        `).join('')}
      </div>
    </div>
  `;

  return container;
}


// ============================================================================
// התנהגות פנימית
// ============================================================================

let currentItemId = null;
let currentUnit = 'units';
let currentQuantity = 1;

function getUnitDef(unitId) {
  return UNITS.find(u => u.id === unitId) || UNITS[0];
}

function updateDisplay(container) {
  const input = container.querySelector('#item-editor-value');
  if (input) input.value = formatNumber(currentQuantity);

  // עדכון כפתורי יחידה
  container.querySelectorAll('.quantity-unit-btn').forEach(btn => {
    const isActive = btn.dataset.unit === currentUnit;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-selected', isActive);
  });
}

function attachEventHandlers(container) {
  // כפתורי + / -
  container.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (btn) {
      const action = btn.dataset.action;
      const unit = getUnitDef(currentUnit);

      if (action === 'increase') {
        currentQuantity += unit.step;
      } else if (action === 'decrease') {
        currentQuantity = Math.max(unit.min, currentQuantity - unit.step);
      }

      // עיגול לנקודה עשרונית אחת
      currentQuantity = Math.round(currentQuantity * 100) / 100;
      updateDisplay(container);
      return;
    }

    // כפתורי יחידות
    const unitBtn = e.target.closest('[data-unit]');
    if (unitBtn) {
      const newUnit = unitBtn.dataset.unit;
      if (newUnit !== currentUnit) {
        currentUnit = newUnit;
        // אם המעבר הוא בין "יחידות" ליחידת משקל - התאמת ערך ברירת מחדל
        const unitDef = getUnitDef(newUnit);
        if (currentQuantity < unitDef.min) {
          currentQuantity = unitDef.step;
        }
        updateDisplay(container);
      }
    }
  });

  // הקלדה ידנית בשדה הכמות
  const input = container.querySelector('#item-editor-value');
  if (input) {
    input.addEventListener('input', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val) && val > 0) {
        currentQuantity = val;
      }
    });

    input.addEventListener('blur', () => {
      // תיקון אוטומטי אם המשתמש הקליד משהו לא תקין
      const unit = getUnitDef(currentUnit);
      if (isNaN(currentQuantity) || currentQuantity < unit.min) {
        currentQuantity = unit.min;
      }
      updateDisplay(container);
    });

    // בחירת כל הטקסט בלחיצה (נוח להחלפה מהירה)
    input.addEventListener('focus', () => {
      input.select();
    });
  }
}


// ============================================================================
// API ציבורי
// ============================================================================

/**
 * פתיחת עורך כמות למוצר
 * @param {string} itemId
 */
export async function openItemEditor(itemId) {
  const item = State.getItems().find(i => i.id === itemId);
  if (!item) {
    console.warn('openItemEditor: item not found:', itemId);
    return;
  }

  // אתחול מצב פנימי
  currentItemId = itemId;
  currentUnit = item.unit || 'units';
  currentQuantity = item.quantity || 1;

  // בנייה של התוכן
  const content = buildEditorContent(item);
  attachEventHandlers(content);

  // פתיחת ה-modal
  const result = await Modal.open({
    title: 'ערוך מוצר',
    subtitle: 'התאם את הכמות והיחידה של המוצר',
    size: 'sm',
    content: content,
    buttons: [
      {
        text: 'מחק מהרשימה',
        variant: 'ghost',
        onClick: () => handleDelete(itemId),
        close: false,  // נסגור ידנית אחרי מחיקה
      },
      {
        text: 'שמור',
        variant: 'primary',
        onClick: () => handleSave(itemId),
      },
    ],
  });

  // ניקוי מצב פנימי
  currentItemId = null;
}


// ============================================================================
// פעולות
// ============================================================================

function handleSave(itemId) {
  State.updateItem(itemId, {
    quantity: currentQuantity,
    unit: currentUnit,
  });

  if (window.showToast) {
    window.showToast('המוצר עודכן', 'success');
  }
}

async function handleDelete(itemId) {
  const item = State.getItems().find(i => i.id === itemId);
  if (!item) return;

  // סגירת העורך הנוכחי
  Modal.close();

  // אישור מחיקה
  const confirmed = await Modal.confirm({
    title: 'מחיקת מוצר',
    message: `האם למחוק את "${item.name}" מהרשימה?`,
    variant: 'danger',
    confirmText: 'מחק',
    cancelText: 'ביטול',
  });

  if (confirmed) {
    State.removeItem(itemId);
    if (window.showToast) {
      window.showToast('המוצר נמחק', 'success');
    }
  }
}
