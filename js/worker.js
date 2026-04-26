/**
 * ============================================================================
 * Cloudflare Worker - runprice (v3 - Lazy Loading)
 * ============================================================================
 *
 * שינוי מרכזי מ-v2:
 *   במקום לטעון את כל ה-5 רשתות בכל קריאה (50MB+ זיכרון = קריסה),
 *   טוענים רשת אחת בכל פעם, מעבדים אותה, ומעבירים הלאה.
 *
 *   כל רשת ב-cache נפרד עם TTL של 10 דקות.
 *   העיבוד של כל רשת קורה במקביל (Promise.all) - מהירות נשמרת.
 *
 * Endpoints (לא השתנו):
 *   1. GET  /api/health
 *   2. GET  /api/search?q=X&limit=10
 *   3. POST /api/cart/price
 *   4. GET  /api/product/price?name=X
 *
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
const MATCH_MIN_SCORE = 40;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age':       '86400',
};


// ============================================================================
// Cache בזיכרון - אחד לכל רשת בנפרד
// ============================================================================

const chainCache = new Map();
let metaCache = null;
let metaLoadedAt = 0;


/**
 * טוען רשת אחת מ-KV. עם cache נפרד.
 */
async function loadChain(chain, env) {
  const now = Date.now();
  const cached = chainCache.get(chain);

  if (cached && (now - cached.loadedAt) < CACHE_TTL_MS) {
    return cached.products;
  }

  const raw = await env.SALI_PRICES.get(`prices:${chain}`, { type: 'json' });
  const products = raw ? objectToProductList(raw) : [];

  chainCache.set(chain, { products, loadedAt: now });
  return products;
}


/**
 * טוען מטא-דאטה (פעם אחת ב-cache)
 */
async function loadMeta(env) {
  const now = Date.now();
  if (metaCache && (now - metaLoadedAt) < CACHE_TTL_MS) {
    return metaCache;
  }
  metaCache = await env.SALI_PRICES.get('meta:sync', { type: 'json' });
  metaLoadedAt = now;
  return metaCache;
}


/**
 * המרת מבנה KV לרשימה מוכנה לחיפוש.
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
// Normalization & Matching
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


/**
 * ציון התאמה (0-100) משופר - מילה ראשונה במוצר במשקל גבוה.
 */
function scoreMatch(queryTokens, productTokens) {
  if (queryTokens.length === 0 || productTokens.length === 0) return 0;

  let score = 0;
  let exactMatches = 0;

  for (const qt of queryTokens) {
    let bestForToken = 0;

    for (let i = 0; i < productTokens.length; i++) {
      const pt = productTokens[i];
      const positionWeight = i === 0 ? 1.0 : (i === 1 ? 0.85 : 0.7);

      let tokenScore = 0;
      if (pt === qt) {
        tokenScore = 100 * positionWeight;
        if (i === 0) exactMatches++;
      } else if (pt.startsWith(qt) && qt.length >= 2) {
        tokenScore = 80 * positionWeight;
      } else if (qt.startsWith(pt) && pt.length >= 3) {
        tokenScore = 60 * positionWeight;
      } else if (pt.includes(qt) && qt.length >= 3) {
        tokenScore = 40 * positionWeight;
      }

      if (tokenScore > bestForToken) bestForToken = tokenScore;
    }

    score += bestForToken;
  }

  score = score / queryTokens.length;

  if (exactMatches === queryTokens.length) {
    score += 10;
  }

  const noise = Math.max(0, productTokens.length - queryTokens.length - 2);
  score -= noise * 3;

  return Math.max(0, Math.min(100, Math.round(score)));
}


function findBestMatch(query, products) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const p of products) {
    const score = scoreMatch(queryTokens, p.tokens);
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }

  if (!best || bestScore < MATCH_MIN_SCORE) return null;
  return { product: best, score: bestScore };
}


