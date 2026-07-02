// Testnet is flaky: RPC nodes time out, Horizon occasionally 504s. Every
// outbound Stellar call gets exactly one retry on timeout-ish failures.

const TIMEOUT_PATTERNS = [
  "timeout",
  "timed out",
  "TRY_AGAIN_LATER",
  "ETIMEDOUT",
  "ECONNRESET",
  "socket hang up",
  "504",
  "503",
];

export function isTimeoutish(error: unknown): boolean {
  const message =
    error instanceof Error ? `${error.message} ${error.stack ?? ""}` : String(error);
  return TIMEOUT_PATTERNS.some((p) => message.toLowerCase().includes(p.toLowerCase()));
}

export async function withTimeoutRetry<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (!isTimeoutish(error)) throw error;
    console.warn(`[stellar] ${label} timed out, retrying once...`);
    return await fn();
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
