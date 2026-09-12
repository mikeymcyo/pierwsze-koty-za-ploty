/**
 * One line saying what the folded details of a Daily Report will print.
 *
 * Pure, with no runtime imports and no path aliases, so it can be tested
 * directly.
 *
 * The date, the weather, the workforce and the plant are printed in the
 * issued PDF's appendix, and the rule on this app is that nothing which
 * reaches the client is hidden on the screen that issues it. They used to be
 * inline for that reason, and they made the screen a form. Now they fold, and
 * this line is what keeps the rule: every value that will print is on the
 * summary of the fold, so a workforce row nobody opened the panel to check is
 * still a workforce row they read.
 */
export type DetailsInput = {
  reportDate: string | null;
  weather: string | null;
  workforce: readonly { company_name: string; trade?: string | null; operatives: number }[];
  plant: readonly { description: string; quantity: number }[];
};

export const NOTHING_RECORDED = "No workforce or plant recorded yet";

export function summariseDetails(
  input: DetailsInput,
  formatDate: (value: string) => string | null,
): string {
  const parts: string[] = [];
  const date = input.reportDate ? formatDate(input.reportDate) : null;
  if (date) parts.push(date);
  if (input.weather?.trim()) parts.push(input.weather.trim());

  const people = input.workforce
    .filter((row) => row.company_name.trim())
    .map((row) => `${row.company_name.trim()} ×${row.operatives}`);
  const kit = input.plant
    .filter((row) => row.description.trim())
    .map((row) => `${row.description.trim()} ×${row.quantity}`);

  if (people.length === 0 && kit.length === 0) parts.push(NOTHING_RECORDED);
  else parts.push(...people, ...kit);

  return parts.join(" · ");
}
