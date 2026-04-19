/**
 * ============================================================================
 * main-ui.js - לוגיקת המסך הראשי (רשימת הקניות)
 * ============================================================================
 *
 * אחראי על:
 *   1. רנדור Header + Content + Input Bar
 *   2. טיפול באירועי משתמש (הוספה, מחיקה, סימון)
 *   3. גרירה למחיקה
 *   4. עדכון אוטומטי מ-State (onChange listener)
 *
 * תלויות:
 *   - state.js      → קריאה וכתיבה של הרשימה
 *   - products.js   → קטגוריזציה + פרסור קלט
 *   - config.js     → קטגוריות + הודעות
 * ============================================================================
 */

import { State } from './state.js?v=1';
import { parseUserInput } from './products.js?v=1';
import { CATEGORIES, MESSAGES } from './config.js?v=2';


// ============================================================================
// משתנים פנימיים
// ============================================================================

let isInitialized = false;
let currentHandlers = {};    // שמירת handlers לניקוי
let stateUnsubscribe = null; // פונקציה לביטול האזנה ל-state


// ============================================================================
// רנדור Header
// ============================================================================

function renderHeader() {
  const header = document.getElementById('main-header');
  if (!header) return;

  header.innerHTML = `
    <div class="main-header-bar">

      <!-- כתר פרימיום -->
      <button class="header-btn header-btn-premium" id="hdr-premium" title="שדרוג לפרימיום" aria-label="פרימיום">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M2 20h20M5 20V9l7 4 7-4v11M12 3l3 5-3 2-3-2 3-5z"/>
        </svg>
      </button>

      <!-- ניקוי רשימה -->
      <button class="header-btn header-btn-danger" id="hdr-clear" title="נקה רשימה" aria-label="נקה רשימה">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6"/>
        </svg>
      </button>

      <!-- עריכת רשתות -->
      <button class="header-btn" id="hdr-chains" title="רשתות השוואה" aria-label="רשתות השוואה">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 9l1 12h16l1-12M3 9l2-5h14l2 5M3 9h18M8 13h8"/>
        </svg>
      </button>

      <!-- מיקום -->
      <button class="header-btn" id="hdr-location" title="מיקום" aria-label="עדכן מיקום">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
          <circle cx="12" cy="10" r="3"/>
        </svg>
      </button>

      <!-- כותרת/לוגו במרכז -->
      <div class="header-title">
        <div class="header-title-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1.5" fill="currentColor"/>
            <circle cx="18" cy="21" r="1.5" fill="currentColor"/>
            <path d="M2.5 3h2.5l2.7 12.6a2 2 0 0 0 2 1.6h9.4a2 2 0 0 0 2-1.5L22 7H6"/>
          </svg>
        </div>
      </div>

      <!-- מדריך -->
      <button class="header-btn" id="hdr-tutorial" title="מדריך" aria-label="פתח מדריך">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      </button>

      <!-- התנתקות -->
      <button class="header-btn" id="hdr-logout" title="התנתק" aria-label="התנתק">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
          <polyline points="16 17 21 12 16 7"/>
          <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
      </button>

    </div>
  `;

  // חיבור listeners
  document.getElementById('hdr-premium').addEventListener('click', () => {
    showToast('פיצ׳ר פרימיום - יגיע בקרוב', 'warning');
  });

  document.getElementById('hdr-clear').addEventListener('click', handleClearAll);

  document.getElementById('hdr-chains').addEventListener('click', () => {
    showToast('ניהול רשתות - יגיע בקרוב', 'warning');
  });

  document.getElementById('hdr-location').addEventListener('click', () => {
    showToast('עדכון מיקום - יגיע בקרוב', 'warning');
  });

  document.getElementById('hdr-tutorial').addEventListener('click', () => {
    showToast('המדריך - יגיע בקרוב', 'warning');
  });

  document.getElementById('hdr-logout').addEventListener('click', handleLogout);
}


// ============================================================================
// רנדור Content - רשימת מוצרים מקובצת
// ============================================================================

