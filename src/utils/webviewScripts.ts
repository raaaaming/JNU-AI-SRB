/**
 * JavaScript injection scripts for WebView pages.
 *
 * All scripts must be valid JS strings that can be passed to
 * `injectedJavaScript` or executed via `injectJavaScript()`.
 * Each script must NOT rely on ES modules (no import/export).
 */

/** CSS selectors for elements to hide in the university portal */
const HIDE_SELECTORS = [
  '.header',
  '.footer',
  '#header',
  '#footer',
  '.gnb',
  '.lnb',
  '.breadcrumb',
  '.sub_head',
  '.location',
  '.btn_go_top',
  '.quick_menu',
  '.bg_dim',
  'nav',
  'header',
  'footer',
].join(', ');

/**
 * Injected into every WebView page:
 * - Hides portal chrome (header, nav, footer, etc.)
 * - Applies mobile-friendly base CSS
 */
export const CLEANUP_SCRIPT = `
(function() {
  try {
    // --- Hide portal chrome ---
    var styleEl = document.createElement('style');
    styleEl.id = '__jnu_app_style__';
    styleEl.textContent = [
      '${HIDE_SELECTORS} { display: none !important; }',

      /* Mobile-friendly base styles */
      'html, body {',
      '  font-size: 16px !important;',
      '  -webkit-text-size-adjust: 100% !important;',
      '  overflow-x: hidden !important;',
      '  scroll-behavior: smooth !important;',
      '}',

      /* Tap targets */
      'button, a, input[type="button"], input[type="submit"], .btn {',
      '  min-height: 44px !important;',
      '  min-width: 44px !important;',
      '  display: inline-flex !important;',
      '  align-items: center !important;',
      '  justify-content: center !important;',
      '  cursor: pointer !important;',
      '}',

      /* JNU brand buttons */
      '.btn_blue, .btn-primary, button[type="submit"] {',
      '  background-color: #003087 !important;',
      '  border-color: #003087 !important;',
      '  color: #ffffff !important;',
      '}',

      /* Remove unnecessary top margin from content pushed down by hidden header */
      '#content, .content_wrap, .container, #container {',
      '  margin-top: 0 !important;',
      '  padding-top: 8px !important;',
      '}',

      /* Ensure full-width layout */
      '#wrap, .wrap, #wrapper, .wrapper {',
      '  width: 100% !important;',
      '  max-width: 100% !important;',
      '  padding: 0 !important;',
      '  margin: 0 !important;',
      '}',
    ].join(' ');

    if (!document.getElementById('__jnu_app_style__')) {
      document.head.appendChild(styleEl);
    }
  } catch(e) {
    // Silently ignore errors so the page still loads
  }
  true; // Required for Android WebView
})();
`;

/**
 * Attempts to read logged-in user info from the page and postMessages it
 * back to React Native.
 *
 * Expected postMessage format:
 *   { type: 'userInfo', name: string, id: string }
 */
export const EXTRACT_USER_SCRIPT = `
(function() {
  try {
    var name = '';
    var id = '';

    // Common selectors used in JNU portal pages
    var nameSelectors = [
      '.user_name', '.userName', '#userName',
      '.member_name', '.login_name', '.user-name',
      '[class*="user_nm"]', '[class*="userNm"]',
    ];
    var idSelectors = [
      '.user_id', '.userId', '#userId',
      '.member_id', '.login_id', '.user-id',
      '[class*="user_id"]', '[class*="userId"]',
    ];

    for (var i = 0; i < nameSelectors.length; i++) {
      var el = document.querySelector(nameSelectors[i]);
      if (el && el.textContent.trim()) {
        name = el.textContent.trim();
        break;
      }
    }

    for (var j = 0; j < idSelectors.length; j++) {
      var idEl = document.querySelector(idSelectors[j]);
      if (idEl && idEl.textContent.trim()) {
        id = idEl.textContent.trim();
        break;
      }
    }

    // Also try meta tags or hidden inputs
    if (!id) {
      var hiddenId = document.querySelector('input[name="userId"]') ||
                     document.querySelector('input[name="loginId"]');
      if (hiddenId) id = hiddenId.value || '';
    }

    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'userInfo', name: name, id: id })
      );
    }
  } catch(e) {
    // Ignore
  }
  true;
})();
`;

/**
 * Probes a cvg.jnu.ac.kr page to decide whether the SSO session is actually
 * authenticated — landing on cvg is NOT proof, because the facility calendar
 * is publicly viewable.
 *
 *  - If a "로그아웃" control exists → authenticated. Reads the user's name and
 *    posts { type: 'authState', authed: true, name, id }.
 *  - Else if a "로그인" control exists → not authenticated. Posts
 *    { type: 'authState', authed: false } and clicks it to launch the site's
 *    own SSO login (which returns to cvg, not the generic portal).
 *  - Else posts { type: 'authState', authed: false, noControls: true }.
 */
