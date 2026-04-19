/**
 * ============================================================================
 * config.js - קובץ הגדרות מרכזי של האפליקציה
 * ============================================================================
 *
 * זה הקובץ היחיד שצריך לערוך כשיש שינוי ב:
 * - פרטי Firebase
 * - כתובות ה-Workers בCloudflare
 * - מפתחות API
 * - קבועים (כמו מכפיל הדלק, מרחקים וכו')
 *
 * כל שאר המודולים באפליקציה קוראים מכאן, כך ששום קוד אחר
 * לא צריך לדעת את ה-URLs או המפתחות.
 *
 * ⚠️ חשוב: אין כאן סודות אמיתיים! הקוד הזה רץ בדפדפן של המשתמשים.
 * מפתחות של Firebase הם public לפי העיצוב של Google.
 * מפתחות אמיתיים (כמו Gemini API) נשמרים ב-Cloudflare Worker secrets.
 * ============================================================================
 */

// ============================================================================
// גרסת האפליקציה - השתמש בזה גם ל-Service Worker cache busting
// ============================================================================
export const APP_VERSION = '1.0.0';
export const APP_NAME = 'רשימת קניות חכמה';


// ============================================================================
// Firebase - לחשבונות משתמש, Firestore לרשימות וקבלות
// ============================================================================
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyB0ofm8cUnZ1pAQS3ZKvenV83bSa_FvH_A",
  authDomain: "mytasksapp-68e71.firebaseapp.com",
  projectId: "mytasksapp-68e71",
  storageBucket: "mytasksapp-68e71.firebasestorage.app",
  messagingSenderId: "673661240265",
  appId: "1:673661240265:web:2eb7aad37f608be6be1e18",
  measurementId: "G-73HRMV87KX"
};


// ============================================================================
// Cloudflare Workers
// ============================================================================
export const WORKERS = {
  // ה-Worker הראשי - מטפל בכל הבקשות מהאפליקציה
  // (חיפוש מוצרים, קבלת מחירים, אימות, הצעות AI)
  main: 'https://runprice.matanelb100.workers.dev',

  // ה-Worker השני - רץ בתזמון יומי ב-23:00, סונכרן עם Kaggle Dataset
  // (לא נגיש מהאפליקציה ישירות - רק רץ מ-Cron)
  sync: 'https://sali-price-sync.matanelb100.workers.dev',
};

// נתיבי ה-API של ה-Worker הראשי
// (אם תשנה את המבנה של ה-Worker - תעדכן כאן בלבד)
export const API_ENDPOINTS = {
  // חיפוש מוצרים - מחזיר הצעות להשלמה אוטומטית
  searchProducts: '/api/products/search',

  // קבלת פרטי מוצר מלאים (תמונה, קטגוריה, מחיר ממוצע)
  getProduct: '/api/products/get',

  // חיפוש לפי ברקוד
  productByBarcode: '/api/products/barcode',

  // קבלת וריאציות מוצר (חלב טרה vs תנובה vs גולן וכו')
  getVariants: '/api/products/variants',

  // קטלוג מחירים של הסל בכל הרשתות
  computeCart: '/api/cart/compute',

  // חישוב קטגוריה חכם (Gemini) לקלט חופשי
  categorize: '/api/ai/categorize',

  // ניתוח קבלת מכולת (OCR + Gemini) - פרימיום
  parseReceipt: '/api/ai/receipt',

  // קבלת רשימת סניפים קרובים לפי מיקום
  nearbyStores: '/api/stores/nearby',

  // רשימת כל הרשתות הנתמכות
  chains: '/api/chains/list',
};


// ============================================================================
// מפתחות KV ב-Cloudflare (להתייחסות פנימית של ה-Worker)
// האפליקציה לא ניגשת ישירות ל-KV - רק ה-Worker ניגש
// ============================================================================
export const KV_KEYS = {
  namespace: 'SALI_PRICES',

  // מבנה המפתחות ב-KV:
  // prices:{chainId}:{storeId}     → JSON של כל המחירים בסניף
  // catalog:global                  → קטלוג מוצרים מאוחד
  // chains:list                     → רשימת רשתות פעילות
  // stores:{chainId}                → רשימת סניפים של רשת
  // updated:{chainId}               → timestamp של עדכון אחרון
};


