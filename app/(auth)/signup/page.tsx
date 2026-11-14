import type { Metadata } from "next";
import Link from "next/link";

import { SignupForm } from "@/components/auth/signup-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Create your account" };

export default function SignupPage() {
  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Create your account</CardTitle>
          <CardDescription>
            Professional site reports from your phone, in minutes.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignupForm />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </div>
  );
}
