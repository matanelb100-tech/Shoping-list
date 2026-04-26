/**
 * ============================================================================
 * Cloudflare Worker - runprice (v4.1 - improved matching)
 * ============================================================================
 *
 * אחראי על:
 *   1. GET  /api/health               → בדיקת תקינות + סטטוס KV
 *   2. GET  /api/search?q=X&limit=10  → autocomplete מהיר
 *   3. POST /api/cart/price           → חישוב סל שלם (batch + fuzzy)
 *
 * שינויים גרסה 4.1 - תיקון איכות חיפוש (CRITICAL FIX):
 *   - scoreMatch כעת מעניש בחומרה על חוסר התאמת טוקנים (ratio בריבוע).
 *   - בונוס 30 על התאמה מלאה של כל טוקני ה-query.
 *   - בונוס על רצף (טוקנים בסדר הנכון).
 *   - ענישה גדולה יותר על "רעש" (טוקנים מיותרים במוצר).
 *   - MATCH_MIN_SCORE עלה מ-40 ל-65.
 *   - לקוויארי קצר (≤2 טוקנים) - דרישת all-tokens-must-match קשיחה.
 *   הבעיה שתוקנה: "בשר טחון" החזיר "כורכום טחון" / "שקד טחון" (תבלינים, לא בשר).
 *
 * שינויים גרסה 4:
 *   - תמיכה ב-inverted index (key: 'index:tokens') שנבנה ב-sync_prices.py.
 *   - findBestMatch מצמצם את מרחב החיפוש דרך האינדקס.
 *   - אם האינדקס לא קיים (sync ישן/שגיאה) → fallback ללוגיקה לינארית.
 *   - הוסר endpoint /api/product/price (פיצ'ר הוקפא - חסכון CPU).
 *
 * תלויות:
 *   - KV Binding: SALI_PRICES
 *     keys: prices:shufersal, prices:ramilevi, prices:yeinotbitan,
 *           prices:victory,  prices:yohananof, meta:sync, index:tokens
 * ============================================================================
 */


// ============================================================================
// קונפיגורציה
// ============================================================================

const CHAINS = ['shufersal', 'ramilevi', 'yeinotbitan', 'victory', 'yohananof'];

const CHAIN_NAMES = {
  shufersal:   'שופרסל',
  ramilevi:    'רמי לוי',
  yeinotbitan: 'יינות ביתן',
  victory:     'ויקטורי',
  yohananof:   'יוחננוף',
};

const CACHE_TTL_MS = 10 * 60 * 1000;      // 10 דקות
const SEARCH_DEFAULT_LIMIT = 10;
const SEARCH_MAX_LIMIT = 20;

// ⬆️ הועלה מ-40 ל-65 (v4.1)
// 40 היה מאפשר התאמה חלקית גרועה (ratio=0.5 → score=50).
// 65 דורש התאמה ממשית: או כל הטוקנים, או רובם המכריע + בונוסים.
const MATCH_MIN_SCORE = 65;

const INDEX_MIN_TOKEN_LEN = 2;            // טוקנים קצרים מ-2 לא נכנסים לאינדקס

// סף לדרישת all-tokens-must-match (v4.1):
// קוויארי של עד 2 טוקנים ("בשר טחון", "חלב 3%") - חייב התאמה מלאה.
// קוויארי ארוך יותר ("חלב תנובה 3% 1 ליטר") - מותר חוסר במילה.
const STRICT_MATCH_MAX_QUERY_TOKENS = 2;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};


// ============================================================================
// Cache בזיכרון
// ============================================================================

let memCache = {
  data: null,        // { shufersal: [...], ramilevi: [...], ... }
  index: null,       // { "חלב": { shufersal: [3,7,12], ... }, ... }  או null
  loadedAt: 0,
  meta: null,
};


/**
 * טוען את כל נתוני המחירים והאינדקס מ-KV אל memCache.
 * אם ה-cache טרי (< 10 דקות) - מחזיר מיידית.
 */
