import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useKeepAwake } from "expo-keep-awake";
import React, { useEffect } from "react";
import { AppProvider, useApp } from "../context/AppProvider";

SplashScreen.preventAutoHideAsync().catch(() => {});

function WakkerHouden() {
  useKeepAwake("ovspot-scherm-aanhouden");
  return null;
}

function Navigatie() {
  const { klaar, scheme, colors, instellingen } = useApp();

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
      {instellingen.schermAanhouden ? <WakkerHouden /> : null}
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background }, animation: "slide_from_right" }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="halte/[id]" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="rit" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="zoek" options={{ animation: "fade_from_bottom" }} />
        <Stack.Screen name="info" options={{ animation: "slide_from_right" }} />
        <Stack.Screen name="instellingen-geavanceerd" options={{ animation: "slide_from_right" }} />
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
