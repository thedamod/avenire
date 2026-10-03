import { Button, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, copyStyle, linkStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"reset-password">;
export const ResetPassword = ({ name, url }: Props) => (
  <Layout preview="Reset your Avenire password">
    <Text style={titleStyle}>Reset your password</Text>
    <Text style={copyStyle}>
      Hello {name}, we received a request to reset your Avenire password. Use the link below to
      choose a new one.
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
      Choose a new password
    </Button>
    <Text style={{ ...copyStyle, marginTop: 22, fontSize: 13 }}>
      If you did not request this, you can ignore this email.
    </Text>
  </Layout>
);
ResetPassword.PreviewProps = { name: "Ruth", url: "https://avenire.space/reset" } satisfies Props;
export default ResetPassword;
