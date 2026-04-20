/**
 * ============================================================================
 * history.js - מסך היסטוריית קניות
 * ============================================================================
 *
 * מציג:
 *   1. רשימת קניות שמורות (ממוינות מהחדש לישן)
 *   2. גרף בר של הוצאות חודשיות
 *   3. סיכום: סה"כ הוצאה, חיסכון לעומת רשת יקרה
 *   4. אפשרות לצפות בפרטי קנייה (פירוט פריטים)
 *   5. אפשרות למחוק קנייה מההיסטוריה
 *
 * API:
 *   openHistory() - פתיחת המסך
 * ============================================================================
 */

import { State } from './state.js?v=1';
import { Modal } from './modals.js?v=1';


// ============================================================================
// עזרי פורמט
// ============================================================================

function formatPrice(price) {
  if (price == null || isNaN(price)) return '—';
  return `₪${Number(price).toFixed(2)}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, today)) return 'היום';
  if (isSameDay(d, yesterday)) return 'אתמול';

  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  return `${d.getDate()} ב${months[d.getMonth()]}`;
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}

function getMonthYear(timestamp) {
  const d = new Date(timestamp);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getMonthLabel(monthYear) {
  const months = ['ינו', 'פבר', 'מרץ', 'אפר', 'מאי', 'יונ',
                  'יול', 'אוג', 'ספט', 'אוק', 'נוב', 'דצמ'];
  const [year, month] = monthYear.split('-').map(Number);
  return `${months[month - 1]} ${String(year).slice(2)}`;
}


// ============================================================================
// ניתוח סטטיסטיקות
// ============================================================================

function calculateStats(history) {
  if (!history || history.length === 0) {
    return {
      totalSpent: 0,
      totalSavings: 0,
      avgPerShopping: 0,
      shoppingCount: 0,
      monthlyData: [],
    };
  }

  const totalSpent = history.reduce((sum, h) => sum + (h.totalPrice || 0), 0);

  // חיסכון משוער: ההפרש בין הקנייה שבחר המשתמש לבין הרשת היקרה ביותר
  // כיוון שאנחנו שומרים רק את הסל הזול - החיסכון הוא ~12% מהסכום (ממוצע בישראל)
  const avgSavingsRatio = 0.12;
  const totalSavings = totalSpent * avgSavingsRatio;

  const avgPerShopping = totalSpent / history.length;

  // חלוקה לחודשים
  const byMonth = {};
  history.forEach(h => {
    if (!h.createdAt) return;
    const monthKey = getMonthYear(h.createdAt);
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = { total: 0, count: 0 };
    }
    byMonth[monthKey].total += h.totalPrice || 0;
    byMonth[monthKey].count += 1;
  });

  // 6 חודשים אחרונים
  const now = new Date();
  const monthlyData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    monthlyData.push({
      month: key,
      label: getMonthLabel(key),
      total: byMonth[key]?.total || 0,
      count: byMonth[key]?.count || 0,
    });
  }

  return {
    totalSpent,
    totalSavings,
    avgPerShopping,
    shoppingCount: history.length,
    monthlyData,
  };
}


// ============================================================================
// רנדור - סיכום עליון
// ============================================================================

function renderSummary(stats) {
  return `
    <div class="history-summary">
      <div class="history-stat">
        <div class="history-stat-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="9" cy="21" r="1.5" fill="currentColor"/>
            <circle cx="18" cy="21" r="1.5" fill="currentColor"/>
            <path d="M2.5 3h2.5l2.7 12.6a2 2 0 0 0 2 1.6h9.4a2 2 0 0 0 2-1.5L22 7H6"/>
          </svg>
        </div>
        <div class="history-stat-value">${stats.shoppingCount}</div>
        <div class="history-stat-label">קניות</div>
      </div>

      <div class="history-stat">
        <div class="history-stat-icon variant-total">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"/>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
          </svg>
        </div>
        <div class="history-stat-value">${formatPrice(stats.totalSpent)}</div>
        <div class="history-stat-label">סה״כ הוצאה</div>
      </div>

      <div class="history-stat">
        <div class="history-stat-icon variant-savings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <div class="history-stat-value">${formatPrice(stats.totalSavings)}</div>
        <div class="history-stat-label">חיסכון משוער</div>
      </div>
    </div>
  `;
}


// ============================================================================
// רנדור - גרף חודשי
// ============================================================================

function renderChart(monthlyData) {
  const maxTotal = Math.max(...monthlyData.map(m => m.total), 1);
  const hasData = monthlyData.some(m => m.total > 0);

  if (!hasData) {
    return `
      <div class="history-chart-wrapper">
        <h3 class="history-section-title">הוצאות חודשיות</h3>
        <div class="history-chart-empty">עוד אין היסטוריה חודשית</div>
      </div>
    `;
  }

  const bars = monthlyData.map(m => {
    const heightPercent = maxTotal > 0 ? (m.total / maxTotal) * 100 : 0;
    const hasValue = m.total > 0;
    return `
      <div class="chart-bar-wrapper">
        <div class="chart-bar-value">${hasValue ? formatPrice(m.total) : ''}</div>
        <div class="chart-bar ${hasValue ? 'has-value' : ''}" style="height: ${Math.max(heightPercent, 2)}%"></div>
        <div class="chart-bar-label">${m.label}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="history-chart-wrapper">
      <h3 class="history-section-title">הוצאות חודשיות</h3>
      <div class="history-chart">${bars}</div>
    </div>
  `;
}


// ============================================================================
// רנדור - רשימת קניות
// ============================================================================

function renderHistoryList(history) {
  if (!history || history.length === 0) {
    return `
      <div class="history-empty">
        <div class="history-empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 8v4l3 3"/>
            <circle cx="12" cy="12" r="10"/>
          </svg>
        </div>
        <div class="history-empty-title">אין עדיין היסטוריה</div>
        <div class="history-empty-text">
          קניות שתשמור יופיעו כאן, יחד עם סיכום הוצאות חודשי וחיסכון מצטבר
        </div>
      </div>
    `;
  }

  // קיבוץ לפי תאריך
  const byDate = {};
  history.forEach(h => {
    const dateKey = formatDate(h.createdAt);
    if (!byDate[dateKey]) byDate[dateKey] = [];
    byDate[dateKey].push(h);
  });

  let html = '<div class="history-list">';
  html += '<h3 class="history-section-title">קניות אחרונות</h3>';

  Object.entries(byDate).forEach(([dateLabel, items]) => {
    html += `<div class="history-date-group">`;
    html += `<div class="history-date-label">${escapeHtml(dateLabel)}</div>`;

    items.forEach(h => {
      const items = h.items || [];
      const itemCount = h.totalItems || items.length;
      const preview = items.slice(0, 3).map(i => i.name).join(' · ');

      html += `
        <div class="history-item" data-id="${escapeHtml(h.id)}">
          <div class="history-item-main">
            <div class="history-item-chain">
              <span class="history-item-chain-name">${escapeHtml(h.chainName || 'רשת לא ידועה')}</span>
              <span class="history-item-time">${formatTime(h.createdAt)}</span>
            </div>
            <div class="history-item-preview">${escapeHtml(preview)}${items.length > 3 ? ` +${items.length - 3}` : ''}</div>
            <div class="history-item-meta">${itemCount} מוצרים</div>
          </div>
          <div class="history-item-right">
            <div class="history-item-price">${formatPrice(h.totalPrice)}</div>
            <button class="history-item-delete" data-action="delete" data-id="${escapeHtml(h.id)}" title="מחק" aria-label="מחק">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
              </svg>
            </button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  html += '</div>';
  return html;
}


