/**
 * ============================================================================
 * Cloudflare Worker - runprice (v4.2 - balanced matching)
 * ============================================================================
 *
 * אחראי על:
 *   1. GET  /api/health               → בדיקת תקינות + סטטוס KV
 *   2. GET  /api/search?q=X&limit=10  → autocomplete מהיר
 *   3. POST /api/cart/price           → חישוב סל שלם (batch + fuzzy)
 *
 * שינויים גרסה 4.2 - איזון בין v4.0 (רחב מדי) ל-v4.1 (קפדני מדי):
 *   - "Head Token" - הטוקן הראשי של ה-query (המילה הראשונה בעלת תוכן):
 *     "חלב 3% שומן" → head = "חלב"
 *     "בשר טחון"   → head = "בשר"
 *   - Head MUST appear in product (אחרת - לא תואם בכלל)
 *   - Modifiers (3%, שומן, קפואה) - לא חובה, אבל נותנים ציון גבוה יותר
 *   - ratio בריבוע 1.5 (במקום 2.0 שהיה קפדני מדי)
 *   - Head position penalty - אם head מופיע מאוחר במוצר, ענישה
 *   - Noise penalty חזק יותר (5 לכל טוקן רעש, היה 3)
 *   - MATCH_MIN_SCORE: 50 (היה 65 ב-v4.1, 40 ב-v4.0)
 *
 *   הבעיה שתוקנה: v4.1 בלוק תוצאות אמיתיות כמו "חלב תנובה 3%" כי לא היה
 *   טוקן "שומן". עכשיו "שומן" הוא modifier אופציונלי.
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

const CACHE_TTL_MS = 10 * 60 * 1000;
const SEARCH_DEFAULT_LIMIT = 10;
const SEARCH_MAX_LIMIT = 20;

// סף ציון מינימלי - 50 מאוזן (היה 40 ב-v4 - נמוך מדי, 65 ב-v4.1 - גבוה מדי)
const MATCH_MIN_SCORE = 50;

const INDEX_MIN_TOKEN_LEN = 2;

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
  data: null,
  index: null,
  loadedAt: 0,
  meta: null,
};


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
// Matching v4.2
// ============================================================================

/**
 * מחזירה ציון התאמה בין שני טוקנים:
 *   1.0 = זהה
 *   0.8 = prefix (qt באורך ≥2)
 *   0.5 = substring (qt באורך ≥3)
 *   0   = לא תואם
 */
function tokenMatchScore(qt, pt) {
  if (pt === qt) return 1.0;
  if (qt.length >= 2 && pt.startsWith(qt)) return 0.8;
  if (qt.length >= 3 && pt.includes(qt)) return 0.5;
  return 0;
}


/**
 * ה-Head Token = המילה הראשונה ב-query בעלת תוכן.
 * דולגים על מספרים טהורים ("3%", "1") ועל טוקנים מאוד קצרים.
 *
 * דוגמאות:
 *   "חלב 3% שומן"      → "חלב"
 *   "בשר טחון"         → "בשר"
 *   "אורז בסמטי 1 קג"  → "אורז"
 */
function getHeadToken(queryTokens) {
  for (const t of queryTokens) {
    if (t.length >= 2 && !/^\d+%?$/.test(t)) return t;
  }
  return queryTokens[0];
}


/**
 * בודקת אם ה-head token נמצא בטוקני המוצר, ומחזירה את המיקום.
 * מחזיר -1 אם לא נמצא.
 */
function findHeadPosition(headToken, productTokens) {
  for (let i = 0; i < productTokens.length; i++) {
    if (tokenMatchScore(headToken, productTokens[i]) > 0) return i;
  }
  return -1;
}


