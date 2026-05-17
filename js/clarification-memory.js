/**
 * ============================================================================
 * clarification-memory.js - זיכרון בחירות variant ב-Firestore (שלב B צ'אט 3/3)
 * ============================================================================
 *
 * מטרה:
 *   זוכר את הבחירות של המשתמש במודאל ההבהרה כך שבפעם הבאה שיוסיף
 *   את אותו מוצר ("חלב") — המודאל ייפתח עם הבחירה הקודמת שלו (3%)
 *   מסומנת מראש, במקום ה-defaultVariant של הקטלוג.
 *
 * עקרונות ארכיטקטוניים:
 *   - דוקומנט יחיד ב-Firestore (לא subcollection):
 *       users/{uid}/preferences/clarifications
 *     בתוכו: { baseId: variantId, ... }
 *     → קריאה אחת בלבד בכניסה לסשן.
 *
 *   - Cache סינכרוני: אחרי loadClarifications() — getClarification()
 *     מחזיר מהזיכרון מיד, בלי await. זה חיוני כי
 *     setupForCurrentItem() ב-modal הוא סינכרוני.
 *
 *   - Fire-and-forget בכתיבה: לא ממתינים, לא חוסמים את ה-UI.
 *     אם הכתיבה נכשלת (offline) — pending queue ינסה שוב כשנחזור.
 *
 *   - Resilient: כל שגיאה נבלעת (console.warn בלבד). אם Firestore
 *     לא זמין — המודאל פשוט יציג את defaultVariant של הקטלוג.
 *     המשתמש לא רואה הודעות שגיאה. החוויה תמיד עובדת.
 *
 *   - Validation בקריאה: אם variant נשמר בעבר אבל הוסר מהקטלוג
 *     בעדכון מאוחר יותר — מתעלמים ממנו (הקובץ הזה לא יודע על הקטלוג,
 *     אז ה-validation נעשה בצד הקורא — clarification-modal.js).
 *
 * שימוש (מ-state.js):
 *   import { initClarificationMemory, cleanupClarificationMemory } from './clarification-memory.js';
 *   // ב-State.init אחרי שיש user:
 *   await initClarificationMemory(firebaseFirestore, user.uid);
 *   // ב-State.cleanup:
 *   cleanupClarificationMemory();
 *
 * שימוש (מ-clarification-modal.js):
 *   import { getClarification, saveClarification } from './clarification-memory.js';
 *   // ב-setupForCurrentItem, לפני pickDefaultVariantId:
 *   const remembered = getClarification(base.id);
 *   const defaultId = remembered || pickDefaultVariantId(base);
 *   // ב-handleNext, אחרי applyVariantChoice:
 *   saveClarification(base.id, flow.selectedVariantId);
 * ============================================================================
 */


// ============================================================================
// State פנימי - חי כל עוד המשתמש מחובר
// ============================================================================

/** @type {object|null} Firestore db instance */
let db = null;

/** @type {string|null} */
let uid = null;

/**
 * Cache בזיכרון של כל הבחירות.
 * Map<baseId, variantId>
 * @type {Map<string, string>}
 */
const cache = new Map();

/**
 * האם הטעינה הראשונית הסתיימה (לא משנה אם הצליחה או נכשלה).
 * אם false — getClarification מחזיר null (לא מסכן ב-stale data).
 */
let isLoaded = false;

/**
 * Pending writes שלא הצליחו (offline). יישלחו שוב בכתיבה הבאה שתצליח.
 * Map<baseId, variantId>
 * @type {Map<string, string>}
 */
const pendingWrites = new Map();

/**
 * דיבונס לכתיבות מרובות ברצף (למשל כשמשתמש עובר 5 פריטים מהר).
 * @type {number|null}
 */
let writeDebounceTimer = null;
const WRITE_DEBOUNCE_MS = 500;


// ============================================================================
// אתחול - נקרא מ-state.js
// ============================================================================

/**
 * טעינת כל הבחירות מ-Firestore ל-cache בזיכרון.
 * נקרא פעם אחת בכניסה לסשן.
 *
 * @param {object} firestoreDb - Firestore db instance (מ-app.js)
 * @param {string} userUid - uid של המשתמש המחובר
 * @returns {Promise<void>}
 */
export async function initClarificationMemory(firestoreDb, userUid) {
  // ניקוי state קודם (אם נקרא שוב — למשל אחרי החלפת משתמש)
  cleanupClarificationMemory();

  if (!firestoreDb || !userUid) {
    console.warn('[clarification-memory] init called without db/uid');
    return;
  }

  db = firestoreDb;
  uid = userUid;

  try {
    const { doc, getDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
    );

    const ref = doc(db, 'users', uid, 'preferences', 'clarifications');
    const snap = await getDoc(ref);

    if (snap.exists()) {
      const data = snap.data() || {};
      // הדוקומנט הוא map: { baseId: variantId, ... }
      // (יש גם _updatedAt שאנחנו מתעלמים ממנו)
      Object.entries(data).forEach(([key, value]) => {
        // מתעלמים משדות-עזר (כל מה שמתחיל ב-_)
        if (key.startsWith('_')) return;
        if (typeof value === 'string' && value.length > 0) {
          cache.set(key, value);
        }
      });
      console.log(`[clarification-memory] loaded ${cache.size} preferences`);
    } else {
      console.log('[clarification-memory] no preferences yet (new user)');
    }

    isLoaded = true;

  } catch (err) {
    // שגיאה בטעינה (offline, permissions) — לא קורס, רק לוג.
    // isLoaded נשאר false, getClarification יחזיר null,
    // והמודאל ייפול בחזרה ל-defaultVariant של הקטלוג.
    console.warn('[clarification-memory] load failed (will use catalog defaults):', err.message);
    isLoaded = false;
  }
}


