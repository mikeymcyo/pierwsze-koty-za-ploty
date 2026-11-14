/**
 * Turning a failed parse into something a site manager can act on.
 *
 * Pure, with no runtime imports and no path aliases, so it can be tested
 * directly.
 *
 * This exists because of a real bug on a real iPad. The edit form sent its
 * resolution field, the server action forgot to read it, and the schema - which
 * required a string - reported exactly what it saw:
 *
 *   "Invalid input: expected string, received undefined"
 *
 * printed under the Resolution box. The user could not close the issue and had
 * no idea why. The omission is fixed at source, but the deeper fault is that a
 * validator's internal vocabulary could reach a screen at all: any future
 * mismatch between a form and its action would do the same thing again.
 *
 * So nothing reaches the user unless it was written for them.
 */

/** The message shown when a field failed for a reason nobody wrote a sentence for. */
export const GENERIC_FIELD_MESSAGE = "Check this field and try again.";

/**
 * Phrases that only ever come from the validator itself.
 *
 * Matched conservatively: a message we wrote could legitimately contain the
 * word "required", so the test is for the validator's sentence shapes rather
 * than for individual words.
 */
const INTERNAL_MESSAGE_PATTERNS: RegExp[] = [
  /invalid input/i,
  /expected .+, *received/i,
  /^required$/i,
  /^invalid$/i,
  /must contain at (least|most)/i,
  /invalid_(type|string|enum|union)/i,
  /^unrecognized/i,
  /nan|undefined|null/i,
];

/** Whether this message was written by a validator rather than by a person. */
export function isInternalMessage(message: string): boolean {
  const trimmed = message.trim();
  if (trimmed.length === 0) return true;
  return INTERNAL_MESSAGE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

/**
 * The message to actually show for one field.
 *
 * Anything that reads like validator output is replaced. Losing a little
 * precision is the right trade: a message nobody can act on is worth less than
 * a plain one, and the specific messages this application writes come through
 * untouched.
 */
export function userFacingMessage(message: string): string {
  return isInternalMessage(message) ? GENERIC_FIELD_MESSAGE : message.trim();
}

/**
 * Field errors as the screen should show them.
 *
 * Takes the raw issues from a failed parse - path and message - and keeps the
 * first message per field, sanitised.
 */
export function fieldErrorsFrom(
  issues: readonly { path: readonly (string | number | symbol)[]; message: string }[],
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === "string" && !result[key]) {
      result[key] = userFacingMessage(issue.message);
    }
  }
  return result;
}

/** What the user is told when a closed issue arrives with nothing recorded. */
export const RESOLUTION_REQUIRED = "Add a resolution before closing this issue.";