function renderContent() {
  const content = document.getElementById('main-content');
  if (!content) return;

  const items = State.getItems();

  // רשימה ריקה
  if (items.length === 0) {
    content.innerHTML = `
      <div class="empty-list">
        <div class="empty-list-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1.5" fill="currentColor"/>
            <circle cx="18" cy="21" r="1.5" fill="currentColor"/>
            <path d="M2.5 3h2.5l2.7 12.6a2 2 0 0 0 2 1.6h9.4a2 2 0 0 0 2-1.5L22 7H6"/>
          </svg>
        </div>
        <h2 class="empty-list-title">הרשימה ריקה</h2>
        <p class="empty-list-text">
          התחל להקליד את המוצרים שאתה רוצה לקנות בשורה למטה,
          והאפליקציה תסדר אותם לקטגוריות אוטומטית
        </p>
        <div class="empty-list-arrow">
          הקלד למטה
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <polyline points="19 12 12 19 5 12"/>
          </svg>
        </div>
      </div>
    `;
    return;
  }

  // רשימה עם מוצרים - מקובצת לקטגוריות
  const grouped = State.getItemsByCategory();

  // סינון קטגוריות ריקות ומיון לפי order
  const visibleCategories = CATEGORIES
    .filter(cat => grouped[cat.id] && grouped[cat.id].length > 0)
    .sort((a, b) => a.order - b.order);

  let html = '';

  if (State.getUncheckedCount() > 0) {
    html += `
      <div class="compute-cart-bar">
        <button class="compute-cart-btn" id="compute-cart-btn">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
            <line x1="8" y1="9" x2="16" y2="9"/>
            <line x1="8" y1="12" x2="16" y2="12"/>
            <line x1="8" y1="15" x2="12" y2="15"/>
          </svg>
          <span>חשב את מחיר הסל</span>
          <span class="compute-cart-count">${State.getUncheckedCount()}</span>
        </button>
      </div>
    `;
  }

  html += '<div class="items-list">';

  visibleCategories.forEach(category => {
    const categoryItems = grouped[category.id];
    html += renderCategoryBlock(category, categoryItems);
  });

  html += '</div>';

  content.innerHTML = html;

  // חיבור listeners
  attachItemListeners();

  const computeBtn = document.getElementById('compute-cart-btn');
  if (computeBtn) {
    computeBtn.addEventListener('click', handleComputeCart);
  }
}


function renderCategoryBlock(category, items) {
  const itemsHtml = items.map(item => renderItemCard(item)).join('');

  return `
    <div class="category-block" data-category="${category.id}">
      <div class="category-header">
        <span class="category-icon">${category.icon}</span>
        <span class="category-name">${escapeHtml(category.name)}</span>
        <span class="category-count">${items.length}</span>
      </div>
      <div class="category-items">
        ${itemsHtml}
      </div>
    </div>
  `;
}


function renderItemCard(item) {
  const quantityDisplay = formatQuantity(item);

  return `
    <div class="item-card ${item.checked ? 'is-checked' : ''}" data-item-id="${item.id}">
      <div class="item-delete-bg" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"/>
          <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
        </svg>
      </div>
      <div class="item-card-content">
        <div class="item-check ${item.checked ? 'is-checked' : ''}" role="checkbox" aria-checked="${item.checked}" tabindex="0" aria-label="סמן ${escapeHtml(item.name)}"></div>
        <div class="item-info">
          <div class="item-name">${escapeHtml(item.name)}</div>
          ${quantityDisplay ? `<div class="item-meta"><span class="item-quantity-display">${quantityDisplay}</span></div>` : ''}
        </div>
        <div class="item-actions">
          <button class="item-action-btn item-btn-price" title="מחיר ממוצע" aria-label="מחיר">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <text x="12" y="17" text-anchor="middle" font-size="14" font-weight="bold" stroke-width="1" fill="currentColor">₪</text>
            </svg>
          </button>
          <button class="item-action-btn item-btn-qty" title="כמות" aria-label="ערוך כמות">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 5v14M5 12h14"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  `;
}


function formatQuantity(item) {
  if (!item.quantity || item.quantity === 1) {
    if (item.unit === 'kg' || item.unit === 'g') {
      return item.unit === 'kg' ? '1 ק״ג' : '1 גרם';
    }
    return '';
  }

  if (item.unit === 'kg') return `${item.quantity} ק״ג`;
  if (item.unit === 'g') return `${item.quantity} גרם`;
  if (item.unit === 'L') return `${item.quantity} ליטר`;
  if (item.unit === 'ml') return `${item.quantity} מ״ל`;
  return `× ${item.quantity}`;
}


// ============================================================================
// רנדור Input bar
// ============================================================================