// ============================================================================
// רשתות השיווק בישראל - רשימה קבועה
// כולל מזהים שמתאימים לקבצי שקיפות המחיר הממשלתיים
// ============================================================================
export const CHAINS = {
  shufersal: {
    id: 'shufersal',
    chainId: '7290027600007',
    name: 'שופרסל',
    color: '#E30613',
    logo: '/icons/chains/shufersal.svg',
    hasDelivery: true,
  },
  ramilevi: {
    id: 'ramilevi',
    chainId: '7290058140886',
    name: 'רמי לוי',
    color: '#FDB913',
    logo: '/icons/chains/ramilevi.svg',
    hasDelivery: true,
  },
  yeinotbitan: {
    id: 'yeinotbitan',
    chainId: '7290725900003',
    name: 'יינות ביתן',
    color: '#005BAC',
    logo: '/icons/chains/yeinotbitan.svg',
    hasDelivery: true,
  },
  victory: {
    id: 'victory',
    chainId: '7290696200003',
    name: 'ויקטורי',
    color: '#D71920',
    logo: '/icons/chains/victory.svg',
    hasDelivery: true,
  },
  yohananof: {
    id: 'yohananof',
    chainId: '7290100700006',
    name: 'יוחננוף',
    color: '#00A84F',
    logo: '/icons/chains/yohananof.svg',
    hasDelivery: true,
  },
  mega: {
    id: 'mega',
    chainId: '7290055700007',
    name: 'מגה',
    color: '#E6007E',
    logo: '/icons/chains/mega.svg',
    hasDelivery: true,
  },
  hazihinam: {
    id: 'hazihinam',
    chainId: '7290873900009',
    name: 'חצי חינם',
    color: '#FF6B00',
    logo: '/icons/chains/hazihinam.svg',
    hasDelivery: false,
  },
  osherad: {
    id: 'osherad',
    chainId: '7290103152017',
    name: 'אושר עד',
    color: '#1B3B6F',
    logo: '/icons/chains/osherad.svg',
    hasDelivery: false,
  },
  tivtaam: {
    id: 'tivtaam',
    chainId: '7290873255550',
    name: 'טיב טעם',
    color: '#8B0000',
    logo: '/icons/chains/tivtaam.svg',
    hasDelivery: true,
  },
  // מכולת שכונתית - סוג מיוחד, מתווסף על ידי המשתמש
  neighborhood: {
    id: 'neighborhood',
    chainId: 'neighborhood',
    name: 'מכולת שכונתית',
    color: '#7BC4E2',
    logo: '/icons/chains/neighborhood.svg',
    hasDelivery: false,
    isCustom: true,
  },
};


// ============================================================================
// קטגוריות מוצרים - בדיוק לפי הסדר שבסופר הישראלי הטיפוסי
// הסדר חשוב! הוא משפיע על איך המשתמש רואה את הרשימה
// ============================================================================
export const CATEGORIES = [
  { id: 'fruits_veg',   name: 'פירות וירקות',        icon: '🥬', order: 1 },
  { id: 'dairy',        name: 'מוצרי חלב וביצים',    icon: '🥛', order: 2 },
  { id: 'meat_fish',    name: 'בשר ודגים',            icon: '🥩', order: 3 },
  { id: 'bread',        name: 'לחם ומאפים',           icon: '🍞', order: 4 },
  { id: 'frozen',       name: 'מוצרים קפואים',        icon: '🧊', order: 5 },
  { id: 'pantry',       name: 'אורז, פסטה ושימורים', icon: '🍚', order: 6 },
  { id: 'snacks',       name: 'חטיפים וממתקים',       icon: '🍫', order: 7 },
  { id: 'drinks',       name: 'משקאות',               icon: '🥤', order: 8 },
  { id: 'breakfast',    name: 'דגני בוקר וממרחים',   icon: '🥣', order: 9 },
  { id: 'baby',         name: 'תינוקות',              icon: '🍼', order: 10 },
  { id: 'cleaning',     name: 'ניקיון וכביסה',       icon: '🧼', order: 11 },
  { id: 'personal',     name: 'היגיינה אישית',       icon: '🪥', order: 12 },
  { id: 'paper',        name: 'נייר וחד פעמי',       icon: '🧻', order: 13 },
  { id: 'pets',         name: 'חיות מחמד',            icon: '🐾', order: 14 },
  { id: 'other',        name: 'שונות',                icon: '🛒', order: 99 },
];