async function loadPrices(env) {
  const now = Date.now();

  if (memCache.data && (now - memCache.loadedAt) < CACHE_TTL_MS) {
    return memCache;
  }

  const promises = CHAINS.map(chain =>
    env.SALI_PRICES.get(`prices:${chain}`, { type: 'json' })
  );
  const metaPromise  = env.SALI_PRICES.get('meta:sync',    { type: 'json' });
  const indexPromise = env.SALI_PRICES.get('index:tokens', { type: 'json' });

  const [chainsData, meta, index] = await Promise.all([
    Promise.all(promises),
    metaPromise,
    indexPromise,
  ]);

  const data = {};
  CHAINS.forEach((chain, i) => {
    const raw = chainsData[i];
    data[chain] = raw ? objectToProductList(raw) : [];
  });

  memCache = {
    data,
    index: index || null,
    loadedAt: now,
    meta,
  };
  return memCache;
}


/**
 * ממיר את מבנה ה-KV ({barcode: {n,p}}) לרשימה שמישה לחיפוש.
 * כל מוצר מקבל index בתוך הרשימה - האינדקס מתייחס לאינדקסים האלה.
 */
function objectToProductList(raw) {
  const list = [];
  for (const barcode in raw) {
    const item = raw[barcode];
    if (!item || !item.n || item.p == null) continue;

    list.push({
      barcode: barcode,
      name:    item.n,
      price:   Number(item.p),
      tokens:  tokenize(item.n),
    });
  }
  return list;
}


// ============================================================================
// Normalization & Tokenization
// ============================================================================