function renderInputBar() {
  const bar = document.getElementById('main-input-bar');
  if (!bar) return;

  bar.innerHTML = `
    <div class="input-bar">
      <button class="input-btn" id="inp-camera" title="סריקת ברקוד" aria-label="סרוק ברקוד">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2"/>
          <rect x="7" y="7" width="10" height="10" rx="1"/>
        </svg>
      </button>

      <button class="input-btn" id="inp-voice" title="הקלטת קול" aria-label="הקלט קול">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8"/>
        </svg>
      </button>

      <div class="input-field-wrapper" id="input-wrapper">
        <input
          type="text"
          class="input-field"
          id="input-field"
          placeholder="הוסף מוצר..."
          autocomplete="off"
          autocorrect="off"
          spellcheck="false"
          inputmode="text"
          enterkeyhint="send"
        />
        <button class="input-submit" id="input-submit" title="הוסף" aria-label="הוסף מוצר">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="5" y1="12" x2="19" y2="12"/>
            <polyline points="12 5 19 12 12 19"/>
          </svg>
        </button>
      </div>
    </div>
  `;

  // חיבור listeners
  const field = document.getElementById('input-field');
  const wrapper = document.getElementById('input-wrapper');
  const submitBtn = document.getElementById('input-submit');

  field.addEventListener('input', () => {
    if (field.value.trim()) {
      wrapper.classList.add('has-text');
    } else {
      wrapper.classList.remove('has-text');
    }
  });

  field.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddItem();
    }
  });

  submitBtn.addEventListener('click', handleAddItem);

  document.getElementById('inp-camera').addEventListener('click', () => {
    showToast('סריקת ברקוד - יגיע בקרוב', 'warning');
  });

  document.getElementById('inp-voice').addEventListener('click', () => {
    showToast('הקלטת קול - יגיע בקרוב', 'warning');
  });
}


// ============================================================================
// טיפול בהוספת מוצר
// ============================================================================

function handleAddItem() {
  const field = document.getElementById('input-field');
  const wrapper = document.getElementById('input-wrapper');
  if (!field) return;

  const raw = field.value.trim();
  if (!raw) return;

  const parsed = parseUserInput(raw);
  if (!parsed) return;

  const item = State.addItem({
    name: parsed.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    category: parsed.category,
  });

  if (item) {
    // איפוס השדה
    field.value = '';
    wrapper.classList.remove('has-text');
    field.focus();

    // אנימציית feedback עדינה
    field.style.transform = 'scale(0.98)';
    setTimeout(() => { field.style.transform = ''; }, 120);
  }
}


// ============================================================================
// טיפול בפעולות על מוצרים (delegation - מאזין אחד על כל הרשימה)
// ============================================================================

function attachItemListeners() {
  const content = document.getElementById('main-content');
  if (!content) return;

  // סימון/ביטול סימון
  content.addEventListener('click', handleItemClick);

  // כל ה-swipe-to-delete
  setupSwipeListeners();
}

function handleItemClick(e) {
  const card = e.target.closest('.item-card');
  if (!card) return;
  const itemId = card.dataset.itemId;

  // לחיצה על ה-checkbox
  if (e.target.closest('.item-check')) {
    State.toggleChecked(itemId);
    return;
  }

  // לחיצה על כפתור הכמות - הגדלה ב-1
  if (e.target.closest('.item-btn-qty')) {
    const item = State.getItems().find(i => i.id === itemId);
    if (item) {
      const newQty = (item.quantity || 1) + 1;
      State.updateItem(itemId, { quantity: newQty });
    }
    return;
  }

  // לחיצה על כפתור המחיר
  if (e.target.closest('.item-btn-price')) {
    showToast('מחירים - יגיע בקרוב', 'warning');
    return;
  }
}


// ============================================================================
// Swipe to delete (גרירה למחיקה)
// ============================================================================

