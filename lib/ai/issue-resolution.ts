import "server-only";

import OpenAI from "openai";
import { z } from "zod";

import type { ResolutionSuggestion } from "@/lib/issues/metadata";

/**
 * Whether today's notes say an open issue has been put right.
 *
 * The Southampton case this exists for: Saturday's Daily recorded that the
 * H&B section could not be finished because the upright inserts were
 * missing. They came on Monday and the section was completed - and nothing
 * offered to mark the Saturday issue resolved, so the Progress Report still
 * carried it as outstanding.
 *
 * This reads the day's notes against the project's open issues and names the
 * ones the notes clearly resolve, with a one-line note in the site manager's
 * own words. It writes nothing. The suggestion is shown on the report as
 * "Resolve this issue?" and the issue changes only when a person confirms.
 *
 * Conservative on purpose: an issue is named only where the notes say the
 * thing was done, received, fixed or completed. "Still waiting", "chased",
 * "due Thursday" is not resolution, and doubt returns nothing.
 */
export type ResolutionSuggestionResult =
  | { ok: true; suggestions: ResolutionSuggestion[] }
  | { ok: false; error: string };

const replySchema = z.object({
  resolved: z.array(z.object({ issueId: z.string(), note: z.string() })),
});

const SYSTEM_PROMPT = [
  "You are an experienced UK construction site manager checking the day's site notes against the project's open issues.",
  "Your only job is to say which open issues, if any, the notes clearly record as resolved today.",
  "An issue is resolved only when the notes state that the thing it describes was done, received, fixed, installed, completed or signed off.",
  "Waiting, chasing, ordering, a delivery due later, partial progress, or work on something else is NOT resolution.",
  "When in doubt, leave the issue out. Return an empty list rather than guess.",
  "Never invent an issue id. Use only the ids supplied.",
  "The note is one short sentence in plain site English, quoting the notes where you can: what was done and, if stated, when.",
].join(" ");

export async function suggestResolvedIssues(input: {
  notes: string[];
  issues: { id: string; title: string; description: string | null }[];
}): Promise<ResolutionSuggestionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "AI drafting is not configured on this deployment." };
  if (input.issues.length === 0 || input.notes.every((note) => !note.trim())) {
    return { ok: true, suggestions: [] };
  }

  const userPrompt = [
    "OPEN ISSUES (id · title · description):",
    ...input.issues.map(
      (issue) => `${issue.id} · ${issue.title}${issue.description ? ` · ${issue.description}` : ""}`,
    ),
    "",
    "TODAY'S SITE NOTES, verbatim:",
    ...input.notes.map((note) => `- ${note}`),
  ].join("\n");

  try {
    const client = new OpenAI({ apiKey });
    const completion = await client.chat.completions.create({
      model: process.env.OPENAI_MODEL?.trim() || "gpt-5.5",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "resolved_issues",
          strict: true,
          schema: {
            type: "object",
            properties: {
              resolved: {
                type: "array",
                description:
                  "Only the open issues the notes clearly record as resolved today. Empty when none are.",
                items: {
                  type: "object",
                  properties: {
                    issueId: { type: "string", description: "Exactly one of the ids supplied." },
                    note: {
                      type: "string",
                      description:
                        "One short sentence: what was done and, if the notes say, when. Under 25 words.",
                    },
                  },
                  required: ["issueId", "note"],
                  additionalProperties: false,
                },
              },
            },
            required: ["resolved"],
            additionalProperties: false,
          },
        },
      },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) return { ok: true, suggestions: [] };
    const parsed = replySchema.safeParse(JSON.parse(content));
    if (!parsed.success) return { ok: true, suggestions: [] };

    // Only ids that were actually offered. The model is told not to invent
    // one; this is what makes that true of what reaches the screen.
    const offered = new Set(input.issues.map((issue) => issue.id));
    return {
      ok: true,
      suggestions: parsed.data.resolved
        .filter((item) => offered.has(item.issueId) && item.note.trim())
        .map((item) => ({ issueId: item.issueId, note: item.note.trim() })),
    };
  } catch (cause) {
    console.error("[siteboss] resolution suggestion failed:", cause);
    return { ok: false, error: "The notes could not be checked against the open issues." };
  }
}
