import { useAuth } from "@/utils/auth/useAuth";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useRef } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";

// Module-level notification handler (must run before any notification fires)
import "@/utils/notifications";
import {
  registerForLocalNotifications,
  getDevicePushToken,
  registerTokenWithBackend,
  getRouteForNotification,
} from "@/utils/notifications";

SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export default function RootLayout() {
  const { initiate, isReady } = useAuth();
  const notifListener = useRef(null);
  const responseListener = useRef(null);

  useEffect(() => {
    initiate();
  }, [initiate]);

  useEffect(() => {
    if (isReady) {
      SplashScreen.hideAsync();

      // Set up notification permissions, Android channels, and FCM token
      const setupNotifications = async () => {
        try {
          const granted = await registerForLocalNotifications();
          if (granted) {
            // Get the device push token (FCM for standalone APK builds)
            const token = await getDevicePushToken();
            if (token) {
              // Read stored user to link token with account
              const stored = await SecureStore.getItemAsync(
                "couple_app_user",
              ).catch(() => null);
              if (stored) {
                const { id } = JSON.parse(stored);
                if (id) {
                  await registerTokenWithBackend(id, token);
                }
              }
            }
          }
        } catch (e) {
          console.warn("Notification setup error:", e);
        }
      };

      setupNotifications();
    }
  }, [isReady]);

  // ── Notification listeners ─────────────────────────────────────────────────
  useEffect(() => {
    // Foreground notification received
    notifListener.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        const type = notification.request.content.data?.type;
        console.log("[Boundless] Notification received:", type);
      },
    );

    // User tapped a notification → navigate to correct screen
    responseListener.current =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const route = getRouteForNotification(response.notification);
        if (route) {
          try {
            router.push(route);
          } catch (e) {
            console.warn("Navigation from notification failed:", e);
          }
        }
      });

    return () => {
      if (notifListener.current) {
        Notifications.removeNotificationSubscription(notifListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  if (!isReady) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} initialRouteName="index">
          <Stack.Screen name="index" />
        </Stack>
      </GestureHandlerRootView>
    </QueryClientProvider>
  );
}
