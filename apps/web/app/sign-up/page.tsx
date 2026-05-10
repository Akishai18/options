import { Suspense } from "react";
import { AuthCard } from "@/components/auth/AuthCard";

export default function SignUpPage() {
  return (
    <Suspense fallback={null}>
      <AuthCard mode="sign-up" />
    </Suspense>
  );
}
