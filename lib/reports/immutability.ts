/**
 * A finalised report is an issued record and does not change.
 *
 * Hiding the controls is not enough on its own: a form that is no longer
 * rendered can still be submitted, and every mutation that touches a report
 * has to refuse one that has been issued. This message is what they all say,
 * so the answer is the same wherever it is met.
 */
export const REPORT_IS_FINAL =
  "This report has been finalised and cannot be changed. Its PDF is the record that was issued.";
