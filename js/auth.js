/**
 * ============================================================================
 * auth.js - מסך התחברות חכם
 * ============================================================================
 *
 * זרימה:
 *   1. משתמש מקליד מייל
 *   2. המערכת בודקת ב-Firebase אם המייל קיים
 *   3. אם קיים - מצב "התחבר" (שדה סיסמה אחד)
 *   4. אם לא - מצב "הרשמה" (שדה סיסמה + אימות)
 *   5. אחרי הצלחה - מפיץ ארוע 'auth:success'
 *
 * תלויות:
 *   - Firebase Auth (נטען מ-CDN ב-app.js)
 *   - config.js
 *   - ui.js (ל-toasts)
 * ============================================================================
 */

import { FIREBASE_CONFIG, MESSAGES, UI_CONFIG } from './config.js';


// ============================================================================
// משתנים ברמת המודול
// ============================================================================

let auth = null;              // Firebase Auth instance (נקבע ב-init)
let currentMode = 'initial';  // 'initial' | 'login' | 'signup'
let emailCheckTimeout = null;
let lastCheckedEmail = '';
let isSubmitting = false;


// ============================================================================
// ולידציה
// ============================================================================

/** בדיקה אם המייל בפורמט תקין */
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  // Regex מתון שמתאים לרוב המיילים התקינים (כולל תווי unicode)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());
}

/**
 * חישוב חוזק סיסמה (0-3)
 * 0 = חלשה, 1 = בינונית, 2 = חזקה, 3 = חזקה מאוד
 */
function calcPasswordStrength(password) {
  if (!password || password.length < 6) return 0;

  let score = 0;

  // אורך
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;

  // מגוון תווים
  const hasLower = /[a-z]/.test(password);
  const hasUpper = /[A-Z]/.test(password);
  const hasDigit = /\d/.test(password);
  const hasSpecial = /[^A-Za-z0-9]/.test(password);
  const variety = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  if (variety >= 2) score++;
  if (variety >= 3) score++;

  // אל תתן ציון גבוה לסיסמה קצרה
  if (password.length < 8) score = Math.min(score, 1);

  return Math.min(score, 3);
}


// ============================================================================
// תרגום שגיאות Firebase לעברית
// ============================================================================

function translateFirebaseError(errorCode) {
  const map = {
    'auth/invalid-email': MESSAGES.errors.invalidEmail,
    'auth/user-not-found': MESSAGES.errors.authFailed,
    'auth/wrong-password': MESSAGES.errors.authFailed,
    'auth/invalid-credential': MESSAGES.errors.authFailed,
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
// רנדור ה-HTML של המסך
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
            הכנס את כתובת המייל שלך כדי להתחיל
          </p>
        </div>

        <form class="auth-form mode-initial" id="auth-form" novalidate>

          <!-- הודעת שגיאה -->
          <div class="auth-error hidden" id="auth-error" role="alert">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span id="auth-error-text"></span>
          </div>

          <!-- שדה מייל -->
          <div class="form-group">
            <label class="form-label" for="auth-email">כתובת מייל</label>
            <div class="auth-email-field form-input-wrapper">
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
              <div class="auth-email-checking" aria-hidden="true"></div>
              <button
                type="button"
                class="auth-edit-email"
                id="auth-edit-email"
                aria-label="ערוך כתובת מייל"
                title="ערוך"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- קבוצת סיסמה - מוסתרת במצב initial -->
          <div class="auth-password-group">

            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="auth-password">סיסמה</label>
              <div class="form-input-wrapper">
                <input
                  type="password"
                  id="auth-password"
                  class="form-input"
                  placeholder="הכנס סיסמה"
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
                  <svg id="auth-eye-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                </button>
              </div>
            </div>

            <!-- מציין חוזק סיסמה -->
            <div class="auth-password-strength">
              <div class="auth-strength-bar" aria-hidden="true">
                <div class="auth-strength-segment" data-segment="1"></div>
                <div class="auth-strength-segment" data-segment="2"></div>
                <div class="auth-strength-segment" data-segment="3"></div>
              </div>
              <div class="auth-strength-text" id="auth-strength-text">
                חוזק הסיסמה יוצג כאן
              </div>
            </div>

            <!-- שדה אימות סיסמה - רק בהרשמה -->
            <div class="auth-password-confirm">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="auth-password-confirm">אימות סיסמה</label>
                <div class="form-input-wrapper">
                  <input
                    type="password"
                    id="auth-password-confirm"
                    class="form-input"
                    placeholder="הזן את הסיסמה שוב"
                    autocomplete="new-password"
                  />
                </div>
              </div>
            </div>

            <!-- קישור לשחזור סיסמה (רק במצב login) -->
            <div class="auth-forgot-wrapper">
              <a href="#" class="auth-forgot-link" id="auth-forgot">שכחתי סיסמה</a>
            </div>

          </div>

          <!-- כפתור ראשי -->
          <button
            type="submit"
            class="btn btn-primary btn-full btn-lg auth-submit"
            id="auth-submit"
          >
            <span id="auth-submit-text">המשך</span>
          </button>

          <!-- תנאי שימוש (רק בהרשמה) -->
          <div class="auth-terms">
            בהרשמה אני מסכים/ה
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

  // אחרי שהוזרק ה-HTML, מחברים את ה-event listeners
  attachEventListeners();
}


// ============================================================================
// חיבור event listeners
// ============================================================================

function attachEventListeners() {
  const form = document.getElementById('auth-form');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const confirmInput = document.getElementById('auth-password-confirm');
  const togglePasswordBtn = document.getElementById('auth-toggle-password');
  const editEmailBtn = document.getElementById('auth-edit-email');
  const forgotLink = document.getElementById('auth-forgot');

  // הגשת הטופס
  form.addEventListener('submit', handleSubmit);

  // הקלדה בשדה המייל - debounce ובדיקה ב-Firebase
  emailInput.addEventListener('input', handleEmailInput);

  // Enter בשדה המייל במצב initial - עובר לבדיקה מיידית
  emailInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && currentMode === 'initial') {
      e.preventDefault();
      checkEmailNow();
    }
  });

  // הקלדה בסיסמה - עדכון מד חוזק (רק בהרשמה)
  passwordInput.addEventListener('input', () => {
    if (currentMode === 'signup') {
      updatePasswordStrength(passwordInput.value);
    }
  });

  // טוגלר עין-סיסמה (מופיע/נעלם)
  setupPasswordToggle(togglePasswordBtn, passwordInput);

  // כפתור עריכת מייל - מחזיר למצב initial
  editEmailBtn.addEventListener('click', () => {
    setMode('initial');
    emailInput.focus();
    emailInput.select();
  });

  // שכחתי סיסמה
  forgotLink.addEventListener('click', (e) => {
    e.preventDefault();
    handleForgotPassword();
  });
}


