/** Paper uses a 16px CSS blur; Expo's web intensity maps to a different pixel radius. */
export function GlassBackdrop() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
      }}
    />
  );
}
