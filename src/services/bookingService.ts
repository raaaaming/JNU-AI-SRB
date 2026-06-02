/**
 * Booking submission service.
 *
 * Strategy: instead of calling the reservation endpoint from React Native's
 * `fetch` (whose cookie jar does NOT share the WebView's SSO session on
 * Android), we generate a JS snippet that runs *inside* a WebView pointed at
 * cvg.jnu.ac.kr. There, a same-origin `fetch` automatically carries the
 * authenticated session cookie. The result is posted back via
 * `window.ReactNativeWebView.postMessage`.
 *
 * ⚠️ ENDPOINT + PARAM MAPPING ARE BEST-EFFORT and must be confirmed against
 * the real booking form. Everything that needs verification is centralized
 * in `RESERVATION_ENDPOINT` and `buildServerParams()` below.
 */

import type { BookingFormData } from '../types';

/**
 * Path of the reservation insert handler (relative to https://cvg.jnu.ac.kr).
 *
 * Inferred sibling of the known endpoints:
 *   - /facility/cvg/myList.do            (조회)
 *   - /facility/cvg/facilityCalendar.do  (캘린더)
 *   - /facility/cvg/insert.do            (신청 ← 추정)
 *
 * TODO: confirm via the booking form's <form action> or the Network tab.
 */
export const RESERVATION_ENDPOINT = '/facility/cvg/insert.do';

/**
 * Maps the app's BookingFormData to the server's expected parameter names.
 *
 * Names mirror those decoded from the myList.do query string:
 *   facilitySeq, reserveDt, userCnt, userNm, userNo, moblieNo, usePurps.
 * Applicant identity (insertUserNm / insertUserId) is taken from the
 * logged-in session server-side, so we don't send it.
 *
 * Returns an array of [key, value] pairs (arrays use repeated keys).
 */
export function buildServerParams(
  data: BookingFormData,
): Array<[string, string]> {
  const params: Array<[string, string]> = [];

  params.push(['facilitySeq', String(data.facilitySeq)]);
  params.push(['reserveDt', data.reserveDt]);
  params.push(['userCnt', String(data.memberCount)]);
  params.push(['moblieNo', data.contact]); // server's spelling
  params.push(['usePurps', data.purpose]);

  // Time fields — exact names unconfirmed; send common variants.
  // TODO: confirm the real start/end-time parameter names.
  params.push(['startTime', data.startTime]);
  params.push(['endTime', data.endTime]);
  params.push(['useBgngTm', data.startTime.replace(':', '')]); // e.g. "1300"
  params.push(['useEndTm', data.endTime.replace(':', '')]);

  // Each member as a repeated userNm / userNo pair.
  for (const m of data.members) {
    params.push(['userNm', m.name]);
    params.push(['userNo', m.studentNo]);
  }

  return params;
}

/**
 * Builds the JS to inject into the WebView to perform the reservation POST.
 * The result is reported back via postMessage as:
 *   { type: 'bookingResult', ok: boolean, message?: string, status?: number }
 */
export function buildSubmitScript(data: BookingFormData): string {
  const pairs = buildServerParams(data);

  // Serialize safely into the script.
  const serialized = JSON.stringify(pairs);
  const endpoint = JSON.stringify(RESERVATION_ENDPOINT);

  return `
(function() {
  function report(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(
        Object.assign({ type: 'bookingResult' }, payload)
      ));
    }
  }

  try {
    var pairs = ${serialized};
    var body = new URLSearchParams();
    for (var i = 0; i < pairs.length; i++) {
      body.append(pairs[i][0], pairs[i][1]);
    }

    fetch(${endpoint}, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With': 'XMLHttpRequest'
      },
      credentials: 'include',
      body: body.toString()
    })
    .then(function(res) {
      var status = res.status;
      return res.text().then(function(text) {
        // Heuristic success detection — refine once the real response is known.
        var lower = (text || '').toLowerCase();
        var looksLikeError =
          status >= 400 ||
          lower.indexOf('error') !== -1 ||
          text.indexOf('실패') !== -1 ||
          text.indexOf('오류') !== -1 ||
          text.indexOf('로그인') !== -1;
        var looksLikeSuccess =
          text.indexOf('완료') !== -1 ||
          text.indexOf('성공') !== -1 ||
          (status >= 200 && status < 300 && !looksLikeError);

        report({
          ok: !!looksLikeSuccess && !looksLikeError,
          status: status,
          message: looksLikeSuccess ? '예약이 접수되었습니다.' :
                   (looksLikeError ? '예약에 실패했습니다. 시간/중복 여부를 확인해주세요.' :
                    '응답을 확인할 수 없습니다.')
        });
      });
    })
    .catch(function(err) {
      report({ ok: false, message: '네트워크 오류: ' + (err && err.message ? err.message : 'unknown') });
    });
  } catch (e) {
    report({ ok: false, message: '제출 중 오류가 발생했습니다.' });
  }

  true;
})();
`;
}