/**
 * ניקוי בעת התנתקות.
 */
export function cleanupClarificationMemory() {
  if (writeDebounceTimer) {
    clearTimeout(writeDebounceTimer);
    writeDebounceTimer = null;
  }
  cache.clear();
  pendingWrites.clear();
  db = null;
  uid = null;
  isLoaded = false;
}


// ============================================================================
// קריאה - סינכרוני, מיידי
// ============================================================================

/**
 * מחזיר את ה-variantId שהמשתמש בחר בעבר עבור ה-base הזה,
 * או null אם אין בחירה שמורה / הטעינה עדיין לא הסתיימה.
 *
 * חשוב: זוהי פונקציה סינכרונית. הקורא לא צריך await.
 *
 * @param {string} baseId
 * @returns {string|null}
 */
export function getClarification(baseId) {
  if (!isLoaded || !baseId) return null;
  return cache.get(baseId) || null;
}


/**
 * האם הטעינה הראשונית הסתיימה?
 * שימושי לבדיקה ב-clarification-modal אם הזיכרון מוכן.
 * @returns {boolean}
 */
export function isMemoryReady() {
  return isLoaded;
}


// ============================================================================
// כתיבה - fire-and-forget
// ============================================================================

/**
 * שומר בחירת variant. עדכון cache מיידי + כתיבה ל-Firestore ברקע.
 *
 * @param {string} baseId
 * @param {string} variantId
 */
export function saveClarification(baseId, variantId) {
  if (!baseId || !variantId) return;

  // עדכון cache מיידי - הבחירה תיזכר גם אם הכתיבה ל-Firestore נכשלה
  cache.set(baseId, variantId);

  // אם לא מחוברים ל-Firestore כרגע — שומרים pending
  if (!db || !uid) {
    pendingWrites.set(baseId, variantId);
    return;
  }

  // הוספה לפndingWrites + dispatching דיבונסי
  pendingWrites.set(baseId, variantId);

  if (writeDebounceTimer) {
    clearTimeout(writeDebounceTimer);
  }
  writeDebounceTimer = setTimeout(flushPendingWrites, WRITE_DEBOUNCE_MS);
}


/**
 * שולח את כל הכתיבות הממתינות ל-Firestore בקריאה אחת.
 * fire-and-forget — לא ממתינים, לא מחזירים שגיאות.
 */
async function flushPendingWrites() {
  writeDebounceTimer = null;

  if (!db || !uid) return;
  if (pendingWrites.size === 0) return;

  // ניתוק של ה-pending — אם הכתיבה תיכשל, נחזיר אותם
  const toWrite = {};
  pendingWrites.forEach((variantId, baseId) => {
    toWrite[baseId] = variantId;
  });
  const writingNow = new Map(pendingWrites);
  pendingWrites.clear();

  try {
    const { doc, setDoc, serverTimestamp } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
    );

    const ref = doc(db, 'users', uid, 'preferences', 'clarifications');

    // setDoc עם merge: true — לא דורס preferences קיימים שלא נכללו ב-toWrite.
    // זה חשוב במקרה של ריבוי מכשירים: מכשיר A שמר {milk: '3%'},
    // מכשיר B שמר {bread: 'whole'} — אנחנו רוצים את שניהם בדוקומנט.
    await setDoc(ref, {
      ...toWrite,
      _updatedAt: serverTimestamp(),
    }, { merge: true });

    // הצלחה — שום דבר לעשות. ה-cache כבר מעודכן.

  } catch (err) {
    // כתיבה נכשלה (offline / permissions). מחזירים את ה-writes ל-pending,
    // הכתיבה הבאה תנסה לשלוח את כולם יחד.
    console.warn('[clarification-memory] save failed (will retry next write):', err.message);
    writingNow.forEach((variantId, baseId) => {
      // לא דורסים — אם בינתיים נשמרה גרסה חדשה יותר של אותו baseId,
      // שומרים אותה (set רק אם אין).
      if (!pendingWrites.has(baseId)) {
        pendingWrites.set(baseId, variantId);
      }
    });
  }
}


/**
 * מחיקת בחירה ספציפית (לעתיד — למסך "מנהל ברירות מחדל").
 * @param {string} baseId
 */
export function removeClarification(baseId) {
  if (!baseId) return;
  cache.delete(baseId);
  pendingWrites.delete(baseId);

  if (!db || !uid) return;

  // מחיקה אסינכרונית. שגיאות נבלעות.
  (async () => {
    try {
      const { doc, updateDoc, deleteField } = await import(
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
      );
      const ref = doc(db, 'users', uid, 'preferences', 'clarifications');
      await updateDoc(ref, { [baseId]: deleteField() });
    } catch (err) {
      console.warn('[clarification-memory] delete failed:', err.message);
    }
  })();
}


// ============================================================================
// דיבוג - חשיפה ל-console
// ============================================================================

if (typeof window !== 'undefined') {
  window.__clarificationMemory = {
    getCache: () => Object.fromEntries(cache),
    getPending: () => Object.fromEntries(pendingWrites),
    isReady: () => isLoaded,
  };
}
