import type { Metadata } from "next";
import { LogOut } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { displayName, requireSessionContext } from "@/lib/auth/session";
import { shortBuildRef } from "@/lib/build-info";

export const metadata: Metadata = { title: "Profile" };

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

export default async function ProfilePage() {
  const session = await requireSessionContext();

  // Read as a literal rather than passing process.env through, so the value is
  // whatever this deployment was built and is running with.
  const buildRef = shortBuildRef({ VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">Profile</h1>

      <Card>
        <CardContent>
          <dl className="flex flex-col">
            <DetailRow label="Name" value={displayName(session)} />
            <DetailRow label="Email" value={session.email ?? "—"} />
            <DetailRow label="Company" value={session.companyName} />
            <DetailRow
              label="Role"
              value={session.role === "owner" ? "Owner" : "Member"}
            />
          </dl>
        </CardContent>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="secondary" size="lg" className="w-full">
          <LogOut aria-hidden />
          Sign out
        </Button>
      </form>

      {/* Absent off Vercel, where there is no commit to name. */}
      {buildRef ? (
        <p className="text-center text-xs text-ink-subtle">Build {buildRef}</p>
      ) : null}
    </div>
  );
}
