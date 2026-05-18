/**
 * ============================================================================
 * auth.js — מסך כניסה / הרשמה / שכחתי סיסמא
 * ============================================================================
 *
 * המודול הזה אחראי על הכל מה שקשור למסך הכניסה:
 *   1. מצייר את ה-HTML של המסך פעם אחת (renderAuthScreen)
 *   2. מטפל ב-3 מצבים: login | signup | forgot
 *   3. שולח אירוע 'auth:success' כשמשתמש נכנס בהצלחה
 *
 * הוא לא יודע שום דבר על מסכים אחרים. הוא רק:
 *   - מקבל את firebaseAuth מ-app.js
 *   - מנהל את הטופס שלו
 *   - שולח אירועים החוצה (app.js מאזין ומחליט מה הלאה)
 *
 * API ציבורי:
 *   - initAuth(firebaseAuth)  — קוראים פעם אחת ב-app.js
 *   - showAuthScreen()         — מציג את המסך
 *   - signOut()                — מתנתק
 * ============================================================================
 */

import { MESSAGES } from './config.js?v=5';

// ============================================================================
// State פנימי של המודול
// ============================================================================

let auth = null;                    // firebase auth instance
let mode = 'login';                 // 'login' | 'signup' | 'forgot'
let isSubmitting = false;
let passwordVisible = false;


// ============================================================================
// API ציבורי
// ============================================================================

/**
 * אתחול — נקרא פעם אחת מ-app.js אחרי שFirebase מוכן
 */
export function initAuth(firebaseAuth) {
  auth = firebaseAuth;
  renderAuthScreen();
  attachEventListeners();
}


/**
 * הצגת מסך הכניסה (מורידים את כל המסכים האחרים)
 */
export function showAuthScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-auth');
  if (screen) {
    screen.classList.add('active');
    setMode('login');
    // focus על שדה המייל אחרי שהמסך מצויר
    setTimeout(() => {
      const emailInput = document.getElementById('auth-email');
      if (emailInput) emailInput.focus();
    }, 200);
  }
}


/**
 * התנתקות — קוראים מ-app.js (כפתור logout במסך הראשי)
 */
export async function signOut() {
  if (!auth) return;
  try {
    const { signOut: fbSignOut } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    await fbSignOut(auth);
  } catch (err) {
    console.error('[auth] signOut failed:', err);
  }
}


// ============================================================================
// ציור ה-HTML של המסך (פעם אחת בלבד)
// ============================================================================

function renderAuthScreen() {
  const screen = document.getElementById('screen-auth');
  if (!screen) {
    console.error('[auth] #screen-auth not found in DOM');
    return;
  }

  screen.innerHTML = `
    <div class="auth-container">

      <div class="auth-logo">🛒</div>

      <h1 class="auth-title">RunPrice</h1>
      <p class="auth-subtitle" id="auth-subtitle">רשימת קניות חכמה</p>
      <p class="auth-hint" id="auth-hint">השוו מחירים בין 5 רשתות שיווק וחסכו בכל קנייה</p>

      <div class="auth-error hidden" id="auth-error" role="alert"></div>

      <form class="auth-form" id="auth-form" novalidate>

        <div class="auth-field">
          <label class="auth-label" for="auth-email">דואר אלקטרוני</label>
          <input
            type="email"
            id="auth-email"
            class="auth-input"
            inputmode="email"
            autocomplete="email"
            dir="ltr"
            placeholder="name@example.com"
            required
          />
        </div>

        <div class="auth-field" id="auth-password-field">
          <label class="auth-label" for="auth-password">סיסמא</label>
          <div class="auth-password-wrapper">
            <input
              type="password"
              id="auth-password"
              class="auth-input"
              autocomplete="current-password"
              dir="ltr"
              placeholder="הכניסו סיסמא"
              minlength="6"
              required
            />
            <button
              type="button"
              class="auth-eye"
              id="auth-eye-btn"
              aria-label="הצגת סיסמא"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                <circle cx="12" cy="12" r="3"></circle>
              </svg>
            </button>
          </div>
        </div>

        <button type="submit" class="auth-submit" id="auth-submit-btn">
          <span id="auth-submit-label">כניסה</span>
        </button>

      </form>

      <div class="auth-links">
        <button type="button" class="auth-link" id="auth-toggle-mode">
          <span id="auth-toggle-label">חדש כאן? הירשמו</span>
        </button>
        <button type="button" class="auth-link auth-link-muted" id="auth-forgot-btn">
          שכחתי סיסמא
        </button>
      </div>

      <p class="auth-tip">
        💡 בני זוג שמשתמשים באותו מייל יראו רשימת קניות משותפת
      </p>

    </div>
  `;
}


// ============================================================================
// חיבור event listeners (פעם אחת אחרי ה-render)
// ============================================================================

function attachEventListeners() {

  // Submit הטופס
  const form = document.getElementById('auth-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  // הצגת/הסתרת סיסמא
  const eyeBtn = document.getElementById('auth-eye-btn');
  if (eyeBtn) {
    eyeBtn.addEventListener('click', togglePasswordVisibility);
  }

  // החלפת מצב login ↔ signup
  const toggleBtn = document.getElementById('auth-toggle-mode');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      if (mode === 'forgot') {
        setMode('login');
      } else {
        setMode(mode === 'login' ? 'signup' : 'login');
      }
    });
  }

  // שכחתי סיסמא
  const forgotBtn = document.getElementById('auth-forgot-btn');
  if (forgotBtn) {
    forgotBtn.addEventListener('click', () => setMode('forgot'));
  }
}


