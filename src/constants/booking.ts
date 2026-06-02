/**
 * Booking form configuration.
 *
 * ⚠️ The values below are best-effort defaults inferred from the public
 * site and the myList.do query string. Confirm against the real booking
 * page and adjust here — this is the single place to update.
 */

import { FACILITY_SEQ } from './urls';

/**
 * Selectable study rooms.
 * TODO: confirm the real room list + their facilitySeq values.
 * For now we expose the known AI-college facility.
 */
export interface RoomOption {
  label: string;
  facilitySeq: number;
}

export const ROOMS: RoomOption[] = [
  { label: 'AI융합대학 스터디룸', facilitySeq: FACILITY_SEQ },
];

/**
 * 이용 목적 options.
 * TODO: replace with the exact <option> values from the booking form's
 * usePurps dropdown (label shown to user, value sent to server).
 */
export interface PurposeOption {
  label: string;
  value: string;
}

export const PURPOSE_OPTIONS: PurposeOption[] = [
  { label: '스터디', value: '스터디' },
  { label: '그룹 과제', value: '그룹과제' },
  { label: '회의', value: '회의' },
  { label: '세미나', value: '세미나' },
  { label: '기타', value: '기타' },
];

/**
 * Operating hours used to generate selectable time slots.
 * TODO: confirm open/close hours and slot granularity.
 */
export const OPERATING = {
  /** First selectable hour (24h) */
  openHour: 9,
  /** Last selectable END hour (24h). e.g. 22 means last slot ends at 22:00 */
  closeHour: 22,
  /** Slot size in minutes */
  slotMinutes: 60,
} as const;

/** Minimum / maximum people on a single reservation. */
export const MEMBER_LIMITS = {
  min: 1,
  max: 8,
} as const;

/**
 * Generates "HH:MM" time options between openHour and closeHour.
 * @param includeClose - if true, includes the closing time (for end-time pickers)
 */
export function generateTimeSlots(includeClose = false): string[] {
  const slots: string[] = [];
  const step = OPERATING.slotMinutes;
  const startMin = OPERATING.openHour * 60;
  const endMin = OPERATING.closeHour * 60;

  for (let m = startMin; includeClose ? m <= endMin : m < endMin; m += step) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return slots;
}
