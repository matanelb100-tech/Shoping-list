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
// מסך ראשי - placeholder זמני
// ============================================================================
// זה יוחלף בהמשך על ידי הקוד האמיתי של רשימת הקניות (ב-main.js / cart.js)

function showMainScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-main');
  if (!screen) return;

  screen.classList.add('active');

  // placeholder זמני - ייהרס ברגע שיהיה לנו המסך האמיתי
  const header = document.getElementById('main-header');
  const content = document.getElementById('main-content');
  const inputBar = document.getElementById('main-input-bar');

  if (header && !header.innerHTML) {
    header.innerHTML = `
      <div style="
        height: 60px;
        background: var(--color-surface);
        border-bottom: 1px solid var(--color-border);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        box-shadow: var(--shadow-sm);
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="
            width: 36px; height: 36px; border-radius: 10px;
            background: linear-gradient(135deg, var(--color-primary), var(--color-primary-dark));
            display: flex; align-items: center; justify-content: center;
          ">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1.5" fill="white"/>
              <circle cx="18" cy="21" r="1.5" fill="white"/>
              <path d="M2.5 3h2.5l2.7 12.6a2 2 0 0 0 2 1.6h9.4a2 2 0 0 0 2-1.5L22 7H6"/>
            </svg>
          </div>
          <div style="font-weight: 700; font-size: 16px;">רשימת קניות חכמה</div>
        </div>
        <button id="temp-logout-btn" class="btn btn-ghost btn-sm">התנתק</button>
      </div>
    `;

    document.getElementById('temp-logout-btn').addEventListener('click', handleLogout);
  }

  if (content && !content.querySelector('.temp-welcome')) {
    const userEmail = currentUser?.email || 'משתמש';
    content.innerHTML = `
      <div class="temp-welcome" style="
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        text-align: center;
        gap: 16px;
      ">
        <div style="
          width: 96px; height: 96px;
          border-radius: 24px;
          background: linear-gradient(135deg, var(--color-primary-ultra-light), var(--color-primary-light));
          display: flex; align-items: center; justify-content: center;
          box-shadow: var(--shadow-md);
        ">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary-dark)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
          </svg>
        </div>
        <h2 style="margin: 0;">🎉 Firebase עובד!</h2>
        <p style="color: var(--color-text-soft); max-width: 320px; line-height: 1.6;">
          מחובר בהצלחה כ-<strong dir="ltr" style="color: var(--color-primary-dark);">${escapeHtml(userEmail)}</strong>
        </p>
        <div style="
          background: var(--color-primary-ultra-light);
          padding: 16px 20px;
          border-radius: var(--radius-lg);
          font-size: 14px;
          color: var(--color-text-soft);
          max-width: 360px;
        ">
          <strong style="color: var(--color-primary-dark);">זה מסך זמני.</strong><br/>
          בקבצים הבאים נבנה את מסך הקניות האמיתי עם רשימה, קטגוריות וחישוב מחירים.
        </div>
      </div>
    `;
  }

  // לא מוסיפים input bar בינתיים
  if (inputBar) inputBar.innerHTML = '';
}


// ============================================================================
// התנתקות
// ============================================================================

async function handleLogout() {
  try {
    const { signOut } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    await signOut(firebaseAuth);
    // נקה את הגוף של המסך הראשי
    document.getElementById('main-header').innerHTML = '';
    document.getElementById('main-content').innerHTML = '';
    document.getElementById('main-input-bar').innerHTML = '';
    resetAuthForm();
    showToast('התנתקת בהצלחה', 'success');
  } catch (error) {
    console.error('Logout error:', error);
    showToast('שגיאה בהתנתקות', 'error');
  }
}


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
