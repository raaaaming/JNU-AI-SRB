import { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { useAuth } from '@/hooks/useAuth';
import {
  Colors,
  Typography,
  Spacing,
  BorderRadius,
  Shadow,
} from '@/constants/theme';

const APP_VERSION = '1.0.0';
const CONTACT_EMAIL = 'help@ai.jnu.ac.kr';

/** Formats a Unix timestamp (ms) as a Korean date-time string. */
function formatLoginTime(ts?: number): string {
  if (!ts) return '알 수 없음';
  return new Date(ts).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 설정 (Settings) tab — fully native, no WebView.
 *
 * Shows user info, app metadata, and a logout button.
 */
export default function SettingsScreen() {
  const auth = useAuth();
  const router = useRouter();

  const handleLogout = useCallback(() => {
    Alert.alert(
      '로그아웃',
      '정말 로그아웃 하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '로그아웃',
          style: 'destructive',
          onPress: () => {
            auth.logout().then(() => {
              router.replace('/login');
            });
          },
        },
      ],
    );
  }, [auth, router]);

  const handleEmailContact = useCallback(() => {
    Linking.openURL(`mailto:${CONTACT_EMAIL}`).catch(() => {
      Alert.alert('오류', '메일 앱을 열 수 없습니다.');
    });
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>설정</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── User info card ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>계정 정보</Text>
          <View style={[styles.card, Shadow.sm]}>
            <View style={styles.userIconRow}>
              <View style={styles.avatarCircle}>
                <Ionicons name="person" size={28} color={Colors.textOnPrimary} />
              </View>
              <View style={styles.userTextBlock}>
                <Text style={styles.userName}>
                  {auth.userName ?? '(이름 없음)'}
                </Text>
                {auth.userId ? (
                  <Text style={styles.userId}>학번: {auth.userId}</Text>
                ) : null}
              </View>
            </View>

            <View style={styles.divider} />

            <InfoRow
              icon="time-outline"
              label="로그인 시각"
              value={formatLoginTime(auth.loginTime)}
            />
          </View>
        </View>

        {/* ── App info section ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>앱 정보</Text>
          <View style={[styles.card, Shadow.sm]}>
            <InfoRow icon="phone-portrait-outline" label="앱 이름" value="전남대 AI 스터디룸" />
            <View style={styles.divider} />
            <InfoRow icon="code-slash-outline" label="버전" value={`v${APP_VERSION}`} />
            <View style={styles.divider} />
            <InfoRow icon="school-outline" label="소속" value="전남대학교 AI융합대학" />
          </View>
        </View>

        {/* ── Contact / About ── */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>문의</Text>
          <View style={[styles.card, Shadow.sm]}>
            <TouchableOpacity
              style={styles.contactRow}
              onPress={handleEmailContact}
              accessibilityRole="link"
              accessibilityLabel={`이메일 문의: ${CONTACT_EMAIL}`}
            >
              <Ionicons
                name="mail-outline"
                size={20}
                color={Colors.secondary}
                style={styles.rowIcon}
              />
              <Text style={[styles.rowValue, styles.emailLink]}>{CONTACT_EMAIL}</Text>
              <Ionicons name="open-outline" size={16} color={Colors.secondary} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── About blurb ── */}
        <Text style={styles.aboutText}>
          전남대학교 AI융합대학 스터디룸 예약 앱 v{APP_VERSION}{'\n'}
          JNU AI College Study Room Booking
        </Text>

        {/* ── Logout button ── */}
        <TouchableOpacity
          style={styles.logoutButton}
          onPress={handleLogout}
          accessibilityRole="button"
          accessibilityLabel="로그아웃"
        >
          <Ionicons name="log-out-outline" size={20} color={Colors.textOnPrimary} />
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface InfoRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={20} color={Colors.secondary} style={styles.rowIcon} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary,
  },

  // ── Header ──
  header: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    backgroundColor: Colors.primary,
  },
  headerTitle: {
    fontSize: Typography.fontSizeXl,
    fontWeight: Typography.fontWeightBold,
    color: Colors.textOnPrimary,
  },

  // ── Scroll ──
  scroll: {
    flex: 1,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  scrollContent: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxxl,
    gap: Spacing.xs,
  },

  // ── Section ──
  section: {
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: Typography.fontSizeSm,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.sm,
    marginLeft: Spacing.xs,
  },

  // ── Card ──
  card: {
    backgroundColor: Colors.surface,
    borderRadius: BorderRadius.lg,
    overflow: 'hidden',
  },

  // ── User header row ──
  userIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  avatarCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userTextBlock: {
    flex: 1,
  },
  userName: {
    fontSize: Typography.fontSizeLg,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textPrimary,
  },
  userId: {
    fontSize: Typography.fontSizeSm,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // ── Info row ──
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  rowIcon: {
    width: 24,
  },
  rowLabel: {
    flex: 1,
    fontSize: Typography.fontSizeMd,
    color: Colors.textSecondary,
  },
  rowValue: {
    fontSize: Typography.fontSizeMd,
    color: Colors.textPrimary,
    fontWeight: Typography.fontWeightMedium,
    flexShrink: 1,
  },

  // ── Contact row ──
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    gap: Spacing.sm,
  },
  emailLink: {
    flex: 1,
    color: Colors.secondary,
  },

  // ── Divider ──
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.borderLight,
    marginLeft: Spacing.lg + 24 + Spacing.sm, // align to text start
  },

  // ── About text ──
  aboutText: {
    fontSize: Typography.fontSizeXs,
    color: Colors.textDisabled,
    textAlign: 'center',
    lineHeight: 18,
    marginVertical: Spacing.md,
  },

  // ── Logout button ──
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    backgroundColor: Colors.error,
    borderRadius: BorderRadius.lg,
    paddingVertical: Spacing.md,
    marginTop: Spacing.sm,
    minHeight: 52,
  },
  logoutText: {
    fontSize: Typography.fontSizeMd,
    fontWeight: Typography.fontWeightSemibold,
    color: Colors.textOnPrimary,
  },
});
