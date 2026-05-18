/**
 * ============================================================================
 * app.js — נקודת הכניסה והרוטינג הראשי
 * ============================================================================
 *
 * זה הקובץ היחיד שאחראי על "איזה מסך מציגים עכשיו".
 *
 * זרימה:
 *   1. אתחל Firebase
 *   2. אתחל auth (מצייר את מסך ה-login)
 *   3. הסתר splash
 *   4. עקוב אחרי שינויי auth:
 *      - מחובר → showScreen('main')
 *      - לא מחובר → showScreen('auth')
 *
 * אין כאן שום ידע על Guide, על main-ui, על history.
 * כל אלה יחזרו בצ'אטים הבאים כשהשלד יוכח כיציב.
 * ============================================================================
 */

import { FIREBASE_CONFIG, APP_VERSION, APP_NAME, validateConfig } from './config.js?v=5';
import { initAuth, showAuthScreen, signOut } from './auth.js?v=5';


// ============================================================================
// State גלובלי (מינימלי)
// ============================================================================

let firebaseApp = null;
let firebaseAuth = null;
let firebaseDb = null;
let currentUser = null;
let currentScreen = null;   // 'auth' | 'main' | null
let isInitialized = false;


// ============================================================================
// ניהול מסכים — נקודה אחת ויחידה לכל החלפת מסך
// ============================================================================

/**
 * הצגת מסך מסוים. זאת הפונקציה היחידה שמשנה מסכים בכל האפליקציה.
 *
 * @param {'auth' | 'main'} name
 */
function showScreen(name) {
  if (currentScreen === name) return;  // כבר מוצג — לא עושים כלום

  // הסר .active מכל המסכים
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));

  // הוסף .active למסך הנדרש
  const target = document.getElementById(`screen-${name}`);
  if (!target) {
    console.error(`[app] screen "${name}" not found in DOM`);
    return;
  }
  target.classList.add('active');
  currentScreen = name;
  console.log(`[app] → ${name}`);
}


// ============================================================================
// אתחול Firebase
// ============================================================================

async function initFirebase() {
  try {
    const { initializeApp } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js'
    );
    const { getAuth, onAuthStateChanged } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    const { getFirestore } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js'
    );

    firebaseApp  = initializeApp(FIREBASE_CONFIG);
    firebaseAuth = getAuth(firebaseApp);
    firebaseDb   = getFirestore(firebaseApp);

    // חשיפה ל-window — בעתיד מודולים אחרים (history, main-ui) ישתמשו
    window.firebaseAuth = firebaseAuth;
    window.firebaseDb   = firebaseDb;

    // האזנה לשינויי משתמש
    onAuthStateChanged(firebaseAuth, handleAuthStateChanged);

    console.log('✅ Firebase initialized:', FIREBASE_CONFIG.projectId);
    return true;

  } catch (err) {
    console.error('❌ Firebase init failed:', err);
    return false;
  }
}


// ============================================================================
// תגובה לשינוי משתמש (התחברות / התנתקות / רענון דף)
// ============================================================================

function handleAuthStateChanged(user) {
  currentUser = user;

  if (user) {
    console.log('👤 מחובר:', user.email);
    showScreen('main');
    renderMainPlaceholder(user);
  } else {
    console.log('🚪 לא מחובר');
    showScreen('auth');
  }
}


// ============================================================================
// מסך ראשי זמני (placeholder)
//   יוחלף בצ'אט הבא ב-main-ui אמיתי שמטעין את הקטלוג, הרשימה וכו'.
//   כרגע: רק להוכיח שהרוטינג עובד והתנתקות מחזירה ל-login.
// ============================================================================

function renderMainPlaceholder(user) {
  const screen = document.getElementById('screen-main');
  if (!screen) return;

  screen.innerHTML = `
    <div class="main-placeholder">
      <div class="main-placeholder-icon">🛒</div>
      <h1>RunPrice</h1>
      <p class="main-placeholder-welcome">שלום ${escapeHtml(user.email)}</p>

      <div class="main-placeholder-card">
        <h2>השלד עובד ✓</h2>
        <p>בצ'אטים הבאים נחבר:</p>
        <ul>
          <li>📖 מדריך 8 צעדים למשתמש חדש</li>
          <li>📝 רשימת קניות + הוספת מוצרים</li>
          <li>🎤 הקלטה קולית + סריקת ברקוד</li>
          <li>💰 חישוב סל בכל הרשתות</li>
          <li>📊 היסטוריה + גרף חיסכון</li>
        </ul>
      </div>

      <button type="button" class="main-placeholder-logout" id="app-logout-btn">
        התנתקות
      </button>
    </div>
  `;

  const logoutBtn = document.getElementById('app-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      logoutBtn.disabled = true;
      logoutBtn.textContent = 'מתנתק...';
      await signOut();
      // onAuthStateChanged יעביר אוטומטית ל-auth
    });
  }
}


function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = String(str || '');
  return div.innerHTML;
}


// ============================================================================
// אירוע — התחברות הצליחה (auth.js שולח)
//   onAuthStateChanged יתפוס בכל מקרה, אבל יפה להציג toast במקביל
// ============================================================================

window.addEventListener('auth:success', (e) => {
  console.log('✅ התחברות הצליחה:', e.detail.email);
});


// ============================================================================
// אירועי רשת — מוסיף/מסיר banner של אופליין
// ============================================================================

function updateOnlineStatus() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;
  banner.classList.toggle('visible', !navigator.onLine);
}

window.addEventListener('online', updateOnlineStatus);
window.addEventListener('offline', updateOnlineStatus);


// ============================================================================
// אתחול ראשי
// ============================================================================

async function main() {
  if (isInitialized) return;
  isInitialized = true;

  console.log(`🚀 ${APP_NAME} v${APP_VERSION} - מאתחל...`);

  if (!validateConfig()) {
    showFatalError('שגיאת תצורה - אנא רענן את הדף');
    return;
  }

  const fbOk = await initFirebase();
  if (!fbOk) {
    showFatalError('שגיאה בחיבור לשרת - בדוק חיבור לאינטרנט');
    return;
  }

  // הצגת מסך login כברירת מחדל (אם אין משתמש, onAuthStateChanged יישאר על auth)
  initAuth(firebaseAuth);

  // עדכון מצב רשת ראשוני
  updateOnlineStatus();

  // הסתרת splash
  window.dispatchEvent(new CustomEvent('app:ready'));

  console.log('✅ האפליקציה מוכנה');
}


function showFatalError(message) {
  const splash = document.getElementById('splash-screen');
  if (splash) {
    splash.innerHTML = `
      <div style="text-align:center; padding:32px; max-width:340px;">
        <div style="font-size:48px;">⚠️</div>
        <h2 style="margin:16px 0 8px; color:#E57373;">${escapeHtml(message)}</h2>
        <button onclick="location.reload()"
                style="margin-top:16px; padding:12px 28px; border:none;
                       background:#7BC4E2; color:white; border-radius:9999px;
                       font-size:16px; font-weight:600; cursor:pointer;">
          רענון
        </button>
      </div>
    `;
  }
}


// ============================================================================
// הפעלה
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', main);
} else {
  main();
}


// ============================================================================
// חשיפה לקונסול (לדיבוג)
// ============================================================================

if (window.location.hostname === 'localhost' ||
    window.location.hostname.includes('github.io')) {
  window.__app = {
    showScreen,
    signOut,
    currentUser: () => currentUser,
    currentScreen: () => currentScreen,
    version: APP_VERSION,
  };
  console.log('💡 דיבוג: __app.showScreen("auth"), __app.signOut(), __app.currentUser()');
}
