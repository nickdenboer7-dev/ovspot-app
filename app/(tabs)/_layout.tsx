import { Tabs } from "expo-router";
import React from "react";
import { isTab, OnderBalk } from "../../components/OnderBalk";
import { useApp } from "../../context/AppProvider";

export default function TabsLayout() {
  const { colors, instellingen } = useApp();
  return (
    <Tabs
      initialRouteName={instellingen.startscherm}
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background }, tabBarHideOnKeyboard: true }}
      tabBar={(props) => {
        const naam = props.state.routes[props.state.index]?.name;
        return <OnderBalk actief={isTab(naam) ? naam : "index"} onKies={(k) => props.navigation.navigate(k)} />;
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Dichtbij" }} />
      <Tabs.Screen name="favorieten" options={{ title: "Favorieten" }} />
      <Tabs.Screen name="storingen" options={{ title: "Storingen" }} />
      <Tabs.Screen name="instellingen" options={{ title: "Instellingen" }} />
    </Tabs>
  );
}
