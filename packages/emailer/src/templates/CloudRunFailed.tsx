import { Button, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, copyStyle, linkStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"cloud-run-failed">;
export const CloudRunFailed = ({ name, reason, retryUrl }: Props) => (
  <Layout preview="Your Avenire study run needs another try">
    <Text style={titleStyle}>Your overnight run stopped early</Text>
    <Text style={copyStyle}>Hello {name}, Ruth could not finish preparing your study materials.</Text>
    <Text style={{ ...copyStyle, padding: 16, backgroundColor: "#f7f7fa" }}>{reason}</Text>
    <Button href={retryUrl} style={{ ...linkStyle, display: "inline-block", padding: "13px 20px", backgroundColor: "#55527f", color: "#ffffff", textDecoration: "none" }}>Try again</Button>
  </Layout>
);
CloudRunFailed.PreviewProps = { name: "Ruth", reason: "The study workspace was temporarily unavailable.", retryUrl: "https://avenire.space/cloud" } satisfies Props;
export default CloudRunFailed;