export const AUTH_PROBE_SCRIPT = `
(function() {
  function post(o) { if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  var attempts = 0;
  function probe() {
    attempts++;
    try {
      var nodes = document.querySelectorAll('a, button, input[type="button"], input[type="submit"]');
      var logoutEl = null, loginEl = null;
      for (var i = 0; i < nodes.length; i++) {
        var el = nodes[i];
        var t = (el.textContent || el.value || '').replace(/\\s+/g, '');
        var attr = (((el.getAttribute && el.getAttribute('onclick')) || '') + ' ' +
                    ((el.getAttribute && el.getAttribute('href')) || '')).toLowerCase();
        var isLogout = t.indexOf('로그아웃') >= 0 || attr.indexOf('logout') >= 0;
        var isLogin = !isLogout && (t.indexOf('로그인') >= 0 ||
                      (attr.indexOf('login') >= 0 && attr.indexOf('logout') < 0));
        if (!logoutEl && isLogout) logoutEl = el;
        if (!loginEl && isLogin) loginEl = el;
      }
      if (logoutEl) {
        var name = '';
        var nameSel = ['.user_name', '.userName', '#userName', '.member_name',
          '.login_name', '[class*="user_nm"]', '[class*="userNm"]'];
        for (var n = 0; n < nameSel.length; n++) {
          var ne = document.querySelector(nameSel[n]);
          if (ne && ne.textContent && ne.textContent.trim()) { name = ne.textContent.trim(); break; }
        }
        post({ type: 'authState', authed: true, name: name, id: '' });
        return;
      }
      if (loginEl) {
        post({ type: 'authState', authed: false, foundLogin: true });
        setTimeout(function () {
          // Prefer navigating to the link's resolved URL (cvg login links are
          // usually plain anchors to the SSO endpoint); fall back to a click
          // for JS-driven handlers.
          var abs = loginEl.href || '';
          var raw = (loginEl.getAttribute && loginEl.getAttribute('href')) || '';
          if (abs && raw.charAt(0) !== '#' && /^https?:/i.test(abs)) {
            window.location.href = abs;
          } else {
            try { loginEl.click(); } catch (e) {}
          }
        }, 80);
        return;
      }
      // Header/controls may not be rendered yet — retry a few times before
      // giving up, so a slightly slow page doesn't stall login detection.
      if (attempts < 8) { setTimeout(probe, 400); return; }
      // No login control found on the cvg page → let RN navigate straight to
      // the SSO login URL as a fallback.
      post({ type: 'authState', authed: false, noControls: true });
    } catch (e) {
      if (attempts < 8) { setTimeout(probe, 400); return; }
      post({ type: 'authState', authed: false, error: String(e) });
    }
  }
  probe();
  true;
})();
`;

/**
 * Builds a script that fills the SSO "아이디" (ID/password) login tab with the
 * given credentials and submits it, driving the real SSO page.
 *
 * Targets the confirmed markup of sso.jnu.ac.kr/Idp/Login.aspx:
 *   - tab anchor:  a[href="#login-tab-4"]   (아이디 tab)
 *   - id input:    #mfaUserIdOtp
 *   - pw input:    #mfaUserPwdOtp
 *   - submit btn:  #btnOtpAuthSubmit (type=button, JS handler → sends OTP)
 *
 * Values are dispatched with input/change events so any page listeners pick
 * them up. After submit the page advances to the OTP / trusted-device step,
 * which we surface in the WebView itself.
 *
 * Posts back: { type: 'credFilled', okId, okPw } or { type: 'credError', error }
 */
export function buildFillCredentialsScript(userId: string, password: string): string {
  return `
(function() {
  function post(o) { if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  function setVal(el, val) {
    if (!el) return false;
    el.focus && el.focus();
    el.value = val;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    el.dispatchEvent(new Event('keyup', { bubbles: true }));
    return true;
  }
  try {
    var tab = document.querySelector('a[href="#login-tab-4"]');
    if (tab) { try { tab.click(); } catch (e) {} }
    var doFill = function () {
      var id = document.getElementById('mfaUserIdOtp');
      var pw = document.getElementById('mfaUserPwdOtp');
      var okId = setVal(id, ${JSON.stringify(userId)});
      var okPw = setVal(pw, ${JSON.stringify(password)});
      post({ type: 'credFilled', okId: okId, okPw: okPw });
      var btn = document.getElementById('btnOtpAuthSubmit');
      setTimeout(function () { if (btn) { try { btn.click(); } catch (e) {} } }, 200);
    };
    // The tab switch is a CSS animation; give it a beat before filling.
    setTimeout(doFill, 250);
  } catch (e) {
    post({ type: 'credError', error: String(e) });
  }
  true;
})();
`;
}

/**
 * Runs on an sso.jnu.ac.kr page and reports which step is showing, so the
 * native UI can mirror it:
 *   - 'otp'         → #otpDigitGroup present (2-step code entry); includes timer
 *   - 'credentials' → #mfaUserIdOtp / #userId present (id/pw form); includes any
 *                     error text shown in #mfaOtpStatus
 *   - 'other'       → neither found after retries
 *
 * Posts: { type: 'ssoStep', step, timer?, error? }
 */
