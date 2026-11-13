export async function commitFieldPart(body: object): Promise<{ok?: boolean; reportId?: string; savedAt?: string}> {
  const response = await fetch("/api/capture/commit", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  if (response.redirected) throw new Error("Sign in again and retry the upload.");
  const result = await response.json().catch(() => null);
  if (!response.ok || !result || result.error) throw new Error(result?.error || "Upload interrupted. Please retry.");
  return result;
}