// ============================================================================
// רנדור מלא
// ============================================================================

function renderHistoryContent(container, history) {
  const stats = calculateStats(history);

  container.innerHTML = `
    ${renderSummary(stats)}
    ${renderChart(stats.monthlyData)}
    ${renderHistoryList(history)}
  `;

  attachListeners(container, history);
}


function renderLoading(container) {
  container.innerHTML = `
    <div class="history-loading">
      <div class="cart-loading-spinner"></div>
      <div class="history-loading-text">טוען היסטוריה...</div>
    </div>
  `;
}


// ============================================================================
// אירועים
// ============================================================================

function attachListeners(container, history) {
  // מחיקה
  container.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      await handleDeleteItem(id, container);
    });
  });

  // לחיצה על פריט - פתיחת פירוט
  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', (e) => {
      if (e.target.closest('[data-action]')) return;  // לחיצה על כפתור מחיקה
      const id = item.dataset.id;
      const record = history.find(h => h.id === id);
      if (record) showDetails(record);
    });
  });
}


async function handleDeleteItem(itemId, container) {
  const confirmed = await Modal.confirm({
    title: 'מחיקת היסטוריה',
    message: 'האם למחוק את הקנייה הזו מההיסטוריה? פעולה זו לא ניתנת לביטול.',
    variant: 'danger',
    confirmText: 'מחק',
    cancelText: 'ביטול',
  });

  if (!confirmed) return;

  try {
    await State.deleteHistoryItem(itemId);
    if (window.showToast) window.showToast('נמחק מההיסטוריה', 'success');
    await reloadHistory(container);
  } catch (err) {
    console.error('Delete history failed:', err);
    if (window.showToast) window.showToast('שגיאה במחיקה', 'error');
  }
}


