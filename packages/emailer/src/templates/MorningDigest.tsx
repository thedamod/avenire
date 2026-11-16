/** @jsxRuntime automatic @jsxImportSource react */
import { Button, Hr, Link, Text } from "@react-email/components";
import type { TemplateProps } from "./index.ts";
import {
  Layout,
  buttonStyle,
  colors,
  copyStyle,
  linkStyle,
  metaStyle,
  titleStyle,
} from "./Layout.tsx";

type Props = TemplateProps<"morning-digest">;
export const MorningDigest = ({
  name,
  date,
  taskTitle,
  summary,
  filesRead,
  produced,
  pendingApprovals,
  reportUrl,
}: Props) => (
  <Layout preview={`${taskTitle}: ${summary}`}>
    <Text style={titleStyle}>Good morning, {name}</Text>
    <Text style={metaStyle}>
      {taskTitle} · {date} · {filesRead} {filesRead === 1 ? "file" : "files"} read
    </Text>
    <Text style={copyStyle}>{summary}</Text>
    {produced.length > 0 && (
      <>
        <Hr style={{ margin: "4px 0 12px", borderColor: colors.line }} />
        <Text style={{ ...metaStyle, margin: "0 0 8px" }}>Made overnight</Text>
        {produced.map((file) => (
          <Text key={file.url} style={{ margin: "0 0 6px" }}>
            <Link href={file.url} style={linkStyle}>
              {file.title}
            </Link>
          </Text>
        ))}
        <Hr style={{ margin: "12px 0 16px", borderColor: colors.line }} />
      </>
    )}
    {pendingApprovals > 0 && (
      <Text style={copyStyle}>
        {pendingApprovals} {pendingApprovals === 1 ? "change waits" : "changes wait"} for your
        review.
      </Text>
    )}
    <Button href={reportUrl} style={buttonStyle}>
      Read the report
    </Button>
  </Layout>
);
MorningDigest.PreviewProps = {
  name: "Ava",
  date: "2026-10-21",
  taskTitle: "Nightly study digest",
  summary: "Your thermodynamics notes were reviewed and a short quiz is ready.",
  filesRead: 3,
  produced: [
    {
      title: "Entropy and the second law: review",
      url: "https://avenire.space/library?file=review",
    },
  ],
  pendingApprovals: 1,
  reportUrl: "https://avenire.space/ruth/thread?message=report",
} satisfies Props;
export default MorningDigest;
