// A settlement write is an approval only when the accountant submits financials.
// Expense syncs from the jobs screen post to the same endpoint and must never
// approve a trip — doing so unlocks it in the driver app (driverAppController.ts).
export function isApprovalWrite(body: { financials?: unknown }): boolean {
  return body.financials !== undefined && body.financials !== null;
}
