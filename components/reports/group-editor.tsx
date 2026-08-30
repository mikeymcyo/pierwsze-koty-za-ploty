"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import { DictationField } from "@/components/reports/dictation-field";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { GROUP_TEXT_HINT, composeGroupText } from "@/lib/reports/group-text";

export type GroupEditorSection = {
  type: string;
  label: string;
  content: string | null;
  aiGenerated: boolean;
};

export type GroupEditorState = { error?: string; saved?: boolean };

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} className="self-start">
      {pending ? "Saving…" : "Save this section"}
    </Button>
  );
}

/**
 * One writing box for one visible section of the report.
 *
 * Not one box per stored section. A Progress Report used to put five textareas
 * on the screen and a Completion Report five more, and five boxes is five
 * boxes whichever heading they sit under - on an iPad that is a form to be
 * endured rather than a report to be written. The stored sections underneath
 * are unchanged: they are composed into this box on the way in and parsed back
 * out on the way to the database, by lib/reports/group-text.ts.
 *
 * It dictates. That is the same microphone the day's notes use - the component
 * is `DictationField`, not a second implementation of one - so a Progress
 * Report, a survey and a Completion Report can all be spoken rather than typed
 * on a phone, which was the whole promise of the product.
 *
 * The Save button stays. Photograph captions autosave because losing one costs
 * a caption; a report section is a contractual record, and a person should say
 * when they are finished with it.
 */
export function GroupEditor({
  groupKey,
  groupLabel,
  sections,
  action,
}: {
  /** Which of the report's three sections this is, for the action that saves it. */
  groupKey: string;
  /** The visible section's heading, used to name the box for screen readers. */
  groupLabel: string;
  /** Every stored section in this group, in the order they read. */
  sections: GroupEditorSection[];
  action: (state: GroupEditorState, formData: FormData) => Promise<GroupEditorState>;
}) {
  const [state, formAction] = useActionState<GroupEditorState, FormData>(action, {});

  const written = sections.filter((section) => section.content?.trim());
  const edited = written.some((section) => !section.aiGenerated);
  const composed = composeGroupText(sections);

  // Some visible sections hold no written text at all - Photos & Evidence on a
  // Daily Report, a survey or a Progress Report is the photographs and nothing
  // else. A box there would save nowhere, so there is no box.
  if (sections.length === 0) return null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="groupKey" value={groupKey} />

      {written.length > 0 ? (
        <div className="flex items-center justify-end">
          {edited ? (
            <Badge tone="neutral">Edited by you</Badge>
          ) : (
            <Badge tone="info">Written by AI</Badge>
          )}
        </div>
      ) : null}

      <DictationField
        name="text"
        label={groupLabel}
        defaultValue={composed}
        rows={written.length > 0 ? 12 : 6}
        placeholder={`Write or dictate ${groupLabel.toLowerCase()}. The AI can draft this for you from what you record.`}
      />

      {sections.length > 1 ? <p className="text-xs text-ink-subtle">{GROUP_TEXT_HINT}</p> : null}

      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="flex items-center gap-3">
        <SaveButton />
        {state.saved ? <span className="text-xs text-ink-muted">Saved</span> : null}
      </div>
    </form>
  );
}
