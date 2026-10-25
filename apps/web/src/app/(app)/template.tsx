/**
 * Re-mounts on every route change: the new page fades in over 150ms (opacity only, so fixed
 * docks and headers inside never re-parent to a transformed ancestor). Nothing waits on it;
 * the page is interactive from the first frame. See apps/web/motion-audit.md.
 */
export default function AppTemplate({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="page-enter">{children}</div>;
}
