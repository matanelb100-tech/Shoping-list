/* ============================================================================
   guide.js — לוגיקת מסך המדריך הראשון (Onboarding Tutorial)
   ============================================================================

   API חיצוני (חשוף ב-window.Guide):
     - Guide.init()                — אתחול (מאזיני אירועים). נקרא מ-app.js
     - Guide.start()               — הפעלת המדריך מהצעד הראשון
     - Guide.shouldShow()          — Promise<boolean>: האם להציג למשתמש הזה?
     - Guide.markCompleted()       — סימון שהמדריך הושלם (Firestore + local)
     - Guide.next() / Guide.back() — ניווט בין צעדים (גם דרך כפתורים וגם API)

   אירועים שהמודול משדר:
     - 'guide:completed' { reason: 'finished' | 'skipped' }
       נשלח כשהמדריך מסתיים. app.js תופס ומחליט לאן ללכת.

   תלויות:
     - window.firebaseModules (מ-index.html)
     - window.firebaseAuth, window.firebaseDb (נחשפים ב-app.js אחרי initFirebase)
     - אלמנטים ב-DOM: #screen-guide, #guide-progress-fill, #guide-stage,
       #guide-back-btn, #guide-next-btn, #guide-next-label, #guide-skip-btn

   ============================================================================ */

