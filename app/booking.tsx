import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
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
import WebView, { type WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/hooks/useAuth';
import { URLS } from '@/constants/urls';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import {
  ROOMS,
  PURPOSE_OPTIONS,
  MEMBER_LIMITS,
  generateTimeSlots,
} from '@/constants/booking';
import { buildSubmitScript } from '@/services/bookingService';
import type { BookingFormData, BookingMember } from '@/types';
import { Field, TextField, Stepper, SelectField } from '@/components/forms';

/** Formats a Date as "YYYY-MM-DD". */
function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

/** Builds the next `count` selectable dates starting today. */
function upcomingDates(count: number) {
  const out: { label: string; value: string }[] = [];
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

export default function BookingScreen() {
  const auth = useAuth();
  const router = useRouter();
  const params = useLocalSearchParams<{ reserveDt?: string; facilitySeq?: string }>();

  const submitWebRef = useRef<WebView>(null);
  const [webReady, setWebReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Form state ──
  const dateOptions = useMemo(() => upcomingDates(30), []);
  const timeStartOptions = useMemo(() => generateTimeSlots(false), []);
  const timeEndOptions = useMemo(() => generateTimeSlots(true), []);

  const [facilitySeq, setFacilitySeq] = useState<number>(
    params.facilitySeq ? Number(params.facilitySeq) : ROOMS[0].facilitySeq,
  );
  const [reserveDt, setReserveDt] = useState<string>(
    params.reserveDt ?? dateOptions[0].value,
  );
  const [startTime, setStartTime] = useState<string>(timeStartOptions[0]);
  const [endTime, setEndTime] = useState<string>(timeStartOptions[1] ?? timeStartOptions[0]);
  const [memberCount, setMemberCount] = useState<number>(MEMBER_LIMITS.min);
  const [members, setMembers] = useState<BookingMember[]>([
    { name: auth.userName ?? '', studentNo: auth.userId ?? '' },
  ]);
  const [contact, setContact] = useState<string>('');
  const [purpose, setPurpose] = useState<string>(PURPOSE_OPTIONS[0].value);

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

  const updateMember = useCallback(
    (index: number, patch: Partial<BookingMember>) => {
      setMembers((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)));
    },
    [],
  );

  // ── Validation ──
  const validate = useCallback((): string | null => {
    if (!reserveDt) return '예약 날짜를 선택해주세요.';
    if (startTime >= endTime) return '종료 시간은 시작 시간보다 늦어야 합니다.';
    for (let i = 0; i < members.length; i++) {
      if (!members[i].name.trim()) return `${i + 1}번 예약자의 이름을 입력해주세요.`;
      if (!members[i].studentNo.trim()) return `${i + 1}번 예약자의 학번을 입력해주세요.`;
    }
    if (!contact.trim()) return '연락처를 입력해주세요.';
    if (!purpose) return '이용 목적을 선택해주세요.';
    return null;
  }, [reserveDt, startTime, endTime, members, contact, purpose]);

  // ── Submit flow ──
  const handleSubmit = useCallback(() => {
    const error = validate();
    if (error) {
      Alert.alert('입력 확인', error);
      return;
    }
    if (!webReady) {
      Alert.alert('잠시만요', '예약 시스템에 연결 중입니다. 잠시 후 다시 시도해주세요.');
      return;
    }

    const data: BookingFormData = {
      facilitySeq,
      reserveDt,
      startTime,
      endTime,
      memberCount,
      members,
      contact: contact.trim(),
      purpose,
    };

    Alert.alert(
      '예약 신청',
      `${reserveDt} ${startTime}~${endTime}\n인원 ${memberCount}명으로 신청하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '신청',
          onPress: () => {
            setSubmitting(true);
            submitWebRef.current?.injectJavaScript(buildSubmitScript(data));
          },
        },
      ],
    );
  }, [validate, webReady, facilitySeq, reserveDt, startTime, endTime, memberCount, members, contact, purpose]);

  const handleSubmitMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const msg = JSON.parse(event.nativeEvent.data);
        if (msg.type === 'bookingResult') {
          setSubmitting(false);
          if (msg.ok) {
            Alert.alert('신청 완료', msg.message ?? '예약이 접수되었습니다.', [
              { text: '확인', onPress: () => router.back() },
            ]);
          } else {
            Alert.alert('신청 실패', msg.message ?? '예약에 실패했습니다.');
          }
        }
      } catch {
        // ignore malformed
      }
    },
    [router],
  );

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

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Room */}
          {ROOMS.length > 1 ? (
            <Field label="스터디룸" required>
              <SelectField
                value={String(facilitySeq)}
                items={ROOMS.map((r) => ({ label: r.label, value: String(r.facilitySeq) }))}
                onSelect={(v) => setFacilitySeq(Number(v))}
              />
            </Field>
          ) : (
            <Field label="스터디룸">
              <View style={styles.readonlyBox}>
                <Ionicons name="business-outline" size={18} color={Colors.primary} />
                <Text style={styles.readonlyText}>{ROOMS[0].label}</Text>
              </View>
            </Field>
          )}

          {/* Date */}
          <Field label="예약 날짜" required>
            <SelectField
              value={reserveDt}
              items={dateOptions}
              onSelect={setReserveDt}
            />
          </Field>

          {/* Time */}
          <View style={styles.row}>
            <View style={styles.rowItem}>
              <Field label="시작 시간" required>
                <SelectField
                  value={startTime}
                  items={timeStartOptions.map((t) => ({ label: t, value: t }))}
                  onSelect={setStartTime}
                />
              </Field>
            </View>
            <View style={styles.rowItem}>
              <Field label="종료 시간" required>
                <SelectField
                  value={endTime}
                  items={timeEndOptions.map((t) => ({ label: t, value: t }))}
                  onSelect={setEndTime}
                />
              </Field>
            </View>
          </View>

          {/* Member count */}
          <Field label="사용 인원" required hint={`최소 ${MEMBER_LIMITS.min}명 ~ 최대 ${MEMBER_LIMITS.max}명`}>
            <Stepper
              value={memberCount}
              min={MEMBER_LIMITS.min}
              max={MEMBER_LIMITS.max}
              onChange={setMemberCount}
            />
          </Field>

          {/* Members */}
          <Field label="예약자 정보" required hint="예약자 전원의 이름과 학번을 입력하세요.">
            {members.map((m, i) => (
              <View key={i} style={styles.memberRow}>
                <Text style={styles.memberIndex}>{i + 1}</Text>
                <View style={styles.memberInputs}>
                  <TextField
                    placeholder="이름"
                    value={m.name}
                    onChangeText={(t) => updateMember(i, { name: t })}
                    style={styles.memberName}
                  />
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
            <TextField
              placeholder="010-0000-0000"
              value={contact}
              onChangeText={setContact}
              keyboardType="phone-pad"
            />
          </Field>

          {/* Purpose */}
          <Field label="이용 목적" required>
            <SelectField
              value={purpose}
              items={PURPOSE_OPTIONS}
              onSelect={setPurpose}
            />
          </Field>

          {/* Submit */}
          <TouchableOpacity
            style={[styles.submitBtn, submitting && styles.submitBtnDisabled]}
            onPress={handleSubmit}
            disabled={submitting}
          >
            {submitting ? (
              <ActivityIndicator color={Colors.textOnPrimary} />
            ) : (
              <>
                <Ionicons name="checkmark-circle-outline" size={20} color={Colors.textOnPrimary} />
                <Text style={styles.submitText}>예약 신청하기</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.disclaimer}>
            * 신청 결과는 학교 예약 시스템의 승인 정책에 따릅니다.{'\n'}
            중복 예약·운영시간 외 신청은 거부될 수 있습니다.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Hidden WebView on cvg domain — performs the authenticated POST so the
          SSO session cookie is included. Kept tiny + invisible. */}
      <View style={styles.hiddenWeb} pointerEvents="none">
        <WebView
          ref={submitWebRef}
          source={{ uri: URLS.BOOKING_CALENDAR }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          domStorageEnabled
          onLoadEnd={() => setWebReady(true)}
          onMessage={handleSubmitMessage}
          mixedContentMode={Platform.OS === 'android' ? 'compatibility' : undefined}
        />
      </View>
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
  headerTitle: {
    fontSize: Typography.fontSizeLg,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textOnPrimary,
  },

  scroll: { flex: 1, backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xxxl },

  row: { flexDirection: 'row', gap: Spacing.md },
  rowItem: { flex: 1 },

  readonlyBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.surfaceVariant,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.md,
    minHeight: 48,
  },
  readonlyText: { fontSize: Typography.fontSizeMd, color: Colors.textPrimary, fontWeight: Typography.fontWeightMedium },

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

  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.lg,
    marginTop: Spacing.md,
    minHeight: 54,
    ...Shadow.sm,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitText: {
    fontSize: Typography.fontSizeLg,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textOnPrimary,
  },

  disclaimer: {
    marginTop: Spacing.lg,
    fontSize: Typography.fontSizeXs,
    color: Colors.textSecondary,
    lineHeight: 18,
    textAlign: 'center',
  },

  hiddenWeb: {
    position: 'absolute',
    width: 1,
    height: 1,
    bottom: 0,
    right: 0,
    opacity: 0,
  },
});
