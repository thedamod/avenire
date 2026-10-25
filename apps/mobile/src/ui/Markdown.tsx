import { Fragment, useMemo } from "react";
import { Platform, View, type StyleProp, type ViewStyle } from "react-native";
import { useMarkdown, type MarkedStyles } from "react-native-marked";
import { colors } from "../theme/tokens";

const mono = Platform.select({ web: "'Geist Mono', ui-monospace, monospace", default: "GeistMono" });
const sans = Platform.OS === "web" ? "system-ui" : undefined;

/** `chat` = Ruth's replies (16/24), `note` = note pages and output sheets (16/26, M10). */
const sizes = {
  chat: { body: 16, line: 24, h1: 22, h2: 19, h3: 17, gap: 12 },
  note: { body: 16, line: 26, h1: 22, h2: 18, h3: 16, gap: 12 },
} as const;

function makeStyles(size: keyof typeof sizes): MarkedStyles {
  const s = sizes[size];
  const heading = { color: colors.fg, fontWeight: "600" as const, fontFamily: sans };
  return {
    text: { color: colors.fg, fontSize: s.body, lineHeight: s.line, fontFamily: sans },
    paragraph: { paddingVertical: 0, marginBottom: s.gap },
    strong: { fontWeight: "600" },
    em: { fontStyle: "italic" },
    link: { color: colors["accent-text"], textDecorationLine: "none" },
    h1: { ...heading, fontSize: s.h1, lineHeight: s.h1 + 7, letterSpacing: -0.3, marginTop: 8, marginBottom: 10 },
    // Note sections sit on a hairline (M10): 22 above, 10 below the heading, 12 to the text.
    h2:
      size === "note"
        ? {
            ...heading,
            fontSize: s.h2,
            lineHeight: 24,
            paddingTop: 22,
            paddingBottom: 10,
            marginBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
          }
        : { ...heading, fontSize: s.h2, lineHeight: s.h2 + 6, marginTop: 8, marginBottom: 8 },
    h3: { ...heading, fontSize: s.h3, lineHeight: s.h3 + 6, marginTop: 6, marginBottom: 6 },
    h4: { ...heading, fontSize: s.body, lineHeight: s.line, marginBottom: 6 },
    codespan: {
      fontFamily: mono,
      fontSize: s.body - 2.5,
      color: colors.fg,
      backgroundColor: colors["surface-3"],
    },
    code: {
      backgroundColor: colors["surface-1"],
      borderColor: colors.line,
      borderWidth: 1,
      borderRadius: 8,
      padding: 12,
      marginBottom: s.gap,
    },
    codeText: { fontFamily: mono, fontSize: 12.5, lineHeight: 19, color: colors.fg },
    blockquote: {
      borderLeftWidth: 2,
      borderLeftColor: colors["line-2"],
      paddingLeft: 12,
      backgroundColor: "transparent",
      marginBottom: s.gap,
    },
    hr: { backgroundColor: colors.line, height: 1, marginVertical: s.gap },
    list: { marginBottom: s.gap },
    li: { color: colors.fg, fontSize: s.body, lineHeight: s.line, fontFamily: sans },
    table: { borderColor: colors.line, borderWidth: 1, borderRadius: 6, marginBottom: s.gap },
    tableRow: { borderColor: colors.line },
    tableCell: { padding: 8 },
  };
}

const theme = {
  colors: { text: colors.fg, link: colors["accent-text"], code: colors["surface-1"], border: colors.line },
};

/**
 * Markdown rendered as plain views (no FlatList), so it nests inside the screen's ScrollView.
 * Notes, Ruth's replies and output sheets all use this one renderer.
 */
export function Markdown({
  value,
  size = "chat",
  style,
}: {
  value: string;
  size?: keyof typeof sizes;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useMemo(() => makeStyles(size), [size]);
  const nodes = useMarkdown(value, { colorScheme: "dark", theme, styles });
  return (
    <View style={style}>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </View>
  );
}