(function () {
  'use strict';

  // -------------------- קונפיגורציה --------------------

  const TOTAL_STEPS = 8;
  const LS_KEY = 'runprice.guide.completed';        // backup local
  const FS_DOC_PATH = (uid) => `users/${uid}/preferences/onboarding`;

  // קלאסים לאנימציה (תואמים ל-guide.css)
  const CLASS_ACTIVE       = 'active';
  const CLASS_EXIT_NEXT    = 'exiting-next';
  const CLASS_ENTER_NEXT   = 'entering-next';
  const CLASS_EXIT_BACK    = 'exiting-back';
  const CLASS_ENTER_BACK   = 'entering-back';

  const SWIPE_THRESHOLD = 50;        // מינימום פיקסלים ל-swipe
  const SWIPE_MAX_TIME  = 600;       // ms

  // -------------------- מצב פנימי --------------------

  let currentStep = 1;
  let isTransitioning = false;       // מונע double-click במהלך אנימציה
  let isInitialized = false;

  // אלמנטים — נטענים ב-init()
  let elScreen, elStage, elProgressFill, elBackBtn, elNextBtn, elNextLabel, elSkipBtn;

  // טאצ' לזיהוי swipe
  let touchStartX = 0;
  let touchStartY = 0;
  let touchStartTime = 0;

  // -------------------- אתחול --------------------

  function init() {
    if (isInitialized) return;

    elScreen       = document.getElementById('screen-guide');
    elStage        = document.getElementById('guide-stage');
    elProgressFill = document.getElementById('guide-progress-fill');
    elBackBtn      = document.getElementById('guide-back-btn');
    elNextBtn      = document.getElementById('guide-next-btn');
    elNextLabel    = document.getElementById('guide-next-label');
    elSkipBtn      = document.getElementById('guide-skip-btn');

    if (!elScreen || !elStage) {
      console.warn('[Guide] DOM elements missing — skipping init');
      return;
    }

    // מאזינים לכפתורים
    elNextBtn?.addEventListener('click', handleNextClick);
    elBackBtn?.addEventListener('click', handleBackClick);
    elSkipBtn?.addEventListener('click', handleSkipClick);

    // Swipe (מובייל) — passive listeners לביצועים
    elStage.addEventListener('touchstart', handleTouchStart, { passive: true });
    elStage.addEventListener('touchend',   handleTouchEnd,   { passive: true });

    // מקלדת
    document.addEventListener('keydown', handleKeydown);

    isInitialized = true;
    console.log('[Guide] initialized');
  }

  // -------------------- API ציבורי --------------------

  /**
   * האם להציג את המדריך למשתמש הנוכחי?
   * בודק Firestore קודם, ואז localStorage כ-fallback.
   */
  async function shouldShow() {
    // 1. בדיקה מהירה ב-localStorage קודם (גם offline)
    try {
      if (localStorage.getItem(LS_KEY) === 'true') {
        return false;
      }
    } catch (e) {
      // localStorage לא זמין — נמשיך
    }

    // 2. ניסיון לקרוא מ-Firestore
    const uid = getCurrentUid();
    if (!uid) {
      // אין משתמש מחובר — לא מציגים מדריך כרגע
      return false;
    }

    try {
      const completed = await fetchOnboardingFromFirestore(uid);
      if (completed) {
        // מסנכרן ל-local כדי שבפעם הבאה זה יהיה מהיר
        try { localStorage.setItem(LS_KEY, 'true'); } catch (e) { /* ignore */ }
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[Guide] Firestore check failed — assuming new user:', err);
      // ספק טובת המשתמש: אם זה נכשל ויש לנו local — נסמוך על local
      try {
        return localStorage.getItem(LS_KEY) !== 'true';
      } catch (e) {
        return true;
      }
    }
  }

  /**
   * מפעיל את המדריך מהצעד הראשון.
   * משנה ל-#screen-guide.active.
   */
  function start() {
    if (!isInitialized) init();
    if (!elScreen) return;

    currentStep = 1;
    resetAllSteps();
    showStep(1, /* animate */ false);
    updateProgress();
    updateButtons();
    activateScreen();
  }

  /**
   * מסמן שהמדריך הושלם (Firestore + local).
   */
  async function markCompleted() {
    try { localStorage.setItem(LS_KEY, 'true'); } catch (e) { /* ignore */ }

    const uid = getCurrentUid();
    if (!uid) return;

    try {
      await saveOnboardingToFirestore(uid, true);
    } catch (err) {
      console.warn('[Guide] Failed to save completion to Firestore:', err);
      // ה-localStorage יספיק כ-fallback, נסנכרן בפעם הבאה שיש אינטרנט
    }
  }

  // -------------------- ניווט --------------------

  function next() {
    if (isTransitioning) return;
    if (currentStep >= TOTAL_STEPS) {
      finishGuide();
      return;
    }
    transitionToStep(currentStep + 1, 'next');
  }

  function back() {
    if (isTransitioning) return;
    if (currentStep <= 1) return;
    transitionToStep(currentStep - 1, 'back');
  }

  function transitionToStep(newStep, direction) {
    isTransitioning = true;

    const oldEl = elStage.querySelector(`.guide-step[data-step="${currentStep}"]`);
    const newEl = elStage.querySelector(`.guide-step[data-step="${newStep}"]`);

    if (!newEl) {
      isTransitioning = false;
      return;
    }

    const exitClass  = direction === 'next' ? CLASS_EXIT_NEXT  : CLASS_EXIT_BACK;
    const enterClass = direction === 'next' ? CLASS_ENTER_NEXT : CLASS_ENTER_BACK;

    // יוצא: מסיר active, מוסיף exiting
    if (oldEl) {
      oldEl.classList.remove(CLASS_ACTIVE);
      oldEl.classList.add(exitClass);
      setTimeout(() => oldEl.classList.remove(exitClass), 350);
    }

    // נכנס: מוסיף entering, ואז active (גורם לאנימציה)
    newEl.classList.add(enterClass);
    // force reflow כדי שהאנימציה תתחיל מהמיקום ההתחלתי
    void newEl.offsetWidth;
    newEl.classList.remove(enterClass);
    newEl.classList.add(CLASS_ACTIVE);

    currentStep = newStep;
    updateProgress();
    updateButtons();

    setTimeout(() => { isTransitioning = false; }, 350);
  }

  function showStep(stepNum, animate = true) {
    // הצגה ישירה (ללא אנימציית מעבר) — שימוש ב-start()
    elStage.querySelectorAll('.guide-step').forEach(el => {
      el.classList.remove(CLASS_ACTIVE);
    });
    const target = elStage.querySelector(`.guide-step[data-step="${stepNum}"]`);
    if (target) target.classList.add(CLASS_ACTIVE);
  }

  function resetAllSteps() {
    elStage.querySelectorAll('.guide-step').forEach(el => {
      el.classList.remove(
        CLASS_ACTIVE,
        CLASS_EXIT_NEXT, CLASS_ENTER_NEXT,
        CLASS_EXIT_BACK, CLASS_ENTER_BACK
      );
    });
  }

  function updateProgress() {
    if (!elProgressFill) return;
    const percent = (currentStep / TOTAL_STEPS) * 100;
    elProgressFill.style.width = `${percent}%`;
  }

  function updateButtons() {
    // כפתור חזור — מושבת בצעד הראשון
    if (elBackBtn) {
      elBackBtn.disabled = (currentStep === 1);
    }

    // כפתור הבא — משנה לקסט "בוא נתחיל!" בצעד האחרון
    if (elNextLabel && elNextBtn) {
      if (currentStep === TOTAL_STEPS) {
        elNextLabel.textContent = 'בוא נתחיל!';
        elNextBtn.classList.add('guide-finish');
      } else {
        elNextLabel.textContent = 'הבא';
        elNextBtn.classList.remove('guide-finish');
      }
    }
  }

  // -------------------- סיום וניקוי --------------------

  async function finishGuide() {
    await markCompleted();
    deactivateScreen();
    notifyCompleted('finished');
  }

  async function skipGuide() {
    // אישור פשוט — בעתיד אפשר להחליף ל-modal יפה יותר
    const confirmed = confirm('בטוח לדלג על המדריך? תוכל לחזור אליו בהגדרות בעתיד.');
    if (!confirmed) return;

    await markCompleted();
    deactivateScreen();
    notifyCompleted('skipped');
  }

  function activateScreen() {
    // מסיר .active מכל המסכים האחרים
    document.querySelectorAll('.screen').forEach(s => s.classList.remove(CLASS_ACTIVE));
    elScreen.classList.add(CLASS_ACTIVE);
  }

  function deactivateScreen() {
    elScreen.classList.remove(CLASS_ACTIVE);
  }

  /**
   * משדר אירוע ש-app.js תופס ומציג את המסך הראשי.
   * עקרון: guide.js לא יודע ולא מחליט לאן הולכים אחרי — רק מודיע שסיים.
   */
  function notifyCompleted(reason) {
    window.dispatchEvent(new CustomEvent('guide:completed', {
      detail: { reason }   // 'finished' או 'skipped'
    }));
  }

  // -------------------- מאזינים --------------------

  function handleNextClick(e) {
    e.preventDefault();
    next();
  }

  function handleBackClick(e) {
    e.preventDefault();
    back();
  }

  function handleSkipClick(e) {
    e.preventDefault();
    skipGuide();
  }

  function handleKeydown(e) {
    // רק כשהמסך פעיל
    if (!elScreen.classList.contains(CLASS_ACTIVE)) return;

    if (e.key === 'ArrowLeft') {
      // RTL: שמאל = קדימה
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowRight') {
      // RTL: ימין = אחורה
      e.preventDefault();
      back();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      skipGuide();
    }
  }

  // -------------------- Swipe --------------------

  function handleTouchStart(e) {
    if (!e.touches || e.touches.length === 0) return;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
  }

  function handleTouchEnd(e) {
    if (!e.changedTouches || e.changedTouches.length === 0) return;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;
    const dx = endX - touchStartX;
    const dy = endY - touchStartY;
    const elapsed = Date.now() - touchStartTime;

    // לא swipe אם לקח יותר מדי זמן
    if (elapsed > SWIPE_MAX_TIME) return;

    // לא swipe אם התנועה האנכית גדולה מהאופקית (סקרול)
    if (Math.abs(dy) > Math.abs(dx)) return;

    // לא חזק מספיק
    if (Math.abs(dx) < SWIPE_THRESHOLD) return;

    // RTL: swipe ימינה (dx חיובי) = חזור, שמאלה (שלילי) = הבא
    if (dx > 0) {
      back();
    } else {
      next();
    }
  }

  // -------------------- Firestore helpers --------------------

  function getCurrentUid() {
    try {
      // ניסיון 1: window.firebaseAuth (מ-config.js)
      if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        return window.firebaseAuth.currentUser.uid;
      }
      // ניסיון 2: window.AppState
      if (window.AppState && window.AppState.user && window.AppState.user.uid) {
        return window.AppState.user.uid;
      }
    } catch (e) { /* ignore */ }
    return null;
  }

  async function fetchOnboardingFromFirestore(uid) {
    if (!window.firebaseDb || !window.firebaseModules) return false;
    try {
      const { getFirestore, doc, getDoc } = await loadFirestoreFns();
      const db = window.firebaseDb;
      const ref = doc(db, 'users', uid, 'preferences', 'onboarding');
      const snap = await getDoc(ref);
      if (snap.exists()) {
        const data = snap.data();
        return data && data.completed === true;
      }
      return false;
    } catch (err) {
      console.warn('[Guide] fetchOnboardingFromFirestore error:', err);
      return false;
    }
  }

  async function saveOnboardingToFirestore(uid, completed) {
    if (!window.firebaseDb || !window.firebaseModules) {
      throw new Error('Firestore not available');
    }
    const { setDoc, doc } = await loadFirestoreFns();
    const db = window.firebaseDb;
    const ref = doc(db, 'users', uid, 'preferences', 'onboarding');
    await setDoc(ref, {
      completed: completed,
      completedAt: new Date().toISOString()
    }, { merge: true });
  }

  // טעינה דינמית של פונקציות Firestore (לא תמיד נצרכות)
  let _firestoreFns = null;
  async function loadFirestoreFns() {
    if (_firestoreFns) return _firestoreFns;
    const mod = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    _firestoreFns = mod;
    return _firestoreFns;
  }

  // -------------------- חשיפה גלובלית --------------------

  window.Guide = {
    init,
    start,
    shouldShow,
    markCompleted,
    next,
    back
  };

  // אתחול אוטומטי כש-DOM מוכן
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
