import { Badge } from "@/components/ui/badge";
import type { ProjectStatus } from "@/types/database";

const STATUS_LABELS: Record<ProjectStatus, string> = {
  active: "Active",
  // Named for what it is on the screen. Somebody scanning a list has to be
  // able to tell an enquiry from a live job without opening it.
  survey: "Survey / enquiry",
  on_hold: "On hold",
  completed: "Completed",
};

const STATUS_TONES: Record<ProjectStatus, "success" | "warning" | "neutral" | "info"> = {
  active: "success",
  survey: "info",
  on_hold: "warning",
  completed: "neutral",
};

/** Whether this project is an enquiry rather than work in hand. */
export function isEnquiry(status: ProjectStatus): boolean {
  return status === "survey";
}

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  return (
    <Badge tone={STATUS_TONES[status]} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export { STATUS_LABELS as PROJECT_STATUS_LABELS };
