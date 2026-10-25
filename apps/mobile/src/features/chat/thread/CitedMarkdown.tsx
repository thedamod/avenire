import { Fragment, useMemo, type ReactNode } from "react";
import { Linking, Platform, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { Renderer, useMarkdown, type MarkedStyles } from "react-native-marked";
import { colors } from "../../../theme/tokens";

import { Pressable, Text } from "../../../ui";
import { citationLabel, type Citation, type CitationMap } from "./citations";

const mono = Platform.select({ web: "'Geist Mono', ui-monospace, monospace", default: "GeistMono" });
const sans = Platform.OS === "web" ? "system-ui" : undefined;

/** `chat` = Ruth's replies (16/24), `note` = note pages and output sheets (15/23). */
const sizes = {
  chat: { body: 16, line: 24, h1: 22, h2: 19, h3: 17, gap: 12 },
  note: { body: 15, line: 23, h1: 24, h2: 19, h3: 16, gap: 12 },
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
    h2: { ...heading, fontSize: s.h2, lineHeight: s.h2 + 6, marginTop: 8, marginBottom: 8 },
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
export function CitedMarkdown({
  citations,
  onCitation,
  value,
  size = "chat",
  style,
}: {
  citations: CitationMap;
  onCitation: (citation: Citation) => void;
  value: string;
  size?: keyof typeof sizes;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useMemo(() => makeStyles(size), [size]);
  const renderer = useMemo(() => new CitationRenderer(citations, onCitation), [citations, onCitation]);
  const nodes = useMarkdown(value, { colorScheme: "dark", theme, styles, renderer });
  return (
    <View style={style}>
      {nodes.map((node, index) => (
        <Fragment key={index}>{node}</Fragment>
      ))}
    </View>
  );
}

class CitationRenderer extends Renderer {
  private citations: CitationMap;
  private open: (citation: Citation) => void;
  constructor(citations: CitationMap, open: (citation: Citation) => void) { super(); this.citations = citations; this.open = open; }
  override link(children: string | ReactNode[], href: string, styles?: TextStyle, title?: string): ReactNode {
    const citation = href.startsWith("cite:") ? this.citations.get(href.slice(5)) : undefined;
    if (!citation) {
      if (!/^https?:/i.test(href)) return <Text key={this.getKey()} style={styles}>{children}</Text>;
      return <Text key={this.getKey()} accessibilityRole="link" accessibilityLabel={title ?? (typeof children === "string" ? children : "Open link")} style={styles} onPress={() => { void Linking.openURL(href); }}>{children}</Text>;
    }
    return <Pressable key={this.getKey()} accessibilityRole="link" accessibilityLabel={`Open ${citationLabel(citation)}`} onPress={() => this.open(citation)} hitSlop={6} style={{ minHeight: 32, justifyContent: "center", borderWidth: 1, borderColor: colors["line-2"], borderRadius: 7, paddingHorizontal: 10, backgroundColor: "transparent" }}>
      <Text color="accent-text" style={{ fontSize: 13, lineHeight: 16 }}>{citationLabel(citation)}</Text>
    </Pressable>;
  }
}
