// Pure TypeScript ledger logic — no React or React Native imports, so the same
// module can be shared with a React web app or a Node.js backend.

export type Cents = number;

export type EntryKind = 'deposit' | 'transfer_out';

export interface LedgerEntry {
  /** Idempotency key supplied by the client. Unique per logical operation. */
  id: string;
  kind: EntryKind;
  /** Signed amount in cents: positive credits, negative debits. */
  amount: Cents;
  note: string;
  createdAt: string;
}

export interface Ledger {
  /** Append-only list, newest first. Balances are always derived, never stored. */
  entries: LedgerEntry[];
}

export type AppendResult =
  | { status: 'applied'; ledger: Ledger; entry: LedgerEntry }
  | { status: 'duplicate'; ledger: Ledger; entry: LedgerEntry }
  | { status: 'rejected'; ledger: Ledger; reason: 'INSUFFICIENT_FUNDS' | 'INVALID_AMOUNT' };

export const emptyLedger = (): Ledger => ({ entries: [] });

export function balanceOf(ledger: Ledger): Cents {
  return ledger.entries.reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Appends an entry exactly once. Replaying the same id returns the original
 * entry instead of applying it again — the same guarantee a UNIQUE constraint
 * on the idempotency key gives you in Postgres.
 */
export function appendEntry(ledger: Ledger, entry: LedgerEntry): AppendResult {
  const existing = ledger.entries.find((e) => e.id === entry.id);
  if (existing) return { status: 'duplicate', ledger, entry: existing };

  if (!Number.isInteger(entry.amount) || entry.amount === 0) {
    return { status: 'rejected', ledger, reason: 'INVALID_AMOUNT' };
  }
  if (entry.amount < 0 && balanceOf(ledger) + entry.amount < 0) {
    return { status: 'rejected', ledger, reason: 'INSUFFICIENT_FUNDS' };
  }

  const next: Ledger = { entries: [entry, ...ledger.entries] };
  return { status: 'applied', ledger: next, entry };
}

export function parseAmountToCents(input: string): Cents | null {
  const trimmed = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const [whole, frac = ''] = trimmed.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents > 0 ? cents : null;
}

export function formatCents(cents: Cents): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  const whole = Math.floor(abs / 100).toLocaleString('en-US');
  const frac = String(abs % 100).padStart(2, '0');
  return `${sign}$${whole}.${frac}`;
}