// ============================================================================
// טיפול בהקלדת מייל
// ============================================================================

function handleEmailInput(e) {
  const email = e.target.value.trim();

  // איפוס שגיאה קודמת
  hideError();

  // נקה timeout קודם אם קיים
  if (emailCheckTimeout) {
    clearTimeout(emailCheckTimeout);
  }

  // אם המייל לא תקין - לא לבדוק
  if (!isValidEmail(email)) {
    // אם היינו במצב login/signup והמשתמש התחיל לערוך - נחזור ל-initial
    if (currentMode !== 'initial' && !isSubmitting) {
      setMode('initial');
    }
    return;
  }

  // אם אותו מייל שכבר בדקנו - לא לבדוק שוב
  if (email === lastCheckedEmail) {
    return;
  }

  // הצג אינדיקטור טעינה
  document.querySelector('.auth-email-field').classList.add('is-checking');

  // Debounce - המתן לפני שליחת בקשה
  emailCheckTimeout = setTimeout(() => {
    checkEmailInFirebase(email);
  }, 600);
}

/** לחיצת Enter במצב initial - בדוק מיד */
function checkEmailNow() {
  const emailInput = document.getElementById('auth-email');
  const email = emailInput.value.trim();

  if (emailCheckTimeout) clearTimeout(emailCheckTimeout);

  if (!isValidEmail(email)) {
    showError(MESSAGES.errors.invalidEmail);
    emailInput.focus();
    return;
  }

  checkEmailInFirebase(email);
}

/** שואל את Firebase אם המייל רשום */
async function checkEmailInFirebase(email) {
  if (!auth) {
    console.error('Firebase auth לא אותחל');
    return;
  }

  lastCheckedEmail = email;
  document.querySelector('.auth-email-field').classList.add('is-checking');

  try {
    // Firebase Auth v9+ API
    const { fetchSignInMethodsForEmail } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );

    const methods = await fetchSignInMethodsForEmail(auth, email);

    document.querySelector('.auth-email-field').classList.remove('is-checking');

    if (methods && methods.length > 0) {
      // מייל קיים - עבר למצב login
      setMode('login');
    } else {
      // מייל לא קיים - עבר למצב signup
      setMode('signup');
    }

    // פוקוס על שדה הסיסמה
    setTimeout(() => {
      document.getElementById('auth-password').focus();
    }, 300);

  } catch (error) {
    document.querySelector('.auth-email-field').classList.remove('is-checking');

    if (error.code === 'auth/invalid-email') {
      showError(MESSAGES.errors.invalidEmail);
    } else if (error.code === 'auth/network-request-failed') {
      showError(MESSAGES.errors.networkError);
    } else {
      // בגרסאות חדשות של Firebase, fetchSignInMethodsForEmail יכולה להיחסם
      // במקרה כזה, נעבור ישר ל-signup ונתן ל-Firebase לטפל בשגיאה
      console.warn('בדיקת מייל נכשלה, ממשיך ל-signup:', error);
      setMode('signup');
    }
  }
}


