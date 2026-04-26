/**
 * ============================================================================
 * product-price.js - מודאל הצגת מחיר מוצר ב-5 רשתות
 * ============================================================================
 *
 * מופעל מאייקון ה-₪ ליד כל מוצר ברשימה.
 * זרימה:
 *   1. פתיחת modal עם spinner ("טוען מחירים...")
 *   2. קריאה ל-API.getProductPrice(name)
 *   3. הצגת תוצאות: 5 שורות (רשת + שם מוצר שנמצא + מחיר)
 *      - רשת זולה ביותר: רקע ירקרק + ✓
 *      - רשת שלא נמצא בה: "לא נמצא במאגר" באפור
 *      - שורה תחתונה: ממוצע / זול ביותר / יקר ביותר
 *   4. מקרי קצה:
 *      - לא נמצא בכלל (chains_found=0): הודעה אחידה
 *      - שגיאת רשת: הודעת שגיאה + כפתור "נסה שוב"
 *      - אופליין: הודעה ייעודית
 *
 * שיטת עבודה:
 *   - יוצרים HTMLElement (container) פעם אחת
 *   - מעבירים אותו ל-Modal.sheet({ content: container })
 *     (Modal תומך ב-HTMLElement כ-content - ראה modals.js שורות 231-237)
 *   - מעדכנים את container.innerHTML כשמתקבלות התוצאות
 *
 * API ציבורי:
 *   openProductPriceModal(productName)
 *
 * תלויות:
 *   - API.getProductPrice (api.js)
 *   - Modal.sheet (modals.js)
 * ============================================================================
 */

import { API } from './api.js?v=3';
import { Modal } from './modals.js?v=1';


// ============================================================================
// סדר תצוגת הרשתות (קבוע - אותו סדר תמיד)
// ============================================================================

const CHAIN_ORDER = ['shufersal', 'ramilevi', 'yeinotbitan', 'victory', 'yohananof'];

const CHAIN_DISPLAY_NAMES = {
  shufersal:   'שופרסל',
  ramilevi:    'רמי לוי',
  yeinotbitan: 'יינות ביתן',
  victory:     'ויקטורי',
  yohananof:   'יוחננוף',
};


// ============================================================================
// עזרי פורמט
// ============================================================================

