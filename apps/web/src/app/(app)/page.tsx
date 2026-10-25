import { Suspense } from "react";
import { HomePage } from "~/features/home/HomePage";

export default function Page() {
  return (
    <Suspense>
      <HomePage />
    </Suspense>
  );
}
