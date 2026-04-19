/**
 * ============================================================================
 * auth.js - מסך התחברות (גרסה 2.0)
 * ============================================================================
 *
 * זרימה:
 *   1. המשתמש מזין מייל + סיסמה → "המשך"
 *   2. ננסה signInWithEmailAndPassword
 *   3. אם הצליח → נכנס לאפליקציה
 *   4. אם user-not-found → הצע להירשם
 *   5. אם סיסמה שגויה / invalid-credential → הצע להירשם
 *      (אם המשתמש לוחץ "צור חשבון" ובאמת קיים - Firebase יחזיר
 *       email-already-in-use ואנחנו נגיד לו שהסיסמה שגויה)
 *
 * תלויות: Firebase Auth, config.js
 * ============================================================================
 */

import { MESSAGES } from './config.js?v=2';


// ============================================================================
// משתנים ברמת המודול
// ============================================================================

let auth = null;
let isSubmitting = false;
let pendingSignup = null;     // {email, password} כשיש הצעת הרשמה פעילה


// ============================================================================
// ולידציה
// ============================================================================

function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

function calcPasswordStrength(password) {
  if (!password || password.length < 6) return 0;
  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  const variety = [
    /[a-z]/.test(password),
    /[A-Z]/.test(password),
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ].filter(Boolean).length;
  if (variety >= 2) score++;
  if (variety >= 3) score++;
  if (password.length < 8) score = Math.min(score, 1);
  return Math.min(score, 3);
}


// ============================================================================
// תרגום שגיאות Firebase לעברית
// ============================================================================

function translateFirebaseError(errorCode) {
  const map = {
    'auth/invalid-email': MESSAGES.errors.invalidEmail,
    'auth/wrong-password': 'הסיסמה שגויה',
    'auth/invalid-credential': 'הסיסמה שגויה',
    'auth/invalid-login-credentials': 'הסיסמה שגויה',
    'auth/email-already-in-use': MESSAGES.errors.emailInUse,
    'auth/weak-password': MESSAGES.errors.weakPassword,
    'auth/network-request-failed': MESSAGES.errors.networkError,
    'auth/too-many-requests': 'יותר מדי ניסיונות, נסה שוב בעוד מספר דקות',
    'auth/user-disabled': 'החשבון הזה הושבת',
    'auth/operation-not-allowed': 'שיטת התחברות זו אינה זמינה',
  };
  return map[errorCode] || MESSAGES.errors.generic;
}


// ============================================================================
// רנדור HTML של המסך - גרסה נקייה בלי אימות סיסמה
// ============================================================================

