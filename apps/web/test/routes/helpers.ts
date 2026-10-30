type Handler = (req: Request) => Promise<Response>;

export interface CallOptions {
  /** ID token to send. null sends no Authorization header at all. */
  token?: string | null;
  /** Sent as the raw body instead of JSON-encoding `body`. */
  raw?: string;
  /** Overrides the Authorization header entirely. */
  authorization?: string;
}

/** Calls a route's POST handler directly, the way Next.js would. */
export async function post(handler: Handler, body: unknown = {}, { token, raw, authorization }: CallOptions = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (authorization !== undefined) headers.authorization = authorization;
  else if (token) headers.authorization = `Bearer ${token}`;
  const res = await handler(
    new Request("http://localhost/api/test", { method: "POST", headers, body: raw ?? JSON.stringify(body) }),
  );
  // Tests read nested fields freely; a loose type keeps them short.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { status: res.status, json: (await res.json()) as Record<string, any> };
}
