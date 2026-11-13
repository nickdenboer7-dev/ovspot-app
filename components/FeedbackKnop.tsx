import { Ionicons } from "@expo/vector-icons";
import { usePathname } from "expo-router";
import React, { useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useApp } from "../context/AppProvider";
import type { FeedbackContext } from "../lib/types";
import { FeedbackModal } from "./FeedbackModal";

/** Schermen waar de knop niet hoort: zoeken (toetsenbord), uitleg, en instellingen (heeft al een rij). */
const VERBERG = ["/zoek", "/info", "/instellingen"];
const CONTEXT_MAX_MS = 30 * 60 * 1000;

/** Klein feedbackknopje rechtsonder, boven de onderbalk. Opent hetzelfde formulier als in de instellingen. */
export function FeedbackKnop() {
  const { colors, laatsteFeedbackContext, t } = useApp();
  const insets = useSafeAreaInsets();
  const pad = usePathname() || "/";
  const [open, zetOpen] = useState(false);

  const verborgen = VERBERG.some((p) => pad === p || pad.startsWith(p + "/"));
  if (verborgen && !open) return null;

  const view: FeedbackContext["view"] = pad.startsWith("/halte") ? "halte" : pad.startsWith("/rit") ? "rit" : "instellingen";
  const vers = laatsteFeedbackContext && Date.now() - laatsteFeedbackContext.vastgelegdOp < CONTEXT_MAX_MS ? laatsteFeedbackContext : null;
  const context: FeedbackContext = vers && vers.view === view && view !== "instellingen"
    ? { view: vers.view, stop_id: vers.stop_id, stop_name: vers.stop_name, rit_id: vers.rit_id, rit_datum: vers.rit_datum }
    : { view: "instellingen" };

  // Onderbalk is 62 hoog plus de veilige onderrand.
  const onder = 62 + Math.max(insets.bottom, 6) + 14;

  return (
    <>
      {verborgen ? null : (
        <Pressable
          onPress={() => zetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={t("Feedback sturen")}
          hitSlop={8}
          style={[s.knop, { bottom: onder, backgroundColor: colors.accent, shadowColor: "#000" }]}
        >
          <Ionicons name="chatbubble-ellipses" size={22} color="#fff" />
        </Pressable>
      )}
      <FeedbackModal zichtbaar={open} onSluit={() => zetOpen(false)} context={context} />
    </>
  );
}

const s = StyleSheet.create({
  knop: {
    position: "absolute", right: 14, width: 46, height: 46, borderRadius: 23,
    alignItems: "center", justifyContent: "center",
    elevation: 5, shadowOpacity: 0.25, shadowRadius: 4, shadowOffset: { width: 0, height: 2 }
  }
});
