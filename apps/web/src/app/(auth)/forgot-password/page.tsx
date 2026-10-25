import type { Metadata } from "next";
import { AuthPage } from "~/features/auth/auth-page";

export const metadata: Metadata = { title: "Forgot password" };

export default function Page() {
  return <AuthPage mode="forgot-password" />;
}
