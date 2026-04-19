/**
 * ============================================================================
 * app.js - האתחול הראשי של האפליקציה
 * ============================================================================
 *
 * זה הקובץ הראשון שרץ. תפקידו:
 *   1. לאתחל Firebase
 *   2. לטעון את המודולים הנדרשים
 *   3. לנתב בין מסכים (login / main / history)
 *   4. להאזין לארועי מערכת (online/offline, auth changes)
 *
 * כל קובץ חדש שיתווסף - יתחבר כאן.
 * ============================================================================
 */

import { FIREBASE_CONFIG, APP_VERSION, APP_NAME, validateConfig } from './config.js?v=2';
import { initAuth, showAuthScreen, resetAuthForm } from './auth.js?v=2';
import { State } from './state.js?v=1';
import { initMainUI, destroyMainUI, showMain } from './main-ui.js?v=1';


// ============================================================================
// משתנים גלובליים (ברמת האפליקציה)
// ============================================================================

let firebaseApp = null;
let firebaseAuth = null;
let firebaseFirestore = null;
let currentUser = null;


// ============================================================================
// אתחול Firebase
// ============================================================================

async function initFirebase() {
  try {
    // טעינת Firebase מ-CDN (v10 מודולרי)
    const { initializeApp } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
    );
    const { getAuth, onAuthStateChanged } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    const { getFirestore } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
    );

    // אתחול האפליקציה
    firebaseApp = initializeApp(FIREBASE_CONFIG);
    firebaseAuth = getAuth(firebaseApp);
    firebaseFirestore = getFirestore(firebaseApp);

    // הגדר התמשכות התחברות (משתמש יישאר מחובר עד שייצא)
    const { setPersistence, browserLocalPersistence } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    await setPersistence(firebaseAuth, browserLocalPersistence);

    // האזנה למצב המשתמש
    onAuthStateChanged(firebaseAuth, handleAuthStateChanged);

    console.log('✅ Firebase initialized:', FIREBASE_CONFIG.projectId);
    return true;

  } catch (error) {
    console.error('❌ Firebase init failed:', error);
    showFatalError('שגיאה בחיבור לשרת - נסה לרענן את העמוד');
    return false;
  }
}


// ============================================================================
// טיפול בשינוי מצב המשתמש
// ============================================================================

async function handleAuthStateChanged(user) {
  currentUser = user;

  if (user) {
    // משתמש מחובר - אתחול ה-State (טעינה מ-Firestore + גיבוי מקומי)
    console.log('👤 משתמש מחובר:', user.email);
    try {
      await State.init(firebaseAuth, firebaseFirestore);
      console.log('📦 State initialized. Items:', State.getItemCount());
    } catch (err) {
      console.error('State init failed:', err);
    }
    showMainScreen();
  } else {
    // משתמש לא מחובר - ניקוי state
    console.log('🚪 לא מחובר');
    await State.cleanup();
    showAuthScreen();
  }
}


// ============================================================================
// ארוע התחברות מוצלחת (נשלח מ-auth.js)
// ============================================================================

window.addEventListener('auth:success', (e) => {
  console.log('✅ התחברות הצליחה:', e.detail.email);
  showToast(`שלום ${e.detail.email.split('@')[0]}!`, 'success');
  // השאר - handleAuthStateChanged יתפוס את זה אוטומטית
});


// ============================================================================
// מסך ראשי - משתמש ב-main-ui.js
// ============================================================================

function showMainScreen() {
  showMain();         // מציג את המסך (screen-main.active)
  initMainUI();       // מאתחל/מעדכן את התוכן
}


// ============================================================================
// התנתקות
// ============================================================================

async function handleLogout() {
  try {
    const { signOut } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );

    // ניקוי המסך לפני ההתנתקות
    destroyMainUI();

    await signOut(firebaseAuth);
    resetAuthForm();
    showToast('התנתקת בהצלחה', 'success');
  } catch (error) {
    console.error('Logout error:', error);
    showToast('שגיאה בהתנתקות', 'error');
  }
}

// מאזין לבקשת יציאה מ-main-ui
window.addEventListener('app:logout-request', handleLogout);


// ============================================================================
// מערכת Toasts - זמנית עד שנכתוב את ui.js
// ============================================================================

function showToast(message, type = '') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast' + (type ? ` ${type}` : '');
  toast.textContent = message;
  container.appendChild(toast);

  // הסרה אוטומטית אחרי 3 שניות
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// חשיפה גלובלית כדי שמודולים אחרים יוכלו להשתמש (זמני)
window.showToast = showToast;


// ============================================================================
// שגיאה קריטית
// ============================================================================

function showFatalError(message) {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.innerHTML = `
      <div style="
        padding: 32px;
        text-align: center;
        max-width: 320px;
      ">
        <div style="
          width: 72px; height: 72px;
          border-radius: 50%;
          background: rgba(229, 115, 115, 0.15);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
        ">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#E57373" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/>
            <line x1="12" y1="8" x2="12" y2="12"/>
            <line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 style="margin: 0 0 8px 0; color: #2C3E50;">שגיאה</h2>
        <p style="color: #5A6C7D; font-size: 14px;">${escapeHtml(message)}</p>
        <button onclick="window.location.reload()" style="
          margin-top: 20px;
          background: #7BC4E2;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 12px;
          font-weight: 600;
          font-size: 14px;
          cursor: pointer;
        ">רענן</button>
      </div>
    `;
  }
}


// ============================================================================
// פונקציות עזר
// ============================================================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}


// ============================================================================
// האתחול הראשי - מה שקורה כשהדף נטען
// ============================================================================

async function main() {
  console.log(`🚀 ${APP_NAME} v${APP_VERSION} - מאתחל...`);

  // בדיקת תצורה
  if (!validateConfig()) {
    showFatalError('תצורה לא תקינה. בדוק את config.js');
    return;
  }

  // אתחול Firebase
  const fbOk = await initFirebase();
  if (!fbOk) return;

  // אתחול מודול האימות
  initAuth(firebaseAuth);

  // הפצת ארוע שהאפליקציה מוכנה (יסיר את מסך ה-splash)
  window.dispatchEvent(new CustomEvent('app:ready'));

  console.log('✅ האפליקציה מוכנה');
}


// הפעל בטעינה
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}


// ============================================================================
// חשיפה ל-console (לדיבוג)
// ============================================================================

if (window.location.hostname === 'localhost' ||
    window.location.hostname.includes('github.io')) {
  window.__app = {
    get user() { return currentUser; },
    get auth() { return firebaseAuth; },
    get firestore() { return firebaseFirestore; },
    version: APP_VERSION,
    signOut: handleLogout,
  };
  console.log('%c💡 טיפ: הקלד __app ב-console כדי לראות את מצב האפליקציה', 'color: #7BC4E2');
}
