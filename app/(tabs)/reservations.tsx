import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';

import { useSessionBridge } from '@/contexts/SessionBridge';
import { buildMyReservationsUrl } from '@/constants/urls';
import { Colors, Typography, Spacing, BorderRadius, Shadow } from '@/constants/theme';
import { myReservationsScript } from '@/services/bookingService';
import type { MyReservation } from '@/types';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "2026-06-02" → "6월 2일 (월)" */
function formatDate(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  const dow = new Date(Number(y), Number(mo) - 1, Number(d)).getDay();
  return `${Number(mo)}월 ${Number(d)}일 (${WEEKDAYS[dow]})`;
}

/** Today's date as "YYYY-MM-DD" (local). */
function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Maps the raw status text to a display label + color. */
function statusStyle(raw: string): { label: string; color: string; bg: string } {
  if (raw.includes('승인') || raw.includes('완료')) return { label: '승인', color: Colors.success, bg: '#E6F4EA' };
  if (raw.includes('대기')) return { label: '대기', color: Colors.warning, bg: '#FFF6E0' };
  if (raw.includes('취소')) return { label: '취소', color: Colors.textDisabled, bg: Colors.surfaceVariant };
  if (raw.includes('반려') || raw.includes('거절') || raw.includes('불가'))
    return { label: raw || '반려', color: Colors.error, bg: '#FDE8E8' };
  return { label: raw || '-', color: Colors.textSecondary, bg: Colors.surfaceVariant };
}

function ReservationCard({ item }: { item: MyReservation }) {
  const s = statusStyle(item.status);
  return (
    <View style={[styles.card, Shadow.sm]}>
      <View style={styles.cardTop}>
        <View style={styles.roomRow}>
          <Ionicons name="business-outline" size={16} color={Colors.primary} />
          <Text style={styles.room}>{item.room}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: s.bg }]}>
          <Text style={[styles.statusText, { color: s.color }]}>{s.label}</Text>
        </View>
      </View>

      <View style={styles.cardRow}>
        <Ionicons name="calendar-outline" size={15} color={Colors.textSecondary} style={styles.cardIcon} />
        <Text style={styles.cardValue}>{formatDate(item.date)}</Text>
      </View>
      <View style={styles.cardRow}>
        <Ionicons name="time-outline" size={15} color={Colors.textSecondary} style={styles.cardIcon} />
        <Text style={styles.cardValue}>{item.time}</Text>
      </View>
      {item.appliedDate ? (
        <Text style={styles.applied}>신청일 {item.appliedDate}</Text>
      ) : null}
    </View>
  );
}

export default function ReservationsScreen() {
  const bridge = useSessionBridge();

  const [reservations, setReservations] = useState<MyReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (isRefresh = false) => {
      if (!bridge.ready) return;
      isRefresh ? setRefreshing(true) : setLoading(true);
      setError(null);
      try {
        const now = new Date();
        const url = buildMyReservationsUrl(now.getFullYear(), now.getMonth() + 1);
        const data = await bridge.run<{ reservations: MyReservation[] }>(
          (reqId) => myReservationsScript(reqId, url),
          { timeoutMs: 20000 },
        );
        setReservations(Array.isArray(data.reservations) ? data.reservations : []);
      } catch (e: any) {
        setError(e?.message ?? '내 예약을 불러오지 못했습니다.');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [bridge],
  );

  useEffect(() => {
    load();
  }, [load]);

  // Split into upcoming vs past by reservation date.
  const { upcoming, past } = useMemo(() => {
    const today = todayISO();
    const up: MyReservation[] = [];
    const pa: MyReservation[] = [];
    for (const r of reservations) {
      (r.date >= today ? up : pa).push(r);
    }
    // Upcoming: soonest first. Past: most recent first.
    up.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
    pa.sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
    return { upcoming: up, past: pa };
  }, [reservations]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      <View style={styles.header}>
        <Text style={styles.headerTitle}>내 예약 현황</Text>
        <TouchableOpacity onPress={() => load(true)} style={styles.refreshBtn} accessibilityLabel="새로고침">
          <Ionicons name="refresh-outline" size={22} color={Colors.textOnPrimary} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.body}
        contentContainerStyle={styles.bodyContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={Colors.primary} />}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>내 예약 불러오는 중…</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Ionicons name="warning-outline" size={28} color={Colors.error} />
            <Text style={[styles.centerText, { color: Colors.error }]}>{error}</Text>
            <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
              <Text style={styles.retryText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        ) : reservations.length === 0 ? (
          <View style={styles.center}>
            <Ionicons name="file-tray-outline" size={36} color={Colors.textDisabled} />
            <Text style={styles.centerText}>예약 내역이 없습니다.</Text>
          </View>
        ) : (
          <>
            {upcoming.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>예정된 예약 ({upcoming.length})</Text>
                {upcoming.map((r) => (
                  <ReservationCard key={r.seq || `${r.no}-${r.date}-${r.time}`} item={r} />
                ))}
              </>
            )}
            {past.length > 0 && (
              <>
                <Text style={[styles.sectionLabel, upcoming.length > 0 && { marginTop: Spacing.lg }]}>
                  지난 예약 ({past.length})
                </Text>
                {past.map((r) => (
                  <View key={r.seq || `${r.no}-${r.date}-${r.time}`} style={styles.pastWrap}>
                    <ReservationCard item={r} />
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

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
  bodyContent: { padding: Spacing.lg, paddingBottom: Spacing.xxxl, flexGrow: 1 },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: Spacing.xxxl, gap: Spacing.md },
  centerText: { fontSize: Typography.fontSizeMd, color: Colors.textSecondary, textAlign: 'center' },
  retryBtn: { marginTop: Spacing.sm, paddingHorizontal: Spacing.lg, paddingVertical: Spacing.sm, backgroundColor: Colors.primary, borderRadius: BorderRadius.md },
  retryText: { color: Colors.textOnPrimary, fontWeight: Typography.fontWeightSemibold },

  sectionLabel: {
    fontSize: Typography.fontSizeSm,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textSecondary,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },

  card: { backgroundColor: Colors.surface, borderRadius: BorderRadius.lg, padding: Spacing.lg, marginBottom: Spacing.md },
  pastWrap: { opacity: 0.65 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Spacing.sm },
  roomRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, flex: 1 },
  room: { fontSize: Typography.fontSizeMd, fontWeight: Typography.fontWeightSemibold, color: Colors.textPrimary },
  statusBadge: { paddingHorizontal: Spacing.sm, paddingVertical: 3, borderRadius: BorderRadius.full },
  statusText: { fontSize: Typography.fontSizeXs, fontWeight: Typography.fontWeightBold },

  cardRow: { flexDirection: 'row', alignItems: 'center', marginTop: 2 },
  cardIcon: { width: 22 },
  cardValue: { fontSize: Typography.fontSizeMd, color: Colors.textPrimary },
  applied: { marginTop: Spacing.sm, fontSize: Typography.fontSizeXs, color: Colors.textDisabled },
});