function renderAuthScreen() {
  const screen = document.getElementById('screen-auth');
  if (!screen) return;

  screen.innerHTML = `
    <div class="auth-container">

      <div class="auth-card">
        <div class="auth-brand">
          <div class="auth-logo" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1.5" fill="currentColor"/>
              <circle cx="18" cy="21" r="1.5" fill="currentColor"/>
              <path d="M2.5 3h2.5l2.7 12.6a2 2 0 0 0 2 1.6h9.4a2 2 0 0 0 2-1.5L22 7H6"/>
            </svg>
          </div>
          <h1 class="auth-title" id="auth-title">ברוכים הבאים</h1>
          <p class="auth-subtitle" id="auth-subtitle">
            הכנס את פרטי החשבון שלך
          </p>
        </div>

        <form class="auth-form" id="auth-form" novalidate>

          <!-- הודעת שגיאה -->
          <div class="auth-error hidden" id="auth-error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span id="auth-error-text"></span>
          </div>

          <!-- הצעת הרשמה -->
          <div class="auth-signup-prompt hidden" id="auth-signup-prompt">
            <div class="auth-signup-prompt-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
            <div class="auth-signup-prompt-text">
              <strong>נראה שזה חשבון חדש</strong>
              <span>ליצור חשבון עם המייל והסיסמה שהזנת?</span>
            </div>
            <div class="auth-signup-prompt-strength">
              <div class="auth-strength-bar" aria-hidden="true">
                <div class="auth-strength-segment" data-segment="1"></div>
                <div class="auth-strength-segment" data-segment="2"></div>
                <div class="auth-strength-segment" data-segment="3"></div>
              </div>
              <div class="auth-strength-text" id="auth-strength-text">חוזק סיסמה: חלשה</div>
            </div>
          </div>

          <!-- שדה מייל -->
          <div class="form-group">
            <label class="form-label" for="auth-email">כתובת מייל</label>
            <div class="form-input-wrapper">
              <input
                type="email"
                id="auth-email"
                class="form-input"
                placeholder="your@email.com"
                autocomplete="email"
                inputmode="email"
                dir="ltr"
                required
              />
            </div>
          </div>

          <!-- שדה סיסמה -->
          <div class="form-group">
            <label class="form-label" for="auth-password">סיסמה</label>
            <div class="form-input-wrapper">
              <input
                type="password"
                id="auth-password"
                class="form-input"
                placeholder="הכנס סיסמה (לפחות 6 תווים)"
                autocomplete="current-password"
                required
                minlength="6"
              />
              <button
                type="button"
                class="form-input-icon"
                id="auth-toggle-password"
                aria-label="הצג סיסמה"
                title="הצג סיסמה"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- קישור לשחזור סיסמה -->
          <div class="auth-forgot-wrapper">
            <a href="#" class="auth-forgot-link" id="auth-forgot">שכחתי סיסמה</a>
          </div>

          <!-- כפתור ראשי -->
          <button
            type="submit"
            class="btn btn-primary btn-full btn-lg auth-submit"
            id="auth-submit"
          >
            <span id="auth-submit-text">המשך</span>
          </button>

          <!-- כפתור ביטול (רק כשמוצגת הצעת הרשמה) -->
          <button
            type="button"
            class="btn btn-ghost btn-full auth-cancel-signup hidden"
            id="auth-cancel-signup"
          >
            ביטול
          </button>

          <!-- תנאי שימוש (רק בהרשמה) -->
          <div class="auth-terms hidden" id="auth-terms">
            ביצירת חשבון אני מסכים/ה
            <a href="#" id="auth-terms-link">לתנאי השימוש</a>
            ול<a href="#" id="auth-privacy-link">מדיניות הפרטיות</a>
          </div>

        </form>
      </div>

      <!-- טיפ תחתון -->
      <div class="auth-tip">
        <div class="auth-tip-icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
            <circle cx="9" cy="7" r="4"/>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
          </svg>
        </div>
        <div class="auth-tip-text">
          <strong>רשימה משותפת?</strong>
          השתמשו באותה כתובת מייל בכל המכשירים - כולם יראו ויערכו את אותה הרשימה בזמן אמת.
        </div>
      </div>

    </div>
  `;

  attachEventListeners();
}


// ============================================================================
// חיבור event listeners
// ============================================================================

function attachEventListeners() {
  const form = document.getElementById('auth-form');
  const passwordInput = document.getElementById('auth-password');
  const togglePasswordBtn = document.getElementById('auth-toggle-password');
  const forgotLink = document.getElementById('auth-forgot');
  const cancelSignupBtn = document.getElementById('auth-cancel-signup');
  const emailInput = document.getElementById('auth-email');

  form.addEventListener('submit', handleSubmit);

  passwordInput.addEventListener('input', () => {
    if (pendingSignup) {
      updatePasswordStrength(passwordInput.value);
      if (passwordInput.value !== pendingSignup.password) {
        clearSignupPrompt();
      }
    }
  });

  emailInput.addEventListener('input', () => {
    if (pendingSignup) clearSignupPrompt();
    hideError();
  });

  setupPasswordToggle(togglePasswordBtn, passwordInput);

  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    handleForgotPassword();
  });

  cancelSignupBtn.addEventListener('click', () => {
    clearSignupPrompt();
    passwordInput.value = '';
    passwordInput.focus();
  });
}


// ============================================================================
// טוגלר הצגת סיסמה - לחיצה ארוכה
// ============================================================================

function setupPasswordToggle(button, input) {
  const eyeOpen = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  `;

  const eyeClosed = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  `;

  const show = () => {
    input.type = 'text';
    button.innerHTML = eyeClosed;
    button.setAttribute('aria-label', 'הסתר סיסמה');
  };

  const hide = () => {
    input.type = 'password';
    button.innerHTML = eyeOpen;
    button.setAttribute('aria-label', 'הצג סיסמה');
  };

  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    show();
  });

  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(evt => {
    button.addEventListener(evt, hide);
  });

  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      show();
    }
  });
  button.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') hide();
  });
}


// ============================================================================
// הגשת הטופס
// ============================================================================

async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;

  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  hideError();

  if (!isValidEmail(email)) {
    showError(MESSAGES.errors.invalidEmail);
    emailInput.focus();
    return;
  }

  if (!password || password.length < 6) {
    showError(MESSAGES.errors.weakPassword);
    passwordInput.focus();
    return;
  }

  setSubmitLoading(true);

  // אם יש הצעת הרשמה פעילה - ננסה הרשמה
  if (pendingSignup &&
      pendingSignup.email === email &&
      pendingSignup.password === password) {
    await attemptSignup(email, password);
    return;
  }

  // אחרת - ננסה התחברות
  await attemptLogin(email, password);
}


