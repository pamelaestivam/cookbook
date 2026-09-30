import {
  BodoniModa_500Medium,
  BodoniModa_500Medium_Italic,
  BodoniModa_600SemiBold,
} from "@expo-google-fonts/bodoni-moda";
import { DMSans_400Regular, DMSans_500Medium, DMSans_600SemiBold, DMSans_700Bold } from "@expo-google-fonts/dm-sans";
import { useFonts } from "expo-font";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";
import { DialogHost } from "@/components/dialog";
import { AuthProvider, useAuth } from "@/lib/auth";
import { CookbookProvider } from "@/lib/cookbook";
import { fonts, useColors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

function RootStack() {
  const { session, loading } = useAuth();
  const colors = useColors();
  const scheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    BodoniModa_500Medium,
    BodoniModa_500Medium_Italic,
    BodoniModa_600SemiBold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    DMSans_700Bold,
  });
  const ready = fontsLoaded && !loading;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  if (!ready) return null;

  return (
    <CookbookProvider>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.paper },
          headerTintColor: colors.berry,
          headerTitleStyle: { fontFamily: fonts.semibold, color: colors.ink },
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: colors.paper },
        }}
      >
        <Stack.Protected guard={!!session}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="recipe/[id]" options={{ title: "", headerTransparent: true }} />
          <Stack.Screen name="add" options={{ presentation: "modal", title: "Add a recipe" }} />
        </Stack.Protected>
        <Stack.Protected guard={!session}>
          <Stack.Screen name="sign-in" options={{ headerShown: false }} />
        </Stack.Protected>
      </Stack>
      <DialogHost />
    </CookbookProvider>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootStack />
    </AuthProvider>
  );
}
