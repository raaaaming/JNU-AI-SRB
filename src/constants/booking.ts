/**
 * Booking form configuration — confirmed against the real facility form
 * (/facility/cvg/facilityCalendar.do).
 */

/** Selectable facilities, by their facilitySeq. */
export interface RoomOption {
  label: string;
  facilitySeq: number;
}

export const ROOMS: RoomOption[] = [
  { label: '스터디룸1 (학생)', facilitySeq: 344 },
  { label: '스터디룸2 (학생)', facilitySeq: 345 },
  { label: '회의실 (교직원)', facilitySeq: 339 },
];

/**
 * 이용 목적 options.
 * `value` must match the server's <option value> EXACTLY (note: "스터디 "
 * carries a trailing space on the live form). `label` is the trimmed display.
 */
export interface PurposeOption {
  label: string;
  value: string;
}

export const PURPOSE_OPTIONS: PurposeOption[] = [
  { label: '동아리 및 소모임', value: '동아리 및 소모임' },
  { label: '스터디', value: '스터디 ' },
];

/**
 * Default selectable hourly slots, used until the live form reports the
 * date's actual availability. Format matches `reserveTimes` checkbox values.
 */
export const OPERATING = {
  /** First slot start hour (24h) */
  openHour: 9,
  /** Last slot END hour (24h) */
  closeHour: 22,
} as const;

/** Minimum / maximum people on a single reservation. */
export const MEMBER_LIMITS = {
  min: 1,
  max: 8,
} as const;

/**
 * Generates the full set of hourly slot labels "HH:MM~HH:MM"
 * between openHour and closeHour, e.g. "09:00~10:00" … "21:00~22:00".
 */
export function generateSlots(): string[] {
  const slots: string[] = [];
  for (let h = OPERATING.openHour; h < OPERATING.closeHour; h++) {
    const start = `${String(h).padStart(2, '0')}:00`;
    const end = `${String(h + 1).padStart(2, '0')}:00`;
    slots.push(`${start}~${end}`);
  }
  return slots;
}
