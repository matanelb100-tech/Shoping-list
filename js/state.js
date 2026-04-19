/**
 * ============================================================================
 * state.js - ניהול מצב מרכזי של האפליקציה
 * ============================================================================
 *
 * מה הקובץ הזה עושה:
 *   1. מחזיק את הרשימה הנוכחית (items) וההגדרות (settings)
 *   2. מסנכרן אוטומטית עם Firestore (cloud)
 *   3. שומר גיבוי מקומי ב-localStorage (לאופליין)
 *   4. מפיץ ארועים כשיש שינוי (state:changed)
 *
 * איך משתמשים:
 *   import { State } from './state.js';
 *
 *   State.init(firebaseAuth, firebaseFirestore);
 *   State.addItem({ name: 'חלב', category: 'dairy' });
 *   const items = State.getItems();
 *   State.onChange((newState) => { ... });
 *
 * מבנה הרשימה ב-Firestore:
 *   users/{userId}/data/current      → הרשימה הנוכחית (item array)
 *   users/{userId}/data/settings     → הגדרות המשתמש
 *   users/{userId}/history/{docId}   → היסטוריית קניות שמורה
 * ============================================================================
 */

import { STORAGE_KEYS, CATEGORIES, CHAINS } from './config.js?v=2';


// ============================================================================
// State Internal - מצב פנימי
// ============================================================================

const state = {
  // פרטי משתמש
  user: null,                  // { uid, email, isPremium }

  // רשימה נוכחית
  items: [],                   // [{ id, name, category, quantity, unit, checked, addedAt, ... }]

  // הגדרות משתמש
  settings: {
    selectedChains: [],        // רשימת id של רשתות שהמשתמש בחר
    lastLocation: null,        // { lat, lng, timestamp }
    tutorialSeen: false,
    preferredUnit: 'units',    // 'units' | 'kg' | 'g'
    vehicleType: 'fuel',       // לחישוב עלות נסיעה
    customFuelPrice: null,
    theme: 'light',
  },

  // מצב סנכרון
  isInitialized: false,
  isSyncing: false,
  lastSyncedAt: null,
  hasPendingChanges: false,

  // Firebase references
  _auth: null,
  _db: null,
  _unsubscribeListener: null,
};


// ============================================================================
// Event System - מערכת ארועים פנימית
// ============================================================================

const listeners = new Set();

function notifyListeners(eventType = 'change') {
  const snapshot = getStateSnapshot();
  listeners.forEach(fn => {
    try {
      fn(snapshot, eventType);
    } catch (err) {
      console.error('State listener error:', err);
    }
  });

  // הפץ גם כ-CustomEvent ב-window
  window.dispatchEvent(new CustomEvent('state:changed', {
    detail: { state: snapshot, eventType }
  }));
}

function getStateSnapshot() {
  return {
    user: state.user,
    items: [...state.items],
    settings: { ...state.settings },
    isInitialized: state.isInitialized,
    isSyncing: state.isSyncing,
    hasPendingChanges: state.hasPendingChanges,
  };
}


// ============================================================================
// גיבוי מקומי (localStorage) - לשימוש אופליין
// ============================================================================

function saveLocal() {
  try {
    if (!state.user) return;
    const data = {
      userId: state.user.uid,
      items: state.items,
      settings: state.settings,
      timestamp: Date.now(),
    };
    localStorage.setItem(STORAGE_KEYS.currentCart, JSON.stringify(data));
  } catch (err) {
    console.warn('Local save failed:', err);
  }
}

function loadLocal() {
  try {
    if (!state.user) return null;
    const raw = localStorage.getItem(STORAGE_KEYS.currentCart);
    if (!raw) return null;
    const data = JSON.parse(raw);
    // בודקים שהגיבוי שייך למשתמש הנוכחי
    if (data.userId !== state.user.uid) return null;
    return data;
  } catch (err) {
    console.warn('Local load failed:', err);
    return null;
  }
}


// ============================================================================
// Firestore Sync - סנכרון עם הענן
// ============================================================================

async function saveToFirestore() {
  if (!state._db || !state.user) return;

  try {
    state.isSyncing = true;
    notifyListeners('syncing');

    const { doc, setDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
    );

    const userDocRef = doc(state._db, 'users', state.user.uid, 'data', 'current');

    await setDoc(userDocRef, {
      items: state.items,
      settings: state.settings,
      updatedAt: Date.now(),
    });

    state.lastSyncedAt = Date.now();
    state.hasPendingChanges = false;
    state.isSyncing = false;
    notifyListeners('synced');

  } catch (err) {
    console.error('Firestore save failed:', err);
    state.isSyncing = false;
    state.hasPendingChanges = true;
    notifyListeners('sync-error');
  }
}

