// A mock "server" plus a client with retries. The server is in-process so the
// demo runs with no backend, but the contract mirrors a real HTTP API:
// versioned path, a stable error shape, and an Idempotency-Key header.

import { appendEntry, emptyLedger, type Ledger, type LedgerEntry, type EntryKind, type Cents } from './ledger';

export interface ApiError {
  code: 'INSUFFICIENT_FUNDS' | 'INVALID_AMOUNT' | 'NETWORK_TIMEOUT' | 'CLIENT_TOO_OLD';
  message: string;
  requestId: string;
}

export interface PostEntryResponse {
  entry: LedgerEntry;
  replayed: boolean;
}

export const API_VERSION = 'v1';
export const MIN_CLIENT_BUILD = 1;

const requestId = () => `req_${Math.random().toString(36).slice(2, 10)}`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---- mock server -----------------------------------------------------------

let serverLedger: Ledger = emptyLedger();

/**
 * Simulates POST /v1/entries. When `dropResponse` is true the server commits
 * the write but the response is "lost" — the classic case where a naive retry
 * would charge twice.
 */
async function serverPostEntry(
  body: { kind: EntryKind; amount: Cents; note: string },
  headers: { idempotencyKey: string; clientBuild: number },
  opts: { dropResponse: boolean },
): Promise<PostEntryResponse> {
  await sleep(250);

  if (headers.clientBuild < MIN_CLIENT_BUILD) {
    throw { code: 'CLIENT_TOO_OLD', message: 'Please update the app.', requestId: requestId() } satisfies ApiError;
  }

  const result = appendEntry(serverLedger, {
    id: headers.idempotencyKey,
    kind: body.kind,
    amount: body.amount,
    note: body.note,
    createdAt: new Date().toISOString(),
  });

  if (result.status === 'rejected') {
    const message = result.reason === 'INSUFFICIENT_FUNDS' ? 'Not enough balance.' : 'Amount is invalid.';
    throw { code: result.reason, message, requestId: requestId() } satisfies ApiError;
  }

  serverLedger = result.ledger;

  if (opts.dropResponse) {
    throw { code: 'NETWORK_TIMEOUT', message: 'Response lost in transit.', requestId: requestId() } satisfies ApiError;
  }
  return { entry: result.entry, replayed: result.status === 'duplicate' };
}

async function serverGetLedger(): Promise<Ledger> {
  await sleep(100);
  return serverLedger;
}

// ---- client ----------------------------------------------------------------

export interface PostOptions {
  idempotencyKey: string;
  clientBuild: number;
  /** Probability (0–1) that each attempt's response is dropped. */
  flakiness: number;
  maxAttempts?: number;
  onAttempt?: (attempt: number, error?: ApiError) => void;
}

const isRetryable = (e: ApiError) => e.code === 'NETWORK_TIMEOUT';

/**
 * Retries with exponential backoff, reusing the SAME idempotency key on every
 * attempt, so the server applies the entry at most once.
 */
export async function postEntry(
  body: { kind: EntryKind; amount: Cents; note: string },
  opts: PostOptions,
): Promise<PostEntryResponse> {
  const maxAttempts = opts.maxAttempts ?? 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await serverPostEntry(
        body,
        { idempotencyKey: opts.idempotencyKey, clientBuild: opts.clientBuild },
        { dropResponse: Math.random() < opts.flakiness && attempt < maxAttempts },
      );
      opts.onAttempt?.(attempt);
      return res;
    } catch (err) {
      const e = err as ApiError;
      opts.onAttempt?.(attempt, e);
      if (!isRetryable(e) || attempt >= maxAttempts) throw e;
      await sleep(200 * 2 ** (attempt - 1));
    }
  }
}

export const fetchLedger = serverGetLedger;

export function newIdempotencyKey(): string {
  return `idem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
