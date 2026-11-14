/**
 * Plans Completion Report provenance without a database dependency.
 *
 * A reviewed Progress Report is a source in its own right. Every Daily Report
 * underneath it is still recorded, carrying `via` so it is auditable but is
 * not fed to the writer a second time. A daily outside every selected Progress
 * Report remains a direct source.
 */
export function completionSourcePlan(
  dailyIds: readonly string[],
  progress: readonly { id: string; dailyIds: readonly string[] }[],
): {
  progressIds: string[];
  daily: { id: string; via: string | null }[];
} {
  const viaByDaily = new Map<string, string>();
  for (const report of progress) {
    for (const dailyId of report.dailyIds) {
      if (!viaByDaily.has(dailyId)) viaByDaily.set(dailyId, report.id);
    }
  }
  return {
    progressIds: progress.map((report) => report.id),
    daily: Array.from(new Set(dailyIds)).map((id) => ({ id, via: viaByDaily.get(id) ?? null })),
  };
}
