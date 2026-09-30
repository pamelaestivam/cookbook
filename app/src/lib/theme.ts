import { useColorScheme } from "react-native";

// Palette and type from the inspiration Recipe Book
// (docs/inspiration/recipe-book.html).
const light = {
  ink: "#2d201b",
  inkSoft: "#69534a",
  paper: "#fbf7ef",
  paperDeep: "#f0e5d6",
  surface: "#fffdf8",
  berry: "#9a3145",
  berryDark: "#702033",
  berryWash: "#f6e2e4",
  sage: "#4c654f",
  rule: "#d9c8b8",
  onBerry: "#ffffff",
};

const dark: typeof light = {
  ink: "#f4eadf",
  inkSoft: "#cbb8aa",
  paper: "#201815",
  paperDeep: "#2b201c",
  surface: "#2b211d",
  berry: "#e18192",
  berryDark: "#f1a8b4",
  berryWash: "#42242b",
  sage: "#9fbea2",
  rule: "#59453c",
  onBerry: "#201815",
};

export type Colors = typeof light;

export const fonts = {
  display: "BodoniModa_600SemiBold",
  displayMedium: "BodoniModa_500Medium",
  displayItalic: "BodoniModa_500Medium_Italic",
  body: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  semibold: "DMSans_600SemiBold",
  bold: "DMSans_700Bold",
};

export function useColors(): Colors {
  return useColorScheme() === "dark" ? dark : light;
}