function formatPrice(price) {
  if (price == null || isNaN(price)) return '—';
  return `₪${Number(price).toFixed(2)}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text == null ? '' : text);
  return div.innerHTML;
}


// ============================================================================
// מציאת הרשת הזולה ביותר
// ============================================================================

function findCheapestChainId(prices) {
  let cheapestId = null;
  let cheapestPrice = Infinity;

  for (const [chainId, info] of Object.entries(prices)) {
    if (info.found && typeof info.price === 'number' && info.price < cheapestPrice) {
      cheapestPrice = info.price;
      cheapestId = chainId;
    }
  }

  return cheapestId;
}


// ============================================================================
// בנאי HTML של תוכן ה-modal
// ============================================================================

function buildLoadingHTML() {
  return `
    <div class="ppm-wrap">
      <div class="ppm-loading">
        <div class="ppm-spinner" aria-hidden="true"></div>
        <div class="ppm-loading-text">בודק מחירים ב-5 רשתות...</div>
      </div>
    </div>
  `;
}


function buildErrorHTML(errorMessage) {
  return `
    <div class="ppm-wrap">
      <div class="ppm-error">
        <div class="ppm-error-icon" aria-hidden="true">⚠️</div>
        <div class="ppm-error-text">${escapeHtml(errorMessage || 'לא הצלחנו לקבל מחירים. נסה שוב מאוחר יותר.')}</div>
        <button type="button" class="ppm-retry-btn" data-action="retry">
          נסה שוב
        </button>
      </div>
    </div>
  `;
}


function buildResultsHTML(prices, stats) {
  const chainsFound = stats.chains_found || 0;

  if (chainsFound === 0) {
    return `
      <div class="ppm-wrap">
        <div class="ppm-empty">
          <div class="ppm-empty-icon" aria-hidden="true">🔍</div>
          <div class="ppm-empty-title">המוצר לא נמצא במאגר המחירים</div>
          <div class="ppm-empty-text">נסה להקליד את שם המוצר באופן שונה (למשל ללא יצרן, או בלי יחידת מידה).</div>
        </div>
      </div>
    `;
  }

  const cheapestId = findCheapestChainId(prices);

  const rowsHtml = CHAIN_ORDER.map(chainId => {
    const info = prices[chainId];
    if (!info) return '';

    if (info.found) {
      const isCheapest = (chainId === cheapestId);
      return `
        <div class="ppm-row ${isCheapest ? 'is-cheapest' : ''}">
          <div class="ppm-row-main">
            <div class="ppm-chain">
              ${isCheapest ? '<span class="ppm-cheapest-badge" aria-label="הזול ביותר">✓</span>' : ''}
              <span class="ppm-chain-name">${escapeHtml(CHAIN_DISPLAY_NAMES[chainId] || info.chain_name)}</span>
            </div>
            <div class="ppm-price">${formatPrice(info.price)}</div>
          </div>
          <div class="ppm-product-name">${escapeHtml(info.name)}</div>
        </div>
      `;
    } else {
      return `
        <div class="ppm-row is-not-found">
          <div class="ppm-row-main">
            <div class="ppm-chain">
              <span class="ppm-chain-name">${escapeHtml(CHAIN_DISPLAY_NAMES[chainId])}</span>
            </div>
            <div class="ppm-price ppm-price-missing">לא נמצא במאגר</div>
          </div>
        </div>
      `;
    }
  }).join('');

  const showMax = stats.max != null && stats.max !== stats.min;
  const summaryHtml = `
    <div class="ppm-summary">
      <div class="ppm-summary-item">
        <div class="ppm-summary-label">ממוצע</div>
        <div class="ppm-summary-value">${formatPrice(stats.average)}</div>
      </div>
      <div class="ppm-summary-divider" aria-hidden="true"></div>
      <div class="ppm-summary-item ppm-summary-cheapest">
        <div class="ppm-summary-label">הזול ביותר</div>
        <div class="ppm-summary-value">${formatPrice(stats.min)}</div>
      </div>
      ${showMax ? `
        <div class="ppm-summary-divider" aria-hidden="true"></div>
        <div class="ppm-summary-item">
          <div class="ppm-summary-label">היקר ביותר</div>
          <div class="ppm-summary-value">${formatPrice(stats.max)}</div>
        </div>
      ` : ''}
    </div>
  `;

  const partialHint = chainsFound < CHAIN_ORDER.length ? `
    <div class="ppm-hint">
      נמצא ב-${chainsFound} מתוך ${CHAIN_ORDER.length} רשתות
    </div>
  ` : '';

  return `
    <div class="ppm-wrap">
      ${partialHint}
      <div class="ppm-rows">
        ${rowsHtml}
      </div>
      ${summaryHtml}
    </div>
  `;
}


// ============================================================================
// סגנון inline (מוזרק פעם אחת ל-<head>)
// ============================================================================

const STYLE_ID = 'ppm-styles';

function ensureStylesInjected() {
  if (document.getElementById(STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .ppm-wrap {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 4px 2px;
    }

    .ppm-hint {
      font-size: 12px;
      color: var(--color-text-muted);
      text-align: center;
    }

    /* Loading */
    .ppm-loading {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 36px 0 28px;
      gap: 14px;
    }

    .ppm-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid var(--color-primary-ultra-light);
      border-top-color: var(--color-primary);
      border-radius: 50%;
      animation: ppm-spin 0.8s linear infinite;
    }

    .ppm-loading-text {
      font-size: 13px;
      color: var(--color-text-soft);
    }

    @keyframes ppm-spin {
      to { transform: rotate(360deg); }
    }

    /* Rows */
    .ppm-rows {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .ppm-row {
      background: var(--color-surface-2);
      border: 1px solid var(--color-border);
      border-radius: var(--radius-md);
      padding: 10px 12px;
      transition: background-color 0.15s, border-color 0.15s;
    }

    .ppm-row.is-cheapest {
      background: rgba(125, 184, 125, 0.10);
      border-color: var(--color-success);
    }

    .ppm-row.is-not-found {
      background: var(--color-bg-alt);
      opacity: 0.75;
    }

    .ppm-row-main {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }

    .ppm-chain {
      display: flex;
      align-items: center;
      gap: 6px;
      min-width: 0;
    }

    .ppm-cheapest-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 18px;
      height: 18px;
      border-radius: 50%;
      background: var(--color-success);
      color: #fff;
      font-size: 11px;
      font-weight: 700;
      flex-shrink: 0;
    }

    .ppm-chain-name {
      font-size: 14px;
      font-weight: 600;
      color: var(--color-text);
    }

    .ppm-price {
      font-size: 16px;
      font-weight: 700;
      color: var(--color-text);
      direction: ltr;
      white-space: nowrap;
      flex-shrink: 0;
    }

    .ppm-row.is-cheapest .ppm-price {
      color: var(--color-success);
    }

    .ppm-price-missing {
      font-size: 12px;
      font-weight: 500;
      color: var(--color-text-muted);
    }

    .ppm-product-name {
      margin-top: 4px;
      font-size: 11px;
      color: var(--color-text-soft);
      line-height: 1.35;
      word-break: break-word;
    }

    /* Summary */
    .ppm-summary {
      display: flex;
      align-items: stretch;
      justify-content: space-around;
      gap: 8px;
      padding: 12px 8px;
      background: var(--color-primary-ultra-light);
      border-radius: var(--radius-md);
      margin-top: 4px;
    }

    .ppm-summary-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }

    .ppm-summary-label {
      font-size: 11px;
      color: var(--color-text-soft);
      font-weight: 500;
    }

    .ppm-summary-value {
      font-size: 15px;
      font-weight: 700;
      color: var(--color-text);
      direction: ltr;
    }

    .ppm-summary-cheapest .ppm-summary-value {
      color: var(--color-success);
    }

    .ppm-summary-divider {
      width: 1px;
      background: var(--color-border);
      opacity: 0.6;
    }

    /* Empty */
    .ppm-empty {
      text-align: center;
      padding: 24px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 10px;
    }

    .ppm-empty-icon {
      font-size: 40px;
      opacity: 0.7;
    }

    .ppm-empty-title {
      font-size: 15px;
      font-weight: 600;
      color: var(--color-text);
    }

    .ppm-empty-text {
      font-size: 13px;
      color: var(--color-text-soft);
      line-height: 1.5;
      max-width: 280px;
    }

    /* Error */
    .ppm-error {
      text-align: center;
      padding: 24px 12px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .ppm-error-icon {
      font-size: 36px;
    }

    .ppm-error-text {
      font-size: 14px;
      color: var(--color-text-soft);
      line-height: 1.5;
      max-width: 280px;
    }

    .ppm-retry-btn {
      padding: 10px 22px;
      background: var(--color-primary);
      color: #fff;
      border: none;
      border-radius: var(--radius-full);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.15s, transform 0.1s;
      font-family: inherit;
    }

    .ppm-retry-btn:hover {
      background: var(--color-primary-dark);
    }

    .ppm-retry-btn:active {
      transform: scale(0.96);
    }
  `;
  document.head.appendChild(style);
}


