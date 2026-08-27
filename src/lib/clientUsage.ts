/**
 * What a client is attached to, and how to say it out loud.
 *
 * Deleting a client removes the account, not the trade: the bookings, invoices
 * and payments stay, but the name on them goes with the client and they read as
 * "Direct Client" from then on. There is no way back, so the confirmation has to
 * name what it is about to detach rather than ask a generic "are you sure".
 */
export interface ClientUsage {
  bookings: number;
  invoices: number;
  payments: number;
  cash: number;
}

// Ordered as an operator recognises them, not as the schema lists them: the
// bookings are what they picture, the invoices are what makes it irreversible.
const KINDS: Array<{ key: keyof ClientUsage; one: string; many: string }> = [
  { key: "bookings", one: "booking",     many: "bookings" },
  { key: "invoices", one: "invoice",     many: "invoices" },
  { key: "payments", one: "payment",     many: "payments" },
  { key: "cash",     one: "cash entry",  many: "cash entries" },
];

const count = (usage: Partial<ClientUsage> | undefined, key: keyof ClientUsage): number => {
  const n = Number(usage?.[key]);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

export function totalClientRecords(usage?: Partial<ClientUsage>): number {
  return KINDS.reduce((sum, k) => sum + count(usage, k.key), 0);
}

/** "4 bookings and 3 invoices", or "" when the client has no history at all. */
export function describeClientUsage(usage?: Partial<ClientUsage>): string {
  const parts = KINDS
    .map((k) => ({ n: count(usage, k.key), k }))
    .filter((p) => p.n > 0)
    .map((p) => `${p.n} ${p.n === 1 ? p.k.one : p.k.many}`);

  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0];
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

export interface CompanyUsage extends ClientUsage {
  clients: number;
}

/**
 * The same warning for a company, whose delete also takes its client accounts.
 *
 * Two clauses, because they are two different losses: the accounts that go, and
 * the trade those accounts are attached to. Running them together as one list
 * read as though the bookings were being deleted as well.
 */
export function describeCompanyUsage(usage?: Partial<CompanyUsage>): string {
  const clients = Number(usage?.clients);
  const n = Number.isFinite(clients) && clients > 0 ? clients : 0;
  const trade = describeClientUsage(usage);

  if (!n) return trade;
  const head = `${n} ${n === 1 ? "client" : "clients"}`;
  return trade ? `${head}, and they are attached to ${trade}` : head;
}