// ============================================================================
// החלפת מצב (login / signup / forgot)
// ============================================================================

function setMode(newMode) {
  mode = newMode;
  hideError();

  const subtitle    = document.getElementById('auth-subtitle');
  const hint        = document.getElementById('auth-hint');
  const submitLabel = document.getElementById('auth-submit-label');
  const toggleLabel = document.getElementById('auth-toggle-label');
  const forgotBtn   = document.getElementById('auth-forgot-btn');
  const passwordField = document.getElementById('auth-password-field');

  if (newMode === 'login') {
    subtitle.textContent    = 'רשימת קניות חכמה';
    hint.textContent        = 'השוו מחירים בין 5 רשתות שיווק וחסכו בכל קנייה';
    submitLabel.textContent = 'כניסה';
    toggleLabel.textContent = 'חדש כאן? הירשמו';
    forgotBtn.style.display = '';
    passwordField.style.display = '';
    document.getElementById('auth-password').setAttribute('autocomplete', 'current-password');
  }

  else if (newMode === 'signup') {
    subtitle.textContent    = 'נרשמים ל-RunPrice';
    hint.textContent        = 'צרו חשבון חדש כדי לשמור את רשימות הקניות שלכם';
    submitLabel.textContent = 'הרשמה';
    toggleLabel.textContent = 'יש לכם חשבון? כניסה';
    forgotBtn.style.display = 'none';
    passwordField.style.display = '';
    document.getElementById('auth-password').setAttribute('autocomplete', 'new-password');
  }

  else if (newMode === 'forgot') {
    subtitle.textContent    = 'איפוס סיסמא';
    hint.textContent        = 'הכניסו את כתובת המייל ונשלח לכם קישור לאיפוס';
    submitLabel.textContent = 'שליחת קישור איפוס';
    toggleLabel.textContent = 'חזרה לכניסה';
    forgotBtn.style.display = 'none';
    passwordField.style.display = 'none';
  }
}


// ============================================================================
// Submit — login / signup / forgot
// ============================================================================

async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting || !auth) return;

  hideError();

  const email    = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  // ולידציה
  if (!isValidEmail(email)) {
    showError(MESSAGES.errors.invalidEmail);
    return;
  }
  if (mode !== 'forgot' && password.length < 6) {
    showError(MESSAGES.errors.weakPassword);
    return;
  }

  setSubmitting(true);

  try {
    if (mode === 'login') {
      await doLogin(email, password);
    } else if (mode === 'signup') {
      await doSignup(email, password);
    } else if (mode === 'forgot') {
      await doForgotPassword(email);
    }
  } catch (err) {
    showError(translateFirebaseError(err));
  } finally {
    setSubmitting(false);
  }
}


async function doLogin(email, password) {
  const { signInWithEmailAndPassword } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
  );
  const cred = await signInWithEmailAndPassword(auth, email, password);
  // App.js יקבל את האירוע מ-onAuthStateChanged ויעבור למסך הראשי
  window.dispatchEvent(new CustomEvent('auth:success', {
    detail: { email: cred.user.email, uid: cred.user.uid }
  }));
}


async function doSignup(email, password) {
  const { createUserWithEmailAndPassword } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
  );
  const cred = await createUserWithEmailAndPassword(auth, email, password);
  window.dispatchEvent(new CustomEvent('auth:success', {
    detail: { email: cred.user.email, uid: cred.user.uid, isNewUser: true }
  }));
}


async function doForgotPassword(email) {
  const { sendPasswordResetEmail } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
  );
  await sendPasswordResetEmail(auth, email);
  // הצלחה — מציגים הודעה ירוקה וחוזרים ל-login
  showSuccess(`נשלח קישור לאיפוס לכתובת ${email}. בדקו את תיבת הדואר.`);
  setTimeout(() => setMode('login'), 3500);
}


// ============================================================================
// פונקציות עזר ל-UI
// ============================================================================

function togglePasswordVisibility() {
  passwordVisible = !passwordVisible;
  const input = document.getElementById('auth-password');
  if (input) {
    input.type = passwordVisible ? 'text' : 'password';
  }
}


function setSubmitting(value) {
  isSubmitting = value;
  const btn = document.getElementById('auth-submit-btn');
  if (btn) {
    btn.disabled = value;
    btn.classList.toggle('is-loading', value);
  }
}


function showError(message) {
  const box = document.getElementById('auth-error');
  if (box) {
    box.textContent = message;
    box.classList.remove('hidden', 'is-success');
  }
}


function showSuccess(message) {
  const box = document.getElementById('auth-error');
  if (box) {
    box.textContent = message;
    box.classList.remove('hidden');
    box.classList.add('is-success');
  }
}


function hideError() {
  const box = document.getElementById('auth-error');
  if (box) {
    box.classList.add('hidden');
    box.classList.remove('is-success');
    box.textContent = '';
  }
}


function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}


function translateFirebaseError(err) {
  const code = err?.code || '';
  if (code.includes('user-not-found') || code.includes('wrong-password') || code.includes('invalid-credential')) {
    return MESSAGES.errors.authFailed;
  }
  if (code.includes('email-already-in-use')) {
    return MESSAGES.errors.emailInUse;
  }
  if (code.includes('weak-password')) {
    return MESSAGES.errors.weakPassword;
  }
  if (code.includes('invalid-email')) {
    return MESSAGES.errors.invalidEmail;
  }
  if (code.includes('network')) {
    return MESSAGES.errors.networkError;
  }
  if (code.includes('too-many-requests')) {
    return 'יותר מדי ניסיונות. נסו שוב בעוד כמה דקות.';
  }
  return MESSAGES.errors.generic;
}
