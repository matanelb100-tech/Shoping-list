/**
 * ============================================================================
 * popular-products.js - Curated Catalog (גרסה פשוטה)
 * ============================================================================
 *
 * מבנה:
 *   כל בסיס מייצג מוצר כללי (חלב, ביצים, אורז).
 *   - searchTerms: מילים שחייבות להופיע בשם המוצר ב-KV
 *   - excludeTerms: מילים שאסור שיופיעו (סינון רעש)
 *   - defaultSize: כמות ברירת מחדל ביחידת הקטגוריה
 *
 * זרימת חיפוש:
 *   המשתמש בוחר "חלב" → ה-Worker מקבל:
 *     searchTerms: ['חלב']
 *     excludeTerms: ['שוקולד', 'חלבה', 'חלבון', 'פנים', ...]
 *   ה-Worker מחזיר את המוצר הזול ביותר בכל רשת שעובר את המסננים.
 *
 * שדרוג עתידי:
 *   להוסיף variants[] למוצרים שצריכים פיצול (חלב 3% מול 1%).
 *   הוורקר תומך כבר במבנה זה - רק צריך להוסיף variants לבסיסים רלוונטיים.
 *
 * נוצר ב-2026-04-27
 * מבוסס על ניתוח של 5 רשתות (~4M שורות מחירים)
 * ============================================================================
 */

