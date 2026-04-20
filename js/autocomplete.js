/**
 * ============================================================================
 * autocomplete.js - תפריט הצעות השלמה אוטומטית
 * ============================================================================
 *
 * מציג תפריט הצעות מעל שדה הקלט כשהמשתמש מקליד.
 *
 * מאפיינים:
 *   - Debounce של 200ms למניעת עומס על ה-API
 *   - ניווט במקלדת (חצים, Enter, Escape)
 *   - לחיצה על הצעה מוסיפה אותה לרשימה
 *   - בחירה חכמה של קטגוריה ויחידה
 *
 * API:
 *   initAutocomplete(inputElement, onSelect)
 *   destroyAutocomplete()
 * ============================================================================
 */

import { API } from './api.js?v=1';
import { UI_CONFIG, CATEGORIES } from './config.js?v=2';


// ============================================================================
// State פנימי
// ============================================================================

let inputEl = null;           // שדה הקלט
let dropdownEl = null;        // ה-dropdown של ההצעות
let currentSuggestions = [];  // ההצעות המוצגות כעת
let highlightedIndex = -1;    // איזו הצעה מודגשת (לניווט מקלדת)
let debounceTimer = null;
let onSelectCallback = null;
let currentQuery = '';


// ============================================================================
// יצירת אלמנט ה-dropdown
// ============================================================================

function createDropdown() {
  const el = document.createElement('div');
  el.className = 'autocomplete-dropdown';
  el.setAttribute('role', 'listbox');
  el.style.display = 'none';
  document.body.appendChild(el);
  return el;
}


// ============================================================================
// מיקום ה-dropdown מעל שדה הקלט
// ============================================================================

function positionDropdown() {
  if (!inputEl || !dropdownEl) return;

  const wrapper = inputEl.closest('.input-field-wrapper') || inputEl;
  const rect = wrapper.getBoundingClientRect();

  // ה-dropdown יופיע **מעל** שורת הקלט (לא מתחת, כי הקלט בתחתית המסך)
  dropdownEl.style.position = 'fixed';
  dropdownEl.style.right = `${window.innerWidth - rect.right}px`;
  dropdownEl.style.left = `${rect.left + 50}px`;   // +50 להשאיר מקום לכפתורי מצלמה/קול
  dropdownEl.style.bottom = `${window.innerHeight - rect.top + 8}px`;
  dropdownEl.style.maxHeight = `${Math.min(rect.top - 20, 320)}px`;
}


// ============================================================================
// רנדור ההצעות
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text || '');
  return div.innerHTML;
}

function highlightQuery(text, query) {
  if (!query || !text) return escapeHtml(text);

  const safeText = escapeHtml(text);
  const safeQuery = escapeHtml(query);

  // מחפשים את ה-query בתוך הטקסט (case-insensitive) ועוטפים ב-<mark>
  const idx = safeText.toLowerCase().indexOf(safeQuery.toLowerCase());
  if (idx === -1) return safeText;

  return safeText.substring(0, idx) +
         `<mark>${safeText.substring(idx, idx + safeQuery.length)}</mark>` +
         safeText.substring(idx + safeQuery.length);
}

function categoryInfo(categoryId) {
  const cat = CATEGORIES.find(c => c.id === categoryId);
  return cat ? { icon: cat.icon, name: cat.name } : { icon: '🛒', name: 'שונות' };
}

function renderSuggestions(suggestions, query) {
  if (!dropdownEl) return;

  currentSuggestions = suggestions;
  highlightedIndex = -1;

  if (suggestions.length === 0) {
    dropdownEl.style.display = 'none';
    return;
  }

  const html = suggestions.map((sugg, idx) => {
    const catInfo = categoryInfo(sugg.category);
    const displayName = sugg.name || sugg.baseName || '';
    const subtitle = sugg.brand ? sugg.brand : (sugg.variant || '');

    return `
      <div class="autocomplete-item" role="option" data-index="${idx}" tabindex="-1">
        <div class="autocomplete-item-icon">${catInfo.icon}</div>
        <div class="autocomplete-item-content">
          <div class="autocomplete-item-name">${highlightQuery(displayName, query)}</div>
          ${subtitle ? `<div class="autocomplete-item-sub">${escapeHtml(subtitle)}</div>` : ''}
        </div>
        ${sugg.avgPrice ? `<div class="autocomplete-item-price">₪${sugg.avgPrice}</div>` : ''}
      </div>
    `;
  }).join('');

  dropdownEl.innerHTML = html;
  dropdownEl.style.display = 'block';
  positionDropdown();

  // לחיצה על הצעה
  dropdownEl.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      // mousedown כדי שיעבוד לפני ה-blur של ה-input
      e.preventDefault();
      const idx = parseInt(item.dataset.index, 10);
      selectSuggestion(idx);
    });

    item.addEventListener('mouseenter', () => {
      highlightedIndex = parseInt(item.dataset.index, 10);
      updateHighlight();
    });
  });
}

