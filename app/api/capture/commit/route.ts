import { z } from "zod";
import { addCapture, resolveFieldReport } from "@/app/(app)/reports/capture-actions";
import { attachPhoto } from "@/app/(app)/reports/photo-actions";
import { getSessionContext } from "@/lib/auth/session";

// A route handler can accept evidence while a report-generation Server Action is in flight.
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return Response.json({ error: "Open SiteBoss again to retry." }, { status: 403 });
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "Expected capture metadata." }, { status: 415 });
  }
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({error: "Invalid capture."}, {status: 400});
  if (!await getSessionContext()) return Response.json({ error: "Sign in again to upload this capture." }, { status: 401 });
  try {
    if (body.kind === "report") {
      return Response.json({ reportId: await resolveFieldReport(body.projectId, body.day) });
    }
    if (body.kind === "photo") {
      const result = await attachPhoto(body.photo);
      if (result.error) return Response.json(result, {status: 409});
      return Response.json({ok:true});
    }
    if (body.kind === "note" && z.uuid().safeParse(body.reportId).success && typeof body.text === "string" && typeof body.at === "string") {
      const data = new FormData();
      data.set("capture_text", body.text); data.set("captured_at", body.at); data.set("field_retry", "1");
      const reply = await addCapture(body.reportId, {}, data);
      return Response.json(reply, { status: reply.error ? 409 : 200 });
    }
    return Response.json({error: "Invalid capture."}, {status: 400});
  } catch {
    return Response.json({ error: "The report could not confirm the upload. Please retry." }, {status: 503});
  }
}
