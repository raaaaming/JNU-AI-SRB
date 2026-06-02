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
        post({ type: 'authState', authed: false });
        setTimeout(function () {
          try { loginEl.click(); }
          catch (e) {
            var h = loginEl.getAttribute && loginEl.getAttribute('href');
            if (h && h.charAt(0) !== '#') { window.location.href = h; }
          }
        }, 80);
        return;
      }
      // Header/controls may not be rendered yet — retry a few times before
      // giving up, so a slightly slow page doesn't stall login detection.
      if (attempts < 8) { setTimeout(probe, 400); return; }
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