function searchInChain(query, products, limit) {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return [];

  const candidates = [];
  for (const p of products) {
    const score = scoreMatch(queryTokens, p.tokens);
    if (score >= MATCH_MIN_SCORE) {
      candidates.push({ product: p, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}


// ============================================================================
// Handlers
// ============================================================================

/**
 * GET /api/health - טוען רק meta, לא טוען מוצרים!
 */
async function handleHealth(env) {
  try {
    const meta = await loadMeta(env);

    const counts = {};
    let total = 0;
    if (meta && meta.chains) {
      for (const chain of CHAINS) {
        const n = meta.chains[chain]?.products || 0;
        counts[chain] = n;
        total += n;
      }
    }

    return jsonResponse({
      status: 'ok',
      kv: total > 0 ? 'has data' : 'empty',
      counts,
      total,
      meta,
      cache_chains_loaded: chainCache.size,
    });
  } catch (err) {
    return jsonResponse({
      status: 'error',
      message: err.message,
    }, 500);
  }
}


/**
 * GET /api/search - lazy loading per chain
 */
async function handleSearch(request, env) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('q') || '').trim();
  const limitRaw = parseInt(url.searchParams.get('limit') || SEARCH_DEFAULT_LIMIT, 10);
  const limit = Math.min(Math.max(1, limitRaw), SEARCH_MAX_LIMIT);

  if (query.length < 2) {
    return jsonResponse({ results: [] });
  }

  const perChainPromises = CHAINS.map(async (chain) => {
    const products = await loadChain(chain, env);
    const matches = searchInChain(query, products, limit);
    return { chain, matches };
  });

  const perChainResults = await Promise.all(perChainPromises);

  const merged = new Map();
  for (const { chain, matches } of perChainResults) {
    for (const m of matches) {
      const key = normalize(m.product.name);
      if (!merged.has(key)) {
        merged.set(key, {
          name:   m.product.name,
          score:  m.score,
          chains: new Set(),
        });
      }
      const entry = merged.get(key);
      entry.chains.add(chain);
      if (m.score > entry.score) entry.score = m.score;
    }
  }

  const results = Array.from(merged.values()).map(r => ({
    name:   r.name,
    score:  r.score,
    chains: Array.from(r.chains),
  }));

  results.sort((a, b) => {
    const aRank = a.score + a.chains.length * 5;
    const bRank = b.score + b.chains.length * 5;
    return bRank - aRank;
  });

  return jsonResponse({ query, results: results.slice(0, limit) });
}


/**
 * POST /api/cart/price - lazy loading
 */
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

  const perChainPromises = CHAINS.map(async (chain) => {
    const products = await loadChain(chain, env);
    const itemMatches = items.map(item => {
      const query = String(item.name || '');
      const match = findBestMatch(query, products);
      if (match) {
        return {
          found:    true,
          name:     match.product.name,
          price:    match.product.price,
          subtotal: Number((match.product.price * (Number(item.quantity) || 1)).toFixed(2)),
          barcode:  match.product.barcode,
          score:    match.score,
        };
      }
      return { found: false };
    });
    return { chain, itemMatches };
  });

  const perChainResults = await Promise.all(perChainPromises);

  const results = items.map((item, idx) => {
    const perChain = {};
    for (const { chain, itemMatches } of perChainResults) {
      perChain[chain] = itemMatches[idx];
    }
    return {
      query:    String(item.name || ''),
      quantity: Number(item.quantity) || 1,
      unit:     item.unit || 'יחידה',
      chains:   perChain,
    };
  });

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
    items:       results,
    summary,
    cheapest,
    total_items: items.length,
  });
}


/**
 * GET /api/product/price - lazy loading
 */
async function handleProductPrice(request, env) {
  const url = new URL(request.url);
  const query = (url.searchParams.get('name') || '').trim();

  if (query.length < 2) {
    return jsonResponse({ error: 'Name too short' }, 400);
  }

  const perChainPromises = CHAINS.map(async (chain) => {
    const products = await loadChain(chain, env);
    const match = findBestMatch(query, products);
    return { chain, match };
  });

  const perChainResults = await Promise.all(perChainPromises);

  const prices = {};
  const foundPrices = [];
  for (const { chain, match } of perChainResults) {
    if (match) {
      prices[chain] = {
        found:      true,
        chain_name: CHAIN_NAMES[chain],
        name:       match.product.name,
        price:      match.product.price,
        barcode:    match.product.barcode,
      };
      foundPrices.push(match.product.price);
    } else {
      prices[chain] = {
        found:      false,
        chain_name: CHAIN_NAMES[chain],
      };
    }
  }

  const avg = foundPrices.length > 0
    ? Number((foundPrices.reduce((a, b) => a + b, 0) / foundPrices.length).toFixed(2))
    : null;
  const min = foundPrices.length > 0 ? Math.min(...foundPrices) : null;
  const max = foundPrices.length > 0 ? Math.max(...foundPrices) : null;

  return jsonResponse({
    query,
    prices,
    stats: {
      average:      avg,
      min,
      max,
      chains_found: foundPrices.length,
    },
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

      if (path === '/api/product/price' && request.method === 'GET') {
        return await handleProductPrice(request, env);
      }

      if (path === '/' && request.method === 'GET') {
        return jsonResponse({
          service: 'runprice',
          version: '3.0.0',
          architecture: 'lazy-loading per chain',
          endpoints: [
            'GET  /api/health',
            'GET  /api/search?q=X&limit=10',
            'POST /api/cart/price',
            'GET  /api/product/price?name=X',
          ],
        });
      }

      return notFound();

    } catch (err) {
      return jsonResponse({
        error:   'Internal server error',
        message: err.message,
      }, 500);
    }
  },
};
