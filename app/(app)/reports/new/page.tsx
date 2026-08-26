import type { Metadata } from "next";
import Link from "next/link";
import { HardHat, PlusCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSessionContext } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Create report" };

export default async function NewReportPage() {
  await requireSessionContext();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: false })
    .neq("status", "completed")
    .limit(1);

  if (error) {
    throw new Error(`Could not check your projects: ${error.message}`);
  }

  const hasProject = (data ?? []).length > 0;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold tracking-tight text-ink md:text-3xl">
        Create report
      </h1>

      {hasProject ? (
        <EmptyState
          icon={PlusCircle}
          title="Report capture is next"
          description="Your projects are ready. The capture screen — photos, dictation and AI drafting — is built in the next phase."
        />
      ) : (
        <EmptyState
          icon={HardHat}
          title="You need a project first"
          description="Reports are always attached to a project, so that's where to start."
          action={
            <Button asChild variant="secondary">
              <Link href="/projects">Go to projects</Link>
            </Button>
          }
        />
      )}
    </div>
  );
}
