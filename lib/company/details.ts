/**
 * What a company's own details are, and who may change them.
 *
 * Pure, with no runtime imports and no path aliases, so the rules can be
 * tested without a database and read the same way from the action and the
 * screen.
 *
 * The rule that shapes this: the company name is read live, at the moment a
 * report or a PDF is rendered. So renaming the company changes what the next
 * document says and changes nothing about the ones already issued - their
 * bytes are in storage and are never re-rendered. That is not a side effect to
 * be tidied up later; it is the correct behaviour. A progress report issued
 * under a former trading name was issued under that name, and quietly
 * rewriting it would falsify a record somebody may be holding.
 */

export type CompanyRole = "owner" | "member";

export const COMPANY_NAME_MIN = 2;
export const COMPANY_NAME_MAX = 120;

export const COMPANY_OWNER_ONLY =
  "Only the company owner can change these details. Ask them to make the change.";

/** Said on the screen before the change, not after it. */
export const COMPANY_RENAME_NOTE =
  "Reports issued from now on carry the new name. Documents already issued keep the name they went out under - they are the record and are not rewritten.";

/**
 * Company details are the whole company's, not one person's, so they follow
 * the same ownership the database enforces. The check is repeated here so the
 * screen can hide what it would refuse, but the answer that counts is the RLS
 * policy - a form that is no longer rendered can still be submitted.
 */
export function canEditCompanyDetails(role: CompanyRole): boolean {
  return role === "owner";
}

/**
 * Why this name cannot be used, or null when it can.
 *
 * Deliberately thin. A company is called whatever it is called - punctuation,
 * an ampersand, a foreign character, "Ltd" or not - so the only things refused
 * are a name that is empty and one that would not fit in a PDF header.
 */
export function companyNameProblem(value: string): string | null {
  const name = value.trim();
  if (name.length < COMPANY_NAME_MIN) return "Enter the company name.";
  if (name.length > COMPANY_NAME_MAX) {
    return `Keep the company name to ${COMPANY_NAME_MAX} characters or fewer.`;
  }
  return null;
}
