import type { Metadata } from "next";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = { title: "Choose a new password" };

export default function ResetPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-2xl">Choose a new password</CardTitle>
        <CardDescription>
          You&rsquo;ll be signed in as soon as it&rsquo;s saved.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
