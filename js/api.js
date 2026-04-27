/**
 * ============================================================================
 * api.js - שכבת התקשורת עם ה-Cloudflare Worker (v3 - Hybrid)
 * ============================================================================
 *
 * אסטרטגיה היברידית לחסכון בקריאות Worker:
 *   1. מילון מקומי (popular-products.js) - 90% מהמקרים, מיידי, חינם
 *   2. Worker (KV) - 10% נשארים, fallback למוצרים נדירים
 *
 * זרימה:
 *   user types "חלב"
 *      ↓
 *   searchPopular()  →  7 וריאציות נמצאו
 *      ↓
 *   return (לא קוראים ל-Worker בכלל)
 *
 *   user types "ראבנקלון" (משהו נדיר)
 *      ↓
 *   searchPopular()  →  0 תוצאות
 *      ↓
 *   ל-Worker          →  3 תוצאות מ-KV
 *      ↓
 *   return
 *
 * API ציבורי (יציב):
 *   API.searchProducts(query)
 *   API.computeCart(items, chains)
 *   API.getProductPrice(name)
 *   API.getVariants(productName)
 *   API.health()
 *   API.clearCache()
 * ============================================================================
 */

import { WORKERS } from './config.js?v=2';
import { categorize, detectUnit } from './products.js?v=1';
import { searchPopular } from './popular-products.js?v=1';


// ============================================================================
// הגדרות
// ============================================================================

const WORKER_URL = WORKERS.main;
const REQUEST_TIMEOUT_MS = 10000;
const CACHE_TTL_MS = 5 * 60 * 1000;

// סף מינימלי לתוצאות מהמילון לפני שמוותרים על Worker
const POPULAR_MIN_RESULTS = 3;


// ============================================================================
// Cache פנימי
// ============================================================================

const cache = new Map();

function cacheKey(endpoint, params) {
  return `${endpoint}::${JSON.stringify(params || {})}`;
}

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  cache.set(key, { data, timestamp: Date.now() });

  if (cache.size > 100) {
    const now = Date.now();
    for (const [k, v] of cache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) {
        cache.delete(k);
      }
    }
  }
}

function clearAllCache() {
  cache.clear();
}


// ============================================================================
// מחלקת שגיאה
// ============================================================================

class APIError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'APIError';
    this.code = code;
    this.status = status;
  }
}


// ============================================================================
// קריאה ל-Worker
// ============================================================================

async function request(path, options = {}) {
  const { method = 'GET', body = null, useCache = true, cacheParams = null } = options;
  const url = WORKER_URL + path;

  const key = useCache ? cacheKey(path, cacheParams) : null;
  if (key) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  if (!navigator.onLine) {
    throw new APIError('offline', 'אין חיבור לאינטרנט');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const fetchOptions = {
      method,
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
    };
    if (body) fetchOptions.body = JSON.stringify(body);

    const response = await fetch(url, fetchOptions);
    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMsg = `שגיאת שרת (${response.status})`;
      try {
        const errData = await response.json();
        errorMsg = errData.error || errorMsg;
      } catch (e) { /* ignore */ }
      throw new APIError('http', errorMsg, response.status);
    }

    const data = await response.json();
    if (key) setCached(key, data);
    return data;

  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      throw new APIError('timeout', 'הבקשה לקחה יותר מדי זמן');
    }
    if (err instanceof APIError) throw err;
    throw new APIError('network', err.message || 'שגיאת רשת');
  }
}


// ============================================================================
// תרגום פורמטים
// ============================================================================

function normalizeWorkerResult(result, index) {
  const name = result.name || '';
  const uniqueChains = Array.from(new Set(result.chains || []));

  return {
    id:        `srv-${index}-${Date.now()}`,
    name:      name,
    baseName:  name,
    variant:   null,
    brand:     null,
    category:  categorize(name),
    unit:      detectUnit(name),
    avgPrice:  null,
    chains:    uniqueChains,
    score:     result.score,
    source:    'worker',
  };
}


function normalizePopularResult(result, index) {
  return {
    id:        `pop-${index}`,
    name:      result.name,
    baseName:  result.baseName,
    variant:   null,
    brand:     result.brand,
    category:  result.category,
    unit:      result.unit,
    avgPrice:  null,
    chains:    [],
    source:    'popular',
  };
}


