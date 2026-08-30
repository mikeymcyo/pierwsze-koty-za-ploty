"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { Mic, Square } from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSpeechInput } from "@/lib/hooks/use-speech-input";
import { editableSections, sectionFieldName } from "@/lib/reports/group-text";
import { joinTranscript } from "@/lib/speech/transcript";

export type GroupEditorSection = {
  type: string;
  label: string;
  content: string | null;
  aiGenerated: boolean;
};

export type GroupEditorState = { error?: string; saved?: boolean };

/**
 * One stored section's field.
 *
 * The section it belongs to is `name`, decided here from the section type and
 * never inferred from what is typed into it.
 */
function Part({
  part,
  groupKey,
  groupLabel,
  labelled,
  value,
  rows,
  placeholder,
  onChange,
  onFocus,
}: {
  part: GroupEditorSection;
  groupKey: string;
  groupLabel: string;
  labelled: boolean;
  value: string;
  rows: number;
  placeholder?: string;
  onChange: (value: string) => void;
  onFocus: () => void;
}) {
  return (
    <div>
      {labelled ? (
        <span
          className="block px-4 pt-3 text-xs font-bold tracking-wide text-ink-muted uppercase"
          aria-hidden
        >
          {part.label}
        </span>
      ) : null}
      <textarea
        id={`${groupKey}-${part.type}`}
        name={sectionFieldName(part.type)}
        aria-label={labelled ? `${groupLabel} - ${part.label}` : groupLabel}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        rows={rows}
        placeholder={placeholder}
        className="w-full resize-y bg-transparent px-4 pt-2 pb-3 text-ink placeholder:text-ink-subtle focus:outline-none"
      />
    </div>
  );
}

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} className="self-start">
      {pending ? "Saving…" : "Save this section"}
    </Button>
  );
}

/**
 * One writing area for one visible section of the report.
 *
 * Not one box per stored section - a Progress Report used to put five
 * textareas on the screen, and five boxes is five boxes whichever heading they
 * sit under. This is one surface: one border, one Dictate button, one Save.
 *
 * ## Where the boundaries live
 *
 * Inside that surface each stored section has its own field. The part names
 * between them are page furniture - a `<span>`, not a line of text in a box -
 * so there is nothing to delete by accident and nothing to parse afterwards.
 * Text is saved to the section whose field it was typed into, and to no other.
 *
 * That is a deliberate replacement for what was here before, which separated
 * the sections with their names on a line inside one textarea. It read well
 * and it was wrong: deleting that line - easy to do one-handed on a phone -
 * silently moved next week's planned works into last week's completed works.
 * A status nobody changed, in a document that gets read back in a dispute.
 *
 * Moving a sentence from one part to another is still possible; it now takes a
 * deliberate cut and paste, which is the level of intent such a move deserves.
 *
 * ## Which parts appear
 *
 * The ones already written, and where nothing is written at all, the first -
 * so there is always somewhere to start. Not every stored section, which would
 * be eight empty boxes on a daily report and the clutter this removed.
 *
 * And only the first of them is in front of you. A Progress Overview drafted
 * into five parts showed five labelled fields, which is a pile of sub-section
 * editors whatever the surface around it looks like. The rest fold away behind
 * one line naming them.
 *
 * **They stay in the form while folded**, and that is load-bearing rather than
 * incidental: a field the browser does not post reads as an empty section on
 * save, and an empty section is a section cleared. `<details>` keeps its
 * children in the document, so folding hides them from a person and from
 * nobody else. Never replace it with a conditional render.
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
  /** The visible section's heading, used to name the surface for screen readers. */
  groupLabel: string;
  /** Every stored section in this group, in the order they read. */
  sections: GroupEditorSection[];
  action: (state: GroupEditorState, formData: FormData) => Promise<GroupEditorState>;
}) {
  const [state, formAction] = useActionState<GroupEditorState, FormData>(action, {});

  // Fixed at mount: a part must not appear or disappear under somebody's thumb
  // because of what they have just typed.
  const [parts] = useState(() => editableSections(sections));
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(parts.map((part) => [part.type, part.content ?? ""])),
  );
  // Dictation goes to the part being written in. Defaulting to the first means
  // pressing Dictate without touching anything still puts the words somewhere
  // sensible rather than nowhere.
  const [target, setTarget] = useState(() => parts[0]?.type ?? "");

  const { supported, listening, error, start, stop } = useSpeechInput({
    // The functional form matters: chunks can arrive faster than React
    // re-renders, and each one must build on the last.
    onText: (text) =>
      setValues((current) => ({
        ...current,
        [target]: joinTranscript(current[target] ?? "", text),
      })),
  });

  if (parts.length === 0) return null;

  const [primary, ...rest] = parts;
  const written = sections.filter((section) => section.content?.trim());
  const edited = written.some((section) => !section.aiGenerated);

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

      {/* One surface. The parts inside it are divided by a hairline and a
          quiet name, not by anything anybody can type over. */}
      <div className="overflow-hidden rounded-xl border border-line-strong bg-surface-sunken focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
        <Part
          part={primary}
          groupKey={groupKey}
          groupLabel={groupLabel}
          labelled={rest.length > 0}
          value={values[primary.type] ?? ""}
          rows={6}
          placeholder={
            rest.length > 0
              ? undefined
              : `Write or dictate ${groupLabel.toLowerCase()}. The AI can draft this for you from what you record.`
          }
          onChange={(next) => setValues((current) => ({ ...current, [primary.type]: next }))}
          onFocus={() => setTarget(primary.type)}
        />

        {/* Folded, never removed. The fields below are still posted with the
            form - see the note above - so saving does not empty the parts a
            person did not open. */}
        {rest.length > 0 ? (
          <details className="border-t border-line">
            <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-ink-muted">
              {`Also in this section: ${rest.map((part) => part.label).join(", ")}`}
            </summary>
            {rest.map((part) => (
              <div key={part.type} className="border-t border-line">
                <Part
                  part={part}
                  groupKey={groupKey}
                  groupLabel={groupLabel}
                  labelled
                  value={values[part.type] ?? ""}
                  rows={4}
                  onChange={(next) => setValues((current) => ({ ...current, [part.type]: next }))}
                  onFocus={() => setTarget(part.type)}
                />
              </div>
            ))}
          </details>
        ) : null}
      </div>

      {supported ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant={listening ? "danger" : "secondary"}
            size="lg"
            onClick={listening ? stop : start}
            aria-pressed={listening}
          >
            {listening ? <Square aria-hidden /> : <Mic aria-hidden />}
            {listening ? "Stop dictating" : "Dictate"}
          </Button>

          {listening ? (
            <span className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <span className="size-2.5 animate-pulse rounded-full bg-danger" aria-hidden />
              {rest.length > 0
                ? `Listening - this goes into ${
                    parts.find((part) => part.type === target)?.label ?? groupLabel
                  }`
                : "Listening - speak normally, it keeps going while you pause"}
            </span>
          ) : null}
        </div>
      ) : (
        // iOS Safari is the main case. The keyboard microphone types into the
        // same box, so the workflow is intact - say so rather than showing a
        // button that would do nothing.
        <p className="text-sm text-ink-muted">
          Dictation is not available in this browser. Tap the microphone on your
          keyboard instead - it types straight into the box above.
        </p>
      )}

      {error ? <Alert tone="danger">{error}</Alert> : null}
      {state.error ? <Alert tone="danger">{state.error}</Alert> : null}

      <div className="flex items-center gap-3">
        <SaveButton />
        {state.saved ? <span className="text-xs text-ink-muted">Saved</span> : null}
      </div>
    </form>
  );
}
