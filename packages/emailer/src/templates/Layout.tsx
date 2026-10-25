/** @jsxRuntime automatic @jsxImportSource react */
import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

/** Brand files must be absolute and public: mail clients load them with no session. */
export const SITE_URL = "https://avenire.space";

const font = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export const colors = {
  page: "#0b0b0b",
  card: "#111111",
  line: "#222222",
  text: "#ededed",
  body: "#a3a3a3",
  muted: "#6e6e6e",
  accent: "#abc4ff",
  onLight: "#0a0a0a",
} as const;

export const Layout = ({
  preview,
  children,
}: {
  readonly preview: string;
  readonly children: ReactNode;
}) => (
  <Html lang="en">
    <Head>
      <meta name="color-scheme" content="dark" />
      <meta name="supported-color-schemes" content="dark" />
    </Head>
    <Preview>{preview}</Preview>
    <Body style={{ margin: 0, backgroundColor: colors.page, color: colors.text, fontFamily: font }}>
      <Container style={{ maxWidth: 520, margin: "0 auto", padding: "40px 20px" }}>
        <Section style={{ marginBottom: 28 }}>
          <Img
            src={`${SITE_URL}/branding/avenire-mark-white.png`}
            alt="Avenire"
            width={32}
            height={25}
            style={{ display: "block" }}
          />
        </Section>
        <Section
          style={{
            padding: "32px 28px",
            backgroundColor: colors.card,
            border: `1px solid ${colors.line}`,
            borderRadius: 10,
          }}
        >
          {children}
        </Section>
        <Hr style={{ margin: "28px 0 16px", borderColor: colors.line }} />
        <Text style={{ margin: 0, fontSize: 12, lineHeight: "18px", color: colors.muted }}>
          Avenire captures what you study and has Ruth work on it overnight.{" "}
          <Link href={SITE_URL} style={{ color: colors.muted, textDecoration: "underline" }}>
            avenire.space
          </Link>
        </Text>
      </Container>
    </Body>
  </Html>
);

export const titleStyle: CSSProperties = {
  margin: "0 0 12px",
  fontSize: 24,
  lineHeight: "30px",
  fontWeight: 600,
  color: colors.text,
};

export const copyStyle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: 14,
  lineHeight: "22px",
  color: colors.body,
};

export const metaStyle: CSSProperties = {
  margin: "0 0 16px",
  fontSize: 12,
  lineHeight: "18px",
  color: colors.muted,
};

export const buttonStyle: CSSProperties = {
  display: "inline-block",
  padding: "0 16px",
  height: 36,
  lineHeight: "36px",
  borderRadius: 8,
  backgroundColor: colors.text,
  color: colors.onLight,
  fontSize: 13,
  fontWeight: 500,
  textDecoration: "none",
};

export const linkStyle: CSSProperties = {
  color: colors.accent,
  fontSize: 14,
  textDecoration: "none",
};