/**
 * scoreMatch v4.2 - ציון מאוזן.
 *
 * עקרונות:
 *   1. ratio של התאמה ^ 1.5 - מעניש על חוסר אבל לא דרסטי
 *      ratio=1.0 → 100, ratio=0.67 → 55, ratio=0.5 → 35
 *   2. בונוס 30 על fullMatch (כל הטוקנים נמצאו exact/prefix)
 *   3. בונוס 5 על סדר טוקנים נכון, +5 לכל טוקן ברצף
 *   4. ענישת מיקום head - אם head מופיע אחרי מיקום 1, -8 לכל מיקום
 *   5. ענישת רעש - 5 לכל טוקן עודף מעבר ל-(query+2)
 *
 * דוגמאות (מבדיקות אמיתיות):
 *   "בשר טחון" → "בשר בקר טחון 1 קג"           = 130 ✅
 *   "חלב 3% שומן" → "חלב תנובה 3% 1 ל"          = 59  ✅ (modifier "שומן" חסר אבל head ויחידות תואמים)
 *   "בשר טחון" → "כורכום טחון אורגני"           = 35  ❌ (head "בשר" לא מופיע)
 *   "אורז בסמטי" → "אורז פרסי 1 קג"              = 30  ❌ ("בסמטי" חסר וזה token חיוני)
 */
function scoreMatch(queryTokens, productTokens) {
  if (queryTokens.length === 0 || productTokens.length === 0) return 0;

  let totalMatchValue = 0;
  let exactOrStrong = 0;
  const matchedPositions = [];

  for (const qt of queryTokens) {
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

  const ratio = totalMatchValue / queryTokens.length;

  // ratio^1.5 - מעניש על חוסר אבל לא דרסטי כמו ratio^2
  let score = Math.round(Math.pow(ratio, 1.5) * 100);

  // בונוס Full Match - כל הטוקנים נמצאו exact או prefix
  if (exactOrStrong === queryTokens.length) {
    score += 30;
  }

  // בונוס סדר ורצף
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
    score += consecutive * 5;
  }

  // ענישת מיקום head - "head מאוחר" = head הוא modifier ולא ראש המוצר
  const headToken = getHeadToken(queryTokens);
  const headPos = findHeadPosition(headToken, productTokens);
  if (headPos > 1) {
    score -= (headPos - 1) * 8;
  }

  // ענישת רעש - מילים מיותרות במוצר
  const noise = Math.max(0, productTokens.length - queryTokens.length - 2);
  score -= noise * 5;

  return Math.max(0, Math.min(130, score));
}


/**
 * שימוש באינדקס לצמצום מרחב החיפוש.
 */
function getCandidateIndices(queryTokens, chain, index) {
  if (!index) return null;

  const candidates = new Set();
  let foundAny = false;

  for (const qt of queryTokens) {
    if (qt.length < INDEX_MIN_TOKEN_LEN) continue;

    const exactList = index[qt]?.[chain];
    if (exactList) {
      foundAny = true;
      for (const idx of exactList) candidates.add(idx);
      continue;
    }

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
 * findBestMatch v4.2
 *
 * דרישת hard requirement: head token חייב להיות בטוקני המוצר.
 * אם head לא נמצא - המוצר לא רלוונטי. נקודה.
 */
function findBestMatch(query, products, chain, index) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return null;

  const headToken = getHeadToken(queryTokens);

  let best = null;
  let bestScore = 0;

  const candidates = getCandidateIndices(queryTokens, chain, index);
  const iterable = candidates !== null
    ? Array.from(candidates).map(idx => products[idx]).filter(Boolean)
    : products;

  for (const p of iterable) {
    // 🛡️ דרישה קשיחה: head token חייב להופיע במוצר
    if (findHeadPosition(headToken, p.tokens) === -1) {
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
 * חיפוש תוצאות מרובות (autocomplete).
 */
function searchAcrossChains(query, allData, index, limit) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const headToken = getHeadToken(queryTokens);
  const candidates = [];

  for (const chain of CHAINS) {
    const products = allData[chain] || [];
    const indexCandidates = getCandidateIndices(queryTokens, chain, index);

    const iterable = indexCandidates !== null
      ? Array.from(indexCandidates).map(idx => products[idx]).filter(Boolean)
      : products;

    for (const p of iterable) {
      if (findHeadPosition(headToken, p.tokens) === -1) continue;
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
      version: '4.2.0',
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
          version: '4.2.0',
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