// ============================================================================
// מעבר בין מצבים
// ============================================================================

function setMode(newMode) {
  if (currentMode === newMode) return;

  currentMode = newMode;
  const form = document.getElementById('auth-form');
  const title = document.getElementById('auth-title');
  const subtitle = document.getElementById('auth-subtitle');
  const submitText = document.getElementById('auth-submit-text');
  const passwordInput = document.getElementById('auth-password');
  const confirmInput = document.getElementById('auth-password-confirm');
  const emailInput = document.getElementById('auth-email');

  // הסר מצב ישן, הוסף חדש
  form.classList.remove('mode-initial', 'mode-login', 'mode-signup');
  form.classList.add(`mode-${newMode}`);

  // fade-out של הטקסט, עדכון, fade-in
  title.classList.add('changing');
  subtitle.classList.add('changing');

  setTimeout(() => {
    switch (newMode) {
      case 'initial':
        title.textContent = 'ברוכים הבאים';
        subtitle.innerHTML = 'הכנס את כתובת המייל שלך כדי להתחיל';
        submitText.textContent = 'המשך';
        // אפס שדות סיסמה וביטול קריאת API
        passwordInput.value = '';
        confirmInput.value = '';
        passwordInput.autocomplete = 'current-password';
        lastCheckedEmail = '';
        hideError();
        break;

      case 'login':
        title.textContent = 'ברוך שובך';
        subtitle.innerHTML = `הכנס סיסמה עבור <strong dir="ltr">${escapeHtml(emailInput.value)}</strong>`;
        submitText.textContent = 'התחבר';
        passwordInput.autocomplete = 'current-password';
        passwordInput.placeholder = 'הכנס את הסיסמה שלך';
        break;

      case 'signup':
        title.textContent = 'בוא ניצור חשבון חדש';
        subtitle.innerHTML = `נרשם עבור <strong dir="ltr">${escapeHtml(emailInput.value)}</strong>`;
        submitText.textContent = 'הצטרף';
        passwordInput.autocomplete = 'new-password';
        passwordInput.placeholder = 'בחר סיסמה (לפחות 6 תווים)';
        break;
    }

    title.classList.remove('changing');
    subtitle.classList.remove('changing');
  }, 150);
}


// ============================================================================
// מד חוזק סיסמה
// ============================================================================

function updatePasswordStrength(password) {
  const strength = calcPasswordStrength(password);
  const segments = document.querySelectorAll('.auth-strength-segment');
  const text = document.getElementById('auth-strength-text');

  // איפוס
  segments.forEach(seg => {
    seg.classList.remove('active-weak', 'active-medium', 'active-strong');
  });

  if (!password) {
    text.textContent = 'חוזק הסיסמה יוצג כאן';
    text.style.color = '';
    return;
  }

  let label, color, activeClass;

  if (strength <= 1) {
    label = 'חלשה';
    color = 'var(--color-danger)';
    activeClass = 'active-weak';
    segments[0].classList.add(activeClass);
  } else if (strength === 2) {
    label = 'בינונית';
    color = 'var(--color-warning)';
    activeClass = 'active-medium';
    segments[0].classList.add(activeClass);
    segments[1].classList.add(activeClass);
  } else {
    label = 'חזקה';
    color = 'var(--color-success)';
    activeClass = 'active-strong';
    segments.forEach(seg => seg.classList.add(activeClass));
  }

  text.textContent = `חוזק הסיסמה: ${label}`;
  text.style.color = color;
}


// ============================================================================
// טוגלר הצגת סיסמה (כפתור העין)
// ============================================================================

function setupPasswordToggle(button, input) {
  let visible = false;

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

  // מציג כשלוחצים ומחזיק, מסתיר כשעוזב (pointer events לטאץ' ועכבר)
  const show = () => {
    visible = true;
    input.type = 'text';
    button.innerHTML = eyeClosed;
    button.setAttribute('aria-label', 'הסתר סיסמה');
  };

  const hide = () => {
    visible = false;
    input.type = 'password';
    button.innerHTML = eyeOpen;
    button.setAttribute('aria-label', 'הצג סיסמה');
  };

  // מחזיק/עוזב - כמו בתיאור של המשתמש
  button.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    show();
  });

  // כל הדרכים "לעזוב" - מסתיר
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(evt => {
    button.addEventListener(evt, hide);
  });

  // גם לטיפול במקלדת
  button.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      show();
    }
  });
  button.addEventListener('keyup', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      hide();
    }
  });
}


