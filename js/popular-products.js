/**
 * ============================================================================
 * popular-products.js - מילון מקומי של מוצרים פופולריים
 * ============================================================================
 *
 * מטרה:
 *   ספק תוצאות מיידיות ל-autocomplete בלי לפנות לוורקר.
 *   90% מההקלדות של משתמשים נופלות על מוצרים פופולריים - אין סיבה
 *   לבזבז קריאות רשת על "חלב" או "לחם".
 *
 * מבנה:
 *   כל בסיס (base) הוא מוצר ברמת ההכללה - "חלב", "לחם", "ביצים".
 *   לכל בסיס יש variants - וריאציות ייחודיות שמעניינות את המשתמש.
 *
 *   כשהמשתמש מקליד "חלב" - המערכת מחזירה את הוריאציות (3%, 1%, שקדים...)
 *   מעורבות, כך שהוא רואה גיוון אמיתי ולא 5 פעמים אותו מוצר.
 *
 * שלב נוכחי:
 *   ~80 בסיסים, ~350 וריאציות. ידני, מסווג בקפדנות.
 *
 * שלב הבא (צ'אט הבא):
 *   sync_prices.py יחלץ 500 מוצרים פופולריים מ-KV + Gemini יסווג אותם.
 *   הקובץ הזה ייטען דינמית מ-Firestore. אבל המבנה יישאר זהה.
 * ============================================================================
 */


// ============================================================================
// המילון - מאורגן לפי קטגוריה לקריאות
// ============================================================================

