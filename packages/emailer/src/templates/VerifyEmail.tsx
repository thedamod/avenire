import { Button, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, copyStyle, linkStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"verify-email">;
export const VerifyEmail = ({ name, url }: Props) => (
  <Layout preview="Verify your Avenire email address">
    <Text style={titleStyle}>A more thoughtful morning starts here.</Text>
    <Text style={copyStyle}>
      Hello {name}, confirm your email address to finish setting up Avenire.
    </Text>
    <Button
      href={url}
      style={{
        ...linkStyle,
        display: "inline-block",
        padding: "13px 20px",
        backgroundColor: "#55527f",
        color: "#ffffff",
        textDecoration: "none",
      }}
    >
      Verify email
    </Button>
  </Layout>
);
VerifyEmail.PreviewProps = { name: "Ruth", url: "https://avenire.space/verify" } satisfies Props;
export default VerifyEmail;
