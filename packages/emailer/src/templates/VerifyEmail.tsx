/** @jsxRuntime automatic @jsxImportSource react */
import { Button, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, buttonStyle, copyStyle, metaStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"verify-email">;
export const VerifyEmail = ({ name, url }: Props) => (
  <Layout preview="Confirm your email to finish setting up Avenire">
    <Text style={titleStyle}>Confirm your email</Text>
    <Text style={copyStyle}>
      Hi {name}, one more step. Confirm this address and Avenire is ready for your first notes.
    </Text>
    <Button href={url} style={buttonStyle}>
      Confirm email
    </Button>
    <Text style={{ ...metaStyle, margin: "20px 0 0" }}>
      If you didn't create an Avenire account, you can ignore this email.
    </Text>
  </Layout>
);
VerifyEmail.PreviewProps = { name: "Ava", url: "https://avenire.space/verify" } satisfies Props;
export default VerifyEmail;