function normalizeCartResult(workerResult) {
  const { items = [], summary = {}, cheapest = null } = workerResult;
  const chains = {};

  for (const [chainId, chainSummary] of Object.entries(summary)) {
    chains[chainId] = {
      name:         chainSummary.name,
      total:        chainSummary.total,
      itemCount:    chainSummary.found_items,
      items:        [],
      unknownItems: [],
      complete:     chainSummary.complete,
      isCheapest:   chainId === cheapest,
    };
  }

  for (const item of items) {
    const { query, quantity, unit, chains: itemChains = {} } = item;

    for (const [chainId, chainItemInfo] of Object.entries(itemChains)) {
      if (!chains[chainId]) continue;

      if (chainItemInfo.found) {
        chains[chainId].items.push({
          id:        chainItemInfo.barcode,
          name:      chainItemInfo.name,
          quantity:  quantity,
          unit:      unit,
          unitPrice: chainItemInfo.price,
          total:     chainItemInfo.subtotal,
        });
      } else {
        chains[chainId].unknownItems.push({
          name:     query,
          quantity: quantity,
        });
      }
    }
  }

  return { chains, cheapest };
}


// ============================================================================
// API ציבורי
// ============================================================================

export const API = {

  /**
   * חיפוש מוצרים - היברידי.
   * 1. מילון מקומי (חינם, מיידי)
   * 2. Worker fallback אם פחות מ-3 תוצאות
   */
  async searchProducts(query) {
    const q = (query || '').trim();
    if (q.length < 1) return [];

    // שלב 1: מילון מקומי
    const popularResults = searchPopular(q, 10);
    const fromPopular = popularResults.map(normalizePopularResult);

    // אם יש מספיק - חוזרים מיד (לא קוראים ל-Worker)
    if (fromPopular.length >= POPULAR_MIN_RESULTS) {
      return fromPopular;
    }

    // שלב 2: השלמה מ-Worker
    let fromWorker = [];
    try {
      const params = new URLSearchParams({ q, limit: '10' });
      const data = await request(`/api/search?${params}`, {
        method: 'GET',
        useCache: true,
        cacheParams: { q, limit: 10 },
      });
      const results = Array.isArray(data.results) ? data.results : [];
      fromWorker = results.map(normalizeWorkerResult);
    } catch (err) {
      console.warn('Worker search failed, returning popular only:', err.message);
    }

    // מיזוג עם הסרת כפילויות
    const seen = new Set(fromPopular.map(r => r.name.toLowerCase()));
    const uniqueWorker = fromWorker.filter(r => {
      const key = r.name.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    return [...fromPopular, ...uniqueWorker].slice(0, 10);
  },


  /**
   * חישוב סל (batch).
   */
  async computeCart(items, chains = []) {
    if (!items || items.length === 0) {
      return { chains: {}, cheapest: null };
    }

    try {
      const payload = {
        items: items.map(item => ({
          name:         item.name,
          quantity:     item.quantity || 1,
          unit:         item.unit || 'units',
          searchTerms:  Array.isArray(item.searchTerms)  ? item.searchTerms  : [],
          excludeTerms: Array.isArray(item.excludeTerms) ? item.excludeTerms : [],
        })),
      };

      const data = await request('/api/cart/price', {
        method: 'POST',
        body: payload,
        useCache: false,
      });

      return normalizeCartResult(data);

    } catch (err) {
      console.error('computeCart failed:', err.message);
      throw err;
    }
  },


  /**
   * מחיר מוצר בודד (לאייקון ₪).
   */
  async getProductPrice(name) {
    const q = (name || '').trim();
    if (q.length < 2) {
      return { prices: {}, stats: {} };
    }

    try {
      const params = new URLSearchParams({ name: q });
      const data = await request(`/api/product/price?${params}`, {
        method: 'GET',
        useCache: true,
        cacheParams: { name: q },
      });

      return {
        prices: data.prices || {},
        stats:  data.stats || {},
      };

    } catch (err) {
      console.warn('getProductPrice failed:', err.message);
      return { prices: {}, stats: {}, error: err.message };
    }
  },


  /**
   * Compatibility shim
   */
  async getVariants(productName) {
    if (!productName) return [];
    return this.searchProducts(productName);
  },


  /**
   * בדיקת חיות
   */
  async health() {
    try {
      const data = await request('/api/health', {
        method: 'GET',
        useCache: false,
      });
      return data;
    } catch (err) {
      return { status: 'error', message: err.message };
    }
  },


  /**
   * ניקוי cache
   */
  clearCache() {
    clearAllCache();
  },


  /**
   * דיבוג
   */
  getCacheStats() {
    return {
      size: cache.size,
      entries: Array.from(cache.keys()),
    };
  },
};


// ============================================================================
// חשיפה לדיבוג
// ============================================================================

if (typeof window !== 'undefined') {
  window.__api = API;
}
