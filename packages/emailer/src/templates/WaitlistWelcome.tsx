/** @jsxRuntime automatic @jsxImportSource react */
import { Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, copyStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"waitlist-welcome">;
export const WaitlistWelcome = (_props: Props) => (
  <Layout preview="You're on the list for Avenire">
    <Text style={titleStyle}>You're on the list.</Text>
    <Text style={copyStyle}>
      Thanks for joining Avenire. We're building a place to keep your study material in order and
      bring you the part you need.
    </Text>
    <Text style={copyStyle}>We'll be in touch when it's time to get started.</Text>
  </Layout>
);
WaitlistWelcome.PreviewProps = {} satisfies Props;
export default WaitlistWelcome;
