/**
 * ============================================================================
 * cart.js - חישוב והצגת מחירי סל בכל הרשתות
 * ============================================================================
 *
 * מציג bottom sheet עם:
 *   - מחירי הסל בכל רשת
 *   - מיון מהזול ליקר
 *   - הדגשת הרשת הזולה
 *   - פירוט פריטים (expandable)
 *   - כפתור "שמור להיסטוריה"
 *
 * API:
 *   import { openCartCompute } from './cart.js';
 *   openCartCompute();
 * ============================================================================
 */

import { State } from './state.js?v=1';
import { API } from './api.js?v=1';
import { Modal } from './modals.js?v=1';
import { CHAINS } from './config.js?v=2';


// ============================================================================
// מצב פנימי של חלון החישוב
// ============================================================================

let currentResults = null;      // התוצאות מה-Worker
let expandedChainId = null;     // איזו רשת פתוחה (פירוט פריטים)
let container = null;


// ============================================================================
// עזרי פורמט
// ============================================================================

function formatPrice(price) {
  if (price == null || isNaN(price)) return '—';
  return `₪${price.toFixed(2)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}


// ============================================================================
// יצירת HTML של תוצאות
// ============================================================================

function renderResults(results) {
  if (!container) return;

  const chainsArr = Object.entries(results.chains || {})
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => (a.total || 0) - (b.total || 0));

  if (chainsArr.length === 0) {
    container.innerHTML = renderEmptyState();
    return;
  }

  const cheapestTotal = chainsArr[0].total;

  // חישוב חיסכון פוטנציאלי
  const mostExpensive = chainsArr[chainsArr.length - 1].total;
  const savingsPercent = mostExpensive > 0
    ? Math.round(((mostExpensive - cheapestTotal) / mostExpensive) * 100)
    : 0;

  let html = '';

  // סיכום עליון
  html += `
    <div class="cart-summary">
      <div class="cart-summary-left">
        <div class="cart-summary-label">הזול ביותר</div>
        <div class="cart-summary-chain">${escapeHtml(chainsArr[0].name)}</div>
      </div>
      <div class="cart-summary-right">
        <div class="cart-summary-total">${formatPrice(cheapestTotal)}</div>
        ${savingsPercent > 0 ? `
          <div class="cart-summary-save">חסכון של ${savingsPercent}% לעומת היקר ביותר</div>
        ` : ''}
      </div>
    </div>
  `;

  // פריטים לא זוהו (אם יש)
  const unknownItems = chainsArr[0].unknownItems || [];
  if (unknownItems.length > 0) {
    html += `
      <div class="cart-warning">
        <div class="cart-warning-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
            <line x1="12" y1="9" x2="12" y2="13"/>
            <line x1="12" y1="17" x2="12.01" y2="17"/>
          </svg>
        </div>
        <div class="cart-warning-text">
          <strong>${unknownItems.length} מוצרים לא נמצאו בקטלוג</strong>
          <span>${unknownItems.map(i => escapeHtml(i.name)).join(', ')}</span>
        </div>
      </div>
    `;
  }

  // רשימת הרשתות
  html += '<div class="cart-chains-list">';

  chainsArr.forEach((chain, idx) => {
    const isCheapest = idx === 0;
    const difference = chain.total - cheapestTotal;
    const isExpanded = expandedChainId === chain.id;

    html += `
      <div class="cart-chain ${isCheapest ? 'is-cheapest' : ''} ${isExpanded ? 'is-expanded' : ''}" data-chain="${chain.id}">
        <div class="cart-chain-header" data-action="toggle-chain" data-chain-id="${chain.id}">
          <div class="cart-chain-badge">${idx + 1}</div>
          <div class="cart-chain-info">
            <div class="cart-chain-name">
              ${escapeHtml(chain.name)}
              ${isCheapest ? '<span class="cart-chain-best">הזול ביותר</span>' : ''}
            </div>
            <div class="cart-chain-meta">
              ${chain.itemCount} מוצרים נמצאו
            </div>
          </div>
          <div class="cart-chain-price">
            <div class="cart-chain-total">${formatPrice(chain.total)}</div>
            ${!isCheapest ? `<div class="cart-chain-diff">+${formatPrice(difference)}</div>` : ''}
          </div>
          <div class="cart-chain-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        ${isExpanded ? renderChainDetails(chain) : ''}
      </div>
    `;
  });

  html += '</div>';

  container.innerHTML = html;
  attachListeners();
}


function renderChainDetails(chain) {
  if (!chain.items || chain.items.length === 0) {
    return '<div class="cart-chain-empty">אין פרטים לרשת זו</div>';
  }

  const itemsHtml = chain.items.map(item => `
    <div class="cart-item">
      <div class="cart-item-name">${escapeHtml(item.name)}</div>
      <div class="cart-item-qty">
        ${item.quantity} ${unitLabel(item.unit)} × ${formatPrice(item.unitPrice)}
      </div>
      <div class="cart-item-total">${formatPrice(item.total)}</div>
    </div>
  `).join('');

  return `
    <div class="cart-chain-details">
      ${itemsHtml}
    </div>
  `;
}


function unitLabel(unit) {
  const labels = {
    units: 'יח׳',
    kg: 'ק״ג',
    g: 'גרם',
    L: 'ל׳',
    ml: 'מ״ל',
  };
  return labels[unit] || '';
}


function renderEmptyState() {
  return `
    <div class="cart-empty">
      <div class="cart-empty-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/>
          <line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
      </div>
      <div class="cart-empty-title">לא נמצאו מחירים</div>
      <div class="cart-empty-text">
        ייתכן שהמוצרים לא נמצאים בקטלוג עדיין.
        נסה להוסיף שמות מדוייקים יותר (למשל "חלב תנובה 3%" במקום "חלב").
      </div>
    </div>
  `;
}


function renderLoading() {
  if (!container) return;
  container.innerHTML = `
    <div class="cart-loading">
      <div class="cart-loading-spinner"></div>
      <div class="cart-loading-text">מחשב מחירים בכל הרשתות...</div>
    </div>
  `;
}


function renderError(message) {
  if (!container) return;
  container.innerHTML = `
    <div class="cart-error">
      <div class="cart-error-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="12" y1="8" x2="12" y2="12"/>
          <line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
      </div>
      <div class="cart-error-title">שגיאה בחישוב</div>
      <div class="cart-error-text">${escapeHtml(message)}</div>
      <button class="btn btn-primary" id="cart-retry-btn">נסה שוב</button>
    </div>
  `;

  const retryBtn = document.getElementById('cart-retry-btn');
  if (retryBtn) retryBtn.addEventListener('click', runComputation);
}


// ============================================================================
// אירועים
// ============================================================================

function attachListeners() {
  if (!container) return;

  container.addEventListener('click', (e) => {
    const chainHeader = e.target.closest('[data-action="toggle-chain"]');
    if (chainHeader) {
      const chainId = chainHeader.dataset.chainId;
      if (expandedChainId === chainId) {
        expandedChainId = null;  // סגירה
      } else {
        expandedChainId = chainId;  // פתיחה
      }
      renderResults(currentResults);
      return;
    }
  });
}


// ============================================================================
// הרצת החישוב
// ============================================================================

async function runComputation() {
  if (!container) return;

  renderLoading();

  const items = State.getItems();
  const uncheckedItems = items.filter(i => !i.checked);

  if (uncheckedItems.length === 0) {
    renderError('הרשימה ריקה או שכל המוצרים כבר סומנו');
    return;
  }

  const settings = State.getSettings();
  const selectedChains = settings.selectedChains && settings.selectedChains.length > 0
    ? settings.selectedChains
    : Object.keys(CHAINS).filter(k => k !== 'neighborhood').slice(0, 5);

  try {
    // הכנת הנתונים לשליחה - רק מה שצריך ל-Worker
    const payload = uncheckedItems.map(item => ({
      name: item.name,
      quantity: item.quantity || 1,
      unit: item.unit || 'units',
      specificProductId: item.specificProductId || null,
    }));

    const results = await API.computeCart(payload, selectedChains);

    currentResults = results;
    expandedChainId = null;
    renderResults(results);

  } catch (err) {
    console.error('computeCart failed:', err);
    renderError(err.message || 'שגיאה בתקשורת עם השרת');
  }
}


// ============================================================================
// שמירה להיסטוריה
// ============================================================================

async function saveToHistory() {
  if (!currentResults || !currentResults.chains) {
    if (window.showToast) window.showToast('אין תוצאות לשמור', 'warning');
    return;
  }

  const chainsArr = Object.entries(currentResults.chains)
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => (a.total || 0) - (b.total || 0));

  const cheapest = chainsArr[0];

  try {
    // שמירה להיסטוריה - בלי איפוס הרשימה
    await State.saveToHistory(cheapest.total, cheapest.name);

    // סגירת חלון החישוב
    Modal.closeAll();

    if (window.showToast) window.showToast('נשמר בהיסטוריה ✓', 'success');

    // שאלה נפרדת: האם לנקות את הרשימה?
    // (לאחר דיליי קצר כדי שהטוסט יראה קודם)
    setTimeout(async () => {
      const shouldClear = await Modal.confirm({
        title: 'לנקות את הרשימה?',
        message: 'הסל נשמר בהצלחה להיסטוריה. האם לנקות את הרשימה הנוכחית או להשאיר אותה לשימוש חוזר?',
        variant: 'question',
        confirmText: 'נקה הרשימה',
        cancelText: 'השאר רשימה',
      });

      if (shouldClear) {
        State.clearAll();
        if (window.showToast) window.showToast('הרשימה נוקתה', 'success');
      }
    }, 600);

  } catch (err) {
    console.error('Save to history failed:', err);
    if (window.showToast) window.showToast('שמירה להיסטוריה נכשלה', 'error');
  }
}


// ============================================================================
// פתיחת החלון
// ============================================================================

/**
 * פתיחת חלון חישוב סל
 */
export async function openCartCompute() {
  const items = State.getItems();
  const uncheckedCount = items.filter(i => !i.checked).length;

  if (uncheckedCount === 0) {
    if (window.showToast) {
      window.showToast('הרשימה ריקה - הוסף מוצרים כדי לחשב', 'warning');
    }
    return;
  }

  // יצירת div container
  container = document.createElement('div');
  container.className = 'cart-compute-content';

  // פתיחת sheet
  Modal.sheet({
    title: 'מחירי הסל',
    subtitle: `${uncheckedCount} מוצרים • השוואה בין רשתות`,
    size: 'lg',
    content: container,
    buttons: [
      {
        text: 'סגור',
        variant: 'ghost',
        flex: true,
        close: true,
      },
      {
        text: 'שמור להיסטוריה',
        variant: 'primary',
        flex: true,
        onClick: () => { saveToHistory(); return false; },
      },
    ],
  });

  // הרצה
  runComputation();
}
