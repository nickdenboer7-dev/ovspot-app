import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import React, { useEffect } from "react";
import { AppProvider, useApp } from "../context/AppProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigatie() {
  const { klaar, scheme, colors } = useApp();

  useEffect(() => {
    if (klaar) SplashScreen.hideAsync().catch(() => {});
  }, [klaar]);

  const basis = scheme === "dark" ? DarkTheme : DefaultTheme;
  const thema = {
    ...basis,
    colors: { ...basis.colors, primary: colors.accent, background: colors.background, card: colors.surface, text: colors.text, border: colors.border }
  };

  if (!klaar) return null;

  return (
    <ThemeProvider value={thema}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="halte/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="rit" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="zoek" options={{ animation: "fade_from_bottom" }} />
      </Stack>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <AppProvider>
      <Navigatie />
    </AppProvider>
  );
}