// ============================================================================
// טיפול בהגשת הטופס
// ============================================================================

async function handleSubmit(e) {
  e.preventDefault();

  if (isSubmitting) return;

  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const confirmInput = document.getElementById('auth-password-confirm');

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const confirm = confirmInput.value;

  hideError();

  // אם אנחנו ב-initial - פשוט בדוק את המייל
  if (currentMode === 'initial') {
    if (!isValidEmail(email)) {
      showError(MESSAGES.errors.invalidEmail);
      emailInput.focus();
      return;
    }
    checkEmailNow();
    return;
  }

  // ולידציות למצב login/signup
  if (!password || password.length < 6) {
    showError(MESSAGES.errors.weakPassword);
    passwordInput.focus();
    return;
  }

  if (currentMode === 'signup') {
    if (password !== confirm) {
      showError('הסיסמאות אינן תואמות');
      confirmInput.focus();
      return;
    }
  }

  // העבר למצב טעינה
  setSubmitLoading(true);

  try {
    if (currentMode === 'login') {
      await signIn(email, password);
    } else {
      await signUp(email, password);
    }

    // הצלחה - מפיץ ארוע שיתפוס ע"י app.js
    window.dispatchEvent(new CustomEvent('auth:success', {
      detail: { email }
    }));

  } catch (error) {
    console.error('Auth error:', error);
    const msg = translateFirebaseError(error.code);
    showError(msg);
    setSubmitLoading(false);

    // אנימציית רעד לכרטיסייה
    const card = document.querySelector('.auth-card');
    if (card) {
      card.classList.add('animate-shake');
      setTimeout(() => card.classList.remove('animate-shake'), 400);
    }
  }
}


// ============================================================================
// Firebase Auth - התחברות/הרשמה
// ============================================================================

async function signIn(email, password) {
  const { signInWithEmailAndPassword } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
  );
  return signInWithEmailAndPassword(auth, email, password);
}

async function signUp(email, password) {
  const { createUserWithEmailAndPassword } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
  );
  return createUserWithEmailAndPassword(auth, email, password);
}


// ============================================================================
// שכחתי סיסמה
// ============================================================================

async function handleForgotPassword() {
  const emailInput = document.getElementById('auth-email');
  const email = emailInput.value.trim();

  if (!isValidEmail(email)) {
    showError(MESSAGES.errors.invalidEmail);
    return;
  }

  try {
    const { sendPasswordResetEmail } = await import(
      'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
    );
    await sendPasswordResetEmail(auth, email);

    // משתמש בהודעה גלובלית (toast) אם קיים, אחרת alert
    if (window.showToast) {
      window.showToast(`נשלח מייל לאיפוס סיסמה ל-${email}`, 'success');
    } else {
      alert(`נשלח מייל לאיפוס סיסמה ל-${email}`);
    }
  } catch (error) {
    showError(translateFirebaseError(error.code));
  }
}


// ============================================================================
// Helpers - UI
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}


// ============================================================================
// API ציבורי - מה שאר המודולים יכולים לקרוא
// ============================================================================

/**
 * אתחול מסך האימות
 * נקרא מ-app.js אחרי ש-Firebase אותחל
 *
 * @param {object} firebaseAuth - ה-auth instance מ-Firebase
 */
export function initAuth(firebaseAuth) {
  auth = firebaseAuth;
  renderAuthScreen();
}

/**
 * הצגת מסך האימות
 */
export function showAuthScreen() {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById('screen-auth');
  if (screen) {
    screen.classList.add('active');
    // פוקוס אוטומטי על שדה המייל
    setTimeout(() => {
      const emailInput = document.getElementById('auth-email');
      if (emailInput) emailInput.focus();
    }, 300);
  }
}

/**
 * התנתקות
 */
export async function signOut() {
  if (!auth) return;
  const { signOut: fbSignOut } = await import(
    'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js'
  );
  await fbSignOut(auth);
  setMode('initial');
}

/**
 * איפוס הטופס (למשל אחרי התנתקות)
 */
export function resetAuthForm() {
  setMode('initial');
  const emailInput = document.getElementById('auth-email');
  const passwordInput = document.getElementById('auth-password');
  const confirmInput = document.getElementById('auth-password-confirm');
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (confirmInput) confirmInput.value = '';
  lastCheckedEmail = '';
  hideError();
}