// ============================================================================
// הגדרות חישוב עלות נסיעה (פיצ'ר פרימיום)
// ============================================================================
export const TRAVEL_COST = {
  // מכפיל להמרת מרחק אווירי למרחק דרך (נוסע ישראלי ממוצע)
  airDistanceMultiplier: 1.35,

  // צריכת דלק ממוצעת ברכב בישראל (ליטר ל-100 ק"מ)
  fuelConsumption: 7.5,

  // מחיר דלק ברירת מחדל (₪/ליטר) - אפשר לעדכן מהאפליקציה
  defaultFuelPrice: 7.60,

  // צריכת חשמל ממוצעת לרכב חשמלי (קוט"ש ל-100 ק"מ)
  electricConsumption: 18,

  // מחיר חשמל ממוצע בישראל (₪/קוט"ש)
  defaultElectricPrice: 0.62,

  // סוגי רכב
  vehicleTypes: [
    { id: 'fuel',     name: 'דלק רגיל',  icon: '⛽', pricePerKm: null /* יחושב */ },
    { id: 'electric', name: 'חשמלי',    icon: '🔌', pricePerKm: null /* יחושב */ },
    { id: 'custom',   name: 'אחר (ידני)', icon: '✏️', pricePerKm: null /* יוזן */ },
  ],
};


// ============================================================================
// הגדרות UI
// ============================================================================
export const UI_CONFIG = {
  // כמה הצעות מוצר להציג במהלך הקלדה
  maxAutocompleteSuggestions: 5,

  // דיבאונס למניעת יותר מדי קריאות API בזמן הקלדה (ms)
  autocompleteDebounceMs: 200,

  // זמן להצגת toast (ms)
  toastDurationMs: 3000,

  // כמה זמן מחזיקים גיבוי מקומי (ימים)
  localCacheDays: 7,

  // כמה רשתות להציג כברירת מחדל (הקרובות למשתמש)
  defaultChainsToShow: 3,

  // רדיוס חיפוש סניפים קרובים (ק"מ)
  nearbyStoresRadiusKm: 10,
};


// ============================================================================
// מגבלות פרימיום (חינם) vs פרימיום
// ============================================================================
export const PREMIUM_LIMITS = {
  free: {
    maxShoppingHistory: 5,       // כמה קניות לשמור בהיסטוריה
    maxCustomStores: 1,          // כמה מכולות שכונתיות
    canScanReceipts: false,      // סריקת קבלות (AI)
    canAddTravelCost: false,     // הוספת עלות נסיעה
    canUseDealsScanner: false,   // סורק מבצעים חכם
    showAds: true,
  },
  premium: {
    maxShoppingHistory: Infinity,
    maxCustomStores: 10,
    canScanReceipts: true,
    canAddTravelCost: true,
    canUseDealsScanner: true,
    showAds: false,
  },
};


