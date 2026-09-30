import type { ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { fonts, useColors } from "@/lib/theme";

export function chapterNumber(position: number) {
  return String(position).padStart(2, "0");
}

/** Small uppercase label above headings, e.g. "MISE EN PLACE". */
export function Kicker({ children, style }: { children: ReactNode; style?: StyleProp<TextStyle> }) {
  const colors = useColors();
  return <Text style={[styles.kicker, { color: colors.berryDark }, style]}>{children}</Text>;
}

export function Heading({
  children,
  size = 34,
  style,
}: {
  children: ReactNode;
  size?: number;
  style?: StyleProp<TextStyle>;
}) {
  const colors = useColors();
  return (
    <Text
      accessibilityRole="header"
      style={[
        {
          color: colors.ink,
          fontFamily: fonts.display,
          fontSize: size,
          lineHeight: size * 1.05,
          letterSpacing: -size * 0.03,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({ children, soft, style }: { children: ReactNode; soft?: boolean; style?: StyleProp<TextStyle> }) {
  const colors = useColors();
  return <Text style={[styles.body, { color: soft ? colors.inkSoft : colors.ink }, style]}>{children}</Text>;
}

export function Chip({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={[styles.chip, { borderColor: colors.rule, backgroundColor: colors.surface }]}>
      <Text style={[styles.chipText, { color: colors.ink }]}>{children}</Text>
    </View>
  );
}

export function Rule({ style }: { style?: StyleProp<ViewStyle> }) {
  const colors = useColors();
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.rule }, style]} />;
}

export function Button({
  label,
  onPress,
  variant = "primary",
  busy,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "quiet";
  busy?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const colors = useColors();
  const primary = variant === "primary";
  const inactive = disabled || busy;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === "quiet" && styles.quietButton,
        {
          backgroundColor: primary ? colors.berry : "transparent",
          borderColor: variant === "secondary" ? colors.berry : "transparent",
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {busy ? (
        <ActivityIndicator color={primary ? colors.onBerry : colors.berry} />
      ) : (
        <Text style={[styles.buttonText, { color: primary ? colors.onBerry : colors.berryDark }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  kicker: {
    fontFamily: fonts.bold,
    fontSize: 12,
    letterSpacing: 1.9,
    textTransform: "uppercase",
  },
  body: {
    fontFamily: fonts.body,
    fontSize: 16,
    lineHeight: 26,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipText: {
    fontFamily: fonts.medium,
    fontSize: 13,
  },
  button: {
    minHeight: 50,
    borderRadius: 999,
    borderWidth: 1.5,
    paddingHorizontal: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  quietButton: {
    minHeight: 40,
    paddingHorizontal: 8,
  },
  buttonText: {
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
});
