/**
 * Booking service — generates the JS injected into the SessionBridge WebView.
 *
 * The bridge page is /facility/cvg/facilityCalendar.do, which exposes:
 *   jf_facilityCalendar(seq)        switch facility
 *   makeCalendar('PREV'|'NEXT')     change month
 *   jf_reservList(cnt,y,m,d,dow)    load a day's registration form
 *   jf_userCnt()                    (re)generate userNm/userNo inputs
 *   jf_regist('2')                  submit the reservation
 *
 * Everything runs in the authenticated page context, so the SSO session
 * cookie and the per-page `layout` token are used automatically.
 *
 * Every script reports back via the SessionBridge envelope:
 *   { __bridge: reqId, kind: 'progress', step }
 *   { __bridge: reqId, kind: 'result', ok, data?, error? }
 */

import type { BookingFormData } from '../types';

/** Per-day availability scraped from the calendar table. */
export interface DayAvailability {
  day: number;
  wait: number | null;
  done: number | null;
  available: number | null;
  /** true when the day exposes booking counts (i.e. is open for booking) */
  hasData: boolean;
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
 * Shared in-page helpers, parameterized by request id + navigation target.
 * `day === 0` means "navigate to the month only" (for calendar scraping).
 */
function helpers(
  reqId: string,
  seq: number,
  year: number,
  monthPadded: string,
  day: number,
  dow: number,
): string {
  const targetCurDate = `${year}.${monthPadded}`;
  return `
  var REQ = ${JSON.stringify(reqId)};
  var TARGET_SEQ = ${seq};
  var T_YEAR = ${year}, T_MONTH = ${JSON.stringify(monthPadded)}, T_DAY = ${day}, T_DOW = ${dow};
  var TARGET_CURDATE = ${JSON.stringify(targetCurDate)};
  var TARGET_DT = T_YEAR + '-' + T_MONTH + '-' + (T_DAY < 10 ? '0' + T_DAY : '' + T_DAY);

  function post(obj) {
    if (window.ReactNativeWebView) {
      obj.__bridge = REQ;
      window.ReactNativeWebView.postMessage(JSON.stringify(obj));
    }
  }
  function progress(step) { post({ kind: 'progress', step: step }); }
  function ok(data) { post({ kind: 'result', ok: true, data: data }); }
  function err(message) { post({ kind: 'result', ok: false, error: message }); }

  function waitFor(cond, onOk, onTimeout, tries, interval) {
    tries = tries == null ? 40 : tries;
    interval = interval == null ? 150 : interval;
    var n = 0;
    (function tick() {
      var done = false;
      try { done = cond(); } catch (e) { done = false; }
      if (done) { onOk(); return; }
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
      var oc = (as[i].getAttribute('href') || '') + (as[i].getAttribute('onclick') || '');
      if (oc.indexOf(marker) !== -1) return as[i];
    }
    return null;
  }
  function formLoadedForTarget() {
    var rd = document.querySelector('#reserveDt');
    return rd && rd.value === TARGET_DT;
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
  function numAfter(text, label) {
    var idx = text.indexOf(label);
    if (idx === -1) return null;
    var m = text.slice(idx + label.length).match(/[0-9]+/);
    return m ? parseInt(m[0], 10) : null;
  }
  function scrapeCalendar() {
    var out = [];
    var cells = document.querySelectorAll('.calendar_area table tbody td, .calendarWrap table tbody td');
    for (var i = 0; i < cells.length; i++) {
      var td = cells[i];
      var a = td.querySelector('a');
      if (!a) continue;
      var dayNum = parseInt((a.textContent || '').trim(), 10);
      if (isNaN(dayNum)) continue;
      var text = td.textContent || '';
      var avail = numAfter(text, '예약 가능');
      out.push({
        day: dayNum,
        wait: numAfter(text, '예약 대기'),
        done: numAfter(text, '예약 완료'),
        available: avail,
        hasData: avail !== null
      });
    }
    return out;
  }

  // Step 1: facility → Step 2: month, then call done().
  function navigateToMonth(done) {
    progress('facility');
    if (activeFacilitySeq() !== String(TARGET_SEQ) && typeof jf_facilityCalendar === 'function') {
      jf_facilityCalendar(String(TARGET_SEQ));
    }
    waitFor(
      function () { return activeFacilitySeq() === String(TARGET_SEQ) || activeFacilitySeq() === ''; },
      function () { stepMonth(done); },
      function () { stepMonth(done); },
      30
    );
  }
  function stepMonth(done) {
    progress('month');
    var guard = 0;
    (function adjust() {
      var cur = curDateText();
      if (!cur || cur === TARGET_CURDATE) { done(); return; }
      if (guard++ > 18) { done(); return; }
      var dir = (cur < TARGET_CURDATE) ? 'NEXT' : 'PREV';
      if (typeof makeCalendar === 'function') makeCalendar(dir);
      waitFor(function () { return curDateText() !== cur; }, adjust, done, 30);
    })();
  }
  // Full path including opening the day's registration form.
  function navigateToDate(done) {
    navigateToMonth(function () {
      progress('day');
      var a = dayAnchor();
      if (a) {
        var href = a.getAttribute('href') || '';
        try {
          if (href.indexOf('javascript:') === 0) { eval(href.substring('javascript:'.length)); }
          else if (a.onclick) { a.onclick(); }
          else { a.click(); }
        } catch (e) { try { a.click(); } catch (e2) {} }
      } else if (typeof jf_reservList === 'function') {
        try { jf_reservList(9, T_YEAR, T_MONTH, T_DAY, T_DOW); } catch (e) {}
      }
      waitFor(
        formLoadedForTarget,
        done,
        function () { err('해당 날짜의 예약 양식을 불러오지 못했습니다. 예약 가능한 날짜인지 확인해주세요.'); },
        40
      );
    });
  }
  `;
}

/**
 * Scrapes per-day availability for a facility + month.
 * Resolves with: { days: DayAvailability[] }
 */
export function availabilityScript(reqId: string, facilitySeq: number, year: number, month: number): string {
  const monthPadded = String(month).padStart(2, '0');
  return `
(function() {
  ${helpers(reqId, facilitySeq, year, monthPadded, 0, 0)}
  try {
    navigateToMonth(function () {
      ok({ days: scrapeCalendar(), reserveMonth: TARGET_CURDATE });
    });
  } catch (e) {
    err('예약 현황을 불러오지 못했습니다.');
  }
  true;
})();
`;
}

/**
 * Navigates to a date and reports its available time slots + purpose options.
 * Resolves with: { available: string[], purposes: {label,value}[] }
 */
export function probeDayScript(reqId: string, facilitySeq: number, reserveDt: string): string {
  const { year, monthPadded, day, dow } = ymd(reserveDt);
  return `
(function() {
  ${helpers(reqId, facilitySeq, year, monthPadded, day, dow)}
  try {
    navigateToDate(function () {
      ok({ reserveDt: TARGET_DT, available: availableSlots(), purposes: purposeOptions() });
    });
  } catch (e) {
    err('시간대 정보를 불러오지 못했습니다.');
  }
  true;
})();
`;
}

/**
 * Fills the real form for a date and submits via jf_regist('2').
 * Resolves with: { success: boolean, message: string }
 * (Domain failures resolve with success:false; only unexpected exceptions reject.)
 */
export function submitScript(reqId: string, data: BookingFormData): string {
  const { year, monthPadded, day, dow } = ymd(data.reserveDt);
  const membersJson = JSON.stringify(data.members);
  const timesJson = JSON.stringify(data.times);
  const contactJson = JSON.stringify(data.contact);
  const purposeJson = JSON.stringify(data.purpose);
  const memberCount = data.memberCount;

  return `
(function() {
  ${helpers(reqId, data.facilitySeq, year, monthPadded, day, dow)}

  var MEMBERS = ${membersJson};
  var TIMES = ${timesJson};
  var CONTACT = ${contactJson};
  var PURPOSE = ${purposeJson};
  var MEMBER_COUNT = ${memberCount};

  var reported = false;
  function finish(success, message) {
    if (reported) return;
    reported = true;
    ok({ success: success, message: message });
  }
  // Capture the system's own dialogs: auto-confirm, learn the outcome text.
  window.confirm = function () { return true; };
  window.alert = function (msg) {
    var t = String(msg || '');
    var good = /(완료|성공|접수|신청되었|등록되었|예약되었)/.test(t);
    var bad = /(실패|오류|불가|중복|이미|초과|없습니다|선택해)/.test(t);
    finish(good && !bad, t || '신청 요청을 보냈습니다.');
  };

  function fillAndSubmit() {
    progress('fill');
    var cntEl = document.querySelector('#userCnt');
    if (cntEl) {
      cntEl.value = String(MEMBER_COUNT);
      if (typeof jf_userCnt === 'function') { try { jf_userCnt(); } catch (e) {} }
    }
    waitFor(
      function () { return document.querySelectorAll('input[name="userNm"]').length >= MEMBER_COUNT; },
      function () {
        var names = document.querySelectorAll('input[name="userNm"]');
        var nos = document.querySelectorAll('input[name="userNo"]');
        for (var i = 0; i < MEMBER_COUNT; i++) {
          if (names[i]) names[i].value = MEMBERS[i] ? MEMBERS[i].name : '';
          if (nos[i]) nos[i].value = MEMBERS[i] ? MEMBERS[i].studentNo : '';
        }
        var mob = document.querySelector('#moblieNo');
        if (mob) mob.value = CONTACT;
        var purp = document.querySelector('#usePurps');
        if (purp) purp.value = PURPOSE;

        var missing = [];
        for (var k = 0; k < TIMES.length; k++) {
          var box = document.querySelector('input[name="reserveTimes"][value="' + TIMES[k] + '"]');
          if (box) { box.checked = true; } else { missing.push(TIMES[k]); }
        }
        if (missing.length > 0) {
          var avail = availableSlots();
          finish(false, '선택한 시간대를 예약할 수 없습니다: ' + missing.join(', ') +
            (avail.length ? '\\n예약 가능: ' + avail.join(', ') : '\\n예약 가능한 시간이 없습니다.'));
          return;
        }

        progress('submit');
        try {
          if (typeof jf_regist === 'function') { jf_regist('2'); }
          else { finish(false, '예약 신청 함수를 찾을 수 없습니다.'); return; }
        } catch (e) {
          finish(false, '제출 중 오류: ' + (e && e.message ? e.message : 'unknown'));
          return;
        }
        // If no dialog fires (page navigated), report an honest optimistic result.
        setTimeout(function () {
          finish(true, '신청 요청을 보냈습니다. \\'내 예약\\'에서 확인해주세요.');
        }, 4000);
      },
      function () { finish(false, '예약자 입력란을 준비하지 못했습니다.'); },
      40
    );
  }

  try {
    navigateToDate(fillAndSubmit);
  } catch (e) {
    err('예약 양식을 불러오지 못했습니다.');
  }
  true;
})();
`;
}
