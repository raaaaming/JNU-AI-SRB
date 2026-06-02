/**
 * Booking submission service.
 *
 * Rather than reverse-engineering the reservation endpoint + CSRF-like
 * `layout` token, we DRIVE THE REAL FORM inside a WebView pointed at
 * /facility/cvg/facilityCalendar.do. The page already exposes the helper
 * functions we need:
 *   - jf_facilityCalendar(seq)          switch facility
 *   - makeCalendar('PREV'|'NEXT')       change month
 *   - jf_reservList(cnt,y,m,d,dow)      load a day's registration form
 *   - jf_userCnt()                      (re)generate userNm/userNo inputs
 *   - jf_regist('2')                    submit the reservation
 *
 * Because everything runs in the page's own (authenticated) context, the
 * SSO session cookie and the per-page `layout` token are used automatically.
 *
 * Two scripts are produced:
 *   - buildProbeScript:  navigate to a date, report available time slots.
 *   - buildSubmitScript: navigate to a date, fill the form, submit it.
 */

import type { BookingFormData } from '../types';

/** Day-of-week (0=Sun) for a "YYYY-MM-DD" string, matching JS getDay(). */
function dowOf(reserveDt: string): number {
  const [y, m, d] = reserveDt.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

function ymd(reserveDt: string) {
  const [y, m, d] = reserveDt.split('-').map(Number);
  return {
    year: y,
    monthPadded: String(m).padStart(2, '0'),
    day: d,
    dow: new Date(y, m - 1, d).getDay(),
  };
}

/**
 * Shared in-page helpers: a small poller and a routine that navigates the
 * calendar to a target facility + date and waits for the registration form.
 * Injected as a string prefix to both scripts.
 */
function navHelpers(facilitySeq: number, reserveDt: string): string {
  const { year, monthPadded, day, dow } = ymd(reserveDt);
  const targetCurDate = `${year}.${monthPadded}`;

  return `
  var TARGET_SEQ = ${facilitySeq};
  var TARGET_DT = ${JSON.stringify(reserveDt)};
  var TARGET_CURDATE = ${JSON.stringify(targetCurDate)};
  var T_YEAR = ${year}, T_MONTH = ${JSON.stringify(monthPadded)}, T_DAY = ${day}, T_DOW = ${dow};

  function send(payload) {
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(JSON.stringify(payload));
    }
  }
  function progress(step) { send({ type: 'progress', step: step }); }
  function fail(message) { send({ type: 'bookingResult', ok: false, message: message }); }

  // Poll until cond() is truthy; then ok(); else onTimeout() after tries.
  function waitFor(cond, ok, onTimeout, tries, interval) {
    tries = tries == null ? 40 : tries;
    interval = interval == null ? 150 : interval;
    var n = 0;
    (function tick() {
      var done = false;
      try { done = cond(); } catch (e) { done = false; }
      if (done) { ok(); return; }
      if (++n >= tries) { onTimeout(); return; }
      setTimeout(tick, interval);
    })();
  }

  function curDateText() {
    var el = document.querySelector('#curDate');
    return el ? el.textContent.trim() : '';
  }
  function activeFacilitySeq() {
    var el = document.querySelector('#facilitySeq');
    return el ? String(el.value) : '';
  }
  function dayAnchor() {
    var marker = ',' + T_YEAR + ',' + T_MONTH + ',' + T_DAY + ',';
    var as = document.querySelectorAll('.calendar_area a, .calendarWrap a');
    for (var i = 0; i < as.length; i++) {
      var oc = as[i].getAttribute('href') || '';
      var on = as[i].getAttribute('onclick') || '';
      if (oc.indexOf(marker) !== -1 || on.indexOf(marker) !== -1) return as[i];
    }
    return null;
  }
  function formLoadedForTarget() {
    var rd = document.querySelector('#reserveDt');
    return rd && rd.value === TARGET_DT;
  }

  // Step 1: ensure facility, Step 2: month, Step 3: open the day's form.
  function navigateToDate(done) {
    progress('facility');
    if (activeFacilitySeq() !== String(TARGET_SEQ) && typeof jf_facilityCalendar === 'function') {
      jf_facilityCalendar(String(TARGET_SEQ));
    }
    waitFor(
      function () { return activeFacilitySeq() === String(TARGET_SEQ) || activeFacilitySeq() === ''; },
      function () { stepMonth(done); },
      function () { stepMonth(done); }, // proceed anyway
      30
    );
  }

  function stepMonth(done) {
    progress('month');
    var guard = 0;
    function adjust() {
      var cur = curDateText(); // "YYYY.MM"
      if (!cur || cur === TARGET_CURDATE) { stepDay(done); return; }
      if (guard++ > 18) { stepDay(done); return; }
      var dir = (cur < TARGET_CURDATE) ? 'NEXT' : 'PREV';
      if (typeof makeCalendar === 'function') makeCalendar(dir);
      waitFor(function () { return curDateText() !== cur; }, adjust, function () { stepDay(done); }, 30);
    }
    adjust();
  }

  function stepDay(done) {
    progress('day');
    var a = dayAnchor();
    if (a) {
      var href = a.getAttribute('href') || '';
      try {
        if (href.indexOf('javascript:') === 0) { eval(href.substring('javascript:'.length)); }
        else if (a.onclick) { a.onclick(); }
        else { a.click(); }
      } catch (e) { a.click(); }
    } else if (typeof jf_reservList === 'function') {
      try { jf_reservList(9, T_YEAR, T_MONTH, T_DAY, T_DOW); } catch (e) {}
    }
    waitFor(
      formLoadedForTarget,
      function () { done(); },
      function () { fail('해당 날짜의 예약 양식을 불러오지 못했습니다. 예약 가능한 날짜인지 확인해주세요.'); },
      40
    );
  }

  function availableSlots() {
    var boxes = document.querySelectorAll('input[name="reserveTimes"]');
    var out = [];
    for (var i = 0; i < boxes.length; i++) out.push(boxes[i].value);
    return out;
  }
  function purposeOptions() {
    var opts = document.querySelectorAll('#usePurps option');
    var out = [];
    for (var i = 0; i < opts.length; i++) {
      if (opts[i].value) out.push({ label: opts[i].textContent.trim(), value: opts[i].value });
    }
    return out;
  }
  `;
}

/**
 * Probe script: navigate to a date and report its available time slots
 * and purpose options (does NOT submit). Result:
 *   { type: 'slotInfo', reserveDt, available: string[], purposes: [...] }
 */
export function buildProbeScript(facilitySeq: number, reserveDt: string): string {
  return `
(function() {
  ${navHelpers(facilitySeq, reserveDt)}
  try {
    navigateToDate(function () {
      send({
        type: 'slotInfo',
        reserveDt: TARGET_DT,
        available: availableSlots(),
        purposes: purposeOptions()
      });
    });
  } catch (e) {
    fail('시간대 정보를 불러오지 못했습니다.');
  }
  true;
})();
`;
}

/**
 * Submit script: navigate to the date, fill the real form, and submit via
 * jf_regist('2'). Hijacks confirm()/alert() so any confirmation auto-proceeds
 * and the result message is captured. Result:
 *   { type: 'bookingResult', ok: boolean, message?: string }
 */
export function buildSubmitScript(data: BookingFormData): string {
  const membersJson = JSON.stringify(data.members);
  const timesJson = JSON.stringify(data.times);
  const contactJson = JSON.stringify(data.contact);
  const purposeJson = JSON.stringify(data.purpose);
  const memberCount = data.memberCount;

  return `
(function() {
  ${navHelpers(data.facilitySeq, data.reserveDt)}

  var MEMBERS = ${membersJson};
  var TIMES = ${timesJson};
  var CONTACT = ${contactJson};
  var PURPOSE = ${purposeJson};
  var MEMBER_COUNT = ${memberCount};

  // Capture the system's own alert/confirm so we can auto-proceed and learn
  // the outcome. jf_regist typically alert()s a success/failure message.
  var reported = false;
  function reportResult(text) {
    if (reported) return;
    reported = true;
    var t = String(text || '');
    var ok = /(완료|성공|접수|신청되었|등록되었|예약되었)/.test(t);
    var fail = /(실패|오류|불가|중복|이미|초과|없습니다|선택)/.test(t);
    send({ type: 'bookingResult', ok: ok && !fail, message: t || '신청 요청을 보냈습니다.' });
  }
  window.confirm = function () { return true; };
  window.alert = function (msg) { reportResult(msg); };

  function fillAndSubmit() {
    progress('fill');

    // 1) Member count → regenerate name/id inputs
    var cntEl = document.querySelector('#userCnt');
    if (cntEl) {
      cntEl.value = String(MEMBER_COUNT);
      if (typeof jf_userCnt === 'function') { try { jf_userCnt(); } catch (e) {} }
    }

    waitFor(
      function () {
        return document.querySelectorAll('input[name="userNm"]').length >= MEMBER_COUNT;
      },
      function () {
        var names = document.querySelectorAll('input[name="userNm"]');
        var nos = document.querySelectorAll('input[name="userNo"]');
        for (var i = 0; i < MEMBER_COUNT; i++) {
          if (names[i]) names[i].value = MEMBERS[i] ? MEMBERS[i].name : '';
          if (nos[i]) nos[i].value = MEMBERS[i] ? MEMBERS[i].studentNo : '';
        }

        // 2) Contact + purpose
        var mob = document.querySelector('#moblieNo');
        if (mob) mob.value = CONTACT;
        var purp = document.querySelector('#usePurps');
        if (purp) purp.value = PURPOSE;

        // 3) Time checkboxes — verify each chosen slot is available
        var missing = [];
        for (var k = 0; k < TIMES.length; k++) {
          var box = document.querySelector('input[name="reserveTimes"][value="' + TIMES[k] + '"]');
          if (box) { box.checked = true; }
          else { missing.push(TIMES[k]); }
        }
        if (missing.length > 0) {
          var avail = availableSlots();
          fail('선택한 시간대를 예약할 수 없습니다: ' + missing.join(', ') +
               (avail.length ? '\\n예약 가능: ' + avail.join(', ') : '\\n예약 가능한 시간이 없습니다.'));
          return;
        }

        // 4) Submit via the page's own handler
        progress('submit');
        try {
          if (typeof jf_regist === 'function') { jf_regist('2'); }
          else { fail('예약 신청 함수를 찾을 수 없습니다.'); return; }
        } catch (e) {
          fail('제출 중 오류: ' + (e && e.message ? e.message : 'unknown'));
          return;
        }

        // Fallback: if no alert fires within 4s (e.g. page navigated), report
        // an optimistic, honest message so the user can verify in "내 예약".
        setTimeout(function () {
          if (!reported) {
            send({ type: 'bookingResult', ok: true, message: '신청 요청을 보냈습니다. \\'내 예약\\'에서 확인해주세요.' });
            reported = true;
          }
        }, 4000);
      },
      function () { fail('예약자 입력란을 준비하지 못했습니다.'); },
      40
    );
  }

  try {
    navigateToDate(fillAndSubmit);
  } catch (e) {
    fail('예약 양식을 불러오지 못했습니다.');
  }
  true;
})();
`;
}