function updateHighlight() {
  if (!dropdownEl) return;
  dropdownEl.querySelectorAll('.autocomplete-item').forEach((item, idx) => {
    item.classList.toggle('is-highlighted', idx === highlightedIndex);
  });

  // גלילה כדי להראות את הפריט המודגש
  if (highlightedIndex >= 0) {
    const highlighted = dropdownEl.querySelector('.autocomplete-item.is-highlighted');
    if (highlighted) {
      highlighted.scrollIntoView({ block: 'nearest' });
    }
  }
}


// ============================================================================
// הסתרת ה-dropdown
// ============================================================================

function hideDropdown() {
  if (dropdownEl) {
    dropdownEl.style.display = 'none';
  }
  currentSuggestions = [];
  highlightedIndex = -1;
}


// ============================================================================
// בחירת הצעה
// ============================================================================

function selectSuggestion(index) {
  if (index < 0 || index >= currentSuggestions.length) return;

  const suggestion = currentSuggestions[index];
  if (!suggestion) return;

  hideDropdown();

  if (onSelectCallback) {
    onSelectCallback({
      name: suggestion.name || suggestion.baseName,
      category: suggestion.category || 'other',
      unit: suggestion.unit || 'units',
      brand: suggestion.brand,
      specificProductId: suggestion.id || null,
      avgPrice: suggestion.avgPrice || null,
    });
  }

  // איפוס שדה הקלט
  if (inputEl) {
    inputEl.value = '';
    const wrapper = inputEl.closest('.input-field-wrapper');
    if (wrapper) wrapper.classList.remove('has-text');
    inputEl.focus();
  }
}


// ============================================================================
// טיפול בהקלדה
// ============================================================================

async function handleInput() {
  const query = inputEl.value.trim();
  currentQuery = query;

  // ניקוי timer קודם
  if (debounceTimer) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  // אם קצר מדי - ננקה
  if (query.length < 1) {
    hideDropdown();
    return;
  }

  // Debounce - המתנה לפני שליחה
  debounceTimer = setTimeout(async () => {
    // בדיקה שהשאילתה לא השתנתה בזמן ההמתנה
    if (query !== currentQuery) return;

    const suggestions = await API.searchProducts(query);

    // בדיקה נוספת שהשאילתה לא השתנתה בזמן הקריאה
    if (query !== currentQuery) return;

    renderSuggestions(suggestions, query);
  }, UI_CONFIG.autocompleteDebounceMs || 200);
}


// ============================================================================
// טיפול במקלדת (חצים, Enter, Escape)
// ============================================================================

function handleKeydown(e) {
  if (currentSuggestions.length === 0) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      highlightedIndex = Math.min(highlightedIndex + 1, currentSuggestions.length - 1);
      updateHighlight();
      break;

    case 'ArrowUp':
      e.preventDefault();
      highlightedIndex = Math.max(highlightedIndex - 1, 0);
      updateHighlight();
      break;

    case 'Enter':
      if (highlightedIndex >= 0) {
        e.preventDefault();
        e.stopPropagation();
        selectSuggestion(highlightedIndex);
      }
      break;

    case 'Escape':
      hideDropdown();
      break;
  }
}


// ============================================================================
// סגירה בלחיצה מחוץ
// ============================================================================

function handleDocumentClick(e) {
  if (!dropdownEl || !inputEl) return;
  if (!dropdownEl.contains(e.target) && !inputEl.contains(e.target)) {
    hideDropdown();
  }
}


// ============================================================================
// API ציבורי
// ============================================================================

/**
 * אתחול ה-autocomplete על שדה קלט
 * @param {HTMLInputElement} inputElement - שדה הקלט
 * @param {function} onSelect - callback שנקרא כשהמשתמש בוחר הצעה
 */
export function initAutocomplete(inputElement, onSelect) {
  if (!inputElement) return;

  // ניקוי קודם אם קיים
  destroyAutocomplete();

  inputEl = inputElement;
  onSelectCallback = onSelect;

  if (!dropdownEl) {
    dropdownEl = createDropdown();
  }

  // חיבור listeners
  inputEl.addEventListener('input', handleInput);
  inputEl.addEventListener('keydown', handleKeydown);
  inputEl.addEventListener('blur', () => {
    // דחייה קטנה כדי שלחיצה על הצעה תעבוד
    setTimeout(hideDropdown, 150);
  });

  document.addEventListener('click', handleDocumentClick);
  window.addEventListener('resize', positionDropdown);
  window.addEventListener('scroll', positionDropdown, true);
}


/**
 * הסרת ה-autocomplete
 */
export function destroyAutocomplete() {
  if (inputEl) {
    inputEl.removeEventListener('input', handleInput);
    inputEl.removeEventListener('keydown', handleKeydown);
  }
  document.removeEventListener('click', handleDocumentClick);
  window.removeEventListener('resize', positionDropdown);
  window.removeEventListener('scroll', positionDropdown, true);

  if (dropdownEl && dropdownEl.parentNode) {
    dropdownEl.parentNode.removeChild(dropdownEl);
  }

  inputEl = null;
  dropdownEl = null;
  onSelectCallback = null;
  currentSuggestions = [];
}
