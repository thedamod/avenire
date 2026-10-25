import type { Metadata } from "next";
import { AuthPage } from "~/features/auth/auth-page";

export const metadata: Metadata = { title: "Reset password" };

export default function Page() {
  return <AuthPage mode="reset-password" />;
}
