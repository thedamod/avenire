import { Button, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, copyStyle, linkStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"morning-digest">;
export const MorningDigest = ({ name, date, itemsStudied, artifacts }: Props) => (
  <Layout preview="Your Avenire study digest is ready">
    <Text style={titleStyle}>Good morning, {name}.</Text>
    <Text style={copyStyle}>
      Ruth worked through yesterday&apos;s material; here&apos;s what&apos;s ready.
    </Text>
    <Text style={{ ...copyStyle, color: "#55527f" }}>
      {date} · {itemsStudied} {itemsStudied === 1 ? "item" : "items"} studied
    </Text>
    {artifacts.map((artifact) => (
      <Text key={`${artifact.kind}-${artifact.title}`} style={copyStyle}>
        <a href={artifact.url} style={linkStyle}>
          {artifact.title}
        </a>
        <br />
        {artifact.kind}
      </Text>
    ))}
    <Button
      href={artifacts[0]?.url ?? "https://avenire.space"}
      style={{
        ...linkStyle,
        display: "inline-block",
        marginTop: 12,
        padding: "13px 20px",
        backgroundColor: "#55527f",
        color: "#ffffff",
        textDecoration: "none",
      }}
    >
      Open your study space
    </Button>
  </Layout>
);
MorningDigest.PreviewProps = {
  name: "Ruth",
  date: "Tuesday, October 6",
  itemsStudied: 3,
  artifacts: [{ kind: "summary", title: "A concise review", url: "https://avenire.space" }],
} satisfies Props;
export default MorningDigest;