function normalize(text) {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .replace(/[״"']/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\bליטר\b|\bליט\b|\bl\b/g, 'ל')
    .replace(/\bגרם\b|\bג'\b|\bgr\b|\bg\b/g, 'ג')
    .replace(/\bקילו\b|\bק"ג\b|\bkg\b/g, 'קג')
    .replace(/\bמ"ל\b|\bml\b/g, 'מל')
    .replace(/אחוז|%/g, '%')
    .trim();
}


function tokenize(text) {
  const normalized = normalize(text);
  return normalized
    .split(/[\s\-_.,()\/]+/)
    .filter(t => t.length > 0);
}


// ============================================================================
// Matching - גרסה משופרת (v4.1)
// ============================================================================

/**
 * בודקת האם טוקן מ-query מתאים לטוקן של מוצר.
 * מחזירה ציון התאמה: 1.0 = מדויק, 0.8 = prefix, 0.5 = substring, 0 = לא תואם.
 */
function tokenMatchScore(qt, pt) {
  if (pt === qt) return 1.0;
  if (qt.length >= 2 && pt.startsWith(qt)) return 0.8;
  if (qt.length >= 3 && pt.includes(qt)) return 0.5;
  return 0;
}


/**
 * scoreMatch v4.1 - מחושב חכם וקפדני יותר.
 *
 * עקרונות:
 *   1. ratio בריבוע - מעניש בחומרה על חוסר התאמה חלקית
 *      (ratio 0.5 → 25 במקום 50; ratio 1.0 → 100)
 *   2. בונוס 30 על התאמה מלאה (כל טוקני ה-query נמצאו)
 *   3. בונוס על רצף - טוקני ה-query מופיעים בסדר הנכון במוצר
 *   4. ענישת רעש חזקה יותר - טוקנים מיותרים במוצר
 *
 * דוגמאות:
 *   "בשר טחון" → "בשר בקר טחון 1 קג"
 *     matches=2/2=1.0, ratio²=1.0, fullMatch+30, רצף+10 = ~100 ✅
 *
 *   "בשר טחון" → "כורכום טחון אורגני"
 *     matches=1/2=0.5, ratio²=0.25 → 25, אין fullMatch, רעש -2 = ~23 ❌
 *
 *   "חלב 3%" → "חלב תנובה 3% 1 ליטר"
 *     matches=2/2=1.0, ratio²=1.0, fullMatch+30 = ~100 ✅
 */
function scoreMatch(queryTokens, productTokens) {
  if (queryTokens.length === 0 || productTokens.length === 0) return 0;

  let totalMatchValue = 0;
  let exactOrStrong = 0;
  const matchedPositions = [];  // לבדיקת רצף

  for (let qi = 0; qi < queryTokens.length; qi++) {
    const qt = queryTokens[qi];
    let bestForThisToken = 0;
    let bestPosition = -1;

    for (let pi = 0; pi < productTokens.length; pi++) {
      const value = tokenMatchScore(qt, productTokens[pi]);
      if (value > bestForThisToken) {
        bestForThisToken = value;
        bestPosition = pi;
      }
    }

    totalMatchValue += bestForThisToken;
    if (bestForThisToken >= 0.8) exactOrStrong += 1;
    if (bestPosition >= 0) matchedPositions.push(bestPosition);
  }

  // ratio של התאמה (0.0-1.0)
  const ratio = totalMatchValue / queryTokens.length;

  // ⭐ בריבוע - מעניש בחומרה על חוסר התאמה חלקית
  // ratio=1.0 → 1.0 (100), ratio=0.5 → 0.25 (25), ratio=0.75 → 0.56 (56)
  let score = Math.round(ratio * ratio * 100);

  // 🎯 בונוס Full Match: כל טוקני ה-query נמצאו בצורה חזקה (exact/prefix)
  const allStrongMatch = exactOrStrong === queryTokens.length;
  if (allStrongMatch) {
    score += 30;
  }

  // 📐 בונוס רצף: אם הטוקנים נמצאו בסדר עולה ובסמיכות
  if (matchedPositions.length >= 2) {
    let inOrder = true;
    let consecutive = 0;
    for (let i = 1; i < matchedPositions.length; i++) {
      if (matchedPositions[i] <= matchedPositions[i - 1]) {
        inOrder = false;
        break;
      }
      if (matchedPositions[i] === matchedPositions[i - 1] + 1) {
        consecutive += 1;
      }
    }
    if (inOrder) score += 5;
    score += consecutive * 5;  // עד +10 לרצף 3-טוקנים
  }

  // 🔻 ענישת רעש - טוקנים מיותרים במוצר.
  // מועלה מ-2 ל-3 לכל טוקן עודף (אחרי 3 טוקנים מותרים מעל ה-query).
  const noise = Math.max(0, productTokens.length - queryTokens.length - 3);
  score -= noise * 3;

  return Math.max(0, Math.min(130, score));  // top 130 כדי לאפשר בונוסים
}


/**
 * שימוש באינדקס לצמצום מרחב החיפוש.
 * מחזיר Set של אינדקסים מועמדים, או null אם האינדקס לא זמין.
 *
 * אסטרטגיה: איחוד (UNION) של רשימות הטוקנים - לא חיתוך.
 * זה כי scoreMatch נותן ציון חלקי גם להתאמת prefix/substring,
 * אז מוצר שיש בו רק חלק מהטוקנים עדיין יכול להיות רלוונטי.
 */
function getCandidateIndices(queryTokens, chain, index) {
  if (!index) return null;

  const candidates = new Set();
  let foundAny = false;

  for (const qt of queryTokens) {
    if (qt.length < INDEX_MIN_TOKEN_LEN) continue;

    // חיפוש מדויק
    const exactList = index[qt]?.[chain];
    if (exactList) {
      foundAny = true;
      for (const idx of exactList) candidates.add(idx);
      continue;
    }

    // חיפוש prefix - עובר על המפתחות באינדקס
    if (qt.length >= 3) {
      for (const indexedToken in index) {
        if (indexedToken.startsWith(qt)) {
          const list = index[indexedToken]?.[chain];
          if (list) {
            foundAny = true;
            for (const idx of list) candidates.add(idx);
          }
        }
      }
    }
  }

  return foundAny ? candidates : null;
}


/**
 * findBestMatch v4.1
 *
 * שיפורים:
 *   1. לקוויארי קצר (≤2 טוקנים) - דרישת all-tokens-must-match.
 *      "בשר טחון" לא יחזיר "כורכום טחון" כי "בשר" לא מופיע.
 *   2. בודק כל מועמד דרך scoreMatch ובוחר מקסימום ציון.
 *   3. סף ציון 65 (היה 40) - דורש התאמה ממשית.
 */
function findBestMatch(query, products, chain, index) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return null;

  const isStrictMode = queryTokens.length <= STRICT_MATCH_MAX_QUERY_TOKENS;

  let best = null;
  let bestScore = 0;

  // ניסיון 1: דרך האינדקס
  const candidates = getCandidateIndices(queryTokens, chain, index);
  const iterable = candidates !== null
    ? Array.from(candidates).map(idx => products[idx]).filter(Boolean)
    : products;

  for (const p of iterable) {
    // 🛡️ Strict mode: לקוויארי קצר, חובה שכל הטוקנים יופיעו
    if (isStrictMode && !allQueryTokensFound(queryTokens, p.tokens)) {
      continue;
    }

    const score = scoreMatch(queryTokens, p.tokens);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (!best || bestScore < MATCH_MIN_SCORE) return null;
  return { product: best, score: bestScore };
}


/**
 * בודקת שכל הטוקנים מ-query מופיעים (exact/prefix/substring) בטוקני המוצר.
 * משמש למצב strict (קוויארי קצר).
 */
function allQueryTokensFound(queryTokens, productTokens) {
  for (const qt of queryTokens) {
    let found = false;
    for (const pt of productTokens) {
      if (tokenMatchScore(qt, pt) > 0) {
        found = true;
        break;
      }
    }
    if (!found) return false;
  }
  return true;
}


/**
 * חיפוש תוצאות מרובות (עבור autocomplete).
 * מיישם את אותם שיפורים: strict mode + סף 65.
 */
function searchAcrossChains(query, allData, index, limit) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const isStrictMode = queryTokens.length <= STRICT_MATCH_MAX_QUERY_TOKENS;
  const candidates = [];

  for (const chain of CHAINS) {
    const products = allData[chain] || [];
    const indexCandidates = getCandidateIndices(queryTokens, chain, index);

    const iterable = indexCandidates !== null
      ? Array.from(indexCandidates).map(idx => products[idx]).filter(Boolean)
      : products;

    for (const p of iterable) {
      if (isStrictMode && !allQueryTokensFound(queryTokens, p.tokens)) {
        continue;
      }
      const score = scoreMatch(queryTokens, p.tokens);
      if (score >= MATCH_MIN_SCORE) {
        candidates.push({ product: p, chain, score });
      }
    }
  }

  // מיזוג לפי שם מוצר נורמלי
  const merged = new Map();
  for (const c of candidates) {
    const key = normalize(c.product.name);
    if (!merged.has(key)) {
      merged.set(key, {
        name:   c.product.name,
        score:  c.score,
        chains: [],
      });
    }
    const entry = merged.get(key);
    entry.chains.push(c.chain);
    if (c.score > entry.score) entry.score = c.score;
  }

  const results = Array.from(merged.values());
  results.sort((a, b) => {
    const aRank = a.score + a.chains.length * 5;
    const bRank = b.score + b.chains.length * 5;
    return bRank - aRank;
  });

  return results.slice(0, limit);
}


// ============================================================================
// Handlers
// ============================================================================

async function handleHealth(env) {
  try {
    const cache = await loadPrices(env);
    const counts = {};
    for (const chain of CHAINS) {
      counts[chain] = (cache.data[chain] || []).length;
    }
    const totalProducts = Object.values(counts).reduce((a, b) => a + b, 0);
    const indexTokens = cache.index ? Object.keys(cache.index).length : 0;

    return jsonResponse({
      status: 'ok',
      version: '4.1.0',
      kv: totalProducts > 0 ? 'has data' : 'empty',
      counts,
      total: totalProducts,
      index: {
        loaded: cache.index !== null,
        tokens: indexTokens,
      },
      meta: cache.meta,
      cache_age_seconds: Math.floor((Date.now() - memCache.loadedAt) / 1000),
    });
  } catch (err) {
    return jsonResponse({ status: 'error', message: err.message }, 500);
  }
}


async function handleSearch(request, env) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const limitRaw = parseInt(url.searchParams.get('limit') || SEARCH_DEFAULT_LIMIT, 10);
  const limit = Math.min(Math.max(1, limitRaw), SEARCH_MAX_LIMIT);

  if (query.length < 2) {
    return jsonResponse({ results: [] });
  }

  const cache = await loadPrices(env);
  const results = searchAcrossChains(query, cache.data, cache.index, limit);

  return jsonResponse({ query, results });
}


async function handleCartPrice(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON' }, 400);
  }

  const items = Array.isArray(body?.items) ? body.items : [];
  if (items.length === 0) {
    return jsonResponse({ error: 'No items provided' }, 400);
  }

  const cache = await loadPrices(env);

  const results = items.map(item => {
    const query = String(item.name || '');
    const quantity = Number(item.quantity) || 1;

    const perChain = {};
    for (const chain of CHAINS) {
      const match = findBestMatch(query, cache.data[chain] || [], chain, cache.index);
      if (match) {
        perChain[chain] = {
          found:    true,
          name:     match.product.name,
          price:    match.product.price,
          subtotal: Number((match.product.price * quantity).toFixed(2)),
          barcode:  match.product.barcode,
          score:    match.score,
        };
      } else {
        perChain[chain] = { found: false };
      }
    }

    return {
      query:    query,
      quantity: quantity,
      unit:     item.unit || 'יחידה',
      chains:   perChain,
    };
  });

  // סיכום סל לכל רשת
  const summary = {};
  for (const chain of CHAINS) {
    let total = 0;
    let foundCount = 0;
    let missingCount = 0;

    for (const r of results) {
      const cp = r.chains[chain];
      if (cp.found) {
        total += cp.subtotal;
        foundCount += 1;
      } else {
        missingCount += 1;
      }
    }

    summary[chain] = {
      name:          CHAIN_NAMES[chain],
      total:         Number(total.toFixed(2)),
      found_items:   foundCount,
      missing_items: missingCount,
      complete:      missingCount === 0,
    };
  }

  // מציאת הזולה ביותר (רק בין רשתות שמצאו הכל)
  const complete = Object.entries(summary).filter(([, s]) => s.complete);
  let cheapest = null;
  if (complete.length > 0) {
    complete.sort(([, a], [, b]) => a.total - b.total);
    cheapest = complete[0][0];
  }

  return jsonResponse({
    items: results,
    summary,
    cheapest,
    total_items: items.length,
  });
}


// ============================================================================
// Utilities
// ============================================================================

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  });
}

function handleCors() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

function notFound() {
  return jsonResponse({ error: 'Not found' }, 404);
}


// ============================================================================
// Router
// ============================================================================

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return handleCors();
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/health' && request.method === 'GET') {
        return await handleHealth(env);
      }

      if (path === '/api/search' && request.method === 'GET') {
        return await handleSearch(request, env);
      }

      if (path === '/api/cart/price' && request.method === 'POST') {
        return await handleCartPrice(request, env);
      }

      if (path === '/' && request.method === 'GET') {
        return jsonResponse({
          service: 'runprice',
          version: '4.1.0',
          endpoints: [
            'GET  /api/health',
            'GET  /api/search?q=X&limit=10',
            'POST /api/cart/price',
          ],
        });
      }

      return notFound();

    } catch (err) {
      return jsonResponse({
        error: 'Internal server error',
        message: err.message,
      }, 500);
    }
  },
};