// ============================================================================
// ניסיון התחברות
// ============================================================================

async function attemptLogin(email, password) {
  try {
    const { signInWithEmailAndPassword } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    await signInWithEmailAndPassword(auth, email, password);

    // הצלחה! מסירים את מצב הטעינה לפני המעבר למסך הבא
    setSubmitLoading(false);

    window.dispatchEvent(new CustomEvent('auth:success', {
      detail: { email }
    }));

  } catch (error) {
    console.log('Login attempt result:', error.code);
    setSubmitLoading(false);

    // עם Email Enumeration Protection, Firebase מחזיר 'invalid-credential'
    // לכל שגיאה שלא חושפת אם המייל קיים או לא.
    // במקרה כזה, נציג הצעה להרשמה.
    if (
      error.code === 'auth/user-not-found' ||
      error.code === 'auth/invalid-credential' ||
      error.code === 'auth/invalid-login-credentials' ||
      error.code === 'auth/wrong-password'
    ) {
      showSignupPrompt(email, password);
    } else if (error.code === 'auth/too-many-requests') {
      showError(translateFirebaseError(error.code));
      shakeCard();
    } else if (error.code === 'auth/network-request-failed') {
      showError(MESSAGES.errors.networkError);
    } else {
      showError(translateFirebaseError(error.code));
      shakeCard();
    }
  }
}


// ============================================================================
// ניסיון הרשמה
// ============================================================================

async function attemptSignup(email, password) {
  try {
    const { createUserWithEmailAndPassword } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    await createUserWithEmailAndPassword(auth, email, password);

    // הצלחה! מסירים את מצב הטעינה
    setSubmitLoading(false);

    window.dispatchEvent(new CustomEvent('auth:success', {
      detail: { email, isNewUser: true }
    }));

  } catch (error) {
    console.log('Signup attempt result:', error.code);
    setSubmitLoading(false);

    if (error.code === 'auth/email-already-in-use') {
      // המייל כבר קיים - כלומר הסיסמה שהמשתמש הזין הייתה שגויה
      clearSignupPrompt();
      showError('הסיסמה שגויה. נסה סיסמה אחרת או לחץ "שכחתי סיסמה".');
      shakeCard();
      const passwordInput = document.getElementById('auth-password');
      passwordInput.focus();
      passwordInput.select();
    } else if (error.code === 'auth/weak-password') {
      showError(MESSAGES.errors.weakPassword);
      document.getElementById('auth-password').focus();
    } else {
      showError(translateFirebaseError(error.code));
      shakeCard();
    }
  }
}


// ============================================================================
// הצגת הצעה להרשמה
// ============================================================================

