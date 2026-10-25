import { Suspense } from "react";
import { AuthShell } from "~/features/auth/AuthShell";
import "~/features/auth/auth.css";
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthShell>
      <Suspense
        fallback={
          <div className="auth-loading" role="status">
            Loading…
          </div>
        }
      >
        {children}
      </Suspense>
    </AuthShell>
  );
}
