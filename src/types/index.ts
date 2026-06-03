/**
 * Shared TypeScript types for JNU AI Study Room Booking app
 */

/** Authentication state persisted in AsyncStorage */
export interface AuthState {
  isLoggedIn: boolean;
  userName?: string;
  userId?: string;
  userDept?: string;
  /** Unix timestamp (ms) of when the session was created */
  loginTime?: number;
}

/** A single room reservation record */
export interface Reservation {
  id: string;
  date: string;       // ISO date string, e.g. "2026-06-15"
  startTime: string;  // "HH:MM", e.g. "13:00"
  endTime: string;    // "HH:MM", e.g. "15:00"
  room: string;       // Room name / number
  purpose: string;    // Usage purpose
  memberCount: number;
  status: 'confirmed' | 'pending' | 'cancelled';
}

/** One person included in a reservation (name + student number). */
export interface BookingMember {
  /** 사용자 이름 */
  name: string;
  /** 학번 */
  studentNo: string;
}

/**
 * Everything the native booking form collects before submission.
 * Field names mirror the server parameters inferred from the
 * myList.do query string (userCnt, userNm, userNo, moblieNo, usePurps…).
 */
export interface BookingFormData {
  /** 시설(스터디룸) 식별자 — facilitySeq */
  facilitySeq: number;
  /** 예약 날짜 "YYYY-MM-DD" — reserveDt */
  reserveDt: string;
  /**
   * 선택한 예약 시간대 — reserveTimes 체크박스 값들.
   * 각 항목은 "HH:MM~HH:MM" 형식 (예: "13:00~14:00").
   */
  times: string[];
  /** 사용 인원 수 — userCnt */
  memberCount: number;
  /** 예약자 전원(이름 + 학번) — userNm / userNo */
  members: BookingMember[];
  /** 연락처 — moblieNo (서버 철자 그대로) */
  contact: string;
  /** 이용 목적 값 — usePurps (option value 그대로 전송) */
  purpose: string;
}

/** Available time slots + purpose options extracted from a date's real form. */
export interface DaySlotInfo {
  reserveDt: string;
  /** 예약 가능한 시간대 ("HH:MM~HH:MM") */
  available: string[];
  /** 이용목적 옵션 (label/value) */
  purposes: { label: string; value: string }[];
}

/** One row from the "내 예약" (myList.do) page. */
export interface MyReservation {
  /** 게시글/예약 식별자 (jf_artclView의 두 번째 인자) */
  seq: string;
  /** 목록 번호 */
  no: string;
  /** 시설명 (룸) */
  room: string;
  /** 예약일 "YYYY-MM-DD" */
  date: string;
  /** 시간 "HH:MM~HH:MM" */
  time: string;
  /** 신청일 "YYYY-MM-DD" */
  appliedDate: string;
  /** 승인여부 원문 (예: "승인", "대기") */
  status: string;
}

/** Result of a reservation submission attempt. */
export type BookingResult =
  | { ok: true; message?: string }
  | { ok: false; message: string };

/** Bottom tab navigator route names */
export type TabParamList = {
  index: undefined;
  reservations: undefined;
  settings: undefined;
};

/** WebView postMessage payloads sent from injected scripts */
export type WebViewMessage =
  | { type: 'userInfo'; name: string; id: string }
  | { type: 'bookingResult'; ok: boolean; message?: string }
  | { type: 'slotInfo'; reserveDt: string; available: string[]; purposes: { label: string; value: string }[] }
  | { type: 'progress'; step: string }
  | { type: 'error'; message: string }
  | { type: 'ready' };
