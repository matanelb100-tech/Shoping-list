/**
 * ============================================================================
 * api.js - שכבת התקשורת עם ה-Cloudflare Worker
 * ============================================================================
 *
 * כל הקריאות לשרת עוברות דרך הקובץ הזה.
 * יתרונות:
 *   - Cache חכם - מונע קריאות כפולות
 *   - Timeout - תגובה מהירה גם אם השרת איטי
 *   - טיפול במצב offline
 *   - נקודה אחת לתיקון אם ה-API ישתנה
 *
 * API:
 *   API.searchProducts(query)       → [{ id, name, category, ... }]
 *   API.getVariants(productName)    → [{ id, name, brand, ... }]
 *   API.computeCart(items, chains)  → { shufersal: {...}, ... }
 *   API.health()                    → { status: 'ok', ... }
 * ============================================================================
 */

import { WORKERS, API_ENDPOINTS } from './config.js?v=2';


// ============================================================================
// הגדרות
// ============================================================================

const WORKER_URL = WORKERS.main;
const REQUEST_TIMEOUT_MS = 8000;     // 8 שניות - אחרי זה ביטול
const CACHE_TTL_MS = 5 * 60 * 1000;  // 5 דקות - cache לחיפושים


// ============================================================================
// Cache פנימי - Map עם TTL
// ============================================================================

const cache = new Map();

function cacheKey(endpoint, payload) {
  return `${endpoint}::${JSON.stringify(payload)}`;
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

function clearCache() {
  cache.clear();
}


// ============================================================================
// ביצוע קריאה ל-Worker
// ============================================================================

async function workerRequest(endpoint, payload = null, options = {}) {
  const { method = 'POST', useCache = true } = options;
  const url = WORKER_URL + endpoint;

  // בדיקת cache
  if (useCache && payload) {
    const key = cacheKey(endpoint, payload);
    const cached = getCached(key);
    if (cached) {
      return cached;
    }
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

    if (payload && method !== 'GET') {
      fetchOptions.body = JSON.stringify(payload);
    }

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

    // שמירה ב-cache (אם רלוונטי)
    if (useCache && payload) {
      setCached(cacheKey(endpoint, payload), data);
    }

    return data;

  } catch (err) {
    clearTimeout(timeoutId);

    if (err.name === 'AbortError') {
      throw new APIError('timeout', 'הבקשה לקחה יותר מדי זמן');
    }

    if (err instanceof APIError) {
      throw err;
    }

    // שגיאת רשת כללית
    throw new APIError('network', err.message || 'שגיאת רשת');
  }
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
// API ציבורי
// ============================================================================

export const API = {

  /**
   * חיפוש מוצרים להשלמה אוטומטית
   * @param {string} query - מה שהמשתמש הקליד (למשל "חל")
   * @returns {Promise<Array>} רשימת הצעות
   */
  async searchProducts(query) {
    if (!query || query.trim().length === 0) return [];

    try {
      const data = await workerRequest(API_ENDPOINTS.searchProducts, {
        query: query.trim(),
      });
      return data.suggestions || [];
    } catch (err) {
      console.warn('searchProducts failed:', err.message);
      return [];
    }
  },


  /**
   * קבלת וריאציות של מוצר (למשל "חלב" → כל סוגי החלב)
   * @param {string} productName
   * @returns {Promise<Array>}
   */
  async getVariants(productName) {
    if (!productName) return [];

    try {
      const data = await workerRequest(API_ENDPOINTS.getVariants, {
        productName: productName.trim(),
      });
      return data.variants || [];
    } catch (err) {
      console.warn('getVariants failed:', err.message);
      return [];
    }
  },


  /**
   * חישוב מחיר הסל בכל הרשתות
   * @param {Array} items - מערך מוצרים מהרשימה
   * @param {Array} chains - רשימת מזהי רשתות לבדיקה
   * @returns {Promise<object>}
   */
  async computeCart(items, chains = []) {
    if (!items || items.length === 0) {
      return { chains: {} };
    }

    try {
      const data = await workerRequest(
        API_ENDPOINTS.computeCart,
        { items, chains },
        { useCache: false }   // לא לעשות cache לחישוב סל
      );
      return data;
    } catch (err) {
      console.error('computeCart failed:', err.message);
      throw err;
    }
  },


  /**
   * בדיקת חיות של ה-Worker
   */
  async health() {
    try {
      const data = await workerRequest('/api/health', null, {
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
    clearCache();
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
// חשיפה לדיבוג
// ============================================================================

if (typeof window !== 'undefined') {
  window.__api = API;
}
