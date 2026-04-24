/**
 * ============================================================================
 * api.js - שכבת התקשורת עם ה-Cloudflare Worker (v2)
 * ============================================================================
 *
 * זה ה-"Adapter" בין ה-Worker לפרונט. ה-Worker מחזיר פורמט שונה
 * ממה שהרכיבים באפליקציה מצפים לו - אז הקובץ הזה עושה את התרגום.
 *
 * יתרון: שום קובץ אחר (autocomplete, cart, main-ui) לא צריך להשתנות.
 *
 * API ציבורי (יציב, אין לשנות):
 *   API.searchProducts(query)              → [{ id, name, category, unit, chains, ... }]
 *   API.computeCart(items, chains)         → { chains: { shufersal: {...}, ... } }
 *   API.getProductPrice(name)              → { prices: {...}, stats: {...} }
 *   API.getVariants(productName)           → [{ id, name, ... }]   (compat shim)
 *   API.health()                           → { status, kv, counts, ... }
 *   API.clearCache()
 * ============================================================================
 */

import { WORKERS } from './config.js?v=2';
import { categorize, detectUnit } from './products.js?v=1';


// ============================================================================
// הגדרות
// ============================================================================

const WORKER_URL = WORKERS.main;
const REQUEST_TIMEOUT_MS = 10000;    // 10 שניות
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 דקות


// ============================================================================
// Cache פנימי - Map עם TTL
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

  // ניקוי cache ישן אם גדל מדי
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
// מחלקת שגיאה מותאמת
// ============================================================================

class APIError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'APIError';
    this.code = code;        // 'offline' | 'timeout' | 'network' | 'http'
    this.status = status;
  }
}


// ============================================================================
// ביצוע קריאה ל-Worker (גנרי)
// ============================================================================

async function request(path, options = {}) {
  const { method = 'GET', body = null, useCache = true, cacheParams = null } = options;
  const url = WORKER_URL + path;

  // בדיקת cache
  const key = useCache ? cacheKey(path, cacheParams) : null;
  if (key) {
    const cached = getCached(key);
    if (cached) return cached;
  }

  // בדיקת אינטרנט
  if (!navigator.onLine) {
    throw new APIError('offline', 'אין חיבור לאינטרנט');
  }

  // קריאה עם timeout
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
// Helpers - תרגום תוצאות מ-Worker לפורמט של ה-frontend
// ============================================================================

/**
 * הופך תוצאת חיפוש בודדת לפורמט שהפרונט מצפה לו.
 * ה-Worker מחזיר: { name, score, chains: [...] }
 * הפרונט מצפה ל:  { id, name, baseName, category, unit, avgPrice, chains }
 */
function normalizeSearchResult(result, index) {
  const name = result.name || '';
  const uniqueChains = Array.from(new Set(result.chains || [])); // הסרת כפילויות

  return {
    id:        `srv-${index}-${Date.now()}`,  // מזהה זמני לפרונט
    name:      name,
    baseName:  name,
    variant:   null,
    brand:     null,
    category:  categorize(name),
    unit:      detectUnit(name),
    avgPrice:  null,           // לא יודעים עד חישוב - הפרונט יודע להתמודד
    chains:    uniqueChains,   // אילו רשתות מחזיקות את המוצר
    score:     result.score,
  };
}


/**
 * הופך תוצאת "חישוב סל" של ה-Worker לפורמט הישן של הפרונט.
 * ה-Worker מחזיר: { items: [...], summary: {...}, cheapest }
 * הפרונט (cart.js) מצפה ל: { chains: { shufersal: { name, total, items, unknownItems } } }
 */
function normalizeCartResult(workerResult) {
  const { items = [], summary = {}, cheapest = null } = workerResult;
  const chains = {};

  // אתחול כל הרשתות
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

  // הזנת פרטי המוצרים לכל רשת
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
   * חיפוש מוצרים להשלמה אוטומטית.
   * @param {string} query - מה שהמשתמש הקליד
   * @returns {Promise<Array>} רשימת הצעות עם קטגוריה ויחידה
   */
  async searchProducts(query) {
    const q = (query || '').trim();
    if (q.length < 2) return [];

    try {
      const params = new URLSearchParams({ q, limit: '10' });
      const data = await request(`/api/search?${params}`, {
        method: 'GET',
        useCache: true,
        cacheParams: { q, limit: 10 },
      });

      const results = Array.isArray(data.results) ? data.results : [];
      return results.map(normalizeSearchResult);

    } catch (err) {
      console.warn('searchProducts failed:', err.message);
      return [];
    }
  },


  /**
   * חישוב מחיר סל בכל הרשתות (batch עם fuzzy matching).
   * @param {Array} items - [{ name, quantity, unit, specificProductId }]
   * @param {Array} chains - רשימת מזהי רשתות (כרגע לא בשימוש - ה-Worker מחזיר הכל)
   * @returns {Promise<{chains: Object, cheapest: string|null}>}
   */
  async computeCart(items, chains = []) {
    if (!items || items.length === 0) {
      return { chains: {}, cheapest: null };
    }

    try {
      // הכנת payload ב-format של ה-Worker החדש
      const payload = {
        items: items.map(item => ({
          name:     item.name,
          quantity: item.quantity || 1,
          unit:     item.unit || 'units',
        })),
      };

      const data = await request('/api/cart/price', {
        method: 'POST',
        body: payload,
        useCache: false,   // חישוב סל לא ב-cache
      });

      return normalizeCartResult(data);

    } catch (err) {
      console.error('computeCart failed:', err.message);
      throw err;
    }
  },


  /**
   * קבלת מחיר מוצר בודד בכל הרשתות (לאייקון ₪).
   * @param {string} name - שם המוצר
   * @returns {Promise<Object>} - { prices: {chainId: {found, chain_name, name, price}}, stats }
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
   * Compatibility shim - ה-Worker החדש לא מספק variants נפרד.
   * פשוט מחזיר תוצאות search שזה אותו דבר בפועל.
   */
  async getVariants(productName) {
    if (!productName) return [];
    return this.searchProducts(productName);
  },


  /**
   * בדיקת חיות של ה-Worker
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
   * מידע על ה-cache (לדיבוג)
   */
  getCacheStats() {
    return {
      size: cache.size,
      entries: Array.from(cache.keys()),
    };
  },
};


// ============================================================================
// חשיפה לדיבוג - אפשר מה-console: __api.searchProducts("חלב")
// ============================================================================

if (typeof window !== 'undefined') {
  window.__api = API;
}