// ============================================================================
// מפתחות אחסון מקומי (localStorage / IndexedDB)
// ============================================================================
export const STORAGE_KEYS = {
  // localStorage
  userToken: 'sl_user_token',
  userPrefs: 'sl_user_prefs',
  tutorialSeen: 'sl_tutorial_seen',
  lastLocation: 'sl_last_location',
  selectedChains: 'sl_selected_chains',
  currentCart: 'sl_current_cart',       // רשימה נוכחית (גיבוי אם אין אינטרנט)

  // IndexedDB store names
  idbName: 'smart_shopping_db',
  idbVersion: 1,
  idbStores: {
    products: 'products_cache',         // cache של חיפושי מוצרים
    history: 'shopping_history',        // היסטוריית קניות
    receipts: 'receipts',               // קבלות סרוקות
    pendingSync: 'pending_sync',        // פעולות שממתינות לסנכרון
  },
};


// ============================================================================
// הודעות מערכת
// ============================================================================
export const MESSAGES = {
  errors: {
    offline: 'אין חיבור לאינטרנט',
    authFailed: 'פרטי ההתחברות שגויים',
    emailInUse: 'כתובת המייל כבר קיימת במערכת',
    weakPassword: 'הסיסמה חלשה מדי (לפחות 6 תווים)',
    invalidEmail: 'כתובת מייל לא תקינה',
    networkError: 'שגיאת רשת, נסה שוב',
    locationDenied: 'אישור מיקום נדחה - נשתמש במיקום כללי',
    cameraPermissionDenied: 'נדרש אישור למצלמה לסריקת ברקוד',
    micPermissionDenied: 'נדרש אישור למיקרופון להקלטת קול',
    generic: 'משהו השתבש, נסה שוב',
  },
  success: {
    loginSuccess: 'ברוך הבא!',
    signupSuccess: 'נרשמת בהצלחה',
    cartSaved: 'הסל נשמר להיסטוריה',
    itemAdded: 'המוצר נוסף',
    itemDeleted: 'המוצר נמחק',
    logoutSuccess: 'התנתקת בהצלחה',
  },
};


// ============================================================================
// דגלי פיצ'רים (Feature Flags) - לשליטה בפיצ'רים בלי לשחרר גרסה חדשה
// ============================================================================
export const FEATURE_FLAGS = {
  // הפעלת סריקת ברקוד
  barcodeScanner: true,

  // הפעלת קלט קול
  voiceInput: true,

  // הפעלת פיצ'רי פרימיום (להציג גם למשתמשים חינמיים כרגע, לפי הבקשה)
  showPremiumFeatures: true,

  // בכדי לבטל את הצורך בתשלום עבור פרימיום (שלב פיתוח)
  premiumForAll: true,

  // תצוגה של כפתור סריקת קבלה (פרימיום)
  receiptScanner: true,

  // סורק מבצעים אוטומטי
  dealsScanner: false,   // עדיין לא מוכן - יופעל בשלב 3
};


// ============================================================================
// פונקציית עזר להדפסת גרסה לקונסול (דיבוג)
// ============================================================================
export function logAppInfo() {
  const style = 'background: #7BC4E2; color: white; padding: 4px 8px; border-radius: 4px; font-weight: bold;';
  console.log(`%c${APP_NAME} v${APP_VERSION}`, style);
  console.log('🔧 Environment:', {
    firebase: FIREBASE_CONFIG.projectId,
    worker: WORKERS.main,
    online: navigator.onLine,
  });
}


// ============================================================================
// בדיקת תצורה בטעינה - מוודא שלא שכחנו להגדיר משהו
// ============================================================================
export function validateConfig() {
  const errors = [];

  if (!FIREBASE_CONFIG.apiKey || FIREBASE_CONFIG.apiKey.includes('YOUR_')) {
    errors.push('Firebase API key לא הוגדר');
  }

  if (!WORKERS.main.startsWith('https://')) {
    errors.push('Worker URL לא תקין');
  }

  if (errors.length > 0) {
    console.error('⚠️ שגיאות בconfig:', errors);
    return false;
  }

  return true;
}


// קורא לפונקציית דיבוג בטעינה (רק בסביבת פיתוח)
if (typeof window !== 'undefined' && window.location.hostname === 'localhost') {
  logAppInfo();
  validateConfig();
}
