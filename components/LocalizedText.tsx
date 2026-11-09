import React from "react";
import { StyleSheet, Text as NativeText } from "react-native";
import { useApp } from "../context/AppProvider";
import { vertaling } from "../lib/i18n";
import type { AppTaal } from "../lib/i18n";
import { vergrootLetterwaarden } from "../lib/toegankelijkheid";

/** Localize the UI text, preserving GTFS stop/line names and styled nested nodes. */
function lokaleKinderen(children: React.ReactNode, taal: AppTaal): React.ReactNode {
  if (typeof children === "string") return vertaling(children, taal);
  if (!Array.isArray(children)) return children;
  const result: React.ReactNode[] = [];
  let buffer = "";
  const flush = () => {
    if (buffer) result.push(vertaling(buffer, taal));
    buffer = "";
  };
  for (const child of children) {
    if (typeof child === "string" || typeof child === "number") buffer += child;
    else { flush(); result.push(child); }
  }
  flush();
  return result;
}

export const Text = React.forwardRef<
  React.ElementRef<typeof NativeText>,
  React.ComponentProps<typeof NativeText>
>(function LokaleTekst({ children, accessibilityLabel, style, ...props }, ref) {
  const { taal, instellingen } = useApp();
  const basis = StyleSheet.flatten(style);
  const vergroot = vergrootLetterwaarden(basis?.fontSize, basis?.lineHeight, instellingen.groteTekst);
  return (
    <NativeText
      {...props}
      style={vergroot ? [style, vergroot] : style}
      ref={ref}
      accessibilityLabel={typeof accessibilityLabel === "string"
        ? vertaling(accessibilityLabel, taal) : accessibilityLabel}
    >
      {lokaleKinderen(children, taal)}
    </NativeText>
  );
});
