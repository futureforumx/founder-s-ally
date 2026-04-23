/** Provider session JWT / access token used by app APIs and edge functions. */
let authSessionGetter: () => Promise<string | null> = async () => null;

export function registerAuthSessionTokenGetter(fn: () => Promise<string | null>) {
  authSessionGetter = fn;
}

export async function getAuthSessionToken(): Promise<string | null> {
  try {
    return await authSessionGetter();
  } catch {
    return null;
  }
}

export const registerClerkSessionTokenGetter = registerAuthSessionTokenGetter;
export const getClerkSessionToken = getAuthSessionToken;
