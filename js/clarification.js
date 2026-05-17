/**
 * ============================================================================
 * clarification.js - לוגיקת תור הבהרה (data layer בלבד, ללא UI)
 * ============================================================================
 *
 * מטרה:
 *   בעת לחיצה על "חשב סל", חלק מהפריטים זקוקים להבהרה לפני שליחה לוורקר —
 *   למשל "חלב" צריך לבחור 3% / 1% / סויה. המודול הזה מזהה אילו פריטים
 *   צריכים מודאל, ומספק API להחלת בחירות על הפריטים.
 *
 * עקרונות ארכיטקטוניים:
 *   - הבהרה רק ברגע "חשב סל" (חוק) — לא בעת הרישום.
 *   - הפריט המקורי ב-State לא משתנה. אנחנו יוצרים item מועשר חדש.
 *   - "דלג" שונה מ"ברירת מחדל": skip = לא נשלח לוורקר. default = נשלח עם
 *     ה-searchTerms של ה-base (התנהגות נוכחית).
 *   - אם המודאל לא נפתח / נסגר בלי בחירה — זה default (לא skip).
 *
 * זרימה (תיהיה מחוברת ל-UI בצ'אט 2/3):
 *   items → buildClarificationQueue() → [item, item, item]
 *      ↓ (UI מציג מודאל לכל אחד)
 *   user picks variant → applyVariantChoice(item, variantId) → enrichedItem
 *   user types custom  → applyCustomChoice(item, text)       → enrichedItem
 *   user skips         → applySkipChoice(item)               → enrichedItem (skipped)
 *      ↓
 *   קוראים ל-API.computeCart עם הפריטים המעושרים
 *
 * API ציבורי:
 *   findBaseForItem(itemName)         → base object או null
 *   needsClarification(item)          → boolean
 *   buildClarificationQueue(items)    → array של פריטים שצריכים הבהרה
 *   applyVariantChoice(item, varId)   → enrichedItem
 *   applyCustomChoice(item, text)     → enrichedItem
 *   applySkipChoice(item)             → enrichedItem (skipped)
 *   isSkipped(item)                   → boolean
 * ============================================================================
 */

import { POPULAR_PRODUCTS, searchPopular } from './popular-products.js?v=1';


// ============================================================================
// זיהוי base בפריט
// ============================================================================

/**
 * מחפש את ה-base ב-popular-products.js שמתאים לשם הפריט.
 * משתמש באותה אסטרטגיה כמו findPopularByName ב-api.js:
 *   1. התאמה מדויקת לשם ה-base.
 *   2. אם אין מדויקת - הראשון מתוצאות searchPopular (ממוין לפי startsWith).
 *
 * חשוב: מחזיר את ה-base **כולו** (כולל variants), לא רק searchTerms/excludeTerms,
 * כי אנחנו צריכים את ה-variants כדי להציג אותם במודאל.
 *
 * @param {string} itemName
 * @returns {object|null} ה-base מ-POPULAR_PRODUCTS, או null
 */
export function findBaseForItem(itemName) {
  if (!itemName) return null;

  const trimmed = String(itemName).trim().toLowerCase();
  if (trimmed.length === 0) return null;

  // 1. התאמה מדויקת לשם ה-base
  const exact = POPULAR_PRODUCTS.find(b =>
    b.base && b.base.toLowerCase() === trimmed
  );
  if (exact) return exact;

  // 2. אם אין מדויקת - searchPopular שכבר ממיין לפי startsWith
  const matches = searchPopular(trimmed, 5);
  if (!matches || matches.length === 0) return null;

  // searchPopular מחזיר תוצאות מנורמלות. צריך למצוא את ה-base המקורי
  // ב-POPULAR_PRODUCTS לפי baseName.
  const topMatch = matches[0];
  const baseName = topMatch.baseName || topMatch.base;
  if (!baseName) return null;

  return POPULAR_PRODUCTS.find(b => b.base === baseName) || null;
}


/**
 * האם פריט נתון צריך מודאל הבהרה?
 *
 * הכללים:
 *   1. אם הפריט כבר עבר הבהרה (יש selectedVariantId / customApplied / skipped)
 *      → לא צריך שוב.
 *   2. אם נמצא base עם variants[] ובו 2+ אופציות → צריך הבהרה.
 *   3. אחרת (פריט פשוט / לא במאגר) → לא צריך.
 *
 * @param {object} item - פריט מה-State
 * @returns {boolean}
 */
export function needsClarification(item) {
  if (!item) return false;

  // אם הפריט כבר עבר הבהרה בסבב הזה - לא לפתוח שוב
  if (item._clarified) return false;

  const base = findBaseForItem(item.name);
  if (!base) return false;

  const variants = Array.isArray(base.variants) ? base.variants : [];
  return variants.length >= 2;
}


/**
 * בונה תור של פריטים שצריכים הבהרה.
 * הסדר: לפי הסדר שהם הופיעו ברשימה (כדי שזה ירגיש "טבעי" למשתמש).
 *
 * @param {object[]} items - פריטים לא-מסומנים מה-State
 * @returns {object[]} פריטים שצריכים מודאל (תת-קבוצה של items)
 */
