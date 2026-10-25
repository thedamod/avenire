/** @jsxRuntime automatic @jsxImportSource react */
import { Button, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, buttonStyle, copyStyle, metaStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"reset-password">;
export const ResetPassword = ({ name, url }: Props) => (
  <Layout preview="Choose a new Avenire password">
    <Text style={titleStyle}>Reset your password</Text>
    <Text style={copyStyle}>
      Hi {name}, we got a request to reset your Avenire password. The link below lets you choose a
      new one.
    </Text>
    <Button href={url} style={buttonStyle}>
      Choose a new password
    </Button>
    <Text style={{ ...metaStyle, margin: "20px 0 0" }}>
      If you didn't ask for this, you can ignore this email. Your password stays as it is.
    </Text>
  </Layout>
);
ResetPassword.PreviewProps = { name: "Ruth", url: "https://avenire.space/reset" } satisfies Props;
export default ResetPassword;
