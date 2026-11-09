import React from "react";
import { Text as NativeText } from "react-native";
import { useApp } from "../context/AppProvider";
import { vertaling } from "../lib/i18n";
import type { AppTaal } from "../lib/i18n";

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
>(function LokaleTekst({ children, accessibilityLabel, ...props }, ref) {
  const { taal } = useApp();
  return (
    <NativeText
      {...props}
      ref={ref}
      accessibilityLabel={typeof accessibilityLabel === "string"
        ? vertaling(accessibilityLabel, taal) : accessibilityLabel}
    >
      {lokaleKinderen(children, taal)}
    </NativeText>
  );
});