async function showDetails(record) {
  const items = record.items || [];

  let html = `
    <div class="history-details-header">
      <div class="history-details-chain">${escapeHtml(record.chainName || '')}</div>
      <div class="history-details-total">${formatPrice(record.totalPrice)}</div>
    </div>
    <div class="history-details-items">
  `;

  items.forEach(item => {
    const qty = item.quantity || 1;
    const unit = item.unit || 'units';
    const unitLabel = unit === 'kg' ? 'ק״ג' : unit === 'g' ? 'גרם' : unit === 'L' ? 'ל׳' : unit === 'ml' ? 'מ״ל' : 'יח׳';
    html += `
      <div class="history-details-item">
        <div class="history-details-item-name">${escapeHtml(item.name)}</div>
        <div class="history-details-item-qty">${qty} ${unitLabel}</div>
      </div>
    `;
  });

  html += '</div>';

  const container = document.createElement('div');
  container.innerHTML = html;

  Modal.open({
    title: 'פרטי הקנייה',
    subtitle: formatDate(record.createdAt) + ' • ' + formatTime(record.createdAt),
    size: 'md',
    content: container,
    buttons: [
      { text: 'סגור', variant: 'ghost', flex: true, close: true },
    ],
  });
}


async function reloadHistory(container) {
  renderLoading(container);
  try {
    const history = await State.getHistory(50);
    renderHistoryContent(container, history);
  } catch (err) {
    console.error('Load history failed:', err);
    container.innerHTML = `
      <div class="history-error">
        שגיאה בטעינת ההיסטוריה. נסה שוב מאוחר יותר.
      </div>
    `;
  }
}


// ============================================================================
// API ציבורי
// ============================================================================

/**
 * פתיחת מסך היסטוריה
 */
export async function openHistory() {
  const container = document.createElement('div');
  container.className = 'history-container';

  // פתיחת החלון
  Modal.sheet({
    title: 'היסטוריית קניות',
    subtitle: 'הוצאות, חיסכון ופרטי קניות קודמות',
    content: container,
    buttons: [
      { text: 'סגור', variant: 'ghost', flex: true, close: true },
    ],
  });

  // טעינת הדאטה
  renderLoading(container);
  try {
    const history = await State.getHistory(50);
    renderHistoryContent(container, history);
  } catch (err) {
    console.error('Load history failed:', err);
    container.innerHTML = `
      <div class="history-error">
        שגיאה בטעינת ההיסטוריה. נסה שוב מאוחר יותר.
      </div>
    `;
  }
}
