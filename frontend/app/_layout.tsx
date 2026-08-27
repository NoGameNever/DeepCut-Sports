import { Stack, usePathname, useRouter } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";

import { useIconFonts } from "@/src/hooks/use-icon-fonts";
import { AuthProvider, useAuth } from "@/src/context/AuthContext";
import { ToastProvider } from "@/src/components/Toast";
import { BETA_MODE } from "@/src/config/beta";
import { colors } from "@/src/theme/theme";

SplashScreen.preventAutoHideAsync();

const RETIRED_ALPHA_ROUTES = new Set(["/beta", "/beta-login", "/beta-feedback"]);

function AppNavigator() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (BETA_MODE || loading || !RETIRED_ALPHA_ROUTES.has(pathname)) return;
    router.replace(user ? "/(tabs)" : "/login");
  }, [loading, pathname, router, user]);

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Screen name="quiz" options={{ gestureEnabled: false }} />
    </Stack>
  );
}

export default function RootLayout() {
  const [iconsLoaded, iconsError] = useIconFonts();
  const [fontsLoaded, fontsError] = useFonts({
    "BarlowCondensed-SemiBold": require("../assets/fonts/BarlowCondensed-SemiBold.ttf"),
    "BarlowCondensed-Bold": require("../assets/fonts/BarlowCondensed-Bold.ttf"),
    "PermanentMarker-Regular": require("../assets/fonts/PermanentMarker-Regular.ttf"),
    "Bangers-Regular": require("../assets/fonts/Bangers-Regular.ttf"),
    "RubikSprayPaint-Regular": require("../assets/fonts/RubikSprayPaint-Regular.ttf"),
  });

  const ready = (iconsLoaded || iconsError) && (fontsLoaded || fontsError);

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: colors.surface }}>
      <SafeAreaProvider>
        <AuthProvider>
          <ToastProvider>
            <StatusBar style="light" />
            <View style={{ flex: 1, backgroundColor: colors.surface }}>
              <AppNavigator />
            </View>
          </ToastProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