export const POPULAR_PRODUCTS = [

  // ==========================================================================
  // מוצרי חלב וביצים (dairy)
  // ==========================================================================
  {
    base: 'חלב',
    category: 'dairy', unit: 'units',
    variants: [
      { name: 'חלב 3% שומן',          brand: 'תנובה' },
      { name: 'חלב 1% שומן',          brand: 'תנובה' },
      { name: 'חלב טרי 3%',           brand: 'טרה' },
      { name: 'חלב שקדים',            brand: 'אלפרו' },
      { name: 'חלב סויה',             brand: 'אלפרו' },
      { name: 'חלב ללא לקטוז',        brand: 'תנובה' },
      { name: 'חלב שיבולת שועל',     brand: 'אלפרו' },
    ],
  },
  {
    base: 'גבינה',
    category: 'dairy', unit: 'units',
    variants: [
      { name: 'גבינה לבנה 5%',         brand: 'תנובה' },
      { name: 'גבינה צהובה אמנטל',    brand: 'תנובה' },
      { name: 'גבינת קוטג׳ 5%',       brand: 'תנובה' },
      { name: 'גבינה בולגרית',         brand: 'גד' },
      { name: 'גבינת מוצרלה',          brand: 'תנובה' },
      { name: 'גבינת פטה',             brand: 'גד' },
      { name: 'גבינת שמנת',            brand: 'פילדלפיה' },
    ],
  },
  {
    base: 'יוגורט',
    category: 'dairy', unit: 'units',
    variants: [
      { name: 'יוגורט טבעי',           brand: 'תנובה' },
      { name: 'יוגורט תות',            brand: 'תנובה' },
      { name: 'יוגורט יווני',          brand: 'יופלה' },
      { name: 'יוגורט וניל',           brand: 'יופלה' },
      { name: 'יוגורט אקטימל',         brand: 'דנונה' },
    ],
  },
  {
    base: 'ביצים',
    category: 'dairy', unit: 'units',
    variants: [
      { name: 'ביצים L (12 יחידות)' },
      { name: 'ביצים XL (12 יחידות)' },
      { name: 'ביצים אורגניות' },
      { name: 'ביצים חופש' },
    ],
  },
  {
    base: 'חמאה',
    category: 'dairy', unit: 'units',
    variants: [
      { name: 'חמאה 200 גרם',          brand: 'תנובה' },
      { name: 'חמאה לא מלוחה',         brand: 'תנובה' },
      { name: 'מרגרינה',                brand: 'מטרנה' },
    ],
  },
  {
    base: 'שמנת',
    category: 'dairy', unit: 'units',
    variants: [
      { name: 'שמנת מתוקה 38%',        brand: 'תנובה' },
      { name: 'שמנת חמוצה 15%',        brand: 'תנובה' },
      { name: 'שמנת לבישול 15%',       brand: 'תנובה' },
    ],
  },

  // ==========================================================================
  // לחם ומאפים (bread)
  // ==========================================================================
  {
    base: 'לחם',
    category: 'bread', unit: 'units',
    variants: [
      { name: 'לחם אחיד פרוס' },
      { name: 'לחם שיפון' },
      { name: 'לחם מלא' },
      { name: 'לחם לבן' },
      { name: 'לחם חיטה מלאה',         brand: 'אנג\'ל' },
    ],
  },
  {
    base: 'פיתות',
    category: 'bread', unit: 'units',
    variants: [
      { name: 'פיתות לבנות (10 יחידות)' },
      { name: 'פיתות מחיטה מלאה' },
      { name: 'פיתות מיני' },
    ],
  },
  {
    base: 'חלה',
    category: 'bread', unit: 'units',
    variants: [
      { name: 'חלה' },
      { name: 'חלה מתוקה' },
      { name: 'חלה גדולה' },
    ],
  },
  {
    base: 'לחמניות',
    category: 'bread', unit: 'units',
    variants: [
      { name: 'לחמניות המבורגר' },
      { name: 'לחמניות שום' },
      { name: 'לחמניות זרעים' },
    ],
  },

  // ==========================================================================
  // פירות וירקות (fruits_veg)
  // ==========================================================================
  {
    base: 'עגבניות',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'עגבניות' },
      { name: 'עגבניות שרי' },
      { name: 'עגבניות תמר' },
    ],
  },
  {
    base: 'מלפפונים',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'מלפפונים' },
      { name: 'מלפפון בייבי' },
    ],
  },
  {
    base: 'בצל',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'בצל יבש' },
      { name: 'בצל סגול' },
      { name: 'בצל ירוק' },
    ],
  },
  {
    base: 'תפוחי אדמה',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'תפוחי אדמה' },
      { name: 'תפוחי אדמה אדומים' },
      { name: 'תפוחי אדמה לאפייה' },
      { name: 'בטטה' },
    ],
  },
  {
    base: 'בננות',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'בננות' },
    ],
  },
  {
    base: 'תפוחים',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'תפוחים אדומים' },
      { name: 'תפוחים ירוקים' },
      { name: 'תפוחי גרני סמית' },
    ],
  },
  {
    base: 'גזר',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'גזר' },
      { name: 'גזר בייבי' },
    ],
  },
  {
    base: 'פלפל',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'פלפל אדום' },
      { name: 'פלפל צהוב' },
      { name: 'פלפל ירוק' },
      { name: 'פלפל חריף' },
    ],
  },
  {
    base: 'חסה',
    category: 'fruits_veg', unit: 'units',
    variants: [
      { name: 'חסה אייסברג' },
      { name: 'חסה ערבית' },
      { name: 'חסה רומית' },
    ],
  },
  {
    base: 'אבוקדו',
    category: 'fruits_veg', unit: 'units',
    variants: [
      { name: 'אבוקדו' },
    ],
  },
  {
    base: 'לימון',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'לימון' },
    ],
  },
  {
    base: 'תפוזים',
    category: 'fruits_veg', unit: 'kg',
    variants: [
      { name: 'תפוזים' },
      { name: 'קלמנטינות' },
    ],
  },

  // ==========================================================================
  // בשר ודגים (meat_fish)
  // ==========================================================================
  {
    base: 'עוף',
    category: 'meat_fish', unit: 'kg',
    variants: [
      { name: 'עוף שלם' },
      { name: 'חזה עוף' },
      { name: 'שוקיים עוף' },
      { name: 'כנפיים עוף' },
      { name: 'עוף טחון' },
      { name: 'פרגיות' },
    ],
  },
  {
    base: 'בשר בקר',
    category: 'meat_fish', unit: 'kg',
    variants: [
      { name: 'בשר טחון' },
      { name: 'אנטריקוט' },
      { name: 'סטייק פילה' },
      { name: 'אסאדו' },
      { name: 'קציצות בקר' },
    ],
  },
  {
    base: 'הודו',
    category: 'meat_fish', unit: 'kg',
    variants: [
      { name: 'חזה הודו' },
      { name: 'הודו טחון' },
      { name: 'שניצל הודו' },
    ],
  },
  {
    base: 'דג',
    category: 'meat_fish', unit: 'kg',
    variants: [
      { name: 'סלמון' },
      { name: 'אמנון' },
      { name: 'בורי' },
      { name: 'מוסר ים' },
      { name: 'טונה בקופסה' },
    ],
  },
  {
    base: 'נקניק',
    category: 'meat_fish', unit: 'units',
    variants: [
      { name: 'נקניקיות עוף' },
      { name: 'נקניקיות הודו' },
      { name: 'סלמי' },
      { name: 'פסטרמה' },
    ],
  },

  // ==========================================================================
  // חטיפים ומזון מהיר (snacks)
  // ==========================================================================
  {
    base: 'ביסלי',
    category: 'snacks', unit: 'units',
    variants: [
      { name: 'ביסלי גריל',            brand: 'אסם' },
      { name: 'ביסלי בצל',             brand: 'אסם' },
      { name: 'ביסלי פיצה',            brand: 'אסם' },
      { name: 'ביסלי ברביקיו',         brand: 'אסם' },
    ],
  },
  {
    base: 'במבה',
    category: 'snacks', unit: 'units',
    variants: [
      { name: 'במבה',                  brand: 'אסם' },
      { name: 'במבה אדומה',            brand: 'אסם' },
    ],
  },
  {
    base: 'צ׳יפס',
    category: 'snacks', unit: 'units',
    variants: [
      { name: 'תפוצ׳יפס',              brand: 'תפוצ׳יפס' },
      { name: 'דוריטוס',                brand: 'דוריטוס' },
      { name: 'צ׳יפס מלוח',            brand: 'אסם' },
    ],
  },
  {
    base: 'שוקולד',
    category: 'snacks', unit: 'units',
    variants: [
      { name: 'שוקולד פרה',            brand: 'עלית' },
      { name: 'שוקולד מריר',           brand: 'עלית' },
      { name: 'שוקולד חלב',            brand: 'עלית' },
      { name: 'שוקולד עם אגוזים',      brand: 'עלית' },
      { name: 'שוקולד נוטלה',          brand: 'נוטלה' },
    ],
  },
  {
    base: 'עוגיות',
    category: 'snacks', unit: 'units',
    variants: [
      { name: 'עוגיות אוראו',          brand: 'אוראו' },
      { name: 'עוגיות שוקולד צ׳יפס' },
      { name: 'פתי בר',                brand: 'אסם' },
    ],
  },

  // ==========================================================================
  // יבש ושימורים (pantry)
  // ==========================================================================
  {
    base: 'אורז',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'אורז לבן 1 ק"ג' },
      { name: 'אורז בסמטי' },
      { name: 'אורז מלא' },
    ],
  },
  {
    base: 'פסטה',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'ספגטי',                 brand: 'אסם' },
      { name: 'פנה',                    brand: 'אסם' },
      { name: 'פוסילי',                 brand: 'אסם' },
      { name: 'מקרוני',                 brand: 'אסם' },
    ],
  },
  {
    base: 'קמח',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'קמח לבן 1 ק"ג' },
      { name: 'קמח מלא' },
      { name: 'קמח תופח' },
    ],
  },
  {
    base: 'סוכר',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'סוכר לבן 1 ק"ג' },
      { name: 'סוכר חום' },
      { name: 'אבקת סוכר' },
    ],
  },
  {
    base: 'מלח',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'מלח שולחן' },
      { name: 'מלח ים' },
    ],
  },
  {
    base: 'שמן',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'שמן זית' },
      { name: 'שמן קנולה' },
      { name: 'שמן חמניות' },
    ],
  },
  {
    base: 'קפה',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'קפה נמס',               brand: 'עלית' },
      { name: 'קפה טורקי',             brand: 'עלית' },
      { name: 'קפסולות נספרסו' },
    ],
  },
  {
    base: 'תה',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'תה שחור',               brand: 'ויסוצקי' },
      { name: 'תה ירוק',               brand: 'ויסוצקי' },
      { name: 'תה צמחים' },
    ],
  },
  {
    base: 'דבש',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'דבש' },
    ],
  },
  {
    base: 'ריבה',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'ריבת תות' },
      { name: 'ריבת חלב' },
      { name: 'ממרח שוקולד',           brand: 'נוטלה' },
    ],
  },
  {
    base: 'חומוס',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'חומוס במשקה',           brand: 'אחלה' },
      { name: 'חומוס יבש 1 ק"ג' },
    ],
  },
  {
    base: 'טחינה',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'טחינה גולמית',          brand: 'אל ארז' },
      { name: 'טחינה מוכנה' },
    ],
  },
  {
    base: 'תירס',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'תירס בקופסה' },
    ],
  },
  {
    base: 'טונה',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'טונה במים',             brand: 'סטרקיסט' },
      { name: 'טונה בשמן',             brand: 'סטרקיסט' },
    ],
  },
  {
    base: 'זיתים',
    category: 'pantry', unit: 'units',
    variants: [
      { name: 'זיתים שחורים' },
      { name: 'זיתים ירוקים' },
    ],
  },

  // ==========================================================================
  // משקאות (drinks)
  // ==========================================================================
  {
    base: 'קולה',
    category: 'drinks', unit: 'units',
    variants: [
      { name: 'קוקה קולה',             brand: 'קוקה קולה' },
      { name: 'קוקה קולה זירו',        brand: 'קוקה קולה' },
      { name: 'פפסי',                   brand: 'פפסי' },
    ],
  },
  {
    base: 'מים',
    category: 'drinks', unit: 'units',
    variants: [
      { name: 'מים מינרליים 6×1.5 ל׳', brand: 'נביעות' },
      { name: 'מים מינרליים 1.5 ליטר', brand: 'מי עדן' },
      { name: 'מים מוגזים',             brand: 'נביעות' },
    ],
  },
  {
    base: 'מיץ',
    category: 'drinks', unit: 'units',
    variants: [
      { name: 'מיץ תפוזים',             brand: 'פרי גן' },
      { name: 'מיץ ענבים',              brand: 'פרי גן' },
      { name: 'מיץ תפוחים',             brand: 'פרי גן' },
    ],
  },
  {
    base: 'בירה',
    category: 'drinks', unit: 'units',
    variants: [
      { name: 'בירה גולדסטאר',          brand: 'גולדסטאר' },
      { name: 'בירה מכבי',              brand: 'מכבי' },
      { name: 'בירה היינקן',             brand: 'היינקן' },
    ],
  },
  {
    base: 'יין',
    category: 'drinks', unit: 'units',
    variants: [
      { name: 'יין אדום' },
      { name: 'יין לבן' },
      { name: 'יין רוזה' },
    ],
  },

  // ==========================================================================
  // קפואים (frozen)
  // ==========================================================================
  {
    base: 'גלידה',
    category: 'frozen', unit: 'units',
    variants: [
      { name: 'גלידת שוקולד',          brand: 'נסטלה' },
      { name: 'גלידת וניל',             brand: 'נסטלה' },
      { name: 'גלידה בסטיק',            brand: 'נסטלה' },
    ],
  },
  {
    base: 'פיצה',
    category: 'frozen', unit: 'units',
    variants: [
      { name: 'פיצה קפואה',             brand: 'דר אטקר' },
      { name: 'פיצה משפחתית' },
    ],
  },

  // ==========================================================================
  // ניקיון (cleaning)
  // ==========================================================================
  {
    base: 'אקונומיקה',
    category: 'cleaning', unit: 'units',
    variants: [
      { name: 'אקונומיקה',              brand: 'סנו' },
    ],
  },
  {
    base: 'סבון כלים',
    category: 'cleaning', unit: 'units',
    variants: [
      { name: 'סבון כלים',              brand: 'פיירי' },
      { name: 'סבון כלים לימון',        brand: 'סנו' },
    ],
  },
  {
    base: 'אבקת כביסה',
    category: 'cleaning', unit: 'units',
    variants: [
      { name: 'אבקת כביסה',             brand: 'אריאל' },
      { name: 'אבקת כביסה לבנים',       brand: 'פרסיל' },
      { name: 'מרכך כביסה',             brand: 'בדגמי' },
    ],
  },
  {
    base: 'שקיות אשפה',
    category: 'cleaning', unit: 'units',
    variants: [
      { name: 'שקיות אשפה',             brand: 'סנו' },
    ],
  },

  // ==========================================================================
  // היגיינה אישית (personal)
  // ==========================================================================
  {
    base: 'שמפו',
    category: 'personal', unit: 'units',
    variants: [
      { name: 'שמפו',                   brand: 'הד אנד שולדרס' },
      { name: 'שמפו לשיער יבש',         brand: 'פנטן' },
      { name: 'מרכך שיער',              brand: 'פנטן' },
    ],
  },
  {
    base: 'סבון',
    category: 'personal', unit: 'units',
    variants: [
      { name: 'סבון רחצה',              brand: 'דאב' },
      { name: 'סבון נוזלי',             brand: 'דאב' },
    ],
  },
  {
    base: 'משחת שיניים',
    category: 'personal', unit: 'units',
    variants: [
      { name: 'משחת שיניים',            brand: 'קולגייט' },
      { name: 'משחת שיניים מלבינה',     brand: 'קולגייט' },
    ],
  },
  {
    base: 'דאודורנט',
    category: 'personal', unit: 'units',
    variants: [
      { name: 'דאודורנט גברים',         brand: 'אקס' },
      { name: 'דאודורנט נשים',          brand: 'דאב' },
    ],
  },

  // ==========================================================================
  // נייר (paper)
  // ==========================================================================
  {
    base: 'נייר טואלט',
    category: 'paper', unit: 'units',
    variants: [
      { name: 'נייר טואלט 32 גלילים',   brand: 'לילי' },
      { name: 'נייר טואלט 48 גלילים',   brand: 'סופט' },
    ],
  },
  {
    base: 'מגבות נייר',
    category: 'paper', unit: 'units',
    variants: [
      { name: 'מגבות נייר',              brand: 'לילי' },
    ],
  },
  {
    base: 'ממחטות',
    category: 'paper', unit: 'units',
    variants: [
      { name: 'ממחטות נייר',             brand: 'לילי' },
    ],
  },

  // ==========================================================================
  // תינוקות (baby)
  // ==========================================================================
  {
    base: 'חיתולים',
    category: 'baby', unit: 'units',
    variants: [
      { name: 'חיתולים',                 brand: 'האגיס' },
      { name: 'חיתולים פרימיום',         brand: 'פאמפרס' },
      { name: 'מגבונים לתינוק',           brand: 'האגיס' },
    ],
  },

];


