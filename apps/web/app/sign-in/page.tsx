import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <AuthCard mode="sign-in" />
    </Suspense>
  );
}
