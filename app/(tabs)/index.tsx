import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useSessionBridge } from '@/contexts/SessionBridge';
import { ROOMS } from '@/constants/booking';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { availabilityScript, type DayAvailability } from '@/services/bookingService';
import { SelectField } from '@/components/forms';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

/** Today as {year, month, day} in local time. */
function today() {
  const d = new Date();
  return { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
}

export default function CalendarScreen() {
  const router = useRouter();
  const bridge = useSessionBridge();

  const [facilitySeq, setFacilitySeq] = useState<number>(ROOMS[0].facilitySeq);
  const now = useMemo(() => today(), []);
  const [monthIndex, setMonthIndex] = useState(now.y * 12 + (now.m - 1));

  const [availByDay, setAvailByDay] = useState<Map<number, DayAvailability>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const year = Math.floor(monthIndex / 12);
  const month = (monthIndex % 12) + 1;

  const goPrev = useCallback(() => setMonthIndex((i) => i - 1), []);
  const goNext = useCallback(() => setMonthIndex((i) => i + 1), []);

  // Fetch availability whenever the bridge is ready or facility/month changes.
  const loadAvailability = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await bridge.run<{ days: DayAvailability[] }>(
        (reqId) => availabilityScript(reqId, facilitySeq, year, month),
        { timeoutMs: 20000 },
      );
      const map = new Map<number, DayAvailability>();
      for (const d of data.days ?? []) map.set(d.day, d);
      setAvailByDay(map);
    } catch (e: any) {
      setError(e?.message ?? '예약 현황을 불러오지 못했습니다.');
      setAvailByDay(new Map());
    } finally {
      setLoading(false);
    }
  }, [bridge, facilitySeq, year, month]);

  useEffect(() => {
    loadAvailability();
  }, [loadAvailability]);

  // Build the calendar grid (leading blanks + day numbers).
  const cells = useMemo(() => {
    const firstDow = new Date(year, month - 1, 1).getDay();
    const daysInMonth = new Date(year, month, 0).getDate();
    const arr: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) arr.push(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    while (arr.length % 7 !== 0) arr.push(null);
    return arr;
  }, [year, month]);

  const isPast = useCallback(
    (day: number) => {
      if (year < now.y) return true;
      if (year === now.y && month < now.m) return true;
      if (year === now.y && month === now.m && day < now.d) return true;
      return false;
    },
    [year, month, now],
  );

  const onDayPress = useCallback(
    (day: number) => {
      const reserveDt = `${year}-${pad(month)}-${pad(day)}`;
      router.push({ pathname: '/booking', params: { reserveDt, facilitySeq: String(facilitySeq) } });
    },
    [router, year, month, facilitySeq],
  );

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>스터디룸 예약</Text>
        <TouchableOpacity onPress={loadAvailability} style={styles.refreshBtn} accessibilityLabel="새로고침">
          <Ionicons name="refresh-outline" size={22} color={Colors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Room selector */}
        <View style={styles.roomRow}>
          <Text style={styles.roomLabel}>스터디룸</Text>
          <View style={styles.roomSelect}>
            <SelectField
              value={String(facilitySeq)}
              items={ROOMS.map((r) => ({ label: r.label, value: String(r.facilitySeq) }))}
              onSelect={(v) => setFacilitySeq(Number(v))}
            />
          </View>
        </View>

        {/* Month navigation */}
        <View style={styles.monthBar}>
          <TouchableOpacity onPress={goPrev} style={styles.arrowBtn} accessibilityLabel="이전 달">
            <Ionicons name="chevron-back" size={22} color={Colors.primary} />
          </TouchableOpacity>
          <Text style={styles.monthLabel}>{year}년 {month}월</Text>
          <TouchableOpacity onPress={goNext} style={styles.arrowBtn} accessibilityLabel="다음 달">
            <Ionicons name="chevron-forward" size={22} color={Colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Weekday header */}
        <View style={styles.weekHeader}>
          {WEEKDAYS.map((w, i) => (
            <Text
              key={w}
              style={[
                styles.weekHeaderText,
                i === 0 && { color: Colors.error },
                i === 6 && { color: Colors.secondary },
              ]}
            >
              {w}
            </Text>
          ))}
        </View>

        {/* Calendar grid */}
        <View style={styles.grid}>
          {cells.map((day, idx) => {
            if (day === null) {
              return <View key={`b${idx}`} style={styles.cell} />;
            }
            const info = availByDay.get(day);
            const past = isPast(day);
            const bookable = !past && !!info?.hasData && (info.available ?? 0) > 0;
            const full = !past && !!info?.hasData && (info.available ?? 0) === 0;
            const dow = idx % 7;

            return (
              <TouchableOpacity
                key={day}
                style={[styles.cell, bookable && styles.cellBookable]}
                onPress={() => bookable && onDayPress(day)}
                disabled={!bookable}
                activeOpacity={0.7}
              >
                <Text
                  style={[
                    styles.cellDay,
                    past && styles.cellMuted,
                    !past && dow === 0 && { color: Colors.error },
                    !past && dow === 6 && { color: Colors.secondary },
                  ]}
                >
                  {day}
                </Text>
                {bookable ? (
                  <View style={styles.availBadge}>
                    <Text style={styles.availBadgeText}>{info!.available}</Text>
                  </View>
                ) : full ? (
                  <Text style={styles.fullText}>마감</Text>
                ) : null}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Loading / error overlays */}
        {loading ? (
          <View style={styles.statusRow}>
            <ActivityIndicator color={Colors.primary} />
            <Text style={styles.statusText}>예약 현황 불러오는 중…</Text>
          </View>
        ) : error ? (
          <View style={styles.statusRow}>
            <Ionicons name="warning-outline" size={18} color={Colors.error} />
            <Text style={[styles.statusText, { color: Colors.error }]}>{error}</Text>
            <TouchableOpacity onPress={loadAvailability}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        {/* Legend */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.success }]} />
            <Text style={styles.legendText}>예약 가능 (숫자 = 가능 건수)</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: Colors.textDisabled }]} />
            <Text style={styles.legendText}>마감 / 예약 불가</Text>
          </View>
        </View>

        <Text style={styles.hint}>날짜를 선택하면 예약 신청 화면으로 이동합니다.</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const CELL_GAP = 4;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.primary },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
  },
  headerTitle: { fontSize: Typography.fontSizeXl, fontWeight: Typography.fontWeightBold, color: Colors.textOnPrimary },
  refreshBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },

  body: { flex: 1, backgroundColor: Colors.background, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  bodyContent: { padding: Spacing.lg },

  roomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, marginBottom: Spacing.lg },
  roomLabel: { fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  roomSelect: { flex: 1 },

  monthBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.md },
  arrowBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  monthLabel: { fontSize: Typography.fontSizeLg, fontWeight: Typography.fontWeightBold, color: Colors.textPrimary },

  weekHeader: { flexDirection: 'row', marginBottom: Spacing.sm },
  weekHeaderText: { flex: 1, textAlign: 'center', fontSize: Typography.fontSizeSm, color: Colors.textSecondary, fontWeight: Typography.fontWeightMedium },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: {
    width: `${100 / 7}%`,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: CELL_GAP,
  },
  cellBookable: {},
  cellDay: { fontSize: Typography.fontSizeMd, color: Colors.textPrimary, fontWeight: Typography.fontWeightMedium },
  cellMuted: { color: Colors.textDisabled },
  availBadge: {
    marginTop: 2,
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: BorderRadius.full,
    backgroundColor: Colors.success,
    alignItems: 'center',
  },
  availBadgeText: { fontSize: 11, color: Colors.textOnPrimary, fontWeight: Typography.fontWeightBold },
  fullText: { marginTop: 2, fontSize: 10, color: Colors.textDisabled },

  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  statusText: { fontSize: Typography.fontSizeSm, color: Colors.textSecondary },
  retryText: { fontSize: Typography.fontSizeSm, color: Colors.secondary, fontWeight: Typography.fontWeightSemibold },

  legend: { marginTop: Spacing.lg, gap: Spacing.sm, ...Shadow.sm, backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.md },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  legendDot: { width: 12, height: 12, borderRadius: 6 },
  legendText: { fontSize: Typography.fontSizeSm, color: Colors.textSecondary },

  hint: { marginTop: Spacing.md, fontSize: Typography.fontSizeXs, color: Colors.textSecondary, textAlign: 'center' },
});
