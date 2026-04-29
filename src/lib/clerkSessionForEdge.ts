/** Session token getter for edge functions. */
let sessionGetter: () => Promise<string | null> = async () => null;

export function registerClerkSessionTokenGetter(fn: () => Promise<string | null>) {
  sessionGetter = fn;
}

export async function getClerkSessionToken(): Promise<string | null> {
  try {
    return await sessionGetter();
  } catch {
    return null;
  }
}
