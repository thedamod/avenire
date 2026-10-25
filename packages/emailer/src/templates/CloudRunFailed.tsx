/** @jsxRuntime automatic @jsxImportSource react */
import { Button, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, buttonStyle, colors, copyStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"cloud-run-failed">;
export const CloudRunFailed = ({ name, taskTitle, reason, retryUrl }: Props) => (
  <Layout preview={`${taskTitle} stopped early`}>
    <Text style={titleStyle}>{taskTitle} stopped early</Text>
    <Text style={copyStyle}>Hi {name}, Ruth couldn't finish this run overnight.</Text>
    <Text
      style={{
        ...copyStyle,
        padding: "0 0 0 14px",
        borderLeft: `2px solid ${colors.line}`,
        color: colors.text,
      }}
    >
      {reason}
    </Text>
    <Button href={retryUrl} style={buttonStyle}>
      Open Ruth Cloud
    </Button>
  </Layout>
);
CloudRunFailed.PreviewProps = {
  name: "Ruth",
  taskTitle: "Nightly study digest",
  reason: "The study workspace was temporarily unavailable.",
  retryUrl: "https://avenire.space/cloud",
} satisfies Props;
export default CloudRunFailed;
