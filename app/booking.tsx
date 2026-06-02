import { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/hooks/useAuth';
import { useSessionBridge } from '@/contexts/SessionBridge';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { ROOMS, PURPOSE_OPTIONS, MEMBER_LIMITS, generateSlots } from '@/constants/booking';
import { submitScript, probeDayScript } from '@/services/bookingService';
import type { BookingFormData, BookingMember } from '@/types';
import { Field, TextField, Stepper, SelectField, type SelectItem } from '@/components/forms';

/** Formats a Date as "YYYY-MM-DD". */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Builds the next `count` selectable dates starting today. */
function upcomingDates(count: number): SelectItem[] {
  const out: SelectItem[] = [];
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  const base = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    const iso = toISODate(d);
    const label = `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekdays[d.getDay()]})${
      i === 0 ? ' · 오늘' : i === 1 ? ' · 내일' : ''
    }`;
    out.push({ label, value: iso });
  }
  return out;
}

/** Friendly label for each navigation/submit progress step. */
const STEP_LABEL: Record<string, string> = {
  facility: '스터디룸 확인 중…',
  month: '날짜로 이동 중…',
  day: '시간표 불러오는 중…',
  fill: '예약 정보 입력 중…',
  submit: '예약 신청 중…',
};

export default function BookingScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ reserveDt?: string; facilitySeq?: string }>();

  const bridge = useSessionBridge();
  const [submitting, setSubmitting] = useState(false);
  const [probing, setProbing] = useState(false);
  const [progressStep, setProgressStep] = useState<string>('');

  // ── Form state ──
  const dateOptions = useMemo(() => upcomingDates(14), []);
  const allSlots = useMemo(() => generateSlots(), []);

  const [facilitySeq, setFacilitySeq] = useState<number>(
    params.facilitySeq ? Number(params.facilitySeq) : ROOMS[0].facilitySeq,
  );
  const [reserveDt, setReserveDt] = useState<string>(params.reserveDt ?? dateOptions[0].value);
  const [selectedTimes, setSelectedTimes] = useState<string[]>([]);
  const [memberCount, setMemberCount] = useState<number>(MEMBER_LIMITS.min);
  const [members, setMembers] = useState<BookingMember[]>([
    { name: auth.userName ?? '', studentNo: auth.userId ?? '' },
  ]);
  const [contact, setContact] = useState<string>('');
  const [purpose, setPurpose] = useState<string>(PURPOSE_OPTIONS[0].value);
  const [purposeOptions, setPurposeOptions] = useState<SelectItem[]>(PURPOSE_OPTIONS);

  // Real availability reported by the live form (null = not yet probed).
  const [availableSlots, setAvailableSlots] = useState<string[] | null>(null);

  // Keep the members array length in sync with memberCount
  useEffect(() => {
    setMembers((prev) => {
      if (memberCount === prev.length) return prev;
      const next = [...prev];
      while (next.length < memberCount) next.push({ name: '', studentNo: '' });
      next.length = memberCount;
      return next;
    });
  }, [memberCount]);

  const updateMember = useCallback((index: number, patch: Partial<BookingMember>) => {
    setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
  }, []);

  // Probe the live form for real availability whenever room/date changes.
  useEffect(() => {
    if (!bridge.ready || submitting) return;
    let cancelled = false;
    setProbing(true);
    setAvailableSlots(null);
    setProgressStep('day');

    bridge
      .run<{ available: string[]; purposes: SelectItem[] }>(
        (reqId) => probeDayScript(reqId, facilitySeq, reserveDt),
        { timeoutMs: 20000, onProgress: (step) => !cancelled && setProgressStep(step) },
      )
      .then((data) => {
        if (cancelled) return;
        const available = Array.isArray(data.available) ? data.available : [];
        setAvailableSlots(available);
        setSelectedTimes((prev) => prev.filter((s) => available.includes(s)));
        if (Array.isArray(data.purposes) && data.purposes.length > 0) {
          setPurposeOptions(data.purposes);
          setPurpose((p) => (data.purposes.some((o) => o.value === p) ? p : data.purposes[0].value));
        }
      })
      .catch(() => {
        if (!cancelled) setAvailableSlots([]); // treat as "none available"
      })
      .finally(() => {
        if (!cancelled) {
          setProbing(false);
          setProgressStep('');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bridge, facilitySeq, reserveDt, submitting]);

  const toggleTime = useCallback((slot: string) => {
    setSelectedTimes((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot].sort(),
    );
  }, []);

  // ── Validation ──
  const validate = useCallback((): string | null => {
    if (!reserveDt) return '예약 날짜를 선택해주세요.';
    if (selectedTimes.length === 0) return '예약 시간을 1개 이상 선택해주세요.';
    for (let i = 0; i < members.length; i++) {
      if (!members[i].name.trim()) return `${i + 1}번 예약자의 이름을 입력해주세요.`;
      if (!members[i].studentNo.trim()) return `${i + 1}번 예약자의 학번을 입력해주세요.`;
    }
    if (!contact.trim()) return '연락처를 입력해주세요.';
    if (!purpose) return '이용 목적을 선택해주세요.';
    return null;
  }, [reserveDt, selectedTimes, members, contact, purpose]);

  // ── Submit ──
  const handleSubmit = useCallback(() => {
    const error = validate();
    if (error) {
      Alert.alert('입력 확인', error);
      return;
    }
    if (!bridge.ready) {
      Alert.alert('잠시만요', '예약 시스템에 연결 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const data: BookingFormData = {
      facilitySeq,
      reserveDt,
      times: selectedTimes,
      memberCount,
      members,
      contact: contact.trim(),
      purpose,
    };

    Alert.alert(
      '예약 신청',
      `${reserveDt}\n${selectedTimes.join(', ')}\n인원 ${memberCount}명으로 신청하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '신청',
          onPress: () => {
            setSubmitting(true);
            setProgressStep('facility');
            bridge
              .run<{ success: boolean; message: string }>(
                (reqId) => submitScript(reqId, data),
                { timeoutMs: 30000, onProgress: setProgressStep },
              )
              .then((res) => {
                if (res.success) {
                  Alert.alert('신청 완료', res.message ?? '예약이 접수되었습니다.', [
                    { text: '확인', onPress: () => router.back() },
                  ]);
                } else {
                  Alert.alert('신청 실패', res.message ?? '예약에 실패했습니다.');
                }
              })
              .catch((e: any) => {
                Alert.alert('오류', e?.message ?? '예약 신청 중 문제가 발생했습니다.');
              })
              .finally(() => {
                setSubmitting(false);
                setProgressStep('');
              });
          },
        },
      ],
    );
  }, [validate, bridge, facilitySeq, reserveDt, selectedTimes, memberCount, members, contact, purpose, router]);

  // Which slots to show: real availability if known, else the full set.
  const slotsToShow = availableSlots ?? allSlots;
  const noSlots = availableSlots !== null && availableSlots.length === 0;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="닫기" style={styles.headerBtn}>
          <Ionicons name="close" size={26} color={Colors.textOnPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>스터디룸 예약 신청</Text>
        <View style={styles.headerBtn} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {/* Room */}
          <Field label="스터디룸" required>
            <SelectField
              value={String(facilitySeq)}
              items={ROOMS.map((r) => ({ label: r.label, value: String(r.facilitySeq) }))}
              onSelect={(v) => setFacilitySeq(Number(v))}
            />
          </Field>

          {/* Date */}
          <Field label="예약 날짜" required>
            <SelectField value={reserveDt} items={dateOptions} onSelect={setReserveDt} />
          </Field>

          {/* Time slots */}
          <Field
            label="예약 시간"
            required
            hint={
              availableSlots !== null
                ? '학교 시스템의 실제 예약 가능 시간입니다.'
                : '예약 가능 시간을 확인하는 중입니다…'
            }
          >
            {probing ? (
              <View style={styles.slotLoading}>
                <ActivityIndicator color={Colors.primary} />
                <Text style={styles.slotLoadingText}>{STEP_LABEL[progressStep] ?? '불러오는 중…'}</Text>
              </View>
            ) : noSlots ? (
              <View style={styles.slotEmpty}>
                <Ionicons name="alert-circle-outline" size={18} color={Colors.error} />
                <Text style={styles.slotEmptyText}>이 날짜는 예약 가능한 시간이 없습니다.</Text>
              </View>
            ) : (
              <View style={styles.slotGrid}>
                {slotsToShow.map((slot) => {
                  const selected = selectedTimes.includes(slot);
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.slotChip, selected && styles.slotChipSelected]}
                      onPress={() => toggleTime(slot)}
                    >
                      <Text style={[styles.slotChipText, selected && styles.slotChipTextSelected]}>{slot}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </Field>

          {/* Member count */}
          <Field label="사용 인원" required hint={`최소 ${MEMBER_LIMITS.min}명 ~ 최대 ${MEMBER_LIMITS.max}명`}>
            <Stepper value={memberCount} min={MEMBER_LIMITS.min} max={MEMBER_LIMITS.max} onChange={setMemberCount} />
          </Field>

          {/* Members */}
          <Field label="예약자 정보" required hint="예약자 전원의 이름과 학번을 입력하세요.">
            {members.map((m, i) => (
              <View key={i} style={styles.memberRow}>
                <Text style={styles.memberIndex}>{i + 1}</Text>
                <View style={styles.memberInputs}>
                  <TextField placeholder="이름" value={m.name} onChangeText={(t) => updateMember(i, { name: t })} style={styles.memberName} />
                  <TextField
                    placeholder="학번"
                    value={m.studentNo}
                    onChangeText={(t) => updateMember(i, { studentNo: t })}
                    keyboardType="numeric"
                    style={styles.memberNo}
                  />
                </View>
              </View>
            ))}
          </Field>

          {/* Contact */}
          <Field label="연락처" required>
            <TextField placeholder="010-0000-0000" value={contact} onChangeText={setContact} keyboardType="phone-pad" />
          </Field>

          {/* Purpose */}
          <Field label="이용 목적" required>
            <SelectField value={purpose} items={purposeOptions} onSelect={setPurpose} />
          </Field>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, (submitting || noSlots) && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting || noSlots}
          >
            {submitting ? (
              <View style={styles.submitInner}>
                <ActivityIndicator color={Colors.textOnPrimary} />
                <Text style={styles.submitText}>{STEP_LABEL[progressStep] ?? '신청 중…'}</Text>
              </View>
            ) : (
              <View style={styles.submitInner}>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.textOnPrimary} />
                <Text style={styles.submitText}>예약 신청하기</Text>
              </View>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            * 신청 결과는 학교 예약 시스템의 승인 정책에 따릅니다.{'\n'}
            중복 예약·운영시간 외 신청은 거부될 수 있습니다.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },
  flex: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
  },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textOnPrimary },

  scroll: { flex: 1, backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  // Time slots
  slotGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  slotChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
  },
  slotChipSelected: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  slotChipText: { fontSize: Typography.fontSizeSm, color: Colors.textPrimary },
  slotChipTextSelected: { color: Colors.textOnPrimary, fontWeight: Typography.fontWeightSemibold },
  slotLoading: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  slotLoadingText: { fontSize: Typography.fontSizeSm, color: Colors.textSecondary },
  slotEmpty: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.md },
  slotEmptyText: { fontSize: Typography.fontSizeSm, color: Colors.error },

  // Members
  memberRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  memberIndex: {
    width: 24,
    textAlign: 'center',
    fontSize: Typography.fontSizeMd,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textSecondary,
  },
  memberInputs: { flex: 1, flexDirection: 'row', gap: Spacing.sm },
  memberName: { flex: 1.2 },
  memberNo: { flex: 1 },

  // Submit
  submitBtn: {
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.md,
    minHeight: 54,
    justifyContent: 'center',
    ...Shadow.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitInner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  submitText: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textOnPrimary },

  disclaimer: { marginTop: Spacing.lg, fontSize: Typography.fontSizeXs, color: Colors.textSecondary, lineHeight: 18, textAlign: 'center' },
});
