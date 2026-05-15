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
  // ----------------------------------------------------------------------------
  // עודכן ב-2026-05 לפי ניתוח kv_analysis.json (98K מוצרים אמיתיים, 5 רשתות).
  // עיקרון מרכזי: מילים נפוצות כמו "חלב" / "שוקו" / "לבנה" תופסות הרבה רעש
  // (קוסמטיקה, חטיפים, שעועית). excludeTerms חזק חיוני.
  // ==========================================================================

  // ----- חלב -----
  // רעש כבד: שמפו "פלמוליב חלב ודבש", חטיפי שוקולד-חלב, חלבון, חלבה.
  {
    base:         'חלב',
    category:     'dairy',
    unit:         'liter',
    searchTerms:  ['חלב'],
    excludeTerms: ['ביסקויט', 'גוף', 'חטיף', 'חלבה', 'חלבון', 'יד', 'מטבעות',
                   'מרוכז', 'מרציפן', 'משחת', 'סבון', 'עיניים', 'פלמוליב',
                   'פנים', 'קוסמטי', 'קינדר', 'ריבת', 'שוקולד', 'שמפו', 'תח.רחצה'],
    defaultSize:  1,
    defaultVariant: 'milk_3',
    variants: [
      { id: 'milk_3',     label: 'חלב 3% שומן',
        searchTerms:  ['חלב', '3%'],
        excludeTerms: ['גוף', 'חטיף', 'חלבה', 'חלבון', 'מרציפן', 'סבון',
                       'שוקולד', 'שמפו', 'יוגורט', 'מעדן', 'גבינה'] },
      { id: 'milk_1',     label: 'חלב 1% שומן',
        searchTerms:  ['חלב', '1%'],
        excludeTerms: ['גוף', 'חטיף', 'חלבה', 'חלבון', 'מרציפן', 'סבון',
                       'שוקולד', 'שמפו', 'יוגורט', 'מעדן', 'גבינה'] },
      { id: 'milk_soy',   label: 'משקה סויה',
        searchTerms:  ['סויה'],
        excludeTerms: ['רוטב', 'אטריות', 'נודלס', 'גלי', 'מעדן', 'יוגורט',
                       'גבינה', 'שמן', 'גרגירי', 'נבטי'] },
      { id: 'milk_lacto', label: 'חלב נטול לקטוז',
        searchTerms:  ['חלב', 'לקטוז'],
        excludeTerms: ['חטיף', 'שוקולד', 'גבינה', 'יוגורט'] },
    ],
  },

  // ----- גבינה לבנה (פוצל מ-"גבינה" הכללית) -----
  // searchTerms דורש את שתי המילים = סינון חזק טבעי.
  {
    base:         'גבינה לבנה',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['גבינה', 'לבנה'],
    excludeTerms: ['בורקס', 'מלוחה', 'עוגת', 'עיזים'],
    defaultSize:  1,
    defaultVariant: 'cheese_white_5',
    variants: [
      { id: 'cheese_white_5', label: 'גבינה לבנה 5%',
        searchTerms:  ['גבינה', 'לבנה', '5%'],
        excludeTerms: ['בורקס', 'עוגת', 'עיזים'] },
      { id: 'cheese_white_9', label: 'גבינה לבנה 9%',
        searchTerms:  ['גבינה', 'לבנה', '9%'],
        excludeTerms: ['בורקס', 'עוגת', 'עיזים'] },
      { id: 'cheese_white_3', label: 'גבינה לבנה 3%',
        searchTerms:  ['גבינה', 'לבנה', '3%'],
        excludeTerms: ['בורקס', 'עוגת', 'עיזים'] },
    ],
  },

  // ----- גבינה צהובה (פוצל מ-"גבינה" הכללית) -----
  {
    base:         'גבינה צהובה',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['גבינה', 'צהובה'],
    excludeTerms: ['בורקס', 'מגורדת', 'עוגת'],
    defaultSize:  1,
  },

  // ----- יוגורט -----
  // משקה יוגורט (אירן) = רעש. גם תח.רחצה.
  {
    base:         'יוגורט',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['יוגורט'],
    excludeTerms: ['אירן', 'משקה', 'קראנצ', 'תח.רחצה'],
    defaultSize:  1,
    defaultVariant: 'yogurt_plain',
    variants: [
      { id: 'yogurt_plain',  label: 'יוגורט טבעי',
        searchTerms:  ['יוגורט'],
        excludeTerms: ['אירן', 'משקה', 'תות', 'תח.רחצה', 'בטעם', 'וניל',
                       'שוקולד', 'פטל', 'יווני'] },
      { id: 'yogurt_greek',  label: 'יוגורט יווני',
        searchTerms:  ['יוגורט', 'יווני'],
        excludeTerms: ['אירן', 'משקה', 'תח.רחצה'] },
      { id: 'yogurt_fruit',  label: 'יוגורט בטעם פרי (יופלה)',
        searchTerms:  ['יופלה'],
        excludeTerms: ['משקה', 'תח.רחצה'] },
    ],
  },

  // ----- ביצים -----
  // קינדר ביצים, אטריות ביצים, סלט ביצים, חתולים-ביצי-ים = רעש.
  {
    base:         'ביצים',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['ביצים'],
    excludeTerms: ['אטריות', 'איטריות', 'בואנו', 'דקות', 'חדה', 'לסר', 'מצות',
                   'נודלס', 'סוכריות', 'סלט', 'פתיתי', 'קינדר'],
    defaultSize:  1,
  },

  // ----- חמאה -----
  // סוכריות חמאה, ביסקויט חמאה, פופקורן חמאה = רעש כבד.
  {
    base:         'חמאה',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['חמאה'],
    excludeTerms: ['ביסקויט', 'בוטנים', 'וורטר', 'ממרח', 'סוכריות', 'עוגיות',
                   'פופקורן', 'רושן'],
    defaultSize:  1,
  },

  // ----- שמנת (לבישול/הקצפה, לא גבינת/גלידת שמנת) -----
  // רעש ענק: גבינת שמנת (155), גלידת שמנת (135), מברשת שמנת (קוסמטיקה).
  {
    base:         'שמנת',
    category:     'dairy',
    unit:         'liter',
    searchTerms:  ['שמנת'],
    excludeTerms: ['גבינת', 'גוף', 'גלידה', 'גלידת', 'מברשת', 'מוס',
                   'פיתוח', 'קוסמטי', 'רחצה', 'שמפו'],
    defaultSize:  1,
  },

  // ----- קוטג -----
  // 'קוטג' עם או בלי גרש - הוורקר עושה substring lowercased, נופל יפה.
  {
    base:         'קוטג',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['קוטג'],
    excludeTerms: [],
    defaultSize:  1,
  },

  // ----- לבנה (גבינה - לא הלבנת שיניים, לא שעועית!) -----
  // קריטי: searchTerms דורש "גבינה" + "לבנה" יחד, אחרת תפיסת רעש קטסטרופלית.
  {
    base:         'לבנה',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['גב', 'לבנה'],
    excludeTerms: ['איקרה', 'הלבנה', 'להלבנה', 'לכביסה', 'ממולדה', 'משחת',
                   'שיניים', 'שעועית'],
    defaultSize:  1,
  },

  // ----- מעדן -----
  // טווח רחב של מעדנים (מילקי, דני, פירותי, סויה). שומרים רחב.
  {
    base:         'מעדן',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['מעדן'],
    excludeTerms: [],
    defaultSize:  1,
  },

  // ----- מרגרינה -----
  // קטיגוריה קטנה (30 מוצרים בלבד), נקייה יחסית.
  {
    base:         'מרגרינה',
    category:     'dairy',
    unit:         'units',
    searchTerms:  ['מרגרינה'],
    excludeTerms: [],
    defaultSize:  1,
  },

  // ----- שוקו (משקה!) -----
  // אזהרה: זה ה-base הכי בעייתי בקטגוריה. 75% מהמוצרים שמכילים "שוקו"
  // הם חטיפי שוקולד, לא משקה. excludeTerms חייב להיות אגרסיבי במיוחד.
  // אם הריצה תהיה גרועה - ייתכן ונחזור על זה עם searchTerms מוגדר יותר
  // (למשל ['שוקו', 'יוטבתה'] או ['משקה', 'שוקו']).
  {
    base:         'שוקו',
    category:     'dairy',
    unit:         'liter',
    searchTerms:  ['שוקו'],
    excludeTerms: ['אגוז', 'אגוזי', 'בואנו', 'ביסקויט', 'גלידה', 'גלידת',
                   'גרנולה', 'דובדבן', 'הפתעה', 'חטיף', 'טבליות', 'טבלית',
                   'טופי', 'לוז', 'מטבעות', 'מילקי', 'מלא', 'ממרח', 'מנה',
                   'מקלות', 'מריר', 'מרציפן', 'נוגט', 'סוכריות', 'עוגה',
                   'עוגיות', 'עוגת', 'פיסטוק', 'פצפוצי', 'קינדר', 'ריבת',
                   'שוקולד'],
    defaultSize:  1,
  },

  // ==========================================================================
  // מאפים (bakery)
  // ----------------------------------------------------------------------------
  // עודכן ב-2026-05 לפי ניתוח kv_analysis.json (98K מוצרים, 5 רשתות).
  // רעש מרכזי שמסוננים:
  //   - "פירורי לחם" (שמרים/ציפויים), "קמח" (כל הסוגים), "עללחם" (תבלין)
  //   - "אחלה" (חומוס/סלטים) ו-"נחלה" (קפה) ב"חלה"
  //   - "קמח מצה" (קמח אפייה) ב"מצות"
  //   - "ארומה" (בית הקפה) - לחם של רשת ארומה הוא מוצר ספציפי, לא הכללי
  // ==========================================================================

  // ----- לחם -----
  // הוספו variants כי משתמשים מבחינים בין סוגי לחם (לבן/מלא/שיפון/פרוס).
  // ברירת מחדל = "לחם אחיד פרוס" - הסטנדרט הזול והפופולרי.
  {
    base:         'לחם',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['לחם'],
    excludeTerms: ['ארומה', 'בייגלה', 'חציל', 'חרוסת', 'מקלות', 'נמס',
                   'עללחם', 'פירורי', 'פנקו', 'פרורי', 'פרכיות', 'קמח',
                   'שניצל', 'תערובת', 'תפזורת'],
    defaultSize:  1,
    defaultVariant: 'bread_white_sliced',
    variants: [
      { id: 'bread_white_sliced', label: 'לחם אחיד פרוס',
        searchTerms:  ['לחם', 'אחיד'],
        excludeTerms: ['פירורי', 'פרורי', 'קמח', 'תערובת'] },
      { id: 'bread_whole',        label: 'לחם חיטה מלאה',
        searchTerms:  ['לחם', 'מלא'],
        excludeTerms: ['פירורי', 'פרורי', 'קמח', 'מקלות', 'תערובת'] },
      { id: 'bread_rye',          label: 'לחם שיפון',
        searchTerms:  ['לחם', 'שיפון'],
        excludeTerms: ['פירורי', 'פרורי', 'קמח', 'תערובת'] },
      { id: 'bread_light',        label: 'לחם קל',
        searchTerms:  ['לחם', 'קל'],
        excludeTerms: ['פירורי', 'פרורי', 'קמח', 'תערובת'] },
      { id: 'bread_sourdough',    label: 'לחם מחמצת',
        searchTerms:  ['לחם', 'מחמצת'],
        excludeTerms: ['פירורי', 'פרורי', 'קמח', 'תערובת'] },
    ],
  },

  // ----- פיתות -----
  // יחסית נקי. "פיתות ביס" הוא חטיף - מוסנן.
  {
    base:         'פיתות',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['פיתות'],
    excludeTerms: ['ביס', 'פרו', 'קמח', 'תערובת'],
    defaultSize:  1,
  },

  // ----- חלה -----
  // רעש מאסיבי דרך "אחלה" (מותג סלטים/חומוס) ו-"נחלה" (קפה אל-נחלה).
  // הפתרון: searchTerms יקפיד על "חלה" (לא substring של "אחלה") - אבל
  // הוורקר עושה includes() אז חייבים excludeTerms חזק.
  {
    base:         'חלה',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['חלה'],
    excludeTerms: ['אחלה', 'חומוס', 'חציל', 'טחינה', 'כרוב', 'לחלה',
                   'מטבוחה', 'נחלה', 'סלט', 'קמח'],
    defaultSize:  1,
  },

  // ----- לחמניות -----
  // יחסית נקי. "לחמניות המבורגר" הוא מוצר לגיטימי - לא מוסנן.
  {
    base:         'לחמניות',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['לחמניות'],
    excludeTerms: ['קמח', 'תערובת'],
    defaultSize:  1,
  },

  // ----- מצות -----
  // רעש: "קמח מצה" (קמח אפייה). מצות עצמן הן המוצר.
  // הערה: searchTerms ['מצות'] יחפש substring "מצות" שמופיע ב"מצות שמורה" וגם
  // ב"מצה" (יחיד) - יחיד לא ייכלל. זה בסדר כי רוב המוצרים ברבים.
  {
    base:         'מצות',
    category:     'bakery',
    unit:         'units',
    searchTerms:  ['מצות'],
    excludeTerms: ['היאלרונית', 'חומצה', 'חמצמצות', 'מצופה', 'קמח', 'שמפו'],
    defaultSize:  1,
  },

  // ==========================================================================
  // ירקות ופירות (produce)
  // ----------------------------------------------------------------------------
  // עודכן ב-2026-05 לפי ניתוח kv_analysis.json.
  // אתגרים מרכזיים:
  //   - "עגבני" - רוב המוצרים ב-KV הם רטבים/שימורים, לא ירק טרי.
  //     excludeTerms חזק מאוד נדרש.
  //   - "שום" - 298 מופעים של "שומשום" (substring match!) - קריטי לסנן.
  //   - "פלפל" - תבלין (שחור/חריף/טחון) שמתערבב עם הירק. הוספנו variants.
  //   - "בצל" - חטיפים בטעם בצל ("ביסלי בצל"), מרק בצל, טבעות בצל.
  //   - "תפוח אדמה" - בורקס, חטיפים, ניוקי.
  //   - "גזר" - מיצים (תפוח+גזר), מחית תינוקות.
  // ==========================================================================

  // ----- עגבניות -----
  // המוצר הטרי בעיקרון נקרא ב-KV "עגבניה"/"עגבנייה" (יחיד) או "עגבניות שרי".
  // searchTerms ['עגבניות'] יגיע גם ל"רוטב עגבניות" - excludeTerms חיוני.
  {
    base:         'עגבניות',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['עגבניות'],
    excludeTerms: ['אוליביה', 'אקטיבוס', 'בזיליקום', 'בצל', 'ברוטב', 'דק',
                   'חתוכות', 'יכין', 'מחית', 'מיובש', 'מיובשות', 'מיץ',
                   'ממרח', 'מנה', 'מסקרפונה', 'מרוסקות', 'מרק', 'נמס',
                   'עיטורי', 'פוקצה', 'פסטה', 'פסטו', 'פריכוז', 'קוביות',
                   'קצוצות', 'רוטב', 'רסק'],
    defaultSize:  1,
  },

  // ----- מלפפונים -----
  // רעש: מלפפונים בכבישה/חמוצים. במקור הקובץ מסונן יפה - שיפור קל.
  {
    base:         'מלפפונים',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['מלפפונים'],
    excludeTerms: ['בייבי', 'בכבישה', 'בחומץ', 'בצנצנת', 'במלח',
                   'חמוצים', 'כבושים', 'ספריי', 'פרוסות'],
    defaultSize:  1,
  },

  // ----- פלפל -----
  // הבעיה: "פלפל שחור/חריף/טחון/גרוס" הם תבלין, לא ירק.
  // פתרון: variants המפצלים בין צבעי הפלפל הטרי.
  // ברירת מחדל = אדום (הכי נפוץ ויקר - המשתמש כנראה רוצה אותו).
  {
    base:         'פלפל',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['פלפל'],
    excludeTerms: ['אבקת', 'בלימון', 'גרוס', 'חלפינו', 'חלפיניו', 'חריף',
                   'חטיף', 'טחון', 'כבוש', 'מטוגנים', 'מיובש', 'ממולא',
                   'מרוקאי', 'סלטי', 'פינצ\'וס', 'פלפלית', 'פלפלים',
                   'קלוי', 'רוטב', 'רצועות', 'שחור', 'שיפקה', 'שישקה'],
    defaultSize:  1,
    defaultVariant: 'pepper_red',
    variants: [
      { id: 'pepper_red',    label: 'פלפל אדום',
        searchTerms:  ['פלפל', 'אדום'],
        excludeTerms: ['גרוס', 'חריף', 'חטיף', 'טחון', 'כבוש', 'מטוגנים',
                       'ממולא', 'מרוקאי', 'סלטי', 'קלוי', 'רוטב', 'רצועות'] },
      { id: 'pepper_green',  label: 'פלפל ירוק',
        searchTerms:  ['פלפל', 'ירוק'],
        excludeTerms: ['גרוס', 'חריף', 'חטיף', 'טחון', 'כבוש', 'מטוגנים',
                       'ממולא', 'סלטי', 'קלוי', 'רוטב', 'רצועות'] },
      { id: 'pepper_yellow', label: 'פלפל צהוב',
        searchTerms:  ['פלפל', 'צהוב'],
        excludeTerms: ['גרוס', 'חריף', 'חטיף', 'טחון', 'כבוש', 'מטוגנים',
                       'ממולא', 'סלטי', 'קלוי', 'רוטב', 'רצועות'] },
    ],
  },

  // ----- בצל -----
  // רעש כבד: ביסלי בצל, חטיפי תפוצ'יפס בצל, טבעות בצל קפואות, מרק בצל.
  // "בצל ירוק"/"בצל יבש" הם מוצרים שונים - מסוננים (אם רוצה אותם → variant עתידי).
  {
    base:         'בצל',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['בצל'],
    excludeTerms: ['אבקת', 'ביסלי', 'בצק', 'בצלצלי', 'בקבק', 'גריל',
                   'דהיידרציה', 'חטיף', 'טבעות', 'יבש', 'ירוק', 'לבן',
                   'מטוגן', 'מנה', 'מרק', 'נישנושים', 'סופלה', 'פוף',
                   'פירה', 'פירוז', 'פירורי', 'פתיתי', 'קרוטונים',
                   'קרקר', 'שמנת', 'שניצלוני', 'תפוצ\'יפס', 'תפוציפס'],
    defaultSize:  1,
  },

  // ----- שום -----
  // רעש קטסטרופלי: "שומשום" (298!), "בישום", "שמן שומשום", "בייגלה שומשום".
  // הפתרון: substring "שום" של "שומשום" יתפס - אבל excludeTerms יסנן.
  {
    base:         'שום',
    category:     'produce',
    unit:         'units',
    searchTerms:  ['שום'],
    excludeTerms: ['אבקת', 'בייגלה', 'בישום', 'גבישי', 'גרוס', 'חומוס',
                   'יבש', 'כתוש', 'לסלקטיב', 'משחה', 'עוגיות', 'קרקר',
                   'רוטב', 'שומשום', 'שמן', 'שמרסקופ', 'תבלין', 'תערובת'],
    defaultSize:  1,
  },

  // ----- תפוחי אדמה -----
  // ב-KV נמצא "תפוח אדמה" (יחיד). searchTerms שלנו "תפוחי אדמה" יתפס רק את הרבים.
  // זה בעייתי - חלק מהרשתות מציגות "תפוח אדמה אדום ארוז". נעדכן ל-"תפוח אדמה".
  // הוורקר עושה AND על מילים נפרדות, אז ['תפוח', 'אדמה'] יתפוס שניהם.
  {
    base:         'תפוחי אדמה',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['תפוח', 'אדמה'],
    excludeTerms: ['אגוז', 'אגו', 'אבקת', 'בורקס', 'בלינצ\'ס', 'בצק',
                   'חטיף', 'חטיפי', 'יפו', 'לביבות', 'מועך', 'ניוקי',
                   'סלט', 'פוטטוס', 'פירה', 'פריכיות', 'קמח', 'קרפלך',
                   'קציצות', 'שניצל'],
    defaultSize:  1,
  },

  // ----- בננות -----
  {
    base:         'בננות',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['בננות'],
    excludeTerms: ['ובננות', 'חטיף', 'ייבוש', 'מיובש', 'מיובשות', 'צ\'יפס',
                   'ציפס', 'תרכיז'],
    defaultSize:  1,
  },

  // ----- תפוחים -----
  {
    base:         'תפוחים',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['תפוחים'],
    excludeTerms: ['חומץ', 'מיובשים', 'מיץ', 'ממרח', 'נקטר', 'סיידר',
                   'רסק', 'תרכיז'],
    defaultSize:  1,
  },

  // ----- גזר -----
  // רעש: מיצים (תפוח+גזר/תפוז+גזר), מחית תינוקות, סלט גזר.
  {
    base:         'גזר',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['גזר'],
    excludeTerms: ['אפונה', 'בלימון', 'גזרים', 'גורי', 'דלעת', 'חטיף',
                   'מחית', 'מטרנה', 'מיץ', 'מיצי', 'מקופא', 'מקופאים',
                   'מוקפא', 'סלט', 'סמוצי', 'פרוט', 'פרוטה', 'תפוז',
                   'תפוח', 'תפוצ\'יפס'],
    defaultSize:  1,
  },

  // ----- חסה -----
  {
    base:         'חסה',
    category:     'produce',
    unit:         'units',
    searchTerms:  ['חסה'],
    excludeTerms: ['חסלט', 'סלט', 'תערובת'],
    defaultSize:  1,
  },

  // ----- אבוקדו -----
  {
    base:         'אבוקדו',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['אבוקדו'],
    excludeTerms: ['גוואקמולי', 'ידיים', 'מיץ', 'ממרח', 'סבון', 'שמן'],
    defaultSize:  1,
  },

  // ----- לימון -----
  {
    base:         'לימון',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['לימון'],
    excludeTerms: ['בטעם', 'ולימון', 'חומץ', 'מיץ', 'מלח', 'משקה',
                   'סבון', 'שום', 'תרכיז'],
    defaultSize:  1,
  },

  // ----- תפוזים -----
  {
    base:         'תפוזים',
    category:     'produce',
    unit:         'kg',
    searchTerms:  ['תפוזים'],
    excludeTerms: ['בטעם', 'מיץ', 'נקטר', 'פריגת', 'תפוז', 'תרכיז'],
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
