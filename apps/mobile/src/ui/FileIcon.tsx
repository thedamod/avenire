import { useState } from "react";
import { Image, View } from "react-native";
import { Icon, type IconName } from "./Icon";
import { colors } from "../theme/tokens";
export type FileKind =
  | "pdf"
  | "document"
  | "doc"
  | "note"
  | "video"
  | "youtube"
  | "web"
  | "url"
  | "image"
  | "audio"
  | "archive";
export interface FileIconProps {
  type: FileKind | (string & {});
  url?: string;
  faviconUrl?: string;
  size?: number;
  color?: string;
  framed?: boolean;
}
const fileIcons: Record<FileKind, IconName> = {
  pdf: "doc",
  document: "doc",
  doc: "doc",
  note: "note",
  video: "video",
  youtube: "video",
  web: "globe",
  url: "globe",
  image: "image",
  audio: "mic",
  archive: "folder",
};
export function FileIcon({
  type,
  url,
  faviconUrl,
  size = 16,
  color = colors["fg-2"],
  framed = false,
}: FileIconProps) {
  const [failedUri, setFailedUri] = useState<string>();
  let uri = faviconUrl;
  if (!uri && url && (type === "web" || type === "url")) {
    try {
      const site = new URL(url);
      if (site.protocol === "https:" || site.protocol === "http:")
        uri = `${site.origin}/favicon.ico`;
    } catch {
      /* Invalid URLs use the globe icon. */
    }
  }
  const icon =
    uri && uri !== failedUri ? (
      <Image
        accessibilityIgnoresInvertColors
        source={{ uri }}
        style={{ width: size, height: size, borderRadius: 3 }}
        onError={() => setFailedUri(uri)}
      />
    ) : (
      <Icon
        name={fileIcons[type as FileKind] ?? "doc"}
        size={size}
        color={color}
        strokeWidth={1.4}
      />
    );
  return (
    <View
      style={{
        width: framed ? 32 : size,
        height: framed ? 32 : size,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        ...(framed
          ? {
              borderRadius: 6,
              backgroundColor: colors["surface-1"],
              borderWidth: 1,
              borderColor: colors.line,
            }
          : {}),
      }}
    >
      {icon}
    </View>
  );
}
