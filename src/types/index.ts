/**
 * Shared TypeScript types for JNU AI Study Room Booking app
 */

/** Authentication state persisted in AsyncStorage */
export interface AuthState {
  isLoggedIn: boolean;
  userName?: string;
  userId?: string;
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
  /** 시작 시간 "HH:MM" */
  startTime: string;
  /** 종료 시간 "HH:MM" */
  endTime: string;
  /** 사용 인원 수 — userCnt */
  memberCount: number;
  /** 예약자 전원(이름 + 학번) — userNm / userNo */
  members: BookingMember[];
  /** 연락처 — moblieNo (서버 철자 그대로) */
  contact: string;
  /** 이용 목적 코드/값 — usePurps */
  purpose: string;
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
  | { type: 'bookingResult'; ok: boolean; message?: string; status?: number }
  | { type: 'error'; message: string }
  | { type: 'ready' };
