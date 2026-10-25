import type { Metadata } from "next";
import { AuthPage } from "~/features/auth/auth-page";

export const metadata: Metadata = { title: "Verify email" };

export default function Page() {
  return <AuthPage mode="verify-email" />;
}