async function loadFromFirestore() {
  if (!state._db || !state.user) return false;

  try {
    const { doc, getDoc } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
    );

    const userDocRef = doc(state._db, 'users', state.user.uid, 'data', 'current');
    const snap = await getDoc(userDocRef);

    if (snap.exists()) {
      const data = snap.data();
      state.items = Array.isArray(data.items) ? data.items : [];
      state.settings = {
        ...state.settings,
        ...(data.settings || {})
      };
      state.lastSyncedAt = data.updatedAt || Date.now();
      return true;
    }
    return false;

  } catch (err) {
    console.error('Firestore load failed:', err);
    return false;
  }
}


// ============================================================================
// Listener בזמן אמת - לעדכון אוטומטי כשמכשיר אחר משנה את הרשימה
// ============================================================================

async function setupRealtimeListener() {
  if (!state._db || !state.user) return;

  try {
    const { doc, onSnapshot } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
    );

    const userDocRef = doc(state._db, 'users', state.user.uid, 'data', 'current');

    // מבטל listener קודם אם יש
    if (state._unsubscribeListener) {
      state._unsubscribeListener();
    }

    state._unsubscribeListener = onSnapshot(userDocRef, (snap) => {
      if (!snap.exists()) return;

      const data = snap.data();
      // מתעדכן רק אם השינוי לא הגיע מהמכשיר הזה
      // (בדיקה גסה לפי timestamp)
      if (data.updatedAt && data.updatedAt > (state.lastSyncedAt || 0) + 1000) {
        state.items = Array.isArray(data.items) ? data.items : state.items;
        state.settings = { ...state.settings, ...(data.settings || {}) };
        state.lastSyncedAt = data.updatedAt;
        saveLocal();
        notifyListeners('remote-update');
      }
    }, (err) => {
      console.warn('Realtime listener error:', err);
    });

  } catch (err) {
    console.error('Setup realtime listener failed:', err);
  }
}


// ============================================================================
// Debouncer - חוסך קריאות ל-Firestore
// ============================================================================

let saveDebounceTimer = null;
function debouncedSave() {
  saveLocal();  // מיידי
  state.hasPendingChanges = true;

  if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
  saveDebounceTimer = setTimeout(() => {
    saveToFirestore();
  }, 800);  // שולח ל-Firestore אחרי 800ms של שקט
}


// ============================================================================
// יצירת מזהה ייחודי למוצר
// ============================================================================

