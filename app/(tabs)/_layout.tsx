import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { Colors } from '@/constants/theme';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

/**
 * Bottom tab navigator for the main app.
 *
 * Tabs:
 *  • index        – 예약하기   (calendar)
 *  • reservations – 내 예약    (list)
 *  • settings     – 설정       (settings)
 */
export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.tabBarActive,
        tabBarInactiveTintColor: Colors.tabBarInactive,
        tabBarStyle: {
          backgroundColor: Colors.tabBarBackground,
          borderTopColor: Colors.borderLight,
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: '예약하기',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={'calendar-outline' as IoniconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="reservations"
        options={{
          title: '내 예약',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={'list-outline' as IoniconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color, size }) => (
            <Ionicons
              name={'settings-outline' as IoniconName}
              size={size}
              color={color}
            />
          ),
        }}
      />
    </Tabs>
  );
}