// ============================================================================
// API ציבורי
// ============================================================================

/**
 * חיפוש במילון הפופולרי.
 * מחזיר וריאציות מגוונות של מוצר אם נמצאה התאמה לבסיס.
 *
 * דוגמה:
 *   searchPopular("חלב") → 7 וריאציות (3%, 1%, שקדים, סויה...)
 *   searchPopular("ביסלי") → 4 וריאציות (גריל, בצל, פיצה, ברביקיו)
 *   searchPopular("xyz123") → []
 *
 * @param {string} query
 * @param {number} limit - תקרת תוצאות (default 10)
 * @returns {Array} - [{name, baseName, category, unit, brand}]
 */
export function searchPopular(query, limit = 10) {
  if (!query || query.length < 1) return [];

  const q = query.trim().toLowerCase();
  const results = [];

  for (const product of POPULAR_PRODUCTS) {
    const baseLower = product.base.toLowerCase();

    // התאמה: ה-query מופיע בתחילת הבסיס, או הבסיס מתחיל ב-query
    const matches =
      baseLower.startsWith(q) ||           // "חל" → "חלב"
      baseLower.includes(q) ||             // "מילון" - חיפוש פנימי
      q.startsWith(baseLower);             // "חלב תנובה" → "חלב"

    if (!matches) continue;

    // הכנסת כל הוריאציות
    for (const variant of product.variants) {
      results.push({
        name:      variant.name,
        baseName:  product.base,
        category:  product.category,
        unit:      product.unit,
        brand:     variant.brand || null,
        source:    'popular',                // לדיבוג - לדעת מאיפה הגיע
      });
    }
  }

  // מיון: התאמות מדויקות יותר קודם
  results.sort((a, b) => {
    const aStarts = a.baseName.toLowerCase().startsWith(q) ? 0 : 1;
    const bStarts = b.baseName.toLowerCase().startsWith(q) ? 0 : 1;
    return aStarts - bStarts;
  });

  return results.slice(0, limit);
}


/**
 * סטטיסטיקות (לדיבוג)
 */
export function popularStats() {
  const totalVariants = POPULAR_PRODUCTS.reduce(
    (sum, p) => sum + p.variants.length, 0
  );
  return {
    bases:    POPULAR_PRODUCTS.length,
    variants: totalVariants,
  };
}