function setupSwipeListeners() {
  const content = document.getElementById('main-content');
  if (!content) return;

  let startX = 0;
  let currentX = 0;
  let activeCard = null;
  let activeContent = null;
  let isSwiping = false;

  const SWIPE_THRESHOLD = 100;     // אחרי כמה px נמחק
  const SWIPE_MIN = 10;             // מתחת לזה לא swipe

  content.addEventListener('touchstart', (e) => {
    const card = e.target.closest('.item-card');
    if (!card) return;

    // לא מתחילים swipe אם לוחצים על כפתור
    if (e.target.closest('.item-action-btn') ||
        e.target.closest('.item-check')) return;

    activeCard = card;
    activeContent = card.querySelector('.item-card-content');
    startX = e.touches[0].clientX;
    currentX = startX;
    isSwiping = false;
  }, { passive: true });

  content.addEventListener('touchmove', (e) => {
    if (!activeCard) return;

    currentX = e.touches[0].clientX;
    const diff = currentX - startX;

    // RTL: גרירה לכיוון ימין (diff חיובי) = מחיקה
    // LTR: גרירה לכיוון שמאל (diff שלילי) = מחיקה
    // במקרה שלנו RTL אז ניקח רק diff חיובי
    if (diff > SWIPE_MIN) {
      isSwiping = true;
      activeCard.classList.add('is-swiping');
      activeContent.style.transform = `translateX(${Math.min(diff, 200)}px)`;
    } else if (diff < -SWIPE_MIN) {
      // גרירה הפוכה - מבטלת
      if (isSwiping) {
        activeContent.style.transform = '';
        activeCard.classList.remove('is-swiping');
      }
    }
  }, { passive: true });

  content.addEventListener('touchend', () => {
    if (!activeCard) return;

    const diff = currentX - startX;

    if (diff >= SWIPE_THRESHOLD) {
      // מחיקה
      deleteItemWithAnimation(activeCard);
    } else {
      // ביטול - חזרה למצב רגיל
      if (activeContent) {
        activeContent.style.transform = '';
      }
      activeCard.classList.remove('is-swiping');
    }

    activeCard = null;
    activeContent = null;
    isSwiping = false;
  });
}

function deleteItemWithAnimation(card) {
  const itemId = card.dataset.itemId;
  card.classList.add('is-deleting');

  setTimeout(() => {
    State.removeItem(itemId);
  }, 280);
}


// ============================================================================
// פעולות Header
// ============================================================================

function handleClearAll() {
  const count = State.getItemCount();
  if (count === 0) {
    showToast('הרשימה כבר ריקה', 'warning');
    return;
  }

  if (confirm(`לנקות את כל הרשימה? (${count} מוצרים)`)) {
    State.clearAll();
    showToast('הרשימה נוקתה', 'success');
  }
}

async function handleLogout() {
  if (!confirm('להתנתק מהחשבון?')) return;

  // יציאה - app.js יטפל ב-cleanup
  window.dispatchEvent(new CustomEvent('app:logout-request'));
}

function handleComputeCart() {
  showToast('חישוב מחיר הסל - יגיע בקרוב', 'warning');
}


// ============================================================================
// עדכון חיווי סנכרון
// ============================================================================

function updateSyncIndicator() {
  const indicator = document.getElementById('sync-indicator');
  if (!indicator) return;

  if (State.isSyncing()) {
    indicator.className = 'sync-indicator visible syncing';
    indicator.textContent = 'מסנכרן...';
  } else {
    indicator.classList.remove('visible', 'syncing', 'error');
  }
}


// ============================================================================
// עזרי UI
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}

function showToast(msg, type) {
  if (window.showToast) window.showToast(msg, type || '');
}


// ============================================================================
// API ציבורי
// ============================================================================

/**
 * אתחול המסך הראשי. נקרא מ-app.js אחרי שהמשתמש התחבר וה-State אותחל.
 */
export function initMainUI() {
  if (isInitialized) {
    // אם כבר אותחל פעם - רק נעדכן את התצוגה
    renderContent();
    return;
  }

  renderHeader();
  renderInputBar();
  renderContent();

  // rendering debounce - מונע רנדור כפול בתוך אותו tick
  let renderTimer = null;
  let pendingSyncUpdate = false;

  const scheduleRender = (eventType) => {
    // אם זה רק עדכון סנכרון - לא צריך לרנדר מחדש, רק חיווי
    if (eventType === 'syncing' || eventType === 'synced' || eventType === 'sync-error') {
      updateSyncIndicator();
      return;
    }

    // דחיית רנדור במיקרו-tick כדי לאחד עדכונים
    if (renderTimer) return;
    renderTimer = setTimeout(() => {
      renderTimer = null;
      renderContent();
      updateSyncIndicator();
    }, 16);  // frame rate אחד
  };

  // האזנה לשינויים ב-state
  stateUnsubscribe = State.onChange((newState, eventType) => {
    scheduleRender(eventType);
  });

  isInitialized = true;
}

/**
 * ניקוי המסך (בעת התנתקות)
 */
export function destroyMainUI() {
  if (stateUnsubscribe) {
    stateUnsubscribe();
    stateUnsubscribe = null;
  }

  ['main-header', 'main-content', 'main-input-bar'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });

  isInitialized = false;
}

/**
 * הצגת המסך הראשי
 */
export function showMain() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-main');
  if (screen) screen.classList.add('active');
}
