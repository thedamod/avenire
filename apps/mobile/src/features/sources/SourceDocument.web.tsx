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
    <iframe
      src={url}
      title={title}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      onError={() => onError("This source could not be opened.")}
      style={{ width: "100%", height: "100%", border: 0, background: "#0B0B0B" }}
    />
  );
}