export function buildClarificationQueue(items) {
  if (!Array.isArray(items)) return [];
  return items.filter(needsClarification);
}


// ============================================================================
// החלת בחירות על פריטים
// ============================================================================

/**
 * המשתמש בחר וריאציה מהמודאל.
 * מחזיר item מועשר עם searchTerms/excludeTerms של ה-variant.
 *
 * חשוב: הפונקציה לא משנה את ה-item המקורי (immutable). ה-item המעושר
 * נשלח ל-api.js → Worker. ה-State נשאר עם השם המקורי בלבד.
 *
 * @param {object} item       - הפריט המקורי
 * @param {string} variantId  - id של ה-variant שנבחר
 * @returns {object} item מועשר, או ה-item המקורי אם לא נמצא ה-variant
 */
export function applyVariantChoice(item, variantId) {
  if (!item || !variantId) return item;

  const base = findBaseForItem(item.name);
  if (!base || !Array.isArray(base.variants)) return item;

  const variant = base.variants.find(v => v.id === variantId);
  if (!variant) {
    console.warn(`[clarification] variant "${variantId}" not found for "${item.name}"`);
    return item;
  }

  return {
    ...item,
    _clarified: true,
    _clarificationKind: 'variant',
    selectedVariantId: variantId,
    searchTerms:  Array.isArray(variant.searchTerms)  ? variant.searchTerms  : [],
    excludeTerms: Array.isArray(variant.excludeTerms) ? variant.excludeTerms : [],
  };
}


/**
 * המשתמש לחץ על "אחר" וכתב טקסט חופשי.
 * הטקסט מתפצל על רווחים → AND search terms.
 *
 * דוגמה: "חלב תנובה דל לקטוז" → searchTerms: ['חלב', 'תנובה', 'דל', 'לקטוז']
 *
 * אסטרטגיה לגבי excludeTerms בטקסט חופשי:
 *   - אם מצאנו base → לוקחים את ה-excludeTerms שלו (סינון רעש בסיסי).
 *   - אחרת → ריק. הסיכון: המשתמש יקבל רעש. אבל כתוב בעצמו = יודע מה הוא עושה.
 *
 * @param {object} item       - הפריט המקורי
 * @param {string} customText - הטקסט שהמשתמש כתב
 * @returns {object} item מועשר
 */
export function applyCustomChoice(item, customText) {
  if (!item) return item;

  const text = String(customText || '').trim();
  if (text.length === 0) return item;

  // split על רווחים (כולל רווחים מרובים) - בלי גרשיים, בלי regex מסובך
  const terms = text.split(/\s+/).filter(t => t.length > 0);
  if (terms.length === 0) return item;

  // excludeTerms מה-base אם קיים (סינון רעש בסיסי)
  const base = findBaseForItem(item.name);
  const baseExcludes = base && Array.isArray(base.excludeTerms)
    ? base.excludeTerms
    : [];

  return {
    ...item,
    _clarified: true,
    _clarificationKind: 'custom',
    selectedVariantId: null,
    customText: text,
    searchTerms:  terms,
    excludeTerms: baseExcludes,
  };
}


/**
 * המשתמש לחץ "דלג" - לא רוצה לחשב את הפריט הזה.
 * הפריט יסומן כ-skipped ולא יישלח לוורקר (b-cart.js יסנן אותו לפני השליחה).
 *
 * הבדל מ-default:
 *   - אם המשתמש סגר את המודאל בלי לבחור → default (נשלח עם base searchTerms)
 *   - אם המשתמש לחץ "דלג" → skipped (לא נשלח, יוצג ב"מוצרים לא חושבו")
 *
 * @param {object} item
 * @returns {object} item עם skipped=true
 */
export function applySkipChoice(item) {
  if (!item) return item;
  return {
    ...item,
    _clarified: true,
    _clarificationKind: 'skipped',
    _skipped: true,
  };
}


/**
 * בודק אם פריט סומן כ-skipped.
 * משמש ב-cart.js כדי לסנן את הפריטים האלה לפני שליחה ל-API.
 *
 * @param {object} item
 * @returns {boolean}
 */
export function isSkipped(item) {
  return !!(item && item._skipped);
}


// ============================================================================
// עזרי דיבוג (לצ'אט הזה - בלי UI)
// ============================================================================

/**
 * מחזיר תקציר טקסטואלי של פריט (לדיבוג ב-console).
 * @param {object} item
 * @returns {string}
 */
export function describeItem(item) {
  if (!item) return '(empty)';
  const base = findBaseForItem(item.name);
  if (!base) {
    return `${item.name} — לא נמצא במאגר`;
  }
  const variants = Array.isArray(base.variants) ? base.variants : [];
  if (variants.length === 0) {
    return `${item.name} — פריט פשוט (אין variants)`;
  }
  const opts = variants.map(v => v.label || v.id).join(', ');
  return `${item.name} — ${variants.length} variants: ${opts}`;
}
