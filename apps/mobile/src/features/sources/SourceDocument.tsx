import { WebView } from "react-native-webview";

export function SourceDocument({
  url,
  title,
  onError,
}: {
  url: string;
  title: string;
  onError: (message: string) => void;
}) {
  return (
    <WebView
      source={{ uri: url }}
      accessibilityLabel={title}
      style={{ flex: 1, backgroundColor: "#0B0B0B" }}
      javaScriptEnabled={false}
      setSupportMultipleWindows={false}
      onError={(event) => onError(event.nativeEvent.description)}
      onHttpError={() => onError("This source could not be opened.")}
      onShouldStartLoadWithRequest={(request) =>
        request.url === url || request.url === "about:blank"
      }
    />
  );
}