// ============================================================================
// טעינה ועדכון תוכן ה-container
// ============================================================================

async function loadAndRender(container, productName) {
  if (!container || !container.isConnected) return;

  container.innerHTML = buildLoadingHTML();

  // אופליין → לא טורחים לקרוא
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    container.innerHTML = buildErrorHTML('אין חיבור לאינטרנט. נסה שוב כשתהיה מחובר.');
    bindRetry(container, productName);
    return;
  }

  try {
    const result = await API.getProductPrice(productName);

    // אם המשתמש סגר את המודאל בינתיים - לא מעדכנים
    if (!container.isConnected) return;

    if (result.error) {
      container.innerHTML = buildErrorHTML('לא הצלחנו לקבל מחירים כרגע. נסה שוב.');
      bindRetry(container, productName);
      return;
    }

    container.innerHTML = buildResultsHTML(result.prices || {}, result.stats || {});

  } catch (err) {
    console.warn('product-price load failed:', err);
    if (!container.isConnected) return;
    container.innerHTML = buildErrorHTML('אירעה שגיאה. נסה שוב מאוחר יותר.');
    bindRetry(container, productName);
  }
}


function bindRetry(container, productName) {
  const btn = container.querySelector('[data-action="retry"]');
  if (btn) {
    btn.addEventListener('click', () => loadAndRender(container, productName));
  }
}


// ============================================================================
// API ציבורי
// ============================================================================

/**
 * פותח modal של "מחיר מוצר ב-5 רשתות".
 * @param {string} productName - שם המוצר לחיפוש
 */
export function openProductPriceModal(productName) {
  const name = (productName || '').trim();
  if (!name) {
    console.warn('openProductPriceModal: empty product name');
    return;
  }

  ensureStylesInjected();

  // יוצרים container כ-HTMLElement (לא string).
  // Modal.sheet יקבל אותו ויחבר אותו ל-modal-body.
  // אנחנו שומרים reference ומעדכנים אותו ישירות.
  const container = document.createElement('div');
  container.className = 'ppm-container';
  container.innerHTML = buildLoadingHTML();

  Modal.sheet({
    title: name,
    content: container,
    dismissable: true,
  });
  // Modal.sheet מחזיר Promise שנפתר בסגירה - אין צורך לחכות לו.
  // אנחנו רוצים לטעון נתונים ברקע ולעדכן את ה-container.

  loadAndRender(container, name);
}


// חשיפה לדיבוג בקונסול
if (typeof window !== 'undefined') {
  window.__productPriceModal = openProductPriceModal;
}