function showSignupPrompt(email, password) {
  pendingSignup = { email, password };

  const form = document.getElementById('auth-form');
  const prompt = document.getElementById('auth-signup-prompt');
  const submitText = document.getElementById('auth-submit-text');
  const cancelBtn = document.getElementById('auth-cancel-signup');
  const terms = document.getElementById('auth-terms');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const forgotWrapper = document.querySelector('.auth-forgot-wrapper');

  form.classList.add('is-signup-mode');
  prompt.classList.remove('hidden');
  cancelBtn.classList.remove('hidden');
  terms.classList.remove('hidden');
  if (forgotWrapper) forgotWrapper.classList.add('hidden');

  title.textContent = 'בוא ניצור חשבון';
  subtitle.innerHTML = `נרשם עבור <strong dir="ltr">${escapeHtml(email)}</strong>`;
  submitText.textContent = 'צור חשבון והתחבר';

  updatePasswordStrength(password);

  // גלילה חלקה לכפתור - חשוב שהמשתמש יראה אותו
  setTimeout(() => {
    const submitBtn = document.getElementById('auth-submit');
    if (submitBtn) {
      submitBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 150);
}


// ============================================================================
// ביטול הצעת הרשמה
// ============================================================================

function clearSignupPrompt() {
  pendingSignup = null;

  const form = document.getElementById('auth-form');
  if (!form) return;

  const prompt = document.getElementById('auth-signup-prompt');
  const submitText = document.getElementById('auth-submit-text');
  const cancelBtn = document.getElementById('auth-cancel-signup');
  const terms = document.getElementById('auth-terms');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const forgotWrapper = document.querySelector('.auth-forgot-wrapper');

  form.classList.remove('is-signup-mode');
  prompt.classList.add('hidden');
  cancelBtn.classList.add('hidden');
  terms.classList.add('hidden');
  if (forgotWrapper) forgotWrapper.classList.remove('hidden');

  title.textContent = 'ברוכים הבאים';
  subtitle.textContent = 'הכנס את פרטי החשבון שלך';
  submitText.textContent = 'המשך';
}


// ============================================================================
// מד חוזק סיסמה
// ============================================================================

function updatePasswordStrength(password) {
  const strength = calcPasswordStrength(password);
  const segments = document.querySelectorAll('.auth-strength-segment');
  const text = document.getElementById('auth-strength-text');
  if (!segments.length || !text) return;

  segments.forEach(seg => {
    seg.classList.remove('active-weak', 'active-medium', 'active-strong');
  });

  if (!password) {
    text.textContent = 'חוזק סיסמה יוצג כאן';
    return;
  }

  let label, activeClass;
  if (strength <= 1) {
    label = 'חלשה';
    activeClass = 'active-weak';
    segments[0].classList.add(activeClass);
  } else if (strength === 2) {
    label = 'בינונית';
    activeClass = 'active-medium';
    segments[0].classList.add(activeClass);
    segments[1].classList.add(activeClass);
  } else {
    label = 'חזקה';
    activeClass = 'active-strong';
    segments.forEach(seg => seg.classList.add(activeClass));
  }

  text.textContent = `חוזק סיסמה: ${label}`;
}


// ============================================================================
// שכחתי סיסמה
// ============================================================================

async function handleForgotPassword() {
  const emailInput = document.getElementById('auth-email');
  const email = emailInput.value.trim();

  if (!isValidEmail(email)) {
    showError('הכנס את כתובת המייל שלך בשדה ולחץ שוב על "שכחתי סיסמה"');
    emailInput.focus();
    return;
  }

  try {
    const { sendPasswordResetEmail } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    await sendPasswordResetEmail(auth, email);

    // הודעה ברורה ופשוטה
    const msg = `נשלח מייל לאיפוס סיסמה. בדוק את תיבת המייל שלך (וגם בספאם)`;
    if (window.showToast) {
      window.showToast(msg, 'success');
    } else {
      showError(msg);
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    if (error.code === 'auth/invalid-email') {
      showError(MESSAGES.errors.invalidEmail);
    } else if (error.code === 'auth/too-many-requests') {
      showError('שלחת יותר מדי בקשות. המתן מספר דקות ונסה שוב');
    } else {
      // אם יש שגיאה כללית (למשל הגנת אנונימיזציה של Google),
      // נניח שזה עבד ונגיד למשתמש
      const msg = `אם קיים חשבון - נשלח אליו מייל איפוס. בדוק גם בתיקיית הספאם`;
      if (window.showToast) window.showToast(msg, 'success');
    }
  }
}


// ============================================================================
// עזרי UI
// ============================================================================

function showError(message) {
  const errBox = document.getElementById('auth-error');
  const errText = document.getElementById('auth-error-text');
  if (!errBox || !errText) return;
  errText.textContent = message;
  errBox.classList.remove('hidden');
}

function hideError() {
  const errBox = document.getElementById('auth-error');
  if (errBox) errBox.classList.add('hidden');
}

function setSubmitLoading(loading) {
  isSubmitting = loading;
  const btn = document.getElementById('auth-submit');
  if (!btn) return;
  if (loading) {
    btn.classList.add('is-loading');
    btn.disabled = true;
  } else {
    btn.classList.remove('is-loading');
    btn.disabled = false;
  }
}

function shakeCard() {
  const card = document.querySelector('.auth-card');
  if (card) {
    card.classList.add('animate-shake');
    setTimeout(() => card.classList.remove('animate-shake'), 400);
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}


// ============================================================================
// API ציבורי
// ============================================================================

export function initAuth(firebaseAuth) {
  auth = firebaseAuth;
  renderAuthScreen();
}

export function showAuthScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-auth');
  if (screen) {
    screen.classList.add('active');
    setTimeout(() => {
      const emailInput = document.getElementById('auth-email');
      if (emailInput) emailInput.focus();
    }, 300);
  }
}

export async function signOut() {
  if (!auth) return;
  const { signOut: fbSignOut } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
  );
  await fbSignOut(auth);
}

export function resetAuthForm() {
  clearSignupPrompt();
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  hideError();
}