export const SSO_STEP_PROBE = `
(function() {
  function post(o) { if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  var n = 0;
  function txt(id) { var el = document.getElementById(id); return el ? (el.textContent || '').trim() : ''; }
  function check() {
    if (document.getElementById('otpDigitGroup')) {
      post({ type: 'ssoStep', step: 'otp', timer: txt('otpPageTimer') });
      return true;
    }
    if (document.getElementById('mfaUserIdOtp') || document.getElementById('userId')) {
      post({ type: 'ssoStep', step: 'credentials', error: txt('mfaOtpStatus') || txt('mfaPwdlessStatus') });
      return true;
    }
    return false;
  }
  (function loop() {
    if (check()) return;
    if (++n < 12) { setTimeout(loop, 300); return; }
    post({ type: 'ssoStep', step: 'other' });
  })();
  true;
})();
`;

/** Reads the OTP countdown timer and posts it: { type: 'otpTimer', value } */
export const OTP_TIMER_SCRIPT = `
(function() {
  try {
    var t = document.getElementById('otpPageTimer');
    if (t && window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'otpTimer', value: (t.textContent || '').trim() }));
    }
  } catch (e) {}
  true;
})();
`;

/** Opens the official "문자 및 이메일로 받기" delivery modal in the page. */
export const OTP_REQUEST_SMS_SCRIPT = `
(function() {
  try { var b = document.getElementById('btnOtpMethodSmsEmail'); if (b) b.click(); } catch (e) {}
  true;
})();
`;

/** Cancels 2-step auth by following the page's 인증취소 link. */
export const OTP_CANCEL_SCRIPT = `
(function() {
  try {
    var nodes = document.querySelectorAll('a');
    for (var i = 0; i < nodes.length; i++) {
      if ((nodes[i].textContent || '').indexOf('인증취소') >= 0 && nodes[i].href) {
        window.location.href = nodes[i].href;
        return;
      }
    }
  } catch (e) {}
  true;
})();
`;

/**
 * Fills the 6 OTP digit boxes (#otpDigitGroup input.otp-digit) with the given
 * code and, if requested, ticks "신뢰할 수 있는 기기 등록" (#trustDevice) BEFORE
 * filling — so the page's auto-verify (which fires once all digits are entered)
 * registers the device. Dispatches input/keyup per box to drive that handler.
 *
 * Posts: { type: 'otpResult', ok, error? }
 */
export function buildFillOtpScript(code: string, trust: boolean): string {
  return `
(function() {
  function post(o) { if (window.ReactNativeWebView) { window.ReactNativeWebView.postMessage(JSON.stringify(o)); } }
  try {
    var group = document.getElementById('otpDigitGroup');
    if (!group) { post({ type: 'otpResult', ok: false, error: '인증번호 입력란을 찾지 못했습니다.' }); return; }
    var boxes = group.querySelectorAll('input.otp-digit');
    var digits = ${JSON.stringify(code)}.replace(/[^0-9]/g, '').split('');
    if (digits.length < boxes.length) {
      post({ type: 'otpResult', ok: false, error: '인증번호 ' + boxes.length + '자리를 입력해주세요.' });
      return;
    }
    ${trust ? `var tc = document.getElementById('trustDevice'); if (tc && !tc.checked) { try { tc.click(); } catch (e) { tc.checked = true; } }` : ``}
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      b.focus && b.focus();
      b.value = digits[i] || '';
      b.dispatchEvent(new Event('input', { bubbles: true }));
      try { b.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: digits[i] || '' })); } catch (e) {}
    }
    var last = boxes[boxes.length - 1];
    if (last) {
      last.focus && last.focus();
      last.dispatchEvent(new Event('input', { bubbles: true }));
      try { last.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: digits[digits.length - 1] || '' })); } catch (e) {}
      last.blur && last.blur();
    }
    post({ type: 'otpResult', ok: true });
  } catch (e) {
    post({ type: 'otpResult', ok: false, error: String(e) });
  }
  true;
})();
`;
}

/**
 * Builds a combined injection script that includes CLEANUP_SCRIPT
 * plus any additional custom CSS provided by the caller.
 *
 * @param additionalCSS - Optional raw CSS string to append
 * @returns A single JS string ready for use in `injectedJavaScript`
 */
export function buildInjectionScript(additionalCSS?: string): string {
  if (!additionalCSS) return CLEANUP_SCRIPT;

  return `
${CLEANUP_SCRIPT}

(function() {
  try {
    var extraStyle = document.createElement('style');
    extraStyle.id = '__jnu_extra_style__';
    extraStyle.textContent = ${JSON.stringify(additionalCSS)};
    if (!document.getElementById('__jnu_extra_style__')) {
      document.head.appendChild(extraStyle);
    }
  } catch(e) {}
  true;
})();
`;
}
