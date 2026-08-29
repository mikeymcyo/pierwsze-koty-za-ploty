import type { Metadata } from "next";
import { LogOut, Settings as SettingsIcon } from "lucide-react";

import { signOut } from "@/app/(auth)/actions";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { APP_VERSION } from "@/lib/app-version";
import { displayName, requireSessionContext } from "@/lib/auth/session";
import { shortBuildRef } from "@/lib/build-info";

export const metadata: Metadata = { title: "Settings" };

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line py-3 last:border-b-0">
      <dt className="text-sm text-ink-muted">{label}</dt>
      <dd className="text-right text-sm font-semibold text-ink">{value}</dd>
    </div>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h2 className="text-sm font-bold tracking-wide text-ink-muted uppercase">{children}</h2>
  );
}

export default async function SettingsPage() {
  const session = await requireSessionContext();

  // Read as a literal rather than passing process.env through, so the value is
  // whatever this deployment was built and is running with.
  const buildRef = shortBuildRef({ VERCEL_GIT_COMMIT_SHA: process.env.VERCEL_GIT_COMMIT_SHA });

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Settings"
        description="How this device shows SiteBoss, and who you are signed in as."
        icon={SettingsIcon}
      />

      <section className="flex flex-col gap-3">
        <SectionTitle>This device</SectionTitle>
        <AppearanceSettings />
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>Account</SectionTitle>
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
      </section>

      <section className="flex flex-col gap-3">
        <SectionTitle>App</SectionTitle>
        <Card>
          <CardContent>
            <dl className="flex flex-col">
              <DetailRow label="Version" value={APP_VERSION} />
              {/* Absent off Vercel, where there is no commit to name. */}
              <DetailRow label="Build" value={buildRef ?? "local"} />
            </dl>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