export const POPULAR_PRODUCTS = [

  // ==========================================================================
  // מוצרי חלב וביצים (dairy)
  // ==========================================================================
  {
    base:         'חלב',
    category:     'dairy',
    unit:         'liter',
    searchTerms:  ['חלב'],
    excludeTerms: ['גוף', 'חלבה', 'חלבון', 'יד', 'עיניים', 'פנים', 'שוקולד'],
    defaultSize:  1,
  },
  {
    base:         'גבינה',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['גבינה'],
    excludeTerms: ['בורקס', 'עוגת'],
    defaultSize:  1,
  },
  {
    base:         'יוגורט',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['יוגורט'],
    excludeTerms: ['משקה'],
    defaultSize:  1,
  },
  {
    base:         'ביצים',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['ביצים'],
    excludeTerms: ['אטריות', 'איטריות', 'מצות', 'נודלס', 'סלט', 'פתיתי'],
    defaultSize:  1,
  },
  {
    base:         'חמאה',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['חמאה'],
    excludeTerms: ['בוטנים', 'ממרח', 'סוכריות'],
    defaultSize:  1,
  },
  {
    base:         'שמנת',
    category:     'dairy',
    unit:         'liter',
    searchTerms:  ['שמנת'],
    excludeTerms: ['גבינת', 'גוף', 'פיתוח'],
    defaultSize:  1,
  },

  // ==========================================================================
  // מאפים (bakery)
  // ==========================================================================
  {
    base:         'לחם',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['לחם'],
    excludeTerms: ['ארומה', 'עללחם', 'פירורי', 'פרורי', 'קמח'],
    defaultSize:  1,
  },
  {
    base:         'פיתות',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['פיתות'],
    excludeTerms: ['שמיניית'],
    defaultSize:  1,
  },
  {
    base:         'חלה',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['חלה'],
    excludeTerms: ['אחלה', 'חלהלה', 'לחלה', 'נחלה', 'קמח'],
    defaultSize:  1,
  },
  {
    base:         'לחמניות',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['לחמניות'],
    excludeTerms: ['שישיית'],
    defaultSize:  1,
  },

  // ==========================================================================
  // ירקות ופירות (produce)
  // ==========================================================================
  {
    base:         'עגבניות',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['עגבניות'],
    excludeTerms: ['ברוטב', 'מחית', 'מיץ', 'פסטה', 'רוטב', 'רסק'],
    defaultSize:  1,
  },
  {
    base:         'מלפפונים',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['מלפפונים'],
    excludeTerms: ['בכבישה', 'בצנצנת', 'חמוצים', 'ספריי', 'פרוסות'],
    defaultSize:  1,
  },
  {
    base:         'בצל',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['בצל'],
    excludeTerms: ['אבקת', 'ביסלי', 'בצלצלי', 'ובצל', 'טבעות', 'יבש', 'ירוק', 'לבן', 'מרק', 'שמנת'],
    defaultSize:  1,
  },
  {
    base:         'תפוחי אדמה',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['תפוחי אדמה'],
    excludeTerms: ['אבקת', 'בצק', 'חטיף', 'מועך', 'ניוקי', 'פירה', 'פריכיות', 'קמח'],
    defaultSize:  1,
  },
  {
    base:         'בננות',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['בננות'],
    excludeTerms: ['ובננות', 'ייבוש', 'מיובש', 'צ\'יפס'],
    defaultSize:  1,
  },
  {
    base:         'תפוחים',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['תפוחים'],
    excludeTerms: ['חומץ', 'מיץ', 'ממרח', 'נקטר', 'סיידר', 'רסק', 'תרכיז'],
    defaultSize:  1,
  },
  {
    base:         'גזר',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['גזר'],
    excludeTerms: ['וגזר', 'חטיפוני', 'תפוז', 'תפוח'],
    defaultSize:  1,
  },
  {
    base:         'פלפל',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['פלפל'],
    excludeTerms: ['אבקת', 'גמבה', 'טחון', 'פלפלים', 'שחור'],
    defaultSize:  1,
  },
  {
    base:         'חסה',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['חסה'],
    excludeTerms: ['לבבות', 'עלי'],
    defaultSize:  1,
  },
  {
    base:         'אבוקדו',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['אבוקדו'],
    excludeTerms: ['ידיים', 'מיץ', 'ממרח', 'שמן'],
    defaultSize:  1,
  },
  {
    base:         'לימון',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['לימון'],
    excludeTerms: ['בטעם', 'ולימון', 'חומץ', 'מיץ', 'מלח', 'שום', 'תרכיז'],
    defaultSize:  1,
  },
  {
    base:         'תפוזים',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['תפוזים'],
    excludeTerms: ['בטעם', 'מיץ', 'נקטר', 'פריגת', 'תרכיז'],
    defaultSize:  1,
  },

  // ==========================================================================
  // בשר ודגים (meat)
  // ==========================================================================
  {
    base:         'עוף',
    category:     'meat',
    unit:         'kg',
    searchTerms:  ['עוף'],
    excludeTerms: ['מרק', 'נגיסי', 'נקניקיות', 'ציפס', 'שניצל'],
    defaultSize:  1,
  },
  {
    base:         'בשר בקר',
    category:     'meat',
    unit:         'kg',
    searchTerms:  ['בשר בקר'],
    excludeTerms: ['במילוי', 'המבורגר', 'חינקלי', 'כיסונים', 'נקניק', 'קציצות', 'שניצל', 'תבשיל'],
    defaultSize:  1,
  },
  {
    base:         'הודו',
    category:     'meat',
    unit:         'kg',
    searchTerms:  ['הודו'],
    excludeTerms: ['בשר', 'גרון', 'חזה', 'טחון', 'מבשר', 'נקניק', 'נקניקיות', 'נתחי', 'פסטרמה', 'שניצל'],
    defaultSize:  1,
  },
  {
    base:         'דג',
    category:     'meat',
    unit:         'kg',
    searchTerms:  ['דג'],
    excludeTerms: ['דגל', 'דגם', 'דגני', 'דגנים', 'דגש', 'פילה'],
    defaultSize:  1,
  },
  {
    base:         'נקניק',
    category:     'meat',
    unit:         'kg',
    searchTerms:  ['נקניק'],
    excludeTerms: ['נקניקיות'],
    defaultSize:  1,
  },

  // ==========================================================================
  // חטיפים ומתוקים (snacks)
  // ==========================================================================
  {
    base:         'ביסלי',
    category:     'snacks',
    unit:         'units',
    searchTerms:  ['ביסלי'],
    excludeTerms: ['במבה'],
    defaultSize:  1,
  },
  {
    base:         'במבה',
    category:     'snacks',
    unit:         'units',
    searchTerms:  ['במבה'],
    excludeTerms: ['ביסלי', 'חטיף'],
    defaultSize:  1,
  },
  {
    base:         'צ\'יפס',
    category:     'snacks',
    unit:         'units',
    searchTerms:  ['צ\'יפס'],
    excludeTerms: [],
    defaultSize:  1,
  },
  {
    base:         'שוקולד',
    category:     'snacks',
    unit:         'units',
    searchTerms:  ['שוקולד'],
    excludeTerms: ['חלב', 'ממרח', 'מעטפת', 'עוגיות'],
    defaultSize:  1,
  },
  {
    base:         'עוגיות',
    category:     'snacks',
    unit:         'units',
    searchTerms:  ['עוגיות'],
    excludeTerms: ['בצק'],
    defaultSize:  1,
  },

  // ==========================================================================
  // יסודות מזווה (pantry)
  // ==========================================================================
  {
    base:         'אורז',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['אורז'],
    excludeTerms: ['אטריות', 'אפויים', 'דייסת', 'חומץ', 'חטיף', 'מקלוני', 'נודלס', 'פריכיות', 'קמח'],
    defaultSize:  1,
  },
  {
    base:         'פסטה',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['פסטה'],
    excludeTerms: ['אבקת', 'לפסטה', 'סקיני', 'רוטב'],
    defaultSize:  1,
  },
  {
    base:         'קמח',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['קמח'],
    excludeTerms: ['מקמח', 'עוגיות'],
    defaultSize:  1,
  },
  {
    base:         'סוכר',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['סוכר'],
    excludeTerms: ['אבקת', 'ממתיק', 'סוכרזית', 'סוכריות'],
    defaultSize:  1,
  },
  {
    base:         'מלח',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['מלח'],
    excludeTerms: ['במי', 'במלח', 'מומלח', 'ממרח'],
    defaultSize:  1,
  },
  {
    base:         'שמן',
    category:     'pantry',
    unit:         'liter',
    searchTerms:  ['שמן'],
    excludeTerms: ['בושם', 'בשמן', 'מנוע', 'תרסיס'],
    defaultSize:  1,
  },
  {
    base:         'דבש',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['דבש'],
    excludeTerms: ['בדבש', 'בטעם', 'הדבש', 'ודבש', 'ממרח'],
    defaultSize:  1,
  },
  {
    base:         'ריבה',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['ריבה'],
    excludeTerms: ['PRIMAVERA', 'בטעם', 'כתר', 'סנדוויץ', 'פרח'],
    defaultSize:  1,
  },
  {
    base:         'חומוס',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['חומוס'],
    excludeTerms: ['גרגירי', 'גרגרי', 'מקמח', 'סלט', 'פול', 'צבר', 'קמח'],
    defaultSize:  1,
  },
  {
    base:         'טחינה',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['טחינה'],
    excludeTerms: ['בטחינה', 'גולמית', 'חומוס', 'ממרח'],
    defaultSize:  1,
  },
  {
    base:         'תירס',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['תירס'],
    excludeTerms: ['אבקת', 'גרעיני', 'ותירס', 'פצפוצי', 'פריכיות', 'פתיתי', 'קמח', 'שמן', 'שניצל'],
    defaultSize:  1,
  },
  {
    base:         'טונה',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['טונה'],
    excludeTerms: ['בטעם', 'נתחי', 'סטייק', 'סלט', 'פילה'],
    defaultSize:  1,
  },
  {
    base:         'זיתים',
    category:     'pantry',
    unit:         'units',
    searchTerms:  ['זיתים'],
    excludeTerms: ['טבעות', 'ממרח', 'שמן', 'שמנת'],
    defaultSize:  1,
  },

  // ==========================================================================
  // משקאות (beverages)
  // ==========================================================================
  {
    base:         'קפה',
    category:     'beverages',
    unit:         'liter',
    searchTerms:  ['קפה'],
    excludeTerms: ['אייס', 'בטעם', 'גלידת', 'לקפה', 'מכונת', 'ממתק', 'משקה', 'נסקפה', 'עוגת', 'קפסולות'],
    defaultSize:  1,
  },
  {
    base:         'תה',
    category:     'beverages',
    unit:         'liter',
    searchTerms:  ['תה'],
    excludeTerms: ['בקבוק', 'סלמי', 'פיתה', 'פנים'],
    defaultSize:  1,
  },
  {
    base:         'קולה',
    category:     'beverages',
    unit:         'liter',
    searchTerms:  ['קולה'],
    excludeTerms: ['דאיט', 'הקולה', 'זירו', 'פפסי', 'קוקה', 'רוקולה'],
    defaultSize:  1,
  },
  {
    base:         'מים',
    category:     'beverages',
    unit:         'liter',
    searchTerms:  ['מים'],
    excludeTerms: ['אדומים', 'בטעמים', 'במים', 'גוף', 'כתמים', 'מי ורדים', 'מי שושנים', 'פחמים', 'פנים', 'שלמים'],
    defaultSize:  1,
  },
  {
    base:         'מיץ',
    category:     'beverages',
    unit:         'liter',
    searchTerms:  ['מיץ'],
    excludeTerms: ['ממרח'],
    defaultSize:  1,
  },
  {
    base:         'בירה',
    category:     'beverages',
    unit:         'liter',
    searchTerms:  ['בירה'],
    excludeTerms: ['ללא אלכוהול', 'שישיית'],
    defaultSize:  1,
  },
  {
    base:         'יין',
    category:     'beverages',
    unit:         'liter',
    searchTerms:  ['יין'],
    excludeTerms: ['אלקליין', 'חומץ', 'פיין', 'קולקשיין', 'קרליין'],
    defaultSize:  1,
  },

  // ==========================================================================
  // מוקפאים (frozen)
  // ==========================================================================
  {
    base:         'גלידה',
    category:     'frozen',
    unit:         'units',
    searchTerms:  ['גלידה'],
    excludeTerms: ['אבקת', 'גביעי', 'לגלידה', 'מאגדת', 'קרמיסימו', 'תערובת'],
    defaultSize:  1,
  },
  {
    base:         'פיצה',
    category:     'frozen',
    unit:         'units',
    searchTerms:  ['פיצה'],
    excludeTerms: ['בצק', 'לפיצה', 'מאמאמיה', 'קמח', 'רוטב'],
    defaultSize:  1,
  },

  // ==========================================================================
  // ניקיון (cleaning)
  // ==========================================================================
  {
    base:         'אקונומיקה',
    category:     'cleaning',
    unit:         'units',
    searchTerms:  ['אקונומיקה'],
    excludeTerms: ['ג\'ל', 'מרסס', 'תרסיס'],
    defaultSize:  1,
  },
  {
    base:         'סבון כלים',
    category:     'cleaning',
    unit:         'units',
    searchTerms:  ['סבון כלים'],
    excludeTerms: [],
    defaultSize:  1,
  },
  {
    base:         'אבקת כביסה',
    category:     'cleaning',
    unit:         'units',
    searchTerms:  ['אבקת כביסה'],
    excludeTerms: ['אריאל', 'טייד', 'מקסימה'],
    defaultSize:  1,
  },
  {
    base:         'שקיות אשפה',
    category:     'cleaning',
    unit:         'units',
    searchTerms:  ['שקיות אשפה'],
    excludeTerms: ['קלין-'],
    defaultSize:  1,
  },

  // ==========================================================================
  // טיפוח (personal)
  // ==========================================================================
  {
    base:         'שמפו',
    category:     'personal',
    unit:         'units',
    searchTerms:  ['שמפו'],
    excludeTerms: ['פנטן'],
    defaultSize:  1,
  },
  {
    base:         'סבון',
    category:     'personal',
    unit:         'units',
    searchTerms:  ['סבון'],
    excludeTerms: ['אל', 'אלסבון', 'פלמוליב'],
    defaultSize:  1,
  },
  {
    base:         'משחת שיניים',
    category:     'personal',
    unit:         'units',
    searchTerms:  ['משחת שיניים'],
    excludeTerms: ['קולגייט'],
    defaultSize:  1,
  },
  {
    base:         'דאודורנט',
    category:     'personal',
    unit:         'units',
    searchTerms:  ['דאודורנט'],
    excludeTerms: ['ניוואה'],
    defaultSize:  1,
  },

  // ==========================================================================
  // מוצרי נייר (paper)
  // ==========================================================================
  {
    base:         'נייר טואלט',
    category:     'paper',
    unit:         'units',
    searchTerms:  ['נייר טואלט'],
    excludeTerms: ['מגבוני'],
    defaultSize:  1,
  },
  {
    base:         'מגבות נייר',
    category:     'paper',
    unit:         'units',
    searchTerms:  ['מגבות נייר'],
    excludeTerms: ['סושי'],
    defaultSize:  1,
  },
  {
    base:         'ממחטות',
    category:     'paper',
    unit:         'units',
    searchTerms:  ['ממחטות'],
    excludeTerms: ['טישו', 'סופט'],
    defaultSize:  1,
  },
  {
    base:         'חיתולים',
    category:     'paper',
    unit:         'units',
    searchTerms:  ['חיתולים'],
    excludeTerms: ['חיתוליםשלב'],
    defaultSize:  1,
  },

];


// ============================================================================
// פונקציות ציבוריות
// ============================================================================

/**
 * חיפוש בסיסים תואמים ל-query (לאוטוקומפליט).
 * @param {string} query  - מה שהמשתמש הקליד
 * @param {number} limit  - מקסימום תוצאות
 * @returns {Array}       - רשימת בסיסים תואמים עם searchTerms+excludeTerms
 */
export function searchPopular(query, limit = 10) {
  if (!query || query.length < 1) return [];

  const q = query.trim().toLowerCase();
  const results = [];

  for (const product of POPULAR_PRODUCTS) {
    const baseLower = product.base.toLowerCase();

    // התאמה: ה-query מופיע בתחילת הבסיס, או הבסיס מכיל את ה-query
    const matches =
      baseLower.startsWith(q) ||
      baseLower.includes(q) ||
      q.startsWith(baseLower);

    if (!matches) continue;

    results.push({
      name:         product.base,
      baseName:     product.base,
      category:     product.category,
      unit:         product.unit,
      searchTerms:  [...product.searchTerms],
      excludeTerms: [...product.excludeTerms],
      defaultSize:  product.defaultSize,
      source:       'popular',
    });
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
  return {
    bases: POPULAR_PRODUCTS.length,
  };
}