function generateId() {
  return 'item_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}


// ============================================================================
// ========== API ציבורי - מה שאר המודולים משתמשים בו =========================
// ============================================================================

export const State = {

  // ============================================
  // אתחול - נקרא מ-app.js אחרי כניסת משתמש
  // ============================================

  async init(firebaseAuth, firebaseDb) {
    state._auth = firebaseAuth;
    state._db = firebaseDb;

    const user = firebaseAuth.currentUser;
    if (!user) {
      console.warn('State.init called without logged-in user');
      return false;
    }

    state.user = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      isPremium: false,  // יתעדכן בהמשך כשיוטמע פרימיום
    };

    // טעינה ראשונית:
    // 1. ננסה לטעון מהענן
    // 2. אם לא הצלחנו או אין חיבור - נטען גיבוי מקומי
    const loadedFromCloud = await loadFromFirestore();

    if (!loadedFromCloud) {
      const local = loadLocal();
      if (local) {
        state.items = local.items || [];
        state.settings = { ...state.settings, ...(local.settings || {}) };
      }
    }

    // הגדרת listener בזמן אמת
    await setupRealtimeListener();

    state.isInitialized = true;
    notifyListeners('initialized');
    return true;
  },


  // ============================================
  // קריאת מצב
  // ============================================

  getUser() {
    return state.user;
  },

  getItems() {
    return [...state.items];
  },

  getItemsByCategory() {
    const grouped = {};
    CATEGORIES.forEach(cat => { grouped[cat.id] = []; });

    state.items.forEach(item => {
      const catId = item.category || 'other';
      if (!grouped[catId]) grouped[catId] = [];
      grouped[catId].push(item);
    });

    // בתוך כל קטגוריה: סמנים יורדים לסוף
    Object.keys(grouped).forEach(catId => {
      grouped[catId].sort((a, b) => {
        if (a.checked !== b.checked) return a.checked ? 1 : -1;
        return (a.addedAt || 0) - (b.addedAt || 0);
      });
    });

    return grouped;
  },

  getSettings() {
    return { ...state.settings };
  },

  getItemCount() {
    return state.items.length;
  },

  getUncheckedCount() {
    return state.items.filter(i => !i.checked).length;
  },

  isSyncing() {
    return state.isSyncing;
  },


  // ============================================
  // פעולות על מוצרים
  // ============================================

  /**
   * הוספת מוצר חדש לרשימה
   * @param {object} itemData - { name, category?, quantity?, unit?, ... }
   * @returns {object} המוצר שנוצר
   */
  addItem(itemData) {
    const item = {
      id: generateId(),
      name: (itemData.name || '').trim(),
      category: itemData.category || 'other',
      quantity: itemData.quantity || 1,
      unit: itemData.unit || 'units',     // 'units' | 'kg' | 'g' | 'L' | 'ml'
      checked: false,
      addedAt: Date.now(),
      // שדות אופציונליים
      barcode: itemData.barcode || null,
      specificProduct: null,              // המוצר הספציפי שייבחר ב"חשב סל"
      estimatedPrice: null,
      notes: itemData.notes || null,
    };

    if (!item.name) {
      console.warn('addItem: empty name');
      return null;
    }

    state.items.push(item);
    debouncedSave();
    notifyListeners('item-added');
    return item;
  },

  /**
   * עדכון מוצר קיים
   */
  updateItem(itemId, updates) {
    const idx = state.items.findIndex(i => i.id === itemId);
    if (idx === -1) return false;

    state.items[idx] = { ...state.items[idx], ...updates };
    debouncedSave();
    notifyListeners('item-updated');
    return true;
  },

  /**
   * מחיקת מוצר
   */
  removeItem(itemId) {
    const before = state.items.length;
    state.items = state.items.filter(i => i.id !== itemId);
    if (state.items.length === before) return false;

    debouncedSave();
    notifyListeners('item-removed');
    return true;
  },

  /**
   * מעבר בין מסומן/לא-מסומן
   */
  toggleChecked(itemId) {
    const item = state.items.find(i => i.id === itemId);
    if (!item) return false;
    item.checked = !item.checked;
    debouncedSave();
    notifyListeners('item-toggled');
    return true;
  },

  /**
   * ניקוי כל הרשימה
   */
  clearAll() {
    state.items = [];
    debouncedSave();
    notifyListeners('list-cleared');
  },

  /**
   * ניקוי רק המוצרים המסומנים
   */
  clearChecked() {
    state.items = state.items.filter(i => !i.checked);
    debouncedSave();
    notifyListeners('checked-cleared');
  },


  // ============================================
  // הגדרות
  // ============================================

  updateSettings(updates) {
    state.settings = { ...state.settings, ...updates };
    debouncedSave();
    notifyListeners('settings-updated');
  },

  setSelectedChains(chainIds) {
    state.settings.selectedChains = Array.isArray(chainIds) ? chainIds : [];
    debouncedSave();
    notifyListeners('chains-updated');
  },

  setLocation(location) {
    state.settings.lastLocation = location;
    debouncedSave();
    notifyListeners('location-updated');
  },

  markTutorialSeen() {
    state.settings.tutorialSeen = true;
    debouncedSave();
  },


  // ============================================
  // היסטוריה
  // ============================================

  /**
   * שמירה של הרשימה הנוכחית להיסטוריה ואיפוסה
   */
  async saveToHistory(totalPrice = null, chainName = null) {
    if (!state._db || !state.user || state.items.length === 0) return null;

    try {
      const { collection, addDoc } = await import(
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
      );

      const historyRef = collection(state._db, 'users', state.user.uid, 'history');
      const record = {
        items: state.items,
        totalItems: state.items.length,
        totalPrice: totalPrice,
        chainName: chainName,
        createdAt: Date.now(),
      };

      const docRef = await addDoc(historyRef, record);
      notifyListeners('history-saved');
      return docRef.id;
    } catch (err) {
      console.error('Save to history failed:', err);
      return null;
    }
  },

  async getHistory(limit = 30) {
    if (!state._db || !state.user) return [];

    try {
      const { collection, query, orderBy, limit: qLimit, getDocs } = await import(
        'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
      );

      const historyRef = collection(state._db, 'users', state.user.uid, 'history');
      const q = query(historyRef, orderBy('createdAt', 'desc'), qLimit(limit));
      const snap = await getDocs(q);

      return snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      }));
    } catch (err) {
      console.error('Get history failed:', err);
      return [];
    }
  },


  // ============================================
  // האזנה לשינויים
  // ============================================

  /**
   * רישום listener שיקרא בכל שינוי מצב
   * @returns {function} פונקציה לביטול ההאזנה
   */
  onChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
  },


  // ============================================
  // ניקוי - בעת התנתקות
  // ============================================

  async cleanup() {
    if (state._unsubscribeListener) {
      state._unsubscribeListener();
      state._unsubscribeListener = null;
    }

    if (saveDebounceTimer) {
      clearTimeout(saveDebounceTimer);
      saveDebounceTimer = null;
    }

    // שמירה אחרונה לפני יציאה אם יש שינויים ממתינים
    if (state.hasPendingChanges) {
      try {
        await saveToFirestore();
      } catch (e) { /* ignore */ }
    }

    // איפוס
    state.user = null;
    state.items = [];
    state.settings = {
      selectedChains: [],
      lastLocation: null,
      tutorialSeen: false,
      preferredUnit: 'units',
      vehicleType: 'fuel',
      customFuelPrice: null,
      theme: 'light',
    };
    state.isInitialized = false;
    state.lastSyncedAt = null;
    state.hasPendingChanges = false;
  },
};


// ============================================================================
// חשיפה ל-console לדיבוג
// ============================================================================

if (typeof window !== 'undefined') {
  window.__state = State;
}
