import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export const Layout = ({
  preview,
  children,
}: {
  readonly preview: string;
  readonly children: ReactNode;
}) => (
  <Html>
    <Head />
    <Preview>{preview}</Preview>
    <Body
      style={{
        margin: 0,
        backgroundColor: "#f7f7fa",
        color: "#252536",
        fontFamily: "Georgia, serif",
      }}
    >
      <Container
        style={{
          maxWidth: 560,
          margin: "36px auto",
          padding: "40px 36px",
          backgroundColor: "#ffffff",
        }}
      >
        <Section>
          <Text
            style={{
              margin: "0 0 30px",
              color: "#55527f",
              fontFamily: "Arial, sans-serif",
              fontSize: 13,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            Avenire
          </Text>
          {children}
        </Section>
      </Container>
    </Body>
  </Html>
);

export const titleStyle = { margin: "0 0 18px", fontSize: 28, lineHeight: "1.25", fontWeight: 400 };
export const copyStyle = { margin: "0 0 18px", fontSize: 16, lineHeight: "1.6", color: "#555565" };
export const linkStyle = {
  color: "#55527f",
  fontFamily: "Arial, sans-serif",
  fontSize: 14,
  fontWeight: 600,
};
