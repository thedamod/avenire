import { Button, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import { Layout, copyStyle, linkStyle, titleStyle } from "./Layout.tsx";

type Props = TemplateProps<"morning-digest">;
export const MorningDigest = ({
  name,
  date,
  taskTitle,
  summary,
  itemsRead,
  produced,
  pendingApprovals,
  reportUrl,
}: Props) => (
  <Layout preview="Your Avenire study digest is ready">
    <Text style={titleStyle}>Good morning, {name}.</Text>
    <Text style={copyStyle}>{taskTitle}</Text>
    <Text style={{ ...copyStyle, color: "#55527f" }}>
      {date} · {itemsRead} {itemsRead === 1 ? "item" : "items"} read
    </Text>
    <Text style={copyStyle}>{summary}</Text>
    {produced.map((artifact) => (
      <Text key={artifact.url} style={copyStyle}>
        <a href={artifact.url} style={linkStyle}>
          {artifact.title}
        </a>
      </Text>
    ))}
    <Text style={copyStyle}>{pendingApprovals} changes wait for your review.</Text>
    <Button
      href={reportUrl}
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
      Read the full report
    </Button>
  </Layout>
);
MorningDigest.PreviewProps = {
  name: "Ruth",
  date: "Tuesday, October 6",
  taskTitle: "Nightly study digest",
  summary: "Your notes, quiz and flashcards are ready.",
  itemsRead: 3,
  produced: [{ title: "A concise review", url: "https://avenire.space/library?item=review" }],
  pendingApprovals: 1,
  reportUrl: "https://avenire.space/ruth/cloud",
} satisfies Props;
export default MorningDigest;
