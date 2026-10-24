// Browser side of "the user signs, the API submits".
//
// API endpoints that need the user's wallet answer 202 with
// { signatureRequired: { id, xdr, label, step?, steps? } }. The wallet signs
// the prepared XDR and we post it to /api/tx/:id; that response may ask for
// the next signature (e.g. the next item of an order) until the flow ends.

export interface SignatureRequired {
  id: string;
  xdr: string;
  address: string;
  label: string;
  step?: number;
  steps?: number;
}

export interface ApiResult<T = Record<string, unknown>> {
  status: number;
  body: T & { error?: string; signatureRequired?: SignatureRequired };
}

export async function readResult<T>(res: Response): Promise<ApiResult<T>> {
  return { status: res.status, body: (await res.json().catch(() => ({}))) as ApiResult<T>["body"] };
}

/**
 * Signs and submits every transaction the flow asks for. `onStep` reports
 * which signature is being collected (for "Approve 1 of 2" UI).
 */
export async function followSignatures<T>(
  first: ApiResult<T>,
  signXdr: ((xdr: string) => Promise<string>) | null,
  onStep?: (request: SignatureRequired) => void,
): Promise<ApiResult<T>> {
  let result = first;
  while (result.status === 202 && result.body.signatureRequired) {
    if (!signXdr) {
      throw new Error("Your wallet isn't connected on this device — sign in again to approve.");
    }
    const request = result.body.signatureRequired;
    onStep?.(request);
    const signedXdr = await signXdr(request.xdr);
    result = await readResult<T>(
      await fetch(`/api/tx/${request.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signedXdr }),
      }),
    );
  }
  return result;
}

export function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
